import { Loader, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUpdater } from '@/features/update/useUpdater'
import { setLanguage, type Language } from '@/lib/i18n'
import { useUIStore } from '@/store/ui'
import { Button } from '@/components/ui/button'
import { SettingRow } from '@/components/ui/setting-row'
import { SettingSection } from '@/components/ui/setting-section'
import { SettingSegmented } from '@/components/ui/setting-segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function GeneralTab() {
  return (
    <div className="space-y-6">
      <BasicSection />
      <UpdateSection />
    </div>
  )
}

// ── Basic ───────────────────────────────────────────────────────────────────

function BasicSection() {
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

// ── Updates ─────────────────────────────────────────────────────────────────

function UpdateSection() {
  const { t } = useTranslation()
  const { state, check } = useUpdater()

  const status =
      state.status === 'checking'  ? t('update.checking')
    : state.status === 'available' ? t('update.statusAvailable', { version: state.update.version })
    : state.status === 'none'      ? t('update.upToDate')
    : state.status === 'error'     ? state.error
    : ''

  return (
    <SettingSection title={t('update.title')}>
      <SettingRow
        label={t('update.checkNow')}
        description={status}
      >
        <Button
          variant="outline" size="lg" disabled={state.status === 'checking'}
          className="rounded-full"
          onClick={() => { void check() }}
        >
          {state.status === 'checking' ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {t('update.check')}
        </Button>
      </SettingRow>
    </SettingSection>
  )
}
