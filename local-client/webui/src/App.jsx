import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, Navigate, useNavigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import MeuDia from './pages/MeuDia.jsx'
import Estudos from './pages/Estudos.jsx'
import Reviews from './pages/Reviews.jsx'
import PrReviews from './pages/PrReviews.jsx'
import TechLinks from './pages/TechLinks.jsx'
import Projects from './pages/Projects.jsx'
import Board from './pages/Board.jsx'
import Assistente from './pages/Assistente.jsx'
import Goals from './pages/Goals.jsx'
import Metricas from './pages/Metricas.jsx'
import Reunioes from './pages/Reunioes.jsx'
import Time from './pages/Time.jsx'
import Todos from './pages/Todos.jsx'
import Labels from './pages/Labels.jsx'
import Biblioteca from './pages/Biblioteca.jsx'
import ApiTester from './pages/ApiTester.jsx'
import Base from './pages/Base.jsx'
import Ferramentas from './pages/Ferramentas.jsx'
import Traducao from './pages/Traducao.jsx'
import Memoria from './pages/Memoria.jsx'
import Ingles from './pages/Ingles.jsx'
import Skills from './pages/Skills.jsx'
import Guia from './pages/Guia.jsx'
import Configuracoes from './pages/Configuracoes.jsx'
import WorkspaceSelector from './components/WorkspaceSelector.jsx'
import ProjectSelector from './components/ProjectSelector.jsx'
import { getActiveProjectId } from './components/ProjectSelector.jsx'
import Icon from './components/Icon.jsx'
import PendingTodosReminder from './components/PendingTodosReminder.jsx'
import CoachTip from './components/CoachTip.jsx'
import { getPendingTodos, getProjects, getWorkspaces } from './api'
import { t } from './i18n'

function Sidebar({ onNavigate, onCollapse }) {
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const poll = () =>
      getPendingTodos().then((p) => setPendingCount(p?.count || 0)).catch(() => {})
    poll()
    const id = setInterval(poll, 60000)
    return () => clearInterval(id)
  }, [])

  // Menu em grupos: o que é uso diário fica em cima; o resto em "Extras".
  const grupos = [
    {
      titulo: t('Trabalho'),
      itens: [
        ['/dashboard', t('Dashboard'), 'dashboard'],
        ['/meu-dia', t('Meu Dia'), 'calendar'],
        ['/projetos', t('Projetos'), 'folder'],
        ['/board', t('Board'), 'board', 'Abra pelo seletor de projeto acima'],
        ['/goals', t('Goals'), 'target'],
        ['/time', t('Time'), 'users'],
      ],
    },
    {
      titulo: t('Registro'),
      itens: [
        ['/reunioes', t('Reuniões'), 'mic'],
        ['/reviews', t('Reviews'), 'clipboard'],
        ['/reviews-pr', t('Reviews de PR'), 'search'],
        ['/assistente', t('Assistente'), 'sparkles'],
        ['/todos', t('TODOs'), 'check'],
      ],
    },
    {
      titulo: t('Ferramentas'),
      itens: [
        ['/ferramentas', t('Ferramentas'), 'briefcase'],
        ['/memoria', t('Memória'), 'brain'],
        ['/techlinks', t('TechLinks'), 'globe'],
        ['/configuracoes', t('Configurações'), 'settings'],
      ],
    },
  ]
  const externo = ['relay://vault', t('Senhas'), 'lock', t('Cofre KeePass no desktop')]
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="badge"><Icon name="layers" size={18} strokeWidth={1.9} /></div>
        <div>
          <div className="name">Relay</div>
          <div className="sub">{t('Central de trabalho')}</div>
        </div>
        <button
          type="button"
          className="icon-btn sidebar-collapse"
          aria-label={t('Ocultar menu')}
          title={t('Ocultar menu (F9)')}
          onClick={onCollapse}
        >
          «
        </button>
      </div>
      <WorkspaceSelector />
      <ProjectSelector />
      <nav className="nav">
        {grupos.map((g) => (
          <div key={g.titulo}>
            <div className="nav-label">{g.titulo}</div>
            {g.itens.map(([to, label, ico, hint]) => (
                <NavLink key={to + label} to={to} onClick={onNavigate} title={hint || undefined}>
                  <span className="nav-ico"><Icon name={ico} /></span>
                  <span>{label}</span>
                {to === '/todos' && pendingCount > 0 && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: 'var(--danger)',
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="nav-label">{t('Desktop')}</div>
        <a href={externo[0]} title={externo[3]}>
          <span className="nav-ico"><Icon name={externo[2]} /></span>
          <span>{externo[1]}</span>
          <span className="nav-ext"><Icon name="external" size={12} /></span>
        </a>
      </nav>
    </aside>
  )
}

// /board sem id: abre o projeto ativo do seletor (ou o primeiro do workspace).
function BoardIndex() {
  const nav = useNavigate()
  const [erro, setErro] = useState('')
  useEffect(() => {
    ;(async () => {
      try {
        const [ws, projetos] = await Promise.all([getWorkspaces(), getProjects()])
        const pid = getActiveProjectId(ws.active)
        const alvo = projetos.find((p) => String(p.id) === String(pid)) || projetos[0]
        if (alvo) nav(`/board/${alvo.id}`, { replace: true })
        else setErro(t('Nenhum projeto neste workspace.'))
      } catch (e) {
        setErro(String(e.message || e))
      }
    })()
  }, [nav])
  return <div className="muted">{erro || t('Abrindo board…')}</div>
}

export default function App() {
  const [navOpen, setNavOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    try { return localStorage.getItem('relay.sidebarVisible') !== 'false' } catch { return true }
  })
  const toggleSidebar = () => {
    setSidebarVisible((v) => {
      const n = !v
      try { localStorage.setItem('relay.sidebarVisible', String(n)) } catch {}
      return n
    })
    setNavOpen(false)
  }
  // Atalho F9 como no desktop
  useEffect(() => {
    const h = (e) => { if (e.key === 'F9') { e.preventDefault(); toggleSidebar() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  return (
    <div className={'layout' + (navOpen ? ' nav-open' : '') + (sidebarVisible ? '' : ' sidebar-collapsed')}>
      {/* mobile: abre/fecha a gaveta (no desktop este botão não aparece) */}
      <button
        type="button"
        className="icon-btn floating nav-toggle"
        aria-label={navOpen ? t('Fechar menu') : t('Abrir menu')}
        aria-expanded={navOpen}
        title={navOpen ? t('Fechar menu') : t('Abrir menu')}
        onClick={() => setNavOpen((v) => !v)}
      >
        {navOpen ? '✕' : '☰'}
      </button>
      {navOpen && (
        <button
          type="button"
          className="nav-backdrop"
          aria-label={t('Fechar menu')}
          onClick={() => setNavOpen(false)}
        />
      )}
      {sidebarVisible && <Sidebar onNavigate={() => setNavOpen(false)} onCollapse={toggleSidebar} />}
      {/* desktop recolhido: botão para trazer o menu de volta */}
      {!sidebarVisible && (
        <button
          type="button"
          className="icon-btn floating sidebar-show"
          aria-label={t('Mostrar menu')}
          title={t('Mostrar menu (F9)')}
          onClick={toggleSidebar}
        >
          ☰
        </button>
      )}
      <main className="content" onClick={() => navOpen && setNavOpen(false)}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/meu-dia" element={<MeuDia />} />
          <Route path="/estudos" element={<Estudos />} />
          <Route path="/projetos" element={<Projects />} />
          <Route path="/projects" element={<Navigate to="/projetos" replace />} />
          <Route path="/board" element={<BoardIndex />} />
          <Route path="/board/:projectId" element={<Board />} />
          <Route path="/assistente" element={<Assistente />} />
        <Route path="/goals" element={<Goals />} />
          <Route path="/metricas" element={<Metricas />} />
          <Route path="/time" element={<Time />} />
          <Route path="/reunioes" element={<Reunioes />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/reviews-pr" element={<PrReviews />} />
          <Route path="/techlinks" element={<TechLinks />} />
          <Route path="/todos" element={<Todos />} />
          <Route path="/labels" element={<Labels />} />
          <Route path="/biblioteca" element={<Biblioteca />} />
          <Route path="/api-tester" element={<ApiTester />} />
          <Route path="/base" element={<Base />} />
          <Route path="/ferramentas" element={<Ferramentas />} />
          <Route path="/memoria" element={<Memoria />} />
          <Route path="/ingles" element={<Ingles />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/guia" element={<Guia />} />
          <Route path="/traducao" element={<Traducao />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<div className="muted">{t('Página não encontrada')}</div>} />
        </Routes>
      </main>
      <PendingTodosReminder />
      <CoachTip />
    </div>
  )
}
