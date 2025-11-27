import { useState, useRef, useEffect } from "react";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { 
  Upload, 
  File, 
  Image as ImageIcon, 
  FileText, 
  X, 
  Download,
  Loader2 
} from "lucide-react";
import { useAttachments } from "../hooks/useAttachments";
import { AnexoTransacao } from "../types";
import { cn } from "@/lib/utils";

interface AttachmentUploaderProps {
  transacaoId?: string;
  transacaoTipo: 'receita' | 'despesa' | 'divida';
  attachments: AnexoTransacao[];
  onUploadSuccess?: (anexo: AnexoTransacao) => void;
  onDeleteSuccess?: (anexoId: string) => void;
  className?: string;
}

export function AttachmentUploader({
  transacaoId,
  transacaoTipo,
  attachments,
  onUploadSuccess,
  onDeleteSuccess,
  className,
}: AttachmentUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    uploading,
    uploadAttachment,
    getSignedUrl,
    deleteAttachment,
    downloadAttachment,
    validateFile,
  } = useAttachments();

  // Load previews for image attachments
  useEffect(() => {
    const loadPreviews = async () => {
      for (const attachment of attachments) {
        if (attachment.tipo_arquivo.startsWith('image/') && !previews[attachment.id]) {
          const url = await getSignedUrl(attachment.storage_path);
          if (url) {
            setPreviews(prev => ({ ...prev, [attachment.id]: url }));
          }
        }
      }
    };
    loadPreviews();
  }, [attachments]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (!transacaoId) return;

    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      await handleFileUpload(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!transacaoId) return;

    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await handleFileUpload(file);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!transacaoId) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      return;
    }

    const { data, error } = await uploadAttachment(file, transacaoTipo, transacaoId);
    if (data && !error && onUploadSuccess) {
      onUploadSuccess(data);
    }
  };

  const handleDelete = async (anexo: AnexoTransacao) => {
    setDeletingId(anexo.id);
    const { error } = await deleteAttachment(anexo.id, anexo.storage_path);
    setDeletingId(null);

    if (!error && onDeleteSuccess) {
      onDeleteSuccess(anexo.id);
    }
  };

  const handleDownload = async (anexo: AnexoTransacao) => {
    await downloadAttachment(anexo.storage_path, anexo.nome);
  };

  const getFileIcon = (tipoArquivo: string) => {
    if (tipoArquivo.startsWith('image/')) {
      return <ImageIcon className="h-5 w-5" />;
    } else if (tipoArquivo === 'application/pdf') {
      return <FileText className="h-5 w-5" />;
    }
    return <File className="h-5 w-5" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Upload Area */}
      {transacaoId && (
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-border",
            uploading && "opacity-50 pointer-events-none"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,application/pdf"
            multiple
            onChange={handleFileSelect}
            disabled={uploading}
          />

          <div className="flex flex-col items-center gap-2">
            {uploading ? (
              <>
                <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
                <p className="text-sm text-muted-foreground">Enviando arquivo...</p>
              </>
            ) : (
              <>
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Arraste arquivos aqui ou{" "}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-primary hover:underline"
                    >
                      clique para selecionar
                    </button>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    JPG, PNG ou PDF até 5MB
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Attachments List */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Anexos ({attachments.length})</h4>
          <div className="grid gap-2">
            {attachments.map((anexo) => (
              <Card key={anexo.id} className="p-3">
                <div className="flex items-center gap-3">
                  {/* Preview or Icon */}
                  <div className="flex-shrink-0">
                    {previews[anexo.id] ? (
                      <img
                        src={previews[anexo.id]}
                        alt={anexo.nome}
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                        {getFileIcon(anexo.tipo_arquivo)}
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{anexo.nome}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {anexo.tipo_arquivo.split('/')[1].toUpperCase()}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(anexo.tamanho)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(anexo)}
                      disabled={deletingId === anexo.id}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(anexo)}
                      disabled={deletingId === anexo.id}
                    >
                      {deletingId === anexo.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
