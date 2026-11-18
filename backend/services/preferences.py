"""Preferencias de interfaz por usuario (modo, módulos y tema).

Se guardan como JSON en `users.preferences`. Un usuario anterior al rediseño
tiene la columna a NULL: se le devuelven los valores por defecto con
`initialized = False`, y el frontend puede subir entonces lo que tenía en el
navegador (localStorage) para no perder su configuración.
"""
import json
from typing import Any, Dict, Optional

UI_MODES = ("normal", "ultra")
THEMES = ("system", "light", "dark")
CURRENCIES = ("EUR", "USD", "GBP", "CHF", "MXN")
# Primer día del periodo: 0 = cuando entra la nómina; 1..28 = ese día de cada mes.
MONTH_START_MAX = 28

# Módulos que se pueden apagar. Inicio, Movimientos, añadir y el webhook de
# Atajos no están aquí: son el mínimo y no se pueden quitar.
MODULE_DEFAULTS: Dict[str, bool] = {
    "accounts": True,      # Cuentas: bancos y brokers
    "investments": True,   # Cartera de inversión
    "budgets": True,       # Presupuestos
    "monthly": True,       # Mes a mes
    "recurring": True,     # Recurrentes
    "goals": True,         # Objetivos
    "debts": True,         # Deudas
    "achievements": False, # Logros
    "ai": False,           # Asistente IA: discreto y apagado de serie
}

# Módulos que se pueden añadir al modo ultra simple (allí van apagados de serie).
ULTRA_MODULES = ("investments", "budgets", "recurring", "goals", "debts", "monthly")
CAT_ICONS = ("emoji", "dibujo")

DEFAULTS: Dict[str, Any] = {
    "ui_mode": "normal",
    "theme": "system",
    "modules": dict(MODULE_DEFAULTS),
    "currency": "EUR",
    "month_start": 0,
    "ultra_modules": {k: False for k in ULTRA_MODULES},
    "cat_icons": "emoji",
}


def _valid_day(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= MONTH_START_MAX


class PreferencesError(ValueError):
    pass


def _load(raw: Optional[str]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def resolve(raw: Optional[str]) -> Dict[str, Any]:
    """Preferencias completas: lo guardado encima de los valores por defecto.
    Ignora claves desconocidas o valores inválidos que hubiera en la BD."""
    stored = _load(raw)
    out = {
        "ui_mode": stored.get("ui_mode") if stored.get("ui_mode") in UI_MODES else DEFAULTS["ui_mode"],
        "theme": stored.get("theme") if stored.get("theme") in THEMES else DEFAULTS["theme"],
        "modules": dict(MODULE_DEFAULTS),
        "currency": stored.get("currency") if stored.get("currency") in CURRENCIES else DEFAULTS["currency"],
        "month_start": stored.get("month_start") if _valid_day(stored.get("month_start")) else DEFAULTS["month_start"],
        "ultra_modules": {k: False for k in ULTRA_MODULES},
        "cat_icons": stored.get("cat_icons") if stored.get("cat_icons") in CAT_ICONS else DEFAULTS["cat_icons"],
        "initialized": bool(stored),
    }
    umods = stored.get("ultra_modules")
    if isinstance(umods, dict):
        for k, v in umods.items():
            if k in ULTRA_MODULES and isinstance(v, bool):
                out["ultra_modules"][k] = v
    mods = stored.get("modules")
    if isinstance(mods, dict):
        for k, v in mods.items():
            if k in MODULE_DEFAULTS and isinstance(v, bool):
                out["modules"][k] = v
    return out


def merge(raw: Optional[str], patch: Dict[str, Any]) -> str:
    """Aplica un cambio parcial y devuelve el JSON a guardar.
    Lanza PreferencesError si el cambio trae valores no válidos."""
    current = resolve(raw)
    current.pop("initialized", None)

    if "ui_mode" in patch and patch["ui_mode"] is not None:
        if patch["ui_mode"] not in UI_MODES:
            raise PreferencesError(f"Modo no válido: {patch['ui_mode']}")
        current["ui_mode"] = patch["ui_mode"]
    if "theme" in patch and patch["theme"] is not None:
        if patch["theme"] not in THEMES:
            raise PreferencesError(f"Tema no válido: {patch['theme']}")
        current["theme"] = patch["theme"]
    if patch.get("currency") is not None:
        if patch["currency"] not in CURRENCIES:
            raise PreferencesError(f"Moneda no válida: {patch['currency']}")
        current["currency"] = patch["currency"]
    if patch.get("month_start") is not None:
        if not _valid_day(patch["month_start"]):
            raise PreferencesError("month_start debe ser un número de 0 a 28")
        current["month_start"] = patch["month_start"]
    mods = patch.get("modules")
    if mods is not None:
        if not isinstance(mods, dict):
            raise PreferencesError("modules debe ser un objeto")
        for k, v in mods.items():
            if k not in MODULE_DEFAULTS:
                raise PreferencesError(f"Módulo desconocido: {k}")
            if not isinstance(v, bool):
                raise PreferencesError(f"El módulo {k} debe ser true o false")
            current["modules"][k] = v
    umods = patch.get("ultra_modules")
    if umods is not None:
        if not isinstance(umods, dict):
            raise PreferencesError("ultra_modules debe ser un objeto")
        for k, v in umods.items():
            if k not in ULTRA_MODULES:
                raise PreferencesError(f"Módulo no disponible en ultra simple: {k}")
            if not isinstance(v, bool):
                raise PreferencesError(f"El módulo {k} debe ser true o false")
            current["ultra_modules"][k] = v
    if patch.get("cat_icons") is not None:
        if patch["cat_icons"] not in CAT_ICONS:
            raise PreferencesError(f"Estilo de iconos no válido: {patch['cat_icons']}")
        current["cat_icons"] = patch["cat_icons"]
    return json.dumps(current, separators=(",", ":"))
