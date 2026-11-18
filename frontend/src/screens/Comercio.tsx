// Comercio (tablero Comercio): gasto del mes, barras de 6 meses, categoría y movimientos.
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { catApi, txApi, type Transaction } from '@/lib/api'
import { accountName, averageTicket, countLabel, dayLabel, merchantBars, monthKey, monthName, monthRange, recentMonths, txNet, txTitle } from '@/lib/movements'
import { useIsPC } from '@/app/Shell'
import { CatTile } from '@/ui/Icon'
import { BackBtn, C, Divider, Empty, Label, RoundBtn, Section, Sheet, SheetOption, Skeleton, useMoney } from '@/ui/kit'
import { TxRow } from '@/ui/tx'
import { CatSheet } from './Movimientos'

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export default function Comercio() {
  const { name: raw = '' } = useParams()
  const name = decodeURIComponent(raw)
  const nav = useNavigate()
  const pc = useIsPC()
  const money = useMoney()
  const today = useMemo(() => new Date(), [])
  const cur = monthKey(today)
  const [menu, setMenu] = useState(false)
  const [catFor, setCatFor] = useState<Transaction[] | null>(null)

  const from = recentMonths(today, 6).slice(-1)[0] ?? cur
  const txs = useQuery({
    queryKey: ['transactions', 'merchant', name],
    queryFn: () => txApi.list({ search: name, page: 1, page_size: 200 }),
  })
  const byMonth = useQuery({
    queryKey: ['transactions', 'groups', 'month', 'merchant', name, from],
    queryFn: () => txApi.groups('month', { search: name, date_from: monthRange(from).date_from }),
  })
  const categories = useQuery({ queryKey: ['categories'], queryFn: catApi.list })

  const items = useMemo(() => {
    const all = txs.data?.items ?? []
    const exact = all.filter(t => norm(txTitle(t)) === norm(name))
    return exact.length ? exact : all
  }, [txs.data, name])
  const month = items.filter(t => t.date.slice(0, 7) === cur)
  const monthTotal = month.reduce((s, t) => s + txNet(t), 0)
  const bars = merchantBars(byMonth.data ?? [], today)
  const latest = items[0]
  const cat = latest?.category

  const header = (
    <header style={{ padding: pc ? 0 : '18px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
      <BackBtn />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: pc ? 28 : 22, fontWeight: 800, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</h1>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <RoundBtn icon="dots" label="Más opciones" bg={C.card} onClick={() => setMenu(true)} />
      </div>
    </header>
  )

  const wrap = pc ? { maxWidth: 640 } : undefined
  const cardMargin = pc ? '16px 0 0' : '16px 16px 0'

  return (
    <div style={wrap}>
      {header}
      {txs.isLoading ? (
        <div style={{ padding: pc ? '16px 0' : 16, display: 'grid', gap: 12 }}><Skeleton h={170} /><Skeleton h={64} /><Skeleton h={200} /></div>
      ) : items.length === 0 ? (
        <Empty icon="search" title="Sin movimientos" text={`No hay movimientos de ${name}.`} />
      ) : (
        <>
          <section style={{ margin: cardMargin, background: C.card, borderRadius: 24, padding: '16px 18px', boxShadow: 'var(--sh-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{monthName(cur)} · {countLabel(month.length)}</span>
                <p style={{ margin: '2px 0 0', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>{money(monthTotal, { sign: true, euro: true })}</p>
              </div>
              {month.length > 0 && <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>Media {money(averageTicket(monthTotal, month.length))}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              {bars.map(b => (
                <span key={b.month} title={money(b.value, { euro: true })} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: '100%', height: 70, display: 'flex', alignItems: 'flex-end' }}>
                    <span style={{ display: 'block', width: '100%', height: `${Math.max(b.ratio * 100, b.value > 0 ? 6 : 3)}%`, borderRadius: 7, background: b.current ? 'var(--c-8b85ff)' : 'var(--track)' }} />
                  </span>
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{b.label}</span>
                </span>
              ))}
            </div>
          </section>

          {latest && !latest.is_internal_transfer && (
            <section style={{ margin: pc ? '12px 0 0' : '12px 16px 0', background: C.card, borderRadius: 24, padding: '12px 16px', boxShadow: 'var(--sh-card)' }}>
              <a role="button" tabIndex={0} onClick={() => setCatFor([latest])} onKeyDown={e => e.key === 'Enter' && setCatFor([latest])}
                style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: 0, color: C.text, cursor: 'pointer' }}>
                <CatTile name={cat?.name} type={cat?.type} />
                <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: 700 }}>Categoría</span></span>
                <span style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ color: C.accentText, fontWeight: 800, fontSize: 14 }}>{cat?.name ?? 'Sin categoría'} · Cambiar</span>
                </span>
              </a>
            </section>
          )}

          <Label style={pc ? { margin: '22px 4px 8px' } : undefined}>Movimientos</Label>
          <Section style={pc ? { margin: 0 } : undefined}>
            {items.map((tx, i) => (
              <div key={tx.id}>
                {i > 0 && <Divider />}
                <TxRow tx={tx} sub={`${dayLabel(tx.date, today)} · ${accountName(tx.source)}`} />
              </div>
            ))}
          </Section>
        </>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={name}>
        <SheetOption icon="text-unordered" title="Ver en Movimientos" onClick={() => nav(`/transacciones?q=${encodeURIComponent(name)}&periodo=`)} />
        {latest && !latest.is_internal_transfer && <SheetOption icon="tag" title="Cambiar categoría" onClick={() => { setMenu(false); setCatFor([latest]) }} />}
      </Sheet>
      <CatSheet txs={catFor} categories={categories.data ?? []} onClose={() => setCatFor(null)} />
    </div>
  )
}
