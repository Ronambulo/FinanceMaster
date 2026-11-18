import { describe, expect, it } from 'vitest'
import { normalizeTheme, resolveDark } from '../theme'

describe('normalizeTheme', () => {
  it('mapea los temas antiguos', () => {
    expect(normalizeTheme('trade-republic')).toBe('dark')
    expect(normalizeTheme('dark-purple')).toBe('dark')
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme(null)).toBe('system')
    expect(normalizeTheme('system')).toBe('system')
  })
})

describe('resolveDark', () => {
  it('sigue al sistema solo en modo sistema', () => {
    expect(resolveDark('system', true)).toBe(true)
    expect(resolveDark('system', false)).toBe(false)
    expect(resolveDark('light', true)).toBe(false)
    expect(resolveDark('dark', false)).toBe(true)
  })
})
