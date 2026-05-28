from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from .. import models, schemas, auth
from ..database import get_db
from ..services.csv_parser import parse_csv
from ..services.categorizer import auto_categorize
from ..services.recurring_detector import detect_recurring

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

INCOME_TYPES = {
    "CUSTOMER_INPAYMENT", "TRANSFER_INSTANT_INBOUND", "TRANSFER_INBOUND",
    "INTEREST_PAYMENT", "DIVIDEND", "STOCKPERK",
}
EXPENSE_TYPES = {
    "CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL",
    "TRANSFER_INSTANT_OUTBOUND", "TRANSFER_OUTBOUND",
}


def _build_query(db, user_id, search, category_id, tx_type, type_group, date_from, date_to, account_cat, with_joins=True):
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
    if category_id is not None:
        q = q.filter(models.Transaction.category_id == category_id)
    if tx_type:
        q = q.filter(models.Transaction.type == tx_type)
    if type_group == "income":
        q = q.filter(models.Transaction.type.in_(INCOME_TYPES))
    elif type_group == "expense":
        q = q.filter(models.Transaction.type.in_(EXPENSE_TYPES))
    if date_from:
        q = q.filter(models.Transaction.date >= date_from)
    if date_to:
        q = q.filter(models.Transaction.date <= date_to)
    if account_cat:
        q = q.filter(models.Transaction.account_category == account_cat)
    return q


@router.get("", response_model=schemas.TransactionListResponse)
def list_transactions(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    type: Optional[str] = None,
    type_group: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    account_category: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    q = _build_query(db, current_user.id, search, category_id, type, type_group, date_from, date_to, account_category, with_joins=True)
    # Aggregate sums without joins (more efficient)
    aq = _build_query(db, current_user.id, search, category_id, type, type_group, date_from, date_to, account_category, with_joins=False)
    income_sum = round(aq.filter(models.Transaction.amount > 0).with_entities(func.sum(models.Transaction.amount)).scalar() or 0, 2)
    expense_sum = round(aq.filter(models.Transaction.amount < 0).with_entities(func.sum(func.abs(models.Transaction.amount))).scalar() or 0, 2)
    total = q.count()
    items = q.order_by(models.Transaction.date.desc(), models.Transaction.datetime.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return schemas.TransactionListResponse(items=items, total=total, page=page, page_size=page_size, income_sum=income_sum, expense_sum=expense_sum)


@router.post("", response_model=schemas.TransactionOut)
def create_transaction(
    data: schemas.TransactionCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    tx = models.Transaction(
        user_id=current_user.id,
        account_category="CASH",
        is_auto_categorized=False,
        **data.model_dump(),
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
    if "category_id" in updates:
        tx.is_auto_categorized = False
    for k, v in updates.items():
        setattr(tx, k, v)
    db.commit()
    db.refresh(tx)
    return tx


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
    db.delete(tx)
    db.commit()
    return {"ok": True}


@router.post("/import", response_model=schemas.ImportResult)
async def import_csv(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    rows, parse_errors = parse_csv(content)

    imported = 0
    skipped = 0
    errors = len(parse_errors)

    for row in rows:
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

        tx = models.Transaction(
            user_id=current_user.id,
            category_id=category_id,
            is_auto_categorized=is_auto,
            is_internal_transfer=is_internal,
            **row,
        )
        try:
            db.add(tx)
            db.flush()
            imported += 1
        except IntegrityError:
            db.rollback()
            skipped += 1
        except Exception:
            db.rollback()
            errors += 1

    db.commit()

    # Run recurring detection after import
    try:
        detect_recurring(db, current_user.id)
    except Exception:
        pass

    return schemas.ImportResult(imported=imported, skipped_duplicates=skipped, errors=errors)
