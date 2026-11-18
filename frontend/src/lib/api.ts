import { forgetQueries } from '@/lib/queryPersist'
import { parseSSE, type ChatEvent, type ChatTurn } from './chat'

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
  if (res.status === 401) {
    localStorage.removeItem('fm_token')
    localStorage.removeItem('fm-auth'); forgetQueries()
    const isAuthPage = ['/login', '/registro'].includes(window.location.pathname)
    if (!isAuthPage) {
      window.location.replace('/login')
      throw new Error('Sesión caducada. Inicia sesión de nuevo.')
    }
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Error desconocido')
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// Auth
/** Los proxys (túnel de VS Code, Vite) pueden reescribir Origin: el servidor usa este para el RP ID de las passkeys. */
const pkHeaders = () => ({ 'X-App-Origin': window.location.origin })

export const authApi = {
  register: (data: { email?: string; username: string; password: string; display_name?: string }) =>
    request<{ access_token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ access_token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<User>('/auth/me'),
  updateProfile: (data: { display_name: string | null }) =>
    request<User>('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
  changePassword: (data: { current_password: string; new_password: string }) =>
    request<{ ok: boolean }>('/auth/password', { method: 'PUT', body: JSON.stringify(data) }),
  deleteAllData: () =>
    request<{ ok: boolean }>('/auth/data', { method: 'DELETE' }),
  deleteTransactionData: () =>
    request<{ ok: boolean; transactions: number; recurring_groups: number; manual_positions: number }>(
      '/auth/data/transactions', { method: 'DELETE' }),
  deleteAccount: () =>
    request<void>('/auth/account', { method: 'DELETE' }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  listPasskeys: () => request<Passkey[]>('/auth/passkeys'),
  passkeyRegisterOptions: () => request<{ options: string }>('/auth/passkeys/register/options', { method: 'POST', headers: pkHeaders() }),
  passkeyRegister: (credential: Record<string, unknown>) =>
    request<Passkey>('/auth/passkeys/register', { method: 'POST', headers: pkHeaders(), body: JSON.stringify({ credential }) }),
  deletePasskey: (id: number) => request<{ ok: boolean }>(`/auth/passkeys/${id}`, { method: 'DELETE' }),
  passkeyLoginOptions: () => request<{ key: string; options: string }>('/auth/passkeys/login/options', { method: 'POST', headers: pkHeaders() }),
  passkeyLogin: (key: string, credential: Record<string, unknown>) =>
    request<{ access_token: string; user: User }>('/auth/passkeys/login', { method: 'POST', headers: pkHeaders(), body: JSON.stringify({ key, credential }) }),
  listSessions: () => request<AuthSession[]>('/auth/sessions'),
  closeSession: (id: number) => request<{ ok: boolean }>(`/auth/sessions/${id}`, { method: 'DELETE' }),
  closeOtherSessions: () => request<{ closed: number }>('/auth/sessions/close-others', { method: 'POST' }),
  getPreferences: () => request<unknown>('/auth/preferences'),
  updatePreferences: (patch: import('./preferences').PreferencesPatch) =>
    request<unknown>('/auth/preferences', { method: 'PUT', body: JSON.stringify(patch) }),
}

// Admin
export const adminApi = {
  listUsers: () => request<AdminUser[]>('/admin/users'),
  setActive: (userId: number, isActive: boolean) =>
    request<AdminUser>(`/admin/users/${userId}/active`, { method: 'PUT', body: JSON.stringify({ is_active: isActive }) }),
  setAi: (userId: number, aiEnabled: boolean, aiModel: string | null) =>
    request<AdminUser>(`/admin/users/${userId}/ai`, { method: 'PUT', body: JSON.stringify({ ai_enabled: aiEnabled, ai_model: aiModel }) }),
  deleteUser: (userId: number) =>
    request<{ success: boolean }>(`/admin/users/${userId}`, { method: 'DELETE' }),
  getUserUsage: (userId: number, months = 12) =>
    request<AiUsageSummary>(`/admin/users/${userId}/usage?months=${months}`),
  getStats: () => request<AdminStats>('/admin/stats'),
  getUser: (userId: number) => request<AdminUser>(`/admin/users/${userId}`),
  createUser: (data: { username: string; password: string; display_name?: string; email?: string }) =>
    request<AdminUser>('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  setAdmin: (userId: number, isAdmin: boolean) =>
    request<AdminUser>(`/admin/users/${userId}/admin`, { method: 'PUT', body: JSON.stringify({ is_admin: isAdmin }) }),
  resetPassword: (userId: number, password: string) =>
    request<{ success: boolean }>(`/admin/users/${userId}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  activity: (limit = 100) => request<ActivityEntry[]>(`/admin/activity?limit=${limit}`),
  notices: () => request<{ unread: number; items: AdminNotice[] }>('/admin/notices'),
  readNotices: () => request<{ ok: boolean }>('/admin/notices/read', { method: 'POST' }),
  deleteNotice: (id: number) => request<{ ok: boolean }>(`/admin/notices/${id}`, { method: 'DELETE' }),
  backups: () => request<BackupInfo>('/admin/backups'),
  updateBackups: (data: { enabled?: boolean; keep?: number }) =>
    request<BackupInfo>('/admin/backups', { method: 'PUT', body: JSON.stringify(data) }),
  backupNow: () => request<BackupFile>('/admin/backups', { method: 'POST' }),
  /** Descarga con el token (un enlace normal no lleva la cabecera). */
  downloadBackup: async (name: string) => {
    const res = await fetch(`${BASE}/admin/backups/${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
    if (!res.ok) throw new Error('No se pudo descargar la copia')
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}

export interface Passkey { id: number; credential_id: string; device: string | null; created_at: string; last_used_at: string | null }
export interface AuthSession { id: number; device: string; ip: string | null; created_at: string; last_seen_at: string | null; current: boolean }
export interface ActivityEntry { id: number; user_id: number | null; username: string | null; action: string; label: string; detail: string | null; created_at: string }
export interface AdminNotice { id: number; level: string; title: string; text: string | null; created_at: string; read: boolean }
export interface BackupFile { name: string; size_bytes: number; created_at: string }
export interface BackupInfo { enabled: boolean; keep: number; hour: number; keep_choices: number[]; items: BackupFile[] }

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
  get: (id: number) => request<Transaction>(`/transactions/${id}`),
  delete: (id: number) =>
    request<void>(`/transactions/${id}`, { method: 'DELETE' }),
  transfer: (data: { amount: number; date: string; from_source: string; to_source: string; note?: string }) =>
    request<Transaction[]>('/transactions/transfer', { method: 'POST', body: JSON.stringify(data) }),
  split: (id: number, parts: { category_id: number | null; amount: number }[]) =>
    request<Transaction>(`/transactions/${id}/split`, { method: 'POST', body: JSON.stringify({ parts }) }),
  importCsv: (file: File, bankFormat = 'auto', opts: { skip?: number[]; categories?: Record<number, number | null> } = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('bank_format', bankFormat)
    if (opts.skip?.length) fd.append('skip', opts.skip.join(','))
    if (opts.categories && Object.keys(opts.categories).length) fd.append('categories', JSON.stringify(opts.categories))
    return request<ImportResult>('/transactions/import', { method: 'POST', body: fd })
  },
  previewImport: (file: File, bankFormat = 'auto') => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('bank_format', bankFormat)
    return request<ImportPreview>('/transactions/import/preview', { method: 'POST', body: fd })
  },
  importHistory: () => request<ImportLog[]>('/transactions/import/history'),
  link: (transactionIds: number[]) =>
    request<Transaction>('/transactions/link', { method: 'POST', body: JSON.stringify({ transaction_ids: transactionIds }) }),
  confirm: (ids: number[]) =>
    request<{ confirmed: number }>('/transactions/confirm', { method: 'POST', body: JSON.stringify({ ids }) }),
  unlink: (linkGroupId: number) =>
    request<{ ok: boolean }>(`/transactions/link/${linkGroupId}`, { method: 'DELETE' }),
  groups: (by: TxGroupBy, params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams({ by })
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && q.set(k, String(v)))
    return request<TxGroup[]>(`/transactions/groups?${q}`)
  },
  similar: (id: number) =>
    request<{ merchant: string; count: number }>(`/transactions/${id}/similar`),
  bulkCategory: (data: { ids: number[]; category_id: number; include_same_merchant?: boolean; create_rule?: boolean }) =>
    request<BulkCategoryResult>('/transactions/bulk-category', { method: 'POST', body: JSON.stringify(data) }),
  bulkCategoryUndo: (data: { previous: PreviousCategory[]; rule_ids: number[] }) =>
    request<{ restored: number }>('/transactions/bulk-category/undo', { method: 'POST', body: JSON.stringify(data) }),
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
  monthlyInvestments: (params: { date_from: string; date_to: string }) =>
    request<MonthlyInvestmentSummary>(`/dashboard/monthly-investments?date_from=${params.date_from}&date_to=${params.date_to}`),
  pendingRecurring: (dateFrom: string, dateTo: string) =>
    request<PendingRecurring[]>(`/dashboard/pending-recurring?date_from=${dateFrom}&date_to=${dateTo}`),
  accounts: () => request<AccountBalance[]>('/dashboard/accounts'),
  /** Igual, más los orígenes que solo tienen inversiones (para filtrar movimientos). */
  txSources: () => request<AccountBalance[]>('/dashboard/accounts?with_investments=true'),
  netWorthHistory: (months = 24) =>
    request<NetWorthPoint[]>(`/dashboard/net-worth-history?months=${months}`),
  insights: () =>
    request<Insight[]>('/dashboard/insights'),
  markInsightRead: (id: number) =>
    request<{ ok: boolean }>(`/dashboard/insights/${id}/read`, { method: 'PATCH' }),
  refreshInsights: () =>
    request<{ ok: boolean }>('/dashboard/insights/refresh', { method: 'POST' }),
}

// Categories
export const catApi = {
  list: () => request<Category[]>('/categories'),
  create: (data: Partial<Category>) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Category>) =>
    request<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) =>
    request<{ ok: boolean; moved: number; rules_deleted: number }>(`/categories/${id}`, { method: 'DELETE' }),
  usage: () => request<Record<string, number>>('/categories/usage'),
  listRules: () => request<CategoryRule[]>('/categories/rules'),
  createRule: (data: Partial<CategoryRule>) =>
    request<CategoryRule>('/categories/rules', { method: 'POST', body: JSON.stringify(data) }),
  updateRule: (id: number, data: Partial<CategoryRule>) =>
    request<CategoryRule>(`/categories/rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  previewRule: (params: { keyword: string; field: string; category_id?: number }) => {
    const q = new URLSearchParams({ keyword: params.keyword, field: params.field })
    if (params.category_id) q.set('category_id', String(params.category_id))
    return request<{ matches: number; applicable: number; samples: string[] }>(`/categories/rules/preview?${q}`)
  },
  applyRule: (id: number) => request<{ updated: number }>(`/categories/rules/${id}/apply`, { method: 'POST' }),
  deleteRule: (id: number) => request<void>(`/categories/rules/${id}`, { method: 'DELETE' }),
}

// Recurring
export const recurringApi = {
  list: () => request<RecurringGroup[]>('/recurring'),
  detect: () => request<void>('/recurring/detect', { method: 'POST' }),
  createFromTx: (data: { transaction_id: number; display_name: string; period_days: number }) =>
    request<RecurringGroup>('/recurring/from-transaction', { method: 'POST', body: JSON.stringify(data) }),
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
  livePerformance: () => request<PortfolioPerformance>('/portfolio/live'),
  estimateShares: () => request<{ estimated: number; skipped: number }>('/portfolio/estimate-shares', { method: 'POST' }),
  fixTickers: () => request<{ isins_found: number; isins_not_found: number; names_fixed: number; shares_estimated: number; shares_skipped: number }>('/portfolio/fix-tickers', { method: 'POST' }),
  history: (params?: Record<string, string | number>) => {
    const q = new URLSearchParams()
    Object.entries(params || {}).forEach(([k, v]) => q.set(k, String(v)))
    return request<TransactionListResponse>(`/portfolio/history?${q}`)
  },
  priceHistory: (symbols: string[], period = '1y') =>
    request<PriceHistory[]>(`/portfolio/price-history?symbols=${encodeURIComponent(symbols.join(','))}&period=${period}`),
  searchStocks: (q: string) =>
    request<StockSearchResult[]>(`/portfolio/search?q=${encodeURIComponent(q)}`),
  manualPositions: () => request<ManualPosition[]>('/portfolio/manual-positions'),
  addManualPosition: (data: Omit<ManualPosition, 'id' | 'created_at'>) =>
    request<ManualPosition>('/portfolio/manual-positions', { method: 'POST', body: JSON.stringify(data) }),
  updateManualPosition: (id: number, data: { shares?: number; avg_price_eur?: number }) =>
    request<ManualPosition>(`/portfolio/manual-positions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteManualPosition: (id: number) =>
    request<void>(`/portfolio/manual-positions/${id}`, { method: 'DELETE' }),
  /** Tipo de activo elegido a mano; null vuelve al automático. */
  setAssetType: (symbol: string, asset_class: string | null) =>
    request<{ symbol: string; asset_class: string | null }>('/portfolio/asset-type', { method: 'PUT', body: JSON.stringify({ symbol, asset_class }) }),
}

// Budgets
export const budgetApi = {
  list: () => request<Budget[]>('/budgets'),
  create: (data: Partial<Budget>) =>
    request<Budget>('/budgets', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Budget>) =>
    request<Budget>(`/budgets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/budgets/${id}`, { method: 'DELETE' }),
  status: (month?: string, dateFrom?: string, dateTo?: string) => {
    const q = new URLSearchParams()
    if (dateFrom && dateTo) { q.set('date_from', dateFrom); q.set('date_to', dateTo) }
    else if (month) q.set('month', month)
    const qs = q.toString()
    return request<BudgetStatus[]>(`/budgets/status${qs ? '?' + qs : ''}`)
  },
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User { id: number; email: string; username: string; display_name?: string | null; created_at: string; is_admin: boolean; ai_enabled: boolean; ai_model: string | null }
export interface AdminUser extends User { is_active: boolean; last_login_at?: string | null; tx_count?: number; account_count?: number }
export interface Category { id: number; user_id: number | null; name: string; icon: string; color: string; type: string; is_system: boolean }
export interface CategoryRule { id: number; keyword: string; category_id: number; field: string; priority: number; category: Category }
export interface Transaction {
  id: number; external_id: string | null; date: string; datetime: string | null
  type: string; account_category: string | null; asset_class: string | null
  name: string | null; symbol: string | null; shares: number | null; price: number | null
  amount: number; fee: number | null; tax: number | null; currency: string
  description: string | null; counterparty_name: string | null; mcc_code: string | null
  category_id: number | null; category: Category | null
  is_auto_categorized: boolean; is_ai_categorized: boolean; is_internal_transfer: boolean; exclude_from_stats: boolean; is_pending: boolean; recurring_group_id: number | null
  link_group_id: number | null; is_link_primary: boolean; effective_amount: number | null; linked_transactions: Transaction[] | null
  source?: string | null
  note?: string | null; split_parent_id?: number | null; split_count?: number; is_manual?: boolean | null; split_parts?: { category_id: number | null; amount: number }[] | null
  created_at?: string | null
}
export type TxGroupBy = 'category' | 'merchant' | 'account' | 'day' | 'month'
export interface TxGroup { key: string; label: string; income: number; expense: number; count: number; icon: string | null; color: string | null; category_name?: string | null }
export interface PreviousCategory { id: number; category_id: number | null; is_auto_categorized: boolean; is_ai_categorized?: boolean }
export interface BulkCategoryResult { updated: number; previous: PreviousCategory[]; rule_ids: number[] }
export interface TransactionListResponse { items: Transaction[]; total: number; page: number; page_size: number; income_sum: number; expense_sum: number }
export interface ImportResult { imported: number; skipped_duplicates: number; errors: number; updated?: number; detected_bank?: string }
export interface ImportPreviewRow { date: string | null; type: string; name: string | null; symbol: string | null; shares: number | null; amount: number; currency: string; will_update?: boolean }
export interface ImportReviewRow extends ImportPreviewRow { key: number; status: 'new' | 'duplicate' | 'update'; category_id: number | null; is_internal_transfer: boolean }
export interface ImportLog { id: number; filename: string | null; source: string | null; imported: number; skipped: number; errors: number; created_at: string | null }
export interface ImportPreview {
  detected_bank: string
  bank_label: string | null
  total: number
  new: ImportPreviewRow[]
  duplicates: ImportPreviewRow[]
  rows?: ImportReviewRow[]
  errors: string[]
  skipped: string[]
}
export interface AmountOption { amount: number; count: number; last_date: string }
export interface RecurringGroup { id: number; normalized_name: string; display_name: string; avg_amount: number | null; amount_is_manual: boolean; period_days: number | null; category_id: number | null; category: Category | null; next_expected_date: string | null; is_active: boolean; is_dismissed?: boolean | null; transaction_count: number; amount_options: AmountOption[] }
export interface Debt { id: number; name: string; description: string | null; total_amount: number; direction: 'I_OWE' | 'OWED_TO_ME'; due_date: string | null; is_settled: boolean; paid_amount: number; remaining_amount: number; payments: DebtPayment[] }
export interface DebtPayment { id: number; amount: number; payment_date: string; transaction_id: number | null; note: string | null }
export interface Goal { id: number; name: string; type: 'PERCENT' | 'EURO_TARGET'; target_amount: number | null; target_percent: number | null; category: string | null; deadline: string | null; current_amount: number; is_active: boolean; progress_pct: number }
export interface SavingsAllocation { month: string; savings_pct: number; investment_pct: number; expenses_pct: number }
export interface DashboardOverview { balance: number; income_month: number; expenses_month: number; savings_month: number; income_total: number; expenses_total: number; interest_month: number; interest_total: number }
export interface CategoryBreakdown { category_id: number | null; category_name: string; category_color: string; category_icon: string; total: number; count: number }
export interface MonthlyTrend { month: string; income: number; expenses: number; savings: number }
export interface UpcomingRecurring { id: number; display_name: string; avg_amount: number; next_expected_date: string | null; days_until: number | null; category: Category | null }
export interface PendingRecurring { group_id: number; display_name: string; avg_amount: number; category_name: string; category_color: string; category_icon: string; next_expected_date: string | null }
export interface TradeEvent { date: string; shares: number; price_eur: number; total_eur: number }
export interface PortfolioPosition { symbol: string; name: string; asset_class: string; shares: number; avg_buy_price: number; total_invested: number; realized_pnl: number; dividends_received: number; first_purchase_date: string | null; buy_dates: string[]; sell_dates: string[]; buy_events: TradeEvent[]; sell_events: TradeEvent[]; current_price: number | null; market_value: number | null; unrealized_pnl: number | null; unrealized_pnl_pct: number | null; is_manual?: boolean; manual_id?: number | null; broker?: string | null; asset_class_auto?: string | null; asset_class_manual?: boolean }
export interface StockSearchResult { ticker: string; name: string; exchange: string; currency: string; type_disp: string }
export interface ManualPosition { id: number; ticker: string; name: string; shares: number; avg_price_eur: number; currency: string; created_at: string }
export interface PortfolioPerformance { total_invested: number; total_realized_pnl: number; total_fees: number; total_dividends: number; total_market_value: number; total_unrealized_pnl: number; positions: PortfolioPosition[]; dividends_by_asset: { symbol: string; name: string; total: number; count: number }[] }
export interface PricePoint { date: string; close: number }
export interface PriceHistory { symbol: string; points: PricePoint[] }
export interface Budget { id: number; category_id: number | null; category: Category | null; amount: number; month: string | null; is_recurring: boolean }
export interface BudgetStatus { budget_id: number; category_id: number | null; category_name: string; category_color: string; category_icon: string; budgeted: number; spent: number; remaining: number; pct_used: number }
export interface MonthlyDetailRow { id: number; date: string; name: string | null; category_id: number | null; category_name: string; category_color: string; category_icon: string; amount: number; exclude_from_stats: boolean; recurring_group_id: number | null }
export interface MonthlyInvestmentSummary { invested: number; count: number }
export interface AccountBalance { source: string; label: string; balance: number; count: number; last_date: string | null; tx_count?: number }
export interface NetWorthPoint { month: string; cash: number; portfolio: number; debt: number; net_worth: number }
export interface Insight { id: number; type: string; title: string; message: string; severity: string; is_read: boolean; created_at: string }
export interface Webhook { id: number; url: string; events: string[]; is_active: boolean; created_at: string }
export interface ApiToken { id: number; name: string; token_prefix: string; created_at: string; last_used_at: string | null }
export interface ApiTokenCreated { id: number; name: string; token: string; created_at: string }
// 'app' = confirmar en la app de Trade Republic; 'authenticator' = código de la app de autenticación
export type TRLoginMethod = 'app' | 'authenticator'
export interface TRStatus {
  connected: boolean
  needs_2fa: boolean
  login_method: TRLoginMethod | null
  login_error: string | null
  last_sync: string | null
}
export interface TRPosition {
  instrumentId: string
  netSize: string
  averageBuyIn: string | null
  purchaseValue: string | null
  currentValue: string | null
  returnOnEquity: string | null
  returnOnEquityPercentage: string | null
  name?: string
}
export interface TRPortfolioRaw {
  positions: TRPosition[]
  cash?: { currencyId: string; amount: string }
  totalValue?: string
}

// Webhooks
export const webhookApi = {
  list: () => request<Webhook[]>('/webhooks'),
  create: (data: { url: string; events: string[] }) =>
    request<Webhook>('/webhooks', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: number) => request<void>(`/webhooks/${id}`, { method: 'DELETE' }),
  toggle: (id: number) => request<{ is_active: boolean }>(`/webhooks/${id}/toggle`, { method: 'PATCH' }),
}

// Tokens de API de larga duración (p.ej. para un Atajo de iOS)
export const integrationsApi = {
  list: () => request<ApiToken[]>('/integrations/tokens'),
  create: (name: string) =>
    request<ApiTokenCreated>('/integrations/tokens', { method: 'POST', body: JSON.stringify({ name }) }),
  delete: (id: number) => request<void>(`/integrations/tokens/${id}`, { method: 'DELETE' }),
}

// Trade Republic
export const trApi = {
  status: () => request<TRStatus>('/tr/status'),
  autoConnect: () => request<{ status: string; message?: string; method?: TRLoginMethod }>('/tr/auto-connect', { method: 'POST' }),
  connect: (phone: string, pin: string) =>
    request<{ status: string; method?: TRLoginMethod }>('/tr/connect', { method: 'POST', body: JSON.stringify({ phone, pin }) }),
  verify: (code: string) =>
    request<{ ok: boolean }>('/tr/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  sync: () => request<{ synced: number; updated: number; skipped: number; errors: number; total_events: number }>('/tr/sync'),
  dedupe: () => request<{ deleted: number }>('/tr/dedupe', { method: 'POST' }),
  fixUnknown: () => request<{ deleted: number }>('/tr/fix-unknown', { method: 'POST' }),
  fixSecurities: () => request<{ fixed: number }>('/tr/fix-securities', { method: 'POST' }),
  fixShares: () => request<{ fixed: number; total: number }>('/tr/fix-shares', { method: 'POST' }),
  fixTickers: () => request<{ resolved: number; skipped: number; total: number }>('/tr/fix-tickers', { method: 'POST' }),
  fixCancelled: () => request<{ deleted: number }>('/tr/fix-cancelled', { method: 'POST' }),
  debugSkipped: () => request<{
    total_events_from_tr: number
    already_in_db: number
    would_import: number
    skipped_cancelled: Array<{ id: string; date: string; title: string; subtitle: string; amount: number; eventType: string }>
    skipped_other: Array<{ id: string; date: string; title: string; subtitle: string; amount: number; eventType: string }>
    total_skipped_cash_impact: number
  }>('/tr/debug-skipped'),
  debugBalance: () => request<{
    tr_timeline_sum: number
    db_sum: number
    db_vs_tr_diff: number
    tr_total_events: number
    tr_mapped_events: number
    tr_skipped_cancelled: number
    tr_skipped_zero_amount: number
    tr_unmapped_nonzero: Array<{ id: string; amount: number; eventType: string; subtitle: string }>
    orphan_db_rows: Array<{ external_id: string; date: string; name: string; amount: number; type: string }>
    orphan_sum: number
    missing_from_db: Array<{ id: string; amount: number }>
    amount_mismatches: Array<{ external_id: string; tr_amount: number; db_amount: number; diff: number; name: string; date: string }>
    mismatch_sum: number
  }>('/tr/debug-balance'),
  fixOrphans: () => request<{
    deleted_cancelled: Array<{ id: number; name: string; amount: number; external_id: string }>
    deleted_orphan: Array<{ id: number; name: string; amount: number; date: string; external_id: string }>
    total_deleted: number
  }>('/tr/fix-orphans', { method: 'POST' }),
  importMissing: () => request<{
    imported: number
    skipped_integrity: number
    details: Array<{ external_id: string; name: string; date: string; amount: number; type: string }>
  }>('/tr/import-missing', { method: 'POST' }),
  livePositions: () => request<{ portfolio: TRPortfolioRaw; compact: unknown }>('/tr/live-positions'),
  disconnect: () => request<{ ok: boolean }>('/tr/disconnect', { method: 'POST' }),
}

// AI
export const aiApi = {
  categorizeBatch: (transaction_ids: number[]) =>
    request<{ results: AiCategorizeResult[]; total: number }>('/ai/categorize-batch', {
      method: 'POST',
      body: JSON.stringify({ transaction_ids }),
    }),
  listModels: () =>
    request<{ models: AiModel[]; default: string }>('/ai/models'),
  getUsage: (months = 12) =>
    request<AiUsageSummary>(`/ai/usage?months=${months}`),
  /** Conversación con el asistente (SSE). Llama a `onEvent` por cada evento. */
  chat: async (body: { message: string; history: ChatTurn[] }, onEvent: (e: ChatEvent) => void, signal?: AbortSignal) => {
    const token = getToken()
    const res = await fetch(`${BASE}/ai/chat`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    })
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || 'No se pudo contactar con el asistente')
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      const parsed = parseSSE(buf + dec.decode(value, { stream: true }))
      buf = parsed.rest
      for (const ev of parsed.events) { onEvent(ev); if (ev.type === 'done') return }
    }
  },
}

export interface AiModel {
  id: string
  name: string
}

export interface AiCategorizeResult {
  id: number
  category_id?: number
  category_name?: string
  category_icon?: string
  category_color?: string
  error?: string
}

export interface AiUsageMonth {
  month: string
  requests: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  estimated_cost: number
}
export interface AdminGlobalAiUsageMonth {
  month: string
  requests: number
  total_tokens: number
  estimated_cost: number
}
export interface AdminGlobalAiUsage {
  months: AdminGlobalAiUsageMonth[]
  total_requests: number
  total_tokens: number
  total_estimated_cost: number
  cost_per_1k_tokens: number
}
export interface AdminSignupMonth {
  month: string
  count: number
}
export interface AdminStats {
  total_users: number
  active_users: number
  closed_users: number
  admin_users: number
  ai_enabled_users: number
  connected_bank_users: number
  total_transactions: number
  users_with_debts: number
  users_with_goals: number
  users_with_recurring: number
  users_with_budgets: number
  signups_by_month: AdminSignupMonth[]
  ai_usage: AdminGlobalAiUsage
  db_size_bytes?: number
  uptime_seconds?: number
  unread_notices?: number
  backups?: { enabled: boolean; keep: number; hour: number; last: BackupFile | null }
}
export interface AiUsageSummary {
  months: AiUsageMonth[]
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_tokens: number
  total_estimated_cost: number
  cost_per_1k_tokens: number
}

// MyInvestor
export interface MIStatus { connected: boolean; last_sync: string | null }
export interface MICheckingAccount {
  id: number
  iban?: string
  alias?: string
  saldoDisponible?: number
  saldoContable?: number
  [key: string]: unknown
}
export interface MISavingsAccount {
  id: number
  alias?: string
  isin?: string
  nombreFondo?: string
  valorLiquidativo?: number
  participaciones?: number
  valorTotal?: number
  rentabilidadTotal?: number
  rentabilidadTotalPorcentaje?: number
  [key: string]: unknown
}

export const miApi = {
  status: () => request<MIStatus>('/mi/status'),
  autoConnect: () => request<{ status: string; request_id?: string; message?: string }>('/mi/auto-connect', { method: 'POST' }),
  connect: (username: string, password: string) =>
    request<{ status: string; request_id?: string }>('/mi/connect', { method: 'POST', body: JSON.stringify({ username, password }) }),
  verify: (request_id: string, code: string) =>
    request<{ status: string }>('/mi/verify', { method: 'POST', body: JSON.stringify({ request_id, code }) }),
  accounts: () => request<{ checking: MICheckingAccount[]; savings: MISavingsAccount[] }>('/mi/accounts'),
  portfolioHistory: (period = 'DESDE_INICIO') => request<unknown[]>(`/mi/portfolio-history?period=${period}`),
  disconnect: () => request<{ ok: boolean }>('/mi/disconnect', { method: 'POST' }),
}

// Exportación de datos
export type ExportFormat = 'xlsx' | 'csv' | 'json' | 'ofx'
export type ExportPeriod = 'all' | 'month' | 'year' | 'range'
export type ExportSectionKey =
  | 'transactions' | 'banks' | 'monthly' | 'categories_by_month'
  | 'portfolio' | 'budgets' | 'recurring' | 'debts' | 'goals' | 'categories' | 'rules'

export interface ExportMonth {
  month: string
  label: string
  count: number
  income: number
  expenses: number
}
export interface ExportBank {
  key: string
  label: string
  count: number
  first_date: string | null
  last_date: string | null
}
export interface ExportSummary {
  first_date: string | null
  last_date: string | null
  months: ExportMonth[]
  banks: ExportBank[]
  years: number[]
  counts: Record<string, number>
}
export interface ExportParams {
  format: ExportFormat
  period?: ExportPeriod
  month?: string
  year?: number
  date_from?: string
  date_to?: string
  sections?: ExportSectionKey[]
  banks?: string[]
  split?: boolean
  split_bank?: boolean
}

function exportQuery(p: ExportParams): string {
  const q = new URLSearchParams({ format: p.format, period: p.period ?? 'all' })
  if (p.month) q.set('month', p.month)
  if (p.year) q.set('year', String(p.year))
  if (p.date_from) q.set('date_from', p.date_from)
  if (p.date_to) q.set('date_to', p.date_to)
  if (p.sections?.length) q.set('sections', p.sections.join(','))
  if (p.banks?.length) q.set('banks', p.banks.join(','))
  if (p.split) q.set('split', 'true')
  if (p.split_bank) q.set('split_bank', 'true')
  return q.toString()
}

function filenameFrom(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (star) {
    try { return decodeURIComponent(star[1].trim()) } catch { /* sigue con filename= */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  return plain ? plain[1].trim() : fallback
}

/** Pide el archivo al backend y devuelve el blob con el nombre que propone. */
async function fetchExport(p: ExportParams): Promise<{ blob: Blob; filename: string }> {
  const token = getToken()
  const res = await fetch(`${BASE}/export?${exportQuery(p)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (res.status === 401) {
    localStorage.removeItem('fm_token')
    localStorage.removeItem('fm-auth'); forgetQueries()
    window.location.replace('/login')
    throw new Error('Sesión caducada. Inicia sesión de nuevo.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'No se pudo exportar')
  }
  const blob = await res.blob()
  return { blob, filename: filenameFrom(res.headers.get('Content-Disposition'), `financemaster.${p.format}`) }
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const exportApi = {
  summary: () => request<ExportSummary>('/export/summary'),
  fetch: fetchExport,
  /** Descarga directa; devuelve el nombre del archivo guardado. */
  download: async (p: ExportParams): Promise<string> => {
    const { blob, filename } = await fetchExport(p)
    saveBlob(blob, filename)
    return filename
  },
}

// Copia completa de la cuenta (para llevarla a otra instalación)
export type BackupCounts = Record<string, number>
export interface BackupPreview {
  exported_at: string | null
  user: { username?: string; email?: string; created_at?: string | null }
  counts: BackupCounts
  labels: Record<string, string>
  first_date: string | null
  last_date: string | null
  sources: Record<string, number>
  current: BackupCounts
}

function backupForm(file: File): FormData {
  const fd = new FormData()
  fd.append('file', file)
  return fd
}

export const accountApi = {
  backupSummary: () => request<{ counts: BackupCounts; labels: Record<string, string> }>('/account/backup/summary'),
  /** Descarga la copia; devuelve el nombre del archivo guardado. */
  downloadBackup: async (): Promise<string> => {
    const token = getToken()
    const res = await fetch(`${BASE}/account/backup`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (res.status === 401) {
      localStorage.removeItem('fm_token')
      localStorage.removeItem('fm-auth'); forgetQueries()
      window.location.replace('/login')
      throw new Error('Sesión caducada. Inicia sesión de nuevo.')
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || 'No se pudo descargar la copia')
    }
    const filename = filenameFrom(res.headers.get('Content-Disposition'), 'financemaster-cuenta.json')
    saveBlob(await res.blob(), filename)
    return filename
  },
  previewRestore: (file: File) =>
    request<BackupPreview>('/account/restore/preview', { method: 'POST', body: backupForm(file) }),
  restore: (file: File) =>
    request<{ ok: boolean; restored: BackupCounts }>('/account/restore', { method: 'POST', body: backupForm(file) }),
}

// API token
