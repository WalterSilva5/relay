import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getBoard,
  getMembers,
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

function Campo({ titulo, ajuda, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{titulo}</div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{ajuda}</div>
      {children}
    </div>
  )
}
const inputStyle = { width: '100%' }

export default function PrReviews() {
  const [projeto, setProjeto] = useState(null)
  const [destino, setDestino] = useState('')
  const [reviews, setReviews] = useState([])
  const [fRepo, setFRepo] = useState('')
  const [fAutor, setFAutor] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fVeredito, setFVeredito] = useState('')
  const [selId, setSelId] = useState(null)
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
  const timer = useRef(null)

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
    setReviews(await getPrReviews(pid, params))
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
    setSelId(r.id)
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
  }
  const aplicarFiltrosLimpos = () => {
    setFRepo('')
    setFAutor('')
    setFStatus('')
    setFVeredito('')
    carregar(projeto.id, { repo: '', author: '', status: '', verdict: '' }).catch(() => {})
  }

  const duplicar = async () => {
    const r = await duplicatePrReview(projeto.id, form.id)
    setReviews((rs) => [r, ...rs])
    abrir(r)
  }

  const enviar = async () => {
    setErroAcao('')
    try {
      const r = await sendPrReview(projeto.id, form.id)
      setForm(r)
      setReviews((rs) => rs.map((x) => (x.id === r.id ? r : x)))
    } catch (e) { setErroAcao(e?.response?.data?.detail || String(e.message || e)) }
  }

  const reabrir = async () => {
    setErroAcao('')
    const r = await reopenPrReview(projeto.id, form.id)
    setForm(r)
    setReviews((rs) => rs.map((x) => (x.id === r.id ? r : x)))
  }

  const verPrevia = async () => {
    try {
      const txt = await (await fetch(prReviewExportUrl(projeto.id, form.id))).text()
      setPrevia(txt)
    } catch (e) { setPrevia(String(e.message || e)) }
    setMostraPrevia(true)
  }

  const salvarDestino = async () => {
    try {
      const p = await updateProject(projeto.id, { prReviewsPath: destino.trim() || null })
      setProjeto(p)
      setDestino(p.prReviewsPath || '')
    } catch (e) { setErro(e?.response?.data?.detail || String(e.message || e)) }
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

  if (!projeto) return <div>{erro ? <div className="banner">{erro}</div> : <div className="muted">{t('Carregando...')}</div>}</div>
  const travado = form && form.status !== 'DRAFT'
  const vereditoLabel = (v) => (VERDICTS.find((x) => x.id === v)?.label || v || '—')

  return (
    <div>
      <h1 className="page-title">{t('Reviews de PR')}</h1>
      <p className="subtitle">{projeto.key} · {projeto.name} — {t('avaliação de pull requests no formato do template, vinculada ao board.')}</p>
      {erro && <div className="banner">{erro}</div>}

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="section-title">{t('Pasta de destino')}</div>
        <span className="muted" style={{ fontSize: 11 }}>{t('Os exports NN-review-pr-*.md são numerados e gravados aqui.')}</span>
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="/home/usuario/.../lideranca/reviews" />
          <button className="ghost" onClick={salvarDestino}>{t('Salvar pasta')}</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="section-title">{t('Novo review — colar URL do PR')}</div>
        <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <input style={{ ...inputStyle, flex: 2, minWidth: 220 }} value={novaUrl} onChange={(e) => setNovaUrl(e.target.value)} placeholder="https://dev.azure.com/.../_git/Repo/pullrequest/123" />
          <input style={{ ...inputStyle, flex: 1, minWidth: 120 }} value={novoRepo} onChange={(e) => setNovoRepo(e.target.value)} placeholder={t('Repo (se a URL não reconhecer)')} />
          <input style={{ ...inputStyle, width: 110 }} value={novoNum} onChange={(e) => setNovoNum(e.target.value)} placeholder={t('Nº (se não reconhecer)')} />
          <button onClick={criar}>+ {t('Criar review')}</button>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{t(HELP.url)}</div>
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={fRepo} onChange={(e) => aplicar('repo', e.target.value)}>
          <option value="">{t('Todos os repos')}</option>
          {repos.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={fAutor} onChange={(e) => aplicar('author', e.target.value)}>
          <option value="">{t('Todos os autores')}</option>
          {autores.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => aplicar('status', e.target.value)}>
          <option value="">{t('Todos os status')}</option>
          <option value="DRAFT">{t('Rascunho')}</option>
          <option value="SENT">{t('Enviado')}</option>
        </select>
        <select value={fVeredito} onChange={(e) => aplicar('verdict', e.target.value)}>
          <option value="">{t('Todos os vereditos')}</option>
          {VERDICTS.filter((v) => v.id).map((v) => <option key={v.id} value={v.id}>{t(v.label)}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 11 }}>{salvando ? t('Salvando rascunho…') : salvoEm ? `${t('Rascunho salvo às')} ${salvoEm}` : ''}</span>
      </div>

      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '0 0 340px' }}>
          <div className="section-title">{t('Reviews')}</div>
          {reviews.map((r) => (
            <div key={r.id} onClick={() => abrir(r)} style={{ cursor: 'pointer', padding: '6px 4px', borderLeft: selId === r.id ? '3px solid var(--accent)' : '3px solid transparent', paddingLeft: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>#{r.prNumber || '?'} · {r.prTitle || t('(sem título)')}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                {r.repo} · {r.prAuthor} · {vereditoLabel(r.verdict)} · {r.reviewDate || '—'} · {t('voto')}: {r.vote || '—'}{' '}
                <span className={r.status === 'SENT' ? 'chip success' : 'chip'}>
                  {r.status === 'SENT' ? t('Enviado') : t('Rascunho')}
                </span>
              </div>
            </div>
          ))}
          {reviews.length === 0 && <div className="muted">{t('Nenhum review.')}</div>}
        </div>

        {form && (
          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <strong style={{ marginRight: 'auto' }}>#{form.prNumber || '?'} · {form.prTitle || t('(sem título)')}</strong>
              {form.status === 'DRAFT' ? (
                <button disabled={erros.length > 0} title={erros.join('\n')} onClick={enviar}>{t('Marcar como enviado')}</button>
              ) : (
                <button className="ghost" onClick={reabrir}>{t('Reabrir rascunho')}</button>
              )}
              <button className="ghost" onClick={duplicar} title={t('Nova rodada de revisão do mesmo PR, mantendo o conteúdo')}>{t('Duplicar revisão deste PR')}</button>
              <a href={prReviewExportUrl(projeto.id, form.id)} target="_blank" rel="noreferrer" style={{ pointerEvents: erros.length ? 'none' : 'auto', opacity: erros.length ? 0.4 : 1 }}>
                <button disabled={erros.length > 0} title={erros.join('\n') || t('Numera e grava o .md na pasta de destino')}>{t('Exportar .md')}</button>
              </a>
              <button className="ghost" onClick={verPrevia}>{t('Pré-visualizar')}</button>
            </div>
            {erros.length > 0 && <div className="banner">{erros.map((e, i) => <div key={i}>{e}</div>)}</div>}
            {avisos.length > 0 && <div className="banner" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>{avisos.map((a, i) => <div key={i}>{a}</div>)}</div>}
            {erroAcao && <div className="banner">{erroAcao}</div>}

            <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 3, minWidth: 0 }}>
                <Campo titulo={t('PR — repositório, número, título, autor')} ajuda={t(HELP.url)}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <input style={{ ...inputStyle, flex: 1 }} value={form.repo || ''} disabled={travado} onChange={(e) => set('repo', e.target.value)} placeholder={t('Repositório')} />
                    <input style={{ ...inputStyle, width: 100 }} value={form.prNumber ?? ''} disabled={travado} onChange={(e) => set('prNumber', e.target.value === '' ? null : Number(e.target.value))} placeholder={t('Nº')} />
                    <input style={{ ...inputStyle, flex: 1 }} value={form.prAuthor || ''} disabled={travado} onChange={(e) => set('prAuthor', e.target.value)} placeholder={t('Autor')} />
                  </div>
                  <input style={{ ...inputStyle, marginTop: 6 }} value={form.prTitle || ''} disabled={travado} onChange={(e) => set('prTitle', e.target.value)} placeholder={t('Título do PR')} />
                  <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <input style={{ ...inputStyle, flex: 2 }} value={form.prUrl || ''} disabled={travado} onChange={(e) => set('prUrl', e.target.value)} placeholder={t('URL do PR')} />
                    <input style={{ ...inputStyle, flex: 1 }} value={form.sourceBranch || ''} disabled={travado} onChange={(e) => set('sourceBranch', e.target.value)} placeholder={t('Branch origem')} />
                    <input style={{ ...inputStyle, flex: 1 }} value={form.targetBranch || ''} disabled={travado} onChange={(e) => set('targetBranch', e.target.value)} placeholder={t('Branch alvo')} />
                    <input style={{ ...inputStyle, width: 110 }} value={form.mergeBase || ''} disabled={travado} onChange={(e) => set('mergeBase', e.target.value)} placeholder={t('merge-base')} />
                    <input type="date" value={form.reviewDate || ''} disabled={travado} onChange={(e) => set('reviewDate', e.target.value)} />
                  </div>
                </Campo>

                <Campo titulo={t('1. Em uma frase (obrigatório, até 200 caracteres)')} ajuda={HELP.frase}>
                  <input style={inputStyle} maxLength={200} value={form.oneSentence || ''} disabled={travado} onChange={(e) => set('oneSentence', e.target.value)} />
                  <div className="muted" style={{ fontSize: 10 }}>{(form.oneSentence || '').length}/200</div>
                </Campo>

                <Campo titulo={t('2. O que o PR faz (fluxo)')} ajuda={HELP.fluxo}>
                  <textarea rows={4} style={inputStyle} value={form.flowMd || ''} disabled={travado} onChange={(e) => set('flowMd', e.target.value)} placeholder={'1. ...\n2. ...'} />
                </Campo>

                <Campo titulo={t('3. Como foi implementado (peças)')} ajuda={HELP.pecas}>
                  {pecas.map((p, i) => (
                    <div key={i} className="row" style={{ gap: 4, marginBottom: 4 }}>
                      <input style={{ ...inputStyle, flex: 1 }} value={p.peca} disabled={travado} onChange={(e) => { const c = [...pecas]; c[i] = { ...c[i], peca: e.target.value }; setPecas(c) }} placeholder={t('Peça')} />
                      <input style={{ ...inputStyle, flex: 2 }} value={p.papel} disabled={travado} onChange={(e) => { const c = [...pecas]; c[i] = { ...c[i], papel: e.target.value }; setPecas(c) }} placeholder={t('Papel')} />
                      {!travado && (
                        <button className="danger sm" title={t('Remover')} onClick={() => setPecas(pecas.filter((_, j) => j !== i))}>
                          <Icon name="close" size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  {!travado && <button className="ghost sm" onClick={() => setPecas([...pecas, { peca: '', papel: '' }])}>+ {t('Adicionar peça')}</button>}
                </Campo>

                <Campo titulo={t('4. O que muda de comportamento')} ajuda={HELP.comportamento}>
                  <textarea rows={3} style={inputStyle} value={form.behaviorMd || ''} disabled={travado} onChange={(e) => set('behaviorMd', e.target.value)} />
                </Campo>

                <Campo titulo={t('5. O que eu conferi')} ajuda={HELP.conferi}>
                  {CHECKS.map(([campo, rotulo]) => (
                    <label key={campo} className="row" style={{ gap: 6, fontSize: 12, marginBottom: 2 }}>
                      <input type="checkbox" checked={!!form[campo]} disabled={travado} onChange={(e) => set(campo, e.target.checked)} /> {rotulo}
                    </label>
                  ))}
                  <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <label className="muted" style={{ fontSize: 12 }}>{t('Testes rodados')} <input type="number" min="0" style={{ width: 70 }} value={form.testsRun ?? ''} disabled={travado} onChange={(e) => set('testsRun', e.target.value === '' ? null : Number(e.target.value))} /></label>
                    <label className="muted" style={{ fontSize: 12 }}>{t('falhas')} <input type="number" min="0" style={{ width: 60 }} value={form.testsFailures ?? ''} disabled={travado} onChange={(e) => set('testsFailures', e.target.value === '' ? null : Number(e.target.value))} /></label>
                    <label className="muted" style={{ fontSize: 12 }}>{t('skipped')} <input type="number" min="0" style={{ width: 60 }} value={form.testsSkipped ?? ''} disabled={travado} onChange={(e) => set('testsSkipped', e.target.value === '' ? null : Number(e.target.value))} /></label>
                  </div>
                </Campo>

                <Campo titulo={t('6. Achados (severidade / arquivo:linha / problema / sugestão)')} ajuda={HELP.achados}>
                  {achados.map((a, i) => (
                    <div key={i} className="row" style={{ gap: 4, marginBottom: 4 }}>
                      <input style={{ ...inputStyle, width: 90 }} value={a.severidade} disabled={travado} onChange={(e) => { const c = [...achados]; c[i] = { ...c[i], severidade: e.target.value }; setAchados(c) }} placeholder={t('Sev.')} />
                      <input style={{ ...inputStyle, flex: 1 }} value={a.onde} disabled={travado} onChange={(e) => { const c = [...achados]; c[i] = { ...c[i], onde: e.target.value }; setAchados(c) }} placeholder={t('arquivo:linha')} />
                      <input style={{ ...inputStyle, flex: 2 }} value={a.problema} disabled={travado} onChange={(e) => { const c = [...achados]; c[i] = { ...c[i], problema: e.target.value }; setAchados(c) }} placeholder={t('Problema')} />
                      <input style={{ ...inputStyle, flex: 2 }} value={a.sugestao} disabled={travado} onChange={(e) => { const c = [...achados]; c[i] = { ...c[i], sugestao: e.target.value }; setAchados(c) }} placeholder={t('Sugestão')} />
                      {!travado && (
                        <button className="danger sm" title={t('Remover')} onClick={() => setAchados(achados.filter((_, j) => j !== i))}>
                          <Icon name="close" size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  {!travado && <button className="ghost sm" onClick={() => setAchados([...achados, { severidade: '', onde: '', problema: '', sugestao: '' }])}>+ {t('Adicionar achado')}</button>}
                  <div className="muted" style={{ fontSize: 11, margin: '8px 0 2px' }}><b>{t('Perguntas ao autor:')}</b></div>
                  <textarea rows={2} style={inputStyle} value={form.questionsMd || ''} disabled={travado} onChange={(e) => set('questionsMd', e.target.value)} placeholder={t('Uma pergunta por linha')} />
                </Campo>

                <Campo titulo={t('7. Comentário final (para o PR)')} ajuda={HELP.final}>
                  <textarea rows={4} style={inputStyle} value={form.finalCommentMd || ''} disabled={travado} onChange={(e) => set('finalCommentMd', e.target.value)} />
                </Campo>

                <Campo titulo={t('8. Veredito, voto e publicação')} ajuda={t('Veredito segue as 4 caixas do template. Voto e publicação ficam registrados na lista.')}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <select value={form.verdict || ''} disabled={travado} onChange={(e) => set('verdict', e.target.value)}>
                      {VERDICTS.map((v) => <option key={v.id} value={v.id}>{t(v.label)}</option>)}
                    </select>
                    <input style={{ ...inputStyle, width: 130 }} value={form.vote || ''} disabled={travado} onChange={(e) => set('vote', e.target.value)} placeholder={t('Voto registrado')} />
                    <input style={{ ...inputStyle, width: 170 }} value={form.commentPublished || ''} disabled={travado} onChange={(e) => set('commentPublished', e.target.value)} placeholder={t('Comentário publicado')} />
                  </div>
                </Campo>

                <Campo titulo={t('Evidências internas (não copiar para o PR)')} ajuda={HELP.evidencias}>
                  <textarea rows={3} style={inputStyle} value={form.evidenceMd || ''} disabled={travado} onChange={(e) => set('evidenceMd', e.target.value)} />
                </Campo>

                {mostraPrevia && (
                  <div className="card card-tight" style={{ marginTop: 8 }}>
                    <div className="section-title">{t('Pré-visualização do .md')}</div>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 6 }}>{previa}</pre>
                  </div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="card" style={{ marginBottom: 8 }}>
                  <div className="section-title">{t('Diff local (referência)')}</div>
                  <div className="muted" style={{ fontSize: 11, margin: '2px 0 6px' }}>{t('Somente leitura — rode na mão se preferir.')}</div>
                  <input style={{ ...inputStyle, marginBottom: 4 }} value={diffRepo} onChange={(e) => setDiffRepo(e.target.value)} placeholder={t('Repo local (caminho absoluto)')} />
                  <div className="row" style={{ gap: 4, marginBottom: 4 }}>
                    <input style={{ ...inputStyle, flex: 1 }} value={diffBase} onChange={(e) => setDiffBase(e.target.value)} placeholder={t('base')} />
                    <input style={{ ...inputStyle, flex: 1 }} value={diffBranch} onChange={(e) => setDiffBranch(e.target.value)} placeholder={t('branch')} />
                  </div>
                  <button className="ghost" disabled={diffBusy} onClick={carregarDiff}>{diffBusy ? '…' : t('Carregar diff')}</button>
                  {diffOut?.erro && <div className="banner" style={{ marginTop: 6 }}>{diffOut.erro}</div>}
                  {diffOut?.stat && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, marginTop: 6 }}>{diffOut.stat}</pre>}
                  {diffOut?.commits && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, marginTop: 6 }}>{diffOut.commits}</pre>}
                </div>
                <div className="card" style={{ marginBottom: 8 }}>
                  <div className="section-title">{t('Histórico deste PR')}</div>
                  {historicoPR.length === 0 && <div className="muted" style={{ fontSize: 12 }}>{t('Só esta revisão.')}</div>}
                  {historicoPR.map((r) => (
                    <div key={r.id} className="row" style={{ fontSize: 12, cursor: 'pointer', padding: '2px 0' }} onClick={() => abrir(r)}>
                      <span>• {r.reviewDate || '—'} · {vereditoLabel(r.verdict)}</span>
                      <span className={r.status === 'SENT' ? 'chip success' : 'chip'}>
                        {r.status === 'SENT' ? t('Enviado') : t('Rascunho')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div className="section-title">{t('Outros reviews do autor')}</div>
                  {historicoAutor.length === 0 && <div className="muted" style={{ fontSize: 12 }}>{t('Nenhum outro.')}</div>}
                  {historicoAutor.map((r) => (
                    <div key={r.id} style={{ fontSize: 12, cursor: 'pointer', padding: '2px 0' }} onClick={() => abrir(r)}>
                      • #{r.prNumber} {r.repo} · {vereditoLabel(r.verdict)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
