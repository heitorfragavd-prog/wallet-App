import React, { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  HelpCircle,
  Lock,
  Plus,
  Radio,
  Send,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Badge } from "@/shared/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  GROUP_TYPE_META,
  type GroupPermissions,
  type GrupoConfig,
  type GrupoParticipante,
  type OperationalGroupType,
  type WorkspaceMemberOption,
} from "../types";
import type {
  UpsertGroupInput,
  UpsertParticipantInput,
} from "../hooks/useCentralConversas";
import { cn } from "@/lib/utils";

interface GerenciarGruposModalProps {
  open: boolean;
  initialGroupId?: string | null;
  onOpenChange: (open: boolean) => void;
  grupos: GrupoConfig[];
  participantes: GrupoParticipante[];
  workspaceMembers: WorkspaceMemberOption[];
  provisioning: boolean;
  onProvisionDefaults: () => Promise<boolean>;
  onSaveGroup: (input: UpsertGroupInput) => Promise<GrupoConfig | null>;
  onSaveParticipant: (input: UpsertParticipantInput) => Promise<boolean>;
  onRemoveParticipant: (grupoId: string, userId: string) => Promise<boolean>;
}

const ROLE_PERMISSION_PRESETS: Record<
  "admin_grupo" | "operador" | "leitor",
  GroupPermissions
> = {
  admin_grupo: {
    ler: true,
    enviar_mensagens: true,
    enviar_documentos: true,
    confirmar_operacoes: true,
    gerenciar_grupo: true,
  },
  operador: {
    ler: true,
    enviar_mensagens: true,
    enviar_documentos: true,
    confirmar_operacoes: false,
    gerenciar_grupo: false,
  },
  leitor: {
    ler: true,
    enviar_mensagens: false,
    enviar_documentos: false,
    confirmar_operacoes: false,
    gerenciar_grupo: false,
  },
};

export const GerenciarGruposModal: React.FC<GerenciarGruposModalProps> = ({
  open,
  initialGroupId,
  onOpenChange,
  grupos,
  participantes,
  workspaceMembers,
  provisioning,
  onProvisionDefaults,
  onSaveGroup,
  onSaveParticipant,
  onRemoveParticipant,
}) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string | "new">("new");
  const [nomeGrupo, setNomeGrupo] = useState("");
  const [tipoGrupo, setTipoGrupo] = useState<OperationalGroupType>("fechamento");
  const [chatId, setChatId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [savingGroup, setSavingGroup] = useState(false);

  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<"admin_grupo" | "operador" | "leitor">(
    "operador",
  );
  const [memberPerms, setMemberPerms] = useState<GroupPermissions>(
    ROLE_PERMISSION_PRESETS.operador,
  );
  const [savingParticipant, setSavingParticipant] = useState(false);
  const { toast } = useToast();
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [showTelegramGuide, setShowTelegramGuide] = useState(false);

  const handleTestTelegramConnection = async () => {
    if (!chatId.trim()) {
      toast({
        title: "Telegram Chat ID obrigatório",
        description: "Informe o Chat ID numérico do grupo (ex: -100...) para testar.",
        variant: "destructive",
      });
      return;
    }
    setTestingTelegram(true);
    try {
      const { data, error } = await supabase.functions.invoke("wallet-ai-orchestrator", {
        body: {
          action: "test_telegram_group",
          chat_id: chatId.trim(),
          nome_grupo: nomeGrupo || "Grupo de Teste",
        },
      });
      if (error) throw error;
      toast({
        title: "Conexão Testada com Sucesso!",
        description: data?.message || "Mensagem de teste determinística enviada ao grupo do Telegram.",
      });
    } catch (err: unknown) {
      console.warn("Falha ao testar conexão Telegram:", err);
      toast({
        title: "Falha no teste",
        description: "Não foi possível enviar a mensagem ao Telegram. Verifique se o bot @Wallet foi adicionado ao grupo como administrador.",
        variant: "destructive",
      });
    } finally {
      setTestingTelegram(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (initialGroupId && grupos.some((g) => g.id === initialGroupId)) {
      setSelectedGroupId(initialGroupId);
    } else if (grupos.length > 0) {
      setSelectedGroupId(grupos[0].id);
    } else {
      setSelectedGroupId("new");
    }
  }, [grupos, initialGroupId, open]);

  const currentGroup = useMemo(
    () =>
      selectedGroupId !== "new"
        ? grupos.find((g) => g.id === selectedGroupId) || null
        : null,
    [grupos, selectedGroupId],
  );

  useEffect(() => {
    if (currentGroup) {
      setNomeGrupo(currentGroup.nome_grupo || "");
      setTipoGrupo(currentGroup.tipo_grupo);
      setChatId(currentGroup.chat_id ? String(currentGroup.chat_id) : "");
      setDescricao(currentGroup.descricao || "");
      setAtivo(currentGroup.ativo);
    } else {
      const meta = GROUP_TYPE_META.conversas_loja;
      setNomeGrupo("");
      setTipoGrupo("conversas_loja");
      setChatId("");
      setDescricao(meta.securityNote);
      setAtivo(true);
    }
  }, [currentGroup]);

  const currentParticipants = useMemo(() => {
    if (!currentGroup) return [];
    return participantes.filter((p) => p.grupo_id === currentGroup.id);
  }, [currentGroup, participantes]);

  const availableMembersToAdd = useMemo(() => {
    const existingIds = new Set(currentParticipants.map((p) => p.user_id));
    return workspaceMembers.filter((m) => {
      if (existingIds.has(m.user_id)) return false;
      if (currentGroup?.tipo_grupo === "contas_empresa") {
        return Boolean(m.is_owner || m.role === "admin");
      }
      return true;
    });
  }, [currentGroup?.tipo_grupo, currentParticipants, workspaceMembers]);

  useEffect(() => {
    if (availableMembersToAdd.length > 0) {
      setMemberUserId(availableMembersToAdd[0].user_id);
    } else {
      setMemberUserId("");
    }
  }, [availableMembersToAdd, selectedGroupId]);

  const handleSaveGroupClick = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGroup(true);
    try {
      const saved = await onSaveGroup({
        id: currentGroup?.id,
        nome_grupo: nomeGrupo,
        descricao,
        tipo_grupo: tipoGrupo,
        chat_id: chatId,
        ativo,
      });
      if (saved?.id) {
        setSelectedGroupId(saved.id);
      }
    } finally {
      setSavingGroup(false);
    }
  };

  const handleAddParticipant = async () => {
    if (!currentGroup || !memberUserId) return;
    setSavingParticipant(true);
    try {
      await onSaveParticipant({
        grupo_id: currentGroup.id,
        user_id: memberUserId,
        role_no_grupo: memberRole,
        permissoes: memberPerms,
        ativo: true,
      });
    } finally {
      setSavingParticipant(false);
    }
  };

  const handleToggleExistingPermission = async (
    participant: GrupoParticipante,
    key: keyof GroupPermissions,
    value: boolean,
  ) => {
    if (!currentGroup) return;
    await onSaveParticipant({
      grupo_id: currentGroup.id,
      user_id: participant.user_id,
      role_no_grupo: participant.role_no_grupo,
      permissoes: {
        ...participant.permissoes,
        [key]: value,
      },
      ativo: participant.ativo,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-6">
            <span>Gerenciar Grupos Operacionais & Permissões</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={provisioning}
              onClick={() => void onProvisionDefaults()}
              className="text-xs h-8 gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {provisioning ? "Provisionando..." : "Provisionar 4 Grupos Padrão"}
            </Button>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configure o vínculo com grupos do Telegram (@Wallet único), permissões da IA e
            autorização individual de cada participante.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2">
          {/* Lista de grupos */}
          <div className="md:col-span-4 space-y-2 border-b md:border-b-0 md:border-r border-border/60 pb-3 md:pb-0 md:pr-3">
            <Button
              type="button"
              size="sm"
              variant={selectedGroupId === "new" ? "default" : "outline"}
              onClick={() => setSelectedGroupId("new")}
              className="w-full justify-start gap-2 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Grupo Operacional
            </Button>

            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {grupos.map((g) => {
                const meta = GROUP_TYPE_META[g.tipo_grupo];
                const active = selectedGroupId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGroupId(g.id)}
                    className={cn(
                      "w-full text-left rounded-lg border p-2.5 transition-colors",
                      active
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/50 bg-card/40 hover:bg-card/80",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold truncate">
                        {meta?.emoji} {g.nome_grupo || meta?.label}
                      </span>
                      {!g.ativo && (
                        <Badge variant="outline" className="text-[9px]">
                          Inativo
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {g.chat_id ? `Telegram: ${g.chat_id}` : "Somente Web / Sem Chat ID"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Formulário do grupo + Participantes */}
          <div className="md:col-span-8 space-y-5">
            <form onSubmit={handleSaveGroupClick} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="grupo-nome" className="text-xs">
                    Nome do Grupo
                  </Label>
                  <Input
                    id="grupo-nome"
                    value={nomeGrupo}
                    onChange={(e) => setNomeGrupo(e.target.value)}
                    placeholder="Ex: Fechamento Rodo Point"
                    required
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="grupo-tipo" className="text-xs">
                    Finalidade / Perfil da IA
                  </Label>
                  <Select
                    value={tipoGrupo}
                    onValueChange={(v) => setTipoGrupo(v as OperationalGroupType)}
                  >
                    <SelectTrigger id="grupo-tipo" className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(GROUP_TYPE_META) as OperationalGroupType[]).map(
                        (key) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {GROUP_TYPE_META[key].emoji} {GROUP_TYPE_META[key].label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="grupo-chat-id" className="text-xs">
                        Telegram Chat ID
                      </Label>
                      <button
                        type="button"
                        onClick={() => setShowTelegramGuide((prev) => !prev)}
                        className="text-[10px] text-primary hover:underline flex items-center gap-1"
                      >
                        <HelpCircle className="w-3 h-3" />
                        Como conectar?
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        id="grupo-chat-id"
                        value={chatId}
                        onChange={(e) => setChatId(e.target.value)}
                        placeholder="Ex: -1001234567890"
                        className="h-9 text-xs font-mono"
                      />
                      {chatId.trim() && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleTestTelegramConnection()}
                          disabled={testingTelegram}
                          className="h-9 px-2.5 text-xs shrink-0 gap-1.5"
                          title="Enviar mensagem de teste determinística ao grupo no Telegram"
                        >
                          <Send className="w-3 h-3" />
                          {testingTelegram ? "Enviando..." : "Testar"}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 h-9">
                    <span className="text-xs font-medium">Grupo Ativo</span>
                    <Switch checked={ativo} onCheckedChange={setAtivo} />
                  </div>
                </div>

                {/* Status de Conexão com Telegram */}
                <div className="flex items-center justify-between px-1 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Status do Vínculo:</span>
                    {chatId.trim() ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1">
                        <Radio className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                        Conectado ao Telegram
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30 gap-1">
                        <Bot className="w-2.5 h-2.5 text-amber-400" />
                        Somente Web (Sem Chat ID)
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Guia / Wizard de Conexão */}
                {showTelegramGuide && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs space-y-1.5 text-foreground/90">
                    <p className="font-semibold text-primary flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5" />
                      Assistente de Conexão Telegram (Bot Único)
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] text-muted-foreground">
                      <li>Crie ou abra o grupo desejado no Telegram da empresa.</li>
                      <li>Adicione o bot oficial do Wallet como <strong>Administrador</strong> do grupo com permissão para ler e enviar mensagens.</li>
                      <li>Envie o comando <code className="bg-muted px-1 rounded text-foreground">/chatid</code> no grupo para obter o identificador numérico (ex: <code className="bg-muted px-1 rounded text-foreground">-1002345678901</code>).</li>
                      <li>Cole o ID no campo <strong>Telegram Chat ID</strong> acima e clique em <strong>Testar</strong>.</li>
                    </ol>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="grupo-desc" className="text-xs">
                  Descrição e Regras do Grupo
                </Label>
                <Textarea
                  id="grupo-desc"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>

              {tipoGrupo === "contas_empresa" && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                  <span>
                    Segurança máxima: funcionários comuns não podem ser adicionados ao grupo
                    Contas da Empresa. Apenas o proprietário e administradores autorizados têm
                    acesso.
                  </span>
                </div>
              )}

              {tipoGrupo === "conversas_loja" && (
                <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-2.5 text-[11px] text-purple-200 flex items-center gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-purple-300" />
                  <span>
                    Este grupo é isolado dos dados financeiros confidenciais da empresa (saldos,
                    lucros e contas).
                  </span>
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={savingGroup} className="text-xs">
                  {savingGroup
                    ? "Salvando..."
                    : currentGroup
                      ? "Salvar Configurações do Grupo"
                      : "Criar Grupo"}
                </Button>
              </div>
            </form>

            {/* Participantes do Grupo */}
            {currentGroup && (
              <div className="border-t border-border/60 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Participantes Autorizados ({currentParticipants.length})
                  </h4>
                </div>

                {/* Adicionar participante */}
                {availableMembersToAdd.length > 0 ? (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="sm:col-span-2">
                        <Label className="text-[11px] text-muted-foreground">
                          Membro do Workspace
                        </Label>
                        <Select value={memberUserId} onValueChange={setMemberUserId}>
                          <SelectTrigger className="h-8 text-xs mt-1">
                            <SelectValue placeholder="Selecione um membro" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableMembersToAdd.map((m) => (
                              <SelectItem key={m.user_id} value={m.user_id} className="text-xs">
                                {m.nome || m.email || m.user_id.slice(0, 8)} (
                                {m.is_owner ? "Proprietário" : m.role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-[11px] text-muted-foreground">
                          Papel no Grupo
                        </Label>
                        <Select
                          value={memberRole}
                          onValueChange={(v) => {
                            const nextRole = v as "admin_grupo" | "operador" | "leitor";
                            setMemberRole(nextRole);
                            setMemberPerms(ROLE_PERMISSION_PRESETS[nextRole]);
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin_grupo" className="text-xs">
                              Admin do Grupo
                            </SelectItem>
                            <SelectItem value="operador" className="text-xs">
                              Operador
                            </SelectItem>
                            <SelectItem value="leitor" className="text-xs">
                              Leitor
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px]">
                      {(
                        [
                          ["enviar_mensagens", "Enviar mensagens"],
                          ["enviar_documentos", "Enviar docs/fotos"],
                          ["confirmar_operacoes", "Confirmar ações"],
                          ["gerenciar_grupo", "Gerenciar grupo"],
                        ] as Array<[keyof GroupPermissions, string]>
                      ).map(([permKey, label]) => (
                        <label
                          key={permKey}
                          className="inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Switch
                            checked={memberPerms[permKey]}
                            onCheckedChange={(checked) =>
                              setMemberPerms((prev) => ({ ...prev, [permKey]: checked }))
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}

                      <Button
                        type="button"
                        size="sm"
                        disabled={savingParticipant || !memberUserId}
                        onClick={() => void handleAddParticipant()}
                        className="ml-auto h-8 text-xs gap-1"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Autorizar no Grupo
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Todos os membros elegíveis do workspace já estão cadastrados neste grupo.
                  </p>
                )}

                {/* Lista atual */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {currentParticipants.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-border/60 bg-card/60 p-2.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold truncate">
                              {p.nome || p.email || p.user_id.slice(0, 8)}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {p.role_no_grupo}
                            </Badge>
                            {p.telegram_username && (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-sky-500/30 text-sky-300"
                              >
                                @{p.telegram_username}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {p.email || "Sem e-mail público"}
                          </p>
                        </div>

                        {p.workspace_role !== "owner" && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              void onRemoveParticipant(currentGroup.id, p.user_id)
                            }
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Revogar acesso deste participante"
                            aria-label="Revogar acesso"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                        {(
                          [
                            ["ler", "Ler"],
                            ["enviar_mensagens", "Mensagens"],
                            ["enviar_documentos", "Documentos"],
                            ["confirmar_operacoes", "Confirmar"],
                            ["gerenciar_grupo", "Gerenciar"],
                          ] as Array<[keyof GroupPermissions, string]>
                        ).map(([key, label]) => (
                          <label
                            key={key}
                            className="inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Switch
                              checked={p.permissoes[key]}
                              disabled={p.workspace_role === "owner"}
                              onCheckedChange={(checked) =>
                                void handleToggleExistingPermission(p, key, checked)
                              }
                            />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
