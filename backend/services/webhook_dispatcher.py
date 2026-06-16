import hmac
import hashlib
import json
import httpx
from datetime import datetime
from sqlalchemy.orm import Session
from .. import models

SUPPORTED_EVENTS = {
    "transaction.created",
    "transaction.imported",
    "recurring.detected",
    "goal.completed",
    "achievement.unlocked",
}


def dispatch_event(db: Session, user_id: int, event: str, payload: dict):
    """Fire all active webhooks for this user+event (best-effort, non-blocking)."""
    webhooks = db.query(models.Webhook).filter(
        models.Webhook.user_id == user_id,
        models.Webhook.is_active == True,
    ).all()

    for wh in webhooks:
        events = json.loads(wh.events or "[]")
        if event not in events:
            continue

        body = json.dumps({
            "event": event,
            "timestamp": datetime.utcnow().isoformat(),
            "data": payload,
        })

        sig = hmac.new(
            wh.secret.encode(),
            body.encode(),
            hashlib.sha256,
        ).hexdigest()

        try:
            httpx.post(
                wh.url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-FinanceMaster-Signature": f"sha256={sig}",
                    "X-FinanceMaster-Event": event,
                },
                timeout=5.0,
            )
        except Exception:
            pass  # best-effort — never fail the main request
