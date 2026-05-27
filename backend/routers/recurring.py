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
        count = db.query(models.Transaction).filter(
            models.Transaction.recurring_group_id == g.id
        ).count()
        out = schemas.RecurringGroupOut.model_validate(g)
        out.transaction_count = count
        result.append(out)
    return result


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
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(g, k, v)
    db.commit()
    db.refresh(g)
    return g


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
