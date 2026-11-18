"""Copias del servidor: una copia diaria de la base de datos SQLite.

Se guardan junto a la BD en `backups/` (o en BACKUP_DIR) y se conservan las
`keep` más recientes. La configuración vive en `backups/settings.json` para no
tocar el esquema. Usa la API de copia en caliente de SQLite, así que no hace
falta parar el servidor."""
import json
import logging
import os
import re
import sqlite3
from datetime import datetime
from typing import Optional

from ..database import engine

log = logging.getLogger("backups")

HOUR = 3                  # "Diaria · 03:00"
DEFAULT_KEEP = 7
KEEP_CHOICES = (3, 7, 14, 30)
NAME_RE = re.compile(r"^finance-\d{8}-\d{6}\.db$")


def db_path() -> Optional[str]:
    return engine.url.database if engine.url.get_backend_name() == "sqlite" else None


def backup_dir() -> str:
    env = os.getenv("BACKUP_DIR")
    if env:
        return env
    p = db_path()
    return os.path.join(os.path.dirname(os.path.abspath(p)) if p else ".", "backups")


def _settings_file() -> str:
    return os.path.join(backup_dir(), "settings.json")


def get_settings() -> dict:
    s = {"enabled": True, "keep": DEFAULT_KEEP}
    try:
        with open(_settings_file(), encoding="utf-8") as f:
            raw = json.load(f)
        if isinstance(raw.get("enabled"), bool):
            s["enabled"] = raw["enabled"]
        if raw.get("keep") in KEEP_CHOICES:
            s["keep"] = raw["keep"]
    except Exception:
        pass
    return s


def save_settings(enabled: Optional[bool] = None, keep: Optional[int] = None) -> dict:
    s = get_settings()
    if enabled is not None:
        s["enabled"] = bool(enabled)
    if keep is not None:
        if keep not in KEEP_CHOICES:
            raise ValueError("Número de copias no válido")
        s["keep"] = keep
    os.makedirs(backup_dir(), exist_ok=True)
    with open(_settings_file(), "w", encoding="utf-8") as f:
        json.dump(s, f)
    return s


def list_backups() -> list:
    d = backup_dir()
    if not os.path.isdir(d):
        return []
    out = []
    for name in os.listdir(d):
        if not NAME_RE.match(name):
            continue
        st = os.stat(os.path.join(d, name))
        out.append({
            "name": name,
            "size_bytes": st.st_size,
            "created_at": datetime.strptime(name[8:23], "%Y%m%d-%H%M%S").isoformat(),
        })
    out.sort(key=lambda b: b["name"], reverse=True)
    return out


def path_for(name: str) -> Optional[str]:
    if not NAME_RE.match(name):
        return None
    p = os.path.join(backup_dir(), name)
    return p if os.path.isfile(p) else None


def make_backup(now: Optional[datetime] = None) -> dict:
    src = db_path()
    if not src:
        raise RuntimeError("La base de datos no es SQLite")
    d = backup_dir()
    os.makedirs(d, exist_ok=True)
    name = f"finance-{(now or datetime.now()).strftime('%Y%m%d-%H%M%S')}.db"
    dest = os.path.join(d, name)
    a, b = sqlite3.connect(src), sqlite3.connect(dest)
    try:
        a.backup(b)
    finally:
        b.close()
        a.close()
    prune(get_settings()["keep"])
    return next(x for x in list_backups() if x["name"] == name)


def prune(keep: int) -> None:
    for b in list_backups()[keep:]:
        try:
            os.remove(os.path.join(backup_dir(), b["name"]))
        except OSError:
            pass


def scheduled_backup() -> None:
    """Tarea de las 03:00 (scheduler)."""
    if not get_settings()["enabled"]:
        return
    from ..database import SessionLocal
    from . import activity
    db = SessionLocal()
    try:
        b = make_backup()
        activity.record(db, "backup", username="Servidor", detail=b["name"])
    except Exception as exc:
        log.error("backup failed: %s", exc)
        activity.notify(db, "No se pudo hacer la copia del servidor", str(exc), level="error")
    finally:
        db.close()
