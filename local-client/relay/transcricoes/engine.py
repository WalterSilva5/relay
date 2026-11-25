"""Transcrição com faster-whisper — versão SEM Qt (API/sidecar).

O desktop usa `TranscriberWorker` (QThread) para mostrar progresso na GUI. No
sidecar não há Qt (o pacote exclui PySide6), então a transcrição vive aqui, em
funções puras, reutilizáveis pela API e por qualquer cliente.

Uso:
    from relay.transcricoes.engine import transcribe_path, whisper_settings
    resultado = transcribe_path(Path("audio.wav"))
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("relay.transcricoes.engine")


@dataclass
class Trecho:
    start: float
    end: float
    text: str


@dataclass
class Transcricao:
    text: str
    segments: list[Trecho] = field(default_factory=list)
    language: str = ""
    duration: float = 0.0


def whisper_settings() -> tuple[str, str]:
    """(modelo, idioma) das configurações; idioma vazio = autodetecção."""
    from relay.transcricoes.constants import WHISPER_DEFAULT_MODEL

    cfg = {}
    try:
        from relay.config import load_config
        cfg = load_config().get("settings", {}).get("transcricoes", {}) or {}
    except Exception:  # noqa: BLE001 - config ausente não impede transcrever
        cfg = {}
    modelo = (cfg.get("whisper_model") or WHISPER_DEFAULT_MODEL).strip()
    idioma = (cfg.get("whisper_language") or "").strip()
    return modelo, idioma


def transcribe_path(
    audio_path: str | Path,
    *,
    model_size: str | None = None,
    language: str | None = None,
    beam_size: int = 5,
) -> Transcricao:
    """Transcreve o arquivo de áudio/vídeo com faster-whisper (offline).

    Levanta `FileNotFoundError` se o arquivo não existir e `RuntimeError` se o
    modelo não puder ser carregado — o chamador (API) traduz para HTTP.
    """
    caminho = Path(audio_path).expanduser()
    if not caminho.is_file():
        raise FileNotFoundError(f"Áudio não encontrado: {caminho}")

    from relay.transcricoes.models import get_model

    modelo_padrao, idioma_padrao = whisper_settings()
    tamanho = (model_size or modelo_padrao).strip()
    lang = (language if language is not None else idioma_padrao).strip() or None

    try:
        model = get_model(tamanho)
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"modelo Whisper indisponível ({tamanho}): {e}") from e

    segmentos, info = model.transcribe(
        str(caminho), language=lang, beam_size=beam_size, vad_filter=True,
    )
    trechos: list[Trecho] = []
    partes: list[str] = []
    for seg in segmentos:
        texto = (seg.text or "").strip()
        if not texto:
            continue
        trechos.append(Trecho(start=float(seg.start or 0), end=float(seg.end or 0), text=texto))
        partes.append(texto)
    return Transcricao(
        text=" ".join(partes),
        segments=trechos,
        language=getattr(info, "language", "") or "",
        duration=float(getattr(info, "duration", 0.0) or 0.0),
    )
