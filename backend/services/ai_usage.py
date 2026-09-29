import os
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import models

# Precio opcional por 1000 tokens (input+output), configurable por entorno.
# Por defecto 0 porque el modelo se sirve en local — si algún día se enruta
# tráfico a un proveedor de pago, se puede fijar aquí sin tocar código.
COST_PER_1K_TOKENS = float(os.environ.get("AI_COST_PER_1K_TOKENS", "0") or 0)


def record_usage(
    db: Session,
    user_id: int,
    model: Optional[str],
    endpoint: str,
    input_tokens: int,
    output_tokens: int,
) -> None:
    input_tokens = input_tokens or 0
    output_tokens = output_tokens or 0
    if not input_tokens and not output_tokens:
        return
    db.add(models.AiUsageLog(
        user_id=user_id,
        model=model,
        endpoint=endpoint,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
    ))
    db.commit()


def _cost(tokens: int) -> float:
    return round(tokens / 1000 * COST_PER_1K_TOKENS, 4)


def usage_summary(db: Session, user_id: int, months: int = 12) -> dict:
    totals_row = (
        db.query(
            func.count(models.AiUsageLog.id),
            func.coalesce(func.sum(models.AiUsageLog.input_tokens), 0),
            func.coalesce(func.sum(models.AiUsageLog.output_tokens), 0),
        )
        .filter(models.AiUsageLog.user_id == user_id)
        .first()
    )
    total_requests, total_input, total_output = totals_row
    total_input = int(total_input or 0)
    total_output = int(total_output or 0)
    total_tokens = total_input + total_output

    month_col = func.strftime("%Y-%m", models.AiUsageLog.created_at)
    rows = (
        db.query(
            month_col.label("month"),
            func.count(models.AiUsageLog.id).label("requests"),
            func.coalesce(func.sum(models.AiUsageLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(models.AiUsageLog.output_tokens), 0).label("output_tokens"),
        )
        .filter(models.AiUsageLog.user_id == user_id)
        .group_by(month_col)
        .order_by(month_col.desc())
        .limit(months)
        .all()
    )

    months_out = [
        {
            "month": r.month,
            "requests": r.requests,
            "input_tokens": int(r.input_tokens),
            "output_tokens": int(r.output_tokens),
            "total_tokens": int(r.input_tokens) + int(r.output_tokens),
            "estimated_cost": _cost(int(r.input_tokens) + int(r.output_tokens)),
        }
        for r in rows
    ]
    months_out.reverse()

    return {
        "months": months_out,
        "total_requests": int(total_requests or 0),
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_tokens": total_tokens,
        "total_estimated_cost": _cost(total_tokens),
        "cost_per_1k_tokens": COST_PER_1K_TOKENS,
    }


def global_usage_summary(db: Session, months: int = 6) -> dict:
    """Igual que usage_summary pero agregado entre todos los usuarios —
    para el panel de administración (sin desglosar por usuario)."""
    totals_row = db.query(
        func.count(models.AiUsageLog.id),
        func.coalesce(func.sum(models.AiUsageLog.input_tokens), 0),
        func.coalesce(func.sum(models.AiUsageLog.output_tokens), 0),
    ).first()
    total_requests, total_input, total_output = totals_row
    total_tokens = int(total_input or 0) + int(total_output or 0)

    month_col = func.strftime("%Y-%m", models.AiUsageLog.created_at)
    rows = (
        db.query(
            month_col.label("month"),
            func.count(models.AiUsageLog.id).label("requests"),
            func.coalesce(func.sum(models.AiUsageLog.input_tokens), 0).label("input_tokens"),
            func.coalesce(func.sum(models.AiUsageLog.output_tokens), 0).label("output_tokens"),
        )
        .group_by(month_col)
        .order_by(month_col.desc())
        .limit(months)
        .all()
    )
    months_out = [
        {
            "month": r.month,
            "requests": r.requests,
            "total_tokens": int(r.input_tokens) + int(r.output_tokens),
            "estimated_cost": _cost(int(r.input_tokens) + int(r.output_tokens)),
        }
        for r in rows
    ]
    months_out.reverse()

    return {
        "months": months_out,
        "total_requests": int(total_requests or 0),
        "total_tokens": total_tokens,
        "total_estimated_cost": _cost(total_tokens),
        "cost_per_1k_tokens": COST_PER_1K_TOKENS,
    }
