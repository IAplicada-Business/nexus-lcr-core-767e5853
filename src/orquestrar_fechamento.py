"""
Orquestra extração do fechamento anual 2025 (Gestta → Supabase).

Calibração Fase 0 (22/07/2026):
  - company_task: 61cde47d37a0e7000628dd95 (DEMONSTRATIVOS DO FECHAMENTO ANUAL)
  - ~682 tarefas, competence_date 2024-12
  - Anexos em company_documents[].file (não document_request)

Uso (VPS /opt/lcr):
  PYTHONUTF8=1 venv/bin/python3 src/orquestrar_fechamento.py --cliente MASCA --limite 1
  PYTHONUTF8=1 venv/bin/python3 src/orquestrar_fechamento.py --limite 5
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

import bridge_front as bf  # noqa: E402
from gestta import api_docs  # noqa: E402
from orquestrar import (  # noqa: E402
    _gestta_jwt,
    garantir_sessao_gestta_api,
    log,
    relogin_gestta,
)

OUT_DIR = ROOT / "outputs" / "orquestracao"
LEDGER = OUT_DIR / "fechamento-processadas.json"
AVISOS = OUT_DIR / "fechamento-avisos.jsonl"
FASE0 = ROOT / "outputs" / "fechamento" / "fase0-descoberta.json"
GESTTA_SEARCH = "https://api.gestta.com.br/core/customer/task/search"

EXERCICIO = 2025
COMPETENCIA_FRONT = "2025-12"
COMPANY_TASK = "61cde47d37a0e7000628dd95"


def outro_orquestrador_rodando() -> bool:
    """Evita concorrência com COBRANÇA (orquestrar.py) ou outro fechamento."""
    meu = os.getpid()
    alvos = ("src/orquestrar.py", "src/orquestrar_fechamento.py")
    shells = {"bash", "sh", "/bin/bash", "/usr/bin/bash", "/bin/sh", "/usr/bin/sh"}
    try:
        r = subprocess.run(["pgrep", "-af", "orquestrar"], capture_output=True, text=True, timeout=10)
    except Exception:
        return False
    for linha in r.stdout.splitlines():
        linha = linha.strip()
        if not linha or "drain_" in linha:
            continue
        partes = linha.split(None, 2)
        if len(partes) >= 2 and partes[1] in shells:
            continue
        if "python" not in linha and "Python" not in linha:
            continue
        if not any(alvo in linha for alvo in alvos):
            continue
        try:
            pid = int(partes[0])
        except ValueError:
            continue
        if pid != meu:
            return True
    return False


def _carregar_body_search() -> dict:
    if FASE0.exists():
        data = json.loads(FASE0.read_text(encoding="utf-8"))
        body = dict(data.get("body_search") or {})
        body.pop("limit", None)
        return body
    return {
        "type": ["SERVICE_ORDER", "RECURRENT", "ACCOUNTING"],
        "company_task": [COMPANY_TASK],
        "start_date": "2025-01-01T03:00:00.000Z",
        "end_date": "2026-01-01T02:59:59.999Z",
        "date_type": "COMPETENCE",
        "status": ["DONE"],
        "document_request_sent": False,
        "os_workflow": True,
    }


def listar_fechamento_api(statuses=None) -> list:
    jwt = _gestta_jwt()
    statuses = statuses or ["DONE"]
    base = {**_carregar_body_search(), "limit": 100}
    headers = {"Authorization": jwt, "Content-Type": "application/json"}
    vistos, out = set(), []
    for status in statuses:
        page = 1
        while True:
            body = {**base, "status": [status], "page": page}
            r = requests.post(GESTTA_SEARCH, headers=headers, json=body, timeout=60)
            if not r.ok:
                raise RuntimeError(f"Gestta search HTTP {r.status_code}: {r.text[:200]}")
            docs = r.json().get("docs") or []
            for d in docs:
                tid = d.get("_id")
                if tid in vistos:
                    continue
                vistos.add(tid)
                cust = d.get("customer") or {}
                out.append({
                    "taskId": tid,
                    "nome": d.get("name"),
                    "clienteCodigo": cust.get("code") or "",
                    "clienteNome": cust.get("name") or "",
                    "responsavel": (d.get("owner") or {}).get("name") or "",
                    "competence": (d.get("competence_date") or "")[:7],
                    "status": status,
                })
            if len(docs) < base["limit"]:
                break
            page += 1
    return out


def _carregar_ledger() -> dict:
    try:
        return json.loads(LEDGER.read_text(encoding="utf-8"))
    except Exception:
        return {}


def ja_processada_fechamento(gestta_task_id: str) -> bool:
    if gestta_task_id in _carregar_ledger():
        return True
    rows = bf.sb_get("balancetes", {
        "select": "id",
        "gestta_task_id": f"eq.{gestta_task_id}",
        "limit": "1",
    })
    return bool(rows)


def marcar_processada_fechamento(gestta_task_id: str, meta: dict):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    led = _carregar_ledger()
    led[gestta_task_id] = {
        **meta,
        "em": dt.datetime.now().isoformat(timespec="seconds"),
    }
    LEDGER.write_text(json.dumps(led, ensure_ascii=False, indent=0), encoding="utf-8")


def registrar_aviso_fechamento(tarefa_id: str, codigo: str, nome: str, status: str, motivo: str):
    """Registra aviso persistente para empresas não cadastradas / match ambíguo / incompleta."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    linha = {
        "taskId": tarefa_id,
        "codigo": codigo,
        "nome": nome,
        "status": status,
        "motivo": motivo,
        "em": dt.datetime.now().isoformat(timespec="seconds"),
    }
    with AVISOS.open("a", encoding="utf-8") as f:
        f.write(json.dumps(linha, ensure_ascii=False) + "\n")
    try:
        bf.obter_jwt()
        bf.persistir_fechamento_aviso(
            gestta_task_id=tarefa_id,
            codigo_gestta=codigo,
            nome_gestta=nome,
            status_pipeline=status,
            motivo=motivo,
            exercicio=EXERCICIO,
        )
    except Exception as e:
        log(f"    ⚠️ aviso Supabase não gravado: {str(e)[:160]}")


def resolver_empresa_fechamento(codigo: str, nome: str):
    codigo = (codigo or "").strip()
    nome = (nome or "").strip()

    if codigo:
        rows = bf.sb_get("empresas", {
            "select": "id,razao_social,nome_fantasia,codigo_gestta",
            "codigo_gestta": f"eq.{codigo}",
            "limit": "2",
        })
        if len(rows) == 1:
            return rows[0]
        if len(rows) > 1:
            return {"_ambiguo": True}
        t = codigo.replace('"', " ")
        rows = bf.sb_get("empresas", {
            "select": "id,razao_social,nome_fantasia,codigo_gestta",
            "or": f'(nome_fantasia.ilike."{t}*",codigo_gestta.ilike."{t}*")',
            "limit": "2",
        })
        if len(rows) == 1:
            return rows[0]
        if len(rows) > 1:
            return {"_ambiguo": True}

    for termo in (nome, codigo):
        if not termo:
            continue
        t = termo.strip().replace('"', " ")
        rows = bf.sb_get("empresas", {
            "select": "id,razao_social,nome_fantasia,codigo_gestta",
            "or": f'(nome_fantasia.ilike."*{t}*",razao_social.ilike."*{t}*")',
            "limit": "2",
        })
        if len(rows) == 1:
            return rows[0]
        if len(rows) > 1:
            return {"_ambiguo": True}
    return None


def selecionar_pendentes_fechamento(tarefas: list, limite: int) -> list:
    pend = []
    for t in tarefas:
        tid = t.get("taskId")
        if ja_processada_fechamento(tid):
            continue
        empresa = resolver_empresa_fechamento(t.get("clienteCodigo") or "", t.get("clienteNome") or "")
        t["_empresa"] = empresa
        pend.append(t)
        if len(pend) >= limite:
            break
    return pend


def processar_tarefa_fechamento(t: dict, jwt_gestta: str) -> dict:
    codigo = t.get("clienteCodigo") or ""
    nome = t.get("clienteNome") or ""
    tarefa_id = t.get("taskId")
    base = {"cliente": nome or codigo, "tarefa_id": tarefa_id, "cliente_codigo": codigo}

    if not tarefa_id:
        return {**base, "status": "erro", "motivo": "tarefa sem taskId"}

    if ja_processada_fechamento(tarefa_id):
        return {**base, "status": "pulada_idempotencia"}

    empresa = t.get("_empresa")
    if isinstance(empresa, dict) and empresa.get("_ambiguo"):
        motivo = f"match ambíguo para '{codigo or nome}' — cadastre codigo_gestta no Supabase"
        marcar_processada_fechamento(tarefa_id, {
            "status": "match_ambiguo",
            "cliente": codigo or nome,
            "motivo": motivo,
        })
        registrar_aviso_fechamento(tarefa_id, codigo, nome, "match_ambiguo", motivo)
        return {**base, "status": "match_ambiguo", "motivo": motivo, "aviso": True}
    if not empresa:
        motivo = f"empresa não cadastrada no Supabase (código Gestta: '{codigo or '?'}')"
        marcar_processada_fechamento(tarefa_id, {
            "status": "sem_empresa",
            "cliente": codigo or nome,
            "motivo": motivo,
        })
        registrar_aviso_fechamento(tarefa_id, codigo, nome, "sem_empresa", motivo)
        return {**base, "status": "sem_empresa", "motivo": motivo, "aviso": True}

    empresa_id = empresa["id"]
    base["empresa_id"] = empresa_id

    try:
        detalhe = api_docs.detalhe_tarefa(tarefa_id, jwt_gestta)
    except Exception as e:
        return {**base, "status": "erro", "motivo": f"detalhe(api): {str(e)[:400]}"}

    slots = api_docs.slots_fechamento(detalhe)
    destino = str(ROOT / "outputs" / "fechamento" / "download" / tarefa_id)
    try:
        dl = api_docs.baixar_company_documents(detalhe, destino, jwt_gestta)
    except Exception as e:
        return {**base, "status": "erro", "motivo": f"download: {str(e)[:400]}"}

    balancete_path = conc_path = None
    for item in dl.get("salvos") or []:
        norm = item.get("slot_norm") or ""
        if norm == "BALANCETE":
            balancete_path = item["caminho"]
        elif norm == "CONCILIACOES":
            conc_path = item["caminho"]

    if not balancete_path:
        faltando = dl.get("faltando") or slots.get("faltando") or ["BALANCETE"]
        faltando_txt = ", ".join(faltando)
        motivo = f"documentos incompletos no Gestta (faltando: {faltando_txt})"
        marcar_processada_fechamento(tarefa_id, {
            "status": "incompleta",
            "empresa_id": empresa_id,
            "cliente": codigo or nome,
            "motivo": motivo,
            "faltando": faltando,
        })
        registrar_aviso_fechamento(tarefa_id, codigo, nome, "incompleta", motivo)
        return {**base, "status": "incompleta", "motivo": motivo, "aviso": True,
                "slots": slots, "faltando": faltando, "falhas": dl.get("falhas")}

    try:
        res = bf.persistir_fechamento(
            empresa_id=empresa_id,
            gestta_task_id=tarefa_id,
            competencia=COMPETENCIA_FRONT,
            exercicio=EXERCICIO,
            balancete_path=balancete_path,
            conciliacoes_path=conc_path,
            gestta_ref=codigo,
            slots_faltando=dl.get("faltando") or slots.get("faltando"),
        )
    except Exception as e:
        return {**base, "status": "erro", "motivo": f"supabase: {str(e)[:400]}"}

    status = res.get("status") or "parcial"
    marcar_processada_fechamento(tarefa_id, {
        "empresa_id": empresa_id,
        "status": status,
        "dc_ok": res.get("dc_ok"),
        "cliente": codigo or nome,
    })
    return {**base, **res}


def main():
    ap = argparse.ArgumentParser(description="Orquestra fechamento anual 2025 (Gestta → Supabase)")
    ap.add_argument("--limite", type=int, default=1, help="máximo de tarefas por execução")
    ap.add_argument("--cliente", default=None, help="filtra por código/nome do cliente")
    ap.add_argument("--status", default="DONE", help="status Gestta separados por vírgula")
    ap.add_argument("--pausa", type=float, default=2, help="segundos entre tarefas")
    args = ap.parse_args()

    if outro_orquestrador_rodando():
        msg = "outro orquestrador já em execução — pulando"
        log(f"  ⚠️ {msg}")
        print(json.dumps({"ok": True, "skipped": msg, "contagem": {}, "total_tarefas": 0}, ensure_ascii=False))
        return

    log(f"=== Fechamento anual {EXERCICIO} · competência front {COMPETENCIA_FRONT} ===")
    if not garantir_sessao_gestta_api():
        log("  ✗ sessão Gestta indisponível")
        sys.exit(2)

    jwt_gestta = _gestta_jwt()
    bf.obter_jwt()
    log("  JWT Supabase OK ✓")

    statuses = [s.strip().upper() for s in args.status.split(",") if s.strip()]
    tarefas = listar_fechamento_api(statuses)
    log(f"  {len(tarefas)} tarefa(s) fechamento listadas")

    if args.cliente:
        c = args.cliente.lower()
        tarefas = [t for t in tarefas
                   if c in (t.get("clienteCodigo") or "").lower()
                   or c in (t.get("clienteNome") or "").lower()]
        log(f"  filtro --cliente '{args.cliente}': {len(tarefas)} tarefa(s)")

    tarefas = selecionar_pendentes_fechamento(tarefas, args.limite)
    log(f"  processando {len(tarefas)} pendente(s)")

    resultados = []
    for i, t in enumerate(tarefas, 1):
        log(f"\n── [{i}/{len(tarefas)}] {t.get('clienteCodigo')} - {t.get('clienteNome')} ──")
        try:
            r = processar_tarefa_fechamento(t, jwt_gestta)
        except RuntimeError as e:
            if "SESSAO_EXPIRADA" in str(e) and relogin_gestta():
                jwt_gestta = _gestta_jwt()
                r = processar_tarefa_fechamento(t, jwt_gestta)
            else:
                r = {"status": "erro", "motivo": str(e)[:400], "tarefa_id": t.get("taskId")}
        if r.get("aviso"):
            log(f"    ⚠️ AVISO: {r.get('status')} — {r.get('motivo')}")
        else:
            log(f"    → {r.get('status')} {r.get('motivo') or ''}"
                + (f" D=C={r.get('dc_ok')}" if "dc_ok" in r else ""))
        resultados.append(r)
        if args.pausa and i < len(tarefas):
            time.sleep(args.pausa)

    contagem: dict[str, int] = {}
    for r in resultados:
        st = r.get("status") or "erro"
        contagem[st] = contagem.get(st, 0) + 1

    resumo = {
        "exercicio": EXERCICIO,
        "gerado_em": dt.datetime.now().isoformat(timespec="seconds"),
        "total_tarefas": len(tarefas),
        "contagem": contagem,
        "tarefas": resultados,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    arq = OUT_DIR / f"fechamento-run-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    arq.write_text(json.dumps(resumo, ensure_ascii=False, indent=2), encoding="utf-8")

    log(f"\n=== RESUMO === {json.dumps(contagem, ensure_ascii=False)}")
    log(f"Log: {arq}")
    print(json.dumps({
        "ok": True,
        "exercicio": EXERCICIO,
        "contagem": contagem,
        "total_tarefas": len(tarefas),
        "log": str(arq),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
