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
    scheduler.start()
    log.info("APScheduler started")


def stop():
    if scheduler.running:
        scheduler.shutdown(wait=False)
