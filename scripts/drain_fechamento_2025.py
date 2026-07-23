#!/usr/bin/env python3
"""
scripts/drain_fechamento_2025.py — drain do fechamento anual 2025 em lotes frescos.

Clone de drain_backlog.py para orquestrar_fechamento.py (~682 tarefas Gestta).

Uso (VPS /opt/lcr):
  setsid nohup PYTHONUTF8=1 venv/bin/python3 scripts/drain_fechamento_2025.py \
      --limite 8 --max-lotes 100 > outputs/orquestracao/drain-fechamento.log 2>&1 < /dev/null &
"""
import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PY = str(ROOT / "venv" / "bin" / "python3")
ORQ = str(ROOT / "src" / "orquestrar_fechamento.py")
sys.path.insert(0, str(ROOT / "src"))


def log(msg):
    print(f"[drain-fech {dt.datetime.utcnow().strftime('%H:%M:%S')}Z] {msg}", flush=True)


def outro_orquestrador_rodando() -> bool:
    try:
        r = subprocess.run(["pgrep", "-af", "orquestrar"], capture_output=True, text=True)
        linhas = [
            l for l in r.stdout.splitlines()
            if l.strip() and "drain_fechamento" not in l
            and ("python" in l.lower() or "Python" in l)
            and ("orquestrar.py" in l or "orquestrar_fechamento.py" in l)
        ]
        return bool(linhas)
    except Exception:
        return False


def rodar_lote(limite: int, status: str = "DONE") -> dict:
    cmd = [PY, ORQ, "--limite", str(limite), "--status", status]
    env = {"PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT), env={**os.environ, **env})
    if p.stdout:
        print(p.stdout, flush=True)
    if p.returncode != 0 and p.stderr:
        print("STDERR:\n" + p.stderr[-1500:], flush=True)
    for linha in reversed([l for l in (p.stdout or "").splitlines() if l.strip()]):
        try:
            obj = json.loads(linha)
            if isinstance(obj, dict) and "contagem" in obj:
                return obj
        except Exception:
            continue
    return {"ok": False, "rc": p.returncode, "contagem": {}, "total_tarefas": None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limite", type=int, default=8)
    ap.add_argument("--pausa", type=float, default=30)
    ap.add_argument("--max-lotes", type=int, default=100)
    ap.add_argument("--status", default="DONE")
    args = ap.parse_args()

    log(f"INÍCIO drain fechamento 2025 · limite {args.limite}/lote · pausa {args.pausa:g}s · status {args.status}")
    tot_ok = tot_parcial = tot_erro = tot_sem = tot_inc = tot_pulada = 0
    sem_progresso = 0

    for i in range(1, args.max_lotes + 1):
        esperas = 0
        while outro_orquestrador_rodando():
            if esperas == 0:
                log("outro orquestrador rodando — aguardando...")
            esperas += 1
            time.sleep(20)
            if esperas > 30:
                log("aviso: esperei 10min, seguindo")
                break

        log(f"── lote {i}/{args.max_lotes} ──")
        res = rodar_lote(args.limite, args.status)
        c = res.get("contagem", {}) or {}
        ok = c.get("ok", 0)
        parcial = c.get("parcial", 0)
        erro = c.get("erro", 0)
        sem_emp = c.get("sem_empresa", 0) + c.get("match_ambiguo", 0)
        incompleta = c.get("incompleta", 0)
        pulada = c.get("pulada_idempotencia", 0)
        progresso = ok + parcial + sem_emp
        total = res.get("total_tarefas")

        tot_ok += ok
        tot_parcial += parcial
        tot_erro += erro
        tot_sem += sem_emp
        tot_inc += incompleta
        tot_pulada += pulada

        log(f"   lote: ok={ok} parcial={parcial} incompleta={incompleta} sem_empresa={sem_emp} erro={erro} "
            f"pulada={pulada} (selecionadas={total}) | acum: ok={tot_ok} parcial={tot_parcial}")

        if res.get("rc") not in (0, None):
            log(f"   ⚠️ rc={res.get('rc')}")

        if total == 0:
            log("✅ FIM: nenhuma tarefa pendente — backlog esvaziado.")
            break

        if progresso == 0:
            sem_progresso += 1
            if sem_progresso >= 3:
                try:
                    from orquestrar import relogin_gestta  # noqa: WPS433
                    log("3 lotes sem avanço na fila — tentando relogin Gestta...")
                    if relogin_gestta():
                        sem_progresso = 0
                        continue
                except Exception as e:
                    log(f"relogin falhou: {str(e)[:120]}")
                log(f"⏹️ FIM: 3 lotes sem avanço (ok/parcial/sem_empresa). sem_empresa={tot_sem} erro={tot_erro}")
                break
        else:
            sem_progresso = 0

        time.sleep(args.pausa)
    else:
        log(f"⏹️ FIM: teto {args.max_lotes} lotes.")

    log(f"RESUMO · ok={tot_ok} · parcial={tot_parcial} · incompleta={tot_inc} · sem_empresa={tot_sem} · erro={tot_erro}")


if __name__ == "__main__":
    main()
