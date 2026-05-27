import csv
import io
from datetime import datetime, date
from typing import List, Tuple, Dict, Any, Optional


EXPECTED_COLUMNS = {
    "datetime", "date", "account_type", "category", "type",
    "asset_class", "name", "symbol", "shares", "price", "amount",
    "fee", "tax", "currency", "transaction_id", "counterparty_name",
    "counterparty_iban", "description", "mcc_code",
}


def _parse_float(val: str) -> Optional[float]:
    if not val or val.strip() == "":
        return None
    try:
        return float(val.strip())
    except ValueError:
        return None


def _parse_date(val: str) -> Optional[date]:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00")).date()
    except Exception:
        try:
            return date.fromisoformat(val[:10])
        except Exception:
            return None


def _parse_datetime(val: str) -> Optional[datetime]:
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def parse_csv(content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parse Trade Republic CSV bytes.
    Returns (rows, errors) where rows are dicts ready to create Transaction objects.
    """
    errors = []
    rows = []

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return [], ["CSV vacío o sin cabeceras"]

    # Normalize fieldnames
    fieldnames = [f.strip().strip('"') for f in reader.fieldnames]

    for i, raw_row in enumerate(reader, start=2):
        row = {k.strip().strip('"'): (v.strip().strip('"') if v else "") for k, v in raw_row.items()}

        tx_date = _parse_date(row.get("date", ""))
        if not tx_date:
            errors.append(f"Fila {i}: fecha inválida '{row.get('date')}'")
            continue

        amount_raw = row.get("amount", "")
        amount = _parse_float(amount_raw)
        if amount is None:
            errors.append(f"Fila {i}: importe inválido '{amount_raw}'")
            continue

        tx_type = row.get("type", "UNKNOWN").strip()
        external_id = row.get("transaction_id", "").strip() or None

        parsed = {
            "external_id": external_id,
            "datetime": _parse_datetime(row.get("datetime", "")),
            "date": tx_date,
            "account_category": row.get("category", "").strip() or None,
            "type": tx_type,
            "asset_class": row.get("asset_class", "").strip() or None,
            "name": row.get("name", "").strip() or None,
            "symbol": row.get("symbol", "").strip() or None,
            "shares": _parse_float(row.get("shares", "")),
            "price": _parse_float(row.get("price", "")),
            "amount": amount,
            "fee": _parse_float(row.get("fee", "")),
            "tax": _parse_float(row.get("tax", "")),
            "currency": row.get("currency", "EUR").strip() or "EUR",
            "description": row.get("description", "").strip() or None,
            "counterparty_name": row.get("counterparty_name", "").strip() or None,
            "counterparty_iban": row.get("counterparty_iban", "").strip() or None,
            "mcc_code": row.get("mcc_code", "").strip() or None,
        }
        rows.append(parsed)

    return rows, errors
