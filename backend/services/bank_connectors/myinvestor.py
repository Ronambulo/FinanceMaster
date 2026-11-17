import csv
import hashlib
import io
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from .base import BankConnector

# Columnas del CSV "Órdenes" que exporta MyInvestor (separado por ';')
MI_REQUIRED = {"Fecha de la orden", "ISIN", "Importe estimado", "Nº de participaciones", "Estado"}

# Prefijo de external_id de las órdenes importadas desde MyInvestor. Sirve para
# distinguirlas de los movimientos de Trade Republic: su dinero no sale del
# efectivo de TR, así que no deben restar del saldo de caja.
EXTERNAL_ID_PREFIX = "myinvestor-"

# Nombres de los fondos más habituales en MyInvestor (el CSV solo trae el ISIN)
KNOWN_FUNDS: Dict[str, str] = {
    "ES0165265002": "MyInvestor Nasdaq 100 FI",
    "IE000QAZP7L2": "iShares Emerging Markets Index Fund (IE) S Acc EUR",
    "IE00BYX5MX67": "Fidelity S&P 500 Index Fund P Acc EUR",
    "LU1303370156": "JPMorgan US Technology C Acc EUR",
}

_name_cache: Dict[str, Optional[str]] = {}


def _fund_name(isin: str) -> str:
    """Nombre legible del fondo: tabla conocida → búsqueda en Yahoo → ISIN."""
    if isin in KNOWN_FUNDS:
        return KNOWN_FUNDS[isin]
    if isin not in _name_cache:
        name = None
        try:
            import yfinance as yf
            for q in (yf.Search(isin, max_results=3).quotes or []):
                candidate = q.get("longname") or q.get("shortname")
                # Yahoo a veces devuelve el propio código 0P000… como nombre
                if candidate and not candidate.upper().startswith("0P0"):
                    name = candidate
                    break
        except Exception:
            name = None
        _name_cache[isin] = name
    return _name_cache[isin] or isin


def _parse_amount(val: str) -> Tuple[Optional[float], str]:
    """'400 EUR' / '75.03 EUR' → (400.0, 'EUR'). Admite coma decimal por si acaso."""
    parts = (val or "").strip().split()
    if not parts:
        return None, "EUR"
    currency = parts[-1].upper() if len(parts) > 1 and parts[-1].isalpha() else "EUR"
    num = parts[0]
    if "," in num and "." in num:          # 1.234,56
        num = num.replace(".", "").replace(",", ".")
    elif "," in num:                       # 75,03
        num = num.replace(",", ".")
    try:
        return float(num), currency
    except ValueError:
        return None, currency


def _parse_shares(val: str) -> Optional[float]:
    """'239,032' → 239.032 (coma decimal)."""
    val = (val or "").strip()
    if not val:
        return None
    if "," in val:
        val = val.replace(".", "").replace(",", ".")
    try:
        return float(val)
    except ValueError:
        return None


def _decode(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("latin-1")


class MyInvestorConnector(BankConnector):
    """Parser del CSV de órdenes de fondos de MyInvestor."""

    def __init__(self):
        self.skipped: List[str] = []

    @classmethod
    def detect(cls, headers: set) -> bool:
        return MI_REQUIRED.issubset(headers)

    def parse(self, content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
        errors: List[str] = []
        rows: List[Dict[str, Any]] = []
        self.skipped = []

        reader = csv.DictReader(io.StringIO(_decode(content)), delimiter=";")
        if not reader.fieldnames:
            return [], ["CSV vacío o sin cabeceras"]

        seen: Dict[str, int] = {}
        for i, raw in enumerate(reader, start=2):
            row = {(k or "").strip(): (v or "").strip() for k, v in raw.items()}
            if not any(row.values()):
                continue

            isin = row.get("ISIN", "").upper()
            status = row.get("Estado", "")
            date_raw = row.get("Fecha de la orden", "")

            if status.lower() != "finalizada":
                self.skipped.append(f"Fila {i}: orden {status.lower() or 'sin estado'} ({date_raw} · {isin})")
                continue

            try:
                tx_date = datetime.strptime(date_raw, "%d/%m/%Y").date()
            except ValueError:
                errors.append(f"Fila {i}: fecha inválida '{date_raw}'")
                continue

            if len(isin) != 12:
                errors.append(f"Fila {i}: ISIN inválido '{isin}'")
                continue

            amount, currency = _parse_amount(row.get("Importe estimado", ""))
            if amount is None or amount <= 0:
                errors.append(f"Fila {i}: importe inválido '{row.get('Importe estimado', '')}'")
                continue

            shares = _parse_shares(row.get("Nº de participaciones", ""))
            if shares is None or shares <= 0:
                errors.append(f"Fila {i}: participaciones inválidas '{row.get('Nº de participaciones', '')}'")
                continue

            # Id estable: mismo contenido → mismo id, para que reimportar no duplique.
            # El contador distingue dos órdenes idénticas el mismo día.
            key = f"{tx_date.isoformat()}|{isin}|{amount:.2f}|{shares:.6f}"
            seen[key] = seen.get(key, 0) + 1
            digest = hashlib.md5(f"{key}|{seen[key]}".encode()).hexdigest()[:16]

            rows.append({
                "external_id": f"{EXTERNAL_ID_PREFIX}{digest}",
                "datetime": datetime.combine(tx_date, datetime.min.time()),
                "date": tx_date,
                "account_category": "TRADING",
                "type": "BUY",
                "asset_class": "FUND",
                "name": _fund_name(isin),
                "symbol": isin,
                "shares": shares,
                "price": round(amount / shares, 6),
                "amount": -amount,
                "fee": None,
                "tax": None,
                "currency": currency,
                "description": "Orden de compra · MyInvestor",
                "counterparty_name": "MyInvestor",
                "counterparty_iban": None,
                "mcc_code": None,
            })

        _mark_outflows(rows)
        return rows, errors


def _mark_outflows(rows: List[Dict[str, Any]]) -> None:
    """Marca como SELL las órdenes que liquidan toda la posición.

    El CSV no dice si una orden es de compra o de reembolso/traspaso de salida.
    Pero un traspaso o un reembolso total mueve exactamente las participaciones
    que se tenían, y una compra que coincida al milésimo con todo lo acumulado
    es muy improbable. Se recorre cronológicamente (el CSV viene del más reciente
    al más antiguo) acumulando participaciones por ISIN; los reembolsos parciales
    no se pueden distinguir y quedan como compra.
    """
    holdings: Dict[str, float] = {}
    lots: Dict[str, int] = {}
    for row in sorted(enumerate(rows), key=lambda t: (t[1]["date"], -t[0])):
        r = row[1]
        isin, shares = r["symbol"], r["shares"]
        held = holdings.get(isin, 0.0)
        # Las participaciones vienen redondeadas a 3 decimales: el error crece con cada lote
        tolerance = max(0.0005 * (lots.get(isin, 0) + 1), held * 0.001)
        if held > 0 and abs(shares - held) <= tolerance:
            r["type"] = "SELL"
            r["amount"] = abs(r["amount"])
            r["description"] = "Reembolso o traspaso de salida · MyInvestor"
            holdings[isin] = 0.0
            lots[isin] = 0
        else:
            holdings[isin] = held + shares
            lots[isin] = lots.get(isin, 0) + 1
