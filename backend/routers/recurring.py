from datetime import timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from .. import models, schemas, auth
from ..database import get_db
from ..services.recurring_detector import detect_recurring

router = APIRouter(prefix="/api/recurring", tags=["recurring"])


@router.get("", response_model=List[schemas.RecurringGroupOut])
def list_recurring(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    groups = (
        db.query(models.RecurringGroup)
        .options(joinedload(models.RecurringGroup.category))
        .filter(models.RecurringGroup.user_id == current_user.id)
        .order_by(models.RecurringGroup.next_expected_date)
        .all()
    )
    result = []
    for g in groups:
        group_txs = db.query(models.Transaction).filter(
            models.Transaction.recurring_group_id == g.id
        ).all()
        amount_counts: dict[float, dict] = {}
        for t in group_txs:
            amt = round(abs(t.amount), 2)
            entry = amount_counts.setdefault(amt, {"amount": amt, "count": 0, "last_date": t.date})
            entry["count"] += 1
            if t.date > entry["last_date"]:
                entry["last_date"] = t.date

        out = schemas.RecurringGroupOut.model_validate(g)
        out.transaction_count = len(group_txs)
        out.amount_options = sorted(amount_counts.values(), key=lambda a: a["last_date"], reverse=True)
        result.append(out)
    return result


@router.post("/from-transaction", response_model=schemas.RecurringGroupOut)
def create_from_transaction(
    data: schemas.RecurringGroupCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == data.transaction_id,
        models.Transaction.user_id == current_user.id,
    ).first()
    if not tx:
        raise HTTPException(404, "Transacción no encontrada")

    normalized = data.display_name.strip().lower()
    group = models.RecurringGroup(
        user_id=current_user.id,
        normalized_name=normalized,
        display_name=data.display_name.strip(),
        avg_amount=abs(tx.amount),
        period_days=data.period_days,
        category_id=tx.category_id,
        next_expected_date=tx.date + timedelta(days=data.period_days),
        is_active=True,
    )
    db.add(group)
    db.flush()
    tx.recurring_group_id = group.id
    db.commit()
    db.refresh(group)
    out = schemas.RecurringGroupOut.model_validate(group)
    out.transaction_count = 1
    return out


@router.post("/detect")
def trigger_detection(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    detect_recurring(db, current_user.id)
    return {"ok": True}


@router.put("/{group_id}", response_model=schemas.RecurringGroupOut)
def update_recurring(
    group_id: int,
    data: schemas.RecurringGroupUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    g = db.query(models.RecurringGroup).filter(
        models.RecurringGroup.id == group_id,
        models.RecurringGroup.user_id == current_user.id,
    ).first()
    if not g:
        raise HTTPException(404, "Grupo recurrente no encontrado")
    updates = data.model_dump(exclude_none=True)
    if "avg_amount" in updates:
        g.amount_is_manual = True
    for k, v in updates.items():
        setattr(g, k, v)
    db.commit()
    db.refresh(g)

    group_txs = db.query(models.Transaction).filter(
        models.Transaction.recurring_group_id == g.id
    ).all()
    amount_counts: dict[float, dict] = {}
    for t in group_txs:
        amt = round(abs(t.amount), 2)
        entry = amount_counts.setdefault(amt, {"amount": amt, "count": 0, "last_date": t.date})
        entry["count"] += 1
        if t.date > entry["last_date"]:
            entry["last_date"] = t.date

    out = schemas.RecurringGroupOut.model_validate(g)
    out.transaction_count = len(group_txs)
    out.amount_options = sorted(amount_counts.values(), key=lambda a: a["last_date"], reverse=True)
    return out


@router.delete("/{group_id}")
def delete_recurring(
    group_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    g = db.query(models.RecurringGroup).filter(
        models.RecurringGroup.id == group_id,
        models.RecurringGroup.user_id == current_user.id,
    ).first()
    if not g:
        raise HTTPException(404, "Grupo recurrente no encontrado")
    # Unlink transactions
    db.query(models.Transaction).filter(
        models.Transaction.recurring_group_id == group_id
    ).update({"recurring_group_id": None})
    db.delete(g)
    db.commit()
    return {"ok": True}
