from datetime import datetime as _dt, date
from typing import Optional
from sqlalchemy import (
    Boolean, Column, DateTime, Date, Float, ForeignKey,
    Integer, String, Text, UniqueConstraint, Enum as SAEnum
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
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=_dt.utcnow)
    is_active = Column(Boolean, default=True)

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
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    external_id = Column(String, nullable=True)
    datetime = Column(DateTime, nullable=True)
    date = Column(Date, nullable=False)
    account_category = Column(String, nullable=True)
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
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    is_auto_categorized = Column(Boolean, default=False)
    is_ai_categorized = Column(Boolean, default=False)
    is_internal_transfer = Column(Boolean, default=False)
    exclude_from_stats = Column(Boolean, default=False)
    recurring_group_id = Column(Integer, ForeignKey("recurring_groups.id"), nullable=True)
    created_at = Column(DateTime, default=_dt.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "external_id", name="uq_user_external_id"),)

    user = relationship("User", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    recurring_group = relationship("RecurringGroup", back_populates="transactions")
    debt_payments = relationship("DebtPayment", back_populates="transaction")


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
    created_at = Column(DateTime, default=_dt.utcnow)

    user = relationship("User", back_populates="recurring_groups")
    transactions = relationship("Transaction", back_populates="recurring_group")
    category = relationship("Category", foreign_keys=[category_id])


class Debt(Base):
    __tablename__ = "debts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
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
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
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
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
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
