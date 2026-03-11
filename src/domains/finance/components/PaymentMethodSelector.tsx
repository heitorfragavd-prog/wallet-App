import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { 
  Smartphone, 
  CreditCard, 
  Banknote, 
  Wallet, 
  ArrowRightLeft,
  Ticket
} from "lucide-react";
import { PaymentMethod } from "../types";

interface PaymentMethodSelectorProps {
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod | null) => void;
  disabled?: boolean;
  className?: string;
}

const paymentMethods = [
  { value: 'pix' as const, label: 'PIX', icon: Smartphone },
  { value: 'cartao_credito' as const, label: 'Cartão de Crédito', icon: CreditCard },
  { value: 'cartao_debito' as const, label: 'Cartão de Débito', icon: CreditCard },
  { value: 'boleto' as const, label: 'Boleto', icon: Banknote },
  { value: 'dinheiro' as const, label: 'Dinheiro', icon: Wallet },
  { value: 'transferencia' as const, label: 'Transferência', icon: ArrowRightLeft },
  { value: 'voucher' as const, label: 'Voucher', icon: Ticket },
];

export function PaymentMethodSelector({
  value,
  onChange,
  disabled = false,
  className,
}: PaymentMethodSelectorProps) {
  const selectedMethod = paymentMethods.find(m => m.value === value);

  return (
    <Select
      value={value || undefined}
      onValueChange={(val) => onChange(val as PaymentMethod)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder="Selecione o método">
          {selectedMethod && (
            <div className="flex items-center gap-2">
              <selectedMethod.icon className="h-4 w-4" />
              <span>{selectedMethod.label}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {paymentMethods.map((method) => (
          <SelectItem key={method.value} value={method.value}>
            <div className="flex items-center gap-2">
              <method.icon className="h-4 w-4" />
              <span>{method.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
