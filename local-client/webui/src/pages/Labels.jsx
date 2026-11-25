import { useEffect, useState } from 'react'
import { getLabels, createLabel, deleteLabel } from '../api'
import { t } from '../i18n'
import Icon from '../components/Icon'
import {
  Button, Card, CardHeader, DataTable, EmptyState, Field, Input, PageHeader, useToast,
} from '../ui'

// Paleta original preservada no dado (hex é o formato que a API e a GUI já
// gravam). O marcador visual usa classes estáticas do tema, sem estilo inline:
// cada tom tem uma classe correspondente para o ponto e o seletor.
const rgbHex = (r, g, b) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()

const PALETTE = [
  { value: rgbHex(224, 49, 49), dot: 'bg-red-600', label: 'Vermelho' },
  { value: rgbHex(232, 89, 12), dot: 'bg-orange-600', label: 'Laranja' },
  { value: rgbHex(47, 158, 68), dot: 'bg-green-600', label: 'Verde' },
  { value: rgbHex(25, 113, 194), dot: 'bg-blue-700', label: 'Azul' },
  { value: rgbHex(103, 65, 217), dot: 'bg-violet-600', label: 'Violeta' },
  { value: rgbHex(194, 37, 92), dot: 'bg-pink-600', label: 'Rosa' },
  { value: rgbHex(76, 110, 245), dot: 'bg-indigo-500', label: 'Índigo' },
  { value: rgbHex(12, 166, 120), dot: 'bg-teal-600', label: 'Turquesa' },
  { value: rgbHex(240, 140, 0), dot: 'bg-amber-500', label: 'Âmbar' },
  { value: rgbHex(12, 133, 153), dot: 'bg-cyan-600', label: 'Ciano' },
  { value: rgbHex(102, 168, 15), dot: 'bg-lime-600', label: 'Lima' },
  { value: rgbHex(134, 142, 150), dot: 'bg-slate-400', label: 'Cinza' },
]

// Compara sem diferenciar maiúsculas: labels antigas gravavam o hex em caixa alta.
export default function Labels() {
  const [labels, setLabels] = useState([])
  const [name, setName] = useState('')
  const [color, setColor] = useState(PALETTE[0].value)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const toast = useToast()

  const load = () =>
    getLabels().then(setLabels).catch((e) => setError(String(e.message || e)))

  useEffect(() => {
    load()
  }, [])

  const onCreate = async () => {
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      await createLabel(name.trim(), color)
      setName('')
      setColor(PALETTE[0].value)
      setError('')
      load()
      toast({ title: t('Label criada'), tone: 'success' })
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    } finally {
      setCreating(false)
    }
  }

  const onDelete = async (id) => {
    try {
      await deleteLabel(id)
      setError('')
      load()
      toast({ title: t('Label excluída'), tone: 'success' })
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Labels')}
        description={t('Organize suas tarefas com labels coloridas.')}
      />

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <Card>
        <CardHeader title={t('Nova label')} description={t('Escolha um nome e uma cor.')} />

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label={t('Nome da label')}>
            <Input
              value={name}
              placeholder={t('Nome da label')}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onCreate() }}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-fg">{t('Cor')}</span>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Cor')}>
              {PALETTE.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-label={opt.label}
                  aria-pressed={color === opt.value}
                  title={opt.label}
                  onClick={() => setColor(opt.value)}
                  className={[
                    'h-6 w-6 rounded-full border border-border transition-transform hover:scale-110',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                    opt.dot,
                    color === opt.value ? 'ring-2 ring-fg ring-offset-2 ring-offset-surface' : '',
                  ].join(' ')}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Button onClick={onCreate} loading={creating} disabled={creating || !name.trim()}>
            {t('Criar label')}
          </Button>
        </div>
      </Card>

      {labels.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="target" size={20} />}
            title={t('Nenhuma label ainda.')}
            description={t('Crie a primeira label no formulário acima.')}
          />
        </Card>
      ) : (
        <DataTable
          columns={[
            {
              key: 'name',
              header: t('Label'),
              render: (l) => (
                <span className="flex items-center gap-2">
                  <svg viewBox="0 0 10 10" className="size-3 shrink-0" aria-hidden="true">
                    <circle cx="5" cy="5" r="5" fill={l.color || 'currentColor'} />
                  </svg>
                  <span className="font-medium text-fg">{l.name}</span>
                </span>
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (l) => (
                <Button variant="ghost" size="sm" onClick={() => onDelete(l.id)} title={t('Excluir')}>
                  <Icon name="close" size={14} /> {t('Excluir')}
                </Button>
              ),
            },
          ]}
          rows={labels}
          rowKey={(l) => l.id}
          empty={t('Nenhuma label ainda.')}
        />
      )}
    </div>
  )
}
