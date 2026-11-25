import { useEffect, useState } from 'react'
import { getSkills, getSkill, apiError } from '../api'
import { t } from '../i18n'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SearchInput,
  Select,
  Toolbar,
  useToast,
} from '../ui'

// Radix Select não aceita item com valor vazio: "Todos" usa um sentinela.
const TODAS = '__all__'

export default function Skills() {
  const [skills, setSkills] = useState([])
  const [categories, setCategories] = useState({})
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState('')
  const toast = useToast()

  useEffect(() => {
    getSkills()
      .then((r) => {
        setSkills(r.skills || [])
        setCategories(r.categories || {})
      })
      .catch((e) => setStatus(apiError(e)))
  }, [])

  const openPreview = async (id) => {
    setStatus('')
    try {
      const s = await getSkill(id)
      setPreview(s)
    } catch (e) {
      setStatus(apiError(e))
    }
  }

  const copy = () => {
    if (preview?.content && navigator.clipboard) {
      navigator.clipboard.writeText(preview.content)
      toast({ title: t('Copiado!'), tone: 'success' })
    }
  }

  const download = () => {
    if (!preview?.content) return
    const blob = new Blob([preview.content], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'SKILL.md'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const query = q.trim().toLowerCase()
  const visible = skills.filter((s) => {
    if (cat && s.category !== cat) return false
    if (query && !`${s.name} ${s.description} ${(s.tags || []).join(' ')}`.toLowerCase().includes(query)) return false
    return true
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Skills')}
        description={t('Skills são instruções que ensinam agentes de IA a interagir com o Relay.')}
      />

      <p className="text-sm text-fg-muted">
        {t('A instalação em .claude/skills/ é feita no app desktop (aba Skills). Aqui você visualiza, copia ou baixa o conteúdo.')}
      </p>

      {status && (
        <p role="alert" className="text-sm text-danger">
          {status}
        </p>
      )}

      <Toolbar
        actions={
          <div className="w-full sm:w-44">
            <Select
              ariaLabel={t('Todos')}
              value={cat || TODAS}
              onValueChange={(value) => setCat(value === TODAS ? '' : value)}
              options={[
                { value: TODAS, label: t('Todos') },
                ...Object.entries(categories).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
        }
      >
        <SearchInput
          className="sm:w-64"
          aria-label={t('Buscar skills...')}
          placeholder={t('Buscar skills...')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </Toolbar>

      {preview && (
        <Card>
          <CardHeader
            className="flex-wrap"
            title={preview.name}
            description={preview.filename}
            action={
              <>
                <Button variant="secondary" size="sm" onClick={copy}>
                  {t('Copiar')}
                </Button>
                <Button variant="secondary" size="sm" onClick={download}>
                  {t('Baixar SKILL.md')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                  {t('Fechar preview')}
                </Button>
              </>
            }
          />
          <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-2 p-3 font-mono text-sm text-fg">
            {preview.content}
          </pre>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((s) => (
          <Card key={s.id} className="flex flex-col gap-2">
            <div className="min-w-0">
              <h3 className="text-md font-semibold text-fg">{s.name}</h3>
              <div className="mt-1">
                <Badge variant="accent">{s.categoryLabel || s.category}</Badge>
              </div>
            </div>

            <p className="text-sm text-fg-muted">{s.description}</p>

            {s.tags?.length > 0 && (
              <p className="text-xs text-fg-subtle">{s.tags.join(' · ')}</p>
            )}

            <div className="mt-auto pt-1">
              <Button variant="secondary" size="sm" onClick={() => openPreview(s.id)}>
                {t('Ver conteúdo')}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {visible.length === 0 && <EmptyState title={t('Nada aqui ainda.')} />}
    </div>
  )
}
