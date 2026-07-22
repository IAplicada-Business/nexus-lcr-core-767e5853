// Extração de saldo_inicial/saldo_final (espelha supabase/functions/conciliar/extrair-saldo.ts v46).
// Extratos Santander/IA usam variações como "Saldo anterior (31/01): R$ 0,00",
// "Saldo final (28/02): R$ 25,79", "saldo anterior zero", "saldo final é R$ ..."
// e pares "Saldo em DD/MM: X". OPT-0005: saldo continua sendo AVISO, não trava
// Conciliar/SCI — só alimenta o painel de validação.

export function parseValorBr(raw: string): number | null {
  const s = raw.trim().replace(/[^\d,.\-]/g, "");
  if (!s) return null;
  const normalizado = /\d+\.\d{3}/.test(s) || (s.includes(",") && s.includes("."))
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

const NUM = String.raw`(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d+)?)`;
// Data opcional entre parênteses ou solta: (31/01), 31/01/2026, 31/01
const DATA_OPC = String.raw`(?:\s*\(?\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*\)?)?`;

export function extrairSaldosDeTexto(texto: string): { inicial: number | null; final: number | null } {
  if (!texto) return { inicial: null, final: null };

  let inicial: number | null = null;
  let final: number | null = null;

  // "Saldo inicial|anterior|abertura [(DD/MM)]: R$ X" (também aceita "é R$")
  const reInicial = new RegExp(
    String.raw`saldo\s+(?:inicial|anterior|abertura)${DATA_OPC}\s*(?:[:=\-]\s*|é\s+)?R?\$?\s*${NUM}`,
    "i",
  );
  const mi = texto.match(reInicial);
  if (mi) inicial = parseValorBr(mi[1]);

  // "Saldo final|atual [(DD/MM)]: R$ X" (também aceita "é R$")
  const reFinal = new RegExp(
    String.raw`saldo\s+(?:final|atual)${DATA_OPC}\s*(?:[:=\-]\s*|é\s+)?R?\$?\s*${NUM}`,
    "i",
  );
  const mf = texto.match(reFinal);
  if (mf) final = parseValorBr(mf[1]);

  // "saldo anterior zero" / "saldo inicial zero"
  if (inicial == null && /saldo\s+(?:anterior|inicial|abertura)\s+(?:é\s+)?zero/i.test(texto)) {
    inicial = 0;
  }
  if (final == null && /saldo\s+(?:final|atual)\s+(?:é\s+)?zero/i.test(texto)) {
    final = 0;
  }

  // Pares "Saldo em DD/MM[/YYYY]: X" — mais antiga = inicial, mais recente = final.
  if (inicial == null || final == null) {
    const rePar = new RegExp(
      String.raw`saldo\s+em\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[:=]?\s*R?\$?\s*${NUM}`,
      "gi",
    );
    const pares: { data: number; valor: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = rePar.exec(texto)) !== null) {
      const dia = Number(m[1]);
      const mes = Number(m[2]);
      const anoRaw = m[3] ? Number(m[3]) : 0;
      const ano = anoRaw < 100 ? 2000 + anoRaw : anoRaw;
      const chave = ano * 10000 + mes * 100 + dia;
      const val = parseValorBr(m[4]);
      if (val != null) pares.push({ data: chave, valor: val });
    }
    if (pares.length >= 2) {
      pares.sort((a, b) => a.data - b.data);
      if (inicial == null) inicial = pares[0].valor;
      if (final == null) final = pares[pares.length - 1].valor;
    } else if (pares.length === 1 && inicial == null && final == null) {
      // Um único "Saldo em ..." — assume final (mais comum em extratos).
      final = pares[0].valor;
    }
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
      const n = parseValorBr(v);
      if (n != null) return n;
    }
  }
  return null;
}

/** Busca chaves em qualquer nível (JSON aninhado / stringificado). */
function pickNumeroAninhado(valor: unknown, chaves: string[], profundidade = 0): number | null {
  if (profundidade > 6 || valor == null) return null;
  if (typeof valor === "string") {
    const t = valor.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        return pickNumeroAninhado(JSON.parse(t), chaves, profundidade + 1);
      } catch {
        return null;
      }
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

function coletarTextos(valor: unknown, out: string[], profundidade = 0): void {
  if (profundidade > 6 || valor == null) return;
  if (typeof valor === "string") {
    if (valor.length > 8) out.push(valor);
    const t = valor.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        coletarTextos(JSON.parse(t), out, profundidade + 1);
      } catch {
        /* ignora JSON inválido */
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

const CHAVES_INICIAL = ["saldo_inicial", "saldo_inicio", "saldo_anterior", "saldo_abertura", "opening_balance", "balance_start"];
const CHAVES_FINAL = ["saldo_final", "saldo_atual", "saldo_disponivel", "saldo_encerramento", "closing_balance", "balance_end"];

export function extrairSaldosDocumento(
  dadosExtraidos: unknown,
  classificacaoIa?: unknown,
): { inicial: number | null; final: number | null } {
  let inicial = pickNumeroAninhado(classificacaoIa, CHAVES_INICIAL)
    ?? pickNumeroAninhado(dadosExtraidos, CHAVES_INICIAL);
  let final = pickNumeroAninhado(classificacaoIa, CHAVES_FINAL)
    ?? pickNumeroAninhado(dadosExtraidos, CHAVES_FINAL);

  if (inicial != null && final != null) return { inicial, final };

  const textos: string[] = [];
  coletarTextos(classificacaoIa, textos);
  coletarTextos(dadosExtraidos, textos);
  for (const t of textos) {
    const parsed = extrairSaldosDeTexto(t);
    if (inicial == null && parsed.inicial != null) inicial = parsed.inicial;
    if (final == null && parsed.final != null) final = parsed.final;
    if (inicial != null && final != null) break;
  }
  return { inicial, final };
}
