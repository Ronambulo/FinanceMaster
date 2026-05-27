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
}


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

    # 2. Internal transfer detection
    if user_own_name and counterparty_name:
        own_lower = user_own_name.lower().strip()
        cp_lower = counterparty_name.lower().strip()
        if own_lower in cp_lower or cp_lower in own_lower:
            if amount > 0:
                cat_name = "Transferencia Entrante"
            else:
                cat_name = "Transferencia Saliente"
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
