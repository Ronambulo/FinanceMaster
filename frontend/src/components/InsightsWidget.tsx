import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dashApi } from '@/lib/api'
import type { Insight } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, RefreshCw, Lightbulb, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'

const SEVERITY_CONFIG = {
  warning:  { icon: AlertTriangle,  color: '#f59e0b', bg: 'bg-amber-500/10',   ring: 'ring-amber-500/20'  },
  positive: { icon: CheckCircle2,   color: '#22c55e', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
  info:     { icon: Info,           color: '#38bdf8', bg: 'bg-sky-500/10',     ring: 'ring-sky-500/20'    },
}

function InsightCard({ insight, onRead }: { insight: Insight; onRead: (id: number) => void }) {
  const cfg = SEVERITY_CONFIG[insight.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info
  const Icon = cfg.icon

  return (
    <div className="relative flex flex-col gap-3 px-1 py-0.5">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1', cfg.bg, cfg.ring)}>
          <Icon className="h-4 w-4" style={{ color: cfg.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight" style={{ color: cfg.color }}>
            {insight.title}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {insight.message}
          </p>
        </div>
      </div>
      {!insight.is_read && (
        <button
          onClick={() => onRead(insight.id)}
          className="self-end text-[10px] font-medium text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          Marcar como leído
        </button>
      )}
    </div>
  )
}

export function InsightsWidget() {
  const qc = useQueryClient()
  const [idx, setIdx] = useState(0)

  const { data: insights = [], isLoading } = useQuery({
    queryKey: ['insights'],
    queryFn: dashApi.insights,
    staleTime: 5 * 60_000,
  })

  const readMutation = useMutation({
    mutationFn: (id: number) => dashApi.markInsightRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights'] }),
  })

  const refreshMutation = useMutation({
    mutationFn: dashApi.refreshInsights,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insights'] })
      setIdx(0)
    },
  })

  const unread = insights.filter(i => !i.is_read)
  const displayIdx = Math.min(idx, Math.max(0, unread.length - 1))
  const current = unread[displayIdx]
  const total = unread.length

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-card p-5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
      <div className="pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full bg-sky-500/[0.06] blur-3xl" />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10">
              <Lightbulb className="h-3.5 w-3.5 text-sky-400" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Insights
            </span>
            {unread.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white">
                {unread.length}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw className={cn('h-3 w-3 text-muted-foreground', refreshMutation.isPending && 'animate-spin')} />
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center h-16 text-xs text-muted-foreground">
            Analizando tus finanzas…
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-4">
            <p className="text-sm font-medium text-muted-foreground">Todo en orden</p>
            <p className="text-xs text-muted-foreground/50">No hay insights por el momento</p>
          </div>
        ) : current ? (
          <InsightCard
            insight={current}
            onRead={id => readMutation.mutate(id)}
          />
        ) : null}

        {/* Navigation dots */}
        {total > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.05]">
            <button
              onClick={() => setIdx(i => Math.max(0, i - 1))}
              disabled={displayIdx === 0}
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1.5">
              {unread.map((ins, i) => (
                <button
                  key={ins.id}
                  onClick={() => setIdx(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === displayIdx ? 'w-4 bg-sky-400' : 'w-1.5 bg-white/20 hover:bg-white/40'
                  )}
                />
              ))}
            </div>

            <button
              onClick={() => setIdx(i => Math.min(total - 1, i + 1))}
              disabled={displayIdx === total - 1}
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function useInsightsUnreadCount() {
  const { data: insights = [] } = useQuery({
    queryKey: ['insights'],
    queryFn: dashApi.insights,
    staleTime: 5 * 60_000,
  })
  return insights.filter(i => !i.is_read).length
}
