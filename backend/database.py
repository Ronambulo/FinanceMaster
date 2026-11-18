import os
import unicodedata

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

_default_db = "sqlite:///" + os.path.join(os.path.dirname(__file__), "data", "finance.db")
DATABASE_URL = os.getenv("DATABASE_URL", _default_db)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)


def fold(text):
    """Minúsculas y sin acentos: "Cafetería" -> "cafeteria"."""
    if text is None:
        return None
    t = unicodedata.normalize("NFKD", str(text))
    return "".join(c for c in t if not unicodedata.combining(c)).lower()


if engine.dialect.name == "sqlite":
    @event.listens_for(engine, "connect")
    def _register_functions(dbapi_conn, _):
        dbapi_conn.create_function("fold", 1, fold, deterministic=True)


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
