import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Mic, MicOff, Sparkles, Trash2, Bot, User, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'
import { useChatStore } from '@/store/chat'
import { useAuthStore } from '@/store/auth'
import { aiApi, type AiModel } from '@/lib/api'

interface MessageMeta {
  model: string
  elapsed_ms: number
  input_tokens?: number
  output_tokens?: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  meta?: MessageMeta
}

const ALL_SUGGESTIONS = [
  // Situación financiera
  '¿Cómo está mi salud financiera general?',
  '¿Estoy gastando demasiado?',
  '¿Cuál es mi mayor gasto innecesario?',
  '¿Cuánto ahorro realmente cada tramo?',
  '¿Qué gastos puedo reducir sin afectar mi calidad de vida?',
  '¿Cuál es mi patrimonio neto actual?',
  '¿Cómo ha evolucionado mi situación financiera este año?',
  // Presupuesto
  '¿En qué categoría gasto más dinero?',
  '¿Dónde estoy gastando más que personas similares a mí?',
  '¿Qué suscripciones apenas utilizo?',
  '¿Qué gasto recurrente debería revisar primero?',
  '¿Cuánto puedo permitirme gastar este tramo?',
  // Ahorro
  '¿Estoy ahorrando lo suficiente?',
  '¿Cuánto debería tener en mi fondo de emergencia?',
  '¿Cuánto tardaré en alcanzar mis objetivos de ahorro?',
  '¿Dónde debería guardar mi dinero a corto plazo?',
  // Inversión
  '¿Mi cartera está bien diversificada?',
  '¿Qué porcentaje de mi patrimonio está invertido?',
  '¿Estoy asumiendo demasiado riesgo?',
  '¿Qué posiciones están lastrando mi rentabilidad?',
  '¿Qué posiciones aportan más riesgo que beneficio?',
  '¿Tengo demasiada exposición a algún sector?',
  '¿Tengo demasiada exposición a algún país?',
  '¿Qué ETF podría sustituir a mis fondos actuales?',
  '¿Cómo se compara mi cartera con un índice global?',
  // Acciones y ETFs
  '¿Cuál es el rendimiento real de mis inversiones?',
  '¿Qué acciones representan un porcentaje excesivo de mi cartera?',
  '¿Qué empresas tienen peores perspectivas actualmente?',
  '¿Qué ETFs similares tienen menores comisiones?',
  '¿Qué oportunidades interesantes hay ahora en el mercado?',
  '¿Qué cambios recomendarías hoy en mi cartera?',
  '¿Qué impacto tendría vender una posición concreta?',
  // Objetivos
  '¿Cuándo podría jubilarme al ritmo actual?',
  '¿Cuánto necesito para alcanzar la independencia financiera?',
  '¿Estoy en camino de comprar una vivienda?',
  '¿Qué necesito hacer para alcanzar 100.000 € invertidos?',
  '¿Cuál es el camino más rápido para alcanzar mi objetivo financiero?',
  // Optimización
  '¿Qué harías si fueras yo?',
  '¿Cuáles son mis tres mayores errores financieros?',
  '¿Cuáles son mis tres mejores decisiones financieras?',
  '¿Dónde puedo obtener una mejor rentabilidad con riesgo similar?',
  '¿Qué decisiones financieras deberían ser prioritarias este tramo?',
  // Fiscalidad
  '¿Cómo puedo reducir legalmente mis impuestos?',
  '¿Qué movimientos fiscales me convienen antes de final de año?',
  '¿Qué plusvalías o minusvalías tengo acumuladas?',
  '¿Qué impacto fiscal tendría vender esta posición?',
  // Con contexto de mercado
  '¿Cómo afectan las últimas noticias a mi cartera?',
  '¿Hay riesgos recientes relacionados con mis inversiones?',
  '¿Qué analistas han cambiado su opinión sobre mis posiciones?',
  '¿Qué eventos próximos podrían afectar a mis activos?',
  '¿Qué oportunidades han surgido esta semana que encajan con mi perfil?',
  // Preguntas potentes
  '¿Qué no estoy viendo?',
  '¿Cuál es el mayor riesgo oculto de mis finanzas?',
  '¿Qué decisión tendría el mayor impacto positivo en los próximos 12 meses?',
  '¿Qué haría un inversor experto en mi situación?',
  '¿Cuál es el siguiente paso más rentable que puedo dar hoy?',
  // Clásicos útiles
  '¿Cuánto llevo gastado este tramo?',
  '¿Cuánto he ganado (o perdido) en bolsa?',
  '¿Cuántos dividendos he cobrado este año?',
  'Resume mis finanzas de este tramo',
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
  const { isOpen, close: closeChat } = useChatStore()
  const user = useAuthStore(s => s.user)
  const hasAiAccess = !!(user?.is_admin || user?.ai_enabled)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState(() => pickSuggestions(5))
  const [models, setModels] = useState<AiModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem('fm_ai_model') ?? ''
  )

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

  // Load available models once
  useEffect(() => {
    if (!hasAiAccess) return
    aiApi.listModels()
      .then(res => {
        setModels(res.models)
        setSelectedModel(prev => {
          if (prev && res.models.some(m => m.id === prev)) return prev
          return res.default
        })
      })
      .catch(() => {
        // El chat sigue funcionando con el modelo por defecto del backend
      })
  }, [])

  useEffect(() => {
    if (selectedModel) localStorage.setItem('fm_ai_model', selectedModel)
  }, [selectedModel])

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
          model: selectedModel || undefined
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
            } else if (event.type === 'meta') {
              setMessages(prev =>
                prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, meta: { model: event.model, elapsed_ms: event.elapsed_ms, input_tokens: event.input_tokens, output_tokens: event.output_tokens } } : m
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
  }, [input, messages, isLoading, periodStart, periodEnd, selectedModel])

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
          'w-full md:w-[50vw] md:max-w-[calc(100vw-2rem)] md:min-w-80',
          'bg-background/98 backdrop-blur-2xl border-l border-white/[0.08]',
          'shadow-[-32px_0_90px_rgba(0,0,0,0.55)]',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        aria-hidden={!isOpen}
      >
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.14),_transparent_70%)]" />

        {/* Header */}
        <div
          className="relative flex items-center justify-between px-4 py-3.5 border-b border-white/[0.07] shrink-0"
          style={{ paddingTop: 'calc(0.875rem + var(--safe-top))' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 ring-1 ring-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold">Asistente IA</span>
              <span className="text-[10px] text-muted-foreground/60">Tus finanzas, al detalle</span>
            </div>
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
              onClick={closeChat}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
              aria-label="Cerrar asistente"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!hasAiAccess ? (
          <div className="relative flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 ring-1 ring-primary/20">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">Acceso a la IA no habilitado</p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-[260px]">
                Este asistente usa un modelo de IA autoalojado por el administrador. Pídele que te active el acceso desde el panel de administración.
              </p>
            </div>
          </div>
        ) : (
        <>
        {/* Messages */}
        <div className="relative flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col gap-5 pt-4">
              {/* Welcome */}
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 ring-1 ring-primary/20 shadow-[0_0_30px_hsl(var(--primary)/0.15)]">
                  <Sparkles className="h-7 w-7 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">¿En qué puedo ayudarte?</p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
                    Pregúntame sobre tus finanzas, gastos, ahorro o inversiones.
                  </p>
                </div>
              </div>

              {/* Suggestion chips */}
              <div className="grid grid-cols-1 gap-2">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className={cn(
                      'group rounded-xl border border-white/[0.06] bg-card/60 px-3.5 py-3',
                      'text-left text-xs text-muted-foreground leading-snug',
                      'hover:bg-primary/[0.06] hover:text-foreground hover:border-primary/25',
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
                  'flex items-end gap-2',
                  msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full mb-0.5',
                    msg.role === 'user'
                      ? 'bg-white/[0.08] text-muted-foreground'
                      : 'bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-primary/20'
                  )}
                >
                  {msg.role === 'user' ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </div>

                <div className={cn('flex flex-col max-w-[80%]', msg.role === 'user' ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-primary/25 to-primary/10 text-foreground rounded-br-md'
                        : 'bg-card/70 border border-white/[0.06] text-foreground/90 rounded-bl-md'
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
                  {msg.role === 'assistant' && !msg.isStreaming && msg.meta && (
                    <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-muted-foreground/40 px-1">
                      <span>{msg.meta.model}</span>
                      <span>·</span>
                      <span>{(msg.meta.elapsed_ms / 1000).toFixed(1)}s</span>
                      {msg.meta.input_tokens != null && (
                        <>
                          <span>·</span>
                          <span>{msg.meta.input_tokens}↑ {msg.meta.output_tokens}↓ tok</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div
          className="relative shrink-0 border-t border-white/[0.07] p-3"
          style={{ paddingBottom: 'calc(0.75rem + var(--safe-bottom))' }}
        >
          {/* Model Selector */}
          {models.length > 0 && (
            <div className="mb-2">
              <div className="relative inline-flex items-center">
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className={cn(
                    'appearance-none rounded-full pl-2.5 pr-6 py-1 text-[10px] font-medium transition-all duration-150 border',
                    'bg-card/60 border-white/[0.08] text-muted-foreground/80',
                    'hover:text-foreground hover:border-primary/25 focus:outline-none focus:border-primary/40 cursor-pointer'
                  )}
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id} className="bg-[hsl(var(--card))] text-foreground">
                      {m.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-muted-foreground/60" />
              </div>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-white/[0.09] bg-card/50 px-3 py-2 focus-within:border-primary/35 focus-within:bg-card/70 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)] transition-all">
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
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all',
                input.trim() && !isLoading
                  ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.35)] hover:brightness-110 active:scale-95'
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
        </>
        )}
      </div>

      {/* ── Backdrop ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[59] bg-black/40 backdrop-blur-[2px]"
          onClick={closeChat}
        />
      )}
    </>
  )
}
