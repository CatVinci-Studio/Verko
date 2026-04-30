import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/ipc'
import logoUrl from '@/assets/logo.jpg'

export function TitleBar() {
  const { t } = useTranslation()
  const platform = api.app.platform
  const isMac = platform === 'darwin'
  const isWeb = platform as unknown as string === 'web'
  const showWindowControls = !isMac && !isWeb  // Windows / Linux Electron only

  return (
    <div className="flex items-center h-11 border-b border-[var(--border-color)] shrink-0 titlebar-drag select-none">
      {/* macOS traffic-light spacer */}
      {isMac && <div className="w-20 shrink-0" />}

      {/* App logo + name */}
      <div className="flex-1 flex items-center justify-center gap-2">
        <img src={logoUrl} alt="" className="w-5 h-5 rounded-[5px]" />
        <span className="text-[15.5px] font-semibold text-[var(--text-secondary)] tracking-wide">
          {t('titlebar.appName')}
        </span>
      </div>

      {/* Right-side controls — Windows / Linux only */}
      {showWindowControls ? <WindowControls /> : <div className="w-20 shrink-0" />}
    </div>
  )
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => api.window.onMaximized(setMaximized), [])

  return (
    <div className="flex items-stretch h-full no-drag shrink-0">
      <ControlButton onClick={() => api.window.minimize()} aria-label="Minimize">
        <Minus size={14} />
      </ControlButton>
      <ControlButton onClick={() => api.window.toggleMaximize()} aria-label="Maximize">
        {maximized ? <Copy size={12} /> : <Square size={12} />}
      </ControlButton>
      <ControlButton onClick={() => api.window.close()} aria-label="Close" danger>
        <X size={14} />
      </ControlButton>
    </div>
  )
}

function ControlButton({
  onClick, children, danger, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      {...rest}
      className={
        'w-12 flex items-center justify-center text-[var(--text-muted)] transition-colors ' +
        (danger
          ? 'hover:bg-[var(--danger)] hover:text-white'
          : 'hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]')
      }
    >
      {children}
    </button>
  )
}
