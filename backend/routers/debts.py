from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/debts", tags=["debts"])


def _enrich_debt(debt: models.Debt) -> schemas.DebtOut:
    paid = sum(p.amount for p in debt.payments)
    remaining = max(0.0, debt.total_amount - paid)
    out = schemas.DebtOut.model_validate(debt)
    out.paid_amount = round(paid, 2)
    out.remaining_amount = round(remaining, 2)
    return out


@router.get("", response_model=List[schemas.DebtOut])
def list_debts(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    debts = (
        db.query(models.Debt)
        .options(joinedload(models.Debt.payments))
        .filter(models.Debt.user_id == current_user.id)
        .order_by(models.Debt.created_at.desc())
        .all()
    )
    return [_enrich_debt(d) for d in debts]


@router.post("", response_model=schemas.DebtOut)
def create_debt(
    data: schemas.DebtCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    debt = models.Debt(user_id=current_user.id, **data.model_dump())
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return _enrich_debt(debt)


@router.put("/{debt_id}", response_model=schemas.DebtOut)
def update_debt(
    debt_id: int,
    data: schemas.DebtUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    debt = db.query(models.Debt).options(joinedload(models.Debt.payments)).filter(
        models.Debt.id == debt_id,
        models.Debt.user_id == current_user.id,
    ).first()
    if not debt:
        raise HTTPException(404, "Deuda no encontrada")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(debt, k, v)
    db.commit()
    db.refresh(debt)
    return _enrich_debt(debt)


@router.delete("/{debt_id}")
def delete_debt(
    debt_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    debt = db.query(models.Debt).filter(
        models.Debt.id == debt_id,
        models.Debt.user_id == current_user.id,
    ).first()
    if not debt:
        raise HTTPException(404, "Deuda no encontrada")
    db.delete(debt)
    db.commit()
    return {"ok": True}


@router.post("/{debt_id}/payments", response_model=schemas.DebtPaymentOut)
def add_payment(
    debt_id: int,
    data: schemas.DebtPaymentCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    debt = db.query(models.Debt).filter(
        models.Debt.id == debt_id,
        models.Debt.user_id == current_user.id,
    ).first()
    if not debt:
        raise HTTPException(404, "Deuda no encontrada")
    payment = models.DebtPayment(debt_id=debt_id, **data.model_dump())
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/{debt_id}/payments/{payment_id}")
def delete_payment(
    debt_id: int,
    payment_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    debt = db.query(models.Debt).filter(
        models.Debt.id == debt_id,
        models.Debt.user_id == current_user.id,
    ).first()
    if not debt:
        raise HTTPException(404, "Deuda no encontrada")
    payment = db.query(models.DebtPayment).filter(
        models.DebtPayment.id == payment_id,
        models.DebtPayment.debt_id == debt_id,
    ).first()
    if not payment:
        raise HTTPException(404, "Pago no encontrado")
    db.delete(payment)
    db.commit()
    return {"ok": True}
