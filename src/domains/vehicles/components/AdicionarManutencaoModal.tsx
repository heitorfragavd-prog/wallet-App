import { logger } from "@/core/logging/LoggerService";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Switch } from "@/shared/components/ui/switch";
import { Plus } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useTiposManutencao } from "../hooks/useTiposManutencao";
import { usePlanosManutencao } from "../hooks/usePlanosManutencao";
import { useManutencoesCustomizadas } from "../hooks/useManutencoesCustomizadas";

interface AdicionarManutencaoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  veiculoId: string;
}

export const AdicionarManutencaoModal = ({ 
  open, 
  onOpenChange, 
  veiculoId 
}: AdicionarManutencaoModalProps) => {
  const { toast } = useToast();
  const { tiposManutencao, loading: loadingTipos } = useTiposManutencao();
  const { adicionarPlano } = usePlanosManutencao(veiculoId);
  const { adicionarCustomizada } = useManutencoesCustomizadas(veiculoId);

  // Estado para Tab "Tipo Existente"
  const [tipoSelecionado, setTipoSelecionado] = useState<string>("");
  const [intervaloKm, setIntervaloKm] = useState<string>("");
  
  // Estado para Tab "Customizada"
  const [nomeCustomizada, setNomeCustomizada] = useState<string>("");
  const [sistemaCustomizada, setSistemaCustomizada] = useState<string>("");
  const [intervaloKmCustomizada, setIntervaloKmCustomizada] = useState<string>("");
  
  // Estado comum
  const [ativarLembrete, setAtivarLembrete] = useState<boolean>(true);
  const [diasAntecedencia, setDiasAntecedencia] = useState<string>("7");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setTipoSelecionado("");
    setIntervaloKm("");
    setNomeCustomizada("");
    setSistemaCustomizada("");
    setIntervaloKmCustomizada("");
    setAtivarLembrete(true);
    setDiasAntecedencia("7");
  };

  const handleSubmitTipoExistente = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tipoSelecionado) {
      toast({
        title: "Erro de Validação",
        description: "Por favor, selecione um tipo de manutenção.",
        variant: "destructive"
      });
      return;
    }

    if (!intervaloKm || Number(intervaloKm) <= 0) {
      toast({
        title: "Erro de Validação",
        description: "Por favor, informe um intervalo válido em km (maior que 0).",
        variant: "destructive"
      });
      return;
    }

    if (ativarLembrete && (!diasAntecedencia || Number(diasAntecedencia) < 0)) {
      toast({
        title: "Erro de Validação",
        description: "Por favor, informe os dias de antecedência (0 ou maior).",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      await adicionarPlano({
        veiculo_id: veiculoId,
        tipo_manutencao_id: tipoSelecionado,
        intervalo_km: Number(intervaloKm),
        ativo: true,
        criar_lembrete: ativarLembrete,
        dias_antecedencia: ativarLembrete ? Number(diasAntecedencia) : undefined
      });

      toast({
        title: "Sucesso!",
        description: "Manutenção adicionada ao plano do veículo.",
      });

      resetForm();
      onOpenChange(false);
    } catch (error) {
      logger.error('AdicionarManutencaoModal', 'Erro', { detail: 'Erro ao adicionar plano:', error });
      toast({
        title: "Erro ao Adicionar",
        description: "Não foi possível adicionar a manutenção. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCustomizada = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nomeCustomizada.trim()) {
      toast({
        title: "Erro de Validação",
        description: "Por favor, informe o nome da manutenção.",
        variant: "destructive"
      });
      return;
    }

    if (nomeCustomizada.trim().length < 3) {
      toast({
        title: "Erro de Validação",
        description: "O nome da manutenção deve ter pelo menos 3 caracteres.",
        variant: "destructive"
      });
      return;
    }

    if (!intervaloKmCustomizada || Number(intervaloKmCustomizada) <= 0) {
      toast({
        title: "Erro de Validação",
        description: "Por favor, informe um intervalo válido em km (maior que 0).",
        variant: "destructive"
      });
      return;
    }

    if (ativarLembrete && (!diasAntecedencia || Number(diasAntecedencia) < 0)) {
      toast({
        title: "Erro de Validação",
        description: "Por favor, informe os dias de antecedência (0 ou maior).",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      await adicionarCustomizada({
        veiculo_id: veiculoId,
        nome: nomeCustomizada.trim(),
        sistema: sistemaCustomizada || undefined,
        intervalo_km: Number(intervaloKmCustomizada),
        ativo: true,
        criar_lembrete: ativarLembrete,
        dias_antecedencia: ativarLembrete ? Number(diasAntecedencia) : undefined
      });

      toast({
        title: "Sucesso!",
        description: "Manutenção customizada adicionada ao veículo.",
      });

      resetForm();
      onOpenChange(false);
    } catch (error) {
      logger.error('AdicionarManutencaoModal', 'Erro', { detail: 'Erro ao adicionar manutenção customizada:', error });
      toast({
        title: "Erro ao Adicionar",
        description: "Não foi possível adicionar a manutenção customizada. Tente novamente.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Preencher intervalo padrão quando selecionar tipo
  const handleTipoChange = (value: string) => {
    setTipoSelecionado(value);
    const tipo = tiposManutencao.find(t => t.id === value);
    if (tipo && tipo.intervalo_km) {
      setIntervaloKm(tipo.intervalo_km.toString());
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar Manutenção</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="tipo-existente" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tipo-existente">Tipo Existente</TabsTrigger>
            <TabsTrigger value="customizada">Customizada</TabsTrigger>
          </TabsList>

          {/* Tab: Tipo Existente */}
          <TabsContent value="tipo-existente">
            <form onSubmit={handleSubmitTipoExistente} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Manutenção *</Label>
                <Select
                  value={tipoSelecionado}
                  onValueChange={handleTipoChange}
                  disabled={loadingTipos}
                >
                  <SelectTrigger id="tipo">
                    <SelectValue placeholder="Selecione um tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposManutencao.map((tipo) => (
                      <SelectItem key={tipo.id} value={tipo.id}>
                        {tipo.nome} - {tipo.sistema}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="intervalo-km">Intervalo (km) *</Label>
                <Input
                  id="intervalo-km"
                  type="number"
                  min="1"
                  step="100"
                  value={intervaloKm}
                  onChange={(e) => setIntervaloKm(e.target.value)}
                  placeholder="Ex: 5000"
                />
                <p className="text-xs text-muted-foreground">
                  A cada quantos quilômetros esta manutenção deve ser realizada
                </p>
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="ativar-lembrete">Ativar Lembrete</Label>
                    <p className="text-sm text-muted-foreground">
                      Receber notificação quando a manutenção estiver próxima
                    </p>
                  </div>
                  <Switch
                    id="ativar-lembrete"
                    checked={ativarLembrete}
                    onCheckedChange={setAtivarLembrete}
                  />
                </div>

                {ativarLembrete && (
                  <div className="space-y-2">
                    <Label htmlFor="dias-antecedencia">Dias de Antecedência</Label>
                    <Input
                      id="dias-antecedencia"
                      type="number"
                      min="0"
                      value={diasAntecedencia}
                      onChange={(e) => setDiasAntecedencia(e.target.value)}
                      placeholder="Ex: 7"
                    />
                    <p className="text-xs text-muted-foreground">
                      Quantos dias antes da data prevista você deseja ser notificado
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                      <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Adicionando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* Tab: Customizada */}
          <TabsContent value="customizada">
            <form onSubmit={handleSubmitCustomizada} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome-customizada">Nome da Manutenção *</Label>
                <Input
                  id="nome-customizada"
                  value={nomeCustomizada}
                  onChange={(e) => setNomeCustomizada(e.target.value)}
                  placeholder="Ex: Revisão Completa"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sistema-customizada">Sistema</Label>
                <Select
                  value={sistemaCustomizada}
                  onValueChange={setSistemaCustomizada}
                >
                  <SelectTrigger id="sistema-customizada">
                    <SelectValue placeholder="Selecione um sistema (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Motor">Motor</SelectItem>
                    <SelectItem value="Freios">Freios</SelectItem>
                    <SelectItem value="Suspensão">Suspensão</SelectItem>
                    <SelectItem value="Transmissão">Transmissão</SelectItem>
                    <SelectItem value="Elétrica">Elétrica</SelectItem>
                    <SelectItem value="Arrefecimento">Arrefecimento</SelectItem>
                    <SelectItem value="Pneus">Pneus</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="intervalo-km-customizada">Intervalo (km) *</Label>
                <Input
                  id="intervalo-km-customizada"
                  type="number"
                  min="1"
                  step="100"
                  value={intervaloKmCustomizada}
                  onChange={(e) => setIntervaloKmCustomizada(e.target.value)}
                  placeholder="Ex: 10000"
                />
                <p className="text-xs text-muted-foreground">
                  A cada quantos quilômetros esta manutenção deve ser realizada
                </p>
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="ativar-lembrete-custom">Ativar Lembrete</Label>
                    <p className="text-sm text-muted-foreground">
                      Receber notificação quando a manutenção estiver próxima
                    </p>
                  </div>
                  <Switch
                    id="ativar-lembrete-custom"
                    checked={ativarLembrete}
                    onCheckedChange={setAtivarLembrete}
                  />
                </div>

                {ativarLembrete && (
                  <div className="space-y-2">
                    <Label htmlFor="dias-antecedencia-custom">Dias de Antecedência</Label>
                    <Input
                      id="dias-antecedencia-custom"
                      type="number"
                      min="0"
                      value={diasAntecedencia}
                      onChange={(e) => setDiasAntecedencia(e.target.value)}
                      placeholder="Ex: 7"
                    />
                    <p className="text-xs text-muted-foreground">
                      Quantos dias antes da data prevista você deseja ser notificado
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                      <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Adicionando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
