import { describe, expect, it } from "vitest";
import { extrairSaldosDeTexto, extrairSaldosDocumento, parseValorBr } from "../saldo-extracao";

describe("saldo-extracao", () => {
  it("parseValorBr entende formato BR", () => {
    expect(parseValorBr("23.577,98")).toBe(23577.98);
    expect(parseValorBr("0,16")).toBe(0.16);
  });

  it("prosa clássica: Saldo inicial/final", () => {
    const r = extrairSaldosDeTexto(
      "Saldo inicial: R$ 0,16. Saldo final: R$ 0,47. Total entradas: R$ 23.577,98.",
    );
    expect(r.inicial).toBe(0.16);
    expect(r.final).toBe(0.47);
  });

  it("Santander: Saldo anterior/final com data entre parênteses", () => {
    const r = extrairSaldosDeTexto(
      "Saldo anterior (31/01): R$ 0,00. Saldo final (28/02): R$ 25,79.",
    );
    expect(r.inicial).toBe(0);
    expect(r.final).toBe(25.79);
  });

  it("pares Saldo em DD/MM — mais antigo=inicial, mais recente=final", () => {
    const r = extrairSaldosDeTexto("Saldo em 31/01 = 0. Saldo em 28/02: 2.579,00");
    expect(r.inicial).toBe(0);
    expect(r.final).toBe(2579);
  });

  it("'saldo anterior zero' + 'saldo final é R$'", () => {
    const r = extrairSaldosDeTexto("O saldo anterior zero. O saldo final é R$ 22,15.");
    expect(r.inicial).toBe(0);
    expect(r.final).toBe(22.15);
  });

  it("JSON stringificado com chaves saldo_inicial/saldo_final", () => {
    const r = extrairSaldosDocumento(
      JSON.stringify({ saldo_inicial: "1.234,56", saldo_final: 900 }),
    );
    expect(r.inicial).toBe(1234.56);
    expect(r.final).toBe(900);
  });

  it("usa chaves estruturadas quando existem", () => {
    const r = extrairSaldosDocumento({ saldo_inicial: 10, saldo_final: 20 });
    expect(r).toEqual({ inicial: 10, final: 20 });
  });

  it("fallback na prosa aninhada em dados_extraidos", () => {
    const r = extrairSaldosDocumento({
      dados_extraidos: "Extrato. Saldo inicial: R$ 1.234,56. Saldo final: R$ 900,00.",
    });
    expect(r.inicial).toBe(1234.56);
    expect(r.final).toBe(900);
  });
});
