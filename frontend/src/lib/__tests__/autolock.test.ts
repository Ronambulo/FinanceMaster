import { beforeEach, describe, expect, it } from 'vitest'
import { getLockMinutes, lockLabel, markHidden, setLockMinutes, shouldLock, takeHidden } from '../autolock'

describe('autolock', () => {
  beforeEach(() => localStorage.clear())
  it('nunca bloquea si está desactivado o no hay marca', () => {
    expect(shouldLock(0, 10 ** 9, -1)).toBe(false)
    expect(shouldLock(null, 10 ** 9, 5)).toBe(false)
  })
  it('bloquea al pasar el tiempo', () => {
    expect(shouldLock(0, 4 * 60_000, 5)).toBe(false)
    expect(shouldLock(0, 5 * 60_000, 5)).toBe(true)
    expect(shouldLock(1000, 1000, 0)).toBe(true)
  })
  it('guarda el ajuste y por defecto es Nunca', () => {
    expect(getLockMinutes()).toBe(-1)
    setLockMinutes(5)
    expect(getLockMinutes()).toBe(5)
    localStorage.setItem('fm_lock_minutes', '7')
    expect(getLockMinutes()).toBe(-1)
  })
  it('la marca se lee una vez', () => {
    markHidden(123)
    expect(takeHidden()).toBe(123)
    expect(takeHidden()).toBe(null)
  })
  it('textos', () => {
    expect(lockLabel(-1)).toBe('Nunca')
    expect(lockLabel(0)).toBe('Al momento')
    expect(lockLabel(5)).toBe('Tras 5 minutos')
  })
})
