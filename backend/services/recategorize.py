"""Recategorización silenciosa en segundo plano.

- Vuelve a pasar el categorizador por los movimientos que NO están confirmados
  (automáticos o sin categoría); nunca toca los que el usuario eligió a mano.
- Si el usuario tiene IA y el módulo activado, pide a la IA lo que siga sin
  categoría, por lotes; queda marcado para revisión.
- Descarga los logos de las marcas que aparecen en sus movimientos.
"""
import asyncio
import json
import logging
import re
import threading
import time
from typing import Optional

from sqlalchemy.orm import Session

from .. import models
from ..database import SessionLocal
from .categorizer import GENERIC_CATEGORIES, auto_categorize, forget_history

log = logging.getLogger(__name__)

AI_BATCH = 30
AI_MAX_PER_RUN = 90
_SKIP_TYPES = {"BUY", "SELL", "TAX", "DIVIDEND", "INTEREST_PAYMENT", "STOCKPERK", "BENEFITS_SAVEBACK"}
_TRANSFER_TYPES = {"TRANSFER_INBOUND", "TRANSFER_INSTANT_INBOUND", "TRANSFER_OUTBOUND", "TRANSFER_INSTANT_OUTBOUND"}
# Movimientos que la IA ya no supo categorizar en este proceso: no se repiten.
_ai_tried: set[int] = set()


def _generic_ids(db: Session) -> set[int]:
    return {cid for (cid,) in db.query(models.Category.id).filter(models.Category.name.in_(GENERIC_CATEGORIES)).all()}


def _uncategorized_ids(db: Session) -> set[int]:
    return {cid for (cid,) in db.query(models.Category.id).filter(
        models.Category.name.in_(["Sin categorizar", "Compra con Tarjeta"])).all()}


def _pending(db: Session, user_id: int):
    """Movimientos no confirmados: automáticos (no IA) o sin categoría, y no puestos a mano."""
    T = models.Transaction
    uncats = _uncategorized_ids(db)
    q = db.query(T).filter(
        T.user_id == user_id,
        T.split_parent_id == None,  # noqa: E711
        (T.is_ai_categorized == False) | (T.is_ai_categorized == None),  # noqa: E711,E712
        (T.category_source == None) | (T.category_source != "manual"),  # noqa: E711
        (T.is_internal_transfer == False) | (T.is_internal_transfer == None),  # noqa: E711,E712
    )
    return [t for t in q.all() if t.is_auto_categorized or t.category_id is None or t.category_id in uncats]


def plan(db: Session, user_id: int) -> list[tuple[models.Transaction, Optional[int], str]]:
    """[(tx, nueva categoría, fuente)] para los que cambiarían."""
    forget_history(db)
    out = []
    for t in _pending(db, user_id):
        res = auto_categorize(db, user_id, t.type, t.name, t.description, t.mcc_code,
                              t.counterparty_name, t.amount, None)
        cid, is_auto, _ = res
        if res.source == "fallback" or not cid:
            continue
        if cid != t.category_id or (t.category_source or "") != res.source:
            out.append((t, cid, res.source))
    return out


def recategorize_user(db: Session, user_id: int) -> int:
    changes = plan(db, user_id)
    for t, cid, src in changes:
        t.category_id = cid
        t.is_auto_categorized = True
        t.category_source = src
    db.commit()
    return sum(1 for t, cid, _ in changes)


# ── IA ──────────────────────────────────────────────────────────────────────

def _ai_allowed(user: models.User) -> bool:
    if not (user.is_admin or user.ai_enabled):
        return False
    from .preferences import resolve
    return bool(resolve(user.preferences).get("modules", {}).get("ai"))


def ai_categorize_user(db: Session, user: models.User) -> int:
    if not _ai_allowed(user):
        return 0
    from ..routers.ai import FAST_PROVIDERS, _call_with_fallback, _get_available_providers
    if not _get_available_providers(FAST_PROVIDERS):
        return 0
    uncats = _uncategorized_ids(db)
    todo = [
        t for t in _pending(db, user.id)
        if (t.category_id is None or t.category_id in uncats)
        and t.id not in _ai_tried and t.type not in _SKIP_TYPES and t.type not in _TRANSFER_TYPES
        and (t.name or t.description)
    ][:AI_MAX_PER_RUN]
    if not todo:
        return 0
    generic = _generic_ids(db)
    cats = [c for c in db.query(models.Category).filter(
        (models.Category.user_id == user.id) | (models.Category.user_id == None)  # noqa: E711
    ).all() if c.id not in generic]
    by_name = {c.name.lower(): c for c in cats}
    cat_list = "\n".join(f"- {c.name}" for c in sorted(cats, key=lambda c: c.name))
    done = 0
    tokens_in = tokens_out = 0
    for i in range(0, len(todo), AI_BATCH):
        batch = todo[i:i + AI_BATCH]
        lines = "\n".join(
            f'{n}. {(t.name or t.description or "")[:80]} | {t.amount:.2f} EUR'
            + (f" | MCC {t.mcc_code}" if t.mcc_code else "")
            for n, t in enumerate(batch, 1)
        )
        prompt = (
            "Eres un clasificador de movimientos bancarios de España. Para cada movimiento elige la "
            "categoría más apropiada de la lista. Si no lo tienes claro, usa null.\n\n"
            f"Categorías:\n{cat_list}\n\nMovimientos:\n{lines}\n\n"
            'Responde SOLO con JSON: {"1": "Categoría", "2": null, ...}'
        )
        for t in batch:
            _ai_tried.add(t.id)
        try:
            resp, _ = asyncio.run(_call_with_fallback(
                FAST_PROVIDERS, [{"role": "user", "content": prompt}], max_tokens=1200, temperature=0.1))
            text = resp.choices[0].message.content or ""
            usage = getattr(resp, "usage", None)
            tokens_in += getattr(usage, "prompt_tokens", 0) or 0
            tokens_out += getattr(usage, "completion_tokens", 0) or 0
            m = re.search(r"\{.*\}", text, re.S)
            answer = json.loads(m.group(0)) if m else {}
        except Exception:
            log.warning("IA: lote de categorización fallido", exc_info=True)
            continue
        for n, t in enumerate(batch, 1):
            name = answer.get(str(n))
            c = by_name.get(str(name).strip().strip("\"'").lower()) if name else None
            if not c:
                continue
            t.category_id = c.id
            t.is_ai_categorized = True
            t.is_auto_categorized = False
            t.category_source = "ai"
            done += 1
        db.commit()
    if tokens_in or tokens_out:
        try:
            from . import ai_usage
            ai_usage.record_usage(db, user.id, FAST_PROVIDERS[0]["model"], "categorize", tokens_in, tokens_out)
        except Exception:
            pass
    return done


# ── Logos ───────────────────────────────────────────────────────────────────

def prefetch_user_logos(db: Session, user_id: int) -> int:
    from .logos import prefetch
    from .merchants import brand, match_brand
    names = db.query(models.Transaction.name).filter(
        models.Transaction.user_id == user_id, models.Transaction.name != None,  # noqa: E711
    ).distinct().all()
    ids = {b for (n,) in names if (b := match_brand(n)) and (brand(b) or {}).get("domain")}
    return prefetch(ids)


# ── Orquestación ────────────────────────────────────────────────────────────

_running = threading.Lock()
_last_kick: dict[Optional[int], float] = {}


def run(user_id: Optional[int] = None, logos: bool = True):
    """Pasada completa para un usuario (o todos). No lanza nunca."""
    if not _running.acquire(blocking=False):
        return
    try:
        db = SessionLocal()
        try:
            q = db.query(models.User)
            if user_id is not None:
                q = q.filter(models.User.id == user_id)
            users = q.all()
            for u in users:
                try:
                    n = recategorize_user(db, u.id)
                    a = ai_categorize_user(db, u)
                    if n or a:
                        log.info("Recategorizados %s (+%s IA) del usuario %s", n, a, u.id)
                except Exception:
                    db.rollback()
                    log.exception("Recategorización del usuario %s", u.id)
            if logos:
                for u in users:
                    try:
                        prefetch_user_logos(db, u.id)
                    except Exception:
                        log.exception("Logos del usuario %s", u.id)
        finally:
            db.close()
    finally:
        _running.release()


def kick(user_id: Optional[int] = None, min_gap: float = 20.0):
    """Lanza `run` en un hilo aparte (tras importar, al arrancar). Ignora repeticiones seguidas."""
    import os
    if os.environ.get("FM_DISABLE_BACKGROUND") == "1":
        return
    now = time.time()
    if now - _last_kick.get(user_id, 0) < min_gap:
        return
    _last_kick[user_id] = now
    threading.Thread(target=run, args=(user_id,), daemon=True, name="recategorize").start()
