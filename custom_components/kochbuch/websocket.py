"""Websocket-API für das Kochbuch-Panel."""

from __future__ import annotations

import base64
import binascii
import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DOMAIN, SIGNAL_UPDATED, VERSION
from .importer import async_import_url
from .store import IMAGE_TYPES, KochbuchStore

_LOGGER = logging.getLogger(__name__)


def _store(hass: HomeAssistant) -> KochbuchStore:
    return hass.data[DOMAIN]["store"]


async def _user_name(hass: HomeAssistant, connection) -> str:
    user = connection.user
    return user.name if user and user.name else ""


@callback
def async_register(hass: HomeAssistant) -> None:
    for handler in (
        ws_data,
        ws_subscribe,
        ws_save,
        ws_patch,
        ws_delete,
        ws_upload_image,
        ws_import_url,
        ws_settings,
        ws_export,
        ws_import_backup,
    ):
        websocket_api.async_register_command(hass, handler)


def _payload(store: KochbuchStore) -> dict[str, Any]:
    return {"recipes": store.list(), "settings": store.settings, "version": VERSION}


@websocket_api.websocket_command({vol.Required("type"): "kochbuch/data"})
@callback
def ws_data(hass, connection, msg):
    connection.send_result(msg["id"], _payload(_store(hass)))


@websocket_api.websocket_command({vol.Required("type"): "kochbuch/subscribe"})
@callback
def ws_subscribe(hass, connection, msg):
    @callback
    def _updated() -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], _payload(_store(hass)))
        )

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass, SIGNAL_UPDATED, _updated
    )
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {vol.Required("type"): "kochbuch/save", vol.Required("recipe"): dict}
)
@websocket_api.async_response
async def ws_save(hass, connection, msg):
    recipe = await _store(hass).async_save_recipe(
        msg["recipe"], await _user_name(hass, connection)
    )
    connection.send_result(msg["id"], recipe)


@websocket_api.websocket_command(
    {
        vol.Required("type"): "kochbuch/patch",
        vol.Required("recipe_id"): str,
        vol.Optional("favorite"): bool,
        vol.Optional("rating"): int,
        vol.Optional("cooked"): bool,
    }
)
@websocket_api.async_response
async def ws_patch(hass, connection, msg):
    changes = {k: v for k, v in msg.items() if k in ("favorite", "rating", "cooked")}
    recipe = await _store(hass).async_patch_recipe(msg["recipe_id"], changes)
    if recipe is None:
        connection.send_error(msg["id"], "not_found", "Rezept nicht gefunden")
        return
    connection.send_result(msg["id"], recipe)


@websocket_api.websocket_command(
    {vol.Required("type"): "kochbuch/delete", vol.Required("recipe_id"): str}
)
@websocket_api.async_response
async def ws_delete(hass, connection, msg):
    ok = await _store(hass).async_delete_recipe(msg["recipe_id"])
    connection.send_result(msg["id"], {"deleted": ok})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "kochbuch/upload_image",
        vol.Required("data"): str,
        vol.Required("mime"): str,
    }
)
@websocket_api.async_response
async def ws_upload_image(hass, connection, msg):
    try:
        url = await _store(hass).async_store_image(msg["data"], msg["mime"])
    except (ValueError, binascii.Error) as err:
        connection.send_error(msg["id"], "invalid_image", str(err))
        return
    connection.send_result(msg["id"], {"url": url})


async def _download_image(hass: HomeAssistant, url: str) -> str:
    """Lädt ein Rezeptbild herunter und speichert es lokal."""
    try:
        session = async_get_clientsession(hass)
        async with session.get(url, timeout=20) as resp:
            if resp.status >= 400:
                return url
            mime = (resp.headers.get("Content-Type") or "").split(";")[0].strip()
            if mime not in IMAGE_TYPES:
                return url
            content = await resp.read()
        return await _store(hass).async_store_image(
            base64.b64encode(content).decode(), mime
        )
    except Exception as err:  # noqa: BLE001
        _LOGGER.debug("Bild konnte nicht geladen werden: %s", err)
        return url


@websocket_api.websocket_command(
    {vol.Required("type"): "kochbuch/import_url", vol.Required("url"): str}
)
@websocket_api.async_response
async def ws_import_url(hass, connection, msg):
    try:
        recipe = await async_import_url(hass, msg["url"].strip())
    except ValueError as err:
        connection.send_error(msg["id"], "import_failed", str(err))
        return
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Import von %s fehlgeschlagen: %s", msg["url"], err)
        connection.send_error(
            msg["id"], "import_failed", "Seite konnte nicht geladen werden"
        )
        return
    if recipe.get("image", "").startswith("http"):
        recipe["image"] = await _download_image(hass, recipe["image"])
    connection.send_result(msg["id"], recipe)


@websocket_api.websocket_command(
    {vol.Required("type"): "kochbuch/settings", vol.Required("settings"): dict}
)
@websocket_api.async_response
async def ws_settings(hass, connection, msg):
    settings = await _store(hass).async_set_settings(msg["settings"])
    connection.send_result(msg["id"], settings)


@websocket_api.websocket_command({vol.Required("type"): "kochbuch/export"})
@callback
def ws_export(hass, connection, msg):
    connection.send_result(msg["id"], _store(hass).export())


@websocket_api.websocket_command(
    {
        vol.Required("type"): "kochbuch/import_backup",
        vol.Required("data"): dict,
        vol.Optional("replace", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_import_backup(hass, connection, msg):
    try:
        count = await _store(hass).async_import(msg["data"], msg["replace"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_backup", str(err))
        return
    connection.send_result(msg["id"], {"imported": count})
