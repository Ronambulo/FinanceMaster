import { Card } from '@/components/ui/card'
import { SettingsSwitch } from '@/components/SettingsSwitch'
import { useFeaturesStore } from '@/store/features'
import { FEATURES } from '@/lib/features'
import type { FeatureId } from '@/lib/features'

export function FeaturesSection() {
  const { features, toggle } = useFeaturesStore()
  const featureList = Object.entries(FEATURES) as [FeatureId, typeof FEATURES[FeatureId]][]

  return (
    <Card className="divide-y divide-border">
      {featureList.map(([id, meta]) => (
        <div key={id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{meta.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>
          </div>
          <SettingsSwitch checked={features[id]} onChange={v => toggle(id, v)} label={meta.label} />
        </div>
      ))}
    </Card>
  )
}
