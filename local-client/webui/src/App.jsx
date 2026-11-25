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
import Design from './pages/Design.jsx'
import { getActiveProjectId } from './components/ProjectSelector.jsx'
import PendingTodosReminder from './components/PendingTodosReminder.jsx'
import CoachTip from './components/CoachTip.jsx'
import { getPendingTodos, getProjects, getWorkspaces } from './api'
import { t } from './i18n'
import AppShell from './shell/AppShell.jsx'
import { ToastProvider } from './ui/index.js'

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
  return <div className="text-base text-fg-muted">{erro || t('Abrindo board…')}</div>
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell>
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
          <Route path="/design" element={<Design />} />
          <Route path="*" element={<div className="text-base text-fg-muted">{t('Página não encontrada')}</div>} />
        </Routes>
        <PendingTodosReminder />
        <CoachTip />
      </AppShell>
    </ToastProvider>
  )
}
