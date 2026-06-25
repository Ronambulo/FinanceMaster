import base64
import hashlib
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth, models
from ..database import get_db
from ..services.myinvestor_api import (
    MyInvestorAPI,
    MyInvestorError,
    get_client,
    remove_client,
    set_client,
)

router = APIRouter(prefix="/api/mi", tags=["myinvestor"])


# ── Encryption (same key as TR) ───────────────────────────────────────────────

def _fernet():
    from cryptography.fernet import Fernet
    secret = os.environ.get("SECRET_KEY", "dev-secret-key-not-for-production")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def _encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def _decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()


def _device_id(user_id: int) -> str:
    """Deterministic UUID per user so reconnects don't need a new OTP."""
    return str(uuid.UUID(hashlib.md5(f"fm-mi-{user_id}".encode()).hexdigest()))


def _load_conn(db: Session, user_id: int) -> models.BankConnection | None:
    return db.query(models.BankConnection).filter(
        models.BankConnection.user_id == user_id,
        models.BankConnection.bank_name == "myinvestor",
    ).first()


def _save_conn(db: Session, user_id: int, username: str, password: str, connected: bool):
    conn = _load_conn(db, user_id)
    if not conn:
        conn = models.BankConnection(user_id=user_id, bank_name="myinvestor")
        db.add(conn)
    conn.encrypted_phone = _encrypt(username)
    conn.encrypted_pin = _encrypt(password)
    if connected:
        conn.last_connected_at = datetime.utcnow()
    db.commit()


# ── Schemas ───────────────────────────────────────────────────────────────────

class MIConnectRequest(BaseModel):
    username: str
    password: str


class MIOTPRequest(BaseModel):
    request_id: str
    code: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
def mi_status(current_user: models.User = Depends(auth.get_current_user)):
    client = get_client(current_user.id)
    return {
        "connected": client is not None and client.is_connected(),
        "last_sync": client.last_sync().isoformat() if client and client.last_sync() else None,
    }


@router.post("/auto-connect")
def mi_auto_connect(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    client = get_client(current_user.id)
    if client and client.is_connected():
        return {"status": "connected"}

    conn = _load_conn(db, current_user.id)
    if not conn or not conn.encrypted_phone:
        return {"status": "no_credentials"}

    try:
        username = _decrypt(conn.encrypted_phone)
        password = _decrypt(conn.encrypted_pin)
    except Exception:
        return {"status": "no_credentials"}

    try:
        client = MyInvestorAPI(device_id=_device_id(current_user.id))
        result = client.login(username, password)
        set_client(current_user.id, client)

        if result["status"] == "connected":
            conn.last_connected_at = datetime.utcnow()
            db.commit()

        return result
    except MyInvestorError as e:
        return {"status": "error", "message": str(e)}


@router.post("/connect")
def mi_connect(
    body: MIConnectRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    client = MyInvestorAPI(device_id=_device_id(current_user.id))
    try:
        result = client.login(body.username, body.password)
        set_client(current_user.id, client)
        _save_conn(db, current_user.id, body.username, body.password, result["status"] == "connected")
        return result
    except MyInvestorError as e:
        raise HTTPException(503, str(e))


@router.post("/verify")
def mi_verify(
    body: MIOTPRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    client = get_client(current_user.id)
    if not client:
        raise HTTPException(400, "No hay sesión activa. Llama a /connect primero.")
    try:
        result = client.verify_otp(body.request_id, body.code)
        conn = _load_conn(db, current_user.id)
        if conn:
            conn.last_connected_at = datetime.utcnow()
            db.commit()
        return result
    except MyInvestorError as e:
        raise HTTPException(503, str(e))


@router.get("/accounts")
def mi_accounts(current_user: models.User = Depends(auth.get_current_user)):
    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a MyInvestor")
    try:
        return client.get_all_accounts()
    except MyInvestorError as e:
        raise HTTPException(503, str(e))


@router.get("/portfolio-history")
def mi_portfolio_history(
    period: str = "DESDE_INICIO",
    current_user: models.User = Depends(auth.get_current_user),
):
    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a MyInvestor")
    try:
        return client.get_portfolio_history(period)
    except MyInvestorError as e:
        raise HTTPException(503, str(e))


@router.post("/disconnect")
def mi_disconnect(current_user: models.User = Depends(auth.get_current_user)):
    remove_client(current_user.id)
    return {"ok": True}
