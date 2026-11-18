"""La copia de la cuenta conserva fusiones, divisiones y confirmaciones."""
from backend import models
from backend.services import account_backup
from backend.tests.conftest import add_tx


def test_backup_keeps_merges_and_splits(user_client, db):
    c, uid = user_client
    a = add_tx(db, uid, amount=-40.0, name="Cena", external_id="a1")
    b = add_tx(db, uid, amount=25.0, name="Bizum Ana", type="TRANSFER_IN", external_id="b1")
    s = add_tx(db, uid, amount=-30.0, name="Super", external_id="s1")
    r = c.post("/api/transactions/link", json={"transaction_ids": [a.id, b.id]})
    assert r.status_code == 200, r.text
    r = c.post(f"/api/transactions/{s.id}/split", json={"parts": [
        {"category_id": None, "amount": 20.0}, {"category_id": None, "amount": 10.0}]})
    assert r.status_code == 200, r.text
    split_ok = True

    db.expire_all()
    user = db.query(models.User).get(uid)
    doc = account_backup.parse_backup(account_backup.backup_bytes(db, user))
    # Otro movimiento por medio para que los ids nuevos no coincidan con los viejos
    add_tx(db, uid + 1000, amount=-1.0, name="ajeno")
    account_backup.restore(db, uid, doc)
    db.expire_all()

    txs = db.query(models.Transaction).filter(models.Transaction.user_id == uid).all()
    cena = next(t for t in txs if t.name == "Cena")
    bizum = next(t for t in txs if t.name == "Bizum Ana")
    assert cena.link_group_id is not None and cena.link_group_id == bizum.link_group_id
    assert cena.is_link_primary and not bizum.is_link_primary
    assert cena.effective_amount == -15.0
    assert db.query(models.TransactionLink).get(cena.link_group_id).user_id == uid

    # El detalle sigue enseñando todo lo fusionado
    d = c.get(f"/api/transactions/{cena.id}").json()
    assert [t["name"] for t in d["linked_transactions"]] == ["Bizum Ana"]

    if split_ok:
        sup = next(t for t in txs if t.name == "Super" and t.split_parent_id is None)
        kids = [t for t in txs if t.split_parent_id is not None]
        assert kids and all(k.split_parent_id == sup.id for k in kids)


def test_confirm_clears_auto_flags(user_client, db):
    c, uid = user_client
    t = add_tx(db, uid, is_auto_categorized=True, external_id="c1")
    other = add_tx(db, uid + 1000, is_auto_categorized=True, external_id="c2")
    d = c.get(f"/api/transactions/{t.id}").json()
    assert d["is_auto_categorized"] is True and d["created_at"]
    assert c.post("/api/transactions/confirm", json={"ids": [t.id, other.id]}).json() == {"confirmed": 1}
    assert c.get(f"/api/transactions/{t.id}").json()["is_auto_categorized"] is False
    db.expire_all()
    assert db.get(models.Transaction, other.id).is_auto_categorized is True
