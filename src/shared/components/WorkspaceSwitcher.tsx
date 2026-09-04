import React, { useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  User,
  Building2,
  ChevronsUpDown,
  Plus,
  Check,
  Layers,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";

interface WorkspaceSwitcherProps {
  isCollapsed?: boolean;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  isCollapsed = false,
}) => {
  const { workspaces, activeWorkspace, setActiveWorkspace, createWorkspace } =
    useWorkspace();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newWsNome, setNewWsNome] = useState("");
  const [newWsTipo, setNewWsTipo] = useState<"PF" | "PJ">("PJ");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsNome.trim()) return;

    setIsSubmitting(true);
    const created = await createWorkspace(newWsNome.trim(), newWsTipo);
    setIsSubmitting(false);

    if (created) {
      toast({
        title: "Workspace criado com sucesso!",
        description: `A conta '${created.nome}' já está ativa.`,
      });
      setNewWsNome("");
      setNewWsTipo("PJ");
      setIsModalOpen(false);
    } else {
      toast({
        title: "Erro ao criar workspace",
        description: "Não foi possível cadastrar a nova conta.",
        variant: "destructive",
      });
    }
  };

  const getWorkspaceIcon = (tipo: "PF" | "PJ", size: "sm" | "md" = "md") => {
    const isPJ = tipo === "PJ";
    const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

    return (
      <div
        className={`flex items-center justify-center rounded-lg flex-shrink-0 transition-colors ${
          size === "sm" ? "h-7 w-7" : "h-8 w-8"
        } ${
          isPJ
            ? "bg-blue-500/15 text-blue-500 dark:text-blue-400 border border-blue-500/25"
            : "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border border-emerald-500/25"
        }`}
      >
        {isPJ ? <Building2 className={iconClass} /> : <User className={iconClass} />}
      </div>
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={`w-full group outline-none flex items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-card/60 hover:bg-accent/70 hover:border-border transition-all duration-200 shadow-sm ${
              isCollapsed ? "p-1.5 justify-center" : "p-2"
            }`}
            title={isCollapsed ? activeWorkspace?.nome || "Workspace" : undefined}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {activeWorkspace ? (
                getWorkspaceIcon(activeWorkspace.tipo, "md")
              ) : (
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground border border-border">
                  <User className="h-4 w-4" />
                </div>
              )}

              {!isCollapsed && (
                <div className="flex flex-col text-left truncate min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate leading-tight group-hover:text-primary transition-colors">
                    {activeWorkspace?.nome || "Carregando..."}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-semibold tracking-wider uppercase border ${
                        activeWorkspace?.tipo === "PJ"
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      }`}
                    >
                      {activeWorkspace?.tipo === "PJ" ? "PJ" : "PF"}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {activeWorkspace?.tipo === "PJ"
                        ? "Pessoa Jurídica"
                        : "Pessoa Física"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-colors flex-shrink-0" />
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="w-64 p-1.5 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-xl"
          align="start"
          sideOffset={6}
        >
          <div className="px-2 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Layers className="h-3.5 w-3.5" />
              <span>Contas & Workspaces</span>
            </div>
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground font-mono">
              {workspaces.length}
            </span>
          </div>

          <DropdownMenuSeparator className="my-1" />

          <div className="max-h-[260px] overflow-y-auto space-y-1 pr-0.5 scrollbar-thin">
            {workspaces.map((ws) => {
              const isSelected = activeWorkspace?.id === ws.id;
              return (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => setActiveWorkspace(ws)}
                  className={`flex items-center justify-between gap-2.5 p-2 rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? "bg-primary/10 border border-primary/20 text-foreground"
                      : "hover:bg-accent/60 border border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0">
                    {getWorkspaceIcon(ws.tipo, "sm")}
                    <div className="flex flex-col text-left truncate min-w-0">
                      <span
                        className={`text-xs truncate leading-tight ${
                          isSelected
                            ? "font-bold text-foreground"
                            : "font-medium text-foreground/80"
                        }`}
                      >
                        {ws.nome}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {ws.tipo === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 text-primary">
                      <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                    </div>
                  )}
                </DropdownMenuItem>
              );
            })}
          </div>

          <DropdownMenuSeparator className="my-1.5" />

          <DropdownMenuItem
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium text-orange-500 hover:text-orange-600 bg-orange-500/5 hover:bg-orange-500/10 border border-dashed border-orange-500/30 hover:border-orange-500/50 transition-all cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Criar Nova Conta / Empresa</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modal para criar novo workspace */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[440px] rounded-2xl p-6">
          <DialogHeader className="space-y-1.5">
            <div className="flex items-center gap-2 text-primary">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <DialogTitle className="text-lg font-bold">
                Criar Nova Conta / Workspace
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Separe as movimentações e relatórios em ambientes totalmente
              independentes (PF ou PJ).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateWorkspace} className="space-y-4 pt-3">
            {/* Tipo de Workspace - Card Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Tipo de Ambiente
              </Label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setNewWsTipo("PJ")}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                    newWsTipo === "PJ"
                      ? "border-blue-500 bg-blue-500/10 shadow-sm"
                      : "border-border hover:border-border/80 bg-card hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="h-7 w-7 rounded-lg bg-blue-500/15 text-blue-500 flex items-center justify-center border border-blue-500/25">
                      <Building2 className="h-4 w-4" />
                    </div>
                    {newWsTipo === "PJ" && (
                      <Check className="h-4 w-4 text-blue-500 stroke-[2.5]" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-foreground block">
                      Pessoa Jurídica
                    </span>
                    <span className="text-[10px] text-muted-foreground block leading-tight">
                      Empresas, filiais e CNPJ
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setNewWsTipo("PF")}
                  className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-1.5 ${
                    newWsTipo === "PF"
                      ? "border-emerald-500 bg-emerald-500/10 shadow-sm"
                      : "border-border hover:border-border/80 bg-card hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="h-7 w-7 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center border border-emerald-500/25">
                      <User className="h-4 w-4" />
                    </div>
                    {newWsTipo === "PF" && (
                      <Check className="h-4 w-4 text-emerald-500 stroke-[2.5]" />
                    )}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-foreground block">
                      Pessoa Física
                    </span>
                    <span className="text-[10px] text-muted-foreground block leading-tight">
                      Finanças pessoais e CPF
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* Nome da Conta */}
            <div className="space-y-1.5">
              <Label htmlFor="ws-nome" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Nome da Conta / Empresa
              </Label>
              <Input
                id="ws-nome"
                placeholder={
                  newWsTipo === "PJ"
                    ? "Ex: Rodo Point Filial 2, Minha Empresa..."
                    : "Ex: Minha Conta Pessoal, Investimentos..."
                }
                value={newWsNome}
                onChange={(e) => setNewWsNome(e.target.value)}
                className="h-10 rounded-xl"
                required
                autoFocus
              />
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                className="rounded-xl"
                onClick={() => setIsModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="rounded-xl font-semibold shadow-md bg-orange-500 hover:bg-orange-600 text-white"
                disabled={isSubmitting || !newWsNome.trim()}
              >
                {isSubmitting ? "Criando..." : "Criar e Alternar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};