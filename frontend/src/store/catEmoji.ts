// Emoji de cada categoría por nombre, para pintarlo en los iconos de categoría
// sin que cada icono tenga que pedir la lista. Lo rellena <CategoryEmojiSync />.
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { catApi } from '@/lib/api'

export const catKey = (name: string) => name.trim().toLowerCase()

export const useCatEmojiStore = create<{ map: Record<string, string> }>(() => ({ map: {} }))

export function CategoryEmojiSync() {
  const cats = useQuery({ queryKey: ['categories'], queryFn: catApi.list, staleTime: 5 * 60_000 })
  useEffect(() => {
    if (!cats.data) return
    const map: Record<string, string> = {}
    for (const c of cats.data) if (c.icon && c.icon.trim()) map[catKey(c.name)] = c.icon.trim()
    useCatEmojiStore.setState({ map })
  }, [cats.data])
  return null
}
