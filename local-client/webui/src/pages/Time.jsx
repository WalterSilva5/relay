import { useEffect, useMemo, useState } from 'react'
import {
  getWorkspaces, getProjects, getTeamWeekly, saveTeamNote, teamReportUrl,
} from '../api'
import { getActiveProjectId } from '../components/ProjectSelector.jsx'
import { t, tf } from '../i18n'
import { isoLocal } from '../dateutil.js'
import Icon from '../components/Icon'
import {
  Avatar, Badge, Button, Card, CardHeader, Checkbox, Chip, EmptyState, Field,
  PageHeader, Progress, SectionTitle, Skeleton, Spinner, StatCard, Textarea, useToast,
} from '../ui'

const iso = (d) => isoLocal(d)
const hoje = () => iso(new Date())
const somarDias = (dataIso, dias) => {
  const d = new Date(`${dataIso}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return iso(d)
}

const VAZIO = { highlights: '', service: '', attention: '', nextStep: '' }

export default function Time() {
  const [projeto, setProjeto] = useState(null)
  const [semana, setSemana] = useState(hoje())
  const [dados, setDados] = useState(null)
  const [notas, setNotas] = useState({})
  const [salvando, setSalvando] = useState('')
  const [erro, setErro] = useState('')
  const [previa, setPrevia] = useState('')
  const [anonimo, setAnonimo] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const { toast } = useToast()

  // projeto atual vem do seletor do menu (mesma chave do localStorage)
  useEffect(() => {
    ;(async () => {
      try {
        const d = await getWorkspaces()
        const pid = getActiveProjectId(d.active)
        const projetos = await getProjects()
        const achado = projetos.find((p) => String(p.id) === String(pid)) || projetos[0] || null
        setProjeto(achado)
      } catch (e) {
        setErro(String(e.message || e))
      }
    })()
  }, [])

  const carregar = async () => {
    if (!projeto) return
    setCarregando(true)
    try {
      const d = await getTeamWeekly(projeto.id, semana)
      setDados(d)
      const mapa = {}
      for (const m of d.members) mapa[m.name] = { ...VAZIO, ...m.note }
      setNotas(mapa)
      setErro('')
    } catch (e) {
      setErro(e?.response?.data?.detail || String(e.message || e))
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projeto?.id, semana])

  const alterar = (membro, campo, valor) =>
    setNotas((n) => ({ ...n, [membro]: { ...(n[membro] || VAZIO), [campo]: valor } }))

  const salvar = async (membro) => {
    setSalvando(membro)
    try {
      await saveTeamNote(projeto.id, {
        member: membro,
        weekStart: dados.week.start,
        ...(notas[membro] || VAZIO),
      })
      setDados((d) => ({
        ...d,
        members: d.members.map((m) => (m.name === membro ? { ...m, note: { ...notas[membro] } } : m)),
        notesPending: Math.max(0, (d.notesPending || 0) - 1),
      }))
      setPrevia('')
    } catch (e) {
      const detalhe = typeof e?.response?.data?.detail === 'string'
        ? e.response.data.detail
        : String(e.message || e)
      toast({ title: t('Falha ao salvar'), description: detalhe, tone: 'danger' })
    } finally {
      setSalvando('')
    }
  }

  const verPrevia = async (anon = anonimo) => {
    if (!dados) return
    try {
      const r = await fetch(teamReportUrl(projeto.id, dados.week.start, anon))
      setPrevia(await r.text())
    } catch (e) {
      setErro(String(e.message || e))
    }
  }

  const baixar = (anon = false) => {
    if (!dados) return
    window.open(teamReportUrl(projeto.id, dados.week.start, anon), '_blank')
  }

  const copiar = async () => {
    try {
      const r = await fetch(teamReportUrl(projeto.id, dados.week.start, anonimo))
      await navigator.clipboard.writeText(await r.text())
      toast({ title: t('Relatório copiado'), tone: 'success' })
    } catch {
      setErro(t('Não foi possível copiar.'))
    }
  }

  const resumo = dados?.summary
  const semNota = useMemo(
    () => (dados?.members || []).filter((m) => !Object.values(notas[m.name] || {}).some(Boolean)).length,
    [dados, notas],
  )

  if (!projeto && !erro) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('Time')} description={t('Carregando projeto…')} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} h="h-24" />)}
        </div>
      </div>
    )
  }

  if (!projeto) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('Time')} />
        {erro && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {erro}
          </div>
        )}
        <Card padding="none">
          <EmptyState
            icon={<Icon name="users" size={20} />}
            title={t('Escolha um projeto no menu lateral para acompanhar o time.')}
          />
        </Card>
      </div>
    )
  }

  const campos = [
    ['highlights', t('Como está trabalhando')],
    ['service', t('Serviço/apoio (reviews, infra, suporte)')],
    ['attention', t('Pontos de atenção (fatos)')],
    ['nextStep', t('Próximo passo')],
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Time')}
        description={`${projeto.key} · ${projeto.name} — ${t('report semanal por membro, a partir do board + suas anotações')}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                iconOnly
                aria-label={t('Semana anterior')}
                title={t('Semana anterior')}
                onClick={() => setSemana(somarDias(dados?.week?.start || semana, -7))}
              >
                <Icon name="chevronLeft" size={16} />
              </Button>
              <strong className="min-w-40 text-center text-md font-semibold text-fg">
                {dados ? dados.week.label : '—'}
              </strong>
              <Button
                variant="ghost"
                iconOnly
                aria-label={t('Semana seguinte')}
                title={t('Semana seguinte')}
                onClick={() => setSemana(somarDias(dados?.week?.start || semana, 7))}
              >
                <Icon name="chevronLeft" size={16} className="rotate-180" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSemana(hoje())}>
              {t('Hoje')}
            </Button>
          </div>
        }
      />

      {erro && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {erro}
        </div>
      )}
      {carregando && (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner size="sm" />
          {t('Carregando…')}
        </div>
      )}

      {resumo && (
        <section className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('Progresso do board')}
              value={`${resumo.done}/${resumo.cards}`}
              hint={`${resumo.pct}%`}
              icon={<Icon name="board" size={18} />}
            />
            <StatCard
              label={t('Concluídos no período')}
              value={resumo.doneInWeek}
              icon={<Icon name="check" size={18} />}
              tone="success"
            />
            <StatCard
              label={t('Em aberto')}
              value={resumo.open}
              hint={tf('{n} atrasado(s)', { n: resumo.overdue })}
              icon={<Icon name="activity" size={18} />}
              tone={resumo.overdue > 0 ? 'warning' : 'accent'}
            />
            <StatCard
              label={t('Sem responsável')}
              value={resumo.unassigned}
              icon={<Icon name="users" size={18} />}
            />
          </div>

          <Progress value={resumo.pct} tone="success" label={t('Progresso do board')} />

          {resumo.byModule?.length > 0 && (
            <p className="text-xs text-fg-muted">
              {t('Entregas por módulo no período:')} {resumo.byModule.map((m) => `${m.module} ${m.count}`).join(' · ')}
            </p>
          )}
        </section>
      )}

      {dados && (
        <section className="space-y-3">
          {dados.members.length === 0 ? (
            <Card padding="none">
              <EmptyState
                icon={<Icon name="users" size={20} />}
                title={t('Nenhum membro com cards neste projeto.')}
              />
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {dados.members.map((m) => (
                <Card key={m.name}>
                  <CardHeader
                    title={(
                      <span className="flex items-center gap-2">
                        <Avatar name={m.name} size="sm" />
                        <span className="truncate">{m.name}</span>
                      </span>
                    )}
                    description={`${tf('{n} entrega(s) no período', { n: m.deliveredCount })} · ${tf('{n} em aberto', { n: m.open })}`}
                  />

                  <div className="mt-3 space-y-3">
                    <div>
                      <SectionTitle>{t('Entregas')}</SectionTitle>
                      {m.delivered.length === 0 ? (
                        <p className="mt-1 text-sm text-fg-muted">{t('Nenhuma conclusão registrada nesta semana.')}</p>
                      ) : (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.delivered.map((e) => (
                            <Chip
                              key={e.code}
                              variant="accent"
                              title={`${e.title}${e.module ? ` · ${e.module}` : ''}`}
                            >
                              {e.code}{e.module ? ` · ${e.module}` : ''}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <SectionTitle>{t('Em aberto por coluna')}</SectionTitle>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        {m.byColumn.length === 0
                          ? <span className="text-fg-muted">{t('Nada em aberto.')}</span>
                          : m.byColumn.map((c) => (
                            <span key={c.name}>
                              <b className="font-semibold text-fg">{c.count}</b>{' '}
                              <span className="text-fg-muted">{c.name}</span>
                            </span>
                          ))}
                        {m.overdue > 0 && (
                          <Badge variant="danger">
                            {tf('{n} atrasado(s)', { n: m.overdue })}
                          </Badge>
                        )}
                        {m.reviews > 0 && (
                          <span className="text-xs text-fg-muted">· {tf('{n} revisão(ões)', { n: m.reviews })}</span>
                        )}
                      </div>
                    </div>

                    {(m.serviceSuggested || m.reviewedCards?.length > 0) && (
                      <div className="rounded-md border border-border bg-surface-2 p-3">
                        <SectionTitle>{t('Serviço registrado no board')}</SectionTitle>
                        <p className="mt-1 text-sm text-fg">{m.serviceSuggested || '—'}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2"
                          onClick={() => alterar(m.name, 'service', m.serviceSuggested || '')}
                        >
                          {t('Usar no campo Serviço/apoio')}
                        </Button>
                      </div>
                    )}

                    <div className="space-y-3">
                      {campos.map(([campo, rotulo]) => (
                        <Field key={campo} label={rotulo}>
                          <Textarea
                            rows={2}
                            value={(notas[m.name] || VAZIO)[campo] || ''}
                            onChange={(e) => alterar(m.name, campo, e.target.value)}
                            placeholder={campo === 'attention' ? t('ex.: PR sem revisor por 3 dias') : ''}
                          />
                        </Field>
                      ))}
                      <div className="flex justify-end">
                        <Button onClick={() => salvar(m.name)} loading={salvando === m.name}>
                          {salvando === m.name ? t('Salvando…') : t('Salvar anotação')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {dados && (
        <Card>
          <CardHeader
            title={t('Relatório semanal')}
            description={`${t('Markdown no formato dos acompanhamentos do vault.')}${semNota > 0 ? ` · ${tf('{n} membro(s) sem anotação', { n: semNota })}` : ''}`}
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Checkbox
              label={t('Anonimizado (Pessoa A/B/C)')}
              checked={anonimo}
              onCheckedChange={(checked) => {
                setAnonimo(checked)
                setPrevia('')
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => verPrevia()}>
                {t('Pré-visualizar')}
              </Button>
              <Button variant="secondary" size="sm" onClick={copiar}>
                {t('Copiar')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => baixar(anonimo)}>
                {t('Baixar .md')}
              </Button>
            </div>
          </div>

          {previa && (
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-3 text-xs text-fg">
              {previa}
            </pre>
          )}
        </Card>
      )}
    </div>
  )
}
