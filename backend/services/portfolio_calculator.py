from typing import List, Dict
from sqlalchemy.orm import Session
from .. import models
from ..schemas import PortfolioPosition, PortfolioDividend, PortfolioPerformance


def calculate_portfolio(db: Session, user_id: int) -> PortfolioPerformance:
    trading_txs = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.user_id == user_id,
            models.Transaction.account_category == "TRADING",
        )
        .order_by(models.Transaction.datetime)
        .all()
    )

    # Group by symbol
    positions: Dict[str, dict] = {}
    dividends: Dict[str, dict] = {}
    total_fees = 0.0
    total_dividends = 0.0

    for tx in trading_txs:
        sym = tx.symbol or tx.name or "UNKNOWN"
        fee = abs(tx.fee or 0.0)
        total_fees += fee

        if tx.type in ("BUY",):
            if sym not in positions:
                positions[sym] = {
                    "symbol": sym,
                    "name": tx.name or sym,
                    "asset_class": tx.asset_class or "STOCK",
                    "shares": 0.0,
                    "total_cost": 0.0,
                    "realized_pnl": 0.0,
                }
            pos = positions[sym]
            bought = abs(tx.shares or 0.0)
            cost = abs(tx.amount) + fee
            pos["shares"] += bought
            pos["total_cost"] += cost

        elif tx.type in ("SELL",):
            if sym not in positions:
                positions[sym] = {
                    "symbol": sym,
                    "name": tx.name or sym,
                    "asset_class": tx.asset_class or "STOCK",
                    "shares": 0.0,
                    "total_cost": 0.0,
                    "realized_pnl": 0.0,
                }
            pos = positions[sym]
            sold = abs(tx.shares or 0.0)
            proceeds = abs(tx.amount) - fee
            if pos["shares"] > 0:
                avg_cost_per_share = pos["total_cost"] / pos["shares"]
                cost_basis = avg_cost_per_share * sold
                pnl = proceeds - cost_basis
                pos["realized_pnl"] += pnl
                pos["total_cost"] -= cost_basis
                pos["shares"] -= sold
                if pos["shares"] < 0.0001:
                    pos["shares"] = 0.0
                    pos["total_cost"] = 0.0

        elif tx.type in ("DIVIDEND", "STOCKPERK"):
            total_dividends += abs(tx.amount)
            if sym not in dividends:
                dividends[sym] = {"symbol": sym, "name": tx.name or sym, "total": 0.0, "count": 0}
            dividends[sym]["total"] += abs(tx.amount)
            dividends[sym]["count"] += 1

    result_positions = []
    total_invested = 0.0
    total_realized_pnl = 0.0

    for sym, pos in positions.items():
        shares = pos["shares"]
        total_cost = pos["total_cost"]
        avg_price = total_cost / shares if shares > 0.0001 else 0.0

        result_positions.append(PortfolioPosition(
            symbol=sym,
            name=pos["name"],
            asset_class=pos["asset_class"],
            shares=round(shares, 6),
            avg_buy_price=round(avg_price, 4),
            total_invested=round(total_cost, 2),
            realized_pnl=round(pos["realized_pnl"], 2),
            dividends_received=round(dividends.get(sym, {}).get("total", 0.0), 2),
        ))
        if shares > 0.0001:
            total_invested += total_cost
        total_realized_pnl += pos["realized_pnl"]

    result_positions.sort(key=lambda p: p.total_invested, reverse=True)

    div_list = [
        PortfolioDividend(**d) for d in sorted(dividends.values(), key=lambda x: x["total"], reverse=True)
    ]

    return PortfolioPerformance(
        total_invested=round(total_invested, 2),
        total_realized_pnl=round(total_realized_pnl, 2),
        total_fees=round(total_fees, 2),
        total_dividends=round(total_dividends, 2),
        positions=result_positions,
        dividends_by_asset=div_list,
    )
