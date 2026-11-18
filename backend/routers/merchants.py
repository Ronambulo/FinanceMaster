"""Logos de comercios. Público a propósito: solo sirve marcas del catálogo,
nunca nada del usuario, y así un <img> puede cargarlo sin token."""
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from ..services.logos import get_logo

router = APIRouter(prefix="/api/merchants", tags=["merchants"])


@router.get("/logo/{brand_id}")
async def merchant_logo(brand_id: str):
    path = await run_in_threadpool(get_logo, brand_id)
    if not path:
        raise HTTPException(404, "Sin logo", headers={"Cache-Control": "public, max-age=86400"})
    return FileResponse(path, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=2592000, immutable"})


# ── Revisar lo no confirmado (Ajustes → Categorías) ─────────────────────────
from fastapi import Depends  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from .. import auth, models  # noqa: E402
from ..database import get_db  # noqa: E402


@router.get("/recategorize/preview")
def recategorize_preview(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    from ..services.recategorize import plan
    changes = plan(db, current_user.id)
    db.rollback()
    return {"count": len(changes)}


@router.post("/recategorize/apply")
def recategorize_apply(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    from ..services.recategorize import ai_categorize_user, recategorize_user
    n = recategorize_user(db, current_user.id)
    ai = 0
    try:
        ai = ai_categorize_user(db, current_user)
    except Exception:
        db.rollback()
    return {"updated": n, "ai": ai}
