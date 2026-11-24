import { api } from './api'

// Uploads a recorded audio blob for offline transcription (faster-whisper).
// Returns { text, language, durationSec }.
export const englishTranscribe = (blob, language = 'en') => {
  const fd = new FormData()
  fd.append('audio', blob, 'speech.webm')
  if (language) fd.append('language', language)
  return api.post('/english/transcribe', fd).then((r) => r.data)
}
