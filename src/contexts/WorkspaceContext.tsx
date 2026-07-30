import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/domains/auth/hooks/useAuth";

export interface Workspace {
  id: string;
  user_id: string;
  nome: string;
  tipo: "PF" | "PJ";
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (workspace: Workspace) => void;
  loading: boolean;
  createWorkspace: (nome: string, tipo: "PF" | "PJ") => Promise<Workspace | null>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const WORKSPACE_STORAGE_KEY = "wallet_active_workspace_id";

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setActiveWorkspaceState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("workspaces")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Erro ao buscar workspaces:", error);
        setLoading(false);
        return;
      }

      let loadedWorkspaces: Workspace[] = data || [];

      // Se por algum motivo o usuário não tiver workspaces ainda (ex: cadastrado antes da migration), cria PF e PJ
      if (loadedWorkspaces.length === 0) {
        const { data: createdPF } = await supabase
          .from("workspaces")
          .insert({ user_id: user.id, nome: "Minha Conta Pessoal", tipo: "PF", is_default: true })
          .select()
          .single();

        const { data: createdPJ } = await supabase
          .from("workspaces")
          .insert({ user_id: user.id, nome: "Conta Rodo Point", tipo: "PJ", is_default: false })
          .select();

        if (createdPF) {
          loadedWorkspaces = [createdPF as Workspace, ...(createdPJ ? (createdPJ as Workspace[]) : [])];
        }
      }

      setWorkspaces(loadedWorkspaces);

      // Tenta recuperar workspace salvo no localStorage
      const savedWorkspaceId = localStorage.getItem(`${WORKSPACE_STORAGE_KEY}_${user.id}`);
      const savedWorkspace = loadedWorkspaces.find((w) => w.id === savedWorkspaceId);

      if (savedWorkspace) {
        setActiveWorkspaceState(savedWorkspace);
      } else {
        // Fallback: workspace default ou o primeiro PF
        const defaultWorkspace =
          loadedWorkspaces.find((w) => w.is_default) ||
          loadedWorkspaces.find((w) => w.tipo === "PF") ||
          loadedWorkspaces[0] ||
          null;

        setActiveWorkspaceState(defaultWorkspace);
        if (defaultWorkspace) {
          localStorage.setItem(`${WORKSPACE_STORAGE_KEY}_${user.id}`, defaultWorkspace.id);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar workspaces:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const setActiveWorkspace = (workspace: Workspace) => {
    setActiveWorkspaceState(workspace);
    if (user) {
      localStorage.setItem(`${WORKSPACE_STORAGE_KEY}_${user.id}`, workspace.id);
    }
  };

  const createWorkspace = async (nome: string, tipo: "PF" | "PJ"): Promise<Workspace | null> => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from("workspaces")
        .insert({
          user_id: user.id,
          nome,
          tipo,
          is_default: false,
        })
        .select()
        .single();

      if (error) {
        console.error("Erro ao criar workspace:", error);
        return null;
      }

      const newWs = data as Workspace;
      setWorkspaces((prev) => [...prev, newWs]);
      setActiveWorkspace(newWs);
      return newWs;
    } catch (err) {
      console.error("Exceção ao criar workspace:", err);
      return null;
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        activeWorkspace,
        setActiveWorkspace,
        loading,
        createWorkspace,
        refreshWorkspaces: fetchWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    return {
      workspaces: [],
      activeWorkspace: null,
      setActiveWorkspace: () => {},
      loading: false,
      createWorkspace: async () => null,
      refreshWorkspaces: async () => {},
    };
  }
  return context;
};
