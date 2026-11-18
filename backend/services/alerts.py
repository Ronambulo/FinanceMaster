"""Avisos push programados y aportaciones automáticas a objetivos.

Cada aviso se anota en `event_log` con una clave, así una pasada repetida del
programador (o un reinicio) no lo envía dos veces.
"""
import logging
from datetime import date, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from .. import models
from . import cycles as cyc
from . import notify
from . import preferences as prefs_svc

log = logging.getLogger("alerts")

# Una nómina más antigua que esto ya no dispara aviso ni aportación.
PAYROLL_WINDOW_DAYS = 3


def eur(v: float) -> str:
    s = f"{abs(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if s.endswith(",00"):
        s = s[:-3]
    return f"{s} €"


def _notify_on(user: models.User, kind: str) -> bool:
    return bool(prefs_svc.resolve(user.preferences)["notify"].get(kind))


def _users(db: Session) -> List[models.User]:
    return db.query(models.User).filter(models.User.is_active == True).all()  # noqa: E712


# ── Recurrentes que vencen mañana ────────────────────────────────────────────

def recurring_due(db: Session, user: models.User, today: Optional[date] = None) -> int:
    today = today or date.today()
    if not _notify_on(user, "recurring") or not notify.has_subscription(db, user.id):
        return 0
    tomorrow = today + timedelta(days=1)
    groups = db.query(models.RecurringGroup).filter(
        models.RecurringGroup.user_id == user.id,
        models.RecurringGroup.is_active == True,  # noqa: E712
        models.RecurringGroup.is_dismissed != True,  # noqa: E712
        models.RecurringGroup.next_expected_date == tomorrow,
    ).order_by(models.RecurringGroup.display_name).all()
    due = [g for g in groups if notify.once(db, user.id, f"recurring:{g.id}:{tomorrow.isoformat()}")]
    if not due:
        return 0
    if len(due) == 1:
        g = due[0]
        title = f"Mañana se cobra {g.display_name}"
        body = eur(g.avg_amount or 0)
    else:
        total = sum(abs(g.avg_amount or 0) for g in due)
        title = f"Mañana se cobran {len(due)} recurrentes · {eur(total)}"
        body = ", ".join(g.display_name for g in due[:4]) + ("…" if len(due) > 4 else "")
    notify.send(db, user.id, title, body, url="/recurrentes", tag="recurring")
    return len(due)


# ── Presupuestos al 80 % ─────────────────────────────────────────────────────

def budget_alerts(db: Session, user: models.User, today: Optional[date] = None) -> int:
    from ..routers.budgets import budget_status
    today = today or date.today()
    if not _notify_on(user, "budget") or not notify.has_subscription(db, user.id):
        return 0
    cs = cyc.cycles(db, user, today)
    cur = cs[-1]
    end = cyc.estimated_end(cs) or cur.end
    if end < today:
        end = today
    rows = budget_status(month=None, date_from=cur.start.isoformat(), date_to=end.isoformat(),
                         current_user=user, db=db)
    sent = 0
    for b in rows:
        level = 100 if b.pct_used >= 100 else 80 if b.pct_used >= 80 else 0
        if not level or b.budgeted <= 0:
            continue
        # El de 100 también deja marcado el de 80, para no mandar los dos a la vez.
        if level == 100:
            notify.mark(db, user.id, f"budget:{b.budget_id}:{cur.start}:80")
        if not notify.once(db, user.id, f"budget:{b.budget_id}:{cur.start}:{level}"):
            continue
        if level == 100:
            title = f"Presupuesto de {b.category_name} superado"
            body = f"Llevas {eur(b.spent)} de {eur(b.budgeted)}"
        else:
            title = f"{b.category_name}: {round(b.pct_used)} % del presupuesto"
            body = f"Te quedan {eur(b.remaining)} hasta fin de periodo"
        notify.send(db, user.id, title, body, url="/plan", tag=f"budget-{b.budget_id}")
        sent += 1
    return sent


# ── Nómina: aviso con el cierre del mes y aportaciones a objetivos ───────────

def goal_contribution(goal: models.Goal, payroll: float) -> float:
    """Lo que toca aportar a un objetivo con una nómina de `payroll` euros."""
    if goal.auto_mode == "amount":
        amt = goal.auto_value or 0
    elif goal.auto_mode == "percent":
        amt = payroll * (goal.auto_value or 0) / 100
    else:
        return 0.0
    amt = max(0.0, amt)
    if goal.target_amount:
        amt = min(amt, max(0.0, goal.target_amount - (goal.current_amount or 0)))
    return round(amt, 2)


def apply_auto_goals(db: Session, user: models.User, pay_day: date, payroll: float) -> float:
    goals = db.query(models.Goal).filter(
        models.Goal.user_id == user.id,
        models.Goal.is_active == True,  # noqa: E712
        models.Goal.auto_mode.in_(("amount", "percent")),
    ).all()
    total = 0.0
    for g in goals:
        amt = goal_contribution(g, payroll)
        if amt <= 0 or not notify.once(db, user.id, f"goal:{g.id}:{pay_day.isoformat()}"):
            continue
        g.current_amount = round((g.current_amount or 0) + amt, 2)
        total += amt
    db.commit()
    return round(total, 2)


def latest_payroll(db: Session, user_id: int, today: Optional[date] = None):
    today = today or date.today()
    events = [e for e in cyc.payroll_events(db, user_id) if e[0] <= today]
    return events[-1] if events else None


def payroll_check(db: Session, user: models.User, today: Optional[date] = None) -> bool:
    today = today or date.today()
    last = latest_payroll(db, user.id, today)
    if not last:
        return False
    pay_day, amount = last
    if (today - pay_day).days > PAYROLL_WINDOW_DAYS:
        return False
    apply_auto_goals(db, user, pay_day, amount)
    if not notify.once(db, user.id, f"payroll:{pay_day.isoformat()}"):
        return False
    if not _notify_on(user, "payroll") or not notify.has_subscription(db, user.id):
        return False
    prev = cyc.previous_cycle(db, user, today)
    url = f"/cierre?start={prev.start.isoformat()}&end={prev.end.isoformat()}" if prev else "/"
    notify.send(db, user.id, f"Nómina recibida · {eur(amount)}", "Toca para ver cómo cerró el mes",
                url=url, tag="payroll")
    return True


def mark_current_payroll(db: Session, goal: models.Goal) -> None:
    """Al activar la aportación automática, la nómina que ya entró no cuenta: empieza con la siguiente."""
    last = latest_payroll(db, goal.user_id)
    if last:
        notify.mark(db, goal.user_id, f"goal:{goal.id}:{last[0].isoformat()}")


# ── Trabajos del programador ─────────────────────────────────────────────────

def _each_user(fn, label: str) -> None:
    from ..database import SessionLocal
    db = SessionLocal()
    try:
        for u in _users(db):
            try:
                fn(db, u)
            except Exception as exc:
                db.rollback()
                log.warning("%s falló para el usuario %s: %s", label, u.id, exc)
    finally:
        db.close()


def run_recurring_due() -> None:
    _each_user(recurring_due, "recurring_due")


def run_hourly() -> None:
    _each_user(payroll_check, "payroll_check")
    _each_user(budget_alerts, "budget_alerts")
