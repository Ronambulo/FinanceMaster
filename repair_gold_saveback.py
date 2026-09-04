"""
repair_gold_saveback.py — Repara datos ya guardados afectados por tres bugs:

  1. Caché de tickers envenenada: una búsqueda por nombre resolvió
     "Physical Gold USD (Acc)" a WGLD.PA (WisdomTree, París, ~380 €) en vez del
     iShares Physical Gold ETC IE00B4ND3602 (~73 €), y ese ticker acabó escrito
     dentro de transactions.symbol.
  2. Saveback mal clasificado: sin entrada para el subtitle "Saveback", el
     conector caía en la heurística de último recurso y guardaba la compra de
     oro como CARD_TRANSACTION en CASH, así que contaba como gasto y su
     posición desaparecía del portfolio (que solo lee TRADING/SECURITIES).
  3. Símbolos resueltos contra la caché envenenada en otros instrumentos.

Es idempotente: se puede ejecutar las veces que haga falta.
Uso: python repair_gold_saveback.py [--dry-run]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from backend.database import SessionLocal
from backend import models
from backend.services.categorizer import auto_categorize
from backend.services import portfolio_calculator as pc

DRY_RUN = "--dry-run" in sys.argv

# Tickers escritos en la BD que sabemos que apuntan al instrumento equivocado.
BAD_SYMBOLS = {"WGLD.PA"}

CACHE_FILE = ROOT / "backend" / "data" / "ticker_cache.json"


def purge_ticker_cache() -> int:
    """Borra las entradas por nombre; el mapa estático ya cubre lo bueno."""
    if not CACHE_FILE.exists():
        print("  caché: no existe, nada que purgar")
        return 0
    try:
        cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (ValueError, OSError) as e:
        print(f"  caché: ilegible ({e}), se deja como está")
        return 0

    doomed = [
        k for k, v in cache.items()
        if k.startswith("name:") or (isinstance(v, list) and v and v[0] in BAD_SYMBOLS)
    ]
    for k in doomed:
        print(f"    - {k} = {cache[k]}")
        del cache[k]
    if doomed and not DRY_RUN:
        CACHE_FILE.write_text(json.dumps(cache, indent=2), encoding="utf-8")
    print(f"  caché: {len(doomed)} entrada(s) purgada(s)")
    return len(doomed)


def fix_symbols(db) -> int:
    """Re-resuelve el símbolo de las filas que quedaron con un ticker malo."""
    rows = db.query(models.Transaction).filter(
        models.Transaction.symbol.in_(sorted(BAD_SYMBOLS))
    ).all()
    fixed = 0
    for tx in rows:
        entry = pc.resolve_to_ticker(isin=None, name=tx.name)
        if not entry or not entry[0] or entry[0] in BAD_SYMBOLS:
            print(f"    ! {tx.date} {tx.name!r}: sin ticker fiable, se deja {tx.symbol}")
            continue
        print(f"    {tx.date} {tx.name!r}: {tx.symbol} → {entry[0]}")
        if not DRY_RUN:
            tx.symbol = entry[0]
        fixed += 1
    print(f"  símbolos: {fixed} fila(s) corregida(s)")
    return fixed


def fix_misfiled_trades(db) -> int:
    """
    Una fila en CASH/CARD_TRANSACTION que lleva acciones no es un pago con
    tarjeta: es una compra (el saveback) que la heurística clasificó mal.
    """
    rows = db.query(models.Transaction).filter(
        models.Transaction.account_category == "CASH",
        models.Transaction.type == "CARD_TRANSACTION",
        models.Transaction.shares.isnot(None),
        models.Transaction.shares != 0,
    ).all()

    fixed = 0
    for tx in rows:
        new_type = "SELL" if tx.amount > 0 else "BUY"
        entry = pc.resolve_to_ticker(isin=None, name=tx.name) if tx.name else None
        new_symbol = tx.symbol or (entry[0] if entry else None)
        print(f"    {tx.date} {tx.name!r} {tx.amount:+.2f} sh={tx.shares}: "
              f"CASH/CARD_TRANSACTION → TRADING/{new_type} sym={new_symbol}")
        if not DRY_RUN:
            tx.type = new_type
            tx.account_category = "TRADING"
            tx.symbol = new_symbol
            if tx.is_auto_categorized:
                cat_id, is_auto, is_internal = auto_categorize(
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
        fixed += 1
    print(f"  operaciones mal clasificadas: {fixed} fila(s) corregida(s)")
    return fixed


def main() -> None:
    if DRY_RUN:
        print("=== DRY RUN — no se escribe nada ===\n")

    print("1) Purgando caché de tickers")
    purge_ticker_cache()
    pc._load_ticker_cache()  # recargar en memoria tras la purga

    db = SessionLocal()
    try:
        print("\n2) Corrigiendo símbolos con ticker equivocado")
        fix_symbols(db)

        print("\n3) Reclasificando operaciones guardadas como tarjeta")
        fix_misfiled_trades(db)

        if DRY_RUN:
            db.rollback()
            print("\n=== DRY RUN: cambios descartados ===")
        else:
            db.commit()
            print("\n=== Hecho. Lanza un sync de Trade Republic para traer "
                  "los abonos de saveback que faltan. ===")
    finally:
        db.close()


if __name__ == "__main__":
    main()
