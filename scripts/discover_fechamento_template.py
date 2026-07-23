#!/usr/bin/env python3
"""Fase 0 — calibração Gestta fechamento anual (ver outputs/fechamento/fase0-descoberta.json)."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from orquestrar_fechamento import listar_fechamento_api, FASE0, EXERCICIO  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", default="DONE")
    ap.add_argument("--salvar", action="store_true")
    args = ap.parse_args()
    statuses = [s.strip().upper() for s in args.status.split(",") if s.strip()]
    tarefas = listar_fechamento_api(statuses)
    print(f"total={len(tarefas)} exercicio={EXERCICIO}")
    if args.salvar:
        FASE0.parent.mkdir(parents=True, exist_ok=True)
        payload = json.loads(FASE0.read_text(encoding="utf-8")) if FASE0.exists() else {}
        payload["total"] = len(tarefas)
        payload["amostra_tarefas"] = tarefas[:5]
        FASE0.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"salvo em {FASE0}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
