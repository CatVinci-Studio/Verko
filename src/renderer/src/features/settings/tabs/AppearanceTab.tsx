import { useUIStore } from '@/store/ui'
import { SettingRow } from '@/components/ui/setting-row'
import { SettingSection } from '@/components/ui/setting-section'
import { SettingSegmented } from '@/components/ui/setting-segmented'

export function AppearanceTab() {
  const { theme, toggleTheme } = useUIStore()

  return (
    <SettingSection title="Theme" description="Choose how PaperwithAgent looks.">
      <SettingRow label="Color scheme" description="Affects all surfaces and accent treatment.">
        <SettingSegmented<'dark' | 'light'>
          value={theme}
          onValueChange={(t) => {
            if (theme !== t) toggleTheme()
          }}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </SettingRow>
    </SettingSection>
  )
}
