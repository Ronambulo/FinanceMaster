import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronDown, ChevronUp, Target, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { goalApi } from '@/lib/api'
import { useToast } from '@/components/ui/toast'

const STORAGE_KEY = 'fm-baby-steps-progress'

interface Step {
  number: number
  title: string
  description: string
  detail: string
  target?: string
  action?: { label: string; route: string }
  goalAmount?: number
}

const STEPS: Step[] = [
  {
    number: 1,
    title: 'Fondo de emergencia inicial',
    description: 'Ahorra €1.000 como colchón frente a imprevistos',
    detail:
      'Este primer paso te da un pequeño escudo mientras pagas tus deudas. No uses tarjeta de crédito para emergencias: tener este dinero en efectivo te da tranquilidad y evita endeudarte más.',
    target: '€1.000',
    goalAmount: 1000,
  },
  {
    number: 2,
    title: 'Elimina todas las deudas',
    description: 'Paga todas tus deudas (excepto la hipoteca) con la bola de nieve',
    detail:
      'Ordena tus deudas de menor a mayor saldo. Paga el mínimo en todas excepto la más pequeña, a la que destinas todo lo que puedas. Cuando la liquides, traslada ese pago a la siguiente. La "bola de nieve" gana impulso.',
    action: { label: 'Ver mis deudas', route: '/deudas' },
  },
  {
    number: 3,
    title: 'Fondo de emergencia completo',
    description: 'Acumula entre 3 y 6 meses de gastos',
    detail:
      'Una vez libre de deudas, amplía tu fondo. Calcula tus gastos mensuales reales (sin lujos) y ahorra entre 3 y 6 meses de esa cantidad. Guárdalo en una cuenta de alta liquidez, separada de tu cuenta corriente.',
    target: '3–6 meses de gastos',
    goalAmount: 6000,
  },
  {
    number: 4,
    title: 'Invierte el 15% en jubilación',
    description: 'Destina el 15% de tus ingresos brutos a pensiones e inversión',
    detail:
      'Maximiza las aportaciones con ventajas fiscales (plan de pensiones, EPSV…) y, si sobra, invierte en fondos indexados de bajo coste. La capitalización compuesta trabaja mejor cuanto antes empieces.',
    target: '15% del ingreso bruto',
    action: { label: 'Ver portfolio', route: '/portfolio' },
  },
  {
    number: 5,
    title: 'Ahorra para la universidad',
    description: 'Si tienes hijos, empieza a ahorrar para su educación',
    detail:
      'No sacrifiques la jubilación por este paso: primero asegúrate el paso 4. Recuerda que hay becas y préstamos para estudiar, pero no los hay para jubilarse.',
    action: { label: 'Ir a objetivos', route: '/objetivos' },
  },
  {
    number: 6,
    title: 'Paga la hipoteca antes de tiempo',
    description: 'Amortiza anticipadamente hasta cancelarla',
    detail:
      'Aplica cualquier dinero extra directamente al principal de tu hipoteca. Ser propietario sin deuda es uno de los mayores hitos hacia la libertad financiera. Calcula cuánto antes puedes saldarla con amortizaciones parciales.',
  },
  {
    number: 7,
    title: 'Construye riqueza y da generosamente',
    description: 'Invierte sin límite y comparte tu prosperidad',
    detail:
      'Sin deudas, con la jubilación encaminada y la hipoteca pagada, ahora puedes invertir en inmuebles, bolsa, negocios… Y también ayudar a otros: familia, causas sociales, comunidad. Este paso dura toda la vida.',
    action: { label: 'Ver portfolio', route: '/portfolio' },
  },
]

export function BabySteps() {
  const { toast } = useToast()
  const navigate = useNavigate()

  const [completed, setCompleted] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })

  const [expanded, setExpanded] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      const done = saved ? new Set<number>(JSON.parse(saved)) : new Set<number>()
      return STEPS.find(s => !done.has(s.number))?.number ?? null
    } catch {
      return 1
    }
  })

  const [creatingGoal, setCreatingGoal] = useState<number | null>(null)

  function toggle(n: number) {
    setCompleted(prev => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  async function createGoal(step: Step) {
    if (!step.goalAmount) return
    setCreatingGoal(step.number)
    try {
      await goalApi.create({
        name: step.title,
        type: 'EURO_TARGET',
        target_amount: step.goalAmount,
        is_active: true,
      })
      toast(`Objetivo "${step.title}" creado`, 'success')
      navigate('/objetivos')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al crear objetivo', 'error')
    } finally {
      setCreatingGoal(null)
    }
  }

  const currentStep = STEPS.find(s => !completed.has(s.number))?.number ?? null
  const pct = Math.round((completed.size / STEPS.length) * 100)
  const circumference = 2 * Math.PI * 34

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">7 Baby Steps</h1>
        <p className="text-sm text-muted-foreground mt-1">
          El plan de Dave Ramsey para eliminar deudas y construir riqueza paso a paso.
        </p>
      </div>

      {/* Progress hero */}
      <div className="rounded-2xl border bg-card p-5 flex items-center gap-5">
        {/* Circular progress */}
        <div className="relative shrink-0 h-20 w-20">
          <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
            <circle cx="40" cy="40" r="34" fill="none" strokeWidth="6" className="stroke-white/[0.06]" />
            <circle
              cx="40" cy="40" r="34"
              fill="none" strokeWidth="6" strokeLinecap="round"
              className="stroke-primary transition-all duration-700"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct / 100)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold leading-none">{completed.size}</span>
            <span className="text-[10px] text-muted-foreground">de 7</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {completed.size === STEPS.length ? (
            <>
              <p className="font-semibold text-primary">Libertad financiera total</p>
              <p className="text-xs text-muted-foreground mt-0.5">Has completado todos los pasos.</p>
            </>
          ) : currentStep ? (
            <>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">En curso</p>
              <p className="font-semibold text-sm leading-tight">Baby Step {currentStep}</p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{STEPS[currentStep - 1].title}</p>
            </>
          ) : null}

          {/* Milestone bar */}
          <div className="flex gap-1 mt-3">
            {STEPS.map(s => (
              <div
                key={s.number}
                className={cn(
                  'h-1 rounded-full flex-1 transition-all duration-300',
                  completed.has(s.number)
                    ? 'bg-primary'
                    : s.number === currentStep
                    ? 'bg-primary/35'
                    : 'bg-white/[0.08]',
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Steps timeline */}
      <div className="relative">
        {/* Vertical connector */}
        <div className="absolute left-[1.3125rem] top-5 bottom-5 w-px bg-white/[0.07]" />

        <div className="space-y-2">
          {STEPS.map(step => {
            const isDone = completed.has(step.number)
            const isActive = step.number === currentStep
            const isLocked = !isDone && !isActive
            const isOpen = expanded === step.number

            return (
              <div key={step.number} className="relative flex gap-4">
                {/* Circle indicator */}
                <button
                  onClick={() => toggle(step.number)}
                  title={isDone ? 'Marcar como pendiente' : 'Marcar como completado'}
                  className={cn(
                    'relative z-10 shrink-0 h-[2.625rem] w-[2.625rem] rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-200 mt-3',
                    isDone
                      ? 'bg-primary border-primary text-primary-foreground shadow-none'
                      : isActive
                      ? 'bg-card border-primary text-primary'
                      : 'bg-card border-white/[0.12] text-muted-foreground/30',
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : step.number}
                </button>

                {/* Card */}
                <div
                  className={cn(
                    'flex-1 min-w-0 rounded-2xl border transition-all duration-200',
                    isActive && !isDone && 'border-primary/25 bg-primary/[0.04]',
                    isDone && 'opacity-55',
                    isLocked && 'opacity-35',
                  )}
                >
                  {/* Clickable header */}
                  <button
                    onClick={() => setExpanded(isOpen ? null : step.number)}
                    className="w-full text-left p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-tight">
                          Baby Step {step.number}: {step.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                        {step.target && !isLocked && (
                          <span className="inline-block mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 rounded-full px-2 py-0.5">
                            Meta: {step.target}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-muted-foreground/50 mt-0.5">
                        {isOpen
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </span>
                    </div>
                  </button>

                  {/* Expanded panel */}
                  {isOpen && (
                    <div className="border-t border-white/[0.06] px-4 py-4 space-y-4">
                      <p className="text-sm text-muted-foreground leading-relaxed">{step.detail}</p>

                      {!isLocked && (
                        <div className="flex flex-wrap gap-2">
                          {step.goalAmount && !isDone && (
                            <Button
                              size="sm"
                              onClick={() => createGoal(step)}
                              disabled={creatingGoal === step.number}
                              className="gap-1.5"
                            >
                              <Target className="h-3.5 w-3.5" />
                              Crear objetivo de ahorro
                            </Button>
                          )}
                          {step.action && !isDone && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => navigate(step.action!.route)}
                            >
                              {step.action.label}
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={() => toggle(step.number)}
                          >
                            {isDone ? 'Marcar como pendiente' : 'Marcar como completado'}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground/40 pb-2">
        Metodología de Dave Ramsey · Pasos en orden secuencial
      </p>
    </div>
  )
}
