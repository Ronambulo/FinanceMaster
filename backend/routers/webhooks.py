import secrets
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from .. import models, auth
from ..database import get_db

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


class WebhookCreate(BaseModel):
    url: str
    events: List[str]


class WebhookOut(BaseModel):
    id: int
    url: str
    events: List[str]
    is_active: bool
    created_at: str

    model_config = {"from_attributes": True}


@router.get("", response_model=List[WebhookOut])
def list_webhooks(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    whs = db.query(models.Webhook).filter(models.Webhook.user_id == current_user.id).all()
    return [
        WebhookOut(
            id=wh.id,
            url=wh.url,
            events=json.loads(wh.events or "[]"),
            is_active=wh.is_active,
            created_at=wh.created_at.isoformat(),
        )
        for wh in whs
    ]


@router.post("", response_model=WebhookOut, status_code=201)
def create_webhook(
    body: WebhookCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    wh = models.Webhook(
        user_id=current_user.id,
        url=body.url,
        events=json.dumps(body.events),
        secret=secrets.token_hex(32),
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return WebhookOut(
        id=wh.id,
        url=wh.url,
        events=body.events,
        is_active=wh.is_active,
        created_at=wh.created_at.isoformat(),
    )


@router.delete("/{webhook_id}", status_code=204)
def delete_webhook(
    webhook_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    wh = db.query(models.Webhook).filter(
        models.Webhook.id == webhook_id,
        models.Webhook.user_id == current_user.id,
    ).first()
    if not wh:
        raise HTTPException(404, "Not found")
    db.delete(wh)
    db.commit()


@router.patch("/{webhook_id}/toggle")
def toggle_webhook(
    webhook_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    wh = db.query(models.Webhook).filter(
        models.Webhook.id == webhook_id,
        models.Webhook.user_id == current_user.id,
    ).first()
    if not wh:
        raise HTTPException(404, "Not found")
    wh.is_active = not wh.is_active
    db.commit()
    return {"is_active": wh.is_active}
