import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from .database import engine
from . import models
from .routers import auth, transactions, categories, recurring, debts, goals, portfolio, dashboard
from .services.categorizer import seed_system_categories
from .database import SessionLocal

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="FinanceMaster API", version="1.0.0")

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


@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        seed_system_categories(db)
    finally:
        db.close()


# Serve React frontend
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        index = os.path.join(static_dir, "index.html")
        return FileResponse(index)
