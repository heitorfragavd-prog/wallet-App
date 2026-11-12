import React from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileImage,
  FileText,
  Lock,
  Receipt,
  Settings2,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import {
  GROUP_TYPE_META,
  type ConversaActionProposal,
  type ConversaAttachment,
  type FechamentoCaixaItem,
  type GrupoParticipante,
  type ThreadListItem,
} from "../types";
import { cn } from "@/lib/utils";

interface ConversaDetailPanelProps {
  thread: ThreadListItem | null;
  participants: GrupoParticipante[];
  attachments: ConversaAttachment[];
  proposals: ConversaActionProposal[];
  fechamentos: FechamentoCaixaItem[];
  isExecutiveUser: boolean;
  onOpenManageModal: (grupoId?: string) => void;
  onOpenAttachmentUrl: (storagePath: string) => Promise<void>;
}

function formatMoney(v: unknown): string {
  const num = Number(v);
  if (!Number.isFinite(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function sumRecordValues(rec: Record<string, unknown> | null | undefined): number {
  if (!rec || typeof rec !== "object") return 0;
  if (typeof rec.total === "number") return rec.total;
  return (
    Number(rec.dinheiro || 0) +
    Number(rec.pix || 0) +
    Number(rec.debito || 0) +
    Number(rec.credito || 0)
  );
}

export const ConversaDetailPanel: React.FC<ConversaDetailPanelProps> = ({
  thread,
  participants,
  attachments,
  proposals,
  fechamentos,
  isExecutiveUser,
  onOpenManageModal,
  onOpenAttachmentUrl,
}) => {
  if (!thread) {
    return (
      <aside className="hidden lg:flex w-80 xl:w-88 border-l border-border/60 bg-card/50 items-center justify-center p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Os detalhes operacionais, participantes e auditoria aparecerão aqui.
        </p>
      </aside>
    );
  }

  const meta = thread.grupo ? GROUP_TYPE_META[thread.grupo.tipo_grupo] : null;

  return (
    <aside className="flex flex-col h-full bg-card/50 border-l border-border/60 min-h-0">
      <div className="p-4 border-b border-border/60 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Contexto & Auditoria
          </h3>
          <p className="text-sm font-semibold text-foreground truncate">{thread.title}</p>
        </div>
        {thread.kind === "group" && isExecutiveUser && thread.grupo && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpenManageModal(thread.grupo!.id)}
            className="h-7 px-2.5 text-xs gap-1"
          >
            <Settings2 className="w-3.5 h-3.5" />
            Editar
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-5">
          {/* Finalidade e Isolamento */}
          <div className="rounded-xl border border-border/60 bg-background/50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                Escopo & Segurança
              </span>
              {thread.kind === "private_ceo" ? (
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-500/40 text-amber-300 bg-amber-500/10"
                >
                  Restrito CEO
                </Badge>
              ) : (
                meta && (
                  <Badge variant="outline" className={cn("text-[10px]", meta.badgeClass)}>
                    {meta.shortLabel}
                  </Badge>
                )
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {meta ? meta.securityNote : thread.subtitle}
            </p>
            {thread.grupo && (
              <div className="pt-1 border-t border-border/40 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Grupo Telegram</span>
                <span className="font-mono text-foreground">
                  {thread.grupo.chat_id ? String(thread.grupo.chat_id) : "Aguardando vínculo"}
                </span>
              </div>
            )}
          </div>

          {/* Participantes (apenas para grupos) */}
          {thread.kind === "group" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Participantes ({participants.length})
                </h4>
                {isExecutiveUser && thread.grupo && (
                  <button
                    type="button"
                    onClick={() => onOpenManageModal(thread.grupo!.id)}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Gerenciar
                  </button>
                )}
              </div>

              {participants.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Somente administradores ativos no momento.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {participants.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {p.nome || p.email || p.user_id.slice(0, 8)}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {p.telegram_username
                            ? `@${p.telegram_username}`
                            : p.email || "Sem Telegram vinculado"}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {p.role_no_grupo === "admin_grupo"
                          ? "Admin"
                          : p.role_no_grupo === "leitor"
                            ? "Leitor"
                            : "Operador"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Capacidades habilitadas */}
          {meta && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Permissões da IA neste grupo
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {meta.defaultCapabilities.map((cap) => (
                  <Badge
                    key={cap.id}
                    variant="secondary"
                    className="text-[10px] font-normal bg-background/80 border border-border/50"
                  >
                    {cap.label}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Fechamentos de caixa (apenas grupo fechamento) */}
          {thread.grupo?.tipo_grupo === "fechamento" && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                Fechamentos Recentes ({fechamentos.length})
              </h4>

              {fechamentos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum fechamento registrado recentemente.
                </p>
              ) : (
                <div className="space-y-2">
                  {fechamentos.slice(0, 5).map((f) => {
                    const envTotal = sumRecordValues(f.envelope_total);
                    const eyeTotal = sumRecordValues(f.eyemobile_total);
                    return (
                      <div
                        key={f.id}
                        className="rounded-lg border border-border/50 bg-background/40 p-2.5 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">
                            {f.data_fechamento || "Sem data"}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              f.status === "conferido"
                                ? "border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                                : f.status === "divergente"
                                  ? "border-red-500/40 text-red-300 bg-red-500/10"
                                  : "border-amber-500/40 text-amber-300 bg-amber-500/10",
                            )}
                          >
                            {f.status || "pendente"}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                          <span>Envelope: {formatMoney(envTotal)}</span>
                          <span>PDV: {formatMoney(eyeTotal)}</span>
                        </div>
                        <div className="text-[11px] font-medium">
                          Diferença:{" "}
                          <span
                            className={
                              Number(f.sobra || 0) === 0
                                ? "text-emerald-300"
                                : "text-amber-300"
                            }
                          >
                            {formatMoney(f.sobra)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Documentos e Fotos Recebidos */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileImage className="w-3.5 h-3.5" />
              Documentos & Fotos ({attachments.length})
            </h4>

            {attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum documento ou foto enviado nesta conversa ainda.
              </p>
            ) : (
              <div className="space-y-1.5">
                {attachments.slice(0, 8).map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => void onOpenAttachmentUrl(att.storage_path)}
                    className="w-full text-left rounded-lg border border-border/50 bg-background/40 hover:bg-background/80 px-2.5 py-2 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {att.file_name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Via {att.source_channel === "telegram" ? "Telegram" : "Web"} •{" "}
                          {new Date(att.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Auditoria de Propostas */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Auditoria de Operações ({proposals.length})
            </h4>

            {proposals.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma proposta de confirmação registrada aqui.
              </p>
            ) : (
              <div className="space-y-1.5">
                {proposals.slice(0, 8).map((prop) => {
                  const executed = prop.status === "executed" || prop.status === "confirmed";
                  const cancelled = prop.status === "cancelled" || prop.status === "expired";

                  return (
                    <div
                      key={prop.id}
                      className="rounded-lg border border-border/50 bg-background/40 p-2.5 space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium text-foreground line-clamp-2">
                          {prop.summary}
                        </span>
                        {executed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : cancelled ? (
                          <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{prop.action_type}</span>
                        <span>{prop.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
};
