"""Enlaces de invitación: crear, usar una sola vez, caducar y borrar."""
from datetime import datetime, timedelta
from backend import models
from backend.tests.test_admin import make_admin


def test_invites_require_admin(user_client):
    client, _ = user_client
    assert client.post("/api/admin/invites", json={}).status_code == 403
    assert client.get("/api/admin/invites").status_code == 403


def test_invite_flow(user_client, db):
    client, uid = user_client
    make_admin(db, uid)
    inv = client.post("/api/admin/invites", json={"display_name": "  Lucía "}).json()
    assert inv["display_name"] == "Lucía" and len(inv["token"]) > 20
    assert [i["id"] for i in client.get("/api/admin/invites").json()] == [inv["id"]]

    admin_auth = client.headers.pop("Authorization")
    assert client.get(f"/api/auth/invite/{inv['token']}").json() == {"display_name": "Lucía"}
    assert client.get("/api/auth/invite/nope").status_code == 404
    r = client.post("/api/auth/register", json={"username": "lucia_inv", "password": "secret123",
                                                "display_name": "Lucía", "invite": inv["token"]})
    assert r.status_code == 200, r.text
    # Ya no vale otra vez
    assert client.get(f"/api/auth/invite/{inv['token']}").status_code == 404
    r = client.post("/api/auth/register", json={"username": "otro_inv", "password": "secret123", "invite": inv["token"]})
    assert r.status_code == 400
    assert not db.query(models.User).filter(models.User.username == "otro_inv").first()

    client.headers["Authorization"] = admin_auth
    assert client.get("/api/admin/invites").json() == []


def test_invite_expires_and_delete(user_client, db):
    client, uid = user_client
    make_admin(db, uid)
    a = client.post("/api/admin/invites", json={}).json()
    b = client.post("/api/admin/invites", json={}).json()
    row = db.get(models.Invite, a["id"])
    row.expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()
    assert [i["id"] for i in client.get("/api/admin/invites").json()] == [b["id"]]
    assert client.get(f"/api/auth/invite/{a['token']}").status_code == 404
    assert client.delete(f"/api/admin/invites/{b['id']}").status_code == 204
    assert client.get("/api/admin/invites").json() == []
    assert client.delete(f"/api/admin/invites/{b['id']}").status_code == 404
