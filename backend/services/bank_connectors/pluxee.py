"""Parser de la hoja de movimientos de la tarjeta restaurante Pluxee.

Pluxee la descarga en Excel con unas líneas de cabecera (nombre de la
tarjeta, últimos dígitos, saldo y periodo) antes de la fila de columnas:

    Fecha;Descripción;Importe

Los importes van en formato español ("-23,45") y al final hay una fila de
total ("IMPORTE") sin fecha, que se ignora. Las cargas de la empresa entran
como ingreso (no como nómina, para no confundir el ciclo de cobro).
"""
import csv
import hashlib
import io
from typing import Any, Dict, List, Optional, Tuple

from .base import BankConnector
from .bbva import _decode, _delimiter, parse_amount, parse_date

_SCAN = 25


def _norm(h: str) -> str:
    return (h or "").strip().strip('"').strip().lower()


def _is_header(cells: List[str]) -> bool:
    n = [_norm(c) for c in cells]
    return "fecha" in n and "importe" in n and any(c.startswith("descripci") for c in n)


def _find_header(lines: List[str]) -> Optional[int]:
    for i, line in enumerate(lines[:_SCAN]):
        if _is_header(next(csv.reader([line], delimiter=_delimiter(line)), [])):
            return i
    return None


def _merchant(desc: str) -> Tuple[str, Optional[str]]:
    """'Pago en GLOVO X1,Barcelona,ESP' → ('GLOVO X1', 'Barcelona')."""
    text = desc.strip()
    for prefix in ("Pago en ", "Devolución de ", "Devolucion de "):
        if text.lower().startswith(prefix.lower()):
            parts = [p.strip() for p in text[len(prefix):].split(",")]
            place = parts[1] if len(parts) > 1 and parts[1].lower() not in ("", "none") else None
            return parts[0] or text, place
    return text, None


class PluxeeConnector(BankConnector):
    """Tarjeta restaurante Pluxee (antes Sodexo)."""

    @classmethod
    def detect(cls, headers: set) -> bool:
        return False  # la fila de columnas nunca es la primera: ver sniff()

    @classmethod
    def sniff(cls, content: bytes) -> bool:
        lines = _decode(content).splitlines()
        head = "\n".join(lines[:_SCAN]).lower()
        return "pluxee" in head and _find_header(lines) is not None

    def parse(self, content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
        lines = _decode(content).splitlines()
        start = _find_header(lines)
        if start is None:
            return [], ["No se encuentra la fila de columnas (Fecha, Descripción, Importe)"]
        reader = csv.reader(io.StringIO("\n".join(lines[start:])), delimiter=_delimiter(lines[start]))
        header = [_norm(h) for h in next(reader)]
        i_date = header.index("fecha")
        i_amount = header.index("importe")
        i_desc = next(j for j, h in enumerate(header) if h.startswith("descripci"))

        rows: List[Dict[str, Any]] = []
        errors: List[str] = []
        seen: Dict[str, int] = {}
        for n, row in enumerate(reader, start=start + 2):
            cell = lambda j: row[j].strip() if j < len(row) else ""  # noqa: E731
            raw_date, desc, raw_amount = cell(i_date), cell(i_desc), cell(i_amount)
            if not raw_date and not raw_amount:
                continue
            if not raw_date:
                continue  # fila de total ("IMPORTE")
            tx_date = parse_date(raw_date)
            if not tx_date:
                errors.append(f"Fila {n}: fecha inválida '{raw_date}'")
                continue
            amount = parse_amount(raw_amount)
            if amount is None:
                errors.append(f"Fila {n}: importe inválido '{raw_amount}'")
                continue

            key = f"{tx_date.isoformat()}|{desc}|{amount:.2f}"
            seen[key] = seen.get(key, 0) + 1
            digest = hashlib.md5(f"{key}#{seen[key]}".encode()).hexdigest()
            topup = amount > 0 and desc.lower().startswith("carga")
            name, place = _merchant(desc)
            rows.append({
                "external_id": f"pluxee_{digest}",
                "datetime": None,
                "date": tx_date,
                "account_category": "CURRENT",
                "type": "TRANSFER_INBOUND" if amount > 0 else "CARD_TRANSACTION",
                "asset_class": None,
                "name": name,
                "symbol": None,
                "shares": None,
                "price": None,
                "amount": amount,
                "fee": None,
                "tax": None,
                "currency": "EUR",
                "description": place if not topup else "Carga de la tarjeta restaurante",
                "counterparty_name": desc[len("Carga de "):].strip() if topup and desc.lower().startswith("carga de ") else None,
                "counterparty_iban": None,
                "mcc_code": None,
            })
        return rows, errors
