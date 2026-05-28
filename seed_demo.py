"""
seed_demo.py — Genera usuario demo con datos variados y realistas.
Uso: python seed_demo.py
"""
import sys, os, random, calendar
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DATABASE_URL",
    "sqlite:///" + str(ROOT / "backend" / "data" / "finance.db"))
os.environ.setdefault("SECRET_KEY", "dev-secret-key-not-for-production")

from backend.database import SessionLocal, engine
from backend import models
from backend.auth import hash_password
from backend.services.categorizer import seed_system_categories, auto_categorize
from backend.services.recurring_detector import detect_recurring

# ── Setup ────────────────────────────────────────────────────────────────────
models.Base.metadata.create_all(bind=engine)
db = SessionLocal()
seed_system_categories(db)

EMAIL    = "demo@financemaster.dev"
PASSWORD = "Demo1234!"
NAME     = "Alex Demo"

# Borra usuario previo para permitir re-seed limpio
existing = db.query(models.User).filter(models.User.email == EMAIL).first()
if existing:
    # Cascade delete handled by SQLAlchemy relationships
    db.delete(existing)
    db.commit()

user = models.User(
    email=EMAIL,
    username="demo",
    hashed_password=hash_password(PASSWORD),
)
db.add(user)
db.commit()
db.refresh(user)
uid = user.id
print(f"✓ Usuario creado: {EMAIL} / {PASSWORD}  (id={uid})")

# ── Helpers ───────────────────────────────────────────────────────────────────
rng = random.Random(42)
_counter = [0]

def tx(
    *,
    dt: date,
    type: str,
    name: str,
    amount: float,
    account_category: str = "CASH",
    mcc: str | None = None,
    symbol: str | None = None,
    asset_class: str | None = None,
    shares: float | None = None,
    price: float | None = None,
    fee: float = 0.0,
    tax: float = 0.0,
    currency: str = "EUR",
    counterparty: str | None = None,
    iban: str | None = None,
    description: str | None = None,
):
    _counter[0] += 1
    cat_id, is_auto, is_internal = auto_categorize(
        db, uid,
        tx_type=type,
        tx_name=name,
        tx_description=description,
        mcc_code=mcc,
        counterparty_name=counterparty,
        amount=amount,
        user_own_name=NAME,
    )
    obj = models.Transaction(
        user_id=uid,
        external_id=f"DEMO-{_counter[0]:05d}",
        datetime=datetime.combine(dt, datetime.min.time()),
        date=dt,
        account_category=account_category,
        type=type,
        name=name,
        amount=amount,
        fee=-abs(fee) if fee else None,
        tax=-abs(tax) if tax else None,
        currency=currency,
        mcc_code=mcc,
        symbol=symbol,
        asset_class=asset_class,
        shares=shares,
        price=price,
        counterparty_name=counterparty,
        counterparty_iban=iban,
        description=description,
        category_id=cat_id,
        is_auto_categorized=is_auto,
        is_internal_transfer=is_internal,
    )
    db.add(obj)
    return obj

def d(year, month, day):
    """Safe date clamped to last day of month."""
    day = min(day, calendar.monthrange(year, month)[1])
    return date(year, month, day)

today = date.today()

# ── 12 meses de transacciones CASH ───────────────────────────────────────────
SUPERMARKETS = ["MERCADONA", "LIDL SUPERMERCADOS", "CARREFOUR", "DIA SUPERMERCADO", "ALDI"]
RESTAURANTS  = ["RESTAURANTE EL PATIO", "PIZZERIA NAPOLI DA LUIGI", "SUSHI TOKYO EXPRESS",
                 "BAR LA ESQUINA", "TABERNA MADRILEÑA", "MCDONALDS", "BURGER KING"]
CAFES        = ["STARBUCKS COFFEE", "CAFE CENTRAL MADRID", "COSTA COFFEE", "TEN CON TEN"]
TRANSPORT    = ["CABIFY", "UBER *TRIP MADRID", "EMT MADRID BUS", "RENFE CERCANIAS"]
CLOTHES      = ["ZARA", "H&M", "MANGO", "PULL AND BEAR", "NIKE STORE"]

for offset in range(13):               # 13 months for richer history
    ref = today.replace(day=1) - timedelta(days=offset * 30)
    y, m = ref.year, ref.month

    # ── Ingresos ─────────────────────────────────────────
    # Nómina (1-3 de cada mes)
    salary = rng.uniform(2650, 2950)
    tx(dt=d(y,m,rng.randint(1,3)), type="TRANSFER_INSTANT_INBOUND",
       name="EMPRESA TECH SL", amount=round(salary, 2),
       counterparty="EMPRESA TECH SL", iban="ES1000000000000000000001",
       description="Nomina mensual")

    # Intereses Trade Republic (~15)
    tx(dt=d(y,m,15), type="INTEREST_PAYMENT",
       name="Intereses Trade Republic", amount=round(rng.uniform(9, 22), 2))

    # Freelance (45% de meses)
    if rng.random() < 0.45:
        tx(dt=d(y,m,rng.randint(8,22)), type="CUSTOMER_INPAYMENT",
           name="PROYECTO FREELANCE STUDIO", amount=round(rng.uniform(350, 1600), 2),
           description="Factura proyecto web")

    # Alquiler coche (ocasional, ingreso)
    if rng.random() < 0.15:
        tx(dt=d(y,m,rng.randint(5,25)), type="CUSTOMER_INPAYMENT",
           name="WALLAPOP VENTA", amount=round(rng.uniform(30, 150), 2),
           description="Venta artículo segunda mano")

    # ── Gastos fijos ─────────────────────────────────────
    # Alquiler
    tx(dt=d(y,m,5), type="TRANSFER_OUTBOUND",
       name="ALQUILER PISO MALASAÑA", amount=-900.0,
       counterparty="INMOBILIARIA GARCIA SL", iban="ES9000000000000000000002")

    # Luz
    tx(dt=d(y,m,rng.randint(8,12)), type="CARD_TRANSACTION",
       name="ENDESA ENERGIA SA", amount=round(-rng.uniform(52, 98), 2), mcc="4911")

    # Internet
    tx(dt=d(y,m,10), type="TRANSFER_OUTBOUND",
       name="MOVISTAR FIBRA 600MB", amount=-49.90,
       counterparty="TELEFONICA DE ESPANA")

    # Seguro hogar
    if m in (1, 4, 7, 10):  # trimestral
        tx(dt=d(y,m,20), type="CARD_TRANSACTION",
           name="MAPFRE SEGUROS HOGAR", amount=-round(rng.uniform(55, 75), 2), mcc="6411")

    # Netflix
    tx(dt=d(y,m,17), type="CARD_TRANSACTION",
       name="NETFLIX.COM", amount=-15.98, mcc="7812")

    # Spotify
    tx(dt=d(y,m,20), type="CARD_TRANSACTION",
       name="SPOTIFY AB", amount=-10.99, mcc="5735")

    # Gimnasio
    tx(dt=d(y,m,3), type="CARD_TRANSACTION",
       name="BASIC FIT ESPAÑA SL", amount=-29.99, mcc="7941")

    # YouTube Premium
    tx(dt=d(y,m,22), type="CARD_TRANSACTION",
       name="GOOGLE *YOUTUBEPREMIUM", amount=-13.99, mcc="5734")

    # ── Gastos variables ─────────────────────────────────
    # Supermercados (4-7 veces)
    for _ in range(rng.randint(4, 7)):
        tx(dt=d(y,m,rng.randint(1,28)), type="CARD_TRANSACTION",
           name=rng.choice(SUPERMARKETS),
           amount=round(-rng.uniform(35, 140), 2), mcc="5411")

    # Restaurantes (3-6 veces)
    for _ in range(rng.randint(3, 6)):
        tx(dt=d(y,m,rng.randint(1,28)), type="CARD_TRANSACTION",
           name=rng.choice(RESTAURANTS),
           amount=round(-rng.uniform(11, 72), 2), mcc="5812")

    # Cafeterías (3-5 veces)
    for _ in range(rng.randint(3, 5)):
        tx(dt=d(y,m,rng.randint(1,28)), type="CARD_TRANSACTION",
           name=rng.choice(CAFES),
           amount=round(-rng.uniform(3.2, 8.5), 2), mcc="5812")

    # Transporte (2-5 veces)
    for _ in range(rng.randint(2, 5)):
        tx(dt=d(y,m,rng.randint(1,28)), type="CARD_TRANSACTION",
           name=rng.choice(TRANSPORT),
           amount=round(-rng.uniform(5, 28), 2), mcc="4121")

    # Amazon (1-2 veces)
    for _ in range(rng.randint(1, 2)):
        tx(dt=d(y,m,rng.randint(1,28)), type="CARD_TRANSACTION",
           name="AMAZON EU SARL", amount=round(-rng.uniform(14, 130), 2), mcc="5999")

    # Ropa (50% de meses)
    if rng.random() < 0.5:
        tx(dt=d(y,m,rng.randint(1,28)), type="CARD_TRANSACTION",
           name=rng.choice(CLOTHES),
           amount=round(-rng.uniform(35, 210), 2), mcc="5651")

    # Farmacia (40% de meses)
    if rng.random() < 0.4:
        tx(dt=d(y,m,rng.randint(1,28)), type="CARD_TRANSACTION",
           name="FARMACIA CENTRAL MADRID", amount=round(-rng.uniform(7, 42), 2), mcc="5912")

    # Gasolina (60% de meses)
    if rng.random() < 0.6:
        tx(dt=d(y,m,rng.randint(1,28)), type="CARD_TRANSACTION",
           name="REPSOL GASOLINERA", amount=round(-rng.uniform(45, 80), 2), mcc="5541")

    # Ocio/evento (30% de meses)
    if rng.random() < 0.3:
        tx(dt=d(y,m,rng.randint(1,28)), type="CARD_TRANSACTION",
           name=rng.choice(["TICKETMASTER", "ODEON CINEMAS", "FNAC ESPANA"]),
           amount=round(-rng.uniform(12, 90), 2), mcc="7999")

    # Educación (20% de meses)
    if rng.random() < 0.2:
        tx(dt=d(y,m,rng.randint(1,28)), type="CARD_TRANSACTION",
           name=rng.choice(["UDEMY", "COURSERA", "OPENAI *CHATGPT PLUS"]),
           amount=round(-rng.uniform(10, 50), 2), mcc="8299")

    # Médico (15% de meses)
    if rng.random() < 0.15:
        tx(dt=d(y,m,rng.randint(1,28)), type="CARD_TRANSACTION",
           name="CLINICA DENTISTA VARGAS",
           amount=round(-rng.uniform(40, 180), 2), mcc="8049")

db.commit()
print(f"✓ CASH: {_counter[0]} transacciones")

# ── Transacciones TRADING ─────────────────────────────────────────────────────
y0 = today.year - 1   # hace 1 año base

trading_ops = [
    # (isin, name, asset, type, shares, price_eur, dt, fee)
    ("US8740541094","Take-Two Interactive","STOCK","BUY",  2.0,   155.00, date(y0,3,15),  0.99),
    ("US8740541094","Take-Two Interactive","STOCK","BUY",  1.428889,178.00,date(y0,9,8),   0.99),
    ("US0378331005","Apple Inc",           "STOCK","BUY",  5.0,   168.00, date(y0,1,10),  0.99),
    ("US0378331005","Apple Inc",           "STOCK","BUY",  3.0,   175.00, date(y0,4,20),  0.99),
    ("US0378331005","Apple Inc",           "STOCK","SELL", 4.0,   192.00, date(y0,11,5),  0.99),
    ("US5949181045","Microsoft Corp",      "STOCK","BUY",  2.0,   340.00, date(y0,2,14),  0.99),
    ("US5949181045","Microsoft Corp",      "STOCK","BUY",  1.5,   365.00, date(today.year,1,8), 0.99),
    ("US5949181045","Microsoft Corp",      "STOCK","SELL", 1.0,   415.00, date(today.year,3,20),0.99),
    ("IE00B4L5Y983","iShares MSCI World",  "FUND", "BUY",  5.0,    85.00, date(y0,6,20),  0.50),
    ("IE00B4L5Y983","iShares MSCI World",  "FUND", "BUY",  5.0,    89.50, date(today.year,2,15),0.50),
    ("IE00B5BMR087","iShares Core S&P 500","FUND", "BUY",  3.0,   520.00, date(y0,5,10),  0.50),
    ("IE00B5BMR087","iShares Core S&P 500","FUND", "BUY",  1.0,   548.00, date(today.year,4,3), 0.50),
    ("US61174X1090","Monster Beverage",    "STOCK","BUY",  10.0,   48.00, date(y0,8,5),   0.99),
    ("US61174X1090","Monster Beverage",    "STOCK","SELL",  5.0,   52.00, date(y0,12,10), 0.99),
    ("US0231351067","Amazon.com Inc",      "STOCK","BUY",   2.0,  145.00, date(y0,7,18),  0.99),
    ("US0231351067","Amazon.com Inc",      "STOCK","BUY",   1.0,  162.00, date(today.year,3,5), 0.99),
]

for isin, name, asset, op, shares, price, dt, fee in trading_ops:
    amount = -(shares * price) if op == "BUY" else (shares * price)
    tx(dt=dt, type=op, account_category="TRADING",
       name=name, symbol=isin, asset_class=asset,
       shares=shares if op == "BUY" else -shares,
       price=price, amount=round(amount, 2), fee=fee)

# Dividendos
dividends = [
    ("US0378331005","Apple Inc",     date(y0,2,16),  4.20),
    ("US0378331005","Apple Inc",     date(y0,5,16),  4.20),
    ("US0378331005","Apple Inc",     date(y0,8,16),  4.85),
    ("US0378331005","Apple Inc",     date(y0,11,16), 4.85),
    ("US5949181045","Microsoft Corp",date(y0,3,10),  6.80),
    ("US5949181045","Microsoft Corp",date(y0,9,10),  7.30),
    ("US5949181045","Microsoft Corp",date(today.year,3,10),7.60),
    ("US61174X1090","Monster Beverage",date(y0,12,5),3.40),
    ("IE00B5BMR087","iShares Core S&P 500",date(y0,4,5),12.40),
    ("IE00B5BMR087","iShares Core S&P 500",date(y0,10,5),13.20),
]

for isin, name, dt, amount in dividends:
    tx(dt=dt, type="DIVIDEND", account_category="TRADING",
       name=name, symbol=isin, asset_class="STOCK", amount=amount)

# Stockperks (bonificaciones)
tx(dt=date(y0,6,1), type="STOCKPERK", account_category="TRADING",
   name="Trade Republic Bonus", symbol="DE000FD0F1S2", amount=1.50)

db.commit()
print(f"✓ TRADING: operaciones añadidas")

# ── Recurrentes ───────────────────────────────────────────────────────────────
detect_recurring(db, uid)
rg_count = db.query(models.RecurringGroup).filter(models.RecurringGroup.user_id == uid).count()
print(f"✓ Recurrentes detectados: {rg_count}")

# ── Deudas ────────────────────────────────────────────────────────────────────
debt1 = models.Debt(user_id=uid, name="Préstamo a Juan García",
    description="Le presté para el depósito del piso nuevo",
    total_amount=300.0, direction="OWED_TO_ME",
    due_date=date(today.year, 9, 1), is_settled=False)
db.add(debt1)

debt2 = models.Debt(user_id=uid, name="Cena cumpleaños María",
    description="Pagó por mí en el restaurante",
    total_amount=68.50, direction="I_OWE", is_settled=False)
db.add(debt2)

debt3 = models.Debt(user_id=uid, name="Viaje Lisboa con Pablo",
    description="Dividimos el Airbnb",
    total_amount=220.0, direction="OWED_TO_ME", is_settled=True)
db.add(debt3)

debt4 = models.Debt(user_id=uid, name="Concierto Rock in Rio",
    description="Compré las entradas, me deben la mitad",
    total_amount=150.0, direction="OWED_TO_ME",
    due_date=date(today.year, 7, 15), is_settled=False)
db.add(debt4)

db.commit()

# Pagos parciales
db.refresh(debt1)
db.refresh(debt3)
db.add(models.DebtPayment(debt_id=debt1.id, amount=100.0,
    payment_date=date(today.year, 3, 10), note="Primer pago"))
db.add(models.DebtPayment(debt_id=debt3.id, amount=220.0,
    payment_date=date(today.year-1, 11, 20), note="Saldado completo"))
db.commit()
print(f"✓ Deudas: 4")

# ── Objetivos ─────────────────────────────────────────────────────────────────
goals = [
    models.Goal(user_id=uid, name="Fondo de emergencia",
        type="EURO_TARGET", target_amount=6000.0, current_amount=2800.0,
        category="SAVINGS", deadline=date(today.year+1, 12, 31), is_active=True),
    models.Goal(user_id=uid, name="Viaje a Japón",
        type="EURO_TARGET", target_amount=2500.0, current_amount=950.0,
        category="SAVINGS", deadline=date(today.year+1, 6, 1), is_active=True),
    models.Goal(user_id=uid, name="Portátil MacBook",
        type="EURO_TARGET", target_amount=1800.0, current_amount=1800.0,
        category="SAVINGS", is_active=False),  # completado
    models.Goal(user_id=uid, name="Inversión mensual 15%",
        type="PERCENT", target_percent=15.0,
        category="INVESTMENT", is_active=True),
    models.Goal(user_id=uid, name="Gastos < 65%",
        type="PERCENT", target_percent=65.0,
        category="EXPENSES", is_active=True),
]
db.add_all(goals)

# Asignación de ahorro
db.add(models.SavingsAllocation(
    user_id=uid, month=today.strftime("%Y-%m"),
    savings_pct=20.0, investment_pct=15.0, expenses_pct=65.0))
# Mes anterior
prev = today.replace(day=1) - timedelta(days=1)
db.add(models.SavingsAllocation(
    user_id=uid, month=prev.strftime("%Y-%m"),
    savings_pct=20.0, investment_pct=15.0, expenses_pct=65.0))

db.commit()
print(f"✓ Objetivos: {len(goals)}")

# ── Resumen ───────────────────────────────────────────────────────────────────
total = db.query(models.Transaction).filter(models.Transaction.user_id == uid).count()
db.close()
print()
print("══════════════════════════════════════════")
print(f"  Demo listo → http://localhost:5173")
print(f"  Email:    {EMAIL}")
print(f"  Password: {PASSWORD}")
print(f"  Total transacciones: {total}")
print("══════════════════════════════════════════")
