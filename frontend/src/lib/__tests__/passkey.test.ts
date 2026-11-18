import { describe, expect, it } from 'vitest'
import { creationOptions, requestOptions, toB64url, toBuf } from '../passkey'

describe('passkey', () => {
  it('base64url ida y vuelta', () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63])
    const s = toB64url(bytes.buffer)!
    expect(s).not.toMatch(/[+/=]/)
    expect(Array.from(new Uint8Array(toBuf(s)))).toEqual(Array.from(bytes))
    expect(toB64url(null)).toBe(null)
  })
  it('convierte las opciones del servidor', () => {
    const c = creationOptions(JSON.stringify({ challenge: 'AAEC', user: { id: 'MQ', name: 'a', displayName: 'A' }, rp: { id: 'x', name: 'FM' }, excludeCredentials: [{ id: 'AQ', type: 'public-key' }] }))
    expect(new Uint8Array(c.challenge as ArrayBuffer)).toEqual(new Uint8Array([0, 1, 2]))
    expect(new TextDecoder().decode(c.user.id as ArrayBuffer)).toBe('1')
    expect(c.excludeCredentials![0].id).toBeInstanceOf(ArrayBuffer)
    const r = requestOptions(JSON.stringify({ challenge: 'AAEC', rpId: 'x' }))
    expect(r.allowCredentials).toEqual([])
  })
})
