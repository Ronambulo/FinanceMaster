import json
import re
import time
from pathlib import Path
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
    "US84615Q1031": ("SPCE",    "USD"),   # SpaceX (IPO 2026 — update ticker if wrong)
    "DE000FD0F1S2": None,                 # Best Turbo Gold (expired derivative)
}

# Runtime cache for ISINs auto-discovered via yfinance Search (unknown ISINs)
_isin_search_cache: Dict[str, Optional[tuple]] = {}


def _lookup_isin_via_search(isin: str) -> Optional[tuple]:
    """Try to find a Yahoo Finance ticker for an unknown ISIN using yf.Search."""
    if isin in _isin_search_cache:
        return _isin_search_cache[isin]
    try:
        import yfinance as yf
        results = yf.Search(isin, max_results=3)
        quotes = getattr(results, "quotes", None) or []
        for q in quotes:
            sym = q.get("symbol", "")
            currency = (q.get("currency") or "USD").upper()
            if sym and len(sym) <= 10:
                entry: tuple = (sym, currency)
                _isin_search_cache[isin] = entry
                return entry
    except Exception:
        pass
    _isin_search_cache[isin] = None
    return None

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
    "ishares msci world":            ("IWDA.AS", "EUR"),
    "apple":                         ("AAPL",    "USD"),
    "apple inc":                     ("AAPL",    "USD"),
    "amazon.com":                    ("AMZN",    "USD"),
    "amazon.com inc":                ("AMZN",    "USD"),
    "amazon":                        ("AMZN",    "USD"),
    "microsoft":                     ("MSFT",    "USD"),
    "microsoft corp":                ("MSFT",    "USD"),
    "monster beverage":              ("MNST",    "USD"),
    "spacex":                        ("SPCE",    "USD"),
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


# ── Persistent ticker cache ────────────────────────────────────────────────────
_TICKER_CACHE_FILE = Path(__file__).parent.parent / "data" / "ticker_cache.json"
_persistent_ticker_cache: Dict[str, Optional[list]] = {}


def _load_ticker_cache() -> None:
    global _persistent_ticker_cache
    try:
        if _TICKER_CACHE_FILE.exists():
            with open(_TICKER_CACHE_FILE, encoding="utf-8") as f:
                _persistent_ticker_cache = json.load(f)
    except Exception:
        _persistent_ticker_cache = {}


def _save_ticker_cache() -> None:
    try:
        _TICKER_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(_TICKER_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_persistent_ticker_cache, f, indent=2)
    except Exception:
        pass


_load_ticker_cache()


def _is_isin(s: Optional[str]) -> bool:
    """True if s is a 12-char ISIN (2 alpha country code + 10 alphanum)."""
    return bool(s) and len(s) == 12 and s[:2].isalpha() and s.isalnum()


def _yf_search_by_isin(isin: str) -> Optional[tuple]:
    """yfinance Search by ISIN; returns first valid (ticker, currency) result."""
    try:
        import yfinance as yf
        quotes = getattr(yf.Search(isin, max_results=5), "quotes", None) or []
        for q in quotes:
            sym = q.get("symbol", "")
            currency = (q.get("currency") or "USD").upper()
            if sym and len(sym) <= 10:
                return (sym, currency)
    except Exception:
        pass
    return None


def _yf_search_by_name(name: str) -> Optional[tuple]:
    """yfinance Search by name; prefers EUR-denominated results (European ETFs)."""
    clean = re.sub(r"\s*\(Acc\)|\s*\(Dist\)", "", name, flags=re.IGNORECASE).strip()
    try:
        import yfinance as yf
        quotes = getattr(yf.Search(clean, max_results=5), "quotes", None) or []
        for q in quotes:
            sym = q.get("symbol", "")
            currency = (q.get("currency") or "USD").upper()
            if sym and len(sym) <= 10 and currency == "EUR":
                return (sym, "EUR")
        for q in quotes:
            sym = q.get("symbol", "")
            currency = (q.get("currency") or "USD").upper()
            if sym and len(sym) <= 10:
                return (sym, currency)
    except Exception:
        pass
    return None


def resolve_to_ticker(isin: Optional[str], name: Optional[str]) -> Optional[tuple]:
    """
    Resolve a TR asset to a (yahoo_ticker, currency) tuple.
    Order: static ISIN dict → static name dict → persistent cache → yf ISIN search → yf name search.
    Caches results persistently so each asset is only looked up once.
    """
    isin_key = f"isin:{isin.upper()}" if isin else None
    name_key = f"name:{name.strip().lower()}" if name else None

    # 1. Static ISIN dict
    if isin:
        isin_upper = isin.upper()
        if isin_upper in ISIN_TO_YAHOO:
            entry = ISIN_TO_YAHOO[isin_upper]
            return tuple(entry) if entry else None

    # 2. Static name dict
    if name:
        entry = _ticker_for_name(name)
        if entry is not None:
            return entry

    # 3. Persistent cache
    if isin_key and isin_key in _persistent_ticker_cache:
        raw = _persistent_ticker_cache[isin_key]
        return tuple(raw) if raw else None
    if name_key and name_key in _persistent_ticker_cache:
        raw = _persistent_ticker_cache[name_key]
        return tuple(raw) if raw else None

    # 4. yfinance ISIN search
    if isin:
        entry = _yf_search_by_isin(isin)
        _persistent_ticker_cache[isin_key] = list(entry) if entry else None
        _save_ticker_cache()
        if entry:
            return entry

    # 5. yfinance name search
    if name:
        entry = _yf_search_by_name(name)
        if name_key:
            _persistent_ticker_cache[name_key] = list(entry) if entry else None
            _save_ticker_cache()
        if entry:
            return entry

    return None


def resolve_all_symbols(db: Session, user_id: int) -> dict:
    """
    Update symbol field for all BUY/SELL transactions that have symbol=None or an ISIN.
    Resolves each to the correct Yahoo Finance ticker using resolve_to_ticker().
    """
    txs = db.query(models.Transaction).filter(
        models.Transaction.user_id == user_id,
        models.Transaction.type.in_(["BUY", "SELL"]),
    ).all()

    unresolved = [tx for tx in txs if tx.symbol is None or _is_isin(tx.symbol)]

    resolved = skipped = 0
    for tx in unresolved:
        isin = tx.symbol if _is_isin(tx.symbol) else None
        entry = resolve_to_ticker(isin=isin, name=tx.name)
        if entry:
            ticker, _ = entry
            if ticker:
                tx.symbol = ticker
                resolved += 1
                continue
        skipped += 1

    db.commit()
    return {"resolved": resolved, "skipped": skipped, "total": len(unresolved)}


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
        # Try ISIN lookup first (hardcoded map)
        entry = ISIN_TO_YAHOO.get(tx.symbol or "") if tx.symbol else None
        # Fall back to name lookup
        if entry is None and tx.name:
            entry = _ticker_for_name(tx.name)
        # Fall back to dynamic yfinance search for the ISIN
        if entry is None and tx.symbol:
            entry = _lookup_isin_via_search(tx.symbol)
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
    # Explicit None in map = known expired/unlisted instrument
    if isin in ISIN_TO_YAHOO and entry is None:
        return None
    if entry is None:
        entry = _lookup_isin_via_search(isin)
    # Name-based fallback: symbol may be an asset display name, not an ISIN
    if entry is None:
        entry = _ticker_for_name(isin)
    # Last fallback: use string directly as ticker
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


def _get_ticker_price_in_eur(ticker: str) -> Optional[float]:
    """Fetch current price for a known Yahoo Finance ticker and convert to EUR."""
    now = time.time()
    if ticker in _price_cache:
        price, currency, ts = _price_cache[ticker]
        if now - ts < _CACHE_TTL:
            return _to_eur(price, currency)
    try:
        import yfinance as yf
        tk = yf.Ticker(ticker)
        info = tk.fast_info
        price = getattr(info, "last_price", None)
        currency = (getattr(info, "currency", None) or "USD").upper()
        if price:
            _price_cache[ticker] = (price, currency, now)
            return _to_eur(price, currency)
    except Exception:
        pass
    return None


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
                    "sell_dates": [],
                    "buy_events": [],
                    "sell_events": [],
                }
            pos = positions[sym]
            bought = abs(tx.shares or 0.0)
            cost = amount_eur + fee_eur  # cost basis in EUR
            if tx.date:
                pos["buy_dates"].append(str(tx.date))
                price_per_share = round(cost / bought, 4) if bought > 0 else 0.0
                pos["buy_events"].append({
                    "date": str(tx.date),
                    "shares": round(bought, 6),
                    "price_eur": price_per_share,
                    "total_eur": round(cost, 2),
                })
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
                    "sell_dates": [],
                    "buy_events": [],
                    "sell_events": [],
                }
            pos = positions[sym]
            sold = abs(tx.shares or 0.0)
            proceeds = amount_eur - fee_eur  # proceeds in EUR
            if tx.date:
                pos["sell_dates"].append(str(tx.date))
                price_per_share = round(proceeds / sold, 4) if sold > 0 else 0.0
                pos["sell_events"].append({
                    "date": str(tx.date),
                    "shares": round(sold, 6),
                    "price_eur": price_per_share,
                    "total_eur": round(proceeds, 2),
                })
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
            sell_dates=pos.get("sell_dates", []),
            buy_events=pos.get("buy_events", []),
            sell_events=pos.get("sell_events", []),
            current_price=current_price,
            market_value=market_value,
            unrealized_pnl=unrealized_pnl,
            unrealized_pnl_pct=unrealized_pnl_pct,
        ))
        if shares > 0.0001:
            total_invested += total_cost
        total_realized_pnl += pos["realized_pnl"]

    # Merge manual positions (user-entered, not from transactions)
    for mp in db.query(models.ManualPosition).filter(models.ManualPosition.user_id == user_id).all():
        total_cost   = round(mp.shares * mp.avg_price_eur, 2)
        current_price = _get_ticker_price_in_eur(mp.ticker)
        market_value  = round(mp.shares * current_price, 2) if current_price else None
        unrealized_pnl     = round(market_value - total_cost, 2)          if market_value is not None else None
        unrealized_pnl_pct = round((unrealized_pnl / total_cost) * 100, 2) if (unrealized_pnl is not None and total_cost > 0) else None
        if market_value is not None:
            total_market_value  += market_value
            total_unrealized_pnl += unrealized_pnl or 0
        total_invested += total_cost
        result_positions.append(PortfolioPosition(
            symbol=mp.ticker,
            name=mp.name,
            asset_class="STOCK",
            shares=round(mp.shares, 6),
            avg_buy_price=round(mp.avg_price_eur, 4),
            total_invested=total_cost,
            realized_pnl=0.0,
            dividends_received=0.0,
            current_price=current_price,
            market_value=market_value,
            unrealized_pnl=unrealized_pnl,
            unrealized_pnl_pct=unrealized_pnl_pct,
            is_manual=True,
            manual_id=mp.id,
        ))

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
