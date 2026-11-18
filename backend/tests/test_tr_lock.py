"""Dos lecturas a la vez del WebSocket de TR se hacen por turnos."""
import asyncio

from backend.services.trade_republic_api import TradeRepublicAPI


class FakeWS:
    def __init__(self):
        self.reading = False
        self.n = 0

    async def portfolio(self):
        self.n += 1
        return self.n

    compact_portfolio = portfolio

    async def _recv_subscription(self, sid):
        if self.reading:
            raise RuntimeError("cannot call recv while another coroutine is already running recv")
        self.reading = True
        await asyncio.sleep(0.01)
        self.reading = False
        return {"positions": [], "sid": sid}

    async def unsubscribe(self, sid):
        pass


def test_concurrent_reads_are_serialized():
    api = TradeRepublicAPI("+34000", "0000")
    api._client = FakeWS()
    api._connected = True

    async def run():
        return await asyncio.gather(api.get_portfolio_positions(), api.get_compact_portfolio(),
                                    api.get_portfolio_positions())

    out = asyncio.run(run())
    assert len(out) == 3 and api.is_connected()
