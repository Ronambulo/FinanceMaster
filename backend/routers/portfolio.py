import asyncio
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException, Header
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import distinct
from datetime import date
from .. import models, schemas, auth
from ..database import get_db
from ..services.portfolio_calculator import calculate_portfolio, _get_yahoo_price_in_eur

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("/live", response_model=schemas.PortfolioPerformance)
async def get_live_portfolio(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Fetch portfolio positions directly from TR's portfolio WebSocket.
    Falls back to calculated portfolio if TR is not connected.
    """
    from ..services.trade_republic_api import get_client, TRConnectionError
    from ..services.portfolio_calculator import calculate_portfolio, _get_yahoo_price_in_eur

    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a Trade Republic")

    import logging
    log = logging.getLogger(__name__)

    try:
        portfolio = await client.get_portfolio_positions()
    except TRConnectionError as e:
        raise HTTPException(503, str(e))

    log.info("TR portfolio raw response keys: %s", list(portfolio.keys()) if isinstance(portfolio, dict) else type(portfolio).__name__)
    log.info("TR portfolio raw: %s", str(portfolio)[:2000])

    # TR may return positions under different keys
    raw_positions = (
        portfolio.get("positions")
        or portfolio.get("items")
        or portfolio.get("portfolio")
        or (portfolio if isinstance(portfolio, list) else [])
    )

    # Build a name lookup from DB transactions (ISIN → name)
    name_lookup: dict[str, str] = {}
    txs = db.query(models.Transaction.symbol, models.Transaction.name).filter(
        models.Transaction.user_id == current_user.id,
        models.Transaction.symbol.isnot(None),
        models.Transaction.name.isnot(None),
    ).distinct().all()
    for sym, name in txs:
        if sym and name:
            name_lookup[sym] = name

    positions_out = []
    total_invested = 0.0
    total_market_value = 0.0
    total_unrealized_pnl = 0.0

    for pos in raw_positions:
        isin = pos.get("instrumentId") or pos.get("isin") or pos.get("id")
        if not isin:
            continue

        # netSize may be a string like "1.500000" or a number
        try:
            shares = float(str(pos.get("netSize") or pos.get("quantity") or "0").replace(",", "."))
        except (ValueError, TypeError):
            shares = 0.0

        if shares <= 0.0001:
            continue

        # Average buy-in from TR
        try:
            avg_buy = float(str(pos.get("averageBuyIn") or "0").replace(",", "."))
        except (ValueError, TypeError):
            avg_buy = 0.0

        # Invested value from TR (most accurate)
        try:
            invested = float(str(pos.get("investedValue") or pos.get("purchaseValue") or "0").replace(",", "."))
        except (ValueError, TypeError):
            invested = avg_buy * shares

        if invested <= 0:
            invested = avg_buy * shares

        # Current market value from TR
        try:
            market_value = float(str(pos.get("currentValue") or "0").replace(",", "."))
        except (ValueError, TypeError):
            market_value = 0.0

        # Current price: prefer TR's value, fall back to Yahoo
        current_price: Optional[float] = None
        if market_value > 0 and shares > 0:
            current_price = round(market_value / shares, 4)
        else:
            current_price = _get_yahoo_price_in_eur(isin)
            if current_price:
                market_value = round(shares * current_price, 2)

        unrealized_pnl = round(market_value - invested, 2) if market_value > 0 else None
        unrealized_pnl_pct = round((unrealized_pnl / invested) * 100, 2) if (unrealized_pnl is not None and invested > 0) else None

        name = name_lookup.get(isin) or pos.get("name") or isin

        positions_out.append(schemas.PortfolioPosition(
            symbol=isin,
            name=name,
            asset_class=pos.get("asset_class") or "STOCK",
            shares=round(shares, 6),
            avg_buy_price=round(avg_buy, 4),
            total_invested=round(invested, 2),
            realized_pnl=0.0,
            dividends_received=0.0,
            current_price=current_price,
            market_value=round(market_value, 2) if market_value else None,
            unrealized_pnl=unrealized_pnl,
            unrealized_pnl_pct=unrealized_pnl_pct,
        ))

        total_invested += invested
        if market_value:
            total_market_value += market_value
            total_unrealized_pnl += unrealized_pnl or 0

    positions_out.sort(key=lambda p: p.total_invested, reverse=True)

    return schemas.PortfolioPerformance(
        total_invested=round(total_invested, 2),
        total_realized_pnl=0.0,
        total_fees=0.0,
        total_dividends=0.0,
        total_market_value=round(total_market_value, 2),
        total_unrealized_pnl=round(total_unrealized_pnl, 2),
        positions=positions_out,
        dividends_by_asset=[],
    )


@router.post("/estimate-shares")
async def estimate_shares(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Estimate missing shares from Yahoo Finance historical prices."""
    from ..services.portfolio_calculator import estimate_shares_from_amount
    result = estimate_shares_from_amount(db, current_user.id)
    return result


@router.get("/debug-tr-raw")
async def debug_tr_raw(
    current_user: models.User = Depends(auth.get_current_user),
):
    """Debug: return raw TR portfolio WebSocket response."""
    from ..services.trade_republic_api import get_client, TRConnectionError
    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a Trade Republic")
    try:
        portfolio = await client.get_portfolio_positions()
        compact = await client.get_compact_portfolio()
        return {"portfolio": portfolio, "compact": compact}
    except TRConnectionError as e:
        raise HTTPException(503, str(e))


@router.get("/debug-trades")
def debug_trades(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Debug endpoint: show all trading transactions"""
    trades = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id,
        models.Transaction.account_category.in_(["TRADING", "SECURITIES"]),
    ).all()
    return {
        "count": len(trades),
        "trades": [
            {
                "id": t.id,
                "date": str(t.date),
                "type": t.type,
                "symbol": t.symbol,
                "name": t.name,
                "shares": t.shares,
                "amount": t.amount,
                "account_category": t.account_category,
            }
            for t in trades
        ],
    }


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
            models.Transaction.account_category.in_(["TRADING", "SECURITIES"]),
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
    symbols: str = Query(..., description="Comma-separated ISIN codes"),
    period: str = Query("1y", description="yfinance period: 1mo,3mo,6mo,1y,2y,5y"),
    current_user: models.User = Depends(auth.get_current_user),
):
    try:
        import yfinance as yf
    except ImportError:
        raise HTTPException(500, "yfinance not installed")

    from ..services.portfolio_calculator import ISIN_TO_YAHOO

    valid_periods = {"1mo", "3mo", "6mo", "1y", "2y", "5y"}
    if period not in valid_periods:
        period = "1y"

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(400, "No symbols provided")

    result: List[schemas.PriceHistory] = []
    for isin in symbol_list[:10]:
        entry = ISIN_TO_YAHOO.get(isin)

        # Try fallback ticker formats if not found
        if entry is None:
            for suffix in ['.DE', '.MC', '.AS', '.PA', '.BR', '.MI']:
                entry = ISIN_TO_YAHOO.get(isin + suffix)
                if entry is not None:
                    break

        # Last fallback: use ISIN directly
        if entry is None:
            entry = isin

        if entry is None:
            result.append(schemas.PriceHistory(symbol=isin, points=[]))
            continue

        yahoo_ticker = entry if isinstance(entry, str) else entry[0]

        try:
            ticker = yf.Ticker(yahoo_ticker)
            hist = ticker.history(period=period)
            if hist.empty:
                result.append(schemas.PriceHistory(symbol=isin, points=[]))
                continue
            import math
            points = [
                schemas.PricePoint(date=str(idx.date()), close=round(float(row["Close"]), 4))
                for idx, row in hist.iterrows()
                if not math.isnan(float(row["Close"]))
            ]
            # Return with the original ISIN so the frontend can match by position symbol
            result.append(schemas.PriceHistory(symbol=isin, points=points))
        except Exception:
            result.append(schemas.PriceHistory(symbol=isin, points=[]))

    return result


@router.get("/stream-prices")
async def stream_prices(
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Server-Sent Events endpoint that pushes current prices every 60 s.
    Accepts auth via Bearer header OR ?token=<jwt> query param (needed for EventSource).
    """
    # Resolve token from header or query param
    raw_token = None
    if authorization and authorization.startswith("Bearer "):
        raw_token = authorization[7:]
    elif token:
        raw_token = token

    if not raw_token:
        from fastapi import HTTPException
        raise HTTPException(401, "Not authenticated")

    try:
        current_user = auth.get_user_from_token(raw_token, db)
    except Exception:
        raise HTTPException(401, "Invalid token")

    # Resolve all symbols for this user
    symbols = [
        s for (s,) in db.query(distinct(models.Transaction.symbol)).filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.account_category.in_(["TRADING", "SECURITIES"]),
            models.Transaction.symbol != None,
        ).all()
    ]

    async def event_gen():
        try:
            while True:
                prices = {}
                for sym in symbols:
                    price = await asyncio.get_event_loop().run_in_executor(
                        None, _get_yahoo_price_in_eur, sym
                    )
                    if price is not None:
                        prices[sym] = price

                payload = json.dumps({"prices": prices, "ts": asyncio.get_event_loop().time()})
                yield f"data: {payload}\n\n"
                await asyncio.sleep(60)
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
