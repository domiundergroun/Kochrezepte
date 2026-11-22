"""Automatisches Backup auf einen FTP-Server (z. B. NAS)."""
from __future__ import annotations

import ftplib
import io
import logging
import re
import ssl
from datetime import datetime, timezone
from typing import Any

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util


_LOGGER = logging.getLogger(__name__)

FILE_PREFIX = "kochbuch-backup-"
FILE_RE = re.compile(r"^kochbuch-backup-[0-9_\-]+\.zip$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

DEFAULT_BACKUP: dict[str, Any] = {
    "enabled": False,
    "host": "",
    "port": 21,
    "user": "",
    "password": "",
    "path": "/",
    "tls": False,  # FTPS (explizites TLS)
    "verify": False,  # Zertifikat prüfen (NAS nutzt meist selbstsignierte Zertifikate)
    "freq": "daily",  # daily | weekly (montags)
    "time": "03:00",
    "keep": 14,
    "last": None,  # {"ts": ISO, "ok": bool, "msg": str, "file": str}
}


class BackupError(Exception):
    """Fehler beim Sichern mit verständlicher Meldung."""


def clean_backup_config(raw: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    """Eingaben prüfen. Ein fehlendes oder leeres Passwort behält das bisherige."""
    out = dict(current)
    out["enabled"] = bool(raw.get("enabled", current["enabled"]))
    host = str(raw.get("host", current["host"])).strip()
    if host and (len(host) > 253 or re.search(r"\s", host)):
        raise ValueError("Ungültiger Server")
    out["host"] = host
    try:
        port = int(raw.get("port", current["port"]))
    except (TypeError, ValueError) as err:
        raise ValueError("Ungültiger Port") from err
    if not 1 <= port <= 65535:
        raise ValueError("Port muss zwischen 1 und 65535 liegen")
    out["port"] = port
    out["user"] = str(raw.get("user", current["user"])).strip()[:100]
    password = raw.get("password")
    if isinstance(password, str) and password:
        out["password"] = password[:200]
    path = str(raw.get("path", current["path"])).strip().replace("\\", "/") or "/"
    if not path.startswith("/"):
        path = "/" + path
    out["path"] = path[:300]
    out["tls"] = bool(raw.get("tls", current["tls"]))
    out["verify"] = bool(raw.get("verify", current["verify"]))
    freq = raw.get("freq", current["freq"])
    if freq not in ("daily", "weekly"):
        raise ValueError("Ungültige Häufigkeit")
    out["freq"] = freq
    time = str(raw.get("time", current["time"])).strip()
    if not TIME_RE.match(time):
        raise ValueError("Uhrzeit bitte als HH:MM angeben")
    out["time"] = time
    try:
        keep = int(raw.get("keep", current["keep"]))
    except (TypeError, ValueError) as err:
        raise ValueError("Ungültige Anzahl der aufzubewahrenden Backups") from err
    out["keep"] = min(max(keep, 1), 365)
    for key in ("host", "user", "path", "password"):
        if re.search(r"[\r\n]", out[key]):
            raise ValueError("Ungültige Zeichen in den Verbindungsdaten")
    if out["enabled"] and not (out["host"] and out["user"]):
        raise ValueError("Für das automatische Backup werden Server und Benutzer benötigt")
    return out


def public_backup(cfg: dict[str, Any]) -> dict[str, Any]:
    """Konfiguration ohne Passwort für das Panel."""
    out = {k: v for k, v in cfg.items() if k != "password"}
    out["has_password"] = bool(cfg.get("password"))
    return out


def _connect(cfg: dict[str, Any]) -> ftplib.FTP:
    if cfg["tls"]:
        ctx = ssl.create_default_context()
        if not cfg["verify"]:
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        ftp: ftplib.FTP = ftplib.FTP_TLS(context=ctx)
    else:
        ftp = ftplib.FTP()
    try:
        ftp.connect(cfg["host"], cfg["port"], timeout=20)
        ftp.login(cfg["user"], cfg["password"])
        if cfg["tls"]:
            ftp.prot_p()
        ftp.set_pasv(True)
        _enter_dir(ftp, cfg["path"])
    except ftplib.error_perm as err:
        _close(ftp)
        text = str(err)
        if text.startswith("530"):
            raise BackupError("Anmeldung fehlgeschlagen (Benutzer oder Passwort falsch)") from err
        raise BackupError(f"Server hat abgelehnt: {text}") from err
    except ssl.SSLError as err:
        _close(ftp)
        raise BackupError(f"TLS-Fehler: {err.reason or err}. Prüfe die Verschlüsselung oder deaktiviere die Zertifikatsprüfung.") from err
    except (OSError, EOFError, ftplib.Error) as err:
        _close(ftp)
        raise BackupError(f"Verbindung fehlgeschlagen: {err}") from err
    return ftp


def _enter_dir(ftp: ftplib.FTP, path: str) -> None:
    ftp.cwd("/")
    for part in [p for p in path.split("/") if p]:
        try:
            ftp.cwd(part)
        except ftplib.error_perm:
            ftp.mkd(part)
            ftp.cwd(part)


def _close(ftp: ftplib.FTP) -> None:
    try:
        ftp.quit()
    except Exception:  # noqa: BLE001
        try:
            ftp.close()
        except Exception:  # noqa: BLE001
            pass


def test_connection(cfg: dict[str, Any]) -> str:
    """Verbindung, Anmeldung und Zielordner prüfen (blockierend)."""
    ftp = _connect(cfg)
    try:
        existing = [n for n in _list(ftp) if FILE_RE.match(n)]
    finally:
        _close(ftp)
    return f"Verbindung erfolgreich. Zielordner {cfg['path']} ist erreichbar ({len(existing)} vorhandene Backups)."


def _list(ftp: ftplib.FTP) -> list[str]:
    try:
        return [n.rsplit("/", 1)[-1] for n in ftp.nlst()]
    except ftplib.error_perm as err:
        if str(err).startswith("550"):  # leerer Ordner bei manchen Servern
            return []
        raise


def upload(cfg: dict[str, Any], name: str, payload: bytes) -> str:
    """Datei hochladen und alte Backups löschen (blockierend)."""
    ftp = _connect(cfg)
    try:
        ftp.storbinary(f"STOR {name}", io.BytesIO(payload))
        removed = 0
        names = sorted(n for n in _list(ftp) if FILE_RE.match(n))
        for old in names[: max(0, len(names) - cfg["keep"])]:
            try:
                ftp.delete(old)
                removed += 1
            except ftplib.Error:
                _LOGGER.warning("Altes Backup %s konnte nicht gelöscht werden", old)
    except (OSError, EOFError, ftplib.Error) as err:
        raise BackupError(f"Hochladen fehlgeschlagen: {err}") from err
    finally:
        _close(ftp)
    return f"{name} gespeichert" + (f", {removed} alte gelöscht" if removed else "")


class BackupManager:
    """Plant und führt automatische Backups aus."""

    def __init__(self, hass: HomeAssistant, store: Any) -> None:
        self.hass = hass
        self.store = store
        self._unsub: CALLBACK_TYPE | None = None

    @callback
    def async_start(self) -> None:
        self.async_reschedule()

    @callback
    def async_stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None

    @callback
    def async_reschedule(self) -> None:
        self.async_stop()
        cfg = self.store.backup
        if not (cfg["enabled"] and cfg["host"]):
            return
        hour, minute = (int(x) for x in cfg["time"].split(":"))
        self._unsub = async_track_time_change(self.hass, self._tick, hour=hour, minute=minute, second=0)

    async def _tick(self, now: datetime) -> None:
        if self.store.backup["freq"] == "weekly" and dt_util.as_local(now).weekday() != 0:
            return
        try:
            await self.async_run()
        except BackupError as err:
            _LOGGER.warning("Automatisches Backup fehlgeschlagen: %s", err)

    async def async_test(self) -> str:
        cfg = dict(self.store.backup)
        try:
            return await self.hass.async_add_executor_job(test_connection, cfg)
        except BackupError:
            raise

    async def async_run(self) -> str:
        """Backup jetzt erstellen und hochladen. Ergebnis wird als „last“ gespeichert."""
        cfg = dict(self.store.backup)
        if not cfg["host"]:
            raise BackupError("Kein Server eingetragen")
        now = dt_util.now()
        name = f"{FILE_PREFIX}{now:%Y-%m-%d_%H%M}.zip"
        payload = await self.store.async_build_backup()
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            msg = await self.hass.async_add_executor_job(upload, cfg, name, payload)
        except BackupError as err:
            await self.store.async_set_backup_status({"ts": ts, "ok": False, "msg": str(err), "file": name})
            raise
        await self.store.async_set_backup_status({"ts": ts, "ok": True, "msg": msg, "file": name})
        return msg
