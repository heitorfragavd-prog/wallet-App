import React from "react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Phone,
  Mail,
  CalendarClock,
  Pencil,
  Trash2,
  Receipt,
  QrCode,
  Tag,
  DollarSign,
  Clock,
} from "lucide-react";
import { useFornecedorFinanceiro } from "@/domains/finance/hooks/useFornecedorFinanceiro";
import { useCategorias } from "@/domains/finance/hooks/useCategorias";
import type { Contato } from "@/domains/finance/hooks/useContatos";

interface FornecedorCardProps {
  fornecedor: Contato;
  onEditar: (fornecedor: Contato) => void;
  onExcluir: (id: string) => void;
  onAbrirFicha: (fornecedor: Contato) => void;
}

export const FornecedorCard: React.FC<FornecedorCardProps> = ({
  fornecedor,
  onEditar,
  onExcluir,
  onAbrirFicha,
}) => {
  const { categorias } = useCategorias();
  const categoriaPadrao = categorias.find((c) => c.id === fornecedor.categoria_padrao_id);

  const hoje = new Date();
  const { data: financeiro } = useFornecedorFinanceiro({
    fornecedorId: fornecedor.id,
    fornecedorNome: fornecedor.nome,
    fornecedorCnpjCpf: fornecedor.cnpj_cpf,
    ano: hoje.getFullYear(),
    mes: hoje.getMonth() + 1,
  });

  return (
    <Card className={`border transition-shadow hover:shadow-md ${!fornecedor.ativo ? "opacity-75 bg-muted/20" : "bg-card"}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header do Card */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-semibold text-foreground text-sm line-clamp-1">{fornecedor.nome}</h3>
              {fornecedor.ativo === false && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground px-1.5 py-0">
                  Inativo
                </Badge>
              )}
            </div>
            {fornecedor.nome_fantasia && (
              <p className="text-xs text-muted-foreground line-clamp-1">{fornecedor.nome_fantasia}</p>
            )}
            {fornecedor.cnpj_cpf && (
              <p className="text-[11px] font-mono text-muted-foreground">{fornecedor.cnpj_cpf}</p>
            )}
          </div>

          {categoriaPadrao && (
            <Badge
              variant="outline"
              style={{
                borderColor: categoriaPadrao.cor ? `${categoriaPadrao.cor}40` : undefined,
                color: categoriaPadrao.cor || undefined,
                backgroundColor: categoriaPadrao.cor ? `${categoriaPadrao.cor}10` : undefined,
              }}
              className="text-[10px] whitespace-nowrap shrink-0 flex items-center gap-1"
            >
              <Tag className="h-2.5 w-2.5" />
              {categoriaPadrao.nome}
            </Badge>
          )}
        </div>

        {/* Informações de Contato & Pix */}
        <div className="space-y-1 text-xs text-muted-foreground pt-1 border-t border-border/40">
          {fornecedor.pix_chave ? (
            <div className="flex items-center gap-1.5 text-sky-400 font-mono text-[11px] font-medium">
              <QrCode className="h-3 w-3 shrink-0" />
              <span className="truncate">Pix ({fornecedor.pix_tipo?.toUpperCase() || "CHAVE"}): {fornecedor.pix_chave}</span>
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground/80 italic">Sem chave Pix cadastrada</div>
          )}

          {fornecedor.telefone && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 shrink-0" />
              <span>{fornecedor.telefone}</span>
            </div>
          )}

          {fornecedor.email && (
            <div className="flex items-center gap-1.5 truncate">
              <Mail className="h-3 w-3 shrink-0" />
              <span className="truncate">{fornecedor.email}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px]">
            <CalendarClock className="h-3 w-3 shrink-0" />
            <span>Prazo: {fornecedor.prazo_pagamento_dias ?? 30} dias</span>
          </div>
        </div>

        {/* Resumo Financeiro Rápido do Mês Atual */}
        <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-[10px] text-muted-foreground block flex items-center gap-0.5">
              <DollarSign className="h-2.5 w-2.5 text-emerald-400" /> Pago este mês:
            </span>
            <span className="font-semibold text-foreground text-xs">
              R$ {(financeiro?.totalPagoNoMes ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-muted-foreground block flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5 text-amber-400" /> Em aberto:
            </span>
            <span className={`font-semibold text-xs ${financeiro && financeiro.totalVencido > 0 ? "text-destructive" : "text-foreground"}`}>
              R$ {(financeiro?.totalPendente ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center justify-between pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAbrirFicha(fornecedor)}
            className="h-7 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
          >
            <Receipt className="h-3.5 w-3.5" />
            Ficha Financeira
          </Button>

          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEditar(fornecedor)}>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onExcluir(fornecedor.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
