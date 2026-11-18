from datetime import date

from backend import models
from backend.routers.transactions import merchant_key
from backend.tests.conftest import add_tx, system_category


def test_merchant_key_normalizes_case_and_spaces():
    assert merchant_key("  MERCADONA   Valencia ") == "mercadona valencia"
    assert merchant_key(None) == ""


# ── Editar ──────────────────────────────────────────────────────────────────

def test_edit_manual_transaction_amount_date_type(user_client, db):
    client, uid = user_client
    tx = add_tx(db, uid)
    r = client.put(f"/api/transactions/{tx.id}", json={
        "amount": -25.5, "date": "2026-11-10", "type": "TRANSFER_OUTBOUND", "name": "Otro", "description": "nota",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["amount"] == -25.5 and body["date"] == "2026-11-10"
    assert body["type"] == "TRANSFER_OUTBOUND" and body["description"] == "nota"


def test_edit_imported_transaction_amount_rejected(user_client, db):
    client, uid = user_client
    tx = add_tx(db, uid, source="trade_republic", external_id="abc-1")
    assert client.put(f"/api/transactions/{tx.id}", json={"amount": -1}).status_code == 400
    # Pero el concepto, la nota o la categoría sí se pueden cambiar
    assert client.put(f"/api/transactions/{tx.id}", json={"name": "Nuevo"}).status_code == 200


def test_edit_rejects_unknown_type_and_foreign_category(user_client, db):
    client, uid = user_client
    tx = add_tx(db, uid)
    assert client.put(f"/api/transactions/{tx.id}", json={"type": "BUY"}).status_code == 400
    other = models.Category(user_id=uid + 999, name="Ajena", type=models.CategoryType.expense)
    db.add(other)
    db.commit()
    assert client.put(f"/api/transactions/{tx.id}", json={"category_id": other.id}).status_code == 404


# ── Cambio rápido de categoría ──────────────────────────────────────────────

def test_bulk_category_single_and_undo(user_client, db):
    client, uid = user_client
    cat = system_category(db, "Supermercado")
    prev_cat = system_category(db, "Restaurante")
    tx = add_tx(db, uid, category_id=prev_cat.id, is_auto_categorized=True)

    r = client.post("/api/transactions/bulk-category", json={"ids": [tx.id], "category_id": cat.id})
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["updated"] == 1 and res["rule_ids"] == []
    db.refresh(tx)
    assert tx.category_id == cat.id and tx.is_auto_categorized is False

    r = client.post("/api/transactions/bulk-category/undo", json={"previous": res["previous"], "rule_ids": res["rule_ids"]})
    assert r.status_code == 200 and r.json()["restored"] == 1
    db.refresh(tx)
    assert tx.category_id == prev_cat.id and tx.is_auto_categorized is True


def test_bulk_category_same_merchant_and_rule(user_client, db):
    client, uid = user_client
    cat = system_category(db, "Supermercado")
    a = add_tx(db, uid, name="Mercadona")
    b = add_tx(db, uid, name="  MERCADONA ")
    c = add_tx(db, uid, name="Lidl")

    sim = client.get(f"/api/transactions/{a.id}/similar").json()
    assert sim["count"] == 1

    r = client.post("/api/transactions/bulk-category", json={
        "ids": [a.id], "category_id": cat.id, "include_same_merchant": True, "create_rule": True,
    })
    res = r.json()
    assert res["updated"] == 2 and len(res["rule_ids"]) == 1
    for t in (a, b, c):
        db.refresh(t)
    assert a.category_id == cat.id and b.category_id == cat.id and c.category_id is None
    rule = db.get(models.CategoryRule, res["rule_ids"][0])
    assert rule.keyword == "Mercadona" and rule.user_id == uid

    # No duplica la regla si se repite
    r2 = client.post("/api/transactions/bulk-category", json={"ids": [a.id], "category_id": cat.id, "create_rule": True})
    assert r2.json()["rule_ids"] == []

    # Deshacer borra la regla creada
    client.post("/api/transactions/bulk-category/undo", json={"previous": res["previous"], "rule_ids": res["rule_ids"]})
    db.expire_all()
    assert db.get(models.CategoryRule, res["rule_ids"][0]) is None
    assert db.get(models.Transaction, b.id).category_id is None


def test_bulk_category_cannot_touch_other_users(user_client, db):
    client, uid = user_client
    cat = system_category(db, "Supermercado")
    foreign = add_tx(db, uid + 999)
    r = client.post("/api/transactions/bulk-category", json={"ids": [foreign.id], "category_id": cat.id})
    assert r.status_code == 404
    db.refresh(foreign)
    assert foreign.category_id is None
    # Ni deshaciendo con ids ajenos
    client.post("/api/transactions/bulk-category/undo", json={"previous": [{"id": foreign.id, "category_id": cat.id}]})
    db.refresh(foreign)
    assert foreign.category_id is None


# ── Agrupar ─────────────────────────────────────────────────────────────────

def test_groups_by_category_merchant_account_day(user_client, db):
    client, uid = user_client
    sup = system_category(db, "Supermercado")
    add_tx(db, uid, name="Mercadona", amount=-20, category_id=sup.id, date=date(2026, 11, 1))
    add_tx(db, uid, name="mercadona", amount=-5, category_id=sup.id, date=date(2026, 11, 2), source="bbva", external_id="bbva_x")
    add_tx(db, uid, name="Nómina", amount=1500, type="CUSTOMER_INPAYMENT", date=date(2026, 11, 2))
    add_tx(db, uid, name="Compra ETF", amount=-100, type="BUY", date=date(2026, 11, 2))  # fuera de totales

    q = "&date_from=2026-11-01&date_to=2026-11-30"
    cats = {g["label"]: g for g in client.get("/api/transactions/groups?by=category" + q).json()}
    assert cats["Supermercado"]["expense"] == 25 and cats["Supermercado"]["count"] == 2
    assert cats["Sin categoría"]["income"] == 1500

    merch = {g["key"]: g for g in client.get("/api/transactions/groups?by=merchant" + q).json()}
    assert merch["mercadona"]["count"] == 2
    assert "compra etf" not in merch

    accts = {g["key"]: g for g in client.get("/api/transactions/groups?by=account" + q).json()}
    assert accts["bbva"]["label"] == "BBVA" and accts["manual"]["income"] == 1500

    days = client.get("/api/transactions/groups?by=day" + q).json()
    assert [d["key"] for d in days] == ["2026-11-02", "2026-11-01"]

    assert client.get("/api/transactions/groups?by=nope").status_code == 422


def test_quick_endpoint_accepts_date(user_client):
    """Regresion: el campo `date` tapaba el tipo y rechazaba cualquier fecha."""
    client, _ = user_client
    r = client.post("/api/transactions/quick", json={"amount": "12,50", "name": "Cafe", "date": "2026-11-05"})
    assert r.status_code == 200, r.text
    assert r.json()["date"] == "2026-11-05" and r.json()["amount"] == -12.5


def test_groups_by_month_and_source_filter(user_client, db):
    client, uid = user_client
    add_tx(db, uid, name="Mercadona", amount=-20, date=date(2026, 10, 5))
    add_tx(db, uid, name="Mercadona", amount=-30, date=date(2026, 11, 5))
    add_tx(db, uid, name="Mercadona", amount=-7, date=date(2026, 11, 6), source="bbva", external_id="bbva_m")
    add_tx(db, uid, name="Legacy", amount=-1, date=date(2026, 11, 7), source=None)

    months = client.get("/api/transactions/groups?by=month&search=mercadona").json()
    assert [m["key"] for m in months] == ["2026-11", "2026-10"]
    assert months[0]["expense"] == 37 and months[0]["count"] == 2

    only_bbva = client.get("/api/transactions/groups?by=month&source=bbva").json()
    assert [(m["key"], m["count"]) for m in only_bbva] == [("2026-11", 1)]

    lst = client.get("/api/transactions?source=manual").json()
    names = sorted(t["name"] for t in lst["items"])
    assert names == ["Legacy", "Mercadona", "Mercadona"]


def test_hide_transfers_and_uncategorized_filter(user_client, db):
    client, uid = user_client
    sup = system_category(db, "Supermercado")
    add_tx(db, uid, name="Mercadona", amount=-20, category_id=sup.id)
    add_tx(db, uid, name="A Trade Republic", amount=-300, is_internal_transfer=True)

    assert client.get("/api/transactions").json()["total"] == 2
    assert client.get("/api/transactions?hide_transfers=true").json()["total"] == 1
    groups = client.get("/api/transactions/groups?by=category&hide_transfers=true").json()
    assert [g["label"] for g in groups] == ["Supermercado"]

    uncategorized = client.get("/api/transactions?category_id=0").json()["items"]
    assert [t["name"] for t in uncategorized] == ["A Trade Republic"]


# ── Filtros (hoja "Filtros") ────────────────────────────────────────────────

def test_list_filters_multi_source_categories_amount_and_transfers(user_client, db):
    client, uid = user_client
    food = system_category(db, "Supermercado")
    fun = system_category(db, "Restaurante")
    add_tx(db, uid, name="A", amount=-10, source="n26", category_id=food.id)
    add_tx(db, uid, name="B", amount=-50, source="revolut", category_id=fun.id)
    add_tx(db, uid, name="C", amount=-80, source="bbva")
    add_tx(db, uid, name="T", amount=-100, source="n26", is_internal_transfer=True)

    def names(**params):
        r = client.get("/api/transactions", params={"page_size": 200, **params})
        assert r.status_code == 200, r.text
        return sorted(t["name"] for t in r.json()["items"])

    assert names(source="n26,revolut") == ["A", "B", "T"]
    assert names(category_ids=f"{food.id},0") == ["A", "C", "T"]
    assert names(amount_min=20, amount_max=90) == ["B", "C"]
    assert names(type_group="transfer") == ["T"]
    # Lo de antes sigue igual
    assert names(source="bbva") == ["C"]


# ── Detalle, nota y dividir ─────────────────────────────────────────────────

def test_get_single_transaction_and_note(user_client, db):
    client, uid = user_client
    tx = add_tx(db, uid, source="n26", external_id="n-1")
    r = client.get(f"/api/transactions/{tx.id}")
    assert r.status_code == 200 and r.json()["id"] == tx.id and r.json()["split_count"] == 0
    # La nota se puede poner también en movimientos importados
    r = client.put(f"/api/transactions/{tx.id}", json={"note": "Cena con Ana"})
    assert r.status_code == 200 and r.json()["note"] == "Cena con Ana"
    assert client.get("/api/transactions/999999").status_code == 404


def test_split_transaction_and_undo(user_client, db):
    client, uid = user_client
    comida = system_category(db, "Supermercado")
    regalos = system_category(db, "Restaurante")
    tx = add_tx(db, uid, amount=-42.15, source="n26", external_id="n-2")
    # Tienen que cuadrar
    bad = client.post(f"/api/transactions/{tx.id}/split", json={"parts": [{"category_id": comida.id, "amount": 30}, {"category_id": regalos.id, "amount": 10}]})
    assert bad.status_code == 400
    r = client.post(f"/api/transactions/{tx.id}/split", json={"parts": [{"category_id": comida.id, "amount": 30.15}, {"category_id": regalos.id, "amount": 12}]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["effective_amount"] == -30.15 and body["amount"] == -42.15 and body["split_count"] == 1
    assert [p["amount"] for p in client.get(f"/api/transactions/{tx.id}").json()["split_parts"]] == [30.15, 12]
    child = db.query(models.Transaction).filter(models.Transaction.split_parent_id == tx.id).one()
    assert child.amount == -12 and child.category_id == regalos.id
    # Una sola parte deshace la división
    r = client.post(f"/api/transactions/{tx.id}/split", json={"parts": [{"category_id": comida.id, "amount": 42.15}]})
    assert r.status_code == 200 and r.json()["effective_amount"] is None and r.json()["split_count"] == 0
    db.expire_all()
    assert db.query(models.Transaction).filter(models.Transaction.split_parent_id == tx.id).count() == 0


def test_delete_split_parent_removes_parts(user_client, db):
    client, uid = user_client
    cat = system_category(db, "Supermercado")
    tid = add_tx(db, uid, amount=-20.0).id
    client.post(f"/api/transactions/{tid}/split", json={"parts": [{"category_id": cat.id, "amount": 10}, {"category_id": cat.id, "amount": 10}]})
    assert client.delete(f"/api/transactions/{tid}").status_code == 200
    db.expire_all()
    assert db.query(models.Transaction).filter(models.Transaction.split_parent_id == tid).count() == 0


# ── Añadir y traspaso ───────────────────────────────────────────────────────

def test_create_manual_with_account_and_note_stays_editable(user_client):
    client, _ = user_client
    r = client.post("/api/transactions", json={
        "date": "2026-11-12", "type": "CARD_TRANSACTION", "name": "Mercadona", "amount": -24.9,
        "source": "n26", "note": "  compra semanal ",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "n26" and body["note"] == "compra semanal" and body["is_manual"] is True
    # Aunque esté en una cuenta de banco, se creó a mano: el importe se puede cambiar
    assert client.put(f"/api/transactions/{body['id']}", json={"amount": -30}).status_code == 200


def test_create_manual_defaults_to_manual_source(user_client):
    client, _ = user_client
    r = client.post("/api/transactions", json={"date": "2026-11-12", "type": "CARD_TRANSACTION", "amount": -3})
    assert r.status_code == 200 and r.json()["source"] == "manual"


def test_transfer_creates_out_and_in(user_client):
    client, _ = user_client
    r = client.post("/api/transactions/transfer", json={
        "amount": 300, "date": "2026-11-15", "from_source": "n26", "to_source": "trade_republic",
    })
    assert r.status_code == 200, r.text
    out, inn = r.json()
    assert out["amount"] == -300 and out["source"] == "n26" and out["is_internal_transfer"]
    assert inn["amount"] == 300 and inn["source"] == "trade_republic" and inn["is_internal_transfer"]
    assert out["name"] == "A Trade Republic"


def test_transfer_rejects_same_account_and_zero(user_client):
    client, _ = user_client
    base = {"date": "2026-11-15", "from_source": "n26", "to_source": "n26", "amount": 10}
    assert client.post("/api/transactions/transfer", json=base).status_code == 400
    assert client.post("/api/transactions/transfer", json={**base, "to_source": "revolut", "amount": 0}).status_code == 400
