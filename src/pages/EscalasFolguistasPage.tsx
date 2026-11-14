import React, { useState } from "react";
import {
  Calendar,
  CalendarDays,
  History,
  Settings,
  Sparkles,
  Users,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { DashboardLayout } from "@/shared/components/layouts/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { useEscalasFolguistas } from "@/domains/escalas/hooks/useEscalasFolguistas";
import { ProximoFimDeSemanaTab } from "@/domains/escalas/components/tabs/ProximoFimDeSemanaTab";
import { CalendarioTab } from "@/domains/escalas/components/tabs/CalendarioTab";
import { FolguistasTab } from "@/domains/escalas/components/tabs/FolguistasTab";
import { DisponibilidadesTab } from "@/domains/escalas/components/tabs/DisponibilidadesTab";
import { HistoricoTab } from "@/domains/escalas/components/tabs/HistoricoTab";
import { ConfiguracoesTab } from "@/domains/escalas/components/tabs/ConfiguracoesTab";

export default function EscalasFolguistasPage() {
  const [activeTab, setActiveTab] = useState<string>("proximo-fim-de-semana");

  const {
    colaboradores,
    folguistasAtivos,
    config,
    disponibilidades,
    escalas,
    selectedWeekendDate,
    isGenerating,
    generatedPreview,
    setGeneratedPreview,
    loading,
    generateSchedule,
    saveSchedule,
    isSavingSchedule,
    updateDisponibilidade,
    saveConfig,
    isSavingConfig,
    refetchAll,
  } = useEscalasFolguistas();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header Principal */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                Escalas Inteligentes & Folguistas
              </h1>
              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30 gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" />
                Etapa 3
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Rodo Point: gestão de turnos, disponibilidades semanais, rodízio de folguistas e validação de descanso (11h).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={refetchAll}
              disabled={loading}
              className="text-xs h-8 gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Abas de Navegação */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-2 sm:grid-cols-6 h-auto p-1 bg-muted/60">
            <TabsTrigger value="proximo-fim-de-semana" className="text-xs py-2 gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>Próximo FDS</span>
            </TabsTrigger>
            <TabsTrigger value="calendario" className="text-xs py-2 gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Calendário</span>
            </TabsTrigger>
            <TabsTrigger value="folguistas" className="text-xs py-2 gap-1.5">
              <Users className="w-3.5 h-3.5" />
              <span>Folguistas ({folguistasAtivos.length})</span>
            </TabsTrigger>
            <TabsTrigger value="disponibilidades" className="text-xs py-2 gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Disponibilidades</span>
            </TabsTrigger>
            <TabsTrigger value="historico" className="text-xs py-2 gap-1.5">
              <History className="w-3.5 h-3.5" />
              <span>Histórico</span>
            </TabsTrigger>
            <TabsTrigger value="configuracoes" className="text-xs py-2 gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              <span>Configurações</span>
            </TabsTrigger>
          </TabsList>

          {/* Conteúdo das Abas */}
          <TabsContent value="proximo-fim-de-semana" className="space-y-4">
            <ProximoFimDeSemanaTab
              selectedWeekend={selectedWeekendDate}
              slots={escalas}
              generatedPreview={generatedPreview}
              isGenerating={isGenerating}
              isSaving={isSavingSchedule}
              onGenerate={generateSchedule}
              onSave={saveSchedule}
              onDiscardPreview={() => setGeneratedPreview(null)}
            />
          </TabsContent>

          <TabsContent value="calendario" className="space-y-4">
            <CalendarioTab slots={escalas} colaboradores={colaboradores} />
          </TabsContent>

          <TabsContent value="folguistas" className="space-y-4">
            <FolguistasTab colaboradores={colaboradores} />
          </TabsContent>

          <TabsContent value="disponibilidades" className="space-y-4">
            <DisponibilidadesTab
              selectedWeekend={selectedWeekendDate}
              folguistas={folguistasAtivos}
              disponibilidades={disponibilidades}
              onToggleDisponibilidade={updateDisponibilidade}
            />
          </TabsContent>

          <TabsContent value="historico" className="space-y-4">
            <HistoricoTab slots={escalas} />
          </TabsContent>

          <TabsContent value="configuracoes" className="space-y-4">
            <ConfiguracoesTab
              config={config}
              isSaving={isSavingConfig}
              onSaveConfig={saveConfig}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
