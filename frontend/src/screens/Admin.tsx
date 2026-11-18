// Administración (tableros Admin, Usuarios, Usuario y PCAdmin).
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, type AdminStats, type AdminUser } from '@/lib/api'
import { formatBytes, formatCount, formatUptime, joinedLabel, lastAccessLabel, lastAccessShort } from '@/lib/admin'
import { useAuthStore } from '@/store/auth'
import { PCHeader, useIsPC } from '@/app/Shell'
import { Icon } from '@/ui/Icon'
import { toast } from '@/ui/Toast'
import { confirm } from '@/ui/Confirm'
import { Avatar, Btn, C, Divider, Empty, Field, Pill, RoundBtn, Rows, SearchBox, Section, SetRow, Sheet, Skeleton, SubHeader, Switch } from '@/ui/kit'

const cardSt: CSSProperties = { background: C.card, boxShadow: 'var(--sh-card)' }
const userName = (u: AdminUser) => u.display_name || u.username
const PENDING: CSSProperties = { background: 'var(--c-3a2e14)', color: 'var(--c-ffc979)', borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }

function useUsers() { return useQuery({ queryKey: ['admin-users'], queryFn: adminApi.listUsers }) }
function useStats() { return useQuery({ queryKey: ['admin-stats'], queryFn: adminApi.getStats }) }

function statList(stats?: AdminStats): [string, string][] {
  return [
    ['Usuarios', stats ? String(stats.total_users) : '—'],
    ['Movimientos', stats ? formatCount(stats.total_transactions) : '—'],
    ['Base de datos', stats?.db_size_bytes != null ? formatBytes(stats.db_size_bytes) : '—'],
    ['Encendido', stats?.uptime_seconds != null ? formatUptime(stats.uptime_seconds) : '—'],
  ]
}

function RolePill({ u, short }: { u: AdminUser; short?: boolean }) {
  if (!u.last_login_at) return <span style={PENDING}>Pendiente</span>
  if (!u.is_active) return <Pill tone="red">Bloqueado</Pill>
  if (u.is_admin) return <Pill tone="accent">{short ? 'Admin' : 'Administrador'}</Pill>
  return short ? null : <Pill tone="muted">Usuario</Pill>
}

// ── Hoja: crear usuario ─────────────────────────────────────────────────────
function NewUserSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const nav = useNavigate()
  const [username, setUsername] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const m = useMutation({
    mutationFn: () => adminApi.createUser({ username: username.trim(), password, display_name: name.trim() || undefined }),
    onSuccess: u => {
      qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['admin-stats'] })
      toast('Usuario creado'); setUsername(''); setName(''); setPassword(''); onClose(); nav(`/admin/usuarios/${u.id}`)
    },
    onError: (e: Error) => toast(e.message, { error: true }),
  })
  const ok = username.trim().length > 0 && password.length >= 6 && !m.isPending
  return (
    <Sheet open={open} onClose={onClose} title="Invitar usuario">
      <Field label="Usuario" autoFocus autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} />
      <Field label="Nombre" autoComplete="off" value={name} onChange={e => setName(e.target.value)} />
      <Field label="Contraseña" type="password" autoComplete="new-password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && ok && m.mutate()} />
      <Btn icon="add-person" disabled={!ok} onClick={() => m.mutate()} style={{ marginTop: 6 }}>Crear usuario</Btn>
    </Sheet>
  )
}

// ── Hoja: restablecer contraseña ────────────────────────────────────────────
function PasswordSheet({ user, open, onClose }: { user: AdminUser; open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const m = useMutation({
    mutationFn: () => adminApi.resetPassword(user.id, password),
    onSuccess: () => { toast('Contraseña cambiada'); setPassword(''); onClose() },
    onError: (e: Error) => toast(e.message, { error: true }),
  })
  const ok = password.length >= 6 && !m.isPending
  return (
    <Sheet open={open} onClose={onClose} title="Restablecer contraseña">
      <Field label="Nueva contraseña" type="password" autoFocus autoComplete="new-password" placeholder="Mínimo 6 caracteres" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && ok && m.mutate()} />
      <Btn icon="key" disabled={!ok} onClick={() => m.mutate()} style={{ marginTop: 6 }}>Guardar</Btn>
    </Sheet>
  )
}

// ── Admin (hub) ─────────────────────────────────────────────────────────────
export function backupsSub(b: AdminStats['backups']): string | undefined {
  if (!b) return undefined
  return b.enabled ? `Diaria · ${String(b.hour).padStart(2, '0')}:00` : 'Desactivadas'
}

function ServerRows({ stats }: { stats?: AdminStats }) {
  const unread = stats?.unread_notices
  return (
    <Rows>
      <SetRow icon="database" title="Copias del servidor" sub={backupsSub(stats?.backups)} to="/admin/copias" />
      <SetRow icon="notification-bell" title="Avisos" sub={unread ? `${unread} sin leer` : undefined} to="/admin/avisos" />
      <SetRow icon="history-record" title="Registro de actividad" to="/admin/actividad" />
      <SetRow icon="toolbox" title="Mantenimiento" to="/ajustes/diagnostico" />
    </Rows>
  )
}

function PCAdmin({ onInvite }: { onInvite: () => void }) {
  const stats = useStats()
  const users = useUsers()
  const nav = useNavigate()
  const now = useMemo(() => new Date(), [])
  const go = (id: number) => nav(`/admin/usuarios/${id}`)
  return (
    <>
      <PCHeader sub="Servidor ZimaOS" title="Administración" search={false} add={false}
        actions={<Btn icon="add-person" height={42} style={{ width: 'auto' }} onClick={onInvite}>Invitar</Btn>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {statList(stats.data).map(([k, v]) => (
          <section key={k} style={{ ...cardSt, borderRadius: 22, padding: '18px 20px' }}>
            <span style={{ display: 'block', fontSize: 13, color: C.muted, fontWeight: 600 }}>{k}</span>
            <span style={{ display: 'block', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>{v}</span>
          </section>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginTop: 16, alignItems: 'start' }}>
        <section style={{ ...cardSt, borderRadius: 22, padding: '20px 24px' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Usuarios</h2>
          {users.isLoading && <Skeleton h={160} r={16} style={{ marginTop: 12 }} />}
          {users.data?.map(u => (
            <a key={u.id} role="button" tabIndex={0} onClick={() => go(u.id)} onKeyDown={e => e.key === 'Enter' && go(u.id)}
              style={{ display: 'grid', gridTemplateColumns: '36px 1fr 140px 120px 32px', gap: 14, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${C.line}`, color: C.text, cursor: 'pointer' }}>
              <Avatar name={userName(u)} size={36} />
              <span style={{ fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName(u)}</span>
              <span><RolePill u={u} /></span>
              <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{lastAccessShort(u.last_login_at, now)}</span>
              <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span>
            </a>
          ))}
        </section>
        <section style={{ ...cardSt, borderRadius: 22, padding: '4px 24px' }}>
          <ServerRows stats={stats.data} />
        </section>
      </div>
    </>
  )
}

export default function Admin() {
  const pc = useIsPC()
  const stats = useStats()
  const users = useUsers()
  const [invite, setInvite] = useState(false)
  const sheet = <NewUserSheet open={invite} onClose={() => setInvite(false)} />
  if (pc) return <><PCAdmin onInvite={() => setInvite(true)} />{sheet}</>
  const active = users.data?.filter(u => u.is_active).length
  return (
    <>
      <SubHeader title="Administración" back="/ajustes" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '16px 16px 0' }}>
        {statList(stats.data).map(([k, v]) => (
          <section key={k} style={{ ...cardSt, borderRadius: 24, padding: '14px 16px' }}>
            <span style={{ display: 'block', fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>{v}</span>
            <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 700 }}>{k}</span>
          </section>
        ))}
      </div>
      <Section style={{ marginTop: 16 }}>
        <SetRow icon="group" title="Usuarios" sub={active != null ? `${active} activos` : undefined} to="/admin/usuarios" />
        <Divider />
        <SetRow icon="add-person" title="Invitar usuario" onClick={() => setInvite(true)} />
        <Divider />
        <ServerRows stats={stats.data} />
      </Section>
      {sheet}
    </>
  )
}

// ── Usuarios (lista móvil; en PC la lista vive en /admin) ───────────────────
export function Usuarios() {
  const pc = useIsPC()
  const nav = useNavigate()
  const users = useUsers()
  const [q, setQ] = useState('')
  const [invite, setInvite] = useState(false)
  const now = useMemo(() => new Date(), [])
  useEffect(() => { if (pc) nav('/admin', { replace: true }) }, [pc, nav])
  const needle = q.trim().toLowerCase()
  const list = (users.data ?? []).filter(u => !needle || `${u.display_name ?? ''} ${u.username} ${u.email}`.toLowerCase().includes(needle))
  return (
    <>
      <SubHeader title="Usuarios" back="/admin" actions={<RoundBtn icon="add-person" label="Invitar" onClick={() => setInvite(true)} />} />
      <div style={{ display: 'flex', padding: '16px 16px 0' }}><SearchBox value={q} onChange={setQ} placeholder="Buscar usuario" /></div>
      {users.isLoading ? <Skeleton h={240} style={{ margin: '16px 16px 0' }} /> : list.length === 0 ? <Empty icon="group" title="Sin resultados" /> : (
        <Section style={{ marginTop: 16 }}>
          {list.map((u, i) => (
            <div key={u.id}>
              {i > 0 && <Divider />}
              <Link to={`/admin/usuarios/${u.id}`} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto 18px', gap: 12, alignItems: 'center', padding: '9px 0', color: C.text }}>
                <Avatar name={userName(u)} size={40} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName(u)}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>{lastAccessLabel(u.last_login_at, now)}</span>
                </span>
                <span><RolePill u={u} short /></span>
                <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span>
              </Link>
            </div>
          ))}
        </Section>
      )}
      <NewUserSheet open={invite} onClose={() => setInvite(false)} />
    </>
  )
}

// ── Usuario (ficha) ─────────────────────────────────────────────────────────
function Stat({ v, k }: { v: ReactNode; k: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <span style={{ display: 'block', fontSize: 20, fontWeight: 800 }}>{v}</span>
      <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 700 }}>{k}</span>
    </div>
  )
}

export function Usuario() {
  const { id } = useParams()
  const uid = Number(id)
  const pc = useIsPC()
  const nav = useNavigate()
  const qc = useQueryClient()
  const me = useAuthStore(s => s.user)
  const q = useQuery({ queryKey: ['admin-user', uid], queryFn: () => adminApi.getUser(uid), enabled: Number.isFinite(uid), retry: false })
  const [pwd, setPwd] = useState(false)
  const refresh = (u?: AdminUser) => {
    if (u) qc.setQueryData(['admin-user', uid], (old?: AdminUser) => ({ ...old, ...u }))
    qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['admin-stats'] })
  }
  const onErr = (e: Error) => toast(e.message, { error: true })
  const setAdmin = useMutation({ mutationFn: (v: boolean) => adminApi.setAdmin(uid, v), onSuccess: u => refresh(u), onError: onErr })
  const setActive = useMutation({ mutationFn: (v: boolean) => adminApi.setActive(uid, v), onSuccess: u => refresh(u), onError: onErr })
  const setAi = useMutation({ mutationFn: (v: boolean) => adminApi.setAi(uid, v, q.data?.ai_model ?? null), onSuccess: u => refresh(u), onError: onErr })
  const del = useMutation({
    mutationFn: () => adminApi.deleteUser(uid),
    onSuccess: () => { refresh(); qc.removeQueries({ queryKey: ['admin-user', uid] }); toast('Usuario eliminado'); nav(pc ? '/admin' : '/admin/usuarios', { replace: true }) },
    onError: onErr,
  })
  const u = q.data
  const self = u?.id === me?.id
  const back = pc ? '/admin' : '/admin/usuarios'
  const remove = async () => {
    if (!u) return
    if (await confirm({ title: `¿Eliminar a ${userName(u)}?`, text: 'Se borrarán su cuenta y todos sus datos. No se puede deshacer.', action: 'Eliminar', icon: 'person-delete' })) del.mutate()
  }

  const body = !u ? (q.isError ? <Empty icon="person-delete" title="Usuario no encontrado" /> : <Skeleton h={320} style={{ margin: '20px 16px 0' }} />) : (
    <>
      <div style={{ textAlign: 'center', padding: '20px 16px 0' }}>
        <span style={{ display: 'inline-flex', fontSize: 30 }}><Avatar name={userName(u)} size={76} /></span>
        <p style={{ margin: '10px 0 0', fontSize: 18, fontWeight: 800 }}>{userName(u)}</p>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: C.muted, fontWeight: 600 }}>{u.username} · {joinedLabel(u.created_at)}</p>
      </div>
      <section style={{ ...cardSt, margin: '16px 16px 0', borderRadius: 24, padding: '14px 8px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <Stat v={formatCount(u.tx_count ?? 0)} k="movs." />
        <Stat v={u.account_count ?? 0} k="cuentas" />
        <Stat v={lastAccessShort(u.last_login_at)} k="último acceso" />
      </section>
      <Section style={{ marginTop: 16 }}>
        <SetRow icon="badge" title="Administrador" trail={<Switch label="Administrador" on={u.is_admin} disabled={self || setAdmin.isPending} onChange={v => setAdmin.mutate(v)} />} />
        <Divider />
        <SetRow icon="key" title="Restablecer contraseña" onClick={() => setPwd(true)} />
        <Divider />
        <SetRow icon="universal" title="Asistente IA" trail={<Switch label="Asistente IA" on={u.ai_enabled} disabled={setAi.isPending} onChange={v => setAi.mutate(v)} />} />
        <Divider />
        <SetRow icon="lock" title="Bloquear acceso" trail={<Switch label="Bloquear acceso" on={!u.is_active} disabled={self || setActive.isPending} onChange={v => setActive.mutate(!v)} />} />
        {!self && <><Divider /><SetRow icon="person-delete" title="Eliminar usuario" tone="danger" onClick={remove} /></>}
      </Section>
      <PasswordSheet user={u} open={pwd} onClose={() => setPwd(false)} />
    </>
  )
  if (pc) return (
    <>
      <PCHeader sub="Administración" title={u ? userName(u) : 'Usuario'} search={false} add={false}
        actions={<RoundBtn icon="chev-l" label="Volver" onClick={() => nav(back)} />} />
      <div style={{ maxWidth: 560 }}>{body}</div>
    </>
  )
  return <><SubHeader title={u ? userName(u) : 'Usuario'} back={back} />{body}</>
}
