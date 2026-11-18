"""Tipo de cada activo de la cartera (acción, ETF, ETC, fondo, cripto, derivado).

Trade Republic no manda el tipo, así que se deduce solo:
  1. lo que haya elegido el usuario en el detalle de la posición,
  2. el tipo que venga en los datos (MyInvestor marca los fondos),
  3. el nombre, cuando es inequívoco (un "Long ..." es un derivado, un
     "Physical Gold" es un ETC),
  4. el tipo que da Yahoo Finance para el ticker (se consulta una vez y se
     guarda en la caché de tickers),
  5. pistas más flojas del nombre (UCITS, (Acc)...) y, si nada encaja, acción.
"""
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Iterable, Optional

from sqlalchemy.orm import Session

from .. import models, schemas

KINDS = ("STOCK", "ETF", "ETC", "FUND", "CRYPTO", "DERIVATIVE", "OTHER")

_DERIVATIVE = re.compile(r"^(long|short|turbo|call|put|mini|faktor|factor)\b|knock[- ]?out|warrant|optionsschein", re.I)
_ETC = re.compile(r"\bET[CN]\b|physical\s+(gold|silver|platinum|palladium|metals?)|^(gold|silver|platinum|palladium)\b|\bxetra[- ]gold\b", re.I)
_CRYPTO = re.compile(r"^(bitcoin|ethereum|solana|cardano|ripple|xrp|litecoin|dogecoin|polkadot|avalanche|chainlink|polygon|tron)$", re.I)
_ETF = re.compile(r"\bETF\b|\bUCITS\b|\((acc|dist)\)|^(core |ishares|vanguard|xtrackers|amundi|lyxor|spdr|invesco|wisdomtree|vaneck)", re.I)
_FUND = re.compile(r"\bindex fund\b|\bfondo\b|\bFI$", re.I)


def _explicit(asset_class: Optional[str]) -> Optional[str]:
    """Normaliza el tipo que venga en los datos. STOCK no cuenta: era el valor por defecto."""
    c = (asset_class or "").strip().upper()
    if not c or c in ("STOCK", "EQUITY", "SHARE"):
        return None
    if c in ("FUND", "MUTUALFUND", "MUTUAL_FUND"):
        return "FUND"
    if c in ("ETC", "ETN", "COMMODITY"):
        return "ETC"
    if c in ("CRYPTO", "CRYPTOCURRENCY"):
        return "CRYPTO"
    if c in ("DERIVATIVE", "WARRANT", "KNOCKOUT", "OPTION", "FUTURE"):
        return "DERIVATIVE"
    return c if c in KINDS else None


def from_name_strong(name: Optional[str]) -> Optional[str]:
    n = (name or "").strip()
    if _DERIVATIVE.search(n):
        return "DERIVATIVE"
    if _ETC.search(n):
        return "ETC"
    if _CRYPTO.search(n):
        return "CRYPTO"
    return None


def from_name_weak(name: Optional[str]) -> Optional[str]:
    n = (name or "").strip()
    if _ETF.search(n):
        return "ETF"
    if _FUND.search(n):
        return "FUND"
    return None


def from_quote(quote_type: Optional[str], long_name: str = "") -> Optional[str]:
    """Traduce el quoteType de Yahoo. Los ETC cotizan como ETF: se separan por el nombre."""
    q = (quote_type or "").upper()
    if q in ("ETF", "EQUITY") and _ETC.search(long_name or ""):
        return "ETC"
    return {
        "ETF": "ETF",
        "EQUITY": "STOCK",
        "MUTUALFUND": "FUND",
        "CRYPTOCURRENCY": "CRYPTO",
        "FUTURE": "DERIVATIVE",
        "OPTION": "DERIVATIVE",
    }.get(q)


def _yahoo_kind(ticker: str) -> Optional[str]:
    """Tipo según Yahoo, con caché en disco. Un fallo de red no se guarda."""
    from . import portfolio_calculator as pc
    key = f"type:{ticker}"
    if key in pc._persistent_ticker_cache:
        v = pc._persistent_ticker_cache[key]
        return v[0] if v else None
    try:
        import yfinance as yf
        info = yf.Ticker(ticker).info or {}
    except Exception:
        return None
    kind = from_quote(info.get("quoteType"), info.get("longName") or info.get("shortName") or "")
    pc._persistent_ticker_cache[key] = [kind] if kind else None
    pc._save_ticker_cache()
    return kind


def _tickers(positions: Iterable[schemas.PortfolioPosition]) -> Dict[str, str]:
    from .portfolio_calculator import resolve_to_ticker, _is_isin
    out: Dict[str, str] = {}
    for p in positions:
        try:
            hit = resolve_to_ticker(p.symbol, p.name) if _is_isin(p.symbol) else (p.symbol, None)
        except Exception:
            hit = None
        if hit and hit[0]:
            out[p.symbol] = hit[0]
    return out


def overrides(db: Session, user_id: int) -> Dict[str, str]:
    rows = db.query(models.AssetTypeOverride).filter(models.AssetTypeOverride.user_id == user_id).all()
    return {r.symbol: r.asset_class for r in rows}


def classify(positions: Iterable[schemas.PortfolioPosition], yahoo=None) -> Dict[str, str]:
    """Tipo automático de cada posición, por símbolo."""
    yahoo = yahoo or _yahoo_kind
    auto: Dict[str, str] = {}
    pending = []
    for p in positions:
        k = _explicit(p.asset_class) or from_name_strong(p.name)
        if k:
            auto[p.symbol] = k
        else:
            pending.append(p)
    if pending:
        tickers = _tickers(pending)
        uniq = sorted(set(tickers.values()))
        with ThreadPoolExecutor(max_workers=6) as ex:
            kinds = dict(zip(uniq, ex.map(yahoo, uniq)))
        for p in pending:
            t = tickers.get(p.symbol)
            auto[p.symbol] = (kinds.get(t) if t else None) or from_name_weak(p.name) or "STOCK"
    return auto


def apply(db: Session, user_id: int, perf: schemas.PortfolioPerformance) -> schemas.PortfolioPerformance:
    """Pone en cada posición su tipo definitivo (y el automático, para poder volver a él)."""
    chosen = overrides(db, user_id)
    for p in perf.positions:          # si ya pasó por aquí, se parte del automático
        if p.asset_class_auto:
            p.asset_class = p.asset_class_auto
    auto = classify(perf.positions)
    for p in perf.positions:
        p.asset_class_auto = auto[p.symbol]
        p.asset_class = chosen.get(p.symbol) or auto[p.symbol]
        p.asset_class_manual = p.symbol in chosen
    return perf


def set_override(db: Session, user_id: int, symbol: str, asset_class: Optional[str]) -> None:
    row = (db.query(models.AssetTypeOverride)
           .filter(models.AssetTypeOverride.user_id == user_id, models.AssetTypeOverride.symbol == symbol)
           .first())
    if asset_class is None:
        if row:
            db.delete(row)
    elif row:
        row.asset_class = asset_class
    else:
        db.add(models.AssetTypeOverride(user_id=user_id, symbol=symbol, asset_class=asset_class))
    db.commit()
