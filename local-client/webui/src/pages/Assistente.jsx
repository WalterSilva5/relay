import { useState, useRef, useEffect } from 'react'
import { assistantChat, getAiProfiles } from '../api'
import { t } from '../i18n'

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
    <div>
      <div className="page-title">{t('Assistente')}</div>
      <div className="subtitle">
        {profiles.length > 0
          ? t(profiles.find((pf) => pf.id === profile)?.description || '')
          : t(
              'Converse com o assistente interno: ele lê o board, sugere prioridades, solicita revisões, cria TODOs e comenta tarefas.'
            )}
      </div>

      {error && <div className="banner">{error}</div>}

      <div
        className="toolbar"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '12px 0' }}
      >
        {profiles.length > 0 && (
          <select
            value={profile}
            onChange={(e) => pickProfile(e.target.value)}
            disabled={loading}
            title={t('Perfil do assistente: cada um tem foco e ferramentas próprias')}
          >
            {profiles.map((pf) => (
              <option key={pf.id} value={pf.id}>
                {pf.icon ? `${pf.icon} ` : ''}{t(pf.name)} — {t(pf.description)}
              </option>
            ))}
          </select>
        )}
        {suggestions.map((s) => (
          <button
            key={s}
            className="ghost"
            onClick={() => send(s)}
            disabled={loading}
          >
            {t(s)}
          </button>
        ))}
      </div>

      <div className="card">
        <div
          ref={scrollRef}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxHeight: '55vh',
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {messages.length === 0 && !loading && (
            <div className="muted">
              {t(
                'Nenhuma mensagem ainda. Faça uma pergunta ou use uma sugestão acima.'
              )}
            </div>
          )}

          {messages.map((m, i) => {
            const isUser = m.role === 'user'
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '78%',
                    padding: '8px 12px',
                    borderRadius: 12,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    background: isUser ? 'var(--accent)' : 'var(--card)',
                    color: isUser ? '#fff' : 'inherit',
                    border: isUser ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {m.content}
                </div>
              </div>
            )
          })}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div
                className="muted"
                style={{
                  maxWidth: '78%',
                  padding: '8px 12px',
                  borderRadius: 12,
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              >
                {t('Pensando...')}
              </div>
            </div>
          )}
        </div>

        <div
          className="row"
          style={{ display: 'flex', gap: 8, marginTop: 12 }}
        >
          <input
            style={{ flex: 1 }}
            placeholder={t('Escreva sua mensagem...')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()}>
            {t('Enviar')}
          </button>
        </div>
      </div>
    </div>
  )
}
