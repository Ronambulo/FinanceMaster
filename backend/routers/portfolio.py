from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from datetime import date
from typing import Optional
from .. import models, schemas, auth
from ..database import get_db
from ..services.portfolio_calculator import calculate_portfolio

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("/performance", response_model=schemas.PortfolioPerformance)
def get_performance(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    return calculate_portfolio(db, current_user.id)


@router.get("/history", response_model=schemas.TransactionListResponse)
def get_history(
    symbol: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.Transaction)
        .options(joinedload(models.Transaction.category))
        .filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.account_category == "TRADING",
        )
    )
    if symbol:
        q = q.filter(models.Transaction.symbol == symbol)
    if date_from:
        q = q.filter(models.Transaction.date >= date_from)
    if date_to:
        q = q.filter(models.Transaction.date <= date_to)

    total = q.count()
    items = q.order_by(models.Transaction.date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return schemas.TransactionListResponse(items=items, total=total, page=page, page_size=page_size)
