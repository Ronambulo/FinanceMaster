import * as React from 'react'
import { createContext, useContext, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { X, CheckCircle2, AlertCircle } from 'lucide-react'

interface Toast { id: string; message: string; type: 'success' | 'error' | 'info' }
interface ToastCtx { toast: (msg: string, type?: Toast['type']) => void }

const ToastContext = createContext<ToastCtx>({ toast: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[300] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div key={t.id} className={cn('flex items-start gap-3 p-4 rounded-lg border shadow-lg text-sm animate-in slide-in-from-right-5', {
            'bg-emerald-950 border-emerald-700 text-emerald-200': t.type === 'success',
            'bg-red-950 border-red-700 text-red-200': t.type === 'error',
            'bg-card border-border text-foreground': t.type === 'info',
          })}>
            {t.type === 'success' && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
            {t.type === 'error' && <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-negative" />}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
