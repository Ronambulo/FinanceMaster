import json
import os
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from .. import models

_MCC_DATA: dict = {}

def _load_mcc():
    global _MCC_DATA
    if not _MCC_DATA:
        path = os.path.join(os.path.dirname(__file__), "..", "data", "mcc_es.json")
        with open(path, encoding="utf-8") as f:
            _MCC_DATA = json.load(f)

# Transaction types → (category name, category type)
TYPE_MAP = {
    "INTEREST_PAYMENT": ("Intereses", "income"),
    "DIVIDEND": ("Dividendos", "income"),
    "STOCKPERK": ("Beneficios Trading", "income"),
    "BENEFITS_SAVEBACK": ("Saveback", "income"),
    "CUSTOMER_INPAYMENT": ("Ingreso", "income"),
    "TRANSFER_INSTANT_INBOUND": ("Transferencia Entrante", "income"),
    "TRANSFER_INBOUND": ("Transferencia Entrante", "income"),
    "TRANSFER_INSTANT_OUTBOUND": ("Transferencia Saliente", "expense"),
    "TRANSFER_OUTBOUND": ("Transferencia Saliente", "expense"),
    "BUY": ("Compra Inversión", "investment"),
    "SELL": ("Venta Inversión", "investment"),
    "CARD_TRANSACTION": ("Compra con Tarjeta", "expense"),
    "CARD_TRANSACTION_INTERNATIONAL": ("Compra Internacional", "expense"),
    "TAX": ("Impuestos", "expense"),
}

# Las marcas y palabras genericas viven en data/merchants_es.json (services/merchants.py).


def get_or_create_system_category(db: Session, name: str, cat_type: str, icon: str = "💰", color: str = "#6366f1") -> models.Category:
    cat = db.query(models.Category).filter(
        models.Category.user_id == None,
        models.Category.name == name,
    ).first()
    if not cat:
        cat = models.Category(
            user_id=None,
            name=name,
            icon=icon,
            color=color,
            type=cat_type,
            is_system=True,
        )
        db.add(cat)
        db.flush()
    return cat


def seed_system_categories(db: Session):
    _load_mcc()
    system_cats = [
        ("Supermercado", "expense", "🛒", "#22c55e"),
        ("Restaurante", "expense", "🍽️", "#f97316"),
        ("Bar / Cafetería", "expense", "☕", "#f97316"),
        ("Comida Rápida", "expense", "🍔", "#f97316"),
        ("Transporte Público", "expense", "🚇", "#3b82f6"),
        ("Taxi / Uber", "expense", "🚕", "#3b82f6"),
        ("Vuelos", "expense", "✈️", "#3b82f6"),
        ("Hotel", "expense", "🏨", "#8b5cf6"),
        ("Software y Apps", "expense", "💻", "#6366f1"),
        ("Electrónica", "expense", "📱", "#6366f1"),
        ("Libros / Electrónica", "expense", "📚", "#6366f1"),
        ("Ropa", "expense", "👕", "#ec4899"),
        ("Farmacia", "expense", "💊", "#ef4444"),
        ("Médico", "expense", "🏥", "#ef4444"),
        ("Entretenimiento", "expense", "🎮", "#a855f7"),
        ("Compras Varias", "expense", "🛍️", "#a855f7"),
        ("Teléfono", "expense", "📞", "#64748b"),
        ("Suministros", "expense", "💡", "#64748b"),
        ("Seguros", "expense", "🛡️", "#64748b"),
        ("Educación", "expense", "🎓", "#0ea5e9"),
        ("Deporte", "expense", "⚽", "#84cc16"),
        ("Gasolinera", "expense", "⛽", "#3b82f6"),
        ("Intereses", "income", "📈", "#22c55e"),
        ("Dividendos", "income", "💵", "#22c55e"),
        ("Beneficios Trading", "income", "📊", "#22c55e"),
        ("Saveback", "income", "🎁", "#22c55e"),
        ("Ingreso", "income", "💰", "#22c55e"),
        ("Nómina", "income", "💼", "#22c55e"),
        ("Bizum", "transfer", "📲", "#06b6d4"),
        ("Transferencia Entrante", "income", "⬇️", "#64748b"),
        ("Transferencia Saliente", "expense", "⬆️", "#64748b"),
        ("Transferencia Interna", "internal", "🔄", "#94a3b8"),
        ("Compra Inversión", "investment", "📈", "#8b5cf6"),
        ("Venta Inversión", "investment", "📉", "#8b5cf6"),
        ("Compra con Tarjeta", "expense", "💳", "#64748b"),
        ("Compra Internacional", "expense", "🌍", "#64748b"),
        ("Sin categorizar", "expense", "❓", "#94a3b8"),
        ("Impuestos", "expense", "🏛️", "#64748b"),
    ]
    for name, t, icon, color in system_cats:
        existing = db.query(models.Category).filter(
            models.Category.user_id == None,
            models.Category.name == name,
        ).first()
        if not existing:
            db.add(models.Category(user_id=None, name=name, icon=icon, color=color, type=t, is_system=True))
    db.commit()


def _get_system_cat_by_name(db: Session, name: str) -> Optional[models.Category]:
    return db.query(models.Category).filter(
        models.Category.user_id == None,
        models.Category.name == name,
    ).first()


def rule_matches(keyword: str, field: Optional[str], check_text: str, mcc_code: Optional[str]) -> bool:
    """Shared by import-time categorization and the rule preview/apply endpoints.
    check_text is the lowercased "name description" of the transaction; name and
    description rules both search it, and MCC rules also match the exact MCC code."""
    kw = keyword.lower()
    if field == "mcc" and mcc_code == kw:
        return True
    return kw in check_text


class CategorizeResult(tuple):
    """(category_id, is_auto_categorized, is_internal_transfer) con `.source` aparte,
    para que el desempaquetado de 3 valores de siempre siga funcionando."""
    source: str

    def __new__(cls, category_id, is_auto, is_internal, source):
        obj = super().__new__(cls, (category_id, is_auto, is_internal))
        obj.source = source
        return obj


# Fuentes fiables: no piden revisión. El resto (mcc, type, fallback, ai) sí.
STRONG_SOURCES = ("rule", "history", "catalog")
# Tipos cuyo significado no depende del comercio (un dividendo de Apple no es "Software").
_STRONG_TYPES = {"INTEREST_PAYMENT", "DIVIDEND", "STOCKPERK", "BENEFITS_SAVEBACK", "BUY", "SELL", "TAX"}
_TRANSFER_TYPES = {"TRANSFER_INBOUND", "TRANSFER_INSTANT_INBOUND", "TRANSFER_OUTBOUND", "TRANSFER_INSTANT_OUTBOUND"}
# Categorías que no enseñan nada del comercio: no cuentan como historial.
GENERIC_CATEGORIES = {
    "Sin categorizar", "Compra con Tarjeta", "Compra Internacional", "Transferencia Entrante",
    "Transferencia Saliente", "Transferencia Interna", "Ingreso",
}


_GATEWAY_KEYS = {"paypal", "bizum", "sumup", "stripe", "redsys", "google pay", "apple pay"}


def is_bizum(name: Optional[str], description: Optional[str]) -> bool:
    return "bizum" in f"{name or ''} {description or ''}".lower()


def _cats_by_name(db: Session, user_id: int) -> dict:
    """{nombre normalizado: id}; las del usuario tapan a las del sistema. Cacheado por sesión."""
    cache = db.info.setdefault("_cat_names", {})
    if user_id not in cache:
        from .merchants import norm
        out: dict = {}
        rows = db.query(models.Category.id, models.Category.name, models.Category.user_id).filter(
            (models.Category.user_id == None) | (models.Category.user_id == user_id)  # noqa: E711
        ).all()
        for cid, name, uid in sorted(rows, key=lambda r: r[2] is not None):
            out[norm(name)] = cid
        cache[user_id] = out
    return cache[user_id]


def resolve_category(db: Session, user_id: int, names) -> Optional[int]:
    """Primera categoría existente de la cadena (del usuario o del sistema)."""
    from .merchants import norm
    by = _cats_by_name(db, user_id)
    for n in names or []:
        cid = by.get(norm(n))
        if cid:
            return cid
    return None


def merchant_history(db: Session, user_id: int) -> dict:
    """{(clave de comercio, signo): category_id} con la categoría que el usuario más ha puesto a mano."""
    cache = db.info.setdefault("_merchant_history", {})
    if user_id in cache:
        return cache[user_id]
    from collections import Counter, defaultdict
    from .merchants import merchant_key
    generic = {
        cid for (cid,) in db.query(models.Category.id).filter(models.Category.name.in_(GENERIC_CATEGORIES)).all()
    }
    T = models.Transaction
    rows = db.query(T.name, T.amount, T.category_id).filter(
        T.user_id == user_id,
        T.category_id != None,  # noqa: E711
        T.is_auto_categorized == False,  # noqa: E712
        (T.is_ai_categorized == False) | (T.is_ai_categorized == None),  # noqa: E711,E712
        (T.is_internal_transfer == False) | (T.is_internal_transfer == None),  # noqa: E711,E712
        T.type.notin_(list(_STRONG_TYPES)),
    ).all()
    counts: dict = defaultdict(Counter)
    for name, amount, cid in rows:
        if not name or cid in generic:
            continue
        counts[(merchant_key(name), (amount or 0) >= 0)][cid] += 1
    # Solo se aprende un hábito claro: varias elecciones y casi todas iguales.
    # Una marca conocida pide más (un Bizum o una compra puntual "de viaje" no
    # deben arrastrar al resto), y las pasarelas no dicen nada del comercio.
    from .merchants import brand, match_brand
    out = {}
    for (key, sign), c in counts.items():
        if key in _GATEWAY_KEYS:
            continue
        cid, n = c.most_common(1)[0]
        total = sum(c.values())
        need = 3 if (brand(key) or match_brand(key)) else 2
        if n >= need and n * 3 >= total * 2:
            out[(key, sign)] = cid
    cache[user_id] = out
    return out


def forget_history(db: Session):
    """Olvida la caché de historial y categorías (tras cambiar categorías a mano)."""
    db.info.pop("_merchant_history", None)
    db.info.pop("_cat_names", None)


def auto_categorize(
    db: Session,
    user_id: int,
    tx_type: str,
    tx_name: Optional[str],
    tx_description: Optional[str],
    mcc_code: Optional[str],
    counterparty_name: Optional[str],
    amount: float,
    user_own_name: Optional[str] = None,
) -> CategorizeResult:
    """
    Returns (category_id, is_auto_categorized, is_internal_transfer) con `.source`.
    Orden: regla -> tipo fuerte -> traspaso propio -> historial -> marca -> palabra -> MCC -> tipo -> fallback.
    """
    from .merchants import brand_category_names, match_brand, match_keyword, merchant_key
    _load_mcc()

    # 1. Reglas del usuario
    rules = (
        db.query(models.CategoryRule)
        .filter(models.CategoryRule.user_id == user_id)
        .order_by(models.CategoryRule.priority.desc())
        .all()
    )
    check_text = " ".join(filter(None, [tx_name, tx_description])).lower()
    rule_types = dict(db.query(models.Category.id, models.Category.type).filter(
        models.Category.id.in_({r.category_id for r in rules})).all()) if rules else {}
    for rule in rules:
        # Una regla de ingresos no categoriza gastos ni al revés (mismo nombre
        # en una nómina y en un envío propio, por ejemplo).
        ctype = getattr(rule_types.get(rule.category_id), "value", rule_types.get(rule.category_id))
        if (ctype == "income" and (amount or 0) < 0) or (ctype == "expense" and (amount or 0) > 0):
            continue
        if rule_matches(rule.keyword, rule.field, check_text, mcc_code):
            return CategorizeResult(rule.category_id, True, False, "rule")

    # 2. Tipos que no dependen del comercio
    if tx_type in _STRONG_TYPES and tx_type in TYPE_MAP:
        cat = _get_system_cat_by_name(db, TYPE_MAP[tx_type][0])
        if cat:
            return CategorizeResult(cat.id, True, False, "type")

    # 3. Traspaso entre cuentas propias.
    # Only flag as internal if the username has >=2 words (full name) OR the counterparty
    # name is an exact match - avoids false positives with single-word usernames like "Enrique"
    if user_own_name and counterparty_name:
        own_lower = user_own_name.lower().strip()
        cp_lower = counterparty_name.lower().strip()
        own_words = own_lower.split()
        is_internal = False
        if len(own_words) >= 2 and (own_lower in cp_lower or cp_lower in own_lower):
            is_internal = True
        elif own_lower == cp_lower:
            is_internal = True
        if is_internal:
            cat_name = "Transferencia Entrante" if amount > 0 else "Transferencia Saliente"
            cat = _get_system_cat_by_name(db, cat_name)
            return CategorizeResult((cat.id if cat else None), True, True, "type")

    # Bizum: siempre en su categoría, entre o salga, sea a quien sea.
    if is_bizum(tx_name, tx_description):
        cid = resolve_category(db, user_id, ["Bizum"])
        if cid:
            return CategorizeResult(cid, True, False, "catalog")

    label = tx_name or counterparty_name
    # 4. Lo que el usuario suele poner a este comercio
    if label:
        cid = merchant_history(db, user_id).get((merchant_key(label), (amount or 0) >= 0))
        if cid:
            return CategorizeResult(cid, True, False, "history")

    # Bizums y transferencias a personas: el catálogo y las palabras no aplican.
    if tx_type not in _TRANSFER_TYPES:
        # 5. Marca conocida
        bid = match_brand(tx_name) or match_brand(counterparty_name)
        if bid:
            cid = resolve_category(db, user_id, brand_category_names(bid))
            if cid:
                return CategorizeResult(cid, True, False, "catalog")
        # 6. Palabra genérica (bar, farmacia, hotel...) en nombre o descripción
        names = match_keyword(" ".join(filter(None, [tx_name, tx_description])))
        cid = resolve_category(db, user_id, names) if names else None
        if cid:
            return CategorizeResult(cid, True, False, "catalog")

    # 7. Código MCC
    if mcc_code and mcc_code in _MCC_DATA:
        mcc_info = _MCC_DATA[mcc_code]
        cat = _get_system_cat_by_name(db, mcc_info["name"])
        if cat:
            return CategorizeResult(cat.id, True, False, "mcc")

    # 8. Tipo de movimiento
    if tx_type in TYPE_MAP:
        cat_name, _ = TYPE_MAP[tx_type]
        cat = _get_system_cat_by_name(db, cat_name)
        if cat:
            return CategorizeResult(cat.id, True, False, "type")

    # 9. Fallback
    cat = _get_system_cat_by_name(db, "Sin categorizar")
    return CategorizeResult((cat.id if cat else None), False, False, "fallback")
