"""Reunião com e sem projeto-alvo: workshop não gera tarefas."""
import pytest
from fastapi.testclient import TestClient

from relay.api.app import app
from relay.db.models import init_db


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


def _projeto(client):
    return client.post("/api/projects", json={"name": "Kickoff", "key": "KCK"}).json()["id"]


def _gravacao(client, project_id=None, transcricao="Falamos sobre boas práticas de teste."):
    from relay.db.models import Recording, get_session
    s = get_session()
    try:
        r = Recording(title="Kickoff", transcript=transcricao, project_id=project_id)
        s.add(r)
        s.commit()
        s.refresh(r)
        return r.id
    finally:
        s.close()


# ---------------------------------------------------------------- análise
def test_workshop_nao_gera_tarefas():
    from relay.meeting_analysis import analyze_meeting

    d = analyze_meeting(transcript="aula sobre testes", workshop=True, use_ai=False)
    assert d["mode"] == "workshop"
    assert d["actionItems"] == []
    assert isinstance(d["tips"], list)


def test_projeto_mantem_modo_project():
    from relay.meeting_analysis import analyze_meeting

    d = analyze_meeting(transcript="reunião", context="- ABC-1 · Título do card — Doing · Fulano · parado há 4d",
                        workshop=False, use_ai=False)
    assert d["mode"] == "project"
    assert d["tips"]


def test_ia_workshop_recebe_flag():
    import relay.meeting_analysis as ma

    visto = {}

    def fake(title, transcript, context, workshop=False):
        visto["workshop"] = workshop
        return {"tips": ["ok"], "plan": [], "actionItems": [{"description": "não deveria"}],
                "decisions": [], "questions": []}

    orig = ma._via_llm
    ma._via_llm = fake
    try:
        d = ma.analyze_meeting(transcript="x", workshop=True, use_ai=True)
    finally:
        ma._via_llm = orig
    assert visto["workshop"] is True
    assert d["actionItems"] == []  # a IA tentou criar tarefa; o modo zera


# ---------------------------------------------------------------- API
def test_analyze_sem_projeto_e_workshop(client):
    rid = _gravacao(client)
    r = client.post(f"/api/recordings/{rid}/analyze", json={})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["mode"] == "workshop"
    assert d["usedProjectContext"] is False
    assert d["actionItems"] == []


def test_analyze_com_projeto_usa_contexto(client):
    pid = _projeto(client)
    rid = _gravacao(client, project_id=pid)
    r = client.post(f"/api/recordings/{rid}/analyze", json={})
    d = r.json()
    assert d["mode"] == "project" and d["projectId"] == pid
    assert d["usedProjectContext"] is True


def test_analyze_forca_workshop_mesmo_com_projeto(client):
    pid = _projeto(client)
    rid = _gravacao(client, project_id=pid)
    d = client.post(f"/api/recordings/{rid}/analyze", json={"mode": "workshop"}).json()
    assert d["mode"] == "workshop" and d["actionItems"] == []


def test_recording_expoe_contexto(client):
    pid = _projeto(client)
    rid = _gravacao(client, project_id=pid)
    d = client.get(f"/api/recordings/{rid}").json()
    assert d["projectId"] == pid and d["contextMode"] == "project"


def test_patch_troca_projeto_da_reuniao(client):
    rid = _gravacao(client)
    assert client.get(f"/api/recordings/{rid}").json()["contextMode"] == "workshop"
    pid = _projeto(client)
    assert client.patch(f"/api/recordings/{rid}", json={"projectId": pid}).status_code == 200
    assert client.get(f"/api/recordings/{rid}").json()["projectId"] == pid
    assert client.patch(f"/api/recordings/{rid}", json={"projectId": 999999}).status_code == 404


def test_live_start_guarda_projeto_no_stop(client, tmp_path, monkeypatch):
    import relay.config as cfg
    import relay.db.models as m
    import relay.transcricoes.audio as audio
    from relay.transcricoes.live_control import LiveRecorder

    monkeypatch.setattr(m, "DATA_DIR", tmp_path)
    monkeypatch.setattr(cfg, "get_active_workspace_id", lambda: "w")

    class _Sess:
        def __init__(self, *a):
            self._running = False

        def start(self):
            self._running = True

        @property
        def is_recording(self):
            return self._running

        def stop_and_save(self, out):
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(b"x")
            return out, 1.0

    class _Src:
        description = "Mic"

    monkeypatch.setattr(audio, "parec_available", lambda: True)
    monkeypatch.setattr(audio, "default_mic", lambda: _Src())
    monkeypatch.setattr(audio, "default_monitor", lambda: None)
    monkeypatch.setattr(audio, "RecordingSession", _Sess)

    pid = _projeto(client)
    rec = LiveRecorder()
    info = rec.start(project_id=pid, context_mode="project")
    assert info["projectId"] == pid and info["contextMode"] == "project"
    out = rec.stop()

    from relay.db.models import Recording, get_session
    s = get_session()
    try:
        assert s.get(Recording, out["recordingId"]).project_id == pid
    finally:
        s.close()


def test_live_start_sem_projeto_e_workshop(monkeypatch):
    import relay.transcricoes.audio as audio
    from relay.transcricoes.live_control import LiveRecorder

    class _Sess:
        def __init__(self, *a):
            self._running = False

        def start(self):
            self._running = True

        @property
        def is_recording(self):
            return self._running

    class _Src:
        description = "Mic"

    monkeypatch.setattr(audio, "parec_available", lambda: True)
    monkeypatch.setattr(audio, "default_mic", lambda: _Src())
    monkeypatch.setattr(audio, "default_monitor", lambda: None)
    monkeypatch.setattr(audio, "RecordingSession", _Sess)

    info = LiveRecorder().start()
    assert info["contextMode"] == "workshop" and info["projectId"] is None
