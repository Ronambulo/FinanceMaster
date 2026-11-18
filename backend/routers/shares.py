"""Gastos compartidos: qué parte de un gasto le toca pagar a otra persona."""
from datetime import date as _date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import auth, models
from ..database import get_db

router = APIRouter(prefix="/api/shares", tags=["shares"])


class ShareIn(BaseModel):
    person: str = Field(min_length=1, max_length=60)
    amount: float = Field(gt=0)


class ShareSet(BaseModel):
    shares: List[ShareIn]


class ShareOut(BaseModel):
    id: int
    transaction_id: int
    person: str
    amount: float
    settled: bool
    tx_name: Optional[str] = None
    tx_date: Optional[_date] = None


class SettleIn(BaseModel):
    settled: bool = True


class SettlePerson(BaseModel):
    person: str


def _out(s: models.TransactionShare, tx: Optional[models.Transaction] = None) -> ShareOut:
    return ShareOut(id=s.id, transaction_id=s.transaction_id, person=s.person, amount=s.amount,
                    settled=bool(s.settled), tx_name=tx.name if tx else None, tx_date=tx.date if tx else None)


def _own_tx(db: Session, user_id: int, tx_id: int) -> models.Transaction:
    tx = db.query(models.Transaction).filter(models.Transaction.id == tx_id,
                                             models.Transaction.user_id == user_id).first()
    if not tx:
        raise HTTPException(404, "Movimiento no encontrado")
    return tx


@router.get("")
def list_shares(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Todas las partes con el resumen por persona (lo pendiente primero)."""
    rows = (db.query(models.TransactionShare, models.Transaction)
            .join(models.Transaction, models.Transaction.id == models.TransactionShare.transaction_id)
            .filter(models.TransactionShare.user_id == current_user.id)
            .order_by(models.Transaction.date.desc(), models.TransactionShare.id.desc())
            .all())
    people: dict = {}
    for s, tx in rows:
        key = s.person.strip()
        p = people.setdefault(key.lower(), {"person": key, "owed": 0.0, "settled": 0.0, "count": 0})
        p["settled" if s.settled else "owed"] += s.amount
        p["count"] += 1
    summary = sorted(({**p, "owed": round(p["owed"], 2), "settled": round(p["settled"], 2)} for p in people.values()),
                     key=lambda p: (-p["owed"], p["person"].lower()))
    return {
        "total_owed": round(sum(p["owed"] for p in summary), 2),
        "people": summary,
        "items": [_out(s, tx) for s, tx in rows],
    }


@router.get("/tx/{tx_id}", response_model=List[ShareOut])
def tx_shares(
    tx_id: int,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    tx = _own_tx(db, current_user.id, tx_id)
    rows = db.query(models.TransactionShare).filter(models.TransactionShare.user_id == current_user.id,
                                                    models.TransactionShare.transaction_id == tx_id) \
        .order_by(models.TransactionShare.id).all()
    return [_out(s, tx) for s in rows]


@router.put("/tx/{tx_id}", response_model=List[ShareOut])
def set_tx_shares(
    tx_id: int,
    data: ShareSet,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Sustituye el reparto de un gasto. Una persona que ya había pagado sigue marcada como pagada."""
    tx = _own_tx(db, current_user.id, tx_id)
    total = round(sum(s.amount for s in data.shares), 2)
    if total > round(abs(tx.amount), 2) + 0.005:
        raise HTTPException(400, "Lo que pagan los demás no puede superar el gasto")
    names = [s.person.strip().lower() for s in data.shares]
    if len(set(names)) != len(names):
        raise HTTPException(400, "Hay una persona repetida")
    old = db.query(models.TransactionShare).filter(models.TransactionShare.user_id == current_user.id,
                                                   models.TransactionShare.transaction_id == tx_id).all()
    settled = {s.person.strip().lower(): (s.settled, s.amount) for s in old}
    for s in old:
        db.delete(s)
    db.flush()
    for s in data.shares:
        prev = settled.get(s.person.strip().lower())
        keep = bool(prev and prev[0] and abs(prev[1] - s.amount) < 0.005)
        db.add(models.TransactionShare(user_id=current_user.id, transaction_id=tx_id,
                                       person=s.person.strip(), amount=round(s.amount, 2), settled=keep))
    db.commit()
    return tx_shares(tx_id, current_user, db)


@router.post("/{share_id}/settle", response_model=ShareOut)
def settle_share(
    share_id: int,
    data: SettleIn,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    s = db.query(models.TransactionShare).filter(models.TransactionShare.id == share_id,
                                                 models.TransactionShare.user_id == current_user.id).first()
    if not s:
        raise HTTPException(404, "No encontrado")
    s.settled = data.settled
    db.commit()
    tx = db.query(models.Transaction).get(s.transaction_id)
    return _out(s, tx)


@router.post("/settle-person")
def settle_person(
    data: SettlePerson,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Marca como pagado todo lo que debe una persona."""
    key = data.person.strip().lower()
    rows = db.query(models.TransactionShare).filter(models.TransactionShare.user_id == current_user.id,
                                                    models.TransactionShare.settled == False).all()  # noqa: E712
    n = 0
    for s in rows:
        if s.person.strip().lower() == key:
            s.settled = True
            n += 1
    db.commit()
    return {"settled": n}
