import { describe, it, expect } from "vitest";

// Tipos e Interfaces do modelo da Etapa 4C
export type StatusEstoqueItem = "pendente_contagem" | "confirmado_zero" | "confirmado_positivo" | "inconsistente";
export type StatusPedido = 
  | "aguardando_estoque" 
  | "estoque_incompleto" 
  | "estoque_confirmado" 
  | "pedido_calculado" 
  | "aguardando_aprovacao" 
  | "aprovado" 
  | "enviado" 
  | "cancelado";

export interface ItemCalculo4C {
  produto_nome: string;
  quantidade_referencia: number;
  tipo_informacao: StatusEstoqueItem;
  quantidade_informada?: number | null;
  canal_compra?: "direto" | "online" | "distribuidor" | "representante";
  limite_max_sugerido?: number | null;
  aumento_temporario_pct?: number;
}

export interface ItemResultado4C {
  produto_nome: string;
  quantidade_referencia: number;
  estoque_atual: number | null;
  quantidade_sugerida: number | null;
  status_estoque: StatusEstoqueItem;
  limite_aplicado: boolean;
}

export interface ResultadoPedido4C {
  status: StatusPedido;
  itens: ItemResultado4C[];
  total_itens_pendentes: number;
  total_itens_calculados: number;
  total_unidades_sugeridas: number;
}

/**
 * Motor de Cálculo 4C: Implementação determinística das regras dos Gates 2, 3 e 4
 */
export function processarCalculoCompras4C(
  itens: ItemCalculo4C[],
  opcoes: { aumento_temporario_pct?: number; canal_compra?: string } = {}
): ResultadoPedido4C {
  const aumento = Number(opcoes.aumento_temporario_pct || 0);
  const canal = opcoes.canal_compra || "direto";

  let pendentes = 0;
  let calculados = 0;
  let totalUnidades = 0;
  const itensResultado: ItemResultado4C[] = [];

  for (const item of itens) {
    const refAjustada = item.quantidade_referencia * (1 + aumento / 100);
    let sugerida: number | null = null;
    let estoque: number | null = null;
    let limiteAplicado = false;

    if (item.tipo_informacao === "confirmado_zero") {
      estoque = 0;
      sugerida = Math.max(0, Math.ceil(refAjustada - 0));
      calculados++;
      totalUnidades += sugerida;
    } else if (item.tipo_informacao === "confirmado_positivo") {
      estoque = Number(item.quantidade_informada || 0);
      sugerida = Math.max(0, Math.ceil(refAjustada - estoque));
      calculados++;
      totalUnidades += sugerida;
    } else {
      // Gate 2: NÃO INVENTAR ZERO QUANDO PENDENTE OU INCONSISTENTE
      estoque = null;
      sugerida = null;
      pendentes++;
    }

    // Gate 4: Limite aplicado somente se canal for online ou produto possuir limite explícito
    const limite = item.limite_max_sugerido;
    if (sugerida !== null && (canal === "online" || (limite !== null && limite !== undefined))) {
      const teto = limite && limite > 0 ? limite : 50;
      if (sugerida > teto) {
        sugerida = teto;
        limiteAplicado = true;
      }
    }

    itensResultado.push({
      produto_nome: item.produto_nome,
      quantidade_referencia: item.quantidade_referencia,
      estoque_atual: estoque,
      quantidade_sugerida: sugerida,
      status_estoque: item.tipo_informacao,
      limite_aplicado: limiteAplicado,
    });
  }

  let status: StatusPedido = "aguardando_estoque";
  if (pendentes === 0 && calculados > 0) {
    status = "pedido_calculado";
  } else if (pendentes > 0 && calculados > 0) {
    status = "estoque_incompleto";
  } else {
    status = "aguardando_estoque";
  }

  return {
    status,
    itens: itensResultado,
    total_itens_pendentes: pendentes,
    total_itens_calculados: calculados,
    total_unidades_sugeridas: totalUnidades,
  };
}

describe("Etapa 4C-A: Integridade, Idempotência e Segurança de Compras", () => {
  describe("Gate 2: Sem Estoque Zero Falso", () => {
    it("1. Não deve calcular compra assumindo zero quando a contagem não foi realizada", () => {
      const itens: ItemCalculo4C[] = [
        { produto_nome: "Coxinha", quantidade_referencia: 190, tipo_informacao: "pendente_contagem" },
        { produto_nome: "Kibe", quantidade_referencia: 40, tipo_informacao: "pendente_contagem" },
      ];

      const res = processarCalculoCompras4C(itens);

      expect(res.status).toBe("aguardando_estoque");
      expect(res.total_itens_pendentes).toBe(2);
      expect(res.total_itens_calculados).toBe(0);
      expect(res.itens[0].quantidade_sugerida).toBeNull();
      expect(res.itens[0].estoque_atual).toBeNull();
      expect(res.itens[1].quantidade_sugerida).toBeNull();
    });

    it("2. Deve calcular compra integral quando o estoque zero for explicitamente confirmado", () => {
      const itens: ItemCalculo4C[] = [
        { produto_nome: "Coxinha", quantidade_referencia: 190, tipo_informacao: "confirmado_zero", quantidade_informada: 0 },
      ];

      const res = processarCalculoCompras4C(itens);

      expect(res.status).toBe("pedido_calculado");
      expect(res.itens[0].quantidade_sugerida).toBe(190);
      expect(res.itens[0].estoque_atual).toBe(0);
      expect(res.itens[0].status_estoque).toBe("confirmado_zero");
    });

    it("3. Deve marcar 'estoque_incompleto' quando apenas parte dos itens foi conferida", () => {
      const itens: ItemCalculo4C[] = [
        { produto_nome: "Coxinha", quantidade_referencia: 190, tipo_informacao: "confirmado_positivo", quantidade_informada: 100 },
        { produto_nome: "Kibe", quantidade_referencia: 40, tipo_informacao: "pendente_contagem" },
      ];

      const res = processarCalculoCompras4C(itens);

      expect(res.status).toBe("estoque_incompleto");
      expect(res.total_itens_pendentes).toBe(1);
      expect(res.total_itens_calculados).toBe(1);
      expect(res.itens[0].quantidade_sugerida).toBe(90);
      expect(res.itens[1].quantidade_sugerida).toBeNull();
    });
  });

  describe("Gate 4: Limites por Canal e Fornecedor", () => {
    it("4. Não deve limitar salgados a 50 unidades no canal direto da Rodo Point", () => {
      const itens: ItemCalculo4C[] = [
        { produto_nome: "Coxinha", quantidade_referencia: 190, tipo_informacao: "confirmado_positivo", quantidade_informada: 30, canal_compra: "direto" },
      ];

      // Sugestão bruta = 190 - 30 = 160. Não deve cortar para 50!
      const res = processarCalculoCompras4C(itens, { canal_compra: "direto" });

      expect(res.itens[0].quantidade_sugerida).toBe(160);
      expect(res.itens[0].limite_aplicado).toBe(false);
    });

    it("5. Deve aplicar limite de 50 unidades estritamente quando canal de compra for online", () => {
      const itens: ItemCalculo4C[] = [
        { produto_nome: "Produto Online", quantidade_referencia: 100, tipo_informacao: "confirmado_positivo", quantidade_informada: 10 },
      ];

      const res = processarCalculoCompras4C(itens, { canal_compra: "online" });

      expect(res.itens[0].quantidade_sugerida).toBe(50);
      expect(res.itens[0].limite_aplicado).toBe(true);
    });

    it("6. Deve respeitar limite_max_sugerido configurado individualmente no produto", () => {
      const itens: ItemCalculo4C[] = [
        { produto_nome: "Item Restrito", quantidade_referencia: 100, tipo_informacao: "confirmado_positivo", quantidade_informada: 10, limite_max_sugerido: 25 },
      ];

      const res = processarCalculoCompras4C(itens, { canal_compra: "direto" });

      expect(res.itens[0].quantidade_sugerida).toBe(25);
      expect(res.itens[0].limite_aplicado).toBe(true);
    });
  });

  describe("Gate 3: Idempotência e Preservação de Dados", () => {
    it("7. Deve simular execução repetida sem duplicar pedidos e preservando itens aprovados", () => {
      // Simulação do repositório
      const pedidosRepo: Map<string, { id: string; status: StatusPedido; itens: unknown[] }> = new Map();

      function registrarOuRecuperarPedido(workspaceId: string, fornecedor: string, data: string, statusInicial: StatusPedido) {
        const chave = `${workspaceId}_${fornecedor}_${data}`;
        if (pedidosRepo.has(chave)) {
          const existente = pedidosRepo.get(chave)!;
          // Se já aprovado, preserva estritamente
          if (existente.status === "aprovado") {
            return { pedido: existente, duplicado: false, preservado: true };
          }
          return { pedido: existente, duplicado: false, preservado: false };
        }

        const novo = { id: "ped-1", status: statusInicial, itens: [{ nome: "Coxinha", sugerida: 90 }] };
        pedidosRepo.set(chave, novo);
        return { pedido: novo, duplicado: false, preservado: false };
      }

      // 1ª Execução
      const res1 = registrarOuRecuperarPedido("ws-1", "Salgados", "2026-11-17", "aguardando_estoque");
      expect(res1.preservado).toBe(false);
      expect(pedidosRepo.size).toBe(1);

      // Aprovação administrativa
      pedidosRepo.get("ws-1_Salgados_2026-11-17")!.status = "aprovado";

      // 2ª Execução repetida
      const res2 = registrarOuRecuperarPedido("ws-1", "Salgados", "2026-11-17", "aguardando_estoque");
      expect(res2.preservado).toBe(true);
      expect(res2.pedido.status).toBe("aprovado");
      expect(pedidosRepo.size).toBe(1); // Nenhum pedido duplicado criado!
    });
  });

  describe("Gate 15: Segurança e Menor Privilégio", () => {
    it("8. Simula verificação de permissões: apenas executivo pode aprovar pedido", () => {
      function aprovarPedidoSimulado(usuario: { id: string; role: "membro" | "executivo" }, pedidoStatus: StatusPedido) {
        if (usuario.role !== "executivo") {
          throw new Error("42501: Apenas executivos e administradores podem aprovar pedidos de compras");
        }
        if (pedidoStatus === "cancelado") {
          throw new Error("23514: Não é permitido aprovar um pedido cancelado");
        }
        return { status: "aprovado" };
      }

      // Membro comum é bloqueado
      expect(() => aprovarPedidoSimulado({ id: "user-comum", role: "membro" }, "pedido_calculado")).toThrow("42501");

      // Executivo aprova com sucesso
      const res = aprovarPedidoSimulado({ id: "user-admin", role: "executivo" }, "pedido_calculado");
      expect(res.status).toBe("aprovado");

      // Pedido cancelado não pode ser aprovado nem por executivo
      expect(() => aprovarPedidoSimulado({ id: "user-admin", role: "executivo" }, "cancelado")).toThrow("23514");
    });
  });
});
