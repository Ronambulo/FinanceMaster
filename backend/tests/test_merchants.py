"""Comercios: limpieza, catálogo, historial, recategorización y logos."""
import io

from backend import models
from backend.services import logos
from backend.services.categorizer import auto_categorize, forget_history
from backend.services.merchants import clean_name, match_brand, match_keyword, merchant_info, merchant_key
from backend.services.recategorize import recategorize_user
from backend.tests.conftest import add_tx, system_category


# ── Limpieza y catálogo ─────────────────────────────────────────────────────

def test_clean_name_strips_gateway_codes_and_legal_suffix():
    assert clean_name("PAYPAL *SPOTIFY") == "SPOTIFY"
    assert clean_name("MERCADONA S.A.") == "MERCADONA"
    assert clean_name("Glovo 12NOV MP9FA7T2") == "Glovo"
    assert clean_name("12345678") == "12345678"  # si se queda vacío, el original


def test_brand_variants_share_key(tmp_path, monkeypatch):
    assert match_brand("MERCADONA VALENCIA") == "mercadona"
    assert merchant_key("GLOVO 12NOV ABC123XY") == merchant_key("Glovo") == "glovo"
    monkeypatch.setattr(logos, "LOGO_DIR", str(tmp_path))
    info = merchant_info("Mercadona 1234")
    assert info["name"] == "Mercadona" and info["logo"] is None  # aún sin descargar
    (tmp_path / "mercadona.png").write_bytes(b"x")
    assert merchant_info("Mercadona").get("logo", "").startswith("/api/merchants/logo/mercadona?v=")


def test_whole_word_matching():
    # "tren" no debe salir de "entrenamiento"; "zara" no de "zaragoza".
    assert match_keyword("Club entrenamiento") != match_keyword("Billete tren")
    assert match_brand("Panaderia Zaragoza") != "zara"


def test_unknown_merchant_has_no_logo():
    info = merchant_info("Bar Pepe")
    assert info["brand"] is None and info["logo"] is None and info["name"] == "Bar Pepe"


# ── Categorizador ───────────────────────────────────────────────────────────

def test_catalog_categorizes_known_brand(user_client, db):
    _, uid = user_client
    res = auto_categorize(db, uid, "CARD_TRANSACTION", "MERCADONA VALENCIA", None, None, None, -20.0)
    assert res.source == "catalog" and res[0] is not None and res[1] is True


def test_dividend_from_brand_stays_dividend(user_client, db):
    _, uid = user_client
    res = auto_categorize(db, uid, "DIVIDEND", "Apple", None, None, None, 3.0)
    assert res.source == "type"
    assert db.get(models.Category, res[0]).name == "Dividendos"


def test_history_beats_catalog(user_client, db):
    _, uid = user_client
    ocio = system_category(db, "Ocio") or system_category(db, "Entretenimiento")
    for _ in range(3):  # marca conocida: hace falta un hábito claro
        add_tx(db, uid, name="Mercadona", category_id=ocio.id, is_auto_categorized=False, category_source="manual")
    forget_history(db)
    res = auto_categorize(db, uid, "CARD_TRANSACTION", "MERCADONA 1234", None, None, None, -5.0)
    assert res.source == "history" and res[0] == ocio.id


# ── Recategorización ────────────────────────────────────────────────────────

def test_recategorize_never_touches_confirmed(user_client, db):
    _, uid = user_client
    sin = system_category(db, "Sin categorizar")
    ocio = system_category(db, "Ocio") or system_category(db, "Entretenimiento")
    confirmed = add_tx(db, uid, name="Lidl", category_id=ocio.id, is_auto_categorized=False)
    pending = add_tx(db, uid, name="Carrefour Express", category_id=sin.id, is_auto_categorized=False)
    recategorize_user(db, uid)
    db.refresh(confirmed)
    db.refresh(pending)
    assert confirmed.category_id == ocio.id
    assert pending.category_id != sin.id and pending.category_source == "catalog"


def test_recategorize_endpoints(user_client, db):
    client, uid = user_client
    sin = system_category(db, "Sin categorizar")
    add_tx(db, uid, name="Burger King", category_id=sin.id, is_auto_categorized=False)
    assert client.get("/api/merchants/recategorize/preview").json()["count"] == 1
    assert client.post("/api/merchants/recategorize/apply").json()["updated"] == 1
    assert client.get("/api/merchants/recategorize/preview").json()["count"] == 0


def test_transactions_expose_merchant_and_filter(user_client, db):
    client, uid = user_client
    add_tx(db, uid, name="MERCADONA VALENCIA")
    add_tx(db, uid, name="Mercadona 1234")
    add_tx(db, uid, name="Bar Pepe")
    r = client.get("/api/transactions", params={"merchant": "mercadona"}).json()
    items = r["items"] if isinstance(r, dict) else r
    assert len(items) == 2
    assert all(t["merchant"]["brand"] == "mercadona" for t in items)


# ── Logos ───────────────────────────────────────────────────────────────────

def _png(size):
    from PIL import Image
    b = io.BytesIO()
    Image.new("RGBA", (size, size), (255, 0, 0, 255)).save(b, "PNG")
    return b.getvalue()


def test_to_png_validates():
    assert logos.to_png(b"<svg></svg>") is None
    assert logos.to_png(_png(16)) is None
    out = logos.to_png(_png(64))
    assert out and out.startswith(b"\x89PNG")


def test_tile_fills_solid_icons_and_pads_transparent_logos():
    from PIL import Image
    # Icono con fondo propio: el fondo llena la ficha.
    solid = Image.open(io.BytesIO(logos.to_png(_png(64)))).convert("RGB")
    assert solid.size == (128, 128) and solid.getpixel((1, 1)) == (255, 0, 0)
    # Logo suelto (apaisado, transparente): centrado sobre blanco y ampliado.
    def tile_of(box):
        im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        im.paste((0, 0, 255, 255), box)
        b = io.BytesIO()
        im.save(b, "PNG")
        return Image.open(io.BytesIO(logos.to_png(b.getvalue()))).convert("RGB")
    tile = tile_of((16, 26, 48, 38))
    assert tile.getpixel((1, 1)) == (255, 255, 255) and tile.getpixel((64, 64)) == (0, 0, 255)
    assert tile.getpixel((30, 64)) == (0, 0, 255)  # ampliado a lo ancho
    # Insignia cuadrada llena: ocupa todo el círculo.
    assert tile_of((24, 24, 40, 40)).getpixel((1, 1)) == (0, 0, 255)


def test_logo_cache_and_miss(tmp_path, monkeypatch, client):
    monkeypatch.setattr(logos, "LOGO_DIR", str(tmp_path))
    calls = []

    def fake_download(domain, icon=None):
        calls.append(domain)
        return logos.to_png(_png(64)) if domain.startswith("mercadona") else None

    monkeypatch.setattr(logos, "_download", fake_download)
    r = client.get("/api/merchants/logo/mercadona")
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    client.get("/api/merchants/logo/mercadona")
    assert len(calls) == 1  # segunda vez, de caché
    assert client.get("/api/merchants/logo/lidl").status_code == 404
    assert client.get("/api/merchants/logo/lidl").status_code == 404
    assert len(calls) == 2  # el fallo también se recuerda
    # Si la web no responde, se reintenta pasado poco tiempo (no un mes).
    def offline(domain, icon=None):
        calls.append(domain)
        raise ConnectionError(domain)
    monkeypatch.setattr(logos, "_download", offline)
    assert client.get("/api/merchants/logo/aldi").status_code == 404
    assert "net" in (tmp_path / "aldi.miss").read_text()
    monkeypatch.setattr(logos, "NET_MISS_TTL", 0)
    client.get("/api/merchants/logo/aldi")
    assert calls.count(calls[-1]) == 2
    assert client.get("/api/merchants/logo/..%2Fsecret").status_code == 404
    assert client.get("/api/merchants/logo/no-existe").status_code == 404


def test_private_hosts_blocked():
    assert logos._get("http://example.com/", 100) is None
    assert logos._get("https://127.0.0.1/", 100) is None
    assert logos._get("https://localhost/", 100) is None


def test_same_merchant_never_overwrites_payroll_or_other_direction(user_client, db):
    """Poner "Ingreso" a un cobro de uno mismo no debe pisar las nóminas ya
    confirmadas ni los envíos de salida del mismo nombre."""
    client, uid = user_client
    nomina = system_category(db, "Nómina")
    ingreso = system_category(db, "Ingreso")
    sin = system_category(db, "Sin categorizar")
    salida = system_category(db, "Transferencia Saliente")
    src = add_tx(db, uid, name="ENRIQUE RODRIGUEZ", amount=50.0, type="CUSTOMER_INPAYMENT", category_id=sin.id)
    pay = add_tx(db, uid, name="ENRIQUE RODRIGUEZ", amount=1000.0, type="CUSTOMER_INPAYMENT",
                 category_id=nomina.id, is_auto_categorized=False)
    pending = add_tx(db, uid, name="Enrique Rodríguez", amount=20.0, type="CUSTOMER_INPAYMENT", category_id=sin.id)
    out = add_tx(db, uid, name="ENRIQUE RODRIGUEZ", amount=-200.0, type="TRANSFER_OUTBOUND",
                 category_id=salida.id, is_auto_categorized=True)
    assert client.get(f"/api/transactions/{src.id}/similar").json()["count"] == 1
    client.post("/api/transactions/bulk-category",
                json={"ids": [src.id], "category_id": ingreso.id, "include_same_merchant": True})
    for t in (src, pay, pending, out):
        db.refresh(t)
    assert pay.category_id == nomina.id and out.category_id == salida.id
    assert src.category_id == ingreso.id and pending.category_id == ingreso.id


def test_incoming_transfer_has_no_brand_logo(user_client, db):
    _, uid = user_client
    t = add_tx(db, uid, name="Carga de ORANGE ESPAGNE S.A.U.", amount=11.0, type="TRANSFER_INBOUND")
    assert t.merchant["brand"] is None and t.merchant["logo"] is None


def test_bizum_goes_to_bizum_both_ways(user_client, db):
    _, uid = user_client
    for amount, typ in ((-15.0, "CARD_TRANSACTION"), (20.0, "CUSTOMER_INPAYMENT")):
        res = auto_categorize(db, uid, typ, "Laura Pérez", "Bizum", None, None, amount)
        assert db.get(models.Category, res[0]).name == "Bizum"


def test_history_needs_a_clear_habit(user_client, db):
    """Un solo movimiento puesto a mano no arrastra al resto del comercio."""
    _, uid = user_client
    ocio = system_category(db, "Ocio") or system_category(db, "Entretenimiento")
    add_tx(db, uid, name="Bar Pepe", category_id=ocio.id, is_auto_categorized=False, category_source="manual")
    forget_history(db)
    assert auto_categorize(db, uid, "CARD_TRANSACTION", "Bar Pepe", None, None, None, -5.0).source != "history"
    add_tx(db, uid, name="Bar Pepe", category_id=ocio.id, is_auto_categorized=False, category_source="manual")
    forget_history(db)
    assert auto_categorize(db, uid, "CARD_TRANSACTION", "Bar Pepe", None, None, None, -5.0).source == "history"


def test_income_rule_never_touches_outgoing(user_client, db):
    _, uid = user_client
    ingreso = system_category(db, "Ingreso")
    db.add(models.CategoryRule(user_id=uid, keyword="JUAN PEREZ", field="name", category_id=ingreso.id, priority=10))
    db.commit()
    assert auto_categorize(db, uid, "CUSTOMER_INPAYMENT", "JUAN PEREZ", None, None, None, 50.0).source == "rule"
    assert auto_categorize(db, uid, "TRANSFER_OUTBOUND", "JUAN PEREZ", None, None, None, -50.0).source != "rule"
