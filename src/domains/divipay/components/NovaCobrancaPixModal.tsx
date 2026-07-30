import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
import { Plus, Copy, Check } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useDivipayCobrancas } from "@/domains/divipay/hooks/useDivipayCobrancas";
import { formatCurrency } from "@/lib/utils";
import type { DivipayTransacao } from "@/domains/divipay/types";

interface NovaCobrancaPixModalProps {
  onCreated?: (cobranca: DivipayTransacao) => void;
}

export function NovaCobrancaPixModal({ onCreated }: NovaCobrancaPixModalProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expirationSeconds, setExpirationSeconds] = useState("3600");
  const [createdCobranca, setCreatedCobranca] = useState<DivipayTransacao | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { createCobranca, isCreating } = useDivipayCobrancas();

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setExpirationSeconds("3600");
    setCreatedCobranca(null);
    setCopied(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor maior que zero.", variant: "destructive" });
      return;
    }

    try {
      const cobranca = await createCobranca({
        amount: value,
        description: description || undefined,
        expirationSeconds: Number(expirationSeconds) || 3600,
      });
      setCreatedCobranca(cobranca);
      onCreated?.(cobranca);
    } catch {
      // erro já exibido pelo hook
    }
  };

  const handleCopy = async () => {
    const text = createdCobranca?.pix_copy_paste;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: "Copiado!", description: "Pix Copia e Cola copiado para a área de transferência." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Erro", description: "Não foi possível copiar.", variant: "destructive" });
    }
  };

  const qrCode = createdCobranca?.pix_qr_code;
  const qrSrc = qrCode
    ? qrCode.startsWith("http://") || qrCode.startsWith("https://")
      ? qrCode
      : `data:image/png;base64,${qrCode}`
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" />
          Nova Cobrança
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Cobrança Pix</DialogTitle>
        </DialogHeader>

        {!createdCobranca ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor (R$) *</Label>
              <Input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição da cobrança"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiration">Expiração (segundos)</Label>
              <Input
                id="expiration"
                type="number"
                min="60"
                value={expirationSeconds}
                onChange={(e) => setExpirationSeconds(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={isCreating}>
                {isCreating ? "Criando..." : "Criar Cobrança"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Valor</span>
              <span className="text-xl font-bold">{formatCurrency(Number(createdCobranca.amount))}</span>
            </div>
            <Badge variant={createdCobranca.status === "PENDING" ? "secondary" : "default"}>
              {createdCobranca.status}
            </Badge>

            {qrSrc && (
              <div className="flex justify-center">
                <img src={qrSrc} alt="QR Code Pix" className="w-48 h-48 object-contain rounded-lg border" />
              </div>
            )}

            {createdCobranca.pix_copy_paste && (
              <div className="space-y-2">
                <Label>Pix Copia e Cola</Label>
                <div className="flex gap-2">
                  <Input readOnly value={createdCobranca.pix_copy_paste} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={handleCopy}>
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => handleOpenChange(false)}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
