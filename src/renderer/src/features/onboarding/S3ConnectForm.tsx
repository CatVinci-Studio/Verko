import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { api } from '@/lib/ipc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { confirmDialog } from '@/store/dialogs'

interface Preset {
  id: 'custom' | 'aws' | 'r2' | 'b2' | 'minio'
  label: string
  endpoint?: string
  region?: string
  forcePathStyle?: boolean
}

const PRESETS: Preset[] = [
  { id: 'custom', label: 'Custom' },
  { id: 'aws',    label: 'AWS S3', region: 'us-east-1' },
  { id: 'r2',     label: 'Cloudflare R2', endpoint: 'https://<account>.r2.cloudflarestorage.com', region: 'auto' },
  { id: 'b2',     label: 'Backblaze B2', endpoint: 'https://s3.us-west-002.backblazeb2.com', region: 'us-west-002' },
  { id: 'minio',  label: 'MinIO', endpoint: 'http://localhost:9000', region: 'us-east-1', forcePathStyle: true },
]

interface Props {
  onCancel: () => void
  onConnected: () => Promise<void>
}

export function S3ConnectForm({ onCancel, onConnected }: Props) {
  const { t } = useTranslation()
  const [preset, setPreset] = useState<Preset['id']>('aws')
  const [name, setName] = useState('S3 Library')
  const [endpoint, setEndpoint] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [bucket, setBucket] = useState('')
  const [prefix, setPrefix] = useState('')
  const [forcePathStyle, setForcePathStyle] = useState(false)
  const [accessKeyId, setAccessKeyId] = useState('')
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [busy, setBusy] = useState(false)

  const applyPreset = (id: Preset['id']) => {
    setPreset(id)
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    setEndpoint(p.endpoint ?? '')
    setRegion(p.region ?? 'us-east-1')
    setForcePathStyle(p.forcePathStyle ?? false)
  }

  const submit = async () => {
    if (!bucket || !accessKeyId || !secretAccessKey) {
      await confirmDialog({
        title: t('welcome.s3.errors.missingTitle'),
        message: t('welcome.s3.errors.missing'),
        confirmLabel: t('common.ok'),
      })
      return
    }
    setBusy(true)
    try {
      const probeCfg = {
        endpoint: endpoint || undefined,
        region,
        bucket,
        prefix: prefix || undefined,
        forcePathStyle,
        accessKeyId,
        secretAccessKey,
      }
      const probe = await api.libraries.probeS3(probeCfg)
      if (probe.status === 'error') {
        await confirmDialog({
          title: t('welcome.s3.errors.probeTitle'),
          message: probe.message ?? t('welcome.errors.unknown'),
          confirmLabel: t('common.ok'),
        })
        return
      }
      if (probe.status === 'uninitialized') {
        const ok = await confirmDialog({
          title: t('welcome.s3.initPrompt.title'),
          message: t('welcome.s3.initPrompt.message'),
          confirmLabel: t('welcome.initPrompt.confirm'),
        })
        if (!ok) return
      }
      await api.libraries.add({
        kind: 's3',
        name,
        ...probeCfg,
        initialize: probe.status === 'uninitialized',
      })
      await onConnected()
    } catch (e) {
      await confirmDialog({
        title: t('welcome.s3.errors.probeTitle'),
        message: e instanceof Error ? e.message : String(e),
        confirmLabel: t('common.ok'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full bg-[var(--bg-base)] px-6 py-10 overflow-auto">
      <div className="max-w-[520px] w-full space-y-5">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={12} /> {t('common.cancel')}
        </button>

        <div>
          <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">{t('welcome.s3.title')}</h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">{t('welcome.s3.description')}</p>
        </div>

        <div className="space-y-4">
          <Field label={t('welcome.s3.fields.preset')}>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={
                    'px-2.5 py-1 rounded-[8px] text-[11.5px] border transition-colors ' +
                    (preset === p.id
                      ? 'bg-[var(--accent-color)]/15 border-[var(--accent-color)]/35 text-[var(--text-primary)]'
                      : 'border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]')
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('welcome.s3.fields.name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label={t('welcome.s3.fields.endpoint')} hint={t('welcome.s3.fields.endpointHint')}>
            <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://…" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('welcome.s3.fields.region')}>
              <Input value={region} onChange={(e) => setRegion(e.target.value)} />
            </Field>
            <Field label={t('welcome.s3.fields.bucket')}>
              <Input value={bucket} onChange={(e) => setBucket(e.target.value)} />
            </Field>
          </div>

          <Field label={t('welcome.s3.fields.prefix')} hint={t('welcome.s3.fields.prefixHint')}>
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="verko/" />
          </Field>

          <Field label={t('welcome.s3.fields.accessKeyId')}>
            <Input value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} autoComplete="off" />
          </Field>

          <Field label={t('welcome.s3.fields.secretAccessKey')}>
            <Input value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} type="password" autoComplete="off" />
          </Field>

          <label className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={forcePathStyle}
              onChange={(e) => setForcePathStyle(e.target.checked)}
            />
            {t('welcome.s3.fields.forcePathStyle')}
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>{t('common.cancel')}</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 size={12} className="animate-spin" />}
            {t('welcome.s3.connect')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11.5px] font-medium text-[var(--text-secondary)]">{props.label}</label>
      {props.children}
      {props.hint && <div className="text-[10.5px] text-[var(--text-muted)]">{props.hint}</div>}
    </div>
  )
}
