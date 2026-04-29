import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Loader, Wifi } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import { SettingSection } from '@/components/ui/setting-section'
import { cn } from '@/lib/utils'
import type { AgentProfile } from '@shared/types'

export function AgentTab() {
  const { data: profiles, refetch } = useQuery({
    queryKey: ['agent', 'profiles'],
    queryFn: () => api.agent.getProfiles(),
  })

  const [selectedProfile, setSelectedProfile] = useState<string>('')
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

  const profile = profiles?.find((p) => p.name === selectedProfile)

  useEffect(() => {
    if (profiles && profiles.length > 0 && !selectedProfile) {
      setSelectedProfile(profiles[0].name)
    }
  }, [profiles, selectedProfile])

  const handleSaveKey = async () => {
    if (!selectedProfile || !keyInput.trim()) return
    setSaving(true)
    try {
      await api.agent.saveKey(selectedProfile, keyInput.trim())
      setKeyInput('')
      refetch()
    } finally {
      setSaving(false)
    }
  }

  const handleTestKey = async () => {
    if (!selectedProfile) return
    setTesting(true)
    setTestResult(null)
    try {
      const ok = await api.agent.testKey(selectedProfile)
      setTestResult(ok)
    } finally {
      setTesting(false)
    }
  }

  const handleSetActive = async (name: string) => {
    await api.agent.setProfile(name)
    refetch()
  }

  return (
    <div className="space-y-6">
      <SettingSection title="Provider" description="Pick a provider profile and ensure its API key is saved.">
        {profiles && profiles.length > 0 && (
          <div className="space-y-1.5 pt-2">
            {profiles.map((p: AgentProfile) => {
              const active = selectedProfile === p.name
              return (
                <button
                  key={p.name}
                  onClick={() => setSelectedProfile(p.name)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-[12px] border text-left transition-all duration-150',
                    active
                      ? 'bg-[var(--bg-accent-subtle)] border-[var(--accent-color)]/25 text-[var(--text-primary)]'
                      : 'bg-[var(--bg-elevated)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--border-focus)]'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium">{p.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      {p.baseUrl} · {p.model}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.hasKey ? (
                      <CheckCircle size={13} className="text-[var(--status-read)]" />
                    ) : (
                      <XCircle size={13} className="text-[var(--text-dim)]" />
                    )}
                    <span
                      className={cn(
                        'text-[10.5px]',
                        p.hasKey ? 'text-[var(--status-read)]' : 'text-[var(--text-muted)]'
                      )}
                    >
                      {p.hasKey ? 'Key saved' : 'No key'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </SettingSection>

      {selectedProfile && (
        <SettingSection title="API Key" description={`Stored securely for the "${selectedProfile}" profile.`}>
          <div className="space-y-3 pt-2">
            <div className="flex gap-2">
              <input
                type="password"
                placeholder={profile?.hasKey ? '••••••••••••••••' : 'sk-...'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                className={cn(
                  'flex-1 h-10 px-3 rounded-[10px] border text-[13px] bg-[var(--bg-elevated)]',
                  'text-[var(--text-primary)] placeholder:text-[var(--text-dim)]',
                  'border-[var(--border-color)] focus:border-[var(--accent-color)]',
                  'focus:ring-2 focus:ring-[var(--accent-color)]/20 focus:outline-none',
                  'transition-all duration-150'
                )}
                style={{ userSelect: 'text' }}
              />
              <button
                onClick={handleSaveKey}
                disabled={saving || !keyInput.trim()}
                className={cn(
                  'px-4 h-10 rounded-[10px] text-[12.5px] font-medium transition-all duration-150 active:scale-[0.98]',
                  keyInput.trim() && !saving
                    ? 'bg-[var(--accent-color)] text-[var(--accent-on)] hover:opacity-90'
                    : 'bg-[var(--bg-active)] text-[var(--text-dim)] cursor-not-allowed'
                )}
              >
                {saving ? <Loader size={12} className="animate-spin" /> : 'Save'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleTestKey}
                disabled={testing || !profile?.hasKey}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium border transition-all duration-150 active:scale-[0.98]',
                  !testing && profile?.hasKey
                    ? 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-dim)] cursor-not-allowed'
                )}
              >
                {testing ? <Loader size={11} className="animate-spin" /> : <Wifi size={11} />}
                Test connection
              </button>

              {testResult !== null && (
                <span
                  className={cn(
                    'flex items-center gap-1 text-[11.5px]',
                    testResult ? 'text-[var(--status-read)]' : 'text-[var(--danger)]'
                  )}
                >
                  {testResult ? (
                    <>
                      <CheckCircle size={11} /> Connected
                    </>
                  ) : (
                    <>
                      <XCircle size={11} /> Failed
                    </>
                  )}
                </span>
              )}
            </div>

            <button
              onClick={() => handleSetActive(selectedProfile)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)] transition-all duration-150 active:scale-[0.98]"
            >
              Set as active profile
            </button>
          </div>
        </SettingSection>
      )}
    </div>
  )
}
