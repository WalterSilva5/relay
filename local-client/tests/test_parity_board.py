"""Parity tests for the board/flow HTTP extension (relay/api/ext_board.py).

Each test covers an endpoint that had NO equivalent in app.py — the GUI
reached the same data through direct SQLite access. Endpoints that already
existed (columns CRUD, move, checklist, comments, sprints, epics, links,
history, changelog, ...) are exercised by the suites of their own groups.
"""
import pytest
from fastapi.testclient import TestClient

from relay.api import ext_board
from relay.api.app import app
from relay.db.models import init_db


if "/api/projects/{project_id}/tasks/search" not in {
    getattr(r, "path", "") for r in app.routes
}:
    # include_router() anexa ao FIM (depois do catch-all do SPA
    # GET /{full_path:path}), e nesta versao do FastAPI a inclusao e
    # resolvida em ordem: os GETs incluidos jamais seriam alcancados.
    # Insercao direta antes do catch-all == o que o integrador deve
    # garantir no app.py (include ANTES de _mount_webui(app)).
    spa_idx = next(
        (
            i
            for i, r in enumerate(app.routes)
            if getattr(r, "path", "") == "/{full_path:path}"
        ),
        len(app.routes),
    )
    for _route in ext_board.router.routes:
        app.routes.insert(spa_idx, _route)
        spa_idx += 1


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


def _project(client, name="Board Parity", key="BRD"):
    r = client.post("/api/projects", json={"name": name, "key": key})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _columns(client, pid):
    return {c["name"]: c for c in client.get(f"/api/projects/{pid}/columns").json()}


def _task(client, pid, col_id, title, **kw):
    body = {"projectId": pid, "columnId": col_id, "title": title}
    body.update(kw)
    r = client.post("/api/tasks", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------------
# GET /api/projects/{id}/tasks/search
# ---------------------------------------------------------------------------


def test_search_404_para_projeto_inexistente(client):
    assert client.get("/api/projects/9999/tasks/search").status_code == 404


def test_search_por_epico(client):
    pid = _project(client)
    cols = _columns(client, pid)
    epic = client.post(f"/api/projects/{pid}/epics", json={"name": "Modulo A"}).json()
    outro = client.post(f"/api/projects/{pid}/epics", json={"name": "Modulo B"}).json()
    t1 = _task(client, pid, cols["A fazer"]["id"], "com epico")
    t2 = _task(client, pid, cols["A fazer"]["id"], "sem epico")
    assert client.post(f"/api/epics/{epic['id']}/tasks/{t1['id']}").status_code == 200

    r = client.get(f"/api/projects/{pid}/tasks/search", params={"epicId": epic["id"]})
    assert r.status_code == 200
    assert [t["id"] for t in r.json()] == [t1["id"]]

    r = client.get(f"/api/projects/{pid}/tasks/search", params={"epicId": outro["id"]})
    assert r.json() == []
    assert t2["id"] not in [t["id"] for t in r.json()]


def test_search_por_sprint_e_backlog(client):
    pid = _project(client)
    cols = _columns(client, pid)
    sp = client.post(f"/api/projects/{pid}/sprints", json={"name": "S1"}).json()
    em_sprint = _task(client, pid, cols["A fazer"]["id"], "na sprint")
    backlog = _task(client, pid, cols["A fazer"]["id"], "no backlog")
    r = client.patch(f"/api/tasks/{em_sprint['code']}", json={"sprintId": sp["id"]})
    assert r.status_code == 200

    r = client.get(f"/api/projects/{pid}/tasks/search", params={"sprintId": sp["id"]})
    assert [t["id"] for t in r.json()] == [em_sprint["id"]]

    r = client.get(f"/api/projects/{pid}/tasks/search", params={"noSprint": True})
    assert [t["id"] for t in r.json()] == [backlog["id"]]


def test_search_rejeita_sprint_e_nosprint_juntos(client):
    pid = _project(client)
    r = client.get(
        f"/api/projects/{pid}/tasks/search", params={"sprintId": 1, "noSprint": True}
    )
    assert r.status_code == 400


def test_search_por_coluna_responsavel_e_sem_responsavel(client):
    pid = _project(client)
    cols = _columns(client, pid)
    com_dono = _task(
        client, pid, cols["Fazendo"]["id"], "com dono", assignee="ana"
    )
    sem_dono = _task(client, pid, cols["Fazendo"]["id"], "sem dono")
    _task(client, pid, cols["A fazer"]["id"], "outra coluna", assignee="ana")

    r = client.get(
        f"/api/projects/{pid}/tasks/search",
        params={"columnId": cols["Fazendo"]["id"], "assignee": "ana"},
    )
    assert [t["id"] for t in r.json()] == [com_dono["id"]]

    r = client.get(f"/api/projects/{pid}/tasks/search", params={"unassigned": True})
    assert [t["id"] for t in r.json()] == [sem_dono["id"]]


def test_search_texto_prioridade_tipo_e_arquivadas(client):
    pid = _project(client)
    cols = _columns(client, pid)
    bug = _task(
        client, pid, cols["A fazer"]["id"], "corrigir login quebrado",
        type="BUG", priority="URGENT",
    )
    doc = _task(client, pid, cols["A fazer"]["id"], "documentar login", type="CHORE")

    r = client.get(
        f"/api/projects/{pid}/tasks/search",
        params={"search": "login", "type": "BUG", "priority": "URGENT"},
    )
    assert [t["id"] for t in r.json()] == [bug["id"]]

    assert client.post(f"/api/tasks/{bug['code']}/archive").status_code == 200
    r = client.get(f"/api/projects/{pid}/tasks/search", params={"search": "login"})
    assert [t["id"] for t in r.json()] != [bug["id"]]
    assert len(r.json()) == 1
    r = client.get(
        f"/api/projects/{pid}/tasks/search",
        params={"search": "login", "includeArchived": True},
    )
    assert {t["id"] for t in r.json()} == {bug["id"], doc["id"]}


# ---------------------------------------------------------------------------
# POST /api/tasks/{code}/move-next
# ---------------------------------------------------------------------------


def test_move_next_avanca_uma_coluna(client):
    pid = _project(client)
    cols = _columns(client, pid)
    t = _task(client, pid, cols["A fazer"]["id"], "quick move")
    r = client.post(f"/api/tasks/{t['code']}/move-next")
    assert r.status_code == 200, r.text
    assert r.json()["columnId"] == cols["Fazendo"]["id"]
    assert r.json()["code"] == t["code"]
    # detalhe completo como o move normal (paridade do dialogo da tarefa)
    assert r.json()["checklist"] == [] and "description" in r.json()


def test_move_next_404_para_task_inexistente(client):
    assert client.post("/api/tasks/NOPE-999/move-next").status_code == 404


def test_move_next_409_na_ultima_coluna(client):
    pid = _project(client)
    cols = _columns(client, pid)
    t = _task(client, pid, cols["Feito"]["id"], "ja no fim")
    r = client.post(f"/api/tasks/{t['code']}/move-next")
    assert r.status_code == 409


def test_move_next_barra_revisao_sem_code_review(client):
    pid = _project(client, key="RVW")
    cols = _columns(client, pid)
    rev = client.post(
        f"/api/projects/{pid}/columns", json={"name": "Revisão"}
    ).json()
    assert rev["order"] == 3  # depois de Feito: e o proximo destino
    t = _task(client, pid, cols["Feito"]["id"], "precisa de review")

    r = client.post(f"/api/tasks/{t['code']}/move-next")
    assert r.status_code == 422
    assert "CODE_REVIEW" in r.json()["detail"]["missing"]

    c = client.post(
        "/api/comments",
        json={"taskId": t["id"], "body": "lgtm", "type": "CODE_REVIEW"},
    )
    assert c.status_code == 200
    r = client.post(f"/api/tasks/{t['code']}/move-next")
    assert r.status_code == 200, r.text
    assert r.json()["columnId"] == rev["id"]

    # agora esta na ultima: proximo avanco e 409
    assert client.post(f"/api/tasks/{t['code']}/move-next").status_code == 409


# ---------------------------------------------------------------------------
# GET /api/projects/{id}/activity
# ---------------------------------------------------------------------------


def test_activity_do_projeto(client):
    pid = _project(client)
    cols = _columns(client, pid)
    outro_pid = _project(client, name="Outro", key="OUT")
    t = _task(client, pid, cols["A fazer"]["id"], "com movimento")
    assert client.post(f"/api/tasks/{t['code']}/move-next").status_code == 200
    assert client.post(
        "/api/comments", json={"taskId": t["id"], "body": "nota"}
    ).status_code == 200

    r = client.get(f"/api/projects/{pid}/activity")
    assert r.status_code == 200
    acoes = {(a["action"], a["taskCode"]) for a in r.json()}
    assert ("moved", t["code"]) in acoes
    assert ("created", t["code"]) in acoes  # comentario logado com o codigo do card

    r = client.get(f"/api/projects/{pid}/activity", params={"limit": 1})
    assert len(r.json()) == 1

    # isolamento por projeto
    r = client.get(f"/api/projects/{outro_pid}/activity")
    assert r.json() == []

    assert client.get("/api/projects/9999/activity").status_code == 404


# ---------------------------------------------------------------------------
# GET /api/projects/{id}/assignees
# ---------------------------------------------------------------------------


def test_assignees_membros_e_nomes_legados(client):
    pid = _project(client)
    cols = _columns(client, pid)
    assert client.post(
        f"/api/projects/{pid}/members", json={"name": "ana"}
    ).status_code == 200
    _task(client, pid, cols["A fazer"]["id"], "da ana", assignee="ana")
    _task(client, pid, cols["A fazer"]["id"], "legado", assignee="ze-legado")
    _task(client, pid, cols["A fazer"]["id"], "sem dono")

    r = client.get(f"/api/projects/{pid}/assignees")
    assert r.status_code == 200
    por_nome = {a["name"]: a for a in r.json()}
    assert por_nome["ana"]["inMembers"] is True
    assert por_nome["ana"]["taskCount"] == 1
    assert por_nome["ana"]["color"]
    assert por_nome["ze-legado"]["inMembers"] is False
    assert por_nome["ze-legado"]["taskCount"] == 1
    assert "sem dono" not in por_nome  # sem responsavel nao lista

    assert client.get("/api/projects/9999/assignees").status_code == 404
