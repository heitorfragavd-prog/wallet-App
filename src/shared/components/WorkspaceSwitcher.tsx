import React, { useState } from "react";
import { useWorkspace, Workspace } from "@/contexts/WorkspaceContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { User, Building2, ChevronDown, Plus, Check } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";

interface WorkspaceSwitcherProps {
  isCollapsed?: boolean;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({ isCollapsed = false }) => {
  const { workspaces, activeWorkspace, setActiveWorkspace, createWorkspace } = useWorkspace();
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
        title: "Workspace criado!",
        description: `Workspace '${created.nome}' ativado com sucesso.`,
      });
      setNewWsNome("");
      setIsModalOpen(false);
    } else {
      toast({
        title: "Erro ao criar workspace",
        description: "Não foi possível cadastrar a nova conta.",
        variant: "destructive",
      });
    }
  };

  const renderIcon = (tipo: "PF" | "PJ") => {
    return tipo === "PJ" ? (
      <Building2 className="h-4 w-4 text-blue-500 flex-shrink-0" />
    ) : (
      <User className="h-4 w-4 text-emerald-500 flex-shrink-0" />
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={`w-full justify-between gap-2 border-border bg-card hover:bg-accent text-foreground ${
              isCollapsed ? "px-2 py-2" : "px-3 py-2"
            }`}
            title={isCollapsed ? activeWorkspace?.nome || "Workspace" : undefined}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              {activeWorkspace ? renderIcon(activeWorkspace.tipo) : <User className="h-4 w-4" />}
              {!isCollapsed && (
                <div className="flex flex-col text-left truncate">
                  <span className="text-sm font-semibold truncate leading-none">
                    {activeWorkspace?.nome || "Carregando..."}
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider font-mono">
                    {activeWorkspace?.tipo === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"}
                  </span>
                </div>
              )}
            </div>
            {!isCollapsed && <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Alternar Conta / Workspace
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map((ws) => {
            const isSelected = activeWorkspace?.id === ws.id;
            return (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => setActiveWorkspace(ws)}
                className="flex items-center justify-between cursor-pointer py-2"
              >
                <div className="flex items-center gap-2 truncate">
                  {renderIcon(ws.tipo)}
                  <span className={`text-sm truncate ${isSelected ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                    {ws.nome}
                  </span>
                </div>
                {isSelected && <Check className="h-4 w-4 text-orange-500" />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 cursor-pointer text-orange-600 dark:text-orange-400 font-medium"
          >
            <Plus className="h-4 w-4" />
            <span>Criar Nova Conta</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modal para criar novo workspace */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Criar Novo Workspace / Conta</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateWorkspace} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ws-nome">Nome da Conta / Empresa</Label>
              <Input
                id="ws-nome"
                placeholder="Ex: Rodo Point Filial 2, Minha Empresa..."
                value={newWsNome}
                onChange={(e) => setNewWsNome(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ws-tipo">Tipo de Conta</Label>
              <Select value={newWsTipo} onValueChange={(val: "PF" | "PJ") => setNewWsTipo(val)}>
                <SelectTrigger id="ws-tipo">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física (PF)</SelectItem>
                  <SelectItem value="PJ">Pessoa Jurídica (PJ)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !newWsNome.trim()}>
                {isSubmitting ? "Criando..." : "Criar e Alternar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
