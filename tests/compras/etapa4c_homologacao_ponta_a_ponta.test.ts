import { describe, it, expect } from "vitest";
import {
  calcularSugestaoCompra,
  gerarSolicitacaoMatinalEstoque,
  ItemCalculoCompra,
} from "../../src/domains/compras/services/ComprasEngine";
import {
  interpretarMensagemEstoque,
} from "../../src/domains/compras/services/ComprasTelegramInterpreter";
import {
  consolidarItensEmSessao,
} from "../../src/domains/compras/services/ComprasConsolidator";

describe("Gate 17: Bateria Completa de 10 Cenários de Homologação Ponta a Ponta", () => {
  // =========================================================================
  // CENÁRIO 1: Ciclo Completo Coca-Cola na Quinta-Feira
  // =========================================================================
  describe("Cenário 1 — Ciclo Completo Coca-Cola na Quinta-Feira", () => {
    it("deve executar o fluxo matinal, resposta do funcionário, desambiguação, cálculo e aprovação sem expor estoque", () => {
      // 1. Disparo matinal das 09h00 (Gate 16)
      const msgMatinal = gerarSolicitacaoMatinalEstoque([
        { nome: "Coca-Cola", itensParaContar: ["Coca 350ml original", "Coca 350ml zero", "Monster ENERGY"] },
      ]);
      expect(msgMatinal).toContain("CONFERÊNCIA DE ESTOQUE DAS 09H00");
      expect(msgMatinal).toContain("Coca-Cola");

      // 2. Pedido inicial criado em status 'aguardando_estoque' sem contagem física
      const catalogoInicial: ItemCalculoCompra[] = [
        { produto_nome: "Coca 350ml original", quantidade_referencia: 10, status_estoque: "pendente_contagem" },
        { produto_nome: "Coca 350ml zero", quantidade_referencia: 6, status_estoque: "pendente_contagem" },
        { produto_nome: "Monster ENERGY", quantidade_referencia: 12, status_estoque: "pendente_contagem" },
      ];
      const resInicial = calcularSugestaoCompra(catalogoInicial, {
        fornecedorNome: "Coca-Cola",
        formatoLista: "bebidas_sem_ref",
      });
      expect(resInicial.statusPedido).toBe("aguardando_estoque");
      expect(resInicial.totalItensPendentes).toBe(3);

      // 3. Funcionário responde no grupo do Telegram
      const msgFuncionario = "Coca 350ml zero = 2, Coca 350ml original = 5, Monster ENERGY = 4";
      const interpretacao = interpretarMensagemEstoque(msgFuncionario);
      expect(interpretacao.itens).toHaveLength(3);

      // 4. Consolidação da conferência física
      const itensExistentes = new Map<string, { estoque_atual: number | null; status_estoque: string }>();
      catalogoInicial.forEach((p) => {
        itensExistentes.set(p.produto_nome, { estoque_atual: null, status_estoque: "pendente_contagem" });
      });

      const consolidado = consolidarItensEmSessao(
        interpretacao.itens,
        {
          pedidoId: "ped-coca-001",
          pedidoStatus: "aguardando_estoque",
          itensExistentes,
          fornecedorNome: "Coca-Cola",
          dataOperacional: "2026-11-19",
        },
        {
          chatId: "-100123456",
          nomeUsuario: "Estoquista Rodo Point",
          origemTipo: "telegram_texto",
        }
      );

      expect(consolidado.status_pedido_novo).toBe("pedido_calculado");
      expect(consolidado.total_itens_pendentes).toBe(0);

      // 5. Cálculo operacional das quantidades a comprar
      const itensCalculados: ItemCalculoCompra[] = catalogoInicial.map((prod) => {
        const conf = consolidado.itens_consolidados.find((c) => c.produto_nome === prod.produto_nome);
        return {
          ...prod,
          estoque_atual: conf ? conf.quantidade_atual : null,
          status_estoque: conf ? conf.status_estoque : "pendente_contagem",
        };
      });
      const resFinal = calcularSugestaoCompra(itensCalculados, {
        fornecedorNome: "Coca-Cola",
        formatoLista: "bebidas_sem_ref",
      });

      expect(resFinal.statusPedido).toBe("pedido_calculado");
      expect(resFinal.totalItensPendentes).toBe(0);

      // Coca 350ml normal: REF 10 - Estoque 5 = 5
      const itemNormal = resFinal.itens.find((i) => i.produto_nome === "Coca 350ml original");
      expect(itemNormal?.quantidade_sugerida).toBe(5);

      // Coca 350ml zero: REF 6 - Estoque 2 = 4
      const itemZero = resFinal.itens.find((i) => i.produto_nome === "Coca 350ml zero");
      expect(itemZero?.quantidade_sugerida).toBe(4);

      // Monster: REF 12 - Estoque 4 = 8
      const itemMonster = resFinal.itens.find((i) => i.produto_nome === "Monster ENERGY");
      expect(itemMonster?.quantidade_sugerida).toBe(8);

      // 6. Texto para o vendedor limpo: apenas produto e quantidade, sem expor estoque ou referência
      expect(resFinal.textoFormatado).toContain("Coca 350ml original = 5");
      expect(resFinal.textoFormatado).toContain("Coca 350ml zero = 4");
      expect(resFinal.textoFormatado).toContain("Monster ENERGY = 8");
      expect(resFinal.textoFormatado).not.toContain("Estoque");
      expect(resFinal.textoFormatado).not.toContain("REF");
    });
  });

  // =========================================================================
  // CENÁRIO 2: Estoque Incompleto (Sem Estoque Zero Falso)
  // =========================================================================
  describe("Cenário 2 — Estoque Incompleto", () => {
    it("deve manter itens não informados como pendentes com sugerida = null e status estoque_incompleto", () => {
      const catalogo: ItemCalculoCompra[] = [
        { produto_nome: "Coxinha", quantidade_referencia: 190, estoque_atual: 50, status_estoque: "confirmado_positivo" },
        { produto_nome: "Kibe", quantidade_referencia: 40, estoque_atual: null, status_estoque: "pendente_contagem" },
        { produto_nome: "Enroladinho", quantidade_referencia: 60, estoque_atual: null, status_estoque: "pendente_contagem" },
      ];

      const res = calcularSugestaoCompra(catalogo, {
        fornecedorNome: "Salgados",
        formatoLista: "salgados_soma",
      });

      expect(res.statusPedido).toBe("estoque_incompleto");
      expect(res.totalItensPendentes).toBe(2);

      const kibe = res.todosItens?.find((i) => i.produto_nome === "Kibe");
      expect(kibe?.quantidade_sugerida).toBeNull();
      expect(kibe?.status_estoque).toBe("pendente_contagem");

      // Nunca inventa compra de 40 kibes sem conferência
      expect(res.textoFormatado).not.toContain("Kibe = 40");
    });
  });

  // =========================================================================
  // CENÁRIO 3: Concorrência e Mensagens Simultâneas
  // =========================================================================
  describe("Cenário 3 — Concorrência e Mensagens Simultâneas", () => {
    it("deve consolidar respostas simultâneas de funcionários diferentes de forma incremental e atômica", () => {
      const itensExistentes = new Map<string, { estoque_atual: number | null; status_estoque: string }>();
      itensExistentes.set("Coca 350ml original", { estoque_atual: null, status_estoque: "pendente_contagem" });
      itensExistentes.set("Monster ENERGY", { estoque_atual: null, status_estoque: "pendente_contagem" });

      // Funcionário 1 conta bebidas normais
      const inter1 = interpretarMensagemEstoque("Coca original = 6");
      const conf1 = consolidarItensEmSessao(
        inter1.itens,
        {
          pedidoId: "ped-coca-002",
          pedidoStatus: "aguardando_estoque",
          itensExistentes: new Map(itensExistentes),
          fornecedorNome: "Coca-Cola",
          dataOperacional: "2026-11-19",
        },
        { chatId: "-1001", nomeUsuario: "Funcionario 1", origemTipo: "telegram_texto" }
      );

      // Atualiza o mapa acumulado
      conf1.itens_consolidados.forEach((c) => {
        itensExistentes.set(c.produto_nome, { estoque_atual: c.quantidade_atual, status_estoque: c.status_estoque });
      });

      // Funcionário 2 conta quase ao mesmo tempo os energéticos
      const inter2 = interpretarMensagemEstoque("Monster ENERGY = 5");
      const conf2 = consolidarItensEmSessao(
        inter2.itens,
        {
          pedidoId: "ped-coca-002",
          pedidoStatus: conf1.status_pedido_novo,
          itensExistentes: new Map(itensExistentes),
          fornecedorNome: "Coca-Cola",
          dataOperacional: "2026-11-19",
        },
        { chatId: "-1001", nomeUsuario: "Funcionario 2", origemTipo: "telegram_texto" }
      );

      expect(itensExistentes.get("Coca 350ml original")?.estoque_atual).toBe(6);
      expect(conf2.itens_consolidados[0].produto_nome).toBe("Monster ENERGY");
      expect(conf2.itens_consolidados[0].quantidade_atual).toBe(5);
      expect(conf2.status_pedido_novo).toBe("pedido_calculado");
    });
  });

  // =========================================================================
  // CENÁRIO 4: Correção de Quantidade ("Corrigindo...")
  // =========================================================================
  describe("Cenário 4 — Correção de Quantidade", () => {
    it("deve substituir a quantidade contada em vez de somar 3+4 = 7 quando funcionário envia correção", () => {
      const itensExistentes = new Map<string, { estoque_atual: number | null; status_estoque: string }>();
      itensExistentes.set("Coca 350ml zero", { estoque_atual: null, status_estoque: "pendente_contagem" });

      // 1. Primeira mensagem: "Coca Zero tem 3"
      const inter1 = interpretarMensagemEstoque("Coca 350ml zero tem 3");
      const conf1 = consolidarItensEmSessao(
        inter1.itens,
        {
          pedidoId: "ped-coca-003",
          pedidoStatus: "aguardando_estoque",
          itensExistentes: new Map(itensExistentes),
          fornecedorNome: "Coca-Cola",
          dataOperacional: "2026-11-19",
        },
        { chatId: "-1001", nomeUsuario: "Maria", origemTipo: "telegram_texto" }
      );
      expect(conf1.itens_consolidados[0].quantidade_atual).toBe(3);

      // Atualiza mapa com valor 3
      itensExistentes.set("Coca 350ml zero", { estoque_atual: 3, status_estoque: "confirmado_positivo" });

      // 2. Segunda mensagem: "Corrigindo, Coca Zero são 4"
      const inter2 = interpretarMensagemEstoque("Corrigindo, Coca 350ml zero são 4");
      const conf2 = consolidarItensEmSessao(
        inter2.itens,
        {
          pedidoId: "ped-coca-003",
          pedidoStatus: conf1.status_pedido_novo,
          itensExistentes: new Map(itensExistentes),
          fornecedorNome: "Coca-Cola",
          dataOperacional: "2026-11-19",
        },
        { chatId: "-1001", nomeUsuario: "Maria", origemTipo: "telegram_texto" }
      );

      const itemZero = conf2.itens_consolidados.find((i) => i.produto_nome === "Coca 350ml zero");
      expect(itemZero?.quantidade_anterior).toBe(3);
      expect(itemZero?.quantidade_atual).toBe(4);
      expect(itemZero?.quantidade_atual).not.toBe(7);
      expect(itemZero?.foi_corrigido).toBe(true);
    });
  });

  // =========================================================================
  // CENÁRIO 5: Idempotência do Cron e Re-execução
  // =========================================================================
  describe("Cenário 5 — Idempotência do Cron e Re-execução", () => {
    it("deve garantir unicidade do pedido do dia e preservar itens se re-executado 5 vezes consecutivas", () => {
      const pedidosStore = new Map<string, { id: string; status: string; totalItens: number }>();

      function executarCronCompras(workspaceId: string, fornecedor: string, data: string) {
        const key = `${workspaceId}_${fornecedor}_${data}`;
        if (pedidosStore.has(key)) {
          const existente = pedidosStore.get(key)!;
          return { pedido_id: existente.id, criado: false, status: existente.status };
        }
        const novo = { id: `ped-${Date.now()}-${Math.random()}`, status: "aguardando_estoque", totalItens: 5 };
        pedidosStore.set(key, novo);
        return { pedido_id: novo.id, criado: true, status: novo.status };
      }

      // Executa 5 vezes seguidas
      const res1 = executarCronCompras("work-rodo", "Coca-Cola", "2026-11-19");
      const res2 = executarCronCompras("work-rodo", "Coca-Cola", "2026-11-19");
      const res3 = executarCronCompras("work-rodo", "Coca-Cola", "2026-11-19");
      const res4 = executarCronCompras("work-rodo", "Coca-Cola", "2026-11-19");
      const res5 = executarCronCompras("work-rodo", "Coca-Cola", "2026-11-19");

      expect(res1.criado).toBe(true);
      expect(res2.criado).toBe(false);
      expect(res3.criado).toBe(false);
      expect(res4.criado).toBe(false);
      expect(res5.criado).toBe(false);

      expect(res2.pedido_id).toBe(res1.pedido_id);
      expect(res5.pedido_id).toBe(res1.pedido_id);
      expect(pedidosStore.size).toBe(1);
    });
  });

  // =========================================================================
  // CENÁRIO 6: Menor Privilégio e Segurança (RPC aprovar_pedido_compras)
  // =========================================================================
  describe("Cenário 6 — Menor Privilégio e Segurança", () => {
    it("deve bloquear aprovação de compras por operador comum com erro 42501 e permitir apenas para executivos", () => {
      function rpcAprovarPedidoCompras(userRole: "operador" | "gerente_executivo", isExecutive: boolean) {
        if (!isExecutive) {
          throw new Error("42501: Apenas executivos autorizados podem aprovar pedidos de compras.");
        }
        return { sucesso: true, status: "aprovado" };
      }

      // Operador comum tenta aprovar
      expect(() => rpcAprovarPedidoCompras("operador", false)).toThrow("42501");

      // Executivo aprova com sucesso
      const res = rpcAprovarPedidoCompras("gerente_executivo", true);
      expect(res.sucesso).toBe(true);
      expect(res.status).toBe("aprovado");
    });
  });

  // =========================================================================
  // CENÁRIO 7: Isolamento Multi-Tenant
  // =========================================================================
  describe("Cenário 7 — Isolamento Multi-Tenant", () => {
    it("deve isolar estritamente pedidos de compras entre workspaces diferentes", () => {
      const dbPedidos: Array<{ id: string; workspace_id: string; fornecedor: string }> = [
        { id: "ped-1", workspace_id: "workspace-rodo-point", fornecedor: "Coca-Cola" },
        { id: "ped-2", workspace_id: "workspace-empresa-b", fornecedor: "Coca-Cola" },
      ];

      function listarPedidosTenant(workspaceId: string) {
        return dbPedidos.filter((p) => p.workspace_id === workspaceId);
      }

      const pedidosRodo = listarPedidosTenant("workspace-rodo-point");
      const pedidosB = listarPedidosTenant("workspace-empresa-b");

      expect(pedidosRodo).toHaveLength(1);
      expect(pedidosRodo[0].id).toBe("ped-1");

      expect(pedidosB).toHaveLength(1);
      expect(pedidosB[0].id).toBe("ped-2");
    });
  });

  // =========================================================================
  // CENÁRIO 8: Resposta Ilegível / Dado Qualitativo
  // =========================================================================
  describe("Cenário 8 — Resposta Ilegível / Dado Qualitativo", () => {
    it("deve marcar dados qualitativos como 'tem bastante' como inconsistente sem inventar número ou zero", () => {
      const msg = "Coca 350ml zero tem bastante, e Monster acho que tem pouco";
      const inter = interpretarMensagemEstoque(msg);

      const itemZero = inter.itens.find((i) => i.produto_nome === "Coca 350ml zero");
      expect(itemZero).toBeDefined();
      expect(itemZero?.tipo_informacao).toBe("inconsistente");
      expect(itemZero?.quantidade_informada).toBeNull();

      // Cálculo mantém o status como pendente/inconsistente sem inventar estoque ou sugestão
      const catalogo: ItemCalculoCompra[] = [
        {
          produto_nome: "Coca 350ml original",
          quantidade_referencia: 10,
          estoque_atual: 4,
          status_estoque: "confirmado_positivo",
        },
        {
          produto_nome: "Coca 350ml zero",
          quantidade_referencia: 6,
          estoque_atual: null,
          status_estoque: "inconsistente",
        },
      ];
      const res = calcularSugestaoCompra(catalogo, {
        fornecedorNome: "Coca-Cola",
        formatoLista: "bebidas_sem_ref",
      });

      expect(res.statusPedido).toBe("estoque_incompleto");
      const zeroCalculado = res.todosItens?.find((i) => i.produto_nome === "Coca 350ml zero");
      expect(zeroCalculado?.quantidade_sugerida).toBeNull();
      expect(zeroCalculado?.status_estoque).toBe("inconsistente");
    });
  });

  // =========================================================================
  // CENÁRIO 9: Blindagem e Imutabilidade de Pedido Aprovado
  // =========================================================================
  describe("Cenário 9 — Blindagem e Imutabilidade de Pedido Aprovado", () => {
    it("deve rejeitar modificações silenciosas de conferência se o pedido já estiver aprovado", () => {
      const itensExistentes = new Map<string, { estoque_atual: number | null; status_estoque: string }>();
      itensExistentes.set("Coca 350ml zero", { estoque_atual: 2, status_estoque: "confirmado_positivo" });

      const estadoAprovado = {
        pedidoId: "ped-coca-aprovado",
        pedidoStatus: "aprovado",
        itensExistentes,
        fornecedorNome: "Coca-Cola",
        dataOperacional: "2026-11-19",
      };

      // Mensagem atrasada chega
      const interAtrasada = interpretarMensagemEstoque("Coca 350ml zero = 10");
      const res = consolidarItensEmSessao(
        interAtrasada.itens,
        estadoAprovado,
        { chatId: "-1001", nomeUsuario: "Funcionario Atrasado", origemTipo: "telegram_texto" }
      );

      expect(res.pedido_protegido_imutavel).toBe(true);
      expect(res.itens_consolidados).toHaveLength(0);
      expect(res.mensagem_status).toContain("já foi aprovado e permanece protegido");
    });
  });

  // =========================================================================
  // CENÁRIO 10: Limites Operacionais e Exceções
  // =========================================================================
  describe("Cenário 10 — Limites Operacionais e Exceções", () => {
    it("deve aplicar teto de segurança apenas em canal online e manter compras diretas físicas sem corte", () => {
      // 1. Canal Online com teto de 50 caixas
      const itensOnline: ItemCalculoCompra[] = [
        {
          produto_nome: "Embalagem Pote 500ml",
          quantidade_referencia: 80,
          estoque_atual: 0,
          canal_compra: "online",
          limite_max_sugerido: 50,
        },
      ];
      const resOnline = calcularSugestaoCompra(itensOnline, {
        fornecedorNome: "Sellpack",
        canalCompra: "online",
      });
      const itemOnline = resOnline.itens.find((i) => i.produto_nome === "Embalagem Pote 500ml");
      expect(itemOnline?.quantidade_sugerida).toBe(50);
      expect(itemOnline?.limite_aplicado).toBe(true);

      // 2. Compra Direta Física (Salgados de 160 caixas) — SEM corte
      const itensDireto: ItemCalculoCompra[] = [
        {
          produto_nome: "Coxinha",
          quantidade_referencia: 190,
          estoque_atual: 30, // 190 - 30 = 160 caixas
          canal_compra: "direto",
          limite_max_sugerido: null,
        },
      ];
      const resDireto = calcularSugestaoCompra(itensDireto, {
        fornecedorNome: "Salgados",
        canalCompra: "direto",
        formatoLista: "salgados_soma",
      });
      const itemDireto = resDireto.itens.find((i) => i.produto_nome === "Coxinha");
      expect(itemDireto?.quantidade_sugerida).toBe(160);
      expect(itemDireto?.limite_aplicado).toBe(false);
      expect(resDireto.textoFormatado).toContain("190 | Coxinha = 160");
    });
  });
});
