import { useEffect, useState } from 'react'
import {
  getCoachConfig, getSettings, putCoachConfig, updateSettings,
  createBackup, listBackups, backupDownloadUrl,
  testAiConnection, listAiModels, verifyAiModel,
} from '../api'
import { getTheme, toggleTheme } from '../theme'
import { t } from '../i18n'
import Icon from '../components/Icon'
import {
  Badge, Button, Card, CardHeader, Dialog, Field, Input, PageHeader,
  SectionTitle, Select, Skeleton, Switch, useToast,
} from '../ui'

export default function Configuracoes() {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState('')
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [coach, setCoach] = useState(null)
  // testes de provedor de IA (mesma checagem do desktop)
  const [testando, setTestando] = useState(false)
  const [listando, setListando] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [modelos, setModelos] = useState([])
  const [modelosOpen, setModelosOpen] = useState(false)
  const [modeloEscolhido, setModeloEscolhido] = useState('')
  // aparência
  const [tema, setTema] = useState(getTheme())
  // backup do banco (quem copia é a API; a tela só dispara e mostra)
  const [backupando, setBackupando] = useState(false)
  const [backups, setBackups] = useState([])
  const [backupDir, setBackupDir] = useState('')
  const [ultimoBackup, setUltimoBackup] = useState(null)
  // resultado dos testes de conexão/modelo (modal, como no desktop)
  const [resultado, setResultado] = useState(null)
  const toast = useToast()

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s)
        setSelectedProviderId(s.activeProviderId)
      })
      .catch((e) => setError(e?.message || t('Erro ao carregar configurações')))
    getCoachConfig()
      .then(setCoach)
      .catch(() => setCoach({ enabled: true, interval_min: 90 }))
    carregarBackups()
  }, [])

  useEffect(() => {
    if (!resultado?.ok) return
    const timer = setTimeout(() => setResultado(null), 2500)
    return () => clearTimeout(timer)
  }, [resultado])

  const carregarBackups = async () => {
    try {
      const d = await listBackups()
      setBackups(d.backups || [])
      setBackupDir(d.dir || '')
    } catch {
      /* sem backup ainda é normal */
    }
  }

  const trocarTema = () => setTema(toggleTheme())

  const flash = (msg) => toast?.({ title: msg, tone: 'success' })

  const fazerBackup = async () => {
    setBackupando(true)
    setError('')
    try {
      const d = await createBackup()
      setUltimoBackup(d.backups?.[0] || null)
      await carregarBackups()
      flash(t('Backup concluído'))
    } catch (e) {
      const detalhe = e?.response?.data?.detail
      setError(typeof detalhe === 'string' ? detalhe : (e?.message || t('Falha no backup')))
    } finally {
      setBackupando(false)
    }
  }

  const tamanho = (bytes) => {
    const kb = (bytes || 0) / 1024
    return kb > 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${Math.round(kb)} KB`
  }

  const saveCoach = async (patch) => {
    try {
      const updated = await putCoachConfig({ ...coach, ...patch })
      setCoach(updated)
      flash(t('Configuração salva'))
    } catch (e) {
      setError(e?.message || t('Erro ao salvar configurações'))
    }
  }

  // — Provedores de IA: testar / listar modelos / verificar modelo (paridade desktop) —
  const _corpoTeste = () => ({ providerId: selectedProviderId })
  const _informe = (ok, msg) => setResultado({ ok, msg })

  const onTestConnection = async () => {
    setTestando(true)
    try {
      const r = await testAiConnection(_corpoTeste())
      _informe(r.ok, r.message)
    } catch (e) {
      _informe(false, e?.response?.data?.detail || e?.message || String(e))
    } finally {
      setTestando(false)
    }
  }

  const onListModels = async () => {
    setListando(true)
    try {
      const r = await listAiModels(_corpoTeste())
      if (r.ok && r.models?.length) {
        setModelos(r.models)
        setModeloEscolhido(r.models[0])
        setModelosOpen(true)
      } else if (r.ok) {
        _informe(false, t('Conectado, mas nenhum modelo retornado.'))
      } else {
        _informe(false, r.message)
      }
    } catch (e) {
      _informe(false, e?.response?.data?.detail || e?.message || String(e))
    } finally {
      setListando(false)
    }
  }

  const usarModelo = async () => {
    if (!modeloEscolhido) return
    setModelosOpen(false)
    editProvider(selectedProviderId, 'model', modeloEscolhido)
    try {
      const vr = await verifyAiModel({ providerId: selectedProviderId, model: modeloEscolhido })
      _informe(vr.ok, vr.message)
    } catch (e) {
      _informe(false, e?.response?.data?.detail || e?.message || String(e))
    }
  }

  const onVerifyModel = async () => {
    setVerificando(true)
    try {
      const r = await verifyAiModel(_corpoTeste())
      _informe(r.ok, r.message)
    } catch (e) {
      _informe(false, e?.response?.data?.detail || e?.message || String(e))
    } finally {
      setVerificando(false)
    }
  }

  const apply = async (patch, okMsg) => {
    setError('')
    try {
      const updated = await updateSettings(patch)
      setSettings(updated)
      if (updated.activeProviderId != null) setSelectedProviderId(updated.activeProviderId)
      if (okMsg) flash(okMsg)
    } catch (e) {
      setError(e?.message || t('Erro ao salvar configurações'))
    }
  }

  const editProvider = (id, field, value) => {
    setSettings((prev) => ({
      ...prev,
      aiProviders: prev.aiProviders.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    }))
  }

  if (!settings) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t('Configurações')}
          description={t('Idioma, provedores de IA e transcrições')}
        />
        {error ? (
          <div className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger">
            {error}
          </div>
        ) : (
          <Card>
            <div className="space-y-3">
              <Skeleton w="w-40" h="h-5" />
              <Skeleton h="h-9" />
              <Skeleton w="w-2/3" h="h-9" />
            </div>
          </Card>
        )}
      </div>
    )
  }

  const current = settings.aiProviders.find((p) => p.id === selectedProviderId) || settings.aiProviders[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Configurações')}
        description={t('Idioma, provedores de IA e transcrições')}
      />

      {error && (
        <div className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Card>
        <CardHeader title={t('Aparência')} description={t('Tema atual:')} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Badge variant="accent" size="md">{tema === 'dark' ? t('Escuro') : t('Claro')}</Badge>
          <Button variant="secondary" size="sm" onClick={trocarTema}>
            <Icon name={tema === 'dark' ? 'sun' : 'moon'} size={15} />
            {tema === 'dark' ? t('Usar tema claro') : t('Usar tema escuro')}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t('Backup do banco')}
          description={t('A API copia o banco do workspace ativo para a pasta de backup do servidor. Nada é gravado pelo navegador.')}
          action={(
            <Button onClick={fazerBackup} loading={backupando}>
              {backupando ? t('Fazendo backup...') : t('Fazer backup agora')}
            </Button>
          )}
        />

        {backupDir && (
          <p className="mt-3 text-xs text-fg-muted">
            {t('Destino:')} <code className="font-mono text-fg">{backupDir}</code>
          </p>
        )}

        {ultimoBackup && (
          <p className="mt-1 text-xs text-fg-muted">
            {t('Último backup:')} <span className="font-medium text-fg">{ultimoBackup.file}</span>
            {' · '}
            {tamanho(ultimoBackup.bytes)}
          </p>
        )}

        {backups.length > 0 && (
          <div className="mt-4">
            <SectionTitle>{t('Últimos backups')}</SectionTitle>
            <div className="mt-2 space-y-1">
              {backups.slice(0, 5).map((b) => (
                <div key={b.file} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-fg-muted">{(b.createdAt || '').replace('T', ' ')}</span>
                  <span className="text-xs text-fg-subtle">{tamanho(b.bytes)}</span>
                  <code className="font-mono text-xs text-fg-muted">{b.file}</code>
                  <span className="flex-1" />
                  <Button as="a" href={backupDownloadUrl(b.file)} download variant="link" size="sm">
                    {t('Baixar')}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {backups.length === 0 && (
          <p className="mt-3 text-xs text-fg-muted">{t('Nenhum backup ainda.')}</p>
        )}
      </Card>

      <Card>
        <div className="max-w-xs">
          <Field label={t('Idioma')} hint={t('Também afeta o app desktop (após reiniciar).')}>
            <Select
              value={settings.language || 'pt'}
              onValueChange={async (value) => {
                await apply({ language: value })
                window.location.reload()
              }}
              options={[
                { value: 'pt', label: t('Português') },
                { value: 'en', label: t('English') },
              ]}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('Provedores de IA')} />

        <div className="mt-4 space-y-4">
          <div className="max-w-sm">
            <Select
              value={selectedProviderId || settings.aiProviders?.[0]?.id || ''}
              onValueChange={setSelectedProviderId}
              ariaLabel={t('Provedores de IA')}
              options={settings.aiProviders.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>

          {current && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('Nome')}>
                  <Input
                    placeholder={t('Nome')}
                    value={current.name || ''}
                    onChange={(e) => editProvider(current.id, 'name', e.target.value)}
                  />
                </Field>

                <Field label="Base URL">
                  <Input
                    placeholder="Base URL"
                    value={current.base_url || ''}
                    onChange={(e) => editProvider(current.id, 'base_url', e.target.value)}
                  />
                </Field>

                <Field label="API Key">
                  <Input
                    type="password"
                    placeholder="API Key"
                    value={current.api_key || ''}
                    onChange={(e) => editProvider(current.id, 'api_key', e.target.value)}
                  />
                </Field>

                <Field label="Model">
                  <Input
                    placeholder="Model"
                    value={current.model || ''}
                    onChange={(e) => editProvider(current.id, 'model', e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={onTestConnection} loading={testando}>
                  <Icon name="activity" size={14} />
                  {t('Testar conexão')}
                </Button>
                <Button variant="secondary" onClick={onListModels} loading={listando}>
                  <Icon name="layers" size={14} />
                  {t('Listar modelos')}
                </Button>
                <Button variant="secondary" onClick={onVerifyModel} loading={verificando}>
                  <Icon name="check" size={14} />
                  {t('Verificar modelo')}
                </Button>
              </div>

              <p className="text-xs text-fg-muted">
                {t('Testar conexão chama /models. Verificar modelo faz uma chamada real mínima (custa 1 token). O modelo listado pode ser selecionado na lista.')}
              </p>
            </>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() =>
                apply(
                  { aiProviders: settings.aiProviders, activeProviderId: selectedProviderId },
                  t('Provedores salvos')
                )
              }
            >
              {t('Salvar')}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={t('Reuniões')}
          description={t('Quanto do projeto entra no contexto da reunião: cards em andamento (mais parados), atrasados e registros recentes da daily.')}
        />

        <div className="mt-4 space-y-4">
          <div className="max-w-xs">
            <Field label="Whisper">
              <Select
                value={settings.whisperModel || 'tiny'}
                onValueChange={(value) => apply({ whisperModel: value }, t('Modelo salvo'))}
                options={[
                  { value: 'tiny', label: 'tiny' },
                  { value: 'base', label: 'base' },
                  { value: 'small', label: 'small' },
                  { value: 'medium', label: 'medium' },
                  { value: 'large-v3', label: 'large-v3' },
                ]}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t('Contexto do copiloto (board e dailies):')}
            </span>
            {[
              ['cards', t('cards parados')],
              ['overdue', t('atrasados')],
              ['dailies', t('dailies')],
            ].map(([campo, rotulo]) => (
              <Field key={campo} label={rotulo} className="w-20">
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={(settings.meetingContext || {})[campo] ?? ''}
                  onChange={(e) => apply({
                    meetingContext: { ...(settings.meetingContext || {}), [campo]: Number(e.target.value) },
                  })}
                />
              </Field>
            ))}
          </div>
        </div>
      </Card>

      {coach && (
        <Card>
          <CardHeader
            title={(
              <span className="inline-flex items-center gap-2">
                <Icon name="sparkles" size={14} />
                {t('Coach proativo')}
              </span>
            )}
            description={t('O agente dá dicas curtas e acionáveis ao longo do dia, com base no seu board e TODOs. Requer um provedor de IA ativo.')}
          />

          <div className="mt-4 space-y-4">
            <Switch
              label={t('Ativar dicas proativas do agente')}
              checked={coach.enabled !== false}
              onCheckedChange={(value) => saveCoach({ enabled: value })}
            />

            <div className="max-w-40">
              <Field label={t('Intervalo (minutos):')}>
                <Input
                  type="number"
                  min="15"
                  max="480"
                  value={coach.interval_min || 90}
                  onChange={(e) => setCoach({ ...coach, interval_min: Number(e.target.value) })}
                  onBlur={(e) => saveCoach({ interval_min: Number(e.target.value) })}
                />
              </Field>
            </div>
          </div>
        </Card>
      )}

      <Dialog
        open={modelosOpen}
        onOpenChange={setModelosOpen}
        title={t('Modelos disponíveis')}
        description={t('Selecione o modelo')}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setModelosOpen(false)}>
              {t('Cancelar')}
            </Button>
            <Button onClick={usarModelo} disabled={!modeloEscolhido}>
              {t('Usar')}
            </Button>
          </>
        )}
      >
        <Select
          value={modeloEscolhido}
          onValueChange={setModeloEscolhido}
          ariaLabel={t('Selecione o modelo')}
          placeholder={t('Selecione o modelo')}
          options={modelos.map((m) => ({ value: m, label: m }))}
        />
      </Dialog>

      <Dialog
        open={Boolean(resultado)}
        onOpenChange={(open) => { if (!open) setResultado(null) }}
        title={resultado?.ok ? t('Conectado') : t('Falhou')}
        footer={<Button onClick={() => setResultado(null)}>{t('Fechar')}</Button>}
      >
        <p className="whitespace-pre-wrap break-words text-base text-fg-muted">{resultado?.msg}</p>
      </Dialog>
    </div>
  )
}
