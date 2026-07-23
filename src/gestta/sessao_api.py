"""Helpers leves de sessão Gestta (JWT + ping API). Sem imports de orquestrar/sci."""
from __future__ import annotations

import base64
import json
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent.parent
SESSION_FILE = ROOT / "sessions" / "gestta-session.json"
GESTTA_SEARCH = "https://api.gestta.com.br/core/customer/task/search"


def _gestta_jwt() -> str:
    """Lê o token (ngStorage-jwt) do arquivo de sessão → 'JWT eyJ...'."""
    s = json.loads(SESSION_FILE.read_text(encoding="utf-8"))
    for o in s.get("origins", []):
        for kv in o.get("localStorage", []):
            if kv.get("name") == "ngStorage-jwt":
                return json.loads(kv["value"])
    raise RuntimeError("token ngStorage-jwt não encontrado na sessão Gestta")


def _jwt_payload() -> dict:
    tok = _gestta_jwt().replace("JWT ", "").split(".")[1]
    tok += "=" * (-len(tok) % 4)
    return json.loads(base64.urlsafe_b64decode(tok))


def jwt_gestta_quase_expirado(margem_seg: int = 7200) -> bool:
    """True se o JWT expira em menos de margem_seg (default 2h)."""
    try:
        exp = _jwt_payload().get("exp")
        if not exp:
            return True
        return (exp - time.time()) < margem_seg
    except Exception:
        return True


def ping_gestta_api() -> bool:
    """Healthcheck leve: 1 POST na API de tarefas. False se 401/403 ou token ausente."""
    try:
        jwt = _gestta_jwt()
    except Exception:
        return False
    try:
        r = requests.post(
            GESTTA_SEARCH,
            headers={"Authorization": jwt, "Content-Type": "application/json"},
            json={"type": ["SERVICE_ORDER"], "limit": 1, "page": 1, "status": ["OPEN"]},
            timeout=30,
        )
        return r.status_code == 200
    except Exception:
        return False
