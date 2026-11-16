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
    if (!topicTitle.trim()) return
    try {
      await addTopic(planId, { title: topicTitle.trim(), weight: 1 })
      setTopicTitle('')
      setError('')
      loadTopics(planId)
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
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

  return (
    <div>
      <h1 className="page-title">{t("Estudos")}</h1>
      <p className="subtitle">{t("Planos de estudo e acompanhamento de tópicos.")}</p>

      {error && <div className="banner">{error}</div>}

      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <input
          placeholder={t("Título do plano")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(CATEGORY_LABELS[c] || c)}
            </option>
          ))}
        </select>
        <input
          placeholder={t("Descrição (opcional)")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          placeholder={t("Vault dos docs (pasta, opcional)")}
          value={vaultNew}
          onChange={(e) => setVaultNew(e.target.value)}
          title={t("Pasta onde os docs gerados pelo assistente serão salvos")}
        />
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.pdf,.docx,.epub"
          style={{ display: 'none' }}
          onChange={onPickFiles}
        />
        <button className="ghost" onClick={() => fileRef.current?.click()}>
          {t('📎 Anexar arquivos')}
        </button>
        <button disabled={creating} onClick={onCreatePlan}>
          {creating ? t('Criando...') : t('+ Criar plano')}
        </button>
      </div>

      {attachedFiles.length > 0 && (
        <div className="muted" style={{ marginBottom: 6 }}>
          {t('Anexos (usados como contexto):')}{' '}
          {attachedFiles.map((f, i) => (
            <span key={i} className="badge-type" style={{ marginRight: 6 }}>
              {f.name}{' '}
              <a style={{ cursor: 'pointer' }} onClick={() => removeAttached(i)}>✕</a>
            </span>
          ))}
        </div>
      )}
      {creating && attachedFiles.length > 0 && (
        <div className="muted" style={{ marginBottom: 10 }}>
          {t('Lendo os arquivos e montando os tópicos com IA — pode levar alguns segundos.')}
        </div>
      )}

      {plans.map((p) => (
        <div key={p.id} className="card">
          <div className="row" onClick={() => onToggle(p.id)} style={{ cursor: 'pointer' }}>
            <div>
              <strong>{p.title}</strong>
              <span className="muted"> · {t(CATEGORY_LABELS[p.category] || p.category)}</span>
            </div>
            <span className="muted">
              {p.doneTopics}/{p.totalTopics}
            </span>
          </div>

          <div
            style={{
              background: 'var(--border)',
              borderRadius: 4,
              height: 8,
              marginTop: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: 'var(--accent)',
                height: '100%',
                width: `${p.progress}%`,
              }}
            />
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            {p.progress}% · {t(STATUS_LABELS[p.status] || p.status)}
          </div>

          {expandedId === p.id && (
            <div style={{ marginTop: 12 }}>
              {topics.map((tp) => (
                <div key={tp.id} className="row">
                  <span>{tp.title}</span>
                  <span className="row" style={{ gap: 8 }}>
                    <select
                      value={tp.status}
                      onChange={(e) => onChangeStatus(tp.id, e.target.value, p.id)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {t(STATUS_LABELS[s] || s)}
                        </option>
                      ))}
                    </select>
                    <span className="muted">
                      {tp.loggedHours}h / {tp.estimateHours}h
                    </span>
                  </span>
                </div>
              ))}
              {topics.length === 0 && <div className="muted">{t("Nenhum tópico ainda.")}</div>}

              <div className="toolbar" style={{ marginTop: 8 }}>
                <input
                  placeholder={t("Novo tópico")}
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                />
                <button className="ghost" onClick={() => onAddTopic(p.id)}>
                  {t("+ Adicionar tópico")}
                </button>
              </div>

              {/* Assistente de estudo (sob demanda) */}
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <strong>{t("Assistente de estudo")}</strong>
                <div className="muted" style={{ margin: '4px 0 8px' }}>
                  {t("Escolha um tópico e clique numa ação. A IA gera sob demanda.")}
                </div>

                <div className="toolbar" style={{ flexWrap: 'wrap' }}>
                  <select value={assistTopic} onChange={(e) => setAssistTopic(e.target.value)}>
                    <option value="">{t("— Plano inteiro —")}</option>
                    {topics.map((tp) => (
                      <option key={tp.id} value={tp.title}>
                        {tp.title}
                      </option>
                    ))}
                  </select>
                  <button disabled={assistBusy} onClick={() => runAssist('explain', p)}>
                    {t("Explicar")}
                  </button>
                  <button disabled={assistBusy} onClick={() => runAssist('exercises', p)}>
                    {t("Exercícios")}
                  </button>
                  <button disabled={assistBusy} onClick={() => runAssist('quiz', p)}>
                    {t("Quiz")}
                  </button>
                  <button disabled={assistBusy} onClick={() => runAssist('flashcards', p)}>
                    {t("Flashcards")}
                  </button>
                  <button
                    disabled={assistBusy}
                    onClick={() => runAssist('diagnose', p)}
                    title={t("Travou? Descobre qual pré-requisito está faltando e monta a base.")}
                  >
                    {t("🧭 Diagnosticar base")}
                  </button>
                  <button
                    className="ghost"
                    disabled={assistBusy}
                    onClick={() => startRoadmap(p)}
                  >
                    {t("Montar roadmap")}
                  </button>
                </div>
                <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                  {t("Para o diagnóstico, selecione o tópico e descreva onde você trava no campo de dúvida abaixo.")}
                </div>

                {roadmapQuestions && (
                  <div className="card" style={{ marginTop: 8 }}>
                    <strong>{t("Complemente o contexto")}</strong>
                    <div className="muted" style={{ margin: '4px 0 8px' }}>
                      {t("Responda para a IA montar um roadmap sob medida (deixe em branco o que não quiser responder).")}
                    </div>
                    {roadmapQuestions.map((q, i) => (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 13, marginBottom: 2 }}>{q}</div>
                        <input
                          style={{ width: '100%' }}
                          value={roadmapAnswers[i] || ''}
                          onChange={(e) => setRoadmapAnswers({ ...roadmapAnswers, [i]: e.target.value })}
                        />
                      </div>
                    ))}
                    <textarea
                      placeholder={t("Outras informações relevantes (opcional)")}
                      style={{ width: '100%', minHeight: 50 }}
                      value={roadmapExtra}
                      onChange={(e) => setRoadmapExtra(e.target.value)}
                    />
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>
                      <button disabled={assistBusy} onClick={() => generateRoadmap(p)}>
                        {assistBusy ? t('Gerando...') : t('Gerar roadmap')}
                      </button>
                      <button className="ghost" disabled={assistBusy} onClick={cancelRoadmap}>
                        {t('Cancelar')}
                      </button>
                    </div>
                  </div>
                )}

                <div className="toolbar" style={{ marginTop: 8 }}>
                  <input
                    placeholder={t("Tirar dúvida sobre o tópico... (ou descreva onde trava p/ diagnóstico)")}
                    value={assistAsk}
                    onChange={(e) => setAssistAsk(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runAssist('ask', p)}
                  />
                  <button className="ghost" disabled={assistBusy} onClick={() => runAssist('ask', p)}>
                    {t("Perguntar")}
                  </button>
                </div>

                {assistBusy && <div className="muted" style={{ marginTop: 8 }}>{t("Pensando...")}</div>}

                {assistSuggested.length > 0 && (
                  <div className="card" style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 6 }}>
                      <strong>{suggestedKind === 'prereqs' ? t("Pré-requisitos sugeridos") : t("Tópicos sugeridos")}</strong>
                    </div>
                    {assistSuggested.map((tp, i) => (
                      <div key={i} className="row">
                        <span>{tp.title}</span>
                        {tp.estimate_hours ? (
                          <span className="muted">~{tp.estimate_hours}h</span>
                        ) : null}
                      </div>
                    ))}
                    <button style={{ marginTop: 8 }} onClick={() => addSuggested(p)}>
                      {t("+ Adicionar ao plano")}
                    </button>
                  </div>
                )}

                {assistOutput && !assistBusy && (
                  <>
                    <div
                      className="card"
                      style={{ marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}
                    >
                      {assistOutput}
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>
                      <button
                        className="ghost"
                        disabled={savingDoc || !p.docsPath}
                        title={p.docsPath ? t('Salva o texto acima como .md no vault do plano') : t('Vincule o vault do plano para salvar')}
                        onClick={() => saveOutputDoc({ ...p }, t('Estudo'))}
                      >
                        {savingDoc ? '…' : `💾 ${t('Salvar no vault')}`}
                      </button>
                      {savedDoc && <span className="muted" style={{ fontSize: 11 }}>✓ {savedDoc}</span>}
                      {!p.docsPath && (
                        <span className="muted" style={{ fontSize: 11 }}>{t('Vincule o vault abaixo para salvar.')}</span>
                      )}
                    </div>
                  </>
                )}

                {/* Vault de docs do plano */}
                <div className="card" style={{ marginTop: 8 }}>
                  <strong>{t("Vault de estudos")}</strong>
                  <div className="muted" style={{ margin: '4px 0 8px', fontSize: 12 }}>
                    {t("Pasta onde os docs gerados são salvos (.md).")}
                  </div>
                  <div className="toolbar">
                    <input
                      placeholder="/home/usuario/.../estudos"
                      value={vaultPath}
                      onChange={(e) => setVaultPath(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button className="ghost" disabled={vaultSaving} onClick={() => saveVaultPath(p)}>
                      {vaultSaving ? '…' : t('Vincular')}
                    </button>
                  </div>
                  {p.docsPath && (
                    <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                      {t('Atual')}: {p.docsPath}
                    </div>
                  )}
                  {planDocs.length > 0 && (
                    <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                      {planDocs.slice(0, 8).map((d) => (
                        <div key={d.name}>📄 {d.name}</div>
                      ))}
                      {planDocs.length > 8 && <div>+{planDocs.length - 8}…</div>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
      {plans.length === 0 && <div className="muted">{t("Nenhum plano de estudo ainda.")}</div>}
    </div>
  )
}
