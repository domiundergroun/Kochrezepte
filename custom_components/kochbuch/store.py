"""Datenhaltung für das Kochbuch."""

from __future__ import annotations

import base64
import binascii
import copy
import io
import json
import logging
import os
import re
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store

from .backup import DEFAULT_BACKUP, clean_backup_config, public_backup
from .const import (
    VERSION,
    CATEGORY_ALIASES_V17,
    DEFAULT_CATEGORIES,
    DEFAULT_SETTINGS,
    IMAGES_DIR,
    IMAGES_URL,
    SIGNAL_UPDATED,
    STORAGE_KEY,
    STORAGE_VERSION,
)

_LOGGER = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}
_IMAGE_NAME_RE = re.compile(r"^[a-f0-9]{32}\.(jpg|png|webp|gif)$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _str(value: Any, limit: int = 20000) -> str:
    if value is None:
        return ""
    return str(value).strip()[:limit]


def _int(value: Any, default: int = 0, lo: int = 0, hi: int = 100000) -> int:
    try:
        return max(lo, min(hi, int(float(value))))
    except (TypeError, ValueError):
        return default


def clean_recipe(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalisiert ein Rezept aus dem Frontend oder einem Import."""
    ingredients = []
    for ing in raw.get("ingredients") or []:
        if isinstance(ing, str):
            ing = {"name": ing}
        if not isinstance(ing, dict):
            continue
        entry = {
            "amount": _str(ing.get("amount"), 40),
            "unit": _str(ing.get("unit"), 40),
            "name": _str(ing.get("name"), 300),
            "group": _str(ing.get("group"), 100),
        }
        if entry["name"] or entry["amount"] or entry["group"]:
            ingredients.append(entry)

    def _steps(values: Any) -> list[str]:
        out = []
        for step in values or []:
            text = step.get("text") if isinstance(step, dict) else step
            text = _str(text, 5000)
            if text:
                out.append(text)
        return out[:200]

    tags = []
    for tag in raw.get("tags") or []:
        tag = _str(tag, 40)
        if tag and tag.lower() not in [t.lower() for t in tags]:
            tags.append(tag)

    return {
        "title": _str(raw.get("title"), 200) or "Neues Rezept",
        "description": _str(raw.get("description"), 2000),
        "category": _str(raw.get("category"), 60),
        "tags": tags[:30],
        "image": _str(raw.get("image"), 500),
        "servings": _int(raw.get("servings"), 4, 1, 100),
        "servings_unit": _str(raw.get("servings_unit"), 30) or "Portionen",
        "prep_time": _int(raw.get("prep_time"), 0, 0, 10000),
        "cook_time": _int(raw.get("cook_time"), 0, 0, 10000),
        "rest_time": _int(raw.get("rest_time"), 0, 0, 100000),
        "difficulty": _int(raw.get("difficulty"), 1, 1, 3),
        "rating": _int(raw.get("rating"), 0, 0, 5),
        "favorite": bool(raw.get("favorite")),
        "ingredients": ingredients,
        "prep_steps": _steps(raw.get("prep_steps")),
        "steps": _steps(raw.get("steps")),
        "notes": _str(raw.get("notes"), 5000),
        "source": _str(raw.get("source"), 500),
        "author": _str(raw.get("author"), 100),
    }


def normalize_categories(cats: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Nur eine Ebene: Unterkategorien müssen auf eine vorhandene Hauptkategorie zeigen."""
    by_id = {c["id"]: c for c in cats}
    for cat in cats:
        parent = cat.get("parent") or ""
        if parent == cat["id"] or parent not in by_id or by_id[parent].get("parent"):
            parent = ""
        cat["parent"] = parent
    # Hauptkategorien mit Unterkategorien dürfen selbst keine Unterkategorie sein
    has_children = {c["parent"] for c in cats if c["parent"]}
    for cat in cats:
        if cat["id"] in has_children:
            cat["parent"] = ""
    return cats


class KochbuchStore:
    """Speichert Rezepte und Einstellungen in .storage."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.recipes: dict[str, dict[str, Any]] = {}
        self.settings: dict[str, Any] = copy.deepcopy(DEFAULT_SETTINGS)
        self.images_path = hass.config.path(IMAGES_DIR)
        self.backup: dict[str, Any] = copy.deepcopy(DEFAULT_BACKUP)
        self.bring_auth: dict[str, Any] = {}

    def _data(self) -> dict[str, Any]:
        return {
            "recipes": list(self.recipes.values()),
            "settings": self.settings,
            "backup": self.backup,
            "bring_auth": self.bring_auth,
        }

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self.recipes = {r["id"]: r for r in data.get("recipes", []) if "id" in r}
            settings = data.get("settings") or {}
            for key, value in settings.items():
                self.settings[key] = value
            if isinstance(data.get("bring_auth"), dict):
                self.bring_auth = data["bring_auth"]
            if isinstance(data.get("backup"), dict):
                self.backup = {**copy.deepcopy(DEFAULT_BACKUP), **data["backup"]}
            if not settings.get("categories_v17"):
                self._migrate_categories_v17()
                await self._store.async_save(self._data())
        await self.hass.async_add_executor_job(
            lambda: os.makedirs(self.images_path, exist_ok=True)
        )

    def _migrate_categories_v17(self) -> None:
        """Neue Kategorie-Struktur (1.7.0); Rezepte wandern in die passende neue Kategorie."""
        lookup: dict[str, str] = {}
        for new_id, names in CATEGORY_ALIASES_V17.items():
            lookup[new_id] = new_id
            for name in names:
                lookup[name.lower()] = new_id
        old = self.settings.get("categories") or []
        remap: dict[str, str] = {}
        extra: list[dict[str, Any]] = []
        for cat in old:
            target = lookup.get(str(cat.get("id", "")).lower()) or lookup.get(
                str(cat.get("name", "")).strip().lower()
            )
            if target:
                remap[cat["id"]] = target
            else:
                extra.append(dict(cat))
        extra_ids = {c["id"] for c in extra}
        for cat in extra:
            if cat.get("parent") and cat["parent"] not in extra_ids:
                cat["parent"] = remap.get(cat["parent"], "")
        self.settings["categories"] = normalize_categories(copy.deepcopy(DEFAULT_CATEGORIES) + extra)
        for recipe in self.recipes.values():
            if recipe.get("category") in remap:
                recipe["category"] = remap[recipe["category"]]
        self.settings["categories_v17"] = True
        _LOGGER.info("Kochbuch: Kategorien auf neue Struktur umgestellt (%s zugeordnet)", len(remap))

    async def _async_save(self) -> None:
        await self._store.async_save(self._data())
        async_dispatcher_send(self.hass, SIGNAL_UPDATED)

    # ---------------------------------------------------------------- Rezepte
    def list(self) -> list[dict[str, Any]]:
        return sorted(
            self.recipes.values(), key=lambda r: r.get("title", "").lower()
        )

    async def async_save_recipe(
        self, raw: dict[str, Any], user_name: str | None = None
    ) -> dict[str, Any]:
        recipe_id = raw.get("id")
        cleaned = clean_recipe(raw)
        old = self.recipes.get(recipe_id) if recipe_id else None
        if old:
            recipe = {**old, **cleaned, "updated": _now()}
            if old.get("image") and old["image"] != recipe["image"]:
                await self._async_remove_image(old["image"])
        else:
            recipe = {
                **cleaned,
                "id": uuid.uuid4().hex,
                "created": _now(),
                "updated": _now(),
                "created_by": user_name or "",
                "cooked": [],
            }
        self.recipes[recipe["id"]] = recipe
        await self._async_save()
        return recipe

    async def async_patch_recipe(
        self, recipe_id: str, changes: dict[str, Any]
    ) -> dict[str, Any] | None:
        recipe = self.recipes.get(recipe_id)
        if not recipe:
            return None
        if "favorite" in changes:
            recipe["favorite"] = bool(changes["favorite"])
        if "rating" in changes:
            recipe["rating"] = _int(changes["rating"], 0, 0, 5)
        if changes.get("cooked"):
            cooked = list(recipe.get("cooked") or [])
            cooked.append(_now())
            recipe["cooked"] = cooked[-50:]
        await self._async_save()
        return recipe

    async def async_delete_recipe(self, recipe_id: str) -> bool:
        recipe = self.recipes.pop(recipe_id, None)
        if not recipe:
            return False
        if recipe.get("image"):
            await self._async_remove_image(recipe["image"])
        await self._async_save()
        return True

    # ---------------------------------------------------------- Einstellungen
    async def async_set_settings(self, settings: dict[str, Any]) -> dict[str, Any]:
        if "shopping_list" in settings:
            self.settings["shopping_list"] = _str(settings["shopping_list"], 200)
        if "default_servings" in settings:
            self.settings["default_servings"] = _int(
                settings["default_servings"], 4, 1, 100
            )
        if isinstance(settings.get("categories"), list):
            cats = []
            for cat in settings["categories"]:
                if not isinstance(cat, dict) or not _str(cat.get("name")):
                    continue
                cats.append(
                    {
                        "id": _str(cat.get("id"), 60) or uuid.uuid4().hex[:8],
                        "name": _str(cat.get("name"), 60),
                        "icon": _str(cat.get("icon"), 60) or "mdi:food",
                        "color": _str(cat.get("color"), 20) or "#C8553D",
                        "parent": _str(cat.get("parent"), 60),
                    }
                )
            self.settings["categories"] = normalize_categories(cats)
        moves = settings.get("moves")
        if isinstance(moves, dict):
            valid = {c["id"] for c in self.settings.get("categories", [])}
            for recipe in self.recipes.values():
                old = recipe.get("category")
                if old in moves:
                    target = _str(moves[old], 60)
                    recipe["category"] = target if target in valid else ""
                    recipe["updated"] = _now()
        await self._async_save()
        return self.settings

    # ------------------------------------------------------------------ Bilder
    async def async_store_image(self, data_b64: str, mime: str) -> str:
        ext = IMAGE_TYPES.get((mime or "").lower())
        if not ext:
            raise ValueError("Bildformat wird nicht unterstützt")
        if "," in data_b64[:100]:
            data_b64 = data_b64.split(",", 1)[1]
        content = base64.b64decode(data_b64)
        if len(content) > MAX_IMAGE_BYTES:
            raise ValueError("Bild ist zu groß (max. 8 MB)")
        name = f"{uuid.uuid4().hex}.{ext}"
        path = os.path.join(self.images_path, name)

        def _write() -> None:
            os.makedirs(self.images_path, exist_ok=True)
            with open(path, "wb") as file:
                file.write(content)

        await self.hass.async_add_executor_job(_write)
        return f"{IMAGES_URL}/{name}"

    async def _async_remove_image(self, url: str) -> None:
        if not url.startswith(IMAGES_URL + "/"):
            return
        name = url[len(IMAGES_URL) + 1 :]
        if not _IMAGE_NAME_RE.match(name):
            return
        if any(r.get("image") == url for r in self.recipes.values()):
            return
        path = os.path.join(self.images_path, name)

        def _remove() -> None:
            try:
                os.remove(path)
            except FileNotFoundError:
                pass

        await self.hass.async_add_executor_job(_remove)


    def _image_name(self, url: str) -> str | None:
        """Dateiname eines lokal gespeicherten Rezeptfotos."""
        if not url or not url.startswith(IMAGES_URL + "/"):
            return None
        name = url[len(IMAGES_URL) + 1 :]
        return name if _IMAGE_NAME_RE.match(name) else None

    def _read_image(self, name: str) -> bytes | None:
        try:
            with open(os.path.join(self.images_path, name), "rb") as file:
                return file.read()
        except OSError:
            return None

    def _write_image(self, name: str, content: bytes) -> None:
        os.makedirs(self.images_path, exist_ok=True)
        path = os.path.join(self.images_path, name)
        if not os.path.exists(path):
            with open(path, "wb") as file:
                file.write(content)

    async def _async_cleanup_images(self) -> None:
        used = {self._image_name(r.get("image", "")) for r in self.recipes.values()}

        def _cleanup() -> None:
            try:
                names = os.listdir(self.images_path)
            except OSError:
                return
            for name in names:
                if _IMAGE_NAME_RE.match(name) and name not in used:
                    try:
                        os.remove(os.path.join(self.images_path, name))
                    except OSError:
                        pass

        await self.hass.async_add_executor_job(_cleanup)

    # ------------------------------------------------- Rezepte austauschen
    async def async_export_recipes(
        self, ids: list[str] | None = None, category: str | None = None
    ) -> dict[str, Any]:
        """Rezepte samt Fotos als teilbare Datei."""
        recipes = self.list()
        if ids:
            recipes = [r for r in recipes if r["id"] in ids]
        all_cats = self.settings.get("categories", [])
        if category:
            family = {category} | {c["id"] for c in all_cats if c.get("parent") == category}
            recipes = [r for r in recipes if r.get("category") in family]
        used_cats = {r.get("category") for r in recipes}
        used_cats |= {c.get("parent") for c in all_cats if c["id"] in used_cats and c.get("parent")}
        cats = [c for c in all_cats if c["id"] in used_cats]

        def _build() -> list[dict[str, Any]]:
            out = []
            for recipe in recipes:
                item = {k: v for k, v in recipe.items() if k not in ("id", "cooked", "created_by")}
                name = self._image_name(recipe.get("image", ""))
                if name:
                    content = self._read_image(name)
                    item["image"] = ""
                    if content:
                        ext = name.rsplit(".", 1)[1]
                        mime = "image/jpeg" if ext == "jpg" else f"image/{ext}"
                        item["image_data"] = {
                            "mime": mime,
                            "data": base64.b64encode(content).decode(),
                        }
                out.append(item)
            return out

        return {
            "format": "kochbuch-rezepte",
            "version": 1,
            "app_version": VERSION,
            "exported": _now(),
            "categories": cats,
            "recipes": await self.hass.async_add_executor_job(_build),
        }

    async def async_import_recipes(
        self, data: dict[str, Any], user_name: str = ""
    ) -> dict[str, int]:
        """Rezepte aus einer Export-Datei als neue Rezepte übernehmen."""
        if not isinstance(data, dict) or data.get("format") != "kochbuch-rezepte":
            raise ValueError(
                "Das ist keine Rezept-Datei des Kochbuchs. Sicherungen spielt ihr unter "
                "Einstellungen › Sicherung ein."
            )
        recipes = data.get("recipes")
        if not isinstance(recipes, list):
            raise ValueError("Die Datei enthält keine Rezepte")

        local = self.settings.setdefault("categories", [])
        mapping: dict[str, str] = {}
        new_cats = 0
        for cat in data.get("categories") or []:
            if not isinstance(cat, dict) or not _str(cat.get("name")):
                continue
            cid = _str(cat.get("id"), 60)
            same_id = next((c for c in local if c["id"] == cid), None)
            same_name = next(
                (c for c in local if c["name"].lower() == _str(cat["name"]).lower()), None
            )
            if same_name:
                mapping[cid] = same_name["id"]
            elif same_id:
                mapping[cid] = same_id["id"]
            else:
                new_id = cid if cid and not same_id else uuid.uuid4().hex[:8]
                local.append(
                    {
                        "id": new_id,
                        "name": _str(cat.get("name"), 60),
                        "icon": _str(cat.get("icon"), 60) or "mdi:food",
                        "color": _str(cat.get("color"), 20) or "#2F5D50",
                        "parent": _str(cat.get("parent"), 60),
                        "_new": True,
                    }
                )
                mapping[cid] = new_id
                new_cats += 1
        for cat in local:
            if cat.pop("_new", False) and cat.get("parent"):
                cat["parent"] = mapping.get(cat["parent"], cat["parent"])
        normalize_categories(local)
        fallback = local[0]["id"] if local else ""
        valid = {c["id"] for c in local}

        imported = skipped = 0
        for raw in recipes:
            if not isinstance(raw, dict):
                continue
            cleaned = clean_recipe(raw)
            cat = mapping.get(cleaned["category"], cleaned["category"])
            cleaned["category"] = cat if cat in valid else fallback
            exists = any(
                r["title"].lower() == cleaned["title"].lower()
                and r.get("category") == cleaned["category"]
                for r in self.recipes.values()
            )
            if exists:
                skipped += 1
                continue
            image = raw.get("image_data")
            cleaned["image"] = cleaned["image"] if cleaned["image"].startswith("http") else ""
            if isinstance(image, dict) and image.get("data"):
                try:
                    cleaned["image"] = await self.async_store_image(
                        image["data"], image.get("mime", "image/jpeg")
                    )
                except (ValueError, binascii.Error):
                    cleaned["image"] = ""
            recipe_id = uuid.uuid4().hex
            self.recipes[recipe_id] = {
                **cleaned,
                "id": recipe_id,
                "created": _now(),
                "updated": _now(),
                "created_by": user_name,
                "cooked": [],
            }
            imported += 1
        await self._async_save()
        return {"imported": imported, "skipped": skipped, "categories": new_cats}

    # ------------------------------------------------------------- Sicherung
    def backup_payload(self) -> dict[str, Any]:
        return {
            "format": "kochbuch-backup",
            "version": 2,
            "app_version": VERSION,
            "exported": _now(),
            "settings": self.settings,
            "recipes": list(self.recipes.values()),
        }

    async def async_build_backup(self) -> bytes:
        """Komplette Sicherung als ZIP (Rezepte, Einstellungen, Fotos)."""
        payload = copy.deepcopy(self.backup_payload())
        names = {self._image_name(r.get("image", "")) for r in self.recipes.values()}
        names.discard(None)

        def _build() -> bytes:
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr(
                    "kochbuch.json", json.dumps(payload, ensure_ascii=False, indent=2)
                )
                for name in sorted(names):
                    content = self._read_image(name)
                    if content:
                        archive.writestr(f"bilder/{name}", content, zipfile.ZIP_STORED)
            return buffer.getvalue()

        return await self.hass.async_add_executor_job(_build)

    @staticmethod
    def read_backup_file(path: str) -> tuple[dict[str, Any], dict[str, bytes]]:
        """Liest eine Sicherung (ZIP oder ältere JSON-Datei). Blockierend."""
        with open(path, "rb") as file:
            head = file.read(2)
        images: dict[str, bytes] = {}
        if head == b"PK":
            try:
                with zipfile.ZipFile(path) as archive:
                    if "kochbuch.json" not in archive.namelist():
                        raise ValueError("In der ZIP-Datei fehlt kochbuch.json")
                    data = json.loads(archive.read("kochbuch.json").decode("utf-8"))
                    for info in archive.infolist():
                        name = info.filename.rsplit("/", 1)[-1]
                        if info.filename.startswith("bilder/") and _IMAGE_NAME_RE.match(name):
                            if info.file_size <= MAX_IMAGE_BYTES:
                                images[name] = archive.read(info)
            except zipfile.BadZipFile as err:
                raise ValueError("Die ZIP-Datei ist beschädigt") from err
        else:
            try:
                with open(path, encoding="utf-8") as file:
                    data = json.load(file)
            except (UnicodeDecodeError, json.JSONDecodeError) as err:
                raise ValueError("Die Datei ist keine Kochbuch-Sicherung") from err
        if not isinstance(data, dict) or not isinstance(data.get("recipes"), list) or not (
            data.get("format") == "kochbuch-backup" or data.get("kochbuch_backup")
        ):
            if isinstance(data, dict) and data.get("format") == "kochbuch-rezepte":
                raise ValueError(
                    "Das ist eine Rezept-Datei. Rezepte importiert ihr über „Importieren“."
                )
            raise ValueError("Die Datei ist keine Kochbuch-Sicherung")
        return data, images

    async def async_restore_backup(self, path: str, replace: bool) -> dict[str, int]:
        data, images = await self.hass.async_add_executor_job(self.read_backup_file, path)

        def _write_all() -> None:
            for name, content in images.items():
                self._write_image(name, content)

        await self.hass.async_add_executor_job(_write_all)

        backup_cats = [
            c for c in (data.get("settings") or {}).get("categories") or []
            if isinstance(c, dict) and c.get("id") and c.get("name")
        ]
        if replace:
            self.recipes = {}
            settings = data.get("settings") or {}
            if isinstance(settings, dict):
                for key in ("shopping_list", "default_servings"):
                    if key in settings:
                        self.settings[key] = settings[key]
            if backup_cats:
                self.settings["categories"] = backup_cats
        else:
            have = {c["id"] for c in self.settings.get("categories", [])}
            for cat in backup_cats:
                if cat["id"] not in have:
                    self.settings["categories"].append(cat)

        count = 0
        for raw in data["recipes"]:
            if not isinstance(raw, dict):
                continue
            recipe_id = _str(raw.get("id"), 64) or uuid.uuid4().hex
            if not replace and recipe_id in self.recipes:
                continue
            cleaned = clean_recipe(raw)
            name = self._image_name(cleaned["image"])
            if name and name not in images:
                exists = await self.hass.async_add_executor_job(
                    os.path.exists, os.path.join(self.images_path, name)
                )
                if not exists:
                    cleaned["image"] = ""
            self.recipes[recipe_id] = {
                **cleaned,
                "id": recipe_id,
                "created": _str(raw.get("created"), 40) or _now(),
                "updated": _str(raw.get("updated"), 40) or _now(),
                "created_by": _str(raw.get("created_by"), 100),
                "cooked": [c for c in raw.get("cooked") or [] if isinstance(c, str)][-50:],
            }
            count += 1
        await self._async_save()
        if replace:
            await self._async_cleanup_images()
        return {"recipes": count, "images": len(images)}

    # ------------------------------------------------- Automatisches Backup
    async def async_save_backup_config(self, raw: dict[str, Any]) -> dict[str, Any]:
        self.backup = clean_backup_config(raw, self.backup)
        await self._async_save()
        return public_backup(self.backup)

    async def async_set_backup_status(self, last: dict[str, Any]) -> None:
        self.backup["last"] = last
        await self._async_save()

    # ------------------------------------------------------------------ Bring!
    async def async_set_bring(
        self, auth: dict[str, Any] | None, list_uuid: str = "", list_name: str = ""
    ) -> dict[str, Any]:
        if auth is None:
            self.bring_auth = {}
            self.settings["bring"] = {}
        else:
            self.bring_auth = auth
            self.settings["bring"] = {
                "email": auth.get("email", ""),
                "name": auth.get("name", ""),
                "list_uuid": list_uuid,
                "list_name": list_name,
            }
        await self._async_save()
        return self.settings["bring"]

    async def async_save_bring_tokens(self) -> None:
        await self._store.async_save(self._data())
