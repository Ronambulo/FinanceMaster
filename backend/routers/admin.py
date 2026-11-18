import os
import time
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from .. import models, schemas, auth
from ..database import get_db
from fastapi import Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from ..services import ai_usage, activity, backups

router = APIRouter(prefix="/api/admin", tags=["admin"])

_STARTED = time.time()
MIN_PASSWORD = 6


def _db_size(db: Session) -> int:
    """Tamaño del fichero SQLite en bytes (0 si no es SQLite o no se puede leer)."""
    try:
        path = db.get_bind().url.database
        return os.path.getsize(path) if path else 0
    except Exception:
        return 0


def _with_counts(db: Session, users: list) -> list:
    ids = [u.id for u in users]
    if not ids:
        return []
    tx = dict(
        db.query(models.Transaction.user_id, func.count(models.Transaction.id))
        .filter(models.Transaction.user_id.in_(ids))
        .group_by(models.Transaction.user_id).all()
    )
    acc = dict(
        db.query(models.Transaction.user_id, func.count(func.distinct(models.Transaction.source)))
        .filter(models.Transaction.user_id.in_(ids), models.Transaction.source.isnot(None))
        .group_by(models.Transaction.user_id).all()
    )
    out = []
    for u in users:
        o = schemas.AdminUserOut.model_validate(u)
        o.tx_count = tx.get(u.id, 0)
        o.account_count = acc.get(u.id, 0)
        out.append(o)
    return out


def _get_user(db: Session, user_id: int) -> models.User:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    return user


@router.get("/stats")
def get_stats(
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """Métricas agregadas de todas las cuentas para el panel de administración.
    Nunca expone contenido ni datos personales — solo recuentos."""
    total_users = db.query(func.count(models.User.id)).scalar() or 0
    active_users = db.query(func.count(models.User.id)).filter(models.User.is_active == True).scalar() or 0
    admin_users = db.query(func.count(models.User.id)).filter(models.User.is_admin == True).scalar() or 0
    ai_enabled_users = db.query(func.count(models.User.id)).filter(models.User.ai_enabled == True).scalar() or 0
    connected_bank_users = db.query(func.count(func.distinct(models.BankConnection.user_id))).scalar() or 0
    total_transactions = db.query(func.count(models.Transaction.id)).scalar() or 0
    users_with_debts = db.query(func.count(func.distinct(models.Debt.user_id))).scalar() or 0
    users_with_goals = (
        db.query(func.count(func.distinct(models.Goal.user_id)))
        .filter(models.Goal.is_active == True)
        .scalar() or 0
    )
    users_with_recurring = (
        db.query(func.count(func.distinct(models.RecurringGroup.user_id)))
        .filter(models.RecurringGroup.is_active == True)
        .scalar() or 0
    )
    users_with_budgets = db.query(func.count(func.distinct(models.Budget.user_id))).scalar() or 0

    month_col = func.strftime("%Y-%m", models.User.created_at)
    signup_rows = (
        db.query(month_col.label("month"), func.count(models.User.id).label("count"))
        .group_by(month_col)
        .all()
    )
    counts_by_month = {r.month: r.count for r in signup_rows}

    # Rellena los 6 últimos meses aunque no haya habido altas, para que el
    # gráfico siempre muestre un eje temporal completo en vez de solo los
    # meses con datos.
    now = datetime.now(timezone.utc)
    months_seq = []
    y, m = now.year, now.month
    for _ in range(6):
        months_seq.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months_seq.reverse()
    signups_by_month = [{"month": key, "count": counts_by_month.get(key, 0)} for key in months_seq]

    return {
        "total_users": total_users,
        "active_users": active_users,
        "closed_users": total_users - active_users,
        "admin_users": admin_users,
        "ai_enabled_users": ai_enabled_users,
        "connected_bank_users": connected_bank_users,
        "total_transactions": total_transactions,
        "users_with_debts": users_with_debts,
        "users_with_goals": users_with_goals,
        "users_with_recurring": users_with_recurring,
        "users_with_budgets": users_with_budgets,
        "signups_by_month": signups_by_month,
        "ai_usage": ai_usage.global_usage_summary(db, months=6),
        "db_size_bytes": _db_size(db),
        "uptime_seconds": int(time.time() - _STARTED),
        "unread_notices": db.query(func.count(models.AdminNotice.id)).filter(models.AdminNotice.read_at.is_(None)).scalar() or 0,
        "backups": {**backups.get_settings(), "hour": backups.HOUR, "last": (backups.list_backups() or [None])[0]},
    }


@router.get("/users", response_model=List[schemas.AdminUserOut])
def list_users(
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    users = db.query(models.User).order_by(models.User.created_at.desc()).all()
    return _with_counts(db, users)


@router.post("/users", response_model=schemas.AdminUserOut)
def create_user(
    data: schemas.AdminCreateUser,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    username = data.username.strip()
    if not username:
        raise HTTPException(400, "Falta el usuario")
    if len(data.password) < MIN_PASSWORD:
        raise HTTPException(400, f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres")
    email = data.email or f"{username}@local"
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(400, "Usuario ya existe")
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(400, "Email ya registrado")
    user = models.User(
        email=email, username=username,
        display_name=(data.display_name or "").strip() or None,
        hashed_password=auth.hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    activity.record(db, "admin_user_created", user=current_user, detail=user.username)
    return _with_counts(db, [user])[0]


@router.get("/users/{user_id}", response_model=schemas.AdminUserOut)
def get_user(
    user_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    return _with_counts(db, [_get_user(db, user_id)])[0]


@router.put("/users/{user_id}/admin", response_model=schemas.AdminUserOut)
def set_user_admin(
    user_id: int,
    data: schemas.AdminSetAdmin,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    if user_id == current_user.id and not data.is_admin:
        raise HTTPException(400, "No puedes quitarte a ti mismo el permiso de administrador")
    user = _get_user(db, user_id)
    user.is_admin = data.is_admin
    db.commit()
    activity.record(db, "admin_set_admin", user=current_user, detail=f"{user.username} · {'sí' if data.is_admin else 'no'}")
    db.refresh(user)
    return _with_counts(db, [user])[0]


@router.put("/users/{user_id}/password")
def reset_user_password(
    user_id: int,
    data: schemas.AdminSetPassword,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    if len(data.password) < MIN_PASSWORD:
        raise HTTPException(400, f"La contraseña debe tener al menos {MIN_PASSWORD} caracteres")
    user = _get_user(db, user_id)
    user.hashed_password = auth.hash_password(data.password)
    db.commit()
    auth.revoke_sessions(db, user.id)
    activity.record(db, "admin_password_reset", user=current_user, detail=user.username)
    return {"success": True}


@router.put("/users/{user_id}/active", response_model=schemas.AdminUserOut)
def set_user_active(
    user_id: int,
    data: schemas.AdminSetActive,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(400, "No puedes cerrar tu propia cuenta desde el panel de administración")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    user.is_active = data.is_active
    db.commit()
    if not data.is_active:
        auth.revoke_sessions(db, user.id)
    db.refresh(user)
    activity.record(db, "admin_set_active", user=current_user, detail=f"{user.username} · {'activo' if data.is_active else 'bloqueado'}")
    return user


@router.put("/users/{user_id}/ai", response_model=schemas.AdminUserOut)
def set_user_ai(
    user_id: int,
    data: schemas.AdminSetAi,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    user.ai_enabled = data.ai_enabled
    user.ai_model = data.ai_model
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(400, "No puedes borrar tu propia cuenta desde el panel de administración")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")

    # Estas tablas referencian al usuario sin cascade ORM configurado en User;
    # se limpian a mano para no dejar filas huérfanas tras el borrado.
    db.query(models.Insight).filter(models.Insight.user_id == user_id).delete()
    db.query(models.AiUsageLog).filter(models.AiUsageLog.user_id == user_id).delete()
    db.query(models.ImportLog).filter(models.ImportLog.user_id == user_id).delete()
    db.query(models.UserSession).filter(models.UserSession.user_id == user_id).delete()
    db.query(models.Passkey).filter(models.Passkey.user_id == user_id).delete()
    name = user.username

    db.delete(user)
    db.commit()
    activity.record(db, "admin_user_deleted", user=current_user, detail=name)
    return {"success": True}


@router.get("/users/{user_id}/usage")
def get_user_usage(
    user_id: int,
    months: int = Query(12, ge=1, le=24),
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    return ai_usage.usage_summary(db, user_id, months)


# ── Registro de actividad ─────────────────────────────────────────────────────
@router.get("/activity")
def list_activity(
    limit: int = Query(100, ge=1, le=500),
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    rows = db.query(models.ActivityLog).order_by(models.ActivityLog.created_at.desc(), models.ActivityLog.id.desc()).limit(limit).all()
    return [{
        "id": r.id, "user_id": r.user_id, "username": r.username, "action": r.action,
        "label": activity.ACTIONS.get(r.action, r.action), "detail": r.detail,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]


# ── Avisos ────────────────────────────────────────────────────────────────────
def _notice(n: models.AdminNotice) -> dict:
    return {"id": n.id, "level": n.level, "title": n.title, "text": n.text,
            "created_at": n.created_at.isoformat() if n.created_at else None, "read": n.read_at is not None}


@router.get("/notices")
def list_notices(current_user: models.User = Depends(auth.require_admin), db: Session = Depends(get_db)):
    rows = db.query(models.AdminNotice).order_by(models.AdminNotice.created_at.desc(), models.AdminNotice.id.desc()).limit(100).all()
    return {"unread": sum(1 for n in rows if n.read_at is None), "items": [_notice(n) for n in rows]}


@router.post("/notices/read")
def read_notices(current_user: models.User = Depends(auth.require_admin), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    for n in db.query(models.AdminNotice).filter(models.AdminNotice.read_at.is_(None)).all():
        n.read_at = now
    db.commit()
    return {"ok": True}


@router.delete("/notices/{notice_id}")
def delete_notice(notice_id: int, current_user: models.User = Depends(auth.require_admin), db: Session = Depends(get_db)):
    db.query(models.AdminNotice).filter(models.AdminNotice.id == notice_id).delete()
    db.commit()
    return {"ok": True}


# ── Copias del servidor ───────────────────────────────────────────────────────
class BackupSettings(BaseModel):
    enabled: Optional[bool] = None
    keep: Optional[int] = None


def _backups_state() -> dict:
    items = backups.list_backups()
    return {**backups.get_settings(), "hour": backups.HOUR, "keep_choices": list(backups.KEEP_CHOICES), "items": items}


@router.get("/backups")
def get_backups(current_user: models.User = Depends(auth.require_admin)):
    return _backups_state()


@router.put("/backups")
def update_backups(data: BackupSettings, current_user: models.User = Depends(auth.require_admin)):
    try:
        backups.save_settings(enabled=data.enabled, keep=data.keep)
        if data.keep is not None:
            backups.prune(data.keep)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return _backups_state()


@router.post("/backups")
def backup_now(current_user: models.User = Depends(auth.require_admin), db: Session = Depends(get_db)):
    try:
        b = backups.make_backup()
    except Exception as exc:
        activity.notify(db, "No se pudo hacer la copia del servidor", str(exc), level="error")
        raise HTTPException(500, f"No se pudo hacer la copia: {exc}")
    activity.record(db, "backup", user=current_user, detail=b["name"])
    return _backups_state()


@router.get("/backups/{name}")
def download_backup(name: str, current_user: models.User = Depends(auth.require_admin)):
    p = backups.path_for(name)
    if not p:
        raise HTTPException(404, "Copia no encontrada")
    return FileResponse(p, media_type="application/octet-stream", filename=name)

