"""Periodos de nómina en el servidor (lo mismo que `usePayrollCycle` en el frontend).

- Si el usuario fijó un día de inicio (`month_start` 1..28), los periodos van
  de ese día al anterior del mes siguiente.
- Si no, cada periodo empieza el día que entra la nómina: movimientos positivos
  de la primera categoría cuyo nombre contiene nómina/salario/sueldo. Los cobros
  separados por 4 días o menos cuentan como uno (se queda el mayor).
- Sin nómina detectada, se usan meses naturales.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from .. import models
from . import preferences as prefs_svc

PAYROLL_WORDS = ("nomina", "nómina", "salario", "sueldo")
CLUSTER_DAYS = 4


@dataclass
class Cycle:
    start: date
    end: date          # último día (incluido); en el abierto, estimado
    is_open: bool


def payroll_category(db: Session, user_id: int) -> Optional[models.Category]:
    cats = db.query(models.Category).filter(
        (models.Category.user_id == None) | (models.Category.user_id == user_id)  # noqa: E711
    ).order_by(models.Category.is_system.desc(), models.Category.name).all()
    for c in cats:
        n = (c.name or "").lower()
        if any(w in n for w in PAYROLL_WORDS):
            return c
    return None


def payroll_events(db: Session, user_id: int) -> List[Tuple[date, float]]:
    """Fechas de cobro de nómina (agrupadas) con su importe, de la más antigua a la más reciente."""
    cat = payroll_category(db, user_id)
    if not cat:
        return []
    rows = db.query(models.Transaction.date, models.Transaction.amount).filter(
        models.Transaction.user_id == user_id,
        models.Transaction.category_id == cat.id,
        models.Transaction.amount > 0,
    ).all()
    by_day: dict = {}
    for d, amt in rows:
        by_day[d] = max(by_day.get(d, 0.0), abs(amt))
    out: List[Tuple[date, float]] = []
    for d in sorted(by_day):
        if out and (d - out[-1][0]).days <= CLUSTER_DAYS:
            if by_day[d] > out[-1][1]:
                out[-1] = (d, by_day[d])
        else:
            out.append((d, by_day[d]))
    return out


def _add_months(y: int, m: int, k: int) -> Tuple[int, int]:
    i = y * 12 + (m - 1) + k
    return i // 12, i % 12 + 1


def _calendar(today: date, day: int, n: int) -> List[Cycle]:
    base = (today.year, today.month) if today.day >= day else _add_months(today.year, today.month, -1)
    out = []
    for i in range(n - 1, -1, -1):
        y, m = _add_months(*base, -i)
        ny, nm = _add_months(y, m, 1)
        out.append(Cycle(date(y, m, day), date(ny, nm, day) - timedelta(days=1), i == 0))
    return out


def cycles(db: Session, user: models.User, today: Optional[date] = None, n: int = 24) -> List[Cycle]:
    """Periodos del usuario, del más antiguo al actual (el último está abierto)."""
    today = today or date.today()
    fixed = prefs_svc.resolve(user.preferences).get("month_start") or 0
    if fixed > 0:
        return _calendar(today, fixed, n)
    events = [d for d, _ in payroll_events(db, user.id) if d <= today]
    if not events:
        return _calendar(today, 1, n)
    out = []
    for i, start in enumerate(events):
        if i + 1 < len(events):
            out.append(Cycle(start, events[i + 1] - timedelta(days=1), False))
        else:
            out.append(Cycle(start, today + timedelta(days=45), True))
    return out[-n:]


def current_cycle(db: Session, user: models.User, today: Optional[date] = None) -> Cycle:
    return cycles(db, user, today)[-1]


def previous_cycle(db: Session, user: models.User, today: Optional[date] = None) -> Optional[Cycle]:
    cs = cycles(db, user, today)
    return cs[-2] if len(cs) >= 2 else None


def estimated_end(cs: List[Cycle], idx: int = -1) -> Optional[date]:
    """Fin estimado de un periodo; el abierto se estima con la media de los cerrados (o 30 días)."""
    if not cs:
        return None
    cur = cs[idx]
    if not cur.is_open:
        return cur.end
    closed = [c for c in cs if not c.is_open][-6:]
    n = round(sum((c.end - c.start).days + 1 for c in closed) / len(closed)) if closed else 30
    return cur.start + timedelta(days=n - 1)
