"""Smoke do shim Electron (sem display): resolução de porta, health e toggle."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "electron"))

import shim


def test_resolve_port_padrao_e_env(monkeypatch):
    monkeypatch.delenv("RELAY_PORT", raising=False)
    monkeypatch.delenv("RELAY_WEB_PORT", raising=False)
    assert shim.resolve_port() == 9777
    monkeypatch.setenv("RELAY_PORT", "9888")
    assert shim.resolve_port() == 9888


def test_wait_healthy_falha_rapido():
    # porta certamente fechada (descarta após bind)
    import socket
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    porta = s.getsockname()[1]
    s.close()
    assert shim.wait_healthy(f"http://127.0.0.1:{porta}", timeout_s=1.0) is False


def test_toggle_sem_servidor():
    msg = shim.toggle_recording("http://127.0.0.1:9")
    assert "fora do ar" in msg
