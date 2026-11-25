import { useEffect, useRef, useState } from 'react'
import {
  getStudyPlans,
  createStudyPlan,
  createStudyPlanWithFiles,
  updateStudyPlan,
  getTopics,
  addTopic,
  updateTopic,
  studyAssistant,
  getStudyDocs,
  saveStudyDoc,
} from '../api'
import { t } from '../i18n'
import Icon from '../components/Icon'
import {
  Button, Card, Chip, DataTable, EmptyState, Field, Input, PageHeader, Progress, SectionTitle,
  Select, Spinner, Textarea, Toolbar,
} from '../ui'

const TEXT_ACTIONS = ['explain', 'exercises', 'quiz', 'flashcards']
const TOPIC_REQUIRED = [...TEXT_ACTIONS, 'diagnose']

const CATEGORIES = ['LINGUAGEM', 'FRAMEWORK', 'CERTIFICACAO', 'CONCEITO', 'CURSO', 'LIVRO']
const STATUSES = ['PENDENTE', 'ESTUDANDO', 'REVISAO', 'CONCLUIDO', 'PULADO']

// Rótulos-fonte em PT; t() é aplicado no uso (no render, após o idioma carregar).
const CATEGORY_LABELS = {
  LINGUAGEM: 'Linguagem',
  FRAMEWORK: 'Framework',
  CERTIFICACAO: 'Certificação',
  CONCEITO: 'Conceito',
  CURSO: 'Curso',
  LIVRO: 'Livro',
}
const STATUS_LABELS = {
  PENDENTE: 'Pendente',
  ESTUDANDO: 'Estudando',
  REVISAO: 'Revisão',
  CONCLUIDO: 'Concluído',
  PULADO: 'Pulado',
}

const categoryLabel = (c) => t(CATEGORY_LABELS[c] || c)
const statusLabel = (s) => t(STATUS_LABELS[s] || s)

export default function Estudos() {
  const [plans, setPlans] = useState([])
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [vaultNew, setVaultNew] = useState('')
  const [error, setError] = useState('')

  const [expandedId, setExpandedId] = useState(null)
  const [topics, setTopics] = useState([])
  const [topicTitle, setTopicTitle] = useState('')

  // Anexos (ebooks/documentos) usados como contexto na criação do plano
  const fileRef = useRef(null)
  const [attachedFiles, setAttachedFiles] = useState([])
  const [creating, setCreating] = useState(false)
  const [addingTopic, setAddingTopic] = useState(false)

  // Assistente de estudo (aplica-se ao plano expandido)
  const [assistTopic, setAssistTopic] = useState('')
  const [assistBusy, setAssistBusy] = useState(false)
  const [assistOutput, setAssistOutput] = useState('')
  const [assistSuggested, setAssistSuggested] = useState([])
  const [assistAsk, setAssistAsk] = useState('')

  // Fluxo de roadmap (agente pergunta → usuário complementa → gera tópicos)
  const [roadmapQuestions, setRoadmapQuestions] = useState(null) // null | string[]
  const [roadmapAnswers, setRoadmapAnswers] = useState({})
  const [roadmapExtra, setRoadmapExtra] = useState('')

  // Vault de docs do plano (pasta vinculada) + salvar geração no vault
  const [vaultPath, setVaultPath] = useState('')
  const [vaultSaving, setVaultSaving] = useState(false)
  const [planDocs, setPlanDocs] = useState([])
  const [savingDoc, setSavingDoc] = useState(false)
  const [savedDoc, setSavedDoc] = useState('')
  const [suggestedKind, setSuggestedKind] = useState('topics') // topics | prereqs

  const load = () =>
    getStudyPlans()
      .then(setPlans)
      .catch((e) => setError(String(e.message || e)))

  useEffect(() => {
    load()
  }, [])

  const loadTopics = (planId) =>
    getTopics(planId)
      .then(setTopics)
      .catch((e) => setError(e.response?.data?.detail || String(e.message || e)))

  const onPickFiles = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) setAttachedFiles((prev) => [...prev, ...files])
  }

  const removeAttached = (idx) => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))

  const onCreatePlan = async () => {
    if (!title.trim() || creating) return
    setCreating(true)
    setError('')
    try {
      let plan
      if (attachedFiles.length) {
        // Cria usando os campos + os arquivos anexados como contexto (IA gera os tópicos)
        plan = await createStudyPlanWithFiles({
          title: title.trim(),
          category,
          description: description.trim(),
          files: attachedFiles,
        })
        // vault vincula na sequência (with-files não recebe docsPath)
        if (vaultNew.trim()) {
          plan = await updateStudyPlan(plan.id, { docsPath: vaultNew.trim() })
        }
      } else {
        plan = await createStudyPlan({ title: title.trim(), category, description: description.trim() || null, docsPath: vaultNew.trim() || null })
      }
      setTitle('')
      setCategory(CATEGORIES[0])
      setDescription('')
      setVaultNew('')
      setAttachedFiles([])
      await load()
      if (plan?.id) {
        setExpandedId(plan.id)
        loadTopics(plan.id)
      }
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    } finally {
      setCreating(false)
    }
  }

  const resetAssist = () => {
    setAssistTopic('')
    setAssistOutput('')
    setAssistSuggested([])
    setAssistAsk('')
    setAssistBusy(false)
    setRoadmapQuestions(null)
    setRoadmapAnswers({})
    setRoadmapExtra('')
    setSavedDoc('')
    setSuggestedKind('topics')
  }

  const loadDocs = (plan) => {
    if (!plan?.docsPath) { setPlanDocs([]); return }
    getStudyDocs(plan.id)
      .then((d) => setPlanDocs(d.docs || []))
      .catch(() => setPlanDocs([]))
  }

  const saveVaultPath = async (plan) => {
    if (vaultSaving) return
    setVaultSaving(true)
    setError('')
    try {
      const updated = await updateStudyPlan(plan.id, { docsPath: vaultPath.trim() || null })
      setPlans((prev) => prev.map((x) => (x.id === plan.id ? { ...x, docsPath: updated.docsPath } : x)))
      loadDocs({ ...plan, docsPath: updated.docsPath })
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    } finally {
      setVaultSaving(false)
    }
  }

  const onToggle = (planId) => {
    resetAssist()
    if (expandedId === planId) {
      setExpandedId(null)
      setTopics([])
      setPlanDocs([])
      return
    }
    setExpandedId(planId)
    setTopics([])
    const plan = plans.find((x) => x.id === planId)
    setVaultPath(plan?.docsPath || '')
    loadTopics(planId)
    if (plan) loadDocs(plan)
  }

  const runAssist = async (action, plan) => {
    if (assistBusy) return
    if (TOPIC_REQUIRED.includes(action) && !assistTopic) {
      setAssistOutput(t('Selecione um tópico específico para esta ação.'))
      return
    }
    if (action === 'ask' && !assistAsk.trim()) return
    setAssistBusy(true)
    setAssistSuggested([])
    setAssistOutput('')
    setSavedDoc('')
    try {
      const { result } = await studyAssistant({
        action,
        topic: assistTopic,
        plan: plan.title,
        question: assistAsk.trim(),
        existing: topics.map((tp) => tp.title),
      })
      if (action === 'suggest_topics') {
        setAssistSuggested(result || [])
        setSuggestedKind('topics')
      } else if (action === 'diagnose' && result && typeof result === 'object') {
        setAssistOutput(result.markdown || '')
        setAssistSuggested((result.prerequisites || []).map((x) => ({
          title: x.title, estimate_hours: x.estimate_hours ?? null,
        })))
        setSuggestedKind('prereqs')
      } else setAssistOutput(result || '')
    } catch (e) {
      setAssistOutput(e.response?.data?.detail || String(e.message || e))
    } finally {
      setAssistBusy(false)
    }
  }

  // Passo 1 do roadmap: a IA gera perguntas para o usuário complementar o contexto
  const startRoadmap = async (plan) => {
    if (assistBusy) return
    setAssistBusy(true)
    setAssistSuggested([])
    setAssistOutput('')
    setRoadmapQuestions(null)
    setRoadmapAnswers({})
    setRoadmapExtra('')
    try {
      const { result } = await studyAssistant({
        action: 'roadmap_questions',
        plan: plan.title,
        existing: topics.map((tp) => tp.title),
      })
      setRoadmapQuestions(Array.isArray(result) ? result : [])
    } catch (e) {
      setAssistOutput(e.response?.data?.detail || String(e.message || e))
    } finally {
      setAssistBusy(false)
    }
  }

  const cancelRoadmap = () => {
    setRoadmapQuestions(null)
    setRoadmapAnswers({})
    setRoadmapExtra('')
  }

  // Passo 2: gera os tópicos usando as respostas como contexto
  const generateRoadmap = async (plan) => {
    if (assistBusy) return
    const parts = (roadmapQuestions || [])
      .map((q, i) => (roadmapAnswers[i] || '').trim() && `${q}\n> ${roadmapAnswers[i].trim()}`)
      .filter(Boolean)
    if (roadmapExtra.trim()) parts.push(`Outras informações:\n> ${roadmapExtra.trim()}`)
    const context = parts.join('\n\n')
    setAssistBusy(true)
    setAssistSuggested([])
    try {
      const { result } = await studyAssistant({
        action: 'suggest_topics',
        plan: plan.title,
        existing: topics.map((tp) => tp.title),
        context,
      })
      setAssistSuggested(result || [])
      cancelRoadmap()
    } catch (e) {
      setAssistOutput(e.response?.data?.detail || String(e.message || e))
    } finally {
      setAssistBusy(false)
    }
  }

  const addSuggested = async (plan) => {
    const have = new Set(topics.map((tp) => (tp.title || '').trim().toLowerCase()))
    let added = 0
    for (const tp of assistSuggested) {
      const title = (tp.title || '').trim()
      if (!title || have.has(title.toLowerCase())) continue
      try {
        await addTopic(plan.id, { title, weight: 1, estimateHours: tp.estimate_hours || null })
        have.add(title.toLowerCase())
        added += 1
      } catch {
        /* segue com os demais */
      }
    }
    setAssistSuggested([])
    setAssistOutput(t('{n} tópico(s) adicionado(s) ao plano.').replace('{n}', added))
    loadTopics(plan.id)
    load()
  }

  const saveOutputDoc = async (plan, actionLabel) => {
    if (savingDoc || !assistOutput.trim()) return
    if (!plan.docsPath) {
      setAssistOutput((assistOutput ? assistOutput + '\n\n' : '') + t('Vincule o vault do plano para salvar (campo acima).'))
      return
    }
    setSavingDoc(true)
    try {
      const r = await saveStudyDoc(plan.id, {
        title: `${actionLabel} - ${assistTopic || plan.title}`,
        content: assistOutput,
      })
      setSavedDoc(r.file || '')
      loadDocs({ ...plan })
    } catch (e) {
      setSavedDoc('')
      setAssistOutput((assistOutput ? assistOutput + '\n\n' : '') + (e.response?.data?.detail || String(e.message || e)))
    } finally {
      setSavingDoc(false)
    }
  }

  const onAddTopic = async (planId) => {
    if (!topicTitle.trim() || addingTopic) return
    setAddingTopic(true)
    try {
      await addTopic(planId, { title: topicTitle.trim(), weight: 1 })
      setTopicTitle('')
      setError('')
      loadTopics(planId)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    } finally {
      setAddingTopic(false)
    }
  }

  const onChangeStatus = async (topicId, status, planId) => {
    try {
      await updateTopic(topicId, { status })
      setError('')
      loadTopics(planId)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  // Opções montadas no render para o t() refletir o idioma já carregado.
  const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))
  const statusOptions = STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Estudos')}
        description={t('Planos de estudo e acompanhamento de tópicos.')}
      />

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <Card>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label={t('Título do plano')}>
            <Input
              placeholder={t('Título do plano')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label={t('Categoria')}>
            <Select
              value={category}
              onValueChange={setCategory}
              options={categoryOptions}
              ariaLabel={t('Categoria')}
            />
          </Field>
          <Field label={t('Descrição (opcional)')}>
            <Input
              placeholder={t('Descrição (opcional)')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label={t('Vault dos docs (pasta, opcional)')} hint={t('Pasta onde os docs gerados pelo assistente serão salvos')}>
            <Input
              placeholder={t('Vault dos docs (pasta, opcional)')}
              title={t('Pasta onde os docs gerados pelo assistente serão salvos')}
              value={vaultNew}
              onChange={(e) => setVaultNew(e.target.value)}
            />
          </Field>
        </div>

        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.pdf,.docx,.epub"
          className="hidden"
          onChange={onPickFiles}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Icon name="plus" size={14} /> {t('📎 Anexar arquivos').replace('📎 ', '')}
          </Button>
          <Button onClick={onCreatePlan} loading={creating} disabled={creating}>
            {creating ? t('Criando...') : t('+ Criar plano')}
          </Button>
        </div>

        {attachedFiles.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <span>{t('Anexos (usados como contexto):')}</span>
            {attachedFiles.map((f, i) => (
              <Chip key={i}>
                {f.name}
                <button
                  type="button"
                  aria-label={`${t('Excluir')} ${f.name}`}
                  onClick={() => removeAttached(i)}
                  className="ml-1 inline-flex items-center rounded-full text-fg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                >
                  <Icon name="close" size={12} />
                </button>
              </Chip>
            ))}
          </div>
        )}

        {creating && attachedFiles.length > 0 && (
          <p className="mt-3 text-sm text-fg-muted">
            {t('Lendo os arquivos e montando os tópicos com IA — pode levar alguns segundos.')}
          </p>
        )}
      </Card>

      {plans.map((p) => {
        const expanded = expandedId === p.id
        return (
          <Card key={p.id} padding="none">
            <div className="space-y-3 p-4">
              <button
                type="button"
                onClick={() => onToggle(p.id)}
                aria-expanded={expanded}
                className="flex w-full flex-wrap items-start justify-between gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                <span className="min-w-0">
                  <span className="break-words text-md font-semibold text-fg">{p.title}</span>
                  <span className="break-words text-sm text-fg-muted"> · {t(CATEGORY_LABELS[p.category] || p.category)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums text-fg-muted">{p.doneTopics}/{p.totalTopics}</span>
                  <Icon
                    name="chevronLeft"
                    size={16}
                    className={`text-fg-subtle transition-transform ${expanded ? '-rotate-90' : 'rotate-180'}`}
                  />
                </span>
              </button>

              <Progress value={p.progress} label={p.title} />
              <div className="text-xs text-fg-muted">
                {p.progress}% · {t(STATUS_LABELS[p.status] || p.status)}
              </div>
            </div>

            {expanded && (
              <div className="space-y-4 border-t border-border p-4">
                <DataTable
                  dense
                  columns={[
                    { key: 'title', header: t('Tópico') },
                    {
                      key: 'status',
                      header: t('Status'),
                      render: (tp) => (
                        <Select
                          size="sm"
                          value={tp.status}
                          onValueChange={(v) => onChangeStatus(tp.id, v, p.id)}
                          options={statusOptions}
                          ariaLabel={`${t('Status')} ${tp.title}`}
                        />
                      ),
                    },
                    {
                      key: 'hours',
                      header: t('Horas'),
                      align: 'right',
                      render: (tp) => (
                        <span className="whitespace-nowrap text-xs tabular-nums text-fg-muted">
                          {tp.loggedHours}h / {tp.estimateHours}h
                        </span>
                      ),
                    },
                  ]}
                  rows={topics}
                  rowKey={(tp) => tp.id}
                  empty={t('Nenhum tópico ainda.')}
                />

                <Toolbar
                  actions={(
                    <Button variant="secondary" onClick={() => onAddTopic(p.id)} loading={addingTopic} disabled={addingTopic}>
                      {t('+ Adicionar tópico')}
                    </Button>
                  )}
                >
                  <Input
                    className="w-full sm:w-64"
                    placeholder={t('Novo tópico')}
                    aria-label={t('Novo tópico')}
                    value={topicTitle}
                    onChange={(e) => setTopicTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onAddTopic(p.id)}
                  />
                </Toolbar>

                {/* Assistente de estudo (sob demanda) */}
                <div className="space-y-3 border-t border-border pt-4">
                  <div>
                    <SectionTitle>{t('Assistente de estudo')}</SectionTitle>
                    <p className="mt-1 text-sm text-fg-muted">
                      {t('Escolha um tópico e clique numa ação. A IA gera sob demanda.')}
                    </p>
                  </div>

                  <Toolbar>
                    <Select
                      className="w-full sm:w-56"
                      value={assistTopic || '__all__'}
                      onValueChange={(v) => setAssistTopic(v === '__all__' ? '' : v)}
                      ariaLabel={t('Tópico')}
                      options={[
                        { value: '__all__', label: t('— Plano inteiro —') },
                        ...Array.from(new Set(topics.map((tp) => tp.title).filter(Boolean)))
                          .map((title) => ({ value: title, label: title })),
                      ]}
                    />
                    <Button size="sm" disabled={assistBusy} onClick={() => runAssist('explain', p)}>
                      {t('Explicar')}
                    </Button>
                    <Button size="sm" disabled={assistBusy} onClick={() => runAssist('exercises', p)}>
                      {t('Exercícios')}
                    </Button>
                    <Button size="sm" disabled={assistBusy} onClick={() => runAssist('quiz', p)}>
                      {t('Quiz')}
                    </Button>
                    <Button size="sm" disabled={assistBusy} onClick={() => runAssist('flashcards', p)}>
                      {t('Flashcards')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={assistBusy}
                      onClick={() => runAssist('diagnose', p)}
                      title={t('Travou? Descobre qual pré-requisito está faltando e monta a base.')}
                    >
                      <Icon name="target" size={14} />
                      {t('🧭 Diagnosticar base').replace('🧭 ', '')}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={assistBusy} onClick={() => startRoadmap(p)}>
                      {t('Montar roadmap')}
                    </Button>
                  </Toolbar>

                  <p className="text-xs text-fg-muted">
                    {t('Para o diagnóstico, selecione o tópico e descreva onde você trava no campo de dúvida abaixo.')}
                  </p>

                  {roadmapQuestions && (
                    <Card variant="flat">
                      <SectionTitle>{t('Complemente o contexto')}</SectionTitle>
                      <p className="mt-1 text-sm text-fg-muted">
                        {t('Responda para a IA montar um roadmap sob medida (deixe em branco o que não quiser responder).')}
                      </p>
                      <div className="mt-3 space-y-3">
                        {roadmapQuestions.map((q, i) => (
                          <Field key={i} label={q}>
                            <Input
                              value={roadmapAnswers[i] || ''}
                              onChange={(e) => setRoadmapAnswers({ ...roadmapAnswers, [i]: e.target.value })}
                            />
                          </Field>
                        ))}
                        <Field label={t('Outras informações relevantes (opcional)')}>
                          <Textarea
                            rows={3}
                            placeholder={t('Outras informações relevantes (opcional)')}
                            value={roadmapExtra}
                            onChange={(e) => setRoadmapExtra(e.target.value)}
                          />
                        </Field>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button onClick={() => generateRoadmap(p)} loading={assistBusy} disabled={assistBusy}>
                          {assistBusy ? t('Gerando...') : t('Gerar roadmap')}
                        </Button>
                        <Button variant="ghost" disabled={assistBusy} onClick={cancelRoadmap}>
                          {t('Cancelar')}
                        </Button>
                      </div>
                    </Card>
                  )}

                  <Toolbar
                    actions={(
                      <Button variant="ghost" disabled={assistBusy} onClick={() => runAssist('ask', p)}>
                        {t('Perguntar')}
                      </Button>
                    )}
                  >
                    <Input
                      className="w-full sm:w-96"
                      placeholder={t('Tirar dúvida sobre o tópico... (ou descreva onde trava p/ diagnóstico)')}
                      aria-label={t('Perguntar')}
                      value={assistAsk}
                      onChange={(e) => setAssistAsk(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && runAssist('ask', p)}
                    />
                  </Toolbar>

                  {assistBusy && (
                    <p className="flex items-center gap-2 text-sm text-fg-muted">
                      <Spinner size="xs" /> {t('Pensando...')}
                    </p>
                  )}

                  {assistSuggested.length > 0 && (
                    <Card variant="flat">
                      <SectionTitle>
                        {suggestedKind === 'prereqs' ? t('Pré-requisitos sugeridos') : t('Tópicos sugeridos')}
                      </SectionTitle>
                      <ul className="mt-2 divide-y divide-border">
                        {assistSuggested.map((tp, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                            <span className="min-w-0 break-words">{tp.title}</span>
                            {tp.estimate_hours ? (
                              <span className="shrink-0 text-xs text-fg-muted">~{tp.estimate_hours}h</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <Button className="mt-3" size="sm" onClick={() => addSuggested(p)}>
                        {t('+ Adicionar ao plano')}
                      </Button>
                    </Card>
                  )}

                  {assistOutput && !assistBusy && (
                    <>
                        <Card variant="flat">
                          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{assistOutput}</div>
                        </Card>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="ghost"
                          loading={savingDoc}
                          disabled={savingDoc || !p.docsPath}
                          title={p.docsPath ? t('Salva o texto acima como .md no vault do plano') : t('Vincule o vault do plano para salvar')}
                          onClick={() => saveOutputDoc({ ...p }, t('Estudo'))}
                        >
                          {savingDoc ? '…' : t('Salvar no vault')}
                        </Button>
                        {savedDoc && (
                          <span className="flex min-w-0 items-center gap-1 break-all text-xs text-success">
                            <Icon name="check" size={12} /> {savedDoc}
                          </span>
                        )}
                        {!p.docsPath && (
                          <span className="text-xs text-fg-muted">{t('Vincule o vault abaixo para salvar.')}</span>
                        )}
                      </div>
                    </>
                  )}

                  {/* Vault de docs do plano */}
                  <Card variant="flat">
                    <SectionTitle>{t('Vault de estudos')}</SectionTitle>
                    <p className="mt-1 text-xs text-fg-muted">
                      {t('Pasta onde os docs gerados são salvos (.md).')}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Input
                        className="w-full sm:w-80"
                        placeholder="/home/usuario/.../estudos"
                        aria-label={t('Vault de estudos')}
                        value={vaultPath}
                        onChange={(e) => setVaultPath(e.target.value)}
                      />
                      <Button
                        variant="secondary"
                        loading={vaultSaving}
                        disabled={vaultSaving}
                        onClick={() => saveVaultPath(p)}
                      >
                        {vaultSaving ? '…' : t('Vincular')}
                      </Button>
                    </div>
                    {p.docsPath && (
                      <p className="mt-2 break-all text-xs text-fg-muted">
                        {t('Atual')}: {p.docsPath}
                      </p>
                    )}
                    {planDocs.length > 0 && (
                      <div className="mt-2 space-y-1 text-xs text-fg-muted">
                        {planDocs.slice(0, 8).map((d) => (
                          <div key={d.name} className="flex items-center gap-1.5">
                            <Icon name="book" size={12} /> <span className="break-all">{d.name}</span>
                          </div>
                        ))}
                        {planDocs.length > 8 && <div>+{planDocs.length - 8}…</div>}
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            )}
          </Card>
        )
      })}

      {plans.length === 0 && (
        <Card>
          <EmptyState
            icon={<Icon name="book" size={20} />}
            title={t('Nenhum plano de estudo ainda.')}
          />
        </Card>
      )}
    </div>
  )
}
