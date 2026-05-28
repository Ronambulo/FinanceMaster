from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr
from .models import CategoryType, DebtDirection, GoalType, GoalCategory


# ── Auth ─────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    username: str
    created_at: datetime
    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


# ── Categories ───────────────────────────────────────────────────────────────
class CategoryCreate(BaseModel):
    name: str
    icon: str = "💰"
    color: str = "#6366f1"
    type: CategoryType

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None

class CategoryOut(BaseModel):
    id: int
    user_id: Optional[int]
    name: str
    icon: str
    color: str
    type: CategoryType
    is_system: bool
    model_config = {"from_attributes": True}

class CategoryRuleCreate(BaseModel):
    keyword: str
    category_id: int
    field: str = "name"
    priority: int = 0

class CategoryRuleOut(BaseModel):
    id: int
    keyword: str
    category_id: int
    field: str
    priority: int
    category: CategoryOut
    model_config = {"from_attributes": True}


# ── Transactions ─────────────────────────────────────────────────────────────
class TransactionCreate(BaseModel):
    date: date
    type: str
    name: Optional[str] = None
    amount: float
    currency: str = "EUR"
    description: Optional[str] = None
    category_id: Optional[int] = None
    fee: Optional[float] = None

class TransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    is_internal_transfer: Optional[bool] = None
    exclude_from_stats: Optional[bool] = None

class TransactionOut(BaseModel):
    id: int
    external_id: Optional[str]
    date: date
    datetime: Optional[datetime]
    type: str
    account_category: Optional[str]
    asset_class: Optional[str]
    name: Optional[str]
    symbol: Optional[str]
    shares: Optional[float]
    price: Optional[float]
    amount: float
    fee: Optional[float]
    tax: Optional[float]
    currency: str
    description: Optional[str]
    counterparty_name: Optional[str]
    mcc_code: Optional[str]
    category_id: Optional[int]
    category: Optional[CategoryOut]
    is_auto_categorized: bool
    is_internal_transfer: bool
    exclude_from_stats: bool = False
    recurring_group_id: Optional[int]
    model_config = {"from_attributes": True}

class ImportResult(BaseModel):
    imported: int
    skipped_duplicates: int
    errors: int

class TransactionListResponse(BaseModel):
    items: List[TransactionOut]
    total: int
    page: int
    page_size: int


# ── Recurring ────────────────────────────────────────────────────────────────
class RecurringGroupOut(BaseModel):
    id: int
    normalized_name: str
    display_name: str
    avg_amount: Optional[float]
    period_days: Optional[int]
    category_id: Optional[int]
    category: Optional[CategoryOut]
    next_expected_date: Optional[date]
    is_active: bool
    transaction_count: int = 0
    model_config = {"from_attributes": True}

class RecurringGroupUpdate(BaseModel):
    display_name: Optional[str] = None
    category_id: Optional[int] = None
    is_active: Optional[bool] = None
    next_expected_date: Optional[date] = None


# ── Debts ────────────────────────────────────────────────────────────────────
class DebtCreate(BaseModel):
    name: str
    description: Optional[str] = None
    total_amount: float
    direction: DebtDirection
    due_date: Optional[date] = None

class DebtUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[date] = None
    is_settled: Optional[bool] = None

class DebtPaymentCreate(BaseModel):
    amount: float
    payment_date: date
    transaction_id: Optional[int] = None
    note: Optional[str] = None

class DebtPaymentOut(BaseModel):
    id: int
    amount: float
    payment_date: date
    transaction_id: Optional[int]
    note: Optional[str]
    model_config = {"from_attributes": True}

class DebtOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    total_amount: float
    direction: DebtDirection
    due_date: Optional[date]
    is_settled: bool
    paid_amount: float = 0.0
    remaining_amount: float = 0.0
    payments: List[DebtPaymentOut] = []
    model_config = {"from_attributes": True}


# ── Goals ────────────────────────────────────────────────────────────────────
class GoalCreate(BaseModel):
    name: str
    type: GoalType
    target_amount: Optional[float] = None
    target_percent: Optional[float] = None
    category: Optional[GoalCategory] = None
    deadline: Optional[date] = None

class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    target_percent: Optional[float] = None
    deadline: Optional[date] = None
    current_amount: Optional[float] = None
    is_active: Optional[bool] = None

class GoalOut(BaseModel):
    id: int
    name: str
    type: GoalType
    target_amount: Optional[float]
    target_percent: Optional[float]
    category: Optional[GoalCategory]
    deadline: Optional[date]
    current_amount: float
    is_active: bool
    progress_pct: float = 0.0
    model_config = {"from_attributes": True}

class SavingsAllocationOut(BaseModel):
    month: str
    savings_pct: float
    investment_pct: float
    expenses_pct: float
    model_config = {"from_attributes": True}

class SavingsAllocationUpdate(BaseModel):
    month: str
    savings_pct: float
    investment_pct: float
    expenses_pct: float


# ── Portfolio ─────────────────────────────────────────────────────────────────
class PortfolioPosition(BaseModel):
    symbol: str
    name: str
    asset_class: str
    shares: float
    avg_buy_price: float
    total_invested: float
    realized_pnl: float
    dividends_received: float
    current_price: Optional[float] = None
    market_value: Optional[float] = None
    unrealized_pnl: Optional[float] = None
    unrealized_pnl_pct: Optional[float] = None

class PortfolioDividend(BaseModel):
    symbol: str
    name: str
    total: float
    count: int

class PortfolioPerformance(BaseModel):
    total_invested: float
    total_realized_pnl: float
    total_fees: float
    total_dividends: float
    total_market_value: float = 0.0
    total_unrealized_pnl: float = 0.0
    positions: List[PortfolioPosition]
    dividends_by_asset: List[PortfolioDividend]


# ── Dashboard ─────────────────────────────────────────────────────────────────
class DashboardOverview(BaseModel):
    balance: float
    income_month: float
    expenses_month: float
    savings_month: float
    income_total: float
    expenses_total: float
    interest_month: float = 0.0
    interest_total: float = 0.0

class CategoryBreakdown(BaseModel):
    category_id: Optional[int]
    category_name: str
    category_color: str
    category_icon: str
    total: float
    count: int

class MonthlyTrend(BaseModel):
    month: str
    income: float
    expenses: float
    savings: float

class UpcomingRecurring(BaseModel):
    id: int
    display_name: str
    avg_amount: float
    next_expected_date: Optional[date]
    days_until: Optional[int]
    category: Optional[CategoryOut]


# ── Budgets ───────────────────────────────────────────────────────────────────
class BudgetCreate(BaseModel):
    category_id: Optional[int] = None
    amount: float
    month: Optional[str] = None   # "2024-01"; None when is_recurring=True
    is_recurring: bool = True

class BudgetUpdate(BaseModel):
    category_id: Optional[int] = None
    amount: Optional[float] = None
    month: Optional[str] = None
    is_recurring: Optional[bool] = None

class BudgetOut(BaseModel):
    id: int
    category_id: Optional[int]
    category: Optional[CategoryOut]
    amount: float
    month: Optional[str]
    is_recurring: bool
    model_config = {"from_attributes": True}

class BudgetStatus(BaseModel):
    budget_id: int
    category_id: Optional[int]
    category_name: str
    category_color: str
    category_icon: str
    budgeted: float
    spent: float
    remaining: float
    pct_used: float  # 0–100+

class MonthlyDetailRow(BaseModel):
    """Single transaction row for the monthly detail view."""
    id: int
    date: date
    name: Optional[str]
    category_id: Optional[int]
    category_name: str
    category_color: str
    category_icon: str
    amount: float
    exclude_from_stats: bool

class PricePoint(BaseModel):
    date: str
    close: float

class PriceHistory(BaseModel):
    symbol: str
    points: List[PricePoint]
