"""Tipo de activo: deducido solo, con cambio manual que sobrevive a la copia."""
from backend import models, schemas
from backend.services import account_backup, asset_types


def _pos(symbol, name, asset_class="STOCK"):
    return schemas.PortfolioPosition(symbol=symbol, name=name, asset_class=asset_class, shares=1,
                                     avg_buy_price=1, total_invested=1, realized_pnl=0, dividends_received=0)


def test_classify_without_broker_type():
    yahoo = {"EGLN.L": "ETC", "IWDA.AS": "ETF", "TTWO": "STOCK"}.get
    positions = [
        _pos("EGLN.L", "Physical Gold USD (Acc)"),
        _pos("IWDA.AS", "Core MSCI World USD (Acc)"),
        _pos("TTWO", "Take-Two Interactive"),
        _pos("XX1", "Long 3.768,288 $"),
        _pos("BTC", "Bitcoin"),
        _pos("ES0165265002", "MyInvestor Nasdaq 100 FI", "FUND"),
        _pos("ZZZ", "Algo raro (Acc)"),
    ]
    auto = asset_types.classify(positions, yahoo=yahoo)
    assert auto == {"EGLN.L": "ETC", "IWDA.AS": "ETF", "TTWO": "STOCK", "XX1": "DERIVATIVE",
                    "BTC": "CRYPTO", "ES0165265002": "FUND", "ZZZ": "ETF"}


def test_yahoo_quote_types():
    assert asset_types.from_quote("ETF", "iShares Physical Gold ETC") == "ETC"
    assert asset_types.from_quote("ETF", "iShares Core MSCI World") == "ETF"
    assert asset_types.from_quote("MUTUALFUND") == "FUND"
    assert asset_types.from_quote("CRYPTOCURRENCY") == "CRYPTO"
    assert asset_types.from_quote("EQUITY", "Apple Inc.") == "STOCK"
    assert asset_types.from_quote(None) is None


def test_manual_override_endpoint_and_backup(user_client, db):
    c, uid = user_client
    r = c.put("/api/portfolio/asset-type", json={"symbol": "TTWO", "asset_class": "etf"})
    assert r.status_code == 200, r.text
    assert c.put("/api/portfolio/asset-type", json={"symbol": "TTWO", "asset_class": "nope"}).status_code == 400

    perf = schemas.PortfolioPerformance(total_invested=0, total_realized_pnl=0, total_fees=0, total_dividends=0,
                                        total_market_value=0, total_unrealized_pnl=0,
                                        positions=[_pos("TTWO", "Take-Two Interactive")], dividends_by_asset=[])
    orig = asset_types._yahoo_kind
    asset_types._yahoo_kind = lambda t: "STOCK"
    try:
        p = asset_types.apply(db, uid, perf).positions[0]
        assert (p.asset_class, p.asset_class_auto, p.asset_class_manual) == ("ETF", "STOCK", True)

        user = db.query(models.User).get(uid)
        doc = account_backup.parse_backup(account_backup.backup_bytes(db, user))
        assert doc["tables"]["asset_type_overrides"][0]["symbol"] == "TTWO"
        account_backup.restore(db, uid, doc)
        db.expire_all()
        assert asset_types.overrides(db, uid) == {"TTWO": "ETF"}

        # Una copia antigua, sin la tabla, también se restaura
        doc["tables"].pop("asset_type_overrides")
        account_backup.restore(db, uid, doc)
        db.expire_all()
        assert asset_types.overrides(db, uid) == {}

        assert c.put("/api/portfolio/asset-type", json={"symbol": "TTWO", "asset_class": None}).status_code == 200
        p = asset_types.apply(db, uid, perf).positions[0]
        assert (p.asset_class, p.asset_class_manual) == ("STOCK", False)
    finally:
        asset_types._yahoo_kind = orig
