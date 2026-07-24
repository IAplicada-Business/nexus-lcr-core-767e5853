// Extração de saldo_inicial/saldo_final (espelha supabase/functions/conciliar/extrair-saldo.ts).
// A IA frequentemente grava o saldo só na prosa — sem fallback de regex a UI
// mostra "não identificado" mesmo com o valor no extrato (OPT-0005).

const RE_VALOR_NUM = String.raw`(?:R\$\s*)?([\d.]+(?:,\d{2})?|\d+(?:[.,]\d+)?)`;
const RE_DATA = String.raw`\d{1,2}/\d{1,2}(?:/\d{2,4})?`;

export function parseValorBr(raw: string): number | null {
  const s = raw.trim().replace(/[^\d,.\-]/g, "");
  if (!s) return null;
  const normalizado = /\d+\.\d{3}/.test(s) || (s.includes(",") && s.includes("."))
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function parseValorOuZero(raw: string): number | null {
  if (/^\s*zero\s*$/i.test(raw)) return 0;
  return parseValorBr(raw);
}

function chaveDataBr(data: string): number {
  const m = data.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return 0;
  let ano = m[3] ? Number(m[3]) : 0;
  if (ano > 0 && ano < 100) ano += 2000;
  return ano * 10000 + Number(m[2]) * 100 + Number(m[1]);
}

export function extrairSaldosDeTexto(texto: string): { inicial: number | null; final: number | null } {
  if (!texto) return { inicial: null, final: null };
  const reInicial = new RegExp(
    String.raw`saldo\s+(?:inicial|anterior|abertura|do\s+dia\s+anterior)(?:\s*\([^)]*\))?\s*(?:[:\-=]|é|=)?\s*(?:de\s+)?(?:${RE_VALOR_NUM}|zero)\b`,
    "i",
  );
  const reFinal = new RegExp(
    String.raw`saldo\s+(?:final|atual|fechamento|dispon[ií]vel|em\s+conta)(?:\s*\([^)]*\))?\s*(?:[:\-=]|é|=)?\s*(?:de\s+)?(?:${RE_VALOR_NUM}|zero)\b`,
    "i",
  );
  const mi = texto.match(reInicial);
  const mf = texto.match(reFinal);
  let inicial: number | null = null;
  let final: number | null = null;
  if (mi) {
    inicial = mi[1] != null ? parseValorBr(mi[1]) : null;
    if (inicial == null && /\bzero\b/i.test(mi[0])) inicial = 0;
  }
  if (mf) {
    final = mf[1] != null ? parseValorBr(mf[1]) : null;
    if (final == null && /\bzero\b/i.test(mf[0])) final = 0;
  }
  // Forma composta "saldo(s) inicial e final ... (ambos) R$ X": um único valor
  // descreve os dois lados (extrato sem movimento).
  if (inicial == null || final == null) {
    const reAmbos = new RegExp(
      String.raw`saldos?\s+inicial\s+e\s+final[^\d]*?(?:${RE_VALOR_NUM}|zero)\b`,
      "i",
    );
    const ma = texto.match(reAmbos);
    if (ma) {
      let v: number | null = ma[1] != null ? parseValorBr(ma[1]) : null;
      if (v == null && /\bzero\b/i.test(ma[0])) v = 0;
      if (v != null) {
        if (inicial == null) inicial = v;
        if (final == null) final = v;
      }
    }
  }
  if (inicial != null && final != null) return { inicial, final };
  const reDated = new RegExp(
    String.raw`saldo\s+(?:em\s+)?(${RE_DATA})(?:\s*\([^)]*\))?\s*[:\-=]?\s*${RE_VALOR_NUM}`,
    "gi",
  );
  const dated: { chave: number; valor: number }[] = [];
  for (const m of texto.matchAll(reDated)) {
    const valor = parseValorBr(m[2]);
    if (valor == null) continue;
    dated.push({ chave: chaveDataBr(m[1]), valor });
  }
  if (dated.length >= 1) {
    dated.sort((a, b) => a.chave - b.chave || 0);
    if (inicial == null) inicial = dated[0].valor;
    if (final == null) final = dated[dated.length - 1].valor;
  }
  return { inicial, final };
}

function pickNumero(obj: Record<string, unknown> | null | undefined, chaves: string[]): number | null {
  if (!obj || typeof obj !== "object") return null;
  for (const k of chaves) {
    const v = obj[k];
    if (v == null || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseValorOuZero(v);
      if (n != null) return n;
    }
  }
  return null;
}

function coletarTextos(valor: unknown, out: string[], profundidade = 0): void {
  if (profundidade > 6 || valor == null) return;
  if (typeof valor === "string") {
    if (valor.length > 8) {
      out.push(valor);
      const trimmed = valor.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try { coletarTextos(JSON.parse(trimmed), out, profundidade + 1); } catch { /* ignore */ }
      }
    }
    return;
  }
  if (typeof valor !== "object") return;
  if (Array.isArray(valor)) {
    for (const item of valor) coletarTextos(item, out, profundidade + 1);
    return;
  }
  for (const v of Object.values(valor as Record<string, unknown>)) {
    coletarTextos(v, out, profundidade + 1);
  }
}

function pickNumeroAninhado(valor: unknown, chaves: string[], profundidade = 0): number | null {
  if (profundidade > 6 || valor == null) return null;
  if (typeof valor === "string") {
    const trimmed = valor.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try { return pickNumeroAninhado(JSON.parse(trimmed), chaves, profundidade + 1); } catch { return null; }
    }
    return null;
  }
  if (typeof valor !== "object") return null;
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const n = pickNumeroAninhado(item, chaves, profundidade + 1);
      if (n != null) return n;
    }
    return null;
  }
  const obj = valor as Record<string, unknown>;
  const direto = pickNumero(obj, chaves);
  if (direto != null) return direto;
  for (const v of Object.values(obj)) {
    const n = pickNumeroAninhado(v, chaves, profundidade + 1);
    if (n != null) return n;
  }
  return null;
}

const CHAVES_INICIAL = ["saldo_inicial", "saldo_inicio", "saldo_anterior", "opening_balance", "balance_start"];
const CHAVES_FINAL = ["saldo_final", "saldo_atual", "saldo_disponivel", "closing_balance", "balance_end"];

export function extrairSaldosDocumento(
  dadosExtraidos: unknown,
  classificacaoIa?: unknown,
): { inicial: number | null; final: number | null } {
  let inicial = pickNumeroAninhado(dadosExtraidos, CHAVES_INICIAL)
    ?? pickNumeroAninhado(classificacaoIa, CHAVES_INICIAL);
  let final = pickNumeroAninhado(dadosExtraidos, CHAVES_FINAL)
    ?? pickNumeroAninhado(classificacaoIa, CHAVES_FINAL);
  if (inicial != null && final != null) return { inicial, final };
  const textos: string[] = [];
  coletarTextos(dadosExtraidos, textos);
  coletarTextos(classificacaoIa, textos);
  for (const t of textos) {
    const parsed = extrairSaldosDeTexto(t);
    if (inicial == null && parsed.inicial != null) inicial = parsed.inicial;
    if (final == null && parsed.final != null) final = parsed.final;
    if (inicial != null && final != null) break;
  }
  return { inicial, final };
}
