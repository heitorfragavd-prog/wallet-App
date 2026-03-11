import { logger } from "@/core/logging/LoggerService";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/shared/hooks/use-toast";
import { AnexoTransacao } from "../types";

const BUCKET_NAME = 'anexos-transacoes';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

export const useAttachments = () => {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: 'O arquivo excede o tamanho máximo de 5MB'
      };
    }

    // Check file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: 'Tipo de arquivo não permitido. Use JPG, PNG ou PDF'
      };
    }

    return { valid: true };
  };

  const uploadAttachment = async (
    file: File,
    transacaoTipo: 'receita' | 'despesa' | 'divida',
    transacaoId: string
  ): Promise<{ data: AnexoTransacao | null; error: any }> => {
    try {
      setUploading(true);

      // Validate file
      const validation = validateFile(file);
      if (!validation.valid) {
        toast({
          title: "Erro na validação",
          description: validation.error,
          variant: "destructive",
        });
        return { data: null, error: validation.error };
      }

      // Get current user
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new Error('Usuário não autenticado');
      }

      const userId = userData.user.id;
      
      // Generate unique filename
      const timestamp = Date.now();
      const fileExt = file.name.split('.').pop();
      const fileName = `${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Create database record
      const { data: anexo, error: dbError } = await supabase
        .from('anexos_transacoes')
        .insert({
          user_id: userId,
          transacao_tipo: transacaoTipo,
          transacao_id: transacaoId,
          nome: file.name,
          storage_path: filePath,
          tipo_arquivo: file.type,
          tamanho: file.size
        })
        .select()
        .single();

      if (dbError) {
        // Rollback: delete uploaded file
        await supabase.storage.from(BUCKET_NAME).remove([filePath]);
        throw dbError;
      }

      toast({
        title: "Anexo enviado",
        description: "Arquivo enviado com sucesso!",
      });

      return { data: anexo, error: null };
    } catch (error) {
      toast({
        title: "Erro ao enviar anexo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { data: null, error };
    } finally {
      setUploading(false);
    }
  };

  const fetchAttachments = async (
    transacaoTipo: 'receita' | 'despesa' | 'divida',
    transacaoId: string
  ): Promise<AnexoTransacao[]> => {
    try {
      const { data, error } = await supabase
        .from('anexos_transacoes')
        .select('*')
        .eq('transacao_tipo', transacaoTipo)
        .eq('transacao_id', transacaoId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      toast({
        title: "Erro ao carregar anexos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return [];
    }
  };

  const getSignedUrl = async (storagePath: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(storagePath, 3600); // 1 hour expiry

      if (error) throw error;
      return data.signedUrl;
    } catch (error) {
      logger.error('useAttachments', 'Erro', { detail: String('Error getting signed URL:', error) });
      return null;
    }
  };

  const deleteAttachment = async (anexoId: string, storagePath: string): Promise<{ error: any }> => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([storagePath]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('anexos_transacoes')
        .delete()
        .eq('id', anexoId);

      if (dbError) throw dbError;

      toast({
        title: "Anexo removido",
        description: "Arquivo removido com sucesso!",
      });

      return { error: null };
    } catch (error) {
      toast({
        title: "Erro ao remover anexo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
      return { error };
    }
  };

  const downloadAttachment = async (storagePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .download(storagePath);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Download iniciado",
        description: "O arquivo está sendo baixado",
      });
    } catch (error) {
      toast({
        title: "Erro ao baixar anexo",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  return {
    uploading,
    uploadAttachment,
    fetchAttachments,
    getSignedUrl,
    deleteAttachment,
    downloadAttachment,
    validateFile,
  };
};
