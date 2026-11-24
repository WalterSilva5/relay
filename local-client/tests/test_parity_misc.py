"""Parity tests for the misc router (goal progress + unassigned TODOs).

Mounts ``relay.api.ext_misc.router`` on the real app with an isolated
SQLite file, following the pattern of ``test_parity_insights.py``.

Metrics note (task 3 — no code change, integrator decides):
``GET /api/projects/metrics`` (app.py) and ``GET /api/metrics/detail``
(ext_insights) DIVERGE in definition, although both count "done" as a
task in an ``is_done`` column over non-deleted tasks:
- summary keys/shape: ``metrics`` uses ``{totalTasks, doneTasks,
  completedLast7d, completedLast30d, avgLeadTimeHours, avgCycleTimeHours}``;
  ``detail`` uses ``{total, done, last7d, last30d, avgLeadHours,
  avgCycleHours, overdue}`` (adds an overdue count with the "dev
  entregue" cut-off; ``metrics`` has no overdue at all).
- average lead time: ``metrics`` averages ``updated_at - created_at`` over
  ALL done tasks and returns 0 when empty; ``detail`` averages only done
  tasks updated in the last 30d and returns None when empty.
- weekly throughput: ``metrics`` buckets 8 rolling 7-day windows ending now
  as ``{week: "YYYY-Www", count}``; ``detail`` buckets 8 calendar weeks
  (Mon-Sun) as ``{weekStart, count}`` — same length, different windows.
- byType/byPriority: ``metrics`` returns plain counts ``{name: count}``;
  ``detail`` returns lists of ``{type/total/done/pct}`` (fixed priority
  order URGENT/HIGH/MEDIUM/LOW).
- per-project: ``metrics`` returns
  ``{projectId, projectName, projectKey, totalTasks, doneTasks}``;
  ``detail`` returns ``{projectId, key, name, total, done, pct}``.
"""
from fastapi.testclient import TestClient
import pytest

from relay.api.app import app
from relay.api.ext_misc import router
from relay.db.models import init_db

app.include_router(router)
# O catch-all do SPA (GET /{full_path:path}, registrado por _mount_webui)
# responde 404 para qualquer /api/* que venha DEPOIS dele; routers incluídos
# vão para o fim da lista, então reposiciona o bloco incluído para antes
# dele — o integrador precisa garantir a mesma ordem em produção.
if not getattr(app.state, "misc_router_ordered", False):
    _inc = app.router.routes.pop()
    _spa_idx = next(
        (i for i, r in enumerate(app.router.routes)
         if getattr(r, "path", None) == "/{full_path:path}"),
        len(app.router.routes),
    )
    app.router.routes.insert(_spa_idx, _inc)
    app.state.misc_router_ordered = True


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


@pytest.fixture
def project(client):
    pid = client.post("/api/projects", json={"name": "Misc", "key": "MISC"}).json()["id"]
    cols = {c["name"]: c["id"] for c in client.get(f"/api/projects/{pid}/columns").json()}
    return pid, cols


def _mk_task(client, pid, col, title, **kw):
    body = {"projectId": pid, "columnId": col, "title": title}
    body.update(kw)
    r = client.post("/api/tasks", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# --- goal progress ---------------------------------------------------------


def test_goal_progress_counts_done_total(client, project):
    pid, cols = project
    _mk_task(client, pid, cols["A fazer"], "aberta")
    _mk_task(client, pid, cols["Feito"], "concluida")
    goal = client.post(f"/api/projects/{pid}/goals", json={"name": "entregar"}).json()

    r = client.get(f"/api/goals/{goal['id']}/progress")
    assert r.status_code == 200, r.text
    assert r.json() == {"done": 1, "total": 2, "pct": 50}


def test_goal_progress_matches_embedded_progress(client, project):
    pid, cols = project
    _mk_task(client, pid, cols["A fazer"], "aberta")
    _mk_task(client, pid, cols["Feito"], "concluida")
    goal = client.post(f"/api/projects/{pid}/goals", json={"name": "entregar"}).json()

    via_progress = client.get(f"/api/goals/{goal['id']}/progress").json()
    via_goal = client.get(f"/api/goals/{goal['id']}").json()["progress"]
    assert via_progress == {
        "done": via_goal["done"],
        "total": via_goal["total"],
        "pct": via_goal["pct"],
    }


def test_goal_progress_respects_tag_filter(client, project):
    pid, cols = project
    t1 = _mk_task(client, pid, cols["Feito"], "com tag")
    _mk_task(client, pid, cols["Feito"], "sem tag")
    lb = client.post("/api/labels", json={"name": "nucleo", "color": "#FF0000"}).json()
    assert client.post(f"/api/labels/{lb['id']}/tasks/{t1['id']}").status_code == 200
    goal = client.post(
        f"/api/projects/{pid}/goals", json={"name": "foco", "tag": "nucleo"}
    ).json()

    assert client.get(f"/api/goals/{goal['id']}/progress").json() == {
        "done": 1, "total": 1, "pct": 100,
    }


def test_goal_progress_empty_and_404(client, project):
    pid, _cols = project
    goal = client.post(f"/api/projects/{pid}/goals", json={"name": "vazio"}).json()
    assert client.get(f"/api/goals/{goal['id']}/progress").json() == {
        "done": 0, "total": 0, "pct": 0,
    }
    assert client.get("/api/goals/99999/progress").status_code == 404


# --- unassigned todos ------------------------------------------------------


def test_todos_unassigned_only_null_project(client, project):
    pid, _cols = project
    free = client.post("/api/todos", json={"text": "livre"}).json()
    linked = client.post("/api/todos", json={"text": "do projeto", "projectId": pid}).json()
    assert linked["projectId"] == pid

    items = client.get("/api/todos/unassigned").json()
    assert [t["id"] for t in items] == [free["id"]]

    # Same item shape as GET /api/todos.
    full = {t["id"]: t for t in client.get("/api/todos").json()}
    assert items[0] == full[free["id"]]
    assert set(items[0].keys()) == set(full[linked["id"]].keys())


def test_todos_unassigned_empty(client):
    assert client.get("/api/todos/unassigned").json() == []
