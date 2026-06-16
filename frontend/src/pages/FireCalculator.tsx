import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { Flame, ArrowRight } from 'lucide-react'

function smartFmt(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k€`
  return `${Math.round(v)}€`
}

export function FireCalculator() {
  const { data: overview } = useQuery({ queryKey: ['overview'], queryFn: () => dashApi.overview() })
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
  const chartRef = useRef<HTMLDivElement>(null)

  // Pre-fill defaults once API data arrives
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

  const netDefault    = currentNet    || String(Math.round(overview?.balance ?? 0))
  const savingDefault = monthlySaving || String(Math.round(avgMonthlySavings))

  const params = {
    net:    parseFloat(netDefault)    || 0,
    saving: parseFloat(savingDefault) || 0,
    yearly: parseFloat(yearlyExpenses) || 0,
    ret:    parseFloat(returnRate)    / 100 || 0.07,
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

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-400" /> Calculadora FIRE
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Financial Independence, Retire Early — ¿cuándo puedes vivir de tus inversiones?</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Tus datos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Patrimonio neto actual (€)</Label>
              <Input
                type="number"
                placeholder={`${Math.round(overview?.balance ?? 0)} (tu saldo actual)`}
                value={currentNet}
                onChange={e => setCurrentNet(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ahorro mensual (€)</Label>
              <Input
                type="number"
                placeholder={`${Math.round(avgMonthlySavings)} (media últimos 6m)`}
                value={monthlySaving}
                onChange={e => setMonthlySaving(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gastos anuales en FIRE (€) <span className="text-muted-foreground font-normal">*obligatorio</span></Label>
              <Input
                type="number"
                placeholder="Ej: 24000"
                value={yearlyExpenses}
                onChange={e => setYearlyExpenses(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tu edad actual</Label>
              <Input
                type="number"
                placeholder="Ej: 30"
                value={age}
                onChange={e => setAge(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Rentabilidad anual %</Label>
                <Input type="number" value={returnRate} onChange={e => setReturnRate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Inflación anual %</Label>
                <Input type="number" value={inflationRate} onChange={e => setInflationRate(e.target.value)} />
              </div>
            </div>
            <Button
              className="w-full mt-2"
              onClick={() => chartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              disabled={!yearlyExpenses}
            >
              <Flame className="h-4 w-4 mr-2 text-orange-400" />
              Ver mi proyección FIRE
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {params.yearly > 0 ? (
            <>
              <Card className="border-orange-500/20">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Patrimonio necesario (regla 4%)</p>
                  <p className="text-3xl font-bold text-orange-400">{formatCurrency(fireTarget)}</p>
                </CardContent>
              </Card>
              <Card className={yearsToFire !== null ? 'border-primary/20' : 'border-muted'}>
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Años hasta FIRE</p>
                  {yearsToFire !== null ? (
                    <>
                      <p className="text-3xl font-bold text-primary">{yearsToFire} años</p>
                      {fireAge && <p className="text-sm text-muted-foreground mt-1">A los <strong className="text-foreground">{fireAge}</strong> años</p>}
                    </>
                  ) : (
                    <p className="text-lg font-medium text-muted-foreground">+50 años con este ahorro</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Ahorro mensual real</p>
                    <p className="text-base font-semibold text-positive">{formatCurrency(params.saving)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rentabilidad real</p>
                    <p className="text-base font-semibold">{(realReturn * 100).toFixed(2)}%</p>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="flex items-center justify-center h-full min-h-[200px]">
              <p className="text-sm text-muted-foreground text-center px-6">Introduce tus gastos anuales en FIRE para ver la proyección</p>
            </Card>
          )}
        </div>
      </div>

      {projection.length > 0 && (
        <Card ref={chartRef}>
          <CardHeader><CardTitle className="text-sm font-medium">Proyección de patrimonio</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={projection} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="year" tickFormatter={v => `+${v}a`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tickFormatter={smartFmt} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={56} />
                <Tooltip
                  formatter={(v: number, name: string) => [formatCurrency(v), name === 'patrimonio' ? 'Patrimonio' : 'Objetivo FIRE']}
                  labelFormatter={v => `Año +${v}`}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                />
                {yearsToFire !== null && (
                  <ReferenceLine x={yearsToFire} stroke="hsl(var(--primary))" strokeDasharray="5 4"
                    label={{ value: `FIRE 🔥`, position: 'top', fontSize: 10, fill: 'hsl(var(--primary))' }} />
                )}
                <Line type="monotone" dataKey="patrimonio" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="patrimonio" />
                <Line type="monotone" dataKey="objetivo" stroke="#f97316" strokeWidth={1.5} strokeDasharray="5 4" dot={false} name="objetivo" />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-muted-foreground mt-2">Basado en la regla del 4% (SWR). Rentabilidad real = retorno – inflación. No es asesoramiento financiero.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
