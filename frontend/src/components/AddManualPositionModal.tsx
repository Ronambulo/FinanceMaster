import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '@/lib/api'
import type { StockSearchResult } from '@/lib/api'
import { Loader2, X, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

export function AddManualPositionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<StockSearchResult[]>([])
  const [searching, setSearching]   = useState(false)
  const [selected, setSelected]     = useState<StockSearchResult | null>(null)
  const [shares, setShares]         = useState('')
  const [avgPrice, setAvgPrice]     = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout>>()

  const addMutation = useMutation({
    mutationFn: portfolioApi.addManualPosition,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] })
      qc.invalidateQueries({ queryKey: ['portfolio-live'] })
      toast('Posición añadida correctamente', 'success')
      handleClose()
    },
    onError: () => toast('Error al añadir la posición', 'error'),
  })

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await portfolioApi.searchStocks(query)
        setResults(data)
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 350)
    return () => clearTimeout(debounce.current)
  }, [query])

  function handleSelect(r: StockSearchResult) {
    setSelected(r)
    setQuery(r.name)
    setResults([])
  }

  function handleClose() {
    setQuery(''); setResults([]); setSelected(null)
    setShares(''); setAvgPrice('')
    onClose()
  }

  function handleSubmit() {
    if (!selected || !shares || !avgPrice) return
    const sharesNum = parseFloat(shares.replace(',', '.'))
    const priceNum  = parseFloat(avgPrice.replace(',', '.'))
    if (isNaN(sharesNum) || isNaN(priceNum) || sharesNum <= 0 || priceNum <= 0) {
      toast('Introduce valores válidos', 'error'); return
    }
    addMutation.mutate({ ticker: selected.ticker, name: selected.name, shares: sharesNum, avg_price_eur: priceNum, currency: selected.currency })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-card shadow-2xl p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Añadir posición manual</h2>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Buscar acción / ETF</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Apple, MSCI World, AAPL…"
              value={query}
              onChange={e => { setQuery(e.target.value); if (selected) setSelected(null) }}
              autoFocus
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {/* Results dropdown */}
          {results.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-popover shadow-xl overflow-hidden">
              {results.map(r => (
                <button
                  key={r.ticker}
                  onClick={() => handleSelect(r)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.05] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">{r.ticker} · {r.exchange} · {r.currency}</p>
                  </div>
                  {r.type_disp && (
                    <span className="shrink-0 text-[10px] text-muted-foreground/60 border border-border rounded px-1.5 py-0.5">
                      {r.type_disp}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fields — shown once a ticker is selected */}
        {selected && (
          <>
            <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{selected.name}</p>
                <p className="text-[11px] text-muted-foreground">{selected.ticker} · {selected.exchange}</p>
              </div>
              <button onClick={() => { setSelected(null); setQuery('') }} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Nº de acciones</label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="10"
                  value={shares}
                  onChange={e => setShares(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Precio medio (€/acción)</label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="150.00"
                  value={avgPrice}
                  onChange={e => setAvgPrice(e.target.value)}
                />
              </div>
            </div>

            {shares && avgPrice && (
              <p className="text-xs text-muted-foreground">
                Coste total estimado: <span className="text-foreground font-medium">
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(
                    parseFloat(shares.replace(',', '.')) * parseFloat(avgPrice.replace(',', '.'))
                  )}
                </span>
              </p>
            )}
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
          <Button
            className="flex-1"
            disabled={!selected || !shares || !avgPrice || addMutation.isPending}
            onClick={handleSubmit}
          >
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Añadir posición'}
          </Button>
        </div>
      </div>
    </div>
  )
}
