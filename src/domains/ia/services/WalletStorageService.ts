/**
 * WalletStorageService — Storage Privado de Anexos da Wallet IA (Etapa 2.1b)
 * 
 * Regras:
 * - Bucket 'chat-attachments' privado (não-público).
 * - Arquivos organizados por: user_id/workspace_id/conversation_id/uuid-nome
 * - Geração de Signed URLs temporárias sob demanda (sem persistir signed URLs estáticas).
 */

import { supabase } from "@/integrations/supabase/client";

export const CHAT_ATTACHMENTS_BUCKET = "chat-attachments";
export const MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export interface UploadAttachmentOptions {
  file: File | Blob;
  fileName: string;
  mimeType: string;
  userId: string;
  workspaceId: string;
  conversationId?: string;
}

export interface UploadAttachmentResult {
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
}

// Cache em memória de signed URLs temporárias (válidas por 50 minutos)
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export class WalletStorageService {
  /**
   * Faz upload de anexo para o bucket privado chat-attachments.
   */
  static async uploadAttachment(options: UploadAttachmentOptions): Promise<UploadAttachmentResult> {
    const { file, fileName, mimeType, userId, workspaceId, conversationId } = options;

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error(`Tipo de arquivo não suportado: ${mimeType}`);
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new Error(`Tamanho do arquivo excede o limite de 15MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
    }

    const fileUuid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const cId = conversationId || "general";
    const storagePath = `${userId}/${workspaceId}/${cId}/${fileUuid}-${cleanFileName}`;

    const { error } = await supabase.storage
      .from(CHAT_ATTACHMENTS_BUCKET)
      .upload(storagePath, file, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Erro ao fazer upload do anexo: ${error.message}`);
    }

    return {
      storagePath,
      fileName,
      mimeType,
      size: file.size,
    };
  }

  /**
   * Obtém URL assinada temporária para visualização de anexo privado.
   */
  static async getSignedUrl(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
    if (!storagePath) return null;

    const cached = signedUrlCache.get(storagePath);
    const now = Date.now();
    if (cached && cached.expiresAt > now + 60000) {
      return cached.url;
    }

    try {
      const { data, error } = await supabase.storage
        .from(CHAT_ATTACHMENTS_BUCKET)
        .createSignedUrl(storagePath, expiresInSeconds);

      if (error || !data?.signedUrl) {
        return null;
      }

      signedUrlCache.set(storagePath, {
        url: data.signedUrl,
        expiresAt: now + expiresInSeconds * 1000,
      });

      return data.signedUrl;
    } catch {
      return null;
    }
  }
}
