import csv
import hashlib
import io
from datetime import datetime, date
from typing import List, Tuple, Dict, Any, Optional

from .base import BankConnector

# Columns that uniquely identify a Wise (TransferWise) CSV
WISE_TYPES = {"TransferWise ID", "Date", "Amount", "Currency", "Description"}


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
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
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
    # Wise format: "05-01-2024" or "2024-01-05" — no time component usually
    tx_date = _parse_date(val)
    if tx_date:
        return datetime(tx_date.year, tx_date.month, tx_date.day)
    return None


def _map_type(amount: float) -> str:
    if amount >= 0:
        return "TRANSFER_INBOUND"
    return "TRANSFER_OUTBOUND"


def _make_external_id(transferwise_id: str, tx_date: str, description: str, amount: str) -> str:
    if transferwise_id:
        return f"wise_{transferwise_id}"
    raw = f"{tx_date}{description}{amount}"
    return hashlib.md5(raw.encode()).hexdigest()


class WiseConnector(BankConnector):
    """Parser for Wise (TransferWise) CSV exports."""

    @classmethod
    def detect(cls, headers: set) -> bool:
        return WISE_TYPES.issubset(headers)

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

            amount_raw = row.get("Amount", "")
            amount = _parse_float(amount_raw)
            if amount is None:
                errors.append(f"Fila {i}: importe inválido '{amount_raw}'")
                continue

            transferwise_id = row.get("TransferWise ID", "").strip()
            description = row.get("Description", "").strip()
            currency = row.get("Currency", "EUR").strip() or "EUR"
            reference = row.get("Reference", "").strip()
            exchange_rate_raw = row.get("Exchange Rate", "").strip()
            exchange_rate = _parse_float(exchange_rate_raw)

            # Running balance if present
            running_balance_raw = row.get("Running Balance", "").strip()
            running_balance = _parse_float(running_balance_raw)

            # Payee / payer name if present
            payee_name = (
                row.get("Payee Name", "")
                or row.get("Merchant", "")
                or description
            ).strip() or None

            tx_type = _map_type(amount)
            external_id = _make_external_id(transferwise_id, date_raw, description, amount_raw)

            parsed: Dict[str, Any] = {
                "external_id": external_id,
                "datetime": _parse_datetime(date_raw),
                "date": tx_date,
                "account_category": "CURRENT",
                "type": tx_type,
                "asset_class": None,
                "name": payee_name,
                "symbol": None,
                "shares": None,
                "price": exchange_rate,  # store exchange rate in price field
                "amount": amount,
                "fee": None,
                "tax": None,
                "currency": currency,
                "description": reference or description or None,
                "counterparty_name": None,
                "counterparty_iban": None,
                "mcc_code": None,
            }
            rows.append(parsed)

        return rows, errors
