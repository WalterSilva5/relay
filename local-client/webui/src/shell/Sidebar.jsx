import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { getPendingTodos } from '../api'
import { t } from '../i18n'

const GROUPS = [
  {
    label: 'Trabalho',
    items: [
      ['/dashboard', 'Dashboard', 'dashboard'],
      ['/meu-dia', 'Meu Dia', 'calendar'],
      ['/projetos', 'Projetos', 'folder'],
      ['/board', 'Board', 'board'],
      ['/goals', 'Goals', 'target'],
      ['/time', 'Time', 'users'],
      ['/metricas', 'Métricas', 'activity'],
    ],
  },
  {
    label: 'Registro',
    items: [
      ['/reunioes', 'Reuniões', 'mic'],
      ['/reviews', 'Reviews', 'clipboard'],
      ['/reviews-pr', 'Reviews de PR', 'search'],
      ['/assistente', 'Assistente', 'sparkles'],
      ['/todos', 'TODOs', 'check'],
    ],
  },
  {
    label: 'Conhecimento',
    items: [
      ['/estudos', 'Estudos', 'book'],
      ['/biblioteca', 'Biblioteca', 'briefcase'],
      ['/base', 'Base', 'brain'],
      ['/memoria', 'Memória', 'brain'],
      ['/skills', 'Skills', 'sparkles'],
      ['/guia', 'Guia', 'book'],
      ['/ingles', 'Inglês', 'globe'],
      ['/traducao', 'Tradução', 'globe'],
    ],
  },
  {
    label: 'Ferramentas',
    items: [
      ['/ferramentas', 'Ferramentas', 'briefcase'],
      ['/techlinks', 'TechLinks', 'globe'],
      ['/api-tester', 'API Tester', 'activity'],
      ['/labels', 'Labels', 'target'],
      ['/design', 'Design', 'layers'],
      ['/configuracoes', 'Configurações', 'settings'],
    ],
  },
]

// Item de navegação: alvo de 32px, hover com contorno e ativo com fundo cheio.
function NavItem({ to, label, icon, rail, badge, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      title={rail ? label : undefined}
      className={({ isActive }) =>
        [
          'group relative flex h-9 items-center gap-2.5 rounded-md px-2 text-base font-medium transition',
          rail ? 'justify-center px-0' : '',
          isActive
            ? 'bg-accent-soft text-accent shadow-xs'
            : 'text-fg-muted hover:bg-surface hover:text-fg hover:shadow-xs',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !rail && (
            <span className="absolute inset-y-1.5 -left-2 w-0.5 rounded-full bg-accent" aria-hidden />
          )}
          <span className={isActive ? 'text-accent' : 'text-fg-subtle group-hover:text-fg-muted'}>
            <Icon name={icon} size={17} />
          </span>
          {!rail && <span className="flex-1 truncate">{t(label)}</span>}
          {!rail && badge > 0 && (
            <span className="rounded-full bg-danger-soft px-1.5 text-[10px] font-bold text-danger">{badge}</span>
          )}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ rail, onToggleRail, onNavigate, children }) {
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const poll = () => getPendingTodos().then((p) => setPending(p?.count || 0)).catch(() => {})
    poll()
    const id = setInterval(poll, 60000)
    return () => clearInterval(id)
  }, [])

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200
        ${rail ? 'w-16' : 'w-[264px]'}`}
    >
      {/* marca + recolher */}
      <div className={`flex items-center gap-2.5 pb-3 pt-4 ${rail ? 'justify-center px-2' : 'px-4'}`}>
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-contrast shadow-sm">
          <Icon name="layers" size={17} strokeWidth={1.9} />
        </span>
        {!rail && (
          <span className="min-w-0 flex-1">
            <span className="block text-md font-semibold leading-tight tracking-tight text-fg">Relay</span>
            <span className="block text-xs text-fg-muted">{t('Central de trabalho')}</span>
          </span>
        )}
        <button
          type="button"
          onClick={onToggleRail}
          title={rail ? t('Expandir menu') : t('Recolher menu')}
          aria-label={rail ? t('Expandir menu') : t('Recolher menu')}
          className="grid size-7 shrink-0 place-items-center rounded-sm border border-border bg-surface text-fg-muted shadow-xs transition hover:border-accent hover:text-accent"
        >
          <Icon name="panel" size={14} />
        </button>
      </div>

      {/* seletores de workspace/projeto */}
      {!rail && children}

      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {GROUPS.map((g) => (
          <div key={g.label} className="pt-2 first:pt-0">
            {!rail && (
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-fg-subtle">
                {t(g.label)}
              </div>
            )}
            {rail && <div className="mx-auto mb-1 h-px w-6 bg-border" aria-hidden />}
            {g.items.map(([to, label, icon]) => (
              <NavItem
                key={to}
                to={to}
                label={label}
                icon={icon}
                rail={rail}
                badge={to === '/todos' ? pending : 0}
                onClick={onNavigate}
              />
            ))}
          </div>
        ))}

        <div className="pt-2">
          {!rail && (
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-fg-subtle">
              {t('Desktop')}
            </div>
          )}
          <a
            href="relay://vault"
            title={t('Cofre KeePass no desktop')}
            className={`group flex h-9 items-center gap-2.5 rounded-md px-2 text-base font-medium text-fg-muted transition hover:bg-surface hover:text-fg hover:shadow-xs ${rail ? 'justify-center px-0' : ''}`}
          >
            <span className="text-fg-subtle group-hover:text-fg-muted"><Icon name="lock" size={17} /></span>
            {!rail && (
              <>
                <span className="flex-1 truncate">{t('Senhas')}</span>
                <Icon name="external" size={12} className="opacity-60" />
              </>
            )}
          </a>
        </div>
      </nav>
    </aside>
  )
}
