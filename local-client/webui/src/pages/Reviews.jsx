import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getBoard,
  getMembers,
  getProjects,
  getReviews,
  createReview,
  updateReview,
  duplicateReview,
  sendReview,
  reopenReview,
  reviewExportUrl,
  getWorkspaces,
} from '../api'
import { getActiveProjectId } from '../components/ProjectSelector.jsx'
import { t, tf } from '../i18n'
import Icon from '../components/Icon'
import {
  Badge, Button, Card, CardHeader, DataTable, Dialog, EmptyState, Field, Input,
  PageHeader, Select, Skeleton, Textarea, Toolbar, useToast,
} from '../ui'

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mondayOf = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - dow)
  return x
}
const addDays = (d, n) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() + n)
  return x
}

const HELP = {
  fatos: 'Um fato por linha: o que foi feito, o PR ou card e o que prova. Ex.: "buscar operador · `13993`, PR `\u00238902` · kit de 42 cenários, 215 testes".',
  frase: 'Uma frase curta, terceira pessoa, sem número de card. Ex.: "Bom progresso na tesouraria com cuidado nos testes de contrato."',
  codigo: 'O que o PR faz em linguagem de negócio, o que muda de comportamento e o que foi testado. Ex.: "Dois caminhos passam a carregar o operador; nada muda com a flag desligada; validado com 42 cenários por rota."',
  p1: 'Entrega: o que foi feito na semana e o efeito no módulo. Ex.: "Fez as correções necessárias para os bugs do módulo e manteve os testes cobrindo os casos."',
  p2: 'Reconhecimento ou UM ponto de atenção, nunca lista. Ex.: "Melhorou nas revisões em relação à semana passada, apontando a causa antes do merge."',
  p3: 'Próximos passos: foco da semana, validar em ambiente, manter o time informado. Ex.: "Na semana atual o foco deve ser concluir a gravação e validar em ambiente."',
  evidencias: 'Fatos secos que sustentam o comentário (não vão ao formulário). Ex.: "PR `\u00238902` mergeado em 09/11; suíte 2.933 sem classe vermelha nova."',
  proxima: 'Focos da próxima semana em tópicos curtos. Ex.: "Concluir os ajustes do `\u00238994` e acompanhar as entregas abertas até o merge."',
}

const STOP = new Set('de da do das dos em no na nos nas ao aos e o a os as um uma uns umas que se com por para como mais foi era são ter tem isso este esta isto ela ele eles elas seu sua seus suas'.split(' '))
const termos = (s) => new Set((s || '').toLowerCase().match(/[a-zà-ú]{4,}/g)?.filter((p) => !STOP.has(p)) || [])
function pontosRepetidos(atual, anterior) {
  const ta = new Set([...termos(atual.factsMd), ...termos(atual.commentMd)])
  const tb = new Set([...termos(anterior.factsMd), ...termos(anterior.commentMd)])
  const noComent = termos(atual.commentMd)
  return [...ta].filter((x) => tb.has(x)).sort((a, b) => (noComent.has(b) ? 1 : 0) - (noComent.has(a) ? 1 : 0)).slice(0, 8)
}

function fatosParaTabela(factsMd) {
  const linhas = []
  for (const ln of (factsMd || '').split('\n')) {
    const s = ln.trim()
    if (!s.startsWith('|')) continue
    const cels = s.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    if (cels.length < 3) continue
    if (cels[0].toLowerCase() === 'o que') continue
    if (/^[:\-\s|]+$/.test(cels.join('')) && !/[a-zA-Z0-9]/.test(cels.join(''))) continue
    linhas.push({ what: cels[0] || '', ref: cels[1] || '', evidence: cels.slice(2).join(' | ') })
  }
  return linhas
}
function tabelaParaFatos(linhas) {
  const validas = linhas.filter((l) => (l.what || '').trim())
  if (!validas.length) return ''
  return ['| O que | PR ou card | Evidência |', '|---|---|---|',
    ...validas.map((l) => `| ${(l.what || '').trim()} | ${(l.ref || '').trim()} | ${(l.evidence || '').trim()} |`)].join('\n')
}
const blocosComentario = (commentMd) => (commentMd || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)

function validar(form) {
  const erros = []
  const avisos = []
  if (!(form.personName || '').trim()) erros.push('Informe a pessoa.')
  if (!form.periodStart || !form.periodEnd) erros.push('Informe a semana (início e fim).')
  const frase = (form.summaryOneLine || '').trim()
  if (!frase) erros.push('“Em uma frase” é obrigatório.')
  else if (frase.length > 200) erros.push(`“Em uma frase” passa de 200 caracteres (${frase.length}).`)
  const blocos = blocosComentario(form.commentMd)
  if (blocos.length < 3) erros.push(`O comentário final exige os 3 blocos preenchidos (há ${blocos.length}).`)
  if (/(^|\D)(#?\d{4,5})\b/.test(form.commentMd || '')) avisos.push('Há número de card/PR no comentário — números só nas evidências.')
  if (/\bQA\b/.test(form.commentMd || '')) avisos.push('Aparece “QA” — usar “Testes e validações”.')
  if (((form.commentMd || '').match(/aten[cç][aã]o/gi) || []).length > 1) avisos.push('Mais de um ponto de atenção — o formato pede um único ponto (ou reconhecimento).')
  return { erros, avisos }
}

const ERRO_CLASSE = 'rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger'
const AVISO_CLASSE = 'rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning'

export default function Reviews() {
  const [projeto, setProjeto] = useState(null)
  const [membros, setMembros] = useState([])
  const [reviews, setReviews] = useState([])
  const [filtroPessoa, setFiltroPessoa] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [form, setForm] = useState(null)
  const [fatos, setFatos] = useState([])
  const [blocos, setBlocos] = useState(['', '', ''])
  const [salvando, setSalvando] = useState(false)
  const [salvoEm, setSalvoEm] = useState('')
  const [erro, setErro] = useState('')
  const [previa, setPrevia] = useState('')
  const [mostraPrevia, setMostraPrevia] = useState(false)
  const [cardsPessoa, setCardsPessoa] = useState([])
  const [erroAcao, setErroAcao] = useState('')
  const [carregandoLista, setCarregandoLista] = useState(false)
  const [criando, setCriando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [reabrindo, setReabrindo] = useState(false)
  const [duplicando, setDuplicando] = useState(false)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const timer = useRef(null)
  const toast = useToast()

  // projeto ativo (mesmo padrão da página Time)
  useEffect(() => {
    ;(async () => {
      try {
        const d = await getWorkspaces()
        const pid = getActiveProjectId(d.active)
        const projetos = await getProjects()
        setProjeto(projetos.find((p) => String(p.id) === String(pid)) || projetos[0] || null)
      } catch (e) { setErro(String(e.message || e)) }
    })()
  }, [])

  const carregar = async (pid, pessoa = filtroPessoa, status = filtroStatus) => {
    if (!pid) return
    const params = {}
    if (pessoa) params.person = pessoa
    if (status) params.status = status
    setCarregandoLista(true)
    try {
      setReviews(await getReviews(pid, params))
    } finally {
      setCarregandoLista(false)
    }
  }
  useEffect(() => {
    if (!projeto) return
    getMembers(projeto.id).then((m) => setMembros(m.map((x) => x.name))).catch(() => setMembros([]))
    carregar(projeto.id).catch((e) => setErro(e?.response?.data?.detail || String(e.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projeto?.id])

  const aplicarFiltros = (pessoa, status) => {
    setFiltroPessoa(pessoa)
    setFiltroStatus(status)
    carregar(projeto.id, pessoa, status).catch(() => {})
  }

  const abrir = (r) => {
    setForm({ ...r })
    setFatos(fatosParaTabela(r.factsMd))
    const b = blocosComentario(r.commentMd)
    setBlocos([b[0] || '', b[1] || '', b[2] || ''])
    setPrevia('')
    setMostraPrevia(false)
    setErroAcao('')
    carregarCards(r.personName, r.periodStart, r.periodEnd)
  }

  const carregarCards = async (pessoa, inicio, fim) => {
    if (!projeto || !pessoa) { setCardsPessoa([]); return }
    try {
      const b = await getBoard(projeto.id)
      const cols = Object.fromEntries(b.columns.map((c) => [c.id, c.name]))
      const todos = b.columns.flatMap((c) => c.tasks.map((tk) => ({ ...tk, colName: cols[tk.columnId] || '' })))
      setCardsPessoa(todos.filter((tk) => tk.assignee === pessoa && (!inicio || (tk.updatedAt || '') >= inicio) && (!fim || (tk.updatedAt || '') <= fim + 'T23:59')))
    } catch { setCardsPessoa([]) }
  }

  // autosave do rascunho (com debounce)
  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))
  useEffect(() => {
    if (!form || form.status !== 'DRAFT') return
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSalvando(true)
      try {
        const atualizado = await updateReview(projeto.id, form.id, {
          personName: form.personName, evaluator: form.evaluator,
          periodStart: form.periodStart, periodEnd: form.periodEnd,
          techScore: form.techScore ?? null, softScore: form.softScore ?? null,
          summaryOneLine: form.summaryOneLine, factsMd: tabelaParaFatos(fatos),
          codeMd: form.codeMd, commentMd: blocos.filter((b) => b.trim()).join('\n\n'),
          evidenceMd: form.evidenceMd, nextWeekMd: form.nextWeekMd,
        })
        setForm(atualizado)
        setReviews((rs) => rs.map((x) => (x.id === atualizado.id ? atualizado : x)))
        setSalvoEm(new Date().toLocaleTimeString())
      } catch (e) { setErro(e?.response?.data?.detail || String(e.message || e)) }
      finally { setSalvando(false) }
    }, 900)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.personName, form?.evaluator, form?.periodStart, form?.periodEnd, form?.techScore, form?.softScore, form?.summaryOneLine, form?.codeMd, blocos.join('|||'), fatos.map((f) => `${f.what}|${f.ref}|${f.evidence}`).join('|||'), form?.evidenceMd, form?.nextWeekMd])

  const novo = async () => {
    const pessoa = filtroPessoa || membros[0] || ''
    if (!pessoa) { setErro(t('Cadastre um responsável no Time antes de criar reviews.')); return }
    setCriando(true)
    try {
      const seg = mondayOf(new Date())
      const sex = addDays(seg, 4)
      let avaliador = ''
      try { avaliador = localStorage.getItem('relay.reviews.evaluator') || '' } catch {}
      const r = await createReview(projeto.id, {
        personName: pessoa, evaluator: avaliador || membros[0] || '',
        periodStart: iso(seg), periodEnd: iso(sex),
      })
      try { localStorage.setItem('relay.reviews.evaluator', r.evaluator) } catch {}
      setReviews((rs) => [r, ...rs])
      abrir(r)
    } catch (e) { setErro(e?.response?.data?.detail || String(e.message || e)) }
    finally { setCriando(false) }
  }

  const duplicar = async () => {
    setDuplicando(true)
    try {
      const r = await duplicateReview(projeto.id, form.id)
      setReviews((rs) => [r, ...rs])
      abrir(r)
      toast?.({ title: t('Review duplicado.'), tone: 'success' })
    } catch (e) { setErro(e?.response?.data?.detail || String(e.message || e)) }
    finally { setDuplicando(false) }
  }

  const enviar = async () => {
    setErroAcao('')
    setEnviando(true)
    try {
      const r = await sendReview(projeto.id, form.id)
      setForm(r)
      setReviews((rs) => rs.map((x) => (x.id === r.id ? r : x)))
      toast?.({ title: t('Review marcado como enviado.'), tone: 'success' })
    } catch (e) { setErroAcao(e?.response?.data?.detail || String(e.message || e)) }
    finally { setEnviando(false) }
  }

  const reabrir = async () => {
    setErroAcao('')
    setReabrindo(true)
    try {
      const r = await reopenReview(projeto.id, form.id)
      setForm(r)
      setReviews((rs) => rs.map((x) => (x.id === r.id ? r : x)))
      toast?.({ title: t('Rascunho reaberto.'), tone: 'success' })
    } catch (e) { setErroAcao(e?.response?.data?.detail || String(e.message || e)) }
    finally { setReabrindo(false) }
  }

  const verPrevia = async () => {
    setCarregandoPrevia(true)
    try {
      const txt = await (await fetch(reviewExportUrl(projeto.id, form.id))).text()
      setPrevia(txt)
    } catch (e) { setPrevia(String(e.message || e)) }
    finally { setCarregandoPrevia(false) }
    setMostraPrevia(true)
  }

  const copiarCodigo = async (tk) => {
    try {
      await navigator.clipboard.writeText(tk.code || String(tk.id))
      toast?.({ title: t('Código copiado.'), tone: 'success' })
    } catch { /* área de transferência indisponível */ }
  }

  const { erros, avisos } = useMemo(() => (form ? validar({ ...form, commentMd: blocos.filter((b) => b.trim()).join('\n\n') }) : { erros: [], avisos: [] }), [form, blocos])
  const nomes = useMemo(() => {
    const doTime = new Set([...membros, ...reviews.map((r) => r.personName)])
    return [...doTime].filter(Boolean).sort()
  }, [membros, reviews])
  const historico = useMemo(() => {
    if (!form) return { lista: [], anterior: null, repetidos: [] }
    const lista = [...reviews].filter((r) => r.personName === form.personName).sort((a, b) => (b.periodStart || '').localeCompare(a.periodStart || ''))
    const idx = lista.findIndex((r) => r.id === form.id)
    const anterior = idx >= 0 ? lista[idx + 1] || null : lista[0] || null
    const repetidos = anterior ? pontosRepetidos({ factsMd: tabelaParaFatos(fatos), commentMd: blocos.filter((b) => b.trim()).join('\n\n') }, anterior) : []
    return { lista, anterior, repetidos }
  }, [form, reviews, fatos, blocos])

  if (!projeto) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('Reviews semanais')}
          description={t('avaliação por pessoa, no formato do vault.')}
        />
        {erro ? (
          <div role="alert" className={ERRO_CLASSE}>{erro}</div>
        ) : (
          <div className="space-y-3" aria-busy="true">
            <Skeleton h="h-10" />
            <Skeleton h="h-64" />
          </div>
        )}
      </div>
    )
  }
  const travado = form && form.status !== 'DRAFT'

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Reviews semanais')}
        description={`${projeto.key} · ${projeto.name} — ${t('avaliação por pessoa, no formato do vault.')}`}
      />

      {erro && <div role="alert" className={ERRO_CLASSE}>{erro}</div>}

      <Toolbar
        actions={(
          <>
            <Button onClick={novo} loading={criando}>+ {t('Novo review')}</Button>
            <span className="text-xs text-fg-muted" aria-live="polite">
              {salvando ? t('Salvando rascunho…') : salvoEm ? tf('Rascunho salvo às {h}', { h: salvoEm }) : ''}
            </span>
          </>
        )}
      >
        <div className="w-48">
          <Select
            value={filtroPessoa || 'all'}
            onValueChange={(v) => aplicarFiltros(v === 'all' ? '' : v, filtroStatus)}
            ariaLabel={t('Todas as pessoas')}
            options={[
              { value: 'all', label: t('Todas as pessoas') },
              ...nomes.map((n) => ({ value: n, label: n })),
            ]}
          />
        </div>
        <div className="w-40">
          <Select
            value={filtroStatus || 'all'}
            onValueChange={(v) => aplicarFiltros(filtroPessoa, v === 'all' ? '' : v)}
            ariaLabel={t('Todos os status')}
            options={[
              { value: 'all', label: t('Todos os status') },
              { value: 'DRAFT', label: t('Rascunho') },
              { value: 'SENT', label: t('Enviado') },
            ]}
          />
        </div>
      </Toolbar>

      <DataTable
        columns={[
          {
            key: 'person',
            header: t('Pessoa'),
            render: (r) => <span className="font-medium text-fg">{r.personName}</span>,
          },
          {
            key: 'period',
            header: t('Período'),
            hideOnMobile: true,
            render: (r) => <span className="tabular-nums text-fg-muted">{r.periodStart}–{r.periodEnd}</span>,
          },
          {
            key: 'scores',
            header: t('Notas'),
            hideOnMobile: true,
            render: (r) => (
              <span className="tabular-nums text-fg-muted">
                {r.techScore ?? 'N'}·{t('téc')} / {r.softScore ?? 'N'}·{t('comp')}
              </span>
            ),
          },
          {
            key: 'status',
            header: t('Status'),
            align: 'right',
            render: (r) => (
              <Badge variant={r.status === 'SENT' ? 'success' : 'neutral'}>
                {r.status === 'SENT' ? t('Enviado') : t('Rascunho')}
              </Badge>
            ),
          },
        ]}
        rows={reviews}
        rowKey={(r) => r.id}
        onRowClick={abrir}
        loading={carregandoLista}
        empty={<EmptyState title={t('Nenhum review.')} />}
      />

      {form && (
        <Card padding="lg" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-fg">
                {form.personName} · {form.periodStart}–{form.periodEnd}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant={form.status === 'SENT' ? 'success' : 'neutral'}>
                  {form.status === 'SENT' ? t('Enviado') : t('Rascunho')}
                </Badge>
                {salvando && <span className="text-xs text-fg-muted">{t('Salvando rascunho…')}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {form.status === 'DRAFT' ? (
                <Button
                  onClick={enviar}
                  loading={enviando}
                  disabled={erros.length > 0}
                  title={erros.join('\n')}
                >
                  {t('Marcar como enviado')}
                </Button>
              ) : (
                <Button variant="secondary" onClick={reabrir} loading={reabrindo}>{t('Reabrir rascunho')}</Button>
              )}
              <Button
                variant="secondary"
                onClick={duplicar}
                loading={duplicando}
                title={t('Copia notas e estrutura para a próxima semana')}
              >
                {t('Duplicar da semana anterior')}
              </Button>
              <Button
                as="a"
                variant="secondary"
                href={reviewExportUrl(projeto.id, form.id)}
                target="_blank"
                rel="noreferrer"
                disabled={erros.length > 0}
                title={erros.join('\n') || t('Baixa o .md no formato do vault')}
              >
                {t('Exportar .md')}
              </Button>
              <Button variant="ghost" onClick={verPrevia} loading={carregandoPrevia}>{t('Pré-visualizar')}</Button>
            </div>
          </div>

          {erros.length > 0 && (
            <div role="alert" className={ERRO_CLASSE}>
              {erros.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          {avisos.length > 0 && (
            <div role="status" className={AVISO_CLASSE}>
              {avisos.map((a, i) => <div key={i}>{a}</div>)}
            </div>
          )}
          {erroAcao && <div role="alert" className={ERRO_CLASSE}>{erroAcao}</div>}

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-fg">{t('Contexto — pessoa, semana, notas')}</h3>
                <p className="text-xs text-fg-muted">
                  {t('Notas de 1 a 5 (vazio = N). O avaliador sai no cabeçalho do arquivo.')}
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label={t('Pessoa')}>
                    <Input
                      value={form.personName}
                      disabled={travado}
                      onChange={(e) => set('personName', e.target.value)}
                      placeholder={t('Pessoa')}
                    />
                  </Field>
                  <Field label={t('Início')}>
                    <Input
                      type="date"
                      value={form.periodStart || ''}
                      disabled={travado}
                      onChange={(e) => set('periodStart', e.target.value)}
                    />
                  </Field>
                  <Field label={t('Fim')}>
                    <Input
                      type="date"
                      value={form.periodEnd || ''}
                      disabled={travado}
                      onChange={(e) => set('periodEnd', e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label={t('Técnica')}>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={form.techScore ?? ''}
                      disabled={travado}
                      onChange={(e) => set('techScore', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </Field>
                  <Field label={t('Comportamental')}>
                    <Input
                      type="number"
                      min="1"
                      max="5"
                      value={form.softScore ?? ''}
                      disabled={travado}
                      onChange={(e) => set('softScore', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </Field>
                  <Field label={t('Avaliador')}>
                    <Input
                      value={form.evaluator || ''}
                      disabled={travado}
                      onChange={(e) => set('evaluator', e.target.value)}
                      placeholder={t('Avaliador')}
                    />
                  </Field>
                </div>
              </section>

              <Field
                label={t('Em uma frase (obrigatório, até 200 caracteres)')}
                hint={HELP.frase}
                counter={`${(form.summaryOneLine || '').length}/200`}
              >
                <Input
                  maxLength={200}
                  value={form.summaryOneLine || ''}
                  disabled={travado}
                  onChange={(e) => set('summaryOneLine', e.target.value)}
                  placeholder={t('Resumo da semana em uma frase')}
                />
              </Field>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-fg">{t('Fatos — o que / PR ou card / evidência')}</h3>
                <p className="text-xs text-fg-muted">{HELP.fatos}</p>
                {fatos.map((f, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-6">
                    <div className="sm:col-span-2">
                      <Input
                        value={f.what}
                        disabled={travado}
                        onChange={(e) => { const c = [...fatos]; c[i] = { ...c[i], what: e.target.value }; setFatos(c) }}
                        placeholder={t('O que')}
                        aria-label={t('O que')}
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <Input
                        value={f.ref}
                        disabled={travado}
                        onChange={(e) => { const c = [...fatos]; c[i] = { ...c[i], ref: e.target.value }; setFatos(c) }}
                        placeholder={t('PR ou card')}
                        aria-label={t('PR ou card')}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        value={f.evidence}
                        disabled={travado}
                        onChange={(e) => { const c = [...fatos]; c[i] = { ...c[i], evidence: e.target.value }; setFatos(c) }}
                        placeholder={t('Evidência')}
                        aria-label={t('Evidência')}
                      />
                    </div>
                    {!travado && (
                      <Button
                        variant="danger"
                        size="sm"
                        iconOnly
                        aria-label={t('Remover')}
                        title={t('Remover')}
                        onClick={() => setFatos(fatos.filter((_, j) => j !== i))}
                      >
                        <Icon name="close" size={14} />
                      </Button>
                    )}
                  </div>
                ))}
                {!travado && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setFatos([...fatos, { what: '', ref: '', evidence: '' }])}
                  >
                    + {t('Adicionar linha')}
                  </Button>
                )}
              </section>

              <Field label={t('Como aparece no código')} hint={HELP.codigo}>
                <Textarea
                  rows={3}
                  value={form.codeMd || ''}
                  disabled={travado}
                  onChange={(e) => set('codeMd', e.target.value)}
                />
              </Field>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-fg">
                    {t('Comentário final — 3 blocos (entrega / reconhecimento ou atenção / próximos passos)')}
                  </h3>
                  <p className="text-xs text-fg-muted">
                    {t('Terceira pessoa, frases curtas, sem jargão. Um único ponto de atenção ou um reconhecimento.')}
                  </p>
                </div>
                <Field label={`1. ${t('Entrega')}`} hint={HELP.p1}>
                  <Textarea
                    rows={3}
                    value={blocos[0]}
                    disabled={travado}
                    onChange={(e) => setBlocos([e.target.value, blocos[1], blocos[2]])}
                  />
                </Field>
                <Field label={`2. ${t('Reconhecimento ou atenção')}`} hint={HELP.p2}>
                  <Textarea
                    rows={3}
                    value={blocos[1]}
                    disabled={travado}
                    onChange={(e) => setBlocos([blocos[0], e.target.value, blocos[2]])}
                  />
                </Field>
                <Field label={`3. ${t('Próximos passos')}`} hint={HELP.p3}>
                  <Textarea
                    rows={3}
                    value={blocos[2]}
                    disabled={travado}
                    onChange={(e) => setBlocos([blocos[0], blocos[1], e.target.value])}
                  />
                </Field>
              </section>

              <Field label={t('Evidências internas (não vão para o formulário)')} hint={HELP.evidencias}>
                <Textarea
                  rows={3}
                  value={form.evidenceMd || ''}
                  disabled={travado}
                  onChange={(e) => set('evidenceMd', e.target.value)}
                />
              </Field>

              <Field label={t('Próxima semana (proposta)')} hint={HELP.proxima}>
                <Textarea
                  rows={2}
                  value={form.nextWeekMd || ''}
                  disabled={travado}
                  onChange={(e) => set('nextWeekMd', e.target.value)}
                  placeholder={t('Um foco por linha')}
                />
              </Field>
            </div>

            <aside className="space-y-4">
              <Card variant="flat">
                <CardHeader title={t('Histórico — nota anterior')} />
                {historico.anterior ? (
                  <div className="mt-3 space-y-2 text-sm text-fg">
                    <p className="tabular-nums">
                      {t('Anterior')}: {historico.anterior.periodStart}–{historico.anterior.periodEnd} · {historico.anterior.techScore ?? 'N'}·{t('téc')} / {historico.anterior.softScore ?? 'N'}·{t('comp')}
                    </p>
                    {historico.repetidos.length > 0 && (
                      <p className="text-xs text-fg-muted">
                        {t('Pontos que se repetem')}: {historico.repetidos.join(', ')}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-fg-muted">{t('Sem review anterior desta pessoa.')}</p>
                )}
                {historico.lista.length > 1 && (
                  <div className="mt-3 space-y-1 border-t border-border pt-3">
                    {historico.lista.filter((r) => r.id !== form.id).slice(0, 5).map((r) => (
                      <Button
                        key={r.id}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => abrir(r)}
                      >
                        <span className="min-w-0 flex-1 truncate text-left tabular-nums">
                          {r.periodStart}–{r.periodEnd} · {r.techScore ?? 'N'}/{r.softScore ?? 'N'}
                        </span>
                        <Badge variant={r.status === 'SENT' ? 'success' : 'neutral'}>
                          {r.status === 'SENT' ? t('Enviado') : t('Rascunho')}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                )}
              </Card>

              <Card variant="flat">
                <CardHeader
                  title={t('Cards da pessoa no período')}
                  description={t('Só para referência — clique para copiar o código.')}
                />
                {cardsPessoa.length === 0 ? (
                  <p className="mt-3 text-sm text-fg-muted">{t('Nenhum card no período.')}</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {cardsPessoa.slice(0, 12).map((tk) => (
                      <Button
                        key={tk.id}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        title={t('Copiar código')}
                        onClick={() => copiarCodigo(tk)}
                      >
                        <Badge className="shrink-0">{tk.code}</Badge>
                        <span className="min-w-0 flex-1 truncate text-left">{tk.title}</span>
                        <span className="shrink-0 text-xs text-fg-muted">({tk.colName})</span>
                      </Button>
                    ))}
                    {cardsPessoa.length > 12 && (
                      <p className="text-xs text-fg-muted">+{cardsPessoa.length - 12}…</p>
                    )}
                  </div>
                )}
              </Card>
            </aside>
          </div>
        </Card>
      )}

      <Dialog
        open={mostraPrevia}
        onOpenChange={setMostraPrevia}
        title={t('Pré-visualização do .md')}
        size="xl"
        footer={<Button onClick={() => setMostraPrevia(false)}>{t('Fechar')}</Button>}
      >
        <pre className="whitespace-pre-wrap text-sm text-fg">{previa}</pre>
      </Dialog>
    </div>
  )
}
