"""Comercios: limpieza de nombres, catálogo de marcas y logos.

- clean_name: quita prefijos de pasarela, códigos, números de tarjeta y sufijos legales.
- match_brand: busca una marca del catálogo por palabra completa (no por subcadena).
- merchant_key: clave estable para agrupar movimientos del mismo comercio.
- match_keyword: palabras genéricas (bar, farmacia, hotel...) sin marca.
"""
import json
import os
import re
import unicodedata
from functools import lru_cache
from typing import Optional

_DATA = os.path.join(os.path.dirname(__file__), "..", "data", "merchants_es.json")

# ── Normalización ───────────────────────────────────────────────────────────

def norm(text: Optional[str]) -> str:
    """Minúsculas, sin acentos, solo letras/números/&, espacios simples."""
    if not text:
        return ""
    t = unicodedata.normalize("NFKD", text)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = t.replace("'", "").replace("’", "")
    t = re.sub(r"[^a-z0-9&]+", " ", t)
    return " ".join(t.split())


_MONTHS = "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|ENE|ABR|AGO|DIC"
_PREFIX = re.compile(r"^\s*(paypal\s*\*|pp\s*\*|sq\s*\*|sumup\s*\*|zettle_?\*|ztl\s*\*|izettle\s*\*|"
                     r"stripe\s*\*|google\s*\*|apple\s*pay\s*|carga\s+de\s+|compra\s+en\s+|pago\s+en\s+)", re.I)
_DATECODE = re.compile(rf"\d{{2}}(?:{_MONTHS})\b\s*[A-Z0-9]{{6,10}}\b|\b\d{{2}}(?:{_MONTHS})\b", re.I)
_CARD = re.compile(r"[*xX]{2,}\s?\d{4}\b|\b\d{5,}\b")
_LEGAL = re.compile(r"[\s,]+(s\.?\s?a\.?\s?u\.?|s\.?\s?l\.?\s?u\.?|s\.?\s?a\.?|s\.?\s?l\.?|"
                    r"gmbh|ltd\.?|limited|inc\.?|llc|b\.?v\.?|ag|sarl|s\.?r\.?l\.?)\s*$", re.I)
# Código de pedido: mezcla de letras y cifras en mayúsculas (MP9FA7T2, M87JR2QG).
_CODE = re.compile(r"\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{7,12}\b")


@lru_cache(maxsize=8192)
def clean_name(name: Optional[str]) -> str:
    """Nombre legible del comercio. Si la limpieza lo deja vacío, devuelve el original."""
    raw = " ".join((name or "").split())
    if not raw:
        return ""
    t = _PREFIX.sub("", raw)
    t = t.lstrip("*").strip()
    t = _DATECODE.sub(" ", t)
    t = _CODE.sub(" ", t)
    t = _CARD.sub(" ", t)
    for _ in range(2):
        t = _LEGAL.sub("", t.strip())
    # Palabras repetidas seguidas ("Glovo GLOVO").
    out: list[str] = []
    for w in t.split():
        if out and out[-1].lower() == w.lower():
            continue
        out.append(w)
    t = " ".join(out).strip(" -*.,/")
    return t or raw


# ── Catálogo ────────────────────────────────────────────────────────────────

class _Catalog:
    def __init__(self):
        with open(_DATA, encoding="utf-8") as f:
            data = json.load(f)
        self.brands: dict[str, dict] = {b["id"]: b for b in data["brands"]}
        loose: dict[str, str] = {}
        strict: dict[str, str] = {}
        for b in data["brands"]:
            for a in b["aliases"]:
                n = norm(a)
                if not n:
                    continue
                (strict if b.get("strict") else loose).setdefault(n, b["id"])
        self.loose_alias = loose
        self.strict_alias = strict
        self.loose_re = _alt(loose)
        self.strict_re = re.compile(r"^(?:" + "|".join(_esc_sorted(strict)) + r")(?![a-z0-9&])") if strict else None
        kw: dict[str, str] = {}
        for k in data.get("keywords", []):
            for w in k["words"]:
                n = norm(w)
                if n:
                    kw.setdefault(n, k["cat"])
        self.keywords = kw
        self.keyword_re = _alt(kw)


def _esc_sorted(words) -> list[str]:
    return [re.escape(w) for w in sorted(words, key=len, reverse=True)]


def _alt(words: dict) -> Optional[re.Pattern]:
    if not words:
        return None
    return re.compile(r"(?<![a-z0-9&])(?:" + "|".join(_esc_sorted(words)) + r")(?![a-z0-9&])")


@lru_cache(maxsize=1)
def catalog() -> _Catalog:
    return _Catalog()


@lru_cache(maxsize=8192)
def match_brand(name: Optional[str]) -> Optional[str]:
    """Id de la marca del catálogo que aparece en el nombre, o None."""
    n = norm(clean_name(name))
    if not n:
        return None
    c = catalog()
    best: Optional[tuple[int, int, str]] = None  # (posición, -longitud, id)
    if c.strict_re:
        m = c.strict_re.match(n)
        if m:
            best = (0, -len(m.group(0)), c.strict_alias[m.group(0)])
    if c.loose_re:
        m = c.loose_re.search(n)
        if m:
            cand = (m.start(), -len(m.group(0)), c.loose_alias[m.group(0)])
            if best is None or cand < best:
                best = cand
    return best[2] if best else None


def brand(brand_id: Optional[str]) -> Optional[dict]:
    return catalog().brands.get(brand_id) if brand_id else None


def brand_category_names(brand_id: str) -> list[str]:
    """Cadena de categorías candidatas de la marca, de la más concreta a la genérica."""
    b = brand(brand_id)
    return [x.strip() for x in b["cat"].split("|")] if b else []


def match_keyword(text: Optional[str]) -> Optional[list[str]]:
    """Categorías candidatas por palabra genérica (bar, farmacia...) en el texto."""
    n = norm(text)
    c = catalog()
    if not n or not c.keyword_re:
        return None
    m = c.keyword_re.search(n)
    if not m:
        return None
    return [x.strip() for x in c.keywords[m.group(0)].split("|")]


def merchant_key(name: Optional[str]) -> str:
    """Clave para agrupar: el id de la marca si se reconoce; si no, el nombre limpio normalizado."""
    b = match_brand(name)
    if b:
        return b
    return norm(clean_name(name)) or " ".join((name or "").split()).lower()


def logo_url(bid: str) -> Optional[str]:
    """URL del logo solo si ya está descargado (lo baja el servidor en segundo
    plano); la versión es la fecha del fichero, así una ficha nueva se refresca."""
    import os
    from .logos import cached_path
    p = cached_path(bid)
    if not p:
        return None
    try:
        return f"/api/merchants/logo/{bid}?v={int(os.path.getmtime(p))}"
    except OSError:
        return None


def merchant_info(name: Optional[str]) -> Optional[dict]:
    """Lo que necesita el frontend para pintar el comercio: nombre limpio, marca, color y logo."""
    if not name or not name.strip():
        return None
    bid = match_brand(name)
    b = brand(bid)
    if b:
        return {"key": bid, "name": b["name"], "brand": bid, "color": b.get("color"),
                "logo": logo_url(bid) if b.get("domain") else None}
    return {"key": merchant_key(name), "name": clean_name(name), "brand": None, "color": None, "logo": None}
