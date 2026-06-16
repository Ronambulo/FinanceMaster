"""
Compute financial insights for a user based on existing transaction data.
Returns a list of dicts ready to be inserted as Insight rows.
"""
from datetime import date, timedelta
from typing import List, Dict
from sqlalchemy import func
from sqlalchemy.orm import Session
from .. import models

INCOME_TYPES = {
    "CUSTOMER_INPAYMENT", "TRANSFER_INSTANT_INBOUND", "TRANSFER_INBOUND",
    "INTEREST_PAYMENT", "DIVIDEND", "STOCKPERK",
}
EXPENSE_TYPES = {
    "CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL",
    "TRANSFER_INSTANT_OUTBOUND", "TRANSFER_OUTBOUND",
}


def _month_range(year: int, month: int):
    from datetime import date
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return start, end


def _cash_sum(db: Session, user_id: int, types, start: date, end: date) -> float:
    r = (
        db.query(func.sum(func.abs(models.Transaction.amount)))
        .filter(
            models.Transaction.user_id == user_id,
            models.Transaction.account_category == "CASH",
            models.Transaction.is_internal_transfer == False,
            models.Transaction.type.in_(types),
            models.Transaction.date >= start,
            models.Transaction.date <= end,
        )
        .scalar()
    )
    return float(r or 0.0)


def _expenses_by_cat(db: Session, user_id: int, start: date, end: date) -> Dict[int, float]:
    rows = (
        db.query(
            models.Transaction.category_id,
            func.sum(func.abs(models.Transaction.amount)),
        )
        .filter(
            models.Transaction.user_id == user_id,
            models.Transaction.account_category == "CASH",
            models.Transaction.is_internal_transfer == False,
            models.Transaction.type.in_(EXPENSE_TYPES),
            models.Transaction.date >= start,
            models.Transaction.date <= end,
        )
        .group_by(models.Transaction.category_id)
        .all()
    )
    return {cat_id: float(total) for cat_id, total in rows if cat_id is not None}


def compute_insights(db: Session, user_id: int) -> List[dict]:
    today = date.today()
    insights = []

    cur_y, cur_m = today.year, today.month
    cur_start, cur_end = _month_range(cur_y, cur_m)

    prev_m = cur_m - 1 if cur_m > 1 else 12
    prev_y = cur_y if cur_m > 1 else cur_y - 1
    prev_start, prev_end = _month_range(prev_y, prev_m)

    prev2_m = prev_m - 1 if prev_m > 1 else 12
    prev2_y = prev_y if prev_m > 1 else prev_y - 1
    prev2_start, prev2_end = _month_range(prev2_y, prev2_m)

    # ── 1. Category spike > 30% ────────────────────────────────────────────────
    cur_by_cat  = _expenses_by_cat(db, user_id, cur_start, cur_end)
    prev_by_cat = _expenses_by_cat(db, user_id, prev_start, prev_end)

    for cat_id, cur_total in cur_by_cat.items():
        prev_total = prev_by_cat.get(cat_id, 0.0)
        if prev_total > 20 and cur_total > prev_total * 1.30:
            cat = db.query(models.Category).filter(models.Category.id == cat_id).first()
            cat_name = cat.name if cat else "Sin categoría"
            pct = int((cur_total / prev_total - 1) * 100)
            insights.append({
                "type": "category_spike",
                "title": f"Gasto en {cat_name} +{pct}%",
                "message": f"Este mes has gastado {pct}% más en {cat_name} respecto al mes anterior ({cur_total:.0f}€ vs {prev_total:.0f}€).",
                "severity": "warning",
            })

    # ── 2. Negative savings rate 2+ consecutive months ─────────────────────────
    savings_by_month = []
    for s, e in [(prev2_start, prev2_end), (prev_start, prev_end)]:
        inc = _cash_sum(db, user_id, INCOME_TYPES, s, e)
        exp = _cash_sum(db, user_id, EXPENSE_TYPES, s, e)
        savings_by_month.append(inc - exp)

    if len(savings_by_month) >= 2 and all(v < 0 for v in savings_by_month):
        insights.append({
            "type": "negative_savings_streak",
            "title": "Gastas más de lo que ingresas",
            "message": "Llevas 2 meses seguidos con ahorro negativo. Revisa tus gastos fijos o busca formas de aumentar ingresos.",
            "severity": "warning",
        })

    # ── 3. Savings rate > 25% this month ──────────────────────────────────────
    cur_inc = _cash_sum(db, user_id, INCOME_TYPES, cur_start, cur_end)
    cur_exp = _cash_sum(db, user_id, EXPENSE_TYPES, cur_start, cur_end)
    if cur_inc > 0:
        savings_rate = (cur_inc - cur_exp) / cur_inc
        if savings_rate > 0.25:
            insights.append({
                "type": "high_savings_rate",
                "title": f"¡Tasa de ahorro del {savings_rate * 100:.0f}%!",
                "message": f"Estás ahorrando el {savings_rate * 100:.0f}% de tus ingresos este mes. ¡Excelente gestión!",
                "severity": "positive",
            })

    # ── 4. Recurring subscription with no manual use in 60 days ───────────────
    cutoff = today - timedelta(days=60)
    recurring = (
        db.query(models.RecurringGroup)
        .filter(
            models.RecurringGroup.user_id == user_id,
            models.RecurringGroup.is_active == True,
            models.RecurringGroup.avg_amount < -1,
        )
        .all()
    )
    for rg in recurring:
        if rg.category_id is None:
            continue
        # Check if category has any non-recurring manual transaction in last 60 days
        manual_count = (
            db.query(func.count(models.Transaction.id))
            .filter(
                models.Transaction.user_id == user_id,
                models.Transaction.category_id == rg.category_id,
                models.Transaction.date >= cutoff,
                models.Transaction.recurring_group_id == None,
            )
            .scalar()
        ) or 0
        if manual_count == 0 and rg.category and rg.category.name:
            insights.append({
                "type": "unused_subscription",
                "title": f"¿Usas {rg.display_name}?",
                "message": f"Tienes un pago recurrente de {abs(rg.avg_amount or 0):.2f}€ en {rg.display_name} pero no hay gasto manual relacionado en 60 días.",
                "severity": "info",
            })

    # ── 5. Month with ≥50% fewer transactions than previous ───────────────────
    cur_count = (
        db.query(func.count(models.Transaction.id))
        .filter(
            models.Transaction.user_id == user_id,
            models.Transaction.account_category == "CASH",
            models.Transaction.date >= cur_start,
            models.Transaction.date <= cur_end,
        )
        .scalar()
    ) or 0
    prev_count = (
        db.query(func.count(models.Transaction.id))
        .filter(
            models.Transaction.user_id == user_id,
            models.Transaction.account_category == "CASH",
            models.Transaction.date >= prev_start,
            models.Transaction.date <= prev_end,
        )
        .scalar()
    ) or 0
    if prev_count > 10 and cur_count < prev_count * 0.5:
        insights.append({
            "type": "low_data_month",
            "title": "Pocos datos este mes",
            "message": f"Este mes tienes {cur_count} transacciones frente a {prev_count} el mes pasado. ¿Falta algún extracto?",
            "severity": "info",
        })

    # ── 6. Dividend received this month ───────────────────────────────────────
    dividends = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.user_id == user_id,
            models.Transaction.type.in_({"DIVIDEND", "STOCKPERK"}),
            models.Transaction.date >= cur_start,
            models.Transaction.date <= cur_end,
        )
        .all()
    )
    if dividends:
        total_div = sum(abs(d.amount) for d in dividends)
        insights.append({
            "type": "dividend_received",
            "title": "Dividendo recibido",
            "message": f"Has recibido {total_div:.2f}€ en dividendos este mes. ¡Tu inversión trabajando para ti!",
            "severity": "positive",
        })

    # ── 7. Portfolio first time in positive ───────────────────────────────────
    from ..services.portfolio_calculator import calculate_portfolio
    try:
        perf = calculate_portfolio(db, user_id)
        if perf.total_unrealized_pnl > 0 and perf.total_unrealized_pnl < 500:
            insights.append({
                "type": "portfolio_positive",
                "title": "¡Portfolio en verde!",
                "message": f"Tu cartera acumula +{perf.total_unrealized_pnl:.2f}€ de plusvalías no realizadas. 📈",
                "severity": "positive",
            })
    except Exception:
        pass

    return insights


def refresh_insights(db: Session, user_id: int) -> None:
    """Delete old unread insights for this user and regenerate them."""
    db.query(models.Insight).filter(
        models.Insight.user_id == user_id,
        models.Insight.is_read == False,
    ).delete()
    db.commit()

    new_insights = compute_insights(db, user_id)
    for data in new_insights:
        db.add(models.Insight(user_id=user_id, **data))
    db.commit()
