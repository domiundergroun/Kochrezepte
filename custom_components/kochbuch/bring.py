"""Verbindung zur Einkaufslisten-App Bring!."""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any

import aiohttp

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

_LOGGER = logging.getLogger(__name__)

API = "https://api.getbring.com/rest/"
API_KEY = "cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp"
TIMEOUT = aiohttp.ClientTimeout(total=20)


class BringError(Exception):
    """Fehler mit verständlicher Meldung."""


class BringAuthError(BringError):
    """Anmeldung ungültig oder abgelaufen."""


class BringClient:
    """Minimaler Client für die Bring!-API (Anmeldung, Listen, Artikel hinzufügen)."""

    def __init__(self, hass: HomeAssistant, auth: dict[str, Any]) -> None:
        self.hass = hass
        self.auth = auth  # uuid, public_uuid, token_type, access_token, refresh_token, expires

    def _headers(self) -> dict[str, str]:
        return {
            "X-BRING-API-KEY": API_KEY,
            "X-BRING-CLIENT": "android",
            "X-BRING-APPLICATION": "bring",
            "X-BRING-COUNTRY": "DE",
            "X-BRING-USER-UUID": self.auth.get("uuid", ""),
            "X-BRING-PUBLIC-USER-UUID": self.auth.get("public_uuid", ""),
            "Authorization": f"{self.auth.get('token_type', 'Bearer')} {self.auth.get('access_token', '')}",
        }

    async def async_login(self, email: str, password: str) -> dict[str, Any]:
        session = async_get_clientsession(self.hass)
        try:
            async with session.post(
                API + "v2/bringauth",
                data={"email": email, "password": password},
                headers={k: v for k, v in self._headers().items() if k != "Authorization"},
                timeout=TIMEOUT,
            ) as resp:
                if resp.status in (400, 401, 404):
                    raise BringAuthError("E-Mail-Adresse oder Passwort ist falsch")
                if resp.status >= 400:
                    raise BringError(f"Bring! antwortet mit Fehler {resp.status}")
                data = await resp.json(content_type=None)
        except aiohttp.ClientError as err:
            raise BringError(f"Bring! ist nicht erreichbar: {err}") from err
        self.auth = {
            "email": email,
            "name": data.get("name") or "",
            "uuid": data.get("uuid", ""),
            "public_uuid": data.get("publicUuid", ""),
            "token_type": data.get("token_type", "Bearer"),
            "access_token": data.get("access_token", ""),
            "refresh_token": data.get("refresh_token", ""),
            "expires": time.time() + float(data.get("expires_in", 3600)) - 60,
            "default_list": data.get("bringListUUID", ""),
        }
        if not self.auth["uuid"] or not self.auth["access_token"]:
            raise BringError("Unerwartete Antwort von Bring!")
        return self.auth

    async def _async_refresh(self) -> None:
        if not self.auth.get("refresh_token"):
            raise BringAuthError("Bitte bei Bring! neu anmelden")
        session = async_get_clientsession(self.hass)
        try:
            async with session.post(
                API + "v2/bringauth/token",
                data={"grant_type": "refresh_token", "refresh_token": self.auth["refresh_token"]},
                headers=self._headers(),
                timeout=TIMEOUT,
            ) as resp:
                if resp.status in (400, 401):
                    raise BringAuthError("Die Bring!-Anmeldung ist abgelaufen. Bitte neu anmelden")
                if resp.status >= 400:
                    raise BringError(f"Bring! antwortet mit Fehler {resp.status}")
                data = await resp.json(content_type=None)
        except aiohttp.ClientError as err:
            raise BringError(f"Bring! ist nicht erreichbar: {err}") from err
        self.auth["access_token"] = data.get("access_token", "")
        self.auth["token_type"] = data.get("token_type", "Bearer")
        if data.get("refresh_token"):
            self.auth["refresh_token"] = data["refresh_token"]
        self.auth["expires"] = time.time() + float(data.get("expires_in", 3600)) - 60

    async def _async_request(self, method: str, path: str, **kwargs: Any) -> Any:
        if not self.auth.get("access_token"):
            raise BringAuthError("Nicht bei Bring! angemeldet")
        if time.time() > float(self.auth.get("expires", 0)):
            await self._async_refresh()
        session = async_get_clientsession(self.hass)
        for attempt in (1, 2):
            try:
                async with session.request(
                    method, API + path, headers=self._headers(), timeout=TIMEOUT, **kwargs
                ) as resp:
                    if resp.status == 401 and attempt == 1:
                        await self._async_refresh()
                        continue
                    if resp.status == 401:
                        raise BringAuthError("Die Bring!-Anmeldung ist abgelaufen. Bitte neu anmelden")
                    if resp.status == 404:
                        raise BringError("Die Bring!-Liste wurde nicht gefunden")
                    if resp.status >= 400:
                        raise BringError(f"Bring! antwortet mit Fehler {resp.status}")
                    if resp.status == 204:
                        return None
                    text = await resp.text()
                    if not text:
                        return None
                    try:
                        return await resp.json(content_type=None)
                    except ValueError:
                        return None
            except aiohttp.ClientError as err:
                raise BringError(f"Bring! ist nicht erreichbar: {err}") from err
        return None

    async def async_lists(self) -> list[dict[str, str]]:
        data = await self._async_request("GET", f"bringusers/{self.auth['uuid']}/lists")
        return [
            {"uuid": item.get("listUuid", ""), "name": item.get("name", "")}
            for item in (data or {}).get("lists", [])
            if item.get("listUuid")
        ]

    async def async_add_items(self, list_uuid: str, items: list[dict[str, str]]) -> int:
        changes = [
            {
                "accuracy": "0.0",
                "altitude": "0.0",
                "latitude": "0.0",
                "longitude": "0.0",
                "itemId": item["name"],
                "spec": item.get("spec", ""),
                "uuid": str(uuid.uuid4()),
                "operation": "TO_PURCHASE",
            }
            for item in items
            if item.get("name")
        ]
        if not changes:
            return 0
        await self._async_request(
            "PUT", f"v2/bringlists/{list_uuid}/items", json={"changes": changes, "sender": ""}
        )
        return len(changes)
