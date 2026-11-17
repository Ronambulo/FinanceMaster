from datetime import date
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth, models
from ..database import get_db
from ..services import data_export as dx

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/summary")
def export_summary(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Lo que hay para exportar: meses con movimientos y número de registros por sección."""
    uid = current_user.id
    first, last = (
        db.query(func.min(models.Transaction.date), func.max(models.Transaction.date))
        .filter(models.Transaction.user_id == uid)
        .one()
    )
    months = dx.month_overview(db, uid)
    counts = {
        "transactions": sum(m["count"] for m in months),
        "budgets": db.query(models.Budget).filter_by(user_id=uid).count(),
        "recurring": db.query(models.RecurringGroup).filter_by(user_id=uid).count(),
        "debts": db.query(models.Debt).filter_by(user_id=uid).count(),
        "goals": db.query(models.Goal).filter_by(user_id=uid).count(),
        "categories": db.query(models.Category).filter(
            (models.Category.user_id == uid) | (models.Category.is_system == True)).count(),
        "rules": db.query(models.CategoryRule).filter_by(user_id=uid).count(),
        "manual_positions": db.query(models.ManualPosition).filter_by(user_id=uid).count(),
    }
    return {
        "first_date": first.isoformat() if first else None,
        "last_date": last.isoformat() if last else None,
        "months": months,
        "banks": dx.bank_overview(db, uid),
        "years": sorted({int(m["month"][:4]) for m in months}, reverse=True),
        "counts": counts,
    }


@router.get("")
def export_data(
    format: str = Query("xlsx"),
    period: str = Query("all", pattern="^(all|month|year|range)$"),
    month: Optional[str] = Query(None, description="AAAA-MM"),
    year: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sections: str = Query(",".join(dx.ALL_SECTIONS)),
    banks: str = Query("", description="Claves de banco separadas por comas; vacío = todos"),
    split_month: bool = Query(False, alias="split"),
    split_bank: bool = False,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if format not in dx.FORMATS:
        raise HTTPException(400, f"Formato no soportado. Usa: {', '.join(dx.FORMATS)}")
    try:
        p = dx.build_period(period, month, year, date_from, date_to)
    except ValueError as e:
        raise HTTPException(400, str(e))

    wanted = [s.strip() for s in sections.split(",") if s.strip()]
    unknown = [s for s in wanted if s not in dx.ALL_SECTIONS]
    if unknown:
        raise HTTPException(400, f"Secciones desconocidas: {', '.join(unknown)}")

    bank_keys = [b.strip() for b in banks.split(",") if b.strip()]
    content, filename, media_type = dx.export(db, current_user.id, format, p, wanted,
                                              split_month, split_bank, bank_keys)
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )
