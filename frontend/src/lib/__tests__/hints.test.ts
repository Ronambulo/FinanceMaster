import { afterEach, describe, expect, it } from 'vitest'
import { hintSeen, markHint } from '../hints'

afterEach(() => localStorage.clear())

describe('hints', () => {
  it('se enseña una vez', () => {
    expect(hintSeen('swipe')).toBe(false)
    markHint('swipe')
    expect(hintSeen('swipe')).toBe(true)
    expect(hintSeen('nav')).toBe(false)
  })
})
