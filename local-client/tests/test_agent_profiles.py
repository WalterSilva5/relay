"""Perfis do assistente (estrategista/tutor/revisor) + tools de estudo."""
import pytest
from fastapi.testclient import TestClient

from relay.ai.profiles import (
    AGENT_PROFILES,
    find_profile,
    profiles_info,
    tools_for_profile,
)
from relay.ai.tools import ALL_TOOLS
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


def _names(tools):
    return {getattr(t, "name", "") for t in tools}


def test_find_profile_default_e_desconhecido():
    assert find_profile(None)["id"] == "estrategista"
    assert find_profile("")["id"] == "estrategista"
    assert find_profile("nao-existe")["id"] == "estrategista"
    assert find_profile("TUTOR")["id"] == "tutor"


def test_allowlist_do_tutor_nao_mexe_no_board():
    todas = _names(ALL_TOOLS)
    tutor = _names(tools_for_profile("tutor", ALL_TOOLS))
    assert tutor < todas
    assert {"list_study_plans", "get_study_plan", "log_study_session"} <= tutor
    assert not ({"request_task_review", "add_task_comment", "list_tasks"} & tutor)


def test_estrategista_tem_tudo_e_revisor_nao_estuda():
    assert _names(tools_for_profile("estrategista", ALL_TOOLS)) == _names(ALL_TOOLS)
    revisor = _names(tools_for_profile("revisor", ALL_TOOLS))
    assert "request_task_review" in revisor
    assert not ({"list_study_plans", "log_study_session"} & revisor)


def test_toda_allowlist_referencia_tool_real():
    todas = _names(ALL_TOOLS)
    for p in AGENT_PROFILES:
        for nome in p.get("tools", []):
            assert nome in todas, f"perfil {p['id']} cita tool inexistente: {nome}"


def test_profiles_info_nao_vaza_prompt():
    info = profiles_info()
    assert {p["id"] for p in info} == {"estrategista", "tutor", "revisor"}
    assert all(set(p) == {"id", "name", "description", "icon"} for p in info)


def test_api_lista_perfis(client):
    r = client.get("/api/ai/profiles")
    assert r.status_code == 200
    ids = {p["id"] for p in r.json()}
    assert {"estrategista", "tutor", "revisor"} <= ids


def test_assistant_chat_recebe_perfil(client, monkeypatch):
    visto = {}

    def fake_run(messages, profile=None):
        visto["profile"] = profile
        return "ok"

    monkeypatch.setattr("relay.ai.agent.run_agent", fake_run)
    r = client.post("/api/assistant/chat", json={
        "messages": [{"role": "user", "content": "oi"}],
        "profile": "tutor",
    })
    assert r.status_code == 200
    assert r.json()["reply"] == "ok"
    assert visto["profile"] == "tutor"


def test_assistant_chat_perfil_padrao(client, monkeypatch):
    visto = {}

    def fake_run(messages, profile=None):
        visto["profile"] = profile
        return "ok"

    monkeypatch.setattr("relay.ai.agent.run_agent", fake_run)
    r = client.post("/api/assistant/chat", json={
        "messages": [{"role": "user", "content": "oi"}],
    })
    assert r.status_code == 200
    assert visto["profile"] == "estrategista"
