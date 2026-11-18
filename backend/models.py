from datetime import datetime as _dt, date
from typing import Optional
from sqlalchemy import (
    Boolean, Column, DateTime, Date, Float, ForeignKey,
    Index, Integer, LargeBinary, String, Text, UniqueConstraint, Enum as SAEnum
)
from sqlalchemy.orm import relationship
import enum
from .database import Base


class CategoryType(str, enum.Enum):
    income = "income"
    expense = "expense"
    investment = "investment"
    transfer = "transfer"
    internal = "internal"


class DebtDirection(str, enum.Enum):
    i_owe = "I_OWE"
    owed_to_me = "OWED_TO_ME"


class GoalType(str, enum.Enum):
    percent = "PERCENT"
    euro_target = "EURO_TARGET"


class GoalCategory(str, enum.Enum):
    savings = "SAVINGS"
    investment = "INVESTMENT"
    expenses = "EXPENSES"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=_dt.utcnow)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    ai_enabled = Column(Boolean, default=False)
    ai_model = Column(String, nullable=True)
    last_login_at = Column(DateTime, nullable=True)
    # Preferencias de interfaz (JSON): modo, módulos y tema. NULL = usuario
    # anterior al rediseño, ver services/preferences.py
    preferences = Column(Text, nullable=True)

    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="user", cascade="all, delete-orphan")
    category_rules = relationship("CategoryRule", back_populates="user", cascade="all, delete-orphan")
    recurring_groups = relationship("RecurringGroup", back_populates="user", cascade="all, delete-orphan")
    debts = relationship("Debt", back_populates="user", cascade="all, delete-orphan")
    goals = relationship("Goal", back_populates="user", cascade="all, delete-orphan")
    savings_allocations = relationship("SavingsAllocation", back_populates="user", cascade="all, delete-orphan")
    budgets = relationship("Budget", back_populates="user", cascade="all, delete-orphan")
    webhooks = relationship("Webhook", back_populates="user", cascade="all, delete-orphan")
    bank_connections = relationship("BankConnection", back_populates="user", cascade="all, delete-orphan")
    manual_positions = relationship("ManualPosition", back_populates="user", cascade="all, delete-orphan")
    api_tokens = relationship("ApiToken", back_populates="user", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String, nullable=False)
    icon = Column(String, default="💰")
    color = Column(String, default="#6366f1")
    type = Column(SAEnum(CategoryType), nullable=False)
    is_system = Column(Boolean, default=False)

    user = relationship("User", back_populates="categories")
    transactions = relationship("Transaction", back_populates="category")
    rules = relationship("CategoryRule", back_populates="category")


class CategoryRule(Base):
    __tablename__ = "category_rules"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    keyword = Column(String, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    field = Column(String, default="name")
    priority = Column(Integer, default=0)

    user = relationship("User", back_populates="category_rules")
    category = relationship("Category", back_populates="rules")


class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    external_id = Column(String, nullable=True)
    datetime = Column(DateTime, nullable=True)
    date = Column(Date, nullable=False, index=True)
    account_category = Column(String, nullable=True, index=True)
    type = Column(String, nullable=False)
    asset_class = Column(String, nullable=True)
    name = Column(String, nullable=True)
    symbol = Column(String, nullable=True)
    shares = Column(Float, nullable=True)
    price = Column(Float, nullable=True)
    amount = Column(Float, nullable=False)
    fee = Column(Float, nullable=True)
    tax = Column(Float, nullable=True)
    currency = Column(String, default="EUR")
    description = Column(Text, nullable=True)
    counterparty_name = Column(String, nullable=True)
    counterparty_iban = Column(String, nullable=True)
    mcc_code = Column(String, nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True, index=True)
    is_auto_categorized = Column(Boolean, default=False)
    is_ai_categorized = Column(Boolean, default=False)
    is_internal_transfer = Column(Boolean, default=False)
    exclude_from_stats = Column(Boolean, default=False)
    is_pending = Column(Boolean, nullable=True, default=False)
    recurring_group_id = Column(Integer, ForeignKey("recurring_groups.id"), nullable=True, index=True)
    link_group_id = Column(Integer, ForeignKey("transaction_links.id"), nullable=True, index=True)
    is_link_primary = Column(Boolean, default=False)
    effective_amount = Column(Float, nullable=True)
    # Nota libre del usuario y, si es una parte de un gasto dividido, el original.
    note = Column(Text, nullable=True)
    split_parent_id = Column(Integer, nullable=True, index=True)
    # Creado a mano (aunque se asigne a una cuenta de banco).
    is_manual = Column(Boolean, nullable=True, default=False)
    # Banco/origen del movimiento: trade_republic, myinvestor, revolut, n26, wise,
    # manual… (claves de bank_connectors.BANK_LABELS). NULL = desconocido.
    source = Column(String, nullable=True)
    created_at = Column(DateTime, default=_dt.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "external_id", name="uq_user_external_id"),
        Index("ix_transactions_user_date", "user_id", "date"),
    )

    user = relationship("User", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    recurring_group = relationship("RecurringGroup", back_populates="transactions")
    debt_payments = relationship("DebtPayment", back_populates="transaction")
    link_group = relationship("TransactionLink", back_populates="transactions")


class TransactionLink(Base):
    __tablename__ = "transaction_links"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=_dt.utcnow)

    transactions = relationship("Transaction", back_populates="link_group")


class RecurringGroup(Base):
    __tablename__ = "recurring_groups"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    normalized_name = Column(String, nullable=False)
    display_name = Column(String, nullable=False)
    avg_amount = Column(Float, nullable=True)
    period_days = Column(Integer, nullable=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    next_expected_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    amount_is_manual = Column(Boolean, default=False)
    # Sugerencia descartada: la detección no vuelve a proponerla.
    is_dismissed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_dt.utcnow)

    user = relationship("User", back_populates="recurring_groups")
    transactions = relationship("Transaction", back_populates="recurring_group")
    category = relationship("Category", foreign_keys=[category_id])


class Debt(Base):
    __tablename__ = "debts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    total_amount = Column(Float, nullable=False)
    direction = Column(SAEnum(DebtDirection), nullable=False)
    due_date = Column(Date, nullable=True)
    is_settled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_dt.utcnow)

    user = relationship("User", back_populates="debts")
    payments = relationship("DebtPayment", back_populates="debt", cascade="all, delete-orphan")


class DebtPayment(Base):
    __tablename__ = "debt_payments"
    id = Column(Integer, primary_key=True, index=True)
    debt_id = Column(Integer, ForeignKey("debts.id"), nullable=False)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    amount = Column(Float, nullable=False)
    payment_date = Column(Date, nullable=False)
    note = Column(Text, nullable=True)

    debt = relationship("Debt", back_populates="payments")
    transaction = relationship("Transaction", back_populates="debt_payments")


class Goal(Base):
    __tablename__ = "goals"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    type = Column(SAEnum(GoalType), nullable=False)
    target_amount = Column(Float, nullable=True)
    target_percent = Column(Float, nullable=True)
    category = Column(SAEnum(GoalCategory), nullable=True)
    deadline = Column(Date, nullable=True)
    current_amount = Column(Float, default=0.0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_dt.utcnow)

    user = relationship("User", back_populates="goals")


class Budget(Base):
    __tablename__ = "budgets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    amount = Column(Float, nullable=False)
    # month = "2024-01" for a specific month, NULL when is_recurring=True
    month = Column(String, nullable=True)
    is_recurring = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_dt.utcnow)

    user = relationship("User", back_populates="budgets")
    category = relationship("Category")


class SavingsAllocation(Base):
    __tablename__ = "savings_allocations"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    month = Column(String, nullable=False)
    savings_pct = Column(Float, default=20.0)
    investment_pct = Column(Float, default=10.0)
    expenses_pct = Column(Float, default=70.0)

    __table_args__ = (UniqueConstraint("user_id", "month", name="uq_user_month"),)
    user = relationship("User", back_populates="savings_allocations")


class Insight(Base):
    __tablename__ = "insights"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    severity = Column(String, default="info")  # info | warning | positive
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_dt.utcnow)

    user = relationship("User")


class BackgroundJob(Base):
    __tablename__ = "background_jobs"
    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String, nullable=False)
    status = Column(String, default="pending")  # pending | running | done | error
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_dt.utcnow)


class Webhook(Base):
    __tablename__ = "webhooks"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    url = Column(String, nullable=False)
    events = Column(Text, default="[]")        # JSON array of event names
    secret = Column(String, nullable=False)    # HMAC signing secret
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_dt.utcnow)

    user = relationship("User", back_populates="webhooks")


class ApiToken(Base):
    """Token de acceso de larga duración para clientes externos (p.ej. un
    Atajo de iOS) que no deben depender de la sesión de login de 7 días."""
    __tablename__ = "api_tokens"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    token_prefix = Column(String, nullable=False)  # para mostrarlo enmascarado en la UI
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_dt.utcnow)

    user = relationship("User", back_populates="api_tokens")


class ManualPosition(Base):
    __tablename__ = "manual_positions"
    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    ticker        = Column(String, nullable=False)
    name          = Column(String, nullable=False)
    shares        = Column(Float, nullable=False)
    avg_price_eur = Column(Float, nullable=False)
    currency      = Column(String, default="EUR")
    created_at    = Column(DateTime, default=_dt.utcnow)

    user = relationship("User", back_populates="manual_positions")


class AssetTypeOverride(Base):
    """Tipo de activo elegido a mano para una posición (si el automático falla)."""
    __tablename__ = "asset_type_overrides"
    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    symbol      = Column(String, nullable=False)
    asset_class = Column(String, nullable=False)


class AiUsageLog(Base):
    __tablename__ = "ai_usage_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    model = Column(String, nullable=True)
    endpoint = Column(String, default="chat")
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=_dt.utcnow, index=True)

    user = relationship("User")


class ImportLog(Base):
    """Historial de importaciones de CSV (pantalla Importar)."""
    __tablename__ = "import_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String, nullable=True)
    source = Column(String, nullable=True)
    imported = Column(Integer, default=0)
    skipped = Column(Integer, default=0)
    errors = Column(Integer, default=0)
    created_at = Column(DateTime, default=_dt.utcnow, index=True)

    user = relationship("User")


class BankConnection(Base):
    __tablename__ = "bank_connections"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    bank_name = Column(String, nullable=False)          # "trade_republic"
    encrypted_phone = Column(String, nullable=True)
    encrypted_pin = Column(String, nullable=True)
    last_connected_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="bank_connections")
    __table_args__ = (UniqueConstraint("user_id", "bank_name", name="uq_user_bank"),)


class UserSession(Base):
    """Una sesión de login (un token JWT con su `jti`). Permite ver los
    dispositivos abiertos en Seguridad y cerrarlos. Los tokens antiguos sin
    `jti` siguen valiendo hasta que caducan."""
    __tablename__ = "user_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    jti = Column(String, nullable=False, unique=True, index=True)
    user_agent = Column(String, nullable=True)
    ip = Column(String, nullable=True)
    created_at = Column(DateTime, default=_dt.utcnow)
    last_seen_at = Column(DateTime, default=_dt.utcnow)
    revoked_at = Column(DateTime, nullable=True)


class ActivityLog(Base):
    """Registro de actividad del servidor (Administración). Guarda el nombre
    del usuario para que la fila siga teniendo sentido si se borra la cuenta."""
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    username = Column(String, nullable=True)
    action = Column(String, nullable=False)
    detail = Column(String, nullable=True)
    ip = Column(String, nullable=True)
    created_at = Column(DateTime, default=_dt.utcnow, index=True)


class AdminNotice(Base):
    """Avisos para los administradores (copia fallida, accesos fallidos…)."""
    __tablename__ = "admin_notices"
    id = Column(Integer, primary_key=True, index=True)
    level = Column(String, default="warning")  # info | warning | error
    title = Column(String, nullable=False)
    text = Column(String, nullable=True)
    created_at = Column(DateTime, default=_dt.utcnow, index=True)
    read_at = Column(DateTime, nullable=True)


class Passkey(Base):
    """Llave de acceso (WebAuthn) para "Entrar con huella". Una por
    dispositivo; la clave privada nunca sale del dispositivo."""
    __tablename__ = "passkeys"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    credential_id = Column(String, nullable=False, unique=True, index=True)  # base64url
    public_key = Column(LargeBinary, nullable=False)
    sign_count = Column(Integer, default=0)
    device = Column(String, nullable=True)
    created_at = Column(DateTime, default=_dt.utcnow)
    last_used_at = Column(DateTime, nullable=True)


class Invite(Base):
    """Enlace de invitación de un solo uso para crear una cuenta."""
    __tablename__ = "invites"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, nullable=False, unique=True, index=True)
    display_name = Column(String, nullable=True)
    # Sin clave foránea: la invitación no debe impedir borrar al administrador.
    created_by = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=_dt.utcnow)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    used_by = Column(Integer, nullable=True)
