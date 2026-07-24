import { assertEquals } from "jsr:@std/assert@1";
import { extrairSaldosDeTexto, extrairSaldosDocumento, parseValorBr } from "./extrair-saldo.ts";

Deno.test("parseValorBr — formato BR com milhar e centavos", () => {
  assertEquals(parseValorBr("23.577,98"), 23577.98);
  assertEquals(parseValorBr("0,16"), 0.16);
  assertEquals(parseValorBr("1000.50"), 1000.5);
});

Deno.test("extrairSaldosDeTexto — prosa típica da IA", () => {
  const texto = "Período: 01/01/2026 a 31/01/2026. Saldo inicial: R$ 0,16. Saldo final: R$ 0,47. Total entradas: R$ 23.577,98.";
  const r = extrairSaldosDeTexto(texto);
  assertEquals(r.inicial, 0.16);
  assertEquals(r.final, 0.47);
});

Deno.test("extrairSaldosDeTexto — milhares no saldo", () => {
  const texto = "Saldo inicial: R$ 12.345,67. Saldo final: R$ 10.000,00.";
  const r = extrairSaldosDeTexto(texto);
  assertEquals(r.inicial, 12345.67);
  assertEquals(r.final, 10000);
});

// OPT-0005 — caso REAL do vídeo 2 (V Schick, extrato Santander Fev/2026):
// prosa da IA usa "saldo anterior" (não "inicial") e valor SEM "R$".
Deno.test("extrairSaldosDeTexto — 'saldo anterior zero e saldo final 25,79' (vídeo 2)", () => {
  const texto = "Documento é extrato bancário Santander Empresas completo (fevereiro/2026) com cabeçalho de conta, saldo anterior zero e saldo final 25,79, além de tabela cronológica de movimentações.";
  const r = extrairSaldosDeTexto(texto);
  assertEquals(r.inicial, 0);
  assertEquals(r.final, 25.79);
});

// OPT-0005 — caso REAL do vídeo 1 (extrato Inter Dez/2025, sem movimento):
// forma composta "saldo inicial e final (ambos R$ X)".
Deno.test("extrairSaldosDeTexto — 'saldo inicial e final (ambos R$ 140,30)' (vídeo 1)", () => {
  const texto = "Extrato do Banco Inter referente ao período de 01/12/2025 a 31/12/2025. O documento apresenta saldo inicial e final (ambos R$ 140,30), e o período completo.";
  const r = extrairSaldosDeTexto(texto);
  assertEquals(r.inicial, 140.30);
  assertEquals(r.final, 140.30);
});

// OPT-0005 — caso REAL da Cultive 2026-04: "Saldo inicial R$ X e final R$ Y"
// (valores distintos; "final" sem "saldo" antes — reFinal sozinho não pega).
Deno.test("extrairSaldosDeTexto — 'Saldo inicial R$ X e final R$ Y' (Cultive)", () => {
  const r = extrairSaldosDeTexto("Extrato Banco Inter. Saldo inicial R$ 22.456,28 e final R$ 13.795,25. Diversos PIX.");
  assertEquals(r.inicial, 22456.28);
  assertEquals(r.final, 13795.25);
});

Deno.test("extrairSaldosDeTexto — saldo anterior/final com data entre parênteses", () => {
  const r = extrairSaldosDeTexto("Saldo anterior (31/01): R$ 0,00. Saldo final (28/02): R$ 25,79.");
  assertEquals(r.inicial, 0);
  assertEquals(r.final, 25.79);
});

Deno.test("extrairSaldosDeTexto — pares 'Saldo em DD/MM' (mais antigo=inicial, recente=final)", () => {
  const r = extrairSaldosDeTexto("Saldo em 31/01 = 0. Saldo em 28/02: 2.579,00");
  assertEquals(r.inicial, 0);
  assertEquals(r.final, 2579);
});

Deno.test("extrairSaldosDocumento — chaves estruturadas têm prioridade", () => {
  const r = extrairSaldosDocumento({ saldo_inicial: 10, saldo_final: 20, dados_extraidos: "Saldo inicial: R$ 1,00. Saldo final: R$ 2,00." });
  assertEquals(r.inicial, 10);
  assertEquals(r.final, 20);
});

Deno.test("extrairSaldosDocumento — chaves em JSON serializado (string)", () => {
  const r = extrairSaldosDocumento(JSON.stringify({ saldo_inicial: "1.234,56", saldo_final: 900 }));
  assertEquals(r.inicial, 1234.56);
  assertEquals(r.final, 900);
});

Deno.test("extrairSaldosDocumento — fallback na prosa aninhada (OPT-0005)", () => {
  const r = extrairSaldosDocumento({
    conta: "558716615-0",
    dados_extraidos: "Extrato Nubank. Saldo inicial: R$ 0,16. Saldo final: R$ 0,47. Movimentações: 12 PIX.",
  });
  assertEquals(r.inicial, 0.16);
  assertEquals(r.final, 0.47);
});

Deno.test("extrairSaldosDocumento — lê prosa em classificacao_ia string", () => {
  const r = extrairSaldosDocumento(
    { observacoes: "sem saldo aqui" },
    "Saldo inicial: R$ 100,00. Saldo final: R$ 80,50.",
  );
  assertEquals(r.inicial, 100);
  assertEquals(r.final, 80.5);
});
