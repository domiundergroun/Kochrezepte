"""HTTP-Schnittstelle für Dateien: Rezepte teilen und Sicherungen."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from http import HTTPStatus
from typing import Any
from urllib.parse import quote

from aiohttp import web

from homeassistant.components.http import KEY_HASS, HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

MAX_UPLOAD = 500 * 1024 * 1024  # 500 MB


def _store(hass: HomeAssistant):
    return hass.data[DOMAIN]["store"]


def _error(message: str, status: int = HTTPStatus.BAD_REQUEST) -> web.Response:
    return web.json_response({"message": message}, status=status)


def _download(content: bytes, filename: str, mime: str) -> web.Response:
    return web.Response(
        body=content,
        content_type=mime,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "Cache-Control": "no-store",
        },
    )


async def _receive(request: web.Request) -> str:
    """Speichert den Anfragetext in einer temporären Datei (ohne Größenlimit von HA)."""
    hass: HomeAssistant = request.app[KEY_HASS]
    fd, path = await hass.async_add_executor_job(tempfile.mkstemp, ".kochbuch")
    size = 0
    try:
        with os.fdopen(fd, "wb") as file:
            async for chunk in request.content.iter_chunked(256 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD:
                    raise ValueError("Die Datei ist zu groß")
                await hass.async_add_executor_job(file.write, chunk)
    except Exception:
        await hass.async_add_executor_job(os.remove, path)
        raise
    if not size:
        await hass.async_add_executor_job(os.remove, path)
        raise ValueError("Die Datei ist leer")
    return path


class KochbuchRecipesView(HomeAssistantView):
    """Rezepte als Datei exportieren und importieren."""

    url = "/api/kochbuch/rezepte"
    name = "api:kochbuch:rezepte"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app[KEY_HASS]
        ids = [i for i in request.query.get("ids", "").split(",") if i]
        category = request.query.get("category") or None
        store = _store(hass)
        data = await store.async_export_recipes(ids or None, category)
        if not data["recipes"]:
            return _error("Keine Rezepte zum Exportieren", HTTPStatus.NOT_FOUND)
        if len(data["recipes"]) == 1:
            base = data["recipes"][0]["title"]
        elif category:
            cat = next((c for c in store.settings["categories"] if c["id"] == category), None)
            base = cat["name"] if cat else "Rezepte"
        else:
            base = "Alle Rezepte"
        safe = "".join(ch for ch in base if ch.isalnum() or ch in " -_äöüÄÖÜß").strip() or "Rezepte"
        content = json.dumps(data, ensure_ascii=False, indent=1).encode("utf-8")
        return _download(content, f"Rezept - {safe}.kochbuch.json", "application/json")

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app[KEY_HASS]
        user = request["hass_user"]
        try:
            path = await _receive(request)
        except ValueError as err:
            return _error(str(err))
        try:

            def _read() -> Any:
                with open(path, encoding="utf-8") as file:
                    return json.load(file)

            try:
                data = await hass.async_add_executor_job(_read)
            except (UnicodeDecodeError, json.JSONDecodeError):
                return _error(
                    "Die Datei ist keine Rezept-Datei. Sicherungen (ZIP) spielt ihr unter "
                    "Einstellungen › Sicherung ein."
                )
            result = await _store(hass).async_import_recipes(data, user.name or "")
        except ValueError as err:
            return _error(str(err))
        finally:
            await hass.async_add_executor_job(os.remove, path)
        return web.json_response(result)


class KochbuchBackupView(HomeAssistantView):
    """Komplette Sicherung herunterladen oder einspielen (nur Administratoren)."""

    url = "/api/kochbuch/backup"
    name = "api:kochbuch:backup"
    requires_auth = True

    async def get(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return _error("Nur für Administratoren", HTTPStatus.FORBIDDEN)
        hass: HomeAssistant = request.app[KEY_HASS]
        content = await _store(hass).async_build_backup()
        name = f"kochbuch-backup-{dt_util.now():%Y-%m-%d_%H%M}.zip"
        return _download(content, name, "application/zip")

    async def post(self, request: web.Request) -> web.Response:
        if not request["hass_user"].is_admin:
            return _error("Nur für Administratoren", HTTPStatus.FORBIDDEN)
        hass: HomeAssistant = request.app[KEY_HASS]
        replace = request.query.get("mode") == "replace"
        try:
            path = await _receive(request)
        except ValueError as err:
            return _error(str(err))
        try:
            result = await _store(hass).async_restore_backup(path, replace)
        except ValueError as err:
            return _error(str(err))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Sicherung konnte nicht eingespielt werden")
            return _error("Die Sicherung konnte nicht eingespielt werden", HTTPStatus.INTERNAL_SERVER_ERROR)
        finally:
            await hass.async_add_executor_job(os.remove, path)
        return web.json_response(result)
