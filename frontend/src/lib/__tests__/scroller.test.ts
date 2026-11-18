import { describe, expect, it } from 'vitest'
import { PULL_MAX, PULL_TRIGGER, pullDistance } from '../../app/scroller'
import { reloadAttempt } from '../../app/pwa'

describe('pullDistance', () => {
  it('no baja si se tira hacia arriba', () => { expect(pullDistance(-20)).toBe(0) })
  it('va a la mitad y con tope', () => {
    expect(pullDistance(60)).toBe(30)
    expect(pullDistance(1000)).toBe(PULL_MAX)
    expect(pullDistance(PULL_TRIGGER * 2)).toBe(PULL_TRIGGER)
  })
})

describe('reloadAttempt', () => {
  it('primera vez recarga', () => { expect(reloadAttempt(null, 'b2', 0)).toBe(1) })
  it('espera entre intentos y se rinde a los 3', () => {
    expect(reloadAttempt('b2@0@1', 'b2', 30_000)).toBeNull()
    expect(reloadAttempt('b2@0@1', 'b2', 61_000)).toBe(2)
    expect(reloadAttempt('b2@0@3', 'b2', 10_000_000)).toBeNull()
  })
  it('otro build empieza de cero', () => { expect(reloadAttempt('b1@0@3', 'b2', 1)).toBe(1) })
})
