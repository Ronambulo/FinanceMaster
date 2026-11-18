"""Avisos push, cierre de periodo, gastos compartidos, aportación automática
a objetivos y búsqueda por importe o nota."""
from datetime import date, timedelta

import pytest

from backend import models
from backend.services import alerts, cycles, notify
from backend.tests.conftest import add_tx, system_category

SUB = {"endpoint": "https://push.example.com/abc", "keys": {"p256dh": "BPk", "auth": "xyz"}}


@pytest.fixture
def sent(monkeypatch):
    """Sustituye el envío real por una lista de lo que se habría enviado."""
    out = []

    def fake_send(db, user_id, title, body, url="/", tag=None):
        out.append({"user": user_id, "title": title, "body": body, "url": url})
        return 1, 0
    monkeypatch.setattr(notify, "send", fake_send)
    return out


def _user(db, uid):
    return db.get(models.User, uid)


def _payroll(db, uid, d, amount=2000.0):
    return add_tx(db, uid, date=d, type="CUSTOMER_INPAYMENT", amount=amount, name="Empresa SL",
                  category_id=system_category(db, "Nómina").id)


# ── Suscripción ─────────────────────────────────────────────────────────────

def test_vapid_key_is_stable(user_client):
    client, _ = user_client
    k1 = client.get("/api/push/key").json()["key"]
    assert k1 == client.get("/api/push/key").json()["key"] and len(k1) > 80


def test_subscribe_status_unsubscribe(user_client):
    client, _ = user_client
    assert client.post("/api/push/subscribe", json=SUB).status_code == 200
    # Repetir no duplica
    assert client.post("/api/push/subscribe", json=SUB).status_code == 200
    st = client.get("/api/push/status", params={"endpoint": SUB["endpoint"]}).json()
    assert st == {"devices": 1, "this_device": True}
    client.post("/api/push/unsubscribe", json={"endpoint": SUB["endpoint"]})
    assert client.get("/api/push/status").json()["devices"] == 0


def test_subscribe_rejects_non_https(user_client):
    client, _ = user_client
    bad = {**SUB, "endpoint": "http://evil.local/x"}
    assert client.post("/api/push/subscribe", json=bad).status_code == 400


def test_notify_preferences_validated(user_client):
    client, _ = user_client
    assert client.get("/api/auth/preferences").json()["notify"] == {"recurring": True, "budget": True, "payroll": True}
    assert client.put("/api/auth/preferences", json={"notify": {"budget": False}}).json()["notify"]["budget"] is False
    assert client.put("/api/auth/preferences", json={"notify": {"spam": True}}).status_code in (400, 422)
    # El módulo de gastos compartidos viene apagado
    assert client.get("/api/auth/preferences").json()["modules"]["shared"] is False


# ── Ciclos ──────────────────────────────────────────────────────────────────

def test_cycles_follow_payroll_and_cluster_close_dates(user_client, db):
    _, uid = user_client
    _payroll(db, uid, date(2026, 9, 27))
    _payroll(db, uid, date(2026, 10, 28), 300)
    _payroll(db, uid, date(2026, 10, 30), 2000)   # mismo cobro: se queda el mayor
    _payroll(db, uid, date(2026, 11, 27))
    cs = cycles.cycles(db, _user(db, uid), today=date(2026, 11, 28))
    assert [(c.start, c.end, c.is_open) for c in cs[:2]] == [
        (date(2026, 9, 27), date(2026, 10, 29), False),
        (date(2026, 10, 30), date(2026, 11, 26), False),
    ]
    assert cs[-1].start == date(2026, 11, 27) and cs[-1].is_open


def test_cycles_fixed_day(user_client, db):
    client, uid = user_client
    client.put("/api/auth/preferences", json={"month_start": 25})
    db.expire_all()
    cur = cycles.current_cycle(db, _user(db, uid), today=date(2026, 11, 18))
    assert (cur.start, cur.end) == (date(2026, 10, 25), date(2026, 11, 24))


# ── Avisos ──────────────────────────────────────────────────────────────────

def test_recurring_due_tomorrow_once(user_client, db, sent):
    client, uid = user_client
    client.post("/api/push/subscribe", json={**SUB, "endpoint": SUB["endpoint"] + "/rec"})
    today = date(2026, 11, 18)
    db.add(models.RecurringGroup(user_id=uid, normalized_name="netflix", display_name="Netflix",
                                 avg_amount=12.99, period_days=30, next_expected_date=today + timedelta(days=1)))
    db.add(models.RecurringGroup(user_id=uid, normalized_name="gym", display_name="Gimnasio",
                                 avg_amount=30, period_days=30, next_expected_date=today + timedelta(days=5)))
    db.commit()
    u = _user(db, uid)
    assert alerts.recurring_due(db, u, today) == 1
    assert sent[-1]["title"] == "Mañana se cobra Netflix" and sent[-1]["body"] == "12,99 €"
    assert alerts.recurring_due(db, u, today) == 0      # no se repite
    assert len(sent) == 1


def test_no_alerts_without_subscription(user_client, db, sent):
    _, uid = user_client
    today = date(2026, 11, 18)
    db.add(models.RecurringGroup(user_id=uid, normalized_name="x", display_name="X",
                                 avg_amount=5, next_expected_date=today + timedelta(days=1)))
    db.commit()
    assert alerts.recurring_due(db, _user(db, uid), today) == 0 and not sent


def test_budget_alert_at_80_then_100(user_client, db, sent):
    client, uid = user_client
    client.post("/api/push/subscribe", json={**SUB, "endpoint": SUB["endpoint"] + "/bud"})
    client.put("/api/auth/preferences", json={"month_start": 1})
    cat = system_category(db, "Supermercado")
    db.add(models.Budget(user_id=uid, category_id=cat.id, amount=100, is_recurring=True))
    db.commit()
    today = date(2026, 11, 18)
    add_tx(db, uid, date=date(2026, 11, 5), amount=-85, category_id=cat.id)
    db.expire_all()
    assert alerts.budget_alerts(db, _user(db, uid), today) == 1
    assert "Supermercado" in sent[-1]["title"]
    assert alerts.budget_alerts(db, _user(db, uid), today) == 0
    add_tx(db, uid, date=date(2026, 11, 6), amount=-30, category_id=cat.id)
    assert alerts.budget_alerts(db, _user(db, uid), today) == 1
    assert "superado" in sent[-1]["title"]


def test_payroll_notification_links_to_closed_cycle(user_client, db, sent):
    client, uid = user_client
    client.post("/api/push/subscribe", json={**SUB, "endpoint": SUB["endpoint"] + "/pay"})
    _payroll(db, uid, date(2026, 10, 28))
    _payroll(db, uid, date(2026, 11, 27), 1850)
    u = _user(db, uid)
    assert alerts.payroll_check(db, u, today=date(2026, 11, 28)) is True
    assert sent[-1]["title"] == "Nómina recibida · 1.850 €"
    assert sent[-1]["url"] == "/cierre?start=2026-10-28&end=2026-11-26"
    assert alerts.payroll_check(db, u, today=date(2026, 11, 28)) is False
    # Una nómina vieja no avisa
    assert alerts.payroll_check(db, u, today=date(2026, 12, 15)) is False


# ── Cierre del periodo ──────────────────────────────────────────────────────

def test_cycle_close_compares_with_previous(user_client, db):
    client, uid = user_client
    sup, rest = system_category(db, "Supermercado"), system_category(db, "Restaurante")
    _payroll(db, uid, date(2026, 9, 28), 2000)
    _payroll(db, uid, date(2026, 10, 28), 2100)
    _payroll(db, uid, date(2026, 11, 27), 2000)
    add_tx(db, uid, date=date(2026, 10, 5), amount=-100, category_id=sup.id)
    add_tx(db, uid, date=date(2026, 11, 5), amount=-160, category_id=sup.id)
    add_tx(db, uid, date=date(2026, 11, 6), amount=-40, category_id=rest.id)
    r = client.get("/api/dashboard/cycle-close", params={"start": "2026-10-28", "end": "2026-11-26"})
    assert r.status_code == 200, r.text
    b = r.json()
    assert (b["income"], b["spent"], b["saved"]) == (2100, 200, 1900)
    assert b["previous"]["start"] == "2026-09-28" and b["previous"]["spent"] == 100
    assert [t["name"] for t in b["top_rises"]] == ["Supermercado", "Restaurante"]
    assert b["top_rises"][0]["diff"] == 60


def test_cycle_close_rejects_bad_range(user_client):
    client, _ = user_client
    assert client.get("/api/dashboard/cycle-close", params={"start": "2026-11-01", "end": "2026-10-01"}).status_code == 400


# ── Gastos compartidos ──────────────────────────────────────────────────────

def test_shares_set_list_settle(user_client, db):
    client, uid = user_client
    tx = add_tx(db, uid, amount=-60, name="Cena")
    r = client.put(f"/api/shares/tx/{tx.id}", json={"shares": [{"person": "Ana", "amount": 20}, {"person": "Luis", "amount": 20}]})
    assert r.status_code == 200 and len(r.json()) == 2
    s = client.get("/api/shares").json()
    assert s["total_owed"] == 40 and {p["person"] for p in s["people"]} == {"Ana", "Luis"}
    ana = next(x for x in r.json() if x["person"] == "Ana")
    client.post(f"/api/shares/{ana['id']}/settle", json={"settled": True})
    assert client.get("/api/shares").json()["total_owed"] == 20
    # Rehacer el reparto mantiene pagado a quien ya pagó lo mismo
    r = client.put(f"/api/shares/tx/{tx.id}", json={"shares": [{"person": "ana", "amount": 20}, {"person": "Luis", "amount": 25}]})
    assert {x["person"]: x["settled"] for x in r.json()} == {"ana": True, "Luis": False}
    assert client.post("/api/shares/settle-person", json={"person": "LUIS"}).json()["settled"] == 1
    assert client.get("/api/shares").json()["total_owed"] == 0


def test_shares_cannot_exceed_expense_and_are_removed_with_tx(user_client, db):
    client, uid = user_client
    tx = add_tx(db, uid, amount=-30)
    assert client.put(f"/api/shares/tx/{tx.id}", json={"shares": [{"person": "Ana", "amount": 31}]}).status_code == 400
    assert client.put(f"/api/shares/tx/{tx.id}", json={"shares": [{"person": "Ana", "amount": 5}, {"person": "ana", "amount": 5}]}).status_code == 400
    client.put(f"/api/shares/tx/{tx.id}", json={"shares": [{"person": "Ana", "amount": 10}]})
    client.delete(f"/api/transactions/{tx.id}")
    assert client.get("/api/shares").json()["items"] == []


def test_shares_in_account_backup(user_client, db):
    from backend.services import account_backup
    client, uid = user_client
    tx = add_tx(db, uid, amount=-30)
    client.put(f"/api/shares/tx/{tx.id}", json={"shares": [{"person": "Ana", "amount": 10}]})
    doc = account_backup.build_backup(db, _user(db, uid))
    assert len(doc["tables"]["transaction_shares"]) == 1
    account_backup.restore(db, uid, doc)
    items = client.get("/api/shares").json()["items"]
    assert len(items) == 1 and items[0]["person"] == "Ana" and items[0]["tx_name"] == tx.name


# ── Aportación automática a objetivos ───────────────────────────────────────

def test_goal_auto_contribution_starts_with_next_payroll(user_client, db, sent):
    client, uid = user_client
    _payroll(db, uid, date(2026, 10, 28), 2000)
    g = client.post("/api/goals", json={"name": "Viaje", "type": "EURO_TARGET", "target_amount": 1000,
                                        "auto_mode": "percent", "auto_value": 10}).json()
    assert g["auto_mode"] == "percent" and g["auto_value"] == 10
    u = _user(db, uid)
    # La nómina que ya había entrado no cuenta
    alerts.payroll_check(db, u, today=date(2026, 10, 29))
    db.expire_all()
    assert db.get(models.Goal, g["id"]).current_amount == 0
    _payroll(db, uid, date(2026, 11, 27), 2500)
    alerts.payroll_check(db, u, today=date(2026, 11, 27))
    alerts.payroll_check(db, u, today=date(2026, 11, 28))     # no se repite
    db.expire_all()
    assert db.get(models.Goal, g["id"]).current_amount == 250


def test_goal_auto_contribution_capped_and_validated(user_client):
    client, _ = user_client
    g = client.post("/api/goals", json={"name": "A", "type": "EURO_TARGET", "target_amount": 100}).json()
    assert g["auto_mode"] is None
    assert client.put(f"/api/goals/{g['id']}", json={"auto_mode": "percent", "auto_value": 150}).status_code == 400
    assert client.put(f"/api/goals/{g['id']}", json={"auto_mode": "amount", "auto_value": 0}).status_code == 400
    assert client.put(f"/api/goals/{g['id']}", json={"auto_mode": "amount", "auto_value": 50}).json()["auto_mode"] == "amount"
    off = client.put(f"/api/goals/{g['id']}", json={"auto_mode": "off"}).json()
    assert off["auto_mode"] is None and off["auto_value"] is None
    goal = models.Goal(target_amount=100, current_amount=90, auto_mode="amount", auto_value=50)
    assert alerts.goal_contribution(goal, 2000) == 10


# ── Búsqueda ────────────────────────────────────────────────────────────────

def test_search_by_note_and_amount(user_client, db):
    client, uid = user_client
    add_tx(db, uid, name="Bar Pepe", amount=-12.5, note="cumple de Marta")
    add_tx(db, uid, name="Mercadona", amount=-1234.56)
    add_tx(db, uid, name="Otra", amount=-7)

    def names(q):
        return sorted(t["name"] for t in client.get("/api/transactions", params={"search": q}).json()["items"])
    assert names("marta") == ["Bar Pepe"]
    assert names("12,5") == ["Bar Pepe"]
    assert names("12.50") == ["Bar Pepe"]
    assert names("1.234,56 €") == ["Mercadona"]
    assert names("mercadona") == ["Mercadona"]
