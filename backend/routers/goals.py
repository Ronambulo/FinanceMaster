from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas, auth
from ..database import get_db
from datetime import date

router = APIRouter(prefix="/api/goals", tags=["goals"])


def _enrich_goal(goal: models.Goal) -> schemas.GoalOut:
    out = schemas.GoalOut.model_validate(goal)
    if goal.type == "EURO_TARGET" and goal.target_amount and goal.target_amount > 0:
        out.progress_pct = min(100.0, round(goal.current_amount / goal.target_amount * 100, 1))
    return out


@router.get("", response_model=List[schemas.GoalOut])
def list_goals(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    goals = db.query(models.Goal).filter(
        models.Goal.user_id == current_user.id,
        models.Goal.is_active == True,
    ).order_by(models.Goal.created_at.desc()).all()
    return [_enrich_goal(g) for g in goals]


@router.post("", response_model=schemas.GoalOut)
def create_goal(
    data: schemas.GoalCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    goal = models.Goal(user_id=current_user.id, **data.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _enrich_goal(goal)


@router.put("/{goal_id}", response_model=schemas.GoalOut)
def update_goal(
    goal_id: int,
    data: schemas.GoalUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    goal = db.query(models.Goal).filter(
        models.Goal.id == goal_id,
        models.Goal.user_id == current_user.id,
    ).first()
    if not goal:
        raise HTTPException(404, "Objetivo no encontrado")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(goal, k, v)
    db.commit()
    db.refresh(goal)
    return _enrich_goal(goal)


@router.delete("/{goal_id}")
def delete_goal(
    goal_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    goal = db.query(models.Goal).filter(
        models.Goal.id == goal_id,
        models.Goal.user_id == current_user.id,
    ).first()
    if not goal:
        raise HTTPException(404, "Objetivo no encontrado")
    db.delete(goal)
    db.commit()
    return {"ok": True}


# ── Savings Allocation ──────────────────────────────────────────────────────
@router.get("/allocation", response_model=schemas.SavingsAllocationOut)
def get_allocation(
    month: Optional[str] = None,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not month:
        month = date.today().strftime("%Y-%m")
    alloc = db.query(models.SavingsAllocation).filter(
        models.SavingsAllocation.user_id == current_user.id,
        models.SavingsAllocation.month == month,
    ).first()
    if not alloc:
        return schemas.SavingsAllocationOut(month=month, savings_pct=20.0, investment_pct=10.0, expenses_pct=70.0)
    return alloc


@router.put("/allocation", response_model=schemas.SavingsAllocationOut)
def upsert_allocation(
    data: schemas.SavingsAllocationUpdate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    alloc = db.query(models.SavingsAllocation).filter(
        models.SavingsAllocation.user_id == current_user.id,
        models.SavingsAllocation.month == data.month,
    ).first()
    if alloc:
        alloc.savings_pct = data.savings_pct
        alloc.investment_pct = data.investment_pct
        alloc.expenses_pct = data.expenses_pct
    else:
        alloc = models.SavingsAllocation(user_id=current_user.id, **data.model_dump())
        db.add(alloc)
    db.commit()
    db.refresh(alloc)
    return alloc
