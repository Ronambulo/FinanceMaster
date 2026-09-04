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


# Un saveback tiene dos patas: TR abona la recompensa y la reinvierte en el
# acto. El timeline de la API solo devuelve la compra (el abono únicamente
# aparece en la exportación CSV), así que importando el sync tal cual el saldo
# queda corto exactamente en el importe reinvertido. Reconstruimos el abono.
_SAVEBACK_CREDIT_SUFFIX = "--saveback-reward"
# Margen para emparejar un abono real (del CSV) con su compra: TR abona el día 1
# y ejecuta la compra uno o dos días después.
_SAVEBACK_MATCH_DAYS = 5
_SAVEBACK_MATCH_EPS = 0.02


def _saveback_buys(db: Session, user_id: int | None):
    q = db.query(models.Transaction).filter(
        models.Transaction.type == "BUY",
        models.Transaction.amount < 0,
        models.Transaction.description.ilike("%saveback%"),
    )
    if user_id is not None:
        q = q.filter(models.Transaction.user_id == user_id)
    return q.all()


def ensure_saveback_credits(db: Session, user_id: int | None = None) -> int:
    """
    Crea el abono que financia cada compra de saveback, si no está ya.

    No inventa dinero: el efecto neto sobre el saldo es cero, que es justo lo
    que ocurre en Trade Republic (te abonan la recompensa y la invierten en el
    mismo movimiento). Sin esto el saldo baja por una compra que nunca salió
    del bolsillo del usuario.

    Es idempotente por `external_id`, y si el abono real ya entró por el CSV
    (con su desglose bruto/retención) se respeta ese y no se duplica.
    """
    from datetime import timedelta
    from .categorizer import auto_categorize

    buys = _saveback_buys(db, user_id)
    if not buys:
        return 0

    uids = {tx.user_id for tx in buys}
    credits = db.query(models.Transaction).filter(
        models.Transaction.type == "BENEFITS_SAVEBACK",
        models.Transaction.user_id.in_(sorted(uids)),
    ).all()
    # Un abono solo puede financiar una compra: se va descartando al emparejar.
    unclaimed = list(credits)

    created = 0
    for tx in buys:
        ext_id = f"{tx.external_id or f'tx{tx.id}'}{_SAVEBACK_CREDIT_SUFFIX}"
        if any(c.external_id == ext_id for c in credits):
            continue

        # ¿Existe ya el abono real, importado del CSV? Se compara en neto
        # (bruto + retención), que es lo que TR reinvierte.
        target = abs(tx.amount)
        match = next(
            (
                c for c in unclaimed
                if c.user_id == tx.user_id
                and abs(c.date - tx.date) <= timedelta(days=_SAVEBACK_MATCH_DAYS)
                and abs((c.amount + (c.tax or 0) + (c.fee or 0)) - target) < _SAVEBACK_MATCH_EPS
            ),
            None,
        )
        if match is not None:
            unclaimed.remove(match)
            continue

        category_id = None
        try:
            category_id, _, _ = auto_categorize(
                db=db,
                user_id=tx.user_id,
                tx_type="BENEFITS_SAVEBACK",
                tx_name=tx.name,
                tx_description="Saveback",
                mcc_code=None,
                counterparty_name=None,
                amount=target,
                user_own_name=None,
            )
        except Exception:
            log.warning("No se pudo categorizar el abono de saveback de %s", tx.id)

        credit = models.Transaction(
            user_id=tx.user_id,
            category_id=category_id,
            is_auto_categorized=True,
            external_id=ext_id,
            date=tx.date,
            datetime=tx.datetime,
            type="BENEFITS_SAVEBACK",
            account_category="CASH",
            name=tx.name,
            amount=target,
            currency=tx.currency,
            description="Saveback (abono reconstruido: TR no lo expone por API)",
        )
        db.add(credit)
        credits.append(credit)
        created += 1
    return created


def run_data_repairs(db: Session) -> dict:
    """Aplica todas las reparaciones. Nunca lanza: un fallo aquí no debe
    impedir que la app arranque."""
    result = {
        "cache_purged": 0, "symbols_fixed": 0,
        "trades_reclassified": 0, "saveback_credits": 0,
    }
    try:
        result["cache_purged"] = _purge_ticker_cache()
        result["symbols_fixed"] = _fix_bad_symbols(db)
        result["trades_reclassified"] = _fix_misfiled_trades(db)
        # Después de reclasificar: una compra de saveback mal archivada como
        # gasto de tarjeta acaba de convertirse en BUY y también necesita abono.
        db.flush()
        result["saveback_credits"] = ensure_saveback_credits(db)
        db.commit()
    except Exception as exc:
        db.rollback()
        log.warning("Reparación de datos omitida: %s", exc)
        return result

    if any(result.values()):
        log.info(
            "Reparación de datos: %d entrada(s) de caché purgada(s), "
            "%d símbolo(s) corregido(s), %d operación(es) reclasificada(s), "
            "%d abono(s) de saveback reconstruido(s)",
            result["cache_purged"], result["symbols_fixed"],
            result["trades_reclassified"], result["saveback_credits"],
        )
    return result
