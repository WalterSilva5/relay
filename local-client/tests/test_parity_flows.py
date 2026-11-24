"""Paridade HTTP do grupo FLUXOS (relay/api/ext_flows.py).

Cada endpoint novo aqui cobre um acesso direto ao SQLite feito pela GUI
sem equivalente em relay/api/app.py. Usa o fixture `temp_db` do conftest
(banco + config.json isolados por teste).
"""
from fastapi.testclient import TestClient

from relay.api.app import app
from relay.api.ext_flows import router

app.include_router(router)
# FastAPI>=0.141 registra routers incluidos de forma lazy no FINAL de
# app.routes — depois do fallback do SPA (GET /{full_path:path}), que
# responde 404 para tudo em /api/*. Sem reordenar, todo GET novo cai no
# fallback. Teste move o router incluido para antes do fallback (só aqui;
# o integrador precisa fazer o mesmo ao plugar os routers ext_* no app).
for _i, _r in enumerate(app.routes):
    if type(_r).__name__ == "_IncludedRouter" and getattr(_r, "original_router", None) is router:
        _inc = app.routes.pop(_i)
        break
else:
    _inc = None
if _inc is not None:
    for _i, _r in enumerate(app.routes):
        if getattr(_r, "path", None) == "/{full_path:path}":
            app.routes.insert(_i, _inc)
            break


def _client():
    return TestClient(app)


def _project(c, name="Flux", key="FLX"):
    r = c.post("/api/projects", json={"name": name, "key": key})
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------------------------------------------------------------------------
# Study sessions — PATCH / DELETE
# ---------------------------------------------------------------------------

def _study_setup(c, pid):
    r = c.post("/api/study/plans", json={"title": "Plano F", "category": "CURSO"})
    assert r.status_code == 200, r.text
    plan_id = r.json()["id"]
    r = c.post(f"/api/study/plans/{plan_id}/topics", json={"title": "Topico 1"})
    assert r.status_code == 200, r.text
    topic_id = r.json()["id"]
    r = c.post("/api/study/sessions", json={
        "topicId": topic_id, "startedAt": "2026-11-20T10:00:00", "durationMin": 60,
    })
    assert r.status_code == 200, r.text
    return plan_id, topic_id, r.json()["id"]


def test_study_session_patch_e_delete(temp_db):
    c = _client()
    pid = _project(c)
    plan_id, topic_id, sid = _study_setup(c, pid)

    r = c.patch(f"/api/study/sessions/{sid}", json={"notes": "revisei tudo", "confidence": 4})
    assert r.status_code == 200, r.text
    assert r.json()["notes"] == "revisei tudo"
    assert r.json()["confidence"] == 4

    # aumentar a duracao ajusta as horas logadas do topico
    r = c.patch(f"/api/study/sessions/{sid}", json={"durationMin": 120})
    assert r.status_code == 200 and r.json()["durationMin"] == 120
    topics = c.get(f"/api/study/plans/{plan_id}/topics")
    assert topics.status_code == 200
    t1 = next(t for t in topics.json() if t["id"] == topic_id)
    assert t1["loggedHours"] == 2.0

    r = c.delete(f"/api/study/sessions/{sid}")
    assert r.status_code == 200 and r.json()["ok"] is True
    assert c.delete(f"/api/study/sessions/{sid}").status_code == 404
    assert c.patch("/api/study/sessions/99999", json={"notes": "x"}).status_code == 404
    # confianca fora de 1-5 eh rejeitada
    _, _, sid2 = _study_setup(c, pid)
    assert c.patch(f"/api/study/sessions/{sid2}", json={"confidence": 9}).status_code == 422


# ---------------------------------------------------------------------------
# Daily — listagem + remocao
# ---------------------------------------------------------------------------

def test_daily_list_e_delete(temp_db):
    c = _client()
    assert c.put("/api/daily/2026-11-20", json={"body": "foco total"}).status_code == 200
    assert c.post("/api/daily/2026-11-20/report").status_code == 200
    assert c.put("/api/daily/2026-11-21", json={"body": "outro dia"}).status_code == 200

    r = c.get("/api/daily", params={"start": "2026-11-20", "end": "2026-11-21"})
    assert r.status_code == 200, r.text
    dias = {d["date"]: d for d in r.json()}
    assert dias["2026-11-20"]["hasBody"] is True
    assert dias["2026-11-20"]["hasReport"] is True
    assert dias["2026-11-21"]["hasReport"] is False

    r = c.delete("/api/daily/2026-11-21")
    assert r.status_code == 200 and r.json()["ok"] is True
    assert c.delete("/api/daily/2026-11-21").status_code == 404
    restam = [d["date"] for d in c.get("/api/daily").json()]
    assert "2026-11-21" not in restam and "2026-11-20" in restam


# ---------------------------------------------------------------------------
# Obsidian — status / config / sync
# ---------------------------------------------------------------------------

def test_obsidian_vaults_e_sync(temp_db, tmp_path):
    c = _client()
    pid = _project(c)
    vault = tmp_path / "vault"
    vault.mkdir()

    r = c.get("/api/obsidian/vaults")
    assert r.status_code == 200, r.text
    item = next(v for v in r.json()["vaults"] if v["projectId"] == pid)
    assert item["configured"] is False

    r = c.put("/api/obsidian/vaults", json={"projectId": pid, "path": str(vault)})
    assert r.status_code == 200 and r.json()["vaultPath"] == str(vault)

    r = c.get("/api/obsidian/vaults")
    item = next(v for v in r.json()["vaults"] if v["projectId"] == pid)
    assert item["configured"] is True and item["exists"] is True

    assert c.put("/api/obsidian/vaults", json={"projectId": 9999, "path": str(vault)}).status_code == 404
    assert c.put("/api/obsidian/vaults", json={"projectId": pid, "path": "relativo/x"}).status_code == 400

    r = c.post("/api/obsidian/sync", json={"projectId": pid})
    assert r.status_code == 200, r.text
    assert r.json()["synced"] == 1
    base = vault / "Flux"
    assert (base / "README.md").exists()
    assert list((base / "Board").glob("*.md"))

    # limpar o mapeamento -> sync sem nada configurado falha com 400
    assert c.put("/api/obsidian/vaults", json={"projectId": pid, "path": ""}).status_code == 200
    item = next(v for v in c.get("/api/obsidian/vaults").json()["vaults"] if v["projectId"] == pid)
    assert item["configured"] is False
    r = c.post("/api/obsidian/sync", json={})
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Recordings — criacao + save-to-daily
# ---------------------------------------------------------------------------

def test_recordings_create_e_save_to_daily(temp_db):
    c = _client()
    r = c.post("/api/recordings", json={
        "title": "Reuniao X", "kind": "meeting", "topic": "planejamento",
        "transcript": "falamos do cronograma", "language": "pt", "duration": 12.5,
    })
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["hasTranscript"] is True and rec["transcript"] == "falamos do cronograma"

    assert c.post("/api/recordings", json={"kind": "invalido"}).status_code == 400

    r = c.post(f"/api/recordings/{rec['id']}/save-to-daily", json={"date": "2026-11-20"})
    assert r.status_code == 200 and r.json()["date"] == "2026-11-20"
    r = c.get("/api/daily/2026-11-20")
    assert "falamos do cronograma" in r.json()["report"]

    assert c.post("/api/recordings/99999/save-to-daily", json={}).status_code == 404
    r = c.post("/api/recordings", json={"title": "Vazia"})
    assert c.post(f"/api/recordings/{r.json()['id']}/save-to-daily", json={}).status_code == 400


# ---------------------------------------------------------------------------
# Transcription settings
# ---------------------------------------------------------------------------

def test_transcription_settings(temp_db):
    c = _client()
    r = c.get("/api/settings/transcription")
    assert r.status_code == 200, r.text
    assert r.json()["whisperModel"] == "small"
    assert r.json()["whisperLanguage"] == "pt"

    r = c.put("/api/settings/transcription", json={"whisperLanguage": "en"})
    assert r.status_code == 200 and r.json()["whisperLanguage"] == "en"
    assert r.json()["whisperModel"] == "small"  # modelo preservado
    assert c.get("/api/settings/transcription").json()["whisperLanguage"] == "en"
    assert c.put("/api/settings/transcription", json={"whisperModel": "  "}).status_code == 400


# ---------------------------------------------------------------------------
# Projects single + labels patch
# ---------------------------------------------------------------------------

def test_project_single_e_label_patch(temp_db):
    c = _client()
    pid = _project(c)
    r = c.get(f"/api/projects/{pid}")
    assert r.status_code == 200, r.text
    assert r.json()["key"] == "FLX" and "links" in r.json()
    assert c.get("/api/projects/99999").status_code == 404

    r = c.post("/api/labels", json={"name": "modulo-x", "color": "#111111"})
    assert r.status_code == 200, r.text
    lid = r.json()["id"]
    r = c.patch(f"/api/labels/{lid}", json={"name": "modulo-y", "color": "#222222"})
    assert r.status_code == 200 and r.json()["name"] == "modulo-y"
    assert r.json()["color"] == "#222222"
    c.post("/api/labels", json={"name": "outra"})
    assert c.patch(f"/api/labels/{lid}", json={"name": "outra"}).status_code == 400
    assert c.patch("/api/labels/99999", json={"name": "z"}).status_code == 404


# ---------------------------------------------------------------------------
# Standup sem IA
# ---------------------------------------------------------------------------

def test_standup(temp_db):
    from datetime import date
    hoje = date.today().isoformat()
    c = _client()
    pid = _project(c)
    cols = {col["name"]: col["id"] for col in c.get(f"/api/projects/{pid}/columns").json()}
    r = c.post("/api/tasks", json={"projectId": pid, "columnId": cols["A fazer"], "title": "fazer X"})
    code = r.json()["code"]
    r = c.post(f"/api/tasks/{code}/move", json={"columnId": cols["Feito"]})
    assert r.status_code == 200, r.text
    c.post(f"/api/projects/{pid}/daily", json={
        "body": "api travada", "kind": "BLOCKER", "date": hoje})
    c.put(f"/api/daily/{hoje}", json={"body": "notas"})

    r = c.get("/api/standup", params={"date": hoje})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["date"] == hoje
    assert any(t["code"] == code for t in data["done"])
    assert any(b["body"] == "api travada" for b in data["blockers"])

    r = c.get("/api/standup", params={"date": hoje, "projectId": pid})
    assert r.status_code == 200 and r.json()["projectId"] == pid
    assert c.get("/api/standup", params={"date": "20-11-2026"}).status_code == 400
