from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from .. import models, schemas, auth
from ..database import get_db
from ..services import ai_usage

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
    }


@router.get("/users", response_model=List[schemas.AdminUserOut])
def list_users(
    current_user: models.User = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


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
    db.refresh(user)
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

    db.delete(user)
    db.commit()
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
