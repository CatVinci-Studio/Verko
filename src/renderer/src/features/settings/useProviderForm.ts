import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/ipc'
import { getProviderDefinition } from '@shared/providers'

const REMEMBER_KEY_LS = 'verko:remember-api-key'

/**
 * State + handlers for the Provider settings section. Owns the editable
 * field buffers (key/model/baseUrl), remember-key toggle, and the two
 * async actions (save, test). React Query owns the persisted profile
 * list so cache invalidation works across tabs.
 */
export function useProviderForm() {
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
  const [rememberKey, setRememberKey] = useState(
    () => localStorage.getItem(REMEMBER_KEY_LS) !== '0',
  )
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<boolean | null>(null)

  const active = profiles?.find((p) => p.name === activeName) ?? profiles?.[0]
  const definition = active ? getProviderDefinition(active.name) : undefined

  // Sync editable buffers when the active provider changes.
  useEffect(() => {
    setKeyInput('')
    setModelInput(active?.model ?? '')
    setBaseUrlInput(active?.baseUrl ?? '')
    setTestResult(null)
  }, [active?.name, active?.model, active?.baseUrl])

  // Persist remember-key preference.
  useEffect(() => {
    localStorage.setItem(REMEMBER_KEY_LS, rememberKey ? '1' : '0')
  }, [rememberKey])

  const switchProvider = async (id: string) => {
    if (id === activeName) return
    await api.agent.setProfile(id)
    queryClient.invalidateQueries({ queryKey: ['agent'] })
  }

  const save = async () => {
    if (!active) return
    setSaving(true)
    try {
      const patch: { model?: string; baseUrl?: string } = {}
      if (modelInput.trim() && modelInput.trim() !== active.model) patch.model = modelInput.trim()
      if (baseUrlInput.trim() !== active.baseUrl) patch.baseUrl = baseUrlInput.trim()
      if (Object.keys(patch).length > 0) await api.agent.updateProfile(active.name, patch)
      if (keyInput.trim()) {
        await api.agent.saveKey(active.name, keyInput.trim(), rememberKey)
        setKeyInput('')
      }
      await refetch()
    } finally { setSaving(false) }
  }

  const test = async () => {
    if (!active) return
    setTesting(true)
    setTestResult(null)
    try {
      const ok = await api.agent.testKey(active.name)
      setTestResult(ok)
    } finally { setTesting(false) }
  }

  return {
    profiles, active, definition,
    keyInput, setKeyInput,
    modelInput, setModelInput,
    baseUrlInput, setBaseUrlInput,
    rememberKey, setRememberKey,
    saving, testing, testResult,
    switchProvider, save, test,
  }
}
