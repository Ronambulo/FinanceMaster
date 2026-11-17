from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import auth, models
from ..database import get_db
from ..services import account_backup as ab

router = APIRouter(prefix="/api/account", tags=["account"])

# Una copia de varios años ronda unos pocos MB; esto deja mucho margen.
MAX_BACKUP_BYTES = 200 * 1024 * 1024


@router.get("/backup")
def download_backup(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Copia completa de la cuenta para restaurarla en otra instalación."""
    content = ab.backup_bytes(db, current_user)
    filename = f"financemaster-cuenta-{current_user.username}-{date.today().isoformat()}.json"
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get("/backup/summary")
def backup_summary(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Lo que tiene ahora la cuenta (lo que se copiaría o se sustituiría)."""
    return {"counts": ab.current_counts(db, current_user.id), "labels": ab.LABELS}


async def _read(file: UploadFile) -> dict:
    raw = await file.read(MAX_BACKUP_BYTES + 1)
    if len(raw) > MAX_BACKUP_BYTES:
        raise HTTPException(413, "El archivo es demasiado grande")
    try:
        return ab.parse_backup(raw)
    except ab.BackupError as e:
        raise HTTPException(400, str(e))


@router.post("/restore/preview")
async def restore_preview(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Valida la copia y cuenta lo que trae, sin tocar nada."""
    doc = await _read(file)
    return {**ab.summarize(doc), "current": ab.current_counts(db, current_user.id)}


@router.post("/restore")
async def restore_backup(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Sustituye TODOS los datos de la cuenta por los de la copia (todo o nada)."""
    doc = await _read(file)
    try:
        inserted = ab.restore(db, current_user.id, doc)
    except IntegrityError:
        raise HTTPException(400, "La copia tiene datos inconsistentes; no se ha cambiado nada")
    except (ValueError, TypeError, KeyError) as e:
        raise HTTPException(400, f"No se pudo restaurar la copia: {e}")
    return {"ok": True, "restored": inserted}
