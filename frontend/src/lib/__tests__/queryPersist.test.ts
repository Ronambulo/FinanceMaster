import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { forgetQueries, persistQueries, restoreQueries } from '../queryPersist'

afterEach(() => { localStorage.clear(); vi.useRealTimers() })

describe('queryPersist', () => {
  it('guarda las consultas del usuario y las recupera en otra sesión', () => {
    vi.useFakeTimers()
    const a = new QueryClient()
    const stop = persistQueries(a, () => 7)
    a.setQueryData(['accounts'], [{ source: 'TR', balance: 10 }])
    a.setQueryData(['admin', 'users'], ['no'])
    vi.advanceTimersByTime(2000)
    stop()

    const b = new QueryClient()
    restoreQueries(b, 7)
    expect(b.getQueryData(['accounts'])).toEqual([{ source: 'TR', balance: 10 }])
    expect(b.getQueryData(['admin', 'users'])).toBeUndefined()

    const other = new QueryClient()
    restoreQueries(other, 8)
    expect(other.getQueryData(['accounts'])).toBeUndefined()
  })

  it('al cerrar sesión no queda nada', () => {
    localStorage.setItem('fm-qc:7', '{}')
    localStorage.setItem('fm-theme', 'dark')
    forgetQueries()
    expect(localStorage.getItem('fm-qc:7')).toBeNull()
    expect(localStorage.getItem('fm-theme')).toBe('dark')
  })

  it('ignora copias rotas o de otra versión', () => {
    localStorage.setItem('fm-qc:7', 'xx')
    expect(() => restoreQueries(new QueryClient(), 7)).not.toThrow()
    localStorage.setItem('fm-qc:7', JSON.stringify({ v: 99, at: Date.now(), state: {} }))
    expect(() => restoreQueries(new QueryClient(), 7)).not.toThrow()
  })
})
