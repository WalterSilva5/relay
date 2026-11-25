import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProjects, createProject, updateProject, moveProject, getWorkspaces } from '../api'
import { t } from '../i18n'
import Icon from '../components/Icon'
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Field, Input,
  PageHeader, Select, Skeleton, Toolbar, useToast,
} from '../ui'

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [boardUrl, setBoardUrl] = useState('')
  const [error, setError] = useState('')
  const [workspaces, setWorkspaces] = useState([])
  const [creating, setCreating] = useState(false)

  // Diálogos que antes eram prompts do Swal: link do board, previsão e mover.
  const [dialog, setDialog] = useState(null) // 'board' | 'target' | 'move'
  const [target, setTarget] = useState(null)
  const [boardDraft, setBoardDraft] = useState('')
  const [targetDraft, setTargetDraft] = useState('')
  const [moveTarget, setMoveTarget] = useState('')
  const [moveConfirm, setMoveConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [moving, setMoving] = useState(false)

  const nav = useNavigate()
  const toast = useToast()

  const load = () =>
    getProjects().then(setProjects).catch((e) => setError(String(e.message || e)))

  const loadWorkspaces = () =>
    getWorkspaces().then((r) => setWorkspaces(r.workspaces || r)).catch(() => {})

  useEffect(() => {
    load().finally(() => setLoading(false))
    loadWorkspaces()
  }, [])

  const onCreate = async () => {
    if (!name.trim() || !key.trim() || creating) return
    setCreating(true)
    try {
      const body = { name: name.trim(), key: key.trim().toUpperCase() }
      if (boardUrl.trim()) body.boardUrl = boardUrl.trim()
      await createProject(body)
      setName('')
      setKey('')
      setBoardUrl('')
      setError('')
      load()
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
    } finally {
      setCreating(false)
    }
  }

  const closeDialog = () => {
    setDialog(null)
    setTarget(null)
    setMoveConfirm(false)
    setMoveTarget('')
    setSaving(false)
  }

  const onSetBoard = (p) => {
    setTarget(p)
    setBoardDraft(p.boardUrl || '')
    setDialog('board')
  }

  const saveBoard = async () => {
    if (!target || saving) return
    setSaving(true)
    try {
      await updateProject(target.id, { boardUrl: (boardDraft || '').trim() })
      closeDialog()
      load()
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const onSetTarget = (p) => {
    setTarget(p)
    setTargetDraft((p.targetDate || '').slice(0, 10))
    setDialog('target')
  }

  const saveTarget = async () => {
    if (!target || saving) return
    setSaving(true)
    try {
      await updateProject(target.id, { targetDate: targetDraft || null })
      closeDialog()
      load()
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const onMove = (p) => {
    if (workspaces.length <= 1) {
      toast({ title: t('Crie outro workspace antes de mover.'), tone: 'warning' })
      return
    }
    setTarget(p)
    setMoveTarget('')
    setDialog('move')
  }

  const doMove = async () => {
    if (!target || !moveTarget || moving) return
    setMoving(true)
    try {
      await moveProject(target.id, moveTarget)
      closeDialog()
      load()
      toast({ title: t('Projeto movido'), tone: 'success' })
    } catch (e) {
      setError(e.response?.data?.detail || String(e.message || e))
      closeDialog()
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Projetos')}
        description={t('Web UI servida pela própria API do Relay.')}
      />

      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <Toolbar
        actions={(
          <Button onClick={onCreate} loading={creating} disabled={creating}>
            {t('+ Criar projeto')}
          </Button>
        )}
      >
        <Input
          placeholder={t('Nome do projeto')}
          aria-label={t('Nome do projeto')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full sm:w-48"
        />
        <Input
          placeholder={t('Chave (ex: DEMO)')}
          aria-label={t('Chave (ex: DEMO)')}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="w-full sm:w-36"
        />
        <Input
          placeholder={t('Link do board externo (opcional)')}
          aria-label={t('Link do board externo (opcional)')}
          value={boardUrl}
          onChange={(e) => setBoardUrl(e.target.value)}
          className="w-full sm:w-64"
        />
      </Toolbar>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} h="h-40" rounded="rounded-lg" />)}
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Icon name="folder" size={20} />}
            title={t('Nenhum projeto ainda.')}
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card
              key={p.id}
              className="flex cursor-pointer flex-col gap-2 transition-colors hover:border-border-strong"
              role="button"
              tabIndex={0}
              onClick={() => nav(`/board/${p.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  nav(`/board/${p.id}`)
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Badge variant="accent">{p.key}</Badge>
                  <h3 className="mt-1 truncate text-md font-semibold text-fg">{p.name}</h3>
                </div>
                <Icon name="chevronLeft" size={16} className="rotate-180 text-fg-subtle" />
              </div>

              <p className="line-clamp-2 min-h-10 text-sm text-fg-muted">
                {p.description || t('Sem descrição')}
              </p>

              {p.targetDate && (
                <p className="text-xs text-fg-muted">
                  {t('Previsão de entrega')}: {p.targetDate.slice(0, 10).split('-').reverse().join('/')}
                </p>
              )}

              <div
                className="mt-1 flex flex-wrap items-center gap-2 border-t border-border pt-2"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {p.boardUrl ? (
                  <Button
                    as="a"
                    href={p.boardUrl}
                    target="_blank"
                    rel="noreferrer"
                    variant="link"
                    size="sm"
                    title={p.boardUrl}
                  >
                    <Icon name="external" size={12} /> Board
                  </Button>
                ) : (
                  <span className="text-xs text-fg-muted">{t('Sem link do board')}</span>
                )}
                <Button variant="ghost" size="sm" onClick={() => onSetTarget(p)}>
                  {p.targetDate ? t('Editar previsão') : t('Definir previsão')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onSetBoard(p)}>
                  {p.boardUrl ? t('Editar link') : t('Definir link')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onMove(p)}
                  title={t('Mover para outro workspace')}
                  className="ml-auto"
                >
                  <Icon name="folder" size={12} /> {t('Mover')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={dialog === 'board'}
        onOpenChange={(open) => { if (!open) closeDialog() }}
        title={t('Link do board externo (cole a URL):')}
        footer={(
          <>
            <Button variant="secondary" onClick={closeDialog}>{t('Cancelar')}</Button>
            <Button onClick={saveBoard} loading={saving} disabled={saving}>{t('Salvar')}</Button>
          </>
        )}
      >
        <Field label={t('URL')}>
          <Input
            type="url"
            placeholder="https://..."
            value={boardDraft}
            onChange={(e) => setBoardDraft(e.target.value)}
          />
        </Field>
      </Dialog>

      <Dialog
        open={dialog === 'target'}
        onOpenChange={(open) => { if (!open) closeDialog() }}
        title={t('Previsão de entrega do projeto:')}
        footer={(
          <>
            <Button variant="secondary" onClick={closeDialog}>{t('Cancelar')}</Button>
            <Button onClick={saveTarget} loading={saving} disabled={saving}>{t('Salvar')}</Button>
          </>
        )}
      >
        <Field label={t('Data')}>
          <Input
            type="date"
            value={targetDraft}
            onChange={(e) => setTargetDraft(e.target.value)}
          />
        </Field>
      </Dialog>

      <Dialog
        open={dialog === 'move' && !moveConfirm}
        onOpenChange={(open) => { if (!open) closeDialog() }}
        title={t('Mover para workspace')}
        description={target ? `${t('Mover o projeto')} "${target.name}" (${target.key})` : undefined}
        footer={(
          <>
            <Button variant="secondary" onClick={closeDialog}>{t('Cancelar')}</Button>
            <Button
              onClick={() => { setDialog(null); setMoveConfirm(true) }}
              disabled={!moveTarget}
            >
              {t('Mover')}
            </Button>
          </>
        )}
      >
        <Field label={t('Workspace')}>
          <Select
            value={moveTarget || 'NONE'}
            onValueChange={(v) => setMoveTarget(v === 'NONE' ? '' : v)}
            placeholder={t('Selecione um workspace')}
            ariaLabel={t('Selecione um workspace')}
            options={[
              { value: 'NONE', label: t('Selecione um workspace') },
              ...workspaces.map((w) => ({ value: String(w.id), label: `${w.id}: ${w.name}` })),
            ]}
          />
        </Field>
      </Dialog>

      <ConfirmDialog
        open={moveConfirm}
        onOpenChange={(open) => {
          setMoveConfirm(open)
          if (!open) closeDialog()
        }}
        title={t('Confirmar mover')}
        description={target
          ? `${t('Mover o projeto')} "${target.name}" (${target.key}) ${t('para o workspace')} "${moveTarget}"?`
          : undefined}
        confirmLabel={t('Mover')}
        cancelLabel={t('Cancelar')}
        tone="danger"
        loading={moving}
        onConfirm={doMove}
      />
    </div>
  )
}
