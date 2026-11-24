"""Voice transcription endpoint for the English practice page.

Companion router for ``relay.api.app``. The integrator owns
``app.include_router(router)``; this module only declares
``router = APIRouter()`` with final ``/api/...`` paths.

Transcription runs offline via faster-whisper (lazy import, no Qt).
Mirrors the desktop flow in ``gui/views/english_view.py`` (record ->
transcribe -> paste text into the conversation), defaulting to English.
"""

from __future__ import annotations

import logging
import os
import tempfile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

logger = logging.getLogger("relay.api.ext_english")

router = APIRouter()

# Single short utterance; anything bigger is almost certainly a wrong file.
MAX_AUDIO_BYTES = 25 * 1024 * 1024


def get_model(*args, **kwargs):
    """Load the offline Whisper model (lazy import, patchable in tests)."""
    from relay.transcricoes.transcriber import get_model as _get_model

    return _get_model(*args, **kwargs)


def transcribe_audio(path: str, language: str | None = None) -> tuple[str, str, float]:
    """Transcribe an audio file with faster-whisper (offline).

    Returns ``(text, language, durationSec)``. Raises ``RuntimeError`` when
    the model cannot be loaded and ``ValueError`` when the audio is
    unreadable.
    """
    from relay.transcricoes.constants import WHISPER_DEFAULT_MODEL

    try:
        model = get_model(WHISPER_DEFAULT_MODEL)
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"Whisper model unavailable: {e}") from e
    try:
        segments, info = model.transcribe(
            path, language=language or "en", beam_size=5, vad_filter=True,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        detected = info.language or language or "en"
        return text, detected, float(info.duration or 0.0)
    except Exception as e:  # noqa: BLE001
        raise ValueError(f"Unreadable audio: {e}") from e


@router.post("/api/english/transcribe")
def english_transcribe(
    audio: UploadFile | None = File(default=None),
    language: str | None = Form(default=None),
):
    """Transcribe a recorded utterance for the English practice page."""
    if audio is None or not (audio.filename or "").strip():
        raise HTTPException(status_code=400, detail="Missing audio file")
    try:
        data = audio.file.read()
    except Exception:  # noqa: BLE001
        data = b""
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="Audio file too large")

    suffix = os.path.splitext(audio.filename or "")[1].lower() or ".webm"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(data)
        tmp.close()
        lang = (language or "").strip() or "en"
        try:
            text, detected, duration = transcribe_audio(tmp.name, lang)
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {"text": text, "language": detected, "durationSec": duration}
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
