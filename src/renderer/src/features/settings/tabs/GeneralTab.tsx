import { useTranslation } from 'react-i18next'
import { setLanguage, type Language } from '@/lib/i18n'
import { useUIStore } from '@/store/ui'
import { SettingRow } from '@/components/ui/setting-row'
import { SettingSegmented } from '@/components/ui/setting-segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function GeneralTab() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useUIStore()
  const currentLang = (i18n.language as Language) ?? 'en'

  return (
    <div className="space-y-3">
      <SettingRow label={t('settings.basic.colorScheme')}>
        <SettingSegmented<'system' | 'light' | 'dark'>
          value={theme}
          onValueChange={setTheme}
          options={[
            { value: 'system', label: t('settings.basic.system') },
            { value: 'light', label: t('settings.basic.light') },
            { value: 'dark', label: t('settings.basic.dark') },
          ]}
        />
      </SettingRow>
      <SettingRow label={t('settings.basic.language')}>
        <Select value={currentLang} onValueChange={(v) => setLanguage(v as Language)}>
          <SelectTrigger className="w-32 rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="zh">中文</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
    </div>
  )
}
