"""
Reparación de datos ya guardados por bugs que el código nuevo ya no comete.

El código arreglado evita escribir filas malas a partir de ahora, pero no toca
las que ya están en la base de datos — y la BD vive en un volumen que sobrevive
al despliegue, así que sin esto habría que reparar a mano cada instalación.

Se ejecuta en cada arranque y es idempotente: en una BD sana no hace nada y
cuesta un par de consultas. No hace peticiones de red (solo usa los mapas
estáticos), para no bloquear el arranque si Yahoo no responde.
"""
import logging
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models

log = logging.getLogger(__name__)

# Tickers que una búsqueda por nombre resolvió al instrumento equivocado y que
# acabaron escritos en transactions.symbol. resolve_all_symbols() no los vuelve
# a mirar (solo re-resuelve symbol nulo o un ISIN), así que hay que corregirlos
# explícitamente.
BAD_SYMBOLS = {"WGLD.PA"}


def _purge_ticker_cache() -> int:
    """Tira las entradas por nombre que apuntan a un ticker malo."""
    from . import portfolio_calculator as pc

    doomed = [
        k for k, v in pc._persistent_ticker_cache.items()
        if isinstance(v, list) and v and v[0] in BAD_SYMBOLS
    ]
    for k in doomed:
        del pc._persistent_ticker_cache[k]
    if doomed:
        pc._save_ticker_cache()
    return len(doomed)


def _fix_bad_symbols(db: Session) -> int:
    """Re-resuelve el símbolo de las filas que quedaron con un ticker malo."""
    from .portfolio_calculator import _ticker_for_name

    rows = db.query(models.Transaction).filter(
        models.Transaction.symbol.in_(sorted(BAD_SYMBOLS))
    ).all()

    fixed = 0
    for tx in rows:
        entry = _ticker_for_name(tx.name) if tx.name else None
        # Sin un ticker fiable es mejor vaciar el campo que dejar el malo:
        # así resolve_all_symbols() lo reintentará con búsqueda de red.
        new_symbol = entry[0] if entry and entry[0] not in BAD_SYMBOLS else None
        tx.symbol = new_symbol
        fixed += 1
    return fixed


def _fix_misfiled_trades(db: Session) -> int:
    """
    Una fila en CASH/CARD_TRANSACTION que lleva acciones no es un pago con
    tarjeta: es una operación (el saveback) que la heurística clasificó mal
    antes de que hubiera un mapeo para ella. Contaba como gasto y su posición
    desaparecía del portfolio, que solo lee TRADING/SECURITIES.
    """
    from .categorizer import auto_categorize
    from .portfolio_calculator import _ticker_for_name

    rows = db.query(models.Transaction).filter(
        models.Transaction.type == "CARD_TRANSACTION",
        models.Transaction.shares.isnot(None),
        models.Transaction.shares != 0,
        or_(
            models.Transaction.account_category == "CASH",
            models.Transaction.account_category.is_(None),
        ),
    ).all()

    fixed = 0
    for tx in rows:
        new_type = "SELL" if tx.amount > 0 else "BUY"
        tx.type = new_type
        tx.account_category = "TRADING"
        if not tx.symbol and tx.name:
            entry = _ticker_for_name(tx.name)
            if entry:
                tx.symbol = entry[0]
        if tx.is_auto_categorized:
            try:
                cat_id, is_auto, _ = auto_categorize(
                    db=db,
                    user_id=tx.user_id,
                    tx_type=new_type,
                    tx_name=tx.name,
                    tx_description=tx.description,
                    mcc_code=tx.mcc_code,
                    counterparty_name=tx.counterparty_name,
                    amount=tx.amount,
                    user_own_name=None,
                )
                if cat_id:
                    tx.category_id = cat_id
                    tx.is_auto_categorized = is_auto
            except Exception:
                log.warning("No se pudo recategorizar la transacción %s", tx.id)
        fixed += 1
    return fixed


def run_data_repairs(db: Session) -> dict:
    """Aplica todas las reparaciones. Nunca lanza: un fallo aquí no debe
    impedir que la app arranque."""
    result = {"cache_purged": 0, "symbols_fixed": 0, "trades_reclassified": 0}
    try:
        result["cache_purged"] = _purge_ticker_cache()
        result["symbols_fixed"] = _fix_bad_symbols(db)
        result["trades_reclassified"] = _fix_misfiled_trades(db)
        db.commit()
    except Exception as exc:
        db.rollback()
        log.warning("Reparación de datos omitida: %s", exc)
        return result

    if any(result.values()):
        log.info(
            "Reparación de datos: %d entrada(s) de caché purgada(s), "
            "%d símbolo(s) corregido(s), %d operación(es) reclasificada(s)",
            result["cache_purged"], result["symbols_fixed"],
            result["trades_reclassified"],
        )
    return result
