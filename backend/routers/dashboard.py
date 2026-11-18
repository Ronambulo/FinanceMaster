import json
import threading
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, extract, or_
from sqlalchemy.orm import Session, joinedload
from .. import models, schemas, auth
from ..database import get_db
from ..services.external_brokers import affects_cash_clause

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

INCOME_TYPES = {
    "CUSTOMER_INPAYMENT", "TRANSFER_INSTANT_INBOUND", "TRANSFER_INBOUND",
    "INTEREST_PAYMENT", "DIVIDEND", "STOCKPERK", "BENEFITS_SAVEBACK",
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
        models.Transaction.exclude_from_stats == False,
    )

    net_amount = func.coalesce(models.Transaction.effective_amount, models.Transaction.amount)

    def _sum(q, types, start_d=None, end_d=None):
        qq = q.filter(models.Transaction.type.in_(types))
        if start_d:
            qq = qq.filter(models.Transaction.date >= start_d, models.Transaction.date <= end_d)
        result = qq.with_entities(func.sum(func.abs(net_amount))).scalar()
        return round(result or 0.0, 2)

    income_month = _sum(cash_txs, INCOME_TYPES, start, end)
    expenses_month = _sum(cash_txs, EXPENSE_TYPES, start, end)
    savings_month = round(income_month - expenses_month, 2)
    income_total = _sum(cash_txs, INCOME_TYPES)
    expenses_total = _sum(cash_txs, EXPENSE_TYPES)
    interest_month = _sum(cash_txs, INTEREST_TYPES, start, end)
    interest_total = _sum(cash_txs, INTEREST_TYPES)

    # Fees and taxes are booked differently depending on the import path: the
    # TR API already nets them into `amount`, while the CSV export keeps them
    # in their own columns. Adding them here is correct for the CSV and a
    # no-op for the API (where both columns are empty), so a single formula
    # gives the real cash balance regardless of where the data came from.
    balance_raw = db.query(
        func.sum(
            models.Transaction.amount
            + func.coalesce(models.Transaction.fee, 0.0)
            + func.coalesce(models.Transaction.tax, 0.0)
        )
    ).filter(
        models.Transaction.user_id == current_user.id,
        affects_cash_clause(),
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
    net_amount = func.coalesce(models.Transaction.effective_amount, models.Transaction.amount)

    q = (
        db.query(
            models.Transaction.category_id,
            func.sum(func.abs(net_amount)).label("total"),
            func.count(models.Transaction.id).label("cnt"),
        )
        .filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.account_category == "CASH",
            models.Transaction.is_internal_transfer == False,
            models.Transaction.exclude_from_stats == False,
            models.Transaction.type.in_(types),
            models.Transaction.date >= start,
            models.Transaction.date <= end,
        )
        .group_by(models.Transaction.category_id)
        .order_by(func.sum(func.abs(net_amount)).desc())
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


@router.get("/pending-recurring", response_model=List[schemas.PendingRecurring])
def pending_recurring(
    date_from: date = Query(...),
    date_to: date = Query(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    groups = (
        db.query(models.RecurringGroup)
        .options(joinedload(models.RecurringGroup.category))
        .filter(
            models.RecurringGroup.user_id == current_user.id,
            models.RecurringGroup.is_active == True,
            models.RecurringGroup.next_expected_date != None,
            models.RecurringGroup.next_expected_date >= date_from,
            models.RecurringGroup.next_expected_date <= date_to,
        )
        .all()
    )
    result = []
    for g in groups:
        paid = db.query(models.Transaction).filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.recurring_group_id == g.id,
            models.Transaction.date >= date_from,
        ).first()
        if not paid:
            cat = g.category
            result.append(schemas.PendingRecurring(
                group_id=g.id,
                display_name=g.display_name,
                avg_amount=round(g.avg_amount or 0.0, 2),
                category_name=cat.name if cat else "Sin categoría",
                category_color=cat.color if cat else "#94a3b8",
                category_icon=cat.icon if cat else "💳",
                next_expected_date=g.next_expected_date,
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
            or_(models.Transaction.link_group_id.is_(None), models.Transaction.is_link_primary == True),
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
            amount=tx.effective_amount if tx.effective_amount is not None else tx.amount,
            exclude_from_stats=tx.exclude_from_stats or False,
            recurring_group_id=tx.recurring_group_id,
        )
        for tx in txs
    ]


@router.get("/monthly-investments", response_model=schemas.MonthlyInvestmentSummary)
def monthly_investments(
    date_from: date,
    date_to: date,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    txs = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.account_category.in_(["TRADING", "SECURITIES"]),
            models.Transaction.type == "BUY",
            models.Transaction.date >= date_from,
            models.Transaction.date <= date_to,
        )
        .all()
    )
    invested = sum(abs(tx.amount) for tx in txs)
    return schemas.MonthlyInvestmentSummary(invested=invested, count=len(txs))


# symbol -> (period, {YYYY-MM: eur_close}, fetched_at). Failures are cached as
# an empty dict so a delisted ticker is not retried on every request.
_HIST_CACHE: dict = {}
_HIST_TTL = 6 * 3600
_HIST_FAIL_TTL = 30 * 60
_PERIODS = ("1y", "2y", "5y")


def _period_for(months: int) -> str:
    if months <= 12:
        return "1y"
    if months <= 24:
        return "2y"
    return "5y"


def _fetch_hist(sym: str, period: str) -> dict:
    from ..services.portfolio_calculator import ISIN_TO_YAHOO, _to_eur
    entry = ISIN_TO_YAHOO.get(sym, sym)
    if entry is None:
        return {}
    yahoo_sym, currency = (entry if isinstance(entry, tuple) else (entry, None))
    try:
        import yfinance as yf
        tk = yf.Ticker(yahoo_sym)
        hist = tk.history(period=period, interval="1mo")
        if hist.empty:
            return {}
        # `sym` is usually an already-resolved ticker, so the ISIN map rarely
        # knows its currency. Ask Yahoo instead of assuming EUR: quoting a USD
        # (or GBp) line as if it were euros inflated the whole history.
        if currency is None:
            currency = (tk.history_metadata or {}).get("currency")
            if not currency:
                try:
                    currency = tk.fast_info.currency
                except Exception:
                    currency = None
            currency = currency or "EUR"
        out = {}
        for idx, row in hist.iterrows():
            out[f"{idx.year}-{idx.month:02d}"] = round(_to_eur(float(row["Close"]), currency), 4)
        return out
    except Exception:
        return {}


# Los cierres mensuales casi no cambian: se guardan en disco y, si han caducado,
# se sirven igualmente y se refrescan en segundo plano. Antes, tras cada
# reinicio, el gráfico de patrimonio esperaba ~1,5 s a Yahoo.
_HIST_FILE = Path(__file__).parent.parent / "data" / "hist_cache.json"
_HIST_REFRESHING: set = set()
_HIST_LOCK = threading.Lock()


def _load_hist_cache() -> None:
    try:
        if _HIST_FILE.exists():
            for sym, v in json.loads(_HIST_FILE.read_text(encoding="utf-8")).items():
                _HIST_CACHE[sym] = tuple(v)
    except Exception:
        pass


def _save_hist_cache() -> None:
    try:
        _HIST_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = _HIST_FILE.with_suffix(".tmp")
        with _HIST_LOCK:
            data = {k: list(v) for k, v in _HIST_CACHE.items() if v[1]}
        tmp.write_text(json.dumps(data), encoding="utf-8")
        tmp.replace(_HIST_FILE)
    except Exception:
        pass


def _refresh_hist(syms, period: str) -> None:
    with _HIST_LOCK:
        syms = [s for s in syms if s not in _HIST_REFRESHING]
        _HIST_REFRESHING.update(syms)
    if not syms:
        return

    def run():
        try:
            for sym in syms:
                prices = _fetch_hist(sym, period)
                old = _HIST_CACHE.get(sym)
                # Un fallo de red no borra la serie buena que ya había.
                if prices or not (old and old[1]):
                    _HIST_CACHE[sym] = (period, prices, time.time())
            _save_hist_cache()
        finally:
            with _HIST_LOCK:
                _HIST_REFRESHING.difference_update(syms)

    threading.Thread(target=run, daemon=True).start()


_load_hist_cache()


def _hist_prices_eur(symbols, months: int) -> dict:
    period = _period_for(months)
    need = _PERIODS.index(period)
    now = time.time()
    result: dict = {}
    todo = []
    stale = []
    for sym in symbols:
        hit = _HIST_CACHE.get(sym)
        if hit:
            cached_period, prices, ts = hit
            ttl = _HIST_TTL if prices else _HIST_FAIL_TTL
            if _PERIODS.index(cached_period) >= need:
                result[sym] = prices
                if now - ts >= ttl:
                    stale.append(sym)
                continue
        todo.append(sym)
    if stale:
        _refresh_hist(stale, period)
    if todo:
        with ThreadPoolExecutor(max_workers=min(8, len(todo))) as pool:
            for sym, prices in zip(todo, pool.map(lambda s: _fetch_hist(s, period), todo)):
                _HIST_CACHE[sym] = (period, prices, now)
                result[sym] = prices
        _save_hist_cache()
    return result


@router.get("/net-worth-history", response_model=List[schemas.NetWorthPoint])
def net_worth_history(
    months: int = Query(24, ge=3, le=60),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    from ..services.portfolio_calculator import _get_yahoo_price_in_eur

    today = date.today()

    # Cash: every movement counts, not just the ones filed under CASH. A buy is
    # money leaving the account, so filtering it out here left the invested
    # amount sitting in cash *and* in the portfolio — counted twice in net
    # worth. Fees and taxes are added for the same reason as in /overview.
    cash_txs = (
        db.query(models.Transaction)
        .filter(models.Transaction.user_id == current_user.id, affects_cash_clause())
        .order_by(models.Transaction.date)
        .all()
    )
    trading_txs = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.account_category == "TRADING",
        )
        .order_by(models.Transaction.date)
        .all()
    )
    debts = (
        db.query(models.Debt)
        .filter(models.Debt.user_id == current_user.id)
        .all()
    )

    # Build month list
    month_list = []
    for i in range(months - 1, -1, -1):
        m_num = today.month - i
        y_num = today.year
        while m_num <= 0:
            m_num += 12
            y_num -= 1
        _start, end_m = _month_range(y_num, m_num)
        month_list.append((y_num, m_num, end_m))

    # Historical monthly closes, cached per symbol and fetched in parallel:
    # a serial yfinance call per symbol on every request made the charts on
    # Inicio and Cuentas arrive seconds after the rest of the page.
    symbols_set = {tx.symbol for tx in trading_txs if tx.symbol}
    hist_prices = _hist_prices_eur(symbols_set, months)

    # Current prices are the fallback for months Yahoo has no close for; warm
    # them in parallel too instead of one by one inside the month loop.
    missing = [s for s in symbols_set if not hist_prices.get(s)]
    if missing:
        with ThreadPoolExecutor(max_workers=min(8, len(missing))) as pool:
            list(pool.map(_get_yahoo_price_in_eur, missing))

    result = []
    for y_num, m_num, end_m in month_list:
        month_key = f"{y_num}-{m_num:02d}"

        # 1. Cumulative cash balance
        cash_balance = sum(
            tx.amount + (tx.fee or 0.0) + (tx.tax or 0.0)
            for tx in cash_txs if tx.date <= end_m
        )

        # 2. Portfolio value: simulate positions up to end of month.
        # The running total is not clamped at zero: when a same-day sale is
        # stored before the buy that opened the position, clamping swallowed
        # the sale and left the whole position open forever.
        positions: dict = {}
        for tx in trading_txs:
            if tx.date > end_m:
                continue
            sym = tx.symbol or "UNKNOWN"
            if tx.type == "BUY":
                positions[sym] = positions.get(sym, 0.0) + abs(tx.shares or 0.0)
            elif tx.type == "SELL":
                positions[sym] = positions.get(sym, 0.0) - abs(tx.shares or 0.0)

        portfolio_val = 0.0
        for sym, shares in positions.items():
            if shares < 0.0001:
                continue
            price = hist_prices.get(sym, {}).get(month_key)
            if price is None:
                price = _get_yahoo_price_in_eur(sym)
            if price:
                portfolio_val += shares * price

        # 3. Outstanding debts I_OWE at that date
        debt_total = 0.0
        for debt in debts:
            created = debt.created_at.date() if debt.created_at else today
            if created > end_m:
                continue
            if debt.direction.value != "I_OWE":
                continue
            paid = sum(p.amount for p in debt.payments if p.payment_date <= end_m)
            remaining = max(0.0, debt.total_amount - paid)
            if remaining > 0.0:
                debt_total += remaining

        result.append(schemas.NetWorthPoint(
            month=month_key,
            cash=round(cash_balance, 2),
            portfolio=round(portfolio_val, 2),
            debt=round(debt_total, 2),
            net_worth=round(cash_balance + portfolio_val - debt_total, 2),
        ))

    return result


# ── Insights ──────────────────────────────────────────────────────────────────

@router.get("/insights", response_model=List[schemas.InsightOut])
def get_insights(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    insights = (
        db.query(models.Insight)
        .filter(models.Insight.user_id == current_user.id)
        .order_by(models.Insight.created_at.desc())
        .limit(20)
        .all()
    )
    # If no stored insights, compute on the fly (first visit)
    if not insights:
        from ..services.insights import refresh_insights
        refresh_insights(db, current_user.id)
        insights = (
            db.query(models.Insight)
            .filter(models.Insight.user_id == current_user.id)
            .order_by(models.Insight.created_at.desc())
            .limit(20)
            .all()
        )
    return insights


@router.patch("/insights/{insight_id}/read")
def mark_insight_read(
    insight_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    insight = db.query(models.Insight).filter(
        models.Insight.id == insight_id,
        models.Insight.user_id == current_user.id,
    ).first()
    if not insight:
        raise HTTPException(404, "Insight no encontrado")
    insight.is_read = True
    db.commit()
    return {"ok": True}


@router.post("/insights/refresh")
def refresh_user_insights(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    from ..services.insights import refresh_insights
    refresh_insights(db, current_user.id)
    return {"ok": True}


@router.get("/accounts")
def accounts(
    with_investments: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """Saldo de efectivo por origen (banco o manual), con la misma fórmula que
    el saldo total de /overview, para la pantalla Cuentas."""
    from ..services.bank_connectors import BANK_LABELS

    T = models.Transaction
    rows = db.query(
        T.source,
        func.sum(T.amount + func.coalesce(T.fee, 0.0) + func.coalesce(T.tax, 0.0)),
        func.count(T.id),
        func.max(T.date),
    ).filter(
        T.user_id == current_user.id,
        affects_cash_clause(),
    ).group_by(T.source).all()

    labels = {**BANK_LABELS, "manual": "Manual"}
    merged: dict = {}
    for source, total, count, last in rows:
        key = source or "manual"
        acc = merged.setdefault(key, {
            "source": key, "label": labels.get(key, key.replace("_", " ").title()),
            "balance": 0.0, "count": 0, "last_date": None,
        })
        acc["balance"] += total or 0.0
        acc["count"] += count
        if last and (acc["last_date"] is None or last > acc["last_date"]):
            acc["last_date"] = last
    if with_investments:
        # Para filtrar movimientos también cuentan los orígenes que solo tienen
        # operaciones de inversión (p. ej. MyInvestor con fondos): sin saldo de
        # efectivo, pero con movimientos. `tx_count` = todos sus movimientos.
        for source, n in db.query(T.source, func.count(T.id)).filter(
                T.user_id == current_user.id).group_by(T.source).all():
            key = source or "manual"
            acc = merged.setdefault(key, {
                "source": key, "label": labels.get(key, key.replace("_", " ").title()),
                "balance": 0.0, "count": 0, "last_date": None,
            })
            acc["tx_count"] = acc.get("tx_count", 0) + n
    out = []
    for acc in merged.values():
        acc["balance"] = round(acc["balance"], 2)
        out.append(acc)
    out.sort(key=lambda a: (-abs(a["balance"]), a["label"]))
    return out
