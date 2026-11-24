"""Gravação ao vivo acionável por HTTP (para o shell Electron/globalShortcut).

Usa `RecordingSession` (threads puras + numpy, sem Qt) de forma que o mesmo
código roda no desktop PySide e no sidecar headless. Uma única sessão por
processo: start com sessão ativa retorna erro (409 na API).
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("relay.transcricoes.live")


class NoAudioAvailable(Exception):
    pass


class AlreadyRecording(Exception):
    pass


class NotRecording(Exception):
    pass


class LiveRecorder:
    """Guarda no máximo uma RecordingSession ativa (thread-safe)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._session = None
        self._started_at: datetime | None = None
        self._title = ""

    def status(self) -> dict:
        with self._lock:
            recording = self._session is not None and self._session.is_recording
            return {
                "recording": recording,
                "startedAt": self._started_at.isoformat() if recording and self._started_at else None,
                "title": self._title if recording else "",
            }

    def start(self, *, mic: bool = True, monitor: bool = True, title: str = "") -> dict:
        from relay.transcricoes.audio import (
            RecordingSession,
            default_mic,
            default_monitor,
            parec_available,
        )

        with self._lock:
            if self._session is not None and self._session.is_recording:
                raise AlreadyRecording("Já existe uma gravação em andamento")
            if not parec_available():
                raise NoAudioAvailable("parec/pactl não encontrados (PipeWire/PulseAudio ausente?)")
            mic_src = default_mic() if mic else None
            mon_src = default_monitor() if monitor else None
            if mic_src is None and mon_src is None:
                raise NoAudioAvailable("Nenhuma fonte de áudio (mic/monitor) disponível")
            session = RecordingSession(mic_src, mon_src)
            session.start()  # levanta RuntimeError se nada abriu de verdade
            self._session = session
            self._started_at = datetime.utcnow()
            self._title = (title or "").strip()
            return {
                "recording": True,
                "startedAt": self._started_at.isoformat(),
                "mic": mic_src.description if mic_src else None,
                "monitor": mon_src.description if mon_src else None,
            }

    def stop(self) -> dict:
        """Para, salva o WAV na pasta do workspace e cria o Recording. Devolve resumo."""
        from relay.config import get_active_workspace_id
        from relay.db.models import DATA_DIR, Recording, get_session

        with self._lock:
            session = self._session
            started_at = self._started_at
            title = self._title
            self._session = None
            self._started_at = None
            self._title = ""
        if session is None or not session.is_recording:
            raise NotRecording("Nenhuma gravação em andamento")
        ws = get_active_workspace_id()
        out = DATA_DIR / "workspaces" / ws / "recordings" / f"rec-{datetime.now().strftime('%Y%m%d-%H%M%S')}.wav"
        try:
            path, duration = session.stop_and_save(out)
        except Exception as e:  # noqa: BLE001
            logger.warning("Falha ao salvar WAV: %s", e)
            raise
        s = get_session()
        try:
            row = Recording(
                title=title or f"Gravação {started_at.strftime('%d/%m %H:%M')}" if started_at else "Gravação",
                duration=duration,
                audio_path=str(path),
            )
            s.add(row)
            s.commit()
            s.refresh(row)
            rec_id = row.id
        finally:
            s.close()
        return {"recording": False, "audioFile": str(path),
                "durationSec": round(duration, 1), "recordingId": rec_id}


# Instância do processo (sidecar e desktop compartilham o mesmo padrão).
live_recorder = LiveRecorder()
