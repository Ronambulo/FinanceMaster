// Ajustes: hub móvil, subpantallas, dos columnas en PC y la versión ultra simple.
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { create } from 'zustand'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  accountApi, aiApi, authApi, catApi, exportApi, integrationsApi, trApi, webhookApi,
  type Category, type CategoryRule, type ExportFormat,
} from '@/lib/api'
import { PCHeader, useIsPC } from '@/app/Shell'
import { useAuthStore } from '@/store/auth'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { usePreferencesStore } from '@/store/preferences'
import { usePrivacyStore } from '@/store/privacy'
import { CURRENCIES, MODULES, MONTH_START_MAX, type CatIcons, type UltraModuleId, type Currency, type ModuleId } from '@/lib/preferences'
import type { ThemeMode } from '@/lib/theme'
import { LOCK_CHOICES, getLockMinutes, lockLabel, setLockMinutes, type LockMinutes } from '@/lib/autolock'
import { lastAccessShort } from '@/lib/admin'
import { creationOptions, credentialToJSON, getDevicePasskey, isCancel, passkeySupported, setDevicePasskey } from '@/lib/passkey'
import {
  ACCENTS, TEXT_SIZES, getAccent, getHideOnOpen, getReduceMotion, getTextSize,
  setAccent, setHideOnOpen, setReduceMotion, setTextSize, type AccentId, type TextSize,
} from '@/lib/appearance'
import { confirm } from '@/ui/Confirm'
import { toast } from '@/ui/Toast'
import { CatTile, Icon, type AnyIcon } from '@/ui/Icon'
import {
  Avatar, Btn, C, Divider, Field, Header, IconTile, Label, PickField, Pill, RoundBtn, Rows, Section, Segmented,
  SetRow, Sheet, SheetOption, Skeleton, SubHeader, Switch,
  Empty, KV, useMoney,
} from '@/ui/kit'
import pkg from '../../package.json'

const errText = (e: unknown, fb = 'No se pudo completar') => (e instanceof Error && e.message ? e.message : fb)
const VERSION = (pkg as { version?: string }).version ?? '1.0.0'
const LAST_BACKUP_KEY = 'fm-last-backup'

export type SecId = 'perfil' | 'modo' | 'apariencia' | 'categorias' | 'integraciones' | 'atajos' | 'datos' | 'seguridad' | 'diagnostico'
const TITLES: Record<SecId, string> = {
  perfil: 'Perfil', modo: 'Modo y módulos', apariencia: 'Apariencia', categorias: 'Categorías y reglas',
  integraciones: 'Integraciones', atajos: 'Atajos de iPhone', datos: 'Datos y copias', seguridad: 'Seguridad', diagnostico: 'Uso y diagnóstico',
}
const PC_TITLES: Record<SecId, string> = {
  ...TITLES, modo: 'Nivel de la app', categorias: 'Categorías', diagnostico: 'Diagnóstico',
}
const isSec = (s?: string): s is SecId => !!s && s in TITLES

// ── Utilidades ──────────────────────────────────────────────────────────────
const muted: CSSProperties = { color: C.muted, fontWeight: 600 }
const THEME_NAME: Record<ThemeMode, string> = { light: 'Claro', dark: 'Oscuro', system: 'Sistema' }

function when(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const hm = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86_400_000)
  if (diff === 0) return `hoy ${hm}`
  if (diff === 1) return `ayer ${hm}`
  if (diff < 7) return `hace ${diff} días`
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

function ago(iso?: string | null): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

const fmtInt = (n: number) => n.toLocaleString('es-ES')

async function copy(text: string, done = 'Copiado') {
  try { await navigator.clipboard.writeText(text); toast(done) } catch { toast('No se pudo copiar', { error: true }) }
}

function Muted({ children }: { children: ReactNode }) {
  return <span style={muted}>{children}</span>
}

/** Bloque de ajustes: etiqueta + sección en móvil, tarjeta con título en PC. */
function Group({ title, children, pad, action }: { title?: ReactNode; children: ReactNode; pad?: string; action?: ReactNode }) {
  const pc = useIsPC()
  if (pc) {
    return (
      <section style={{ background: C.card, borderRadius: 22, padding: pad === '16px' ? '20px 24px' : '16px 24px', boxShadow: 'var(--sh-card)', marginBottom: 16 }}>
        {(title || action) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title}</h2>
            {action}
          </div>
        )}
        {children}
      </section>
    )
  }
  return (
    <>
      {title ? <Label>{title}</Label> : <div style={{ height: 18 }} />}
      <Section pad={pad}>{children}</Section>
    </>
  )
}

/** Fila con icono y un control a la derecha (interruptor, valor…). */
function ToggleRow({ icon, title, sub, on, onChange, disabled }: { icon: AnyIcon; title: string; sub?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <SetRow icon={icon} title={title} sub={sub} trail={<Switch on={on} onChange={onChange} label={title} disabled={disabled} />} />
}

// ── Pantalla ────────────────────────────────────────────────────────────────
export default function Ajustes() {
  const { sec } = useParams()
  const pc = useIsPC()
  const ultra = usePreferencesStore(s => s.prefs.ui_mode === 'ultra')
  if (sec && !isSec(sec)) return <Navigate to="/ajustes" replace />
  if (pc) return <PCAjustes sec={isSec(sec) ? sec : 'perfil'} />
  if (!sec) return ultra ? <UltraAjustes /> : <Hub />
  return (
    <div style={{ paddingBottom: 40 }}>
      <SecHeader sec={sec as SecId} />
      <Body sec={sec as SecId} />
    </div>
  )
}

function SecHeader({ sec }: { sec: SecId }) {
  if (sec === 'categorias') return <CategoriasHeader />
  return <SubHeader title={TITLES[sec]} back="/ajustes" />
}

function Body({ sec }: { sec: SecId }) {
  switch (sec) {
    case 'perfil': return <PerfilBody />
    case 'modo': return <ModoBody />
    case 'apariencia': return <AparienciaBody />
    case 'categorias': return <CategoriasBody />
    case 'integraciones': return <IntegracionesBody />
    case 'atajos': return <AtajosCard />
    case 'datos': return <DatosBody />
    case 'seguridad': return <SeguridadBody />
    case 'diagnostico': return <DiagnosticoBody />
  }
}

function useLogout() {
  const logout = useAuthStore(s => s.logout)
  const nav = useNavigate()
  return async () => {
    const ok = await confirm({ title: '¿Cerrar sesión?', text: 'Tendrás que volver a entrar con tu usuario y contraseña.', action: 'Cerrar sesión', icon: 'power-switch' })
    if (!ok) return
    logout()
    nav('/login', { replace: true })
  }
}

// ── Hub móvil ───────────────────────────────────────────────────────────────
function Hub() {
  const user = useAuthStore(s => s.user)
  const prefs = usePreferencesStore(s => s.prefs)
  const logout = useLogout()
  const on = (Object.keys(MODULES) as ModuleId[]).filter(id => prefs.modules[id]).length
  const accent = ACCENTS.find(a => a.id === getAccent())!.name
  return (
    <div style={{ paddingBottom: 40 }}>
      <Header title="Ajustes" />
      <Section pad="14px 16px" style={{ marginTop: 18 }}>
        <Link to="/ajustes/perfil" style={{ display: 'grid', gridTemplateColumns: '48px 1fr 18px', gap: 14, alignItems: 'center', color: C.text }}>
          <Avatar name={user?.display_name || user?.username} size={48} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 800, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.display_name || user?.username}</span>
            <span style={{ display: 'block', fontSize: 13, ...muted }}>Usuario · {user?.username}</span>
          </span>
          <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span>
        </Link>
      </Section>

      <Label>App</Label>
      <Section>
        <Rows>
          <SetRow icon="sliders" title="Modo y módulos" sub={`${prefs.ui_mode === 'ultra' ? 'Ultra simple' : 'Normal'} · ${on} módulos`} to="/ajustes/modo" />
          <SetRow icon="color-palette" title="Apariencia" sub={`${THEME_NAME[prefs.theme]} · ${accent}`} to="/ajustes/apariencia" />
        </Rows>
      </Section>

      <Label>Dinero</Label>
      <Section>
        <Rows>
          <SetRow icon="tag" title="Categorías y reglas" to="/ajustes/categorias" />
          <SetRow icon="link" title="Integraciones" sub="Trade Republic · Atajos" to="/ajustes/integraciones" />
          <SetRow icon="database" title="Datos y copias" to="/ajustes/datos" />
        </Rows>
      </Section>

      <Label>Cuenta</Label>
      <Section>
        <Rows>
          <SetRow icon="shield-security" title="Seguridad" to="/ajustes/seguridad" />
          <SetRow icon="data-node" title="Uso y diagnóstico" to="/ajustes/diagnostico" />
          {user?.is_admin && <SetRow icon="universal" title="Administración" to="/admin" />}
        </Rows>
      </Section>

      <Section style={{ marginTop: 18 }}>
        <SetRow icon="power-switch" title="Cerrar sesión" tone="danger" onClick={logout} trail={<span />} />
      </Section>
    </div>
  )
}

// ── Ultra simple ────────────────────────────────────────────────────────────
export function UltraAjustes() {
  const prefs = usePreferencesStore(s => s.prefs)
  const update = usePreferencesStore(s => s.update)
  const logout = useLogout()
  const val = (t: string) => <span style={{ display: 'flex', alignItems: 'center', gap: 4, ...muted }}>{t}<Icon name="chev-r" size={18} /></span>
  return (
    <div style={{ paddingBottom: 40 }}>
      <Header title="Ajustes" />
      <Section style={{ margin: '18px 16px 0' }}>
        <Rows>
          <SetRow icon="sliders" title="Modo" to="/ajustes/modo" trail={val('Ultra simple')} />
          <SetRow icon="color-palette" title="Tema" to="/ajustes/apariencia" trail={val(THEME_NAME[prefs.theme])} />
          <SetRow icon="tag" title="Categorías" to="/ajustes/categorias" />
          <SetRow icon="upload" title="Importar" to="/importar" />
        </Rows>
      </Section>
      <Section pad="16px" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <IconTile icon="sliders" size={40} radius={14} />
          <span>
            <span style={{ display: 'block', fontWeight: 800 }}>¿Quieres ver más?</span>
            <span style={{ display: 'block', fontSize: 13, ...muted }}>Cuentas, inversiones y objetivos</span>
          </span>
        </div>
        <Btn height={46} style={{ width: '100%', marginTop: 14 }} onClick={() => update({ ui_mode: 'normal' }).then(() => toast('Modo normal activado'))}>Pasar a Normal</Btn>
      </Section>
      <Section style={{ marginTop: 16 }}>
        <SetRow icon="power-switch" title="Cerrar sesión" tone="danger" onClick={logout} trail={<span />} />
      </Section>
    </div>
  )
}

// ── PC ──────────────────────────────────────────────────────────────────────
type NavItem = { id: SecId | 'cuentas' | 'importar'; label: string; icon: AnyIcon; to?: string }
const PC_NAV: { group: string; items: NavItem[] }[] = [
  { group: 'General', items: [
    { id: 'perfil', label: 'Perfil', icon: 'user-profile' },
    { id: 'modo', label: 'Nivel de la app', icon: 'universal' },
    { id: 'apariencia', label: 'Apariencia', icon: 'color-palette' },
  ] },
  { group: 'Dinero', items: [
    { id: 'categorias', label: 'Categorías', icon: 'tag' },
    { id: 'cuentas', label: 'Cuentas', icon: 'bank-card', to: '/cuentas' },
    { id: 'importar', label: 'Importar', icon: 'upload', to: '/importar' },
  ] },
  { group: 'Conexiones', items: [
    { id: 'integraciones', label: 'Integraciones', icon: 'link' },
    { id: 'atajos', label: 'Atajos de iPhone', icon: 'shortcut' },
  ] },
  { group: 'Cuenta', items: [
    { id: 'seguridad', label: 'Seguridad', icon: 'shield-security' },
    { id: 'datos', label: 'Datos y copias', icon: 'database' },
    { id: 'diagnostico', label: 'Diagnóstico', icon: 'data-node' },
  ] },
]

function PCAjustes({ sec }: { sec: SecId }) {
  const user = useAuthStore(s => s.user)
  const logout = useLogout()
  const item = (it: NavItem) => {
    const active = it.id === sec
    return (
      <Link key={it.id} to={it.to ?? `/ajustes/${it.id}`} aria-current={active ? 'page' : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40, padding: '0 12px', borderRadius: 12, fontWeight: 700, fontSize: 14, color: active ? C.accentText : C.text, background: active ? C.soft : 'transparent' }}>
        <Icon name={it.icon} size={18} />{it.label}
      </Link>
    )
  }
  return (
    <>
      <PCHeader title="Ajustes" sub={PC_TITLES[sec]} search={false} add={false} />
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'start' }}>
        <nav aria-label="Secciones de ajustes" style={{ background: C.card, borderRadius: 22, padding: '6px 10px 12px', boxShadow: 'var(--sh-card)' }}>
          {PC_NAV.map(g => (
            <div key={g.group}>
              <p style={{ margin: '14px 12px 6px', fontSize: 12, ...muted, fontWeight: 700 }}>{g.group}</p>
              {g.items.map(item)}
            </div>
          ))}
          {user?.is_admin && (
            <div>
              <p style={{ margin: '14px 12px 6px', fontSize: 12, ...muted, fontWeight: 700 }}>Admin</p>
              {item({ id: 'cuentas', label: 'Administración', icon: 'universal', to: '/admin' })}
            </div>
          )}
          <Divider margin="12px 0 8px" />
          <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40, width: '100%', padding: '0 12px', borderRadius: 12, fontWeight: 700, fontSize: 14, color: C.red, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Icon name="power-switch" size={18} />Cerrar sesión
          </button>
        </nav>
        <div style={{ minWidth: 0, maxWidth: 760 }}>
          {sec === 'categorias' && <CategoriasPCBar />}
          <Body sec={sec} />
        </div>
      </div>
    </>
  )
}

// ── Perfil ──────────────────────────────────────────────────────────────────
function PerfilBody() {
  const user = useAuthStore(s => s.user)
  const [name, setName] = useState(user?.display_name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const save = useMutation({
    mutationFn: () => authApi.updateProfile({ display_name: name.trim() || null, username: username.trim() }),
    onSuccess: u => {
      const st = useAuthStore.getState()
      useAuthStore.setState({ user: { ...st.user!, ...u } })
      toast('Perfil guardado')
    },
    onError: e => toast(errText(e, 'No se pudo guardar'), { error: true }),
  })
  if (!user) return null
  const since = new Date(user.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const dirty = (name.trim() || null) !== (user.display_name || null) || username.trim() !== user.username
  return (
    <>
      <Group pad="16px">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0 4px' }}>
          <Avatar name={user.display_name || user.username} size={72} />
          <span style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>{user.display_name || user.username}</span>
          <Muted>Miembro desde {since}</Muted>
        </div>
      </Group>
      <Group title="Datos" pad="16px">
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Nombre" icon="user-profile" value={name} maxLength={60} placeholder={user.username} onChange={e => setName(e.target.value)} />
          <Field label="Usuario" icon="user-profile" value={username} maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            onChange={e => setUsername(e.target.value.replace(/\s/g, ''))} />
          {user.email && <Field label="Email" icon="link" value={user.email} readOnly />}
          <PeriodoFields />
          {dirty && <Btn height={46} onClick={() => save.mutate()} disabled={save.isPending || !username.trim()}>Guardar</Btn>}
        </div>
      </Group>
    </>
  )
}

const currencyLabel = (c: Currency) => `${CURRENCIES[c].label} (${CURRENCIES[c].symbol})`
const monthStartLabel = (d: number) => (d > 0 ? `Día ${d}` : 'Día 1 · o cuando entra la nómina')

/** Moneda y primer día del mes: se guardan al elegir, como el resto de preferencias. */
function PeriodoFields() {
  const prefs = usePreferencesStore(s => s.prefs)
  const [open, setOpen] = useState<null | 'cur' | 'day'>(null)
  const save = (patch: { currency?: Currency; month_start?: number }) => {
    setOpen(null)
    usePreferencesStore.getState().update(patch).catch(e => toast(errText(e, 'No se pudo guardar'), { error: true }))
  }
  const days = Array.from({ length: MONTH_START_MAX }, (_, i) => i + 1)
  return (
    <>
      <PickField label="Moneda" onClick={() => setOpen('cur')} style={{ margin: 0 }}>{currencyLabel(prefs.currency)}</PickField>
      <PickField label="Primer día del mes" onClick={() => setOpen('day')} style={{ margin: 0 }}>{monthStartLabel(prefs.month_start)}</PickField>
      <Sheet open={open === 'cur'} onClose={() => setOpen(null)} title="Moneda">
        {(Object.keys(CURRENCIES) as Currency[]).map(c => (
          <SheetOption key={c} title={currencyLabel(c)} selected={prefs.currency === c} onClick={() => save({ currency: c })} />
        ))}
      </Sheet>
      <Sheet open={open === 'day'} onClose={() => setOpen(null)} title="Primer día del mes">
        <SheetOption title="Cuando entra la nómina" selected={prefs.month_start === 0} onClick={() => save({ month_start: 0 })} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8, padding: '8px 0 4px' }}>
          {days.map(d => {
            const on = prefs.month_start === d
            return (
              <button key={d} type="button" aria-label={`Día ${d}`} aria-pressed={on} onClick={() => save({ month_start: d })} style={{
                height: 44, border: 0, borderRadius: 14, cursor: 'pointer', font: 'inherit', fontWeight: 800, fontSize: 15,
                background: on ? C.accent : C.field, color: on ? C.white : C.text,
              }}>{d}</button>
            )
          })}
        </div>
      </Sheet>
    </>
  )
}

// ── Modo y módulos ──────────────────────────────────────────────────────────
const MODULE_ROWS: { id: ModuleId; title: string; icon: AnyIcon }[] = [
  { id: 'investments', title: 'Inversiones', icon: 'cat-inversion' },
  { id: 'budgets', title: 'Presupuestos', icon: 'pie' },
  { id: 'recurring', title: 'Recurrentes', icon: 'repeat' },
  { id: 'goals', title: 'Objetivos', icon: 'safe-open' },
  { id: 'debts', title: 'Deudas', icon: 'receipt' },
  { id: 'achievements', title: 'Logros', icon: 'trophy' },
  { id: 'ai', title: 'Asistente IA', icon: 'sparkle' },
]
const ULTRA_ROWS: { id: UltraModuleId; title: string; icon: AnyIcon }[] = [
  { id: 'debts', title: 'Deudas', icon: 'receipt' },
  { id: 'goals', title: 'Objetivos', icon: 'safe-open' },
  { id: 'budgets', title: 'Presupuestos', icon: 'pie' },
  { id: 'recurring', title: 'Recurrentes', icon: 'repeat' },
  { id: 'monthly', title: 'Mes a mes', icon: 'calendar' },
  { id: 'investments', title: 'Inversiones', icon: 'cat-inversion' },
]

function ModoBody() {
  const pc = useIsPC()
  const prefs = usePreferencesStore(s => s.prefs)
  const update = usePreferencesStore(s => s.update)
  const user = useAuthStore(s => s.user)
  const seg = (
    <Segmented label="Modo de la app" value={prefs.ui_mode} options={[['ultra', 'Ultra simple'], ['normal', 'Normal']]}
      onChange={v => update({ ui_mode: v })} style={pc ? undefined : { margin: '18px 16px 0' }} />
  )
  return (
    <>
      {pc ? <Group title="Nivel de la app" pad="16px">{seg}</Group> : seg}
      {prefs.ui_mode === 'normal' && (
        <Group title="Módulos">
          <Rows>
            {MODULE_ROWS.map(m => {
              const blocked = m.id === 'ai' && !user?.ai_enabled
              return (
                <ToggleRow key={m.id} icon={m.icon} title={m.title} sub={blocked ? 'Desactivado' : undefined}
                  on={!blocked && !!prefs.modules[m.id]} disabled={blocked}
                  onChange={v => update({ modules: { [m.id]: v } })} />
              )
            })}
          </Rows>
        </Group>
      )}
      {prefs.ui_mode === 'ultra' && (
        <Group title="Añadir a Ultra simple">
          <Rows>
            {ULTRA_ROWS.map(m => (
              <ToggleRow key={m.id} icon={m.icon} title={m.title} on={!!prefs.ultra_modules[m.id]}
                onChange={v => update({ ultra_modules: { [m.id]: v } })} />
            ))}
          </Rows>
        </Group>
      )}
    </>
  )
}

// ── Apariencia ──────────────────────────────────────────────────────────────
const THEME_PREVIEW: Record<ThemeMode, { bg: string; bar: string }> = {
  light: { bg: '#f2f3f7', bar: '#ffffff' },
  dark: { bg: '#0f1015', bar: '#1f2129' },
  system: { bg: 'linear-gradient(135deg, #f2f3f7 50%, #0f1015 50%)', bar: '#8b8d98' },
}

function ThemePreview({ mode, h }: { mode: ThemeMode; h: number }) {
  const p = THEME_PREVIEW[mode]
  return (
    <span aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end', height: h, borderRadius: 14, background: p.bg, padding: 10, border: `1px solid ${C.line}` }}>
      <span style={{ height: 8, width: '60%', borderRadius: 4, background: p.bar, opacity: 0.9 }} />
      <span style={{ height: 8, width: '85%', borderRadius: 4, background: p.bar, opacity: 0.9 }} />
      <span style={{ height: 8, width: '40%', borderRadius: 4, background: C.accent }} />
    </span>
  )
}

function AparienciaBody() {
  const pc = useIsPC()
  const theme = usePreferencesStore(s => s.prefs.theme)
  const catIcons = usePreferencesStore(s => s.prefs.cat_icons)
  const update = usePreferencesStore(s => s.update)
  const [accent, setAcc] = useState<AccentId>(getAccent())
  const [size, setSize] = useState<TextSize>(getTextSize())
  const [hide, setHide] = useState(getHideOnOpen())
  const [motion, setMotion] = useState(getReduceMotion())
  const [sizeOpen, setSizeOpen] = useState(false)

  const themes: ThemeMode[] = ['light', 'dark', 'system']
  const themeBtn = (m: ThemeMode) => {
    const active = theme === m
    return (
      <button key={m} onClick={() => update({ theme: m })} aria-pressed={active}
        style={{ flex: 1, background: pc ? C.field : 'transparent', borderRadius: 18, padding: pc ? 14 : 0, border: 0, cursor: 'pointer', fontFamily: 'inherit', color: C.text, textAlign: 'center', boxShadow: pc && active ? `0 0 0 2px ${C.card}, 0 0 0 4px ${C.accent}` : undefined }}>
        <span style={{ display: 'block', borderRadius: 14, boxShadow: !pc && active ? `0 0 0 2px ${C.accent}` : undefined }}>
          <ThemePreview mode={m} h={pc ? 80 : 96} />
        </span>
        <span style={{ display: 'block', marginTop: 8, fontWeight: 700, fontSize: 14, color: active ? C.accentText : C.text }}>{m === 'system' && pc ? 'Automático' : THEME_NAME[m]}</span>
      </button>
    )
  }
  const sw = pc ? 32 : 40
  const pickAccent = (id: AccentId) => { setAccent(id); setAcc(id) }
  const pickSize = (s: TextSize) => { setTextSize(s); setSize(s); setSizeOpen(false) }
  const sizeName = TEXT_SIZES.find(t => t.id === size)!.name

  return (
    <>
      <Group title="Tema" pad="16px">
        <div style={{ display: 'flex', gap: 12 }}>{themes.map(themeBtn)}</div>
      </Group>
      <Group title="Color" pad="16px">
        <div style={{ display: 'flex', gap: pc ? 12 : 16, flexWrap: 'wrap' }} role="radiogroup" aria-label="Color de acento">
          {ACCENTS.map(a => (
            <button key={a.id} role="radio" aria-checked={accent === a.id} aria-label={a.name} title={a.name} onClick={() => pickAccent(a.id)}
              style={{ width: sw, height: sw, borderRadius: '50%', background: a.swatch, border: 0, cursor: 'pointer', boxShadow: accent === a.id ? `0 0 0 3px ${C.card}, 0 0 0 5px ${a.swatch}` : undefined }} />
          ))}
        </div>
      </Group>
      <Group title="Iconos de categoría" pad="16px">
        <Segmented label="Iconos de categoría" value={catIcons} options={[['emoji', 'Emojis'], ['dibujo', 'Dibujos']] as [CatIcons, string][]}
          onChange={v => update({ cat_icons: v })} />
      </Group>
      <Group title="Otros">
        <Rows>
          {pc
            ? <SetRow icon="text-color" title="Tamaño del texto" trail={<Segmented label="Tamaño del texto" value={size} options={TEXT_SIZES.map(t => [t.id, t.short] as [TextSize, string])} onChange={pickSize} />} />
            : <SetRow icon="text-color" title="Tamaño de texto" onClick={() => setSizeOpen(true)} trail={<span style={{ display: 'flex', alignItems: 'center', gap: 4, ...muted }}>{sizeName}<Icon name="chev-r" size={18} /></span>} />}
          <ToggleRow icon="eye-invisible" title="Ocultar importes al abrir" on={hide} onChange={v => { setHideOnOpen(v); setHide(v); if (v && !usePrivacyStore.getState().hidden) usePrivacyStore.getState().toggle() }} />
          <ToggleRow icon="motion" title="Animaciones reducidas" on={motion} onChange={v => { setReduceMotion(v); setMotion(v) }} />
        </Rows>
      </Group>
      <Sheet open={sizeOpen} onClose={() => setSizeOpen(false)} title="Tamaño de texto">
        {TEXT_SIZES.map(t => (
          <SheetOption key={t.id} title={t.name} selected={size === t.id} onClick={() => pickSize(t.id)}
            lead={<span style={{ width: 36, height: 36, borderRadius: 12, background: C.soft, color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 * t.zoom }}>{t.short}</span>} />
        ))}
      </Sheet>
    </>
  )
}

// ── Categorías y reglas ─────────────────────────────────────────────────────
type CatKind = 'expense' | 'income'
const useCatUi = create<{ kind: CatKind; creating: boolean; set: (p: Partial<{ kind: CatKind; creating: boolean }>) => void }>(set => ({
  kind: 'expense', creating: false, set: p => set(p),
}))
function useCatKind(): [CatKind, (k: CatKind) => void] {
  const kind = useCatUi(s => s.kind)
  return [kind, (k: CatKind) => useCatUi.getState().set({ kind: k })]
}
const openNewCat = () => useCatUi.getState().set({ creating: true })

function CategoriasHeader() {
  const [kind, setKind] = useCatKind()
  return (
    <>
      <SubHeader title={TITLES.categorias} back="/ajustes" actions={<RoundBtn icon="plus" label="Nueva categoría" onClick={() => openNewCat()} />} />
      <Segmented label="Tipo de categoría" value={kind} options={[['expense', 'Gastos'], ['income', 'Ingresos']]} onChange={setKind} style={{ margin: '18px 16px 0' }} />
    </>
  )
}

function CategoriasPCBar() {
  const [kind, setKind] = useCatKind()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <Segmented label="Tipo de categoría" value={kind} options={[['expense', 'Gastos'], ['income', 'Ingresos']]} onChange={setKind} style={{ flex: 1, maxWidth: 360 }} />
      <span style={{ flex: 1 }} />
      <Btn icon="plus" height={42} onClick={() => openNewCat()} style={{ padding: '0 18px 0 14px' }}>Nueva categoría</Btn>
    </div>
  )
}

function CategoriasBody() {
  const [kind] = useCatKind()
  const qc = useQueryClient()
  const cats = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const usage = useQuery({ queryKey: ['category-usage'], queryFn: catApi.usage })
  const rules = useQuery({ queryKey: ['category-rules'], queryFn: catApi.listRules })
  const [editing, setEditing] = useState<Category | null>(null)
  const creating = useCatUi(s => s.creating)
  const setCreating = (v: boolean) => useCatUi.getState().set({ creating: v })

  const list = (cats.data ?? []).filter(c => c.type === kind)
    .sort((a, b) => (usage.data?.[b.id] ?? 0) - (usage.data?.[a.id] ?? 0) || a.name.localeCompare(b.name))
  const byCat = new Map<number, CategoryRule[]>()
  for (const r of rules.data ?? []) byCat.set(r.category_id, [...(byCat.get(r.category_id) ?? []), r])
  const ruleGroups = list.filter(c => byCat.has(c.id))
  const refresh = () => { qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['category-rules'] }); qc.invalidateQueries({ queryKey: ['category-usage'] }) }

  if (cats.isLoading) return <div style={{ padding: '18px 16px', display: 'grid', gap: 12 }}><Skeleton h={260} /></div>
  return (
    <>
      <Group title={kind === 'expense' ? 'Categorías de gasto' : 'Categorías de ingreso'}>
        {list.length === 0
          ? <p style={{ ...muted, padding: '12px 0', margin: 0 }}>Todavía no hay categorías.</p>
          : (
            <Rows>
              {list.map(c => {
                const n = byCat.get(c.id)?.length ?? 0
                return (
                  <SetRowCat key={c.id} cat={c} sub={n ? `${n} ${n === 1 ? 'regla' : 'reglas'}` : undefined}
                    count={usage.data?.[c.id] ?? 0} onClick={() => setEditing(c)} />
                )
              })}
            </Rows>
          )}
      </Group>
      {ruleGroups.length > 0 && (
        <Group title="Reglas automáticas">
          <Rows>
            {ruleGroups.map(c => (
              <SetRow key={c.id} icon="tag" onClick={() => setEditing(c)}
                title={<>{byCat.get(c.id)!.map(r => r.keyword).join(', ')} <span style={muted}>→ {c.name}</span></>} />
            ))}
          </Rows>
        </Group>
      )}
      <CategorySheet cat={editing} rules={editing ? byCat.get(editing.id) ?? [] : []} onClose={() => setEditing(null)} onChanged={refresh} />
      <NewCategorySheet open={creating} kind={kind} onClose={() => setCreating(false)} onCreated={c => { refresh(); setCreating(false); setEditing(c) }} />
    </>
  )
}

function SetRowCat({ cat, sub, count, onClick }: { cat: Category; sub?: string; count: number; onClick: () => void }) {
  return (
    <a role="button" tabIndex={0} onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()}
      style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) auto 18px', gap: 12, alignItems: 'center', padding: '9px 0', color: C.text, cursor: 'pointer' }}>
      <CatTile name={cat.name} type={cat.type} size={36} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, ...muted }}>{sub}</span>}
      </span>
      <span style={{ fontWeight: 700, color: C.muted }}>{count ? fmtInt(count) : ''}</span>
      <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span>
    </a>
  )
}

function CategorySheet({ cat, rules, onClose, onChanged }: { cat: Category | null; rules: CategoryRule[]; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState('')
  const [kw, setKw] = useState('')
  const [editRule, setEditRule] = useState<CategoryRule | null>(null)
  const [lastId, setLastId] = useState<number | null>(null)
  if (cat && cat.id !== lastId) { setLastId(cat.id); setName(cat.name); setKw(''); setEditRule(null) }
  const probe = useDebouncedValue(kw.trim(), 350)
  const preview = useQuery({
    queryKey: ['rule-preview', probe, cat?.id],
    queryFn: () => catApi.previewRule({ keyword: probe, field: 'name', category_id: cat!.id }),
    enabled: !!cat && probe.length >= 2 && probe !== editRule?.keyword,
    staleTime: 30_000,
  })

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); onChanged(); toast(ok) } catch (e) { toast(errText(e), { error: true }) }
  }
  const addRule = async () => {
    if (!cat || !kw.trim()) return
    const editing = editRule
    await run(async () => {
      const r = editing
        ? await catApi.updateRule(editing.id, { keyword: kw.trim() })
        : await catApi.createRule({ keyword: kw.trim(), category_id: cat.id, field: 'name', priority: 0 })
      setKw(''); setEditRule(null)
      const n = await catApi.applyRule(r.id).catch(() => ({ updated: 0 }))
      if (n.updated) toast(`${fmtInt(n.updated)} movimientos recategorizados`)
    }, editing ? 'Regla guardada' : 'Regla añadida')
  }
  const remove = async () => {
    if (!cat) return
    const ok = await confirm({ title: `¿Eliminar ${cat.name}?`, text: 'Sus movimientos se quedan sin categoría y se borran sus reglas.', action: 'Eliminar', icon: 'delete', danger: true })
    if (!ok) return
    await run(() => catApi.delete(cat.id), 'Categoría eliminada')
    onClose()
  }
  const saveName = () => cat && name.trim() && name.trim() !== cat.name && run(() => catApi.update(cat.id, { name: name.trim() }), 'Nombre guardado')

  return (
    <Sheet open={!!cat} onClose={onClose} title={cat?.name}
      actions={cat && !cat.is_system ? <Btn kind="danger" icon="delete" height={46} onClick={remove} style={{ width: '100%' }}>Eliminar categoría</Btn> : undefined}>
      {cat && (
        <div style={{ display: 'grid', gap: 14 }}>
          {!cat.is_system && (
            <Field label="Nombre" value={name} onChange={e => setName(e.target.value)} onBlur={saveName} onKeyDown={e => e.key === 'Enter' && saveName()} />
          )}
          <div>
            <p style={{ margin: '4px 0 8px', fontSize: 13, ...muted, fontWeight: 700 }}>Reglas</p>
            {rules.length === 0 && <p style={{ margin: '0 0 8px', ...muted }}>Sin reglas.</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {rules.map(r => (
                <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: editRule?.id === r.id ? C.soft : C.field, borderRadius: 99, padding: '6px 6px 6px 12px', fontWeight: 700, fontSize: 14 }}>
                  <button type="button" aria-label={`Editar ${r.keyword}`} onClick={() => { setEditRule(r); setKw(r.keyword) }}
                    style={{ border: 0, background: 'transparent', padding: 0, color: editRule?.id === r.id ? C.accentText : C.text, font: 'inherit', cursor: 'pointer' }}>{r.keyword}</button>
                  <button aria-label={`Quitar ${r.keyword}`} onClick={() => run(() => catApi.deleteRule(r.id), 'Regla quitada')}
                    style={{ width: 24, height: 24, borderRadius: '50%', border: 0, background: C.card, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <Icon name="close" size={14} />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><Field label={editRule ? `Editar "${editRule.keyword}"` : 'Nueva palabra clave'} placeholder="Mercadona" value={kw} onChange={e => setKw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addRule(); if (e.key === 'Escape' && editRule) { setEditRule(null); setKw('') } }} /></div>
            {editRule && <RoundBtn icon="close" label="Cancelar edición" size={52} bg={C.field} onClick={() => { setEditRule(null); setKw('') }} />}
            <RoundBtn icon={editRule ? 'check-mark' : 'plus'} label={editRule ? 'Guardar regla' : 'Añadir regla'} size={52} onClick={addRule} disabled={!kw.trim() || kw.trim() === editRule?.keyword} />
          </div>
          {preview.data && probe === kw.trim() && (
            <div style={{ background: C.field, borderRadius: 16, padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>
              <span style={{ fontWeight: 800 }}>{preview.data.matches === 0 ? 'No coincide con ningún movimiento' : `Coincide con ${fmtInt(preview.data.matches)} ${preview.data.matches === 1 ? 'movimiento' : 'movimientos'}`}</span>
              {preview.data.applicable > 0 && <span style={muted}>{` · ${fmtInt(preview.data.applicable)} cambiarán a ${cat.name}`}</span>}
              {preview.data.samples.length > 0 && <span style={{ display: 'block', ...muted, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.data.samples.slice(0, 3).join(', ')}</span>}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

function NewCategorySheet({ open, kind, onClose, onCreated }: { open: boolean; kind: CatKind; onClose: () => void; onCreated: (c: Category) => void }) {
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: () => catApi.create({ name: name.trim(), type: kind }),
    onSuccess: c => { setName(''); toast('Categoría creada'); onCreated(c) },
    onError: e => toast(errText(e), { error: true }),
  })
  return (
    <Sheet open={open} onClose={onClose} title={kind === 'expense' ? 'Nueva categoría de gasto' : 'Nueva categoría de ingreso'}
      actions={<Btn height={50} style={{ width: '100%' }} disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Crear</Btn>}>
      <Field label="Nombre" autoFocus value={name} placeholder="Mascotas" onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && name.trim() && create.mutate()} />
    </Sheet>
  )
}

// ── Integraciones ───────────────────────────────────────────────────────────
function IntegracionesBody() {
  const pc = useIsPC()
  return <>{<TRCard />}{!pc && <AtajosCard />}<WebhooksCard /></>
}

function TRCard() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const st = useQuery({ queryKey: ['tr-status'], queryFn: trApi.status })
  const sync = useMutation({
    mutationFn: trApi.sync,
    onSuccess: r => { qc.invalidateQueries(); toast(r.synced ? `${fmtInt(r.synced)} movimientos nuevos` : 'Todo al día') },
    onError: e => toast(errText(e, 'No se pudo sincronizar'), { error: true }),
  })
  const disconnect = async () => {
    const ok = await confirm({ title: '¿Desconectar Trade Republic?', text: 'Los movimientos ya importados se mantienen.', action: 'Desconectar', icon: 'link', danger: true })
    if (!ok) return
    try { await trApi.disconnect(); qc.invalidateQueries({ queryKey: ['tr-status'] }); toast('Trade Republic desconectado') } catch (e) { toast(errText(e), { error: true }) }
  }
  const s = st.data
  const sub = !s ? '' : s.connected ? `Conectado${s.last_sync ? ` · ${when(s.last_sync)}` : ''}` : s.login_error ? 'Hay un problema con la conexión' : 'Sin conectar'
  return (
    <Group title="Bancos" pad="16px">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <IconTile icon="bank-card" size={44} radius={14} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 800 }}>Trade Republic</span>
          <span style={{ display: 'block', fontSize: 13, ...muted }}>{st.isLoading ? 'Comprobando…' : sub}</span>
        </span>
        {s?.connected && <Pill>Activo</Pill>}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        {s?.connected ? (
          <>
            <Btn kind="secondary" icon="refresh" height={44} style={{ flex: 1, paddingLeft: 14 }} disabled={sync.isPending} onClick={() => sync.mutate()}>{sync.isPending ? 'Sincronizando…' : 'Sincronizar'}</Btn>
            <Btn kind="ghost" height={44} style={{ flex: 1, color: C.red }} onClick={disconnect}>Desconectar</Btn>
          </>
        ) : (
          <Btn height={44} style={{ flex: 1 }} onClick={() => nav('/cuentas/trade-republic')}>Conectar</Btn>
        )}
      </div>
    </Group>
  )
}

const QUICK_URL = () => `${window.location.origin}/api/transactions/quick`

const WEBHOOK_EVENTS: [string, string][] = [
  ['transaction.created', 'Movimiento nuevo'],
  ['transaction.imported', 'Importación'],
  ['recurring.detected', 'Recurrente detectado'],
  ['goal.completed', 'Objetivo cumplido'],
  ['achievement.unlocked', 'Logro desbloqueado'],
]

function WebhooksCard() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['webhooks'], queryFn: webhookApi.list })
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['transaction.created'])
  const refresh = () => qc.invalidateQueries({ queryKey: ['webhooks'] })
  const create = useMutation({
    mutationFn: () => webhookApi.create({ url: url.trim(), events }),
    onSuccess: () => { refresh(); setOpen(false); setUrl(''); toast('Webhook creado') },
    onError: e => toast(errText(e), { error: true }),
  })
  const toggle = async (id: number) => {
    try { await webhookApi.toggle(id); refresh() } catch (e) { toast(errText(e), { error: true }) }
  }
  const remove = async (id: number, u: string) => {
    const ok = await confirm({ title: '¿Eliminar este webhook?', text: u, action: 'Eliminar', icon: 'delete', danger: true })
    if (!ok) return
    try { await webhookApi.delete(id); refresh(); toast('Webhook eliminado') } catch (e) { toast(errText(e), { error: true }) }
  }
  const valid = /^https?:\/\/\S+$/i.test(url.trim()) && events.length > 0
  const hooks = list.data ?? []
  return (
    <>
      <Group title="Webhooks" action={<RoundBtn icon="plus" label="Nuevo webhook" size={36} iconSize={18} bg={C.field} onClick={() => setOpen(true)} />}>
        {hooks.length === 0
          ? <p style={{ ...muted, padding: '12px 0', margin: 0 }}>Sin webhooks.</p>
          : (
            <Rows>
              {hooks.map(w => (
                <SetRow key={w.id} icon="link"
                  title={<span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: w.is_active ? C.text : C.muted }}>{w.url}</span>}
                  sub={w.events.map(e => WEBHOOK_EVENTS.find(x => x[0] === e)?.[1] ?? e).join(', ')}
                  trail={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Switch on={w.is_active} onChange={() => toggle(w.id)} label={`Activar ${w.url}`} />
                    <RoundBtn icon="delete" label="Eliminar webhook" size={36} iconSize={18} bg="transparent" color={C.red} onClick={() => remove(w.id, w.url)} />
                  </span>} />
              ))}
            </Rows>
          )}
      </Group>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nuevo webhook"
        actions={<Btn height={50} style={{ width: '100%' }} disabled={!valid || create.isPending} onClick={() => create.mutate()}>Crear</Btn>}>
        <Field label="URL" placeholder="https://" inputMode="url" autoCapitalize="off" value={url} onChange={e => setUrl(e.target.value)} />
        <p style={{ margin: '16px 0 4px', fontSize: 13, ...muted, fontWeight: 700 }}>Eventos</p>
        {WEBHOOK_EVENTS.map(([id, label]) => (
          <ToggleRow key={id} icon="notification-bell" title={label} on={events.includes(id)}
            onChange={v => setEvents(ev => (v ? [...ev, id] : ev.filter(x => x !== id)))} />
        ))}
      </Sheet>
    </>
  )
}

function AtajosCard() {
  const qc = useQueryClient()
  const tokens = useQuery({ queryKey: ['api-tokens'], queryFn: integrationsApi.list })
  const [fresh, setFresh] = useState<string | null>(null)
  const [guide, setGuide] = useState(false)
  const create = useMutation({
    mutationFn: () => integrationsApi.create('Atajo de iPhone'),
    onSuccess: t => { setFresh(t.token); qc.invalidateQueries({ queryKey: ['api-tokens'] }); toast('Token creado. Cópialo ahora: no se vuelve a mostrar.') },
    onError: e => toast(errText(e), { error: true }),
  })
  const revoke = async (id: number, name: string) => {
    const ok = await confirm({ title: `¿Revocar ${name}?`, text: 'Los atajos que lo usen dejarán de funcionar.', action: 'Revocar', icon: 'delete', danger: true })
    if (!ok) return
    try { await integrationsApi.delete(id); qc.invalidateQueries({ queryKey: ['api-tokens'] }); toast('Token revocado') } catch (e) { toast(errText(e), { error: true }) }
  }
  const list = tokens.data ?? []
  const latest = list[0]
  const shown = fresh ?? (latest ? `${latest.token_prefix}••••` : 'Sin token todavía')
  return (
    <>
      <Group title="Atajos" pad="16px">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <IconTile icon="shortcut" size={44} radius={14} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 800 }}>Atajos de iPhone</span>
            <span style={{ display: 'block', fontSize: 13, ...muted }}>Apunta gastos con Apple Pay</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.field, borderRadius: 14, padding: '0 6px 0 14px', height: 48, marginTop: 14 }}>
          <code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, color: fresh || latest ? C.text : C.muted }}>{shown}</code>
          {fresh && <RoundBtn icon="copy" label="Copiar token" size={36} iconSize={18} bg={C.card} onClick={() => copy(fresh, 'Token copiado')} />}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <Btn icon="download" height={44} style={{ flex: 1, paddingLeft: 14 }} onClick={() => setGuide(true)}>Instalar atajo</Btn>
          <Btn kind="secondary" icon="refresh" height={44} style={{ flex: 1, paddingLeft: 14 }} disabled={create.isPending} onClick={() => create.mutate()}>Nuevo token</Btn>
        </div>
      </Group>
      {list.length > 0 && (
        <Group title="Tokens activos">
          <Rows>
            {list.map(t => (
              <SetRow key={t.id} icon="key" title={t.name} sub={`${t.token_prefix}•••• · ${t.last_used_at ? `usado ${ago(t.last_used_at)}` : 'sin usar'}`}
                trail={<RoundBtn icon="delete" label={`Revocar ${t.name}`} size={36} iconSize={18} bg="transparent" color={C.red} onClick={() => revoke(t.id, t.name)} />} />
            ))}
          </Rows>
        </Group>
      )}
      <Sheet open={guide} onClose={() => setGuide(false)} title="Instalar el atajo">
        <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 10, lineHeight: 1.45 }}>
          <li>Pulsa <b>Nuevo token</b> y cópialo.</li>
          <li>En Atajos crea una automatización <b>Cartera → al pagar</b>.</li>
          <li>Añade la acción <b>Obtener contenido de URL</b> con método <b>POST</b> y esta URL:</li>
        </ol>
        <CopyBox value={QUICK_URL()} />
        <ol start={4} style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 10, lineHeight: 1.45 }}>
          <li>Cabecera <b>Authorization</b> con este valor (cambia TOKEN por el tuyo):</li>
        </ol>
        <CopyBox value={`Bearer ${fresh ?? 'TOKEN'}`} />
        <ol start={5} style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 10, lineHeight: 1.45 }}>
          <li>Cuerpo JSON con <b>amount</b> (Importe), <b>name</b> (Comercio) y <b>type</b> = expense.</li>
        </ol>
      </Sheet>
    </>
  )
}

function CopyBox({ value }: { value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.field, borderRadius: 14, padding: '0 6px 0 14px', height: 46, marginTop: 10 }}>
      <code style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: 700 }}>{value}</code>
      <RoundBtn icon="copy" label="Copiar" size={34} iconSize={16} bg={C.card} onClick={() => copy(value)} />
    </div>
  )
}

// ── Datos y copias ──────────────────────────────────────────────────────────
function DatosBody() {
  const qc = useQueryClient()
  const sum = useQuery({ queryKey: ['export-summary'], queryFn: exportApi.summary })
  const [last, setLast] = useState<string | null>(() => { try { return localStorage.getItem(LAST_BACKUP_KEY) } catch { return null } })
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'json'>('xlsx')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pick, setPick] = useState<'from' | 'to' | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  const months = sum.data?.months ?? []
  const label = (m: string) => months.find(x => x.month === m)?.label ?? m
  const txCount = sum.data?.counts?.transactions ?? months.reduce((s, m) => s + m.count, 0)

  const backup = async () => {
    setBusy(true)
    try {
      await accountApi.downloadBackup()
      const now = new Date().toISOString()
      try { localStorage.setItem(LAST_BACKUP_KEY, now) } catch { /* sin almacenamiento */ }
      setLast(now)
      toast('Copia descargada')
    } catch (e) { toast(errText(e), { error: true }) } finally { setBusy(false) }
  }

  const restore = async (file: File) => {
    try {
      const p = await accountApi.previewRestore(file)
      const n = p.counts.transactions ?? 0
      const ok = await confirm({
        title: '¿Restaurar esta copia?',
        text: `Tiene ${fmtInt(n)} movimientos${p.exported_at ? ` y es del ${new Date(p.exported_at).toLocaleDateString('es-ES')}` : ''}. Reemplaza todos los datos actuales.`,
        action: 'Restaurar', icon: 'upload', danger: true,
      })
      if (!ok) return
      await accountApi.restore(file)
      qc.invalidateQueries()
      toast('Copia restaurada')
    } catch (e) { toast(errText(e, 'No se pudo leer la copia'), { error: true }) }
  }

  const download = async () => {
    setBusy(true)
    try {
      const range = from || to
      const lastDay = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate() }
      await exportApi.download({
        format: format as ExportFormat,
        period: range ? 'range' : 'all',
        date_from: from ? `${from}-01` : range ? sum.data?.first_date ?? undefined : undefined,
        date_to: to ? `${to}-${String(lastDay(to)).padStart(2, '0')}` : range ? sum.data?.last_date ?? undefined : undefined,
      })
      toast('Exportación descargada')
    } catch (e) { toast(errText(e, 'No se pudo exportar'), { error: true }) } finally { setBusy(false) }
  }

  return (
    <>
      <Group pad="16px">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <IconTile icon={last ? 'feedback-success' : 'feedback-warning'} size={44} radius={14} bg={last ? 'var(--c-12301f)' : C.soft} color={last ? C.green : C.accentText} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 800 }}>{last ? `Última copia: ${ago(last)}` : 'Aún no has hecho ninguna copia'}</span>
            <span style={{ display: 'block', fontSize: 13, ...muted }}>{sum.isLoading ? '…' : `${fmtInt(txCount)} movimientos`}</span>
          </span>
        </div>
      </Group>
      <Group title="Copias">
        <Rows>
          <SetRow icon="export" title="Exportar movimientos" sub="CSV o Excel" onClick={() => exportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
          <SetRow icon="download" title="Copia completa" sub="Todo en un archivo .json" onClick={busy ? undefined : backup} />
          <SetRow icon="upload" title="Restaurar copia" sub="Reemplaza los datos actuales" onClick={() => fileRef.current?.click()} />
        </Rows>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restore(f) }} />
      </Group>
      <div ref={exportRef} style={{ scrollMarginTop: 16 }}>
        <Group title="Exportar" pad="16px">
          <div style={{ display: 'grid', gap: 12 }}>
            <Segmented label="Formato" value={format} options={[['csv', 'CSV'], ['xlsx', 'Excel'], ['json', 'JSON']]} onChange={setFormat} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <PickField label="Desde" onClick={() => setPick('from')}>{from ? label(from) : 'El principio'}</PickField>
              <PickField label="Hasta" onClick={() => setPick('to')}>{to ? label(to) : 'Hoy'}</PickField>
            </div>
            <Btn icon="download" height={48} disabled={busy || !months.length} onClick={download} style={{ paddingLeft: 16 }}>Descargar</Btn>
          </div>
        </Group>
      </div>
      <Sheet open={!!pick} onClose={() => setPick(null)} title={pick === 'from' ? 'Desde' : 'Hasta'}>
        <SheetOption title={pick === 'from' ? 'El principio' : 'Hoy'} selected={pick === 'from' ? !from : !to} onClick={() => { pick === 'from' ? setFrom('') : setTo(''); setPick(null) }} />
        {[...months].reverse().map(m => (
          <SheetOption key={m.month} title={m.label} sub={`${fmtInt(m.count)} movimientos`} selected={(pick === 'from' ? from : to) === m.month}
            onClick={() => { pick === 'from' ? setFrom(m.month) : setTo(m.month); setPick(null) }} />
        ))}
      </Sheet>
    </>
  )
}

// ── Seguridad ───────────────────────────────────────────────────────────────
const devicesLabel = (n: number) => (n === 1 ? '1 dispositivo' : `${n} dispositivos`)

function SeguridadBody() {
  const qc = useQueryClient()
  const logout = useAuthStore(s => s.logout)
  const nav = useNavigate()
  const [pw, setPw] = useState(false)
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [rep, setRep] = useState('')
  const [open, setOpen] = useState<null | 'lock' | 'sessions' | 'passkeys'>(null)
  const [lock, setLock] = useState<LockMinutes>(getLockMinutes)
  const sessions = useQuery({ queryKey: ['auth-sessions'], queryFn: authApi.listSessions })
  const canPasskey = passkeySupported()
  const passkeys = useQuery({ queryKey: ['passkeys'], queryFn: authApi.listPasskeys, enabled: canPasskey })
  const mine = passkeys.data?.find(p => p.credential_id === getDevicePasskey())
  const [pkBusy, setPkBusy] = useState(false)
  const togglePasskey = async (on: boolean, target = mine) => {
    setPkBusy(true)
    try {
      if (on) {
        const o = await authApi.passkeyRegisterOptions()
        const cred = await navigator.credentials.create({ publicKey: creationOptions(o.options) }) as PublicKeyCredential | null
        if (!cred) return
        const p = await authApi.passkeyRegister(credentialToJSON(cred))
        setDevicePasskey(p.credential_id)
        toast('Huella activada')
      } else if (target) {
        await authApi.deletePasskey(target.id)
        if (target.credential_id === getDevicePasskey()) setDevicePasskey(null)
        toast('Huella quitada')
      }
      qc.invalidateQueries({ queryKey: ['passkeys'] })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'InvalidStateError') toast('Este dispositivo ya tiene una huella guardada', { error: true })
      else if (!isCancel(e)) toast(errText(e, 'No se pudo activar la huella'), { error: true })
    } finally { setPkBusy(false) }
  }
  const closeOne = useMutation({
    mutationFn: authApi.closeSession,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth-sessions'] }); toast('Sesión cerrada') },
    onError: e => toast(errText(e), { error: true }),
  })
  const closeOthers = useMutation({
    mutationFn: authApi.closeOtherSessions,
    onSuccess: r => { qc.invalidateQueries({ queryKey: ['auth-sessions'] }); setOpen(null); toast(r.closed === 1 ? '1 sesión cerrada' : `${r.closed} sesiones cerradas`) },
    onError: e => toast(errText(e), { error: true }),
  })
  const change = useMutation({
    mutationFn: () => authApi.changePassword({ current_password: cur, new_password: next }),
    onSuccess: () => { setPw(false); setCur(''); setNext(''); setRep(''); qc.invalidateQueries({ queryKey: ['auth-sessions'] }); toast('Contraseña cambiada') },
    onError: e => toast(errText(e, 'No se pudo cambiar'), { error: true }),
  })
  const wipe = async () => {
    const ok = await confirm({ title: '¿Borrar todos los movimientos?', text: 'Se borran movimientos, recurrentes y posiciones manuales. No se puede deshacer.', action: 'Borrar todo', icon: 'delete', danger: true })
    if (!ok) return
    try { const r = await authApi.deleteTransactionData(); qc.invalidateQueries(); toast(`${fmtInt(r.transactions)} movimientos borrados`) } catch (e) { toast(errText(e), { error: true }) }
  }
  const drop = async () => {
    const ok = await confirm({ title: '¿Eliminar tu cuenta?', text: 'Se borran tu usuario y todos tus datos. No se puede deshacer.', action: 'Eliminar cuenta', icon: 'person-delete', danger: true })
    if (!ok) return
    try { await authApi.deleteAccount(); logout(); nav('/login', { replace: true }) } catch (e) { toast(errText(e), { error: true }) }
  }
  const mismatch = rep !== '' && rep !== next
  return (
    <>
      <Group title="Acceso">
        <Rows>
          <SetRow icon="key" title="Cambiar contraseña" onClick={() => setPw(true)} />
          {canPasskey && <SetRow icon="fingerprint" title="Entrar con huella"
            sub={passkeys.data?.length ? devicesLabel(passkeys.data.length) : 'Desactivada'} onClick={() => setOpen('passkeys')} />}
          <SetRow icon="lock" title="Bloquear al salir" sub={lockLabel(lock)} onClick={() => setOpen('lock')} />
          <SetRow icon="history-record" title="Sesiones abiertas" sub={sessions.data ? devicesLabel(sessions.data.length) : undefined} onClick={() => setOpen('sessions')} />
        </Rows>
      </Group>
      <Sheet open={open === 'lock'} onClose={() => setOpen(null)} title="Bloquear al salir">
        {LOCK_CHOICES.map(m => (
          <SheetOption key={m} title={lockLabel(m)} selected={lock === m} onClick={() => { setLockMinutes(m); setLock(m); setOpen(null) }} />
        ))}
      </Sheet>
      <Sheet open={open === 'sessions'} onClose={() => setOpen(null)} title="Sesiones abiertas"
        actions={(sessions.data?.length ?? 0) > 1
          ? <Btn kind="danger" height={50} style={{ width: '100%' }} disabled={closeOthers.isPending} onClick={() => closeOthers.mutate()}>Cerrar las demás</Btn>
          : undefined}>
        {sessions.isLoading && <Skeleton h={120} r={16} />}
        <Rows>
          {(sessions.data ?? []).map(s => (
            <SetRow key={s.id} icon={/iPhone|iPad|Android/.test(s.device) ? 'phone' : 'data-node'} title={s.device}
              sub={s.current ? 'Este dispositivo' : lastAccessShort(s.last_seen_at ?? s.created_at)}
              trail={s.current ? <></> : <button type="button" aria-label={`Cerrar ${s.device}`} onClick={() => closeOne.mutate(s.id)} disabled={closeOne.isPending}
                style={{ border: 0, background: 'transparent', color: C.red, font: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer', padding: '6px 0' }}>Cerrar</button>} />
          ))}
        </Rows>
      </Sheet>
      <Sheet open={open === 'passkeys'} onClose={() => setOpen(null)} title="Entrar con huella"
        actions={!mine && !passkeys.isLoading
          ? <Btn icon="fingerprint" height={50} style={{ width: '100%', padding: '0 9px 0 0' }} disabled={pkBusy} onClick={() => togglePasskey(true)}>Añadir este dispositivo</Btn>
          : undefined}>
        {passkeys.isLoading && <Skeleton h={120} r={16} />}
        {passkeys.data?.length === 0 && <Empty icon="fingerprint" title="Aún no hay huellas" />}
        <Rows>
          {[...(passkeys.data ?? [])].sort((a, b) => Number(b === mine) - Number(a === mine)).map(p => (
            <SetRow key={p.id} icon={/iPhone|iPad|Android/.test(p.device ?? '') ? 'phone' : 'data-node'} title={p.device || 'Dispositivo'}
              sub={p === mine ? 'Este dispositivo' : p.last_used_at ? `Usada ${lastAccessShort(p.last_used_at).toLowerCase()}` : `Añadida ${lastAccessShort(p.created_at).toLowerCase()}`}
              trail={<button type="button" aria-label={`Quitar ${p.device}`} disabled={pkBusy} onClick={() => togglePasskey(false, p)}
                style={{ border: 0, background: 'transparent', color: C.red, font: 'inherit', fontWeight: 800, fontSize: 14, cursor: 'pointer', padding: '6px 0' }}>Quitar</button>} />
          ))}
        </Rows>
      </Sheet>
      <Group title="Zona peligrosa">
        <Rows>
          <SetRow icon="delete" title="Borrar todos los movimientos" tone="danger" onClick={wipe} />
          <SetRow icon="person-delete" title="Eliminar cuenta" sub="No se puede deshacer" tone="danger" onClick={drop} />
        </Rows>
      </Group>
      <Sheet open={pw} onClose={() => setPw(false)} title="Cambiar contraseña"
        actions={<Btn height={50} style={{ width: '100%' }} disabled={!cur || next.length < 6 || next !== rep || change.isPending} onClick={() => change.mutate()}>Guardar</Btn>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Contraseña actual" type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} />
          <Field label="Nueva contraseña" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} />
          <Field label="Repite la nueva" type="password" autoComplete="new-password" value={rep} onChange={e => setRep(e.target.value)} />
          {mismatch && <span style={{ color: C.red, fontWeight: 600, fontSize: 13 }}>No coinciden</span>}
        </div>
      </Sheet>
    </>
  )
}

// ── Uso y diagnóstico ───────────────────────────────────────────────────────
function StatusRow({ icon, title, value, warn }: { icon: AnyIcon; title: string; value: ReactNode; warn?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '9px 0' }}>
      <IconTile icon={warn ? 'feedback-warning' : icon} bg={warn ? 'var(--c-3a1a1e)' : C.soft} color={warn ? C.red : C.accentText} />
      <span style={{ fontWeight: 700 }}>{title}</span>
      <span style={{ ...muted, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function DiagnosticoBody() {
  const qc = useQueryClient()
  const money = useMoney()
  const user = useAuthStore(s => s.user)
  const ping = useQuery({
    queryKey: ['diag-ping'],
    queryFn: async () => { const t = performance.now(); await authApi.me(); return Math.round(performance.now() - t) },
    staleTime: 0, retry: false,
  })
  const sum = useQuery({ queryKey: ['export-summary'], queryFn: exportApi.summary })
  const tr = useQuery({ queryKey: ['tr-status'], queryFn: trApi.status })
  const ai = useQuery({ queryKey: ['ai-usage'], queryFn: () => aiApi.getUsage(1), enabled: !!user?.ai_enabled })
  const tx = sum.data?.counts?.transactions ?? (sum.data?.months ?? []).reduce((s, m) => s + m.count, 0)
  const month = new Date().toISOString().slice(0, 7)
  const asked = ai.data?.months.find(m => m.month === month)?.requests ?? 0
  const trText = !tr.data ? '…' : tr.data.login_error ? 'Revisa la conexión' : tr.data.connected ? `Conectado${tr.data.last_sync ? ` · ${when(tr.data.last_sync)}` : ''}` : 'Sin conectar'

  const fixes: { title: string; icon: AnyIcon; run: () => Promise<Record<string, number>>; done: (r: Record<string, number>) => string }[] = [
    { title: 'Quitar duplicados', icon: 'delete', run: trApi.dedupe, done: r => `${r.deleted} duplicados quitados` },
    { title: 'Quitar movimientos cancelados', icon: 'close', run: trApi.fixCancelled, done: r => `${r.deleted} quitados` },
    { title: 'Limpiar movimientos desconocidos', icon: 'feedback-warning', run: trApi.fixUnknown, done: r => `${r.deleted} limpiados` },
    { title: 'Corregir valores', icon: 'cat-inversion', run: trApi.fixSecurities, done: r => `${r.fixed} corregidos` },
    { title: 'Resolver tickers', icon: 'refresh', run: trApi.fixTickers, done: r => `${r.resolved} de ${r.total} resueltos` },
    { title: 'Recalcular participaciones', icon: 'invest', run: trApi.fixShares, done: r => `${r.fixed} de ${r.total} corregidas` },
    { title: 'Importar movimientos que faltan', icon: 'download', run: () => trApi.importMissing().then(r => ({ imported: r.imported })), done: r => `${r.imported} importados` },
    { title: 'Quitar movimientos huérfanos', icon: 'delete', run: () => trApi.fixOrphans().then(r => ({ deleted: r.total_deleted })), done: r => `${r.deleted} quitados` },
  ]
  const [balance, setBalance] = useState<Awaited<ReturnType<typeof trApi.debugBalance>> | null>(null)
  const [skipped, setSkipped] = useState<Awaited<ReturnType<typeof trApi.debugSkipped>> | null>(null)
  const check = async () => {
    setRunning('check')
    try { const [b, k] = await Promise.all([trApi.debugBalance(), trApi.debugSkipped()]); setBalance(b); setSkipped(k) }
    catch (e) { toast(errText(e), { error: true }) } finally { setRunning(null) }
  }
  const [running, setRunning] = useState<string | null>(null)
  const fix = async (f: typeof fixes[number]) => {
    setRunning(f.title)
    try { const r = await f.run(); qc.invalidateQueries(); toast(f.done(r)) } catch (e) { toast(errText(e), { error: true }) } finally { setRunning(null) }
  }

  const report = () => [
    `FinanceMaster ${VERSION}`,
    `Servidor: ${ping.isError ? 'sin respuesta' : `${ping.data ?? '?'} ms`}`,
    `Movimientos: ${tx}`,
    `Trade Republic: ${trText}${tr.data?.login_error ? ` (${tr.data.login_error})` : ''}`,
    `Navegador: ${navigator.userAgent}`,
    `Fecha: ${new Date().toISOString()}`,
  ].join('\n')

  return (
    <>
      <Group title="Estado">
        <Rows>
          <StatusRow icon="data-node" title="Servidor" warn={ping.isError} value={ping.isLoading ? '…' : ping.isError ? 'Sin respuesta' : `Respondiendo · ${ping.data} ms`} />
          <StatusRow icon="database" title="Base de datos" value={sum.isLoading ? '…' : `${fmtInt(tx)} movimientos`} />
          <StatusRow icon="bank-card" title="Trade Republic" warn={!!tr.data?.login_error} value={trText} />
          <StatusRow icon="universal" title="Versión" value={VERSION} />
        </Rows>
      </Group>
      {user?.ai_enabled && (
        <Group title="Asistente IA" pad="16px">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <IconTile icon="sparkle" size={44} radius={14} />
            <span>
              <span style={{ display: 'block', fontWeight: 800 }}>Disponible</span>
              <span style={{ display: 'block', fontSize: 13, ...muted }}>Este mes: {fmtInt(asked)} {asked === 1 ? 'pregunta' : 'preguntas'}</span>
            </span>
          </div>
        </Group>
      )}
      {tr.data?.connected && (
        <Group title="Reparar datos de Trade Republic">
          <Rows>
            <SetRow icon="search" title="Comprobar saldo con Trade Republic" onClick={running ? undefined : check}
              trail={running === 'check' ? <Muted>…</Muted> : undefined} />
            {fixes.map(f => (
              <SetRow key={f.title} icon={f.icon} title={f.title} onClick={running ? undefined : () => fix(f)}
                trail={running === f.title ? <Muted>…</Muted> : undefined} />
            ))}
          </Rows>
        </Group>
      )}
      <Sheet open={!!balance} onClose={() => setBalance(null)} title="Saldo con Trade Republic">
        {balance && (
          <div style={{ display: 'grid' }}>
            <KV k="Según Trade Republic" v={money(balance.tr_timeline_sum, { euro: true })} />
            <Divider margin="0" />
            <KV k="En la app" v={money(balance.db_sum, { euro: true })} />
            <Divider margin="0" />
            <KV k="Diferencia" v={<span style={{ color: Math.abs(balance.db_vs_tr_diff) < 0.01 ? C.green : C.red }}>{money(balance.db_vs_tr_diff, { sign: true, euro: true })}</span>} />
            <Divider margin="0" />
            <KV k="Faltan en la app" v={fmtInt(balance.missing_from_db.length)} />
            <Divider margin="0" />
            <KV k="Sobran en la app" v={fmtInt(balance.orphan_db_rows.length)} />
            <Divider margin="0" />
            <KV k="Importes distintos" v={fmtInt(balance.amount_mismatches.length)} />
            {skipped && <><Divider margin="0" /><KV k="Cancelados ignorados" v={fmtInt(skipped.skipped_cancelled.length)} /></>}
          </div>
        )}
      </Sheet>
      <div style={{ margin: useIsPC() ? '0' : '18px 16px 0' }}>
        <Btn kind="secondary" icon="copy" height={48} style={{ width: '100%', paddingLeft: 16 }} onClick={() => copy(report(), 'Informe copiado')}>Copiar informe</Btn>
      </div>
    </>
  )
}
