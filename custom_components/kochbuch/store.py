"""Datenhaltung für das Kochbuch."""

from __future__ import annotations

import base64
import copy
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store

from .const import (
    DEFAULT_CATEGORIES,
    DEFAULT_SETTINGS,
    OLD_DEFAULT_CATEGORY_IDS,
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

    steps = []
    for step in raw.get("steps") or []:
        text = step.get("text") if isinstance(step, dict) else step
        text = _str(text, 5000)
        if text:
            steps.append(text)

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
        "steps": steps,
        "notes": _str(raw.get("notes"), 5000),
        "source": _str(raw.get("source"), 500),
        "author": _str(raw.get("author"), 100),
    }


class KochbuchStore:
    """Speichert Rezepte und Einstellungen in .storage."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.recipes: dict[str, dict[str, Any]] = {}
        self.settings: dict[str, Any] = copy.deepcopy(DEFAULT_SETTINGS)
        self.images_path = hass.config.path(IMAGES_DIR)

    async def async_load(self) -> None:
        data = await self._store.async_load()
        if data:
            self.recipes = {r["id"]: r for r in data.get("recipes", []) if "id" in r}
            settings = data.get("settings") or {}
            for key, value in settings.items():
                self.settings[key] = value
            cats = self.settings.get("categories") or []
            if {c.get("id") for c in cats} == OLD_DEFAULT_CATEGORY_IDS:
                used = {r.get("category") for r in self.recipes.values()}
                keep = [c for c in cats if c["id"] in used and c["id"] != "backen"]
                self.settings["categories"] = copy.deepcopy(DEFAULT_CATEGORIES) + keep
                await self._store.async_save(
                    {"recipes": list(self.recipes.values()), "settings": self.settings}
                )
        await self.hass.async_add_executor_job(
            lambda: os.makedirs(self.images_path, exist_ok=True)
        )

    async def _async_save(self) -> None:
        await self._store.async_save(
            {"recipes": list(self.recipes.values()), "settings": self.settings}
        )
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
                    }
                )
            self.settings["categories"] = cats
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

    # ------------------------------------------------------------------ Backup
    def export(self) -> dict[str, Any]:
        return {
            "kochbuch_backup": 1,
            "exported": _now(),
            "settings": self.settings,
            "recipes": list(self.recipes.values()),
        }

    async def async_import(self, data: dict[str, Any], replace: bool) -> int:
        recipes = data.get("recipes")
        if not isinstance(recipes, list):
            raise ValueError("Keine gültige Kochbuch-Sicherung")
        if replace:
            self.recipes = {}
        count = 0
        for raw in recipes:
            if not isinstance(raw, dict):
                continue
            cleaned = clean_recipe(raw)
            recipe_id = _str(raw.get("id"), 64) or uuid.uuid4().hex
            self.recipes[recipe_id] = {
                **cleaned,
                "id": recipe_id,
                "created": _str(raw.get("created"), 40) or _now(),
                "updated": _str(raw.get("updated"), 40) or _now(),
                "created_by": _str(raw.get("created_by"), 100),
                "cooked": [c for c in raw.get("cooked") or [] if isinstance(c, str)][-50:],
            }
            count += 1
        if replace and isinstance(data.get("settings"), dict):
            await self.async_set_settings(data["settings"])
        await self._async_save()
        return count
