import csv
import io
from typing import Tuple, List, Dict, Any

from .trade_republic import TradeRepublicConnector
from .revolut import RevolutConnector
from .n26 import N26Connector
from .wise import WiseConnector
from .myinvestor import MyInvestorConnector
from .bbva import BBVAConnector

CONNECTORS = [TradeRepublicConnector, RevolutConnector, N26Connector, WiseConnector, MyInvestorConnector, BBVAConnector]

_BANK_NAMES = {
    TradeRepublicConnector: "trade_republic",
    RevolutConnector: "revolut",
    N26Connector: "n26",
    WiseConnector: "wise",
    MyInvestorConnector: "myinvestor",
    BBVAConnector: "bbva",
}

BANK_LABELS = {
    "trade_republic": "Trade Republic",
    "revolut": "Revolut",
    "n26": "N26",
    "wise": "Wise",
    "myinvestor": "MyInvestor",
    "bbva": "BBVA",
}


def _extract_headers(content: bytes) -> set:
    """Decode CSV content and return its header columns as a set.

    The delimiter is sniffed from the first line: most banks use ',' but some
    Spanish exports (MyInvestor) use ';'.
    """
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    first_line = text.split("\n", 1)[0]
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        return set()
    return {f.strip().strip('"') for f in reader.fieldnames}


def detect_bank(headers: set) -> str:
    """
    Returns bank name string: 'trade_republic', 'revolut', 'n26', 'wise',
    'myinvestor', 'unknown'. Connectors are tested in order; the first match wins.
    """
    for connector_cls in CONNECTORS:
        if connector_cls.detect(headers):
            return _BANK_NAMES[connector_cls]
    return "unknown"


def parse_file(content: bytes, bank_format: str = "auto") -> Dict[str, Any]:
    """
    Parse CSV content, optionally auto-detecting the bank format.

    Returns a dict with:
        rows     – list of dicts ready to build Transaction objects
        errors   – human-readable errors (rows that could not be read)
        skipped  – rows intentionally ignored (e.g. rejected orders)
        detected – the bank name string that was used ('unknown' if none)
    """
    headers = _extract_headers(content)

    if bank_format == "auto" or bank_format not in _BANK_NAMES.values():
        detected = detect_bank(headers)
        # BBVA pone líneas informativas antes de la fila de columnas.
        if detected == "unknown" and BBVAConnector.sniff(content):
            detected = "bbva"
    else:
        detected = bank_format

    if detected == "unknown":
        supported = ", ".join(BANK_LABELS.values())
        return {
            "rows": [],
            "errors": [
                "Formato de banco no reconocido. "
                f"Columnas detectadas: {', '.join(sorted(headers)) or 'ninguna'}. "
                f"Formatos soportados: {supported}."
            ],
            "skipped": [],
            "detected": "unknown",
        }

    connector_map: Dict[str, type] = {v: k for k, v in _BANK_NAMES.items()}
    connector = connector_map[detected]()
    rows, errors = connector.parse(content)
    return {
        "rows": rows,
        "errors": errors,
        "skipped": list(getattr(connector, "skipped", []) or []),
        "detected": detected,
    }


def parse_with_autodetect(
    content: bytes,
    bank_format: str = "auto",
) -> Tuple[List[Dict[str, Any]], List[str], str]:
    """Backwards-compatible wrapper around parse_file: (rows, errors, detected_bank)."""
    result = parse_file(content, bank_format)
    return result["rows"], result["errors"], result["detected"]
