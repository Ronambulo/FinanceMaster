import json

import pytest

from backend.services import preferences as prefs


def test_resolve_null_gives_defaults_not_initialized():
    out = prefs.resolve(None)
    assert out["ui_mode"] == "normal"
    assert out["theme"] == "system"
    assert out["initialized"] is False
    assert out["modules"]["ai"] is False
    assert out["modules"]["achievements"] is False
    assert out["modules"]["budgets"] is True


@pytest.mark.parametrize("raw", ["", "not json", "[1,2]", "null"])
def test_resolve_tolerates_garbage(raw):
    out = prefs.resolve(raw)
    assert out["ui_mode"] == "normal"
    assert out["initialized"] is False


def test_resolve_ignores_unknown_and_invalid_values():
    raw = json.dumps({"ui_mode": "weird", "theme": "dark", "modules": {"ai": True, "nope": True, "debts": "yes"}})
    out = prefs.resolve(raw)
    assert out["ui_mode"] == "normal"
    assert out["theme"] == "dark"
    assert out["modules"]["ai"] is True
    assert "nope" not in out["modules"]
    assert out["modules"]["debts"] is True  # valor inválido → por defecto
    assert out["initialized"] is True


def test_merge_is_partial():
    raw = prefs.merge(None, {"ui_mode": "ultra"})
    raw = prefs.merge(raw, {"modules": {"debts": False}})
    out = prefs.resolve(raw)
    assert out["ui_mode"] == "ultra"
    assert out["modules"]["debts"] is False
    assert out["modules"]["goals"] is True


@pytest.mark.parametrize("patch", [
    {"ui_mode": "x"},
    {"theme": "blue"},
    {"modules": {"unknown": True}},
    {"modules": {"ai": 1}},
    {"modules": ["ai"]},
    {"currency": "BTC"},
    {"month_start": 31},
    {"month_start": True},
])
def test_merge_rejects_invalid(patch):
    with pytest.raises(prefs.PreferencesError):
        prefs.merge(None, patch)


def test_preferences_api_roundtrip(user_client):
    client, _ = user_client
    r = client.get("/api/auth/preferences")
    assert r.status_code == 200
    assert r.json()["initialized"] is False

    r = client.put("/api/auth/preferences", json={"ui_mode": "ultra", "modules": {"ai": True}})
    assert r.status_code == 200
    body = r.json()
    assert body["ui_mode"] == "ultra" and body["modules"]["ai"] is True and body["initialized"] is True

    assert client.get("/api/auth/preferences").json()["ui_mode"] == "ultra"


def test_preferences_api_validation(user_client):
    client, _ = user_client
    r = client.put("/api/auth/preferences", json={"modules": {"bogus": True}})
    assert r.status_code == 422


def test_preferences_require_auth(client):
    client.headers.pop("Authorization", None)
    assert client.get("/api/auth/preferences").status_code in (401, 403)


def test_profile_update_display_name(user_client):
    client, _ = user_client
    r = client.put("/api/auth/profile", json={"display_name": "  Ana  "})
    assert r.status_code == 200
    assert r.json()["display_name"] == "Ana"
    assert client.get("/api/auth/me").json()["display_name"] == "Ana"
    r = client.put("/api/auth/profile", json={"display_name": ""})
    assert r.json()["display_name"] is None
    assert client.put("/api/auth/profile", json={"display_name": "x" * 61}).status_code == 422


def test_currency_and_month_start():
    out = prefs.resolve(None)
    assert out["currency"] == "EUR" and out["month_start"] == 0
    out = prefs.resolve(prefs.merge(None, {"currency": "USD", "month_start": 25}))
    assert out["currency"] == "USD" and out["month_start"] == 25
    out = prefs.resolve(json.dumps({"currency": "XXX", "month_start": 99}))
    assert out["currency"] == "EUR" and out["month_start"] == 0


def test_ultra_modules_y_estilo_de_iconos():
    out = prefs.resolve(None)
    assert out["ultra_modules"]["debts"] is False
    assert out["cat_icons"] == "emoji"
    raw = prefs.merge(None, {"ultra_modules": {"debts": True}, "cat_icons": "dibujo"})
    out = prefs.resolve(raw)
    assert out["ultra_modules"]["debts"] is True
    assert out["ultra_modules"]["goals"] is False
    assert out["cat_icons"] == "dibujo"


def test_ultra_modules_rechaza_valores_raros():
    with pytest.raises(prefs.PreferencesError):
        prefs.merge(None, {"ultra_modules": {"ai": True}})
    with pytest.raises(prefs.PreferencesError):
        prefs.merge(None, {"cat_icons": "png"})
