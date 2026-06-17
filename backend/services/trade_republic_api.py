"""
Trade Republic API client using pytr (unofficial WebSocket protocol).
Login flow:
  1. connect(phone, pin) → {"status": "awaiting_2fa", "countdown": N}
               OR → {"status": "connected"}  (if saved session exists)
  2. verify_2fa(code)    → {"status": "connected"}
  3. get_timeline() / get_portfolio() for data
"""
import asyncio
import logging
from typing import Optional
from datetime import datetime

log = logging.getLogger(__name__)


def _parse_tr_number(text: str) -> "float | None":
    """Parse a number from TR's German-formatted string (e.g. '0,110756' or '1.234,56')."""
    raw = str(text).replace("\xa0", "").strip()
    for sym in ("€", "$", "£", "%", "+", "-"):
        raw = raw.replace(sym, "").strip()
    if not raw:
        return None
    if "," in raw and "." in raw:
        if raw.rindex(",") > raw.rindex("."):
            raw = raw.replace(".", "").replace(",", ".")  # German: 1.234,56
        else:
            raw = raw.replace(",", "")  # English: 1,234.56
    elif "," in raw:
        raw = raw.replace(",", ".")  # German decimal: 0,110756
    try:
        return float(raw)
    except (ValueError, TypeError):
        return None


def _extract_shares_from_detail(detail: dict) -> "float | None":
    """
    Extract share count from TR timelineDetailV2 response.

    Handles:
      A) Row title "Acciones"/"Stück" etc. → detail.text = "0,110756"
      B) Row title "Transacción" etc. → detail.displayValue.prefix = "0,110756 × "
         or detail.text = "0,110756 × 116,76 €"
      C) OPI/IPO: "Transacción" row has nested detail.action.payload.sections
         with an "Acciones" row inside
    """
    if not isinstance(detail, dict):
        return None

    SHARE_TITLES = ("acciones", "stück", "shares", "cantidad", "qty", "units", "anzahl", "participaciones", "stukken")
    TX_TITLES    = ("transacci", "transaktion", "transaction", "order ejecutad", "orden", "suscripci", "opi", "asignaci")

    def _search_sections(sections: list) -> "float | None":
        for section in sections:
            if not isinstance(section, dict):
                continue
            data = section.get("data")
            if not isinstance(data, list):
                continue
            for row in data:
                if not isinstance(row, dict):
                    continue
                title = str(row.get("title", "")).lower()
                row_detail = row.get("detail") or {}
                if not isinstance(row_detail, dict):
                    continue

                # A) Direct shares row
                if any(k in title for k in SHARE_TITLES):
                    text = row_detail.get("text") or (row_detail.get("displayValue") or {}).get("text")
                    if text:
                        v = _parse_tr_number(str(text))
                        if v is not None and v > 0:
                            return v

                # B) Transaction row with × separator
                if any(k in title for k in TX_TITLES):
                    prefix = (row_detail.get("displayValue") or {}).get("prefix") or ""
                    for sep in ("×", "x ", "X "):
                        if sep in prefix:
                            v = _parse_tr_number(prefix.split(sep)[0].strip())
                            if v is not None and v > 0:
                                return v
                            break
                    text = row_detail.get("text") or ""
                    for sep in ("×", " x ", " X "):
                        if sep in text:
                            v = _parse_tr_number(text.split(sep)[0].strip())
                            if v is not None and v > 0:
                                return v
                            break

                    # C) Nested infoPage payload (OPI/IPO subscriptions)
                    nested_payload = (row_detail.get("action") or {}).get("payload")
                    if isinstance(nested_payload, dict):
                        v = _search_sections(nested_payload.get("sections") or [])
                        if v is not None:
                            return v
        return None

    return _search_sections(detail.get("sections") or [])


def _extract_isin_from_detail(detail: dict) -> "str | None":
    """Extract ISIN from sections[0].action.payload when type=='instrumentDetail'."""
    if not isinstance(detail, dict):
        return None
    for section in detail.get("sections", []):
        if not isinstance(section, dict):
            continue
        action = section.get("action") or {}
        if isinstance(action, dict) and action.get("type") == "instrumentDetail":
            payload = action.get("payload")
            if isinstance(payload, str) and len(payload) == 12:
                return payload
    return None


class TRConnectionError(Exception):
    pass


class TradeRepublicAPI:
    def __init__(self, phone: str, pin: str):
        self.phone = phone
        self.pin = pin
        self._client = None
        self._connected = False
        self._last_sync: Optional[datetime] = None

    def _build_client(self):
        from pytr.api import TradeRepublicApi, BASE_DIR
        BASE_DIR.mkdir(parents=True, exist_ok=True)
        return TradeRepublicApi(
            phone_no=self.phone,
            pin=self.pin,
            locale="es",
            save_cookies=True,
        )

    def connect(self) -> dict:
        """
        Synchronous — run in executor from async context.
        Tries saved session first; falls back to full web login (Playwright WAF bypass).
        Returns {"status": "connected"} or {"status": "awaiting_2fa", "countdown": N}.
        """
        try:
            self._client = self._build_client()

            # Try to resume an existing session (fast, no Playwright)
            if self._client.resume_websession():
                self._connected = True
                log.info("TR: resumed saved session")
                return {"status": "connected"}

            # Full login: Playwright gets AWS WAF token, then POSTs credentials
            log.info("TR: initiating web login (Playwright WAF bypass)…")
            countdown = self._client.initiate_weblogin()
            log.info(f"TR: 2FA SMS sent, countdown={countdown}s")
            return {"status": "awaiting_2fa", "countdown": countdown}

        except ImportError:
            raise TRConnectionError("pytr no instalado. Ejecuta: pip install pytr")
        except Exception as e:
            log.error("TR connect error: %s", e, exc_info=True)
            if hasattr(e, "response") and e.response is not None:
                try:
                    data = e.response.json()
                    errors = data.get("errors", [])
                    if errors:
                        err = errors[0]
                        code = err.get("errorCode", "")
                        if code == "TOO_MANY_REQUESTS":
                            wait = err.get("meta", {}).get("nextAttemptInSeconds", 30)
                            raise TRConnectionError(f"Demasiados intentos. Espera {wait} segundos e inténtalo de nuevo.")
                        if code == "INVALID_CREDENTIALS":
                            raise TRConnectionError("Teléfono o PIN incorrectos.")
                        raise TRConnectionError(f"Error de Trade Republic: {code}")
                except TRConnectionError:
                    raise
                except Exception:
                    pass
            raise TRConnectionError(f"Error al conectar: {e}")

    def verify_2fa(self, code: str) -> dict:
        """Synchronous — run in executor."""
        if not self._client:
            raise TRConnectionError("No hay sesión activa. Llama a connect() primero.")
        try:
            self._client.complete_weblogin(code)
            self._connected = True
            log.info("TR: 2FA verificado, sesión activa")
            return {"status": "connected"}
        except Exception as e:
            if "400" in str(e):
                raise TRConnectionError("Código incorrecto o expirado.")
            raise TRConnectionError(f"Error al verificar: {e}")

    async def _recv(self, sub_id: int, timeout: float = 30.0):
        """Receive a single WebSocket response for a subscription."""
        import asyncio
        return await asyncio.wait_for(
            self._client._recv_subscription(str(sub_id)),
            timeout=timeout,
        )

    async def _reconnect_ws(self) -> bool:
        """Try to resume the WS session after a 3003 close. Returns True on success."""
        try:
            ok = await asyncio.get_event_loop().run_in_executor(
                None, self._client.resume_websession
            )
            if ok:
                log.info("TR: WebSocket reconectado correctamente")
            return bool(ok)
        except Exception as e:
            log.warning("TR: reconexión fallida: %s", e)
            return False

    async def get_timeline_raw(self, skip_ids: Optional[set[str]] = None, force_detail_ids: Optional[set[str]] = None) -> list:
        """
        Fetches ALL transactions with proper eventType.

        Steps:
          1. Paginate timelineTransactions to collect all list items.
          2. Fetch timelineDetailV2 in small batches (≤ BATCH_SIZE at a time)
             to avoid overwhelming TR's WS server (which closes with 3003 when
             too many concurrent subscriptions are open at once).
          3. If WS closes mid-batch, reconnect and re-subscribe remaining IDs.
          4. Merge eventType / isin / mcc_code into the list items.
        """
        # Max concurrent WS subscriptions — keep low to avoid 3003 disconnects
        BATCH_SIZE = 10

        if not self._connected or not self._client:
            raise TRConnectionError("No conectado a Trade Republic")
        try:
            # ── 1. Paginate timeline list ──────────────────────────────────
            all_items: list = []
            cursor: str | None = None
            while True:
                if cursor:
                    sub_id = await self._client.timeline_transactions(after=cursor)
                else:
                    sub_id = await self._client.timeline_transactions()

                payload = await self._recv(sub_id, timeout=30.0)
                try:
                    await self._client.unsubscribe(str(sub_id))
                except Exception:
                    pass

                if isinstance(payload, list):
                    all_items.extend(payload)
                    break
                if isinstance(payload, dict):
                    items = payload.get("items", payload.get("transactions", []))
                    all_items.extend(items)
                    cursor = (payload.get("cursors") or {}).get("after")
                    if not cursor or not items:
                        break
                else:
                    break

            all_items = [item for item in all_items if isinstance(item, dict)]
            log.info("TR: fetched %d timeline items", len(all_items))

            # ── 2 & 3. Fetch details in small batches ─────────────────────
            events_needing_detail = [
                e for e in all_items
                if isinstance(e.get("action"), dict)
                and e["action"].get("type") == "timelineDetail"
                and e.get("id")
                and not (skip_ids and e["id"] in skip_ids and not (force_detail_ids and e["id"] in force_detail_ids))
            ]
            log.info("TR: %d events need detail fetch", len(events_needing_detail))

            detail_map: dict[str, dict] = {}

            for batch_start in range(0, len(events_needing_detail), BATCH_SIZE):
                batch = events_needing_detail[batch_start:batch_start + BATCH_SIZE]

                # Subscribe to this batch
                sub_to_eid: dict[str, str] = {}
                for event in batch:
                    eid = event["id"]
                    dsub = await self._client.timeline_detail_v2(eid)
                    sub_to_eid[str(dsub)] = eid

                # Receive responses for this batch
                pending = set(sub_to_eid.keys())
                while pending:
                    try:
                        sid_str, _, response = await asyncio.wait_for(
                            self._client.recv(), timeout=20.0
                        )
                        if sid_str in pending:
                            detail_map[sub_to_eid[sid_str]] = response
                            pending.discard(sid_str)
                            try:
                                await self._client.unsubscribe(sid_str)
                            except Exception:
                                pass
                    except asyncio.TimeoutError:
                        log.warning("TR: timeout in detail batch %d, skipping %d",
                                    batch_start // BATCH_SIZE, len(pending))
                        break
                    except Exception as ws_err:
                        err_str = str(ws_err)
                        is_ws_close = any(x in err_str for x in ("3003", "1000", "1001", "closed", "close"))
                        if not is_ws_close:
                            raise
                        log.warning("TR: WS cerrado (%s) en batch %d, intentando reconectar…",
                                    err_str[:60], batch_start // BATCH_SIZE)
                        reconnected = await self._reconnect_ws()
                        if not reconnected:
                            log.warning("TR: reconexión fallida, saltando %d detalles restantes", len(pending))
                            break
                        # Re-subscribe to pending event IDs after reconnect
                        new_sub_to_eid: dict[str, str] = {}
                        for old_sid in list(pending):
                            eid = sub_to_eid[old_sid]
                            try:
                                new_dsub = await self._client.timeline_detail_v2(eid)
                                new_sub_to_eid[str(new_dsub)] = eid
                            except Exception:
                                pass
                        sub_to_eid.update(new_sub_to_eid)
                        pending = set(new_sub_to_eid.keys())

                # Brief pause between batches so TR doesn't rate-limit us
                if batch_start + BATCH_SIZE < len(events_needing_detail):
                    await asyncio.sleep(0.3)

            log.info("TR: received %d/%d details", len(detail_map), len(events_needing_detail))

            # ── 4. Merge eventType + isin + mcc into list items ───────────
            for event in all_items:
                eid = event.get("id")
                detail = detail_map.get(eid)
                if not detail or not isinstance(detail, dict):
                    continue

                if "eventType" not in event:
                    event["eventType"] = detail.get("eventType", "")
                if not event.get("isin"):
                    instrument = detail.get("instrument") or {}
                    if isinstance(instrument, dict):
                        event["isin"] = instrument.get("isin") or detail.get("isin")

                # Extract shares/quantity for trade events (search deep in detail structure)
                if not event.get("shares") and not event.get("quantity"):
                    sh = _extract_shares_from_detail(detail)
                    if sh is not None:
                        event["shares"] = sh

                # Extract MCC code from detail (card transactions)
                if not event.get("mcc_code"):
                    mcc = (
                        detail.get("mcc")
                        or detail.get("merchantCategoryCode")
                        or detail.get("mccCode")
                    )
                    if mcc is None:
                        sections = detail.get("sections", [])
                        if isinstance(sections, list):
                            for section in sections:
                                if isinstance(section, dict):
                                    data = section.get("data") or {}
                                    if isinstance(data, dict):
                                        mcc = (
                                            data.get("mcc")
                                            or data.get("merchantCategoryCode")
                                            or section.get("mcc")
                                        )
                                        if mcc is not None:
                                            break
                    if mcc is not None:
                        event["mcc_code"] = str(mcc)

            self._last_sync = datetime.utcnow()
            return all_items

        except TRConnectionError:
            raise
        except Exception as e:
            raise TRConnectionError(f"Error al obtener timeline: {e}")

    async def get_portfolio_positions(self) -> dict:
        """
        Fetch current open positions directly from TR's portfolio WebSocket endpoint.
        Returns the raw portfolio payload (positions + cash).
        """
        if not self._connected or not self._client:
            raise TRConnectionError("No conectado a Trade Republic")
        try:
            sub_id = await self._client.portfolio()
            payload = await asyncio.wait_for(
                self._client._recv_subscription(str(sub_id)),
                timeout=20.0,
            )
            try:
                await self._client.unsubscribe(str(sub_id))
            except Exception:
                pass
            return payload if isinstance(payload, dict) else {"positions": []}
        except TRConnectionError:
            raise
        except Exception as e:
            raise TRConnectionError(f"Error al obtener posiciones: {e}")

    async def get_compact_portfolio(self) -> dict:
        """Fetch compact portfolio (lighter payload) from TR."""
        if not self._connected or not self._client:
            raise TRConnectionError("No conectado a Trade Republic")
        try:
            sub_id = await self._client.compact_portfolio()
            payload = await asyncio.wait_for(
                self._client._recv_subscription(str(sub_id)),
                timeout=20.0,
            )
            try:
                await self._client.unsubscribe(str(sub_id))
            except Exception:
                pass
            return payload if isinstance(payload, dict) else {}
        except TRConnectionError:
            raise
        except Exception as e:
            raise TRConnectionError(f"Error al obtener portfolio compacto: {e}")

    def is_connected(self) -> bool:
        return self._connected

    def last_sync(self) -> Optional[datetime]:
        return self._last_sync

    def disconnect(self):
        self._client = None
        self._connected = False


# ── In-memory session store (per user_id) ────────────────────────────────────
_clients: dict[int, TradeRepublicAPI] = {}


def get_client(user_id: int) -> Optional[TradeRepublicAPI]:
    return _clients.get(user_id)


def set_client(user_id: int, client: TradeRepublicAPI):
    _clients[user_id] = client


def remove_client(user_id: int):
    c = _clients.pop(user_id, None)
    if c:
        c.disconnect()
