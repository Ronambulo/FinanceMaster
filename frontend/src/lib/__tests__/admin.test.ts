import { describe, expect, it } from 'vitest'
import { backupWhen, clockTime, formatBytes, formatCount, formatUptime, joinedLabel, lastAccessLabel, lastAccessShort, timeAgo } from '../admin'

describe('admin formats', () => {
  it('formatCount', () => {
    expect(formatCount(980)).toBe('980')
    expect(formatCount(12400)).toBe('12,4k')
    expect(formatCount(2_300_000)).toBe('2,3M')
  })
  it('formatBytes', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(38 * 1024 * 1024)).toBe('38 MB')
    expect(formatBytes(1.2 * 1024 ** 3)).toBe('1,2 GB')
  })
  it('formatUptime', () => {
    expect(formatUptime(90)).toBe('1 min')
    expect(formatUptime(5 * 3600)).toBe('5 h')
    expect(formatUptime(3 * 86400 + 5)).toBe('3 d')
  })
  it('last access', () => {
    const now = new Date(2026, 10, 17, 12)
    expect(lastAccessShort(null, now)).toBe('—')
    expect(lastAccessShort(new Date(2026, 10, 17, 9).toISOString(), now)).toBe('Hoy')
    expect(lastAccessShort(new Date(2026, 10, 16, 9).toISOString(), now)).toBe('Ayer')
    expect(lastAccessShort(new Date(2026, 10, 14, 9).toISOString(), now)).toBe('Hace 3 días')
    expect(lastAccessLabel(undefined, now)).toBe('Nunca ha entrado')
    expect(lastAccessLabel(new Date(2026, 10, 15, 9).toISOString(), now)).toBe('Hace 2 días')
  })
  it('joinedLabel', () => {
    expect(joinedLabel('2026-01-10T10:00:00')).toBe('alta en enero 2026')
  })
})

describe('servidor', () => {
  it('fecha de copia', () => {
    expect(backupWhen('2026-11-17T03:00:05')).toBe('17 nov · 03:00')
    expect(backupWhen('raro')).toBe('raro')
  })
  it('día relativo y hora', () => {
    const now = new Date(2026, 10, 18, 12, 0)
    expect(timeAgo(new Date(2026, 10, 18, 9, 0).toISOString(), now)).toBe('Hoy')
    expect(timeAgo(new Date(2026, 10, 15, 9, 0).toISOString(), now)).toBe('Hace 3 días')
    expect(clockTime(new Date(2026, 10, 18, 9, 5).toISOString())).toBe('09:05')
  })
})
