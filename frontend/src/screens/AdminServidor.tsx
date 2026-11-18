// Administración → Copias del servidor, Avisos y Registro de actividad.
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, type ActivityEntry, type AdminNotice } from '@/lib/api'
import { backupWhen, clockTime, formatBytes, timeAgo } from '@/lib/admin'
import { Icon, type AnyIcon } from '@/ui/Icon'
import { toast } from '@/ui/Toast'
import { confirm } from '@/ui/Confirm'
import { Btn, C, Divider, Empty, ErrorState, Label, Rows, Section, SetRow, Sheet, SheetOption, Skeleton, SubHeader, Switch } from '@/ui/kit'

const errText = (e: unknown, f = 'Algo ha fallado') => (e instanceof Error && e.message) || f
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`
const iconBtn = { border: 0, background: 'transparent', cursor: 'pointer', display: 'flex', padding: 6 } as const

// ── Copias del servidor ─────────────────────────────────────────────────────
export function Copias() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin-backups'], queryFn: adminApi.backups })
  const [keepOpen, setKeepOpen] = useState(false)
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-backups'] }); qc.invalidateQueries({ queryKey: ['admin-stats'] }) }
  const update = useMutation({
    mutationFn: adminApi.updateBackups,
    onSuccess: d => { qc.setQueryData(['admin-backups'], d); qc.invalidateQueries({ queryKey: ['admin-stats'] }) },
    onError: e => toast(errText(e, 'No se pudo guardar'), { error: true }),
  })
  const now = useMutation({
    mutationFn: adminApi.backupNow,
    onSuccess: () => { refresh(); toast('Copia hecha') },
    onError: e => toast(errText(e, 'No se pudo hacer la copia'), { error: true }),
  })
  const download = (name: string) => adminApi.downloadBackup(name).catch(e => toast(errText(e), { error: true }))
  const d = q.data
  return (
    <>
      <SubHeader title="Copias del servidor" back="/admin" />
      {q.isLoading ? <Skeleton h={200} style={{ margin: '16px 16px 0' }} /> : q.isError || !d ? <ErrorState retry={() => q.refetch()} /> : (
        <>
          <Section style={{ marginTop: 16 }}>
            <Rows>
              <SetRow icon="database" title="Copia diaria" sub={d.enabled ? `Cada día a las ${hourLabel(d.hour)}` : 'Desactivada'}
                trail={<Switch label="Copia diaria" on={d.enabled} disabled={update.isPending} onChange={v => update.mutate({ enabled: v })} />} />
              <SetRow icon="layers" title="Guardar" sub={`Las ${d.keep} últimas`} onClick={() => setKeepOpen(true)} />
            </Rows>
          </Section>
          <div style={{ padding: '16px 16px 0' }}>
            <Btn icon="refresh" height={50} style={{ width: '100%' }} disabled={now.isPending} onClick={() => now.mutate()}>
              {now.isPending ? 'Haciendo copia…' : 'Hacer copia ahora'}
            </Btn>
          </div>
          <Label>Copias guardadas</Label>
          {d.items.length === 0 ? <Empty icon="database" title="Aún no hay copias" /> : (
            <Section>
              <Rows>
                {d.items.map(b => (
                  <SetRow key={b.name} icon="database" title={backupWhen(b.created_at)} sub={formatBytes(b.size_bytes)}
                    trail={<button type="button" aria-label={`Descargar copia ${backupWhen(b.created_at)}`} onClick={() => download(b.name)}
                      style={{ ...iconBtn, color: C.accentText }}><Icon name="download" size={20} /></button>} />
                ))}
              </Rows>
            </Section>
          )}
          <Sheet open={keepOpen} onClose={() => setKeepOpen(false)} title="Guardar">
            {d.keep_choices.map(k => (
              <SheetOption key={k} title={`Las ${k} últimas`} selected={d.keep === k} onClick={() => { setKeepOpen(false); update.mutate({ keep: k }) }} />
            ))}
          </Sheet>
        </>
      )}
      <div style={{ height: 24 }} />
    </>
  )
}

// ── Avisos ──────────────────────────────────────────────────────────────────
const LEVEL_ICON: Record<string, AnyIcon> = { error: 'feedback-error', warning: 'feedback-warning', info: 'notification-bell' }

export function Avisos() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin-notices'], queryFn: adminApi.notices })
  const unread = q.data?.unread ?? 0
  // Al abrir se marcan como leídos; el punto de "sin leer" se ve durante esta visita.
  useEffect(() => {
    if (unread > 0) adminApi.readNotices().then(() => qc.invalidateQueries({ queryKey: ['admin-stats'] })).catch(() => {})
  }, [unread, qc])
  const remove = useMutation({
    mutationFn: adminApi.deleteNotice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-notices'] }),
    onError: e => toast(errText(e), { error: true }),
  })
  const ask = async (n: AdminNotice) => {
    if (await confirm({ title: '¿Borrar este aviso?', action: 'Borrar', icon: 'delete', danger: true })) remove.mutate(n.id)
  }
  const items = q.data?.items ?? []
  return (
    <>
      <SubHeader title="Avisos" back="/admin" />
      {q.isLoading ? <Skeleton h={200} style={{ margin: '16px 16px 0' }} /> : q.isError ? <ErrorState retry={() => q.refetch()} /> :
        items.length === 0 ? <Empty icon="notification-bell" title="No hay avisos" /> : (
          <Section style={{ marginTop: 16 }}>
            <Rows>
              {items.map(n => (
                <SetRow key={n.id} icon={LEVEL_ICON[n.level] ?? 'notification-bell'} tone={n.level === 'error' ? 'danger' : undefined}
                  title={<>{n.title}{!n.read && <span aria-label="Sin leer" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 99, background: C.accent, marginLeft: 8, verticalAlign: 'middle' }} />}</>}
                  sub={[n.text, timeAgo(n.created_at)].filter(Boolean).join(' · ')}
                  trail={<button type="button" aria-label="Borrar aviso" onClick={() => ask(n)} style={{ ...iconBtn, color: C.muted }}><Icon name="close" size={18} /></button>} />
              ))}
            </Rows>
          </Section>
        )}
      <div style={{ height: 24 }} />
    </>
  )
}

// ── Registro de actividad ───────────────────────────────────────────────────
const ACTION_ICON: Record<string, AnyIcon> = {
  login: 'user', login_failed: 'feedback-warning', logout: 'power-switch', register: 'add-person',
  password_changed: 'key', sessions_closed: 'history-record', import: 'upload', account_deleted: 'person-delete',
  admin_user_created: 'add-person', admin_set_admin: 'badge', admin_password_reset: 'key',
  admin_set_active: 'lock', admin_user_deleted: 'person-delete', backup: 'database',
}

export function groupByDay(list: ActivityEntry[], now = new Date()): [string, ActivityEntry[]][] {
  const out: [string, ActivityEntry[]][] = []
  for (const a of list) {
    const k = timeAgo(a.created_at, now)
    const last = out[out.length - 1]
    if (last && last[0] === k) last[1].push(a)
    else out.push([k, [a]])
  }
  return out
}

export function Actividad() {
  const q = useQuery({ queryKey: ['admin-activity'], queryFn: () => adminApi.activity(200) })
  const groups = useMemo(() => groupByDay(q.data ?? []), [q.data])
  return (
    <>
      <SubHeader title="Registro de actividad" back="/admin" />
      {q.isLoading ? <Skeleton h={240} style={{ margin: '16px 16px 0' }} /> : q.isError ? <ErrorState retry={() => q.refetch()} /> :
        groups.length === 0 ? <Empty icon="history-record" title="Aún no hay actividad" /> : groups.map(([day, list]) => (
          <div key={day}>
            <Label>{day}</Label>
            <Section>
              {list.map((a, i) => (
                <div key={a.id}>
                  {i > 0 && <Divider />}
                  <SetRow icon={ACTION_ICON[a.action] ?? 'history-record'} tone={a.action === 'login_failed' ? 'danger' : undefined}
                    title={a.username ? `${a.username} · ${a.label}` : a.label}
                    sub={[a.detail, clockTime(a.created_at)].filter(Boolean).join(' · ')} trail={<></>} />
                </div>
              ))}
            </Section>
          </div>
        ))}
      <div style={{ height: 24 }} />
    </>
  )
}
