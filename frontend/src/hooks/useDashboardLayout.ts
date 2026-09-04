import { useState, useCallback } from 'react'

export type WidgetId =
  | 'hero'
  | 'goals'
  | 'metrics'
  | 'trend'
  | 'pie'
  | 'insights'
  | 'networth'
  | 'personality'
  | 'upcoming'
  | 'recent'

const DEFAULT_ORDER: WidgetId[] = [
  'hero',
  'goals',
  'metrics',
  'trend',
  'pie',
  'upcoming',
  'recent',
  'insights',
  'networth',
  'personality',
]

const LS_KEY = 'fm_dashboard_layout'

function loadLayout(): { order: WidgetId[]; hidden: WidgetId[] } {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const storedOrder = (parsed.order ?? DEFAULT_ORDER) as WidgetId[]
      // Merge in any widget ids introduced after this layout was saved (e.g. 'goals')
      // so returning users pick up new widgets without losing their customization.
      const missing = DEFAULT_ORDER.filter(id => !storedOrder.includes(id))
      return {
        order: [...storedOrder, ...missing],
        hidden: (parsed.hidden ?? []) as WidgetId[],
      }
    }
  } catch {}
  return { order: DEFAULT_ORDER, hidden: [] }
}

function saveLayout(order: WidgetId[], hidden: WidgetId[]) {
  localStorage.setItem(LS_KEY, JSON.stringify({ order, hidden }))
}

export function useDashboardLayout() {
  const [editing, setEditing] = useState(false)
  const [{ order, hidden }, setState] = useState(loadLayout)

  const setOrder = useCallback((newOrder: WidgetId[]) => {
    setState(s => ({ ...s, order: newOrder }))
  }, [])

  const toggleHidden = useCallback((id: WidgetId) => {
    setState(s => {
      const isHidden = s.hidden.includes(id)
      const newHidden = isHidden ? s.hidden.filter(h => h !== id) : [...s.hidden, id]
      return { ...s, hidden: newHidden }
    })
  }, [])

  const startEditing = useCallback(() => setEditing(true), [])

  const saveAndExit = useCallback(() => {
    saveLayout(order, hidden)
    setEditing(false)
  }, [order, hidden])

  const resetLayout = useCallback(() => {
    setState({ order: DEFAULT_ORDER, hidden: [] })
    saveLayout(DEFAULT_ORDER, [])
  }, [])

  const isVisible = useCallback(
    (id: WidgetId) => !hidden.includes(id),
    [hidden]
  )

  return { order, hidden, editing, setOrder, toggleHidden, startEditing, saveAndExit, resetLayout, isVisible }
}
