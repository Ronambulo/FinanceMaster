"""Parser de los movimientos exportados desde la web/app de BBVA.

BBVA exporta la cuenta con unas líneas informativas (titular, número de
cuenta, fechas…) antes de la fila de columnas real:

    F.Valor;Fecha;Concepto;Movimiento;Importe;Divisa;Disponible;Divisa;Observaciones

El separador suele ser ';' y los importes van en formato español
("-1.234,56"). La fila de columnas se busca en las primeras líneas.
"""
import csv
import hashlib
import io
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from .base import BankConnector

_REQUIRED = {"fecha", "concepto", "importe"}
_HEADER_SCAN_LINES = 20


def _norm(h: str) -> str:
    return (h or "").strip().strip('"').strip().lower()


def _decode(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return content.decode("latin-1")


def _delimiter(line: str) -> str:
    counts = {d: line.count(d) for d in (";", "\t", ",")}
    return max(counts, key=counts.get)


def _cells(line: str) -> List[str]:
    return next(csv.reader([line], delimiter=_delimiter(line)), [])


def _find_header(lines: List[str]) -> Optional[int]:
    for i, line in enumerate(lines[:_HEADER_SCAN_LINES]):
        if _REQUIRED.issubset({_norm(c) for c in _cells(line)}):
            return i
    return None


def parse_amount(val: Optional[str]) -> Optional[float]:
    """'-1.234,56' → -1234.56 · '12,5' → 12.5 · '-12.50' → -12.5 · '1.234' → 1234"""
    if val is None:
        return None
    s = (val.strip().replace("€", "").replace("EUR", "")
         .replace(" ", "").replace(" ", ""))
    if not s:
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_date(val: Optional[str]) -> Optional[date]:
    v = (val or "").strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y"):
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    return None


def tx_type(amount: float, concept: str, movement: str) -> str:
    text = f"{concept} {movement}".lower()
    if amount >= 0:
        if "nómina" in text or "nomina" in text:
            return "CUSTOMER_INPAYMENT"
        return "TRANSFER_INBOUND"
    if "transferencia" in text or "bizum" in text or "recibo" in text or "adeudo" in text:
        return "TRANSFER_OUTBOUND"
    return "CARD_TRANSACTION"


class BBVAConnector(BankConnector):
    """Parser para los CSV de movimientos de BBVA."""

    @classmethod
    def detect(cls, headers: set) -> bool:
        cells = {_norm(h) for h in headers}
        return _REQUIRED.issubset(cells) and ("f.valor" in cells or "disponible" in cells)

    @classmethod
    def sniff(cls, content: bytes) -> bool:
        """Detecta el formato aunque la fila de columnas no sea la primera."""
        lines = _decode(content).splitlines()
        i = _find_header(lines)
        return i is not None and cls.detect(set(_cells(lines[i])))

    def parse(self, content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
        lines = _decode(content).splitlines()
        start = _find_header(lines)
        if start is None:
            return [], ["No se encuentra la fila de columnas (Fecha, Concepto, Importe)"]

        reader = csv.reader(io.StringIO("\n".join(lines[start:])), delimiter=_delimiter(lines[start]))
        header = [_norm(h) for h in next(reader)]
        # "Divisa" aparece dos veces: la primera es la del importe.
        idx: Dict[str, int] = {}
        for j, h in enumerate(header):
            idx.setdefault(h, j)

        def cell(row: List[str], name: str) -> str:
            j = idx.get(name)
            return row[j].strip() if j is not None and j < len(row) else ""

        rows: List[Dict[str, Any]] = []
        errors: List[str] = []
        for n, row in enumerate(reader, start=start + 2):
            if not any(c.strip() for c in row):
                continue
            raw_date = cell(row, "fecha") or cell(row, "f.valor")
            tx_date = parse_date(raw_date)
            if not tx_date:
                errors.append(f"Fila {n}: fecha inválida '{raw_date}'")
                continue
            raw_amount = cell(row, "importe")
            amount = parse_amount(raw_amount)
            if amount is None:
                errors.append(f"Fila {n}: importe inválido '{raw_amount}'")
                continue

            concept = cell(row, "concepto")
            movement = cell(row, "movimiento")
            notes = cell(row, "observaciones")
            balance = cell(row, "disponible")
            digest = hashlib.md5(f"{raw_date}|{concept}|{raw_amount}|{balance}".encode()).hexdigest()

            rows.append({
                "external_id": f"bbva_{digest}",
                "datetime": None,
                "date": tx_date,
                "account_category": "CURRENT",
                "type": tx_type(amount, concept, movement),
                "asset_class": None,
                "name": concept or movement or None,
                "symbol": None,
                "shares": None,
                "price": None,
                "amount": amount,
                "fee": None,
                "tax": None,
                "currency": (cell(row, "divisa") or "EUR").upper(),
                "description": " · ".join(x for x in (movement, notes) if x and x != concept) or None,
                "counterparty_name": None,
                "counterparty_iban": None,
                "mcc_code": None,
            })
        return rows, errors
