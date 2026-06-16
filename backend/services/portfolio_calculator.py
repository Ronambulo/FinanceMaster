import time
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from .. import models
from ..schemas import PortfolioPosition, PortfolioDividend, PortfolioPerformance

# ISIN → (Yahoo Finance ticker, currency of that ticker)
# EUR-denominated tickers: .AS (Euronext Amsterdam), .DE (XETRA), .MC (Madrid)
# USD-denominated tickers: plain US symbols on NASDAQ/NYSE
ISIN_TO_YAHOO: Dict[str, Optional[tuple]] = {
    "US8740541094": ("TTWO",    "USD"),   # Take-Two Interactive
    "IE00B4L5Y983": ("IWDA.AS", "EUR"),   # iShares Core MSCI World (Euronext Amsterdam)
    "IE00B5BMR087": ("SXR8.DE", "EUR"),   # iShares Core S&P 500 (Frankfurt XETRA)
    "US0378331005": ("AAPL",    "USD"),   # Apple
    "US0231351067": ("AMZN",    "USD"),   # Amazon
    "US5949181045": ("MSFT",    "USD"),   # Microsoft
    "US61174X1090": ("MNST",    "USD"),   # Monster Beverage
    "DE000FD0F1S2": None,                 # Best Turbo Gold (expired derivative)
}

# Fuzzy name → (Yahoo ticker, currency) for assets without ISIN in DB
NAME_TO_YAHOO: Dict[str, Optional[tuple]] = {
    "take-two interactive":          ("TTWO",    "USD"),
    "take two interactive":          ("TTWO",    "USD"),
    "core s&p 500 usd (acc)":        ("SXR8.DE", "EUR"),
    "core s&p 500":                  ("SXR8.DE", "EUR"),
    "ishares core s&p 500":          ("SXR8.DE", "EUR"),
    "core msci world usd (acc)":     ("IWDA.AS", "EUR"),
    "core msci world":               ("IWDA.AS", "EUR"),
    "ishares core msci world":       ("IWDA.AS", "EUR"),
    "apple":                         ("AAPL",    "USD"),
    "apple inc":                     ("AAPL",    "USD"),
    "amazon.com":                    ("AMZN",    "USD"),
    "amazon":                        ("AMZN",    "USD"),
    "microsoft":                     ("MSFT",    "USD"),
    "monster beverage":              ("MNST",    "USD"),
}


def _ticker_for_name(name: str) -> Optional[tuple]:
    """Return (yahoo_ticker, currency) for a known asset name, or None."""
    key = name.strip().lower()
    # Exact match first
    if key in NAME_TO_YAHOO:
        return NAME_TO_YAHOO[key]
    # Prefix match
    for k, v in NAME_TO_YAHOO.items():
        if key.startswith(k) or k.startswith(key):
            return v
    return None


def get_historical_price_eur(ticker: str, currency: str, date_str: str) -> Optional[float]:
    """Fetch closing price on a specific date and convert to EUR."""
    try:
        import yfinance as yf
        from datetime import datetime, timedelta
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        # Fetch a small window around the date to handle weekends/holidays
        start = (dt - timedelta(days=4)).strftime("%Y-%m-%d")
        end   = (dt + timedelta(days=2)).strftime("%Y-%m-%d")
        hist = yf.Ticker(ticker).history(start=start, end=end)
        if hist.empty:
            return None
        # Pick the closest date ≤ requested date
        hist.index = hist.index.tz_localize(None)
        target = dt
        candidates = hist[hist.index <= target]
        if candidates.empty:
            candidates = hist
        price = float(candidates["Close"].iloc[-1])
        return _to_eur(price, currency)
    except Exception:
        return None


def estimate_shares_from_amount(db: Session, user_id: int) -> dict:
    """
    For all BUY/SELL transactions with shares=null, estimate shares using
    historical Yahoo Finance prices: shares ≈ abs(amount) / price_on_date.
    Also populates the symbol (ISIN key) from the name lookup.
    Returns {"estimated": N, "skipped": M}.
    """
    from sqlalchemy import and_
    txs = db.query(models.Transaction).filter(
        and_(
            models.Transaction.user_id == user_id,
            models.Transaction.type.in_(["BUY", "SELL"]),
            models.Transaction.shares.is_(None),
        )
    ).all()

    estimated = 0
    skipped = 0
    for tx in txs:
        # Try ISIN lookup first
        entry = ISIN_TO_YAHOO.get(tx.symbol or "") if tx.symbol else None
        # Fall back to name lookup
        if entry is None and tx.name:
            entry = _ticker_for_name(tx.name)
        if entry is None:
            skipped += 1
            continue

        ticker, currency = entry
        if ticker is None:
            skipped += 1
            continue

        date_str = str(tx.date)
        price_eur = get_historical_price_eur(ticker, currency, date_str)
        if not price_eur or price_eur <= 0:
            skipped += 1
            continue

        # Amount is already in EUR (TR stores in EUR)
        shares = round(abs(tx.amount) / price_eur, 6)
        if shares > 0:
            tx.shares = shares
            # Also store the yahoo ticker as symbol if no ISIN
            if not tx.symbol:
                tx.symbol = ticker
            estimated += 1

    db.commit()
    return {"estimated": estimated, "skipped": skipped}

_price_cache: Dict[str, tuple] = {}  # symbol → (price, currency, timestamp)
_fx_cache: Dict[str, tuple] = {}     # pair → (rate, timestamp)
_CACHE_TTL = 300  # 5 minutes


def _get_usd_eur_rate() -> float:
    """Fetch current USD→EUR exchange rate from Yahoo Finance, with caching."""
    key = "USDEUR"
    now = time.time()
    if key in _fx_cache:
        rate, ts = _fx_cache[key]
        if now - ts < _CACHE_TTL:
            return rate

    try:
        import yfinance as yf
        tk = yf.Ticker("EURUSD=X")
        eur_usd = None
        try:
            eur_usd = tk.fast_info.last_price
        except Exception:
            pass
        if not eur_usd:
            info = tk.info
            eur_usd = info.get("regularMarketPrice") or info.get("previousClose")

        if eur_usd and float(eur_usd) > 0:
            usd_to_eur = round(1.0 / float(eur_usd), 6)
            _fx_cache[key] = (usd_to_eur, now)
            return usd_to_eur
    except Exception:
        pass

    # Fallback: approximate rate if Yahoo is unavailable
    return 0.92


def _get_yahoo_price_in_eur(isin: str) -> Optional[float]:
    """
    Returns the current price in EUR for the given ISIN.
    Automatically converts from USD if the ticker trades in USD.
    If ISIN not in map, try replacing : with . for Euronext format (e.g., DE0005933931 → DE0005933931.DE).
    """
    entry = ISIN_TO_YAHOO.get(isin)
    if entry is None:
        # Try Euronext ticker: ISIN → ISIN.DE (XETRA), .MC (Madrid), .AS (Amsterdam)
        for suffix in ['.DE', '.MC', '.AS', '.PA', '.BR', '.MI']:
            entry = ISIN_TO_YAHOO.get(isin + suffix)
            if entry is not None:
                break
    # Last fallback: use isin as-is, assume EUR
    if entry is None:
        entry = isin

    # Handle None (expired/unknown instruments)
    if entry is None:
        return None

    # If entry is a plain string (no explicit currency mapping), treat as EUR ticker
    if isinstance(entry, str):
        ticker_sym = entry
        ticker_currency = "EUR"
    else:
        ticker_sym, ticker_currency = entry

    now = time.time()
    cache_key = ticker_sym
    if cache_key in _price_cache:
        price, currency, ts = _price_cache[cache_key]
        if now - ts < _CACHE_TTL:
            return _to_eur(price, currency)

    try:
        import yfinance as yf
        tk = yf.Ticker(ticker_sym)

        price = None
        try:
            price = tk.fast_info.last_price
        except Exception:
            pass

        detected_currency = None
        try:
            detected_currency = tk.fast_info.currency
        except Exception:
            pass

        if not price or not detected_currency:
            info = tk.info
            if not price:
                price = (
                    info.get("regularMarketPrice")
                    or info.get("currentPrice")
                    or info.get("previousClose")
                )
            if not detected_currency:
                detected_currency = info.get("currency")

        if detected_currency:
            ticker_currency = detected_currency.upper()

        if price:
            result = round(float(price), 4)
            _price_cache[cache_key] = (result, ticker_currency, now)
            return _to_eur(result, ticker_currency)
        return None
    except Exception:
        return None


def _to_eur(price: float, currency: str) -> float:
    """Convert price to EUR if it's in another currency."""
    if currency == "EUR":
        return price
    if currency == "USD":
        return round(price * _get_usd_eur_rate(), 4)
    # Add more currencies here if needed (GBp, CHF, etc.)
    return price


def _amount_to_eur(amount: float, tx_currency: Optional[str]) -> float:
    """Convert a transaction amount to EUR using the transaction's stored currency."""
    currency = (tx_currency or "EUR").upper()
    return _to_eur(amount, currency)


def calculate_portfolio(db: Session, user_id: int) -> PortfolioPerformance:
    trading_txs = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.user_id == user_id,
            models.Transaction.account_category.in_(["TRADING", "SECURITIES"]),
        )
        .order_by(models.Transaction.datetime)
        .all()
    )

    # Build name→ISIN map from transactions that have both, so symbol-less
    # transactions for the same instrument land in the same position bucket.
    name_to_sym: Dict[str, str] = {}
    for tx in trading_txs:
        if tx.symbol and tx.name:
            name_to_sym[tx.name.lower()] = tx.symbol

    positions: Dict[str, dict] = {}
    dividends: Dict[str, dict] = {}
    total_fees = 0.0
    total_dividends = 0.0

    for tx in trading_txs:
        sym = tx.symbol or name_to_sym.get((tx.name or "").lower()) or tx.name or "UNKNOWN"
        # Convert fee and amount to EUR using the transaction's stored currency
        fee_eur = _amount_to_eur(abs(tx.fee or 0.0), tx.currency)
        amount_eur = _amount_to_eur(abs(tx.amount), tx.currency)
        total_fees += fee_eur

        if tx.type == "BUY":
            if sym not in positions:
                positions[sym] = {
                    "symbol": sym,
                    "name": tx.name or sym,
                    "asset_class": tx.asset_class or "STOCK",
                    "shares": 0.0,
                    "total_cost": 0.0,
                    "realized_pnl": 0.0,
                    "first_buy_date": str(tx.date) if tx.date else None,
                    "buy_dates": [],
                }
            pos = positions[sym]
            if tx.date:
                pos["buy_dates"].append(str(tx.date))
            bought = abs(tx.shares or 0.0)
            cost = amount_eur + fee_eur  # cost basis in EUR
            pos["shares"] += bought
            pos["total_cost"] += cost
            pos["shares_known"] = pos.get("shares_known", True) and tx.shares is not None

        elif tx.type == "SELL":
            if sym not in positions:
                positions[sym] = {
                    "symbol": sym,
                    "name": tx.name or sym,
                    "asset_class": tx.asset_class or "STOCK",
                    "shares": 0.0,
                    "total_cost": 0.0,
                    "realized_pnl": 0.0,
                    "first_buy_date": None,
                    "buy_dates": [],
                }
            pos = positions[sym]
            sold = abs(tx.shares or 0.0)
            proceeds = amount_eur - fee_eur  # proceeds in EUR
            if pos["shares"] > 0:
                avg_cost_per_share = pos["total_cost"] / pos["shares"]
                cost_basis = avg_cost_per_share * sold
                pnl = proceeds - cost_basis
                pos["realized_pnl"] += pnl
                pos["total_cost"] -= cost_basis
                pos["shares"] -= sold
                if pos["shares"] < 0.0001:
                    pos["shares"] = 0.0
                    pos["total_cost"] = 0.0

        elif tx.type in ("DIVIDEND", "STOCKPERK"):
            total_dividends += amount_eur  # dividend amount in EUR
            if sym not in dividends:
                dividends[sym] = {"symbol": sym, "name": tx.name or sym, "total": 0.0, "count": 0}
            dividends[sym]["total"] += amount_eur
            dividends[sym]["count"] += 1

    result_positions = []
    total_invested = 0.0
    total_realized_pnl = 0.0
    total_market_value = 0.0
    total_unrealized_pnl = 0.0

    for sym, pos in positions.items():
        shares = pos["shares"]
        total_cost = pos["total_cost"]
        avg_price = total_cost / shares if shares > 0.0001 else 0.0

        current_price: Optional[float] = None
        market_value: Optional[float] = None
        unrealized_pnl: Optional[float] = None
        unrealized_pnl_pct: Optional[float] = None

        if shares > 0.0001:
            # current_price is already in EUR (converted inside _get_yahoo_price_in_eur)
            current_price = _get_yahoo_price_in_eur(sym)
            if current_price is not None:
                market_value = round(shares * current_price, 2)
                unrealized_pnl = round(market_value - total_cost, 2)
                unrealized_pnl_pct = round((unrealized_pnl / total_cost) * 100, 2) if total_cost > 0 else 0.0
                total_market_value += market_value
                total_unrealized_pnl += unrealized_pnl

        result_positions.append(PortfolioPosition(
            symbol=sym,
            name=pos["name"],
            asset_class=pos["asset_class"],
            shares=round(shares, 6),
            avg_buy_price=round(avg_price, 4),
            total_invested=round(total_cost, 2),
            realized_pnl=round(pos["realized_pnl"], 2),
            dividends_received=round(dividends.get(sym, {}).get("total", 0.0), 2),
            first_purchase_date=pos.get("first_buy_date"),
            buy_dates=pos.get("buy_dates", []),
            current_price=current_price,
            market_value=market_value,
            unrealized_pnl=unrealized_pnl,
            unrealized_pnl_pct=unrealized_pnl_pct,
        ))
        if shares > 0.0001:
            total_invested += total_cost
        total_realized_pnl += pos["realized_pnl"]

    result_positions.sort(key=lambda p: p.total_invested, reverse=True)

    div_list = [
        PortfolioDividend(**d) for d in sorted(dividends.values(), key=lambda x: x["total"], reverse=True)
    ]

    return PortfolioPerformance(
        total_invested=round(total_invested, 2),
        total_realized_pnl=round(total_realized_pnl, 2),
        total_fees=round(total_fees, 2),
        total_dividends=round(total_dividends, 2),
        total_market_value=round(total_market_value, 2),
        total_unrealized_pnl=round(total_unrealized_pnl, 2),
        positions=result_positions,
        dividends_by_asset=div_list,
    )
