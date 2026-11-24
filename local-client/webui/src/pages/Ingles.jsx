import { useState } from 'react'
import { englishStart, englishMessage, apiError } from '../api'
import { t } from '../i18n'

const LEVELS = [
  ['BEGINNER', 'Iniciante'],
  ['INTERMEDIATE', 'Intermediário'],
  ['ADVANCED', 'Avançado'],
  ['FREE', 'Livre'],
]

export default function Ingles() {
  const [level, setLevel] = useState('INTERMEDIATE')
  const [topic, setTopic] = useState('')
  const [history, setHistory] = useState([])
  const [cards, setCards] = useState([]) // {who, text, suggestion?, feedback?, correction?, vocab?}
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const started = history.length > 0

  const start = async () => {
    setBusy(true)
    setStatus(t('Pensando...'))
    setCards([])
    setHistory([])
    try {
      const res = await englishStart({ level, topic: topic.trim() })
      setHistory([{ role: 'assistant', text: res.reply }])
      setCards([{ who: 'ai', text: res.reply, suggestion: res.suggestion }])
      setStatus('')
    } catch (e) {
      setStatus(apiError(e))
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || !started || busy) return
    setInput('')
    const hist = [...history, { role: 'user', text }]
    setHistory(hist)
    setCards((c) => [...c, { who: 'me', text }])
    setBusy(true)
    setStatus(t('Pensando...'))
    try {
      const res = await englishMessage({ level, topic: topic.trim(), history: hist, message: text })
      setHistory((h) => [...h, { role: 'assistant', text: res.reply }])
      setCards((c) => {
        const next = [...c]
        const lastUser = [...next].reverse().find((m) => m.who === 'me')
        if (lastUser) {
          lastUser.feedback = res.feedback
          lastUser.correction = res.correction
          lastUser.vocab = res.vocab
        }
        next.push({ who: 'ai', text: res.reply, suggestion: res.suggestion })
        return next
      })
      setStatus('')
    } catch (e) {
      setStatus(apiError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1 className="page-title">{t('Praticar Inglês')}</h1>
      <p className="subtitle">{t('Converse em inglês com a IA no seu nível. Escreva e receba correções e vocabulário.')}</p>
      <p className="muted">{t('Entrada por voz disponível só no app desktop.')}</p>

      <div className="toolbar" style={{ marginBottom: 10, alignItems: 'center' }}>
        <label className="muted">{t('Nível:')}</label>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
        </select>
        <input
          style={{ flex: 1, minWidth: 160 }}
          placeholder={t('Tema (opcional): viagem, comida, trabalho...')}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <button onClick={start} disabled={busy}>{t('Iniciar conversa')}</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {cards.length === 0 && <div className="muted">{t('Escolha o nível e inicie a conversa.')}</div>}
        {cards.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.who === 'me' ? 'flex-end' : 'flex-start' }}>
            <div className="card" style={{ maxWidth: 560, textAlign: 'left' }}>
              <div>{m.text}</div>
              {m.correction && <div style={{ fontSize: 12, marginTop: 4 }}>✅ {m.correction}</div>}
              {m.feedback && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>📝 {m.feedback}</div>}
              {m.vocab?.length > 0 && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  🗂 {m.vocab.map((v) => `${v.word} (${v.respell}) — ${v.meaning}`).join(' · ')}
                </div>
              )}
              {m.suggestion && <div className="muted" style={{ fontSize: 12, fontStyle: 'italic', marginTop: 4 }}>💡 {m.suggestion}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="toolbar" style={{ alignItems: 'center' }}>
        <input
          style={{ flex: 1 }}
          placeholder={t('Escreva em inglês...')}
          value={input}
          disabled={!started || busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button onClick={send} disabled={!started || busy}>{t('Enviar')}</button>
        {status && <span className="muted">{status}</span>}
      </div>
    </div>
  )
}
