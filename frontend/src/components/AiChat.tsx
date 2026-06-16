import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, X, Send, Mic, MicOff, Sparkles, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

const ALL_SUGGESTIONS = [
  // Gastos
  '¿Cuánto gasté en restaurantes este mes?',
  '¿En qué categoría gasto más?',
  '¿Cuál es mi mayor gasto recurrente?',
  '¿Cuánto llevo gastado esta semana?',
  'Dime mis 5 gastos más grandes del mes',
  '¿Cuánto gasto en ocio y entretenimiento?',
  '¿Cuánto gasto en transporte al mes?',
  'Compara mis gastos de este mes con el anterior',
  '¿En qué gasto más dinero sin darme cuenta?',
  '¿Tengo gastos que podría eliminar?',
  // Ahorro
  '¿Voy bien con mi objetivo de ahorro?',
  'Resume mis finanzas de este mes',
  '¿Cuál es mi tasa de ahorro actual?',
  '¿Cuánto he ahorrado este año?',
  '¿Cuándo podré alcanzar mi objetivo de ahorro?',
  '¿Qué % de mis ingresos estoy ahorrando?',
  'Dame consejos para ahorrar más',
  // Inversiones
  '¿Cómo va mi portfolio este mes?',
  '¿Cuál es mi mejor inversión?',
  '¿Cuánto he ganado (o perdido) en bolsa?',
  '¿Debería diversificar más mi cartera?',
  '¿Cuántos dividendos he cobrado este año?',
  // Ingresos
  '¿Cuánto ingreso al mes de media?',
  '¿Cuándo fue mi último salario?',
  '¿He cobrado intereses este mes?',
  // Panorama general
  '¿Cuál es mi patrimonio neto ahora mismo?',
  'Dame un resumen financiero completo',
  '¿Estoy mejorando respecto al mes pasado?',
  '¿Cuánto dinero tengo en efectivo?',
  '¿Cuáles son mis próximos pagos recurrentes?',
  'Dime algo que no sepa de mis finanzas',
]

function pickSuggestions(n = 5): string[] {
  const shuffled = [...ALL_SUGGESTIONS].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

function TypingCursor() {
  return (
    <span
      className="inline-block w-[2px] h-[1em] bg-current align-middle ml-0.5 animate-pulse"
      aria-hidden
    />
  )
}

const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p:      ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  ul:     ({ children }) => <ul className="list-disc pl-4 space-y-0.5 mb-1.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-4 space-y-0.5 mb-1.5">{children}</ol>,
  li:     ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em:     ({ children }) => <em className="italic">{children}</em>,
  h1:     ({ children }) => <p className="font-semibold text-sm mb-1">{children}</p>,
  h2:     ({ children }) => <p className="font-semibold text-sm mb-1">{children}</p>,
  h3:     ({ children }) => <p className="font-medium text-sm mb-0.5">{children}</p>,
  code:   ({ children }) => <code className="bg-white/[0.08] rounded px-1 py-0.5 text-[11px] font-mono">{children}</code>,
  table:  ({ children }) => <div className="overflow-x-auto my-1.5"><table className="text-xs w-full">{children}</table></div>,
  th:     ({ children }) => <th className="text-left font-semibold border-b border-white/10 pb-1 pr-3">{children}</th>,
  td:     ({ children }) => <td className="py-0.5 pr-3 border-b border-white/[0.05]">{children}</td>,
}

export function AiChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [thinkingLevel, setThinkingLevel] = useState<'fast' | 'high' | 'max'>('high')
  const [suggestions, setSuggestions] = useState(() => pickSuggestions(5))

  const { periodStart, periodEnd } = usePayrollCycle(0)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to latest message
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  // Focus textarea and rotate suggestions when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 150)
      setSuggestions(pickSuggestions(5))
    }
  }, [isOpen])

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = overrideText ?? input
    if (!text.trim() || isLoading) return

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    // Add empty assistant message for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '', isStreaming: true }])

    const token = localStorage.getItem('fm_token')
    // Build history from current messages (before adding the new user message)
    const history = messages.map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          history,
          period_start: periodStart,
          period_end: periodEnd,
          thinking_level: thinkingLevel
        }),
      })

      if (!res.ok) throw new Error('Error al conectar con el asistente')
      if (!res.body) throw new Error('No stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'delta' || event.type === 'error') {
              fullText += event.text
              setMessages(prev =>
                prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, content: fullText } : m
                )
              )
            } else if (event.type === 'done') {
              setMessages(prev =>
                prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, isStreaming: false } : m
                )
              )
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error al contactar el asistente'
      setMessages(prev =>
        prev.map((m, i) =>
          i === prev.length - 1
            ? { ...m, content: message, isStreaming: false }
            : m
        )
      )
    } finally {
      setIsLoading(false)
    }
  }, [input, messages, isLoading])

  const { listening, supported: voiceSupported, start: startVoice, stop: stopVoice } =
    useSpeechRecognition((text) => {
      setInput(text)
      sendMessage(text)
    })

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleToggleMic() {
    if (listening) {
      stopVoice()
    } else {
      startVoice()
    }
  }

  const hasUnread = messages.length > 0 && !isOpen

  return (
    <>
      {/* ── Slide-in panel ── */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-[60] flex flex-col',
          'w-[50vw] max-w-[calc(100vw-2rem)] min-w-80',
          'bg-[hsl(228_22%_8%)] border-l border-white/[0.07]',
          'shadow-[-24px_0_80px_rgba(0,0,0,0.6)]',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold">Asistente IA</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              Beta
            </span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); setSuggestions(pickSuggestions(5)) }}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                title="Nueva conversación"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
              aria-label="Cerrar asistente"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-4 pt-2">
              {/* Welcome */}
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-semibold">¿En qué puedo ayudarte?</p>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
                  Pregúntame sobre tus finanzas, gastos, ahorro o inversiones.
                </p>
              </div>

              {/* Suggestion chips */}
              <div className="grid grid-cols-1 gap-2">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className={cn(
                      'rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2.5',
                      'text-left text-xs text-muted-foreground leading-snug',
                      'hover:bg-white/[0.07] hover:text-foreground hover:border-white/[0.12]',
                      'transition-all duration-150 active:scale-[0.98]'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-primary/15 text-foreground rounded-tr-sm'
                      : 'bg-white/[0.05] border border-white/[0.07] text-foreground/90 rounded-tl-sm'
                  )}
                >
                  {msg.role === 'assistant' && msg.content ? (
                    <ReactMarkdown components={MD_COMPONENTS}>{msg.content}</ReactMarkdown>
                  ) : (
                    msg.content || (msg.isStreaming ? null : '…')
                  )}
                  {msg.isStreaming && (
                    msg.content ? <TypingCursor /> : (
                      <span className="flex gap-1 items-center h-4 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                      </span>
                    )
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-white/[0.07] p-3">
          {/* Thinking Level Selector */}
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold select-none">
              Razonamiento:
            </span>
            <button
              onClick={() => setThinkingLevel('fast')}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium transition-all duration-150 border',
                thinkingLevel === 'fast'
                  ? 'bg-primary/15 border-primary/30 text-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.1)]'
                  : 'bg-transparent border-white/[0.05] text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.08]'
              )}
            >
              Rápido
            </button>
            <button
              onClick={() => setThinkingLevel('high')}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium transition-all duration-150 border',
                thinkingLevel === 'high'
                  ? 'bg-primary/15 border-primary/30 text-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.1)]'
                  : 'bg-transparent border-white/[0.05] text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.08]'
              )}
            >
              Lógico
            </button>
            <button
              onClick={() => setThinkingLevel('max')}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium transition-all duration-150 border',
                thinkingLevel === 'max'
                  ? 'bg-primary/15 border-primary/30 text-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.1)]'
                  : 'bg-transparent border-white/[0.05] text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.08]'
              )}
            >
              Profundo
            </button>
          </div>

          <div className="flex items-end gap-2 rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 py-2 focus-within:border-primary/30 focus-within:bg-white/[0.06] transition-colors">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta algo sobre tus finanzas…"
              className={cn(
                'flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50',
                'focus:outline-none leading-relaxed max-h-32 min-h-[1.5rem]',
                'scrollbar-thin'
              )}
              style={{ fieldSizing: 'content' } as React.CSSProperties}
              disabled={isLoading}
            />

            {/* Mic button */}
            <div className="relative">
              <button
                onClick={handleToggleMic}
                disabled={!voiceSupported}
                title={voiceSupported ? (listening ? 'Detener grabación' : 'Hablar') : 'No disponible en este navegador'}
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all',
                  listening
                    ? 'bg-red-500/20 text-red-400 animate-pulse ring-1 ring-red-500/40'
                    : voiceSupported
                    ? 'text-muted-foreground hover:text-foreground hover:bg-white/[0.08]'
                    : 'text-muted-foreground/30 cursor-not-allowed'
                )}
              >
                {listening ? (
                  <MicOff className="h-3.5 w-3.5" />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* Send button */}
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all',
                input.trim() && !isLoading
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                  : 'bg-white/[0.06] text-muted-foreground/40 cursor-not-allowed'
              )}
              aria-label="Enviar mensaje"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
            Enter para enviar · Shift+Enter para nueva línea
          </p>
        </div>
      </div>

      {/* ── Backdrop (mobile) ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[59] bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* ── Floating action button ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={cn(
            'fixed bottom-24 right-4 z-50 md:bottom-6 md:right-6',
            'flex items-center justify-center rounded-full',
            'bg-gradient-to-br from-primary to-primary/70',
            'shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.1)]',
            'text-primary-foreground transition-all duration-200',
            'hover:scale-105 hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)]',
            'active:scale-95'
          )}
          aria-label="Abrir asistente IA"
          style={{ height: '3.25rem', width: '3.25rem' }}
        >
          <MessageCircle className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-[hsl(228_22%_8%)]" />
          )}
        </button>
      )}
    </>
  )
}
