import React, { useState } from "react";
import { Settings, Save, Clock, DollarSign, Bell } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import type { EscalasConfig } from "../../types";

interface ConfiguracoesTabProps {
  config: EscalasConfig | undefined;
  isSaving: boolean;
  onSaveConfig: (newConfig: Partial<EscalasConfig>) => void;
}

export const ConfiguracoesTab: React.FC<ConfiguracoesTabProps> = ({
  config,
  isSaving,
  onSaveConfig,
}) => {
  const [minDescanso, setMinDescanso] = useState(config?.min_horas_descanso ?? 11);
  const [valorDiaria, setValorDiaria] = useState(config?.valor_diaria_padrao ?? 100);
  const [valorMeta, setValorMeta] = useState(config?.valor_meta_padrao ?? 20);
  const [simulacaoModo, setSimulacaoModo] = useState(config?.simulacao_modo ?? false);
  const [notifSegunda, setNotifSegunda] = useState(config?.notificacao_segunda_horario ?? "09:00");
  const [notifSexta, setNotifSexta] = useState(config?.notificacao_sexta_horario ?? "14:00");
  const [ativoSegunda, setAtivoSegunda] = useState(config?.ativo_segunda ?? true);
  const [ativoSexta, setAtivoSexta] = useState(config?.ativo_sexta ?? true);
  const [limiteTentativas, setLimiteTentativas] = useState(config?.limite_tentativas ?? 3);
  const [canalPreferencial, setCanalPreferencial] = useState<"telegram" | "whatsapp_manual" | "web">(
    config?.canal_preferencial ?? "telegram"
  );

  const handleSave = () => {
    onSaveConfig({
      min_horas_descanso: Number(minDescanso),
      valor_diaria_padrao: Number(valorDiaria),
      valor_meta_padrao: Number(valorMeta),
      simulacao_modo: simulacaoModo,
      notificacao_segunda_horario: notifSegunda,
      notificacao_sexta_horario: notifSexta,
      ativo_segunda: ativoSegunda,
      ativo_sexta: ativoSexta,
      limite_tentativas: Number(limiteTentativas),
      canal_preferencial: canalPreferencial,
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between p-4 rounded-xl border bg-card/60">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-sm font-bold">Configurações Operacionais de Escala</h3>
            <p className="text-xs text-muted-foreground">
              Regras legais de descanso, remuneração padrão e cronogramas de mensagens automáticas.
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className="text-xs h-8 gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Descanso & CLT */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Regras de Descanso (CLT)
            </CardTitle>
            <CardDescription className="text-xs">
              Intervalo mínimo obrigatório entre jornadas consecutivas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="min-descanso" className="text-xs">
                Mínimo de Horas de Descanso (Interjornada)
              </Label>
              <Input
                id="min-descanso"
                type="number"
                value={minDescanso}
                onChange={(e) => setMinDescanso(Number(e.target.value))}
                min={8}
                max={24}
                className="h-9 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Padrão CLT: 11 horas. O motor rejeita qualquer combinação inferior a esse valor.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Remuneração */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Valores e Metas Padrão
            </CardTitle>
            <CardDescription className="text-xs">
              Valores atribuídos por turno na ausência de negociação específica.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="valor-diaria" className="text-xs">
                Valor Diária Padrão (R$)
              </Label>
              <Input
                id="valor-diaria"
                type="number"
                value={valorDiaria}
                onChange={(e) => setValorDiaria(Number(e.target.value))}
                min={0}
                className="h-9 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valor-meta" className="text-xs">
                Bônus Meta do Dia (R$)
              </Label>
              <Input
                id="valor-meta"
                type="number"
                value={valorMeta}
                onChange={(e) => setValorMeta(Number(e.target.value))}
                min={0}
                className="h-9 text-xs font-mono"
              />
            </div>
          </CardContent>
        </Card>

        {/* Cronograma Notificações */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              Automações & Horários de Disparo
            </CardTitle>
            <CardDescription className="text-xs">
              Disparos automáticos no grupo de folguistas (Fuso São Paulo).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 p-3 rounded-lg border border-border/40 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold">Consulta de Segunda-feira</span>
                  <p className="text-[10px] text-muted-foreground">Pergunta disponibilidade para o fim de semana</p>
                </div>
                <Switch checked={ativoSegunda} onCheckedChange={setAtivoSegunda} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notif-segunda" className="text-xs">
                  Horário de Envio (Segunda)
                </Label>
                <Input
                  id="notif-segunda"
                  type="time"
                  value={notifSegunda}
                  onChange={(e) => setNotifSegunda(e.target.value)}
                  disabled={!ativoSegunda}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-3 p-3 rounded-lg border border-border/40 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold">Reconfirmação de Sexta-feira</span>
                  <p className="text-[10px] text-muted-foreground">Reconfirma presença dos escalados</p>
                </div>
                <Switch checked={ativoSexta} onCheckedChange={setAtivoSexta} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="notif-sexta" className="text-xs">
                  Horário de Envio (Sexta)
                </Label>
                <Input
                  id="notif-sexta"
                  type="time"
                  value={notifSexta}
                  onChange={(e) => setNotifSexta(e.target.value)}
                  disabled={!ativoSexta}
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="canal-preferencial" className="text-xs">
                Canal de Comunicação
              </Label>
              <select
                id="canal-preferencial"
                value={canalPreferencial}
                onChange={(e) => setCanalPreferencial(e.target.value as "telegram" | "whatsapp_manual" | "web")}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="telegram">Telegram (Bot Oficial Wallet)</option>
                <option value="whatsapp_manual">WhatsApp (Operação Assistida / Manual)</option>
                <option value="web">Painel Web (Central de Conversas)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="limite-tentativas" className="text-xs">
                Limite de Tentativas de Reenvio
              </Label>
              <Input
                id="limite-tentativas"
                type="number"
                min={1}
                max={10}
                value={limiteTentativas}
                onChange={(e) => setLimiteTentativas(Number(e.target.value))}
                className="h-9 text-xs font-mono"
              />
            </div>
          </CardContent>
        </Card>

        {/* Modo Simulação */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Settings className="w-4 h-4 text-purple-400" />
              Modo de Simulação
            </CardTitle>
            <CardDescription className="text-xs">
              Simule cálculos e mensagens sem enviar aos grupos reais.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/40">
              <div className="space-y-0.5">
                <span className="text-xs font-medium">Modo de Simulação Ativo</span>
                <p className="text-[10px] text-muted-foreground">
                  Quando ativo, logs são gravados sem envio externo ao Telegram.
                </p>
              </div>
              <Switch checked={simulacaoModo} onCheckedChange={setSimulacaoModo} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
