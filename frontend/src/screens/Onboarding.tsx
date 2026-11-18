// Bienvenida en 3 pasos (tableros OnbModo, OnbModulos y OnbCuentas).
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dashApi } from '@/lib/api'
import type { ModuleId, UiMode } from '@/lib/preferences'
import { usePreferencesStore } from '@/store/preferences'
import { BankLogo, bankId, type BankId } from '@/ui/BankLogo'
import { Icon, type AnyIcon } from '@/ui/Icon'
import { Btn, C, Divider, Pill, Section, Switch } from '@/ui/kit'

function Steps({ step, title, sub }: { step: number; title: string; sub: string }) {
  return (
    <div style={{ padding: '22px 20px 0' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3].map(i => <span key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= step ? C.accent : 'var(--track)' }} />)}
      </div>
      <p style={{ margin: '26px 0 0', fontSize: 13, fontWeight: 700, color: C.muted }}>Paso {step} de 3</p>
      <h1 style={{ margin: '4px 0 6px', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{title}</h1>
      <p style={{ margin: 0, color: C.muted, fontWeight: 600 }}>{sub}</p>
    </div>
  )
}

function Bottom({ children, two }: { children: ReactNode; two?: boolean }) {
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '12px 20px 30px', background: `linear-gradient(transparent, ${C.bg} 30%)` }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'grid', gridTemplateColumns: two ? '1fr 2fr' : '1fr', gap: 10 }}>{children}</div>
    </div>
  )
}

function ModeCard({ selected, onClick, preview, title, text }: { selected: boolean; onClick: () => void; preview: ReactNode; title: string; text: string }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} style={{ width: '100%', textAlign: 'left', border: `2px solid ${selected ? C.accent : 'transparent'}`, borderRadius: 24, background: C.card, padding: 16, margin: '0 0 12px', display: 'grid', gridTemplateColumns: '96px 1fr 24px', gap: 14, alignItems: 'center', color: C.text, cursor: 'pointer', boxShadow: 'var(--sh-card)', fontFamily: 'inherit' }}>
      {preview}
      <span>
        <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 13, color: C.muted, fontWeight: 600, marginTop: 2 }}>{text}</span>
      </span>
      {selected
        ? <span style={{ width: 24, height: 24, borderRadius: '50%', background: C.accent, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check-mark" size={14} /></span>
        : <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.line}` }} />}
    </button>
  )
}

const bar = (w: number, bg: string) => <span style={{ width: w, height: 7, borderRadius: 4, background: bg }} />

const UltraPreview = (
  <span aria-hidden="true" style={{ height: 110, borderRadius: 16, background: C.field, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
    <span style={{ fontSize: 16, fontWeight: 800 }}>907 €</span>
    <span style={{ width: 56, height: 5, borderRadius: 9, background: 'var(--track)', overflow: 'hidden' }}><span style={{ display: 'block', width: '52%', height: '100%', background: 'var(--c-8b85ff)' }} /></span>
    <span style={{ width: 60, height: 16, borderRadius: 6, background: C.accent }} />
  </span>
)
const NormalPreview = (
  <span aria-hidden="true" style={{ height: 110, borderRadius: 16, background: C.field, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 6, padding: '0 12px' }}>
    {bar(40, 'var(--c-8b85ff)')}{bar(62, 'var(--track)')}{bar(52, 'var(--track)')}
    <span style={{ display: 'flex', gap: 4 }}>{bar(22, 'var(--c-6fe0a5)')}{bar(22, 'var(--c-ff9b9b)')}</span>
    {bar(58, 'var(--track)')}{bar(46, 'var(--track)')}
  </span>
)

const ONB_MODULES: { id: ModuleId; icon: AnyIcon; label: string; desc: string; on: boolean }[] = [
  { id: 'investments', icon: 'cat-inversion', label: 'Inversiones', desc: 'Brokers, posiciones y rentabilidad', on: true },
  { id: 'budgets', icon: 'pie', label: 'Presupuestos', desc: 'Límites por categoría', on: true },
  { id: 'goals', icon: 'safe-open', label: 'Objetivos', desc: 'Huchas para metas', on: true },
  { id: 'debts', icon: 'receipt', label: 'Deudas', desc: 'Préstamos y lo que te deben', on: false },
  { id: 'achievements', icon: 'trophy', label: 'Logros', desc: 'Rachas y medallas', on: false },
  { id: 'ai', icon: 'sparkle', label: 'Asistente IA', desc: 'Preguntas sobre tus gastos', on: false },
]

const ONB_ACCOUNTS: { id: BankId | 'cash'; name: string; sub: string; to: string }[] = [
  { id: 'n26', name: 'N26', sub: 'Banco · CSV', to: '/importar?banco=n26' },
  { id: 'revolut', name: 'Revolut', sub: 'Banco · CSV', to: '/importar?banco=revolut' },
  { id: 'trade_republic', name: 'Trade Republic', sub: 'Broker · conexión directa', to: '/cuentas/trade-republic' },
  { id: 'myinvestor', name: 'MyInvestor', sub: 'Broker · CSV de órdenes', to: '/importar?banco=myinvestor' },
  { id: 'bbva', name: 'BBVA', sub: 'Banco · CSV', to: '/importar?banco=bbva' },
  { id: 'caixabank', name: 'CaixaBank', sub: 'Banco · CSV', to: '/importar?banco=caixabank' },
  { id: 'cash', name: 'Efectivo', sub: 'Cartera manual', to: '/cuentas/nueva?tipo=efectivo' },
]

export default function Onboarding() {
  const nav = useNavigate()
  const { prefs, update } = usePreferencesStore()
  const [step, setStep] = useState(prefs.initialized ? 3 : 1)
  const [mode, setMode] = useState<UiMode>(prefs.ui_mode)
  const [mods, setMods] = useState<Record<string, boolean>>(() => Object.fromEntries(ONB_MODULES.map(m => [m.id, m.on])))
  const [saving, setSaving] = useState(false)
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: dashApi.accounts, enabled: step === 3 })
  const added = new Set((accounts.data ?? []).filter(a => a.count > 0).map(a => (a.source === 'manual' ? 'cash' : bankId(a.source))))

  async function save() {
    setSaving(true)
    try { await update({ ui_mode: mode, modules: mods }) } finally { setSaving(false) }
  }

  if (step === 1) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', minHeight: '100dvh', paddingBottom: 120, boxSizing: 'border-box' }}>
        <Steps step={1} title="¿Cómo quieres ver tu dinero?" sub="Puedes cambiarlo cuando quieras en Ajustes" />
        <div style={{ padding: '24px 16px 0' }}>
          <ModeCard selected={mode === 'ultra'} onClick={() => setMode('ultra')} preview={UltraPreview} title="Ultra simple" text="Cuánto te queda, añadir gasto y poco más" />
          <ModeCard selected={mode === 'normal'} onClick={() => setMode('normal')} preview={NormalPreview} title="Normal" text="Cuentas, inversiones, presupuestos y objetivos" />
        </div>
        <Bottom><Btn onClick={() => setStep(2)}>Continuar</Btn></Bottom>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', minHeight: '100dvh', paddingBottom: 120, boxSizing: 'border-box' }}>
        <Steps step={2} title="Elige qué ver" sub="Lo que apagues no aparece en ningún sitio" />
        <Section pad="6px 16px" style={{ marginTop: 22 }}>
          {ONB_MODULES.map((m, i) => (
            <div key={m.id}>
              {i > 0 && <Divider />}
              <div style={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '9px 0' }}>
                <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, background: C.soft, color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={m.icon} size={18} /></span>
                <span>
                  <span style={{ display: 'block', fontWeight: 700 }}>{m.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>{m.desc}</span>
                </span>
                <Switch on={!!mods[m.id]} label={m.label} onChange={v => setMods(s => ({ ...s, [m.id]: v }))} />
              </div>
            </div>
          ))}
        </Section>
        <Bottom two>
          <Btn kind="secondary" onClick={() => setStep(1)}>Atrás</Btn>
          <Btn disabled={saving} onClick={async () => { await save(); setStep(3) }}>Continuar</Btn>
        </Bottom>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', minHeight: '100dvh', paddingBottom: 120, boxSizing: 'border-box' }}>
      <Steps step={3} title="Añade tus cuentas" sub="Empieza con una; luego puedes añadir más" />
      <Section pad="6px 16px" style={{ marginTop: 22 }}>
        {ONB_ACCOUNTS.map((a, i) => (
          <div key={a.id}>
            {i > 0 && <Divider />}
            <button type="button" onClick={() => nav(a.to)} style={{ width: '100%', border: 0, background: 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '10px 0', color: C.text }}>
              {a.id === 'cash'
                ? <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 13, background: C.field, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="wallet" size={20} /></span>
                : <BankLogo id={a.id} />}
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700 }}>{a.name}</span>
                <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>{a.sub}</span>
              </span>
              <span style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {added.has(a.id) ? <Pill>Añadida</Pill> : <span style={{ color: C.accentText, display: 'flex' }}><Icon name="plus" size={20} /></span>}
              </span>
            </button>
          </div>
        ))}
      </Section>
      <Bottom two>
        <Btn kind="secondary" onClick={() => nav('/')}>Saltar</Btn>
        <Btn onClick={() => nav('/')}>Empezar</Btn>
      </Bottom>
    </div>
  )
}
