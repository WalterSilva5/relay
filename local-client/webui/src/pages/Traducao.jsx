import { useState } from 'react'
import { translateText } from '../api'
import { t } from '../i18n'
import {
  Button, Card, PageHeader, SectionTitle, Select, Textarea, Toolbar,
} from '../ui'

const LANGS = [
  ['pt', 'Português'],
  ['en', 'Inglês'],
  ['es', 'Espanhol'],
  ['fr', 'Francês'],
  ['de', 'Alemão'],
  ['it', 'Italiano'],
  ['ja', 'Japonês'],
  ['zh', 'Chinês'],
  ['ko', 'Coreano'],
  ['ru', 'Russo'],
]

export default function Traducao() {
  const [source, setSource] = useState('auto')
  const [target, setTarget] = useState('en')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  const swap = () => {
    const newSource = target
    const newTarget = source === 'auto' ? 'en' : source
    setSource(newSource)
    setTarget(newTarget)
    setInput(output)
    setOutput(input)
  }

  const run = async () => {
    if (!input.trim()) return
    setLoading(true)
    setStatus(t('Traduzindo...'))
    try {
      const r = await translateText({ text: input, source, target })
      setOutput(r.translated || '')
      setStatus(source === 'auto' && r.detectedSource ? `${t('Detectado')}: ${r.detectedSource}` : '')
    } catch (e) {
      setStatus(e.response?.data?.detail || String(e.message || e))
    } finally {
      setLoading(false)
    }
  }

  const copy = () => {
    if (output && navigator.clipboard) {
      navigator.clipboard.writeText(output)
      setStatus(t('Copiado!'))
    }
  }

  const langLabel = (code) => {
    const found = LANGS.find(([c]) => c === code)
    return found ? t(found[1]) : code
  }

  const sourceLabel = source === 'auto' ? t('Detectar idioma') : langLabel(source)
  const targetLabel = langLabel(target)

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Tradutor')}
        description={t('Traduza texto entre idiomas (detecção automática da origem).')}
      />

      <Toolbar
        actions={(
          <>
            <Button onClick={run} loading={loading}>
              {loading ? t('Traduzindo...') : t('Traduzir')}
            </Button>
            <Button variant="secondary" onClick={copy}>{t('Copiar')}</Button>
          </>
        )}
      >
        <div className="w-44">
          <Select
            value={source}
            onValueChange={setSource}
            ariaLabel={sourceLabel}
            options={[
              { value: 'auto', label: t('Detectar idioma') },
              ...LANGS.map(([value, label]) => ({ value, label: t(label) })),
            ]}
          />
        </div>

        <Button
          variant="secondary"
          iconOnly
          aria-label={t('Trocar idiomas')}
          title={t('Trocar idiomas')}
          onClick={swap}
        >
          ⇄
        </Button>

        <div className="w-44">
          <Select
            value={target}
            onValueChange={setTarget}
            ariaLabel={targetLabel}
            options={LANGS.map(([value, label]) => ({ value, label: t(label) }))}
          />
        </div>
      </Toolbar>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <SectionTitle>{sourceLabel}</SectionTitle>
          <Textarea
            className="min-h-64 flex-1"
            placeholder={t('Digite o texto...')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label={t('Digite o texto...')}
          />
        </Card>

        <Card className="flex flex-col gap-2">
          <SectionTitle>{targetLabel}</SectionTitle>
          <Textarea
            className="min-h-64 flex-1"
            placeholder={t('Tradução')}
            value={output}
            readOnly
            aria-label={t('Tradução')}
          />
        </Card>
      </div>

      {status && <p className="text-sm text-fg-muted">{status}</p>}
    </div>
  )
}
