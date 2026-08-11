import React, { useState } from "react";
import { Settings, Monitor, Smartphone, Globe, ShieldCheck } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useToast } from "@/shared/hooks/use-toast";

const TERMINALS = [
  { serial: "PBA1243L72491", label: "PAY + GESTÃO (Principal)" },
  { serial: "PBA1244T74333", label: "GMAIS (Terminal 1)" },
  { serial: "PBA1233876583", label: "GMAIS (Terminal 2)" },
  { serial: "PBA1235674001", label: "GMAIS (Terminal 3)" },
];

interface Props {
  terminalSerial: string;
  onTerminalChange: (serial: string) => void;
  onBack: () => void;
}

export default function PDVConfigurarView({
  terminalSerial,
  onTerminalChange,
  onBack,
}: Props) {
  const { toast } = useToast();
  const selectedTerminal = TERMINALS.find((t) => t.serial === terminalSerial);

  const [eventId, setEventId] = useState(() => {
    return localStorage.getItem("pdv_event_id") ?? "49602";
  });
  const [pointId, setPointId] = useState(() => {
    return localStorage.getItem("pdv_point_id") ?? "119085";
  });

  const handleSaveIds = () => {
    localStorage.setItem("pdv_event_id", eventId);
    localStorage.setItem("pdv_point_id", pointId);
    toast({
      title: "Configurações Salvas",
      description: "Identificadores da Eyemobile atualizados com sucesso.",
    });
  };

  return (
    <div className="bg-[#111827]/40 border border-[#1E2942]/60 rounded-3xl p-8 max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <Settings className="w-5 h-5 text-emerald-400" />
        </div>
        <h2 className="text-xl font-semibold text-white">
          Configurações do PDV
        </h2>
      </div>

      {/* Terminal Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-medium text-gray-200">
            Terminal / Maquininha Ativa
          </h3>
        </div>

        <p className="text-sm text-gray-500 leading-relaxed">
          O terminal selecionado será associado ao envio de comandos de venda.
        </p>

        <Select value={terminalSerial} onValueChange={onTerminalChange}>
          <SelectTrigger className="w-full bg-[#0B132B] border-[#1E2942] text-white h-12 rounded-xl focus:ring-emerald-500/30 focus:border-emerald-500/40">
            <SelectValue placeholder="Selecione um terminal" />
          </SelectTrigger>
          <SelectContent className="bg-[#0B132B] border-[#1E2942] text-white">
            {TERMINALS.map((terminal) => (
              <SelectItem
                key={terminal.serial}
                value={terminal.serial}
                className="focus:bg-emerald-500/10 focus:text-white cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-gray-400" />
                  <span>{terminal.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedTerminal && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0B132B]/60 border border-[#1E2942]/40">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-sm text-gray-300">
              {selectedTerminal.label}
            </span>
            <span className="ml-auto text-xs font-mono text-gray-500">
              {selectedTerminal.serial}
            </span>
          </div>
        )}
      </div>

      {/* API Config Section */}
      <div className="space-y-4 pt-4 border-t border-[#1E2942]/40">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-medium text-gray-200">
            Parâmetros da API Eyemobile
          </h3>
        </div>

        <p className="text-sm text-gray-500 leading-relaxed">
          Defina as chaves de roteamento que vinculam os pedidos criados na nuvem à sua loja e evento no app da maquininha.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-gray-400 font-medium">ID do Evento (event_id)</label>
            <Input
              type="text"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="bg-[#0B132B] border-[#1E2942] text-white focus:border-emerald-500/40 rounded-xl"
              placeholder="Ex: 49602"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-gray-400 font-medium">ID do Ponto / Loja (point_id)</label>
            <Input
              type="text"
              value={pointId}
              onChange={(e) => setPointId(e.target.value)}
              className="bg-[#0B132B] border-[#1E2942] text-white focus:border-emerald-500/40 rounded-xl"
              placeholder="Ex: 119085"
            />
          </div>
        </div>

        <Button
          onClick={handleSaveIds}
          className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-11 rounded-xl transition-all"
        >
          <ShieldCheck className="w-4 h-4 mr-2" /> Salvar Identificadores Eyemobile
        </Button>
      </div>

      {/* Back button */}
      <div className="pt-4 border-t border-[#1E2942]/40">
        <Button
          variant="outline"
          onClick={onBack}
          className="w-full h-12 rounded-xl border-[#1E2942] bg-[#0B132B]/60 text-gray-300 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
        >
          Voltar para as Vendas
        </Button>
      </div>
    </div>
  );
}
