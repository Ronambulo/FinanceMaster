"""Entrar con huella (WebAuthn / passkeys).

El navegador solo deja usarlo en HTTPS (o localhost). El dominio (RP ID) se
toma de la cabecera Origin de la petición, salvo que se fije con
WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN. Las llaves son "residentes", así que en el
login no hace falta escribir el usuario."""
import os
import secrets
import time
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from webauthn import (
    generate_authentication_options, generate_registration_options, options_to_json,
    verify_authentication_response, verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria, PublicKeyCredentialDescriptor, ResidentKeyRequirement,
    UserVerificationRequirement,
)

from .. import auth, models, schemas
from ..database import get_db
from ..services import activity

router = APIRouter(prefix="/api/auth/passkeys", tags=["passkeys"])

RP_NAME = "FinanceMaster"
CHALLENGE_TTL = 300  # s
_challenges: dict = {}  # key → (challenge, user_id | None, expires)


def _put(key: str, challenge: bytes, user_id: Optional[int] = None) -> None:
    now = time.time()
    for k in [k for k, v in _challenges.items() if v[2] < now]:
        _challenges.pop(k, None)
    _challenges[key] = (challenge, user_id, now + CHALLENGE_TTL)


def _take(key: str):
    v = _challenges.pop(key, None)
    if not v or v[2] < time.time():
        raise HTTPException(status_code=400, detail="La solicitud ha caducado, inténtalo de nuevo")
    return v


def _rp(request: Request) -> tuple:
    # X-App-Origin lo manda la propia app: el túnel de VS Code o un proxy pueden
    # reescribir Origin a localhost y entonces el RP ID no coincide con la página.
    origin = (os.getenv("WEBAUTHN_ORIGIN") or request.headers.get("x-app-origin")
              or request.headers.get("origin"))
    if not origin:
        raise HTTPException(status_code=400, detail="Falta el origen")
    host = urlparse(origin).hostname
    if not host:
        raise HTTPException(status_code=400, detail="Origen no válido")
    return os.getenv("WEBAUTHN_RP_ID") or host, origin


def _out(p: models.Passkey) -> dict:
    return {"id": p.id, "credential_id": p.credential_id, "device": p.device,
            "created_at": p.created_at, "last_used_at": p.last_used_at}


class CredentialIn(BaseModel):
    credential: dict


class LoginVerifyIn(BaseModel):
    key: str
    credential: dict


@router.get("")
def list_passkeys(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    rows = db.query(models.Passkey).filter(models.Passkey.user_id == current_user.id).order_by(models.Passkey.created_at.desc()).all()
    return [_out(p) for p in rows]


@router.post("/register/options")
def register_options(request: Request, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    rp_id, _ = _rp(request)
    existing = db.query(models.Passkey).filter(models.Passkey.user_id == current_user.id).all()
    opts = generate_registration_options(
        rp_id=rp_id, rp_name=RP_NAME,
        user_id=str(current_user.id).encode(),
        user_name=current_user.username,
        user_display_name=current_user.display_name or current_user.username,
        exclude_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(p.credential_id)) for p in existing],
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    _put(f"reg:{current_user.id}", opts.challenge, current_user.id)
    return {"options": options_to_json(opts)}


@router.post("/register")
def register(data: CredentialIn, request: Request, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    rp_id, origin = _rp(request)
    challenge, _, _ = _take(f"reg:{current_user.id}")
    try:
        v = verify_registration_response(
            credential=data.credential, expected_challenge=challenge,
            expected_rp_id=rp_id, expected_origin=origin, require_user_verification=True,
        )
    except Exception:
        raise HTTPException(status_code=400, detail="No se pudo registrar la huella")
    cid = bytes_to_base64url(v.credential_id)
    if db.query(models.Passkey).filter(models.Passkey.credential_id == cid).first():
        raise HTTPException(status_code=409, detail="Esta huella ya está registrada")
    p = models.Passkey(user_id=current_user.id, credential_id=cid, public_key=v.credential_public_key,
                       sign_count=v.sign_count, device=activity.device_label(request.headers.get("user-agent")))
    db.add(p)
    db.commit()
    db.refresh(p)
    activity.record(db, "passkey_added", user=current_user, detail=p.device, request=request)
    return _out(p)


@router.delete("/{passkey_id}")
def delete_passkey(passkey_id: int, request: Request, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(get_db)):
    p = db.query(models.Passkey).filter(models.Passkey.id == passkey_id, models.Passkey.user_id == current_user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="No encontrada")
    device = p.device
    db.delete(p)
    db.commit()
    activity.record(db, "passkey_removed", user=current_user, detail=device, request=request)
    return {"ok": True}


@router.post("/login/options")
def login_options(request: Request):
    rp_id, _ = _rp(request)
    opts = generate_authentication_options(rp_id=rp_id, user_verification=UserVerificationRequirement.REQUIRED)
    key = secrets.token_urlsafe(16)
    _put(f"auth:{key}", opts.challenge)
    return {"key": key, "options": options_to_json(opts)}


@router.post("/login", response_model=schemas.Token)
def login(data: LoginVerifyIn, request: Request, db: Session = Depends(get_db)):
    rp_id, origin = _rp(request)
    challenge, _, _ = _take(f"auth:{data.key}")
    cid = data.credential.get("rawId") or data.credential.get("id")
    p = db.query(models.Passkey).filter(models.Passkey.credential_id == cid).first() if isinstance(cid, str) else None
    if not p:
        raise HTTPException(status_code=401, detail="Esta huella no está vinculada a ninguna cuenta")
    user = db.get(models.User, p.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    try:
        v = verify_authentication_response(
            credential=data.credential, expected_challenge=challenge,
            expected_rp_id=rp_id, expected_origin=origin,
            credential_public_key=p.public_key, credential_current_sign_count=p.sign_count or 0,
            require_user_verification=True,
        )
    except Exception:
        activity.failed_login(db, user.username, user, request)
        raise HTTPException(status_code=401, detail="No se pudo verificar la huella")
    p.sign_count = v.new_sign_count
    p.last_used_at = user.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    token = auth.issue_token(db, user, request)
    activity.record(db, "login", user=user, detail="Con huella", request=request)
    return schemas.Token(access_token=token, token_type="bearer", user=schemas.UserOut.model_validate(user))
