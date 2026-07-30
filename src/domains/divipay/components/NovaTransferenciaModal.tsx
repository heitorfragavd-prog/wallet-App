import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Plus } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { useDivipayTransferencias } from "@/domains/divipay/hooks/useDivipayTransferencias";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

export function NovaTransferenciaModal() {
  const [open, setOpen] = useState(false);
  const [keyPix, setKeyPix] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const { toast } = useToast();
  const { validateKey, validatedKey, isValidatingKey, createTransferencia, isCreating, resetValidation } = useDivipayTransferencias();

  const resetForm = () => {
    setKeyPix("");
    setAmount("");
    setDescription("");
    setConfirmed(false);
    resetValidation();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  };

  const handleValidate = async () => {
    if (!keyPix.trim()) {
      toast({ title: "Chave Pix obrigatória", description: "Informe uma chave Pix para validação.", variant: "destructive" });
      return;
    }
    try {
      const result = await validateKey(keyPix.trim());
      if (!result.valid) {
        toast({ title: "Chave inválida", description: result.error || "Não foi possível validar a chave Pix.", variant: "destructive" });
      }
    } catch {
      // erro já exibido
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor maior que zero.", variant: "destructive" });
      return;
    }
    if (!validatedKey?.valid) {
      toast({ title: "Chave não validada", description: "Valide a chave Pix antes de continuar.", variant: "destructive" });
      return;
    }

    try {
      await createTransferencia({
        amount: value,
        keyPix: keyPix.trim(),
        consultId: validatedKey.consultId ?? null,
        description: description || undefined,
      });
      handleOpenChange(false);
    } catch {
      // erro já exibido
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-orange-500 hover:bg-orange-600">
          <Plus className="w-4 h-4 mr-2" />
          Nova Transferência
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Transferência Pix</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="keyPix">Chave Pix *</Label>
            <div className="flex gap-2">
              <Input
                id="keyPix"
                value={keyPix}
                onChange={(e) => {
                  setKeyPix(e.target.value);
                  if (validatedKey) resetValidation();
                }}
                onBlur={handleValidate}
                placeholder="CPF, CNPJ, email, celular ou chave aleatória"
                required
              />
            </div>
          </div>

          {isValidatingKey ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-32" />
            </div>
          ) : validatedKey?.valid ? (
            <div className="p-3 rounded-md bg-muted space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">Titular:</span>{" "}
                <span className="font-medium">{validatedKey.ownerName}</span>
              </p>
              {validatedKey.ownerDocument && (
                <p>
                  <span className="text-muted-foreground">Documento:</span>{" "}
                  <span className="font-medium">{validatedKey.ownerDocument}</span>
                </p>
              )}
              {validatedKey.keyType && (
                <p>
                  <span className="text-muted-foreground">Tipo:</span>{" "}
                  <span className="font-medium">{validatedKey.keyType}</span>
                </p>
              )}
            </div>
          ) : validatedKey && !validatedKey.valid ? (
            <p className="text-sm text-red-600">{validatedKey.error || "Chave Pix inválida."}</p>
          ) : null}

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
              placeholder="Descrição da transferência"
              rows={3}
            />
          </div>

          <div className="flex items-start gap-2">
            <input
              id="confirm"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1"
            />
            <Label htmlFor="confirm" className="text-sm font-normal cursor-pointer">
              Confirmo que os dados do destinatário estão corretos e desejo prosseguir com a transferência.
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600"
              disabled={isCreating || !confirmed || !validatedKey?.valid}
            >
              {isCreating ? "Processando..." : `Transferir ${amount ? formatCurrency(Number(amount)) : ""}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
