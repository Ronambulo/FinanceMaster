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


def test_manual_account_list_matches_balance(user_client, db):
    """Los movimientos que suman en el saldo de "Manual" salen al filtrar por esa cuenta."""
    client, uid = user_client
    add_tx(db, uid, source="", external_id=None, amount=1500.0, type="CUSTOMER_INPAYMENT", name="Vacío")
    add_tx(db, uid, source=None, external_id=None, amount=-5.0, name="Nulo")
    add_tx(db, uid, source="manual", amount=-15.0, name="Manual")
    # Fusionado con un principal de otra cuenta: suma en Manual y también debe verse.
    bank = add_tx(db, uid, source="bbva", amount=-30.0, name="Banco", link_group_id=7, is_link_primary=True)
    add_tx(db, uid, source="manual", amount=-30.0, name="Copia", link_group_id=7, is_link_primary=False)
    add_tx(db, uid, source="bbva", amount=-1.0, name="Otro")

    by = {a["source"]: a for a in client.get("/api/dashboard/accounts").json()}
    r = client.get("/api/transactions", params={"source": "manual", "page_size": 100})
    assert r.status_code == 200, r.text
    names = sorted(t["name"] for t in r.json()["items"])
    assert names == ["Copia", "Manual", "Nulo", "Vacío"]
    assert by["manual"]["count"] == 4

    # Sin filtro de cuenta la fusión sigue saliendo una sola vez (su principal).
    all_names = [t["name"] for t in client.get("/api/transactions", params={"page_size": 100}).json()["items"]]
    assert "Copia" not in all_names and "Banco" in all_names
    # Filtrando por el banco se ve el principal.
    bnames = sorted(t["name"] for t in client.get("/api/transactions", params={"source": "bbva"}).json()["items"])
    assert bnames == ["Banco", "Otro"]
    assert bank.id
