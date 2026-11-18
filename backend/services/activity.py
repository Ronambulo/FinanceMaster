"""Registro de actividad, avisos para administradores y sesiones abiertas.

Todo es best-effort: si escribir el registro falla, la acción del usuario no
debe fallar por ello."""
import logging
import re
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from .. import models

log = logging.getLogger("activity")

# Textos del registro (Administración → Registro de actividad).
ACTIONS = {
    "login": "Inició sesión",
    "passkey_added": "Activó entrar con huella",
    "passkey_removed": "Quitó una huella",
    "login_failed": "Intento de acceso fallido",
    "logout": "Cerró sesión",
    "register": "Se registró",
    "password_changed": "Cambió su contraseña",
    "sessions_closed": "Cerró sus otras sesiones",
    "import": "Importó movimientos",
    "account_deleted": "Eliminó su cuenta",
    "admin_user_created": "Creó un usuario",
    "admin_set_admin": "Cambió permisos de administrador",
    "admin_password_reset": "Restableció una contraseña",
    "admin_set_active": "Cambió el acceso de un usuario",
    "admin_user_deleted": "Eliminó un usuario",
    "backup": "Copia del servidor",
}

FAILED_LOGIN_WINDOW = timedelta(minutes=15)
FAILED_LOGIN_ALERT = 5


def client_ip(request) -> Optional[str]:
    if request is None:
        return None
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


def record(db: Session, action: str, user: Optional[models.User] = None, detail: Optional[str] = None,
           request=None, username: Optional[str] = None) -> None:
    try:
        db.add(models.ActivityLog(
            user_id=user.id if user else None,
            username=(user.display_name or user.username) if user else username,
            action=action,
            detail=(detail or None) and detail[:300],
            ip=client_ip(request),
        ))
        db.commit()
    except Exception as exc:  # pragma: no cover - nunca rompe la petición
        db.rollback()
        log.warning("activity log failed: %s", exc)


def notify(db: Session, title: str, text: Optional[str] = None, level: str = "warning") -> None:
    try:
        db.add(models.AdminNotice(title=title[:200], text=(text or None) and text[:500], level=level))
        db.commit()
    except Exception as exc:  # pragma: no cover
        db.rollback()
        log.warning("admin notice failed: %s", exc)


def failed_login(db: Session, ident: str, user: Optional[models.User], request=None) -> None:
    """Apunta el intento y avisa a los admins al llegar a FAILED_LOGIN_ALERT
    seguidos en la ventana (una sola vez por ráfaga)."""
    name = (user.display_name or user.username) if user else ident[:60]
    record(db, "login_failed", user=user, username=name, request=request)
    since = datetime.utcnow() - FAILED_LOGIN_WINDOW
    q = db.query(models.ActivityLog).filter(
        models.ActivityLog.action == "login_failed", models.ActivityLog.created_at >= since,
        models.ActivityLog.username == name,
    )
    if q.count() == FAILED_LOGIN_ALERT:
        notify(db, "Varios accesos fallidos", f"{FAILED_LOGIN_ALERT} intentos fallidos para {name} en 15 minutos")


# ── Sesiones ──────────────────────────────────────────────────────────────────
def device_label(ua: Optional[str]) -> str:
    """"Chrome · Windows", "Safari · iPhone"… a partir del User-Agent."""
    if not ua:
        return "Dispositivo desconocido"
    s = ua
    if re.search(r"iPhone", s):
        os_name = "iPhone"
    elif re.search(r"iPad", s):
        os_name = "iPad"
    elif re.search(r"Android", s):
        os_name = "Android"
    elif re.search(r"Windows", s):
        os_name = "Windows"
    elif re.search(r"Mac OS X|Macintosh", s):
        os_name = "Mac"
    elif re.search(r"Linux", s):
        os_name = "Linux"
    else:
        os_name = None
    if re.search(r"Edg/", s):
        browser = "Edge"
    elif re.search(r"OPR/|Opera", s):
        browser = "Opera"
    elif re.search(r"Firefox/|FxiOS", s):
        browser = "Firefox"
    elif re.search(r"Chrome/|CriOS", s):
        browser = "Chrome"
    elif re.search(r"Safari/", s):
        browser = "Safari"
    elif re.search(r"python|curl|okhttp|Shortcuts|CFNetwork", s, re.I):
        browser = "App"
    else:
        browser = None
    parts = [p for p in (browser, os_name) if p]
    return " · ".join(parts) if parts else "Dispositivo desconocido"
