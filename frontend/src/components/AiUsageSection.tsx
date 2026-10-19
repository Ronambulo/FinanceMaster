import { useQuery } from '@tanstack/react-query'
import { aiApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

export function AiUsageSection() {
  const { data: usage, isLoading } = useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => aiApi.getUsage(),
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando uso de IA...
      </div>
    )
  }

  if (!usage) return null

  const stats = [
    { label: 'Peticiones', value: usage.total_requests.toLocaleString('es-ES') },
    { label: 'Tokens totales', value: usage.total_tokens.toLocaleString('es-ES') },
    { label: 'Coste estimado', value: usage.total_estimated_cost > 0 ? `${usage.total_estimated_cost.toFixed(2)}€` : '—' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground">{s.label}</p>
              <p className="font-display tabular-nums text-xl font-semibold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Uso por mes</CardTitle></CardHeader>
        <CardContent className="p-0 pb-2">
          {usage.months.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">Todavía no has usado el asistente de IA.</p>
          )}
          <div className="divide-y divide-border">
            {usage.months.slice().reverse().map(m => (
              <div key={m.month} className="flex items-center gap-3 px-6 py-3 text-sm">
                <span className="font-medium flex-1">{m.month}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{m.requests} peticiones</span>
                <span className="text-xs text-muted-foreground tabular-nums hidden xs:inline">{m.total_tokens.toLocaleString('es-ES')} tokens</span>
                {m.estimated_cost > 0 && <span className="text-xs font-medium tabular-nums">{m.estimated_cost.toFixed(2)}€</span>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {usage.cost_per_1k_tokens === 0 && (
        <p className="text-xs text-muted-foreground">
          El modelo se ejecuta en un servidor propio, así que el coste estimado es 0€ salvo que el administrador configure un precio.
        </p>
      )}
    </div>
  )
}
