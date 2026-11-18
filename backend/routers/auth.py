from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from pydantic import BaseModel
from .. import models, schemas, auth
from ..database import get_db
from ..services import preferences as prefs
from ..services import activity

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.Token)
def register(data: schemas.UserCreate, request: Request, db: Session = Depends(get_db)):
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Falta el usuario")
    invite = _valid_invite(db, data.invite) if data.invite else None
    if data.invite and not invite:
        raise HTTPException(status_code=400, detail="La invitación ha caducado o ya se usó")
    # El correo es opcional: sin él se guarda uno interno único.
    email = data.email or f"{username}@local"
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")
    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(status_code=400, detail="Usuario ya existe")

    user = models.User(
        email=email,
        username=username,
        display_name=(data.display_name or "").strip() or None,
        hashed_password=auth.hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if invite:
        invite.used_at = datetime.utcnow()
        invite.used_by = user.id
        db.commit()

    token = auth.issue_token(db, user, request)
    activity.record(db, "register", user=user, detail="con invitación" if invite else None, request=request)
    return schemas.Token(access_token=token, token_type="bearer", user=schemas.UserOut.model_validate(user))


def _valid_invite(db: Session, token: str) -> Optional[models.Invite]:
    inv = db.query(models.Invite).filter(models.Invite.token == token).first()
    if not inv or inv.used_at is not None or inv.expires_at < datetime.utcnow():
        return None
    return inv


@router.get("/invite/{token}")
def get_invite(token: str, db: Session = Depends(get_db)):
    """Datos públicos de una invitación: solo el nombre propuesto."""
    inv = _valid_invite(db, token)
    if not inv:
        raise HTTPException(status_code=404, detail="La invitación ha caducado o ya se usó")
    return {"display_name": inv.display_name}


@router.post("/login", response_model=schemas.Token)
def login(data: schemas.UserLogin, request: Request, db: Session = Depends(get_db)):
    ident = data.email.strip()
    user = db.query(models.User).filter((models.User.email == ident) | (models.User.username == ident)).first()
    if not user or not auth.verify_password(data.password, user.hashed_password):
        activity.failed_login(db, ident, user, request)
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    user.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    token = auth.issue_token(db, user, request)
    activity.record(db, "login", user=user, request=request)
    return schemas.Token(access_token=token, token_type="bearer", user=schemas.UserOut.model_validate(user))


@router.post("/logout")
def logout(
    request: Request,
    jti: Optional[str] = Depends(auth.token_jti),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if jti:
        s = db.query(models.UserSession).filter(models.UserSession.jti == jti).first()
        if s and s.revoked_at is None:
            s.revoked_at = datetime.utcnow()
            db.commit()
    activity.record(db, "logout", user=current_user, request=request)
    return {"ok": True}


@router.get("/sessions")
def list_sessions(
    jti: Optional[str] = Depends(auth.token_jti),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Sesiones abiertas (sin cerrar y sin caducar), la actual primero."""
    since = datetime.utcnow() - timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    rows = (
        db.query(models.UserSession)
        .filter(models.UserSession.user_id == current_user.id, models.UserSession.revoked_at.is_(None),
                models.UserSession.created_at >= since)
        .order_by(models.UserSession.last_seen_at.desc())
        .all()
    )
    out = [{
        "id": s.id,
        "device": activity.device_label(s.user_agent),
        "ip": s.ip,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "last_seen_at": s.last_seen_at.isoformat() if s.last_seen_at else None,
        "current": s.jti == jti,
    } for s in rows]
    out.sort(key=lambda s: not s["current"])
    return out


@router.delete("/sessions/{session_id}")
def close_session(
    session_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    s = db.query(models.UserSession).filter(models.UserSession.id == session_id, models.UserSession.user_id == current_user.id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if s.revoked_at is None:
        s.revoked_at = datetime.utcnow()
        db.commit()
    return {"ok": True}


@router.post("/sessions/close-others")
def close_other_sessions(
    request: Request,
    jti: Optional[str] = Depends(auth.token_jti),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    n = auth.revoke_sessions(db, current_user.id, except_jti=jti)
    if n:
        activity.record(db, "sessions_closed", user=current_user, detail=f"{n}", request=request)
    return {"closed": n}


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


@router.get("/preferences")
def get_preferences(current_user: models.User = Depends(auth.get_current_user)):
    return prefs.resolve(current_user.preferences)


@router.put("/preferences")
def update_preferences(
    data: schemas.PreferencesUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    try:
        current_user.preferences = prefs.merge(current_user.preferences, data.model_dump(exclude_none=True))
    except prefs.PreferencesError as e:
        raise HTTPException(status_code=422, detail=str(e))
    db.commit()
    return prefs.resolve(current_user.preferences)


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    # Sin enviar, el usuario no cambia (los clientes viejos solo mandan el nombre).
    username: str | None = None


def _rename(db: Session, user: models.User, new: str, request: Request) -> None:
    """Cambia el nombre de usuario con el que se entra."""
    new = new.strip()
    if not new:
        raise HTTPException(status_code=422, detail="Falta el usuario")
    if len(new) > 40:
        raise HTTPException(status_code=422, detail="El usuario es demasiado largo")
    if any(c.isspace() for c in new):
        raise HTTPException(status_code=422, detail="El usuario no puede tener espacios")
    old = user.username
    if new == old:
        return
    # Se entra con usuario o correo: no puede coincidir con ninguno de otra cuenta.
    taken = db.query(models.User).filter(
        models.User.id != user.id,
        (models.User.username == new) | (models.User.email == new),
    ).first()
    if taken:
        raise HTTPException(status_code=400, detail="Ese usuario ya existe")
    user.username = new
    # El correo interno de las cuentas sin correo sigue al usuario.
    if user.email == f"{old}@local":
        internal = f"{new}@local"
        if not db.query(models.User).filter(models.User.id != user.id, models.User.email == internal).first():
            user.email = internal
    activity.record(db, "username_changed", user=user, detail=f"{old} → {new}", request=request)


@router.put("/profile", response_model=schemas.UserOut)
def update_profile(
    data: ProfileUpdate,
    request: Request,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    name = (data.display_name or "").strip()
    if len(name) > 60:
        raise HTTPException(status_code=422, detail="El nombre es demasiado largo")
    if data.username is not None:
        _rename(db, current_user, data.username, request)
    current_user.display_name = name or None
    db.commit()
    db.refresh(current_user)
    return current_user


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.put("/password")
def change_password(
    data: PasswordChange,
    request: Request,
    jti: Optional[str] = Depends(auth.token_jti),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not auth.verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    current_user.hashed_password = auth.hash_password(data.new_password)
    db.commit()
    # Al cambiar la contraseña se cierran los demás dispositivos.
    auth.revoke_sessions(db, current_user.id, except_jti=jti)
    activity.record(db, "password_changed", user=current_user, request=request)
    return {"ok": True}


@router.delete("/account", status_code=204)
def delete_account(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Permanently delete the user account and all associated data."""
    from ..services.trade_republic_api import remove_client
    remove_client(current_user.id)

    # Estas tablas referencian al usuario sin cascade ORM configurado en User;
    # se limpian a mano para no dejar filas huérfanas tras el borrado.
    db.query(models.Insight).filter(models.Insight.user_id == current_user.id).delete()
    db.query(models.AiUsageLog).filter(models.AiUsageLog.user_id == current_user.id).delete()
    db.query(models.ImportLog).filter(models.ImportLog.user_id == current_user.id).delete()
    db.query(models.UserSession).filter(models.UserSession.user_id == current_user.id).delete()
    db.query(models.Passkey).filter(models.Passkey.user_id == current_user.id).delete()
    db.query(models.PushSubscription).filter(models.PushSubscription.user_id == current_user.id).delete()
    db.query(models.EventLog).filter(models.EventLog.user_id == current_user.id).delete()
    db.query(models.TransactionShare).filter(models.TransactionShare.user_id == current_user.id).delete()
    activity.record(db, "account_deleted", user=current_user)

    db.delete(current_user)
    db.commit()


@router.delete("/data")
def delete_all_data(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Delete all user transactions, recurring groups, debts, goals and categories."""
    # Nullify transaction references in debt_payments first to avoid FK issues
    debt_ids = [d.id for d in db.query(models.Debt).filter(models.Debt.user_id == current_user.id).all()]
    if debt_ids:
        db.query(models.DebtPayment).filter(models.DebtPayment.debt_id.in_(debt_ids)).delete(synchronize_session=False)
    db.query(models.Debt).filter(models.Debt.user_id == current_user.id).delete()
    db.query(models.Transaction).filter(models.Transaction.user_id == current_user.id).delete()
    db.query(models.RecurringGroup).filter(models.RecurringGroup.user_id == current_user.id).delete()
    db.query(models.Goal).filter(models.Goal.user_id == current_user.id).delete()
    db.query(models.SavingsAllocation).filter(models.SavingsAllocation.user_id == current_user.id).delete()
    db.query(models.CategoryRule).filter(models.CategoryRule.user_id == current_user.id).delete()
    db.query(models.Category).filter(
        models.Category.user_id == current_user.id,
        models.Category.is_system == False,
    ).delete()
    db.commit()
    return {"ok": True}


@router.delete("/data/transactions")
def delete_transaction_data(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Borra solo transacciones, grupos recurrentes y el portfolio.

    Es el borrado para reimportar desde cero: deudas, metas, presupuestos,
    categorías personalizadas y reglas se conservan, así que no hay que
    reconfigurar la app después.
    """
    uid = current_user.id

    # Los pagos de deuda apuntan a transacciones, pero las deudas se quedan:
    # hay que soltar la referencia antes de borrar o queda colgando.
    tx_ids = select(models.Transaction.id).where(models.Transaction.user_id == uid)
    db.query(models.DebtPayment).filter(
        models.DebtPayment.transaction_id.in_(tx_ids)
    ).update({models.DebtPayment.transaction_id: None}, synchronize_session=False)

    deleted = {
        "transactions": db.query(models.Transaction).filter(
            models.Transaction.user_id == uid).delete(synchronize_session=False),
        "recurring_groups": db.query(models.RecurringGroup).filter(
            models.RecurringGroup.user_id == uid).delete(synchronize_session=False),
        "manual_positions": db.query(models.ManualPosition).filter(
            models.ManualPosition.user_id == uid).delete(synchronize_session=False),
    }
    # Un grupo de enlace solo agrupa transacciones: sin ellas no significa nada.
    # Se borra después, porque transactions.link_group_id lo referencia.
    db.query(models.TransactionLink).filter(
        models.TransactionLink.user_id == uid).delete(synchronize_session=False)

    db.commit()
    return {"ok": True, **deleted}
