"""
MyInvestor API client (unofficial).
Reverse-engineered from https://github.com/xivira/miai-api (MIT)

Uses Playwright to bypass Cloudflare JS challenge. All API calls run
inside a browser page context so Cloudflare clearance cookies are present.

Auth flow:
  1. login(user, password) → {"status": "connected"}
                          OR {"status": "needs_otp", "request_id": "..."}
  2. verify_otp(request_id, code) → {"status": "connected"}
  3. get_accounts() / get_portfolio_history() for data
"""
import json
import logging
from datetime import datetime
from typing import Optional

log = logging.getLogger(__name__)

BASE_URL = "https://app.myinvestor.es"

# ── In-memory client registry ─────────────────────────────────────────────────

_clients: dict[int, "MyInvestorAPI"] = {}


def get_client(user_id: int) -> Optional["MyInvestorAPI"]:
    return _clients.get(user_id)


def set_client(user_id: int, client: "MyInvestorAPI") -> None:
    _clients[user_id] = client


def remove_client(user_id: int) -> None:
    _clients.pop(user_id, None)


# ── Helpers ───────────────────────────────────────────────────────────────────

class MyInvestorError(Exception):
    pass


def _fetch_js(method: str, path: str, body: dict | None, token: str | None) -> str:
    """Build a JS snippet that calls fetch() and returns the response as JSON string."""
    url = f"{BASE_URL}{path}"
    headers: dict = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "es-ES,es;q=0.9",
    }
    if token:
        headers["Authorization"] = f"Basic {token}"

    body_js = f", body: {json.dumps(json.dumps(body))}" if body is not None else ""
    headers_js = json.dumps(headers)

    return f"""
async () => {{
    const resp = await fetch({json.dumps(url)}, {{
        method: {json.dumps(method)},
        headers: {headers_js}{body_js}
    }});
    return JSON.stringify({{ status: resp.status, body: await resp.text() }});
}}
"""


# ── Client ────────────────────────────────────────────────────────────────────

class MyInvestorAPI:
    def __init__(self, token: str | None = None, device_id: str | None = None):
        self.token = token
        self.device_id = device_id
        self._username: str | None = None
        self._password: str | None = None
        self._last_sync: datetime | None = None
        self._page = None       # Playwright page — kept alive for cookie persistence
        self._browser = None
        self._playwright = None

    def is_connected(self) -> bool:
        return bool(self.token)

    def last_sync(self) -> datetime | None:
        return self._last_sync

    def _ensure_page(self):
        """Launch headless browser and navigate to MyInvestor to clear Cloudflare."""
        if self._page is not None:
            return
        from playwright.sync_api import sync_playwright
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=True)
        ctx = self._browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="es-ES",
            viewport={"width": 1280, "height": 800},
        )
        self._page = ctx.new_page()
        # Visit the main page so Cloudflare sets clearance cookies
        try:
            self._page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30_000)
        except Exception:
            pass  # may timeout on CF challenge — cookies should still be set

    def _call(self, method: str, path: str, body: dict | None = None, public: bool = False) -> dict | list:
        self._ensure_page()
        token = None if public else self.token
        js = _fetch_js(method, path, body, token)
        try:
            raw = self._page.evaluate(js)
        except Exception as e:
            raise MyInvestorError(f"Browser fetch error: {e}") from e

        result = json.loads(raw)
        status = result["status"]
        text = result["body"]

        if status == 401:
            self.token = None
            raise MyInvestorError("Sesión expirada. Vuelve a conectar.")
        if status not in (200, 201):
            raise MyInvestorError(f"HTTP {status}: {text[:300]}")

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            raise MyInvestorError(f"Respuesta no JSON: {text[:200]}")

    def close(self):
        try:
            if self._browser:
                self._browser.close()
            if self._playwright:
                self._playwright.stop()
        except Exception:
            pass
        self._page = None
        self._browser = None
        self._playwright = None

    # ── Auth ──────────────────────────────────────────────────────────────────

    def login(self, username: str, password: str) -> dict:
        """Returns {"status": "connected"} or {"status": "needs_otp", "request_id": "..."}"""
        self._username = username
        self._password = password
        data = self._call(
            "POST",
            "/myinvestor-server/rest/public/usuarios/login-psd2",
            {
                "usuario": username,
                "contrasena": password,
                "deviceId": self.device_id,
                "tipoLogin": "USUARIO",
            },
            public=True,
        )
        if not isinstance(data, dict):
            raise MyInvestorError("Respuesta inesperada del servidor")

        if data.get("loginFinalizadoDto"):
            self.token = data["loginFinalizadoDto"]["token"]
            return {"status": "connected"}
        if data.get("generarOTPPSD2ResponseDto"):
            request_id = data["generarOTPPSD2ResponseDto"]["codigoPeticionOtp"]
            return {"status": "needs_otp", "request_id": request_id}

        reason = data.get("descripcion") or "Credenciales incorrectas"
        raise MyInvestorError(reason)

    def verify_otp(self, request_id: str, code: str) -> dict:
        if not self._username or not self._password:
            raise MyInvestorError("Llama a login() antes de verify_otp()")

        data = self._call(
            "POST",
            "/myinvestor-server/rest/public/usuarios/validar-otp",
            {
                "usuario": self._username,
                "deviceId": self.device_id,
                "tipoLogin": "USUARIO",
                "contrasena": self._password,
                "plataforma": None,
                "codigoPeticionOTP": request_id,
                "codigoOTPRecibido": code,
                "cotitular": False,
            },
            public=True,
        )
        if not isinstance(data, dict):
            raise MyInvestorError("Respuesta inesperada del servidor")

        if data.get("token"):
            self.token = data["token"]
            return {"status": "connected"}

        reason = data.get("descripcion") or "Código OTP incorrecto"
        raise MyInvestorError(reason)

    # ── Accounts ──────────────────────────────────────────────────────────────

    def get_checking_accounts(self) -> list:
        data = self._call("GET", "/myinvestor-server/rest/protected/cuentas/efectivo?soloActivas=false")
        return data if isinstance(data, list) else []

    def get_savings_accounts(self) -> list:
        data = self._call("GET", "/myinvestor-server/rest/protected/inversiones?soloActivas=false")
        return data if isinstance(data, list) else []

    def get_account_details(self, account_id: int) -> dict:
        data = self._call("GET", f"/myinvestor-server/rest/protected/cuentas/efectivo/{account_id}")
        return data if isinstance(data, dict) else {}

    def get_investment_details(self, account_id: int) -> dict:
        data = self._call("GET", f"/myinvestor-server/rest/protected/inversiones/{account_id}")
        return data if isinstance(data, dict) else {}

    def get_portfolio_history(self, period: str = "DESDE_INICIO") -> list:
        """period: DESDE_INICIO | ANIO_ACTUAL | SEIS_MESES | TRES_MESES | UN_MES"""
        data = self._call(
            "POST",
            "/myinvestor-server/rest/protected/posiciones",
            {
                "idCuentaValores": None,
                "idCuentaPensiones": None,
                "codigoIsin": None,
                "filtroGraficaEnum": period,
            },
        )
        if isinstance(data, dict):
            return data.get("listaValorPosicionGraficaDto", [])
        return []

    def get_all_accounts(self) -> dict:
        checking = self.get_checking_accounts()
        savings = self.get_savings_accounts()
        self._last_sync = datetime.utcnow()
        return {"checking": checking, "savings": savings}
