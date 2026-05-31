import { useState } from 'react'
import type { Category } from '@/lib/api'

// Heuristic dictionary for common companies in Spain / Global
const COMPANY_DOMAINS: Record<string, string> = {
  'amazon': 'amazon.es',
  'amzn': 'amazon.es',
  'netflix': 'netflix.com',
  'spotify': 'spotify.com',
  'mercadona': 'mercadona.com',
  'carrefour': 'carrefour.es',
  'uber': 'uber.com',
  'cabify': 'cabify.com',
  'glovo': 'glovoapp.com',
  'justeat': 'just-eat.es',
  'just eat': 'just-eat.es',
  'burger king': 'burgerking.es',
  'mcdonalds': 'mcdonalds.es',
  'apple': 'apple.com',
  'google': 'google.com',
  'steam': 'steampowered.com',
  'playstation': 'playstation.com',
  'renfe': 'renfe.com',
  'movistar': 'movistar.es',
  'vodafone': 'vodafone.es',
  'orange': 'orange.es',
  'repsol': 'repsol.es',
  'cepsa': 'cepsa.es',
  'bp': 'bp.com',
  'zara': 'zara.com',
  'ikea': 'ikea.com',
  'paypal': 'paypal.com',
  'bizum': 'bizum.es',
  'decathlon': 'decathlon.es',
  'leroy': 'leroymerlin.es',
  'primark': 'primark.com',
  'aliexpress': 'aliexpress.com',
  'corte ingles': 'elcorteingles.com',
  'el corte ingles': 'elcorteingles.com',
  'shell': 'shell.es',
  'galp': 'galp.com',
  'ryanair': 'ryanair.com',
  'vueling': 'vueling.com',
  'iberia': 'iberia.com',
  'airbnb': 'airbnb.com',
  'booking': 'booking.com',
  'media markt': 'mediamarkt.es',
  'mediamarkt': 'mediamarkt.es',
  'pccomponentes': 'pccomponentes.com',
  'aldi': 'aldi.es',
  'lidl': 'lidl.es',
  'dia': 'dia.es',
  'alcampo': 'alcampo.es',
  'gimnasio': 'basic-fit.com',
  'basic fit': 'basic-fit.com',
  'mcfit': 'mcfit.com',
  'synergym': 'synergym.es',
  'starbucks': 'starbucks.es',
}

function guessDomain(name: string): string | null {
  if (!name) return null
  const lower = name.toLowerCase()
  for (const [key, domain] of Object.entries(COMPANY_DOMAINS)) {
    if (lower.includes(key)) return domain
  }
  return null
}

import { cn } from '@/lib/utils'

export function TransactionIcon({ name, category }: { name: string | null; category: Category | null }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const domain = name ? guessDomain(name) : null

  if (!domain) {
    return <>{category?.icon || '💳'}</>
  }

  return (
    <>
      {!error && (
        <img 
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`} 
          alt={name || 'Logo'} 
          className={cn(
            "w-full h-full object-cover rounded-full bg-white",
            loaded ? "block" : "hidden"
          )}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
      {(!loaded || error) && (
        <>{category?.icon || '💳'}</>
      )}
    </>
  )
}
