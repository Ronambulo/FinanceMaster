import os
import json
import asyncio
import time
from datetime import date, datetime, timedelta
from typing import List, Optional, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from pydantic import BaseModel

from .. import models, auth
from ..database import get_db

router = APIRouter(prefix="/api/ai", tags=["ai"])

INCOME_TYPES = {
    "CUSTOMER_INPAYMENT", "TRANSFER_INSTANT_INBOUND", "TRANSFER_INBOUND",
    "INTEREST_PAYMENT", "DIVIDEND", "STOCKPERK",
}
EXPENSE_TYPES = {
    "CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL",
    "TRANSFER_INSTANT_OUTBOUND", "TRANSFER_OUTBOUND",
}

# ── Provider configuration ─────────────────────────────────────────────────────
# Chat providers: tried in order until one succeeds. Primary uses reasoning model.
CHAT_PROVIDERS = [
    {
        "name": "nvidia",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "api_key_env": "NVIDIA_API_KEY",
        "model": "deepseek-ai/deepseek-v4-pro",
        "supports_thinking": True,
        "rpm": 40,
    },
    {
        "name": "groq",
        "base_url": "https://api.groq.com/openai/v1",
        "api_key_env": "GROQ_API_KEY",
        "model": "llama-3.3-70b-versatile",
        "supports_thinking": False,
        "rpm": 30,
    },
    {
        "name": "gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key_env": "GEMINI_API_KEY",
        "model": "gemini-2.0-flash",
        "supports_thinking": False,
        "rpm": 15,
    },
]

# Fast providers for single-shot categorization (no reasoning needed)
FAST_PROVIDERS = [
    {
        "name": "groq",
        "base_url": "https://api.groq.com/openai/v1",
        "api_key_env": "GROQ_API_KEY",
        "model": "llama-3.1-8b-instant",
        "rpm": 30,
    },
    {
        "name": "nvidia",
        "base_url": "https://integrate.api.nvidia.com/v1",
        "api_key_env": "NVIDIA_API_KEY",
        "model": "nvidia/llama-3.1-nemotron-70b-instruct",
        "rpm": 40,
    },
    {
        "name": "gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "api_key_env": "GEMINI_API_KEY",
        "model": "gemini-2.0-flash",
        "rpm": 15,
    },
]

# Exponential backoff delays in seconds for rate-limit retries within one provider
_BACKOFF = [1, 2, 4]


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    thinking_level: Optional[str] = "high"


class CategorizeBatchRequest(BaseModel):
    transaction_ids: List[int]


# ---------------------------------------------------------------------------
# Tool definitions — OpenAI function-calling format
# ---------------------------------------------------------------------------
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_transactions",
            "description": (
                "Recupera transacciones del usuario con filtros opcionales. "
                "Útil para buscar gastos específicos, ingresos o transacciones de un período."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date_from": {"type": "string", "description": "Fecha inicio en formato YYYY-MM-DD (opcional)"},
                    "date_to":   {"type": "string", "description": "Fecha fin en formato YYYY-MM-DD (opcional)"},
                    "category_name": {"type": "string", "description": "Nombre de categoría para filtrar (opcional, búsqueda parcial)"},
                    "limit": {"type": "integer", "description": "Número máximo de transacciones a devolver (por defecto 20, máx 100)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_category_breakdown",
            "description": (
                "Devuelve el desglose de gastos por categoría para un mes específico. "
                "Útil para analizar en qué se ha gastado más dinero."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {"type": "string", "description": "Mes en formato YYYY-MM (ej: 2024-01). Si no se proporciona, usa el mes actual."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_monthly_trend",
            "description": (
                "Devuelve la tendencia de ingresos y gastos de los últimos N meses. "
                "Útil para ver la evolución financiera a lo largo del tiempo."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "months": {"type": "integer", "description": "Número de meses hacia atrás a analizar (por defecto 6, máx 24)"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_portfolio_performance",
            "description": (
                "Devuelve el rendimiento actual del portfolio de inversiones: "
                "posiciones abiertas, PnL realizado y no realizado, dividendos y comisiones."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": (
                "Busca información en internet usando DuckDuckGo. "
                "Útil para noticias de mercados, análisis de empresas, tipos de interés, "
                "macroeconomía, criptomonedas o cualquier información financiera actualizada."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Consulta de búsqueda en español o inglés",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Número de resultados (por defecto 5, máx 10)",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_stock_quote",
            "description": (
                "Obtiene datos en tiempo real de una acción, ETF o índice: precio actual, "
                "variación diaria, capitalización, PER, dividendo, 52-week high/low y más. "
                "Usa el ticker de Yahoo Finance (ej: AAPL, MSFT, SAN.MC, BTC-USD, VOO)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {
                        "type": "string",
                        "description": "Símbolo del ticker en Yahoo Finance (ej: AAPL, SAN.MC, BTC-USD)",
                    },
                },
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_categories",
            "description": (
                "Devuelve todas las categorías disponibles del usuario (nombre, icono, id, tipo). "
                "Úsalo antes de categorize_transaction para saber qué categorías existen."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "categorize_transaction",
            "description": (
                "Cambia la categoría de una transacción específica. "
                "Usa get_transactions primero para obtener el id de la transacción "
                "y get_categories para conocer las categorías disponibles. "
                "Esta acción queda marcada como 'editada por IA' en la interfaz."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "transaction_id": {
                        "type": "integer",
                        "description": "ID numérico de la transacción a categorizar",
                    },
                    "category_name": {
                        "type": "string",
                        "description": "Nombre de la categoría destino (búsqueda parcial, sin distinción de mayúsculas)",
                    },
                },
                "required": ["transaction_id", "category_name"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Helper: month range
# ---------------------------------------------------------------------------
def _month_range(year: int, month: int):
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return start, end


# ---------------------------------------------------------------------------
# Financial context builder
# ---------------------------------------------------------------------------
def _detect_payroll_period(db: Session, user_id: int):
    today = date.today()
    last_payroll = (
        db.query(models.Transaction.date)
        .filter(
            models.Transaction.user_id == user_id,
            models.Transaction.type == "CUSTOMER_INPAYMENT",
            models.Transaction.account_category == "CASH",
            models.Transaction.date <= today,
        )
        .order_by(models.Transaction.date.desc())
        .first()
    )
    if last_payroll:
        return last_payroll[0], today
    return _month_range(today.year, today.month)


def build_financial_context(
    db: Session,
    user_id: int,
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
) -> str:
    today = date.today()

    if period_start and period_end:
        try:
            start = date.fromisoformat(period_start)
            end = date.fromisoformat(period_end)
            end = min(end, today)
        except ValueError:
            start, end = _detect_payroll_period(db, user_id)
    else:
        start, end = _detect_payroll_period(db, user_id)

    month_label = f"{start.strftime('%d %b')} – {end.strftime('%d %b %Y')}"

    base_q = db.query(models.Transaction).filter(
        models.Transaction.user_id == user_id,
        models.Transaction.account_category == "CASH",
        models.Transaction.is_internal_transfer == False,
        models.Transaction.date >= start,
        models.Transaction.date <= end,
    )

    def _sum_types(types):
        r = (
            base_q.filter(models.Transaction.type.in_(types))
            .with_entities(func.sum(func.abs(models.Transaction.amount)))
            .scalar()
        )
        return round(r or 0.0, 2)

    income_month = _sum_types(INCOME_TYPES)
    expenses_month = _sum_types(EXPENSE_TYPES)
    balance_month = round(income_month - expenses_month, 2)
    tx_count = base_q.count()

    top_cats_q = (
        db.query(
            models.Transaction.category_id,
            func.sum(func.abs(models.Transaction.amount)).label("total"),
        )
        .filter(
            models.Transaction.user_id == user_id,
            models.Transaction.account_category == "CASH",
            models.Transaction.is_internal_transfer == False,
            models.Transaction.type.in_(EXPENSE_TYPES),
            models.Transaction.date >= start,
            models.Transaction.date <= end,
        )
        .group_by(models.Transaction.category_id)
        .order_by(func.sum(func.abs(models.Transaction.amount)).desc())
        .limit(5)
        .all()
    )

    top_categories = []
    for cat_id, total in top_cats_q:
        cat = db.query(models.Category).filter(models.Category.id == cat_id).first() if cat_id else None
        top_categories.append(f"{cat.name if cat else 'Sin categoría'}: {total:.2f}€")

    debts = db.query(models.Debt).filter(models.Debt.user_id == user_id, models.Debt.is_settled == False).all()
    debt_lines = []
    for d in debts:
        paid = sum(p.amount for p in d.payments)
        remaining = max(0.0, d.total_amount - paid)
        direction = "debo" if d.direction.value == "I_OWE" else "me deben"
        debt_lines.append(f"{d.name} ({direction}): {remaining:.2f}€")

    goals = db.query(models.Goal).filter(models.Goal.user_id == user_id, models.Goal.is_active == True).all()
    goal_lines = []
    for g in goals:
        if g.target_amount:
            pct = round((g.current_amount / g.target_amount) * 100, 1) if g.target_amount else 0
            goal_lines.append(f"{g.name}: {g.current_amount:.2f}€ / {g.target_amount:.2f}€ ({pct}%)")
        elif g.target_percent:
            goal_lines.append(f"{g.name}: objetivo {g.target_percent}%")

    lines = [
        f"CONTEXTO FINANCIERO DEL USUARIO — Ciclo de nómina: {month_label}:",
        f"- Balance neto del mes: {balance_month:.2f}€",
        f"- Ingresos del mes: {income_month:.2f}€",
        f"- Gastos del mes: {expenses_month:.2f}€",
        f"- Transacciones registradas este mes: {tx_count}",
    ]
    if top_categories:
        lines.append("- Top 5 categorías de gasto este mes:")
        lines += [f"  • {i}" for i in top_categories]
    if debt_lines:
        lines.append("- Deudas pendientes:")
        lines += [f"  • {i}" for i in debt_lines]
    else:
        lines.append("- Sin deudas pendientes.")
    if goal_lines:
        lines.append("- Objetivos activos:")
        lines += [f"  • {i}" for i in goal_lines]
    else:
        lines.append("- Sin objetivos activos.")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------
def execute_tool(tool_name: str, tool_input: dict, db: Session, user_id: int) -> str:
    today = date.today()

    if tool_name == "get_transactions":
        date_from_str: Optional[str] = tool_input.get("date_from")
        date_to_str: Optional[str] = tool_input.get("date_to")
        category_name: Optional[str] = tool_input.get("category_name")
        limit: int = min(int(tool_input.get("limit", 20)), 100)

        q = db.query(models.Transaction).filter(models.Transaction.user_id == user_id)
        if date_from_str:
            try:
                q = q.filter(models.Transaction.date >= date.fromisoformat(date_from_str))
            except ValueError:
                pass
        if date_to_str:
            try:
                q = q.filter(models.Transaction.date <= date.fromisoformat(date_to_str))
            except ValueError:
                pass
        if category_name:
            matching_cats = (
                db.query(models.Category.id)
                .filter(models.Category.name.ilike(f"%{category_name}%"))
                .subquery()
            )
            q = q.filter(models.Transaction.category_id.in_(matching_cats))

        txs = (
            q.options(joinedload(models.Transaction.category))
            .order_by(models.Transaction.date.desc())
            .limit(limit)
            .all()
        )
        result = [
            {
                "id": tx.id,
                "date": str(tx.date),
                "name": tx.name or tx.description or tx.type,
                "amount": tx.amount,
                "category_name": tx.category.name if tx.category else "Sin categoría",
                "type": tx.type,
            }
            for tx in txs
        ]
        return json.dumps({"transactions": result, "count": len(result)}, ensure_ascii=False)

    elif tool_name == "get_category_breakdown":
        month_str: Optional[str] = tool_input.get("month")
        if month_str:
            try:
                parts = month_str.split("-")
                year, month = int(parts[0]), int(parts[1])
            except Exception:
                year, month = today.year, today.month
        else:
            year, month = today.year, today.month

        start, end = _month_range(year, month)
        rows = (
            db.query(
                models.Transaction.category_id,
                func.sum(func.abs(models.Transaction.amount)).label("total"),
                func.count(models.Transaction.id).label("cnt"),
            )
            .filter(
                models.Transaction.user_id == user_id,
                models.Transaction.account_category == "CASH",
                models.Transaction.is_internal_transfer == False,
                models.Transaction.type.in_(EXPENSE_TYPES),
                models.Transaction.date >= start,
                models.Transaction.date <= end,
            )
            .group_by(models.Transaction.category_id)
            .order_by(func.sum(func.abs(models.Transaction.amount)).desc())
            .all()
        )
        breakdown = []
        for cat_id, total, cnt in rows:
            cat = db.query(models.Category).filter(models.Category.id == cat_id).first() if cat_id else None
            breakdown.append({"category": cat.name if cat else "Sin categoría", "total": round(float(total), 2), "transaction_count": cnt})
        return json.dumps({"month": f"{year}-{month:02d}", "breakdown": breakdown}, ensure_ascii=False)

    elif tool_name == "get_monthly_trend":
        months: int = min(int(tool_input.get("months", 6)), 24)
        trend = []
        for i in range(months - 1, -1, -1):
            m = today.month - i
            y = today.year
            while m <= 0:
                m += 12
                y -= 1
            start, end = _month_range(y, m)

            def _m_sum(types, s=start, e=end):
                r = (
                    db.query(func.sum(func.abs(models.Transaction.amount)))
                    .filter(
                        models.Transaction.user_id == user_id,
                        models.Transaction.account_category == "CASH",
                        models.Transaction.is_internal_transfer == False,
                        models.Transaction.type.in_(types),
                        models.Transaction.date >= s,
                        models.Transaction.date <= e,
                    )
                    .scalar()
                )
                return round(float(r or 0.0), 2)

            inc = _m_sum(INCOME_TYPES)
            exp = _m_sum(EXPENSE_TYPES)
            trend.append({"month": f"{y}-{m:02d}", "income": inc, "expenses": exp, "savings": round(inc - exp, 2)})
        return json.dumps({"trend": trend, "months": months}, ensure_ascii=False)

    elif tool_name == "get_portfolio_performance":
        try:
            from ..services.portfolio_calculator import calculate_portfolio
            perf = calculate_portfolio(db, user_id)
            positions_data = [
                {
                    "symbol": p.symbol, "name": p.name, "asset_class": p.asset_class,
                    "shares": p.shares, "avg_buy_price": p.avg_buy_price,
                    "total_invested": p.total_invested, "current_price": p.current_price,
                    "market_value": p.market_value, "unrealized_pnl": p.unrealized_pnl,
                    "unrealized_pnl_pct": p.unrealized_pnl_pct, "realized_pnl": p.realized_pnl,
                    "dividends_received": p.dividends_received,
                }
                for p in perf.positions
            ]
            return json.dumps({
                "total_invested": perf.total_invested,
                "total_market_value": perf.total_market_value,
                "total_unrealized_pnl": perf.total_unrealized_pnl,
                "total_realized_pnl": perf.total_realized_pnl,
                "total_fees": perf.total_fees,
                "total_dividends": perf.total_dividends,
                "positions": positions_data,
            }, ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"error": str(exc)}, ensure_ascii=False)

    elif tool_name == "search_web":
        query: str = tool_input.get("query", "")
        max_results: int = min(int(tool_input.get("max_results", 5)), 10)
        if not query:
            return json.dumps({"error": "query vacío"}, ensure_ascii=False)
        try:
            from duckduckgo_search import DDGS
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
            simplified = [
                {"title": r.get("title", ""), "snippet": r.get("body", ""), "url": r.get("href", "")}
                for r in results
            ]
            return json.dumps({"query": query, "results": simplified}, ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"error": str(exc)}, ensure_ascii=False)

    elif tool_name == "get_stock_quote":
        ticker: str = tool_input.get("ticker", "").upper().strip()
        if not ticker:
            return json.dumps({"error": "ticker vacío"}, ensure_ascii=False)
        try:
            import yfinance as yf
            t = yf.Ticker(ticker)
            info = t.info
            hist = t.history(period="2d")
            prev_close = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else None
            current = float(hist["Close"].iloc[-1]) if len(hist) >= 1 else info.get("currentPrice")
            change_pct = round((current - prev_close) / prev_close * 100, 2) if current and prev_close else None
            result = {
                "ticker": ticker,
                "name": info.get("longName") or info.get("shortName", ticker),
                "price": round(current, 4) if current else None,
                "currency": info.get("currency", "USD"),
                "change_pct_1d": change_pct,
                "market_cap": info.get("marketCap"),
                "pe_ratio": info.get("trailingPE"),
                "dividend_yield_pct": round(info.get("dividendYield", 0) * 100, 2) if info.get("dividendYield") else None,
                "52w_high": info.get("fiftyTwoWeekHigh"),
                "52w_low": info.get("fiftyTwoWeekLow"),
                "sector": info.get("sector"),
                "description": (info.get("longBusinessSummary") or "")[:300] or None,
            }
            return json.dumps(result, ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"error": str(exc)}, ensure_ascii=False)

    elif tool_name == "get_categories":
        cats = db.query(models.Category).filter(
            (models.Category.user_id == user_id) | (models.Category.user_id == None)
        ).order_by(models.Category.name).all()
        result = [
            {"id": c.id, "name": c.name, "icon": c.icon, "type": c.type.value if hasattr(c.type, "value") else str(c.type)}
            for c in cats
        ]
        return json.dumps({"categories": result, "count": len(result)}, ensure_ascii=False)

    elif tool_name == "categorize_transaction":
        tx_id: int = int(tool_input.get("transaction_id", 0))
        cat_name: str = tool_input.get("category_name", "").strip()

        if not tx_id:
            return json.dumps({"error": "transaction_id es obligatorio"}, ensure_ascii=False)
        if not cat_name:
            return json.dumps({"error": "category_name es obligatorio"}, ensure_ascii=False)

        tx = db.query(models.Transaction).filter(
            models.Transaction.id == tx_id,
            models.Transaction.user_id == user_id,
        ).first()
        if not tx:
            return json.dumps({"error": f"Transacción {tx_id} no encontrada"}, ensure_ascii=False)

        matching_cats = db.query(models.Category).filter(
            models.Category.name.ilike(f"%{cat_name}%"),
            (models.Category.user_id == user_id) | (models.Category.user_id == None),
        ).all()
        if not matching_cats:
            return json.dumps({"error": f"No se encontró ninguna categoría que coincida con '{cat_name}'"}, ensure_ascii=False)

        exact = next((c for c in matching_cats if c.name.lower() == cat_name.lower()), None)
        chosen_cat = exact or matching_cats[0]

        old_cat_name = tx.category.name if tx.category else "Sin categoría"
        tx.category_id = chosen_cat.id
        tx.is_ai_categorized = True
        tx.is_auto_categorized = False
        db.commit()

        return json.dumps({
            "success": True,
            "transaction_id": tx_id,
            "transaction_name": tx.name or tx.description or tx.type,
            "old_category": old_cat_name,
            "new_category": chosen_cat.name,
            "new_category_icon": chosen_cat.icon,
        }, ensure_ascii=False)

    else:
        return json.dumps({"error": f"Herramienta desconocida: {tool_name}"}, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Provider helpers
# ---------------------------------------------------------------------------
def _get_available_providers(provider_list: list) -> list:
    """Filter providers that have an API key configured."""
    return [p for p in provider_list if os.environ.get(p["api_key_env"])]


async def _call_with_fallback(
    provider_list: list,
    messages: list,
    tools: list | None = None,
    tool_choice: str = "auto",
    max_tokens: int = 4096,
    temperature: float = 0.7,
    extra_body_fn=None,
) -> tuple[object, str]:
    """
    Try each available provider with exponential backoff.
    Returns (response, provider_name) or raises the last exception.
    """
    from openai import OpenAI

    last_exc = None
    for provider in _get_available_providers(provider_list):
        api_key = os.environ.get(provider["api_key_env"])
        client = OpenAI(base_url=provider["base_url"], api_key=api_key)
        extra_body = extra_body_fn(provider) if extra_body_fn else {}

        for attempt, delay in enumerate([0] + _BACKOFF):
            if delay:
                await asyncio.sleep(delay)
            try:
                kwargs = dict(
                    model=provider["model"],
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                if tools:
                    kwargs["tools"] = tools
                    kwargs["tool_choice"] = tool_choice
                if extra_body:
                    kwargs["extra_body"] = extra_body

                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda k=kwargs, c=client: c.chat.completions.create(**k),
                )
                return response, provider["name"]
            except Exception as exc:
                last_exc = exc
                is_rate_limit = "429" in str(exc) or "rate" in str(exc).lower()
                if is_rate_limit and attempt < len(_BACKOFF):
                    continue
                break  # non-rate-limit error or exhausted retries → next provider

    raise last_exc or RuntimeError("No hay ningún proveedor de IA disponible.")


# ---------------------------------------------------------------------------
# SSE chat endpoint
# ---------------------------------------------------------------------------
@router.post("/chat")
async def chat(
    body: ChatRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    available = _get_available_providers(CHAT_PROVIDERS)
    if not available:
        raise HTTPException(
            status_code=503,
            detail="No hay ninguna API key de IA configurada. Añade NVIDIA_API_KEY, GROQ_API_KEY o GEMINI_API_KEY al archivo .env.",
        )

    try:
        context = build_financial_context(db, current_user.id, body.period_start, body.period_end)
    except Exception:
        context = "No se pudo obtener el contexto financiero."

    system_prompt = (
        "Eres un asistente financiero personal para FinanceMaster. "
        f"{context}\n"
        "Responde siempre en español, de forma concisa y útil. "
        "Cuando necesites datos específicos usa las herramientas disponibles. "
        "Usa formato Markdown cuando ayude a la legibilidad (listas, negritas, tablas). "
        "No inventes datos que no estén en el contexto o en los resultados de las herramientas."
    )

    level = body.thinking_level or "high"

    def _extra_body_for_chat(provider: dict) -> dict:
        if not provider.get("supports_thinking"):
            return {}
        if level == "fast":
            return {"chat_template_kwargs": {"thinking": False}}
        if level == "max":
            return {"chat_template_kwargs": {"thinking": True, "reasoning_effort": "max"}}
        return {"chat_template_kwargs": {"thinking": True, "reasoning_effort": "high"}}

    captured_db = db
    captured_user_id = current_user.id

    async def event_generator() -> AsyncGenerator[str, None]:
        start_time = time.time()
        messages = [{"role": "system", "content": system_prompt}]
        for m in body.history:
            messages.append({"role": m.role, "content": m.content})
        messages.append({"role": "user", "content": body.message})

        try:
            max_iterations = 5

            for _ in range(max_iterations):
                response, provider_name = await _call_with_fallback(
                    CHAT_PROVIDERS,
                    messages,
                    tools=TOOLS,
                    tool_choice="auto",
                    max_tokens=4096,
                    temperature=0.7,
                    extra_body_fn=_extra_body_for_chat,
                )

                choice = response.choices[0]

                if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
                    msg = choice.message

                    reasoning = getattr(msg, "reasoning", None) or getattr(msg, "reasoning_content", None)
                    if reasoning:
                        yield f"data: {json.dumps({'type': 'thinking', 'text': str(reasoning)}, ensure_ascii=False)}\n\n"

                    messages.append({
                        "role": "assistant",
                        "content": msg.content or "",
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                            }
                            for tc in msg.tool_calls
                        ],
                    })

                    for tc in msg.tool_calls:
                        tool_name = tc.function.name
                        try:
                            tool_input = json.loads(tc.function.arguments)
                        except json.JSONDecodeError:
                            tool_input = {}

                        yield f"data: {json.dumps({'type': 'thinking', 'text': f'Consultando {tool_name}...'}, ensure_ascii=False)}\n\n"

                        tool_output = await asyncio.get_event_loop().run_in_executor(
                            None, execute_tool, tool_name, tool_input, captured_db, captured_user_id
                        )

                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": tool_output,
                        })

                else:
                    break

            final_msg = response.choices[0].message

            reasoning = getattr(final_msg, "reasoning", None) or getattr(final_msg, "reasoning_content", None)
            if reasoning and response.choices[0].finish_reason != "tool_calls":
                yield f"data: {json.dumps({'type': 'thinking', 'text': str(reasoning)}, ensure_ascii=False)}\n\n"

            final_text = final_msg.content or ""
            if not final_text.strip():
                final_text = "Lo siento, no pude generar una respuesta en este momento."

            chunk_size = 20
            for i in range(0, len(final_text), chunk_size):
                yield f"data: {json.dumps({'type': 'delta', 'text': final_text[i:i + chunk_size]}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0)

            elapsed_ms = int((time.time() - start_time) * 1000)
            usage = getattr(response, "usage", None)
            meta = {
                "type": "meta",
                "model": provider_name,
                "elapsed_ms": elapsed_ms,
                "input_tokens": getattr(usage, "prompt_tokens", None),
                "output_tokens": getattr(usage, "completion_tokens", None),
            }
            yield f"data: {json.dumps(meta, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'text': f'Error: {exc}'}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Batch AI categorization endpoint
# ---------------------------------------------------------------------------
@router.post("/categorize-batch")
async def categorize_batch(
    body: CategorizeBatchRequest,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """
    AI-categorize a list of transaction IDs independently.
    Uses fast lightweight models (GroqCloud first, then NVIDIA, then Gemini).
    Returns per-transaction results — successes and errors separately.
    """
    available = _get_available_providers(FAST_PROVIDERS)
    if not available:
        raise HTTPException(
            status_code=503,
            detail="No hay ninguna API key de IA configurada.",
        )

    # Fetch all user categories once
    categories = db.query(models.Category).filter(
        (models.Category.user_id == current_user.id) | (models.Category.user_id == None)
    ).order_by(models.Category.name).all()

    cat_list_str = "\n".join(
        f"- {c.name}" for c in categories
    )

    results = []

    for tx_id in body.transaction_ids:
        tx = db.query(models.Transaction).filter(
            models.Transaction.id == tx_id,
            models.Transaction.user_id == current_user.id,
        ).first()
        if not tx:
            results.append({"id": tx_id, "error": "Transacción no encontrada"})
            continue

        tx_name = tx.name or tx.description or tx.type
        prompt = (
            f"Analiza esta transacción financiera y elige la categoría MÁS apropiada.\n\n"
            f"Transacción:\n"
            f"- Nombre: {tx_name}\n"
            f"- Importe: {tx.amount}€\n"
            f"- Tipo: {tx.type}\n"
            f"- Descripción: {tx.description or 'N/A'}\n\n"
            f"Categorías disponibles:\n{cat_list_str}\n\n"
            f"Responde ÚNICAMENTE con el nombre exacto de una de las categorías de la lista, sin ninguna explicación adicional."
        )

        messages = [{"role": "user", "content": prompt}]

        try:
            response, _ = await _call_with_fallback(
                FAST_PROVIDERS,
                messages,
                tools=None,
                max_tokens=60,
                temperature=0.1,
            )
            chosen_name = (response.choices[0].message.content or "").strip()
            # Strip quotes if model wraps the answer
            chosen_name = chosen_name.strip('"\'').strip()
        except Exception as exc:
            results.append({"id": tx_id, "error": str(exc)})
            continue

        # Find best matching category (exact, then partial)
        match = next((c for c in categories if c.name.lower() == chosen_name.lower()), None)
        if not match:
            match = next((c for c in categories if chosen_name.lower() in c.name.lower()), None)
        if not match:
            results.append({"id": tx_id, "error": f"Categoría no reconocida: {chosen_name}"})
            continue

        tx.category_id = match.id
        tx.is_ai_categorized = True
        tx.is_auto_categorized = False

        results.append({
            "id": tx_id,
            "category_id": match.id,
            "category_name": match.name,
            "category_icon": match.icon,
            "category_color": match.color,
        })

    db.commit()
    return {"results": results, "total": len(results)}
