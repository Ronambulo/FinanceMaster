import csv
import hashlib
import io
from datetime import datetime, date
from typing import List, Tuple, Dict, Any, Optional

from .base import BankConnector

# Columns that uniquely identify an N26 CSV
N26_TYPES = {"Date", "Payee", "Account number", "Transaction type", "Amount (EUR)"}

# Mapping from N26 transaction type to internal type
_TYPE_MAP = {
    "MasterCard Payment": "CARD_TRANSACTION",
    "MasterCard Payment (International)": "CARD_TRANSACTION",
    "Income": "CUSTOMER_INPAYMENT",
    "Outgoing Transfer": "TRANSFER_OUTBOUND",
    "Incoming Transfer": "TRANSFER_INBOUND",
    "MoneyBeam": "TRANSFER_OUTBOUND",
    "MoneyBeam (sent)": "TRANSFER_OUTBOUND",
    "MoneyBeam (received)": "TRANSFER_INBOUND",
    "Refund": "CARD_TRANSACTION",
    "ATM": "CARD_TRANSACTION",
    "Bank Transfer": "TRANSFER_OUTBOUND",
    "Direct Debit": "TRANSFER_OUTBOUND",
    "Cancellation": "CARD_TRANSACTION",
}


def _parse_float(val: str) -> Optional[float]:
    if not val or val.strip() == "":
        return None
    try:
        # N26 may use comma as decimal separator
        cleaned = val.strip().replace(",", ".")
        return float(cleaned)
    except ValueError:
        return None


def _parse_date(val: str) -> Optional[date]:
    if not val:
        return None
    val = val.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    try:
        return date.fromisoformat(val[:10])
    except Exception:
        return None


def _map_type(n26_type: str) -> str:
    t = n26_type.strip()
    if t in _TYPE_MAP:
        return _TYPE_MAP[t]
    # Partial match fallbacks
    tl = t.lower()
    if "income" in tl or "incoming" in tl:
        return "CUSTOMER_INPAYMENT"
    if "outgoing" in tl or "sent" in tl:
        return "TRANSFER_OUTBOUND"
    if "mastercard" in tl or "payment" in tl or "atm" in tl:
        return "CARD_TRANSACTION"
    return "CARD_TRANSACTION"


def _make_external_id(tx_date: str, payee: str, amount: str) -> str:
    raw = f"{tx_date}{payee}{amount}"
    return hashlib.md5(raw.encode()).hexdigest()


class N26Connector(BankConnector):
    """Parser for N26 CSV exports."""

    @classmethod
    def detect(cls, headers: set) -> bool:
        return N26_TYPES.issubset(headers)

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

            date_raw = row.get("Date", "")
            tx_date = _parse_date(date_raw)
            if not tx_date:
                errors.append(f"Fila {i}: fecha inválida '{date_raw}'")
                continue

            amount_raw = row.get("Amount (EUR)", "")
            amount = _parse_float(amount_raw)
            if amount is None:
                errors.append(f"Fila {i}: importe inválido '{amount_raw}'")
                continue

            payee = row.get("Payee", "").strip()
            n26_type = row.get("Transaction type", "").strip()
            reference = row.get("Payment reference", "").strip()
            account_number = row.get("Account number", "").strip()

            # Foreign currency info
            amount_foreign_raw = row.get("Amount (Foreign Currency)", "").strip()
            foreign_currency = row.get("Type Foreign Currency", "").strip() or None
            amount_foreign = _parse_float(amount_foreign_raw)

            tx_type = _map_type(n26_type)
            external_id = _make_external_id(date_raw, payee, amount_raw)

            parsed: Dict[str, Any] = {
                "external_id": external_id,
                "datetime": None,
                "date": tx_date,
                "account_category": "CURRENT",
                "type": tx_type,
                "asset_class": None,
                "name": payee or None,
                "symbol": None,
                "shares": None,
                "price": None,
                "amount": amount,
                "fee": None,
                "tax": None,
                "currency": "EUR",
                "description": reference or n26_type or None,
                "counterparty_name": None,
                "counterparty_iban": account_number or None,
                "mcc_code": None,
            }
            rows.append(parsed)

        return rows, errors
