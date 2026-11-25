import { useEffect, useMemo, useState } from 'react'
import {
  listRecordings, getRecording, updateRecording, deleteRecording,
  archiveRecording, recordingExportUrl, recordingAudioUrl,
  analyzeRecording, getWorkspaces, getProjects, transcribeRecording,
  startLiveRecording, stopLiveRecording,
} from '../api.js'
import { getActiveProjectId } from '../components/ProjectSelector.jsx'
import { t, tf } from '../i18n'
import Icon from '../components/Icon'
import {
  Badge, Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, Field, Input,
  PageHeader, SearchInput, SectionTitle, Select, Skeleton, Tabs, Textarea, Toolbar, useToast,
} from '../ui'

// Markdown mínimo (títulos, listas, negrito, código) — sem dependência nova.
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function mdToHtml(md) {
  const linhas = esc(md || '').split('\n')
  const out = []
  let lista = null
  const fechaLista = () => { if (lista) { out.push(`</${lista}>`); lista = null } }
  for (const bruta of linhas) {
    const linha = bruta.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>')
    if (!linha.trim()) { fechaLista(); continue }
    const h = linha.match(/^(#{1,4})\s+(.*)$/)
    if (h) { fechaLista(); out.push(`<h${h[1].length + 1}>${h[2]}</h${h[1].length + 1}>`); continue }
    const li = linha.match(/^\s*[-*]\s+(.*)$/)
    if (li) {
      if (lista !== 'ul') { fechaLista(); out.push('<ul>'); lista = 'ul' }
      out.push(`<li>${li[1]}</li>`)
      continue
    }
    const ol = linha.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ol) {
      if (lista !== 'ol') { fechaLista(); out.push('<ol>'); lista = 'ol' }
      out.push(`<li>${ol[1]}</li>`)
      continue
    }
    fechaLista()
    out.push(`<p>${linha}</p>`)
  }
  fechaLista()
  return out.join('\n')
}

const textoErro = (e) => {
  const d = e?.response?.data?.detail ?? e?.message ?? e
  if (typeof d === 'string') return d
  try { return JSON.stringify(d) } catch { return String(d) }
}

const linhas = (txt) => (txt || '').split('\n').map((s) => s.trim()).filter(Boolean)
const dt = (iso) => (iso ? new Date(iso).toLocaleString() : '—')
const dur = (s) => {
  const total = Math.round(s || 0)
  if (!total) return ''
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  return h ? `${h}h ${m}min` : m ? `${m}min ${sec}s` : `${sec}s`
}

const ERRO_CLASSE = 'rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger'

export default function Reunioes() {
  const [itens, setItens] = useState([])
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [arquivadas, setArquivadas] = useState('hide')
  const [sel, setSel] = useState(null)
  const [detalhe, setDetalhe] = useState(null)
  const [draft, setDraft] = useState(null)
  const [tab, setTab] = useState('resumo')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [preview, setPreview] = useState(false)
  const [projeto, setProjeto] = useState(null)
  const [analise, setAnalise] = useState(null)
  const [analisando, setAnalisando] = useState(false)
  const [gravando, setGravando] = useState(null)
  const [carregandoLista, setCarregandoLista] = useState(true)

  // diálogo de início (2 passos: contexto → projeto)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [etapa, setEtapa] = useState('contexto')
  const [projetos, setProjetos] = useState([])
  const [projetoSelecionado, setProjetoSelecionado] = useState('')
  const [carregandoProjetos, setCarregandoProjetos] = useState(false)
  const [iniciando, setIniciando] = useState(false)

  // diálogo de troca de contexto
  const [contextoAberto, setContextoAberto] = useState(false)
  const [contextoSelecionado, setContextoSelecionado] = useState('')
  const [carregandoContexto, setCarregandoContexto] = useState(false)
  const [salvandoContexto, setSalvandoContexto] = useState(false)

  // exclusão
  const [excluirAberto, setExcluirAberto] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const toast = useToast()

  const carregar = async () => {
    setCarregandoLista(true)
    try {
      const dados = await listRecordings({ kind: kind || undefined, archived: arquivadas, q: q || undefined })
      setItens(dados)
      setErro('')
      if (!sel && dados.length) abrir(dados[0].id)
    } catch (e) {
      setErro(textoErro(e))
    } finally {
      setCarregandoLista(false)
    }
  }

  const abrir = async (id) => {
    if (!id) return
    try {
      const d = await getRecording(id)
      setSel(id)
      setDetalhe(d)
      setDraft({
        title: d.title || '',
        topic: d.topic || '',
        tags: (d.tags || []).join(', '),
        transcript: d.transcript || '',
        markdown: d.markdown || '',
        plan: (d.sections?.plan || []).join('\n'),
        tips: (d.sections?.tips || []).join('\n'),
        decisions: (d.sections?.decisions || []).join('\n'),
        actions: (d.sections?.actionItems || []).map((a) => ({ ...a })),
        questions: (d.sections?.questions || []).map((x) => ({ ...x })),
      })
      setErro('')
    } catch (e) {
      setErro(textoErro(e))
    }
  }

  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind, arquivadas])

  useEffect(() => {
    ;(async () => {
      try {
        const d = await getWorkspaces()
        const pid = getActiveProjectId(d.active)
        if (pid) setProjeto({ id: Number(pid) })
      } catch { /* sem projeto ativo: analisa só a transcrição */ }
    })()
  }, [])

  // ---- iniciar reunião: pergunta o contexto antes de gravar ----
  const abrirDialogoGravacao = () => {
    setEtapa('contexto')
    setProjetos([])
    setProjetoSelecionado(projeto?.id ? String(projeto.id) : '')
    setDialogAberto(true)
  }

  const escolherProjeto = async () => {
    setEtapa('projeto')
    if (projetos.length) return
    setCarregandoProjetos(true)
    try {
      const lista = await getProjects()
      setProjetos(lista || [])
      if (lista?.length && projeto?.id && lista.some((p) => String(p.id) === String(projeto.id))) {
        setProjetoSelecionado(String(projeto.id))
      }
    } catch {
      setProjetos([])
    } finally {
      setCarregandoProjetos(false)
    }
  }

  const iniciarGravacao = async (projectId) => {
    setIniciando(true)
    setDialogAberto(false)
    try {
      const r = await startLiveRecording({ projectId, contextMode: projectId ? 'project' : 'workshop' })
      setGravando(r)
      toast?.({
        title: projectId
          ? tf('Gravando com contexto do projeto #{id}.', { id: projectId })
          : t('Gravando sem projeto (workshop): a análise não vai gerar tarefas.'),
        tone: 'success',
      })
    } catch (e) {
      setErro(textoErro(e))
    } finally {
      setIniciando(false)
    }
  }

  const pararReuniao = async () => {
    try {
      const r = await stopLiveRecording()
      setGravando(null)
      await carregar()
      toast?.({
        title: tf('Gravação salva ({s}s). Analise para extrair os pontos.', { s: r.durationSec ?? '?' }),
        tone: 'success',
      })
      if (r.recordingId) abrir(r.recordingId)
    } catch (e) {
      setErro(textoErro(e))
    }
  }

  const [transcrevendo, setTranscrevendo] = useState(false)

  const transcrever = async () => {
    if (!sel || transcrevendo) return
    setTranscrevendo(true)
    setErro('')
    try {
      const d = await transcribeRecording(sel, { append: false })
      await abrir(sel)
      toast?.({
        title: tf('Transcrição pronta ({n} trechos). Analise para gerar as dicas.', { n: d.segments?.length ?? 0 }),
        tone: 'success',
      })
    } catch (e) {
      setErro(textoErro(e))
    } finally {
      setTranscrevendo(false)
    }
  }

  const analisar = async () => {
    if (!sel) return
    setAnalisando(true)
    try {
      const d = await analyzeRecording(sel, projeto?.id ? { projectId: projeto.id } : {})
      setAnalise(d)
    } catch (e) {
      setErro(textoErro(e))
    } finally {
      setAnalisando(false)
    }
  }

  const salvarAnalise = async () => {
    if (!sel) return
    try {
      const d = await analyzeRecording(sel, { projectId: projeto?.id, save: true })
      setAnalise(d)
      await abrir(sel)
      toast?.({ title: t('Análise salva na reunião.'), tone: 'success' })
    } catch (e) {
      setErro(textoErro(e))
    }
  }

  const sujo = useMemo(() => {
    if (!detalhe || !draft) return false
    return (
      draft.title !== (detalhe.title || '') ||
      draft.topic !== (detalhe.topic || '') ||
      draft.tags !== (detalhe.tags || []).join(', ') ||
      draft.transcript !== (detalhe.transcript || '') ||
      draft.markdown !== (detalhe.markdown || '')
    )
  }, [draft, detalhe])

  const salvar = async () => {
    if (!sel || !draft) return
    setSalvando(true)
    try {
      const d = await updateRecording(sel, {
        title: draft.title,
        topic: draft.topic,
        tags: draft.tags.split(',').map((s) => s.trim()).filter(Boolean),
        transcript: draft.transcript,
        markdown: draft.markdown,
        liveState: {
          plan: linhas(draft.plan),
          tips: linhas(draft.tips),
          decisions: linhas(draft.decisions),
          action_items: draft.actions
            .filter((a) => (a.description || '').trim())
            .map((a) => ({ description: a.description.trim(), assignee: (a.assignee || '').trim() })),
          questions: draft.questions
            .filter((x) => (x.question || '').trim())
            .map((x) => ({ question: x.question.trim(), answer: (x.answer || '').trim(), resolved: !!x.resolved })),
        },
      })
      setDetalhe(d)
      toast?.({ title: t('Reunião salva.'), tone: 'success' })
      carregar()
    } catch (e) {
      setErro(textoErro(e))
    } finally {
      setSalvando(false)
    }
  }

  const arquivar = async (valor) => {
    if (!sel) return
    try {
      await archiveRecording(sel, valor)
      toast?.({ title: valor ? t('Reunião arquivada.') : t('Reunião desarquivada.'), tone: 'success' })
      await carregar()
      await abrir(sel)
    } catch (e) {
      setErro(textoErro(e))
    }
  }

  const excluir = async () => {
    if (!sel) return
    setExcluindo(true)
    setExcluirAberto(false)
    try {
      await deleteRecording(sel)
      setSel(null); setDetalhe(null); setDraft(null)
      toast?.({ title: t('Reunião excluída.'), tone: 'success' })
      carregar()
    } catch (e) {
      setErro(textoErro(e))
    } finally {
      setExcluindo(false)
    }
  }

  const exportar = (formato) => {
    if (!sel) return
    window.open(recordingExportUrl(sel, formato), '_blank')
  }

  const copiar = async () => {
    if (!sel) return
    try {
      const resp = await fetch(recordingExportUrl(sel, 'md'))
      const texto = await resp.text()
      await navigator.clipboard.writeText(texto)
      toast?.({ title: t('Markdown copiado.'), tone: 'success' })
    } catch {
      setErro(t('Não foi possível copiar.'))
    }
  }

  const abrirContexto = async () => {
    setContextoSelecionado(detalhe?.projectId ? String(detalhe.projectId) : '')
    setContextoAberto(true)
    if (projetos.length) return
    setCarregandoContexto(true)
    try {
      setProjetos((await getProjects()) || [])
    } catch {
      setProjetos([])
    } finally {
      setCarregandoContexto(false)
    }
  }

  const salvarContexto = async () => {
    if (!sel) return
    setSalvandoContexto(true)
    setContextoAberto(false)
    try {
      const novo = contextoSelecionado ? Number(contextoSelecionado) : null
      await updateRecording(sel, { projectId: novo })
      await abrir(sel)
      toast?.({
        title: novo
          ? tf('Contexto: projeto #{id}. Analise de novo para usar o board.', { id: novo })
          : t('Contexto removido: a análise agora não gera tarefas.'),
        tone: 'success',
      })
    } catch (e) {
      setErro(textoErro(e))
    } finally {
      setSalvandoContexto(false)
    }
  }

  const set = (campo, valor) => setDraft((d) => ({ ...d, [campo]: valor }))
  const setAcao = (i, campo, valor) => setDraft((d) => {
    const actions = d.actions.map((a, j) => (j === i ? { ...a, [campo]: valor } : a))
    return { ...d, actions }
  })
  const setPergunta = (i, campo, valor) => setDraft((d) => {
    const questions = d.questions.map((x, j) => (j === i ? { ...x, [campo]: valor } : x))
    return { ...d, questions }
  })

  const seletor = (
    <Toolbar
      actions={(
        <>
          <div className="w-full sm:w-72">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && carregar()}
              placeholder={t('Buscar por título, tópico ou transcrição...')}
              aria-label={t('Buscar por título, tópico ou transcrição...')}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              value={kind || 'all'}
              onValueChange={(v) => setKind(v === 'all' ? '' : v)}
              ariaLabel={t('Todos os tipos')}
              options={[
                { value: 'all', label: t('Todos os tipos') },
                { value: 'meeting', label: t('Reuniões') },
                { value: 'study', label: t('Estudos') },
              ]}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              value={arquivadas}
              onValueChange={setArquivadas}
              ariaLabel={t('Arquivadas')}
              options={[
                { value: 'hide', label: t('Sem arquivadas') },
                { value: 'only', label: t('Só arquivadas') },
                { value: 'all', label: t('Todas') },
              ]}
            />
          </div>
          <Button variant="secondary" onClick={carregar}>{t('Buscar')}</Button>
        </>
      )}
    >
      <span className="text-xs tabular-nums text-fg-muted">{tf('{n} reunião(ões)', { n: itens.length })}</span>
    </Toolbar>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Reuniões')}
        description={t('Grave, transcreva e analise reuniões — com ou sem um projeto como contexto.')}
        actions={gravando?.recording ? (
          <Button variant="danger" onClick={pararReuniao}>
            {t('Parar gravação')}
            {gravando.contextMode === 'project'
              ? ` · ${t('projeto')} #${gravando.projectId}`
              : ` · ${t('workshop')}`}
          </Button>
        ) : (
          <Button onClick={abrirDialogoGravacao}>
            <Icon name="mic" size={16} />
            {t('Iniciar reunião')}
          </Button>
        )}
      />

      {gravando?.recording && (
        <Card variant="flat" className="border-success/30 bg-success-soft">
          <div className="flex flex-wrap items-center gap-2 text-sm text-success">
            <Badge variant="success">{t('● Gravando')}</Badge>
            <span>{gravando.mic || '?'} + {gravando.monitor || '?'}</span>
            <span aria-hidden="true">·</span>
            <span>
              {gravando.contextMode === 'project'
                ? tf('contexto do projeto #{id}', { id: gravando.projectId })
                : t('sem projeto (workshop): não gera tarefas')}
            </span>
          </div>
        </Card>
      )}

      {erro && <div role="alert" className={ERRO_CLASSE}>{erro}</div>}

      {seletor}

      <div className="grid gap-4 lg:grid-cols-4 lg:items-start">
        <Card padding="sm" className="lg:col-span-1">
          {carregandoLista ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} h="h-14" />)}
            </div>
          ) : itens.length === 0 ? (
            <EmptyState
              icon={<Icon name="mic" size={20} />}
              title={t('Nenhuma reunião encontrada.')}
            />
          ) : (
            <div className="max-h-[72vh] space-y-1 overflow-y-auto">
              {itens.map((r) => {
                const ativo = r.id === sel
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => abrir(r.id)}
                    aria-current={ativo ? 'true' : undefined}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      ativo ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-surface-2'
                    }`}
                  >
                    <span className="block text-xs tabular-nums text-fg-muted">{dt(r.createdAt)}</span>
                    <span className="block truncate text-sm font-semibold text-fg">
                      {r.title || r.topic || t('(sem título)')}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {r.kind === 'study' && <Badge variant="accent">{t('Estudo')}</Badge>}
                      {r.hasSummary && <Badge>{t('resumo')}</Badge>}
                      {r.hasTranscript && <Badge>{t('transcrição')}</Badge>}
                      {r.hasAudio && <Badge>{t('áudio')}</Badge>}
                      {r.archivedAt && <Badge variant="warning">{t('arquivada')}</Badge>}
                      {!!r.duration && (
                        <span className="text-xs tabular-nums text-fg-muted">{dur(r.duration)}</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <Card padding="lg" className="lg:col-span-3">
          {!detalhe || !draft ? (
            <EmptyState
              icon={<Icon name="mic" size={20} />}
              title={t('Selecione uma reunião na lista.')}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label={t('Título da reunião')} className="min-w-0 flex-1">
                  <Input
                    value={draft.title}
                    onChange={(e) => set('title', e.target.value)}
                    placeholder={t('Título da reunião')}
                  />
                </Field>
                <div className="flex shrink-0 items-center gap-2">
                  {sujo && <Badge variant="warning">{t('não salvo')}</Badge>}
                  <Button onClick={salvar} loading={salvando}>
                    {salvando ? t('Salvando...') : t('Salvar')}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('Tópico')}>
                  <Input
                    value={draft.topic}
                    onChange={(e) => set('topic', e.target.value)}
                    placeholder={t('Tópico')}
                  />
                </Field>
                <Field label={t('Tags')} hint={t('tags separadas por vírgula')}>
                  <Input
                    value={draft.tags}
                    onChange={(e) => set('tags', e.target.value)}
                    placeholder={t('tags separadas por vírgula')}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <span>{dt(detalhe.createdAt)}</span>
                {detalhe.duration ? <span>· {dur(detalhe.duration)}</span> : null}
                {detalhe.language ? <span>· {detalhe.language}</span> : null}
                {detalhe.archivedAt && <Badge variant="warning">{t('arquivada')}</Badge>}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Button variant="ghost" size="sm" onClick={() => exportar('md')}>Markdown</Button>
                <Button variant="ghost" size="sm" onClick={() => exportar('txt')}>TXT</Button>
                <Button variant="ghost" size="sm" onClick={() => exportar('json')}>JSON</Button>
                <Button variant="ghost" size="sm" onClick={copiar}>{t('Copiar markdown')}</Button>
                <span className="flex-1" />
                {!detalhe.archivedAt
                  ? <Button variant="ghost" size="sm" onClick={() => arquivar(true)}>{t('Arquivar')}</Button>
                  : <Button variant="ghost" size="sm" onClick={() => arquivar(false)}>{t('Desarquivar')}</Button>}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => setExcluirAberto(true)}
                >
                  {t('Excluir')}
                </Button>
              </div>

              {/* análise com o contexto do projeto (board, atrasos, dailies) */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={transcrever}
                  loading={transcrevendo}
                  disabled={transcrevendo || !detalhe?.hasAudio}
                  title={detalhe?.hasAudio
                    ? t('Transcreve o áudio com o Whisper local (offline)')
                    : t('Esta reunião não tem áudio')}
                >
                  <Icon name="mic" size={14} />
                  {transcrevendo ? t('Transcrevendo...') : t('Transcrever')}
                </Button>
                <Button variant="secondary" size="sm" onClick={analisar} loading={analisando}>
                  <Icon name="sparkles" size={14} />
                  {analisando ? t('Analisando...') : t('Analisar reunião')}
                </Button>
                <Badge variant={detalhe?.projectId ? 'accent' : 'warning'}>
                  {detalhe?.projectId
                    ? tf('contexto: projeto #{id}', { id: detalhe.projectId })
                    : t('workshop · sem projeto')}
                </Badge>
                <Button variant="ghost" size="sm" onClick={abrirContexto}>{t('Trocar contexto')}</Button>
              </div>
              <p className="text-xs text-fg-muted">
                {detalhe?.projectId
                  ? t('Usa o board, atrasos e dailies do projeto escolhido na gravação.')
                  : t('Sem projeto: a análise traz aprendizado e sugestões, sem gerar tarefas.')}
              </p>

              {analise && (
                <Card variant="flat" className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                      <Icon name={analise.engine === 'llm' ? 'sparkles' : 'brain'} size={14} />
                      <span>
                        {analise.engine === 'llm' ? t('Análise por IA') : t('Análise pelo contexto (sem IA)')}
                        {analise.usedProjectContext ? ` · ${t('com projeto')}` : ` · ${t('só transcrição')}`}
                      </span>
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={salvarAnalise}>{t('Salvar na reunião')}</Button>
                      <Button variant="ghost" size="sm" onClick={() => setAnalise(null)}>{t('Fechar')}</Button>
                    </div>
                  </div>

                  {[
                    ['tips', t('Dicas')],
                    ['plan', t('Plano')],
                    ['decisions', t('Decisões')],
                  ].map(([campo, rotulo]) => (
                    (analise[campo] || []).length > 0 && (
                      <div key={campo} className="space-y-1">
                        <SectionTitle>{rotulo}</SectionTitle>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-fg">
                          {analise[campo].map((item, i) => <li key={i}>{item}</li>)}
                        </ul>
                      </div>
                    )
                  ))}

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={analise.mode === 'workshop' || analise.usedProjectContext === false ? 'warning' : 'accent'}>
                      {analise.mode === 'workshop' || analise.usedProjectContext === false
                        ? t('workshop · sem projeto')
                        : tf('contexto: projeto #{id}', { id: analise.projectId })}
                    </Badge>
                    {analise.mode === 'workshop' && (
                      <span className="text-xs text-fg-muted">
                        {t('Workshop: a análise traz aprendizado e sugestões, sem tarefas.')}
                      </span>
                    )}
                  </div>

                  {(analise.actionItems || []).length > 0 && (
                    <div className="space-y-1">
                      <SectionTitle>{t('Ações')}</SectionTitle>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-fg">
                        {analise.actionItems.map((a, i) => (
                          <li key={i}>{a.description}{a.assignee ? ` — ${a.assignee}` : ''}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analise.engine === 'heuristic' && (
                    <p className="text-xs text-fg-muted">
                      {t('Sem provedor de IA ativo: as dicas vêm só de fatos do board e das dailies.')}
                    </p>
                  )}
                </Card>
              )}

              <Tabs
                tabs={[
                  { value: 'resumo', label: t('Resumo') },
                  { value: 'transcricao', label: t('Transcrição') },
                  { value: 'secoes', label: t('Seções') },
                  ...(detalhe.hasAudio ? [{ value: 'audio', label: t('Áudio') }] : []),
                ]}
                value={tab}
                onValueChange={setTab}
              />

              {tab === 'resumo' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setPreview((v) => !v)}>
                      {preview ? t('Editar') : t('Pré-visualizar')}
                    </Button>
                    <span className="text-xs text-fg-muted">
                      {t('O resumo é o markdown que vai no PDF/exportação.')}
                    </span>
                  </div>
                  {preview ? (
                    <Card
                      variant="flat"
                      className="max-h-[48vh] overflow-y-auto text-sm text-fg [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-md [&_h3]:font-semibold [&_h4]:text-base [&_h4]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_code]:rounded-sm [&_code]:bg-surface-2 [&_code]:px-1"
                      dangerouslySetInnerHTML={{ __html: mdToHtml(draft.markdown || detalhe.markdown) }}
                    />
                  ) : (
                    <Textarea
                      value={draft.markdown}
                      onChange={(e) => set('markdown', e.target.value)}
                      placeholder={t('Resumo em markdown (vazio = monta a partir das seções + transcrição na exportação)')}
                      className="min-h-96 font-mono"
                    />
                  )}
                </div>
              )}

              {tab === 'transcricao' && (
                <div className="space-y-2">
                  <p className="text-xs text-fg-muted">
                    {t('Transcrição completa. Editar aqui corrige erros do reconhecimento.')}
                  </p>
                  <Textarea
                    value={draft.transcript}
                    onChange={(e) => set('transcript', e.target.value)}
                    className="min-h-96"
                  />
                </div>
              )}

              {tab === 'secoes' && (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-3">
                    {[['plan', t('Plano')], ['tips', t('Dicas')], ['decisions', t('Decisões')]].map(([campo, rotulo]) => (
                      <Field key={campo} label={rotulo} hint={t('um item por linha')}>
                        <Textarea
                          value={draft[campo]}
                          onChange={(e) => set(campo, e.target.value)}
                          placeholder={t('um item por linha')}
                          rows={3}
                        />
                      </Field>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <SectionTitle>{t('Ações')}</SectionTitle>
                    {draft.actions.map((a, i) => (
                      <div key={i} className="grid gap-2 sm:grid-cols-6">
                        <div className="sm:col-span-3">
                          <Input
                            value={a.description}
                            onChange={(e) => setAcao(i, 'description', e.target.value)}
                            placeholder={t('O que fazer')}
                            aria-label={t('O que fazer')}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Input
                            value={a.assignee}
                            onChange={(e) => setAcao(i, 'assignee', e.target.value)}
                            placeholder={t('Responsável')}
                            aria-label={t('Responsável')}
                          />
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          iconOnly
                          aria-label={t('Remover')}
                          title={t('Remover')}
                          onClick={() => setDraft((d) => ({ ...d, actions: d.actions.filter((_, j) => j !== i) }))}
                        >
                          <Icon name="close" size={14} />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDraft((d) => ({ ...d, actions: [...d.actions, { description: '', assignee: '' }] }))}
                    >
                      + {t('Ação')}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <SectionTitle>{t('Perguntas')}</SectionTitle>
                    {draft.questions.map((x, i) => (
                      <Card key={i} variant="flat" padding="sm" className="space-y-2">
                        <div className="flex flex-wrap items-end gap-2">
                          <Field label={t('Pergunta')} className="min-w-0 flex-1">
                            <Input
                              value={x.question}
                              onChange={(e) => setPergunta(i, 'question', e.target.value)}
                              placeholder={t('Pergunta')}
                            />
                          </Field>
                          <div className="pb-1">
                            <Checkbox
                              label={t('resolvida')}
                              checked={!!x.resolved}
                              onCheckedChange={(v) => setPergunta(i, 'resolved', v === true)}
                            />
                          </div>
                          <Button
                            variant="danger"
                            size="sm"
                            iconOnly
                            aria-label={t('Remover')}
                            title={t('Remover')}
                            onClick={() => setDraft((d) => ({ ...d, questions: d.questions.filter((_, j) => j !== i) }))}
                          >
                            <Icon name="close" size={14} />
                          </Button>
                        </div>
                        <Field label={t('Resposta')}>
                          <Input
                            value={x.answer}
                            onChange={(e) => setPergunta(i, 'answer', e.target.value)}
                            placeholder={t('Resposta')}
                          />
                        </Field>
                      </Card>
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDraft((d) => ({ ...d, questions: [...d.questions, { question: '', answer: '', resolved: false }] }))}
                    >
                      + {t('Pergunta')}
                    </Button>
                  </div>
                </div>
              )}

              {tab === 'audio' && detalhe.hasAudio && (
                <div className="space-y-2">
                  <audio
                    controls
                    className="w-full"
                    src={recordingAudioUrl(sel)}
                    aria-label={t('Áudio original da gravação.')}
                  />
                  <p className="text-xs text-fg-muted">{t('Áudio original da gravação.')}</p>
                </div>
              )}

              {sujo && (
                <div className="sticky bottom-0 z-10 flex justify-end border-t border-border bg-bg pt-3">
                  <Button onClick={salvar} loading={salvando}>
                    {salvando ? t('Salvando...') : t('Salvar alterações')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <Dialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        title={etapa === 'contexto' ? t('Adicionar um projeto como contexto?') : t('Projeto-alvo da reunião')}
        footer={etapa === 'contexto' ? (
          <>
            <Button variant="ghost" onClick={() => setDialogAberto(false)}>{t('Cancelar')}</Button>
            <Button variant="secondary" onClick={() => iniciarGravacao(null)} loading={iniciando}>
              {t('Não, é workshop')}
            </Button>
            <Button onClick={escolherProjeto}>{t('Sim, escolher projeto')}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setDialogAberto(false)}>{t('Cancelar')}</Button>
            <Button
              onClick={() => iniciarGravacao(Number(projetoSelecionado))}
              loading={iniciando}
              disabled={!projetoSelecionado || carregandoProjetos}
            >
              {t('Iniciar gravação')}
            </Button>
          </>
        )}
      >
        {etapa === 'contexto' ? (
          <p
            className="text-sm text-fg-muted"
            dangerouslySetInnerHTML={{
              __html: t('O contexto do projeto (board, atrasos, dailies) deixa a análise mais concreta. Para workshop, kickoff ou aula, escolha <b>sem projeto</b> — aí a análise vira aprendizado e sugestões, sem gerar tarefas.'),
            }}
          />
        ) : carregandoProjetos ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton h="h-4" w="w-24" />
            <Skeleton h="h-10" />
          </div>
        ) : projetos.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-fg">{t('Nenhum projeto')}</p>
            <p className="text-sm text-fg-muted">{t('Crie um projeto ou escolha "sem projeto".')}</p>
            <Button variant="secondary" onClick={() => iniciarGravacao(null)} loading={iniciando}>
              {t('Não, é workshop')}
            </Button>
          </div>
        ) : (
          <Field label={t('Projeto')}>
            <Select
              value={projetoSelecionado}
              onValueChange={setProjetoSelecionado}
              options={projetos.map((pj) => ({ value: String(pj.id), label: `${pj.key} · ${pj.name}` }))}
              placeholder={t('Projeto')}
            />
          </Field>
        )}
      </Dialog>

      <Dialog
        open={contextoAberto}
        onOpenChange={setContextoAberto}
        title={t('Contexto da reunião')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setContextoAberto(false)} disabled={salvandoContexto}>
              {t('Cancelar')}
            </Button>
            <Button onClick={salvarContexto} loading={salvandoContexto}>{t('Salvar')}</Button>
          </>
        )}
      >
        {carregandoContexto ? (
          <Skeleton h="h-10" />
        ) : (
          <Field label={t('Projeto')}>
            <Select
              value={contextoSelecionado || 'workshop'}
              onValueChange={(v) => setContextoSelecionado(v === 'workshop' ? '' : v)}
              options={[
                { value: 'workshop', label: t('Sem projeto (workshop)') },
                ...projetos.map((pj) => ({ value: String(pj.id), label: `${pj.key} · ${pj.name}` })),
              ]}
            />
          </Field>
        )}
      </Dialog>

      <ConfirmDialog
        open={excluirAberto}
        onOpenChange={setExcluirAberto}
        title={t('Excluir reunião?')}
        description={detalhe?.title || ''}
        confirmLabel={t('Excluir')}
        cancelLabel={t('Cancelar')}
        tone="danger"
        loading={excluindo}
        onConfirm={excluir}
      />
    </div>
  )
}
