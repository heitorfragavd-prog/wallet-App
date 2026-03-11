import { logger } from "@/core/logging/LoggerService";
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
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PlanoManutencaoVeiculo, ManutencaoCustomizada } from "../types";
import { ManutencaoService } from "../services/ManutencaoService";

interface RealizarManutencaoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: 'plano' | 'customizada';
  plano?: PlanoManutencaoVeiculo;
  customizada?: ManutencaoCustomizada;
  veiculoId: string;
  quilometragemAtual: number;
  onSuccess: () => void;
}

export const RealizarManutencaoModal = ({
  open,
  onOpenChange,
  tipo,
  plano,
  customizada,
  veiculoId,
  quilometragemAtual,
  onSuccess
}: RealizarManutencaoModalProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  const [dataRealizacao, setDataRealizacao] = useState("");
  const [quilometragem, setQuilometragem] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [custo, setCusto] = useState("");
  const [atualizarKmVeiculo, setAtualizarKmVeiculo] = useState(true);
  const [criarProximoLembrete, setCriarProximoLembrete] = useState(true);

  // Inicializar valores quando o modal abre
  useEffect(() => {
    if (open) {
      const hoje = new Date().toISOString().split('T')[0];
      setDataRealizacao(hoje);
      setQuilometragem(quilometragemAtual.toString());
      setObservacoes("");
      setCusto("");
      setAtualizarKmVeiculo(true);
      setCriarProximoLembrete(true);
    }
  }, [open, quilometragemAtual]);

  const getNomeManutencao = () => {
    if (tipo === 'plano' && plano) {
      return plano.tipo_manutencao?.nome || 'Manutenção';
    }
    return customizada?.nome || 'Manutenção';
  };

  const getIntervaloKm = () => {
    if (tipo === 'plano' && plano) {
      return plano.intervalo_km;
    }
    return customizada?.intervalo_km || 0;
  };

  const getTipoManutencaoId = () => {
    if (tipo === 'plano' && plano) {
      return plano.tipo_manutencao_id;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validações
    if (!dataRealizacao) {
      toast({
        title: "Erro de Validação",
        description: "Por favor, informe a data de realização.",
        variant: "destructive"
      });
      return;
    }

    if (!quilometragem || isNaN(Number(quilometragem)) || Number(quilometragem) <= 0) {
      toast({
        title: "Erro de Validação",
        description: "Por favor, informe uma quilometragem válida.",
        variant: "destructive"
      });
      return;
    }

    if (custo && (isNaN(Number(custo)) || Number(custo) < 0)) {
      toast({
        title: "Erro de Validação",
        description: "Por favor, informe um custo válido.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Erro",
          description: "Usuário não autenticado",
          variant: "destructive"
        });
        return;
      }

      const kmAtual = Number(quilometragem);
      const intervaloKm = getIntervaloKm();
      const proximaKm = kmAtual + intervaloKm;

      // 1. Registrar manutenção realizada na tabela manutencoes (histórico)
      const { error: manutencaoError } = await supabase
        .from('manutencoes')
        .insert([{
          user_id: user.id,
          veiculo_id: veiculoId,
          tipo_manutencao_id: getTipoManutencaoId(),
          nome: tipo === 'customizada' ? customizada?.nome : null,
          sistema: tipo === 'customizada' ? customizada?.sistema : plano?.tipo_manutencao?.sistema,
          data_realizacao: dataRealizacao,
          quilometragem: kmAtual,
          custo: custo ? Number(custo) : null,
          observacoes: observacoes || null,
          status: 'realizada'
        }]);

      if (manutencaoError) {
        logger.error('RealizarManutencaoModal', 'Erro', { detail: 'Erro ao registrar manutenção:', manutencaoError });
        throw new Error('Erro ao registrar manutenção');
      }

      // 2. Cancelar lembretes pendentes associados
      const manutencaoId = tipo === 'plano' ? plano?.id : customizada?.id;
      if (manutencaoId) {
        await supabase
          .from('lembretes_manutencao')
          .update({ status: 'cancelado' })
          .eq('manutencao_id', manutencaoId)
          .eq('tipo_manutencao', tipo)
          .eq('status', 'pendente');
      }

      // 3. Atualizar quilometragem do veículo (se selecionado)
      if (atualizarKmVeiculo) {
        const { error: veiculoError } = await supabase
          .from('veiculos')
          .update({ quilometragem: kmAtual })
          .eq('id', veiculoId);

        if (veiculoError) {
          logger.error('RealizarManutencaoModal', 'Erro', { detail: 'Erro ao atualizar quilometragem:', veiculoError });
          // Não falhar a operação por isso
        }
      }

      // 4. Criar próximo lembrete (se selecionado e houver intervalo)
      if (criarProximoLembrete && intervaloKm > 0 && manutencaoId) {
        const dataPrevista = await ManutencaoService.calcularDataPrevista(
          veiculoId,
          intervaloKm
        );

        if (dataPrevista) {
          await supabase
            .from('lembretes_manutencao')
            .insert([{
              user_id: user.id,
              veiculo_id: veiculoId,
              manutencao_id: manutencaoId,
              tipo_manutencao: tipo,
              data_prevista: dataPrevista.toISOString().split('T')[0],
              dias_antecedencia: 7,
              status: 'pendente'
            }]);
        }
      }

      toast({
        title: "Manutenção Realizada!",
        description: `${getNomeManutencao()} foi registrada com sucesso.`,
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      logger.error('RealizarManutencaoModal', 'Erro', { detail: 'Erro:', error });
      toast({
        title: "Erro ao Registrar",
        description: "Não foi possível registrar a manutenção. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Realizar Manutenção
          </DialogTitle>
          <DialogDescription>
            Registrar: {getNomeManutencao()}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="data-realizacao">Data de Realização</Label>
            <Input
              id="data-realizacao"
              type="date"
              value={dataRealizacao}
              onChange={(e) => setDataRealizacao(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quilometragem">Quilometragem Atual</Label>
            <Input
              id="quilometragem"
              type="number"
              min="0"
              step="1"
              value={quilometragem}
              onChange={(e) => setQuilometragem(e.target.value)}
              placeholder="Ex: 45000"
              required
            />
            <p className="text-xs text-muted-foreground">
              Quilometragem do veículo no momento da manutenção
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custo">Custo (R$) - Opcional</Label>
            <Input
              id="custo"
              type="number"
              min="0"
              step="0.01"
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              placeholder="Ex: 150.00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações - Opcional</Label>
            <Textarea
              id="observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Detalhes sobre a manutenção realizada..."
              rows={3}
            />
          </div>

          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="atualizar-km">Atualizar KM do Veículo</Label>
                <p className="text-xs text-muted-foreground">
                  Atualizar a quilometragem do veículo
                </p>
              </div>
              <Switch
                id="atualizar-km"
                checked={atualizarKmVeiculo}
                onCheckedChange={setAtualizarKmVeiculo}
              />
            </div>

            {getIntervaloKm() > 0 && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="criar-lembrete">Criar Próximo Lembrete</Label>
                  <p className="text-xs text-muted-foreground">
                    Agendar lembrete para próxima manutenção
                  </p>
                </div>
                <Switch
                  id="criar-lembrete"
                  checked={criarProximoLembrete}
                  onCheckedChange={setCriarProximoLembrete}
                />
              </div>
            )}
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
              className="bg-green-500 hover:bg-green-600"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirmar
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
