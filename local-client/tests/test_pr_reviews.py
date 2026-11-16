"""Reviews de PR: CRUD, validação, export no formato do template e numeração NN-."""
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
    return client.post("/api/projects", json={"name": "PR", "key": "PRJ"}).json()["id"]


CORPO_OK = {
    "repo": "Var3.Service",
    "prNumber": 8616,
    "prTitle": "[GAVAR-13887] alterar-senha-operador no path legado",
    "prAuthor": "Jeferson",
    "prUrl": "https://dev.azure.com/org/proj/_git/Var3.Service/pullrequest/8616",
    "sourceBranch": "feature/x",
    "targetBranch": "feature/migracao/auth",
    "mergeBase": "abc1234",
    "reviewDate": "2026-11-14",
    "oneSentence": "O path legado passa a carregar o operador com o prefixo novo.",
    "flowMd": "1. App chama a raiz.\n2. O alias resolve para o seam.",
    "implementationMd": "| Peça | Papel |\n|---|---|\n| Controller | resolve o alias |",
    "behaviorMd": "- Nada muda com a flag desligada.\n- Desvios conscientes: nenhum.",
    "checkedBase": True, "checkedConflicts": True, "checkedTests": True,
    "testsRun": 215, "testsFailures": 0, "testsSkipped": 1,
    "findingsMd": "| Severidade | Arquivo:linha | Problema | Sugestão |\n|---|---|---|---|\n| baixa | Auth:128 | rota duplicada | unificar |",
    "questionsMd": "- Por que dois paths?",
    "finalCommentMd": "Bom PR, cobre o legado sem quebrar o atual.",
    "evidenceMd": "- suíte 3.272 sem classe vermelha nova",
    "verdict": "APROVAR_COM_SUGESTOES",
    "vote": "sim",
    "commentPublished": "não",
}


def _criar(client, pid, **kw):
    body = dict(CORPO_OK)
    body.update(kw)
    r = client.post(f"/api/projects/{pid}/pr-reviews", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_crud_e_filtros(client, projeto):
    r = _criar(client, projeto)
    assert r["status"] == "DRAFT" and r["prNumber"] == 8616
    rid = r["id"]
    assert client.get(f"/api/projects/{projeto}/pr-reviews/{rid}").json()["prTitle"].startswith("[GAVAR")
    assert client.get(f"/api/projects/{projeto}/pr-reviews", params={"repo": "Outro"}).json() == []
    assert client.get(f"/api/projects/{projeto}/pr-reviews", params={"author": "Jeferson"}).json()[0]["id"] == rid
    assert client.get(f"/api/projects/{projeto}/pr-reviews", params={"verdict": "APROVAR_COM_SUGESTOES"}).json()[0]["id"] == rid
    r = client.patch(f"/api/projects/{projeto}/pr-reviews/{rid}", json={"vote": "não"})
    assert r.json()["vote"] == "não"
    # veredito inválido
    assert client.patch(f"/api/projects/{projeto}/pr-reviews/{rid}", json={"verdict": "X"}).status_code == 400


def test_export_igual_ao_template(client, projeto, tmp_path):
    dest = tmp_path / "reviews"
    dest.mkdir()
    (dest / "30-review-pr-8616-antigo.md").write_text("# velho\n")
    client.patch(f"/api/projects/{projeto}", json={"prReviewsPath": str(dest)})
    r = _criar(client, projeto)
    resp = client.get(f"/api/projects/{projeto}/pr-reviews/{r['id']}/export.md")
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-disposition"].endswith("31-review-pr-8616-gavar-13887-alterar-senha-operador-no-path-legado.md\"")
    md = resp.text
    assert md.startswith("# Review — PR #8616 · [GAVAR-13887] alterar-senha-operador no path legado\n")
    assert "**Autor:** Jeferson" in md and "**Base:** `abc1234`" in md
    for secao in ["## 1. Em uma frase", "## 2. O que o PR faz (fluxo)",
                  "## 3. Como foi implementado (peças)", "## 4. O que muda de comportamento",
                  "## 5. O que eu conferi (evidência)", "## 6. Achados",
                  "**Perguntas ao autor:**", "## 7. Comentário final (para o PR)",
                  "## 8. Veredito", "**Voto registrado:** sim",
                  "## Evidências internas (não copiar para o PR)"]:
        assert secao in md, secao
    assert "- [x] Aprovar com sugestões" in md
    assert "**215 testes, 0 falhas, 1 skipped**" in md
    # arquivo gravado na pasta com o NN
    assert (dest / "31-review-pr-8616-gavar-13887-alterar-senha-operador-no-path-legado.md").exists()


def test_export_bloqueia_sem_obrigatorios(client, projeto, tmp_path):
    dest = tmp_path / "reviews"
    dest.mkdir()
    client.patch(f"/api/projects/{projeto}", json={"prReviewsPath": str(dest)})
    r = _criar(client, projeto, oneSentence="", flowMd="", finalCommentMd="")
    resp = client.get(f"/api/projects/{projeto}/pr-reviews/{r['id']}/export.md")
    assert resp.status_code == 400
    assert "frase" in resp.text and "fluxo" in resp.text and "Comentário final" in resp.text


def test_export_exige_pasta_configurada(client, projeto):
    r = _criar(client, projeto)
    assert client.get(f"/api/projects/{projeto}/pr-reviews/{r['id']}/export.md").status_code == 400


def test_duplicar_enviar_reabrir(client, projeto):
    r = _criar(client, projeto)
    rid = r["id"]
    d = client.post(f"/api/projects/{projeto}/pr-reviews/{rid}/duplicate").json()
    assert d["status"] == "DRAFT" and d["verdict"] == "" and d["vote"] == ""
    assert d["prNumber"] == 8616 and d["flowMd"].startswith("1. App")
    s = client.post(f"/api/projects/{projeto}/pr-reviews/{rid}/send").json()
    assert s["status"] == "SENT" and s["sentAt"]
    s = client.post(f"/api/projects/{projeto}/pr-reviews/{rid}/reopen").json()
    assert s["status"] == "DRAFT"


def test_send_bloqueia_incompleto(client, projeto):
    r = _criar(client, projeto, oneSentence="")
    assert client.post(f"/api/projects/{projeto}/pr-reviews/{r['id']}/send").status_code == 400


def test_alertas_de_conteudo():
    from relay.pr_reviews import content_warnings
    assert content_warnings("Bom PR, cobre o legado.") == []
    assert any("card/PR" in a for a in content_warnings("Bom PR. No card 13993 ficou claro."))
    assert any("Testes e validações" in a for a in content_warnings("Falar com o QA antes."))
    assert any("atenção" in a for a in content_warnings("Ponto de atenção no fluxo. Outro ponto de atenção nos logs."))


def test_numeracao_pela_pasta():
    from relay.pr_reviews import next_number
    import tempfile
    from pathlib import Path
    with tempfile.TemporaryDirectory() as td:
        base = Path(td)
        assert next_number(base) == 1
        (base / "30-review-pr-8616-x.md").write_text("x")
        (base / "31-review-pr-8616-y.md").write_text("y")
        assert next_number(base) == 32


def test_diff_refs_invalidas(client, projeto):
    r = client.get(f"/api/projects/{projeto}/pr-reviews/diff",
                   params={"repo_path": "/tmp", "base": "a", "branch": "b;rm"})
    assert r.status_code == 400
