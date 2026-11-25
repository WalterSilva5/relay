#!/usr/bin/env python3
"""Captura prints das rotas do Relay no app Electron (CDP), em várias larguras.

Requer o app aberto com `RELAY_ELECTRON_ARGS="--remote-debugging-port=9222"`.

Uso:
  python3 scripts/ui-shot.py /dashboard,/board,/design /tmp/ui-shots
  python3 scripts/ui-shot.py /board /tmp/ui-shots 1440,1024,768,420

Saída: <outdir>/<largura>/<rota>.png (rota sem barras).
"""
import base64
import json
import os
import socket
import struct
import sys
import time
import urllib.request
from urllib.parse import urlparse

BASE = "http://127.0.0.1:9777"


def _read(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise RuntimeError("conexão CDP caiu")
        buf += chunk
    return buf


def ws_connect(host, port, path):
    sock = socket.create_connection((host, port), timeout=20)
    key = base64.b64encode(b"relay-ui-shot-001").decode()
    sock.sendall((
        f"GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n"
        f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    ).encode())
    head = b""
    while b"\r\n\r\n" not in head:
        head += sock.recv(4096)
    if b"101" not in head.split(b"\r\n")[0]:
        raise RuntimeError(f"handshake CDP rejeitado: {head[:120]!r}")
    return sock


def ws_send(sock, obj):
    payload = json.dumps(obj).encode()
    mask = os.urandom(4)
    if len(payload) < 126:
        hdr = bytes([0x81, 0x80 | len(payload)])
    elif len(payload) < 65536:
        hdr = struct.pack("!BBH", 0x81, 0x80 | 126, len(payload))
    else:
        hdr = struct.pack("!BBQ", 0x81, 0x80 | 127, len(payload))
    sock.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))


def ws_recv(sock, timeout=30):
    sock.settimeout(timeout)
    _, b2 = _read(sock, 2)
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack("!H", _read(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _read(sock, 8))[0]
    if b2 & 0x80:
        _read(sock, 4)
    return json.loads(_read(sock, length).decode())


def call(sock, mid, method, params=None):
    ws_send(sock, {"id": mid, "method": method, "params": params or {}})
    while True:
        msg = ws_recv(sock)
        if msg.get("id") == mid:
            return msg


def main():
    rotas = [r.strip() for r in (sys.argv[1] if len(sys.argv) > 1 else "/dashboard").split(",") if r.strip()]
    outdir = sys.argv[2] if len(sys.argv) > 2 else "/tmp/ui-shots"
    larguras = [int(w) for w in (sys.argv[3] if len(sys.argv) > 3 else "1440,1024,768,420").split(",")]
    espera = float(sys.argv[4]) if len(sys.argv) > 4 else 3.5

    tabs = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=10))
    page = next(t for t in tabs if t.get("type") == "page" and "127.0.0.1:9777" in t.get("url", ""))
    u = urlparse(page["webSocketDebuggerUrl"])
    sock = ws_connect(u.hostname, u.port, u.path)

    mid = 0
    for largura in larguras:
        pasta = os.path.join(outdir, str(largura))
        os.makedirs(pasta, exist_ok=True)
        mid += 1
        call(sock, mid, "Emulation.setDeviceMetricsOverride",
             {"width": largura, "height": 900, "deviceScaleFactor": 1, "mobile": False})
        for rota in rotas:
            mid += 1
            call(sock, mid, "Runtime.evaluate", {"expression": f"location.href = {json.dumps(BASE + rota)}"})
            time.sleep(espera)
            mid += 1
            info = call(sock, mid, "Runtime.evaluate", {
                "expression": "JSON.stringify({path: location.pathname, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, txt: ((document.getElementById('root')?.innerText)||'').replace(/\\s+/g,' ').slice(0,60)})",
            })
            raw = (info.get("result", {}).get("result", {}) or {}).get("value", "{}")
            import json as _json
            meta = _json.loads(raw) if raw.startswith("{") else {}
            texto = ("OVERFLOW " if meta.get("overflow") else "") + f"{meta.get('path','')} | {meta.get('txt','')} [{meta.get('sw')}/{meta.get('cw')}]"
            mid += 1
            shot = call(sock, mid, "Page.captureScreenshot", {"format": "png"})
            data = base64.b64decode(shot["result"]["data"])
            nome = rota.strip("/").replace("/", "-") or "root"
            caminho = os.path.join(pasta, f"{nome}.png")
            with open(caminho, "wb") as fh:
                fh.write(data)
            print(f"{largura}px {rota}: {len(data)} bytes | {texto[:70]}")
    sock.close()


if __name__ == "__main__":
    main()
