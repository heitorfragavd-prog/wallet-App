import { z } from "zod";

export const documentTypeSchema = z.enum([
  "boleto",
  "nota_fiscal",
  "comprovante",
  "desconhecido",
]);

export type DocumentType = z.infer<typeof documentTypeSchema>;

export const boletoFieldsSchema = z.object({
  linha_digitavel: z.string().optional(),
  codigo_barras: z.string().optional(),
  beneficiario: z.string().optional(),
  cnpj_cpf_beneficiario: z.string().optional(),
  pagador: z.string().optional(),
  valor: z.number().optional(),
  vencimento: z.string().optional(), // YYYY-MM-DD
  juros_multa: z.number().optional(),
});

export const notaFiscalItemSchema = z.object({
  descricao: z.string(),
  quantidade: z.number(),
  valor_unitario: z.number(),
  valor_total: z.number(),
});

export const notaFiscalFieldsSchema = z.object({
  numero_nota: z.string().optional(),
  serie: z.string().optional(),
  chave_acesso: z.string().optional(),
  cnpj_emitente: z.string().optional(),
  razao_social_emitente: z.string().optional(),
  cnpj_destinatario: z.string().optional(),
  data_emissao: z.string().optional(), // YYYY-MM-DD
  valor_total: z.number().optional(),
  itens: z.array(notaFiscalItemSchema).optional().default([]),
});

export const comprovanteFieldsSchema = z.object({
  tipo_transferencia: z.enum(["pix", "ted", "doc", "boleto", "cartao", "outro"]).optional(),
  autenticacao: z.string().optional(),
  pagador: z.string().optional(),
  recebedor: z.string().optional(),
  cnpj_cpf_recebedor: z.string().optional(),
  valor: z.number().optional(),
  data_hora: z.string().optional(),
});

export interface DocumentExtractionResult {
  document_type: DocumentType;
  confidence: number; // 0 a 100
  fields: Record<string, unknown>;
  field_confidence: Record<string, number>;
  field_sources: Record<string, string>;
  warnings: string[];
  missing_fields: string[];
  possible_duplicates: string[];
  recommended_action: string;
}
