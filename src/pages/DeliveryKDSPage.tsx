import React from 'react';
import { DashboardLayout } from '@/shared/components/layouts/DashboardLayout';
import { KDSOrderBoard } from '@/domains/delivery/components/KDSOrderBoard';
import { DeliveryRoleGuard } from '@/domains/delivery/DeliveryRoleGuard';
import { Badge } from '@/shared/components/ui/badge';
import { ChefHat, MonitorCheck, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/shared/components/ui/button';

export const DeliveryKDSPage: React.FC = () => {
  return (
    <DeliveryRoleGuard>
      <DashboardLayout>
        <div className="space-y-4 pb-12">
          {/* Cabeçalho Operacional KDS */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-3">
              <Link to="/delivery">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Voltar para Central Delivery">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <ChefHat className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black tracking-tight text-foreground">
                    Central KDS — Cozinha & Expedição Rodo Point
                  </h1>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[10px] font-bold">
                    Ao Vivo
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Painel de pedidos em tempo real otimizado para Mac, tablets e dispositivos Android.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 bg-muted px-2.5 py-1 rounded-md font-medium">
                <MonitorCheck className="h-3.5 w-3.5 text-primary" />
                Terminal Operacional Seguro
              </span>
            </div>
          </div>

          {/* Tabuleiro KDS Principal */}
          <KDSOrderBoard />
        </div>
      </DashboardLayout>
    </DeliveryRoleGuard>
  );
};

export default DeliveryKDSPage;
