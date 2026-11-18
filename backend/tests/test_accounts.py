from datetime import date

from .conftest import add_tx


def test_accounts_groups_by_source(user_client, db):
    client, uid = user_client
    add_tx(db, uid, source="bbva", amount=1000.0, type="CUSTOMER_INPAYMENT", date=date(2026, 11, 1))
    add_tx(db, uid, source="bbva", amount=-40.0, date=date(2026, 11, 5))
    add_tx(db, uid, source="trade_republic", amount=200.0, type="CUSTOMER_INPAYMENT")
    add_tx(db, uid, source=None, external_id=None, amount=-5.0)
    add_tx(db, uid, source="manual", amount=-15.0)

    r = client.get("/api/dashboard/accounts")
    assert r.status_code == 200, r.text
    by = {a["source"]: a for a in r.json()}
    assert by["bbva"]["label"] == "BBVA"
    assert by["bbva"]["balance"] == 960.0
    assert by["bbva"]["count"] == 2
    assert by["bbva"]["last_date"] == "2026-11-05"
    assert by["trade_republic"]["balance"] == 200.0
    # Sin origen se suma a manual
    assert by["manual"]["balance"] == -20.0
    assert by["manual"]["count"] == 2
    # El total coincide con el saldo de /overview
    total = round(sum(a["balance"] for a in r.json()), 2)
    assert total == client.get("/api/dashboard/overview").json()["balance"]


def test_accounts_is_per_user(user_client, db):
    client, uid = user_client
    assert client.get("/api/dashboard/accounts").json() == []
