"""
Copia de seguridad de una cuenta completa y su restauración.

A diferencia de la exportación (pensada para leer: etiquetas en español,
"Sí"/"No", nombres de categoría...), esta copia guarda las filas tal cual
están en la base de datos para poder reconstruir la cuenta en otra instalación,
p. ej. llevar los datos del servidor a una instalación local.

- Los ids no se conservan: al restaurar se crean filas nuevas y se reescriben
  las referencias (categoría, grupo recurrente, enlace, deuda, transacción).
- Las categorías del sistema son globales, así que se referencian por
  nombre y tipo y se resuelven contra las de la instalación de destino.
- Nunca se copian secretos: credenciales bancarias, tokens de API ni webhooks
  (llevan el secreto HMAC). Tampoco el registro de uso de IA ni los insights,
  que se regeneran solos.
"""
from __future__ import annotations

import enum
import json
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple, Type

from sqlalchemy import Date, DateTime, Enum as SAEnum, select
from sqlalchemy.orm import Session

from .. import models

KIND = "account-backup"
VERSION = 1

# (clave en el archivo, modelo). El orden es el de inserción: cada tabla solo
# referencia a las anteriores.
TABLES: List[Tuple[str, Type[models.Base]]] = [
    ("categories", models.Category),
    ("recurring_groups", models.RecurringGroup),
    ("transaction_links", models.TransactionLink),
    ("transactions", models.Transaction),
    ("category_rules", models.CategoryRule),
    ("budgets", models.Budget),
    ("debts", models.Debt),
    ("debt_payments", models.DebtPayment),
    ("goals", models.Goal),
    ("savings_allocations", models.SavingsAllocation),
    ("manual_positions", models.ManualPosition),
]

LABELS = {
    "categories": "Categorías propias",
    "recurring_groups": "Recurrentes",
    "transaction_links": "Enlaces entre movimientos",
    "transactions": "Movimientos",
    "category_rules": "Reglas",
    "budgets": "Presupuestos",
    "debts": "Deudas",
    "debt_payments": "Pagos de deudas",
    "goals": "Objetivos",
    "savings_allocations": "Reparto de ahorro",
    "manual_positions": "Posiciones manuales",
}

# Columna -> tabla a la que apunta (para reescribir ids al restaurar)
FKS: Dict[str, Dict[str, str]] = {
    "recurring_groups": {"category_id": "categories"},
    "transactions": {"category_id": "categories", "recurring_group_id": "recurring_groups",
                     "link_group_id": "transaction_links"},
    "category_rules": {"category_id": "categories"},
    "budgets": {"category_id": "categories"},
    "debt_payments": {"debt_id": "debts", "transaction_id": "transactions"},
}

# Columnas que apuntan a la propia tabla (se reescriben tras insertarla)
SELF_REFS: Dict[str, Dict[str, str]] = {
    "transactions": {"split_parent_id": "transactions"},
}


class BackupError(ValueError):
    pass


# ── Exportar ─────────────────────────────────────────────────────────────────

def _plain(v: Any) -> Any:
    if isinstance(v, enum.Enum):
        return v.value
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def _row(obj: models.Base) -> Dict[str, Any]:
    return {c.name: _plain(getattr(obj, c.name)) for c in obj.__table__.columns if c.name != "user_id"}


def _user_rows(db: Session, uid: int) -> Dict[str, List[models.Base]]:
    rows: Dict[str, List[models.Base]] = {}
    for key, model in TABLES:
        if key == "categories":
            q = db.query(models.Category).filter(models.Category.user_id == uid,
                                                 models.Category.is_system == False)  # noqa: E712
        elif key == "debt_payments":
            debt_ids = select(models.Debt.id).where(models.Debt.user_id == uid)
            q = db.query(models.DebtPayment).filter(models.DebtPayment.debt_id.in_(debt_ids))
        else:
            q = db.query(model).filter(model.user_id == uid)
        rows[key] = q.order_by(model.id).all()
    return rows


def build_backup(db: Session, user: models.User) -> Dict[str, Any]:
    rows = _user_rows(db, user.id)
    system = db.query(models.Category).filter(models.Category.is_system == True).all()  # noqa: E712
    return {
        "app": "FinanceMaster",
        "kind": KIND,
        "version": VERSION,
        "exported_at": datetime.now().isoformat(timespec="seconds"),
        "user": {"username": user.username, "email": user.email,
                 "created_at": _plain(user.created_at)},
        "system_categories": [{"id": c.id, "name": c.name, "type": _plain(c.type)} for c in system],
        "counts": {k: len(v) for k, v in rows.items()},
        "tables": {k: [_row(o) for o in v] for k, v in rows.items()},
    }


def backup_bytes(db: Session, user: models.User) -> bytes:
    return json.dumps(build_backup(db, user), ensure_ascii=False, separators=(",", ":")).encode("utf-8")


# ── Leer / validar ───────────────────────────────────────────────────────────

def parse_backup(raw: bytes) -> Dict[str, Any]:
    try:
        doc = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise BackupError("El archivo no es un JSON válido")
    if not isinstance(doc, dict) or doc.get("app") != "FinanceMaster":
        raise BackupError("El archivo no es una copia de FinanceMaster")
    if doc.get("kind") != KIND:
        if "data" in doc and "period" in doc:
            raise BackupError("Esto es una exportación de datos, no una copia de la cuenta. "
                              "Descárgala desde Ajustes → Copia de la cuenta.")
        raise BackupError("El archivo no es una copia de la cuenta")
    if not isinstance(doc.get("version"), int) or doc["version"] > VERSION:
        raise BackupError("La copia es de una versión más nueva de FinanceMaster. Actualiza esta instalación.")
    tables = doc.get("tables")
    if not isinstance(tables, dict) or not all(isinstance(v, list) for v in tables.values()):
        raise BackupError("La copia está incompleta o dañada")
    return doc


def summarize(doc: Dict[str, Any]) -> Dict[str, Any]:
    tables = doc["tables"]
    txs = tables.get("transactions", [])
    dates = sorted(t["date"] for t in txs if isinstance(t, dict) and t.get("date"))
    sources: Dict[str, int] = {}
    for t in txs:
        s = (t.get("source") if isinstance(t, dict) else None) or "desconocido"
        sources[s] = sources.get(s, 0) + 1
    return {
        "exported_at": doc.get("exported_at"),
        "user": doc.get("user") or {},
        "counts": {k: len(tables.get(k, [])) for k, _ in TABLES},
        "labels": LABELS,
        "first_date": dates[0] if dates else None,
        "last_date": dates[-1] if dates else None,
        "sources": sources,
    }


def current_counts(db: Session, uid: int) -> Dict[str, int]:
    return {k: len(v) for k, v in _user_rows(db, uid).items()}


# ── Restaurar ────────────────────────────────────────────────────────────────

def _coerce(col, v: Any) -> Any:
    if v is None:
        return None
    t = col.type
    if isinstance(t, DateTime):
        return datetime.fromisoformat(v) if isinstance(v, str) else v
    if isinstance(t, Date):
        return date.fromisoformat(v[:10]) if isinstance(v, str) else v
    if isinstance(t, SAEnum) and t.enum_class is not None:
        return t.enum_class(v)
    return v


def _wipe(db: Session, uid: int) -> None:
    """Borra todo lo que la copia va a reemplazar, en orden inverso de dependencias."""
    debt_ids = select(models.Debt.id).where(models.Debt.user_id == uid)
    db.query(models.DebtPayment).filter(models.DebtPayment.debt_id.in_(debt_ids)).delete(synchronize_session=False)
    for model in (models.Debt, models.Goal, models.SavingsAllocation, models.ManualPosition,
                  models.Budget, models.CategoryRule, models.Transaction, models.TransactionLink,
                  models.RecurringGroup, models.Insight):
        db.query(model).filter(model.user_id == uid).delete(synchronize_session=False)
    db.query(models.Category).filter(models.Category.user_id == uid,
                                     models.Category.is_system == False).delete(synchronize_session=False)  # noqa: E712


def restore(db: Session, uid: int, doc: Dict[str, Any]) -> Dict[str, int]:
    """Sustituye los datos de la cuenta `uid` por los de la copia. Todo o nada."""
    tables = doc["tables"]
    id_map: Dict[str, Dict[int, Optional[int]]] = {k: {} for k, _ in TABLES}

    # Categorías del sistema: id de origen -> id local, por nombre y tipo
    local_sys = db.query(models.Category).filter(models.Category.is_system == True).all()  # noqa: E712
    by_name_type = {(c.name, _plain(c.type)): c.id for c in local_sys}
    by_name = {c.name: c.id for c in local_sys}
    missing_sys: List[Dict[str, Any]] = []
    for c in doc.get("system_categories") or []:
        local = by_name_type.get((c.get("name"), c.get("type"))) or by_name.get(c.get("name"))
        if local:
            id_map["categories"][c["id"]] = local
        else:
            missing_sys.append(c)

    try:
        _wipe(db, uid)
        db.flush()

        # Una categoría del sistema que no existe aquí se recrea como propia
        # para no perder la clasificación de sus movimientos.
        for c in missing_sys:
            try:
                ctype = models.CategoryType(c.get("type") or "expense")
            except ValueError:
                ctype = models.CategoryType.expense
            cat = models.Category(user_id=uid, name=c.get("name") or "Sin nombre", type=ctype, is_system=False)
            db.add(cat)
            db.flush()
            id_map["categories"][c["id"]] = cat.id

        inserted: Dict[str, int] = {}
        for key, model in TABLES:
            cols = {c.name: c for c in model.__table__.columns}
            fks = FKS.get(key, {})
            objs: List[Tuple[Optional[int], models.Base]] = []
            for raw in tables.get(key, []):
                if not isinstance(raw, dict):
                    continue
                vals: Dict[str, Any] = {}
                for name, v in raw.items():
                    if name in ("id", "user_id") or name not in cols:
                        continue
                    if name in fks and v is not None:
                        v = id_map[fks[name]].get(v)
                    vals[name] = _coerce(cols[name], v)
                if key == "categories":
                    vals["is_system"] = False
                if key == "category_rules" and not vals.get("category_id"):
                    continue            # categoría que no venía en la copia
                if key == "debt_payments":
                    if not vals.get("debt_id"):
                        continue        # deuda que no venía en la copia
                elif "user_id" in cols:
                    vals["user_id"] = uid
                objs.append((raw.get("id"), model(**vals)))
            db.add_all([o for _, o in objs])
            db.flush()
            for old_id, o in objs:
                if old_id is not None:
                    id_map[key][old_id] = o.id
            # Las partes de un gasto dividido apuntan a otro movimiento de la
            # misma tabla: se reescriben cuando ya se conocen los ids nuevos.
            for col, ref in SELF_REFS.get(key, {}).items():
                for _, o in objs:
                    old = getattr(o, col)
                    if old is not None:
                        setattr(o, col, id_map[ref].get(old))
            inserted[key] = len(objs)

        db.commit()
    except Exception:
        db.rollback()
        raise
    return inserted
