import { cn } from '@/lib/utils'

// Interruptor de 52×30 dentro de un área táctil de 44px de alto
export function SettingsSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="group inline-flex h-11 shrink-0 items-center focus-visible:outline-none"
    >
      <span className={cn(
        'relative inline-flex h-[30px] w-[52px] items-center rounded-full border transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
        checked ? 'border-primary bg-primary' : 'border-border bg-secondary',
      )}>
        <span className={cn(
          'pointer-events-none inline-block h-6 w-6 rounded-full shadow-md transition-transform',
          checked ? 'translate-x-[24px] bg-primary-foreground' : 'translate-x-[2px] bg-muted-foreground/70',
        )} />
      </span>
    </button>
  )
}
