import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/domains/auth/hooks/useAuth";
import { toast } from "sonner";

// Função para normalizar telefone (sempre com 55 no início, apenas números)
const normalizePhone = (phone: string): string => {
  // Remove tudo que não é número
  const numbers = phone.replace(/\D/g, "");
  
  // Se já começa com 55, retorna como está
  if (numbers.startsWith("55")) {
    return numbers;
  }
  
  // Adiciona 55 no início
  return `55${numbers}`;
};

// Função para formatar telefone para exibição
const formatPhoneDisplay = (phone: string): string => {
  const numbers = phone.replace(/\D/g, "");
  
  // Remove o 55 do início para formatação visual
  const localNumber = numbers.startsWith("55") ? numbers.slice(2) : numbers;
  
  if (localNumber.length <= 2) return localNumber;
  if (localNumber.length <= 7) return `(${localNumber.slice(0, 2)}) ${localNumber.slice(2)}`;
  if (localNumber.length <= 11) {
    return `(${localNumber.slice(0, 2)}) ${localNumber.slice(2, 7)}-${localNumber.slice(7)}`;
  }
  return `(${localNumber.slice(0, 2)}) ${localNumber.slice(2, 7)}-${localNumber.slice(7, 11)}`;
};

// Schema de validação com Zod
const registerSchema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  organizationName: z.string().min(2, "Nome da organização deve ter pelo menos 2 caracteres"),
  telefone: z
    .string()
    .min(10, "Telefone deve ter pelo menos 10 dígitos")
    .refine((val) => {
      const numbers = val.replace(/\D/g, "");
      // Aceita telefone com ou sem 55, mas deve ter 10-11 dígitos locais
      const localDigits = numbers.startsWith("55") ? numbers.slice(2) : numbers;
      return localDigits.length >= 10 && localDigits.length <= 11;
    }, "Telefone inválido. Use o formato (XX) XXXXX-XXXX"),
  email: z
    .string()
    .min(1, "Email é obrigatório")
    .email("Email inválido. Use o formato exemplo@dominio.com"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string().min(1, "Confirme sua senha"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type RegisterFormData = z.infer<typeof registerSchema>;

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export const RegisterForm = ({ onSwitchToLogin }: RegisterFormProps) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signUp } = useAuth();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      organizationName: "",
      telefone: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const telefoneValue = watch("telefone");

  // Handler para formatar telefone enquanto digita
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneDisplay(e.target.value);
    setValue("telefone", formatted, { shouldValidate: true });
  };

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);

    // Normaliza o telefone antes de enviar (adiciona 55 se necessário)
    const normalizedPhone = normalizePhone(data.telefone);
    
    const { error } = await signUp(
      data.email.trim().toLowerCase(),
      data.password,
      data.name.trim(),
      data.organizationName.trim(),
      normalizedPhone
    );

    if (error) {
      toast.error("Erro ao criar conta", {
        description: error.message,
      });
    }
    
    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome completo</Label>
        <Input
          id="name"
          type="text"
          {...register("name")}
          placeholder="Seu nome completo"
          className={errors.name ? "border-red-500" : ""}
        />
        {errors.name && (
          <p className="text-sm text-red-500">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="organizationName">Nome da organização</Label>
        <Input
          id="organizationName"
          type="text"
          {...register("organizationName")}
          placeholder="Nome da sua empresa ou organização"
          className={errors.organizationName ? "border-red-500" : ""}
        />
        {errors.organizationName && (
          <p className="text-sm text-red-500">{errors.organizationName.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="telefone">WhatsApp</Label>
        <Input
          id="telefone"
          type="tel"
          value={telefoneValue}
          onChange={handlePhoneChange}
          placeholder="(31) 99999-9999"
          className={errors.telefone ? "border-red-500" : ""}
        />
        <p className="text-xs text-gray-500">
          O código do Brasil (+55) será adicionado automaticamente
        </p>
        {errors.telefone && (
          <p className="text-sm text-red-500">{errors.telefone.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          {...register("email")}
          placeholder="seu@email.com"
          className={errors.email ? "border-red-500" : ""}
        />
        {errors.email && (
          <p className="text-sm text-red-500">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            {...register("password")}
            placeholder="Mínimo 6 caracteres"
            className={errors.password ? "border-red-500" : ""}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-gray-400" />
            ) : (
              <Eye className="h-4 w-4 text-gray-400" />
            )}
          </Button>
        </div>
        {errors.password && (
          <p className="text-sm text-red-500">{errors.password.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmar senha</Label>
        <div className="relative">
          <Input
            id="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            {...register("confirmPassword")}
            placeholder="Confirme sua senha"
            className={errors.confirmPassword ? "border-red-500" : ""}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            {showConfirmPassword ? (
              <EyeOff className="h-4 w-4 text-gray-400" />
            ) : (
              <Eye className="h-4 w-4 text-gray-400" />
            )}
          </Button>
        </div>
        {errors.confirmPassword && (
          <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full bg-orange-500 hover:bg-orange-600"
        disabled={isLoading}
      >
        {isLoading ? "Criando conta..." : "Criar conta"}
      </Button>

      <div className="text-center">
        <span className="text-sm text-gray-600 dark:text-gray-300">
          Já tem uma conta?{" "}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-orange-600 dark:text-orange-400 hover:text-orange-500 dark:hover:text-orange-300 font-medium"
          >
            Faça login
          </button>
        </span>
      </div>
    </form>
  );
};
