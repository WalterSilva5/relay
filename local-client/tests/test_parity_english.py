"""Parity tests for the english voice router (offline faster-whisper).

Mounts ``relay.api.ext_english.router`` on a fresh FastAPI app so the
SPA catch-all in ``relay.api.app`` cannot shadow the routes. The real
Whisper model is never loaded: ``transcribe_audio`` / ``get_model`` are
monkeypatched in every test that touches them.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import relay.api.ext_english as ext_english


@pytest.fixture
def client():
    sub = FastAPI()
    sub.include_router(ext_english.router)
    with TestClient(sub) as c:
        yield c


def _audio_file(content: bytes = b"fake-audio-bytes", name: str = "speech.webm"):
    return {"audio": (name, content, "audio/webm")}


def test_transcribe_ok(client, monkeypatch):
    seen = {}

    def fake_transcribe(path, language=None):
        seen["path"] = path
        seen["language"] = language
        return "hello world", "en", 2.5

    monkeypatch.setattr(ext_english, "transcribe_audio", fake_transcribe)
    r = client.post("/api/english/transcribe", files=_audio_file())
    assert r.status_code == 200, r.text
    assert r.json() == {"text": "hello world", "language": "en", "durationSec": 2.5}
    # default language mirrors the desktop view (english_view transcribes "en")
    assert seen["language"] == "en"


def test_transcribe_language_passthrough(client, monkeypatch):
    seen = {}

    def fake_transcribe(path, language=None):
        seen["language"] = language
        return "hola", "es", 1.0

    monkeypatch.setattr(ext_english, "transcribe_audio", fake_transcribe)
    r = client.post(
        "/api/english/transcribe",
        files=_audio_file(),
        data={"language": "es"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["language"] == "es"
    assert seen["language"] == "es"


def test_transcribe_missing_audio_is_400(client):
    r = client.post("/api/english/transcribe")
    assert r.status_code == 400, r.text


def test_transcribe_empty_audio_is_400(client):
    r = client.post("/api/english/transcribe", files=_audio_file(b""))
    assert r.status_code == 400, r.text


def test_transcribe_model_unavailable_is_503(client, monkeypatch):
    def no_model(*args, **kwargs):
        raise OSError("model download failed (offline)")

    monkeypatch.setattr(ext_english, "get_model", no_model)
    r = client.post("/api/english/transcribe", files=_audio_file())
    assert r.status_code == 503, r.text


def test_transcribe_unreadable_audio_is_400(client, monkeypatch):
    def bad_audio(path, language=None):
        raise ValueError("Unreadable audio: boom")

    monkeypatch.setattr(ext_english, "transcribe_audio", bad_audio)
    r = client.post("/api/english/transcribe", files=_audio_file())
    assert r.status_code == 400, r.text


def test_transcribe_does_not_import_qt():
    from pathlib import Path

    src = Path(ext_english.__file__).read_text(encoding="utf-8")
    assert "PySide6" not in src and "PyQt" not in src, "ext_english must not pull Qt"
