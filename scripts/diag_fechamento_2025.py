#!/usr/bin/env python3
"""Cobertura fechamento 2025: Gestta taskId vs balancetes.gestta_task_id."""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

import bridge_front as bf  # noqa: E402
from orquestrar_fechamento import (  # noqa: E402
    _carregar_ledger,
    ja_processada_fechamento,
    listar_fechamento_api,
    resolver_empresa_fechamento,
)


def analisar(statuses: list[str]) -> dict:
    tarefas = listar_fechamento_api(statuses)
    ledger = _carregar_ledger()
    balancetes = bf.sb_get("balancetes", {
        "select": "gestta_task_id,status,dc_ok,empresa_id",
        "exercicio": "eq.2025",
        "limit": "1000",
    })
    por_task = {b["gestta_task_id"]: b for b in balancetes if b.get("gestta_task_id")}

    sem_empresa = []
    nao_proc = []
    proc = []
    status_counter = Counter()

    for t in tarefas:
        tid = t.get("taskId")
        cod = t.get("clienteCodigo") or ""
        nome = t.get("clienteNome") or ""
        emp = resolver_empresa_fechamento(cod, nome)
        if emp is None or (isinstance(emp, dict) and emp.get("_ambiguo")):
            sem_empresa.append({"codigo": cod, "nome": nome, "taskId": tid})
            continue
        if ja_processada_fechamento(tid):
            row = por_task.get(tid) or {}
            st = row.get("status") or "ledger"
            status_counter[st] += 1
            proc.append({"codigo": cod, "taskId": tid, "status": st, "dc_ok": row.get("dc_ok")})
        else:
            nao_proc.append({"codigo": cod, "nome": nome, "taskId": tid})

    return {
        "gestta_total": len(tarefas),
        "processadas": len(proc),
        "nao_processadas": len(nao_proc),
        "sem_empresa_ou_ambiguo": len(sem_empresa),
        "ledger_keys": len(ledger),
        "balancetes_supabase": len(balancetes),
        "status_processados": dict(status_counter),
        "dc_ok": sum(1 for p in proc if p.get("dc_ok") is True),
        "amostra_pendentes": nao_proc[:15],
        "amostra_sem_empresa": sem_empresa[:10],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", default="DONE")
    ap.add_argument("--json-out", default=None)
    args = ap.parse_args()
    statuses = [s.strip().upper() for s in args.status.split(",") if s.strip()]
    rel = analisar(statuses)
    print(json.dumps(rel, ensure_ascii=False, indent=2))
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(rel, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
