import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import Swal from 'sweetalert2'
import {
  getBoard,
  createTask,
  moveTask,
  updateTask,
  getSprints,
  archiveTask,
  unarchiveTask,
  getArchived,
  getGoals,
  getMembers,
  createMember,
  deleteMember,
  updateProject,
  metricsPdfUrl,
  getMetricsDimensions,
  getMetricsStages,
  getDailyAdvance,
  getDailySummary,
  saveDailySummary,
  getLinks,
  createLink,
  updateLink,
  deleteLink,
} from '../api'
import { apiError } from '../api'
import TaskDetail from '../components/TaskDetail.jsx'
import ProjectDaily from '../components/ProjectDaily.jsx'
import SprintPlanning from './SprintPlanning.jsx'
import { t, tf } from '../i18n'
import { typeLabel, PRIORITY_LABELS } from '../colors.js'
import Icon from '../components/Icon.jsx'
import {
  Avatar, Badge, Button, Card, Checkbox, Chip, DataTable, Dialog, EmptyState, Field,
  Input, PageHeader, Progress, SearchInput, SectionTitle, Select, Skeleton, Tabs, Toolbar,
} from '../ui'

const SPRINT_STATUS_LABELS = {
  PLANEJADA: 'Planejada',
  ATIVA: 'Ativa',
  CONCLUIDA: 'Concluída',
}

// Tom semântico por tipo/prioridade — os valores de cor vivem no tema, não na página.
const TYPE_VARIANT = {
  FEATURE: 'accent',
  BUG: 'danger',
  TECH_DEBT: 'warning',
  IMPROVEMENT: 'success',
  CHORE: 'neutral',
}
const PRIORITY_VARIANT = {
  LOW: 'neutral',
  MEDIUM: 'accent',
  HIGH: 'warning',
  URGENT: 'danger',
}

function PieChart({ data, size = 110 }) {
  const total = data.reduce((a, b) => a + (b.value || 0), 0)
  if (!total) return <div className="text-xs text-fg-muted">{'Sem dados'}</div>
  let acc = 0
  const r = size / 2
  const cx = r, cy = r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden="true">
      {data.map((d, i) => {
        const angle = (d.value / total) * 360
        const start = acc
        acc += angle
        const sr = (start - 90) * Math.PI / 180
        const er = (start + angle - 90) * Math.PI / 180
        const x1 = cx + r * Math.cos(sr), y1 = cy + r * Math.sin(sr)
        const x2 = cx + r * Math.cos(er), y2 = cy + r * Math.sin(er)
        const large = angle > 180 ? 1 : 0
        return (
          <path
            key={i}
            d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
            className={d.tone ? `${FILL_CLASS[d.tone]} stroke-surface` : 'stroke-surface'}
            fill={d.tone ? undefined : d.color}
            strokeWidth="1.5"
          />
        )
      })}
      <circle cx={cx} cy={cy} r={r * 0.52} className="fill-surface text-surface" />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" className="fill-fg">{total}</text>
    </svg>
  )
}

const PRIORITY_TONE = { LOW: 'muted', MEDIUM: 'accent', HIGH: 'warning', URGENT: 'danger' }
const PIE_TONES = ['accent', 'success', 'warning', 'danger']
const FILL_CLASS = {
  accent: 'fill-accent',
  success: 'fill-success',
  warning: 'fill-warning',
  danger: 'fill-danger',
  muted: 'fill-fg-subtle',
}

function PieLegend({ data, limit }) {
  const list = limit ? data.slice(0, limit) : data
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {list.map((d, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs">
          <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden="true">
            <rect
              width="10"
              height="10"
              rx="2"
              className={d.tone ? FILL_CLASS[d.tone] : undefined}
              fill={d.tone ? undefined : d.color}
            />
          </svg>
          <span className="truncate">{d.label}</span>
          <span className="text-fg-muted">({d.value})</span>
        </div>
      ))}
      {limit && data.length > limit && <div className="text-xs text-fg-subtle">+{data.length - limit} {t('outros')}</div>}
    </div>
  )
}

function DailyAdvanceLines({ summary }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {summary.split('\n').filter((l) => l.trim()).map((linha, i) => {
        const m = linha.match(/^((?:Ontem|Hoje):\s*)?([^:]{3,90}):\s*(.*)$/s)
        const rotuloDia = linha.match(/^(Ontem|Hoje):\s*$/)
        if (rotuloDia) return <div key={i} className="text-xs uppercase tracking-wide text-fg-muted">{t(rotuloDia[1])}</div>
        if (m) {
          const [, prefixo, topico, detalhe] = m
          return (
            <div key={i}>
              {prefixo && <span className="text-fg-muted">{t(prefixo.replace(':', ''))} — </span>}
              <b>{topico.trim()}</b>: {detalhe.trim()}
            </div>
          )
        }
        return <div key={i}>{linha}</div>
      })}
    </div>
  )
}

export default function Board() {
  const { projectId } = useParams()
  const [board, setBoard] = useState(null)
  const [boardFull, setBoardFull] = useState(null) // projeto inteiro, sem filtro de sprint (escopo das métricas)
  const [error, setError] = useState('')
  const [newTitles, setNewTitles] = useState({})
  const [openCode, setOpenCode] = useState(null)

  // Abas: board de fluxo | planejamento de sprints
  const [view, setView] = useState('board') // 'board' | 'metrics' | 'daily' | 'planning'

  // Sprints
  const [sprints, setSprints] = useState([])
  const [sprintFilter, setSprintFilter] = useState('all') // 'all' | 'backlog' | <id>
  const defaultedRef = useRef(false) // já aplicou o default (sprint ativa) para este projeto?

  // Arquivados
  const [archived, setArchived] = useState([])
  const [showArchived, setShowArchived] = useState(false)

  // Renderização inicial do kanban: colunas com dezenas de cards (ex.: 90)
  // montavam centenas de Selects de uma vez e travavam a janela em máquinas
  // mais lentas. Mostra um lote e libera o resto sob demanda.
  const [expandedCols, setExpandedCols] = useState({})

  // Métricas do projeto (acordeão)
  const [goals, setGoals] = useState([])
  const [metricsOpen, setMetricsOpen] = useState(true)
  const [dimensions, setDimensions] = useState(null)
  const [stages, setStages] = useState(null)
  const [dailyAdvance, setDailyAdvance] = useState(null)
  const [dailyAdvanceLoading, setDailyAdvanceLoading] = useState(false)
  // estágios (colunas) fora do cálculo das métricas — persiste por projeto
  const [excludedStages, setExcludedStages] = useState(() => {
    try {
      const raw = localStorage.getItem(`relay.metrics.excluded.${projectId}`)
      const arr = JSON.parse(raw || '[]')
      return Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isFinite(n)) : []
    } catch { return [] }
  })
  const [originFilter, setOriginFilter] = useState('all')   // all | local | remote
  const [criarLocal, setCriarLocal] = useState(false)       // quick-add cria tarefa local
  const [selectedStage, setSelectedStage] = useState(null)
  const [members, setMembers] = useState([])
  const [showMembers, setShowMembers] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [links, setLinks] = useState([])
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [editingLink, setEditingLink] = useState(null)

  // Filtros (paridade com desktop FilterBar)
  const [searchText, setSearchText] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [epicFilter, setEpicFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')

  const filterParam = sprintFilter === 'all' ? null : sprintFilter

  const load = () => {
    getBoard(projectId, filterParam)
      .then((b) => { setBoard(b); setError('') })
      .catch((e) => setError(String(e.message || e)))
    // Métricas e mutações precisam do escopo cheio junto.
    loadFull()
  }

  // Board sem filtro de sprint: a aba Métricas é do projeto inteiro, igual
  // à API, ao PDF e ao desktop — nunca segue o filtro de sprint do kanban.
  const loadFull = () =>
    getBoard(projectId, null)
      .then((b) => setBoardFull(b))
      .catch(() => {})

  const loadSprints = () =>
    getSprints(projectId)
      .then((sp) => {
        setSprints(sp)
        // Ao abrir o projeto, o board mostra a sprint ativa por padrão.
        if (!defaultedRef.current) {
          defaultedRef.current = true
          const active = sp.find((s) => s.status === 'ATIVA')
          if (active) setSprintFilter(String(active.id))
        }
      })
      .catch((e) => setError(apiError(e)))

  const loadArchived = () =>
    getArchived(projectId)
      .then(setArchived)
      .catch((e) => setError(apiError(e)))

  const loadGoals = () =>
    getGoals(projectId)
      .then(setGoals)
      .catch(() => setGoals([]))

  const loadMembers = () =>
    getMembers(projectId)
      .then(setMembers)
      .catch(() => setMembers([]))

  const loadLinks = () =>
    getLinks(projectId)
      .then(setLinks)
      .catch(() => setLinks([]))

  useEffect(() => {
    // Novo projeto: re-aplica o default (sprint ativa) e volta pra aba Board.
    defaultedRef.current = false
    setSprintFilter('all')
    setView('board')
    setExpandedCols({})
  }, [projectId])

  useEffect(() => { setExpandedCols({}) }, [sprintFilter])

  const loadMetrics = (excluded) => {
    getMetricsDimensions(projectId, excluded).then(setDimensions).catch(() => setDimensions(null))
    getMetricsStages(projectId, excluded)
      .then((d) => {
        setStages(d)
        // por padrão abre no "Dev Box" (dev concluído, aguardando teste)
        const devBox = d.stages.find((x) => x.stage === 'dev-box')
        setSelectedStage((atual) => atual || (devBox ? devBox.stage : d.stages[0]?.stage) || null)
      })
      .catch(() => setStages(null))
  }

  const loadDailyAdvance = (refresh) => {
    setDailyAdvanceLoading(true)
    getDailyAdvance(projectId, refresh)
      .then(setDailyAdvance)
      .catch(() => setDailyAdvance(null))
      .finally(() => setDailyAdvanceLoading(false))
  }
  const [daySummaries, setDaySummaries] = useState({})
  const [expandedDay, setExpandedDay] = useState(null)
  const [dayLoading, setDayLoading] = useState(null)
  const [daySaving, setDaySaving] = useState(null)
  const [diasVisivel, setDiasVisivel] = useState(() => {
    try {
      return localStorage.getItem(`relay.metrics.dias.${projectId}`) !== '0'
    } catch { return true }
  })
  const [avancoVisivel, setAvancoVisivel] = useState(() => {
    try {
      return localStorage.getItem(`relay.metrics.avanco.${projectId}`) !== '0'
    } catch { return true }
  })
  const toggleDay = (iso) => {
    if (expandedDay === iso) { setExpandedDay(null); return }
    setExpandedDay(iso)
    if (daySummaries[iso] || !iso) return
    setDayLoading(iso)
    getDailySummary(projectId, iso)
      .then((d) => setDaySummaries((atual) => ({ ...atual, [iso]: d })))
      .catch(() => setDaySummaries((atual) => ({ ...atual, [iso]: null })))
      .finally(() => setDayLoading(null))
  }
  const saveDay = (iso) => {
    setDaySaving(iso)
    saveDailySummary(projectId, iso)
      .then((d) => setDaySummaries((atual) => ({ ...atual, [iso]: d })))
      .catch(() => {})
      .finally(() => setDaySaving(null))
  }

  const toggleStageExcluded = (columnId) => {
    const ids = (stages?.stages || []).map((x) => x.id)
    const tem = excludedStages.includes(columnId)
    const proximo = tem ? excludedStages.filter((id) => id !== columnId) : [...excludedStages, columnId]
    // nunca esvazia o cálculo por completo
    if (ids.filter((id) => !proximo.includes(id)).length === 0) return
    try {
      localStorage.setItem(`relay.metrics.excluded.${projectId}`, JSON.stringify(proximo))
    } catch { /* armazenamento indisponível: vale só na sessão */ }
    setExcludedStages(proximo)
    loadMetrics(proximo)
  }

  useEffect(() => {
    load()
    loadSprints()
    loadArchived()
    loadGoals()
    loadMembers()
    loadLinks()
    loadMetrics(excludedStages)
    loadDailyAdvance(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sprintFilter])

  // Escopo das métricas é o projeto inteiro: load() atualiza boardFull junto.

  const addTask = async (columnId) => {
    const title = (newTitles[columnId] || '').trim()
    if (!title) return
    const body = {
      projectId: Number(projectId), columnId, title,
      type: criarLocal ? 'CHORE' : 'FEATURE', priority: 'MEDIUM',
      isLocal: criarLocal,
    }
    // Cria já dentro da sprint selecionada (se for uma sprint específica)
    if (sprintFilter !== 'all' && sprintFilter !== 'backlog') body.sprintId = Number(sprintFilter)
    try {
      await createTask(body)
      setNewTitles({ ...newTitles, [columnId]: '' })
      load()
      loadSprints()
    } catch (e) {
      setError(apiError(e))
    }
  }

  const advance = async (task, columns) => {
    const idx = columns.findIndex((c) => c.id === task.columnId)
    const next = columns[idx + 1]
    if (!next) return
    try {
      await moveTask(task.code, next.id)
      load()
      loadSprints()
    } catch (e) {
      setError(apiError(e))
    }
  }

  const onArchive = async (task) => {
    try {
      await archiveTask(task.code)
      load()
      loadArchived()
      loadSprints()
    } catch (e) {
      setError(apiError(e))
    }
  }

  const onUnarchive = async (task) => {
    try {
      await unarchiveTask(task.code)
      load()
      loadArchived()
      loadSprints()
    } catch (e) {
      setError(apiError(e))
    }
  }

  const assignSprint = async (task, value) => {
    try {
      await updateTask(task.code, { sprintId: value === '' ? null : Number(value) })
      load()
      loadSprints()
    } catch (e) {
      setError(apiError(e))
    }
  }

  const assignTask = async (task, assignee) => {
    const val = (assignee || '').trim() || null
    try {
      if (val) { try { await createMember(projectId, { name: val }) } catch {} }
      await updateTask(task.code, { assignee: val })
      load()
      loadMembers()
    } catch (e) { setError(apiError(e)) }
  }

  const handleCreateMember = async () => {
    const name = newMemberName.trim()
    if (!name) return
    try { await createMember(projectId, { name }); setNewMemberName(''); loadMembers() } catch (e) { setError(apiError(e)) }
  }

  const handleDeleteMember = async (id) => {
    try { await deleteMember(id); loadMembers(); load() } catch (e) { setError(String(e.message || e)) }
  }

  const handleCreateLink = async () => {
    const title = newLinkTitle.trim()
    const url = newLinkUrl.trim()
    if (!title || !url) return
    try { await createLink(projectId, { title, url }); setNewLinkTitle(''); setNewLinkUrl(''); loadLinks() } catch (e) { setError(apiError(e)) }
  }
  const handleUpdateLink = async () => {
    if (!editingLink) return
    const title = (editingLink.title || '').trim()
    const url = (editingLink.url || '').trim()
    if (!title || !url) return
    try { await updateLink(editingLink.id, { title, url }); setEditingLink(null); loadLinks() } catch (e) { setError(apiError(e)) }
  }
  const handleDeleteLink = async (id) => {
    try { await deleteLink(id); loadLinks() } catch (e) { setError(String(e.message || e)) }
  }

  if (error && !board) {
    return (
      <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
        {error}
      </div>
    )
  }
  if (!board) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton w="w-64" h="h-8" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} h="h-48" />)}
        </div>
      </div>
    )
  }

  const cols = [...board.columns].sort((a, b) => a.order - b.order)
  const activeSprint = sprints.find((s) => s.status === 'ATIVA')

  // — Métricas do projeto (mesmo cálculo do desktop) —
  // SEMPRE no escopo do projeto inteiro (boardFull, sem filtro de sprint):
  // o kanban filtra por sprint, mas a métrica é do projeto — igual à API/PDF.
  const mCols = boardFull ? [...boardFull.columns].sort((a, b) => a.order - b.order) : cols
  // Entregue = conclusão formal + estágios de teste/aceite (mesma regra do backend).
  const DELIVERED_STAGES = new Set(['intest', 'emteste', 'intestes', 'emtestes',
    'verified', 'verificado', 'verificada', 'accepted', 'aceito', 'aceita'])
  const doneColIds = new Set(mCols.flatMap((c) => {
    const slug = String(c.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
    return (c.isDone || DELIVERED_STAGES.has(slug)) ? [c.id] : []
  }))
  const normName = (n) => (n || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const devBoxCol = [...mCols].sort((a, b) => a.order - b.order).find((c) => normName(c.name) === 'devbox')
  const devColIds = devBoxCol ? new Set(mCols.filter((c) => c.order >= devBoxCol.order).map((c) => c.id)) : doneColIds
  const mTasksAll = mCols.flatMap((c) => c.tasks)
  // tarefa local é lembrete pessoal: aparece no board, mas não entra em métrica
  const tasksMetric = mTasksAll.filter((tk) => !tk.isLocal && !excludedStages.includes(tk.columnId))
  const localTasks = mTasksAll.filter((tk) => tk.isLocal).length
  const doneTasks = tasksMetric.filter((tk) => doneColIds.has(tk.columnId)).length
  const pct = tasksMetric.length ? Math.round((doneTasks / tasksMetric.length) * 100) : 0
  const developedTasks = tasksMetric.filter((tk) => devColIds.has(tk.columnId)).length
  const devPct = tasksMetric.length ? Math.round((developedTasks / tasksMetric.length) * 100) : 0
  const devColName = devBoxCol ? devBoxCol.name : null
  const wipAlerts = mCols.filter((c) => c.wipLimit && c.wipLimit > 0 && c.tasks.length > c.wipLimit)
  const today0 = new Date(); today0.setHours(0,0,0,0)
  // alertas de prazo/fluxo contam TODAS as tarefas (a local é lembrete de entrega)
  const vencidos = mTasksAll.filter((tk) => tk.dueDate && new Date(tk.dueDate) < today0 && !devColIds.has(tk.columnId))
  const limiteParado = Date.now() - 14 * 24 * 60 * 60 * 1000
  const parados = mTasksAll.filter((tk) => !doneColIds.has(tk.columnId) && tk.updatedAt && new Date(tk.updatedAt).getTime() < limiteParado)
  const alertasLocais = new Set([...vencidos, ...parados].filter((tk) => tk.isLocal).map((tk) => tk.id)).size
  const goalsAtrasados = goals.filter((g) => {
    if (!g.dueDate) return false
    if (new Date(g.dueDate) >= today0) return false
    let q = tasksMetric
    if (g.tag) q = q.filter((tk) => tk.labels?.some((l) => l.name === g.tag))
    if (g.epicId) q = q.filter((tk) => tk.epics?.some((e) => e.id === g.epicId))
    if (g.sprintId) q = q.filter((tk) => tk.sprintId === g.sprintId)
    const tot = q.length
    const done = q.filter((tk) => doneColIds.has(tk.columnId)).length
    return done < tot
  }).length
  const metricSummary = []
  if (devPct < 100) metricSummary.push(`${t('dev')} ${devPct}%`)
  if (pct < 100) metricSummary.push(`${t('finalizado')} ${pct}%`)
  if (wipAlerts.length) metricSummary.push(`⚠ WIP ${wipAlerts.length}`)
  if (vencidos.length) metricSummary.push(`${vencidos.length} vencida(s)` )
  if (parados.length) metricSummary.push(`• ${parados.length} parada(s)`)
  if (goalsAtrasados) metricSummary.push(`${goalsAtrasados} atrasado(s)`)
  const goalProgress = (g) => {
    let q = tasksMetric
    if (g.tag) q = q.filter((tk) => tk.labels?.some((l) => l.name === g.tag))
    if (g.epicId) q = q.filter((tk) => tk.epics?.some((e) => e.id === g.epicId))
    if (g.sprintId) q = q.filter((tk) => tk.sprintId === g.sprintId)
    const tot = q.length; const done = q.filter((tk) => doneColIds.has(tk.columnId)).length
    return [done, tot, tot ? Math.round(done/tot*100) : 0]
  }
  const daysUntil = (d) => Math.round((new Date(d) - today0) / 86400000)
  const toneForDays = (d, warn=7) => d < 0 ? 'text-danger' : d <= warn ? 'text-warning' : 'text-fg-muted'

  // Filtros derivados (client-side) — escopo do kanban (respeita sprint)
  const tasksAll = cols.flatMap((c) => c.tasks)
  const totalTasks = tasksAll.length
  const epicOptions = [...new Set(tasksAll.flatMap((tk) => (tk.epics || []).map((e) => e.name)))].sort()
  const tagOptions = [...new Set(tasksAll.flatMap((tk) => (tk.labels || []).map((l) => l.name)))].sort()
  const assigneeOptions = [...new Set([...tasksAll.map((tk) => tk.assignee).filter(Boolean), ...members.map((m) => m.name)])].sort()
  const filteredCols = cols.map((col) => ({
    ...col,
    tasks: col.tasks.filter((tk) => {
      const s = searchText.trim().toLowerCase()
      if (s && !((tk.title || '').toLowerCase().includes(s) || (tk.code || '').toLowerCase().includes(s))) return false
      if (priorityFilter !== 'all' && tk.priority !== priorityFilter) return false
      if (epicFilter !== 'all' && !(tk.epics || []).some((e) => e.name === epicFilter)) return false
      if (tagFilter !== 'all' && !(tk.labels || []).some((l) => l.name === tagFilter)) return false
      if (assigneeFilter !== 'all') {
        if (assigneeFilter === '__none__') { if (tk.assignee) return false }
        else if (tk.assignee !== assigneeFilter) return false
      }
      if (originFilter === 'local' && !tk.isLocal) return false
      if (originFilter === 'remote' && tk.isLocal) return false
      return true
    }),
  }))
  const visibleCount = filteredCols.reduce((a, c) => a + c.tasks.length, 0)
  const epicProgressList = [...new Map(tasksMetric.flatMap((tk) => tk.epics || []).map((ep) => [ep.id, ep])).values()].map((ep) => {
    const q = tasksMetric.filter((tk) => tk.epics.some((e) => e.id === ep.id))
    const tot = q.length; const done = q.filter((tk) => doneColIds.has(tk.columnId)).length
    return { ep, done, tot, pct: tot ? Math.round((done / tot) * 100) : 0 }
  }).sort((a, b) => b.tot - a.tot).slice(0, 8)
  const unassignedTasks = tasksMetric.filter((tk) => !tk.assignee)
  const unassignedTot = unassignedTasks.length
  const unassignedDone = unassignedTasks.filter((tk) => doneColIds.has(tk.columnId)).length
  const unassignedDev = unassignedTasks.filter((tk) => devColIds.has(tk.columnId)).length
  const unassignedPct = unassignedTot ? Math.round((unassignedDev / unassignedTot) * 100) : 0
  const mAssigneeOptions = [...new Set([...mTasksAll.map((tk) => tk.assignee).filter(Boolean), ...members.map((m) => m.name)])].sort()
  const assigneeProgressListBase = mAssigneeOptions.map((name) => {
    const q = tasksMetric.filter((tk) => tk.assignee === name)
    const tot = q.length
    const done = q.filter((tk) => doneColIds.has(tk.columnId)).length
    const developed = q.filter((tk) => devColIds.has(tk.columnId)).length
    return { name, done, developed, tot, pct: tot ? Math.round((developed / tot) * 100) : 0 }
  })
  if (unassignedTot > 0) assigneeProgressListBase.push({ name: 'Sem responsável', done: unassignedDone, developed: unassignedDev, tot: unassignedTot, pct: unassignedPct, isUnassigned: true })
  const assigneeProgressList = assigneeProgressListBase.sort((a, b) => b.tot - a.tot).slice(0, 8)
  const activeFilterCount = (searchText.trim() ? 1 : 0) + (priorityFilter !== 'all' ? 1 : 0) + (epicFilter !== 'all' ? 1 : 0) + (tagFilter !== 'all' ? 1 : 0) + (assigneeFilter !== 'all' ? 1 : 0)
  // Pie data
  const columnPieData = mCols.map((c, i) => ({ label: c.name, value: c.tasks.filter((tk) => !tk.isLocal).length, tone: PIE_TONES[i % PIE_TONES.length] })).filter((d) => d.value > 0)
  const assigneePieData = assigneeProgressList.map((a, i) => ({ label: a.name, value: a.tot, tone: a.isUnassigned ? 'muted' : PIE_TONES[i % PIE_TONES.length] }))
  const priorityPieData = ['URGENT','HIGH','MEDIUM','LOW'].map((p) => ({ label: p, value: tasksMetric.filter((t) => t.priority === p).length, tone: PRIORITY_TONE[p] })).filter((d) => d.value > 0)
  const epicPieData = epicProgressList.map((e, i) => ({ label: e.ep.name, value: e.tot, tone: e.ep.color ? null : PIE_TONES[i % PIE_TONES.length], color: e.ep.color || null }))

  const sprintOptions = [
    { value: 'all', label: t('Todas') },
    { value: 'backlog', label: t('Backlog') },
    ...sprints.map((sp) => ({
      value: String(sp.id),
      label: `${sp.name} · ${t(SPRINT_STATUS_LABELS[sp.status] || sp.status)} (${sp.doneCount}/${sp.taskCount})`,
    })),
  ]

  const priorityFilterOptions = [
    { value: 'all', label: t('Todas') },
    { value: 'LOW', label: t('Baixa') },
    { value: 'MEDIUM', label: t('Média') },
    { value: 'HIGH', label: t('Alta') },
    { value: 'URGENT', label: t('Urgente') },
  ]
  const epicFilterOptions = [{ value: 'all', label: t('Todos') }, ...epicOptions.map((ep) => ({ value: ep, label: ep }))]
  const tagFilterOptions = [{ value: 'all', label: t('Todas') }, ...tagOptions.map((tg) => ({ value: tg, label: tg }))]
  const originFilterOptions = [
    { value: 'all', label: t('Todas') },
    { value: 'remote', label: t('Do board') },
    { value: 'local', label: t('Locais') },
  ]
  const assigneeFilterOptions = [
    { value: 'all', label: t('Todos') },
    { value: '__none__', label: t('Sem responsável') },
    ...assigneeOptions.map((a) => ({ value: a, label: a })),
  ]
  const cardSprintOptions = (task) => [
    { value: '__backlog__', label: t('Backlog') },
    ...sprints.map((sp) => ({ value: String(sp.id), label: sp.name })),
    ...(task.sprintId != null && !sprints.some((sp) => String(sp.id) === String(task.sprintId))
      ? [{ value: String(task.sprintId), label: String(task.sprintId) }]
      : []),
  ]
  const cardAssigneeOptions = (task) => [
    { value: '__none__', label: t('Sem responsável') },
    ...assigneeOptions.map((a) => ({ value: a, label: a })),
    ...(task.assignee && !assigneeOptions.includes(task.assignee) ? [{ value: task.assignee, label: task.assignee }] : []),
  ]

  const tabs = [
    { value: 'board', label: t('Board'), icon: <Icon name="board" size={16} /> },
    { value: 'metrics', label: t('Métricas'), icon: <Icon name="activity" size={16} /> },
    { value: 'daily', label: `📝 ${t('Daily')}`, icon: <Icon name="clipboard" size={16} /> },
    { value: 'planning', label: t('Planejamento de Sprints'), icon: <Icon name="calendar" size={16} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${board.key} · ${board.name}`}
        description={tf('Board kanban via API ({count} colunas).', { count: cols.length })}
        actions={(
          <>
            {board.boardUrl ? (
              <>
                <Button as="a" href={board.boardUrl} target="_blank" rel="noreferrer" variant="secondary" size="sm">
                  🔗 {t('Abrir board')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title={board.boardUrl}
                  onClick={async () => {
                    const { value: v } = await Swal.fire({ title: t('Link do board externo (cole a URL):'), input: 'url', inputValue: board.boardUrl || '', inputPlaceholder: 'https://...', showCancelButton: true, confirmButtonText: t('Salvar'), cancelButtonText: t('Cancelar') })
                    if (v !== undefined) updateProject(projectId, { boardUrl: (v || '').trim() }).then(load)
                  }}
                >
                  {t('Editar link')}
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  const { value: v } = await Swal.fire({ title: t('Link do board externo (cole a URL):'), input: 'url', inputPlaceholder: 'https://...', showCancelButton: true, confirmButtonText: t('Salvar'), cancelButtonText: t('Cancelar') })
                  if (v !== undefined) updateProject(projectId, { boardUrl: (v || '').trim() }).then(load)
                }}
              >
                {t('Definir link do Board')}
              </Button>
            )}
            <div title={t('Previsão de entrega do projeto')}>
              <Field label={t('Previsão de entrega')}>
                <Input
                  type="date"
                  size="sm"
                  value={(board.targetDate || '').slice(0, 10)}
                  onChange={(e) => updateProject(projectId, { targetDate: e.target.value || null }).then(load)}
                />
              </Field>
            </div>
            <Button as={Link} to="/projetos" variant="ghost" size="sm">{t('← Projetos')}</Button>
          </>
        )}
      />

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <Tabs tabs={tabs} value={view} onValueChange={setView} ariaLabel={t('Visões do projeto')}>
        {view === 'board' && (
          <div className="space-y-4">
            <Toolbar
              actions={(
                <>
                  {activeSprint && sprintFilter === 'all' && (
                    <Button variant="ghost" size="sm" onClick={() => setSprintFilter(String(activeSprint.id))}>
                      {tf('Ver sprint ativa: {name}', { name: activeSprint.name })}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
                    {showArchived ? t('← Voltar ao board') : tf('Arquivados ({count})', { count: archived.length })}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowMembers(true)}>{t('Responsáveis')} ({members.length})</Button>
                </>
              )}
            >
              <span className="text-sm text-fg-muted">{t('Sprint:')}</span>
              <Select
                size="sm"
                value={sprintFilter}
                onValueChange={setSprintFilter}
                options={sprintOptions}
                className="w-64"
                ariaLabel={t('Sprint:')}
              />
            </Toolbar>

            {/* Atalhos do projeto — links com título (PRs, docs, board externo, etc) */}
            <Card>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-md font-semibold">🔗 {t('Atalhos')}</h3>
                <span className="text-xs text-fg-muted">{links.length} {t('atalho(s)')}</span>
              </div>

              {links.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {links.map((l) => (
                    <span key={l.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1 text-sm">
                      <a href={l.url} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">{l.title} ↗</a>
                      <Button variant="ghost" size="sm" onClick={() => setEditingLink(l)}>{t('Editar')}</Button>
                      <Button variant="ghost" size="sm" iconOnly aria-label={`${t('Excluir')} ${l.title}`} onClick={() => handleDeleteLink(l.id)}>
                        <Icon name="close" size={14} />
                      </Button>
                    </span>
                  ))}
                </div>
              )}

              {editingLink ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Field label={t('Título do atalho')} className="min-w-48 flex-1">
                    <Input value={editingLink.title} onChange={(e) => setEditingLink({ ...editingLink, title: e.target.value })} />
                  </Field>
                  <Field label="URL" className="min-w-64 flex-[2]">
                    <Input placeholder="https://..." value={editingLink.url} onChange={(e) => setEditingLink({ ...editingLink, url: e.target.value })} />
                  </Field>
                  <Button onClick={handleUpdateLink}>{t('Salvar')}</Button>
                  <Button variant="ghost" onClick={() => setEditingLink(null)}>{t('Cancelar')}</Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <Field label={t('Título do atalho')} className="min-w-48 flex-1">
                    <Input placeholder={t('Título do atalho')} value={newLinkTitle} onChange={(e) => setNewLinkTitle(e.target.value)} />
                  </Field>
                  <Field label="URL" className="min-w-64 flex-[2]">
                    <Input placeholder="https://..." value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCreateLink()} />
                  </Field>
                  <Button onClick={handleCreateLink}>{t('+ Adicionar atalho')}</Button>
                </div>
              )}

              <p className="mt-2 text-xs text-fg-muted">{t('Ex.: PR da sprint, doc de migração, board externo, pipeline.')}</p>
            </Card>

            {/* Barra de filtros (paridade desktop FilterBar) */}
            {!showArchived && (
              <Toolbar
                actions={(
                  <>
                    <span className="text-xs text-fg-muted">
                      {visibleCount === totalTasks ? tf('{total} tarefas', { total: totalTasks }) : tf('{visible}/{total} tarefas', { visible: visibleCount, total: totalTasks })}
                    </span>
                    <span className="whitespace-nowrap" title={t('Novos cards criados abaixo vão existir só aqui e o sync não os toca')}>
                      <Checkbox
                        label={t('Criar como local')}
                        checked={criarLocal}
                        onCheckedChange={(v) => setCriarLocal(!!v)}
                      />
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => { setSearchText(''); setPriorityFilter('all'); setEpicFilter('all'); setTagFilter('all'); setAssigneeFilter('all'); setOriginFilter('all') }}>{t('Limpar')}</Button>
                  </>
                )}
              >
                <SearchInput
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={t('🔍 Buscar por título ou código...')}
                  className="min-w-48 flex-1"
                  aria-label={t('Buscar por título ou código')}
                />
                <Field label={t('Prioridade:')} className="w-32">
                  <Select size="sm" value={priorityFilter} onValueChange={setPriorityFilter} options={priorityFilterOptions} ariaLabel={t('Prioridade:')} />
                </Field>
                <Field label={t('Épico:')} className="w-36">
                  <Select size="sm" value={epicFilter} onValueChange={setEpicFilter} options={epicFilterOptions} ariaLabel={t('Épico:')} />
                </Field>
                <Field label={t('Tag:')} className="w-32">
                  <Select size="sm" value={tagFilter} onValueChange={setTagFilter} options={tagFilterOptions} ariaLabel={t('Tag:')} />
                </Field>
                <div className="w-32" title={t('Tarefas locais não sincronizam com o board externo')}>
                  <Field label={t('Origem:')} className="w-full">
                    <Select size="sm" value={originFilter} onValueChange={setOriginFilter} options={originFilterOptions} ariaLabel={t('Origem:')} />
                  </Field>
                </div>
                <Field label={t('Responsável:')} className="w-36">
                  <Select size="sm" value={assigneeFilter} onValueChange={setAssigneeFilter} options={assigneeFilterOptions} ariaLabel={t('Responsável:')} />
                </Field>
              </Toolbar>
            )}

            {showArchived && (
              <Card padding="none">
                <div className="p-4">
                  <h3 className="text-md font-semibold">{t('Tarefas arquivadas')}</h3>
                  <p className="mt-1 text-sm text-fg-muted">
                    {t('Cards concluídos há mais de 3 dias são arquivados automaticamente e somem do board.')}
                  </p>
                </div>
                <DataTable
                  dense
                  columns={[
                    { key: 'code', header: t('Código'), width: 'w-28', render: (task) => <span className="font-mono text-xs">{task.code}</span> },
                    { key: 'title', header: t('Título') },
                    { key: 'type', header: t('Tipo'), hideOnMobile: true, render: (task) => <Badge variant={TYPE_VARIANT[task.type] || 'neutral'}>{task.type}</Badge> },
                    { key: 'priority', header: t('Prioridade'), hideOnMobile: true, render: (task) => <Badge variant={PRIORITY_VARIANT[task.priority] || 'neutral'}>{task.priority}</Badge> },
                    {
                      key: 'actions',
                      header: '',
                      align: 'right',
                      render: (task) => (
                        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => onUnarchive(task)}>{t('Desarquivar')}</Button>
                        </span>
                      ),
                    },
                  ]}
                  rows={archived}
                  rowKey={(task) => task.id}
                  onRowClick={(task) => setOpenCode(task.code)}
                  empty={t('Nenhuma tarefa arquivada.')}
                />
              </Card>
            )}

            {!showArchived && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:overflow-x-auto sm:pb-2">
                {filteredCols.map((col, colIndex) => {
                  const orig = cols.find((c) => c.id === col.id)
                  const wipOver = orig?.wipLimit && orig.tasks.length > orig.wipLimit
                  const countText = orig?.wipLimit ? `${col.tasks.length}/${orig.wipLimit}` : String(col.tasks.length)
                  return (
                    <Card key={col.id} padding="none" className="flex max-h-[70vh] w-full flex-col overflow-hidden sm:w-80 sm:shrink-0">
                      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
                        <svg viewBox="0 0 8 8" className="size-2 shrink-0" aria-hidden="true">
                          <circle cx="4" cy="4" r="4" className={FILL_CLASS[PIE_TONES[colIndex % PIE_TONES.length]]} />
                        </svg>
                        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{col.name}</h3>
                        <Badge variant={wipOver ? 'danger' : 'neutral'} title={wipOver ? t('Acima do WIP') : undefined}>{countText}</Badge>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
                        {col.tasks.length === 0 && (
                          <EmptyState title={t('Vazio')} className="py-4" />
                        )}

                        {col.tasks.slice(0, expandedCols[col.id] ? col.tasks.length : 20).map((task) => (
                          <Card
                            key={task.id}
                            padding="sm"
                            className="cursor-pointer"
                            onClick={() => setOpenCode(task.code)}
                            title={`${typeLabel(task.type)} · ${t('Prioridade')}: ${PRIORITY_LABELS[task.priority] || task.priority}${task.isLocal ? ' · ' + t('tarefa local') : ''}`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="flex shrink-0 items-center gap-1 whitespace-nowrap font-mono text-xs text-fg-muted">
                                {task.code}
                                {task.isLocal && (
                                  <Badge variant="warning" size="sm" title={t('Tarefa local: não sincroniza com o board externo')}>{t('LOCAL')}</Badge>
                                )}
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                <Badge variant={PRIORITY_VARIANT[task.priority] || 'neutral'} size="sm" title={`${t('Prioridade')}: ${PRIORITY_LABELS[task.priority] || task.priority}`}>
                                  {PRIORITY_LABELS[task.priority] || task.priority}
                                </Badge>
                                {task.assignee && <Avatar name={task.assignee} size="sm" title={task.assignee} />}
                              </span>
                            </div>

                            <div className="my-1.5 text-md font-medium text-fg">{task.title}</div>

                            <div className="mb-1 flex flex-wrap gap-1">
                              <Badge variant={TYPE_VARIANT[task.type] || 'neutral'} size="sm" title={t('Tipo da tarefa')}>{typeLabel(task.type)}</Badge>
                              {(task.epics || []).slice(0,2).map((ep) => (
                                <Badge key={ep.id} variant="outline" size="sm">{ep.name}</Badge>
                              ))}
                              {(task.labels || []).slice(0,4).map((lb) => (
                                <Chip key={lb.id} dot>{lb.name}</Chip>
                              ))}
                            </div>

                            {task.dueDate && (
                              <p className={`text-xs ${new Date(task.dueDate) < today0 && !devColIds.has(task.columnId) ? 'font-bold text-danger' : 'text-fg-muted'}`}>
                                📅 {new Date(task.dueDate).toLocaleDateString()}
                              </p>
                            )}

                            <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                              <Select
                                size="sm"
                                value={task.sprintId != null ? String(task.sprintId) : '__backlog__'}
                                onValueChange={(v) => assignSprint(task, v === '__backlog__' ? '' : v)}
                                options={cardSprintOptions(task)}
                                ariaLabel={t('Sprint da tarefa')}
                              />
                              <Select
                                size="sm"
                                value={task.assignee || '__none__'}
                                onValueChange={(v) => assignTask(task, v === '__none__' ? '' : v)}
                                options={cardAssigneeOptions(task)}
                                ariaLabel={t('Responsável')}
                              />
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div onClick={(e) => e.stopPropagation()}>
                                {!col.isDone ? (
                                  <Button variant="ghost" size="sm" onClick={() => advance(task, cols)}>{t('Mover →')}</Button>
                                ) : (
                                  <Button variant="ghost" size="sm" onClick={() => onArchive(task)}>{t('Arquivar')}</Button>
                                )}
                              </div>
                            </div>
                          </Card>
                        ))}

                        {!expandedCols[col.id] && col.tasks.length > 20 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => setExpandedCols((atual) => ({ ...atual, [col.id]: true }))}
                          >
                            {tf('Mostrar mais {n}', { n: col.tasks.length - 20 })}
                          </Button>
                        )}

                        <div className="mt-auto flex items-center gap-1.5">
                          <Input
                            size="sm"
                            placeholder={t('Nova tarefa...')}
                            aria-label={t('Nova tarefa...')}
                            value={newTitles[col.id] || ''}
                            onChange={(e) => setNewTitles({ ...newTitles, [col.id]: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && addTask(col.id)}
                          />
                          <Button size="sm" iconOnly aria-label={t('Adicionar')} title={t('Adicionar')} onClick={() => addTask(col.id)}>
                            <Icon name="plus" size={16} />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {view === 'metrics' && (
          <div className="space-y-4">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-md font-semibold">{t('Métricas do projeto')}</h3>
                <span className="text-xs text-fg-muted">{metricSummary.length ? metricSummary.join('  ·  ') : t('Tudo em dia')}</span>
                <span className="text-xs text-fg-subtle" title={t('A aba Board pode filtrar por sprint; a métrica cobre o projeto inteiro, igual ao PDF')}>· {t('escopo: projeto inteiro')}</span>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  <div title={t('Oculta ranking por pessoa na tela e no PDF (quantidade não é complexidade)')}>
                    <Checkbox
                      label={t('Ocultar por responsável')}
                      checked={!!board.hideAssignee}
                      onCheckedChange={(v) => updateProject(projectId, { hideAssignee: !!v }).then(load)}
                    />
                  </div>
                  <Button as="a" href={metricsPdfUrl(projectId, excludedStages)} target="_blank" rel="noreferrer" variant="secondary" size="sm" title={t('Exportar as métricas em PDF')}>
                    ⬇ {t('Exportar PDF')}
                  </Button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2" title={devColName ? tf('Cards em {col} ou depois', { col: devColName }) : t('Cards com desenvolvimento concluído')}>
                  <span className="w-40 shrink-0 text-xs font-semibold text-fg-muted">{t('Desenvolvimento concluído')}</span>
                  <Progress value={devPct} tone={devPct === 100 ? 'success' : 'accent'} className="min-w-0 flex-1" label={t('Desenvolvimento concluído')} />
                  <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">{devPct}% ({developedTasks}/{tasksMetric.length})</span>
                </div>
                <div className="flex items-center gap-2" title={t('Cards entregues: concluídos e em teste/aceite')}>
                  <span className="w-40 shrink-0 text-xs font-semibold text-fg-muted">{t('Entregue')}</span>
                  <Progress value={pct} tone={pct === 100 ? 'success' : 'warning'} className="min-w-0 flex-1" label={t('Entregue')} />
                  <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">{pct}% ({doneTasks}/{tasksMetric.length})</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-40 shrink-0" />
                  <span className="text-xs text-fg-muted">{t('Desmarcar estágios em “Posição no fluxo” tira os cards do cálculo dos dois percentuais.')}</span>
                  <span className="ml-auto flex flex-wrap gap-2">
                    {activeSprint?.endDate && (() => {
                      const d = daysUntil(activeSprint.endDate)
                      return (
                        <span className={`text-xs ${toneForDays(d, 3)}`}>
                          {d >= 0 ? tf('{d} dias para fechar a sprint {name}', { name: activeSprint.name, d }) : tf('Sprint {name} atrasada há {d}d', { name: activeSprint.name, d: Math.abs(d) })}
                        </span>
                      )
                    })()}
                    {board?.targetDate && (() => {
                      const d = daysUntil(board.targetDate)
                      return (
                        <span className={`text-xs ${toneForDays(d, 7)}`}>
                          {d >= 0 ? tf('{d} dias para finalizar o projeto', { d }) : tf('Projeto atrasado há {d}d', { d: Math.abs(d) })}
                        </span>
                      )
                    })()}
                  </span>
                </div>
              </div>
            </Card>

            {/* Avanço ontem → hoje (resumo por IA dos docs de daily do vault) */}
            <Card padding="sm">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  title={avancoVisivel ? t('Ocultar avanço') : t('Mostrar avanço')}
                  onClick={() => setAvancoVisivel((v) => { try { localStorage.setItem(`relay.metrics.avanco.${projectId}`, v ? '0' : '1') } catch {} return !v })}
                >
                  <span aria-hidden="true">{avancoVisivel ? '▾' : '▸'}</span>
                  {t('Avanço (ontem → hoje)')}
                </Button>
                {dailyAdvance?.engine === 'llm' && <span className="text-xs text-accent">✨ {t('gerado por IA')}</span>}
                {dailyAdvance?.engine === 'heuristic' && <span className="text-xs text-fg-muted">{t('resumo automático')}</span>}
                {dailyAdvanceLoading && <span className="text-xs text-fg-muted">⏳ {t('Gerando resumo…')}</span>}
                <span className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="sm" iconOnly title={t('Gerar novamente')} aria-label={t('Gerar novamente')} disabled={dailyAdvanceLoading} onClick={() => loadDailyAdvance(true)}>
                    ⟳
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setView('daily')}>{t('ver Daily')}</Button>
                </span>
              </div>

              {avancoVisivel && (
                <>
                  {dailyAdvanceLoading && !dailyAdvance ? (
                    <p className="mt-2 text-sm text-fg-muted">{t('Gerando resumo…')}</p>
                  ) : !dailyAdvance ? (
                    <p className="mt-2 text-sm text-fg-muted">{t('Gerando resumo…')}</p>
                  ) : dailyAdvance.configured === false ? (
                    <div className="mt-2">
                      <p className="mb-2 text-sm text-fg-muted">{t('Aponte o diretório raiz dos docs de daily (vault) para ativar o resumo.')}</p>
                      <div className="flex items-end gap-2">
                        <Input
                          placeholder="/home/usuario/.../daily"
                          defaultValue={board?.dailyDocsPath || ''}
                          id="daily-docs-path-input"
                          aria-label={t('Diretório dos docs de daily')}
                          size="sm"
                          className="flex-1"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const el = document.getElementById('daily-docs-path-input')
                            const v = (el?.value || '').trim()
                            updateProject(projectId, { dailyDocsPath: v || null }).then(() => { load(); loadDailyAdvance(true) })
                          }}
                        >
                          {t('Salvar')}
                        </Button>
                      </div>
                      {board?.dailyDocsPath && <p className="mt-1 text-xs text-fg-muted">{t('Atual')}: {board.dailyDocsPath} — {t('verifique se a pasta existe')}</p>}
                    </div>
                  ) : dailyAdvance.engine === 'empty' ? (
                    <p className="mt-2 text-sm text-fg-muted">{t('Sem docs de daily ontem/hoje neste diretório.')}</p>
                  ) : dailyAdvance.engine === 'heuristic' ? (
                    <div className={`mt-2 flex flex-col gap-2 text-sm ${dailyAdvanceLoading ? 'opacity-50' : ''}`}>
                      {[['Ontem', dailyAdvance.yesterday], ['Hoje', dailyAdvance.today]].map(([rotulo, dia]) => (
                        <div key={rotulo}>
                          <div className="text-xs uppercase tracking-wide text-fg-muted">{t(rotulo)}</div>
                          {dia.itens?.length ? (
                            <ul className="mt-0.5 list-disc pl-4">
                              {dia.itens.map((it, i) => <li key={i}><b>{it.topico}</b>: {it.detalhe}</li>)}
                            </ul>
                          ) : (
                            <p className="text-fg-muted">{dia.registros ? tf('{n} registro(s) sem detalhamento', { n: dia.registros }) : t('sem registros')}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`mt-2 ${dailyAdvanceLoading ? 'opacity-50' : ''}`}>
                      <DailyAdvanceLines summary={dailyAdvance.summary} />
                    </div>
                  )}
                </>
              )}
            </Card>

            {dailyAdvance?.configured !== false && dailyAdvance?.yesterday && dailyAdvance?.today && (
              <Card padding="sm">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  title={diasVisivel ? t('Ocultar resumo por dia') : t('Mostrar resumo por dia')}
                  onClick={() => setDiasVisivel((v) => {
                    try { localStorage.setItem(`relay.metrics.dias.${projectId}`, v ? '1' : '0') } catch { /* noop */ }
                    return !v
                  })}
                >
                  <span aria-hidden="true">{diasVisivel ? '▾' : '▸'}</span>
                  🗂️ {t('Resumo do dia (IA)')}
                </Button>

                {diasVisivel && [dailyAdvance.today, dailyAdvance.yesterday].map((dia) => {
                  const aberto = expandedDay === dia.date
                  const det = daySummaries[dia.date]
                  const fmt = `${dia.date.slice(8, 10)}/${dia.date.slice(5, 7)}`
                  return (
                    <div key={dia.date} className="border-t border-border">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => toggleDay(dia.date)}
                      >
                        <span aria-hidden="true">{aberto ? '▾' : '▸'}</span>
                        <strong>{dia.date === dailyAdvance.today.date ? t('Hoje') : t('Ontem')}</strong>
                        <span className="text-fg-muted">{fmt}</span>
                        {(dia.topicos?.length > 0) && (
                          <span className="min-w-0 flex-1 truncate text-left text-fg-muted">
                            {dia.topicos.slice(0, 2).join(' · ')}{dia.topicos.length > 2 ? ' …' : ''}
                          </span>
                        )}
                      </Button>

                      {aberto && (
                        <div className="px-1 pb-2 text-sm">
                          {dayLoading === dia.date ? (
                            <span className="text-fg-muted">{t('Gerando resumo…')}</span>
                          ) : det?.summary ? (
                            <>
                              {det.engine === 'llm' && <div className="mb-0.5 text-xs text-accent">✨ {t('gerado por IA')}</div>}
                              {det.engine === 'heuristic' && det.itens?.length ? (
                                <ul className="mb-2 mt-0.5 list-disc pl-4">
                                  {det.itens.map((it, i) => <li key={i}><b>{it.topico}</b>: {it.detalhe}</li>)}
                                </ul>
                              ) : (
                                <div className="mb-2 flex flex-col gap-1.5">
                                  {det.summary.split('\n').filter((l) => l.trim()).map((linha, i) => {
                                    const m = linha.match(/^(Ontem|Hoje):\s*$/)
                                    if (m) return <div key={i} className="text-xs uppercase tracking-wide text-fg-muted">{t(m[1])}</div>
                                    const mm = linha.match(/^([^:]{3,90}):\s*(.*)$/s)
                                    if (mm) return <div key={i}><b>{mm[1].trim()}</b>: {mm[2].trim()}</div>
                                    return <div key={i}>{linha}</div>
                                  })}
                                </div>
                              )}
                              <div className="mt-1.5 flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title={t('Gera de novo e salva em generated-daily-DD-MM-AAAA.md junto das dailies')}
                                  disabled={daySaving === dia.date}
                                  onClick={() => saveDay(dia.date)}
                                >
                                  {daySaving === dia.date ? '…' : `💾 ${t('Gerar e salvar resumo')}`}
                                </Button>
                                {det.saved && det.savedFile && <span className="text-xs text-fg-muted">✓ {det.savedFile}</span>}
                              </div>
                            </>
                          ) : (
                            <span className="text-fg-muted">{t('Sem docs de daily neste dia.')}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </Card>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Card padding="sm">
                <SectionTitle>{t('Alertas')}</SectionTitle>
                <div className="mt-2 space-y-1 text-sm">
                  {wipAlerts.length===0 && vencidos.length===0 && parados.length===0
                    ? <p className="text-fg-muted">{t('Nenhum alerta — fluxo saudável.')}</p>
                    : <>
                      {wipAlerts.slice(0,3).map((a,i)=>(<p key={i} className="text-danger">{'\u2022'} WIP: {a.name}</p>))}
                      {vencidos.slice(0,3).map((tk)=>(<p key={tk.id} className="text-danger">{'\u2022'} {tk.code} vencida{tk.isLocal ? ' · ' + t('local') : ''}</p>))}
                      {parados.slice(0,3).map((tk)=>(<p key={tk.id} className="text-warning">{'\u2022'} {tk.code} parada{tk.isLocal ? ' · ' + t('local') : ''}</p>))}
                    </>}
                </div>
              </Card>

              <Card padding="sm">
                <SectionTitle>{t('Prazos')}</SectionTitle>
                <div className="mt-2 space-y-1 text-sm">
                  {goals.filter((g)=>g.dueDate).length===0 && !activeSprint?.endDate && !board?.targetDate
                    ? <p className="text-fg-muted">{t('Nenhum prazo definido.')}</p>
                    : <>
                      {activeSprint?.endDate && (() => { const d = daysUntil(activeSprint.endDate); return (<p className={toneForDays(d, 7)}>{'\u2022'} {d >= 0 ? tf('{d} dias para fechar a sprint {name}', { name: activeSprint.name, d }) : tf('Sprint {name} atrasada há {d}d', { name: activeSprint.name, d: Math.abs(d) })} — {new Date(activeSprint.endDate).toLocaleDateString()}</p>) })()}
                      {board?.targetDate && (() => { const d = daysUntil(board.targetDate); return (<p className={toneForDays(d, 7)}>{'\u2022'} {d >= 0 ? tf('{d} dias para finalizar o projeto', { d }) : tf('Projeto atrasado há {d}d', { d: Math.abs(d) })} — {new Date(board.targetDate).toLocaleDateString()}</p>) })()}
                      {goals.filter((g)=>g.dueDate).slice(0,4).map((g)=>{ const [d,tot]=goalProgress(g); const days=daysUntil(g.dueDate); const col=toneForDays(days, 7); return (<p key={g.id} className={col}>{'\u2022'} {g.name} — {new Date(g.dueDate).toLocaleDateString()} ({days}d) {d}/{tot}</p>) })}
                    </>}
                </div>
              </Card>

              <Card padding="sm">
                <SectionTitle>{t('Objetivos')}</SectionTitle>
                <div className="mt-2 space-y-2">
                  {goals.length===0
                    ? <p className="text-sm text-fg-muted">{t('Nenhum goal — crie em Goals.')}</p>
                    : goals.slice(0,4).map((g)=>{ const [d,tot,p]=goalProgress(g); const days=g.dueDate?Math.round((new Date(g.dueDate)-today0)/86400000):null; return (
                      <div key={g.id}>
                        <div className="flex items-baseline justify-between gap-1.5 text-sm font-semibold">
                          <span className="min-w-0 flex-1 truncate">{g.name}</span>
                          {days!==null && <span className={`text-xs ${days<0?'text-danger':days<=3?'text-warning':'text-fg-muted'}`}>{days>=0?`${days}d`:`${Math.abs(days)}d atraso`}</span>}
                        </div>
                        <Progress value={p} size="sm" className="mt-1" label={g.name} />
                        <div className="text-xs text-fg-muted">{p}% ({d}/{tot})</div>
                      </div>
                    )})}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Card padding="sm">
                <SectionTitle className="mb-2">{t('Por épico')}</SectionTitle>
                {epicPieData.length > 0 && (
                  <div className="mb-2 flex items-center gap-3">
                    <PieChart data={epicPieData} size={90} />
                    <PieLegend data={epicPieData} limit={4} />
                  </div>
                )}
                {epicProgressList.length === 0
                  ? <p className="text-sm text-fg-muted">{t('Nenhum épico vinculado.')}</p>
                  : epicProgressList.map(({ ep, done, tot, pct: p }) => (
                    <div key={ep.id} className="mb-1.5">
                      <div className="flex items-center justify-between gap-1.5 text-sm font-semibold">
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden="true">
                            <rect
                              width="10"
                              height="10"
                              rx="2"
                              className={ep.color ? undefined : 'fill-accent'}
                              fill={ep.color || undefined}
                            />
                          </svg>
                          <span className="truncate">{ep.name}</span>
                        </span>
                        <span className="text-xs font-normal text-fg-muted">{p}% ({done}/{tot})</span>
                      </div>
                      <Progress value={p} size="sm" className="mt-1" tone={p === 100 ? 'success' : 'accent'} label={ep.name} />
                    </div>
                  ))}
              </Card>

              {!board.hideAssignee && (
                <Card padding="sm">
                  <SectionTitle className="mb-2">{t('Por responsável')}</SectionTitle>
                  {assigneePieData.length > 0 && (
                    <div className="mb-2 flex items-center gap-3">
                      <PieChart data={assigneePieData} size={90} />
                      <PieLegend data={assigneePieData} limit={4} />
                    </div>
                  )}
                  {assigneeProgressList.length === 0
                    ? <p className="text-sm text-fg-muted">{t('Nenhum responsável atribuído.')}</p>
                    : assigneeProgressList.map(({ name, done, developed, tot, pct: p, isUnassigned }) => (
                      <div key={name} className="mb-1.5">
                        <div className="flex items-center justify-between gap-1.5 text-sm font-semibold">
                          <span className={`min-w-0 flex-1 truncate ${isUnassigned ? 'text-fg-subtle' : ''}`}>{name} {isUnassigned && `(${unassignedTot})`}</span>
                          <span className="text-xs font-normal text-fg-muted" title={t('Desenvolvimento concluído (Dev Box ou depois)')}>{p}% ({developed ?? done}/{tot}){done !== (developed ?? done) && ` · ${done} ${t('aceitos')}`}</span>
                        </div>
                        <Progress value={p} size="sm" className="mt-1" tone={isUnassigned ? 'warning' : 'accent'} label={name} />
                      </div>
                    ))}
                </Card>
              )}

              <Card padding="sm">
                <SectionTitle className="mb-2">{t('Distribuição por coluna')}</SectionTitle>
                {columnPieData.length > 0 && (
                  <div className="mb-2 flex items-center gap-3">
                    <PieChart data={columnPieData} size={90} />
                    <PieLegend data={columnPieData} limit={4} />
                  </div>
                )}
                <div className="space-y-0.5">
                  {mCols.map((c) => {
                    const pctCol = c.tasks.length ? Math.round((c.tasks.filter((tk) => doneColIds.has(tk.columnId)).length / c.tasks.length) * 100) : 0
                    const over = c.wipLimit && c.tasks.length > c.wipLimit
                    return (
                      <div key={c.id} className={`flex items-center justify-between gap-2 text-sm ${over ? 'text-danger' : ''}`}>
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span className="font-bold tabular-nums">{c.tasks.length}{c.wipLimit ? `/${c.wipLimit}` : ''}</span>
                        <span className="w-10 text-right text-xs text-fg-muted">{c.isDone ? '✓' : `${pctCol}%`}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Card padding="sm">
                <SectionTitle className="mb-2">{t('Por prioridade')}</SectionTitle>
                {priorityPieData.length > 0 ? (
                  <div className="flex items-center gap-3">
                    <PieChart data={priorityPieData} size={90} />
                    <PieLegend data={priorityPieData} />
                  </div>
                ) : <p className="text-sm text-fg-muted">{t('Sem dados')}</p>}
              </Card>

              <Card padding="sm">
                <SectionTitle className="mb-2">{t('Métricas de fluxo')}</SectionTitle>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between gap-2"><span className="text-fg-muted">{t('WIP total')}</span><span className="font-bold">{tasksMetric.filter((tk)=>!doneColIds.has(tk.columnId)).length} {t('em aberto')}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-fg-muted">{t('Vencidas')}</span><span className={`font-bold ${vencidos.length?'text-danger':''}`}>{vencidos.length}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-fg-muted">{t('Paradas 14d+')}</span><span className={`font-bold ${parados.length?'text-warning':''}`}>{parados.length}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-fg-muted">{t('Sem responsável')}</span><span className="font-bold">{unassignedTot} ({unassignedPct}%)</span></div>
                  <div className="flex justify-between gap-2"><span className="text-fg-muted">{t('Desenvolvimento concluído')}</span><span className="font-bold text-accent">{developedTasks}/{tasksMetric.length} ({devPct}%)</span></div>
                  <div className="flex justify-between gap-2"><span className="text-fg-muted">{t('Entregue')}</span><span className="font-bold text-accent">{doneTasks}/{tasksMetric.length} ({pct}%)</span></div>
                  {localTasks > 0 && (
                    <p className="pt-0.5 text-xs text-fg-muted" title={t('Lembretes locais não entram no progresso, mas contam no alerta de prazo')}>
                      {localTasks} {t('local(is) fora do progresso')}
                      {alertasLocais > 0 && ` · ${alertasLocais} ${t('em alerta de prazo')}`}
                    </p>
                  )}
                </div>
              </Card>

              <Card padding="sm">
                <SectionTitle className="mb-2">{t('Filtros')}</SectionTitle>
                <p className="text-sm text-fg-muted">{activeFilterCount === 0 ? t('Nenhum filtro ativo — mostrando tudo') : tf('{visible}/{total} visíveis com filtros', { visible: visibleCount, total: totalTasks })}</p>
                <Progress value={totalTasks ? Math.round(visibleCount/totalTasks*100) : 0} size="sm" className="mt-2" label={t('Filtros')} />
                <p className="mt-1 text-xs text-fg-muted">{t('Use Buscar, Prioridade, Épico, Tag, Responsável acima')}</p>
              </Card>
            </div>

            {/* Hierárquico por módulos — barra proporcional */}
            <Card padding="sm">
              <SectionTitle className="mb-2">{t('Progresso geral')}</SectionTitle>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-40 shrink-0 text-xs">{t('Desenvolvimento concluído')}</span>
                  <Progress value={devPct} tone={devPct===100?'success':'accent'} className="min-w-0 flex-1" label={t('Desenvolvimento concluído')} />
                  <span className="w-24 shrink-0 text-right text-xs text-fg-muted tabular-nums">{developedTasks}/{tasksMetric.length} · {devPct}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-40 shrink-0 text-xs">{t('Entregue')}</span>
                  <Progress value={pct} tone={pct===100?'success':'warning'} className="min-w-0 flex-1" label={t('Entregue')} />
                  <span className="w-24 shrink-0 text-right text-xs text-fg-muted tabular-nums">{doneTasks}/{tasksMetric.length} · {pct}%</span>
                </div>
              </div>
            </Card>

            {/* Posição no fluxo + corte por módulo (sem "funil" artificial) */}
            {stages && stages.stages.length > 0 && (() => {
              const lista = stages.stages
              const sel = lista.find((x) => x.stage === selectedStage) || lista[0]
              const grupos = (stages.breakdown && stages.breakdown[sel.stage]) || []
              const total = stages.total || 1
              const maxAtual = Math.max(...lista.map((x) => x.current), 1)
              return (
                <Card padding="sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <SectionTitle>📍 {t('Posição no fluxo')}</SectionTitle>
                    <span className="text-xs text-fg-muted">
                      {t('Onde cada card está agora e quantos já chegaram até um estágio (inclui quem seguiu adiante).')}
                    </span>
                    <Select
                      size="sm"
                      value={sel.stage}
                      onValueChange={setSelectedStage}
                      options={lista.map((x) => ({ value: x.stage, label: x.name }))}
                      className="ml-auto w-48"
                      ariaLabel={t('Escolha o estágio para ver o corte por módulo')}
                    />
                    {excludedStages.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title={t('Voltar a incluir todos os estágios no cálculo')}
                        onClick={() => {
                          setExcludedStages([])
                          try { localStorage.removeItem(`relay.metrics.excluded.${projectId}`) } catch { /* noop */ }
                          loadMetrics([])
                        }}
                      >
                        {tf('{n} fora do cálculo · limpar', { n: excludedStages.length })}
                      </Button>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* agora (foto) + chegou até aqui */}
                    <div>
                      <div className="mb-2 flex items-end gap-6">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-fg-muted">{t('agora')}</div>
                          <div className="text-2xl font-extrabold leading-tight">{sel.current}</div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-fg-muted">{t('neste estágio ou depois')}</div>
                          <div className="text-2xl font-extrabold leading-tight">
                            {sel.reached}
                            <span className="text-sm font-semibold text-fg-muted"> ({Math.round((sel.reached / total) * 100)}%)</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        {lista.map((x) => {
                          const ativo = x.stage === sel.stage
                          const fora = excludedStages.includes(x.id)
                          return (
                            <div
                              key={x.stage}
                              className={`flex items-center gap-2 rounded-md px-1.5 py-0.5 ${ativo ? 'border border-accent bg-surface-2' : 'border border-transparent'} ${fora ? 'opacity-50' : ''}`}
                            >
                              <input
                                type="checkbox"
                                className="size-4 shrink-0 accent-accent"
                                checked={!fora}
                                title={fora ? t('Incluir no cálculo') : t('Remover do cálculo')}
                                aria-label={fora ? t('Incluir no cálculo') : t('Remover do cálculo')}
                                onChange={() => toggleStageExcluded(x.id)}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="min-w-0 flex-1 justify-start px-1"
                                title={`${x.current} ${t('cards agora')} · ${x.reached} ${t('neste estágio ou depois')}`}
                                onClick={() => setSelectedStage(x.stage)}
                              >
                                <span className="grid flex-1 grid-cols-[7rem_1fr_2rem] items-center gap-2">
                                  <span className={`truncate text-left text-xs ${ativo ? 'font-bold' : 'font-medium'} ${x.current ? 'text-fg' : 'text-fg-muted'}`}>{x.name}</span>
                                  <span className="relative flex h-1.5 w-full items-center overflow-hidden rounded-full bg-border/60">
                                    <span
                                      className={`block h-full rounded-full ${x.isDone ? 'bg-success' : 'bg-accent'}`}
                                      style={{ width: `${Math.max(6, Math.round((x.current / maxAtual) * 100))}%` }}
                                    />
                                  </span>
                                  <span className="text-right text-xs font-bold tabular-nums">{x.current}</span>
                                </span>
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* corte por módulo de quem já chegou até o estágio */}
                    <div>
                      <SectionTitle className="mb-2">
                        {tf('{stage} ou depois · {n} cards', { stage: sel.name, n: sel.reached })}
                      </SectionTitle>
                      {grupos.length === 0 ? (
                        <p className="text-xs text-fg-muted">{t('Nenhum card neste estágio ou depois.')}</p>
                      ) : (
                        <div className="space-y-1.5">
                          {grupos.map((g) => (
                            <div key={g.group}>
                              <div className="flex justify-between gap-2 text-xs">
                                <span>{g.label === 'sem-modulo' ? t('Sem módulo') : g.label}</span>
                                <span className="text-fg-muted">{g.total} · <b className="text-fg">{g.pct}%</b></span>
                              </div>
                              <Progress value={g.pct} size="sm" tone={g.group === 'sem-modulo' ? 'warning' : 'accent'} className="mt-0.5" label={g.label} />
                            </div>
                          ))}
                          <p className="pt-0.5 text-xs text-fg-muted">
                            {t('Cada card entra em um grupo só — a soma fecha em 100%.')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })()}

            {/* Módulos e submódulos — classificação explícita (módulo != sprint != tag) */}
            <Card padding="sm">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <SectionTitle>{t('Módulos e submódulos')}</SectionTitle>
                {dimensions && (
                  <span className="text-xs text-fg-muted">
                    {dimensions.modules.length} {t('módulos')}
                    {' · '}
                    {dimensions.with_module}/{dimensions.cards} {t('cards com módulo')}
                    {dimensions.unlabeled?.total > 0 && ` · ${dimensions.unlabeled.total} ${t('sem módulo')}`}
                    {dimensions.developmentColumn && ` · ${t('dev concluído')}: ${dimensions.developmentColumn} ${t('ou depois')}`}
                  </span>
                )}
                <span className="ml-auto flex flex-wrap gap-3 text-xs text-fg-muted">
                  <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-success" aria-hidden="true" /> {t('Concluído')}</span>
                  <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-warning" aria-hidden="true" /> {t('Em andamento')}</span>
                  <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-border-strong" aria-hidden="true" /> {t('Não iniciado')}</span>
                </span>
              </div>

              {!dimensions || dimensions.modules.length === 0 ? (
                <p className="text-xs text-fg-muted">{t('Nenhum módulo identificado nas labels.')}</p>
              ) : (
                <div className="space-y-2">
                  {dimensions.modules.map((mod) => {
                    const pctDev = mod.developedPct ?? mod.pct
                    const tone = pctDev === 100 ? 'success' : pctDev > 0 ? 'warning' : 'accent'
                    return (
                      <Card key={mod.name} padding="sm" variant="flat">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-bold">{mod.label} <span className="text-xs font-normal text-fg-muted">· {mod.total} {t('cards')}</span></span>
                          <span className="text-xs font-bold" title={t('Desenvolvimento concluído (Dev Box ou depois)')}>
                            {mod.developed ?? mod.done}/{mod.total} — {pctDev}%
                            {mod.done !== mod.developed && (
                              <span className="font-medium text-fg-muted"> · {mod.done} {t('aceitos')}</span>
                            )}
                          </span>
                        </div>
                        <Progress value={pctDev} size="sm" tone={tone} className={`mt-1 ${pctDev === 0 ? 'opacity-40' : ''}`} label={mod.label} />
                        {mod.submodules?.length > 0 && (
                          <div className="mt-2 space-y-1 border-l-2 border-border pl-2.5">
                            {mod.submodules.map((sub) => {
                              const pctS = sub.developedPct ?? sub.pct
                              return (
                                <div key={sub.name}>
                                  <div className="flex justify-between gap-2 text-xs">
                                    <span className="text-fg-muted">{sub.label} <span className="opacity-70">({sub.name})</span></span>
                                    <span className="font-semibold">{sub.developed ?? sub.done}/{sub.total} — {pctS}%</span>
                                  </div>
                                  <Progress value={pctS} size="sm" tone={pctS === 100 ? 'success' : pctS > 0 ? 'warning' : 'accent'} className={`mt-0.5 ${pctS === 0 ? 'opacity-40' : ''}`} label={sub.label} />
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              )}
            </Card>

            {/* Sprints, plataformas e natureza — dimensões separadas do módulo */}
            {dimensions && (dimensions.sprints.length > 0 || dimensions.platforms.length > 0 || dimensions.process.length > 0) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {dimensions.sprints.length > 0 && (
                  <Card padding="sm">
                    <SectionTitle className="mb-2">{t('Por sprint')}</SectionTitle>
                    <div className="space-y-1.5">
                      {dimensions.sprints.map((sp) => (
                        <div key={sp.name}>
                          <div className="flex justify-between gap-2 text-xs">
                            <span>{sp.label}</span>
                            <span className="text-fg-muted">{sp.done}/{sp.total} — {sp.pct}%</span>
                          </div>
                          <Progress value={sp.pct} size="sm" tone={sp.pct === 100 ? 'success' : 'accent'} className="mt-0.5" label={sp.label} />
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
                {dimensions.platforms.length > 0 && (
                  <Card padding="sm">
                    <SectionTitle className="mb-2">{t('Por plataforma')}</SectionTitle>
                    <div className="space-y-0.5 text-xs">
                      {dimensions.platforms.map((pl) => (
                        <div key={pl.name} className="flex justify-between gap-2">
                          <span>{pl.label}</span>
                          <span className="text-fg-muted">{pl.done}/{pl.total}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">{t('Não entra no progresso por módulo.')}</p>
                  </Card>
                )}
                {dimensions.process.length > 0 && (
                  <Card padding="sm">
                    <SectionTitle className="mb-2">{t('Por natureza')}</SectionTitle>
                    <div className="space-y-0.5 text-xs">
                      {dimensions.process.map((pr) => (
                        <div key={pr.name} className="flex justify-between gap-2">
                          <span>{pr.label}</span>
                          <span className="text-fg-muted">{pr.done}/{pr.total} — {pr.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'daily' && <ProjectDaily projectId={projectId} author={members[0]?.name || ''} />}

        {view === 'planning' && (
          <SprintPlanning
            projectId={projectId}
            onChanged={() => {
              load()
              loadSprints()
            }}
          />
        )}
      </Tabs>

      <Dialog
        open={showMembers}
        onOpenChange={setShowMembers}
        title={t('Responsáveis do projeto')}
        description={t('Quem aparece aqui pode ser atribuído aos cards e filtrado no board.')}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('Nome do responsável...')} className="min-w-48 flex-1">
              <Input
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateMember()}
              />
            </Field>
            <Button onClick={handleCreateMember}>{t('Adicionar')}</Button>
          </div>

          <div className="space-y-2">
            {members.length === 0 && <p className="text-sm text-fg-muted">{t('Nenhum responsável ainda. Adicione acima.')}</p>}
            {members.map((m) => {
              const stats = (() => {
                const q = tasksMetric.filter((tk) => tk.assignee === m.name)
                const tot = q.length
                const done = q.filter((tk) => doneColIds.has(tk.columnId)).length
                const developed = q.filter((tk) => devColIds.has(tk.columnId)).length
                const pct = tot ? Math.round(developed/tot*100) : 0
                const overdue = q.filter((tk) => tk.dueDate && new Date(tk.dueDate) < today0 && !devColIds.has(tk.columnId)).length
                return { tot, done, developed, pct, overdue }
              })()
              return (
                <Card key={m.id} padding="sm">
                  <div className="flex items-center gap-2">
                    <Avatar name={m.name} size="sm" />
                    <strong className="min-w-0 flex-1 truncate text-sm">{m.name}</strong>
                    <Button variant="danger" size="sm" onClick={() => handleDeleteMember(m.id)}>{t('Excluir')}</Button>
                  </div>
                  <Progress value={stats.pct} size="sm" className="mt-2" label={m.name} />
                  <p className="mt-1 text-xs text-fg-muted">{stats.tot} {t('tarefas')} · {stats.developed} {t('dev concluído')} · {stats.done} {t('aceitas')} {stats.overdue ? `· ${stats.overdue} ${t('vencida(s)')}` : ''} · {stats.pct}%</p>
                </Card>
              )
            })}
          </div>
        </div>
      </Dialog>

      {openCode && (
        <TaskDetail
          code={openCode}
          onClose={() => setOpenCode(null)}
          onChanged={() => {
            load()
            loadSprints()
          }}
        />
      )}
    </div>
  )
}
