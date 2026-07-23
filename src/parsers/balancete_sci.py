"""Parser de balancete SCI exportado em PDF (fechamento anual Gestta)."""
from __future__ import annotations

import re
from pathlib import Path

import pdfplumber

_RE_TOTAL_DEB = re.compile(
    r"Total de d[eé]bitos\s+([\d.,]+)\s+Total de cr[eé]ditos\s+([\d.,]+)",
    re.IGNORECASE,
)
_RE_DIF = re.compile(
    r"Diferen[cç]a entre d[eé]bito e cr[eé]dito\s+([\d.,]+)",
    re.IGNORECASE,
)
_RE_LINHA = re.compile(
    r"^(\d+)\s+(.+?)\s+([\d.,]+[DC]?)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+[DC]?)\s*$"
)


def _parse_br(valor: str) -> tuple[float, str | None]:
    s = (valor or "").strip()
    nature = None
    if s and s[-1] in ("D", "C"):
        nature = s[-1]
        s = s[:-1]
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s or 0), nature
    except ValueError:
        return 0.0, nature


def parsear_balancete_pdf(caminho: str | Path) -> dict:
    """Extrai linhas de conta e totais do RESUMO (validação D=C)."""
    texto = []
    with pdfplumber.open(str(caminho)) as pdf:
        for page in pdf.pages:
            t = page.extract_text() or ""
            if t:
                texto.append(t)
    full = "\n".join(texto)

    debitos_total = creditos_total = None
    m = _RE_TOTAL_DEB.search(full)
    if m:
        debitos_total, _ = _parse_br(m.group(1))
        creditos_total, _ = _parse_br(m.group(2))
    dif = 0.0
    m2 = _RE_DIF.search(full)
    if m2:
        dif, _ = _parse_br(m2.group(1))

    linhas = []
    ordem = 0
    for raw in full.splitlines():
        line = raw.strip()
        if not line or line.startswith("BALANCETE") or line.startswith("EMPRESA:"):
            continue
        if line.startswith("CONTANOME") or line.startswith("RESUMO"):
            continue
        if line.startswith("ATIVO ") or line.startswith("PASSIVO ") or line.startswith("Total "):
            continue
        if line.startswith("DESPESAS") or line.startswith("IMPOSTOS SOBRE") or line.startswith("Preju"):
            continue
        if line.startswith("LCR CONTADORES"):
            continue
        m3 = _RE_LINHA.match(line)
        if not m3:
            continue
        ordem += 1
        sa, _ = _parse_br(m3.group(3))
        deb, _ = _parse_br(m3.group(4))
        cred, _ = _parse_br(m3.group(5))
        sat, _ = _parse_br(m3.group(6))
        linhas.append({
            "ordem": ordem,
            "pdc_codigo": m3.group(1),
            "conta_nome": m3.group(2).strip(),
            "saldo_anterior": sa,
            "debito": deb,
            "credito": cred,
            "saldo_atual": sat,
        })

    dc_ok = None
    if debitos_total is not None and creditos_total is not None:
        dc_ok = abs(debitos_total - creditos_total) < 0.02 and abs(dif) < 0.02

    return {
        "linhas": linhas,
        "debitos_total": debitos_total,
        "creditos_total": creditos_total,
        "dc_ok": dc_ok,
        "divergencias": {
            "diferenca_dc": dif,
            "linhas_parseadas": len(linhas),
        },
    }
