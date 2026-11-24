"""Tech links for the web shell: user shortcuts to tech-news sites.

Companion router for ``relay.api.app``. The integrator owns
``app.include_router(router)``; this module only declares
``router = APIRouter()`` with final ``/api/...`` paths.

Storage mirrors ``relay.gui.views.tech_links_view`` 1:1: the list lives in
``config.json`` under ``settings.tech_links`` and is managed with
``relay.config.load_config`` / ``save_config``. No Qt here.

Schema per link (same keys as the PySide view):
- ``nome`` (str, required, non-empty)
- ``url`` (str, required, non-empty; ``https://`` is prepended when the
  scheme is missing, mirroring ``_AddLinkDialog.valores``)
- ``categoria`` (str, optional, defaults to ``"Noticias"``-family
  ``"Notícias"``; blank falls back to the default, mirroring the dialog)
- ``descricao`` (str, optional, defaults to ``""``)
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter()

DEFAULT_CATEGORY = "Notícias"


def _read_links() -> list[dict]:
    from relay.config import load_config

    links = load_config().get("settings", {}).get("tech_links")
    return list(links) if links else []


def _normalize_link(raw: object, index: int) -> dict:
    """Validate one link dict, mirroring the GUI dialog rules.

    Raises ``HTTPException(400)`` on anything the dialog would refuse
    (blank ``nome``/``url``) or that is not an object of strings.
    """
    if not isinstance(raw, dict):
        raise HTTPException(status_code=400, detail=f"links[{index}] must be an object")
    nome = raw.get("nome")
    url = raw.get("url")
    if not isinstance(nome, str) or not nome.strip():
        raise HTTPException(status_code=400, detail=f"links[{index}].nome is required")
    if not isinstance(url, str) or not url.strip():
        raise HTTPException(status_code=400, detail=f"links[{index}].url is required")
    url = url.strip()
    if "://" not in url:
        url = "https://" + url

    categoria = raw.get("categoria", DEFAULT_CATEGORY)
    if categoria is None or (isinstance(categoria, str) and not categoria.strip()):
        categoria = DEFAULT_CATEGORY
    if not isinstance(categoria, str):
        raise HTTPException(status_code=400, detail=f"links[{index}].categoria must be a string")

    descricao = raw.get("descricao", "")
    if descricao is None:
        descricao = ""
    if not isinstance(descricao, str):
        raise HTTPException(status_code=400, detail=f"links[{index}].descricao must be a string")

    return {
        "nome": nome.strip(),
        "url": url,
        "categoria": categoria.strip(),
        "descricao": descricao,
    }


@router.get("/api/tech-links")
def list_tech_links():
    """Return ``{"links": [...]}`` (``[]`` when nothing was saved yet)."""
    return {"links": _read_links()}


@router.put("/api/tech-links")
def save_tech_links(body: dict):
    """Replace the whole list, validating every entry (400 on invalid)."""
    if not isinstance(body, dict) or not isinstance(body.get("links"), list):
        raise HTTPException(status_code=400, detail="body must be {links: [...]}")
    links = [_normalize_link(item, i) for i, item in enumerate(body["links"])]

    from relay.config import load_config, save_config

    cfg = load_config()
    cfg.setdefault("settings", {})["tech_links"] = links
    save_config(cfg)
    return {"links": links}
