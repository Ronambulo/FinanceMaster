"""Exportación de los datos de un usuario en varios formatos.

Formatos: xlsx (una hoja por sección), csv (un archivo, o un .zip si hay varias
secciones o se separa por meses), json (copia completa y legible por máquina) y
ofx (extracto bancario estándar, solo movimientos de efectivo).

Los meses son meses naturales (1 al último día), no tramos de nómina.
Nunca se exportan secretos: ni credenciales de bancos, ni tokens de API, ni
secretos de webhooks.
"""
import csv
import io
import json
import re
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session, joinedload

from .. import models
from .external_brokers import is_external_broker

INCOME_TYPES = {
    "CUSTOMER_INPAYMENT", "TRANSFER_INSTANT_INBOUND", "TRANSFER_INBOUND",
    "INTEREST_PAYMENT", "DIVIDEND", "STOCKPERK", "BENEFITS_SAVEBACK",
}
EXPENSE_TYPES = {
    "CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL",
    "TRANSFER_INSTANT_OUTBOUND", "TRANSFER_OUTBOUND",
}

# Secciones que dependen del periodo elegido y las que son una foto del estado actual
PERIOD_SECTIONS = ("transactions", "banks", "monthly", "categories_by_month")
SNAPSHOT_SECTIONS = ("portfolio", "budgets", "recurring", "debts", "goals", "categories", "rules")
ALL_SECTIONS = PERIOD_SECTIONS + SNAPSHOT_SECTIONS

# Bancos en el orden en que se muestran. Las claves coinciden con las de
# bank_connectors.BANK_LABELS y con la columna Transaction.source.
BANKS = {
    "trade_republic": "Trade Republic",
    "myinvestor": "MyInvestor",
    "revolut": "Revolut",
    "n26": "N26",
    "wise": "Wise",
    "bbva": "BBVA",
    "pluxee": "Pluxee",
    "other": "Otros bancos",
    "manual": "Manual",
}

SECTION_TITLES = {
    "transactions": "Movimientos",
    "banks": "Por banco",
    "monthly": "Resumen mensual",
    "categories_by_month": "Por categoría",
    "portfolio": "Cartera",
    "budgets": "Presupuestos",
    "recurring": "Recurrentes",
    "debts": "Deudas",
    "goals": "Objetivos",
    "categories": "Categorías",
    "rules": "Reglas",
}

FORMATS = ("xlsx", "csv", "json", "ofx")

GOAL_TYPES = {"PERCENT": "Porcentaje", "EURO_TARGET": "Importe"}
GOAL_CATEGORIES = {"SAVINGS": "Ahorro", "INVESTMENT": "Inversión", "EXPENSES": "Gastos"}
CATEGORY_TYPES = {"income": "Ingreso", "expense": "Gasto", "investment": "Inversión",
                  "transfer": "Transferencia", "internal": "Interna"}

MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
               "agosto", "septiembre", "octubre", "noviembre", "diciembre"]


def month_label(ym: str) -> str:
    y, m = ym.split("-")
    return f"{MONTH_NAMES[int(m) - 1].capitalize()} {y}"


@dataclass
class Period:
    kind: str = "all"                  # all | month | year | range
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    label: str = "Todo"
    slug: str = "completo"


@dataclass
class Table:
    """Una sección tabular: cabeceras en español + filas con valores nativos."""
    title: str
    columns: List[Tuple[str, str]]     # (clave, cabecera)
    rows: List[Dict[str, Any]] = field(default_factory=list)
    money: Tuple[str, ...] = ()        # claves con formato de importe
    percent: Tuple[str, ...] = ()
    section: str = ""                  # clave de ALL_SECTIONS
    bank: Optional[str] = None         # al separar movimientos por banco
    month: Optional[str] = None        # al separar movimientos por mes (AAAA-MM)


# ── Lectura de datos ──────────────────────────────────────────────────────────

_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)


def tx_bank(tx: models.Transaction) -> str:
    """Clave del banco de un movimiento (ver BANKS).

    Usa la columna `source` y, para movimientos anteriores a ella, la deduce del
    formato del external_id: UUID → Trade Republic, 'myinvestor-' → MyInvestor,
    'wise_' → Wise, sin id → manual. Un hash sin prefijo viene de un CSV de
    Revolut/N26 que no se puede distinguir: queda como «otros bancos».
    """
    if tx.source:
        return tx.source
    eid = tx.external_id or ""
    if not eid:
        return "manual"
    if is_external_broker(eid):
        return "myinvestor"
    if eid.startswith("wise_"):
        return "wise"
    if _UUID.match(eid):
        return "trade_republic"
    return "other"


def bank_label(key: str) -> str:
    return BANKS.get(key) or key.replace("_", " ").title()


def _bank_order(key: str) -> Tuple[int, str]:
    keys = list(BANKS)
    return (keys.index(key) if key in keys else len(keys) - 2, bank_label(key))


def _net(tx: models.Transaction) -> float:
    return tx.effective_amount if tx.effective_amount is not None else tx.amount


def load_transactions(db: Session, user_id: int, period: Period,
                      banks: Optional[List[str]] = None) -> List[models.Transaction]:
    q = (
        db.query(models.Transaction)
        .options(joinedload(models.Transaction.category), joinedload(models.Transaction.recurring_group))
        .filter(models.Transaction.user_id == user_id)
    )
    if period.date_from:
        q = q.filter(models.Transaction.date >= period.date_from)
    if period.date_to:
        q = q.filter(models.Transaction.date <= period.date_to)
    txs = q.order_by(models.Transaction.date, models.Transaction.id).all()
    if banks:
        wanted = set(banks)
        txs = [tx for tx in txs if tx_bank(tx) in wanted]
    return txs


def month_overview(db: Session, user_id: int) -> List[Dict[str, Any]]:
    """Meses con movimientos, con ingresos/gastos para mostrarlos en la UI."""
    txs = db.query(models.Transaction).filter(models.Transaction.user_id == user_id).all()
    stats = _monthly_stats(txs)
    counts: Dict[str, int] = defaultdict(int)
    for tx in txs:
        counts[tx.date.strftime("%Y-%m")] += 1
    return [
        {"month": ym, "label": month_label(ym), "count": counts[ym],
         "income": round(stats.get(ym, {}).get("income", 0.0), 2),
         "expenses": round(stats.get(ym, {}).get("expenses", 0.0), 2)}
        for ym in sorted(counts, reverse=True)
    ]


def bank_overview(db: Session, user_id: int) -> List[Dict[str, Any]]:
    """Bancos con movimientos: número, primera y última fecha."""
    txs = db.query(models.Transaction).filter(models.Transaction.user_id == user_id).all()
    agg: Dict[str, Dict[str, Any]] = {}
    for tx in txs:
        k = tx_bank(tx)
        a = agg.setdefault(k, {"key": k, "label": bank_label(k), "count": 0,
                               "first_date": tx.date, "last_date": tx.date})
        a["count"] += 1
        a["first_date"] = min(a["first_date"], tx.date)
        a["last_date"] = max(a["last_date"], tx.date)
    out = [agg[k] for k in sorted(agg, key=_bank_order)]
    for a in out:
        a["first_date"], a["last_date"] = a["first_date"].isoformat(), a["last_date"].isoformat()
    return out


def _counts_as_stats(tx: models.Transaction) -> bool:
    return tx.account_category == "CASH" and not tx.is_internal_transfer and not tx.exclude_from_stats


def _monthly_stats(txs: Iterable[models.Transaction]) -> Dict[str, Dict[str, float]]:
    out: Dict[str, Dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for tx in txs:
        ym = tx.date.strftime("%Y-%m")
        out[ym]["count"] += 1
        if _counts_as_stats(tx):
            if tx.type in INCOME_TYPES:
                out[ym]["income"] += abs(_net(tx))
                if tx.type == "INTEREST_PAYMENT":
                    out[ym]["interest"] += abs(_net(tx))
            elif tx.type in EXPENSE_TYPES:
                out[ym]["expenses"] += abs(_net(tx))
        if tx.account_category in ("TRADING", "SECURITIES"):
            if tx.type == "BUY":
                out[ym]["invested"] += abs(tx.amount)
            elif tx.type == "SELL":
                out[ym]["sold"] += abs(tx.amount)
    return out


# ── Construcción de tablas ────────────────────────────────────────────────────

def _transactions_table(txs: List[models.Transaction], title: str = "Movimientos") -> Table:
    t = Table(
        title=title,
        columns=[
            ("date", "Fecha"), ("time", "Hora"), ("name", "Concepto"), ("category", "Categoría"),
            ("amount", "Importe"), ("effective_amount", "Importe efectivo"), ("fee", "Comisión"),
            ("tax", "Impuestos"), ("currency", "Moneda"), ("type", "Tipo"), ("account", "Cuenta"),
            ("symbol", "Símbolo / ISIN"), ("shares", "Participaciones"), ("price", "Precio"),
            ("counterparty", "Contraparte"), ("counterparty_iban", "IBAN contraparte"),
            ("description", "Descripción"), ("recurring", "Recurrente"),
            ("excluded", "Excluido de estadísticas"), ("internal", "Traspaso interno"),
            ("pending", "Pendiente"), ("bank", "Banco"), ("id", "ID"),
        ],
        money=("amount", "effective_amount", "fee", "tax", "price"),
    )
    for tx in txs:
        t.rows.append({
            "date": tx.date,
            "time": tx.datetime.strftime("%H:%M") if tx.datetime and tx.datetime.time() != datetime.min.time() else "",
            "name": tx.name or "",
            "category": tx.category.name if tx.category else "Sin categorizar",
            "amount": tx.amount,
            "effective_amount": tx.effective_amount,
            "fee": tx.fee,
            "tax": tx.tax,
            "currency": tx.currency or "EUR",
            "type": tx.type,
            "account": tx.account_category or "",
            "symbol": tx.symbol or "",
            "shares": tx.shares,
            "price": tx.price,
            "counterparty": tx.counterparty_name or "",
            "counterparty_iban": tx.counterparty_iban or "",
            "description": tx.description or "",
            "recurring": tx.recurring_group.display_name if tx.recurring_group else "",
            "excluded": "Sí" if tx.exclude_from_stats else "No",
            "internal": "Sí" if tx.is_internal_transfer else "No",
            "pending": "Sí" if tx.is_pending else "No",
            "bank": bank_label(tx_bank(tx)),
            "id": tx.id,
        })
    return t


def _monthly_table(txs: List[models.Transaction]) -> Table:
    t = Table(
        title="Resumen mensual",
        columns=[("month", "Mes"), ("label", "Nombre"), ("income", "Ingresos"), ("expenses", "Gastos"),
                 ("savings", "Ahorro"), ("savings_rate", "Tasa de ahorro"), ("interest", "Intereses"),
                 ("invested", "Invertido"), ("sold", "Vendido"), ("count", "Movimientos")],
        money=("income", "expenses", "savings", "interest", "invested", "sold"),
        percent=("savings_rate",),
    )
    stats = _monthly_stats(txs)
    for ym in sorted(stats):
        s = stats[ym]
        income, expenses = round(s["income"], 2), round(s["expenses"], 2)
        t.rows.append({
            "month": ym, "label": month_label(ym), "income": income, "expenses": expenses,
            "savings": round(income - expenses, 2),
            "savings_rate": round((income - expenses) / income, 4) if income > 0 else None,
            "interest": round(s["interest"], 2), "invested": round(s["invested"], 2),
            "sold": round(s["sold"], 2), "count": int(s["count"]),
        })
    return t


def _categories_by_month_table(txs: List[models.Transaction]) -> Table:
    t = Table(
        title="Por categoría",
        columns=[("month", "Mes"), ("kind", "Tipo"), ("category", "Categoría"),
                 ("amount", "Importe"), ("count", "Movimientos")],
        money=("amount",),
    )
    agg: Dict[Tuple[str, str, str], List[float]] = defaultdict(lambda: [0.0, 0])
    for tx in txs:
        if not _counts_as_stats(tx):
            continue
        kind = "Ingreso" if tx.type in INCOME_TYPES else "Gasto" if tx.type in EXPENSE_TYPES else None
        if not kind:
            continue
        key = (tx.date.strftime("%Y-%m"), kind, tx.category.name if tx.category else "Sin categorizar")
        agg[key][0] += abs(_net(tx))
        agg[key][1] += 1
    for (ym, kind, cat), (amount, n) in sorted(agg.items(), key=lambda kv: (kv[0][0], kv[0][1], -kv[1][0])):
        t.rows.append({"month": ym, "kind": kind, "category": cat, "amount": round(amount, 2), "count": int(n)})
    return t


def _banks_table(txs: List[models.Transaction]) -> Table:
    """Una fila de total por banco seguida de su desglose mes a mes."""
    t = Table(
        title="Por banco",
        columns=[("bank", "Banco"), ("month", "Mes"), ("count", "Movimientos"),
                 ("inflow", "Entradas"), ("outflow", "Salidas"), ("net", "Neto"),
                 ("income", "Ingresos"), ("expenses", "Gastos"),
                 ("invested", "Invertido"), ("sold", "Vendido"),
                 ("first", "Primer movimiento"), ("last", "Último movimiento")],
        money=("inflow", "outflow", "net", "income", "expenses", "invested", "sold"),
    )
    by_bank: Dict[str, List[models.Transaction]] = defaultdict(list)
    for tx in txs:
        by_bank[tx_bank(tx)].append(tx)

    def row(bank: str, month: str, group: List[models.Transaction]) -> Dict[str, Any]:
        flows = [tx.amount + (tx.fee or 0) + (tx.tax or 0) for tx in group]
        s: Dict[str, float] = defaultdict(float)
        for st in _monthly_stats(group).values():
            for k, v in st.items():
                s[k] += v
        inflow = round(sum(f for f in flows if f > 0), 2)
        outflow = round(-sum(f for f in flows if f < 0), 2)
        return {
            "bank": bank_label(bank), "month": month, "count": len(group),
            "inflow": inflow, "outflow": outflow, "net": round(inflow - outflow, 2),
            "income": round(s["income"], 2), "expenses": round(s["expenses"], 2),
            "invested": round(s["invested"], 2), "sold": round(s["sold"], 2),
            "first": min(tx.date for tx in group), "last": max(tx.date for tx in group),
        }

    for bank in sorted(by_bank, key=_bank_order):
        group = by_bank[bank]
        t.rows.append(row(bank, "Total", group))
        by_month: Dict[str, List[models.Transaction]] = defaultdict(list)
        for tx in group:
            by_month[tx.date.strftime("%Y-%m")].append(tx)
        for ym in sorted(by_month):
            t.rows.append(row(bank, ym, by_month[ym]))
    return t


def symbol_banks(db: Session, user_id: int) -> Dict[str, str]:
    """Banco en el que se compró cada símbolo/ISIN (el más frecuente)."""
    counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    q = db.query(models.Transaction).filter(models.Transaction.user_id == user_id,
                                            models.Transaction.symbol.isnot(None))
    for tx in q:
        counts[tx.symbol][tx_bank(tx)] += 1
    return {sym: max(c, key=c.get) for sym, c in counts.items()}


def _portfolio_table(db: Session, user_id: int, banks: Optional[List[str]] = None) -> Table:
    t = Table(
        title="Cartera",
        columns=[("symbol", "Símbolo / ISIN"), ("name", "Nombre"), ("bank", "Banco"), ("asset_class", "Tipo"),
                 ("shares", "Participaciones"), ("avg_buy_price", "Precio medio"), ("total_invested", "Invertido"),
                 ("current_price", "Precio actual"), ("market_value", "Valor de mercado"),
                 ("unrealized_pnl", "Plusvalía latente"), ("unrealized_pnl_pct", "Plusvalía %"),
                 ("realized_pnl", "Plusvalía realizada"), ("dividends", "Dividendos"),
                 ("first_purchase_date", "Primera compra"), ("manual", "Manual")],
        money=("avg_buy_price", "total_invested", "current_price", "market_value",
               "unrealized_pnl", "realized_pnl", "dividends"),
        percent=("unrealized_pnl_pct",),
    )
    try:
        from .portfolio_calculator import calculate_portfolio
        perf = calculate_portfolio(db, user_id)
    except Exception:
        return t
    sym_bank = symbol_banks(db, user_id)
    for p in perf.positions:
        if p.shares <= 0.0001 and p.realized_pnl == 0:
            continue
        bank = "manual" if p.is_manual else sym_bank.get(p.symbol, "other")
        if banks and bank not in banks:
            continue
        t.rows.append({
            "symbol": p.symbol, "name": p.name, "bank": bank_label(bank),
            "asset_class": p.asset_class, "shares": round(p.shares, 6),
            "avg_buy_price": p.avg_buy_price, "total_invested": p.total_invested,
            "current_price": p.current_price, "market_value": p.market_value,
            "unrealized_pnl": p.unrealized_pnl,
            "unrealized_pnl_pct": round(p.unrealized_pnl_pct / 100, 4) if p.unrealized_pnl_pct is not None else None,
            "realized_pnl": p.realized_pnl, "dividends": p.dividends_received,
            "first_purchase_date": p.first_purchase_date or "", "manual": "Sí" if p.is_manual else "No",
        })
    return t


def _snapshot_table(db: Session, user_id: int, section: str, banks: Optional[List[str]] = None) -> Table:
    if section == "portfolio":
        return _portfolio_table(db, user_id, banks)

    if section == "budgets":
        t = Table("Presupuestos", [("category", "Categoría"), ("amount", "Importe"),
                                   ("month", "Mes"), ("recurring", "Recurrente")], money=("amount",))
        for b in db.query(models.Budget).options(joinedload(models.Budget.category)).filter_by(user_id=user_id):
            t.rows.append({"category": b.category.name if b.category else "Total", "amount": b.amount,
                           "month": b.month or "", "recurring": "Sí" if b.is_recurring else "No"})
        return t

    if section == "recurring":
        t = Table("Recurrentes", [("name", "Nombre"), ("amount", "Importe medio"), ("period_days", "Cada (días)"),
                                  ("category", "Categoría"), ("next", "Próximo cargo"), ("active", "Activo")],
                  money=("amount",))
        q = db.query(models.RecurringGroup).options(joinedload(models.RecurringGroup.category)).filter_by(user_id=user_id)
        for r in q.order_by(models.RecurringGroup.display_name):
            t.rows.append({"name": r.display_name, "amount": r.avg_amount, "period_days": r.period_days,
                           "category": r.category.name if r.category else "", "next": r.next_expected_date,
                           "active": "Sí" if r.is_active else "No"})
        return t

    if section == "debts":
        t = Table("Deudas", [("name", "Nombre"), ("direction", "Dirección"), ("total", "Importe total"),
                             ("paid", "Pagado"), ("pending", "Pendiente"), ("due_date", "Vencimiento"),
                             ("settled", "Saldada"), ("payments", "Pagos"), ("description", "Descripción")],
                  money=("total", "paid", "pending"))
        q = db.query(models.Debt).options(joinedload(models.Debt.payments)).filter_by(user_id=user_id)
        for d in q.order_by(models.Debt.created_at):
            paid = round(sum(p.amount for p in d.payments), 2)
            direction = d.direction.value if hasattr(d.direction, "value") else str(d.direction)
            t.rows.append({
                "name": d.name, "direction": "Me deben" if direction.lower() in ("owed_to_me", "lent") else "Debo",
                "total": d.total_amount, "paid": paid, "pending": round(d.total_amount - paid, 2),
                "due_date": d.due_date, "settled": "Sí" if d.is_settled else "No",
                "payments": "; ".join(f"{p.payment_date.isoformat()} {p.amount:.2f}" for p in sorted(d.payments, key=lambda p: p.payment_date)),
                "description": d.description or "",
            })
        return t

    if section == "goals":
        t = Table("Objetivos", [("name", "Nombre"), ("type", "Tipo"), ("category", "Categoría"),
                                ("target", "Objetivo"), ("target_pct", "Objetivo %"), ("current", "Actual"),
                                ("deadline", "Fecha límite"), ("active", "Activo")],
                  money=("target", "current"))
        for g in db.query(models.Goal).filter_by(user_id=user_id).order_by(models.Goal.created_at):
            t.rows.append({
                "name": g.name, "type": GOAL_TYPES.get(getattr(g.type, "value", g.type), g.type),
                "category": GOAL_CATEGORIES.get(getattr(g.category, "value", g.category), "") if g.category else "",
                "target": g.target_amount, "target_pct": g.target_percent, "current": g.current_amount,
                "deadline": g.deadline, "active": "Sí" if g.is_active else "No",
            })
        return t

    if section == "categories":
        t = Table("Categorías", [("name", "Nombre"), ("type", "Tipo"), ("icon", "Icono"),
                                 ("color", "Color"), ("system", "Del sistema")])
        q = db.query(models.Category).filter((models.Category.user_id == user_id) | (models.Category.is_system == True))
        for c in q.order_by(models.Category.is_system, models.Category.name):
            ctype = getattr(c.type, "value", c.type)
            t.rows.append({"name": c.name, "type": CATEGORY_TYPES.get(ctype, ctype), "icon": c.icon,
                           "color": c.color, "system": "Sí" if c.is_system else "No"})
        return t

    if section == "rules":
        t = Table("Reglas", [("keyword", "Palabra clave"), ("field", "Campo"),
                             ("category", "Categoría"), ("priority", "Prioridad")])
        q = db.query(models.CategoryRule).options(joinedload(models.CategoryRule.category)).filter_by(user_id=user_id)
        for r in q.order_by(models.CategoryRule.priority.desc(), models.CategoryRule.keyword):
            t.rows.append({"keyword": r.keyword, "field": r.field, "category": r.category.name if r.category else "",
                           "priority": r.priority})
        return t

    raise ValueError(section)


def _split_transactions(txs: List[models.Transaction], by_month: bool,
                        by_bank: bool) -> List[Tuple[Optional[str], Optional[str], List[models.Transaction]]]:
    """Agrupa en (banco, mes, movimientos) según las opciones de separación."""
    groups: Dict[Tuple[str, str], List[models.Transaction]] = defaultdict(list)
    for tx in txs:
        groups[(tx_bank(tx) if by_bank else "", tx.date.strftime("%Y-%m") if by_month else "")].append(tx)
    ordered = sorted(groups, key=lambda k: (_bank_order(k[0]) if k[0] else (0, ""), k[1]))
    return [(b or None, m or None, groups[(b, m)]) for b, m in ordered]


def build_tables(db: Session, user_id: int, period: Period, sections: List[str],
                 split_by_month: bool = False, split_by_bank: bool = False,
                 banks: Optional[List[str]] = None) -> List[Table]:
    needs_txs = any(s in sections for s in PERIOD_SECTIONS)
    txs = load_transactions(db, user_id, period, banks) if needs_txs else []
    tables: List[Table] = []
    for s in ALL_SECTIONS:
        if s not in sections:
            continue
        if s == "transactions":
            if split_by_month or split_by_bank:
                groups = _split_transactions(txs, split_by_month, split_by_bank)
                for bank, ym, group in groups:
                    title = " ".join(x for x in (bank_label(bank) if bank else None, ym) if x)
                    t = _transactions_table(group, title=title)
                    t.bank, t.month = bank, ym
                    t.section = s
                    tables.append(t)
                if groups:
                    continue
            t = _transactions_table(txs)
        elif s == "banks":
            t = _banks_table(txs)
        elif s == "monthly":
            t = _monthly_table(txs)
        elif s == "categories_by_month":
            t = _categories_by_month_table(txs)
        else:
            t = _snapshot_table(db, user_id, s, banks)
        t.section = s
        tables.append(t)
    return tables


# ── Serializadores ────────────────────────────────────────────────────────────

def _plain(v: Any) -> Any:
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return v


def to_csv_bytes(table: Table) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([h for _, h in table.columns])
    for r in table.rows:
        w.writerow(["" if r.get(k) is None else _plain(r.get(k)) for k, _ in table.columns])
    # BOM para que Excel abra bien los acentos
    return ("﻿" + buf.getvalue()).encode("utf-8")


def _safe_name(s: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "-" for c in s.lower()).strip("-")


def _split_path(t: Table, ext: str) -> str:
    """movimientos/<banco>/<mes>.ext, movimientos/<banco>.ext o movimientos/<mes>.ext"""
    parts = [p for p in (_safe_name(bank_label(t.bank)) if t.bank else None, t.month) if p]
    return "movimientos/" + "/".join(parts) + f".{ext}"


def to_csv_zip(tables: List[Table]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for t in tables:
            path = _split_path(t, "csv") if (t.bank or t.month) else f"{_safe_name(t.title)}.csv"
            z.writestr(path, to_csv_bytes(t))
    return buf.getvalue()


def to_xlsx(tables: List[Table], period: Period, banks: Optional[List[str]] = None) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    info = wb.active
    info.title = "Info"
    info.append(["FinanceMaster: exportación de datos"])
    info["A1"].font = Font(bold=True, size=14)
    info.append([])
    info.append(["Periodo", period.label])
    info.append(["Generado", datetime.now().strftime("%d/%m/%Y %H:%M")])
    info.append(["Meses", "Naturales (del día 1 al último día del mes)"])
    info.append(["Bancos", ", ".join(bank_label(b) for b in banks) if banks else "Todos"])
    info.append([])
    info.append(["Hoja", "Filas"])
    info["A8"].font = info["B8"].font = Font(bold=True)
    for t in tables:
        info.append([t.title, len(t.rows)])
    info.column_dimensions["A"].width = 26
    info.column_dimensions["B"].width = 44

    header_fill = PatternFill("solid", fgColor="1F2937")
    header_font = Font(bold=True, color="FFFFFF")
    used = set()
    for t in tables:
        name = t.title[:31]
        n = 2
        while name in used:
            name = f"{t.title[:28]} {n}"
            n += 1
        used.add(name)
        ws = wb.create_sheet(name)
        ws.append([h for _, h in t.columns])
        for cell in ws[1]:
            cell.fill, cell.font = header_fill, header_font
            cell.alignment = Alignment(vertical="center")
        for r in t.rows:
            ws.append([r.get(k) for k, _ in t.columns])
        widths = [len(h) for _, h in t.columns]
        for ci, (key, _) in enumerate(t.columns, start=1):
            letter = get_column_letter(ci)
            fmt = ("#,##0.00" if key in t.money else "0.0%" if key in t.percent
                   else "dd/mm/yyyy" if key in ("date", "next", "due_date", "deadline", "first", "last") else None)
            for row in ws.iter_rows(min_row=2, min_col=ci, max_col=ci):
                c = row[0]
                if fmt and c.value is not None:
                    c.number_format = fmt
                if c.value is not None:
                    widths[ci - 1] = max(widths[ci - 1], min(len(str(c.value)), 48))
            ws.column_dimensions[letter].width = widths[ci - 1] + 2
        ws.freeze_panes = "A2"
        if t.rows:
            ws.auto_filter.ref = ws.dimensions

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def to_json(tables: List[Table], period: Period, sections: List[str],
            banks: Optional[List[str]] = None) -> bytes:
    def rows_of(t: Table) -> List[Dict[str, Any]]:
        return [{k: _plain(r.get(k)) for k, _ in t.columns} for r in t.rows]

    data: Dict[str, Any] = {}
    for t in tables:
        if t.bank and t.month:
            data.setdefault("transactions_by_bank", {}).setdefault(t.bank, {})[t.month] = rows_of(t)
        elif t.bank:
            data.setdefault("transactions_by_bank", {})[t.bank] = rows_of(t)
        elif t.month:
            data.setdefault("transactions_by_month", {})[t.month] = rows_of(t)
        else:
            data[t.section or _safe_name(t.title)] = rows_of(t)
    doc = {
        "app": "FinanceMaster",
        "version": 1,
        "exported_at": datetime.now().isoformat(timespec="seconds"),
        "period": {"kind": period.kind, "label": period.label,
                   "from": _plain(period.date_from), "to": _plain(period.date_to)},
        "banks": {k: bank_label(k) for k in (banks or [])} or "all",
        "sections": sections,
        "data": data,
    }
    return json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8")


# ── OFX ───────────────────────────────────────────────────────────────────────

def _ofx_escape(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")[:255]


def _ofx_trntype(tx: models.Transaction, amount: float) -> str:
    t = tx.type or ""
    if t == "INTEREST_PAYMENT":
        return "INT"
    if t == "DIVIDEND":
        return "DIV"
    if t.startswith("CARD_TRANSACTION"):
        return "POS"
    if "TRANSFER" in t or t == "CUSTOMER_INPAYMENT":
        return "XFER"
    return "CREDIT" if amount > 0 else "DEBIT"


def _is_cash_account(bank: str) -> bool:
    # Las órdenes de MyInvestor no pasan por ninguna cuenta de efectivo de la app
    return bank != "myinvestor"


def to_ofx(db: Session, user_id: int, txs: List[models.Transaction], period: Period,
           bank: Optional[str] = None) -> bytes:
    """Extracto OFX 2.1.1 de la cuenta de efectivo (de un banco o de todos).

    Las órdenes de MyInvestor no pasan por este efectivo, así que no se incluyen.
    El saldo final es el acumulado de todos los movimientos hasta el fin del periodo.
    """
    def in_account(tx: models.Transaction) -> bool:
        b = tx_bank(tx)
        return _is_cash_account(b) and (bank is None or b == bank)

    cash = [tx for tx in txs if in_account(tx)]
    end = period.date_to or (max((tx.date for tx in cash), default=date.today()))
    start = period.date_from or (min((tx.date for tx in cash), default=end))

    bal_q = db.query(models.Transaction).filter(models.Transaction.user_id == user_id,
                                                models.Transaction.date <= end)
    balance = sum(t.amount + (t.fee or 0) + (t.tax or 0) for t in bal_q if in_account(t))
    bank_id = re.sub(r"[^A-Z0-9]", "", bank_label(bank).upper()) if bank else "FINANCEMASTER"

    def d(x: date) -> str:
        return x.strftime("%Y%m%d")

    lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        '<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>',
        "<OFX>",
        "<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>",
        f"<DTSERVER>{datetime.now().strftime('%Y%m%d%H%M%S')}</DTSERVER><LANGUAGE>SPA</LANGUAGE></SONRS></SIGNONMSGSRSV1>",
        "<BANKMSGSRSV1><STMTTRNRS><TRNUID>1</TRNUID><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>",
        "<STMTRS><CURDEF>EUR</CURDEF>",
        f"<BANKACCTFROM><BANKID>{bank_id}</BANKID><ACCTID>FINANCEMASTER</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>",
        f"<BANKTRANLIST><DTSTART>{d(start)}</DTSTART><DTEND>{d(end)}</DTEND>",
    ]
    for tx in cash:
        amount = round(tx.amount + (tx.fee or 0) + (tx.tax or 0), 2)
        memo = " · ".join(x for x in [tx.category.name if tx.category else "", tx.description or ""] if x)
        lines.append(
            "<STMTTRN>"
            f"<TRNTYPE>{_ofx_trntype(tx, amount)}</TRNTYPE>"
            f"<DTPOSTED>{d(tx.date)}</DTPOSTED>"
            f"<TRNAMT>{amount:.2f}</TRNAMT>"
            f"<FITID>{_ofx_escape(tx.external_id or f'fm-{tx.id}')}</FITID>"
            f"<NAME>{_ofx_escape((tx.name or tx.counterparty_name or tx.type)[:32])}</NAME>"
            + (f"<MEMO>{_ofx_escape(memo)}</MEMO>" if memo else "")
            + "</STMTTRN>"
        )
    lines += [
        "</BANKTRANLIST>",
        f"<LEDGERBAL><BALAMT>{balance:.2f}</BALAMT><DTASOF>{d(end)}</DTASOF></LEDGERBAL>",
        "</STMTRS></STMTTRNRS></BANKMSGSRSV1>",
        "</OFX>",
    ]
    return "\n".join(lines).encode("utf-8")


def to_ofx_zip(db: Session, user_id: int, txs: List[models.Transaction], period: Period,
               by_month: bool, by_bank: bool) -> bytes:
    cash = [tx for tx in txs if _is_cash_account(tx_bank(tx))]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for bank, ym, group in _split_transactions(cash, by_month, by_bank):
            p = month_period(*map(int, ym.split("-"))) if ym else period
            t = Table(title="", columns=[], bank=bank, month=ym)
            z.writestr(_split_path(t, "ofx").removeprefix("movimientos/"),
                       to_ofx(db, user_id, group, p, bank))
    return buf.getvalue()


# ── Periodos ──────────────────────────────────────────────────────────────────

def month_period(y: int, m: int) -> Period:
    import calendar
    last = calendar.monthrange(y, m)[1]
    ym = f"{y:04d}-{m:02d}"
    return Period("month", date(y, m, 1), date(y, m, last), month_label(ym), ym)


def build_period(kind: str, month: Optional[str], year: Optional[int],
                 date_from: Optional[date], date_to: Optional[date]) -> Period:
    if kind == "month":
        if not month or len(month) != 7:
            raise ValueError("Indica el mes en formato AAAA-MM")
        y, m = map(int, month.split("-"))
        return month_period(y, m)
    if kind == "year":
        if not year:
            raise ValueError("Indica el año")
        return Period("year", date(year, 1, 1), date(year, 12, 31), f"Año {year}", str(year))
    if kind == "range":
        if not date_from or not date_to or date_from > date_to:
            raise ValueError("Indica un rango de fechas válido")
        return Period("range", date_from, date_to,
                      f"{date_from.strftime('%d/%m/%Y')} – {date_to.strftime('%d/%m/%Y')}",
                      f"{date_from.isoformat()}_{date_to.isoformat()}")
    return Period("all", None, None, "Todo el historial", f"completo-{date.today().isoformat()}")


def export(db: Session, user_id: int, fmt: str, period: Period, sections: List[str],
           split_by_month: bool = False, split_by_bank: bool = False,
           banks: Optional[List[str]] = None) -> Tuple[bytes, str, str]:
    """Devuelve (contenido, nombre de archivo, media type)."""
    sections = [s for s in ALL_SECTIONS if s in sections] or ["transactions"]
    banks = banks or None
    base = f"financemaster-{period.slug}"
    if banks and len(banks) == 1:
        base += f"-{_safe_name(bank_label(banks[0]))}"
    if split_by_bank:
        base += "-por-banco"
    if split_by_month:
        base += "-por-meses"

    if fmt == "ofx":
        txs = load_transactions(db, user_id, period, banks)
        if split_by_month or split_by_bank:
            return (to_ofx_zip(db, user_id, txs, period, split_by_month, split_by_bank),
                    f"{base}.zip", "application/zip")
        single = banks[0] if banks and len(banks) == 1 else None
        return to_ofx(db, user_id, txs, period, single), f"{base}.ofx", "application/x-ofx"

    tables = build_tables(db, user_id, period, sections, split_by_month, split_by_bank, banks)
    if fmt == "xlsx":
        return (to_xlsx(tables, period, banks), f"{base}.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    if fmt == "json":
        return to_json(tables, period, sections, banks), f"{base}.json", "application/json"
    if fmt == "csv":
        if len(tables) == 1:
            return to_csv_bytes(tables[0]), f"{base}.csv", "text/csv; charset=utf-8"
        return to_csv_zip(tables), f"{base}.zip", "application/zip"
    raise ValueError(f"Formato no soportado: {fmt}")
