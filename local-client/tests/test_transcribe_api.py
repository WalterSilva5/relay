"""Transcrição via API (o que o shell Electron usa para fechar o ciclo)."""
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


def _gravacao(tmp_path, audio=True, transcricao=""):
    from relay.db.models import Recording, get_session
    s = get_session()
    try:
        caminho = ""
        if audio:
            f = tmp_path / "a.wav"
            f.write_bytes(b"RIFF")
            caminho = str(f)
        r = Recording(title="Aula", audio_path=caminho, transcript=transcricao)
        s.add(r)
        s.commit()
        s.refresh(r)
        return r.id
    finally:
        s.close()


class _Seg:
    def __init__(self, start, end, text):
        self.start, self.end, self.text = start, end, text


class _Info:
    language = "pt"
    duration = 42.0


class _Model:
    def transcribe(self, path, language=None, beam_size=5, vad_filter=True):
        return iter([_Seg(0, 2, "bom dia"), _Seg(2, 4, "vamos começar")]), _Info()


@pytest.fixture
def fake_model(monkeypatch):
    import relay.transcricoes.models as tr
    monkeypatch.setattr(tr, "get_model", lambda size, **kw: _Model())


def test_transcreve_e_salva(client, tmp_path, fake_model):
    rid = _gravacao(tmp_path)
    r = client.post(f"/api/recordings/{rid}/transcribe", json={})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["text"] == "bom dia vamos começar"
    assert d["language"] == "pt" and d["durationSec"] == 42.0
    assert len(d["segments"]) == 2
    salvo = client.get(f"/api/recordings/{rid}").json()
    assert salvo["transcript"] == "bom dia vamos começar"


def test_append_soma_ao_texto(client, tmp_path, fake_model):
    rid = _gravacao(tmp_path, transcricao="trecho anterior")
    d = client.post(f"/api/recordings/{rid}/transcribe", json={"append": True}).json()
    assert d["text"] == "trecho anterior bom dia vamos começar"


def test_reuniao_sem_audio_da_400(client, tmp_path):
    rid = _gravacao(tmp_path, audio=False)
    r = client.post(f"/api/recordings/{rid}/transcribe", json={})
    assert r.status_code == 400
    assert "sem áudio" in r.json()["detail"]


def test_audio_inexistente_da_400(client, tmp_path):
    from relay.db.models import Recording, get_session
    s = get_session()
    try:
        r = Recording(title="x", audio_path=str(tmp_path / "nao-existe.wav"))
        s.add(r); s.commit(); s.refresh(r); rid = r.id
    finally:
        s.close()
    assert client.post(f"/api/recordings/{rid}/transcribe", json={}).status_code == 400


def test_modelo_indisponivel_da_503(client, tmp_path, monkeypatch):
    import relay.transcricoes.models as tr

    def explode(size, **kw):
        raise RuntimeError("sem modelo")

    monkeypatch.setattr(tr, "get_model", explode)
    rid = _gravacao(tmp_path)
    r = client.post(f"/api/recordings/{rid}/transcribe", json={})
    assert r.status_code == 503


def test_recording_inexistente_404(client):
    assert client.post("/api/recordings/9999/transcribe", json={}).status_code == 404


def test_engine_nao_importa_qt():
    """O sidecar empacotado exclui PySide6: o módulo não pode importar Qt."""
    import ast
    from pathlib import Path

    arvore = ast.parse(Path("relay/transcricoes/engine.py").read_text(encoding="utf-8"))
    nomes = []
    for no in ast.walk(arvore):
        if isinstance(no, ast.Import):
            nomes += [a.name for a in no.names]
        elif isinstance(no, ast.ImportFrom) and no.module:
            nomes.append(no.module)
    assert not [n for n in nomes if n.split(".")[0] == "PySide6"]
