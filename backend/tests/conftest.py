"""Fixtures comunes: una BD SQLite temporal por sesión de tests y un cliente
HTTP autenticado. DATABASE_URL se fija antes de importar la app para que
nunca toque backend/data/finance.db."""
import os
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="fm-tests-")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_tmpdir, "test.db")

import itertools  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend import models  # noqa: E402
from backend.database import SessionLocal, engine  # noqa: E402
from backend.main import app  # noqa: E402
from backend.services.categorizer import seed_system_categories  # noqa: E402

models.Base.metadata.create_all(bind=engine)
with SessionLocal() as _db:
    seed_system_categories(_db)

_counter = itertools.count(1)


@pytest.fixture
def db():
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture
def client():
    """Cliente sin lifespan (no arranca el scheduler ni conecta con bancos)."""
    return TestClient(app)


@pytest.fixture
def user_client(client):
    """Registra un usuario nuevo y devuelve (cliente, user_id) con el token puesto."""
    n = next(_counter)
    r = client.post("/api/auth/register", json={
        "email": f"u{n}@example.com", "username": f"user{n}", "password": "secret123",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    client.headers["Authorization"] = f"Bearer {body['access_token']}"
    return client, body["user"]["id"]


def add_tx(db, user_id, **kw):
    from datetime import date
    defaults = dict(
        user_id=user_id, date=date(2026, 11, 3), type="CARD_TRANSACTION",
        amount=-10.0, name="Mercadona", source="manual", account_category="CASH",
    )
    defaults.update(kw)
    tx = models.Transaction(**defaults)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def system_category(db, name):
    return db.query(models.Category).filter(
        models.Category.name == name, models.Category.user_id.is_(None)
    ).first()
