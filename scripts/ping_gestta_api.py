#!/usr/bin/env python3
"""Ping leve da API Gestta — usado pelo cron refresh_gestta_sessao.sh."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from gestta.sessao_api import ping_gestta_api  # noqa: E402

if __name__ == "__main__":
    ok = ping_gestta_api()
    print(f"api_ok={ok}")
    sys.exit(0 if ok else 1)
