import React from "react";
import type { ActionProposal } from "../../../../supabase/functions/_shared/ai/action-types";

export interface AgentActionProposalCardProps {
  proposal: ActionProposal;
  onConfirm: (proposalId: string) => void | Promise<void>;
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

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-primary/20 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Ação Proposta pelo Assistente
          </span>
        </div>
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

      <div className="py-3">
        <p className="font-semibold text-sm text-foreground">{proposal.summary}</p>
        <div className="mt-2 rounded-lg bg-muted/40 p-2.5 text-xs">
          <p className="font-medium text-muted-foreground mb-1">Detalhes da Operação:</p>
          <pre className="overflow-x-auto text-[11px] font-mono text-foreground/80">
            {JSON.stringify(proposal.payload, null, 2)}
          </pre>
        </div>
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
            onClick={() => onConfirm(proposal.id)}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-sm"
          >
            {isProcessing ? "Confirmando..." : "Confirmar Operação"}
          </button>
        </div>
      )}
    </div>
  );
};
