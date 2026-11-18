import { describe, expect, it } from 'vitest'
import { maskPhone, normPhone } from '../ConectarTR'
import { daysSince, trWarning } from '@/lib/accounts'

describe('teléfono TR', () => {
  it('normaliza a formato internacional', () => {
    expect(normPhone('600 123 456')).toBe('+34600123456')
    expect(normPhone('0049 151 2345')).toBe('+491512345')
    expect(normPhone('+34 600-123-456')).toBe('+34600123456')
  })
  it('enmascara el número', () => {
    expect(maskPhone('+34600123456')).toBe('+34 600 ••• 456')
    expect(maskPhone('123')).toBe('123')
  })
})

describe('aviso TR', () => {
  const now = new Date('2026-11-17T12:00:00')
  it('cuenta días', () => {
    expect(daysSince('2026-11-14T09:00:00', now)).toBe(3)
    expect(daysSince(null, now)).toBeNull()
  })
  it('solo avisa si hace falta', () => {
    expect(trWarning(undefined, true, now)).toBeNull()
    expect(trWarning({ connected: true, last_sync: '2026-11-17T09:00:00' }, true, now)).toBeNull()
    expect(trWarning({ connected: true, last_sync: '2026-11-14T09:00:00' }, true, now)).toBe('Trade Republic sin sincronizar desde hace 3 días')
    expect(trWarning({ connected: false, last_sync: null }, true, now)).toBe('Trade Republic desconectado')
    expect(trWarning({ connected: false, last_sync: null }, false, now)).toBeNull()
  })
})
