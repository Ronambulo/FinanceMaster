import re
from datetime import date, timedelta
from typing import List
from sqlalchemy.orm import Session
from .. import models


def _normalize_name(name: str) -> str:
    name = name.lower().strip()
    name = re.sub(r"[^a-záéíóúüñ0-9\s]", "", name)
    name = re.sub(r"\s+", " ", name).strip()
    # Remove trailing numbers (invoice numbers, etc.)
    name = re.sub(r"\s+\d+$", "", name)
    return name


def detect_recurring(db: Session, user_id: int):
    """Scan CASH transactions and create/update RecurringGroup records."""
    cash_types = [
        "CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL",
        "TRANSFER_INSTANT_OUTBOUND", "TRANSFER_OUTBOUND",
    ]
    txs = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.user_id == user_id,
            models.Transaction.account_category == "CASH",
            models.Transaction.type.in_(cash_types),
            models.Transaction.name.isnot(None),
        )
        .order_by(models.Transaction.date)
        .all()
    )

    groups: dict[str, List[models.Transaction]] = {}
    for tx in txs:
        key = _normalize_name(tx.name or tx.description or "")
        if key:
            groups.setdefault(key, []).append(tx)

    for norm_name, group_txs in groups.items():
        if len(group_txs) < 2:
            continue

        dates = sorted(t.date for t in group_txs)
        intervals = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        avg_interval = sum(intervals) / len(intervals)

        # Accept as recurring if interval is roughly weekly (7±3), biweekly (14±4), monthly (30±7), yearly (365±30)
        period = None
        if 4 <= avg_interval <= 10:
            period = 7
        elif 10 < avg_interval <= 18:
            period = 14
        elif 23 <= avg_interval <= 37:
            period = 30
        elif 330 <= avg_interval <= 395:
            period = 365

        if period is None:
            continue

        amounts = [abs(t.amount) for t in group_txs]
        avg_amount = sum(amounts) / len(amounts)
        cv = (max(amounts) - min(amounts)) / avg_amount if avg_amount else 0
        if cv > 0.25:
            continue

        last_date = max(dates)
        next_date = last_date + timedelta(days=period)
        display_name = group_txs[-1].name or norm_name

        existing = db.query(models.RecurringGroup).filter(
            models.RecurringGroup.user_id == user_id,
            models.RecurringGroup.normalized_name == norm_name,
        ).first()

        if existing:
            if not existing.amount_is_manual:
                existing.avg_amount = avg_amount
            existing.period_days = period
            existing.next_expected_date = next_date
            existing.display_name = display_name
            for tx in group_txs:
                if tx.recurring_group_id is None:
                    tx.recurring_group_id = existing.id
        else:
            rg = models.RecurringGroup(
                user_id=user_id,
                normalized_name=norm_name,
                display_name=display_name,
                avg_amount=avg_amount,
                period_days=period,
                next_expected_date=next_date,
                is_active=True,
            )
            db.add(rg)
            db.flush()
            for tx in group_txs:
                tx.recurring_group_id = rg.id

    db.commit()
