"""
APScheduler background jobs for FinanceMaster.
Start from main.py lifespan: scheduler.start()
"""
import logging
from datetime import datetime as _dt
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

log = logging.getLogger("scheduler")

scheduler = AsyncIOScheduler()


def _update_portfolio_prices():
    """Hourly job: warm the yfinance price cache for all active users."""
    try:
        from ..database import SessionLocal
        from .. import models
        from ..services.portfolio_calculator import _get_yahoo_price_in_eur
        from sqlalchemy import distinct

        db = SessionLocal()
        try:
            user_ids = db.query(distinct(models.Transaction.user_id)).filter(
                models.Transaction.account_category == "TRADING"
            ).all()
            symbols = db.query(distinct(models.Transaction.symbol)).filter(
                models.Transaction.account_category == "TRADING",
                models.Transaction.symbol != None,
            ).all()
            for (sym,) in symbols:
                _get_yahoo_price_in_eur(sym)
            _log_job(db, "portfolio_price_update", "done")
        except Exception as exc:
            _log_job(db, "portfolio_price_update", "error", str(exc))
        finally:
            db.close()
    except Exception as exc:
        log.error("portfolio_price_update failed: %s", exc)


def _weekly_insights():
    """Sunday 20:00 job: refresh insights for all active users."""
    try:
        from ..database import SessionLocal
        from .. import models
        from ..services.insights import refresh_insights
        from sqlalchemy import distinct

        db = SessionLocal()
        try:
            user_ids = [uid for (uid,) in db.query(distinct(models.Transaction.user_id)).all()]
            for uid in user_ids:
                try:
                    refresh_insights(db, uid)
                except Exception as exc:
                    log.warning("insights refresh failed for user %s: %s", uid, exc)
            _log_job(db, "weekly_insights", "done")
        except Exception as exc:
            _log_job(db, "weekly_insights", "error", str(exc))
        finally:
            db.close()
    except Exception as exc:
        log.error("weekly_insights failed: %s", exc)


def run_recurring_detection(user_id: int):
    """Called after CSV import to detect recurring groups asynchronously."""
    try:
        from ..database import SessionLocal
        from ..services.recurring_detector import detect_recurring

        db = SessionLocal()
        try:
            detect_recurring(db, user_id)
            _log_job(db, f"recurring_detection_u{user_id}", "done")
        except Exception as exc:
            _log_job(db, f"recurring_detection_u{user_id}", "error", str(exc))
        finally:
            db.close()
    except Exception as exc:
        log.error("recurring_detection failed: %s", exc)


def _log_job(db, job_name: str, status: str, error: str = None):
    from .. import models
    job = models.BackgroundJob(
        job_name=job_name,
        status=status,
        finished_at=_dt.utcnow(),
        error_message=error,
    )
    db.add(job)
    db.commit()


def start():
    scheduler.add_job(
        _update_portfolio_prices,
        trigger=IntervalTrigger(hours=1),
        id="portfolio_price_update",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        _weekly_insights,
        trigger=CronTrigger(day_of_week="sun", hour=20, minute=0),
        id="weekly_insights",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    from .alerts import run_hourly, run_recurring_due
    scheduler.add_job(
        run_recurring_due,
        trigger=CronTrigger(hour=19, minute=0),
        id="recurring_due_alerts",
        replace_existing=True,
        misfire_grace_time=3 * 3600,
    )
    scheduler.add_job(
        run_hourly,
        trigger=IntervalTrigger(hours=1),
        id="hourly_alerts",
        replace_existing=True,
        misfire_grace_time=1800,
    )
    from .backups import HOUR, scheduled_backup
    scheduler.add_job(
        scheduled_backup,
        trigger=CronTrigger(hour=HOUR, minute=0),
        id="daily_backup",
        replace_existing=True,
        misfire_grace_time=6 * 3600,
    )
    from .recategorize import run as recategorize_run
    scheduler.add_job(
        recategorize_run,
        trigger=IntervalTrigger(hours=6),
        id="recategorize",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    import os
    from datetime import timedelta
    from .trade_republic_api import keep_sessions_alive
    extra = {}
    if os.environ.get("FM_DISABLE_BACKGROUND") != "1":
        # Al arrancar se recupera la sesión de TR sin esperar al primer intervalo.
        extra["next_run_time"] = _dt.now() + timedelta(seconds=15)
    scheduler.add_job(
        keep_sessions_alive,
        trigger=IntervalTrigger(minutes=10),
        id="tr_keep_alive",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
        **extra,
    )
    scheduler.start()
    log.info("APScheduler started")


def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)
