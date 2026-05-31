from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/categories", tags=["categories"])


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
    db.delete(cat)
    db.commit()
    return {"ok": True}


# ── Rules ────────────────────────────────────────────────────────────────────
@router.get("/rules", response_model=List[schemas.CategoryRuleOut])
def list_rules(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(models.CategoryRule).filter(
        models.CategoryRule.user_id == current_user.id
    ).order_by(models.CategoryRule.priority.desc()).all()


@router.post("/rules", response_model=schemas.CategoryRuleOut)
def create_rule(
    data: schemas.CategoryRuleCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    rule = models.CategoryRule(user_id=current_user.id, **data.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    rule = db.query(models.CategoryRule).filter(
        models.CategoryRule.id == rule_id,
        models.CategoryRule.user_id == current_user.id,
    ).first()
    if not rule:
        raise HTTPException(404, "Regla no encontrada")
    db.delete(rule)
    db.commit()
    return {"ok": True}
