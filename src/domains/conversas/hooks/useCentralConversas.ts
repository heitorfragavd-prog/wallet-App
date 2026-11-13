import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/domains/auth/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useToast } from "@/shared/hooks/use-toast";
import { logger } from "@/core/logging/LoggerService";
import {
  GROUP_TYPE_META,
  type ConversaActionProposal,
  type ConversaAttachment,
  type ConversaMessage,
  type ConversaRecord,
  type FechamentoCaixaItem,
  type GroupPermissions,
  type GrupoConfig,
  type GrupoParticipante,
  type OperationalGroupType,
  type ThreadListItem,
  type WorkspaceMemberOption,
} from "../types";

const MAX_ATTACHMENT_SIZE_BYTES = 12 * 1024 * 1024;
const SIGNED_URL_TTL_MS = 45 * 60 * 1000;

const DEFAULT_FULL_PERMS: GroupPermissions = {
  ler: true,
  enviar_mensagens: true,
  enviar_documentos: true,
  confirmar_operacoes: true,
  gerenciar_grupo: true,
};

const DEFAULT_OPERATOR_PERMS: GroupPermissions = {
  ler: true,
  enviar_mensagens: true,
  enviar_documentos: true,
  confirmar_operacoes: false,
  gerenciar_grupo: false,
};

const DEFAULT_READER_PERMS: GroupPermissions = {
  ler: true,
  enviar_mensagens: false,
  enviar_documentos: false,
  confirmar_operacoes: false,
  gerenciar_grupo: false,
};

function normalizePermissions(
  raw: unknown,
  role?: string | null,
  isExec = false,
): GroupPermissions {
  if (isExec || role === "admin_grupo") {
    if (!raw || typeof raw !== "object") return { ...DEFAULT_FULL_PERMS };
  }
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fallback =
    role === "admin_grupo"
      ? DEFAULT_FULL_PERMS
      : role === "leitor"
        ? DEFAULT_READER_PERMS
        : DEFAULT_OPERATOR_PERMS;

  return {
    ler: typeof obj.ler === "boolean" ? obj.ler : fallback.ler,
    enviar_mensagens:
      typeof obj.enviar_mensagens === "boolean" ? obj.enviar_mensagens : fallback.enviar_mensagens,
    enviar_documentos:
      typeof obj.enviar_documentos === "boolean" ? obj.enviar_documentos : fallback.enviar_documentos,
    confirmar_operacoes:
      typeof obj.confirmar_operacoes === "boolean"
        ? obj.confirmar_operacoes
        : fallback.confirmar_operacoes,
    gerenciar_grupo:
      typeof obj.gerenciar_grupo === "boolean" ? obj.gerenciar_grupo : fallback.gerenciar_grupo,
  };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "arquivo";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
    reader.readAsDataURL(file);
  });
}

export interface SendMessageOptions {
  text?: string;
  file?: File | null;
  invokeAi?: boolean;
  mirrorToTelegram?: boolean;
}

export interface UpsertGroupInput {
  id?: string;
  nome_grupo: string;
  descricao?: string | null;
  tipo_grupo: OperationalGroupType;
  chat_id?: string | null;
  ativo: boolean;
  ferramentas_permitidas?: string[];
  dados_permitidos?: string[];
  acoes_permitidas?: string[];
  funcionalidades_autorizadas?: string[];
}

export interface UpsertParticipantInput {
  grupo_id: string;
  user_id: string;
  role_no_grupo: "admin_grupo" | "operador" | "leitor";
  permissoes: GroupPermissions;
  ativo: boolean;
}

export function useCentralConversas() {
  const { user } = useAuth();
  const { activeWorkspace, activeWorkspaceRole } = useWorkspace();
  const { toast } = useToast();

  const workspaceId = activeWorkspace?.id ?? null;
  const isOwner = Boolean(
    user?.id && activeWorkspace?.user_id && user.id === activeWorkspace.user_id,
  );
  const isWorkspaceAdmin = Boolean(
    isOwner || activeWorkspaceRole === "admin",
  );
  const isExecutiveUser = Boolean(isOwner || isWorkspaceAdmin);

  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [confirmingProposalId, setConfirmingProposalId] = useState<string | null>(null);

  const [grupos, setGrupos] = useState<GrupoConfig[]>([]);
  const [participantes, setParticipantes] = useState<GrupoParticipante[]>([]);
  const [conversations, setConversations] = useState<ConversaRecord[]>([]);
  const [readMarkers, setReadMarkers] = useState<Record<string, string>>({});
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberOption[]>([]);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversaMessage[]>([]);
  const [attachments, setAttachments] = useState<ConversaAttachment[]>([]);
  const [proposals, setProposals] = useState<ConversaActionProposal[]>([]);
  const [allPendingProposals, setAllPendingProposals] = useState<ConversaActionProposal[]>([]);
  const [fechamentos, setFechamentos] = useState<FechamentoCaixaItem[]>([]);

  const signedUrlCacheRef = useRef<Map<string, { url: string; expiresAt: number }>>(new Map());
  const selectedThreadIdRef = useRef<string | null>(null);
  selectedThreadIdRef.current = selectedThreadId;
  const readMarkersRef = useRef<Record<string, string>>({});
  readMarkersRef.current = readMarkers;
  const loadedThreadKeyRef = useRef<string | null>(null);
  const loadActiveRequestIdRef = useRef<number>(0);

  const myDisplayName = useMemo(() => {
    const meta = (user?.user_metadata || {}) as Record<string, unknown>;
    const rawName =
      (typeof meta.name === "string" && meta.name) ||
      (typeof meta.full_name === "string" && meta.full_name) ||
      user?.email?.split("@")[0] ||
      "Operador Wallet";
    return rawName;
  }, [user]);

  const myRoleLabel = useMemo(() => {
    if (isOwner) return "Proprietário";
    if (activeWorkspace?.activeWorkspaceRole === "admin") return "Administrador";
    if (activeWorkspace?.activeWorkspaceRole === "delivery_staff") return "Equipe Entrega";
    return "Operador";
  }, [activeWorkspace?.activeWorkspaceRole, isOwner]);

  const loadWorkspaceContext = useCallback(async (silent = false) => {
    if (!user?.id || !workspaceId) {
      setGrupos([]);
      setParticipantes([]);
      setConversations([]);
      setReadMarkers({});
      setWorkspaceMembers([]);
      setAllPendingProposals([]);
      setLoadingThreads(false);
      return;
    }

    if (!silent) {
      setLoadingThreads(true);
    }
    try {
      const [
        gruposRes,
        participantesRes,
        convsRes,
        leituraRes,
        pendingProposalsRes,
        membersRes,
      ] = await Promise.all([
        supabase
          .from("telegram_grupos_config" as never)
          .select(
            "id, workspace_id, chat_id, nome_grupo, descricao, tipo_grupo, ativo, ferramentas_permitidas, dados_permitidos, acoes_permitidas, funcionalidades_autorizadas, config, created_at, updated_at",
          )
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: true }),
        supabase
          .from("grupo_participantes" as never)
          .select(
            "id, grupo_id, workspace_id, user_id, role_no_grupo, permissoes, ativo, autorizado_por, created_at, updated_at",
          )
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: true }),
        supabase
          .from("wallet_ai_conversations")
          .select(
            "id, workspace_id, user_id, grupo_id, title, agent_type, is_shared, is_group, is_archived, channel, last_channel, external_chat_id, processing_status, last_message_preview, last_message_at, created_at, updated_at",
          )
          .eq("workspace_id", workspaceId)
          .eq("is_archived", false)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false }),
        supabase
          .from("grupo_conversas_leitura" as never)
          .select("conversation_id, last_read_at")
          .eq("workspace_id", workspaceId)
          .eq("user_id", user.id),
        supabase
          .from("wallet_ai_action_proposals")
          .select(
            "id, workspace_id, user_id, conversation_id, grupo_id, action_type, summary, payload, risk_level, status, expires_at, confirmed_at, executed_at, created_at",
          )
          .eq("workspace_id", workspaceId)
          .in("status", ["prepared", "confirmed"])
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("workspace_members")
          .select("user_id, role, active")
          .eq("workspace_id", workspaceId)
          .eq("active", true),
      ]);

      const rawMembers = (membersRes.data || []) as Array<{
        user_id: string;
        role: string;
        active: boolean;
      }>;
      const memberIds = new Set<string>(rawMembers.map((m) => m.user_id));
      if (activeWorkspace?.user_id) {
        memberIds.add(activeWorkspace.user_id);
      }

      const rawParticipants = (participantesRes.data || []) as GrupoParticipante[];
      for (const p of rawParticipants) {
        if (p.user_id) memberIds.add(p.user_id);
      }

      const userIdList = Array.from(memberIds);
      let profileMap = new Map<string, { name?: string | null; email?: string | null }>();
      let telegramMap = new Map<string, string | null>();

      if (userIdList.length > 0) {
        const [profilesRes, telegramRes] = await Promise.all([
          supabase.from("profiles").select("id, name, email").in("id", userIdList),
          supabase
            .from("usuarios_telegram")
            .select("user_id, telegram_username")
            .in("user_id", userIdList)
            .eq("ativo", true),
        ]);
        if (!profilesRes.error && Array.isArray(profilesRes.data)) {
          profileMap = new Map(
            profilesRes.data.map((row: { id: string; name?: string | null; email?: string | null }) => [
              row.id,
              { name: row.name ?? null, email: row.email ?? null },
            ]),
          );
        }
        if (!telegramRes.error && Array.isArray(telegramRes.data)) {
          telegramMap = new Map(
            telegramRes.data.map((row: { user_id: string; telegram_username?: string | null }) => [
              row.user_id,
              row.telegram_username ?? null,
            ]),
          );
        }
      }

      const memberRoleMap = new Map<string, string>(
        rawMembers.map((m) => [m.user_id, m.role]),
      );

      const enrichedMembers: WorkspaceMemberOption[] = userIdList.map((uid) => {
        const prof = profileMap.get(uid);
        const ownerFlag = activeWorkspace?.user_id === uid;
        return {
          user_id: uid,
          role: ownerFlag ? "owner" : memberRoleMap.get(uid) || "member",
          active: true,
          nome: prof?.name ?? (uid === user.id ? myDisplayName : null),
          email: prof?.email ?? (uid === user.id ? user.email ?? null : null),
          telegram_username: telegramMap.get(uid) ?? null,
          is_owner: ownerFlag,
        };
      });

      const enrichedParticipants: GrupoParticipante[] = rawParticipants.map((p) => {
        const prof = profileMap.get(p.user_id);
        return {
          ...p,
          permissoes: normalizePermissions(p.permissoes, p.role_no_grupo),
          nome: prof?.name ?? (p.user_id === user.id ? myDisplayName : null),
          email: prof?.email ?? (p.user_id === user.id ? user.email ?? null : null),
          telegram_username: telegramMap.get(p.user_id) ?? null,
          workspace_role:
            activeWorkspace?.user_id === p.user_id
              ? "owner"
              : memberRoleMap.get(p.user_id) ?? "member",
        };
      });

      const readMap: Record<string, string> = {};
      for (const row of (leituraRes.data || []) as Array<{
        conversation_id: string;
        last_read_at: string;
      }>) {
        readMap[row.conversation_id] = row.last_read_at;
      }

      setGrupos((gruposRes.data || []) as GrupoConfig[]);
      setParticipantes(enrichedParticipants);
      setConversations((convsRes.data || []) as ConversaRecord[]);
      readMarkersRef.current = readMap;
      setReadMarkers(readMap);
      setAllPendingProposals((pendingProposalsRes.data || []) as ConversaActionProposal[]);
      setWorkspaceMembers(enrichedMembers);
    } catch (err) {
      logger.error("central_conversas_load_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (!silent) {
        setLoadingThreads(false);
      }
    }
  }, [activeWorkspace?.user_id, myDisplayName, user?.email, user?.id, workspaceId]);

  useEffect(() => {
    void loadWorkspaceContext();
  }, [loadWorkspaceContext]);

  // Constrói lista ordenada de conversas (grupos + privados isolados)
  const threads: ThreadListItem[] = useMemo(() => {
    if (!user?.id || !workspaceId) return [];

    const groupTypeOrder: Record<OperationalGroupType, number> = {
      fechamento: 1,
      nfe_boletos: 2,
      contas_empresa: 3,
      conversas_loja: 4,
    };

    const list: ThreadListItem[] = [];

    for (const grupo of grupos) {
      if (!grupo.ativo && !isExecutiveUser) continue;

      const groupConv = conversations.find(
        (c) => c.is_group && c.grupo_id === grupo.id,
      );
      const groupMembers = participantes.filter(
        (p) => p.grupo_id === grupo.id && p.ativo,
      );
      const myMembership = groupMembers.find((p) => p.user_id === user.id);

      if (grupo.tipo_grupo === "contas_empresa" && !isExecutiveUser && !myMembership) {
        continue;
      }
      if (!isExecutiveUser && !myMembership) {
        continue;
      }

      const myPermissions = myMembership
        ? normalizePermissions(myMembership.permissoes, myMembership.role_no_grupo, isExecutiveUser)
        : isExecutiveUser
          ? { ...DEFAULT_FULL_PERMS }
          : { ...DEFAULT_READER_PERMS };

      const convId = groupConv?.id || `grupo:${grupo.id}`;
      const pendingForConv = allPendingProposals.filter(
        (p) =>
          p.status === "prepared" &&
          (p.grupo_id === grupo.id || (groupConv && p.conversation_id === groupConv.id)),
      );

      const lastActivity =
        groupConv?.last_message_at || groupConv?.updated_at || grupo.updated_at || grupo.created_at;
      const lastRead = groupConv ? readMarkers[groupConv.id] : undefined;
      const hasUnread =
        Boolean(groupConv?.last_message_at) &&
        (!lastRead || new Date(groupConv!.last_message_at!).getTime() > new Date(lastRead).getTime()) &&
        selectedThreadId !== convId;

      const meta = GROUP_TYPE_META[grupo.tipo_grupo] || GROUP_TYPE_META.conversas_loja;

      list.push({
        id: convId,
        kind: "group",
        title: grupo.nome_grupo || meta.label,
        subtitle: grupo.descricao || meta.securityNote,
        grupo,
        conversation: groupConv,
        unreadCount: hasUnread ? 1 : 0,
        participantsCount: groupMembers.length,
        pendingProposalsCount: pendingForConv.length,
        telegramLinked: Boolean(grupo.chat_id),
        processingStatus:
          pendingForConv.length > 0
            ? "awaiting_confirmation"
            : groupConv?.processing_status || "idle",
        lastActivityAt: lastActivity,
        lastMessagePreview:
          groupConv?.last_message_preview ||
          (grupo.chat_id
            ? "Grupo conectado ao Telegram (@Wallet)"
            : "Grupo operacional pronto para mensagens"),
        myPermissions,
        myGroupRole: myMembership?.role_no_grupo || (isExecutiveUser ? "admin_grupo" : "leitor"),
      });
    }

    list.sort((a, b) => {
      const orderA = a.grupo ? groupTypeOrder[a.grupo.tipo_grupo] ?? 99 : 99;
      const orderB = b.grupo ? groupTypeOrder[b.grupo.tipo_grupo] ?? 99 : 99;
      if (orderA !== orderB) return orderA - orderB;
      return (b.lastActivityAt || "").localeCompare(a.lastActivityAt || "");
    });

    // Conversa privada operacional (is_group = false, is_shared = false)
    const privateOp = conversations.find(
      (c) =>
        !c.is_group &&
        !c.is_shared &&
        c.user_id === user.id &&
        c.agent_type === "operational",
    );

    const opConvId = privateOp?.id || "private:operational";
    const opPending = allPendingProposals.filter(
      (p) => p.status === "prepared" && privateOp && p.conversation_id === privateOp.id,
    );
    list.push({
      id: opConvId,
      kind: "private_operational",
      title: "Wallet IA — Privado",
      subtitle: "Atendimento individual operacional separado dos grupos.",
      conversation: privateOp,
      unreadCount: 0,
      participantsCount: 1,
      pendingProposalsCount: opPending.length,
      telegramLinked: false,
      processingStatus:
        opPending.length > 0
          ? "awaiting_confirmation"
          : privateOp?.processing_status || "idle",
      lastActivityAt: privateOp?.last_message_at || privateOp?.updated_at || null,
      lastMessagePreview:
        privateOp?.last_message_preview ||
        "Consultas individuais e análises privadas fora dos grupos.",
      myPermissions: { ...DEFAULT_FULL_PERMS },
      myGroupRole: "admin_grupo",
    });

    // Canal privado executivo — estritamente visível apenas ao proprietário / admin executivo
    if (isExecutiveUser) {
      const privateCeo = conversations.find(
        (c) =>
          !c.is_group &&
          !c.is_shared &&
          c.user_id === user.id &&
          c.agent_type === "ceo",
      );
      const ceoConvId = privateCeo?.id || "private:ceo";
      const ceoPending = allPendingProposals.filter(
        (p) => p.status === "prepared" && privateCeo && p.conversation_id === privateCeo.id,
      );
      list.push({
        id: ceoConvId,
        kind: "private_ceo",
        title: "👑 Wallet CEO (Privado)",
        subtitle: "Conselho executivo confidencial — nunca compartilhado em grupos.",
        conversation: privateCeo,
        unreadCount: 0,
        participantsCount: 1,
        pendingProposalsCount: ceoPending.length,
        telegramLinked: false,
        processingStatus:
          ceoPending.length > 0
            ? "awaiting_confirmation"
            : privateCeo?.processing_status || "idle",
        lastActivityAt: privateCeo?.last_message_at || privateCeo?.updated_at || null,
        lastMessagePreview:
          privateCeo?.last_message_preview ||
          "Margens, rentabilidade, estratégia e diagnóstico executivo privado.",
        myPermissions: { ...DEFAULT_FULL_PERMS },
        myGroupRole: "admin_grupo",
      });
    }

    return list;
  }, [
    allPendingProposals,
    conversations,
    grupos,
    isExecutiveUser,
    participantes,
    readMarkers,
    selectedThreadId,
    user?.id,
    workspaceId,
  ]);

  // Mantém uma thread válida selecionada automaticamente
  useEffect(() => {
    if (threads.length === 0) {
      setSelectedThreadId(null);
      return;
    }
    if (!selectedThreadId || !threads.some((t) => t.id === selectedThreadId)) {
      setSelectedThreadId(threads[0].id);
    }
  }, [selectedThreadId, threads]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === selectedThreadId) || null,
    [selectedThreadId, threads],
  );

  const activeThreadRef = useRef<ThreadListItem | null>(null);
  activeThreadRef.current = activeThread;

  const currentThreadKey = useMemo(() => {
    if (!activeThread) return null;
    return `${activeThread.id}:${activeThread.conversation?.id ?? "noconv"}`;
  }, [activeThread]);

  const ensureGroupConversationId = useCallback(
    async (thread: ThreadListItem): Promise<string> => {
      if (thread.conversation?.id) return thread.conversation.id;
      if (!user?.id || !workspaceId) {
        throw new Error("Workspace ou usuário não autenticado.");
      }

      if (thread.kind === "group" && thread.grupo) {
        const { data: existing } = await supabase
          .from("wallet_ai_conversations")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("grupo_id", thread.grupo.id)
          .eq("is_group", true)
          .eq("is_archived", false)
          .maybeSingle();

        if (existing?.id) return existing.id;

        const { data: created, error } = await supabase
          .from("wallet_ai_conversations")
          .insert({
            workspace_id: workspaceId,
            user_id: user.id,
            grupo_id: thread.grupo.id,
            title: thread.grupo.nome_grupo || thread.title,
            agent_type: "operational",
            is_shared: true,
            is_group: true,
            is_archived: false,
            channel: thread.grupo.chat_id ? "telegram" : "web",
            last_channel: "web",
            external_chat_id: thread.grupo.chat_id ? String(thread.grupo.chat_id) : null,
            processing_status: "idle",
          } as never)
          .select("id")
          .single();

        if (error || !created?.id) {
          throw error || new Error("Falha ao inicializar histórico do grupo.");
        }
        await loadWorkspaceContext();
        return created.id;
      }

      const agentType = thread.kind === "private_ceo" ? "ceo" : "operational";
      const { data: created, error } = await supabase
        .from("wallet_ai_conversations")
        .insert({
          workspace_id: workspaceId,
          user_id: user.id,
          title: thread.title,
          agent_type: agentType,
          is_shared: false,
          is_group: false,
          is_archived: false,
          channel: "web",
          last_channel: "web",
          processing_status: "idle",
        } as never)
        .select("id")
        .single();

      if (error || !created?.id) {
        throw error || new Error("Falha ao iniciar conversa privada.");
      }
      await loadWorkspaceContext();
      return created.id;
    },
    [loadWorkspaceContext, user?.id, workspaceId],
  );

  const markThreadAsRead = useCallback(
    async (conversationId: string, lastMessageAt?: string | null) => {
      if (!user?.id || !workspaceId) return;

      const currentMarker = readMarkersRef.current[conversationId];
      if (
        lastMessageAt &&
        currentMarker &&
        new Date(currentMarker).getTime() >= new Date(lastMessageAt).getTime()
      ) {
        return;
      }

      const nowIso = new Date().toISOString();
      readMarkersRef.current[conversationId] = nowIso;
      setReadMarkers((prev) => {
        if (prev[conversationId] === nowIso) return prev;
        return { ...prev, [conversationId]: nowIso };
      });

      try {
        await supabase.from("grupo_conversas_leitura" as never).upsert(
          {
            conversation_id: conversationId,
            user_id: user.id,
            workspace_id: workspaceId,
            last_read_at: nowIso,
            updated_at: nowIso,
          } as never,
          { onConflict: "conversation_id,user_id" },
        );
      } catch {
        // Melhor esforço: não bloqueia visualização
      }
    },
    [user?.id, workspaceId],
  );

  const loadActiveThreadDetails = useCallback(
    async (thread: ThreadListItem | null, options?: { silent?: boolean }) => {
      const currentRequestId = ++loadActiveRequestIdRef.current;
      if (!thread || !workspaceId) {
        setMessages([]);
        setAttachments([]);
        setProposals([]);
        setFechamentos([]);
        if (!options?.silent) {
          setLoadingMessages(false);
        }
        return;
      }

      const convId = thread.conversation?.id;
      const grupoId = thread.grupo?.id;

      if (!options?.silent) {
        setLoadingMessages(true);
      }
      try {
        if (convId) {
          const [msgRes, attRes, propRes] = await Promise.all([
            supabase
              .from("wallet_ai_messages")
              .select(
                "id, conversation_id, workspace_id, user_id, role, content, channel, external_message_id, sender_name, sender_role, attachment_url, attachment_path, attachment_mime, attachment_name, metadata, created_at",
              )
              .eq("conversation_id", convId)
              .order("created_at", { ascending: true })
              .limit(120),
            supabase
              .from("wallet_ai_message_attachments" as never)
              .select(
                "id, message_id, conversation_id, workspace_id, grupo_id, uploaded_by, bucket, storage_path, file_name, mime_type, file_size, source_channel, created_at",
              )
              .eq("conversation_id", convId)
              .order("created_at", { ascending: false })
              .limit(60),
            supabase
              .from("wallet_ai_action_proposals")
              .select(
                "id, workspace_id, user_id, conversation_id, grupo_id, action_type, summary, payload, risk_level, status, expires_at, confirmed_at, executed_at, created_at",
              )
              .eq("workspace_id", workspaceId)
              .or(
                grupoId
                  ? `conversation_id.eq.${convId},grupo_id.eq.${grupoId}`
                  : `conversation_id.eq.${convId}`,
              )
              .order("created_at", { ascending: false })
              .limit(40),
          ]);

          if (currentRequestId !== loadActiveRequestIdRef.current) return;

          setMessages((msgRes.data || []) as ConversaMessage[]);
          setAttachments((attRes.data || []) as ConversaAttachment[]);
          setProposals((propRes.data || []) as ConversaActionProposal[]);
          if (thread.unreadCount > 0) {
            void markThreadAsRead(convId, thread.conversation?.last_message_at);
          }
        } else {
          if (currentRequestId !== loadActiveRequestIdRef.current) return;
          setMessages([]);
          setAttachments([]);
          setProposals([]);
        }

        if (thread.kind === "group" && thread.grupo?.tipo_grupo === "fechamento" && grupoId) {
          const { data: fechData } = await supabase
            .from("fechamentos_caixa")
            .select(
              "id, workspace_id, grupo_id, conversation_id, data_fechamento, caixa1, caixa2, envelope_total, eyemobile_total, sobra, status, anexo_path, observacao, created_at",
            )
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false })
            .limit(12);

          if (currentRequestId !== loadActiveRequestIdRef.current) return;
          setFechamentos((fechData || []) as FechamentoCaixaItem[]);
        } else {
          if (currentRequestId !== loadActiveRequestIdRef.current) return;
          setFechamentos([]);
        }
      } catch (err) {
        if (currentRequestId !== loadActiveRequestIdRef.current) return;
        logger.error("central_conversas_thread_load_failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (currentRequestId === loadActiveRequestIdRef.current) {
          if (!options?.silent) {
            setLoadingMessages(false);
          }
        }
      }
    },
    [markThreadAsRead, workspaceId],
  );

  useEffect(() => {
    if (!currentThreadKey) {
      if (loadedThreadKeyRef.current !== null) {
        loadedThreadKeyRef.current = null;
        setMessages([]);
        setAttachments([]);
        setProposals([]);
        setFechamentos([]);
      }
      return;
    }

    if (loadedThreadKeyRef.current === currentThreadKey) {
      return;
    }

    loadedThreadKeyRef.current = currentThreadKey;
    void loadActiveThreadDetails(activeThreadRef.current);
  }, [currentThreadKey, loadActiveThreadDetails]);

  const loadActiveThreadDetailsRef = useRef(loadActiveThreadDetails);
  loadActiveThreadDetailsRef.current = loadActiveThreadDetails;
  const loadWorkspaceContextRef = useRef(loadWorkspaceContext);
  loadWorkspaceContextRef.current = loadWorkspaceContext;
  const markThreadAsReadRef = useRef(markThreadAsRead);
  markThreadAsReadRef.current = markThreadAsRead;

  // Realtime para mensagens, conversas, propostas, fechamentos e participantes
  useEffect(() => {
    if (!workspaceId || !user?.id) return;

    const channel = supabase
      .channel(`central-conversas-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_ai_messages",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const record = (payload.new || payload.old) as Partial<ConversaMessage> | undefined;
          if (!record?.conversation_id) return;
          if (selectedThreadIdRef.current === record.conversation_id) {
            if (payload.eventType === "INSERT" && payload.new) {
              const incoming = payload.new as ConversaMessage;
              setMessages((prev) =>
                prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
              );
              void markThreadAsReadRef.current(incoming.conversation_id, incoming.created_at);
            } else {
              void loadActiveThreadDetailsRef.current(activeThreadRef.current, { silent: true });
            }
          }
          void loadWorkspaceContextRef.current(true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_ai_action_proposals",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void loadWorkspaceContextRef.current(true);
          void loadActiveThreadDetailsRef.current(activeThreadRef.current, { silent: true });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallet_ai_conversations",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void loadWorkspaceContextRef.current(true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "telegram_grupos_config",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void loadWorkspaceContextRef.current(true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "grupo_participantes",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void loadWorkspaceContextRef.current(true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fechamentos_caixa",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void loadActiveThreadDetailsRef.current(activeThreadRef.current, { silent: true });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, workspaceId]);

  const resolveAttachmentSignedUrl = useCallback(
    async (storagePath?: string | null, conversationId?: string | null): Promise<string | null> => {
      if (!storagePath || !workspaceId) return null;
      if (/^https?:\/\//i.test(storagePath)) return storagePath;

      const cached = signedUrlCacheRef.current.get(storagePath);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
      }

      try {
        const { data, error } = await supabase.functions.invoke("wallet-ai-orchestrator", {
          body: {
            action: "get_attachment_url",
            workspace_id: workspaceId,
            conversation_id: conversationId || activeThread?.conversation?.id || undefined,
            storage_path: storagePath,
          },
        });
        if (error || !data?.signed_url) return null;
        signedUrlCacheRef.current.set(storagePath, {
          url: data.signed_url as string,
          expiresAt: Date.now() + SIGNED_URL_TTL_MS,
        });
        return data.signed_url as string;
      } catch {
        return null;
      }
    },
    [activeThread?.conversation?.id, workspaceId],
  );

  const sendMessage = useCallback(
    async ({ text = "", file = null, invokeAi = true, mirrorToTelegram = true }: SendMessageOptions) => {
      if (!activeThread || !user?.id || !workspaceId) return false;
      const trimmed = text.trim();
      if (!trimmed && !file) return false;

      if (activeThread.kind === "group") {
        if (!activeThread.myPermissions.enviar_mensagens && !isExecutiveUser) {
          toast({
            title: "Permissão insuficiente",
            description: "Você possui acesso apenas de leitura neste grupo.",
            variant: "destructive",
          });
          return false;
        }
        if (file && !activeThread.myPermissions.enviar_documentos && !isExecutiveUser) {
          toast({
            title: "Envio de documentos restrito",
            description: "Seu perfil não tem permissão para anexar arquivos neste grupo.",
            variant: "destructive",
          });
          return false;
        }
      }

      if (file && file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        toast({
          title: "Arquivo muito grande",
          description: "O limite máximo por anexo é 12 MB.",
          variant: "destructive",
        });
        return false;
      }

      setSending(true);
      try {
        const convId = await ensureGroupConversationId(activeThread);
        let uploadedPath: string | null = null;
        let uploadedMime: string | null = null;
        let uploadedName: string | null = null;
        let base64Data: string | null = null;

        if (file) {
          const safeName = sanitizeFileName(file.name);
          const prefix =
            activeThread.kind === "group" && activeThread.grupo
              ? `groups/${workspaceId}/${activeThread.grupo.id}`
              : `${user.id}`;
          uploadedPath = `${prefix}/${Date.now()}_${safeName}`;
          uploadedMime = file.type || "application/octet-stream";
          uploadedName = file.name;

          const { error: uploadErr } = await supabase.storage
            .from("chat-attachments")
            .upload(uploadedPath, file, {
              contentType: uploadedMime,
              upsert: false,
            });
          if (uploadErr) throw uploadErr;

          base64Data = await fileToBase64(file);
        }

        // Em grupo sem menção à IA e sem documento fiscal/fechamento, envia mensagem humana direta
        const isGroup = activeThread.kind === "group";
        const isImage = Boolean(uploadedMime && uploadedMime.startsWith("image/"));
        const isDocument = Boolean(
          uploadedMime &&
            (uploadedMime.includes("pdf") || uploadedMime.includes("xml") || uploadedMime.includes("text")),
        );

        if (isGroup && !invokeAi && !file) {
          const { data, error } = await supabase.functions.invoke("wallet-ai-orchestrator", {
            body: {
              action: "send_group_message",
              workspace_id: workspaceId,
              conversation_id: convId,
              text: trimmed,
              sender_name: myDisplayName,
              sender_role: myRoleLabel,
              mirror_to_telegram: Boolean(mirrorToTelegram && activeThread.telegramLinked),
            },
          });
          if (error || data?.error) {
            throw new Error(data?.error || error?.message || "Erro ao enviar mensagem.");
          }
        } else if (
          file &&
          (isDocument ||
            (isImage &&
              activeThread.grupo?.tipo_grupo !== "fechamento" &&
              activeThread.grupo?.tipo_grupo !== "conversas_loja"))
        ) {
          const { data, error } = await supabase.functions.invoke("wallet-ai-orchestrator", {
            body: {
              action: "process_document",
              workspace_id: workspaceId,
              conversation_id: convId,
              base64: base64Data,
              mime_type: uploadedMime,
              file_name: uploadedName,
              text_context: trimmed || `Anexo enviado por ${myDisplayName}`,
              attachment_path: uploadedPath,
            },
          });
          if (error || data?.error) {
            throw new Error(data?.error || error?.message || "Erro ao processar documento.");
          }
        } else {
          const agentType = activeThread.kind === "private_ceo" ? "ceo" : "operational";
          const historyForModel = messages
            .slice(-12)
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              role: m.role,
              content: m.content || (m.attachment_name ? `[Anexo: ${m.attachment_name}]` : ""),
            }));

          const userPrompt =
            trimmed ||
            (uploadedName ? `Analisar anexo enviado: ${uploadedName}` : "Olá");

          const { data, error } = await supabase.functions.invoke("wallet-ai-orchestrator", {
            body: {
              workspace_id: workspaceId,
              conversation_id: convId,
              agent_type: agentType,
              channel: "web",
              sender_name: myDisplayName,
              sender_role: myRoleLabel,
              attachment_path: uploadedPath,
              attachment_mime: uploadedMime,
              attachment_name: uploadedName,
              image_base64: isImage ? base64Data : undefined,
              mirror_to_telegram: Boolean(
                isGroup && mirrorToTelegram && activeThread.telegramLinked,
              ),
              messages: [...historyForModel, { role: "user", content: userPrompt }],
            },
          });
          if (error || data?.error) {
            throw new Error(data?.error || error?.message || "Erro na resposta da IA.");
          }
        }

        setSelectedThreadId(convId);
        loadedThreadKeyRef.current = `${convId}:${convId}`;
        await Promise.all([
          loadWorkspaceContext(true),
          loadActiveThreadDetails(
            {
              ...activeThread,
              id: convId,
              conversation: activeThread.conversation
                ? { ...activeThread.conversation, id: convId }
                : ({ id: convId } as ConversaRecord),
            },
            { silent: true },
          ),
        ]);
        return true;
      } catch (err) {
        toast({
          title: "Falha ao enviar mensagem",
          description: err instanceof Error ? err.message : "Erro inesperado ao enviar.",
          variant: "destructive",
        });
        return false;
      } finally {
        setSending(false);
      }
    },
    [
      activeThread,
      ensureGroupConversationId,
      isExecutiveUser,
      loadActiveThreadDetails,
      loadWorkspaceContext,
      messages,
      myDisplayName,
      myRoleLabel,
      toast,
      user?.id,
      workspaceId,
    ],
  );

  const confirmOrCancelProposal = useCallback(
    async (proposalId: string, decision: "confirm" | "cancel") => {
      if (!workspaceId) return false;
      setConfirmingProposalId(proposalId);
      try {
        const { data, error } = await supabase.functions.invoke("wallet-ai-orchestrator", {
          body: {
            action: decision === "confirm" ? "confirm_proposal" : "cancel_proposal",
            workspace_id: workspaceId,
            conversation_id: activeThread?.conversation?.id || undefined,
            proposal_id: proposalId,
          },
        });
        if (error || data?.error) {
          throw new Error(
            data?.error || error?.message || "Não foi possível processar a confirmação.",
          );
        }

        toast({
          title:
            decision === "confirm"
              ? "Operação confirmada e registrada"
              : "Proposta cancelada",
          description:
            decision === "confirm"
              ? "A ação proposta foi validada na auditoria do Wallet."
              : "A proposta pendente foi descartada com segurança.",
        });

        await Promise.all([
          loadWorkspaceContext(true),
          loadActiveThreadDetails(activeThreadRef.current, { silent: true }),
        ]);
        return true;
      } catch (err) {
        toast({
          title: "Falha na confirmação",
          description: err instanceof Error ? err.message : "Erro ao processar proposta.",
          variant: "destructive",
        });
        return false;
      } finally {
        setConfirmingProposalId(null);
      }
    },
    [activeThread, loadActiveThreadDetails, loadWorkspaceContext, toast, workspaceId],
  );

  const provisionDefaultGroups = useCallback(async () => {
    if (!workspaceId) return false;
    setProvisioning(true);
    try {
      const { data, error } = await supabase.functions.invoke("wallet-ai-orchestrator", {
        body: {
          action: "provision_default_groups",
          workspace_id: workspaceId,
        },
      });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Erro ao provisionar grupos padrão.");
      }

      toast({
        title: "Grupos operacionais verificados",
        description:
          Number(data?.created_count || 0) > 0
            ? `${data.created_count} grupo(s) operacional(is) criado(s) e sincronizado(s).`
            : "Os 4 grupos operacionais padrão já estão ativos neste workspace.",
      });
      await loadWorkspaceContext();
      return true;
    } catch (err) {
      toast({
        title: "Erro ao provisionar grupos",
        description: err instanceof Error ? err.message : "Erro inesperado.",
        variant: "destructive",
      });
      return false;
    } finally {
      setProvisioning(false);
    }
  }, [loadWorkspaceContext, toast, workspaceId]);

  const upsertGroup = useCallback(
    async (input: UpsertGroupInput): Promise<GrupoConfig | null> => {
      if (!workspaceId || !user?.id) return null;
      const parsedChatId =
        input.chat_id && input.chat_id.trim() !== "" ? Number(input.chat_id.trim()) : null;
      if (parsedChatId !== null && !Number.isFinite(parsedChatId)) {
        toast({
          title: "Chat ID inválido",
          description: "Informe um número inteiro válido do grupo Telegram (ex: -1001234567890) ou deixe em branco.",
          variant: "destructive",
        });
        return null;
      }

      const meta = GROUP_TYPE_META[input.tipo_grupo];
      const payload = {
        workspace_id: workspaceId,
        nome_grupo: input.nome_grupo.trim() || meta.label,
        descricao: input.descricao?.trim() || meta.securityNote,
        tipo_grupo: input.tipo_grupo,
        chat_id: parsedChatId,
        ativo: input.ativo,
        ferramentas_permitidas:
          input.ferramentas_permitidas && input.ferramentas_permitidas.length > 0
            ? input.ferramentas_permitidas
            : meta.defaultCapabilities.map((c) => c.id),
        dados_permitidos: input.dados_permitidos || [],
        acoes_permitidas: input.acoes_permitidas || [],
        funcionalidades_autorizadas:
          input.funcionalidades_autorizadas && input.funcionalidades_autorizadas.length > 0
            ? input.funcionalidades_autorizadas
            : meta.defaultCapabilities.map((c) => c.id),
        updated_at: new Date().toISOString(),
      };

      try {
        let saved: GrupoConfig | null = null;
        if (input.id) {
          const { data, error } = await supabase
            .from("telegram_grupos_config" as never)
            .update(payload as never)
            .eq("id", input.id)
            .eq("workspace_id", workspaceId)
            .select("*")
            .single();
          if (error) throw error;
          saved = data as GrupoConfig;
        } else {
          const { data, error } = await supabase
            .from("telegram_grupos_config" as never)
            .insert({ ...payload, created_by: user.id } as never)
            .select("*")
            .single();
          if (error) throw error;
          saved = data as GrupoConfig;

          if (saved?.id) {
            await supabase.from("grupo_participantes" as never).upsert(
              {
                grupo_id: saved.id,
                workspace_id: workspaceId,
                user_id: user.id,
                role_no_grupo: "admin_grupo",
                permissoes: DEFAULT_FULL_PERMS,
                ativo: true,
                autorizado_por: user.id,
              } as never,
              { onConflict: "grupo_id,user_id" },
            );

            await supabase.from("wallet_ai_conversations").insert({
              workspace_id: workspaceId,
              user_id: user.id,
              grupo_id: saved.id,
              title: saved.nome_grupo || meta.label,
              agent_type: "operational",
              is_shared: true,
              is_group: true,
              is_archived: false,
              channel: saved.chat_id ? "telegram" : "web",
              last_channel: "web",
              external_chat_id: saved.chat_id ? String(saved.chat_id) : null,
              processing_status: "idle",
            } as never);
          }
        }

        toast({
          title: input.id ? "Grupo atualizado" : "Grupo operacional criado",
          description: `"${saved?.nome_grupo || input.nome_grupo}" salvo com políticas de acesso ativas.`,
        });
        await loadWorkspaceContext();
        return saved;
      } catch (err) {
        toast({
          title: "Erro ao salvar grupo",
          description: err instanceof Error ? err.message : "Erro ao persistir grupo.",
          variant: "destructive",
        });
        return null;
      }
    },
    [loadWorkspaceContext, toast, user?.id, workspaceId],
  );

  const upsertParticipant = useCallback(
    async (input: UpsertParticipantInput): Promise<boolean> => {
      if (!workspaceId || !user?.id) return false;

      const targetGroup = grupos.find((g) => g.id === input.grupo_id);
      const targetMember = workspaceMembers.find((m) => m.user_id === input.user_id);
      if (
        targetGroup?.tipo_grupo === "contas_empresa" &&
        !targetMember?.is_owner &&
        targetMember?.role !== "admin"
      ) {
        toast({
          title: "Bloqueio de segurança",
          description:
            "O grupo Contas da Empresa aceita apenas o proprietário ou administradores autorizados.",
          variant: "destructive",
        });
        return false;
      }

      try {
        const { error } = await supabase.from("grupo_participantes" as never).upsert(
          {
            grupo_id: input.grupo_id,
            workspace_id: workspaceId,
            user_id: input.user_id,
            role_no_grupo: input.role_no_grupo,
            permissoes: input.permissoes,
            ativo: input.ativo,
            autorizado_por: user.id,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "grupo_id,user_id" },
        );
        if (error) throw error;

        toast({
          title: "Participante atualizado",
          description: "As permissões do participante neste grupo foram atualizadas.",
        });
        await loadWorkspaceContext();
        return true;
      } catch (err) {
        toast({
          title: "Erro ao atualizar participante",
          description:
            err instanceof Error
              ? err.message
              : "Não foi possível salvar o participante.",
          variant: "destructive",
        });
        return false;
      }
    },
    [grupos, loadWorkspaceContext, toast, user?.id, workspaceId, workspaceMembers],
  );

  const removeParticipant = useCallback(
    async (grupoId: string, targetUserId: string): Promise<boolean> => {
      if (!workspaceId) return false;
      try {
        const { error } = await supabase
          .from("grupo_participantes" as never)
          .delete()
          .eq("grupo_id", grupoId)
          .eq("user_id", targetUserId)
          .eq("workspace_id", workspaceId);
        if (error) throw error;

        toast({
          title: "Acesso revogado",
          description: "O usuário foi removido deste grupo operacional.",
        });
        await loadWorkspaceContext();
        return true;
      } catch (err) {
        toast({
          title: "Erro ao remover participante",
          description: err instanceof Error ? err.message : "Não foi possível remover.",
          variant: "destructive",
        });
        return false;
      }
    },
    [loadWorkspaceContext, toast, workspaceId],
  );

  const activeParticipants = useMemo(() => {
    if (!activeThread?.grupo) return [];
    return participantes.filter(
      (p) => p.grupo_id === activeThread.grupo!.id && p.ativo,
    );
  }, [activeThread?.grupo, participantes]);

  return {
    workspaceId,
    activeWorkspace,
    currentUserId: user?.id ?? null,
    isOwner,
    isExecutiveUser,
    loadingThreads,
    loadingMessages,
    sending,
    provisioning,
    confirmingProposalId,
    grupos,
    participantes,
    workspaceMembers,
    threads,
    selectedThreadId,
    setSelectedThreadId,
    activeThread,
    activeParticipants,
    messages,
    attachments,
    proposals,
    fechamentos,
    refresh: () => loadWorkspaceContext(false),
    refreshThread: () => loadActiveThreadDetails(activeThreadRef.current),
    resolveAttachmentSignedUrl,
    sendMessage,
    confirmOrCancelProposal,
    provisionDefaultGroups,
    upsertGroup,
    upsertParticipant,
    removeParticipant,
  };
}
