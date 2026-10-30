import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  Sparkles,
  ArrowRight,
  Target,
  DollarSign,
  Package,
} from 'lucide-react';
import { GrowthOpportunity } from '../types';

interface OpportunityCardProps {
  opportunity: GrowthOpportunity;
  onActivateExperiment?: (opportunity: GrowthOpportunity) => void;
}

export const OpportunityCard: React.FC<OpportunityCardProps> = ({
  opportunity,
  onActivateExperiment,
}) => {
  const getOpportunityIcon = () => {
    switch (opportunity.type) {
      case 'combo':
        return <Package className="h-4 w-4 text-primary" />;
      case 'pricing':
        return <DollarSign className="h-4 w-4 text-emerald-600" />;
      case 'schedule':
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'packaging':
        return <Package className="h-4 w-4 text-purple-500" />;
      case 'waste_reduction':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Sparkles className="h-4 w-4 text-primary" />;
    }
  };

  const getImpactBadge = () => {
    switch (opportunity.impact_level) {
      case 'high':
        return <Badge className="bg-red-500 text-white font-bold">Alto Impacto</Badge>;
      case 'medium':
        return <Badge className="bg-amber-500 text-stone-900 font-bold">Médio Impacto</Badge>;
      case 'low':
        return <Badge variant="secondary">Baixo Impacto</Badge>;
    }
  };

  return (
    <Card className="border border-border shadow-sm hover:shadow transition-shadow">
      <CardHeader className="p-4 pb-2 bg-muted/20 border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {getOpportunityIcon()}
            <CardTitle className="text-sm font-bold truncate">
              {opportunity.title}
            </CardTitle>
          </div>
          {getImpactBadge()}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {opportunity.description}
        </p>

        <div className="p-2.5 rounded bg-secondary/50 border text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              Retorno Estimado:
            </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              + R$ {opportunity.potential_monthly_gain.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Facilidade de Execução:</span>
            <span className="font-semibold capitalize text-foreground">
              {opportunity.effort_level === 'easy' ? 'Fácil (1-2 dias)' : opportunity.effort_level === 'moderate' ? 'Moderada (1 semana)' : 'Complexa'}
            </span>
          </div>
        </div>

        {opportunity.status === 'detected' && onActivateExperiment && (
          <Button
            size="sm"
            onClick={() => onActivateExperiment(opportunity)}
            className="w-full h-8 text-xs font-semibold flex items-center justify-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Target className="h-3.5 w-3.5" />
            Transformar em Experimento
            <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
