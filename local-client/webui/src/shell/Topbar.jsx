import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { t } from '../i18n'
import { getTheme, applyTheme } from '../theme.js'

// Barra superior do shell: busca global, tema e (no mobile) o botão do menu.
export default function Topbar({ onOpenPalette, onOpenNav }) {
  const [theme, setTheme] = useState(() => getTheme())

  useEffect(() => { applyTheme(theme) }, [theme])

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 md:px-5">
      <button
        type="button"
        onClick={onOpenNav}
        className="grid size-8 place-items-center rounded-md text-fg-muted transition hover:bg-surface-2 hover:text-fg md:hidden"
        aria-label={t('Abrir menu')}
      >
        <Icon name="menu" size={18} />
      </button>

      <button
        type="button"
        onClick={onOpenPalette}
        className="group flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-border bg-bg px-2.5 text-left text-base text-fg-muted transition hover:border-border-strong hover:bg-surface"
      >
        <Icon name="search" size={15} className="text-fg-subtle" />
        <span className="flex-1 truncate">{t('Buscar ou ir para…')}</span>
        <kbd className="hidden rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-fg-subtle sm:block">
          Ctrl K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="grid size-8 place-items-center rounded-md text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          title={theme === 'dark' ? t('Tema claro') : t('Tema escuro')}
          aria-label={theme === 'dark' ? t('Tema claro') : t('Tema escuro')}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
      </div>
    </header>
  )
}
