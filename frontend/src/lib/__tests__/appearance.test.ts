import { beforeEach, describe, expect, it } from 'vitest'
import { accentCss, applyAppearance, getAccent, getHideOnOpen, getTextSize, setAccent, setHideOnOpen, setReduceMotion, setTextSize } from '../appearance'

describe('appearance', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.className = ''; document.getElementById('fm-accent')?.remove() })

  it('defaults', () => {
    expect(getAccent()).toBe('morado')
    expect(getTextSize()).toBe('normal')
    expect(getHideOnOpen()).toBe(false)
    expect(accentCss('morado')).toBe('')
  })

  it('accent overrides the accent variables in both themes', () => {
    const css = accentCss('verde')
    expect(css).toContain('html.dark{--c-5b52f0:#1f9d63')
    expect(css).toContain('html:root{--c-5b52f0:#177a4d')
    setAccent('verde')
    expect(getAccent()).toBe('verde')
    expect(document.getElementById('fm-accent')?.textContent).toBe(css)
  })

  it('ignores garbage and persists the rest', () => {
    localStorage.setItem('fm-accent', 'fucsia')
    localStorage.setItem('fm-text-size', 'xxl')
    expect(getAccent()).toBe('morado')
    expect(getTextSize()).toBe('normal')
    setTextSize('grande'); setReduceMotion(true); setHideOnOpen(true)
    expect(getTextSize()).toBe('grande')
    expect(getHideOnOpen()).toBe(true)
    document.documentElement.className = ''
    applyAppearance()
    expect(document.documentElement.classList.contains('reduce-motion')).toBe(true)
  })
})
