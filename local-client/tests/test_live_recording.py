"""Gravação ao vivo via HTTP (base do hotkey global no Electron)."""
import pytest
from fastapi.testclient import TestClient

from relay.api.app import app
from relay.db.models import init_db
from relay.transcricoes.live_control import (
    AlreadyRecording,
    LiveRecorder,
    NoAudioAvailable,
    NotRecording,
)


@pytest.fixture
def client(tmp_path):
    db_path = str(tmp_path / "test.db")
    init_db(db_path)
    import relay.db.models as m
    m._engine = None
    m._SessionLocal = None
    m._active_db_path = db_path
    init_db(db_path)
    with TestClient(app) as c:
        yield c
    m._engine = None
    m._SessionLocal = None


class _FakeSession:
    def __init__(self, *a):
        self._running = False

    def start(self):
        self._running = True

    @property
    def is_recording(self):
        return self._running

    def stop_and_save(self, out_path):
        self._running = False
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"fake-wav")
        return out_path, 3.5


class _Src:
    def __init__(self, description):
        self.description = description


@pytest.fixture
def fake_audio(monkeypatch):
    import relay.transcricoes.audio as audio
    monkeypatch.setattr(audio, "parec_available", lambda: True)
    monkeypatch.setattr(audio, "default_mic", lambda: _Src("Mic"))
    monkeypatch.setattr(audio, "default_monitor", lambda: _Src("Monitor"))
    monkeypatch.setattr(audio, "RecordingSession", _FakeSession)


@pytest.fixture
def isolated_ws(tmp_path, monkeypatch, fake_audio):
    import relay.db.models as m
    import relay.config as cfg
    monkeypatch.setattr(m, "DATA_DIR", tmp_path)
    monkeypatch.setattr(cfg, "get_active_workspace_id", lambda: "testws")
    return tmp_path / "workspaces" / "testws" / "recordings"


def test_status_inicial_parado():
    assert LiveRecorder().status() == {"recording": False, "startedAt": None, "title": ""}


def test_start_sem_audio_da_erro():
    import relay.transcricoes.audio as audio
    audio.parec_available_orig = getattr(audio, "parec_available", None)
    old = audio.parec_available
    audio.parec_available = lambda: False
    try:
        with pytest.raises(NoAudioAvailable):
            LiveRecorder().start()
    finally:
        audio.parec_available = old


def test_start_stop_cria_wav_e_recording(isolated_ws):
    rec = LiveRecorder()
    info = rec.start(title="Daily")
    assert info["recording"] is True and info["mic"] == "Mic"
    with pytest.raises(AlreadyRecording):
        rec.start()
    assert rec.status()["recording"] is True
    out = rec.stop()
    assert out["durationSec"] == 3.5
    assert (isolated_ws / out["audioFile"].split("/")[-1]).exists()
    from relay.db.models import Recording, get_session
    s = get_session()
    try:
        row = s.query(Recording).filter(Recording.id == out["recordingId"]).one()
        assert row.title == "Daily" and abs(row.duration - 3.5) < 0.01
    finally:
        s.close()
    with pytest.raises(NotRecording):
        rec.stop()


def test_api_status_stop_sem_gravacao(client):
    assert client.get("/api/recordings/live/status").json()["recording"] is False
    assert client.post("/api/recordings/live/stop").status_code == 409


def test_api_start_stop(client, isolated_ws):
    r = client.post("/api/recordings/live/start", json={"title": "T"})
    assert r.status_code == 201, r.text
    assert client.post("/api/recordings/live/start", json={}).status_code == 409
    assert client.get("/api/recordings/live/status").json()["recording"] is True
    r = client.post("/api/recordings/live/stop")
    assert r.status_code == 200, r.text
    assert r.json()["recordingId"] > 0
