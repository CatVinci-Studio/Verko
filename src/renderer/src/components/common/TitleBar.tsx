import { Bot, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import logoUrl from '@/assets/logo.jpg'

interface TitleBarProps {
  onOpenCommand: () => void
  onOpenSettings: () => void
}

export function TitleBar({ onOpenCommand, onOpenSettings }: TitleBarProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center h-11 border-b border-[var(--border-color)] shrink-0 titlebar-drag select-none">
      {/* macOS traffic lights spacer */}
      <div className="w-20 shrink-0" />

      {/* App logo + name */}
      <div className="flex-1 flex items-center justify-center gap-2">
        <img src={logoUrl} alt="" className="w-5 h-5 rounded-[5px]" />
        <span className="text-[13.5px] font-semibold text-[var(--text-secondary)] tracking-wide">
          {t('titlebar.appName')}
        </span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-0.5 pr-3 no-drag shrink-0">
        <Button
          onClick={onOpenCommand}
          variant="ghost"
          size="sm"
          title={t('titlebar.askAgent')}
          className="h-7 px-2.5 gap-1.5 text-[var(--text-muted)] rounded-[6px]"
        >
          <Bot size={11} />
          <span className="text-[12px] font-medium">⌘K</span>
        </Button>
        <Button
          onClick={onOpenSettings}
          variant="ghost"
          size="icon-sm"
          title={t('titlebar.settings')}
          className="h-7 w-7 text-[var(--text-muted)] rounded-[6px]"
        >
          <Settings size={13} />
        </Button>
      </div>
    </div>
  )
}
