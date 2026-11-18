import { describe, expect, it } from 'vitest'
import { deviceName, pushState, urlBase64ToUint8Array, type PushEnv } from '../push'
import { changePct, changeText, parseCloseRange } from '../cycles'
import { byUsage } from '../movements'
import { DEFAULT_PREFERENCES, applyPatch, isModuleOn, sanitize } from '../preferences'
import { amountInput, equalSplit, sharesValid } from '../shares'

const env = (o: Partial<PushEnv> = {}): PushEnv => ({ ios: false, standalone: false, hasPush: true, permission: 'default', subscribed: false, ...o })

describe('pushState', () => {
  it('iPhone fuera de la app instalada pide instalar, aunque no haya PushManager', () => {
    expect(pushState(env({ ios: true, hasPush: false }))).toBe('needsInstall')
  })
  it('iPhone instalado se comporta como cualquier navegador', () => {
    expect(pushState(env({ ios: true, standalone: true, permission: 'granted', subscribed: true }))).toBe('on')
  })
  it('sin API de push no se puede', () => expect(pushState(env({ hasPush: false }))).toBe('unsupported'))
  it('bloqueado', () => expect(pushState(env({ permission: 'denied' }))).toBe('denied'))
  it('on solo con permiso y suscripción', () => {
    expect(pushState(env({ permission: 'granted' }))).toBe('off')
    expect(pushState(env({ subscribed: true }))).toBe('off')
    expect(pushState(env({ permission: 'granted', subscribed: true }))).toBe('on')
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodifica base64url sin relleno', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3])
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255])
  })
})

describe('deviceName', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Mobile/15E148', 'iPad'],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'Android'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Mac'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'Linux'],
    ['curl/8', 'Navegador'],
  ])('%s', (ua, name) => expect(deviceName(ua)).toBe(name))
})

describe('cierre de ciclo', () => {
  it('changePct', () => {
    expect(changePct(110, 100)).toBe(10)
    expect(changePct(95, 100)).toBe(-5)
    expect(changePct(50, 0)).toBeNull()
    expect(changePct(50, -10)).toBeNull()
  })
  it('changeText', () => {
    expect(changeText(12)).toBe('+12 %')
    expect(changeText(-5)).toBe('−5 %')
    expect(changeText(0)).toBe('igual')
  })
  it('parseCloseRange', () => {
    expect(parseCloseRange('2026-10-28', '2026-11-26')).toEqual({ start: '2026-10-28', end: '2026-11-26' })
    expect(parseCloseRange(null, '2026-11-26')).toBeNull()
    expect(parseCloseRange('2026-11-26', '2026-10-28')).toBeNull()
    expect(parseCloseRange('28/10/2026', '2026-11-26')).toBeNull()
  })
})

describe('byUsage', () => {
  const cats = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
  it('lo más usado primero y, a igualdad, el orden original', () => {
    expect(byUsage(cats, { 3: 9, 2: 9, 4: 1 }).map(c => c.id)).toEqual([2, 3, 4, 1])
  })
  it('sin datos no cambia nada', () => expect(byUsage(cats, undefined)).toBe(cats))
})

describe('preferencias de avisos y módulo compartidos', () => {
  it('por defecto todos los avisos activos y compartidos apagado', () => {
    expect(DEFAULT_PREFERENCES.notify).toEqual({ recurring: true, budget: true, payroll: true })
    expect(isModuleOn(DEFAULT_PREFERENCES, 'shared')).toBe(false)
  })
  it('sanitize ignora claves y valores desconocidos', () => {
    const p = sanitize({ notify: { budget: false, spam: true, payroll: 'no' } })
    expect(p.notify).toEqual({ recurring: true, budget: false, payroll: true })
  })
  it('sanitize de un perfil antiguo sin notify', () => {
    expect(sanitize({ ui_mode: 'normal' }).notify).toEqual({ recurring: true, budget: true, payroll: true })
  })
  it('applyPatch mezcla avisos', () => {
    const p = applyPatch(DEFAULT_PREFERENCES, { notify: { recurring: false } })
    expect(p.notify).toEqual({ recurring: false, budget: true, payroll: true })
  })
})

describe('gastos compartidos', () => {
  it('equalSplit: partes iguales contándote a ti, los céntimos sobrantes los pones tú', () => {
    expect(equalSplit(30, 2)).toEqual([10, 10])
    expect(equalSplit(10, 2)).toEqual([3.33, 3.33])
    expect(equalSplit(-20, 1)).toEqual([10])
    expect(equalSplit(20, 0)).toEqual([])
  })
  it('sharesValid', () => {
    expect(sharesValid([], 20)).toBe(true)
    expect(sharesValid([{ person: 'Ana', amount: 10 }, { person: 'Luis', amount: 10 }], 20)).toBe(true)
    expect(sharesValid([{ person: 'Ana', amount: 21 }], 20)).toBe(false)
    expect(sharesValid([{ person: 'Ana', amount: 5 }, { person: ' ana ', amount: 5 }], 20)).toBe(false)
    expect(sharesValid([{ person: '', amount: 5 }], 20)).toBe(false)
    expect(sharesValid([{ person: 'Ana', amount: 0 }], 20)).toBe(false)
    expect(sharesValid([{ person: 'Ana', amount: 10.001 }], 10)).toBe(true)
  })
  it('amountInput', () => {
    expect(amountInput(10)).toBe('10')
    expect(amountInput(3.333)).toBe('3,33')
  })
})
