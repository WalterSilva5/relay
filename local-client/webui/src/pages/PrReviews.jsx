import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getProjects,
  getWorkspaces,
  updateProject,
  getPrReviews,
  createPrReview,
  updatePrReview,
  duplicatePrReview,
  sendPrReview,
  reopenPrReview,
  prReviewExportUrl,
  getPrDiff,
} from '../api'
import { getActiveProjectId } from '../components/ProjectSelector.jsx'
import { t } from '../i18n'
import Icon from '../components/Icon'
import {
  Badge, Button, Card, CardHeader, Checkbox, DataTable, Dialog, EmptyState, Field,
  Input, PageHeader, Select, Skeleton, Textarea, Toolbar, useToast,
} from '../ui'

const VERDICTS = [
  { id: '', label: '—' },
  { id: 'APROVAR', label: 'Aprovar' },
  { id: 'APROVAR_COM_SUGESTOES', label: 'Aprovar com sugestões' },
  { id: 'AGUARDANDO_AUTOR', label: 'Aguardando autor' },
  { id: 'REJEITAR', label: 'Rejeitar' },
]

const CHECKS = [
  ['checkedBase', 'Base correta (`merge-base`) e escopo só do card'],
  ['checkedConflicts', 'Sem conflito (`merge-tree`)'],
  ['checkedTests', 'Testes rodados'],
  ['checkedParity', 'Paridade/contrato'],
  ['checkedMulti', 'Multi-tenant, shadow, logs, IDs longos (quando aplicável)'],
]

const HELP = {
  url: 'Cole a URL do PR (Azure DevOps ou GitHub): preenche repositório e número. Sem API conectada, complete os campos na mão.',
  frase: 'O que este PR resolve, em linguagem de negócio. Se não conseguir escrever, ainda não entendeu o PR. Ex.: "O path legado passa a carregar o operador com o prefixo novo."',
  fluxo: 'Passo a passo do que acontece quando a rota é chamada, do ponto de vista de quem usa. Um passo por linha.',
  pecas: 'Só para o seu entendimento; não vai para o comentário. Ex.: Controller resolve o alias; Seam carrega o operador; DAO grava em CTR001.',
  comportamento: 'O que passa a responder diferente do sistema atual — e se é de propósito. Ex.: "Nada muda com a flag desligada. Desvios conscientes: nenhum."',
  conferi: 'Marque o que foi verificado e informe os testes rodados (total, falhas, skipped).',
  achados: 'Um achado por linha: severidade (alta/média/baixa/ok), arquivo:linha, problema e sugestão.',
  perguntas: 'Dúvidas para o autor, em tópicos. Ex.: "Por que dois paths para o mesmo seam?"',
  final: 'Tom natural, sem jargão, sem lista de arquivos. Diga o que foi feito, o que gostou e o que pede.',
  evidencias: 'Fatos secos que sustentam o review (não vão para o comentário do PR).',
}

function parsePrUrl(url) {
  const u = (url || '').trim()
  let m = u.match(/dev\.azure\.com\/[^/]+\/[^/]+\/_git\/([^/]+)\/pullrequest\/(\d+)/)
  if (m) return { repo: m[1], number: Number(m[2]) }
  m = u.match(/github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/)
  if (m) return { repo: m[1].replace(/\.git$/, ''), number: Number(m[2]) }
  return null
}

function tabelaParaLinhas(md, minCols) {
  const linhas = []
  for (const ln of (md || '').split('\n')) {
    const s = ln.trim()
    if (!s.startsWith('|')) continue
    const cels = s.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
    if (cels.length < minCols) continue
    if (!/[a-zA-Z0-9]/.test(cels.join(''))) continue
    linhas.push(cels)
  }
  if (linhas.length && /^(peça|peca|severidade)$/i.test(linhas[0][0])) linhas.shift()
  return linhas
}
const linhasAchados = (md) => tabelaParaLinhas(md, 4).map((c) => ({ severidade: c[0] || '', onde: c[1] || '', problema: c[2] || '', sugestao: c.slice(3).join(' | ') }))
const linhasPecas = (md) => tabelaParaLinhas(md, 2).map((c) => ({ peca: c[0] || '', papel: c.slice(1).join(' | ') }))
function dumpAchados(linhas) {
  const v = linhas.filter((l) => (l.problema || '').trim())
  if (!v.length) return ''
  return ['| Severidade | Arquivo:linha | Problema | Sugestão |', '|---|---|---|---|',
    ...v.map((l) => `| ${l.severidade.trim()} | ${l.onde.trim()} | ${l.problema.trim()} | ${l.sugestao.trim()} |`)].join('\n')
}
function dumpPecas(linhas) {
  const v = linhas.filter((l) => (l.peca || '').trim() || (l.papel || '').trim())
  if (!v.length) return ''
  return ['| Peça | Papel |', '|---|---|',
    ...v.map((l) => `| ${l.peca.trim()} | ${l.papel.trim()} |`)].join('\n')
}

function validar(f) {
  const erros = []
  const avisos = []
  if (!f.prNumber && !(f.prTitle || '').trim()) erros.push('Informe o PR (número/título — cole a URL).')
  const frase = (f.oneSentence || '').trim()
  if (!frase) erros.push('“Em uma frase” é obrigatório.')
  else if (frase.length > 200) erros.push(`“Em uma frase” passa de 200 caracteres (${frase.length}).`)
  if (!(f.flowMd || '').trim()) erros.push('“O que o PR faz (fluxo)” é obrigatório.')
  if (!(f.finalCommentMd || '').trim()) erros.push('“Comentário final” é obrigatório.')
  if (/(^|\D)(#?\d{4,5})\b/.test(f.finalCommentMd || '')) avisos.push('O comentário final cita número de card/PR — números só nas evidências.')
  if (/\bQA\b/.test(f.finalCommentMd || '')) avisos.push('Aparece “QA” — sugerido: “Testes e validações”.')
  if ((((f.finalCommentMd || '').match(/aten[cç][aã]o/gi) || []).length) > 1) avisos.push('Mais de um ponto de atenção no comentário final.')
  return { erros, avisos }
}

const ERRO_CLASSE = 'rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger'
const AVISO_CLASSE = 'rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning'

export default function PrReviews() {
  const [projeto, setProjeto] = useState(null)
  const [destino, setDestino] = useState('')
  const [reviews, setReviews] = useState([])
  const [fRepo, setFRepo] = useState('')
  const [fAutor, setFAutor] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fVeredito, setFVeredito] = useState('')
  const [form, setForm] = useState(null)
  const [achados, setAchados] = useState([])
  const [pecas, setPecas] = useState([])
  const [salvando, setSalvando] = useState(false)
  const [salvoEm, setSalvoEm] = useState('')
  const [erro, setErro] = useState('')
  const [erroAcao, setErroAcao] = useState('')
  const [previa, setPrevia] = useState('')
  const [mostraPrevia, setMostraPrevia] = useState(false)
  const [novaUrl, setNovaUrl] = useState('')
  const [novoRepo, setNovoRepo] = useState('')
  const [novoNum, setNovoNum] = useState('')
  // diff local de referência
  const [diffRepo, setDiffRepo] = useState('')
  const [diffBase, setDiffBase] = useState('')
  const [diffBranch, setDiffBranch] = useState('')
  const [diffOut, setDiffOut] = useState(null)
  const [diffBusy, setDiffBusy] = useState(false)
  const [carregandoLista, setCarregandoLista] = useState(false)
  const [criando, setCriando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [reabrindo, setReabrindo] = useState(false)
  const [duplicando, setDuplicando] = useState(false)
  const [salvandoDestino, setSalvandoDestino] = useState(false)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const timer = useRef(null)
  const toast = useToast()

  useEffect(() => {
    ;(async () => {
      try {
        const d = await getWorkspaces()
        const pid = getActiveProjectId(d.active)
        const projetos = await getProjects()
        const achado = projetos.find((p) => String(p.id) === String(pid)) || projetos[0] || null
        setProjeto(achado)
        if (achado) setDestino(achado.prReviewsPath || '')
      } catch (e) { setErro(String(e.message || e)) }
    })()
  }, [])

  const carregar = async (pid, f = {}) => {
    if (!pid) return
    const params = {}
    if (f.repo || fRepo) params.repo = f.repo || fRepo
    if (f.author || fAutor) params.author = f.author || fAutor
    if (f.status || fStatus) params.status = f.status || fStatus
    if (f.verdict || fVeredito) params.verdict = f.verdict || fVeredito
    setCarregandoLista(true)
    try {
      setReviews(await getPrReviews(pid, params))
    } finally {
      setCarregandoLista(false)
    }
  }
  useEffect(() => {
    if (projeto) carregar(projeto.id).catch((e) => setErro(e?.response?.data?.detail || String(e.message || e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projeto?.id])

  const aplicar = (campo, valor) => {
    const f = { repo: fRepo, author: fAutor, status: fStatus, verdict: fVeredito, [campo]: valor }
    if (campo === 'repo') setFRepo(valor)
    if (campo === 'author') setFAutor(valor)
    if (campo === 'status') setFStatus(valor)
    if (campo === 'verdict') setFVeredito(valor)
    carregar(projeto.id, f).catch(() => {})
  }

  const abrir = (r) => {
    setForm({ ...r })
    setAchados(linhasAchados(r.findingsMd))
    setPecas(linhasPecas(r.implementationMd))
    setPrevia('')
    setMostraPrevia(false)
    setErroAcao('')
    setDiffBase(r.targetBranch || '')
    setDiffBranch(r.sourceBranch || '')
  }

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))

  // autosave do rascunho (com debounce) — só campos editáveis (sem updatedAt, senão entra em loop)
  const serializado = form ? JSON.stringify({
    repo: form.repo, prNumber: form.prNumber, prTitle: form.prTitle,
    prAuthor: form.prAuthor, prUrl: form.prUrl,
    sourceBranch: form.sourceBranch, targetBranch: form.targetBranch,
    mergeBase: form.mergeBase, reviewDate: form.reviewDate,
    verdict: form.verdict, vote: form.vote, commentPublished: form.commentPublished,
    oneSentence: form.oneSentence, flowMd: form.flowMd,
    implementationMd: dumpPecas(pecas) || form.implementationMd,
    behaviorMd: form.behaviorMd,
    checkedBase: form.checkedBase, checkedConflicts: form.checkedConflicts,
    checkedTests: form.checkedTests, checkedParity: form.checkedParity,
    checkedMulti: form.checkedMulti, testsRun: form.testsRun,
    testsFailures: form.testsFailures, testsSkipped: form.testsSkipped,
    findingsMd: dumpAchados(achados),
    questionsMd: form.questionsMd, finalCommentMd: form.finalCommentMd,
    evidenceMd: form.evidenceMd,
  }) : ''
  useEffect(() => {
    if (!form || form.status !== 'DRAFT') return
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setSalvando(true)
      try {
        const body = JSON.parse(serializado)
        const atualizado = await updatePrReview(projeto.id, form.id, body)
        setForm((f) => ({ ...f, ...atualizado }))
        setReviews((rs) => rs.map((x) => (x.id === atualizado.id ? atualizado : x)))
        setSalvoEm(new Date().toLocaleTimeString())
      } catch (e) { setErro(e?.response?.data?.detail || String(e.message || e)) }
      finally { setSalvando(false) }
    }, 900)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serializado])

  const criar = async () => {
    let repo = novoRepo.trim()
    let num = novoNum.trim() ? Number(novoNum.trim()) : null
    const parsed = parsePrUrl(novaUrl)
    if (parsed.repo) repo = repo || parsed.repo
    if (parsed.number) num = num || parsed.number
    setCriando(true)
    try {
      const r = await createPrReview(projeto.id, {
        prUrl: novaUrl.trim(), repo, prNumber: num,
        reviewDate: new Date().toISOString().slice(0, 10),
      })
      setNovaUrl('')
      setNovoRepo('')
      setNovoNum('')
      setReviews((rs) => [r, ...rs])
      aplicarFiltrosLimpos()
      abrir(r)
      toast?.({ title: t('Review criado.'), tone: 'success' })
    } catch (e) { setErro(e?.response?.data?.detail || String(e.message || e)) }
    finally { setCriando(false) }
  }
  const aplicarFiltrosLimpos = () => {
    setFRepo('')
    setFAutor('')
    setFStatus('')
    setFVeredito('')
    carregar(projeto.id, { repo: '', author: '', status: '', verdict: '' }).catch(() => {})
  }

  const duplicar = async () => {
    setDuplicando(true)
    try {
      const r = await duplicatePrReview(projeto.id, form.id)
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
      const r = await sendPrReview(projeto.id, form.id)
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
      const r = await reopenPrReview(projeto.id, form.id)
      setForm(r)
      setReviews((rs) => rs.map((x) => (x.id === r.id ? r : x)))
      toast?.({ title: t('Rascunho reaberto.'), tone: 'success' })
    } catch (e) { setErroAcao(e?.response?.data?.detail || String(e.message || e)) }
    finally { setReabrindo(false) }
  }

  const verPrevia = async () => {
    setCarregandoPrevia(true)
    try {
      const txt = await (await fetch(prReviewExportUrl(projeto.id, form.id))).text()
      setPrevia(txt)
    } catch (e) { setPrevia(String(e.message || e)) }
    finally { setCarregandoPrevia(false) }
    setMostraPrevia(true)
  }

  const salvarDestino = async () => {
    setSalvandoDestino(true)
    try {
      const p = await updateProject(projeto.id, { prReviewsPath: destino.trim() || null })
      setProjeto(p)
      setDestino(p.prReviewsPath || '')
      toast?.({ title: t('Pasta salva.'), tone: 'success' })
    } catch (e) { setErro(e?.response?.data?.detail || String(e.message || e)) }
    finally { setSalvandoDestino(false) }
  }

  const carregarDiff = async () => {
    if (diffBusy || !diffRepo.trim() || !diffBase.trim() || !diffBranch.trim()) return
    setDiffBusy(true)
    setDiffOut(null)
    try {
      setDiffOut(await getPrDiff(projeto.id, { repo_path: diffRepo.trim(), base: diffBase.trim(), branch: diffBranch.trim() }))
    } catch (e) {
      setDiffOut({ stat: '', commits: '', erro: e?.response?.data?.detail || String(e.message || e) })
    } finally { setDiffBusy(false) }
  }

  const { erros, avisos } = useMemo(() => (form ? validar(form) : { erros: [], avisos: [] }), [form])
  const repos = useMemo(() => [...new Set(reviews.map((r) => r.repo).filter(Boolean))].sort(), [reviews])
  const autores = useMemo(() => [...new Set(reviews.map((r) => r.prAuthor).filter(Boolean))].sort(), [reviews])
  const historicoPR = useMemo(() => {
    if (!form) return []
    return reviews.filter((r) => (r.repo || '') === (form.repo || '') && r.prNumber === form.prNumber && r.id !== form.id)
      .sort((a, b) => (b.reviewDate || '').localeCompare(a.reviewDate || ''))
  }, [form, reviews])
  const historicoAutor = useMemo(() => {
    if (!form || !form.prAuthor) return []
    return reviews.filter((r) => (r.prAuthor || '') === (form.prAuthor || '') && r.id !== form.id)
      .sort((a, b) => (b.reviewDate || '').localeCompare(a.reviewDate || '')).slice(0, 8)
  }, [form, reviews])

  if (!projeto) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('Reviews de PR')}
          description={t('avaliação de pull requests no formato do template, vinculada ao board.')}
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
  const vereditoLabel = (v) => (VERDICTS.find((x) => x.id === v)?.label || v || '—')
  const vereditoOpcoes = VERDICTS.map((v) => ({ value: v.id || 'none', label: t(v.label) }))

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Reviews de PR')}
        description={`${projeto.key} · ${projeto.name} — ${t('avaliação de pull requests no formato do template, vinculada ao board.')}`}
      />

      {erro && <div role="alert" className={ERRO_CLASSE}>{erro}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={t('Pasta de destino')}
            description={t('Os exports NN-review-pr-*.md são numerados e gravados aqui.')}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="min-w-0 flex-1">
              <Input
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                placeholder="/home/usuario/.../lideranca/reviews"
                aria-label={t('Pasta de destino')}
              />
            </div>
            <Button variant="secondary" onClick={salvarDestino} loading={salvandoDestino}>
              {t('Salvar pasta')}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t('Novo review — colar URL do PR')}
            description={t(HELP.url)}
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input
                value={novaUrl}
                onChange={(e) => setNovaUrl(e.target.value)}
                placeholder="https://dev.azure.com/.../_git/Repo/pullrequest/123"
                aria-label={t('URL do PR')}
              />
            </div>
            <Input
              value={novoRepo}
              onChange={(e) => setNovoRepo(e.target.value)}
              placeholder={t('Repo (se a URL não reconhecer)')}
              aria-label={t('Repo (se a URL não reconhecer)')}
            />
            <Input
              value={novoNum}
              onChange={(e) => setNovoNum(e.target.value)}
              placeholder={t('Nº (se não reconhecer)')}
              aria-label={t('Nº (se não reconhecer)')}
            />
          </div>
          <div className="mt-3">
            <Button onClick={criar} loading={criando}>+ {t('Criar review')}</Button>
          </div>
        </Card>
      </div>

      <Toolbar
        actions={(
          <span className="text-xs text-fg-muted" aria-live="polite">
            {salvando ? t('Salvando rascunho…') : salvoEm ? `${t('Rascunho salvo às')} ${salvoEm}` : ''}
          </span>
        )}
      >
        <div className="w-44">
          <Select
            value={fRepo || 'all'}
            onValueChange={(v) => aplicar('repo', v === 'all' ? '' : v)}
            ariaLabel={t('Todos os repos')}
            options={[
              { value: 'all', label: t('Todos os repos') },
              ...repos.map((r) => ({ value: r, label: r })),
            ]}
          />
        </div>
        <div className="w-44">
          <Select
            value={fAutor || 'all'}
            onValueChange={(v) => aplicar('author', v === 'all' ? '' : v)}
            ariaLabel={t('Todos os autores')}
            options={[
              { value: 'all', label: t('Todos os autores') },
              ...autores.map((a) => ({ value: a, label: a })),
            ]}
          />
        </div>
        <div className="w-40">
          <Select
            value={fStatus || 'all'}
            onValueChange={(v) => aplicar('status', v === 'all' ? '' : v)}
            ariaLabel={t('Todos os status')}
            options={[
              { value: 'all', label: t('Todos os status') },
              { value: 'DRAFT', label: t('Rascunho') },
              { value: 'SENT', label: t('Enviado') },
            ]}
          />
        </div>
        <div className="w-52">
          <Select
            value={fVeredito || 'all'}
            onValueChange={(v) => aplicar('verdict', v === 'all' ? '' : v)}
            ariaLabel={t('Todos os vereditos')}
            options={[
              { value: 'all', label: t('Todos os vereditos') },
              ...VERDICTS.filter((v) => v.id).map((v) => ({ value: v.id, label: t(v.label) })),
            ]}
          />
        </div>
      </Toolbar>

      <DataTable
        columns={[
          {
            key: 'pr',
            header: t('PR'),
            render: (r) => <span className="font-semibold tabular-nums text-fg">#{r.prNumber || '?'}</span>,
          },
          {
            key: 'title',
            header: t('Título'),
            render: (r) => <span className="block max-w-md truncate text-fg">{r.prTitle || t('(sem título)')}</span>,
          },
          {
            key: 'repo',
            header: t('Repo'),
            hideOnMobile: true,
            render: (r) => <span className="text-fg-muted">{r.repo}</span>,
          },
          {
            key: 'author',
            header: t('Autor'),
            hideOnMobile: true,
            render: (r) => <span className="text-fg-muted">{r.prAuthor}</span>,
          },
          {
            key: 'verdict',
            header: t('Veredito'),
            hideOnMobile: true,
            render: (r) => <Badge>{vereditoLabel(r.verdict)}</Badge>,
          },
          {
            key: 'vote',
            header: t('Voto'),
            hideOnMobile: true,
            render: (r) => <span className="tabular-nums text-fg-muted">{r.vote || '—'}</span>,
          },
          {
            key: 'date',
            header: t('Data'),
            hideOnMobile: true,
            render: (r) => <span className="tabular-nums text-fg-muted">{r.reviewDate || '—'}</span>,
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
                #{form.prNumber || '?'} · {form.prTitle || t('(sem título)')}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <Badge variant={form.status === 'SENT' ? 'success' : 'neutral'}>
                  {form.status === 'SENT' ? t('Enviado') : t('Rascunho')}
                </Badge>
                <span>{form.repo} · {form.prAuthor}</span>
                {form.reviewDate && <span>· {form.reviewDate}</span>}
                {salvando && <span>· {t('Salvando rascunho…')}</span>}
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
                title={t('Nova rodada de revisão do mesmo PR, mantendo o conteúdo')}
              >
                {t('Duplicar revisão deste PR')}
              </Button>
              <Button
                as="a"
                variant="secondary"
                href={prReviewExportUrl(projeto.id, form.id)}
                target="_blank"
                rel="noreferrer"
                disabled={erros.length > 0}
                title={erros.join('\n') || t('Numera e grava o .md na pasta de destino')}
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
                <h3 className="text-sm font-semibold text-fg">{t('PR — repositório, número, título, autor')}</h3>
                <p className="text-xs text-fg-muted">{t(HELP.url)}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label={t('Repositório')}>
                    <Input
                      value={form.repo || ''}
                      disabled={travado}
                      onChange={(e) => set('repo', e.target.value)}
                      placeholder={t('Repositório')}
                    />
                  </Field>
                  <Field label={t('Nº')}>
                    <Input
                      value={form.prNumber ?? ''}
                      disabled={travado}
                      onChange={(e) => set('prNumber', e.target.value === '' ? null : Number(e.target.value))}
                      placeholder={t('Nº')}
                    />
                  </Field>
                  <Field label={t('Autor')}>
                    <Input
                      value={form.prAuthor || ''}
                      disabled={travado}
                      onChange={(e) => set('prAuthor', e.target.value)}
                      placeholder={t('Autor')}
                    />
                  </Field>
                </div>
                <Field label={t('Título do PR')}>
                  <Input
                    value={form.prTitle || ''}
                    disabled={travado}
                    onChange={(e) => set('prTitle', e.target.value)}
                    placeholder={t('Título do PR')}
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  <Field label={t('URL do PR')} className="lg:col-span-2">
                    <Input
                      value={form.prUrl || ''}
                      disabled={travado}
                      onChange={(e) => set('prUrl', e.target.value)}
                      placeholder={t('URL do PR')}
                    />
                  </Field>
                  <Field label={t('Branch origem')}>
                    <Input
                      value={form.sourceBranch || ''}
                      disabled={travado}
                      onChange={(e) => set('sourceBranch', e.target.value)}
                      placeholder={t('Branch origem')}
                    />
                  </Field>
                  <Field label={t('Branch alvo')}>
                    <Input
                      value={form.targetBranch || ''}
                      disabled={travado}
                      onChange={(e) => set('targetBranch', e.target.value)}
                      placeholder={t('Branch alvo')}
                    />
                  </Field>
                  <Field label={t('merge-base')}>
                    <Input
                      value={form.mergeBase || ''}
                      disabled={travado}
                      onChange={(e) => set('mergeBase', e.target.value)}
                      placeholder={t('merge-base')}
                    />
                  </Field>
                  <Field label={t('Data')}>
                    <Input
                      type="date"
                      value={form.reviewDate || ''}
                      disabled={travado}
                      onChange={(e) => set('reviewDate', e.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <Field
                label={t('1. Em uma frase (obrigatório, até 200 caracteres)')}
                hint={HELP.frase}
                counter={`${(form.oneSentence || '').length}/200`}
              >
                <Input
                  maxLength={200}
                  value={form.oneSentence || ''}
                  disabled={travado}
                  onChange={(e) => set('oneSentence', e.target.value)}
                />
              </Field>

              <Field label={t('2. O que o PR faz (fluxo)')} hint={HELP.fluxo}>
                <Textarea
                  rows={4}
                  value={form.flowMd || ''}
                  disabled={travado}
                  onChange={(e) => set('flowMd', e.target.value)}
                  placeholder={'1. ...\n2. ...'}
                />
              </Field>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-fg">{t('3. Como foi implementado (peças)')}</h3>
                <p className="text-xs text-fg-muted">{HELP.pecas}</p>
                {pecas.map((p, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-4">
                    <Input
                      value={p.peca}
                      disabled={travado}
                      onChange={(e) => { const c = [...pecas]; c[i] = { ...c[i], peca: e.target.value }; setPecas(c) }}
                      placeholder={t('Peça')}
                      aria-label={t('Peça')}
                    />
                    <div className="sm:col-span-2">
                      <Input
                        value={p.papel}
                        disabled={travado}
                        onChange={(e) => { const c = [...pecas]; c[i] = { ...c[i], papel: e.target.value }; setPecas(c) }}
                        placeholder={t('Papel')}
                        aria-label={t('Papel')}
                      />
                    </div>
                    {!travado && (
                      <Button
                        variant="danger"
                        size="sm"
                        iconOnly
                        aria-label={t('Remover')}
                        title={t('Remover')}
                        onClick={() => setPecas(pecas.filter((_, j) => j !== i))}
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
                    onClick={() => setPecas([...pecas, { peca: '', papel: '' }])}
                  >
                    + {t('Adicionar peça')}
                  </Button>
                )}
              </section>

              <Field label={t('4. O que muda de comportamento')} hint={HELP.comportamento}>
                <Textarea
                  rows={3}
                  value={form.behaviorMd || ''}
                  disabled={travado}
                  onChange={(e) => set('behaviorMd', e.target.value)}
                />
              </Field>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-fg">{t('5. O que eu conferi')}</h3>
                <p className="text-xs text-fg-muted">{HELP.conferi}</p>
                <div className="space-y-2">
                  {CHECKS.map(([campo, rotulo]) => (
                    <Checkbox
                      key={campo}
                      label={rotulo}
                      checked={!!form[campo]}
                      disabled={travado}
                      onCheckedChange={(v) => set(campo, v === true)}
                    />
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label={t('Testes rodados')}>
                    <Input
                      type="number"
                      min="0"
                      value={form.testsRun ?? ''}
                      disabled={travado}
                      onChange={(e) => set('testsRun', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </Field>
                  <Field label={t('falhas')}>
                    <Input
                      type="number"
                      min="0"
                      value={form.testsFailures ?? ''}
                      disabled={travado}
                      onChange={(e) => set('testsFailures', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </Field>
                  <Field label={t('skipped')}>
                    <Input
                      type="number"
                      min="0"
                      value={form.testsSkipped ?? ''}
                      disabled={travado}
                      onChange={(e) => set('testsSkipped', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </Field>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-fg">
                  {t('6. Achados (severidade / arquivo:linha / problema / sugestão)')}
                </h3>
                <p className="text-xs text-fg-muted">{HELP.achados}</p>
                {achados.map((a, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-8">
                    <Input
                      value={a.severidade}
                      disabled={travado}
                      onChange={(e) => { const c = [...achados]; c[i] = { ...c[i], severidade: e.target.value }; setAchados(c) }}
                      placeholder={t('Sev.')}
                      aria-label={t('Sev.')}
                    />
                    <div className="sm:col-span-2">
                      <Input
                        value={a.onde}
                        disabled={travado}
                        onChange={(e) => { const c = [...achados]; c[i] = { ...c[i], onde: e.target.value }; setAchados(c) }}
                        placeholder={t('arquivo:linha')}
                        aria-label={t('arquivo:linha')}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        value={a.problema}
                        disabled={travado}
                        onChange={(e) => { const c = [...achados]; c[i] = { ...c[i], problema: e.target.value }; setAchados(c) }}
                        placeholder={t('Problema')}
                        aria-label={t('Problema')}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        value={a.sugestao}
                        disabled={travado}
                        onChange={(e) => { const c = [...achados]; c[i] = { ...c[i], sugestao: e.target.value }; setAchados(c) }}
                        placeholder={t('Sugestão')}
                        aria-label={t('Sugestão')}
                      />
                    </div>
                    {!travado && (
                      <Button
                        variant="danger"
                        size="sm"
                        iconOnly
                        aria-label={t('Remover')}
                        title={t('Remover')}
                        onClick={() => setAchados(achados.filter((_, j) => j !== i))}
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
                    onClick={() => setAchados([...achados, { severidade: '', onde: '', problema: '', sugestao: '' }])}
                  >
                    + {t('Adicionar achado')}
                  </Button>
                )}
                <Field label={t('Perguntas ao autor:')} hint={HELP.perguntas}>
                  <Textarea
                    rows={2}
                    value={form.questionsMd || ''}
                    disabled={travado}
                    onChange={(e) => set('questionsMd', e.target.value)}
                    placeholder={t('Uma pergunta por linha')}
                  />
                </Field>
              </section>

              <Field label={t('7. Comentário final (para o PR)')} hint={HELP.final}>
                <Textarea
                  rows={4}
                  value={form.finalCommentMd || ''}
                  disabled={travado}
                  onChange={(e) => set('finalCommentMd', e.target.value)}
                />
              </Field>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-fg">{t('8. Veredito, voto e publicação')}</h3>
                <p className="text-xs text-fg-muted">
                  {t('Veredito segue as 4 caixas do template. Voto e publicação ficam registrados na lista.')}
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Field label={t('Veredito')}>
                    <Select
                      value={form.verdict || 'none'}
                      onValueChange={(v) => set('verdict', v === 'none' ? '' : v)}
                      options={vereditoOpcoes}
                      disabled={travado}
                    />
                  </Field>
                  <Field label={t('Voto registrado')}>
                    <Input
                      value={form.vote || ''}
                      disabled={travado}
                      onChange={(e) => set('vote', e.target.value)}
                      placeholder={t('Voto registrado')}
                    />
                  </Field>
                  <Field label={t('Comentário publicado')}>
                    <Input
                      value={form.commentPublished || ''}
                      disabled={travado}
                      onChange={(e) => set('commentPublished', e.target.value)}
                      placeholder={t('Comentário publicado')}
                    />
                  </Field>
                </div>
              </section>

              <Field label={t('Evidências internas (não copiar para o PR)')} hint={HELP.evidencias}>
                <Textarea
                  rows={3}
                  value={form.evidenceMd || ''}
                  disabled={travado}
                  onChange={(e) => set('evidenceMd', e.target.value)}
                />
              </Field>
            </div>

            <aside className="space-y-4">
              <Card variant="flat">
                <CardHeader
                  title={t('Diff local (referência)')}
                  description={t('Somente leitura — rode na mão se preferir.')}
                />
                <div className="mt-3 space-y-2">
                  <Input
                    value={diffRepo}
                    onChange={(e) => setDiffRepo(e.target.value)}
                    placeholder={t('Repo local (caminho absoluto)')}
                    aria-label={t('Repo local (caminho absoluto)')}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={diffBase}
                      onChange={(e) => setDiffBase(e.target.value)}
                      placeholder={t('base')}
                      aria-label={t('base')}
                    />
                    <Input
                      value={diffBranch}
                      onChange={(e) => setDiffBranch(e.target.value)}
                      placeholder={t('branch')}
                      aria-label={t('branch')}
                    />
                  </div>
                  <Button variant="secondary" size="sm" onClick={carregarDiff} loading={diffBusy}>
                    {diffBusy ? '…' : t('Carregar diff')}
                  </Button>
                  {diffOut?.erro && <div role="alert" className={ERRO_CLASSE}>{diffOut.erro}</div>}
                  {diffOut?.stat && <pre className="whitespace-pre-wrap text-xs text-fg">{diffOut.stat}</pre>}
                  {diffOut?.commits && <pre className="whitespace-pre-wrap text-xs text-fg">{diffOut.commits}</pre>}
                </div>
              </Card>

              <Card variant="flat">
                <CardHeader title={t('Histórico deste PR')} />
                {historicoPR.length === 0 ? (
                  <p className="mt-3 text-sm text-fg-muted">{t('Só esta revisão.')}</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {historicoPR.map((r) => (
                      <Button
                        key={r.id}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => abrir(r)}
                      >
                        <span className="min-w-0 flex-1 truncate text-left tabular-nums">
                          {r.reviewDate || '—'} · {vereditoLabel(r.verdict)}
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
                <CardHeader title={t('Outros reviews do autor')} />
                {historicoAutor.length === 0 ? (
                  <p className="mt-3 text-sm text-fg-muted">{t('Nenhum outro.')}</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {historicoAutor.map((r) => (
                      <Button
                        key={r.id}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => abrir(r)}
                      >
                        <span className="min-w-0 flex-1 truncate text-left tabular-nums">
                          #{r.prNumber} {r.repo} · {vereditoLabel(r.verdict)}
                        </span>
                      </Button>
                    ))}
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
