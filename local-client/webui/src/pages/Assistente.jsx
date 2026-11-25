import { useState, useRef, useEffect } from 'react'
import { assistantChat, getAiProfiles } from '../api'
import { t } from '../i18n'
import Icon from '../components/Icon'
import {
  Button, Card, EmptyState, Input, PageHeader, Select, Spinner, Toolbar,
} from '../ui'

const SUGGESTIONS = [
  'Resuma o board e o que priorizar hoje',
  'Solicite revisão das tarefas em Fazendo',
  'Crie um TODO com os riscos que você identificar',
]

const PROFILE_SUGGESTIONS = {
  tutor: [
    'Onde estou no meu plano de estudos?',
    'Travando em um tópico: o que pode estar faltando na base?',
    'Registre 45 minutos de estudo com confiança 3',
  ],
  revisor: [
    'Revise o board e aponte os maiores riscos',
    'O que precisa de olho humano agora?',
  ],
}

export default function Assistente() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [profiles, setProfiles] = useState([])
  const [profile, setProfile] = useState('estrategista')
  const scrollRef = useRef(null)

  useEffect(() => {
    getAiProfiles().then(setProfiles).catch(() => setProfiles([]))
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  const pickProfile = (id) => {
    setProfile(id)
    setMessages([])
    setError('')
  }

  const suggestions = PROFILE_SUGGESTIONS[profile] || SUGGESTIONS

  async function send(text) {
    const content = (text ?? input).trim()
    if (!content || loading) return

    const history = [...messages, { role: 'user', content }]
    setMessages(history)
    setInput('')
    setError('')
    setLoading(true)

    try {
      const { reply } = await assistantChat(history, profile)
      setMessages([...history, { role: 'assistant', content: reply }])
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        t('Falha ao falar com o assistente.')
      setError(detail)
    } finally {
      setLoading(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Assistente')}
        description={
          profiles.length > 0
            ? t(profiles.find((pf) => pf.id === profile)?.description || '')
            : t(
                'Converse com o assistente interno: ele lê o board, sugere prioridades, solicita revisões, cria TODOs e comenta tarefas.'
              )
        }
      />

      {error && (
        <div className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <Toolbar
        actions={suggestions.map((s) => (
          <Button
            key={s}
            variant="secondary"
            size="sm"
            onClick={() => send(s)}
            disabled={loading}
          >
            {t(s)}
          </Button>
        ))}
      >
        {profiles.length > 0 && (
          <div className="w-full sm:w-64">
            <Select
              value={profile}
              onValueChange={pickProfile}
              disabled={loading}
              ariaLabel={t('Perfil do assistente: cada um tem foco e ferramentas próprias')}
              options={profiles.map((pf) => ({
                value: pf.id,
                label: `${pf.icon ? `${pf.icon} ` : ''}${t(pf.name)} — ${t(pf.description)}`,
              }))}
            />
          </div>
        )}
      </Toolbar>

      <Card className="flex flex-col gap-3">
        <div
          ref={scrollRef}
          className="flex max-h-80 min-h-64 flex-col gap-3 overflow-y-auto"
        >
          {messages.length === 0 && !loading && (
            <EmptyState
              icon={<Icon name="brain" size={18} />}
              title={t(
                'Nenhuma mensagem ainda. Faça uma pergunta ou use uma sugestão acima.'
              )}
            />
          )}

          {messages.map((m, i) => {
            const isUser = m.role === 'user'
            return (
              <div key={i} className={isUser ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-xl whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-base ${
                    isUser ? 'bg-accent-soft text-fg' : 'bg-surface-2 text-fg'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            )
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="flex max-w-xl items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-base text-fg-muted">
                <Spinner size="sm" />
                {t('Pensando...')}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-48 flex-1">
              <Input
                placeholder={t('Escreva sua mensagem...')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading}
                aria-label={t('Escreva sua mensagem...')}
              />
            </div>
            <Button onClick={() => send()} disabled={loading || !input.trim()}>
              {t('Enviar')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
