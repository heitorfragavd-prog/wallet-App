/**
 * REGISTRO OFICIAL DOS SETE AGENTES ESPECIALIZADOS DO WALLET CEO 3.0
 * 
 * Cada agente é um especialista departamental coordenado pelo Wallet CEO.
 * Todos compartilham a infraestrutura central de IA, telemetria, segurança e memória,
 * respeitando isolamento de workspace e barreiras de autorização estritas.
 */

export type SpecialistAgentId =
  | "financeiro"
  | "fiscal"
  | "vendas_pdv"
  | "estoque"
  | "rh"
  | "inteligencia_competitiva"
  | "operacoes";

export interface SpecialistAgentContract {
  id: SpecialistAgentId;
  name: string;
  department: string;
  description: string;
  capabilities: string[];
  allowedTools: string[];
  requiredRole: "owner" | "admin" | "member";
  canMutateState: boolean;
  deterministicFirst: boolean;
  defaultModel: "gemini-2.5-flash" | "gpt-4o-mini" | "gpt-4o";
  maxComplexity: 1 | 2 | 3;
  systemPromptSnippet: string;
}

export const SPECIALIST_AGENTS_REGISTRY: Record<SpecialistAgentId, SpecialistAgentContract> = {
  financeiro: {
    id: "financeiro",
    name: "Agente Financeiro",
    department: "Financeiro & Controladoria",
    description: "Especialista em fluxo de caixa, conciliação Pix/bancos, contas a pagar/receber, DRE gerencial, saldos e projeções financeiras.",
    capabilities: [
      "Apurar faturamento diário, semanal e mensal",
      "Listar e monitorar contas a pagar vencidas e a vencer",
      "Calcular fluxo de caixa líquido e saldo disponível",
      "Verificar resultado operacional preliminar e margens",
      "Auditar conciliação bancária e divergências de recebimento",
      "Projetar liquidez de curto prazo para tomada de decisão",
    ],
    allowedTools: [
      "buscar_receitas",
      "buscar_despesas",
      "buscar_transacoes",
      "consultar_saldos",
      "consultar_dividas",
      "consultar_resumo_mensal",
      "consultar_fluxo_caixa",
      "consultar_contas",
    ],
    requiredRole: "admin", // Somente proprietário ou administradores podem acessar
    canMutateState: false, // Consultivo estrito — proibido executar pagamentos ou mutações
    deterministicFirst: true, // Prioriza cálculo matemático direto para economia de IA
    defaultModel: "gemini-2.5-flash",
    maxComplexity: 2,
    systemPromptSnippet:
      "Você é o ESPECIALISTA FINANCEIRO do Wallet CEO. Sua autoridade cobre faturamento, despesas, saldos, DRE, fluxo de caixa e compromissos a pagar. Nunca invente números: use exclusivamente os dados apurados. Jamais execute pagamentos ou altere transações.",
  },

  fiscal: {
    id: "fiscal",
    name: "Agente Fiscal",
    department: "Fiscal & Tributário",
    description: "Especialista em notas fiscais eletrônicas (NFC-e, NF-e), DANFE, conformidade tributária e pendências fiscais.",
    capabilities: [
      "Conferir emissão de notas fiscais de vendas e compras",
      "Verificar status de autorização na Sefaz",
      "Auditar pendências em documentos fiscais de entrada",
      "Orientar enquadramento fiscal sem emitir parecer jurídico",
    ],
    allowedTools: ["buscar_transacoes", "consultar_resumo_mensal"],
    requiredRole: "admin",
    canMutateState: false,
    deterministicFirst: true,
    defaultModel: "gemini-2.5-flash",
    maxComplexity: 2,
    systemPromptSnippet:
      "Você é o ESPECIALISTA FISCAL do Wallet CEO. Sua missão é apoiar na conferência de notas fiscais, DANFE e conformidade com a Sefaz. Não execute obrigações acessórias sem confirmação explícita do titular.",
  },

  vendas_pdv: {
    id: "vendas_pdv",
    name: "Agente de Vendas e PDV",
    department: "Vendas & Comercial",
    description: "Especialista em vendas brutas no caixa, desempenho de canais (salão, delivery, balcão), curva ABC de produtos e ticket médio.",
    capabilities: [
      "Apurar faturamento bruto do PDV Eyemobile por turno e dia",
      "Identificar produtos curva A, B e C em faturamento e volume",
      "Calcular ticket médio por cliente e por comanda",
      "Avaliar impacto de taxas de meios de pagamento (Divipay, cartões)",
      "Analisar horários de pico e gargalos de atendimento",
    ],
    allowedTools: [
      "buscar_vendas_pdv",
      "consultar_vendas_eyemobile",
      "buscar_receitas",
      "validar_fechamento_caixa",
    ],
    requiredRole: "member", // Pode ser consultado operacionalmente com dados restritos
    canMutateState: false,
    deterministicFirst: true,
    defaultModel: "gemini-2.5-flash",
    maxComplexity: 2,
    systemPromptSnippet:
      "Você é o ESPECIALISTA DE VENDAS E PDV do Wallet CEO. Sua missão é diagnosticar o desempenho comercial, faturamento de balcão e delivery, ticket médio e mix de produtos mais lucrativos.",
  },

  estoque: {
    id: "estoque",
    name: "Agente de Estoque e Compras",
    department: "Estoque & Suprimentos",
    description: "Especialista em quantidades de insumos, ponto de reposição, fichas técnicas, CMV teórico vs real e sugestão de compras.",
    capabilities: [
      "Monitorar itens em nível crítico de estoque",
      "Acompanhar cobertura de fichas técnicas dos produtos do cardápio",
      "Calcular CMV teórico e variações de custo de insumos",
      "Sugerir lista de compras priorizada por giro e validade",
      "Detectar desperdício e quebras de insumos na cozinha",
    ],
    allowedTools: ["buscar_despesas", "consultar_resumo_mensal"],
    requiredRole: "member",
    canMutateState: false,
    deterministicFirst: true,
    defaultModel: "gemini-2.5-flash",
    maxComplexity: 2,
    systemPromptSnippet:
      "Você é o ESPECIALISTA DE ESTOQUE do Wallet CEO. Sua prioridade é zelar pela margem de custos de insumos, giro de mercadorias, fichas técnicas e reposição sem estoque parado.",
  },

  rh: {
    id: "rh",
    name: "Agente de Pessoal e RH",
    department: "Recursos Humanos & Equipe",
    description: "Especialista em gestão de equipe operacional, produtividade, escalas de trabalho, controle de horas extras e comissões.",
    capabilities: [
      "Verificar escala e distribuição de equipe por turno",
      "Monitorar produtividade de operadores de caixa e atendimento",
      "Acompanhar provisões de vales e comissionamento",
      "Preservar dados pessoais sensíveis e sigilo salarial",
    ],
    allowedTools: ["buscar_despesas", "validar_fechamento_caixa"],
    requiredRole: "admin", // Dados de equipe e custos trabalhistas são restritos
    canMutateState: false,
    deterministicFirst: true,
    defaultModel: "gemini-2.5-flash",
    maxComplexity: 2,
    systemPromptSnippet:
      "Você é o ESPECIALISTA DE RH do Wallet CEO. Sua função é apoiar a liderança na organização de turnos, produtividade de equipe e alinhamento de rotinas operacionais, com absoluto sigilo de dados individuais.",
  },

  inteligencia_competitiva: {
    id: "inteligencia_competitiva",
    name: "Agente de Inteligência Competitiva",
    department: "Mercado & Estratégia",
    description: "Especialista em benchmarking do setor de alimentação, precificação dinâmica de cardápio, tendências e experimentos comerciais.",
    capabilities: [
      "Comparar indicadores do restaurante com médias de mercado do setor",
      "Avaliar elasticidade de preços e oportunidade de reajuste de margem",
      "Identificar tendências sazonais de consumo de pratos e bebidas",
      "Estruturar hipóteses e experimentos de crescimento de vendas",
    ],
    allowedTools: [
      "buscar_vendas_pdv",
      "buscar_receitas",
      "consultar_resumo_mensal",
    ],
    requiredRole: "owner", // Exclusivo da alta liderança
    canMutateState: false,
    deterministicFirst: false, // Requer capacidade analítica de síntese avançada
    defaultModel: "gemini-2.5-flash",
    maxComplexity: 3,
    systemPromptSnippet:
      "Você é o ESPECIALISTA DE INTELIGÊNCIA COMPETITIVA do Wallet CEO. Sua missão é trazer insights estratégicos de mercado, oportunidades de expansão de margem e simulação de cenários concorrenciais.",
  },

  operacoes: {
    id: "operacoes",
    name: "Agente de Operações e Processos",
    department: "Operações & KDS",
    description: "Especialista em rotinas de abertura e fechamento de caixa, sangrias, cancelamentos, KDS de cozinha e eficiência de processos.",
    capabilities: [
      "Auditar fechamentos de caixa e detectar divergências de operador",
      "Monitorar cancelamentos de itens e sangrias de numerário",
      "Acompanhar lembretes operacionais e tarefas pendentes",
      "Verificar conformidade com checklists diários de operação",
    ],
    allowedTools: [
      "validar_fechamento_caixa",
      "buscar_vendas_pdv",
      "consultar_vendas_eyemobile",
    ],
    requiredRole: "member",
    canMutateState: false,
    deterministicFirst: true,
    defaultModel: "gemini-2.5-flash",
    maxComplexity: 1,
    systemPromptSnippet:
      "Você é o ESPECIALISTA DE OPERAÇÕES do Wallet CEO. Seu foco é garantir a integridade dos processos diários da loja: caixas equilibrados, rotinas de turnos cumpridas e rápida resolução de gargalos operacionais.",
  },
};

/**
 * Valida se um determinado papel de usuário tem permissão para acionar o especialista solicitado.
 * Impede que colaboradores acessem dados executivos privados apenas alterando o nome do especialista no payload.
 */
export function authorizeSpecialistAccess(
  specialistId: SpecialistAgentId,
  userRole: "owner" | "admin" | "member"
): { authorized: boolean; reason?: string } {
  const contract = SPECIALIST_AGENTS_REGISTRY[specialistId];
  if (!contract) {
    return { authorized: false, reason: `Especialista "${specialistId}" não encontrado.` };
  }

  const roleHierarchy: Record<"owner" | "admin" | "member", number> = {
    owner: 3,
    admin: 2,
    member: 1,
  };

  const userLevel = roleHierarchy[userRole] ?? 0;
  const requiredLevel = roleHierarchy[contract.requiredRole] ?? 3;

  if (userLevel < requiredLevel) {
    return {
      authorized: false,
      reason: `Acesso negado: o especialista "${contract.name}" (${contract.department}) exige permissão de ${contract.requiredRole}, mas seu nível é ${userRole}.`,
    };
  }

  return { authorized: true };
}
