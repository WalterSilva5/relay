"""Vault de estudos por plano + diagnóstico de pré-requisitos."""
import json

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


def _plan(client, **kw):
    body = {"title": "Plano Vault", "category": "CURSO"}
    body.update(kw)
    r = client.post("/api/study/plans", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_plan_with_docs_path(client, tmp_path):
    vault = str(tmp_path / "estudos")
    p = _plan(client, docsPath=vault)
    assert p["docsPath"] == vault
    r = client.get(f"/api/study/plans/{p['id']}")
    assert r.json()["docsPath"] == vault


def test_update_docs_path_and_reject_relative(client, tmp_path):
    p = _plan(client)
    assert p["docsPath"] == ""
    vault = str(tmp_path / "notas")
    r = client.patch(f"/api/study/plans/{p['id']}", json={"docsPath": vault})
    assert r.status_code == 200
    assert r.json()["docsPath"] == vault
    r = client.patch(f"/api/study/plans/{p['id']}", json={"docsPath": "pasta/relativa"})
    assert r.status_code == 400


def test_save_and_list_docs(client, tmp_path):
    vault = tmp_path / "estudos"
    vault.mkdir()
    p = _plan(client, docsPath=str(vault))
    r = client.post(f"/api/study/plans/{p['id']}/save-doc",
                    json={"title": "Explicar - Closures", "content": "texto da explicação"})
    assert r.status_code == 201, r.text
    nome = r.json()["file"]
    assert nome.endswith(".md") and (vault / nome).exists()
    assert (vault / nome).read_text(encoding="utf-8").startswith("# Explicar - Closures")
    r = client.get(f"/api/study/plans/{p['id']}/docs")
    assert r.status_code == 200
    assert [d["name"] for d in r.json()["docs"]] == [nome]


def test_save_doc_without_vault_is_400(client):
    p = _plan(client)
    r = client.post(f"/api/study/plans/{p['id']}/save-doc",
                    json={"title": "X", "content": "Y"})
    assert r.status_code == 400


class _FakeLLM:
    def __init__(self, payload):
        self._payload = payload

    def invoke(self, _messages):
        class _R:
            pass
        r = _R()
        r.content = self._payload
        return r


def test_diagnose_returns_markdown_and_prereqs(client, monkeypatch):
    import relay.study.assistant as assist
    payload = json.dumps({
        "markdown": "## Diagnóstico\nFalta base de X.",
        "prerequisites": [{"title": "X básico", "estimate_hours": 3}],
    })
    monkeypatch.setattr(assist, "build_chat_model", lambda temperature=0.3: _FakeLLM(payload))
    r = client.post("/api/study/assistant", json={
        "action": "diagnose", "topic": "Closures", "plan": "JS",
        "question": "travo quando a função interna usa variável externa",
        "existing": ["Funções", "Escopo"],
    })
    assert r.status_code == 200, r.text
    result = r.json()["result"]
    assert "Diagnóstico" in result["markdown"]
    assert result["prerequisites"][0]["title"] == "X básico"
