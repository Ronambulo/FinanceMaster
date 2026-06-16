import csv
import hashlib
import io
from datetime import datetime, date
from typing import List, Tuple, Dict, Any, Optional

from .base import BankConnector

# Columns that uniquely identify a Revolut CSV
REVOLUT_TYPES = {"Date", "Description", "Amount", "Currency", "Type"}

# Mapping from Revolut transaction type to internal type
_TYPE_MAP = {
    "TOPUP": "CUSTOMER_INPAYMENT",
    "TRANSFER_IN": "CUSTOMER_INPAYMENT",
    "CARD_PAYMENT": "CARD_TRANSACTION",
    "CARD_REFUND": "CARD_TRANSACTION",
    "EXCHANGE": "CARD_TRANSACTION",
    "TRANSFER_OUT": "TRANSFER_OUTBOUND",
    "TRANSFER": "TRANSFER_OUTBOUND",
    "FEE": "TRANSFER_OUTBOUND",
    "ATM": "CARD_TRANSACTION",
}


def _parse_float(val: str) -> Optional[float]:
    if not val or val.strip() == "":
        return None
    try:
        return float(val.strip().replace(",", "."))
    except ValueError:
        return None


def _parse_date(val: str) -> Optional[date]:
    if not val:
        return None
    val = val.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S %Z", "%Y-%m-%d"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    try:
        return date.fromisoformat(val[:10])
    except Exception:
        return None


def _parse_datetime(val: str) -> Optional[datetime]:
    if not val:
        return None
    val = val.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S %Z"):
        try:
            return datetime.strptime(val, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _map_type(revolut_type: str, amount: float) -> str:
    t = revolut_type.upper().strip()
    if t in _TYPE_MAP:
        return _TYPE_MAP[t]
    # Fallback: positive = inbound, negative = outbound
    if amount >= 0:
        return "CUSTOMER_INPAYMENT"
    return "TRANSFER_OUTBOUND"


def _make_external_id(tx_date: str, description: str, amount: str) -> str:
    raw = f"{tx_date}{description}{amount}"
    return hashlib.md5(raw.encode()).hexdigest()


class RevolutConnector(BankConnector):
    """Parser for Revolut CSV exports."""

    @classmethod
    def detect(cls, headers: set) -> bool:
        return REVOLUT_TYPES.issubset(headers)

    def parse(self, content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
        errors: List[str] = []
        rows: List[Dict[str, Any]] = []

        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = content.decode("latin-1")

        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            return [], ["CSV vacío o sin cabeceras"]

        for i, raw_row in enumerate(reader, start=2):
            row = {
                k.strip().strip('"'): (v.strip().strip('"') if v else "")
                for k, v in raw_row.items()
            }

            date_raw = row.get("Date", row.get("Started Date", ""))
            tx_date = _parse_date(date_raw)
            if not tx_date:
                errors.append(f"Fila {i}: fecha inválida '{date_raw}'")
                continue

            amount_raw = row.get("Amount", "")
            amount = _parse_float(amount_raw)
            if amount is None:
                errors.append(f"Fila {i}: importe inválido '{amount_raw}'")
                continue

            description = row.get("Description", "").strip()
            revolut_type = row.get("Type", "").strip()
            currency = row.get("Currency", "EUR").strip() or "EUR"
            balance_raw = row.get("Balance", "")
            balance = _parse_float(balance_raw)

            tx_type = _map_type(revolut_type, amount)
            external_id = _make_external_id(date_raw, description, amount_raw)

            parsed: Dict[str, Any] = {
                "external_id": external_id,
                "datetime": _parse_datetime(date_raw),
                "date": tx_date,
                "account_category": "CURRENT",
                "type": tx_type,
                "asset_class": None,
                "name": description or None,
                "symbol": None,
                "shares": None,
                "price": None,
                "amount": amount,
                "fee": None,
                "tax": None,
                "currency": currency,
                "description": revolut_type or None,
                "counterparty_name": None,
                "counterparty_iban": None,
                "mcc_code": None,
            }
            rows.append(parsed)

        return rows, errors
