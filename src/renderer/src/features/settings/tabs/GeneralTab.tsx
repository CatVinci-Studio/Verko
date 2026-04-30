import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Loader, Wifi } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/ipc'
import { setLanguage, type Language } from '@/lib/i18n'
import { useUIStore } from '@/store/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingRow } from '@/components/ui/setting-row'
import { SettingSection } from '@/components/ui/setting-section'
import { SettingSegmented } from '@/components/ui/setting-segmented'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  PROVIDER_DEFINITIONS,
  getProviderDefinition,
  type ProviderDefinition,
  type ProviderFieldDefinition,
} from '@shared/providers'

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

const REMEMBER_KEY_LS = 'verko:remember-api-key'

function ProviderSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: profiles, refetch } = useQuery({
    queryKey: ['agent', 'profiles'],
    queryFn: () => api.agent.getProfiles(),
  })

  const { data: activeName } = useQuery({
    queryKey: ['agent', 'config'],
    queryFn: async () => {
      const cfg = await api.agent.getConfig()
      return cfg?.defaultProfile ?? null
    },
  })

  const [keyInput, setKeyInput] = useState('')
  const [modelInput, setModelInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [rememberKey, setRememberKey] = useState(() => {
    return localStorage.getItem(REMEMBER_KEY_LS) !== '0'
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

  const active = profiles?.find((p) => p.name === activeName) ?? profiles?.[0]
  const definition = active ? getProviderDefinition(active.name) : undefined

  // Reset inputs when switching provider.
  useEffect(() => {
    setKeyInput('')
    setModelInput(active?.model ?? '')
    setBaseUrlInput(active?.baseUrl ?? '')
    setTestResult(null)
  }, [active?.name, active?.model, active?.baseUrl])

  useEffect(() => {
    localStorage.setItem(REMEMBER_KEY_LS, rememberKey ? '1' : '0')
  }, [rememberKey])

  const switchProvider = async (id: string) => {
    if (id === activeName) return
    await api.agent.setProfile(id)
    queryClient.invalidateQueries({ queryKey: ['agent'] })
  }

  const handleSave = async () => {
    if (!active) return
    setSaving(true)
    try {
      // Persist text fields if changed.
      const patch: { model?: string; baseUrl?: string } = {}
      if (modelInput.trim() && modelInput.trim() !== active.model) patch.model = modelInput.trim()
      if (baseUrlInput.trim() !== active.baseUrl) patch.baseUrl = baseUrlInput.trim()
      if (Object.keys(patch).length > 0) await api.agent.updateProfile(active.name, patch)

      // Persist key if user typed one.
      if (keyInput.trim()) {
        await api.agent.saveKey(active.name, keyInput.trim(), rememberKey)
        setKeyInput('')
      }
      await refetch()
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!active) return
    setTesting(true)
    setTestResult(null)
    try {
      const ok = await api.agent.testKey(active.name)
      setTestResult(ok)
    } finally {
      setTesting(false)
    }
  }

  return (
    <SettingSection title={t('settings.provider.title')}>
      <div className="space-y-4 pt-2">
        {/* Summary */}
        {active && (
          <div className="text-[14px] text-[var(--text-muted)]">
            {t('settings.provider.current')}:{' '}
            <span className="font-medium text-[var(--text-primary)]">
              {definition?.name ?? active.name}
            </span>
            <span className="ml-1 text-[var(--text-dim)]">/ {active.model}</span>
          </div>
        )}

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
              <label className="flex items-center gap-2 pt-1 cursor-pointer text-[13.5px] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={rememberKey}
                  onChange={(e) => setRememberKey(e.target.checked)}
                  className="accent-[var(--accent-color)]"
                />
                <span>{t('settings.provider.rememberKey')}</span>
              </label>
            )}

            {/* Save | Test | status */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="accent"
                size="lg"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full"
              >
                {saving ? <Loader size={11} className="animate-spin" /> : null}
                {t('common.save')}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleTest}
                disabled={testing || !active.hasKey}
                className="rounded-full"
              >
                {testing ? <Loader size={11} className="animate-spin" /> : <Wifi size={11} />}
                {t('settings.provider.testConnection')}
              </Button>
              {testResult !== null && (
                <span
                  className={cn(
                    'flex items-center gap-1 text-[13.5px]',
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
            </div>
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

  if (field.key === 'apiKey') {
    value = keyInput
    onChange = onKeyChange
    placeholder = hasKey ? '••••••••••••••••' : (field.placeholder ?? 'sk-...')
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
      <label className="text-[13.5px] font-medium text-[var(--text-secondary)]">{label}</label>
      <Input
        type={inputType}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full"
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
        'group relative px-3 py-2 rounded-full text-[14.5px] font-medium text-center transition-all duration-150 active:scale-[0.98]',
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
