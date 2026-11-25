import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { api } from '../api'
import { t } from '../i18n'

const PAGES = [
  ['/dashboard', 'Dashboard', 'dashboard'],
  ['/meu-dia', 'Meu Dia', 'calendar'],
  ['/projetos', 'Projetos', 'folder'],
  ['/board', 'Board', 'board'],
  ['/goals', 'Goals', 'target'],
  ['/time', 'Time', 'users'],
  ['/reunioes', 'Reuniões', 'mic'],
  ['/reviews', 'Reviews', 'clipboard'],
  ['/reviews-pr', 'Reviews de PR', 'search'],
  ['/assistente', 'Assistente', 'sparkles'],
  ['/todos', 'TODOs', 'check'],
  ['/estudos', 'Estudos', 'book'],
  ['/metricas', 'Métricas', 'activity'],
  ['/base', 'Base de conhecimento', 'brain'],
  ['/memoria', 'Memória', 'brain'],
  ['/biblioteca', 'Biblioteca', 'briefcase'],
  ['/ferramentas', 'Ferramentas', 'briefcase'],
  ['/techlinks', 'TechLinks', 'globe'],
  ['/skills', 'Skills', 'sparkles'],
  ['/configuracoes', 'Configurações', 'settings'],
]

// Busca global (⌘K): páginas + projetos + cards + reuniões, tudo pelo mesmo
// endpoint que o shell usa. Teclado: ↑/↓ navega, Enter abre, Esc fecha.
export default function CommandPalette({ open, onOpenChange }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [dados, setDados] = useState(null)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!open) { setQ(''); setDados(null); setIdx(0) }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const term = q.trim()
    if (!term) { setDados(null); return undefined }
    const id = setTimeout(() => {
      api.get('/search', { params: { q: term, limit: 6 } })
        .then((r) => setDados(r.data))
        .catch(() => setDados(null))
    }, 180)
    return () => clearTimeout(id)
  }, [q, open])

  const itens = useMemo(() => {
    const term = q.trim().toLowerCase()
    const paginas = PAGES
      .filter(([, label]) => !term || label.toLowerCase().includes(term))
      .map(([to, label, icon]) => ({ kind: 'page', to, label, icon }))
    if (!dados) return paginas.slice(0, 8)
    const projetos = (dados.projects || []).map((p) => ({
      kind: 'project', to: `/board/${p.id}`, label: p.name, hint: p.key, icon: 'folder',
    }))
    const cards = (dados.tasks || []).map((x) => ({
      kind: 'task', to: `/board`, label: `${x.code} · ${x.title}`, icon: 'board',
    }))
    const reunioes = (dados.recordings || []).map((r) => ({
      kind: 'recording', to: '/reunioes', label: r.title || t('(sem título)'), hint: r.topic, icon: 'mic',
    }))
    return [...paginas.slice(0, 4), ...projetos, ...cards, ...reunioes].slice(0, 12)
  }, [q, dados])

  useEffect(() => { setIdx(0) }, [itens.length])

  const abrir = (item) => {
    if (!item) return
    onOpenChange(false)
    nav(item.to)
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, itens.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); abrir(itens[idx]) }
    else if (e.key === 'Escape') { e.preventDefault(); onOpenChange(false) }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-fg/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Busca global')}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-elevated shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Icon name="search" size={16} className="text-fg-subtle" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={t('Buscar páginas, projetos, cards e reuniões…')}
            className="h-12 w-full bg-transparent text-md text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          <kbd className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-semibold text-fg-subtle">Esc</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {itens.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-fg-muted">{t('Nada encontrado.')}</div>
          )}
          {itens.map((it, i) => (
            <button
              key={`${it.kind}-${it.to}-${it.label}-${i}`}
              type="button"
              onMouseEnter={() => setIdx(i)}
              onClick={() => abrir(it)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-base transition
                ${i === idx ? 'bg-accent-soft text-accent' : 'text-fg hover:bg-surface-2'}`}
            >
              <Icon name={it.icon || 'search'} size={15} />
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.hint && <span className="text-xs text-fg-muted">{it.hint}</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-fg-subtle">
          <span>↑↓ {t('navegar')}</span>
          <span>↵ {t('abrir')}</span>
          <span className="ml-auto">{t('Busca em todo o workspace')}</span>
        </div>
      </div>
    </div>
  )
}
