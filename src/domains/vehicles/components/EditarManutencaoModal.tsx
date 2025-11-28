import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Save, Loader2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { PlanoManutencaoVeiculo, ManutencaoCustomizada } from "../types";

interface EditarManutencaoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: 'plano' | 'customizada';
  plano?: PlanoManutencaoVeiculo;
  customizada?: ManutencaoCustomizada;
  onSave: (data: any) => Promise<void>;
}

const SISTEMAS = [
  "Motor",
  "Freios",
  "Suspensão",
  "Transmissão",
  "Elétrico",
  "Arrefecimento",
  "Combustível",
  "Escapamento",
  "Direção",
  "Rodas",
  "Carroceria",
  "Interior",
  "Geral",
  "Outro"
];

export const EditarManutencaoModal = ({
  open,
  onOpenChange,
  tipo,
  plano,
  customizada,
  onSave
}: EditarManutencaoModalProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // Estados para plano
  const [intervaloKm, setIntervaloKm] = useState("");
  const [ativo, setAtivo] = useState(true);
  
  // Estados adicionais para customizada
  const [nome, setNome] = useState("");
  const [sistema, setSistema] = useState("");
  const [dataPrevista, setDataPrevista] = useState("");

  // Inicializar valores quando o modal abre
  useEffect(() => {
    if (open) {
      if (tipo === 'plano' && plano) {
        setIntervaloKm(plano.intervalo_km.toString());
        setAtivo(plano.ativo);
      } else if (tipo === 'customizada' && customizada) {
        setNome(customizada.nome);
        setSistema(customizada.sistema || "");
        setIntervaloKm(customizada.intervalo_km?.toString() || "");
        setDataPrevista(customizada.data_prevista || "");
        setAtivo(customizada.ativo);
      }
    }
  }, [open, tipo, plano, customizada]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validações
    if (tipo === 'customizada') {
      if (!nome.trim()) {
        toast({
          title: "Erro de Validação",
          description: "Por favor, informe o nome da manutenção.",
          variant: "destructive"
        });
        return;
      }
      if (nome.trim().length < 3) {
        toast({
          title: "Erro de Validação",
          description: "O nome da manutenção deve ter pelo menos 3 caracteres.",
          variant: "destructive"
        });
        return;
      }
    }

    if (intervaloKm && (isNaN(Number(intervaloKm)) || Number(intervaloKm) <= 0)) {
      toast({
        title: "Erro de Validação",
        description: "Por favor, informe um intervalo válido em km (maior que 0).",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      if (tipo === 'plano' && plano) {
        await onSave({
          id: plano.id,
          intervalo_km: Number(intervaloKm),
          ativo
        });
      } else if (tipo === 'customizada' && customizada) {
        await onSave({
          id: customizada.id,
          nome: nome.trim(),
          sistema: sistema || null,
          intervalo_km: intervaloKm ? Number(intervaloKm) : null,
          data_prevista: dataPrevista || null,
          ativo
        });
      }
      
      toast({
        title: "Sucesso!",
        description: "Manutenção atualizada com sucesso.",
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Erro ao Salvar",
        description: "Não foi possível atualizar a manutenção. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getNomeManutencao = () => {
    if (tipo === 'plano' && plano) {
      return plano.tipo_manutencao?.nome || 'Manutenção';
    }
    return customizada?.nome || 'Manutenção';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Manutenção</DialogTitle>
          <DialogDescription>
            Editando: {getNomeManutencao()}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Campos específicos para customizada */}
          {tipo === 'customizada' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="nome">Nome da Manutenção</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Troca de Correia"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sistema">Sistema</Label>
                <Select value={sistema} onValueChange={setSistema}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o sistema" />
                  </SelectTrigger>
                  <SelectContent>
                    {SISTEMAS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="data-prevista">Data Prevista</Label>
                <Input
                  id="data-prevista"
                  type="date"
                  value={dataPrevista}
                  onChange={(e) => setDataPrevista(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Campo comum: Intervalo KM */}
          <div className="space-y-2">
            <Label htmlFor="intervalo-km">Intervalo (km)</Label>
            <Input
              id="intervalo-km"
              type="number"
              min="1"
              step="100"
              value={intervaloKm}
              onChange={(e) => setIntervaloKm(e.target.value)}
              placeholder="Ex: 10000"
            />
            <p className="text-xs text-muted-foreground">
              A cada quantos quilômetros esta manutenção deve ser realizada
            </p>
          </div>

          {/* Campo comum: Ativo */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="ativo">Manutenção Ativa</Label>
              <p className="text-xs text-muted-foreground">
                Desative para pausar lembretes
              </p>
            </div>
            <Switch
              id="ativo"
              checked={ativo}
              onCheckedChange={setAtivo}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
