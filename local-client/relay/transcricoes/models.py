"""Carregamento do modelo Whisper — sem Qt, compartilhado por desktop e API.

O desktop roda em QThread (progresso na tela); o sidecar roda headless. Os dois
precisam do mesmo cache de modelo, então ele vive aqui, sem importar PySide6
(o pacote empacotado exclui Qt).
"""
from __future__ import annotations

import logging

from .constants import (
    WHISPER_COMPUTE_TYPE,
    WHISPER_CPU_THREADS,
    WHISPER_DEFAULT_MODEL,
    WHISPER_SUPPORTED_MODELS,
)

logger = logging.getLogger("relay.transcricoes.models")

_cached_model = None
_cached_size = None


def cpu_threads() -> int:
    """Núcleos para o Whisper, deixando folga para o resto do sistema.

    O ctranslate2 usa TODOS os núcleos por padrão; durante a transcrição ao vivo
    isso saturava a CPU e travava a máquina.
    """
    import os
    if WHISPER_CPU_THREADS > 0:
        return WHISPER_CPU_THREADS
    return max(1, (os.cpu_count() or 2) // 2)


def get_model(model_size: str = WHISPER_DEFAULT_MODEL,
              compute_type: str = WHISPER_COMPUTE_TYPE):
    """Modelo Whisper em cache (recarrega quando o tamanho muda)."""
    global _cached_model, _cached_size
    if model_size not in WHISPER_SUPPORTED_MODELS:
        raise ValueError(f"Modelo Whisper inválido: {model_size}")
    if _cached_model is not None and _cached_size == model_size:
        return _cached_model
    from faster_whisper import WhisperModel
    threads = cpu_threads()
    logger.info("Carregando Whisper '%s' (compute=%s, cpu_threads=%d)...",
                model_size, compute_type, threads)
    _cached_model = WhisperModel(model_size, device="auto", compute_type=compute_type,
                                 cpu_threads=threads, num_workers=1)
    _cached_size = model_size
    return _cached_model


def release_model() -> bool:
    """Libera o modelo da memória (recarrega sozinho no próximo uso)."""
    global _cached_model, _cached_size
    if _cached_model is None:
        return False
    import gc
    logger.info("Liberando Whisper '%s' da memória (ocioso).", _cached_size)
    _cached_model = None
    _cached_size = None
    gc.collect()
    return True
