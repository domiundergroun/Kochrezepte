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
from .bring import BringClient, BringError
from .backup import BackupError, clean_backup_config, public_backup, test_connection
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
        ws_backup_save,
        ws_backup_test,
        ws_backup_run,
        ws_bring_login,
        ws_bring_lists,
        ws_bring_select,
        ws_bring_logout,
        ws_bring_add,
    ):
        websocket_api.async_register_command(hass, handler)


def _payload(store: KochbuchStore, user=None) -> dict[str, Any]:
    data = {"recipes": store.list(), "settings": store.settings, "version": VERSION}
    if user is not None and user.is_admin:
        data["backup"] = public_backup(store.backup)
    return data


@websocket_api.websocket_command({vol.Required("type"): "kochbuch/data"})
@callback
def ws_data(hass, connection, msg):
    connection.send_result(msg["id"], _payload(_store(hass), connection.user))


@websocket_api.websocket_command({vol.Required("type"): "kochbuch/subscribe"})
@callback
def ws_subscribe(hass, connection, msg):
    @callback
    def _updated() -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], _payload(_store(hass), connection.user))
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


def _manager(hass: HomeAssistant):
    return hass.data[DOMAIN]["backup"]


@websocket_api.websocket_command(
    {vol.Required("type"): "kochbuch/backup_save", vol.Required("config"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_backup_save(hass, connection, msg):
    try:
        public = await _store(hass).async_save_backup_config(msg["config"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    _manager(hass).async_reschedule()
    connection.send_result(
        msg["id"], {"backup": public, "message": "Backup-Einstellungen gespeichert"}
    )


@websocket_api.websocket_command(
    {vol.Required("type"): "kochbuch/backup_test", vol.Optional("config"): dict}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_backup_test(hass, connection, msg):
    store = _store(hass)
    try:
        cfg = clean_backup_config({**msg.get("config", {}), "enabled": False}, store.backup)
        if not cfg["host"] or not cfg["user"]:
            raise ValueError("Bitte Server und Benutzer eintragen")
        message = await hass.async_add_executor_job(test_connection, cfg)
    except (ValueError, BackupError) as err:
        connection.send_error(msg["id"], "backup_failed", str(err))
        return
    connection.send_result(msg["id"], {"backup": public_backup(store.backup), "message": message})


@websocket_api.websocket_command({vol.Required("type"): "kochbuch/backup_run"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_backup_run(hass, connection, msg):
    try:
        message = await _manager(hass).async_run()
    except BackupError as err:
        connection.send_error(msg["id"], "backup_failed", str(err))
        return
    connection.send_result(
        msg["id"], {"backup": public_backup(_store(hass).backup), "message": message}
    )


# ------------------------------------------------------------------ Bring!
def _bring(hass: HomeAssistant) -> BringClient:
    return BringClient(hass, dict(_store(hass).bring_auth))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "kochbuch/bring_login",
        vol.Required("email"): str,
        vol.Required("password"): str,
    }
)
@websocket_api.async_response
async def ws_bring_login(hass, connection, msg):
    client = BringClient(hass, {})
    try:
        auth = await client.async_login(msg["email"].strip(), msg["password"])
        lists = await client.async_lists()
    except BringError as err:
        connection.send_error(msg["id"], "bring_failed", str(err))
        return
    chosen = next((l for l in lists if l["uuid"] == auth.get("default_list")), lists[0] if lists else None)
    public = await _store(hass).async_set_bring(
        auth, chosen["uuid"] if chosen else "", chosen["name"] if chosen else ""
    )
    connection.send_result(msg["id"], {"bring": public, "lists": lists})


@websocket_api.websocket_command({vol.Required("type"): "kochbuch/bring_lists"})
@websocket_api.async_response
async def ws_bring_lists(hass, connection, msg):
    client = _bring(hass)
    try:
        lists = await client.async_lists()
    except BringError as err:
        connection.send_error(msg["id"], "bring_failed", str(err))
        return
    store = _store(hass)
    store.bring_auth = client.auth
    await store.async_save_bring_tokens()
    connection.send_result(msg["id"], {"lists": lists})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "kochbuch/bring_select",
        vol.Required("list_uuid"): str,
        vol.Required("list_name"): str,
    }
)
@websocket_api.async_response
async def ws_bring_select(hass, connection, msg):
    store = _store(hass)
    if not store.bring_auth:
        connection.send_error(msg["id"], "bring_failed", "Nicht bei Bring! angemeldet")
        return
    public = await store.async_set_bring(store.bring_auth, msg["list_uuid"], msg["list_name"])
    connection.send_result(msg["id"], {"bring": public})


@websocket_api.websocket_command({vol.Required("type"): "kochbuch/bring_logout"})
@websocket_api.async_response
async def ws_bring_logout(hass, connection, msg):
    await _store(hass).async_set_bring(None)
    connection.send_result(msg["id"], {"bring": {}})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "kochbuch/bring_add",
        vol.Required("items"): [{vol.Required("name"): str, vol.Optional("spec", default=""): str}],
    }
)
@websocket_api.async_response
async def ws_bring_add(hass, connection, msg):
    store = _store(hass)
    info = store.settings.get("bring") or {}
    if not store.bring_auth or not info.get("list_uuid"):
        connection.send_error(
            msg["id"], "bring_failed", "Bring! ist nicht eingerichtet. Bitte in den Einstellungen anmelden"
        )
        return
    client = _bring(hass)
    items = [
        {"name": i["name"].strip()[:100], "spec": i.get("spec", "").strip()[:100]}
        for i in msg["items"]
        if i["name"].strip()
    ]
    try:
        count = await client.async_add_items(info["list_uuid"], items)
    except BringError as err:
        connection.send_error(msg["id"], "bring_failed", str(err))
        return
    finally:
        if client.auth.get("access_token") != store.bring_auth.get("access_token"):
            store.bring_auth = client.auth
            await store.async_save_bring_tokens()
    connection.send_result(msg["id"], {"added": count, "list_name": info.get("list_name", "")})
