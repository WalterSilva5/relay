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
  fatos: 'Um fato por linha: o que foi feito, o PR ou card e o que prova. Ex.: "buscar operador · `13993`, PR `#8902` · kit de 42 cenários, 215 testes".',
  frase: 'Uma frase curta, terceira pessoa, sem número de card. Ex.: "Bom progresso na tesouraria com cuidado nos testes de contrato."',
  codigo: 'O que o PR faz em linguagem de negócio, o que muda de comportamento e o que foi testado. Ex.: "Dois caminhos passam a carregar o operador; nada muda com a flag desligada; validado com 42 cenários por rota."',
  p1: 'Entrega: o que foi feito na semana e o efeito no módulo. Ex.: "Fez as correções necessárias para os bugs do módulo e manteve os testes cobrindo os casos."',
  p2: 'Reconhecimento ou UM ponto de atenção, nunca lista. Ex.: "Melhorou nas revisões em relação à semana passada, apontando a causa antes do merge."',
  p3: 'Próximos passos: foco da semana, validar em ambiente, manter o time informado. Ex.: "Na semana atual o foco deve ser concluir a gravação e validar em ambiente."',
  evidencias: 'Fatos secos que sustentam o comentário (não vão ao formulário). Ex.: "PR `#8902` mergeado em 09/11; suíte 2.933 sem classe vermelha nova."',
  proxima: 'Focos da próxima semana em tópicos curtos. Ex.: "Concluir os ajustes do `#8994` e acompanhar as entregas abertas até o merge."',
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

function Campo({ titulo, ajuda, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{titulo}</div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{ajuda}</div>
      {children}
    </div>
  )
}

const inputStyle = { width: '100%', padding: '6px 8px', fontSize: 13 }

export default function Reviews() {
  const [projeto, setProjeto] = useState(null)
  const [membros, setMembros] = useState([])
  const [reviews, setReviews] = useState([])
  const [filtroPessoa, setFiltroPessoa] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [selId, setSelId] = useState(null)
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
  const timer = useRef(null)

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
    setReviews(await getReviews(pid, params))
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
    setSelId(r.id)
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
  }

  const duplicar = async () => {
    const r = await duplicateReview(projeto.id, form.id)
    setReviews((rs) => [r, ...rs])
    abrir(r)
  }

  const enviar = async () => {
    setErroAcao('')
    try {
      const r = await sendReview(projeto.id, form.id)
      setForm(r)
      setReviews((rs) => rs.map((x) => (x.id === r.id ? r : x)))
    } catch (e) { setErroAcao(e?.response?.data?.detail || String(e.message || e)) }
  }

  const reabrir = async () => {
    setErroAcao('')
    const r = await reopenReview(projeto.id, form.id)
    setForm(r)
    setReviews((rs) => rs.map((x) => (x.id === r.id ? r : x)))
  }

  const verPrevia = async () => {
    try {
      const txt = await (await fetch(reviewExportUrl(projeto.id, form.id))).text()
      setPrevia(txt)
    } catch (e) { setPrevia(String(e.message || e)) }
    setMostraPrevia(true)
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

  if (!projeto) return <div>{erro ? <div className="banner">{erro}</div> : <div className="muted">{t('Carregando...')}</div>}</div>
  const travado = form && form.status !== 'DRAFT'

  return (
    <div>
      <h1 className="page-title">{t('Reviews semanais')}</h1>
      <p className="subtitle">{projeto.key} · {projeto.name} — {t('avaliação por pessoa, no formato do vault.')}</p>
      {erro && <div className="banner">{erro}</div>}

      <div className="toolbar" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        <select value={filtroPessoa} onChange={(e) => aplicarFiltros(e.target.value, filtroStatus)}>
          <option value="">{t('Todas as pessoas')}</option>
          {nomes.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={filtroStatus} onChange={(e) => aplicarFiltros(filtroPessoa, e.target.value)}>
          <option value="">{t('Todos os status')}</option>
          <option value="DRAFT">{t('Rascunho')}</option>
          <option value="SENT">{t('Enviado')}</option>
        </select>
        <button onClick={novo}>+ {t('Novo review')}</button>
        <span className="muted" style={{ fontSize: 11 }}>{salvando ? t('Salvando rascunho…') : salvoEm ? tf('Rascunho salvo às {h}', { h: salvoEm }) : ''}</span>
      </div>

      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '0 0 300px' }}>
          <strong>{t('Reviews')}</strong>
          {reviews.map((r) => (
            <div key={r.id} onClick={() => abrir(r)} style={{ cursor: 'pointer', padding: '6px 4px', borderLeft: selId === r.id ? '3px solid var(--accent)' : '3px solid transparent', paddingLeft: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{r.personName} <span className="muted">· {r.periodStart?.slice(5).replace('-', '/')}–{r.periodEnd?.slice(5).replace('-', '/')}</span></div>
              <div className="muted" style={{ fontSize: 11 }}>{r.techScore ?? 'N'}·{t('téc')} / {r.softScore ?? 'N'}·{t('comp')} · {r.status === 'SENT' ? `✅ ${t('Enviado')}` : `📝 ${t('Rascunho')}`}</div>
            </div>
          ))}
          {reviews.length === 0 && <div className="muted">{t('Nenhum review.')}</div>}
        </div>

        {form && (
          <div className="card" style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <strong style={{ marginRight: 'auto' }}>{form.personName} · {form.periodStart}–{form.periodEnd}</strong>
              {form.status === 'DRAFT' ? (
                <button disabled={erros.length > 0} title={erros.join('\n')} onClick={enviar}>{t('Marcar como enviado')}</button>
              ) : (
                <button className="ghost" onClick={reabrir}>{t('Reabrir rascunho')}</button>
              )}
              <button className="ghost" onClick={duplicar} title={t('Copia notas e estrutura para a próxima semana')}>{t('Duplicar da semana anterior')}</button>
              <a href={reviewExportUrl(projeto.id, form.id)} target="_blank" rel="noreferrer" style={{ pointerEvents: erros.length ? 'none' : 'auto', opacity: erros.length ? 0.4 : 1 }}>
                <button disabled={erros.length > 0} title={erros.join('\n') || t('Baixa o .md no formato do vault')}>⬇ {t('Exportar .md')}</button>
              </a>
              <button className="ghost" onClick={verPrevia}>{t('Pré-visualizar')}</button>
            </div>
            {erros.length > 0 && <div className="banner">{erros.map((e, i) => <div key={i}>⛔ {e}</div>)}</div>}
            {avisos.length > 0 && <div className="banner" style={{ background: 'var(--card)' }}>{avisos.map((a, i) => <div key={i}>⚠️ {a}</div>)}</div>}
            {erroAcao && <div className="banner">{erroAcao}</div>}

            <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 3, minWidth: 0 }}>
                <Campo titulo={t('Contexto — pessoa, semana, notas')} ajuda={t('Notas de 1 a 5 (vazio = N). O avaliador sai no cabeçalho do arquivo.')}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <input style={{ ...inputStyle, flex: 1 }} value={form.personName} disabled={travado} onChange={(e) => set('personName', e.target.value)} placeholder={t('Pessoa')} />
                    <input type="date" value={form.periodStart || ''} disabled={travado} onChange={(e) => set('periodStart', e.target.value)} />
                    <input type="date" value={form.periodEnd || ''} disabled={travado} onChange={(e) => set('periodEnd', e.target.value)} />
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <label className="muted" style={{ fontSize: 12 }}>{t('Técnica')} <input type="number" min="1" max="5" style={{ width: 60 }} value={form.techScore ?? ''} disabled={travado} onChange={(e) => set('techScore', e.target.value === '' ? null : Number(e.target.value))} /></label>
                    <label className="muted" style={{ fontSize: 12 }}>{t('Comportamental')} <input type="number" min="1" max="5" style={{ width: 60 }} value={form.softScore ?? ''} disabled={travado} onChange={(e) => set('softScore', e.target.value === '' ? null : Number(e.target.value))} /></label>
                    <input style={{ ...inputStyle, flex: 1 }} value={form.evaluator || ''} disabled={travado} onChange={(e) => set('evaluator', e.target.value)} placeholder={t('Avaliador')} />
                  </div>
                </Campo>

                <Campo titulo={t('Em uma frase (obrigatório, até 200 caracteres)')} ajuda={HELP.frase}>
                  <input style={inputStyle} maxLength={200} value={form.summaryOneLine || ''} disabled={travado} onChange={(e) => set('summaryOneLine', e.target.value)} placeholder={t('Resumo da semana em uma frase')} />
                  <div className="muted" style={{ fontSize: 10 }}>{(form.summaryOneLine || '').length}/200</div>
                </Campo>

                <Campo titulo={t('Fatos — o que / PR ou card / evidência')} ajuda={HELP.fatos}>
                  {fatos.map((f, i) => (
                    <div key={i} className="row" style={{ gap: 4, marginBottom: 4 }}>
                      <input style={{ ...inputStyle, flex: 2 }} value={f.what} disabled={travado} onChange={(e) => { const c = [...fatos]; c[i] = { ...c[i], what: e.target.value }; setFatos(c) }} placeholder={t('O que')} />
                      <input style={{ ...inputStyle, flex: 1 }} value={f.ref} disabled={travado} onChange={(e) => { const c = [...fatos]; c[i] = { ...c[i], ref: e.target.value }; setFatos(c) }} placeholder={t('PR ou card')} />
                      <input style={{ ...inputStyle, flex: 2 }} value={f.evidence} disabled={travado} onChange={(e) => { const c = [...fatos]; c[i] = { ...c[i], evidence: e.target.value }; setFatos(c) }} placeholder={t('Evidência')} />
                      {!travado && <button className="ghost" onClick={() => setFatos(fatos.filter((_, j) => j !== i))}>✕</button>}
                    </div>
                  ))}
                  {!travado && <button className="ghost" onClick={() => setFatos([...fatos, { what: '', ref: '', evidence: '' }])}>+ {t('Adicionar linha')}</button>}
                </Campo>

                <Campo titulo={t('Como aparece no código')} ajuda={HELP.codigo}>
                  <textarea rows={3} style={inputStyle} value={form.codeMd || ''} disabled={travado} onChange={(e) => set('codeMd', e.target.value)} />
                </Campo>

                <Campo titulo={t('Comentário final — 3 blocos (entrega / reconhecimento ou atenção / próximos passos)')} ajuda={t('Terceira pessoa, frases curtas, sem jargão. Um único ponto de atenção ou um reconhecimento.')}>
                  <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>1. {t('Entrega')} — {HELP.p1}</div>
                  <textarea rows={3} style={inputStyle} value={blocos[0]} disabled={travado} onChange={(e) => setBlocos([e.target.value, blocos[1], blocos[2]])} />
                  <div className="muted" style={{ fontSize: 11, margin: '6px 0 2px' }}>2. {t('Reconhecimento ou atenção')} — {HELP.p2}</div>
                  <textarea rows={3} style={inputStyle} value={blocos[1]} disabled={travado} onChange={(e) => setBlocos([blocos[0], e.target.value, blocos[2]])} />
                  <div className="muted" style={{ fontSize: 11, margin: '6px 0 2px' }}>3. {t('Próximos passos')} — {HELP.p3}</div>
                  <textarea rows={3} style={inputStyle} value={blocos[2]} disabled={travado} onChange={(e) => setBlocos([blocos[0], blocos[1], e.target.value])} />
                </Campo>

                <Campo titulo={t('Evidências internas (não vão para o formulário)')} ajuda={HELP.evidencias}>
                  <textarea rows={3} style={inputStyle} value={form.evidenceMd || ''} disabled={travado} onChange={(e) => set('evidenceMd', e.target.value)} />
                </Campo>

                <Campo titulo={t('Próxima semana (proposta)')} ajuda={HELP.proxima}>
                  <textarea rows={2} style={inputStyle} value={form.nextWeekMd || ''} disabled={travado} onChange={(e) => set('nextWeekMd', e.target.value)} placeholder={t('Um foco por linha')} />
                </Campo>

                {mostraPrevia && (
                  <div className="card" style={{ marginTop: 8 }}>
                    <strong>{t('Pré-visualização do .md')}</strong>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 6 }}>{previa}</pre>
                  </div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="card" style={{ marginBottom: 8 }}>
                  <strong>{t('Histórico — nota anterior')}</strong>
                  {historico.anterior ? (
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      <div>{t('Anterior')}: {historico.anterior.periodStart}–{historico.anterior.periodEnd} · {historico.anterior.techScore ?? 'N'}·{t('téc')} / {historico.anterior.softScore ?? 'N'}·{t('comp')}</div>
                      {historico.repetidos.length > 0 && (
                        <div className="muted" style={{ marginTop: 4 }}>{t('Pontos que se repetem')}: {historico.repetidos.join(', ')}</div>
                      )}
                    </div>
                  ) : <div className="muted" style={{ fontSize: 12 }}>{t('Sem review anterior desta pessoa.')}</div>}
                  {historico.lista.length > 1 && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                      {historico.lista.filter((r) => r.id !== form.id).slice(0, 5).map((r) => (
                        <div key={r.id} style={{ cursor: 'pointer' }} onClick={() => abrir(r)}>• {r.periodStart}–{r.periodEnd} · {r.techScore ?? 'N'}/{r.softScore ?? 'N'} · {r.status === 'SENT' ? '✅' : '📝'}</div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="card">
                  <strong>{t('Cards da pessoa no período')}</strong>
                  <div className="muted" style={{ fontSize: 11, margin: '2px 0 6px' }}>{t('Só para referência — clique para copiar o código.')}</div>
                  {cardsPessoa.slice(0, 12).map((tk) => (
                    <div key={tk.id} style={{ fontSize: 12, cursor: 'pointer', padding: '2px 0' }} title={t('Copiar código')}
                      onClick={() => { try { navigator.clipboard.writeText(tk.code || String(tk.id)) } catch {} }}>
                      <b>{tk.code}</b> · {tk.title} <span className="muted">({tk.colName})</span>
                    </div>
                  ))}
                  {cardsPessoa.length === 0 && <div className="muted" style={{ fontSize: 12 }}>{t('Nenhum card no período.')}</div>}
                  {cardsPessoa.length > 12 && <div className="muted" style={{ fontSize: 11 }}>+{cardsPessoa.length - 12}…</div>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
