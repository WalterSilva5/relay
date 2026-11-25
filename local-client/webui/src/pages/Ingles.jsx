import { useRef, useState } from 'react'
import { englishStart, englishMessage, apiError } from '../api'
import { englishTranscribe } from '../api-english'
import { t } from '../i18n'
import Icon from '../components/Icon'
import {
  Button, Card, EmptyState, Field, Input, PageHeader, Select, Toolbar,
} from '../ui'

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
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [audioBlob, setAudioBlob] = useState(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])

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

  const toggleRecord = async () => {
    if (recording) {
      recorderRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data?.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop())
        setRecording(false)
        if (chunksRef.current.length) {
          setAudioBlob(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }))
          setStatus(t('Áudio pronto — clique em Transcrever para colar o texto.'))
        }
      }
      recorderRef.current = rec
      rec.start()
      setAudioBlob(null)
      setRecording(true)
      setStatus(t('Gravando... clique novamente para parar.'))
    } catch (e) {
      setStatus(t('Microfone indisponível: ') + (e?.message || e))
    }
  }

  const sendAudio = async () => {
    if (!audioBlob || transcribing) return
    setTranscribing(true)
    setStatus(t('Transcrevendo...'))
    try {
      const res = await englishTranscribe(audioBlob)
      const text = (res.text || '').trim()
      if (!text) {
        setStatus(t('Não entendi o áudio. Tente de novo.'))
        return
      }
      setInput(text)
      setAudioBlob(null)
      setStatus('')
    } catch (e) {
      setStatus(apiError(e))
    } finally {
      setTranscribing(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Praticar Inglês')}
        description={t('Converse em inglês com a IA no seu nível. Fale ou escreva e receba correções e vocabulário.')}
      />

      <Toolbar actions={<Button onClick={start} loading={busy}>{t('Iniciar conversa')}</Button>}>
        <Field label={t('Nível:')} className="w-40">
          <Select
            value={level}
            onValueChange={setLevel}
            options={LEVELS.map(([value, label]) => ({ value, label: t(label) }))}
          />
        </Field>

        <div className="min-w-48 flex-1">
          <Input
            placeholder={t('Tema (opcional): viagem, comida, trabalho...')}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            aria-label={t('Tema (opcional): viagem, comida, trabalho...')}
          />
        </div>
      </Toolbar>

      <Card className="flex flex-col gap-3">
        <div className="flex max-h-80 min-h-64 flex-col gap-3 overflow-y-auto">
          {cards.length === 0 && (
            <EmptyState
              icon={<Icon name="chat" size={18} />}
              title={t('Escolha o nível e inicie a conversa.')}
            />
          )}

          {cards.map((m, i) => (
            <div key={i} className={m.who === 'me' ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={`max-w-xl rounded-lg px-3 py-2 text-base ${
                  m.who === 'me' ? 'bg-accent-soft text-fg' : 'bg-surface-2 text-fg'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.text}</div>

                {m.correction && (
                  <div className="mt-1 flex items-start gap-1.5 text-sm text-success">
                    <Icon name="check" size={13} />
                    <span>{m.correction}</span>
                  </div>
                )}
                {m.feedback && (
                  <div className="mt-1 flex items-start gap-1.5 text-sm text-fg-muted">
                    <Icon name="chat" size={13} />
                    <span>{m.feedback}</span>
                  </div>
                )}
                {m.vocab?.length > 0 && (
                  <div className="mt-1 flex items-start gap-1.5 text-sm text-fg-muted">
                    <Icon name="book" size={13} />
                    <span>{m.vocab.map((v) => `${v.word} (${v.respell}) — ${v.meaning}`).join(' · ')}</span>
                  </div>
                )}
                {m.suggestion && (
                  <div className="mt-1 flex items-start gap-1.5 text-sm italic text-fg-muted">
                    <Icon name="sparkles" size={13} />
                    <span>{m.suggestion}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-48 flex-1">
              <Input
                placeholder={t('Escreva em inglês...')}
                value={input}
                disabled={!started || busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                aria-label={t('Escreva em inglês...')}
              />
            </div>

            <Button
              variant="secondary"
              iconOnly
              aria-label={t('Gravar voz')}
              title={t('Gravar voz')}
              onClick={toggleRecord}
              disabled={!started || busy || transcribing}
            >
              <Icon name={recording ? 'close' : 'mic'} size={16} />
            </Button>

            <Button
              variant="secondary"
              onClick={sendAudio}
              loading={transcribing}
              disabled={!started || busy || !audioBlob}
            >
              {t('Transcrever')}
            </Button>

            <Button onClick={send} disabled={!started || busy}>{t('Enviar')}</Button>
          </div>

          {status && <p className="mt-2 text-sm text-fg-muted">{status}</p>}
        </div>
      </Card>
    </div>
  )
}
