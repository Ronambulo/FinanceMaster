"""Sesiones abiertas, registro de actividad, avisos y copias del servidor."""
import os
import tempfile

from backend import models
from backend.services import activity, backups


def make_admin(db, user_id):
    u = db.get(models.User, user_id)
    u.is_admin = True
    db.commit()


def login(client, username, ua="Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537"):
    r = client.post("/api/auth/login", json={"email": username, "password": "secret123"}, headers={"User-Agent": ua})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def test_sessions_list_close_and_logout(user_client, client):
    c, uid = user_client
    me = c.get("/api/auth/me").json()
    other = login(client, me["username"])
    sessions = c.get("/api/auth/sessions").json()
    assert len(sessions) == 2
    assert sessions[0]["current"] is True
    second = next(s for s in sessions if not s["current"])
    assert second["device"] == "Chrome · Windows"

    # Cerrar la otra sesión invalida su token
    assert c.delete(f"/api/auth/sessions/{second['id']}").status_code == 200
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {other}"}).status_code == 401
    assert len(c.get("/api/auth/sessions").json()) == 1

    # Cerrar las demás y logout
    third = login(client, me["username"])
    assert c.post("/api/auth/sessions/close-others").json()["closed"] == 1
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {third}"}).status_code == 401
    assert c.post("/api/auth/logout").status_code == 200
    assert c.get("/api/auth/me").status_code == 401


def test_legacy_token_without_jti_still_works(user_client, client):
    from backend import auth
    _, uid = user_client
    tok = auth.create_access_token({"sub": str(uid)})
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 200


def test_password_change_closes_other_sessions(user_client, client):
    c, _ = user_client
    me = c.get("/api/auth/me").json()
    other = login(client, me["username"])
    r = c.put("/api/auth/password", json={"current_password": "secret123", "new_password": "secret456"})
    assert r.status_code == 200, r.text
    assert c.get("/api/auth/me").status_code == 200
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {other}"}).status_code == 401


def test_activity_and_notices(user_client, client, db):
    c, uid = user_client
    make_admin(db, uid)
    me = c.get("/api/auth/me").json()
    for _ in range(activity.FAILED_LOGIN_ALERT):
        client.post("/api/auth/login", json={"email": me["username"], "password": "mal"})
    log = c.get("/api/admin/activity").json()
    assert log[0]["action"] == "login_failed"
    assert log[0]["label"] == "Intento de acceso fallido"
    assert any(r["action"] == "register" and r["user_id"] == uid for r in log)

    n = c.get("/api/admin/notices").json()
    assert n["unread"] >= 1
    assert n["items"][0]["title"] == "Varios accesos fallidos"
    assert c.get("/api/admin/stats").json()["unread_notices"] >= 1
    c.post("/api/admin/notices/read")
    assert c.get("/api/admin/notices").json()["unread"] == 0


def test_device_label():
    assert activity.device_label("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17 Mobile Safari/604") == "Safari · iPhone"
    assert activity.device_label("Mozilla/5.0 (Macintosh) AppleWebKit Chrome/120 Safari/537 Edg/120") == "Edge · Mac"
    assert activity.device_label(None) == "Dispositivo desconocido"


def test_backups(user_client, db, monkeypatch):
    c, uid = user_client
    make_admin(db, uid)
    monkeypatch.setenv("BACKUP_DIR", tempfile.mkdtemp(prefix="fm-bk-"))
    st = c.get("/api/admin/backups").json()
    assert st["enabled"] is True and st["hour"] == 3 and st["items"] == []
    st = c.post("/api/admin/backups").json()
    assert len(st["items"]) == 1
    name = st["items"][0]["name"]
    assert backups.NAME_RE.match(name)
    r = c.get(f"/api/admin/backups/{name}")
    assert r.status_code == 200 and r.content[:15] == b"SQLite format 3"
    assert c.get("/api/admin/backups/..%2Fsecret.db").status_code == 404

    st = c.put("/api/admin/backups", json={"enabled": False, "keep": 3}).json()
    assert st["enabled"] is False and st["keep"] == 3
    assert c.put("/api/admin/backups", json={"keep": 5}).status_code == 400

    # Se conservan solo las `keep` más recientes
    from datetime import datetime, timedelta
    for i in range(4):
        backups.make_backup(now=datetime(2026, 1, 1) + timedelta(days=i))
    assert len(backups.list_backups()) == 3
    assert any(r["action"] == "backup" for r in c.get("/api/admin/activity").json())
