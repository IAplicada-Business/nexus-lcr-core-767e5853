#!/usr/bin/env python3
"""Agrega tarefas incompletas únicas dos logs fechamento-run-*.json."""
import glob
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs" / "orquestracao"


def main():
    motivos = Counter()
    clientes = []
    vistos = set()
    for arq in sorted(OUT.glob("fechamento-run-20260723-*.json")):
        try:
            d = json.loads(arq.read_text(encoding="utf-8"))
        except Exception:
            continue
        for t in d.get("tarefas") or []:
            if t.get("status") != "incompleta":
                continue
            tid = t.get("tarefa_id")
            if tid in vistos:
                continue
            vistos.add(tid)
            m = (t.get("motivo") or "?")[:160]
            motivos[m] += 1
            clientes.append({
                "codigo": t.get("cliente_codigo") or t.get("cliente"),
                "motivo": m,
                "taskId": tid,
                "faltando": t.get("faltando"),
            })
    rel = {
        "unicas_incompletas": len(vistos),
        "motivos": dict(motivos.most_common(15)),
        "amostra": clientes[:15],
    }
    print(json.dumps(rel, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
