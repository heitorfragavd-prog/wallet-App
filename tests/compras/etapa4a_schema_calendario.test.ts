import { describe, it, expect } from "vitest";

/**
 * Testes Unitários e de Governança da Etapa 4A:
 * Arquitetura e Calendário Operacional de Compras Automáticas (Rodo Point)
 */

interface CalendarioFornecedor {
  fornecedor_nome: string;
  categoria: string;
  dia_semana: number; // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
  periodicidade: "semanal" | "quinzenal";
  quinzena_data_base?: string;
  formato_lista: "padrao" | "salgados_soma" | "bebidas_sem_ref" | "ceasa_categorias";
}

/**
 * Função utilitária idêntica à função PL/pgSQL public.is_quinzena_compras_ativa
 */
function isQuinzenaComprasAtiva(dataBase: string, dataAtual: string): boolean {
  const dtBase = new Date(dataBase);
  const dtAtual = new Date(dataAtual);
  const diffDays = Math.floor((dtAtual.getTime() - dtBase.getTime()) / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  return diffWeeks % 2 === 0;
}

const CALENDARIO_RODO_POINT: CalendarioFornecedor[] = [
  // Segunda (1)
  { fornecedor_nome: "Ceasa", categoria: "Hortifruti", dia_semana: 1, periodicidade: "semanal", formato_lista: "ceasa_categorias" },
  // Terça (2)
  { fornecedor_nome: "Salgados", categoria: "Alimentos", dia_semana: 2, periodicidade: "semanal", formato_lista: "salgados_soma" },
  { fornecedor_nome: "Coca-Cola (Extra)", categoria: "Bebidas", dia_semana: 2, periodicidade: "semanal", formato_lista: "bebidas_sem_ref" },
  // Quarta (3)
  { fornecedor_nome: "Sellpack", categoria: "Embalagens e Descartáveis", dia_semana: 3, periodicidade: "semanal", formato_lista: "padrao" },
  { fornecedor_nome: "Café 3 Corações", categoria: "Cafeteria", dia_semana: 3, periodicidade: "semanal", formato_lista: "padrao" },
  { fornecedor_nome: "Cigarros", categoria: "Tabacaria", dia_semana: 3, periodicidade: "semanal", formato_lista: "padrao" },
  { fornecedor_nome: "Ceasa", categoria: "Hortifruti", dia_semana: 3, periodicidade: "semanal", formato_lista: "ceasa_categorias" },
  // Quinta (4)
  { fornecedor_nome: "Coca-Cola", categoria: "Bebidas", dia_semana: 4, periodicidade: "semanal", formato_lista: "bebidas_sem_ref" },
  { fornecedor_nome: "Ambev", categoria: "Bebidas", dia_semana: 4, periodicidade: "semanal", formato_lista: "bebidas_sem_ref" },
  { fornecedor_nome: "Pão de Queijo", categoria: "Alimentos", dia_semana: 4, periodicidade: "semanal", formato_lista: "padrao" },
  // Sexta (5)
  { fornecedor_nome: "Elma Chips", categoria: "Snacks", dia_semana: 5, periodicidade: "quinzenal", quinzena_data_base: "2026-11-13", formato_lista: "padrao" },
];

function obterFornecedoresDoDia(dataISO: string): CalendarioFornecedor[] {
  const d = new Date(dataISO);
  const diaSemana = d.getDay(); // 0 a 6
  return CALENDARIO_RODO_POINT.filter((f) => {
    if (f.dia_semana !== diaSemana) return false;
    if (f.periodicidade === "quinzenal" && f.quinzena_data_base) {
      return isQuinzenaComprasAtiva(f.quinzena_data_base, dataISO);
    }
    return true;
  });
}

describe("Etapa 4A: Calendário Operacional e Arquitetura de Compras da Rodo Point", () => {
  it("1. Deve retornar Salgados e Coca-Cola Extra às terças-feiras", () => {
    // 2026-11-17 é Terça-feira (dia 2)
    const forn = obterFornecedoresDoDia("2026-11-17T09:00:00Z");
    const nomes = forn.map((f) => f.fornecedor_nome);
    expect(nomes).toContain("Salgados");
    expect(nomes).toContain("Coca-Cola (Extra)");
    expect(nomes.length).toBe(2);

    const salgados = forn.find((f) => f.fornecedor_nome === "Salgados");
    expect(salgados?.formato_lista).toBe("salgados_soma");
  });

  it("2. Deve retornar Sellpack, Café 3 Corações, Cigarros e Ceasa às quartas-feiras", () => {
    // 2026-11-18 é Quarta-feira (dia 3)
    const forn = obterFornecedoresDoDia("2026-11-18T09:00:00Z");
    const nomes = forn.map((f) => f.fornecedor_nome);
    expect(nomes).toEqual(["Sellpack", "Café 3 Corações", "Cigarros", "Ceasa"]);
  });

  it("3. Deve retornar Coca-Cola, Ambev e Pão de Queijo às quintas-feiras com formato bebidas_sem_ref", () => {
    // 2026-11-19 é Quinta-feira (dia 4)
    const forn = obterFornecedoresDoDia("2026-11-19T09:00:00Z");
    const nomes = forn.map((f) => f.fornecedor_nome);
    expect(nomes).toEqual(["Coca-Cola", "Ambev", "Pão de Queijo"]);

    const coca = forn.find((f) => f.fornecedor_nome === "Coca-Cola");
    expect(coca?.formato_lista).toBe("bebidas_sem_ref");
  });

  it("4. Elma Chips deve alternar quinzenalmente a partir da data-base 13/11/2026", () => {
    // 13/11/2026 (Sexta) -> Ativa (semana 0)
    expect(isQuinzenaComprasAtiva("2026-11-13", "2026-11-13")).toBe(true);
    let forn = obterFornecedoresDoDia("2026-11-13T09:00:00Z");
    expect(forn.map((f) => f.fornecedor_nome)).toContain("Elma Chips");

    // 20/11/2026 (Sexta seguinte) -> Inativa (semana 1)
    expect(isQuinzenaComprasAtiva("2026-11-13", "2026-11-20")).toBe(false);
    forn = obterFornecedoresDoDia("2026-11-20T09:00:00Z");
    expect(forn.map((f) => f.fornecedor_nome)).not.toContain("Elma Chips");

    // 27/11/2026 (Sexta da próxima quinzena) -> Ativa novamente (semana 2)
    expect(isQuinzenaComprasAtiva("2026-11-13", "2026-11-27")).toBe(true);
    forn = obterFornecedoresDoDia("2026-11-27T09:00:00Z");
    expect(forn.map((f) => f.fornecedor_nome)).toContain("Elma Chips");
  });

  it("5. Deve retornar Ceasa às segundas-feiras com formato ceasa_categorias", () => {
    // 2026-11-16 é Segunda-feira (dia 1)
    const forn = obterFornecedoresDoDia("2026-11-16T09:00:00Z");
    const nomes = forn.map((f) => f.fornecedor_nome);
    expect(nomes).toEqual(["Ceasa"]);
    expect(forn[0].formato_lista).toBe("ceasa_categorias");
  });

  it("6. Sábados e Domingos não devem ter fornecedores programados", () => {
    // 2026-11-14 é Sábado (dia 6)
    expect(obterFornecedoresDoDia("2026-11-14T09:00:00Z")).toEqual([]);
    // 2026-11-15 é Domingo (dia 0)
    expect(obterFornecedoresDoDia("2026-11-15T09:00:00Z")).toEqual([]);
  });
});
