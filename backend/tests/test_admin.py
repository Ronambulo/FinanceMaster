"""Panel de administración: recuentos por usuario, crear usuario, hacer admin,
restablecer contraseña y último acceso."""
from backend import models
from backend.tests.conftest import add_tx


def make_admin(db, user_id):
    u = db.get(models.User, user_id)
    u.is_admin = True
    db.commit()


def test_requires_admin(user_client):
    client, _ = user_client
    assert client.get("/api/admin/users").status_code == 403


def test_counts_and_stats(user_client, db):
    client, uid = user_client
    make_admin(db, uid)
    add_tx(db, uid, source="manual")
    add_tx(db, uid, source="n26")
    add_tx(db, uid, source="n26")
    me = next(u for u in client.get("/api/admin/users").json() if u["id"] == uid)
    assert me["tx_count"] == 3
    assert me["account_count"] == 2
    one = client.get(f"/api/admin/users/{uid}").json()
    assert one["tx_count"] == 3
    stats = client.get("/api/admin/stats").json()
    assert stats["db_size_bytes"] > 0
    assert stats["uptime_seconds"] >= 0
    assert client.get("/api/admin/users/999999").status_code == 404


def test_create_user_admin_and_password(user_client, db, client):
    admin, uid = user_client
    make_admin(db, uid)
    assert admin.post("/api/admin/users", json={"username": "nuevo1", "password": "123"}).status_code == 400
    r = admin.post("/api/admin/users", json={"username": "nuevo1", "password": "clave123", "display_name": "Nuevo"})
    assert r.status_code == 200, r.text
    new = r.json()
    assert new["display_name"] == "Nuevo" and new["is_admin"] is False and new["tx_count"] == 0
    assert admin.post("/api/admin/users", json={"username": "nuevo1", "password": "clave123"}).status_code == 400

    assert admin.put(f"/api/admin/users/{new['id']}/admin", json={"is_admin": True}).json()["is_admin"] is True
    assert admin.put(f"/api/admin/users/{uid}/admin", json={"is_admin": False}).status_code == 400

    assert admin.put(f"/api/admin/users/{new['id']}/password", json={"password": "x"}).status_code == 400
    assert admin.put(f"/api/admin/users/{new['id']}/password", json={"password": "otra1234"}).status_code == 200

    from fastapi.testclient import TestClient
    from backend.main import app
    fresh = TestClient(app)
    assert fresh.post("/api/auth/login", json={"email": "nuevo1", "password": "clave123"}).status_code == 401
    r = fresh.post("/api/auth/login", json={"email": "nuevo1", "password": "otra1234"})
    assert r.status_code == 200
    row = next(u for u in admin.get("/api/admin/users").json() if u["id"] == new["id"])
    assert row["last_login_at"] is not None
