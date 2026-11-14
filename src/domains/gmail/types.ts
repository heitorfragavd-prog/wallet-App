/**
 * types.ts
 *
 * Definições de tipos para a integração Gmail do Wallet CEO (Etapa 11).
 * Suporte a OAuth 2.0 somente-leitura, sincronização incremental e documentos financeiros.
 */

export type GmailIntegrationStatus =
  | 'pendente_autorizacao'
  | 'conectado'
  | 'desconectado'
  | 'erro_autenticacao';

export type GmailDocumentType =
  | 'boleto'
  | 'nfe'
  | 'comprovante'
  | 'cobranca'
  | 'outro'
  | 'sem_anexo';

export type GmailMessageStatus =
  | 'processado'
  | 'ignorado'
  | 'falha'
  | 'revisar';

export interface GmailIntegration {
  id: string;
  workspace_id: string;
  user_id: string;
  email_conectado: string;
  status: GmailIntegrationStatus;
  ultimo_sync_em: string | null;
  ultima_mensagem_sync_id: string | null;
  ultimo_history_id: string | null;
  configuracoes?: {
    filtro_assunto?: string[];
    apenas_com_anexos?: boolean;
    intervalo_sync_minutos?: number;
  };
  created_at: string;
  updated_at: string;
}

export interface GmailExtractionDetails {
  beneficiario?: string;
  emitente?: string;
  cnpj?: string;
  valor?: number;
  data_vencimento?: string;
  data_emissao?: string;
  linha_digitavel?: string;
  codigo_barras?: string;
  chave_acesso?: string;
  numero_nota?: string;
  itens_qtd?: number;
  tipo_anexo?: string;
  confianca?: 'alta' | 'media' | 'baixa';
  motivo_revisao?: string;
}

export interface GmailProcessedMessage {
  id: string;
  workspace_id: string;
  integration_id?: string | null;
  message_id: string;
  thread_id: string;
  remetente: string;
  destinatario: string;
  assunto: string | null;
  data_email: string | null;
  status: GmailMessageStatus;
  tipo_documento_detectado: GmailDocumentType | null;
  qtd_anexos: number;
  proposal_id?: string | null;
  fornecedor_id?: string | null;
  divida_id?: string | null;
  detalhes_extracao: GmailExtractionDetails;
  erro_processamento?: string | null;
  idempotency_hash: string;
  created_at: string;
}

export interface GmailSyncSummary {
  success: boolean;
  messagesChecked: number;
  newDocumentsFound: number;
  duplicatesSkipped: number;
  errorsCount: number;
  lastSyncTimestamp: string;
  error?: string;
}
