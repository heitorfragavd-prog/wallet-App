import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  FlaskConical,
  CheckCircle2,
  Clock,
  Ban,
  Calendar,
  Target,
} from 'lucide-react';
import { CommercialExperiment } from '../types';

interface GrowthExperimentCardProps {
  experiment: CommercialExperiment;
  onUpdateStatus?: (experimentId: string, status: CommercialExperiment['status']) => void;
}

export const GrowthExperimentCard: React.FC<GrowthExperimentCardProps> = ({
  experiment,
  onUpdateStatus,
}) => {
  const getStatusBadge = () => {
    switch (experiment.status) {
      case 'active':
        return (
          <Badge className="bg-emerald-600 text-white font-bold flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            Em Andamento
          </Badge>
        );
      case 'planned':
        return (
          <Badge variant="outline" className="text-amber-600 border-amber-400 font-semibold flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Planejado
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Concluído
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge variant="outline" className="text-muted-foreground flex items-center gap-1">
            <Ban className="h-3 w-3" />
            Cancelado
          </Badge>
        );
    }
  };

  const getDepartmentName = () => {
    switch (experiment.department) {
      case 'commercial_growth':
        return 'Comercial & Vendas';
      case 'cmv_pricing':
        return 'CMV & Precificação';
      case 'loss_waste':
        return 'Perdas & Desperdício';
      case 'delivery_channels':
        return 'Delivery & Plataformas';
      case 'staff_productivity':
        return 'Equipe & Operação';
      case 'finance_margins':
        return 'Financeiro & Caixa';
    }
  };

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="p-4 pb-2 bg-muted/20 border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {getDepartmentName()}
            </span>
          </div>
          {getStatusBadge()}
        </div>
        <CardTitle className="text-sm font-bold pt-1">
          {experiment.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {/* Hipótese */}
        <div className="text-xs text-muted-foreground">
          <strong className="text-foreground">Hipótese:</strong> {experiment.hypothesis}
        </div>

        {/* Métrica Alvo e Baseline */}
        <div className="p-2.5 rounded bg-secondary/50 border text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Target className="h-3.5 w-3.5 text-primary" />
              Métrica Monitorada:
            </span>
            <span className="font-semibold text-foreground">{experiment.target_kpi}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-border/50">
            <div>
              <span className="text-[10px] text-muted-foreground block">Inicial</span>
              <span className="font-bold text-foreground">
                {experiment.baseline_value !== undefined ? experiment.baseline_value : '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Atual</span>
              <span className="font-bold text-primary">
                {experiment.current_value !== undefined ? experiment.current_value : '—'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground block">Meta</span>
              <span className="font-bold text-emerald-600">
                {experiment.target_value !== undefined ? experiment.target_value : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Período */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Início: {new Date(experiment.start_date).toLocaleDateString('pt-BR')}
          </span>
          {experiment.end_date && (
            <span>Término: {new Date(experiment.end_date).toLocaleDateString('pt-BR')}</span>
          )}
        </div>

        {/* Ações de Status */}
        {experiment.status === 'active' && onUpdateStatus && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdateStatus(experiment.id, 'completed')}
              className="flex-1 h-7 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
            >
              Concluir com Sucesso
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onUpdateStatus(experiment.id, 'cancelled')}
              className="h-7 text-xs text-muted-foreground"
            >
              Pausar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
