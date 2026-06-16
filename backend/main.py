import sys
import asyncio

# On Windows, SelectorEventLoop doesn't support subprocesses (needed by Playwright/pytr).
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import os

# Load .env before any other module reads os.environ (works even with --reload worker)
_env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.isfile(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip())

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .database import engine
from . import models
from .routers import auth, transactions, categories, recurring, debts, goals, portfolio, dashboard, budgets, ai, webhooks, trade_republic
from .services.categorizer import seed_system_categories
from .database import SessionLocal
from sqlalchemy import text

models.Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ────────────────────────────────────────────────────────────────
    # Incremental migrations for columns added after initial schema
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE transactions ADD COLUMN exclude_from_stats BOOLEAN DEFAULT FALSE",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass

    db = SessionLocal()
    try:
        seed_system_categories(db)
    finally:
        db.close()

    # Start background scheduler
    try:
        from .services.scheduler import start as scheduler_start
        scheduler_start()
    except Exception as exc:
        import logging
        logging.getLogger("main").warning("Scheduler not started: %s", exc)

    yield

    # ── Shutdown ───────────────────────────────────────────────────────────────
    try:
        from .services.scheduler import stop as scheduler_stop
        scheduler_stop()
    except Exception:
        pass


app = FastAPI(title="FinanceMaster API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(transactions.router)
app.include_router(categories.router)
app.include_router(recurring.router)
app.include_router(debts.router)
app.include_router(goals.router)
app.include_router(portfolio.router)
app.include_router(dashboard.router)
app.include_router(budgets.router)
app.include_router(ai.router)
app.include_router(webhooks.router)
app.include_router(trade_republic.router)


# Serve React frontend
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        index = os.path.join(static_dir, "index.html")
        return FileResponse(index)
