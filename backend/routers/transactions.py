import logging
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, aliased, joinedload
from sqlalchemy.exc import IntegrityError
from .. import models, schemas, auth
from ..database import get_db
from ..services.categorizer import auto_categorize
from ..services.recurring_detector import detect_recurring

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

INCOME_TYPES = {
    "CUSTOMER_INPAYMENT", "TRANSFER_INSTANT_INBOUND", "TRANSFER_INBOUND",
    "INTEREST_PAYMENT", "DIVIDEND", "STOCKPERK", "BENEFITS_SAVEBACK",
}
EXPENSE_TYPES = {
    "CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL",
    "TRANSFER_INSTANT_OUTBOUND", "TRANSFER_OUTBOUND",
}
# Mover dinero a una inversión no es un gasto (ni venderla un ingreso): el
# dinero sigue siendo del usuario, solo cambia de sitio. Se listan, pero no
# cuentan en los totales de ingresos/gastos.
INVESTMENT_TYPES = {"BUY", "SELL"}


def _build_query(db, user_id, search, category_id, tx_type, type_group, date_from, date_to, account_cat, with_joins=True, source=None, hide_transfers=False, category_ids=None, amount_min=None, amount_max=None):
    if with_joins:
        q = (
            db.query(models.Transaction)
            .options(joinedload(models.Transaction.category))
            .filter(models.Transaction.user_id == user_id)
        )
    else:
        q = db.query(models.Transaction).filter(models.Transaction.user_id == user_id)
    if search:
        q = q.filter(
            models.Transaction.name.ilike(f"%{search}%") |
            models.Transaction.description.ilike(f"%{search}%")
        )
    if category_id == 0:
        # 0 = "Sin categoría"
        q = q.filter(models.Transaction.category_id.is_(None))
    elif category_id is not None:
        q = q.filter(models.Transaction.category_id == category_id)
    if tx_type:
        q = q.filter(models.Transaction.type == tx_type)
    if type_group == "income":
        q = q.filter(models.Transaction.type.in_(INCOME_TYPES))
    elif type_group == "expense":
        q = q.filter(models.Transaction.type.in_(EXPENSE_TYPES))
    elif type_group == "transfer":
        q = q.filter(models.Transaction.is_internal_transfer.is_(True))
    if category_ids:
        # Varias categorías separadas por comas; 0 = "Sin categoría".
        ids = [int(c) for c in str(category_ids).split(",") if c.strip().lstrip("-").isdigit()]
        conds = []
        if 0 in ids:
            conds.append(models.Transaction.category_id.is_(None))
        rest = [i for i in ids if i != 0]
        if rest:
            conds.append(models.Transaction.category_id.in_(rest))
        if conds:
            q = q.filter(or_(*conds))
    if amount_min is not None:
        q = q.filter(func.abs(models.Transaction.amount) >= amount_min)
    if amount_max is not None:
        q = q.filter(func.abs(models.Transaction.amount) <= amount_max)
    if date_from:
        q = q.filter(models.Transaction.date >= date_from)
    if date_to:
        q = q.filter(models.Transaction.date <= date_to)
    if account_cat:
        # Admite varias separadas por comas ("CASH,TRADING"): la lista de
        # movimientos enseña el efectivo y las operaciones que salen de él.
        cats = [c.strip() for c in account_cat.split(",") if c.strip()]
        if len(cats) == 1:
            q = q.filter(models.Transaction.account_category == cats[0])
        elif cats:
            q = q.filter(models.Transaction.account_category.in_(cats))
    if hide_transfers:
        q = q.filter(or_(models.Transaction.is_internal_transfer.is_(False), models.Transaction.is_internal_transfer.is_(None)))
    T = models.Transaction
    sources = [x.strip() for x in source.split(",") if x.strip()] if source else []
    if sources:
        # Cuenta(s) de origen separadas por comas; "manual" incluye los antiguos
        # sin origen (NULL o vacío), igual que el saldo de /dashboard/accounts.
        q = q.filter(_source_cond(T, sources))
    # Collapse linked/merged groups into their primary row only
    collapse = [T.link_group_id.is_(None), T.is_link_primary == True]
    if sources:
        # Si el principal de una fusión es de otra cuenta, el movimiento de esta
        # cuenta se enseña igualmente: su importe cuenta en el saldo de la cuenta.
        P = aliased(T)
        groups_here = (
            db.query(P.link_group_id)
            .filter(P.user_id == user_id, P.is_link_primary == True, P.link_group_id.isnot(None),
                    _source_cond(P, sources))
        )
        collapse.append(T.link_group_id.notin_(groups_here.scalar_subquery()))
    q = q.filter(or_(*collapse))
    return q


def _source_cond(T, sources):
    conds = [T.source.in_(sources)]
    if "manual" in sources:
        conds += [T.source.is_(None), T.source == ""]
    return or_(*conds)


MANUAL_ONLY_FIELDS = ("amount", "date", "type", "source")


def is_manual(tx: models.Transaction) -> bool:
    return bool(tx.is_manual) or tx.source == "manual" or (tx.source is None and tx.external_id is None)


def merchant_key(name: Optional[str]) -> str:
    """Clave con la que se agrupan los movimientos de un mismo comercio."""
    return " ".join((name or "").split()).lower()


def _check_category(db: Session, user_id: int, category_id: int) -> models.Category:
    cat = db.query(models.Category).filter(
        models.Category.id == category_id,
        or_(models.Category.user_id == user_id, models.Category.user_id.is_(None)),
    ).first()
    if not cat:
        raise HTTPException(404, "Categoría no encontrada")
    return cat


@router.get("", response_model=schemas.TransactionListResponse)
def list_transactions(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    type: Optional[str] = None,
    type_group: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    account_category: Optional[str] = None,
    source: Optional[str] = None,
    hide_transfers: bool = False,
    category_ids: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    q = _build_query(db, current_user.id, search, category_id, type, type_group, date_from, date_to, account_category, with_joins=True, source=source, hide_transfers=hide_transfers, category_ids=category_ids, amount_min=amount_min, amount_max=amount_max)
    # Aggregate sums without joins (more efficient); netted for linked/merged groups
    aq = _build_query(db, current_user.id, search, category_id, type, type_group, date_from, date_to, account_category, with_joins=False, source=source, hide_transfers=hide_transfers, category_ids=category_ids, amount_min=amount_min, amount_max=amount_max)
    aq = aq.filter(models.Transaction.type.notin_(INVESTMENT_TYPES))
    net_amount = func.coalesce(models.Transaction.effective_amount, models.Transaction.amount)
    income_expr = func.sum(case((models.Transaction.amount > 0, net_amount), else_=0))
    expense_expr = func.sum(case((models.Transaction.amount < 0, func.abs(net_amount)), else_=0))
    income_sum_raw, expense_sum_raw = aq.with_entities(income_expr, expense_expr).one()
    income_sum = round(income_sum_raw or 0, 2)
    expense_sum = round(expense_sum_raw or 0, 2)
    total = q.count()
    items = q.order_by(models.Transaction.date.desc(), models.Transaction.datetime.desc()).offset((page - 1) * page_size).limit(page_size).all()

    # Attach the collapsed legs of any merged group back onto its primary row
    group_ids = [t.link_group_id for t in items if t.link_group_id and t.is_link_primary]
    if group_ids:
        siblings = (
            db.query(models.Transaction)
            .options(joinedload(models.Transaction.category))
            .filter(
                models.Transaction.link_group_id.in_(group_ids),
                models.Transaction.is_link_primary == False,
            )
            .all()
        )
        by_group: dict[int, list] = {}
        for s in siblings:
            by_group.setdefault(s.link_group_id, []).append(s)
        for t in items:
            if t.link_group_id and t.is_link_primary:
                t.linked_transactions = by_group.get(t.link_group_id, [])

    return schemas.TransactionListResponse(items=items, total=total, page=page, page_size=page_size, income_sum=income_sum, expense_sum=expense_sum)


def _dissolve_link_group(db: Session, link_group_id: int):
    members = db.query(models.Transaction).filter(models.Transaction.link_group_id == link_group_id).all()
    for t in members:
        t.link_group_id = None
        t.is_link_primary = False
        t.effective_amount = None
        t.exclude_from_stats = False
    link = db.query(models.TransactionLink).filter(models.TransactionLink.id == link_group_id).first()
    if link:
        db.delete(link)


GROUP_BY = ("category", "merchant", "account", "day", "month")


@router.get("/groups", response_model=List[schemas.TransactionGroup])
def group_transactions(
    by: str = Query("category"),
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    type: Optional[str] = None,
    type_group: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    account_category: Optional[str] = None,
    source: Optional[str] = None,
    hide_transfers: bool = False,
    category_ids: Optional[str] = None,
    amount_min: Optional[float] = None,
    amount_max: Optional[float] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Totales de ingresos y gastos agrupados por categoría, comercio, cuenta o
    día, con los mismos filtros que la lista. Las compras/ventas de inversión
    se quedan fuera, igual que en los totales de la lista."""
    if by not in GROUP_BY:
        raise HTTPException(422, f"Agrupación no válida: {by}")
    from ..services.bank_connectors import BANK_LABELS

    q = _build_query(db, current_user.id, search, category_id, type, type_group, date_from, date_to, account_category, with_joins=True, source=source, hide_transfers=hide_transfers, category_ids=category_ids, amount_min=amount_min, amount_max=amount_max)
    q = q.filter(models.Transaction.type.notin_(INVESTMENT_TYPES))

    groups: dict[str, schemas.TransactionGroup] = {}
    for tx in q.order_by(models.Transaction.date.desc()).all():
        cat_name = None
        if by == "category":
            cat = tx.category
            key = str(cat.id) if cat else "none"
            label = cat.name if cat else "Sin categoría"
            icon, color = (cat.icon, cat.color) if cat else (None, None)
        elif by == "merchant":
            label = (tx.name or tx.description or "Sin nombre").strip()
            key = merchant_key(label)
            icon = color = None
            cat_name = tx.category.name if tx.category else None
        elif by == "account":
            key = tx.source or "other"
            label = BANK_LABELS.get(key) or {"manual": "Manual", "other": "Otros"}.get(key, key)
            icon = color = None
        elif by == "month":
            key = label = tx.date.isoformat()[:7]
            icon = color = None
        else:
            key = label = tx.date.isoformat()
            icon = color = None

        g = groups.get(key)
        if g is None:
            g = groups[key] = schemas.TransactionGroup(key=key, label=label, icon=icon, color=color,
                                                       category_name=cat_name if by == "merchant" else None)
        net = tx.effective_amount if tx.effective_amount is not None else tx.amount
        if tx.amount > 0:
            g.income += net
        elif tx.amount < 0:
            g.expense += abs(net)
        g.count += 1

    out = list(groups.values())
    for g in out:
        g.income = round(g.income, 2)
        g.expense = round(g.expense, 2)
    if by in ("day", "month"):
        out.sort(key=lambda g: g.key, reverse=True)
    else:
        out.sort(key=lambda g: (-(g.expense + g.income), g.label.lower()))
    return out


@router.get("/{tx_id}/similar")
def similar_transactions(
    tx_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Cuántos movimientos más hay del mismo comercio (para ofrecer cambiarlos a la vez)."""
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == tx_id, models.Transaction.user_id == current_user.id,
    ).first()
    if not tx:
        raise HTTPException(404, "Transacción no encontrada")
    key = merchant_key(tx.name)
    if not key:
        return {"merchant": None, "count": 0}
    others = [
        t for t in db.query(models.Transaction).filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.id != tx.id,
            models.Transaction.name.isnot(None),
        )
        if merchant_key(t.name) == key
    ]
    return {"merchant": tx.name.strip(), "count": len(others)}


@router.post("/bulk-category", response_model=schemas.BulkCategoryResult)
def bulk_category(
    data: schemas.BulkCategoryRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Cambia la categoría de varios movimientos a la vez. Opcionalmente
    arrastra al resto del mismo comercio y crea una regla para el futuro.
    Devuelve lo que había antes para poder deshacerlo."""
    _check_category(db, current_user.id, data.category_id)
    base = db.query(models.Transaction).filter(models.Transaction.user_id == current_user.id)
    targets = {t.id: t for t in base.filter(models.Transaction.id.in_(data.ids))} if data.ids else {}
    if not targets:
        raise HTTPException(404, "No hay movimientos que cambiar")

    merchants = {merchant_key(t.name): t.name.strip() for t in targets.values() if merchant_key(t.name)}
    if data.include_same_merchant and merchants:
        for t in base.filter(models.Transaction.name.isnot(None)):
            if t.id not in targets and merchant_key(t.name) in merchants:
                targets[t.id] = t

    previous = [
        schemas.PreviousCategory(
            id=t.id, category_id=t.category_id,
            is_auto_categorized=bool(t.is_auto_categorized),
            is_ai_categorized=bool(t.is_ai_categorized),
        )
        for t in targets.values()
    ]
    for t in targets.values():
        t.category_id = data.category_id
        t.is_auto_categorized = False
        t.is_ai_categorized = False

    rule_ids: list[int] = []
    if data.create_rule:
        existing = {
            (r.keyword.strip().lower(), r.category_id)
            for r in db.query(models.CategoryRule).filter(models.CategoryRule.user_id == current_user.id)
        }
        for key, name in merchants.items():
            if (key, data.category_id) in existing:
                continue
            rule = models.CategoryRule(
                user_id=current_user.id, keyword=name, field="name",
                category_id=data.category_id, priority=10,
            )
            db.add(rule)
            db.flush()
            rule_ids.append(rule.id)

    db.commit()
    return schemas.BulkCategoryResult(updated=len(targets), previous=previous, rule_ids=rule_ids)


@router.post("/bulk-category/undo")
def bulk_category_undo(
    data: schemas.BulkCategoryUndo,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    by_id = {p.id: p for p in data.previous}
    restored = 0
    if by_id:
        for t in db.query(models.Transaction).filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.id.in_(list(by_id)),
        ):
            p = by_id[t.id]
            t.category_id = p.category_id
            t.is_auto_categorized = p.is_auto_categorized
            t.is_ai_categorized = p.is_ai_categorized
            restored += 1
    removed = 0
    if data.rule_ids:
        removed = db.query(models.CategoryRule).filter(
            models.CategoryRule.user_id == current_user.id,
            models.CategoryRule.id.in_(data.rule_ids),
        ).delete(synchronize_session=False)
    db.commit()
    return {"restored": restored, "rules_removed": removed}


@router.post("/confirm")
def confirm_categories(
    data: schemas.ConfirmRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Da por buena la categoría que se puso sola: quita la marca de
    automática para que deje de verse como pendiente de revisar (y las reglas
    no la vuelvan a tocar)."""
    n = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id,
        models.Transaction.id.in_(data.ids or [-1]),
    ).update({models.Transaction.is_auto_categorized: False,
              models.Transaction.is_ai_categorized: False}, synchronize_session=False)
    db.commit()
    return {"confirmed": n}


@router.post("/link", response_model=schemas.TransactionOut)
def link_transactions(
    data: schemas.LinkTransactionsRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    ids = list(dict.fromkeys(data.transaction_ids))
    if len(ids) < 2:
        raise HTTPException(400, "Selecciona al menos 2 transacciones para unir")

    txs = db.query(models.Transaction).filter(
        models.Transaction.id.in_(ids),
        models.Transaction.user_id == current_user.id,
    ).all()
    if len(txs) != len(ids):
        raise HTTPException(404, "Alguna transacción no existe")
    if any(t.link_group_id is not None for t in txs):
        raise HTTPException(400, "Alguna transacción ya está unida a otro grupo")

    link = models.TransactionLink(user_id=current_user.id)
    db.add(link)
    db.flush()

    primary = max(txs, key=lambda t: abs(t.amount))
    net = round(sum(t.amount for t in txs), 2)

    for t in txs:
        t.link_group_id = link.id
        t.is_link_primary = (t.id == primary.id)
        if t.id == primary.id:
            t.effective_amount = net
        else:
            t.exclude_from_stats = True

    db.commit()
    db.refresh(primary)
    primary.linked_transactions = [t for t in txs if t.id != primary.id]
    return primary


@router.delete("/link/{link_group_id}")
def unlink_transactions(
    link_group_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    link = db.query(models.TransactionLink).filter(
        models.TransactionLink.id == link_group_id,
        models.TransactionLink.user_id == current_user.id,
    ).first()
    if not link:
        raise HTTPException(404, "Grupo no encontrado")
    _dissolve_link_group(db, link_group_id)
    db.commit()
    return {"ok": True}


@router.post("", response_model=schemas.TransactionOut)
def create_transaction(
    data: schemas.TransactionCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    fields = data.model_dump()
    fields["source"] = (fields.get("source") or "manual").strip() or "manual"
    fields["is_internal_transfer"] = bool(fields.get("is_internal_transfer"))
    if fields.get("note") is not None:
        fields["note"] = fields["note"].strip() or None
    tx = models.Transaction(
        user_id=current_user.id,
        account_category="CASH",
        is_auto_categorized=False,
        is_manual=True,
        **fields,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.post("/transfer", response_model=List[schemas.TransactionOut])
def create_transfer(
    data: schemas.TransferCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Traspaso entre dos cuentas propias: una salida y una entrada manuales,
    marcadas como traspaso interno para que no cuenten como gasto ni ingreso."""
    from ..services.bank_connectors import BANK_LABELS
    amount = round(abs(data.amount), 2)
    src, dst = (data.from_source or "").strip(), (data.to_source or "").strip()
    if amount <= 0:
        raise HTTPException(400, "El importe debe ser mayor que cero")
    if not src or not dst or src == dst:
        raise HTTPException(400, "Elige dos cuentas distintas")
    label = lambda k: BANK_LABELS.get(k) or {"manual": "Efectivo"}.get(k, k)
    note = (data.note or "").strip() or None
    common = dict(user_id=current_user.id, date=data.date, currency="EUR", account_category="CASH",
                  is_auto_categorized=False, is_manual=True, is_internal_transfer=True, note=note)
    out = models.Transaction(type="TRANSFER_OUTBOUND", amount=-amount, source=src,
                             name=f"A {label(dst)}", **common)
    inn = models.Transaction(type="TRANSFER_INBOUND", amount=amount, source=dst,
                             name=f"De {label(src)}", **common)
    db.add_all([out, inn])
    db.commit()
    db.refresh(out)
    db.refresh(inn)
    return [out, inn]


@router.post("/quick", response_model=schemas.TransactionOut)
def create_quick_transaction(
    data: schemas.QuickTransactionCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Punto de entrada minimalista para clientes externos (p.ej. un Atajo de
    iOS): solo pide un importe positivo, un tipo simple y un nombre, en lugar
    del código de tipo interno y el category_id que exige el endpoint normal.
    Usa TRANSFER_INBOUND (no CUSTOMER_INPAYMENT) para los ingresos manuales,
    para no interferir con la detección del ciclo de nómina."""
    is_income = data.type.strip().lower() == "income"
    tx_type = "TRANSFER_INBOUND" if is_income else "CARD_TRANSACTION"
    signed_amount = abs(data.amount) if is_income else -abs(data.amount)
    tx_date = data.date or date.today()
    tx_name = (data.name or "").strip() or "Gasto de Apple Pay"

    category_id: Optional[int] = None
    is_auto = False
    if data.category_name:
        cat = db.query(models.Category).filter(
            models.Category.name.ilike(f"%{data.category_name.strip()}%"),
            (models.Category.user_id == current_user.id) | (models.Category.user_id == None),
        ).first()
        category_id = cat.id if cat else None

    if category_id is None:
        category_id, is_auto, _ = auto_categorize(
            db=db,
            user_id=current_user.id,
            tx_type=tx_type,
            tx_name=tx_name,
            tx_description=data.note,
            mcc_code=None,
            counterparty_name=None,
            amount=signed_amount,
            user_own_name=current_user.username,
        )

    tx = models.Transaction(
        user_id=current_user.id,
        account_category="CASH",
        type=tx_type,
        date=tx_date,
        name=tx_name,
        description=data.note,
        amount=signed_amount,
        currency="EUR",
        category_id=category_id,
        is_auto_categorized=is_auto,
        is_internal_transfer=False,
        source="manual",
        is_manual=True,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@router.put("/{tx_id}", response_model=schemas.TransactionOut)
def update_transaction(
    tx_id: int,
    data: schemas.TransactionUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == tx_id,
        models.Transaction.user_id == current_user.id,
    ).first()
    if not tx:
        raise HTTPException(404, "Transacción no encontrada")

    updates = data.model_dump(exclude_none=True)
    if any(k in updates for k in MANUAL_ONLY_FIELDS) and not is_manual(tx):
        raise HTTPException(400, "El importe, la fecha y el tipo solo se pueden cambiar en movimientos manuales")
    if "type" in updates and updates["type"] not in INCOME_TYPES | EXPENSE_TYPES:
        raise HTTPException(400, "Tipo de movimiento no válido")
    if "category_id" in updates:
        _check_category(db, current_user.id, updates["category_id"])
        # Manual category edit — reset both auto-categorize flags unless the caller explicitly sets them
        if "is_ai_categorized" not in updates:
            tx.is_ai_categorized = False
        if "is_auto_categorized" not in updates:
            tx.is_auto_categorized = False
    for k, v in updates.items():
        setattr(tx, k, v)
    db.commit()
    db.refresh(tx)
    return tx


def _own_tx(db: Session, user_id: int, tx_id: int) -> models.Transaction:
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == tx_id,
        models.Transaction.user_id == user_id,
    ).first()
    if not tx:
        raise HTTPException(404, "Transacción no encontrada")
    return tx


def _clear_split(db: Session, tx: models.Transaction) -> None:
    """Borra las partes creadas al dividir y devuelve el importe completo al original."""
    if tx.split_parent_id is not None:
        return
    children = db.query(models.Transaction).filter(models.Transaction.split_parent_id == tx.id).all()
    for c in children:
        db.delete(c)
    if children and tx.link_group_id is None:
        tx.effective_amount = None


def _with_split_count(db: Session, tx: models.Transaction) -> models.Transaction:
    """Añade cuántas partes tiene y cómo está repartido (el original primero)."""
    children = db.query(models.Transaction).filter(
        models.Transaction.split_parent_id == tx.id
    ).order_by(models.Transaction.id).all()
    tx.split_count = len(children)
    if children:
        own = tx.effective_amount if tx.effective_amount is not None else tx.amount
        tx.split_parts = [schemas.SplitPart(category_id=tx.category_id, amount=round(abs(own), 2))] + [
            schemas.SplitPart(category_id=c.category_id, amount=round(abs(c.amount), 2)) for c in children
        ]
    return tx


@router.get("/{tx_id}", response_model=schemas.TransactionOut)
def get_transaction(
    tx_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    tx = _with_split_count(db, _own_tx(db, current_user.id, tx_id))
    if tx.link_group_id is not None:
        tx.linked_transactions = db.query(models.Transaction).filter(
            models.Transaction.user_id == current_user.id,
            models.Transaction.link_group_id == tx.link_group_id,
            models.Transaction.id != tx.id,
        ).order_by(models.Transaction.date.desc()).all()
    return tx


@router.post("/{tx_id}/split", response_model=schemas.TransactionOut)
def split_transaction(
    tx_id: int,
    data: schemas.SplitRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Reparte un movimiento entre categorías. El original se queda con la primera
    parte (vía effective_amount, sin tocar el importe del banco) y el resto se crea
    como movimientos hijos. Con una sola parte, deshace la división."""
    tx = _own_tx(db, current_user.id, tx_id)
    if tx.split_parent_id is not None:
        raise HTTPException(400, "Esta parte ya viene de un gasto dividido")
    if tx.link_group_id is not None:
        raise HTTPException(400, "No se puede dividir un movimiento unido a otros")
    parts = data.parts
    if not parts:
        raise HTTPException(400, "Añade al menos una parte")
    if any(p.amount <= 0 for p in parts):
        raise HTTPException(400, "Cada parte debe tener un importe mayor que cero")
    total = round(abs(tx.amount), 2)
    if abs(round(sum(p.amount for p in parts), 2) - total) > 0.005:
        raise HTTPException(400, "Las partes deben sumar el importe del movimiento")
    for p in parts:
        if p.category_id is not None:
            _check_category(db, current_user.id, p.category_id)

    _clear_split(db, tx)
    db.flush()
    sign = -1 if tx.amount < 0 else 1
    first = parts[0]
    tx.category_id = first.category_id
    tx.is_auto_categorized = False
    tx.is_ai_categorized = False
    if len(parts) > 1:
        tx.effective_amount = round(sign * first.amount, 2)
        for p in parts[1:]:
            db.add(models.Transaction(
                user_id=current_user.id,
                date=tx.date,
                datetime=tx.datetime,
                type=tx.type,
                name=tx.name,
                description=tx.description,
                counterparty_name=tx.counterparty_name,
                currency=tx.currency,
                amount=round(sign * p.amount, 2),
                category_id=p.category_id,
                source=tx.source,
                split_parent_id=tx.id,
                exclude_from_stats=tx.exclude_from_stats,
                is_internal_transfer=tx.is_internal_transfer,
            ))
    db.commit()
    db.refresh(tx)
    return _with_split_count(db, tx)


@router.delete("/{tx_id}")
def delete_transaction(
    tx_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == tx_id,
        models.Transaction.user_id == current_user.id,
    ).first()
    if not tx:
        raise HTTPException(404, "Transacción no encontrada")
    if tx.link_group_id is not None:
        _dissolve_link_group(db, tx.link_group_id)
        db.flush()
    _clear_split(db, tx)
    db.delete(tx)
    db.commit()
    return {"ok": True}


def _parse_upload(content: bytes, bank_format: str) -> dict:
    from ..services.bank_connectors import parse_file
    return parse_file(content, bank_format)


def _missing_fields(existing: models.Transaction, row: dict) -> list[str]:
    """Campos que el CSV aporta y la transacción ya guardada no tiene."""
    return [
        f for f in ("shares", "price", "symbol")
        if row.get(f) not in (None, "") and getattr(existing, f) in (None, "")
    ]


def _classify_rows(db: Session, user_id: int, rows: list[dict]) -> list[tuple[str, dict, Optional[models.Transaction]]]:
    """Clasifica cada fila: 'new', 'update' (ya existe pero el CSV completa datos) o 'duplicate'."""
    ids = [r["external_id"] for r in rows if r.get("external_id")]
    existing_by_id: dict = {}
    for i in range(0, len(ids), 500):
        chunk = ids[i:i + 500]
        for tx in db.query(models.Transaction).filter(
            models.Transaction.user_id == user_id,
            models.Transaction.external_id.in_(chunk),
        ):
            existing_by_id[tx.external_id] = tx

    seen: set = set()
    result = []
    for row in rows:
        eid = row.get("external_id")
        existing = existing_by_id.get(eid) if eid else None
        if existing is not None:
            result.append(("update" if _missing_fields(existing, row) else "duplicate", row, existing))
        elif eid and eid in seen:
            result.append(("duplicate", row, None))  # repetida dentro del propio archivo
        else:
            result.append(("new", row, None))
        if eid:
            seen.add(eid)
    return result


def _preview_item(row: dict) -> dict:
    return {
        "date": row["date"].isoformat() if row.get("date") else None,
        "type": row.get("type"),
        "name": row.get("name") or row.get("counterparty_name") or row.get("description"),
        "symbol": row.get("symbol"),
        "shares": row.get("shares"),
        "amount": row.get("amount"),
        "currency": row.get("currency") or "EUR",
    }


def _predict(db: Session, user: models.User, row: dict) -> tuple[Optional[int], bool]:
    """Categoría que recibiría la fila al importarla (sin guardar nada)."""
    try:
        cid, _, internal = auto_categorize(
            db=db, user_id=user.id, tx_type=row["type"], tx_name=row.get("name"),
            tx_description=row.get("description"), mcc_code=row.get("mcc_code"),
            counterparty_name=row.get("counterparty_name"), amount=row["amount"],
            user_own_name=user.username,
        )
        return cid, internal
    except Exception:
        return None, False


@router.post("/import/preview")
async def import_preview(
    file: UploadFile = File(...),
    bank_format: str = Form("auto"),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Analiza el CSV sin guardar nada: qué se importaría, qué se omite y qué falla."""
    from ..services.bank_connectors import BANK_LABELS
    parsed = _parse_upload(await file.read(), bank_format)
    classified = _classify_rows(db, current_user.id, parsed["rows"])

    new = [_preview_item(r) for status, r, _ in classified if status == "new"]
    duplicates = [
        {**_preview_item(r), "will_update": status == "update"}
        for status, r, _ in classified if status in ("duplicate", "update")
    ]
    rows = []
    for key, (status, r, _) in enumerate(classified):
        cid, internal = _predict(db, current_user, r) if status == "new" else (None, False)
        rows.append({**_preview_item(r), "key": key, "status": status, "category_id": cid, "is_internal_transfer": internal})
    return {
        "detected_bank": parsed["detected"],
        "bank_label": BANK_LABELS.get(parsed["detected"]),
        "total": len(parsed["rows"]) + len(parsed["errors"]) + len(parsed["skipped"]),
        "new": new,
        "duplicates": duplicates,
        "rows": rows,
        "errors": parsed["errors"],
        "skipped": parsed["skipped"],
    }


@router.get("/import/history")
def import_history(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Últimas importaciones de CSV del usuario."""
    logs = (
        db.query(models.ImportLog)
        .filter(models.ImportLog.user_id == current_user.id)
        .order_by(models.ImportLog.created_at.desc(), models.ImportLog.id.desc())
        .limit(5).all()
    )
    return [
        {"id": l.id, "filename": l.filename, "source": l.source, "imported": l.imported or 0,
         "skipped": l.skipped or 0, "errors": l.errors or 0,
         "created_at": l.created_at.isoformat() if l.created_at else None}
        for l in logs
    ]


def _parse_keys(raw: str) -> set[int]:
    return {int(x) for x in raw.split(",") if x.strip().isdigit()}


def _parse_categories(raw: str) -> dict[int, Optional[int]]:
    import json
    try:
        data = json.loads(raw or "{}")
        return {int(k): (int(v) if v is not None else None) for k, v in data.items()}
    except (ValueError, TypeError, AttributeError):
        return {}


@router.post("/import")
async def import_csv(
    file: UploadFile = File(...),
    bank_format: str = Form("auto"),
    skip: str = Form(""),
    categories: str = Form(""),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    parsed = _parse_upload(await file.read(), bank_format)
    detected_bank = parsed["detected"]

    imported = 0
    skipped = 0
    updated = 0
    errors = len(parsed["errors"])

    skip_keys = _parse_keys(skip)
    chosen = _parse_categories(categories)
    own_cats = {c.id for c in db.query(models.Category.id).filter((models.Category.user_id == None) | (models.Category.user_id == current_user.id))} if chosen else set()  # noqa: E711

    for key, (status, row, existing) in enumerate(_classify_rows(db, current_user.id, parsed["rows"])):
        if key in skip_keys:
            skipped += 1
            continue
        if status == "duplicate":
            skipped += 1
            continue
        if status == "update":
            for field in _missing_fields(existing, row):
                setattr(existing, field, row[field])
            updated += 1
            continue

        category_id, is_auto, is_internal = auto_categorize(
            db=db,
            user_id=current_user.id,
            tx_type=row["type"],
            tx_name=row.get("name"),
            tx_description=row.get("description"),
            mcc_code=row.get("mcc_code"),
            counterparty_name=row.get("counterparty_name"),
            amount=row["amount"],
            user_own_name=current_user.username,
        )
        if key in chosen and (chosen[key] is None or chosen[key] in own_cats):
            category_id, is_auto = chosen[key], False

        tx = models.Transaction(
            user_id=current_user.id,
            category_id=category_id,
            is_auto_categorized=is_auto,
            is_internal_transfer=is_internal,
            source=detected_bank,
            **row,
        )
        # Savepoint por fila: un fallo descarta solo esa fila, no todo lo anterior
        try:
            with db.begin_nested():
                db.add(tx)
            imported += 1
        except IntegrityError:
            skipped += 1
        except Exception:
            errors += 1
            log.exception(
                "CSV import: fila descartada (user_id=%s, external_id=%s)",
                current_user.id, row.get("external_id"),
            )

    db.add(models.ImportLog(
        user_id=current_user.id, filename=(file.filename or "")[:200] or None, source=detected_bank,
        imported=imported, skipped=skipped, errors=errors,
    ))
    db.commit()
    from ..services import activity as _activity
    _activity.record(db, "import", user=current_user, detail=f"{detected_bank or 'CSV'} · {imported} nuevos")

    # Run recurring detection after import
    try:
        detect_recurring(db, current_user.id)
    except Exception:
        log.exception("CSV import: fallo la detección de recurrentes (user_id=%s)", current_user.id)

    return {**schemas.ImportResult(imported=imported, skipped_duplicates=skipped, errors=errors).model_dump(), "updated": updated, "detected_bank": detected_bank}
