#!/usr/bin/env python3
"""Sincroniza fechamento-avisos.jsonl → Supabase fechamento_avisos."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

import bridge_front as bf  # noqa: E402

AVISOS = ROOT / "outputs" / "orquestracao" / "fechamento-avisos.jsonl"
EXERCICIO = 2025


def main():
    bf.obter_jwt()
    if not AVISOS.exists():
        print(json.dumps({"ok": True, "synced": 0, "msg": "sem arquivo avisos"}, ensure_ascii=False))
        return

    vistos: dict[str, dict] = {}
    for linha in AVISOS.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha:
            continue
        try:
            d = json.loads(linha)
        except Exception:
            continue
        tid = d.get("taskId")
        if tid:
            vistos[tid] = d

    ok = erros = 0
    for tid, d in vistos.items():
        try:
            bf.persistir_fechamento_aviso(
                gestta_task_id=tid,
                codigo_gestta=d.get("codigo") or "",
                nome_gestta=d.get("nome") or d.get("codigo") or "?",
                status_pipeline=d.get("status") or "sem_empresa",
                motivo=d.get("motivo") or "",
                exercicio=EXERCICIO,
            )
            ok += 1
        except Exception as e:
            erros += 1
            print(f"ERRO {d.get('codigo')}: {str(e)[:120]}", file=sys.stderr)

    print(json.dumps({
        "ok": True,
        "unicos": len(vistos),
        "synced": ok,
        "erros": erros,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
