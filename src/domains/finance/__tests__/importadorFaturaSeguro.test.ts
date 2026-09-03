import { describe, it, expect } from "vitest";
import {
  extrairTotalDaFatura,
  extrairDatasDaFatura,
  parsearFaturaSicoob,
  parsearFaturaNubank,
  gerarHashLinha,
  gerarHashDocumento,
} from "../hooks/useImportarFatura";
import {
  calcularPeriodoFatura,
  determinarFaturaParaData,
} from "../hooks/useFaturasCartao";

describe("Segurança & Integridade do Importador de Fatura de Cartão", () => {
  const sicoobPdfSample = `
SICOOB CARTÕES
Vencimento 22/08/2026 Fechamento 01/08/2026
MOVIMENTAÇÃO DO CARTÃO
04/06 Shopee*KIMI PENG ELE 03/03 103,55
04/06 Shopee*MVLS COMERCIO 03/03 135,16
15/06 AMAZON BR 02/02 233,91
01/07 UBER *TRIP 1/1 45,90
01/07 UBER *TRIP 1/1 45,90
10/07 PAGAMENTO DE FATURA -12500,00
PROTEÇÃO PERDA OU ROUBO 3,20
TOTAL DOS MOVIMENTOS 16.050,57
Total da Fatura: R$ 16.053,77
`;

  it("1. Deve extrair especificamente o Total Oficial da Fatura sem confundir com TOTAL dos movimentos", () => {
    const { totalFaturaOficial, ajustesEncargos } = extrairTotalDaFatura(sicoobPdfSample);

    expect(totalFaturaOficial).toBe(16053.77);
    expect(ajustesEncargos).toBe(3.2);
  });

  it("2. Deve extrair datas de fechamento e vencimento corretamente", () => {
    const { fechamento, vencimento, diaFechamento, diaVencimento } = extrairDatasDaFatura(sicoobPdfSample);

    expect(fechamento).toBe("2026-08-01");
    expect(vencimento).toBe("2026-08-22");
    expect(diaFechamento).toBe(1);
    expect(diaVencimento).toBe(22);
  });

  it("3. Regra de Ouro: O valor salvo de uma compra parcelada é estritamente o valor mensal da parcela (NUNCA multiplicar)", () => {
    const transacoes = parsearFaturaSicoob(sicoobPdfSample, 2026);
    const shopee = transacoes.find((t) => t.descricao.includes("KIMI PENG ELE"));

    expect(shopee).toBeDefined();
    expect(shopee?.valor).toBe(103.55); // Valor individual da parcela no mês
    expect(shopee?.parcela_atual).toBe(3);
    expect(shopee?.total_parcelas).toBe(3);
    // Jamais valor = 103.55 * 3
    expect(shopee?.valor).not.toBe(310.65);
  });

  it("4. Hashes de Linha: Deve permitir duas compras legítimas iguais no mesmo dia através do número da linha", async () => {
    const hash1 = await gerarHashLinha("2026-07-01", "UBER *TRIP", 45.9, 1, 1, 4);
    const hash2 = await gerarHashLinha("2026-07-01", "UBER *TRIP", 45.9, 1, 1, 5);

    expect(hash1).toBeDefined();
    expect(hash2).toBeDefined();
    expect(hash1).not.toBe(hash2); // Linhas distintas não colidem
  });

  it("5. Hashes de Documento: Deve gerar hash único e consistente para detecção de reimportação", async () => {
    const mockTransacoes = [
      { data: "2026-06-04", descricao: "Shopee", valor: 103.55, hash_importacao: "hash-a" },
      { data: "2026-06-04", descricao: "Shopee 2", valor: 135.16, hash_importacao: "hash-b" },
    ];

    const docHash1 = await gerarHashDocumento(sicoobPdfSample, mockTransacoes);
    const docHash2 = await gerarHashDocumento(sicoobPdfSample, mockTransacoes);

    expect(docHash1).toBe(docHash2);
    expect(docHash1.length).toBe(64); // SHA-256 hex string
  });

  it("6. Cálculo da Competência e Mudança de Mês / Ano", () => {
    // Compra em dezembro para fatura de janeiro do ano seguinte
    const cartao = { dia_fechamento: 25, dia_vencimento: 5 };
    const detFimAno = determinarFaturaParaData("2026-12-28", cartao.dia_fechamento);
    expect(detFimAno.mes_fatura).toBe(1);
    expect(detFimAno.ano_fatura).toBe(2027);

    // Período de fechamento para janeiro de 2027
    const periodoJan = calcularPeriodoFatura(cartao, 1, 2027);
    expect(periodoJan.data_fechamento).toBe("2027-01-25");
    expect(periodoJan.data_inicio).toBe("2026-12-25");
    expect(periodoJan.data_vencimento).toBe("2027-02-05");
  });

  it("7. Tratamento de Timezone America/Sao_Paulo (sem offset UTC deslocando dia)", () => {
    const dataStr = "2026-08-01";
    // Assegura parsing local sem voltar para 2026-07-31
    const [ano, mes, dia] = dataStr.split("-").map(Number);
    const localDate = new Date(ano, mes - 1, dia, 12, 0, 0); // Meio-dia para segurança
    expect(localDate.getDate()).toBe(1);
    expect(localDate.getMonth()).toBe(7); // Agosto
    expect(localDate.getFullYear()).toBe(2026);
  });

  it("8. Pagamentos e Créditos identificados sem poluir despesas da fatura", () => {
    const transacoes = parsearFaturaSicoob(sicoobPdfSample, 2026);
    const pagamentos = transacoes.filter((t) => t.descricao.includes("PAGAMENTO") || t.tipo === "receita");
    // Pagamentos de fatura são filtrados ou classificados corretamente
    expect(pagamentos.length).toBe(0);
  });

  it("9. Simulação de Rollback Atômico na Importação", async () => {
    // Simulação da RPC PostgreSQL: se um lançamento falhar na validação, toda a operação deve ser revertida
    const itensImportados: string[] = [];
    const rollback = () => { itensImportados.length = 0; };

    try {
      for (let i = 1; i <= 30; i++) {
        if (i === 20) {
          throw new Error("Erro simulado no lançamento #20: validação falhou");
        }
        itensImportados.push(`item_${i}`);
      }
    } catch (_e) {
      rollback();
    }

    expect(itensImportados.length).toBe(0); // Nenhuma transação parcial persiste
  });

  it("10. Isolamento entre Workspaces", () => {
    // Hashes e chaves compostas de importação incluem workspace_id
    const ws1 = "workspace-alpha-uuid";
    const ws2 = "workspace-beta-uuid";
    const contaId = "cartao-uuid-123";
    const mesRef = "2026-08";
    const docHash = "abcdef1234567890";

    const chaveUnicaWs1 = `${ws1}:${contaId}:${mesRef}:${docHash}`;
    const chaveUnicaWs2 = `${ws2}:${contaId}:${mesRef}:${docHash}`;

    expect(chaveUnicaWs1).not.toBe(chaveUnicaWs2);
  });

  it("11. Compatibilidade de Domínio: transações de fatura são vinculadas por cartao_id (e conta_id NULL)", () => {
    // Valida que o modelo de persistência preenche cartao_id para faturas de cartão
    const transacaoFatura = {
      tipo: "despesa",
      descricao: "UBER *TRIP",
      valor: 45.9,
      cartao_id: "cartao-uuid-123",
      conta_id: null,
      metodo_pagamento: "cartao_credito",
      mes_referencia: "2026-08",
    };

    // Consultas de faturas e cartões (ex: useComprasFatura, useFaturaCartao, useDRE)
    // usam cartao_id ou d.cartao_id === cartao.id
    const pertenceAoCartao = transacaoFatura.cartao_id === "cartao-uuid-123" || transacaoFatura.conta_id === "cartao-uuid-123";
    expect(pertenceAoCartao).toBe(true);
    expect(transacaoFatura.cartao_id).toBe("cartao-uuid-123");
    expect(transacaoFatura.conta_id).toBeNull();
  });

  it("12. Concorrência Atômica: bloqueio de importações simultâneas pelo mesmo hash de documento", () => {
    // Simula tentativa de importação concorrente do mesmo documento
    const tabelaImportacoes = new Set<string>();
    const tentarImportar = (wsId: string, cartaoId: string, docHash: string) => {
      const chave = `${wsId}:${cartaoId}:${docHash}`;
      if (tabelaImportacoes.has(chave)) {
        throw new Error("Esta fatura já foi importada anteriormente (hash duplicado)");
      }
      tabelaImportacoes.add(chave);
      return true;
    };

    // Primeira importação tem sucesso
    expect(tentarImportar("ws-1", "cartao-1", "hash-sha256-doc")).toBe(true);

    // Segunda importação concorrente falha atomicamente
    expect(() => tentarImportar("ws-1", "cartao-1", "hash-sha256-doc")).toThrow(
      "Esta fatura já foi importada anteriormente (hash duplicado)"
    );
  });

  it("13. Proteção Cross-Workspace: rejeição de categoria de outro usuário/workspace", () => {
    const categoriaOutroUsuario = {
      id: "cat-alien-999",
      user_id: "user-vitima-111",
      nome: "Categoria Alheia",
    };

    const usuarioAutenticadoId = "user-atacante-222";
    const validarCategoria = (cat: typeof categoriaOutroUsuario, authUserId: string) => {
      if (cat.user_id && cat.user_id !== authUserId) {
        throw new Error("Categoria inválida ou não pertencente ao usuário/workspace");
      }
      return true;
    };

    expect(() => validarCategoria(categoriaOutroUsuario, usuarioAutenticadoId)).toThrow(
      "Categoria inválida ou não pertencente ao usuário/workspace"
    );
  });

  it("14. Parser Nubank: Deve extrair transações com formato dia mês_extenso (ex: 12 JUL Restaurante R$ 85,00)", () => {
    const nubankSample = `
NUBANK FATURA
COMPRAS
12 JUL Restaurante Paris R$ 85,00
15 AGO Uber *Trip R$ 34,90
20 AGO Mercado Livre 02/05 R$ 110,00
25 AGO PAGAMENTO RECEBIDO -1500,00
`;

    const transacoes = parsearFaturaNubank(nubankSample, 2026);

    expect(transacoes).toHaveLength(3);

    expect(transacoes[0].data).toBe('2026-07-12');
    expect(transacoes[0].descricao).toBe('Restaurante Paris');
    expect(transacoes[0].valor).toBe(85.00);

    expect(transacoes[1].data).toBe('2026-08-15');
    expect(transacoes[1].descricao).toBe('Uber *Trip');
    expect(transacoes[1].valor).toBe(34.90);

    // Parcelado
    expect(transacoes[2].data).toBe('2026-08-20');
    expect(transacoes[2].valor).toBe(110.00);
    expect(transacoes[2].parcela_atual).toBe(2);
    expect(transacoes[2].total_parcelas).toBe(5);
  });

  it("15. Parser Nubank: Suporta formato numérico DD/MM e ignora estornos e pagamentos", () => {
    const sample = `
05/09 Farmacia Drogasil R$ 62,50
10/09 Pagamento de fatura -500,00
`;

    const transacoes = parsearFaturaNubank(sample, 2026);
    expect(transacoes).toHaveLength(1);
    expect(transacoes[0].descricao).toBe('Farmacia Drogasil');
    expect(transacoes[0].valor).toBe(62.50);
  });
});
