from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from .. import models, schemas, auth
from ..database import get_db
from ..services.categorizer import rule_matches

router = APIRouter(prefix="/api/categories", tags=["categories"])

UNCATEGORIZED = "Sin categorizar"
RULE_FIELDS = ("name", "description", "mcc")


@router.get("", response_model=List[schemas.CategoryOut])
def list_categories(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    # System categories + user's own
    cats = db.query(models.Category).filter(
        (models.Category.user_id == None) | (models.Category.user_id == current_user.id)
    ).order_by(models.Category.is_system.desc(), models.Category.name).all()
    return cats


@router.get("/usage")
def category_usage(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Number of the user's transactions per category id."""
    rows = db.query(models.Transaction.category_id, func.count(models.Transaction.id)).filter(
        models.Transaction.user_id == current_user.id,
        models.Transaction.category_id != None,
    ).group_by(models.Transaction.category_id).all()
    return {str(cat_id): count for cat_id, count in rows}


@router.post("", response_model=schemas.CategoryOut)
def create_category(
    data: schemas.CategoryCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    cat = models.Category(user_id=current_user.id, **data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/{cat_id}", response_model=schemas.CategoryOut)
def update_category(
    cat_id: int,
    data: schemas.CategoryUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    cat = db.query(models.Category).filter(
        models.Category.id == cat_id,
        (models.Category.user_id == current_user.id) | (models.Category.is_system == True)
    ).first()
    if not cat:
        raise HTTPException(404, "Categoría no encontrada")

    update_data = data.model_dump(exclude_none=True)
    if cat.is_system and "name" in update_data and update_data["name"] != cat.name:
        raise HTTPException(400, "No se puede cambiar el nombre de una categoría del sistema (afectaría a la auto-categorización).")
    if cat.is_system and "type" in update_data and update_data["type"] != cat.type:
        raise HTTPException(400, "No se puede cambiar el tipo de una categoría del sistema.")

    for k, v in update_data.items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{cat_id}")
def delete_category(
    cat_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    cat = db.query(models.Category).filter(
        models.Category.id == cat_id,
        models.Category.user_id == current_user.id,
        models.Category.is_system == False,
    ).first()
    if not cat:
        raise HTTPException(404, "Categoría no encontrada o no eliminable")
    # Las reglas no pueden quedarse sin categoría (category_id es NOT NULL) y los
    # movimientos pasan a "Sin categorizar" en vez de quedar con categoría nula.
    rules_deleted = db.query(models.CategoryRule).filter(
        models.CategoryRule.category_id == cat.id,
    ).delete(synchronize_session=False)
    fallback = db.query(models.Category).filter(
        models.Category.user_id == None,
        models.Category.name == UNCATEGORIZED,
    ).first()
    moved = db.query(models.Transaction).filter(
        models.Transaction.user_id == current_user.id,
        models.Transaction.category_id == cat.id,
    ).update({
        models.Transaction.category_id: fallback.id if fallback else None,
        models.Transaction.is_auto_categorized: False,
    }, synchronize_session=False)
    db.delete(cat)
    db.commit()
    return {"ok": True, "moved": moved, "rules_deleted": rules_deleted}


# ── Rules ────────────────────────────────────────────────────────────────────
def _get_rule(db: Session, user: models.User, rule_id: int) -> models.CategoryRule:
    rule = db.query(models.CategoryRule).filter(
        models.CategoryRule.id == rule_id,
        models.CategoryRule.user_id == user.id,
    ).first()
    if not rule:
        raise HTTPException(404, "Regla no encontrada")
    return rule


def _check_rule_input(db: Session, user: models.User, keyword: str, category_id: int, field: Optional[str]):
    if len(keyword.strip()) < 2:
        raise HTTPException(400, "La palabra clave debe tener al menos 2 caracteres")
    if field not in RULE_FIELDS:
        raise HTTPException(400, "Campo de búsqueda no válido")
    cat = db.query(models.Category).filter(
        models.Category.id == category_id,
        (models.Category.user_id == user.id) | (models.Category.user_id == None),
    ).first()
    if not cat:
        raise HTTPException(404, "Categoría no encontrada")


def _matching_transactions(db: Session, user_id: int, keyword: str, field: Optional[str]) -> List[models.Transaction]:
    txs = db.query(models.Transaction).filter(models.Transaction.user_id == user_id).all()
    return [
        tx for tx in txs
        if rule_matches(keyword, field, " ".join(filter(None, [tx.name, tx.description])).lower(), tx.mcc_code)
    ]


@router.get("/rules", response_model=List[schemas.CategoryRuleOut])
def list_rules(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(models.CategoryRule).filter(
        models.CategoryRule.user_id == current_user.id
    ).order_by(models.CategoryRule.priority.desc()).all()


@router.get("/rules/preview")
def preview_rule(
    keyword: str,
    field: str = "name",
    category_id: Optional[int] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """How many existing transactions a rule would match, and how many of those it
    could recategorize (auto-categorized ones not already in the target category)."""
    keyword = keyword.strip()
    if len(keyword) < 2:
        return {"matches": 0, "applicable": 0, "samples": []}
    matches = _matching_transactions(db, current_user.id, keyword, field)
    applicable = sum(
        1 for tx in matches
        if tx.is_auto_categorized and (category_id is None or tx.category_id != category_id)
    )
    samples: List[str] = []
    for tx in sorted(matches, key=lambda t: t.date, reverse=True):
        label = tx.name or tx.description
        if label and label not in samples:
            samples.append(label)
        if len(samples) == 5:
            break
    return {"matches": len(matches), "applicable": applicable, "samples": samples}


@router.post("/rules", response_model=schemas.CategoryRuleOut)
def create_rule(
    data: schemas.CategoryRuleCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    _check_rule_input(db, current_user, data.keyword, data.category_id, data.field)
    rule = models.CategoryRule(user_id=current_user.id, **data.model_dump())
    rule.keyword = rule.keyword.strip()
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/rules/{rule_id}", response_model=schemas.CategoryRuleOut)
def update_rule(
    rule_id: int,
    data: schemas.CategoryRuleUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    rule = _get_rule(db, current_user, rule_id)
    updates = data.model_dump(exclude_none=True)
    _check_rule_input(
        db, current_user,
        updates.get("keyword", rule.keyword),
        updates.get("category_id", rule.category_id),
        updates.get("field", rule.field),
    )
    if "keyword" in updates:
        updates["keyword"] = updates["keyword"].strip()
    for k, v in updates.items():
        setattr(rule, k, v)
    db.commit()
    db.refresh(rule)
    return rule


@router.post("/rules/{rule_id}/apply")
def apply_rule(
    rule_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Apply a rule to already-imported transactions. Only touches auto-categorized
    ones, so manual and AI categorizations are preserved."""
    rule = _get_rule(db, current_user, rule_id)
    updated = 0
    for tx in _matching_transactions(db, current_user.id, rule.keyword, rule.field):
        if tx.is_auto_categorized and tx.category_id != rule.category_id:
            tx.category_id = rule.category_id
            updated += 1
    db.commit()
    return {"updated": updated}


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    rule = _get_rule(db, current_user, rule_id)
    db.delete(rule)
    db.commit()
    return {"ok": True}
