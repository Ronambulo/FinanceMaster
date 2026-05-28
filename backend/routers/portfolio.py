from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload
from datetime import date
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


@router.get("/price-history", response_model=List[schemas.PriceHistory])
def price_history(
    symbols: str = Query(..., description="Comma-separated ticker symbols, e.g. AAPL,MSFT"),
    period: str = Query("1y", description="yfinance period: 1mo,3mo,6mo,1y,2y,5y"),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Fetch OHLCV close prices from Yahoo Finance for given symbols."""
    try:
        import yfinance as yf
    except ImportError:
        raise HTTPException(500, "yfinance not installed")

    valid_periods = {"1mo", "3mo", "6mo", "1y", "2y", "5y"}
    if period not in valid_periods:
        period = "1y"

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(400, "No symbols provided")

    result: List[schemas.PriceHistory] = []
    for sym in symbol_list[:10]:  # cap at 10 tickers
        try:
            ticker = yf.Ticker(sym)
            hist = ticker.history(period=period)
            if hist.empty:
                result.append(schemas.PriceHistory(symbol=sym, points=[]))
                continue
            points = [
                schemas.PricePoint(date=str(idx.date()), close=round(float(row["Close"]), 4))
                for idx, row in hist.iterrows()
            ]
            result.append(schemas.PriceHistory(symbol=sym, points=points))
        except Exception:
            result.append(schemas.PriceHistory(symbol=sym, points=[]))

    return result
