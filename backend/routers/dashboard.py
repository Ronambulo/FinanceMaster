from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, extract
from sqlalchemy.orm import Session, joinedload
from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

INCOME_TYPES = {
    "CUSTOMER_INPAYMENT", "TRANSFER_INSTANT_INBOUND", "TRANSFER_INBOUND",
    "INTEREST_PAYMENT", "DIVIDEND", "STOCKPERK",
}
EXPENSE_TYPES = {
    "CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL",
    "TRANSFER_INSTANT_OUTBOUND", "TRANSFER_OUTBOUND",
}
INTEREST_TYPES = {"INTEREST_PAYMENT"}


def _month_range(year: int, month: int):
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return start, end


@router.get("/overview", response_model=schemas.DashboardOverview)
def overview(
    year: Optional[int] = None,
    month: Optional[int] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    y = year or today.year
    m = month or today.month
    start, end = _month_range(y, m)

    cash_txs = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id,
        models.Transaction.account_category == "CASH",
        models.Transaction.is_internal_transfer == False,
    )

    def _sum(q, types, start_d=None, end_d=None):
        qq = q.filter(models.Transaction.type.in_(types))
        if start_d:
            qq = qq.filter(models.Transaction.date >= start_d, models.Transaction.date <= end_d)
        result = qq.with_entities(func.sum(func.abs(models.Transaction.amount))).scalar()
        return round(result or 0.0, 2)

    income_month = _sum(cash_txs, INCOME_TYPES, start, end)
    expenses_month = _sum(cash_txs, EXPENSE_TYPES, start, end)
    savings_month = round(income_month - expenses_month, 2)
    income_total = _sum(cash_txs, INCOME_TYPES)
    expenses_total = _sum(cash_txs, EXPENSE_TYPES)
    interest_month = _sum(cash_txs, INTEREST_TYPES, start, end)
    interest_total = _sum(cash_txs, INTEREST_TYPES)

    # Real cash balance = sum of ALL signed amounts (CASH + TRADING BUY/SELL affect the cash account)
    balance_raw = db.query(func.sum(models.Transaction.amount)).filter(
        models.Transaction.user_id == current_user.id
    ).scalar()
    balance = round(balance_raw or 0.0, 2)

    return schemas.DashboardOverview(
        balance=balance,
        income_month=income_month,
        expenses_month=expenses_month,
        savings_month=savings_month,
        income_total=income_total,
        expenses_total=expenses_total,
        interest_month=interest_month,
        interest_total=interest_total,
    )


@router.get("/by-category", response_model=List[schemas.CategoryBreakdown])
def by_category(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    tx_type: str = Query("expense", description="income or expense"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    start = date_from or date(today.year, today.month, 1)
    end = date_to or today

    types = INCOME_TYPES if tx_type == "income" else EXPENSE_TYPES

    q = (
        db.query(
            models.Transaction.category_id,
            func.sum(func.abs(models.Transaction.amount)).label("total"),
            func.count(models.Transaction.id).label("cnt"),
        )
        .filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.account_category == "CASH",
            models.Transaction.is_internal_transfer == False,
            models.Transaction.type.in_(types),
            models.Transaction.date >= start,
            models.Transaction.date <= end,
        )
        .group_by(models.Transaction.category_id)
        .order_by(func.sum(func.abs(models.Transaction.amount)).desc())
        .all()
    )

    result = []
    for cat_id, total, cnt in q:
        cat = db.query(models.Category).filter(models.Category.id == cat_id).first() if cat_id else None
        result.append(schemas.CategoryBreakdown(
            category_id=cat_id,
            category_name=cat.name if cat else "Sin categoría",
            category_color=cat.color if cat else "#94a3b8",
            category_icon=cat.icon if cat else "❓",
            total=round(total, 2),
            count=cnt,
        ))
    return result


@router.get("/monthly-trend", response_model=List[schemas.MonthlyTrend])
def monthly_trend(
    months: int = Query(12, ge=1, le=36),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    result = []

    for i in range(months - 1, -1, -1):
        month = today.month - i
        year = today.year
        while month <= 0:
            month += 12
            year -= 1

        start, end = _month_range(year, month)

        def _m_sum(types):
            r = (
                db.query(func.sum(func.abs(models.Transaction.amount)))
                .filter(
                    models.Transaction.user_id == current_user.id,
                    models.Transaction.account_category == "CASH",
                    models.Transaction.is_internal_transfer == False,
                    models.Transaction.type.in_(types),
                    models.Transaction.date >= start,
                    models.Transaction.date <= end,
                )
                .scalar()
            )
            return round(r or 0.0, 2)

        inc = _m_sum(INCOME_TYPES)
        exp = _m_sum(EXPENSE_TYPES)
        result.append(schemas.MonthlyTrend(
            month=f"{year}-{month:02d}",
            income=inc,
            expenses=exp,
            savings=round(inc - exp, 2),
        ))

    return result


@router.get("/upcoming", response_model=List[schemas.UpcomingRecurring])
def upcoming_recurring(
    days: int = Query(30, ge=1, le=90),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    from sqlalchemy.orm import joinedload
    today = date.today()
    cutoff = today + timedelta(days=days)

    groups = (
        db.query(models.RecurringGroup)
        .options(joinedload(models.RecurringGroup.category))
        .filter(
            models.RecurringGroup.user_id == current_user.id,
            models.RecurringGroup.is_active == True,
            models.RecurringGroup.next_expected_date <= cutoff,
        )
        .order_by(models.RecurringGroup.next_expected_date)
        .all()
    )

    result = []
    for g in groups:
        days_until = (g.next_expected_date - today).days if g.next_expected_date else None
        result.append(schemas.UpcomingRecurring(
            id=g.id,
            display_name=g.display_name,
            avg_amount=round(g.avg_amount or 0.0, 2),
            next_expected_date=g.next_expected_date,
            days_until=days_until,
            category=schemas.CategoryOut.model_validate(g.category) if g.category else None,
        ))
    return result


@router.get("/monthly-detail", response_model=List[schemas.MonthlyDetailRow])
def monthly_detail(
    year: Optional[int] = None,
    month: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """All cash expense/income transactions for a given period, with exclude_from_stats flag."""
    if date_from and date_to:
        start, end = date_from, date_to
    else:
        today = date.today()
        y = year or today.year
        m = month or today.month
        start, end = _month_range(y, m)

    txs = (
        db.query(models.Transaction)
        .options(joinedload(models.Transaction.category))
        .filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.account_category == "CASH",
            models.Transaction.is_internal_transfer == False,
            models.Transaction.date >= start,
            models.Transaction.date <= end,
        )
        .order_by(models.Transaction.date.desc())
        .all()
    )

    return [
        schemas.MonthlyDetailRow(
            id=tx.id,
            date=tx.date,
            name=tx.name or tx.description or tx.type,
            category_id=tx.category_id,
            category_name=tx.category.name if tx.category else "Sin categoría",
            category_color=tx.category.color if tx.category else "#94a3b8",
            category_icon=tx.category.icon if tx.category else "❓",
            amount=tx.amount,
            exclude_from_stats=tx.exclude_from_stats or False,
        )
        for tx in txs
    ]
