from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth, models
from ..database import get_db
from ..services import notify

router = APIRouter(prefix="/api/push", tags=["push"])


class SubKeys(BaseModel):
    p256dh: str
    auth: str


class Subscription(BaseModel):
    endpoint: str
    keys: SubKeys
    device: Optional[str] = None


class Unsubscribe(BaseModel):
    endpoint: str


@router.get("/key")
def vapid_key(current_user: models.User = Depends(auth.get_current_user)):
    return {"key": notify.public_key()}


@router.get("/status")
def push_status(
    endpoint: Optional[str] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(models.PushSubscription).filter(models.PushSubscription.user_id == current_user.id)
    return {
        "devices": q.count(),
        "this_device": bool(endpoint) and q.filter(models.PushSubscription.endpoint == endpoint).first() is not None,
    }


@router.post("/subscribe")
def subscribe(
    data: Subscription,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not data.endpoint.startswith("https://"):
        raise HTTPException(400, "Suscripción no válida")
    sub = db.query(models.PushSubscription).filter(models.PushSubscription.endpoint == data.endpoint).first()
    if sub:
        # El mismo navegador puede pasar a otra cuenta: la suscripción es de quien la registra ahora.
        sub.user_id = current_user.id
        sub.p256dh, sub.auth = data.keys.p256dh, data.keys.auth
        sub.device = data.device or sub.device
    else:
        db.add(models.PushSubscription(user_id=current_user.id, endpoint=data.endpoint,
                                       p256dh=data.keys.p256dh, auth=data.keys.auth, device=data.device))
    db.commit()
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(
    data: Unsubscribe,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    db.query(models.PushSubscription).filter(
        models.PushSubscription.user_id == current_user.id,
        models.PushSubscription.endpoint == data.endpoint,
    ).delete(synchronize_session=False)
    db.commit()
    return {"ok": True}


@router.post("/test")
def test_push(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    sent, failed = notify.send(db, current_user.id, "Notificaciones activadas",
                               "Así te llegarán los avisos de FinanceMaster", url="/ajustes", tag="test")
    return {"sent": sent, "failed": failed}
