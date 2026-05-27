from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.Token)
def register(data: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")
    if db.query(models.User).filter(models.User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Usuario ya existe")

    user = models.User(
        email=data.email,
        username=data.username,
        hashed_password=auth.hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = auth.create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, token_type="bearer", user=schemas.UserOut.model_validate(user))


@router.post("/login", response_model=schemas.Token)
def login(data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user or not auth.verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    token = auth.create_access_token({"sub": str(user.id)})
    return schemas.Token(access_token=token, token_type="bearer", user=schemas.UserOut.model_validate(user))


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.put("/password")
def change_password(
    data: PasswordChange,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    if not auth.verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    current_user.hashed_password = auth.hash_password(data.new_password)
    db.commit()
    return {"ok": True}


@router.delete("/data")
def delete_all_data(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Delete all user transactions, recurring groups, debts, goals and categories."""
    # Nullify transaction references in debt_payments first to avoid FK issues
    debt_ids = [d.id for d in db.query(models.Debt).filter(models.Debt.user_id == current_user.id).all()]
    if debt_ids:
        db.query(models.DebtPayment).filter(models.DebtPayment.debt_id.in_(debt_ids)).delete(synchronize_session=False)
    db.query(models.Debt).filter(models.Debt.user_id == current_user.id).delete()
    db.query(models.Transaction).filter(models.Transaction.user_id == current_user.id).delete()
    db.query(models.RecurringGroup).filter(models.RecurringGroup.user_id == current_user.id).delete()
    db.query(models.Goal).filter(models.Goal.user_id == current_user.id).delete()
    db.query(models.SavingsAllocation).filter(models.SavingsAllocation.user_id == current_user.id).delete()
    db.query(models.CategoryRule).filter(models.CategoryRule.user_id == current_user.id).delete()
    db.query(models.Category).filter(
        models.Category.user_id == current_user.id,
        models.Category.is_system == False,
    ).delete()
    db.commit()
    return {"ok": True}
