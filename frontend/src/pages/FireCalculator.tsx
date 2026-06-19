import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashApi } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { Flame, TrendingUp, CalendarDays, Target, Percent } from 'lucide-react'

function smartFmt(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k€`
  return `${Math.round(v)}€`
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  highlight,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  accent?: string
  highlight?: boolean
}) {
  return (
    <Card className={highlight ? 'border-primary/30 bg-primary/[0.04]' : ''}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: (accent || 'hsl(var(--primary))') + '20' }}
          >
            <Icon className="h-4 w-4" style={{ color: accent || 'hsl(var(--primary))' }} />
          </div>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold text-right">{label}</span>
        </div>
        <p className="text-2xl font-bold tracking-tight" style={{ color: accent || 'hsl(var(--foreground))' }}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function FieldInput({ label, value, onChange, placeholder, type = 'number' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 text-sm"
      />
    </div>
  )
}

export function FireCalculator() {
  const { data: overview } = useQuery({ queryKey: ['overview'],           queryFn: () => dashApi.overview() })
  const { data: trend }    = useQuery({ queryKey: ['monthly-trend-fire'], queryFn: () => dashApi.monthlyTrend(6) })

  const avgMonthlySavings = useMemo(() => {
    if (!trend?.length) return 0
    return trend.reduce((s, m) => s + m.savings, 0) / trend.length
  }, [trend])

  const [currentNet,     setCurrentNet]     = useState('')
  const [monthlySaving,  setMonthlySaving]  = useState('')
  const [yearlyExpenses, setYearlyExpenses] = useState('')
  const [returnRate,     setReturnRate]     = useState('7')
  const [inflationRate,  setInflationRate]  = useState('3')
  const [age,            setAge]            = useState('')

  useEffect(() => {
    if (overview?.balance != null && !currentNet)
      setCurrentNet(String(Math.round(overview.balance)))
  }, [overview?.balance])

  useEffect(() => {
    if (avgMonthlySavings > 0 && !monthlySaving)
      setMonthlySaving(String(Math.round(avgMonthlySavings)))
  }, [avgMonthlySavings])

  useEffect(() => {
    if (overview?.expenses_month != null && !yearlyExpenses)
      setYearlyExpenses(String(Math.round(overview.expenses_month * 12)))
  }, [overview?.expenses_month])

  const params = {
    net:    parseFloat(currentNet    || String(Math.round(overview?.balance ?? 0))) || 0,
    saving: parseFloat(monthlySaving || String(Math.round(avgMonthlySavings)))      || 0,
    yearly: parseFloat(yearlyExpenses) || 0,
    ret:    parseFloat(returnRate)  / 100 || 0.07,
    inf:    parseFloat(inflationRate) / 100 || 0.03,
    age:    parseFloat(age) || null,
  }

  const fireTarget = params.yearly / 0.04
  const realReturn = (1 + params.ret) / (1 + params.inf) - 1

  const projection = useMemo(() => {
    if (!params.yearly) return []
    const rows: { year: number; patrimonio: number; objetivo: number }[] = []
    let pat = params.net
    const monthly = realReturn / 12
    for (let y = 0; y <= 50; y++) {
      rows.push({ year: y, patrimonio: Math.round(pat), objetivo: Math.round(fireTarget) })
      for (let m = 0; m < 12; m++) pat = pat * (1 + monthly) + params.saving
      if (pat >= fireTarget * 2) break
    }
    return rows
  }, [params.net, params.saving, params.yearly, realReturn, fireTarget])

  const yearsToFire = useMemo(() => {
    const row = projection.find(r => r.patrimonio >= fireTarget)
    return row ? row.year : null
  }, [projection, fireTarget])

  const fireAge = yearsToFire !== null && params.age ? params.age + yearsToFire : null
  const progressPct = fireTarget > 0 ? Math.min(100, Math.round((params.net / fireTarget) * 100)) : 0

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10">
          <Flame className="h-5 w-5 text-orange-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Calculadora FIRE</h1>
          <p className="text-xs text-muted-foreground">Financial Independence, Retire Early — ¿cuándo puedes vivir de tus inversiones?</p>
        </div>
      </div>

      {/* ── Compact input grid ── */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <FieldInput
              label="Patrimonio actual (€)"
              value={currentNet}
              onChange={setCurrentNet}
              placeholder={`${Math.round(overview?.balance ?? 0)}`}
            />
            <FieldInput
              label="Ahorro mensual (€)"
              value={monthlySaving}
              onChange={setMonthlySaving}
              placeholder={`${Math.round(avgMonthlySavings)}`}
            />
            <FieldInput
              label="Gastos anuales FIRE (€) *"
              value={yearlyExpenses}
              onChange={setYearlyExpenses}
              placeholder="Ej: 24000"
            />
            <FieldInput
              label="Tu edad actual"
              value={age}
              onChange={setAge}
              placeholder="Ej: 30"
            />
            <FieldInput
              label="Rentabilidad anual %"
              value={returnRate}
              onChange={setReturnRate}
            />
            <FieldInput
              label="Inflación anual %"
              value={inflationRate}
              onChange={setInflationRate}
            />
          </div>
          {!yearlyExpenses && (
            <p className="text-xs text-muted-foreground/60 mt-3">* Introduce tus gastos anuales en FIRE para ver la proyección</p>
          )}
        </CardContent>
      </Card>

      {/* ── KPI cards ── */}
      {params.yearly > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            icon={Target}
            label="Necesitas (regla 4%)"
            value={smartFmt(fireTarget)}
            sub={formatCurrency(fireTarget)}
            accent="#f97316"
          />
          <KpiCard
            icon={CalendarDays}
            label="Años hasta FIRE"
            value={yearsToFire !== null ? `${yearsToFire} años` : '+50 años'}
            sub={yearsToFire !== null ? 'con tu ahorro actual' : 'ahorra más cada mes'}
            highlight={yearsToFire !== null && yearsToFire <= 20}
          />
          <KpiCard
            icon={TrendingUp}
            label="Edad en FIRE"
            value={fireAge !== null ? `${fireAge} años` : '—'}
            sub={fireAge !== null ? `en ${yearsToFire} años` : 'indica tu edad actual'}
            accent="#a78bfa"
          />
          <KpiCard
            icon={Percent}
            label="Progreso actual"
            value={`${progressPct}%`}
            sub={`${formatCurrency(params.net)} de ${smartFmt(fireTarget)}`}
            accent="#22c55e"
          />
        </div>
      ) : (
        <Card className="flex items-center justify-center py-8">
          <p className="text-sm text-muted-foreground">Introduce tus gastos anuales para ver los KPIs</p>
        </Card>
      )}

      {/* ── Full-width projection chart ── */}
      {projection.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-4 px-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium">Proyección de patrimonio</p>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded-full bg-primary" />
                  Patrimonio
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-4 rounded-full bg-orange-400 opacity-60" style={{ backgroundImage: 'repeating-linear-gradient(to right, #f97316 0px, #f97316 5px, transparent 5px, transparent 9px)' }} />
                  Objetivo FIRE
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={projection} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="year" tickFormatter={v => `+${v}a`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tickFormatter={smartFmt} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={52} />
                <Tooltip
                  formatter={(v: number, name: string) => [formatCurrency(v), name === 'patrimonio' ? 'Patrimonio' : 'Objetivo FIRE']}
                  labelFormatter={v => `Año +${v}`}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                />
                {yearsToFire !== null && (
                  <ReferenceLine
                    x={yearsToFire}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="5 4"
                    label={{ value: 'FIRE 🔥', position: 'top', fontSize: 10, fill: 'hsl(var(--primary))' }}
                  />
                )}
                <Line type="monotone" dataKey="patrimonio" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="objetivo"   stroke="#f97316"              strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground/40 mt-2">
              Basado en la regla del 4% (SWR). Rentabilidad real = {((realReturn * 100).toFixed(2))}% (retorno – inflación). No es asesoramiento financiero.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
