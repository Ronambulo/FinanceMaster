import os
import bcrypt
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from . import models
from .database import get_db

API_TOKEN_PREFIX = "fm_"

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-use-long-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_user_from_token(token: str, db: Session) -> models.User:
    """Resolve a user from a raw JWT string (used by SSE where Depends can't inject)."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise ValueError("no sub")
        user = db.query(models.User).filter(models.User.id == int(user_id)).first()
        if user is None or not user.is_active:
            raise ValueError("user not found")
        return user
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


def _resolve_api_token(token: str, db: Session) -> Optional[models.User]:
    """Long-lived token for external clients (e.g. an iOS Shortcut) that
    shouldn't have to re-authenticate every 7 days like a normal login session."""
    if not token.startswith(API_TOKEN_PREFIX):
        return None
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    rec = db.query(models.ApiToken).filter(models.ApiToken.token_hash == token_hash).first()
    if rec is None:
        return None
    user = db.query(models.User).filter(models.User.id == rec.user_id).first()
    if user is None or not user.is_active:
        return None
    rec.last_used_at = datetime.utcnow()
    db.commit()
    return user


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        api_user = _resolve_api_token(token, db)
        if api_user is None:
            raise credentials_exception
        return api_user

    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requiere permisos de administrador")
    return current_user


def require_ai_access(current_user: models.User = Depends(get_current_user)) -> models.User:
    if not (current_user.is_admin or current_user.ai_enabled):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes acceso a las funciones de IA. Pide al administrador que te lo active.",
        )
    return current_user
