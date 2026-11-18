"""Recurrentes: descartar sugerencias y elegir el importe."""
from datetime import date

from .conftest import add_tx


def _seed(db, uid):
    for d, amt in [(date(2026, 8, 5), -9.99), (date(2026, 9, 5), -9.99), (date(2026, 10, 5), -10.99)]:
        add_tx(db, uid, date=d, amount=amt, name="Netflix")
    db.commit()


def test_dismissed_suggestion_is_not_recreated(user_client, db):
    c, uid = user_client
    _seed(db, uid)
    assert c.post("/api/recurring/detect").status_code == 200
    groups = c.get("/api/recurring").json()
    assert len(groups) == 1
    g = groups[0]
    assert g["is_dismissed"] is False

    r = c.put(f"/api/recurring/{g['id']}", json={"is_active": False, "is_dismissed": True})
    assert r.status_code == 200 and r.json()["is_dismissed"] is True

    c.post("/api/recurring/detect")
    groups = c.get("/api/recurring").json()
    assert len(groups) == 1 and groups[0]["is_dismissed"] is True

    # Reactivarlo lo saca de descartados.
    r = c.put(f"/api/recurring/{g['id']}", json={"is_active": True})
    assert r.json()["is_dismissed"] is False and r.json()["is_active"] is True


def test_pick_amount_from_options(user_client, db):
    c, uid = user_client
    _seed(db, uid)
    c.post("/api/recurring/detect")
    g = c.get("/api/recurring").json()[0]
    amounts = [o["amount"] for o in g["amount_options"]]
    assert amounts == [10.99, 9.99]  # el más reciente primero

    r = c.put(f"/api/recurring/{g['id']}", json={"avg_amount": 10.99})
    assert r.json()["avg_amount"] == 10.99 and r.json()["amount_is_manual"] is True

    # La detección ya no lo pisa.
    c.post("/api/recurring/detect")
    assert c.get("/api/recurring").json()[0]["avg_amount"] == 10.99


def test_reset_to_automatic_amount(user_client, db):
    c, uid = user_client
    _seed(db, uid)
    c.post("/api/recurring/detect")
    g = c.get("/api/recurring").json()[0]
    c.put(f"/api/recurring/{g['id']}", json={"avg_amount": 10.99})
    r = c.put(f"/api/recurring/{g['id']}", json={"amount_is_manual": False})
    body = r.json()
    assert body["amount_is_manual"] is False
    assert body["avg_amount"] == round((9.99 + 9.99 + 10.99) / 3, 2)


def test_create_from_transaction_and_delete(user_client, db):
    c, uid = user_client
    tx = add_tx(db, uid, date=date(2026, 10, 1), amount=-30.0, name="Gimnasio")
    db.commit()
    r = c.post("/api/recurring/from-transaction", json={"transaction_id": tx.id, "display_name": "Gimnasio", "period_days": 30})
    assert r.status_code == 200
    gid = r.json()["id"]
    assert r.json()["is_active"] is True
    assert c.delete(f"/api/recurring/{gid}").status_code == 200
    assert c.get("/api/recurring").json() == []
