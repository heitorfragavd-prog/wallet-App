import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ExternalLink,
  FileText,
  Info,
  Lock,
  Paperclip,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Users,
  Volume2,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  GROUP_TYPE_META,
  type ConversaActionProposal,
  type ConversaMessage,
  type ThreadListItem,
} from "../types";
import type { SendMessageOptions } from "../hooks/useCentralConversas";
import { AudioRecorderButton } from "./AudioRecorderButton";
import { useTextToSpeech } from "../hooks/useTextToSpeech";
import { cn } from "@/lib/utils";

interface ConversaThreadViewProps {
  thread: ThreadListItem | null;
  messages: ConversaMessage[];
  proposals: ConversaActionProposal[];
  loadingMessages: boolean;
  sending: boolean;
  confirmingProposalId: string | null;
  isExecutiveUser: boolean;
  onBackMobile: () => void;
  onToggleInfoPanel: () => void;
  onOpenManageModal: (grupoId?: string) => void;
  onSendMessage: (options: SendMessageOptions) => Promise<boolean>;
  onConfirmProposal: (proposalId: string, decision: "confirm" | "cancel") => Promise<boolean>;
  resolveAttachmentSignedUrl: (
    storagePath?: string | null,
    conversationId?: string | null,
  ) => Promise<string | null>;
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrencyBR(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const ConversaThreadView: React.FC<ConversaThreadViewProps> = ({
  thread,
  messages,
  proposals,
  loadingMessages,
  sending,
  confirmingProposalId,
  isExecutiveUser,
  onBackMobile,
  onToggleInfoPanel,
  onOpenManageModal,
  onSendMessage,
  onConfirmProposal,
  resolveAttachmentSignedUrl,
}) => {
  const [draftText, setDraftText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [invokeAi, setInvokeAi] = useState(true);
  const [mirrorToTelegram, setMirrorToTelegram] = useState(true);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [previewAttachment, setPreviewAttachment] = useState<{
    url: string;
    name: string;
    mime: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const {
    isSupported: isTtsSupported,
    isSpeaking: isTtsSpeaking,
    currentMessageId: speakingMessageId,
    toggle: toggleTts,
  } = useTextToSpeech();

  // Em Conversas da Loja, o usuário pode optar por aviso direto ou consulta à IA sem dados confidenciais
  useEffect(() => {
    if (thread?.kind === "group" && thread.grupo?.tipo_grupo === "conversas_loja") {
      setInvokeAi(false);
    } else {
      setInvokeAi(true);
    }
    setSelectedFile(null);
  }, [thread?.id, thread?.kind, thread?.grupo?.tipo_grupo]);

  // Rola para a última mensagem ao carregar ou receber mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, thread?.id]);

  // Resolve URLs assinadas para anexos das mensagens visíveis
  useEffect(() => {
    let cancelled = false;
    const pathsToResolve = messages
      .map((m) => m.attachment_path || m.attachment_url)
      .filter((p): p is string => Boolean(p && !signedUrls[p]));

    if (pathsToResolve.length === 0) return;

    void (async () => {
      const updates: Record<string, string> = {};
      await Promise.all(
        pathsToResolve.slice(0, 15).map(async (path) => {
          const resolved = await resolveAttachmentSignedUrl(path, thread?.conversation?.id);
          if (resolved) updates[path] = resolved;
        }),
      );
      if (!cancelled && Object.keys(updates).length > 0) {
        setSignedUrls((prev) => ({ ...prev, ...updates }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, resolveAttachmentSignedUrl, signedUrls, thread?.conversation?.id]);

  const pendingProposals = useMemo(
    () => proposals.filter((p) => p.status === "prepared"),
    [proposals],
  );

  if (!thread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background/40">
        <Bot className="w-10 h-10 text-muted-foreground/60 mb-3" />
        <h3 className="text-base font-semibold text-foreground">
          Selecione um grupo ou conversa
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Escolha um grupo operacional conectado ao Telegram ou um canal privado do Wallet IA
          na coluna à esquerda.
        </p>
      </div>
    );
  }

  const meta = thread.grupo ? GROUP_TYPE_META[thread.grupo.tipo_grupo] : null;
  const isCeo = thread.kind === "private_ceo";
  const canSendMessage =
    thread.kind !== "group" || isExecutiveUser || thread.myPermissions.enviar_mensagens;
  const canSendDocument =
    thread.kind !== "group" || isExecutiveUser || thread.myPermissions.enviar_documentos;
  const canConfirmOps =
    thread.kind !== "group" || isExecutiveUser || thread.myPermissions.confirmar_operacoes;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!draftText.trim() && !selectedFile) return;

    const ok = await onSendMessage({
      text: draftText,
      file: selectedFile,
      invokeAi,
      mirrorToTelegram,
    });
    if (ok) {
      setDraftText("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenAttachment = async (msg: ConversaMessage) => {
    const rawPath = msg.attachment_path || msg.attachment_url;
    if (!rawPath) return;
    const url = signedUrls[rawPath] || (await resolveAttachmentSignedUrl(rawPath, thread.conversation?.id));
    if (!url) return;
    setPreviewAttachment({
      url,
      name: msg.attachment_name || "Anexo",
      mime: msg.attachment_mime || "application/octet-stream",
    });
  };

  return (
    <section className="flex-1 flex flex-col h-full min-h-0 bg-background/30">
      {/* Cabeçalho da conversa */}
      <header className="px-4 py-3 border-b border-border/60 bg-card/70 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onBackMobile}
            className="md:hidden h-8 w-8 shrink-0"
            aria-label="Voltar para a lista"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div className="h-9 w-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-lg shrink-0">
            {meta ? meta.emoji : isCeo ? "👑" : "🤖"}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-bold text-foreground truncate">
                {thread.title}
              </h1>
              {meta && (
                <Badge
                  variant="outline"
                  className={cn("text-[10px] px-1.5 py-0", meta.badgeClass)}
                >
                  {meta.shortLabel}
                </Badge>
              )}
              {thread.telegramLinked && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-sky-500/30 text-sky-300 bg-sky-500/10"
                >
                  Telegram Sincronizado
                </Badge>
              )}
              {isCeo && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-300 bg-amber-500/10 gap-1"
                >
                  <Lock className="w-2.5 h-2.5" />
                  Canal Executivo Restrito
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {thread.kind === "group" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  {thread.participantsCount} participante(s) • {thread.subtitle}
                </span>
              ) : (
                thread.subtitle
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {thread.kind === "group" && isExecutiveUser && thread.grupo && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenManageModal(thread.grupo!.id)}
              className="hidden sm:inline-flex gap-1.5 h-8 text-xs"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Permissões
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleInfoPanel}
            className="gap-1.5 h-8 text-xs"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Detalhes</span>
          </Button>
        </div>
      </header>

      {/* Banner de segurança / isolamento contextual */}
      {thread.grupo?.tipo_grupo === "conversas_loja" && (
        <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20 text-[11px] text-purple-200 flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-purple-300" />
          <span>
            Grupo isolado: saldos bancários, lucros, receitas totais da empresa e ferramentas do
            Wallet CEO permanecem bloqueados aqui.
          </span>
        </div>
      )}

      {thread.grupo?.tipo_grupo === "nfe_boletos" && (
        <div className="px-4 py-2 bg-sky-500/10 border-b border-sky-500/20 text-[11px] text-sky-200 flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 shrink-0 text-sky-300" />
          <span>
            Recepção documental: extração e conferência de duplicidade com aprovação humana
            obrigatória. Nenhum pagamento é executado automaticamente.
          </span>
        </div>
      )}

      {/* Ações / Confirmações pendentes destacadas no topo da thread */}
      {pendingProposals.length > 0 && (
        <div className="px-4 py-2.5 border-b border-amber-500/30 bg-amber-500/10 space-y-2">
          {pendingProposals.slice(0, 2).map((prop) => {
            const payload = (prop.payload || {}) as Record<string, unknown>;
            const isClosing = prop.action_type === "confirmar_fechamento_caixa";
            const busy = confirmingProposalId === prop.id;

            return (
              <div
                key={prop.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-card/90 p-2.5"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="text-[10px] border-amber-500/40 text-amber-300 bg-amber-500/10"
                    >
                      {isClosing ? "Fechamento Pendente" : "Ação Proposta"}
                    </Badge>
                    <span className="text-xs font-semibold text-foreground truncate">
                      {prop.summary}
                    </span>
                  </div>
                  {isClosing && (
                    <p className="text-[11px] text-muted-foreground">
                      Data: {String(payload.data_fechamento || "-")} • Envelope:{" "}
                      {formatCurrencyBR(payload.total_envelope)} • Eyemobile:{" "}
                      {formatCurrencyBR(payload.total_eyemobile)} • Diferença:{" "}
                      {formatCurrencyBR(payload.sobra)}
                    </p>
                  )}
                </div>

                {canConfirmOps ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void onConfirmProposal(prop.id, "cancel")}
                      className="h-7 px-2.5 text-xs"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busy}
                      onClick={() => void onConfirmProposal(prop.id, "confirm")}
                      className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      {busy ? "Confirmando..." : "Confirmar"}
                    </Button>
                  </div>
                ) : (
                  <span className="text-[11px] text-amber-300/90 shrink-0">
                    Aguardando responsável autorizado
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline de mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {loadingMessages ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 w-3/4 rounded-2xl bg-muted/30 animate-pulse border border-border/30"
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-10">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl mb-3">
              {meta ? meta.emoji : isCeo ? "👑" : "💬"}
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              Nenhuma mensagem registrada nesta thread
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mt-1">
              {thread.telegramLinked
                ? "Envie uma mensagem ou documento por aqui ou pelo grupo conectado no Telegram (@Wallet) para ver tudo unificado em tempo real."
                : "Use os atalhos abaixo ou envie uma mensagem para iniciar o histórico auditável deste canal."}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isAssistant = msg.role === "assistant";
            const isSystem = msg.role === "system";
            const isTelegram = msg.channel === "telegram";
            const rawAttachmentPath = msg.attachment_path || msg.attachment_url;
            const resolvedUrl = rawAttachmentPath ? signedUrls[rawAttachmentPath] : undefined;
            const isImage = Boolean(
              msg.attachment_mime && msg.attachment_mime.startsWith("image/"),
            );

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center">
                  <div className="px-3 py-1 rounded-full bg-muted/50 border border-border/50 text-[11px] text-muted-foreground">
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[88%] sm:max-w-[78%] gap-1",
                  isAssistant ? "self-start items-start" : "self-end items-end ml-auto",
                )}
              >
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
                  <span className="font-medium text-foreground/85">
                    {isAssistant
                      ? msg.sender_name || (isCeo ? "Wallet CEO" : "Wallet IA")
                      : msg.sender_name || (isTelegram ? "Participante Telegram" : "Você")}
                  </span>
                  {msg.sender_role && !isAssistant && (
                    <span className="text-[10px] text-muted-foreground/80">
                      • {msg.sender_role}
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1.5 py-0 h-4",
                      isTelegram
                        ? "border-sky-500/30 text-sky-300 bg-sky-500/10"
                        : "border-border text-muted-foreground bg-background/50",
                    )}
                  >
                    {isTelegram ? "Telegram" : "Web"}
                  </Badge>
                  <span>{formatMessageTime(msg.created_at)}</span>
                </div>

                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed border shadow-xs whitespace-pre-wrap break-words",
                    isAssistant
                      ? isCeo
                        ? "bg-amber-500/10 border-amber-500/30 text-foreground rounded-tl-sm"
                        : "bg-card/90 border-border/70 text-foreground rounded-tl-sm"
                      : "bg-primary/18 border-primary/35 text-foreground rounded-tr-sm",
                  )}
                >
                  {rawAttachmentPath && (
                    <div className="mb-2">
                      {isImage && resolvedUrl ? (
                        <button
                          type="button"
                          onClick={() => void handleOpenAttachment(msg)}
                          className="block rounded-xl overflow-hidden border border-border/60 hover:opacity-90 transition-opacity"
                        >
                          <img
                            src={resolvedUrl}
                            alt={msg.attachment_name || "Anexo da conversa"}
                            className="max-h-56 max-w-xs object-cover"
                          />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleOpenAttachment(msg)}
                          className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-2.5 py-2 text-xs hover:bg-background/90 transition-colors"
                        >
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <span className="truncate max-w-[200px]">
                            {msg.attachment_name || "Documento anexado"}
                          </span>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        </button>
                      )}
                    </div>
                  )}

                  {msg.content && <div>{msg.content}</div>}

                  {isAssistant && isTtsSupported && msg.content && (
                    <div className="mt-2 flex items-center gap-1.5 pt-1.5 border-t border-border/30">
                      <button
                        type="button"
                        onClick={() => toggleTts(msg.id, msg.content)}
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                          speakingMessageId === msg.id && isTtsSpeaking
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        )}
                        title={speakingMessageId === msg.id && isTtsSpeaking ? "Parar leitura em voz alta" : "Ouvir resposta (TTS)"}
                      >
                        {speakingMessageId === msg.id && isTtsSpeaking ? (
                          <>
                            <Square className="w-3 h-3 fill-current" />
                            <span>Parar</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3" />
                            <span>Ouvir</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Prompt rápido + Composer */}
      <div className="border-t border-border/60 bg-card/70 p-3 space-y-2.5">
        {meta && meta.quickPrompts.length > 0 && canSendMessage && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
            {meta.quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setDraftText(prompt)}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border/70 bg-background/60 hover:bg-background text-muted-foreground hover:text-foreground whitespace-nowrap transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {selectedFile && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Paperclip className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate font-medium">{selectedFile.name}</span>
              <span className="text-muted-foreground shrink-0">
                ({Math.max(1, Math.round(selectedFile.size / 1024))} KB)
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Remover anexo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {!canSendMessage ? (
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>Seu acesso neste grupo é somente leitura.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="flex items-end gap-2">
              {canSendDocument && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,.xml,.txt,.csv"
                    className="hidden"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={sending}
                    onClick={() => fileInputRef.current?.click()}
                    className="h-10 w-10 shrink-0"
                    title="Anexar foto, boleto, NF-e ou comprovante"
                    aria-label="Anexar documento ou imagem"
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                </>
              )}

              <AudioRecorderButton
                disabled={sending}
                onTranscriptionComplete={(text) => {
                  setDraftText((prev) => (prev ? `${prev} ${text}` : text));
                }}
              />

              <Textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit(e);
                  }
                }}
                placeholder={
                  thread.kind === "group"
                    ? `Enviar mensagem em ${thread.title}...`
                    : isCeo
                      ? "Pergunte ao Wallet CEO sobre margens, lucros ou estratégia..."
                      : "Conversar com o Wallet IA no canal privado..."
                }
                rows={2}
                disabled={sending}
                className="min-h-[42px] max-h-32 resize-none bg-background/70 text-sm"
              />

              <Button
                type="submit"
                disabled={sending || (!draftText.trim() && !selectedFile)}
                className="h-10 px-4 shrink-0 gap-1.5"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {sending ? "Enviando..." : "Enviar"}
                </span>
              </Button>
            </div>

            {thread.kind === "group" && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <Switch checked={invokeAi} onCheckedChange={setInvokeAi} />
                  <span>Solicitar resposta da IA do grupo</span>
                </label>

                {thread.telegramLinked && (
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={mirrorToTelegram}
                      onCheckedChange={setMirrorToTelegram}
                    />
                    <span>Espelhar no grupo Telegram</span>
                  </label>
                )}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Modal de pré-visualização segura de anexo */}
      <Dialog
        open={Boolean(previewAttachment)}
        onOpenChange={(open) => {
          if (!open) setPreviewAttachment(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{previewAttachment?.name}</span>
              {previewAttachment && (
                <a
                  href={previewAttachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                >
                  Abrir em nova aba
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </DialogTitle>
          </DialogHeader>
          {previewAttachment && (
            <div className="mt-2 max-h-[70vh] overflow-auto flex items-center justify-center rounded-lg bg-muted/20 p-2">
              {previewAttachment.mime.startsWith("image/") ? (
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.name}
                  className="max-h-[65vh] object-contain rounded"
                />
              ) : previewAttachment.mime.includes("pdf") ? (
                <iframe
                  src={previewAttachment.url}
                  title={previewAttachment.name}
                  className="w-full h-[65vh] rounded border border-border"
                />
              ) : (
                <div className="py-8 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
                  <p className="text-xs text-muted-foreground">
                    Arquivo pronto para visualização externa segura.
                  </p>
                  <a
                    href={previewAttachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary underline"
                  >
                    Baixar / Visualizar {previewAttachment.name}
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};
