"""Notificaciones push (Web Push con VAPID).

Las claves VAPID se crean la primera vez y se guardan junto a la base de datos
(`vapid.json`), así que sobreviven a reinicios y actualizaciones. Se pueden
fijar con las variables VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.
"""
import base64
import json
import logging
import os
import threading
from typing import Dict, Optional, Tuple

from sqlalchemy.orm import Session

from .. import models
from ..database import DATABASE_URL

log = logging.getLogger("notify")

# Apple rechaza el JWT si el `sub` no es https:// o mailto:
DEFAULT_SUBJECT = "https://github.com/Ronambulo/FinanceMaster"
_lock = threading.Lock()
_keys: Optional[Dict[str, str]] = None


def _data_dir() -> str:
    if DATABASE_URL.startswith("sqlite:///"):
        path = DATABASE_URL[len("sqlite:///"):]
        if path and path != ":memory:":
            return os.path.dirname(os.path.abspath(path))
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _generate() -> Dict[str, str]:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    key = ec.generate_private_key(ec.SECP256R1())
    priv = key.private_numbers().private_value.to_bytes(32, "big")
    pub = key.public_key().public_bytes(serialization.Encoding.X962,
                                        serialization.PublicFormat.UncompressedPoint)
    return {"public": _b64(pub), "private": _b64(priv)}


def vapid_keys() -> Dict[str, str]:
    global _keys
    if _keys:
        return _keys
    with _lock:
        if _keys:
            return _keys
        pub, priv = os.getenv("VAPID_PUBLIC_KEY"), os.getenv("VAPID_PRIVATE_KEY")
        if pub and priv:
            _keys = {"public": pub, "private": priv}
            return _keys
        path = os.path.join(_data_dir(), "vapid.json")
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            if data.get("public") and data.get("private"):
                _keys = {"public": data["public"], "private": data["private"]}
                return _keys
        except (OSError, ValueError):
            pass
        data = _generate()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        _keys = data
        return _keys


def public_key() -> str:
    return vapid_keys()["public"]


def has_subscription(db: Session, user_id: int) -> bool:
    return db.query(models.PushSubscription.id).filter(models.PushSubscription.user_id == user_id).first() is not None


def send(db: Session, user_id: int, title: str, body: str, url: str = "/", tag: Optional[str] = None) -> Tuple[int, int]:
    """Envía una notificación a todos los dispositivos del usuario.
    Devuelve (enviadas, fallidas). Las suscripciones caducadas se borran."""
    from pywebpush import WebPushException, webpush
    from py_vapid import Vapid01

    subs = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == user_id).all()
    if not subs:
        return 0, 0
    vapid = Vapid01.from_raw(vapid_keys()["private"].encode())
    claims_sub = os.getenv("VAPID_SUBJECT") or DEFAULT_SUBJECT
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag}, ensure_ascii=False)
    sent = failed = 0
    for s in subs:
        try:
            webpush(
                subscription_info={"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}},
                data=payload,
                vapid_private_key=vapid,
                vapid_claims={"sub": claims_sub},
                ttl=24 * 3600,
            )
            sent += 1
        except WebPushException as exc:
            failed += 1
            code = getattr(getattr(exc, "response", None), "status_code", None)
            if code in (404, 410):
                db.delete(s)
            else:
                log.warning("push falló (%s): %s", code, exc)
        except Exception as exc:  # red, endpoint mal formado...
            failed += 1
            log.warning("push falló: %s", exc)
    db.commit()
    return sent, failed


def once(db: Session, user_id: int, key: str) -> bool:
    """True la primera vez que se pide `key` para el usuario (y lo deja anotado)."""
    exists = db.query(models.EventLog.id).filter(models.EventLog.user_id == user_id,
                                                 models.EventLog.key == key).first()
    if exists:
        return False
    db.add(models.EventLog(user_id=user_id, key=key))
    db.commit()
    return True


def mark(db: Session, user_id: int, key: str) -> None:
    once(db, user_id, key)
