import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Crown,
  Lock,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { GROUP_TYPE_META, type ThreadListItem } from "../types";
import { cn } from "@/lib/utils";

interface ConversasSidebarListProps {
  threads: ThreadListItem[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onOpenManageModal: (grupoId?: string) => void;
  onProvisionDefaults: () => void;
  isExecutiveUser: boolean;
  loading: boolean;
  provisioning: boolean;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export const ConversasSidebarList: React.FC<ConversasSidebarListProps> = ({
  threads,
  selectedThreadId,
  onSelectThread,
  onOpenManageModal,
  onProvisionDefaults,
  isExecutiveUser,
  loading,
  provisioning,
}) => {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q) ||
        (t.lastMessagePreview || "").toLowerCase().includes(q),
    );
  }, [search, threads]);

  const groupThreads = useMemo(
    () => filtered.filter((t) => t.kind === "group"),
    [filtered],
  );
  const privateThreads = useMemo(
    () => filtered.filter((t) => t.kind !== "group"),
    [filtered],
  );

  const missingStandardCount = useMemo(() => {
    const existingTypes = new Set(
      threads.filter((t) => t.kind === "group" && t.grupo).map((t) => t.grupo!.tipo_grupo),
    );
    return Math.max(0, 4 - existingTypes.size);
  }, [threads]);

  const renderThreadRow = (thread: ThreadListItem) => {
    const active = thread.id === selectedThreadId;
    const meta = thread.grupo ? GROUP_TYPE_META[thread.grupo.tipo_grupo] : null;
    const isCeo = thread.kind === "private_ceo";

    return (
      <button
        key={thread.id}
        type="button"
        onClick={() => onSelectThread(thread.id)}
        className={cn(
          "w-full text-left rounded-xl border p-3 transition-all group",
          active
            ? isCeo
              ? "bg-amber-500/12 border-amber-500/40 shadow-sm"
              : "bg-primary/12 border-primary/40 shadow-sm"
            : "bg-card/40 border-border/50 hover:bg-card/80 hover:border-border",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0" aria-hidden="true">
              {meta ? meta.emoji : isCeo ? "👑" : "🤖"}
            </span>
            <span className="font-semibold text-sm text-foreground truncate">
              {thread.title}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {formatRelativeTime(thread.lastActivityAt)}
          </span>
        </div>

        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {thread.lastMessagePreview || thread.subtitle}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {meta && (
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0 font-medium", meta.badgeClass)}
            >
              {meta.shortLabel}
            </Badge>
          )}

          {thread.kind === "group" && thread.telegramLinked && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-sky-500/30 text-sky-300 bg-sky-500/10"
            >
              Telegram
            </Badge>
          )}

          {thread.kind === "private_ceo" && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-300 bg-amber-500/10 gap-1"
            >
              <Lock className="w-2.5 h-2.5" />
              Privado CEO
            </Badge>
          )}

          {thread.kind === "private_operational" && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-primary/30 text-primary bg-primary/10 gap-1"
            >
              <Sparkles className="w-2.5 h-2.5" />
              IA Individual
            </Badge>
          )}

          {thread.pendingProposalsCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-200 bg-amber-500/15 gap-1"
            >
              <Clock className="w-2.5 h-2.5" />
              {thread.pendingProposalsCount} pendência(s)
            </Badge>
          )}

          {thread.unreadCount > 0 && (
            <span className="ml-auto inline-flex h-2 w-2 rounded-full bg-primary" title="Mensagens não lidas" />
          )}

          {thread.kind === "group" && thread.unreadCount === 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Users className="w-3 h-3" />
              {thread.participantsCount}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <aside className="flex flex-col h-full bg-card/60 border-r border-border/60 min-h-0">
      <div className="p-4 border-b border-border/60 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">Central de Conversas</h2>
              <p className="text-[11px] text-muted-foreground truncate">
                Bot único @Wallet + IA especializada
              </p>
            </div>
          </div>

          {isExecutiveUser && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => onOpenManageModal()}
              className="h-8 w-8 shrink-0"
              title="Gerenciar grupos e permissões"
              aria-label="Gerenciar grupos e permissões"
            >
              <Settings2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar grupos, conversas ou assunto..."
            className="pl-8 h-9 text-xs bg-background/70"
          />
        </div>

        {isExecutiveUser && missingStandardCount > 0 && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onProvisionDefaults}
            disabled={provisioning}
            className="w-full justify-center gap-1.5 text-xs h-8"
          >
            <Plus className="w-3.5 h-3.5" />
            {provisioning
              ? "Criando grupos padrão..."
              : `Completar grupos operacionais (${4 - missingStandardCount}/4)`}
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-5">
          <div>
            <div className="px-1 mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                Grupos Operacionais ({groupThreads.length})
              </span>
              {isExecutiveUser && (
                <button
                  type="button"
                  onClick={() => onOpenManageModal()}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Configurar
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-20 rounded-xl bg-muted/30 animate-pulse border border-border/30"
                  />
                ))}
              </div>
            ) : groupThreads.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-center space-y-2">
                <p className="text-xs text-muted-foreground">
                  Nenhum grupo disponível para o seu usuário neste workspace.
                </p>
                {isExecutiveUser && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onProvisionDefaults}
                    disabled={provisioning}
                    className="text-xs h-8"
                  >
                    Criar os 4 grupos padrão
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">{groupThreads.map(renderThreadRow)}</div>
            )}
          </div>

          <div>
            <div className="px-1 mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                Canais Privados ({privateThreads.length})
              </span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70" />
            </div>
            <div className="space-y-2">{privateThreads.map(renderThreadRow)}</div>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
};
