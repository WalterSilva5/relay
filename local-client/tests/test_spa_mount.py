"""Mount do SPA no modo empacotado (PyInstaller: webui-dist ao lado do binário)."""
import sys

from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_monta_webui_empacotada(tmp_path, monkeypatch):
    import relay.api.app as appmod

    exe = tmp_path / "relay-server"
    exe.write_bytes(b"x")
    (tmp_path / "webui-dist").mkdir()
    (tmp_path / "webui-dist" / "index.html").write_text("<html>FROZEN</html>", encoding="utf-8")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(exe), raising=False)
    sub = FastAPI()
    appmod._mount_webui(sub)
    c = TestClient(sub, raise_server_exceptions=False)
    assert c.get("/").text == "<html>FROZEN</html>"
    assert c.get("/api/nao-existe").status_code == 404


def test_base_dir_dev_aponta_para_local_client(monkeypatch):
    import relay.api.app as appmod

    monkeypatch.delattr(sys, "frozen", raising=False)
    base = appmod._base_dir()
    assert base.name == "local-client"
