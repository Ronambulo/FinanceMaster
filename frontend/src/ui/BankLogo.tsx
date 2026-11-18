import type { CSSProperties } from 'react'
import { Icon } from './Icon'

// Logos de bancos y brokers tal como aparecen en el lienzo.
const N26 = "M0 3.803v1.195h7.436V3.803H0zM12.69 7.29c-2.034 0-3.038 1.252-3.038 2.684 0 .234.027.468.092.728l1.393.135a3.697 3.697 0 0 1-.09-.793c0-1.072.71-1.586 1.598-1.586.866 0 1.507.485 1.507 1.652 0 1.186-.58 1.995-1.464 2.88-.925.923-2.4 2.027-3.112 2.534v1.092h6.135v-1.195h-4.168c.695-.48 1.69-1.279 2.133-1.72.502-.503 1.931-1.794 1.931-3.636 0-1.903-1.24-2.775-2.918-2.775zm8.34 0c-1.976 0-3.454 1.517-3.454 4.916 0 3.017 1.233 4.508 3.356 4.508 1.754 0 3.068-1.198 3.068-3.172 0-1.542-.823-3.066-2.793-3.066-1.1 0-1.884.51-2.281 1.263 0-1.78.62-3.33 2.094-3.33.937 0 1.309.538 1.507 1.422l1.366-.271c-.321-1.527-1.292-2.27-2.864-2.27zM.075 7.389v9.228h1.33v-6.312c0-.56-.013-.898-.039-1.223h.026c.136.372.298.699.539 1.123l3.732 6.412h1.69V7.39H6.04v6.31c0 .56.013.898.04 1.223h-.028a7.252 7.252 0 0 0-.537-1.123L1.783 7.389H.076zm20.817 4.185c1.114 0 1.744.822 1.744 1.992 0 1.256-.717 2.034-1.701 2.034-1.09 0-1.843-1.001-1.973-2.329.33-1.133 1.063-1.697 1.93-1.697zM0 19.008v1.19h7.436v-1.19H0z"
const REVOLUT = "M20.9133 6.9566C20.9133 3.1208 17.7898 0 13.9503 0H2.424v3.8605h10.9782c1.7376 0 3.177 1.3651 3.2087 3.043.016.84-.2994 1.633-.8878 2.2324-.5886.5998-1.375.9303-2.2144.9303H9.2322a.2756.2756 0 0 0-.2755.2752v3.431c0 .0585.018.1142.052.1612L16.2646 24h5.3114l-7.2727-10.094c3.6625-.1838 6.61-3.2612 6.61-6.9494zM6.8943 5.9229H2.424V24h4.4704z"
const CAIXA = "M4.938 16c.183 0 .315.13.487.1.239.09.212.383.462.455.19.384.312.797.419 1.21-.077.244.129.384.056.608l.072.04a1.8 1.8 0 0 1-.114.716c.038.426-.17.78-.353 1.14-.13.083-.19.314-.372.273-.323.102-.353.584-.748.524-.25.189-.596.083-.895.09-.176-.09-.419-.067-.536-.22a3.3 3.3 0 0 1-.84-.57c-.102-.22-.333-.318-.363-.57.09-.302-.1-.576-.02-.88l-.06-.504.19-.87c.326-.171.235-.561.558-.683.2-.467.683-.566 1.059-.797.14-.03.311.05.422-.08.205-.03.394.179.577.018m1.496-3.682c.202.14.19.422.372.566l.092.622-.456.669c-.573.303-1.431.433-1.967-.054-.304-.269-.383-.664-.304-1.059l.213-.573c.122-.084.28-.103.365-.243.28-.182.645-.14.967-.213.244.08.607-.05.718.282zm14.967-9.766c-.084 1.424-1.253 2.38-1.868 3.584-.266.714-.89 1.14-1.33 1.784-.405.418-.796.87-1.134 1.334.06.333.418.424.618.667.456.27.502.786.896 1.102.232 0 .232.341.487.3.535.577.967 1.173 1.412 1.795a1.3 1.3 0 0 0 .37.607c.355.514.647 1.064 1.01 1.584.055.585.549.979.7 1.526.22.292.312.635.513.926.316.684.524 1.406.9 2.062.069.152-.023.3-.103.41-.14.114-.25-.091-.414-.06a14 14 0 0 1-2.38-1.2c-.79-.638-1.656-1.09-2.43-1.758-.304-.076-.428-.433-.71-.574-.747-.462-1.344-1.131-2.1-1.563-.341-.266-.683-.518-1.028-.79-.266-.027-.354-.331-.607-.422-.563-.342-1.08-.82-1.656-1.14-.05.077 0 .203-.05.282-.383.373-.28.949-.554 1.364-.01.595-.425 1.028-.596 1.556-.475.846-.888 1.712-1.382 2.55-.657.87-1.01 1.919-1.937 2.614-.205.253-.436.383-.686.546-.114-.03-.274-.012-.304-.152-.114-.212.03-.532-.121-.725.132-.297.05-.627.113-.95l-.053-.14c.01-.444.23-.82.14-1.272a3 3 0 0 0 .206-.91 5 5 0 0 0 .303-1.212 1.5 1.5 0 0 0 .153-.836c.098-.265.117-.576.39-.77.039-.17 0-.342.03-.524.27-.827.608-1.625.817-2.471 0-.061-.06-.08-.103-.092-.596-.03-1.15.092-1.705-.06a14 14 0 0 1-2.695-.311c-.348-.07-.774-.027-1.097-.23-.209.009-.452.05-.653-.063-.418-.2-.919-.167-1.329-.391-.315.038-.54-.16-.82-.19-.274.019-.425-.212-.615-.364v-.092c.5-.683 1.31-.876 2.038-1.139.714-.224 1.511-.243 2.26-.395.475-.08.987.05 1.465-.03.858.02 1.682.16 2.532.182.282.038.544.172.828.16l-.01-.122-.8-1.09c-.302-.705-.857-1.302-1.046-2.05-.182-.219-.012-.553-.152-.796-.011-.11.075-.19.13-.282.17-.068.363.05.535-.06.515.12.986.303 1.503.405.53.21 1.078.422 1.556.776.593.425 1.31.698 1.773 1.351.125.114.316.133.475.091.14-.019.17-.19.303-.243.627-.39 1.334-.615 1.948-1.048.255-.25.657-.28.81-.627.189-.09.36-.212.565-.265.353-.247.707-.52 1.09-.72a1.1 1.1 0 0 0 .515-.244c.627-.342 1.284-.627 1.88-1.02.13-.355.524-.27.805-.355.14.034.334.012.395.19z"

export type BankId = 'n26' | 'revolut' | 'caixabank' | 'trade_republic' | 'myinvestor' | 'bbva' | 'other' | 'manual'

export function bankId(source: string | null | undefined): BankId {
  const s = (source ?? '').toLowerCase()
  if (!s || s === 'manual') return 'manual'
  if (s.includes('n26')) return 'n26'
  if (s.includes('revolut')) return 'revolut'
  if (s.includes('caixa')) return 'caixabank'
  if (s.includes('trade')) return 'trade_republic'
  if (s.includes('myinvestor')) return 'myinvestor'
  if (s.includes('bbva')) return 'bbva'
  return 'other'
}

/** Ficha del banco. Tamaño del lienzo: 40 → radio 13; 26 → 8; 48 → 15. */
export function BankLogo({ source, id, size = 40, radius, style }: { source?: string | null; id?: BankId; size?: number; radius?: number; style?: CSSProperties }) {
  const b = id ?? bankId(source)
  const r = radius ?? Math.round(size * 0.325)
  const base: CSSProperties = { width: size, height: size, borderRadius: r, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', color: 'var(--c-ffffff)', ...style }
  const svg = (d: string) => <svg width={Math.round(size / 2)} height={Math.round(size / 2)} viewBox="0 0 24 24" fill="currentColor"><path d={d} /></svg>
  switch (b) {
    case 'n26': return <span aria-hidden="true" style={{ ...base, background: 'var(--c-36a18b)' }}>{svg(N26)}</span>
    case 'revolut': return <span aria-hidden="true" style={{ ...base, background: 'var(--c-0b0b0f)', boxShadow: 'inset 0 0 0 1px var(--c-2a2b38)' }}>{svg(REVOLUT)}</span>
    case 'caixabank': return <span aria-hidden="true" style={{ ...base, background: 'var(--c-0b7fab)' }}>{svg(CAIXA)}</span>
    case 'trade_republic': return (
      <span aria-hidden="true" style={{ ...base, background: 'var(--c-ffffff)', color: 'var(--c-0b0b0f)' }}>
        <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="104 118 185 150" fill="currentColor">
          <polygon points="120,150 180,135 210,145 273,130 273,176 210,191 180,181 120,196" stroke="currentColor" strokeWidth="8" strokeLinejoin="round" />
          <polygon points="120,210 180,195 210,205 273,190 273,236 210,251 180,241 120,256" stroke="currentColor" strokeWidth="8" strokeLinejoin="round" />
        </svg>
      </span>
    )
    case 'myinvestor': return <span aria-hidden="true" style={{ ...base, background: 'var(--c-13294b)', fontSize: Math.round(size * 0.425), fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>my</span>
    case 'bbva': return <span aria-hidden="true" style={{ ...base, background: 'var(--c-001391)', fontSize: Math.round(size / 4), fontWeight: 800, letterSpacing: '0.02em', lineHeight: 1 }}>BBVA</span>
    case 'manual': return <span aria-hidden="true" style={{ ...base, background: 'var(--c-262546)', color: 'var(--c-b3aeff)' }}><Icon name="edit" size={Math.round(size / 2)} /></span>
    default: return <span aria-hidden="true" style={{ ...base, background: 'var(--c-262546)', color: 'var(--c-b3aeff)' }}><Icon name="bank-card" size={Math.round(size / 2)} /></span>
  }
}
