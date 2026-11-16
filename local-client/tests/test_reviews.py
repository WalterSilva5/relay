"""Reviews semanais manuais: CRUD, duplicação, validação e export no formato do vault."""
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


@pytest.fixture
def projeto(client):
    return client.post("/api/projects", json={"name": "Rev", "key": "REV"}).json()["id"]


CORPO_OK = {
    "personName": "Moisés",
    "evaluator": "Walter Silva",
    "periodStart": "2026-11-09",
    "periodEnd": "2026-11-13",
    "techScore": 4,
    "softScore": 3,
    "summaryOneLine": "Bom progresso na tesouraria com cuidado nos testes de contrato.",
    "factsMd": "| O que | PR ou card | Evidência |\n|---|---|---|\n| buscar operador | `13993`, PR `#8902` | kit 42 cenários, 215 testes |",
    "codeMd": "Dois paths nativos passam a carregar o operador pela flag.",
    "commentMd": "Fez um bom progresso no módulo.\n\nMelhorou nas revisões em relação à semana passada.\n\nNa semana atual o foco deve ser concluir a gravação.",
    "evidenceMd": "- PR `#8902` mergeado em 09/11",
    "nextWeekMd": "- Concluir os ajustes do `#8994`",
}


def _criar(client, pid, **kw):
    body = dict(CORPO_OK)
    body.update(kw)
    r = client.post(f"/api/projects/{pid}/reviews", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_crud_basico(client, projeto):
    r = _criar(client, projeto)
    assert r["status"] == "DRAFT" and r["source"] == "MANUAL"
    rid = r["id"]
    assert client.get(f"/api/projects/{projeto}/reviews").json()[0]["id"] == rid
    assert client.get(f"/api/projects/{projeto}/reviews/{rid}").json()["personName"] == "Moisés"
    r = client.patch(f"/api/projects/{projeto}/reviews/{rid}", json={"techScore": 5})
    assert r.json()["techScore"] == 5
    # filtros
    assert client.get(f"/api/projects/{projeto}/reviews", params={"person": "Outro"}).json() == []
    assert client.get(f"/api/projects/{projeto}/reviews", params={"status": "SENT"}).json() == []


def test_export_md_igual_ao_formato_do_vault(client, projeto):
    r = _criar(client, projeto)
    resp = client.get(f"/api/projects/{projeto}/reviews/{r['id']}/export.md")
    assert resp.status_code == 200
    assert "review-semanal-moises" in resp.headers["content-disposition"]
    assert "2026-11-13-review-semanal-moises.md" in resp.headers["content-disposition"]
    md = resp.text
    assert md.startswith("# Avaliação semanal — Moisés · semana de 09 a 13/11/2026\n")
    assert "**Semana de 09/11/2026**\nAvaliador: Walter Silva" in md
    assert "4· Competências Técnicas\n3· Competências Comportamentais" in md
    assert "## Comentário do Avaliador" in md
    assert "## Evidências (interno — não copiar para o formulário)" in md
    assert "## Próxima semana (proposta)" in md
    assert "kit 42 cenários" in md  # fato virou bullet de evidência


def test_export_bloqueia_sem_os_3_blocos_ou_sem_frase(client, projeto):
    r = _criar(client, projeto, commentMd="Só um bloco.", summaryOneLine="")
    resp = client.get(f"/api/projects/{projeto}/reviews/{r['id']}/export.md")
    assert resp.status_code == 400
    assert "3 blocos" in resp.text and "frase" in resp.text


def test_export_bloqueia_frase_maior_que_200(client, projeto):
    r = _criar(client, projeto, summaryOneLine="x" * 201)
    assert client.get(f"/api/projects/{projeto}/reviews/{r['id']}/export.md").status_code == 400


def test_duplicar_copia_notas_e_estrutura(client, projeto):
    r = _criar(client, projeto)
    d = client.post(f"/api/projects/{projeto}/reviews/{r['id']}/duplicate").json()
    assert d["status"] == "DRAFT"
    assert d["personName"] == "Moisés" and d["evaluator"] == "Walter Silva"
    assert d["periodStart"] == "2026-11-16" and d["periodEnd"] == "2026-11-20"
    assert d["techScore"] == 4 and d["softScore"] == 3
    assert d["commentMd"] == "" and d["factsMd"] == ""


def test_send_e_reopen(client, projeto):
    r = _criar(client, projeto)
    rid = r["id"]
    s = client.post(f"/api/projects/{projeto}/reviews/{rid}/send").json()
    assert s["status"] == "SENT" and s["sentAt"]
    assert len(client.get(f"/api/projects/{projeto}/reviews", params={"status": "SENT"}).json()) == 1
    s = client.post(f"/api/projects/{projeto}/reviews/{rid}/reopen").json()
    assert s["status"] == "DRAFT" and s["sentAt"] is None


def test_send_bloqueia_rascunho_incompleto(client, projeto):
    r = _criar(client, projeto, commentMd="Só um bloco.")
    assert client.post(f"/api/projects/{projeto}/reviews/{r['id']}/send").status_code == 400


def test_alertas_de_conteudo():
    from relay.reviews import content_warnings
    from types import SimpleNamespace as NS
    base = dict(person_name="X", comment_md="Fez bem.\n\nMelhorou.\n\nFoco em Y.")
    assert content_warnings(NS(**base)) == []
    assert any("card/PR" in a for a in content_warnings(NS(**{**base, "comment_md": base["comment_md"] + " No card 13993."})))
    assert any("Testes e validações" in a for a in content_warnings(NS(**{**base, "comment_md": base["comment_md"] + " Falou com o QA."})))
    assert any("atenção" in a for a in content_warnings(NS(**{**base, "comment_md": "Atenção ao prazo.\n\nOutro ponto de atenção no fluxo.\n\nFoco em Y."})))


def test_pontos_que_se_repetem():
    from relay.reviews import repeated_points
    from types import SimpleNamespace as NS
    atual = NS(facts_md="tesouraria caixa", comment_md="cuidado com os testes de contrato")
    anterior = NS(facts_md="tesouraria operador", comment_md="testes de contrato cobrindo casos")
    rep = repeated_points(atual, anterior)
    assert "tesouraria" in rep and "testes" in rep
