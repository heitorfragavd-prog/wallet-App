import React, { useState } from "react";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types";
import { Edit3, Sparkles } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";

export interface AgentActionProposalCardProps {
  proposal: ActionProposal;
  onConfirm: (proposalId: string, updatedPayload?: Record<string, unknown>) => void | Promise<void>;
  onCancel: (proposalId: string) => void | Promise<void>;
  isProcessing?: boolean;
}

export const AgentActionProposalCard: React.FC<AgentActionProposalCardProps> = ({
  proposal,
  onConfirm,
  onCancel,
  isProcessing = false,
}) => {
  const isPending = proposal.status === "prepared";
  const [isEditing, setIsEditing] = useState(false);
  const [editablePayload, setEditablePayload] = useState<Record<string, unknown>>({
    ...proposal.payload,
  });

  const handleFieldChange = (key: string, value: unknown) => {
    setEditablePayload((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleConfirmAction = () => {
    if (isEditing) {
      onConfirm(proposal.id, editablePayload);
    } else {
      onConfirm(proposal.id);
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-primary/20 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-amber-400" />
            Ação Proposta pelo Assistente
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isPending && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-background"
            >
              <Edit3 className="h-3 w-3" /> Editar
            </button>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              proposal.status === "executed"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                : proposal.status === "cancelled"
                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
            }`}
          >
            {proposal.status === "prepared"
              ? "Aguardando Confirmação"
              : proposal.status === "executed"
              ? "Executado"
              : proposal.status === "cancelled"
              ? "Cancelado"
              : proposal.status}
          </span>
        </div>
      </div>

      <div className="py-3">
        <p className="font-semibold text-sm text-foreground">{proposal.summary}</p>

        {isEditing ? (
          <div className="mt-3 space-y-2 rounded-lg bg-muted/30 p-3 border border-border/60">
            <p className="text-xs font-semibold text-primary">Editar Campos da Proposta:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {Object.entries(editablePayload).map(([key, val]) => {
                if (typeof val === "object" && val !== null) return null;
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-muted-foreground capitalize">
                      {key.replace(/_/g, " ")}:
                    </label>
                    <Input
                      value={String(val ?? "")}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditablePayload({ ...proposal.payload });
                  setIsEditing(false);
                }}
                className="h-7 text-xs"
              >
                Descartar Edições
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 rounded-lg bg-muted/40 p-2.5 text-xs">
            <p className="font-medium text-muted-foreground mb-1">Detalhes da Operação:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
              {Object.entries(proposal.payload).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="text-muted-foreground font-mono">{k}:</span>
                  <span className="font-semibold text-foreground">
                    {typeof v === "number" && k.toLowerCase().includes("valor")
                      ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {isPending && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => onCancel(proposal.id)}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleConfirmAction}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
          >
            {isProcessing
              ? "Confirmando..."
              : isEditing
              ? "Salvar & Confirmar Operação"
              : "Confirmar Operação"}
          </button>
        </div>
      )}
    </div>
  );
};

export default AgentActionProposalCard;
