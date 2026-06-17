import asyncio
import base64
import hashlib
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from .. import models, auth
from ..database import get_db
from ..services.trade_republic_api import (
    TradeRepublicAPI,
    TRConnectionError,
    get_client,
    set_client,
    remove_client,
)

router = APIRouter(prefix="/api/tr", tags=["trade-republic"])


# ── Encryption ────────────────────────────────────────────────────────────────

def _fernet():
    from cryptography.fernet import Fernet
    secret = os.environ.get("SECRET_KEY", "dev-secret-key-not-for-production")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)

def _encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()

def _decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _save_credentials(db: Session, user_id: int, phone: str, pin: str, connected: bool):
    conn = db.query(models.BankConnection).filter(
        models.BankConnection.user_id == user_id,
        models.BankConnection.bank_name == "trade_republic",
    ).first()
    if not conn:
        conn = models.BankConnection(user_id=user_id, bank_name="trade_republic")
        db.add(conn)
    conn.encrypted_phone = _encrypt(phone)
    conn.encrypted_pin = _encrypt(pin)
    if connected:
        conn.last_connected_at = datetime.utcnow()
    db.commit()


def _dedupe_transactions(db: Session, user_id: int) -> int:
    from sqlalchemy import text
    result = db.execute(text("""
        DELETE FROM transactions
        WHERE user_id = :uid
          AND id NOT IN (
            SELECT MIN(id)
            FROM transactions
            WHERE user_id = :uid
            GROUP BY date, amount, type, COALESCE(name, ''), COALESCE(symbol, '')
          )
    """), {"uid": user_id})
    db.commit()
    return result.rowcount


def _already_exists(db: Session, user_id: int, row: dict) -> bool:
    from sqlalchemy import and_
    return db.query(models.Transaction).filter(
        and_(
            models.Transaction.user_id == user_id,
            models.Transaction.date == row["date"],
            models.Transaction.amount == row["amount"],
            models.Transaction.type == row["type"],
        )
    ).first() is not None


# ── Request schemas ───────────────────────────────────────────────────────────

class TRConnectRequest(BaseModel):
    phone: str
    pin: str

class TR2FARequest(BaseModel):
    code: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
def tr_status(current_user: models.User = Depends(auth.get_current_user)):
    client = get_client(current_user.id)
    return {
        "connected": client is not None and client.is_connected(),
        "last_sync": client.last_sync().isoformat() if client and client.last_sync() else None,
    }


@router.post("/auto-connect")
async def tr_auto_connect(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Try to reconnect using saved credentials (called on app startup)."""
    # Already connected in-memory — fast path
    client = get_client(current_user.id)
    if client and client.is_connected():
        return {"status": "connected"}

    # Load encrypted credentials from DB
    conn = db.query(models.BankConnection).filter(
        models.BankConnection.user_id == current_user.id,
        models.BankConnection.bank_name == "trade_republic",
    ).first()
    if not conn or not conn.encrypted_phone:
        return {"status": "no_credentials"}

    try:
        phone = _decrypt(conn.encrypted_phone)
        pin = _decrypt(conn.encrypted_pin)
    except Exception:
        return {"status": "no_credentials"}

    try:
        client = TradeRepublicAPI(phone=phone, pin=pin)
        result = await asyncio.get_event_loop().run_in_executor(None, client.connect)
        if result.get("status") == "connected":
            set_client(current_user.id, client)
            conn.last_connected_at = datetime.utcnow()
            db.commit()
            return {"status": "connected"}
        else:
            # SMS sent — keep client in memory so /tr/verify can complete the flow
            set_client(current_user.id, client)
            return {"status": "needs_2fa", "countdown": result.get("countdown")}
    except TRConnectionError as e:
        return {"status": "error", "message": str(e)}


@router.post("/connect")
async def tr_connect(
    body: TRConnectRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    client = TradeRepublicAPI(phone=body.phone, pin=body.pin)
    try:
        result = await asyncio.get_event_loop().run_in_executor(None, client.connect)
        set_client(current_user.id, client)
        _save_credentials(db, current_user.id, body.phone, body.pin, result.get("status") == "connected")
        return result
    except TRConnectionError as e:
        raise HTTPException(503, str(e))


@router.post("/verify")
async def tr_verify(
    body: TR2FARequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    client = get_client(current_user.id)
    if not client:
        raise HTTPException(400, "No hay sesión activa. Llama a /connect primero.")
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, client.verify_2fa, body.code
        )
        # Mark last_connected_at now that 2FA is complete
        conn = db.query(models.BankConnection).filter(
            models.BankConnection.user_id == current_user.id,
            models.BankConnection.bank_name == "trade_republic",
        ).first()
        if conn:
            conn.last_connected_at = datetime.utcnow()
            db.commit()
        return result
    except TRConnectionError as e:
        raise HTTPException(503, str(e))


# ── Event mapper ──────────────────────────────────────────────────────────────

# Maps TR's eventType (camelCase from WebSocket) → our internal transaction type.
# "__TRADE__" = BUY if amount<0, SELL if amount>0
# None = skip this event entirely
_TR_EVENT_TYPE_MAP: dict[str, str | None] = {
    # ── Trades / investments ────────────────────────────────────────
    "ORDER_EXECUTED": "__TRADE__",
    "TRADE_INVOICE": "__TRADE__",
    "TRADE_CORRECTED": None,
    "SAVINGS_PLAN_EXECUTED": "BUY",
    "SAVINGS_PLAN_INVOICE_CREATED": None,
    "trading_trade_executed": "__TRADE__",
    "trading_savingsplan_executed": "BUY",
    "benefits_spare_change_execution": "BUY",
    # Orders (pending, not settled) → skip
    "ORDER": None,
    "ORDER_CREATED": None,
    "ORDER_CANCELED": None,
    "ORDER_REJECTED": None,
    "ORDER_EXPIRED": None,
    # ── Deposits / inpayments ───────────────────────────────────────
    "DEPOSIT": "CUSTOMER_INPAYMENT",
    "INCOMING_TRANSFER": "CUSTOMER_INPAYMENT",
    "INCOMING_TRANSFER_DELEGATION": "CUSTOMER_INPAYMENT",
    "ACCOUNT_TRANSFER_INCOMING": "CUSTOMER_INPAYMENT",
    "PAYMENT_INBOUND": "CUSTOMER_INPAYMENT",
    "PAYMENT_INBOUND_SEPA_DIRECT_DEBIT": "CUSTOMER_INPAYMENT",
    "PAYMENT-SERVICE-IN-PAYMENT-DIRECT-DEBIT": "CUSTOMER_INPAYMENT",
    # Card refunds (money comes back)
    "PAYMENT_INBOUND_APPLE_PAY": "CARD_TRANSACTION",
    "PAYMENT_INBOUND_CREDIT_CARD": "CARD_TRANSACTION",
    "PAYMENT_INBOUND_GOOGLE_PAY": "CARD_TRANSACTION",
    "card_refund": "CARD_TRANSACTION",
    "card_tr_refund": "CARD_TRANSACTION",
    "card_successful_oct": "CARD_TRANSACTION",
    "INPAYMENTS_SEPA_MANDATE_CREATED": None,
    # ── Card payments (expenses) ────────────────────────────────────
    "card_successful_transaction": "CARD_TRANSACTION",
    "card_order_billed": "CARD_TRANSACTION",
    "card_successful_atm_withdrawal": "TRANSFER_OUTBOUND",
    "card_failed_transaction": None,
    "CARD": "CARD_TRANSACTION",
    # ── Bank transfers out ──────────────────────────────────────────
    "WITHDRAWAL": "TRANSFER_OUTBOUND",
    "PAYMENT_OUTBOUND": "TRANSFER_OUTBOUND",
    "OUTGOING_TRANSFER": "TRANSFER_OUTBOUND",
    "OUTGOING_TRANSFER_DELEGATION": "TRANSFER_OUTBOUND",
    "junior_p2p_transfer": "TRANSFER_OUTBOUND",
    "TRANSFER_OUT": "TRANSFER_OUTBOUND",
    # ── Interest ────────────────────────────────────────────────────
    "INTEREST": "INTEREST_PAYMENT",
    "INTEREST_PAYOUT": "INTEREST_PAYMENT",
    "INTEREST_PAYOUT_CREATED": None,
    "INTEREST_CHARGE": "INTEREST_PAYMENT",
    # ── Dividends ───────────────────────────────────────────────────
    "DIVIDEND": "DIVIDEND",
    "DIVIDENDS": "DIVIDEND",
    "CREDIT": "DIVIDEND",
    # ── Taxes ───────────────────────────────────────────────────────
    "TAXES": "TAX",
    "TAX_REFUND": "TAX",
    "TAX_CORRECTION": "TAX",
    "ssp_tax_correction_invoice": "TAX",
    "TAX_YEAR_END_REPORT": None,
    "TAX_YEAR_END_REPORT_CREATED": None,
    # ── Perks / saveback ────────────────────────────────────────────
    "STOCK_PERK_REFUNDED": "STOCKPERK",
    "ACQUISITION_TRADE_PERK": "STOCKPERK",
    "benefits_saveback_execution": "BUY",
    # ── Legacy / CSV pass-through types ─────────────────────────────
    "BUY": "BUY",
    "SELL": "SELL",
    "CUSTOMER_INPAYMENT": "CUSTOMER_INPAYMENT",
    "TRANSFER_INBOUND": "TRANSFER_INBOUND",
    "TRANSFER_INSTANT_INBOUND": "TRANSFER_INBOUND",
    "TRANSFER_OUTBOUND": "TRANSFER_OUTBOUND",
    "TRANSFER_INSTANT_OUTBOUND": "TRANSFER_OUTBOUND",
    "CARD_TRANSACTION": "CARD_TRANSACTION",
    "INTEREST_PAYMENT": "INTEREST_PAYMENT",
}

# Subtitle fallbacks (German & Spanish) for events without a clear eventType
_SUBTITLE_TYPE_MAP: dict[str, str] = {
    # German
    "Kauforder": "BUY",
    "Limit-Buy-Order": "BUY",
    "Sparplan ausgeführt": "BUY",
    "trading_savingsplan_executed": "BUY",
    "Verkaufsorder": "SELL",
    "Limit-Sell-Order": "SELL",
    "Stop-Sell-Order": "SELL",
    "Bardividende": "DIVIDEND",
    "Dividende": "DIVIDEND",
    "Zinsen": "INTEREST_PAYMENT",
    "Zinszahlung": "INTEREST_PAYMENT",
    "Kartenzahlung": "CARD_TRANSACTION",
    "Kartenerstattung": "CARD_TRANSACTION",
    "Einzahlung": "CUSTOMER_INPAYMENT",
    "Überweisung": "TRANSFER_OUTBOUND",
    "Steuerkorrektur": "TAX",

    # Spanish
    "Plan de ahorro": "BUY",
    "Plan de ahorro ejecutado": "BUY",
    "Plan ejecutado": "BUY",
    "Orden de compra": "BUY",
    "Orden limitada de compra": "BUY",
    "Kauf": "BUY",
    "OPV": "BUY",
    "OPI": "BUY",
    "Suscripción a la OPI": "BUY",
    "Suscripcion a la OPI": "BUY",
    "Oferta Pública": "BUY",
    "Oferta pública": "BUY",
    "Oferta pública de venta": "BUY",
    "Oferta Pública Inicial": "BUY",
    "Orden de venta": "SELL",
    "Orden limitada de venta": "SELL",
    "Venta": "SELL",
    "Dividendo en efectivo": "DIVIDEND",
    "Dividendo": "DIVIDEND",
    "Interés": "INTEREST_PAYMENT",
    "Intereses": "INTEREST_PAYMENT",
    "Zins": "INTEREST_PAYMENT",
    "Tarjeta": "CARD_TRANSACTION",
    "Compra con tarjeta": "CARD_TRANSACTION",
    "Reembolso de tarjeta": "CARD_TRANSACTION",
    "Enviado": "TRANSFER_OUTBOUND",
    "Completada": "CUSTOMER_INPAYMENT",
    "Depósito": "CUSTOMER_INPAYMENT",
    "Retirada": "TRANSFER_OUTBOUND",
}



def _resolve_tr_type(event: dict, amount: float) -> str | None:
    """
    Determine internal type from a TR WebSocket event.
    Returns None to skip the event, or a type string.
    """
    # TR WebSocket uses 'eventType' (camelCase); CSV exports use nested 'type' dicts
    raw = (
        event.get("eventType")
        or event.get("event_type")
        or event.get("type")
        or ""
    )
    if isinstance(raw, dict):
        raw = raw.get("type") or raw.get("id") or raw.get("eventType") or ""
    raw = str(raw).strip()

    # Case-insensitive lookup in _TR_EVENT_TYPE_MAP
    mapped = None
    explicitly_skipped = False
    raw_upper = raw.upper()
    for k, v in _TR_EVENT_TYPE_MAP.items():
        if k.upper() == raw_upper:
            if v is None:
                explicitly_skipped = True
            else:
                mapped = v
            break

    if mapped is not None:
        if mapped == "__TRADE__":
            return "SELL" if amount > 0 else "BUY"
        return mapped

    if explicitly_skipped:
        return None  # explicitly skipped

    # Fallback: subtitle
    subtitle = str(event.get("subtitle") or "")
    if subtitle in _SUBTITLE_TYPE_MAP:
        return _SUBTITLE_TYPE_MAP[subtitle]

    # Last resort: amount sign heuristic
    if raw:
        import logging
        logging.getLogger(__name__).debug("TR unknown eventType %r subtitle %r", raw, subtitle)
    return "CARD_TRANSACTION" if amount < 0 else "CUSTOMER_INPAYMENT"


def _map_tr_event(event: dict) -> dict | None:
    # Amount
    amt_raw = event.get("amount") or {}
    if isinstance(amt_raw, dict):
        try:
            amount = float(str(amt_raw.get("value", "0")).replace(",", "."))
        except (ValueError, TypeError):
            return None
        currency = amt_raw.get("currency", "EUR")
    else:
        try:
            amount = float(amt_raw)
        except (ValueError, TypeError):
            return None
        currency = "EUR"

    if amount == 0:
        return None

    # Timestamp → date (TR WebSocket sends ISO strings; CSV uses Unix ms)
    tx_date = None
    tx_datetime = None
    ts = event.get("timestamp") or event.get("date") or ""
    if isinstance(ts, (int, float)):
        dt = datetime.utcfromtimestamp(ts / 1000)
        tx_date = dt.date()
        tx_datetime = dt
    elif isinstance(ts, str) and ts:
        try:
            dt = datetime.fromisoformat(ts[:19])  # strip tz info
            tx_date = dt.date()
            tx_datetime = dt
        except Exception:
            pass

    if not tx_date:
        return None

    tx_type = _resolve_tr_type(event, amount)
    if tx_type is None:
        return None

    # Deposits always positive
    if tx_type in ("CUSTOMER_INPAYMENT", "TRANSFER_INBOUND") and amount < 0:
        amount = abs(amount)

    name = (
        event.get("title") or
        event.get("name") or
        event.get("body", "")[:80] or
        tx_type
    )

    return {
        "external_id": event.get("id") or event.get("transactionId"),
        "datetime": tx_datetime,
        "date": tx_date,
        "account_category": "TRADING" if tx_type in ("BUY", "SELL") else "CASH",
        "type": tx_type,
        "asset_class": event.get("assetClass") or event.get("asset_class"),
        "name": name,
        "symbol": event.get("isin") or event.get("symbol"),
        "shares": event.get("shares") or event.get("numberOfShares") or event.get("quantity"),
        "price": event.get("price"),
        "amount": amount,
        "fee": event.get("fee") or event.get("commission"),
        "tax": event.get("tax") or event.get("taxes"),
        "currency": currency,
        "description": event.get("body") or event.get("description") or event.get("subtitle"),
        "counterparty_name": event.get("counterpartyName"),
        "counterparty_iban": event.get("counterpartyIban"),
        "mcc_code": event.get("mcc_code"),
    }


# ── Sync ──────────────────────────────────────────────────────────────────────

@router.post("/dedupe")
async def tr_dedupe(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    deleted = _dedupe_transactions(db, current_user.id)
    return {"deleted": deleted}


@router.post("/fix-unknown")
async def tr_fix_unknown(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete auto-categorized UNKNOWN-type transactions (from old broken sync)
    so the next sync can re-import them with the correct type and category.
    Only deletes rows where is_auto_categorized=True to preserve any manual edits.
    """
    from sqlalchemy import and_
    rows = db.query(models.Transaction).filter(
        and_(
            models.Transaction.user_id == current_user.id,
            models.Transaction.type == "UNKNOWN",
            models.Transaction.is_auto_categorized == True,
        )
    ).all()
    count = len(rows)
    for r in rows:
        db.delete(r)
    db.commit()
    return {"deleted": count}


@router.get("/live-positions")
async def tr_live_positions(
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Fetch current open positions directly from TR's portfolio WebSocket.
    Returns positions with shares (netSize), avg buy-in, and ISIN.
    """
    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a Trade Republic")
    try:
        portfolio = await client.get_portfolio_positions()
        compact = await client.get_compact_portfolio()
        return {"portfolio": portfolio, "compact": compact}
    except TRConnectionError as e:
        raise HTTPException(503, str(e))


@router.get("/debug-detail/{event_id}")
async def tr_debug_detail(
    event_id: str,
    current_user: models.User = Depends(auth.get_current_user),
):
    """Return raw timelineDetailV2 for a single event — for diagnosing shares extraction."""
    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a Trade Republic")
    import asyncio
    dsub = await client._client.timeline_detail_v2(event_id)
    try:
        sid_str, _, response = await asyncio.wait_for(client._client.recv(), timeout=15.0)
        return {"event_id": event_id, "detail": response}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/fix-securities")
async def tr_fix_securities(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Reclassify BUY/SELL transactions from account_category=SECURITIES → TRADING."""
    from sqlalchemy import and_
    rows = db.query(models.Transaction).filter(
        and_(
            models.Transaction.user_id == current_user.id,
            models.Transaction.account_category == "SECURITIES",
            models.Transaction.type.in_(["BUY", "SELL"]),
        )
    ).all()
    count = len(rows)
    for r in rows:
        r.account_category = "TRADING"
    db.commit()
    return {"fixed": count}


@router.post("/fix-shares")
async def tr_fix_shares(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Re-fetch timelineDetailV2 for every BUY/SELL with shares=null
    and populate shares from the response.
    """
    import logging
    log = logging.getLogger(__name__)
    from sqlalchemy import and_
    from ..services.trade_republic_api import _extract_shares_from_detail, _extract_isin_from_detail

    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a Trade Republic")

    null_share_txs = db.query(models.Transaction).filter(
        and_(
            models.Transaction.user_id == current_user.id,
            models.Transaction.type.in_(["BUY", "SELL"]),
            models.Transaction.shares.is_(None),
            models.Transaction.external_id.isnot(None),
        )
    ).all()

    total = len(null_share_txs)
    if not total:
        return {"fixed": 0, "total": 0}

    fixed = 0
    first_raw = None  # keep one raw response for debugging

    for tx in null_share_txs:
        try:
            sub_id = await client._client.timeline_detail_v2(tx.external_id)
            detail = await asyncio.wait_for(
                client._client._recv_subscription(str(sub_id)),
                timeout=15.0,
            )
            try:
                await client._client.unsubscribe(str(sub_id))
            except Exception:
                pass

            if first_raw is None:
                first_raw = detail

            if not isinstance(detail, dict):
                continue

            sh = _extract_shares_from_detail(detail)
            log.info("fix-shares %s → shares=%s raw_keys=%s", tx.external_id, sh, list(detail.keys()))

            if sh is not None and sh > 0:
                tx.shares = sh
                fixed += 1
            if not tx.symbol:
                isin = _extract_isin_from_detail(detail)
                if isin:
                    tx.symbol = isin

        except asyncio.TimeoutError:
            log.warning("fix-shares timeout for %s", tx.external_id)
        except Exception as e:
            log.warning("fix-shares error for %s: %s", tx.external_id, e)

        await asyncio.sleep(0.1)  # avoid overwhelming TR WS

    db.commit()
    return {
        "fixed": fixed,
        "total": total,
        "sample_keys": list(first_raw.keys()) if isinstance(first_raw, dict) else None,
        "sample_detail": first_raw,
    }


@router.get("/sync")
async def tr_sync(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy import and_
    from ..services.categorizer import auto_categorize
    from ..services.recurring_detector import detect_recurring

    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a Trade Republic")

    # Load all existing external_ids for this user to avoid querying details for them
    existing_ids = {
        r[0] for r in db.query(models.Transaction.external_id)
        .filter(models.Transaction.user_id == current_user.id)
        .filter(models.Transaction.external_id.isnot(None))
        .all()
    }

    try:
        events = await client.get_timeline_raw(skip_ids=existing_ids)
    except TRConnectionError as e:
        raise HTTPException(503, str(e))

    imported = updated = skipped = errors = 0
    for event in events:
        row = _map_tr_event(event)
        if row is None:
            skipped += 1
            continue

        # Compute category for this row (MCC extracted from TR detail sections)
        category_id, is_auto, is_internal = auto_categorize(
            db=db,
            user_id=current_user.id,
            tx_type=row["type"],
            tx_name=row.get("name"),
            tx_description=row.get("description"),
            mcc_code=row.get("mcc_code"),
            counterparty_name=row.get("counterparty_name"),
            amount=row["amount"],
            user_own_name=current_user.username,
        )

        # ── Primary dedup: match by external_id ───────────────────────────
        existing = None
        if row.get("external_id"):
            existing = db.query(models.Transaction).filter(
                and_(
                    models.Transaction.user_id == current_user.id,
                    models.Transaction.external_id == row["external_id"],
                )
            ).first()

        if existing:
            changed = False
            if existing.is_auto_categorized:
                # Fix wrong type from old broken sync
                if existing.type != row["type"]:
                    existing.type = row["type"]
                    existing.account_category = row.get("account_category")
                    changed = True
                # Apply MCC-based category if we now have it and didn't before
                if row.get("mcc_code") and not existing.mcc_code:
                    existing.mcc_code = row["mcc_code"]
                    existing.category_id = category_id
                    changed = True
                elif existing.category_id != category_id:
                    existing.category_id = category_id
                    changed = True
                existing.is_internal_transfer = is_internal
                if row.get("symbol") and not existing.symbol:
                    existing.symbol = row["symbol"]
                    changed = True
                if row.get("shares") and not existing.shares:
                    existing.shares = row["shares"]
                    changed = True
            if changed:
                updated += 1
            else:
                skipped += 1
            continue

        # ── Secondary dedup: same (date, amount, type) — CSV duplicate ────
        if _already_exists(db, current_user.id, row):
            skipped += 1
            continue

        # ── Insert new ────────────────────────────────────────────────────
        tx = models.Transaction(
            user_id=current_user.id,
            category_id=category_id,
            is_auto_categorized=is_auto,
            is_internal_transfer=is_internal,
            **row,
        )
        try:
            with db.begin_nested():
                db.add(tx)
            imported += 1
        except IntegrityError:
            skipped += 1
        except Exception:
            errors += 1

    db.commit()

    try:
        detect_recurring(db, current_user.id)
    except Exception:
        pass

    return {
        "synced": imported,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "total_events": len(events),
    }


@router.get("/debug-events")
async def tr_debug_events(
    current_user: models.User = Depends(auth.get_current_user),
):
    """Return first 5 raw TR events (after detail merge) to diagnose field structure."""
    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a Trade Republic")
    try:
        events = await client.get_timeline_raw()
        # Show card transactions specifically so we can check mcc_code extraction
        card_events = [e for e in events if "card" in str(e.get("eventType", "")).lower()]
        return {
            "count": len(events),
            "card_sample": card_events[:3],
            "sample": events[:5],
        }
    except TRConnectionError as e:
        raise HTTPException(503, str(e))


@router.post("/disconnect")
def tr_disconnect(current_user: models.User = Depends(auth.get_current_user)):
    remove_client(current_user.id)
    return {"ok": True}
