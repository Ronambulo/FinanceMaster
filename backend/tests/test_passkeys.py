"""Entrar con huella: registro y login con un autenticador simulado (P-256)."""
import hashlib
import json
import os
import struct

import cbor2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url

ORIGIN = "https://financemaster.example.com"
RP_ID = "financemaster.example.com"
H = {"Origin": ORIGIN, "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/604.1"}


class FakeAuthenticator:
    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.cred_id = os.urandom(16)
        self.count = 0

    def _cose(self):
        n = self.key.public_key().public_numbers()
        return cbor2.dumps({1: 2, 3: -7, -1: 1, -2: n.x.to_bytes(32, "big"), -3: n.y.to_bytes(32, "big")})

    def create(self, options, origin=ORIGIN, rp_id=RP_ID):
        cd = json.dumps({"type": "webauthn.create", "challenge": options["challenge"], "origin": origin, "crossOrigin": False}).encode()
        auth_data = (hashlib.sha256(rp_id.encode()).digest() + bytes([0x45]) + struct.pack(">I", 0)
                     + b"\0" * 16 + struct.pack(">H", len(self.cred_id)) + self.cred_id + self._cose())
        att = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        rid = bytes_to_base64url(self.cred_id)
        return {"id": rid, "rawId": rid, "type": "public-key",
                "response": {"clientDataJSON": bytes_to_base64url(cd), "attestationObject": bytes_to_base64url(att)}}

    def get(self, options, origin=ORIGIN, rp_id=RP_ID):
        self.count += 1
        cd = json.dumps({"type": "webauthn.get", "challenge": options["challenge"], "origin": origin, "crossOrigin": False}).encode()
        auth_data = hashlib.sha256(rp_id.encode()).digest() + bytes([0x05]) + struct.pack(">I", self.count)
        sig = self.key.sign(auth_data + hashlib.sha256(cd).digest(), ec.ECDSA(hashes.SHA256()))
        rid = bytes_to_base64url(self.cred_id)
        return {"id": rid, "rawId": rid, "type": "public-key",
                "response": {"clientDataJSON": bytes_to_base64url(cd), "authenticatorData": bytes_to_base64url(auth_data),
                             "signature": bytes_to_base64url(sig), "userHandle": None}}


def register(c, fa):
    r = c.post("/api/auth/passkeys/register/options", headers=H)
    assert r.status_code == 200, r.text
    opts = json.loads(r.json()["options"])
    assert opts["rp"]["id"] == RP_ID
    assert opts["authenticatorSelection"]["residentKey"] == "required"
    return c.post("/api/auth/passkeys/register", json={"credential": fa.create(opts)}, headers=H)


def login_with(client, fa, **kw):
    r = client.post("/api/auth/passkeys/login/options", headers=H)
    body = r.json()
    opts = json.loads(body["options"])
    return client.post("/api/auth/passkeys/login", json={"key": body["key"], "credential": fa.get(opts, **kw)}, headers=H)


def test_register_and_login(user_client, client):
    c, uid = user_client
    fa = FakeAuthenticator()
    r = register(c, fa)
    assert r.status_code == 200, r.text
    assert r.json()["device"] == "Safari · iPhone"
    assert len(c.get("/api/auth/passkeys").json()) == 1

    r = login_with(client, fa)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).json()["id"] == uid
    # Segunda vez, el contador sube
    assert login_with(client, fa).status_code == 200


def test_login_rejects_wrong_origin_reused_key_and_unknown(user_client, client):
    c, _ = user_client
    fa = FakeAuthenticator()
    assert register(c, fa).status_code == 200
    # Origen distinto al de la petición
    assert login_with(client, fa, origin="https://evil.example.org").status_code == 401
    # RP ID de otro dominio
    assert login_with(client, fa, rp_id="evil.example.org").status_code == 401
    # Llave desconocida
    assert login_with(client, FakeAuthenticator()).status_code == 401
    # El reto no se puede reutilizar
    r = client.post("/api/auth/passkeys/login/options", headers=H).json()
    cred = fa.get(json.loads(r["options"]))
    assert client.post("/api/auth/passkeys/login", json={"key": r["key"], "credential": cred}, headers=H).status_code == 200
    assert client.post("/api/auth/passkeys/login", json={"key": r["key"], "credential": cred}, headers=H).status_code == 400


def test_delete_and_blocked_user(user_client, client, db):
    from backend import models
    c, uid = user_client
    fa = FakeAuthenticator()
    pid = register(c, fa).json()["id"]
    # No se puede registrar la misma llave dos veces
    assert register(c, fa).status_code in (400, 409)
    u = db.get(models.User, uid)
    u.is_active = False
    db.commit()
    assert login_with(client, fa).status_code == 401
    u.is_active = True
    db.commit()
    assert c.delete(f"/api/auth/passkeys/{pid}").status_code == 200
    assert c.get("/api/auth/passkeys").json() == []
    assert login_with(client, fa).status_code == 401


def test_requires_origin(user_client):
    c, _ = user_client
    assert c.post("/api/auth/passkeys/register/options").status_code == 400


def test_two_devices(user_client, client):
    c, uid = user_client
    movil, pc = FakeAuthenticator(), FakeAuthenticator()
    assert register(c, movil).status_code == 200
    assert register(c, pc).status_code == 200
    assert len(c.get("/api/auth/passkeys").json()) == 2
    for fa in (movil, pc):
        r = login_with(client, fa)
        assert r.status_code == 200 and r.json()["user"]["id"] == uid


def test_app_origin_wins_over_rewritten_origin(user_client):
    """El túnel de VS Code reescribe Origin a localhost: manda el origen que declara la app."""
    c, _ = user_client
    tunnel = "https://abc-5173.eun1.devtunnels.ms"
    r = c.post("/api/auth/passkeys/register/options", headers={"Origin": "http://localhost:5173", "X-App-Origin": tunnel})
    assert json.loads(r.json()["options"])["rp"]["id"] == "abc-5173.eun1.devtunnels.ms"
