import secrets
import hashlib
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from .. import models, auth
from ..database import get_db

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


class ApiTokenCreate(BaseModel):
    name: str = "Atajo de iOS"


class ApiTokenCreated(BaseModel):
    id: int
    name: str
    token: str  # valor en claro — solo se devuelve aquí, una vez
    created_at: datetime


class ApiTokenOut(BaseModel):
    id: int
    name: str
    token_prefix: str
    created_at: datetime
    last_used_at: Optional[datetime]

    model_config = {"from_attributes": True}


@router.get("/tokens", response_model=List[ApiTokenOut])
def list_tokens(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(models.ApiToken).filter(
        models.ApiToken.user_id == current_user.id
    ).order_by(models.ApiToken.created_at.desc()).all()


@router.post("/tokens", response_model=ApiTokenCreated, status_code=201)
def create_token(
    body: ApiTokenCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    raw = auth.API_TOKEN_PREFIX + secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()

    rec = models.ApiToken(
        user_id=current_user.id,
        name=body.name.strip() or "Token sin nombre",
        token_hash=token_hash,
        token_prefix=raw[:10],
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)

    return ApiTokenCreated(id=rec.id, name=rec.name, token=raw, created_at=rec.created_at)


@router.delete("/tokens/{token_id}", status_code=204)
def revoke_token(
    token_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    rec = db.query(models.ApiToken).filter(
        models.ApiToken.id == token_id,
        models.ApiToken.user_id == current_user.id,
    ).first()
    if not rec:
        raise HTTPException(404, "Token no encontrado")
    db.delete(rec)
    db.commit()
