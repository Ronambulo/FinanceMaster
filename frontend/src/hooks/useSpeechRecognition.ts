import { useState, useRef, useCallback } from 'react'

export interface SpeechRecognitionState {
  transcript: string
  listening: boolean
  supported: boolean
  error: string | null
}

// ── Minimal Web Speech API type declarations (not in all TS DOM libs) ──
interface ISpeechRecognitionResult {
  readonly 0: { readonly transcript: string }
}
interface ISpeechRecognitionResultList {
  readonly 0: ISpeechRecognitionResult
}
interface ISpeechRecognitionEvent extends Event {
  readonly results: ISpeechRecognitionResultList
}
interface ISpeechRecognitionErrorEvent extends Event {
  readonly error: string
}
interface ISpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: ISpeechRecognitionEvent) => void) | null
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
interface ISpeechRecognitionConstructor {
  new (): ISpeechRecognition
}

// Extend Window to include vendor-prefixed SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition?: ISpeechRecognitionConstructor
    webkitSpeechRecognition?: ISpeechRecognitionConstructor
  }
}

export function useSpeechRecognition(onResult: (text: string) => void) {
  const recognitionClass: ISpeechRecognitionConstructor | null =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null)
      : null

  const supported = !!recognitionClass

  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<ISpeechRecognition | null>(null)

  const start = useCallback(() => {
    if (!recognitionClass) return
    setError(null)

    const recognition = new recognitionClass()
    recognition.lang = 'es-ES'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript ?? ''
      setTranscript(text)
      setListening(false)
      onResult(text)
    }

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      setError(event.error)
      setListening(false)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [recognitionClass, onResult])

  const stop = useCallback(() => {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setListening(false)
  }, [])

  return { transcript, listening, supported, error, start, stop }
}
