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

# Default merchant keyword mappings to system categories
_DEFAULT_KEYWORD_MAP = [
    # (lowercase keyword, category name)
    # --- Supermercado ---
    ("mercadona", "Supermercado"),
    ("lidl", "Supermercado"),
    ("carrefour", "Supermercado"),
    ("aldi", "Supermercado"),
    ("dia supermercado", "Supermercado"),
    ("dia %", "Supermercado"),
    ("alcampo", "Supermercado"),
    ("supermercado", "Supermercado"),
    ("alimentacion", "Supermercado"),
    ("alimentación", "Supermercado"),
    ("grocery", "Supermercado"),
    ("bell food", "Supermercado"),

    # --- Comida Rápida ---
    ("mcdonald", "Comida Rápida"),
    ("burger king", "Comida Rápida"),
    ("kfc", "Comida Rápida"),
    ("popeyes", "Comida Rápida"),
    ("taco bell", "Comida Rápida"),
    ("pizza hut", "Comida Rápida"),
    ("domino's", "Comida Rápida"),
    ("papa john", "Comida Rápida"),
    ("100 montaditos", "Comida Rápida"),

    # --- Bar / Cafetería ---
    ("starbucks", "Bar / Cafetería"),
    ("cafeteria", "Bar / Cafetería"),
    ("barrika", "Bar / Cafetería"),
    ("bertiz", "Bar / Cafetería"),
    ("café", "Bar / Cafetería"),
    ("cafe", "Bar / Cafetería"),
    ("la pecera", "Bar / Cafetería"),

    # --- Restaurante ---
    ("restaurante", "Restaurante"),
    ("vips", "Restaurante"),
    ("celicioso", "Restaurante"),
    ("pizzería", "Restaurante"),
    ("pizzeria", "Restaurante"),
    ("sushi", "Restaurante"),
    ("principe carlos", "Restaurante"),
    ("sanabres", "Restaurante"),
    ("sanabr", "Restaurante"),

    # --- Hotel ---
    ("hotel", "Hotel"),
    ("hostal", "Hotel"),
    ("pension", "Hotel"),
    ("pensión", "Hotel"),
    ("apartamento", "Hotel"),
    ("booking.com", "Hotel"),
    ("airbnb", "Hotel"),

    # --- Taxi / Uber ---
    ("uber", "Taxi / Uber"),
    ("cabify", "Taxi / Uber"),
    ("bolt", "Taxi / Uber"),
    ("freenow", "Taxi / Uber"),

    # --- Transporte Público ---
    ("renfe", "Transporte Público"),
    ("metro de madrid", "Transporte Público"),
    ("crtm", "Transporte Público"),
    ("emt madrid", "Transporte Público"),
    ("metro ligero", "Transporte Público"),
    ("tren", "Transporte Público"),
    ("autobus", "Transporte Público"),
    ("autobús", "Transporte Público"),
    ("billete", "Transporte Público"),

    # --- Vuelos ---
    ("ryanair", "Vuelos"),
    ("iberia", "Vuelos"),
    ("vueling", "Vuelos"),
    ("vuelo", "Vuelos"),
    ("viajes", "Vuelos"),

    # --- Gasolinera ---
    ("gasolinera", "Gasolinera"),
    ("estacion de servicio", "Gasolinera"),
    ("estación de servicio", "Gasolinera"),
    ("repsol", "Gasolinera"),
    ("cepsa", "Gasolinera"),
    ("galp", "Gasolinera"),
    ("bp oil", "Gasolinera"),

    # --- Software y Apps / Entretenimiento ---
    ("netflix", "Entretenimiento"),
    ("spotify", "Entretenimiento"),
    ("hbo", "Entretenimiento"),
    ("disney+", "Entretenimiento"),
    ("prime video", "Entretenimiento"),
    ("nintendo", "Entretenimiento"),
    ("playstation", "Entretenimiento"),
    ("steam", "Entretenimiento"),
    ("eneba", "Entretenimiento"),
    ("epic games", "Entretenimiento"),
    ("instant gaming", "Entretenimiento"),
    ("xceed", "Entretenimiento"),
    ("deeventoss", "Entretenimiento"),
    ("eventoss", "Entretenimiento"),
    ("software", "Software y Apps"),
    ("claude", "Software y Apps"),
    ("openai", "Software y Apps"),
    ("chatgpt", "Software y Apps"),
    ("namecheap", "Software y Apps"),
    ("digitalocean", "Software y Apps"),
    ("aws", "Software y Apps"),
    ("google cloud", "Software y Apps"),
    ("hosting", "Software y Apps"),

    # --- Ropa ---
    ("zara", "Ropa"),
    ("mango", "Ropa"),
    ("h&m", "Ropa"),
    ("pull and bear", "Ropa"),
    ("nike", "Ropa"),
    ("adidas", "Ropa"),
    ("bershka", "Ropa"),
    ("stradivarius", "Ropa"),
    ("decathlon", "Ropa"),

    # --- Farmacia / Médico ---
    ("farmacia", "Farmacia"),
    ("médico", "Médico"),
    ("medico", "Médico"),
    ("clinica", "Médico"),
    ("clínica", "Médico"),
    ("hospital", "Médico"),
    ("dentista", "Médico"),
    ("cm sanchinarro", "Médico"),

    # --- Compras Varias ---
    ("amazon", "Compras Varias"),
    ("aliexpress", "Compras Varias"),
    ("ebay", "Compras Varias"),
    ("fnac", "Libros / Electrónica"),
]


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
        ("Ingreso", "income", "💰", "#22c55e"),
        ("Nómina", "income", "💼", "#22c55e"),
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
) -> Tuple[Optional[int], bool, bool]:
    """
    Returns (category_id, is_auto_categorized, is_internal_transfer)
    """
    _load_mcc()

    # 1. Check user-defined rules (keyword match)
    rules = (
        db.query(models.CategoryRule)
        .filter(models.CategoryRule.user_id == user_id)
        .order_by(models.CategoryRule.priority.desc())
        .all()
    )
    check_text = " ".join(filter(None, [tx_name, tx_description])).lower()
    for rule in rules:
        kw = rule.keyword.lower()
        if rule.field == "mcc" and mcc_code == kw:
            return rule.category_id, True, False
        elif kw in check_text:
            return rule.category_id, True, False

    # 1.5 Check default system keyword rules (keyword match)
    for kw, cat_name in _DEFAULT_KEYWORD_MAP:
        if kw in check_text:
            cat = _get_system_cat_by_name(db, cat_name)
            if cat:
                return cat.id, True, False

    # 2. Internal transfer detection
    # Only flag as internal if the username has ≥2 words (full name) OR the counterparty
    # name is an exact match — avoids false positives with single-word usernames like "Enrique"
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
            return (cat.id if cat else None), True, True

    # 3. MCC code lookup
    if mcc_code and mcc_code in _MCC_DATA:
        mcc_info = _MCC_DATA[mcc_code]
        cat = _get_system_cat_by_name(db, mcc_info["name"])
        if cat:
            return cat.id, True, False

    # 4. Transaction type map
    if tx_type in TYPE_MAP:
        cat_name, _ = TYPE_MAP[tx_type]
        cat = _get_system_cat_by_name(db, cat_name)
        if cat:
            return cat.id, True, False

    # 5. Fallback
    cat = _get_system_cat_by_name(db, "Sin categorizar")
    return (cat.id if cat else None), False, False
