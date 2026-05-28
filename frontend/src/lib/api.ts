const BASE = '/api'

function getToken(): string | null {
  return localStorage.getItem('fm_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Error desconocido')
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// Auth
export const authApi = {
  register: (data: { email: string; username: string; password: string }) =>
    request<{ access_token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ access_token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<User>('/auth/me'),
  changePassword: (data: { current_password: string; new_password: string }) =>
    request<{ ok: boolean }>('/auth/password', { method: 'PUT', body: JSON.stringify(data) }),
  deleteAllData: () =>
    request<{ ok: boolean }>('/auth/data', { method: 'DELETE' }),
}

// Transactions
export const txApi = {
  list: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
    return request<TransactionListResponse>(`/transactions?${q}`)
  },
  create: (data: Partial<Transaction>) =>
    request<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Transaction>) =>
    request<Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<void>(`/transactions/${id}`, { method: 'DELETE' }),
  importCsv: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return request<ImportResult>('/transactions/import', { method: 'POST', body: fd })
  },
}

// Dashboard
export const dashApi = {
  overview: (year?: number, month?: number) => {
    const q = new URLSearchParams()
    if (year) q.set('year', String(year))
    if (month) q.set('month', String(month))
    return request<DashboardOverview>(`/dashboard/overview?${q}`)
  },
  byCategory: (params?: { date_from?: string; date_to?: string; tx_type?: string }) => {
    const q = new URLSearchParams(params as Record<string, string>)
    return request<CategoryBreakdown[]>(`/dashboard/by-category?${q}`)
  },
  monthlyTrend: (months = 12) =>
    request<MonthlyTrend[]>(`/dashboard/monthly-trend?months=${months}`),
  upcoming: (days = 30) =>
    request<UpcomingRecurring[]>(`/dashboard/upcoming?days=${days}`),
  monthlyDetail: (params: { year?: number; month?: number; date_from?: string; date_to?: string }) => {
    const q = new URLSearchParams()
    if (params.year)      q.set('year',      String(params.year))
    if (params.month)     q.set('month',     String(params.month))
    if (params.date_from) q.set('date_from', params.date_from)
    if (params.date_to)   q.set('date_to',   params.date_to)
    return request<MonthlyDetailRow[]>(`/dashboard/monthly-detail?${q}`)
  },
}

// Categories
export const catApi = {
  list: () => request<Category[]>('/categories'),
  create: (data: Partial<Category>) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Category>) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/categories/${id}`, { method: 'DELETE' }),
  listRules: () => request<CategoryRule[]>('/categories/rules'),
  createRule: (data: Partial<CategoryRule>) =>
    request<CategoryRule>('/categories/rules', { method: 'POST', body: JSON.stringify(data) }),
  deleteRule: (id: number) => request<void>(`/categories/rules/${id}`, { method: 'DELETE' }),
}

// Recurring
export const recurringApi = {
  list: () => request<RecurringGroup[]>('/recurring'),
  detect: () => request<void>('/recurring/detect', { method: 'POST' }),
  update: (id: number, data: Partial<RecurringGroup>) =>
    request<RecurringGroup>(`/recurring/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/recurring/${id}`, { method: 'DELETE' }),
}

// Debts
export const debtApi = {
  list: () => request<Debt[]>('/debts'),
  create: (data: Partial<Debt>) =>
    request<Debt>('/debts', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Debt>) =>
    request<Debt>(`/debts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/debts/${id}`, { method: 'DELETE' }),
  addPayment: (debtId: number, data: Partial<DebtPayment>) =>
    request<DebtPayment>(`/debts/${debtId}/payments`, { method: 'POST', body: JSON.stringify(data) }),
  deletePayment: (debtId: number, paymentId: number) =>
    request<void>(`/debts/${debtId}/payments/${paymentId}`, { method: 'DELETE' }),
}

// Goals
export const goalApi = {
  list: () => request<Goal[]>('/goals'),
  create: (data: Partial<Goal>) =>
    request<Goal>('/goals', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Goal>) =>
    request<Goal>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/goals/${id}`, { method: 'DELETE' }),
  getAllocation: (month?: string) => {
    const q = month ? `?month=${month}` : ''
    return request<SavingsAllocation>(`/goals/allocation${q}`)
  },
  upsertAllocation: (data: SavingsAllocation) =>
    request<SavingsAllocation>('/goals/allocation', { method: 'PUT', body: JSON.stringify(data) }),
}

// Portfolio
export const portfolioApi = {
  performance: () => request<PortfolioPerformance>('/portfolio/performance'),
  history: (params?: Record<string, string | number>) => {
    const q = new URLSearchParams()
    Object.entries(params || {}).forEach(([k, v]) => q.set(k, String(v)))
    return request<TransactionListResponse>(`/portfolio/history?${q}`)
  },
  priceHistory: (symbols: string[], period = '1y') =>
    request<PriceHistory[]>(`/portfolio/price-history?symbols=${symbols.join(',')}&period=${period}`),
}

// Budgets
export const budgetApi = {
  list: () => request<Budget[]>('/budgets'),
  create: (data: Partial<Budget>) =>
    request<Budget>('/budgets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Budget>) =>
    request<Budget>(`/budgets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/budgets/${id}`, { method: 'DELETE' }),
  status: (month?: string) => {
    const q = month ? `?month=${month}` : ''
    return request<BudgetStatus[]>(`/budgets/status${q}`)
  },
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User { id: number; email: string; username: string; created_at: string }
export interface Category { id: number; user_id: number | null; name: string; icon: string; color: string; type: string; is_system: boolean }
export interface CategoryRule { id: number; keyword: string; category_id: number; field: string; priority: number; category: Category }
export interface Transaction {
  id: number; external_id: string | null; date: string; datetime: string | null
  type: string; account_category: string | null; asset_class: string | null
  name: string | null; symbol: string | null; shares: number | null; price: number | null
  amount: number; fee: number | null; tax: number | null; currency: string
  description: string | null; counterparty_name: string | null; mcc_code: string | null
  category_id: number | null; category: Category | null
  is_auto_categorized: boolean; is_internal_transfer: boolean; exclude_from_stats: boolean; recurring_group_id: number | null
}
export interface TransactionListResponse { items: Transaction[]; total: number; page: number; page_size: number; income_sum: number; expense_sum: number }
export interface ImportResult { imported: number; skipped_duplicates: number; errors: number }
export interface RecurringGroup { id: number; normalized_name: string; display_name: string; avg_amount: number | null; period_days: number | null; category_id: number | null; category: Category | null; next_expected_date: string | null; is_active: boolean; transaction_count: number }
export interface Debt { id: number; name: string; description: string | null; total_amount: number; direction: 'I_OWE' | 'OWED_TO_ME'; due_date: string | null; is_settled: boolean; paid_amount: number; remaining_amount: number; payments: DebtPayment[] }
export interface DebtPayment { id: number; amount: number; payment_date: string; transaction_id: number | null; note: string | null }
export interface Goal { id: number; name: string; type: 'PERCENT' | 'EURO_TARGET'; target_amount: number | null; target_percent: number | null; category: string | null; deadline: string | null; current_amount: number; is_active: boolean; progress_pct: number }
export interface SavingsAllocation { month: string; savings_pct: number; investment_pct: number; expenses_pct: number }
export interface DashboardOverview { balance: number; income_month: number; expenses_month: number; savings_month: number; income_total: number; expenses_total: number; interest_month: number; interest_total: number }
export interface CategoryBreakdown { category_id: number | null; category_name: string; category_color: string; category_icon: string; total: number; count: number }
export interface MonthlyTrend { month: string; income: number; expenses: number; savings: number }
export interface UpcomingRecurring { id: number; display_name: string; avg_amount: number; next_expected_date: string | null; days_until: number | null; category: Category | null }
export interface PortfolioPosition { symbol: string; name: string; asset_class: string; shares: number; avg_buy_price: number; total_invested: number; realized_pnl: number; dividends_received: number; current_price: number | null; market_value: number | null; unrealized_pnl: number | null; unrealized_pnl_pct: number | null }
export interface PortfolioPerformance { total_invested: number; total_realized_pnl: number; total_fees: number; total_dividends: number; total_market_value: number; total_unrealized_pnl: number; positions: PortfolioPosition[]; dividends_by_asset: { symbol: string; name: string; total: number; count: number }[] }
export interface PricePoint { date: string; close: number }
export interface PriceHistory { symbol: string; points: PricePoint[] }
export interface Budget { id: number; category_id: number | null; category: Category | null; amount: number; month: string | null; is_recurring: boolean }
export interface BudgetStatus { budget_id: number; category_id: number | null; category_name: string; category_color: string; category_icon: string; budgeted: number; spent: number; remaining: number; pct_used: number }
export interface MonthlyDetailRow { id: number; date: string; name: string | null; category_id: number | null; category_name: string; category_color: string; category_icon: string; amount: number; exclude_from_stats: boolean }
