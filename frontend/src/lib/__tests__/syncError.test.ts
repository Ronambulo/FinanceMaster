import { describe, expect, it } from 'vitest'
import { syncErrorText } from '@/screens/SyncError'

describe('syncErrorText', () => {
  it('asks to reconnect when the session is gone', () => {
    expect(syncErrorText('Trade Republic', 'No conectado a Trade Republic')).toMatch(/ha caducado/)
    expect(syncErrorText('Trade Republic')).toMatch(/Vuelve a conectar/)
  })
  it('keeps other messages', () => {
    expect(syncErrorText('Trade Republic', 'Servidor ocupado')).toBe('Servidor ocupado')
  })
})
