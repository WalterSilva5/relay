"""Relay Electron shell — janela, tray, sidecar Python e hotkey global.

Arquitetura: a UI é a webui React servida pelo FastAPI; este processo só
orquestra (janela + SO). Gravação/transcrição/banco continuam no sidecar.

                                   +-------------------+
                                   |   Electron (main) |
                                   | tray · hotkeys ·  |
                                   | janela · updater  |
                                   +--------+----------+
                                            | HTTP 127.0.0.1:9777
                                   +--------v----------+
                                   |  FastAPI sidecar  |  (relay.webmain)
                                   |  SQLite · Whisper |
                                   +-------------------+
"""
from __future__ import annotations

import argparse
import atexit
import json
import logging
import os
import queue
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

LOG = logging.getLogger("relay.electron_shim")

REPO_ROOT = Path(__file__).resolve().parents[1]
SIDECAR_HOST = "127.0.0.1"


def resolve_port(default: int = 9777) -> int:
    for name in ("RELAY_PORT", "RELAY_WEB_PORT"):
        raw = (os.environ.get(name) or "").strip()
        if raw.isdigit():
            return int(raw)
    return default


def resolve_python() -> list[str]:
    """Binário Python para o sidecar: env > bundle empacotado > .venv de dev > sistema."""
    env_py = (os.environ.get("RELAY_PYTHON") or "").strip()
    if env_py:
        return [env_py]
    bundled = REPO_ROOT / "electron" / "dist-sidecar" / "relay-server"
    if bundled.exists():
        return [str(bundled)]
    venv_py = REPO_ROOT / "local-client" / ".venv" / "bin" / "python"
    if venv_py.exists():
        return [str(venv_py)]
    exe = shutil.which("python3")
    if exe:
        return [exe]
    raise RuntimeError("Nenhum Python encontrado (defina RELAY_PYTHON)")


def wait_healthy(base_url: str, timeout_s: float = 30.0) -> bool:
    """Aguarda GET /api/health responder {"status": "ok"}."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base_url + "/api/health", timeout=2) as r:
                if r.status == 200 and json.loads(r.read().decode()).get("status") == "ok":
                    return True
        except Exception:  # noqa: BLE001 - ainda subindo
            pass
        time.sleep(0.5)
    return False


class Sidecar:
    """Sobe o FastAPI como processo filho e garante o encerramento limpo."""

    def __init__(self, port: int):
        self.port = port
        self.proc: subprocess.Popen | None = None
        self._log_thread: threading.Thread | None = None

    def start(self) -> str:
        env = dict(os.environ)
        env.setdefault("PYTHONUNBUFFERED", "1")
        cmd = resolve_python() + ["-m", "relay.webmain", "--port", str(self.port)]
        LOG.info("Subindo sidecar: %s (cwd=local-client)", " ".join(cmd))
        self.proc = subprocess.Popen(
            cmd,
            cwd=str(REPO_ROOT / "local-client"),
            env={**env, "PYTHONPATH": str(REPO_ROOT / "local-client")},
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,  # grupo próprio: mata a árvore inteira no stop()
        )
        self._log_thread = threading.Thread(target=self._drain, daemon=True)
        self._log_thread.start()
        base = f"http://{SIDECAR_HOST}:{self.port}"
        if not wait_healthy(base):
            self.stop()
            raise RuntimeError(f"Sidecar não respondeu em {base}/api/health")
        LOG.info("Sidecar saudável em %s", base)
        return base

    def _drain(self) -> None:
        assert self.proc and self.proc.stdout
        for line in self.proc.stdout:
            sys.stderr.write(f"[sidecar] {line}")

    def stop(self) -> None:
        proc, self.proc = self.proc, None
        if proc is None or proc.poll() is not None:
            return
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            proc.wait(timeout=10)
        except Exception:  # noqa: BLE001 - garante que não vira zumbi
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except Exception:
                pass


def toggle_recording(base_url: str) -> str:
    """Alterna gravação ao vivo via API (o que o Ctrl+Shift+R do Electron chama)."""
    def call(method: str, path: str, body: dict | None = None):
        data = json.dumps(body or {}).encode() if body is not None else None
        req = urllib.request.Request(base_url + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or "{}")

    try:
        status = call("GET", "/api/recordings/live/status")
    except Exception as e:  # noqa: BLE001
        return f"Relay fora do ar: {e}"
    try:
        if status.get("recording"):
            out = call("POST", "/api/recordings/live/stop", {})
            return f"Gravação salva ({out.get('durationSec', '?')}s, #{out.get('recordingId', '?')})"
        out = call("POST", "/api/recordings/live/start", {})
        return f"Gravando… ({out.get('mic', '?')} + {out.get('monitor', '?')})"
    except Exception as e:  # noqa: BLE001
        return f"Falha na gravação: {e}"


def check_tray_deps() -> list[str]:
    """Dependências de SO que o shell Electron vai precisar (checagem de ambiente)."""
    missing = []
    for cmd in ("pactl", "parec"):
        if shutil.which(cmd) is None:
            missing.append(cmd)
    return missing


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Relay Electron — checagens sem GUI (CI/smoke).")
    parser.add_argument("--check-env", action="store_true", help="só checa dependências e sai")
    parser.add_argument("--toggle-record", action="store_true", help="alterna a gravação via API e sai")
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    if args.check_env:
        missing = check_tray_deps()
        print(f"python: {resolve_python()[0]}")
        print(f"audio (pactl/parec): {'ok' if not missing else 'AUSENTE: ' + ','.join(missing)}")
        return 0 if not missing else 2

    port = args.port or resolve_port()
    if args.toggle_record:
        print(toggle_recording(f"http://{SIDECAR_HOST}:{port}"))
        return 0

    print("Este shim valida ambiente/record sem GUI. O shell Electron (main.js) vem na Fase 1.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
