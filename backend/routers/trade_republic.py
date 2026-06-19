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


_CANCELLED_SUBTITLES = {
    # Spanish
    "cancelada", "cancelado", "rechazada", "rechazado", "fallida", "fallido",
    # German
    "storniert", "abgelehnt", "fehlgeschlagen",
    # English
    "cancelled", "canceled", "rejected", "failed",
}


def _is_cancelled_event(event: dict) -> bool:
    """Return True if TR reports this event as cancelled/rejected (should not affect balance)."""
    for field in ("subtitle", "description", "body"):
        val = event.get(field)
        if val and str(val).strip().lower() in _CANCELLED_SUBTITLES:
            return True
    return False


def _map_tr_event(event: dict) -> dict | None:
    # Skip cancelled / rejected events — they never affect the real cash balance
    if _is_cancelled_event(event):
        return None

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

@router.post("/fix-cancelled")
async def tr_fix_cancelled(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Delete transactions that were imported with a cancelled/rejected status from TR."""
    from sqlalchemy import func as sqlfunc
    rows = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id,
        models.Transaction.description.isnot(None),
        sqlfunc.lower(models.Transaction.description).in_(_CANCELLED_SUBTITLES),
    ).all()
    count = len(rows)
    for r in rows:
        db.delete(r)
    db.commit()
    return {"deleted": count}


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

        # ── Secondary dedup: same (date, amount, type) — only for CSV imports ──
        # Events with an external_id are authoritative; skip secondary dedup to
        # avoid blocking genuinely distinct transactions with the same amount/date/type.
        if not row.get("external_id") and _already_exists(db, current_user.id, row):
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

    # Resolve ISIN/name → Yahoo ticker for all unresolved positions
    resolve_result = {"resolved": 0, "skipped": 0, "total": 0}
    try:
        from ..services.portfolio_calculator import resolve_all_symbols
        resolve_result = resolve_all_symbols(db, current_user.id)
    except Exception:
        pass

    return {
        "synced": imported,
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "total_events": len(events),
        "tickers_resolved": resolve_result.get("resolved", 0),
    }


@router.post("/fix-tickers")
async def tr_fix_tickers(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Resolve ISIN/name → Yahoo Finance ticker for all unresolved BUY/SELL positions."""
    from ..services.portfolio_calculator import resolve_all_symbols
    result = resolve_all_symbols(db, current_user.id)
    return result


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
        card_events = [e for e in events if "card" in str(e.get("eventType", "")).lower()]
        return {
            "count": len(events),
            "card_sample": card_events[:3],
            "sample": events[:5],
        }
    except TRConnectionError as e:
        raise HTTPException(503, str(e))


@router.get("/debug-skipped")
async def tr_debug_skipped(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Show ALL events TR has that were skipped during import (cancelled events, unknown types, etc.)
    and their total cash impact. Helps diagnose balance discrepancies.
    """
    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a Trade Republic")

    existing_ids = {
        r[0] for r in db.query(models.Transaction.external_id)
        .filter(models.Transaction.user_id == current_user.id)
        .filter(models.Transaction.external_id.isnot(None))
        .all()
    }

    try:
        all_events = await client.get_timeline_raw()
    except TRConnectionError as e:
        raise HTTPException(503, str(e))

    skipped_cancelled = []
    skipped_zero = []
    skipped_no_date = []
    skipped_type_none = []
    already_imported = []
    imported_ok = []

    for event in all_events:
        eid = event.get("id") or event.get("transactionId")

        if eid and eid in existing_ids:
            already_imported.append(eid)
            continue

        if _is_cancelled_event(event):
            amt_raw = event.get("amount") or {}
            amount = float(str(amt_raw.get("value", "0")).replace(",", ".")) if isinstance(amt_raw, dict) else float(amt_raw or 0)
            skipped_cancelled.append({
                "id": eid,
                "date": event.get("timestamp") or event.get("date"),
                "title": event.get("title"),
                "subtitle": event.get("subtitle"),
                "amount": amount,
                "eventType": event.get("eventType"),
            })
            continue

        row = _map_tr_event(event)
        if row is None:
            amt_raw = event.get("amount") or {}
            try:
                amount = float(str(amt_raw.get("value", "0")).replace(",", ".")) if isinstance(amt_raw, dict) else float(amt_raw or 0)
            except (ValueError, TypeError):
                amount = 0
            skipped_type_none.append({
                "id": eid,
                "date": event.get("timestamp") or event.get("date"),
                "title": event.get("title"),
                "subtitle": event.get("subtitle"),
                "amount": amount,
                "eventType": event.get("eventType"),
            })
        else:
            imported_ok.append(row.get("external_id"))

    total_skipped_cash = round(
        sum(e["amount"] for e in skipped_cancelled) +
        sum(e["amount"] for e in skipped_type_none),
        2
    )

    return {
        "total_events_from_tr": len(all_events),
        "already_in_db": len(already_imported),
        "would_import": len(imported_ok),
        "skipped_cancelled": skipped_cancelled,
        "skipped_other": skipped_type_none,
        "total_skipped_cash_impact": total_skipped_cash,
    }


@router.get("/debug-balance")
async def tr_debug_balance(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Compare the sum of all TR timeline amounts against the DB sum.
    Shows which external_ids are in the DB but not in the TR timeline (orphans)
    and which are in TR but not the DB (missing).
    Helps find the root cause of balance discrepancies.
    """
    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a Trade Republic")

    try:
        all_events = await client.get_timeline_raw()
    except TRConnectionError as e:
        raise HTTPException(503, str(e))

    # Build a map of external_id → mapped amount from TR timeline
    tr_amounts: dict[str, float] = {}
    tr_skipped_cancelled: dict[str, float] = {}
    tr_skipped_zero: list[str] = []
    tr_unmapped: list[dict] = []

    for event in all_events:
        eid = event.get("id") or event.get("transactionId")
        if not eid:
            continue
        amt_raw = event.get("amount") or {}
        try:
            amt = float(str(amt_raw.get("value", "0")).replace(",", ".")) if isinstance(amt_raw, dict) else float(amt_raw or 0)
        except (ValueError, TypeError):
            amt = 0

        if _is_cancelled_event(event):
            tr_skipped_cancelled[eid] = amt
            continue

        row = _map_tr_event(event)
        if row is None:
            if amt == 0:
                tr_skipped_zero.append(eid)
            else:
                tr_unmapped.append({"id": eid, "amount": amt, "eventType": event.get("eventType"), "subtitle": event.get("subtitle")})
            continue

        tr_amounts[eid] = row["amount"]  # use mapped amount (may differ from raw for deposits)

    tr_sum = round(sum(tr_amounts.values()), 2)

    # Get all DB transactions for this user
    db_rows = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id
    ).all()

    db_sum = round(sum(r.amount for r in db_rows), 2)
    db_by_eid = {r.external_id: r for r in db_rows if r.external_id}

    # Orphan DB rows: in DB but NOT in TR timeline (and not in cancelled/skipped)
    orphan_ids = set(db_by_eid.keys()) - set(tr_amounts.keys()) - set(tr_skipped_cancelled.keys())
    orphans = [
        {
            "external_id": eid,
            "date": str(db_by_eid[eid].date),
            "name": db_by_eid[eid].name,
            "amount": db_by_eid[eid].amount,
            "type": db_by_eid[eid].type,
        }
        for eid in sorted(orphan_ids)
    ]

    # Missing DB rows: in TR timeline but NOT in DB
    missing_ids = set(tr_amounts.keys()) - set(db_by_eid.keys())
    missing = [{"id": mid, "amount": tr_amounts[mid]} for mid in sorted(missing_ids)]

    # Amount mismatches: same external_id but different amount
    mismatches = []
    for eid in set(tr_amounts.keys()) & set(db_by_eid.keys()):
        tr_a = round(tr_amounts[eid], 4)
        db_a = round(db_by_eid[eid].amount, 4)
        if abs(tr_a - db_a) > 0.005:
            mismatches.append({
                "external_id": eid,
                "tr_amount": tr_a,
                "db_amount": db_a,
                "diff": round(tr_a - db_a, 4),
                "name": db_by_eid[eid].name,
                "date": str(db_by_eid[eid].date),
            })

    orphan_sum = round(sum(o["amount"] for o in orphans), 2)
    mismatch_sum = round(sum(m["diff"] for m in mismatches), 2)

    return {
        "tr_timeline_sum": tr_sum,
        "db_sum": db_sum,
        "db_vs_tr_diff": round(db_sum - tr_sum, 2),
        "tr_total_events": len(all_events),
        "tr_mapped_events": len(tr_amounts),
        "tr_skipped_cancelled": len(tr_skipped_cancelled),
        "tr_skipped_zero_amount": len(tr_skipped_zero),
        "tr_unmapped_nonzero": tr_unmapped,
        "orphan_db_rows": orphans,
        "orphan_sum": orphan_sum,
        "missing_from_db": missing,
        "amount_mismatches": mismatches,
        "mismatch_sum": mismatch_sum,
    }


@router.post("/fix-orphans")
async def tr_fix_orphans(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete DB transactions whose external_id appears in TR's timeline as CANCELLED,
    plus any whose external_id does NOT appear in TR's timeline at all (true orphans).
    ONLY call this after reviewing /debug-balance output first.
    """
    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a Trade Republic")

    try:
        all_events = await client.get_timeline_raw()
    except TRConnectionError as e:
        raise HTTPException(503, str(e))

    tr_event_ids: set[str] = set()
    cancelled_ids: set[str] = set()

    for event in all_events:
        eid = event.get("id") or event.get("transactionId")
        if not eid:
            continue
        if _is_cancelled_event(event):
            cancelled_ids.add(eid)
        else:
            tr_event_ids.add(eid)

    db_rows = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id,
        models.Transaction.external_id.isnot(None),
    ).all()

    deleted_cancelled = []
    deleted_orphan = []

    for row in db_rows:
        eid = row.external_id
        if eid in cancelled_ids:
            deleted_cancelled.append({"id": row.id, "name": row.name, "amount": row.amount, "external_id": eid})
            db.delete(row)
        elif eid not in tr_event_ids:
            deleted_orphan.append({"id": row.id, "name": row.name, "amount": row.amount, "date": str(row.date), "external_id": eid})
            db.delete(row)

    db.commit()
    return {
        "deleted_cancelled": deleted_cancelled,
        "deleted_orphan": deleted_orphan,
        "total_deleted": len(deleted_cancelled) + len(deleted_orphan),
    }


@router.post("/import-missing")
async def tr_import_missing(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Import TR timeline events that have external_ids not yet in the DB.
    Skips the secondary (date/amount/type) dedup — uses external_id as the sole key.
    This fixes transactions that were blocked by false-positive dedup against
    a different transaction with matching date/amount/type.
    """
    from sqlalchemy.exc import IntegrityError
    from ..services.categorizer import auto_categorize

    client = get_client(current_user.id)
    if not client or not client.is_connected():
        raise HTTPException(400, "No conectado a Trade Republic")

    existing_ids = {
        r[0] for r in db.query(models.Transaction.external_id)
        .filter(models.Transaction.user_id == current_user.id)
        .filter(models.Transaction.external_id.isnot(None))
        .all()
    }

    try:
        all_events = await client.get_timeline_raw()
    except TRConnectionError as e:
        raise HTTPException(503, str(e))

    imported = 0
    skipped = 0
    imported_details = []

    for event in all_events:
        eid = event.get("id") or event.get("transactionId")
        if not eid or eid in existing_ids:
            continue

        if _is_cancelled_event(event):
            continue

        row = _map_tr_event(event)
        if row is None:
            continue

        # external_id guaranteed unique — skip secondary dedup entirely
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
            imported_details.append({
                "external_id": eid,
                "name": row.get("name"),
                "date": str(row.get("date")),
                "amount": row.get("amount"),
                "type": row.get("type"),
            })
        except IntegrityError:
            skipped += 1

    db.commit()
    return {"imported": imported, "skipped_integrity": skipped, "details": imported_details}


@router.post("/disconnect")
def tr_disconnect(current_user: models.User = Depends(auth.get_current_user)):
    remove_client(current_user.id)
    return {"ok": True}
