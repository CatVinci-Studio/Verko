import { CheckCircle, XCircle, Loader, Wifi } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { setLanguage, type Language } from '@/lib/i18n'
import { useUIStore } from '@/store/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingRow } from '@/components/ui/setting-row'
import { SettingSection } from '@/components/ui/setting-section'
import { SettingSegmented } from '@/components/ui/setting-segmented'
import { SettingToggle } from '@/components/ui/setting-toggle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  PROVIDER_DEFINITIONS,
  type ProviderDefinition,
  type ProviderFieldDefinition,
} from '@shared/providers'
import { useProviderForm } from '../useProviderForm'

export function GeneralTab() {
  return (
    <div className="space-y-6">
      <BasicSection />
      <ProviderSection />
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

// ── Provider ────────────────────────────────────────────────────────────────

function ProviderSection() {
  const { t } = useTranslation()
  const {
    profiles, active, definition,
    keyInput, setKeyInput,
    modelInput, setModelInput,
    baseUrlInput, setBaseUrlInput,
    rememberKey, setRememberKey,
    saving, testing, testResult,
    switchProvider, save, test,
  } = useProviderForm()

  return (
    <SettingSection title={t('settings.provider.title')}>
      <div className="space-y-4 pt-2">
        {/* Pill grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PROVIDER_DEFINITIONS.map((def) => {
            const profile = profiles?.find((p) => p.name === def.id)
            return (
              <ProviderPill
                key={def.id}
                definition={def}
                hasKey={!!profile?.hasKey}
                active={def.id === active?.name}
                onClick={() => switchProvider(def.id)}
              />
            )
          })}
        </div>

        {/* Field grid (declarative from catalog) */}
        {active && definition && (
          <div className="space-y-3 pt-2 border-t border-[var(--border-color)]">
            {definition.fields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                keyInput={keyInput}
                modelInput={modelInput}
                baseUrlInput={baseUrlInput}
                hasKey={!!active.hasKey}
                onKeyChange={setKeyInput}
                onModelChange={setModelInput}
                onBaseUrlChange={setBaseUrlInput}
              />
            ))}

            {/* Remember key toggle */}
            {definition.fields.some((f) => f.key === 'apiKey') && (
              <SettingRow
                label={t('settings.provider.rememberKey')}
                description={t('settings.provider.rememberKeyHint')}
                className="py-1"
              >
                <SettingToggle
                  checked={rememberKey}
                  onCheckedChange={setRememberKey}
                  ariaLabel={t('settings.provider.rememberKey')}
                />
              </SettingRow>
            )}
          </div>
        )}

        {/* Footer actions */}
        {active && definition && (
          <div className="flex items-center justify-end gap-2 pt-3 mt-1 border-t border-[var(--border-color)]">
            {testResult !== null && (
              <span
                className={cn(
                  'flex items-center gap-1 text-[14.5px] mr-auto',
                  testResult ? 'text-[var(--status-read)]' : 'text-[var(--danger)]'
                )}
              >
                {testResult ? (
                  <>
                    <CheckCircle size={12} /> {t('settings.provider.connected')}
                  </>
                ) : (
                  <>
                    <XCircle size={12} /> {t('settings.provider.failed')}
                  </>
                )}
              </span>
            )}
            <Button
              variant="outline"
              size="lg"
              onClick={test}
              disabled={testing || !active.hasKey}
              className="rounded-full"
            >
              {testing ? <Loader size={11} className="animate-spin" /> : <Wifi size={11} />}
              {t('settings.provider.testConnection')}
            </Button>
            <Button
              variant="accent"
              size="lg"
              onClick={save}
              disabled={saving}
              className="rounded-full"
            >
              {saving ? <Loader size={11} className="animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </div>
        )}
      </div>
    </SettingSection>
  )
}

// ── Declarative field renderer ──────────────────────────────────────────────

interface FieldRowProps {
  field: ProviderFieldDefinition
  keyInput: string
  modelInput: string
  baseUrlInput: string
  hasKey: boolean
  onKeyChange: (v: string) => void
  onModelChange: (v: string) => void
  onBaseUrlChange: (v: string) => void
}

function FieldRow({
  field, keyInput, modelInput, baseUrlInput, hasKey,
  onKeyChange, onModelChange, onBaseUrlChange,
}: FieldRowProps) {
  const { t } = useTranslation()
  const label = t(`settings.provider.fields.${field.label}`)

  let value = ''
  let onChange: (v: string) => void = () => {}
  let placeholder = field.placeholder ?? ''
  let inputType: string = field.type

  // When a key is saved and the input is empty, render dots that match
  // the live-text style — same color, similar length — so the field doesn't
  // look "missing". Placeholder color is muted by default; the
  // `placeholder:text-[var(--text-primary)]` override fixes it for this row.
  const apiKeyMaskActive = field.key === 'apiKey' && hasKey && !keyInput
  if (field.key === 'apiKey') {
    value = keyInput
    onChange = onKeyChange
    placeholder = apiKeyMaskActive
      ? '•'.repeat(40)
      : (field.placeholder ?? 'sk-...')
    inputType = 'password'
  } else if (field.key === 'model') {
    value = modelInput
    onChange = onModelChange
  } else if (field.key === 'baseUrl') {
    value = baseUrlInput
    onChange = onBaseUrlChange
  }

  return (
    <div className="grid grid-cols-[100px_1fr] gap-x-3 items-center">
      <label className="text-[14.5px] font-medium text-[var(--text-secondary)]">{label}</label>
      <Input
        type={inputType}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'rounded-full',
          apiKeyMaskActive && 'placeholder:text-[var(--text-primary)]',
        )}
      />
    </div>
  )
}

// ── Pill ────────────────────────────────────────────────────────────────────

function ProviderPill({
  definition, hasKey, active, onClick,
}: {
  definition: ProviderDefinition
  hasKey: boolean
  active: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative px-3 py-2 rounded-full text-[15.5px] font-medium text-center transition-all duration-150 active:scale-[0.98]',
        active
          ? 'bg-[var(--accent-color)] text-[var(--accent-on)]'
          : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
      )}
    >
      <span className="block truncate">{definition.name}</span>
      {hasKey && (
        <span
          className={cn(
            'absolute -top-1 -right-1 w-2 h-2 rounded-full',
            active ? 'bg-[var(--bg-surface)]' : 'bg-[var(--status-read)]'
          )}
          title={t('settings.provider.keySaved')}
        />
      )}
    </button>
  )
}
