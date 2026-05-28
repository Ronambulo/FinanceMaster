from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/budgets", tags=["budgets"])

EXPENSE_TYPES = {
    "CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL",
    "TRANSFER_INSTANT_OUTBOUND", "TRANSFER_OUTBOUND",
}


def _month_range(month_str: str):
    """'2024-01' → (date(2024,1,1), date(2024,1,31))"""
    y, m = int(month_str[:4]), int(month_str[5:7])
    start = date(y, m, 1)
    if m == 12:
        end = date(y + 1, 1, 1)
    else:
        end = date(y, m + 1, 1)
    from datetime import timedelta
    return start, end - timedelta(days=1)


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[schemas.BudgetOut])
def list_budgets(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Budget)
        .options(joinedload(models.Budget.category))
        .filter(models.Budget.user_id == current_user.id)
        .order_by(models.Budget.id)
        .all()
    )


@router.post("", response_model=schemas.BudgetOut, status_code=201)
def create_budget(
    data: schemas.BudgetCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    budget = models.Budget(user_id=current_user.id, **data.model_dump())
    db.add(budget)
    db.commit()
    db.refresh(budget)
    # reload with category
    db.refresh(budget)
    return db.query(models.Budget).options(joinedload(models.Budget.category)).filter(models.Budget.id == budget.id).first()


@router.put("/{budget_id}", response_model=schemas.BudgetOut)
def update_budget(
    budget_id: int,
    data: schemas.BudgetUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    budget = db.query(models.Budget).filter(
        models.Budget.id == budget_id,
        models.Budget.user_id == current_user.id,
    ).first()
    if not budget:
        raise HTTPException(404, "Budget not found")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(budget, k, v)
    db.commit()
    return db.query(models.Budget).options(joinedload(models.Budget.category)).filter(models.Budget.id == budget_id).first()


@router.delete("/{budget_id}", status_code=204)
def delete_budget(
    budget_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    budget = db.query(models.Budget).filter(
        models.Budget.id == budget_id,
        models.Budget.user_id == current_user.id,
    ).first()
    if not budget:
        raise HTTPException(404, "Budget not found")
    db.delete(budget)
    db.commit()


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status", response_model=List[schemas.BudgetStatus])
def budget_status(
    month: Optional[str] = Query(None, description="'2024-01'; defaults to current month"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    month_str = month or f"{today.year}-{today.month:02d}"
    start, end = _month_range(month_str)

    # Budgets that apply to this month: recurring ones + specific ones for this month
    budgets = (
        db.query(models.Budget)
        .options(joinedload(models.Budget.category))
        .filter(
            models.Budget.user_id == current_user.id,
            (models.Budget.is_recurring == True) | (models.Budget.month == month_str),
        )
        .all()
    )

    # Actual spending per category for the month (excluding excluded/internal txs)
    spending_rows = (
        db.query(
            models.Transaction.category_id,
            func.sum(func.abs(models.Transaction.amount)).label("total"),
        )
        .filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.account_category == "CASH",
            models.Transaction.is_internal_transfer == False,
            models.Transaction.exclude_from_stats == False,
            models.Transaction.type.in_(EXPENSE_TYPES),
            models.Transaction.date >= start,
            models.Transaction.date <= end,
        )
        .group_by(models.Transaction.category_id)
        .all()
    )
    spending: dict[Optional[int], float] = {row.category_id: round(row.total, 2) for row in spending_rows}

    result = []
    for b in budgets:
        cat = b.category
        spent = spending.get(b.category_id, 0.0)
        remaining = round(b.amount - spent, 2)
        pct = round((spent / b.amount) * 100, 1) if b.amount > 0 else 0.0
        result.append(schemas.BudgetStatus(
            budget_id=b.id,
            category_id=b.category_id,
            category_name=cat.name if cat else "Sin categoría",
            category_color=cat.color if cat else "#94a3b8",
            category_icon=cat.icon if cat else "💰",
            budgeted=b.amount,
            spent=spent,
            remaining=remaining,
            pct_used=pct,
        ))

    return sorted(result, key=lambda x: x.pct_used, reverse=True)
