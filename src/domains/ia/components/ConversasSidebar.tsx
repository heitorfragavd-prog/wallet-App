import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";
import { MessageSquarePlus, Trash2, Pencil, Check, X, MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { type Conversa } from "@/domains/ia/hooks/useConversas";
import { cn } from "@/lib/utils";

interface ConversasSidebarProps {
  conversas: Conversa[];
  conversaAtiva: string | null;
  isLoading: boolean;
  onSelectConversa: (id: string) => void;
  onNovaConversa: () => void;
  onRenomear: (id: string, titulo: string) => void;
  onDeletar: (id: string) => void;
}

export const ConversasSidebar = ({
  conversas,
  conversaAtiva,
  isLoading,
  onSelectConversa,
  onNovaConversa,
  onRenomear,
  onDeletar,
}: ConversasSidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  const startEdit = (conversa: Conversa) => {
    setEditingId(conversa.id);
    setEditingTitle(conversa.titulo);
  };

  const confirmEdit = () => {
    if (editingId && editingTitle.trim()) {
      onRenomear(editingId, editingTitle.trim());
    }
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "Ontem";
    if (diffDays < 7) return `${diffDays}d atrás`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  return (
    <div
      className={cn(
        "flex flex-col border-r border-border/50 bg-muted/20 transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-64"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50 min-h-[52px]">
        {!collapsed && (
          <span className="text-sm font-semibold text-foreground truncate">Conversas</span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {!collapsed && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-purple-500"
              onClick={onNovaConversa}
              title="Nova conversa"
            >
              <MessageSquarePlus className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expandir" : "Recolher"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Collapsed: icon only */}
      {collapsed && (
        <div className="flex flex-col items-center py-2 gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-purple-500"
            onClick={onNovaConversa}
            title="Nova conversa"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Conversation list */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto py-1">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : conversas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">Nenhuma conversa ainda</p>
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 mt-1"
                onClick={onNovaConversa}
              >
                Começar
              </Button>
            </div>
          ) : (
            conversas.map((conversa) => (
              <div
                key={conversa.id}
                className={cn(
                  "group flex items-center gap-2 px-2 py-1.5 mx-1 rounded-lg cursor-pointer transition-colors",
                  conversaAtiva === conversa.id
                    ? "bg-purple-500/15 text-purple-700 dark:text-purple-300"
                    : "hover:bg-muted/60 text-foreground"
                )}
                onClick={() => onSelectConversa(conversa.id)}
              >
                {editingId === conversa.id ? (
                  <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmEdit();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="h-6 text-xs px-1 py-0 bg-background"
                      autoFocus
                    />
                    <button onClick={confirmEdit} className="text-green-500 hover:text-green-600 shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{conversa.titulo}</p>
                      {conversa.ultima_mensagem_em && (
                        <p className="text-[10px] text-muted-foreground">
                          {formatDate(conversa.ultima_mensagem_em)}
                        </p>
                      )}
                    </div>
                    <div
                      className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => startEdit(conversa)}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                        title="Renomear"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            className="p-0.5 rounded text-muted-foreground hover:text-red-500"
                            title="Deletar"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Deletar conversa?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Isso irá apagar permanentemente "{conversa.titulo}" e todas as mensagens. Ação irreversível.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onDeletar(conversa.id)}
                              className="bg-red-500 hover:bg-red-600"
                            >
                              Deletar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
