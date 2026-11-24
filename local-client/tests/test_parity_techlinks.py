"""Parity tests for the tech-links router (settings.tech_links in config.json).

Mounts ``relay.api.ext_techlinks.router`` on the real app with an isolated
config file (via the ``temp_db`` fixture from conftest, which monkeypatches
``relay.config._CONFIG_FILE``), following the pattern of
``test_parity_insights.py``.
"""
import pytest
from fastapi.testclient import TestClient

from relay.api.app import app
from relay.api.ext_techlinks import router

app.include_router(router)
# O catch-all do SPA (GET /{full_path:path}, registrado por _mount_webui)
# responde 404 para qualquer /api/* que venha DEPOIS dele; routers incluídos
# vão para o fim da lista, então reposiciona o bloco incluído para antes
# dele — o integrador precisa garantir a mesma ordem em produção.
if not getattr(app.state, "techlinks_router_ordered", False):
    _inc = app.router.routes.pop()
    _spa_idx = next(
        (i for i, r in enumerate(app.router.routes)
         if getattr(r, "path", None) == "/{full_path:path}"),
        len(app.router.routes),
    )
    app.router.routes.insert(_spa_idx, _inc)
    app.state.techlinks_router_ordered = True


@pytest.fixture
def client(temp_db):
    from relay.db.models import init_db

    init_db(str(temp_db))
    with TestClient(app) as c:
        yield c


def test_get_empty_by_default(client):
    r = client.get("/api/tech-links")
    assert r.status_code == 200, r.text
    assert r.json() == {"links": []}


def test_put_round_trip(client):
    payload = {"links": [
        {"nome": "daily.dev", "url": "https://daily.dev",
         "categoria": "Notícias", "descricao": "Feed tech"},
        {"nome": "Sem esquema", "url": "example.com"},
    ]}
    r = client.put("/api/tech-links", json=payload)
    assert r.status_code == 200, r.text
    saved = r.json()["links"]
    assert saved[0]["nome"] == "daily.dev"
    # Sem esquema: o https:// é completado como no diálogo da GUI.
    assert saved[1]["url"] == "https://example.com"
    assert saved[1]["categoria"] == "Notícias"
    assert saved[1]["descricao"] == ""

    assert client.get("/api/tech-links").json() == {"links": saved}


def test_put_persists_to_config(client):
    from relay.config import load_config

    client.put("/api/tech-links", json={"links": [
        {"nome": "X", "url": "https://x.com", "categoria": "C", "descricao": "d"},
    ]})
    assert load_config()["settings"]["tech_links"][0]["nome"] == "X"


def test_put_rejects_missing_url(client):
    r = client.put("/api/tech-links", json={"links": [{"nome": "X"}]})
    assert r.status_code == 400


def test_put_rejects_blank_nome(client):
    r = client.put("/api/tech-links",
                   json={"links": [{"nome": "  ", "url": "https://x.com"}]})
    assert r.status_code == 400


def test_put_rejects_non_list_body(client):
    assert client.put("/api/tech-links", json={"links": "nope"}).status_code == 400
    assert client.put("/api/tech-links", json={}).status_code == 400


def test_put_rejects_non_object_entry(client):
    r = client.put("/api/tech-links", json={"links": ["https://x.com"]})
    assert r.status_code == 400
