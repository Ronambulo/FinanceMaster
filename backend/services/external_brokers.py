"""Movimientos de brokers externos (p.ej. MyInvestor importado por CSV).

Sus compras forman parte de la cartera, pero el dinero no sale del efectivo
que la app sigue (la cuenta de Trade Republic), así que no deben restar del
saldo de caja ni tratarse como huérfanos al sincronizar con Trade Republic.
"""
from sqlalchemy import and_, or_

from .. import models
from .bank_connectors.myinvestor import EXTERNAL_ID_PREFIX as _MI_PREFIX

EXTERNAL_BROKER_PREFIXES = (_MI_PREFIX,)


def is_external_broker(external_id: str | None) -> bool:
    return bool(external_id) and external_id.startswith(EXTERNAL_BROKER_PREFIXES)


def affects_cash_clause():
    """Filtro SQL: solo movimientos que mueven el efectivo seguido."""
    eid = models.Transaction.external_id
    return or_(eid.is_(None), and_(*[~eid.like(f"{p}%") for p in EXTERNAL_BROKER_PREFIXES]))
