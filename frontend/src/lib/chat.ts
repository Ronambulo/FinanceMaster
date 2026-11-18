// Asistente: lectura del stream SSE de /api/ai/chat. Puro para poder testearlo.

export type ChatEvent =
  | { type: 'thinking'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'error'; text: string }
  | { type: 'meta'; model?: string }
  | { type: 'done' }

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

/**
 * Trocea el texto recibido en eventos `data: {...}`. Devuelve los eventos
 * completos y el resto (un evento a medias) para concatenarlo al siguiente trozo.
 */
export function parseSSE(buffer: string): { events: ChatEvent[]; rest: string } {
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''
  const events: ChatEvent[] = []
  for (const part of parts) {
    for (const line of part.split('\n')) {
      if (!line.startsWith('data:')) continue
      try { events.push(JSON.parse(line.slice(5).trim()) as ChatEvent) } catch { /* línea rota: se ignora */ }
    }
  }
  return { events, rest }
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Sugerencias del tablero: "¿Puedo gastar 80 € hoy?" y "Resumen de <mes anterior>". */
export function chatSuggestions(now = new Date()): string[] {
  const prev = MONTHS[(now.getMonth() + 11) % 12]
  return ['¿Puedo gastar 80 € hoy?', `Resumen de ${prev}`, '¿En qué gasto más?']
}

/** Historial que se manda al backend: los últimos turnos, sin vacíos. */
export function historyFor(turns: ChatTurn[], max = 12): ChatTurn[] {
  return turns.filter(t => t.content.trim()).slice(-max)
}
