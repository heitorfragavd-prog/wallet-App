import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { 
  Building2, 
  PiggyBank, 
  Wallet, 
  CreditCard, 
  Plus 
} from "lucide-react";
import { useContasUsuario } from "../hooks/useContasUsuario";
import { AccountType } from "../types";

interface AccountSelectorProps {
  value: string | null;
  onChange: (accountId: string | null) => void;
  disabled?: boolean;
  allowCreate?: boolean;
  className?: string;
}

const accountTypeIcons = {
  conta_corrente: Building2,
  poupanca: PiggyBank,
  carteira: Wallet,
  cartao_credito: CreditCard,
  outro: Wallet,
};

const accountTypeLabels = {
  conta_corrente: 'Conta Corrente',
  poupanca: 'Poupança',
  carteira: 'Carteira',
  cartao_credito: 'Cartão de Crédito',
  outro: 'Outro',
};

export function AccountSelector({
  value,
  onChange,
  disabled = false,
  allowCreate = true,
  className,
}: AccountSelectorProps) {
  const { contas, loading, createConta } = useContasUsuario();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState<AccountType>("conta_corrente");
  const [creating, setCreating] = useState(false);

  const selectedAccount = contas.find(c => c.id === value);

  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) return;

    setCreating(true);
    const result = await createConta({
      nome: newAccountName.trim(),
      tipo: newAccountType,
    });

    if (result.data) {
      onChange(result.data.id);
      setShowCreateDialog(false);
      setNewAccountName("");
      setNewAccountType("conta_corrente");
    }
    setCreating(false);
  };

  return (
    <>
      <Select
        value={value || undefined}
        onValueChange={(val) => {
          if (val === "__create__") {
            setShowCreateDialog(true);
          } else {
            onChange(val);
          }
        }}
        disabled={disabled || loading}
      >
        <SelectTrigger className={className}>
          <SelectValue placeholder="Selecione a conta">
            {selectedAccount && (
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = accountTypeIcons[selectedAccount.tipo];
                  return <Icon className="h-4 w-4" />;
                })()}
                <span>{selectedAccount.nome}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {contas.map((conta) => {
            const Icon = accountTypeIcons[conta.tipo];
            return (
              <SelectItem key={conta.id} value={conta.id}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{conta.nome}</span>
                  <span className="text-xs text-muted-foreground">
                    ({accountTypeLabels[conta.tipo]})
                  </span>
                </div>
              </SelectItem>
            );
          })}
          {allowCreate && (
            <>
              {contas.length > 0 && (
                <div className="my-1 h-px bg-border" />
              )}
              <SelectItem value="__create__">
                <div className="flex items-center gap-2 text-primary">
                  <Plus className="h-4 w-4" />
                  <span>Criar nova conta</span>
                </div>
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Nova Conta</DialogTitle>
            <DialogDescription>
              Adicione uma nova conta para organizar suas transações.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="account-name">Nome da Conta</Label>
              <Input
                id="account-name"
                placeholder="Ex: Nubank, Itaú, Carteira"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateAccount();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-type">Tipo de Conta</Label>
              <Select
                value={newAccountType}
                onValueChange={(val) => setNewAccountType(val as AccountType)}
              >
                <SelectTrigger id="account-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(accountTypeLabels).map(([value, label]) => {
                    const Icon = accountTypeIcons[value as AccountType];
                    return (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <span>{label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateAccount}
              disabled={!newAccountName.trim() || creating}
            >
              {creating ? "Criando..." : "Criar Conta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
