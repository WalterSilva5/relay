import { useEffect, useState } from 'react'
import { getDaily, saveDaily, genDailyReport, getDailyActivity } from '../api'
import { t } from '../i18n'
import { isoLocal } from '../dateutil.js'
import Icon from '../components/Icon.jsx'
import {
  Button, Card, CardHeader, EmptyState, Input, PageHeader, Textarea, Toolbar, useToast,
} from '../ui'

function fmtWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function MeuDia() {
  const [date, setDate] = useState(isoLocal())
  const [body, setBody] = useState('')
  const [report, setReport] = useState('')
  const [activity, setActivity] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const { toast } = useToast()

  function load(d) {
    setError('')
    Promise.all([getDaily(d), getDailyActivity(d)])
      .then(([daily, acts]) => {
        setBody(daily?.body || '')
        setReport(daily?.report || '')
        setActivity(Array.isArray(acts) ? acts : [])
      })
      .catch((e) => setError(String(e.message || e)))
  }

  useEffect(() => {
    load(date)
  }, [date])

  function onSave() {
    setError('')
    setSaving(true)
    saveDaily(date, body)
      .then(() => toast?.({ title: t('Salvo'), description: t('Nota do dia'), tone: 'success' }))
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setSaving(false))
  }

  function onGenerate() {
    setError('')
    setGenerating(true)
    genDailyReport(date)
      .then((r) => {
        setReport(r?.report || '')
        toast?.({ title: t('Salvo'), description: t('Relatório do dia'), tone: 'success' })
        load(date)
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setGenerating(false))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Meu Dia')}
        description={t('Anote o que você fez hoje e gere um relatório do dia.')}
      />

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <Toolbar>
        <div className="w-full sm:w-40">
          <Input
            type="date"
            value={date}
            aria-label={t('Data')}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </Toolbar>

      <Card>
        <CardHeader title={t('Nota do dia')} />
        <div className="mt-3 space-y-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('Escreva sua nota em markdown...')}
            rows={14}
            aria-label={t('Nota do dia')}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSave} loading={saving}>
              {saving ? t('Salvando...') : t('Salvar')}
            </Button>
            <Button variant="secondary" onClick={onGenerate} loading={generating}>
              {generating ? t('Gerando...') : t('Gerar relatório do dia')}
            </Button>
          </div>
        </div>
      </Card>

      {report && (
        <Card>
          <CardHeader title={t('Relatório do dia')} />
          <div className="mt-3 whitespace-pre-wrap text-base text-fg">{report}</div>
        </Card>
      )}

      <Card>
        <CardHeader title={t('Atividade do dia')} />

        {activity.length === 0 ? (
          <EmptyState
            icon={<Icon name="activity" size={20} />}
            title={t('Nenhuma atividade.')}
          />
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {activity.map((a, i) => (
              <li key={a.id ?? i} className="flex items-baseline gap-3 py-2">
                <span className="w-12 shrink-0 text-xs tabular-nums text-fg-muted">
                  {fmtWhen(a.createdAt)}
                </span>
                <span className="min-w-0 text-sm text-fg">
                  <span className="font-semibold">{a.action}</span>
                  {a.detail ? ` — ${a.detail}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
