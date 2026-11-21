"""Sensor mit der Anzahl der Rezepte."""

from __future__ import annotations

import datetime as dt
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, PANEL_URL_PATH, SIGNAL_UPDATED, VERSION


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([KochbuchRezepteSensor(hass, entry)])


class KochbuchRezepteSensor(SensorEntity):
    """Anzahl Rezepte im Kochbuch inklusive Rezept des Tages."""

    _attr_has_entity_name = True
    _attr_name = "Rezepte"
    _attr_icon = "mdi:book-open-variant"
    _attr_native_unit_of_measurement = "Rezepte"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_should_poll = False

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self._store = hass.data[DOMAIN]["store"]
        self._attr_unique_id = f"{entry.entry_id}_rezepte"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Kochbuch",
            manufacturer="domiundergroun",
            model="Rezeptsammlung",
            sw_version=VERSION,
            entry_type=DeviceEntryType.SERVICE,
            configuration_url=f"homeassistant://{PANEL_URL_PATH}",
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATED, self._updated)
        )

    @callback
    def _updated(self) -> None:
        self.async_write_ha_state()

    @property
    def native_value(self) -> int:
        return len(self._store.recipes)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        recipes = self._store.list()
        attrs: dict[str, Any] = {
            "favoriten": sum(1 for r in recipes if r.get("favorite")),
        }
        if recipes:
            index = dt.date.today().toordinal() % len(recipes)
            attrs["rezept_des_tages"] = recipes[index]["title"]
            newest = max(recipes, key=lambda r: r.get("created", ""))
            attrs["neuestes_rezept"] = newest["title"]
        return attrs
