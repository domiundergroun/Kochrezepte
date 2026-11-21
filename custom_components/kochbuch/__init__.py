"""Kochbuch – Rezeptsammlung für Home Assistant."""

from __future__ import annotations

import logging
import os

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from . import websocket
from .const import (
    DOMAIN,
    FRONTEND_URL,
    IMAGES_URL,
    PANEL_COMPONENT,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL_PATH,
    VERSION,
)
from .store import KochbuchStore

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR]
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")
PANEL_JS = f"{FRONTEND_URL}/kochbuch-panel.js?v={VERSION}"
CARD_JS = f"{FRONTEND_URL}/kochbuch-card.js?v={VERSION}"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Kochbuch einrichten."""
    domain_data = hass.data.setdefault(DOMAIN, {})

    store = KochbuchStore(hass)
    await store.async_load()
    domain_data["store"] = store

    if not domain_data.get("http_registered"):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(FRONTEND_URL, FRONTEND_DIR, False),
                StaticPathConfig(IMAGES_URL, store.images_path, True),
            ]
        )
        websocket.async_register(hass)
        frontend.add_extra_js_url(hass, CARD_JS)
        domain_data["http_registered"] = True

    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name=PANEL_COMPONENT,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=PANEL_JS,
        require_admin=False,
        config={"version": VERSION},
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Kochbuch entladen."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
    return unloaded
