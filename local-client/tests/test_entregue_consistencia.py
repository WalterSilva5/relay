"""Consistência da regra "entregue" em todos os caminhos de progresso.

Regra vigente: **entregue = Done + In Test/Verified/Accepted** (o card que
passou pelo desenvolvimento e entrou em teste já conta no % Finalizado).
`Rework` NÃO conta como entregue — é card que voltou do teste.

O teste monta um board completo pela API e confere os quatro caminhos que
expõem progresso: dimensões do projeto, métricas do workspace, goals e
responsáveis. Também confere que os contadores de fluxo (Done formal)
continuam separados.
"""
from __future__ import annotations

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


# Uma coluna por estágio do fluxo real da migração. `Rework` fica entre
# `Accepted` e `Done` de propósito: é depois do Dev Box (dev concluído), mas
# não é entrega.
COLUNAS = [
    ("To do", False),
    ("Dev Box", False),
    ("In Test", False),
    ("Verified", False),
    ("Accepted", False),
    ("Rework", False),
    ("Done", True),
]


@pytest.fixture
def cenario(client):
    """Projeto com 1 card em cada coluna do fluxo, todos do mesmo responsável."""
    pid = client.post("/api/projects", json={"name": "Entrega", "key": "ENT"}).json()["id"]

    colunas = {}
    for nome, is_done in COLUNAS:
        r = client.post(
            f"/api/projects/{pid}/columns",
            json={"name": nome, "isDone": is_done},
        )
        assert r.status_code == 200, r.text
        colunas[nome] = r.json()["id"]

    assert client.post(
        f"/api/projects/{pid}/members", json={"name": "Dev"}
    ).status_code == 200
    label = client.post("/api/labels", json={"name": "config"}).json()

    cards = {}
    for nome, coluna_id in colunas.items():
        r = client.post("/api/tasks", json={
            "projectId": pid,
            "columnId": coluna_id,
            "title": f"card {nome}",
            "assignee": "Dev",
        })
        assert r.status_code == 200, r.text
        task = r.json()
        assert client.post(
            f"/api/labels/{label['id']}/tasks/{task['id']}"
        ).status_code == 200
        cards[nome] = task

    return {
        "pid": pid,
        "colunas": colunas,
        "cards": cards,
        "label": label,
        "client": client,
    }


def _dimensoes(client, pid):
    r = client.get(f"/api/projects/{pid}/metrics/dimensions")
    assert r.status_code == 200, r.text
    return r.json()


def _modulo(dados, nome="config"):
    return next(m for m in dados["modules"] if m["name"] == nome)


# --------------------------------------------------------------------------
# dimensões do projeto
# --------------------------------------------------------------------------

def test_dimensions_done_e_entregue_e_developed_e_dev(cenario):
    """`done` = entregues (4 colunas); `developed` = Dev Box ou depois (6)."""
    d = _dimensoes(cenario["client"], cenario["pid"])

    assert d["cards"] == 7
    assert d["developmentColumn"] == "Dev Box"
    # entregues: In Test + Verified + Accepted + Done
    assert d["done"] == 4
    assert d["pct"] == 57
    # desenvolvimento concluído: Dev Box + In Test + Verified + Accepted +
    # Rework + Done (Rework é dev concluído, só não é entrega)
    assert d["developed"] == 6
    assert d["developedPct"] == 86

    config = _modulo(d)
    assert config["total"] == 7
    assert config["done"] == 4 and config["pct"] == 57
    assert config["developed"] == 6 and config["developedPct"] == 86


# --------------------------------------------------------------------------
# métricas do workspace (/api/projects/metrics)
# --------------------------------------------------------------------------

def test_projects_metrics_entrega_delivered_tasks_sem_mexer_no_done_formal(cenario):
    client, pid = cenario["client"], cenario["pid"]
    r = client.get("/api/projects/metrics")
    assert r.status_code == 200, r.text
    dados = r.json()
    s = dados["summary"]

    assert s["totalTasks"] == 7
    # `doneTasks` continua sendo a conclusão formal (só Done)
    assert s["doneTasks"] == 1
    # `deliveredTasks` é a regra do % Finalizado
    assert s["deliveredTasks"] == 4
    assert s["deliveredPct"] == 57

    proj = next(p for p in dados["perProject"] if p["projectId"] == pid)
    assert proj["totalTasks"] == 7
    assert proj["doneTasks"] == 1
    assert proj["deliveredTasks"] == 4


# --------------------------------------------------------------------------
# goals (API principal + sub-recurso de parity)
# --------------------------------------------------------------------------

def test_goal_progress_conta_entregues(cenario):
    client, pid = cenario["client"], cenario["pid"]
    g = client.post(f"/api/projects/{pid}/goals", json={"name": "Entrega"}).json()

    r = client.get(f"/api/projects/{pid}/goals")
    assert r.status_code == 200, r.text
    goal = next(x for x in r.json() if x["id"] == g["id"])
    assert goal["progress"] == {"total": 7, "done": 4, "pct": 57, "daysLeft": None}

    # mesmo número no endpoint de parity usado pela web
    r = client.get(f"/api/goals/{g['id']}/progress")
    assert r.status_code == 200, r.text
    assert r.json() == {"done": 4, "total": 7, "pct": 57}


# --------------------------------------------------------------------------
# responsáveis
# --------------------------------------------------------------------------

def test_members_entregues_e_desenvolvidos(cenario):
    client, pid = cenario["client"], cenario["pid"]
    r = client.get(f"/api/projects/{pid}/members")
    assert r.status_code == 200, r.text
    dev = next(m for m in r.json() if m["name"] == "Dev")

    assert dev["total"] == 7
    assert dev["done"] == 4
    assert dev["pct"] == 57
    assert dev["developed"] == 6
    assert dev["developedPct"] == 86


# --------------------------------------------------------------------------
# Rework explicitamente fora da entrega
# --------------------------------------------------------------------------

def test_rework_nao_conta_como_entregue(cenario):
    """Um card a mais em Rework: dev concluído, mas não entregue."""
    client, pid = cenario["client"], cenario["pid"]
    r = client.post("/api/tasks", json={
        "projectId": pid,
        "columnId": cenario["colunas"]["Rework"],
        "title": "voltou do teste",
        "assignee": "Dev",
    })
    assert r.status_code == 200, r.text
    assert client.post(
        f"/api/labels/{cenario['label']['id']}/tasks/{r.json()['id']}"
    ).status_code == 200

    d = _dimensoes(client, pid)
    assert d["cards"] == 8
    assert d["done"] == 4 and d["pct"] == 50
    assert d["developed"] == 7 and d["developedPct"] == 88

    s = client.get("/api/projects/metrics").json()["summary"]
    assert s["totalTasks"] == 8
    assert s["deliveredTasks"] == 4 and s["deliveredPct"] == 50
    # o Done formal continua 1: Rework não vira conclusão
    assert s["doneTasks"] == 1

    client.post(f"/api/projects/{pid}/goals", json={"name": "Entrega"})
    goal = client.get(f"/api/projects/{pid}/goals").json()[0]
    assert goal["progress"]["done"] == 4
    assert goal["progress"]["pct"] == 50

    dev = next(m for m in client.get(f"/api/projects/{pid}/members").json()
               if m["name"] == "Dev")
    assert dev["total"] == 8
    assert dev["done"] == 4 and dev["pct"] == 50
    assert dev["developed"] == 7 and dev["developedPct"] == 88


def test_team_weekly_progresso_usa_entregue(cenario):
    """Report semanal: progresso/entregue; o que foi concluído na semana
    continua sendo medido por `done_at` (Done formal)."""
    client, pid = cenario["client"], cenario["pid"]
    r = client.get(f"/api/projects/{pid}/team/weekly")
    assert r.status_code == 200, r.text
    d = r.json()

    assert d["summary"]["cards"] == 7
    assert d["summary"]["done"] == 4
    assert d["summary"]["pct"] == 57
    # "em aberto" é o complemento de entregue: To do + Dev Box + Rework
    assert d["summary"]["open"] == 3
    # nenhum card foi movido para Done via /move, então não há conclusão de
    # fluxo no período (o `done_at` não é inventado na criação)
    assert d["summary"]["doneInWeek"] == 0

    dev = next(m for m in d["members"] if m["name"] == "Dev")
    assert dev["doneTotal"] == 4
    assert dev["open"] == 3


def test_flow_counters_continuam_no_done_formal(cenario):
    """Fluxo (done at 7 days/30 days) não muda: só o Done formal conta."""
    client = cenario["client"]
    detalhe = client.get("/api/metrics/detail").json()

    # progresso no detalhe também é entregue
    assert detalhe["summary"]["total"] == 7
    assert detalhe["summary"]["done"] == 4
    # 7d/30d continuam contando apenas os cards em Done (1, com updated_at de agora)
    assert detalhe["summary"]["last7d"] == 1
    assert detalhe["summary"]["last30d"] == 1
    # por tipo/prioridade refletem a entrega
    assert detalhe["byType"][0]["done"] == 4
    assert detalhe["byPriority"][0]["done"] == 4
    assert detalhe["byProject"][0]["done"] == 4
