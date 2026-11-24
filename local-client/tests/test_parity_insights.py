"""Parity tests for the insights router (dashboard/metrics/labels/KB gaps).

Mounts ``relay.api.ext_insights.router`` on the real app with an isolated
SQLite file, following the pattern of ``test_metrics_pdf.py``.
"""
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from relay.api.app import app
from relay.api.ext_insights import router
from relay.db.models import init_db

app.include_router(router)
# O catch-all do SPA (GET /{full_path:path}, registrado por _mount_webui)
# responde 404 para qualquer /api/* que venha DEPOIS dele; routers incluídos
# vão para o fim da lista, então reposiciona o bloco incluído para antes
# dele — o integrador precisa garantir a mesma ordem em produção.
if not getattr(app.state, "insights_router_ordered", False):
    _inc = app.router.routes.pop()
    _spa_idx = next(
        (i for i, r in enumerate(app.router.routes)
         if getattr(r, "path", None) == "/{full_path:path}"),
        len(app.router.routes),
    )
    app.router.routes.insert(_spa_idx, _inc)
    app.state.insights_router_ordered = True


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
    pid = client.post("/api/projects", json={"name": "Insights", "key": "INS"}).json()["id"]
    cols = {c["name"]: c["id"] for c in client.get(f"/api/projects/{pid}/columns").json()}
    return pid, cols


def _mk_task(client, pid, col, title, **kw):
    body = {"projectId": pid, "columnId": col, "title": title}
    body.update(kw)
    r = client.post("/api/tasks", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _seed_board(client, project):
    """2 open + 1 done + 1 overdue open + 1 overdue-but-done."""
    pid, cols = project
    past = (datetime.utcnow() - timedelta(days=3)).isoformat()
    _mk_task(client, pid, cols["A fazer"], "aberta 1")
    _mk_task(client, pid, cols["Fazendo"], "em progresso")
    _mk_task(client, pid, cols["Feito"], "concluida")
    _mk_task(client, pid, cols["A fazer"], "vencida", dueDate=past)
    _mk_task(client, pid, cols["Feito"], "vencida mas entregue", dueDate=past)
    return pid


# --- dashboard hub ---------------------------------------------------------


def test_dashboard_summary_cards(client, project):
    pid = _seed_board(client, project)
    s = client.get("/api/dashboard/summary").json()
    assert s["totalActive"] == 5
    assert s["done7d"] == 2  # concluida + vencida mas entregue
    assert s["overdue"] == 1  # só "vencida" (dev entregue sai do corte)
    assert s["inProgress"] == 1


def test_dashboard_overdue_list(client, project):
    _seed_board(client, project)
    items = client.get("/api/dashboard/overdue").json()
    assert [i["title"] for i in items] == ["vencida"]
    first = items[0]
    assert first["code"].startswith("INS-")
    assert first["projectKey"] == "INS"
    assert first["dueDate"] is not None


def test_dashboard_projects_progress(client, project):
    pid = _seed_board(client, project)
    projs = client.get("/api/dashboard/projects").json()
    assert len(projs) == 1
    p = projs[0]
    assert (p["key"], p["total"], p["done"]) == ("INS", 5, 2)
    assert p["pct"] == 40
    by_name = {c["name"]: c["count"] for c in p["columns"]}
    assert by_name["A fazer"] == 2
    assert by_name["Fazendo"] == 1
    assert by_name["Feito"] == 2


# --- metrics detail --------------------------------------------------------


def test_metrics_detail_parity(client, project):
    pid, cols = project
    _mk_task(client, pid, cols["Fazendo"], "bug urgente", type="BUG", priority="URGENT")
    _mk_task(client, pid, cols["Feito"], "feat feita", type="FEATURE", priority="HIGH")
    d = client.get("/api/metrics/detail").json()

    assert d["summary"]["total"] == 2
    assert d["summary"]["done"] == 1
    assert d["summary"]["overdue"] == 0
    assert d["summary"]["avgLeadHours"] is not None
    assert len(d["weeklyThroughput"]) == 8
    assert sum(w["count"] for w in d["weeklyThroughput"]) == 1

    by_type = {e["type"]: e for e in d["byType"]}
    assert by_type["BUG"]["total"] == 1 and by_type["BUG"]["done"] == 0
    assert by_type["FEATURE"]["done"] == 1

    prios = [e["priority"] for e in d["byPriority"]]
    assert prios == ["URGENT", "HIGH"]  # ordem fixa da GUI
    assert d["byProject"][0]["total"] == 2
    assert d["byProject"][0]["done"] == 1


def test_metrics_detail_counts_overdue(client, project):
    pid, cols = project
    past = (datetime.utcnow() - timedelta(days=1)).isoformat()
    _mk_task(client, pid, cols["A fazer"], "atrasada", dueDate=past)
    d = client.get("/api/metrics/detail").json()
    assert d["summary"]["overdue"] == 1


# --- labels with counts ----------------------------------------------------


def test_labels_with_counts(client, project):
    pid, cols = project
    lb = client.post("/api/labels", json={"name": "modulo-x", "color": "#FF0000"}).json()
    t = _mk_task(client, pid, cols["A fazer"], "com label")
    assert client.post(f"/api/labels/{lb['id']}/tasks/{t['id']}").status_code == 200

    rows = client.get("/api/labels/with-counts").json()
    row = next(r for r in rows if r["name"] == "modulo-x")
    assert row["taskCount"] == 1


# --- todos bulk clear ------------------------------------------------------


def test_clear_completed_todos(client):
    a = client.post("/api/todos", json={"text": "fazer"}).json()
    b = client.post("/api/todos", json={"text": "feito"}).json()
    assert client.patch(f"/api/todos/{b['id']}", json={"done": True}).status_code == 200

    r = client.post("/api/todos/clear-completed")
    assert r.status_code == 200 and r.json() == {"removed": 1}

    rest = client.get("/api/todos").json()
    assert [t["id"] for t in rest] == [a["id"]]


# --- documents single fetch ------------------------------------------------


def test_get_document_and_404(client):
    doc = client.post("/api/documents", json={"title": "nota", "body": "oi"}).json()
    got = client.get(f"/api/documents/{doc['id']}").json()
    assert got["title"] == "nota" and got["body"] == "oi"
    assert client.get("/api/documents/99999").status_code == 404


# --- KB note detail + backlinks --------------------------------------------


def test_kb_note_detail_with_backlinks(client):
    a = client.post("/api/documents", json={"title": "Alfa", "body": "base", "type": "KB"}).json()
    b = client.post("/api/documents", json={"title": "Beta", "body": "usa [[Alfa]]", "type": "KB"}).json()
    assert b["id"] != a["id"]

    got = client.get(f"/api/kb/notes/{a['id']}").json()
    assert got["title"] == "Alfa"
    assert any(link["title"] == "Beta" for link in got["backlinks"])
    assert client.get("/api/kb/notes/99999").status_code == 404


# --- reused endpoints (already in app.py, must keep working) ---------------


def test_reused_endpoints_cover_hub_needs(client, project):
    pid = _seed_board(client, project)
    assert client.get("/api/activity", params={"limit": 5}).status_code == 200
    assert client.get("/api/projects/metrics").status_code == 200
    assert client.get("/api/kb/notes", params={"q": "x"}).status_code == 200

    g = client.post(f"/api/projects/{pid}/goals", json={"name": "entregar"}).json()
    assert g["progress"]["total"] == 5
    assert client.get(f"/api/goals/{g['id']}").status_code == 200

    labels = client.get("/api/labels").json()
    assert isinstance(labels, list)
