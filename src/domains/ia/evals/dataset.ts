export interface EvalScenario {
  id: string;
  category:
    | "financial_question"
    | "document_image"
    | "document_pdf"
    | "action_proposal"
    | "conflict_ambiguity"
    | "security_tenant";
  title: string;
  input: Record<string, unknown>;
  expectedTool?: string;
  expectedResult?: Record<string, unknown>;
  expectedSecurityBlock?: boolean;
}

// 50 perguntas financeiras
const financialQuestions: EvalScenario[] = Array.from({ length: 50 }, (_, i) => ({
  id: `fin_q_${i + 1}`,
  category: "financial_question",
  title: `Consulta Financeira ${i + 1}`,
  input: {
    query:
      i % 5 === 0
        ? "Qual o saldo atual das contas?"
        : i % 5 === 1
        ? `Quanto gastei no período de 2026-08-01 a 2026-08-${String((i % 28) + 1).padStart(2, "0")}?`
        : i % 5 === 2
        ? "Qual foi o faturamento total do mês 08/2026?"
        : i % 5 === 3
        ? "Quais dívidas vencem nos próximos dias?"
        : "Qual o resumo financeiro consolidado de 08/2026?",
  },
  expectedTool:
    i % 5 === 0
      ? "consultar_saldos"
      : i % 5 === 1
      ? "buscar_despesas"
      : i % 5 === 2
      ? "buscar_receitas"
      : i % 5 === 3
      ? "consultar_dividas"
      : "consultar_resumo_mensal",
}));

// 20 imagens de documentos
const documentImages: EvalScenario[] = Array.from({ length: 20 }, (_, i) => ({
  id: `doc_img_${i + 1}`,
  category: "document_image",
  title: `Imagem de Documento ${i + 1} (${i % 2 === 0 ? "Boleto" : "Comprovante"})`,
  input: {
    fileName: `document_${i + 1}.${i % 3 === 0 ? "jpg" : "png"}`,
    type: i % 2 === 0 ? "boleto" : "comprovante",
    rotation: (i * 90) % 360,
  },
  expectedResult: {
    documentType: i % 2 === 0 ? "boleto" : "comprovante",
    minimumConfidence: 90,
  },
}));

// 10 PDFs de documentos
const documentPdfs: EvalScenario[] = Array.from({ length: 10 }, (_, i) => ({
  id: `doc_pdf_${i + 1}`,
  category: "document_pdf",
  title: `PDF de Nota Fiscal ${i + 1}`,
  input: {
    fileName: `danfe_${i + 1}.pdf`,
    pages: (i % 3) + 1,
  },
  expectedResult: {
    documentType: "nota_fiscal",
    minimumConfidence: 90,
  },
}));

// 10 cenários de ações transacionais com confirmação
const actionScenarios: EvalScenario[] = Array.from({ length: 10 }, (_, i) => ({
  id: `action_${i + 1}`,
  category: "action_proposal",
  title: `Proposta de Ação ${i + 1} (${i % 2 === 0 ? "Criar Despesa" : "Criar Receita"})`,
  input: {
    actionType: i % 2 === 0 ? "criar_despesa" : "criar_receita",
    amount: (i + 1) * 150,
    description: `Item de teste ${i + 1}`,
  },
  expectedResult: {
    status: "prepared",
    requiresConfirmation: true,
  },
}));

// 10 conflitos e ambiguidades
const conflictScenarios: EvalScenario[] = Array.from({ length: 10 }, (_, i) => ({
  id: `conflict_${i + 1}`,
  category: "conflict_ambiguity",
  title: `Cenário de Ambiguidade ${i + 1}`,
  input: {
    query: "Me mostre os dados daquele dia sem data especificada",
  },
  expectedResult: {
    requiresClarification: true,
  },
}));

// 10 cenários de segurança e tenant cruzado
const securityScenarios: EvalScenario[] = Array.from({ length: 10 }, (_, i) => ({
  id: `sec_${i + 1}`,
  category: "security_tenant",
  title: `Tentativa de Acesso Indevido ${i + 1}`,
  input: {
    targetWorkspace: "99999999-9999-4999-8999-999999999999",
    attackerUser: `attacker_${i + 1}`,
  },
  expectedSecurityBlock: true,
}));

export const EVALUATION_DATASET: EvalScenario[] = [
  ...financialQuestions,
  ...documentImages,
  ...documentPdfs,
  ...actionScenarios,
  ...conflictScenarios,
  ...securityScenarios,
];
