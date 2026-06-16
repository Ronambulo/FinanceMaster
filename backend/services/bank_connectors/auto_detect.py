import csv
import io
from typing import Tuple, List, Dict, Any

from .trade_republic import TradeRepublicConnector
from .revolut import RevolutConnector
from .n26 import N26Connector
from .wise import WiseConnector

CONNECTORS = [TradeRepublicConnector, RevolutConnector, N26Connector, WiseConnector]

_BANK_NAMES = {
    TradeRepublicConnector: "trade_republic",
    RevolutConnector: "revolut",
    N26Connector: "n26",
    WiseConnector: "wise",
}


def _extract_headers(content: bytes) -> set:
    """Decode CSV content and return its header columns as a set."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return set()
    return {f.strip().strip('"') for f in reader.fieldnames}


def detect_bank(headers: set) -> str:
    """
    Returns bank name string: 'trade_republic', 'revolut', 'n26', 'wise', 'unknown'.
    Connectors are tested in order; the first match wins.
    """
    for connector_cls in CONNECTORS:
        if connector_cls.detect(headers):
            return _BANK_NAMES[connector_cls]
    return "unknown"


def parse_with_autodetect(
    content: bytes,
    bank_format: str = "auto",
) -> Tuple[List[Dict[str, Any]], List[str], str]:
    """
    Parse CSV content, optionally auto-detecting the bank format.

    Parameters
    ----------
    content : bytes
        Raw CSV file content.
    bank_format : str
        One of 'auto', 'trade_republic', 'revolut', 'n26', 'wise'.
        When 'auto', the bank is detected from the CSV headers.

    Returns
    -------
    (rows, errors, detected_bank)
        rows         – list of dicts ready to build Transaction objects
        errors       – list of human-readable error strings
        detected_bank – the bank name string that was used
    """
    headers = _extract_headers(content)

    # Resolve which connector to use
    if bank_format == "auto" or bank_format not in _BANK_NAMES.values():
        detected = detect_bank(headers)
    else:
        detected = bank_format

    connector_map: Dict[str, type] = {v: k for k, v in _BANK_NAMES.items()}

    if detected == "unknown":
        return (
            [],
            [
                f"Formato de banco no reconocido. "
                f"Columnas detectadas: {sorted(headers)}. "
                "Formatos soportados: Trade Republic, Revolut, N26, Wise."
            ],
            "unknown",
        )

    connector_cls = connector_map[detected]
    connector = connector_cls()
    rows, errors = connector.parse(content)
    return rows, errors, detected
