import { Eye, EyeOff } from "lucide-react";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { usePrivacy } from "@/contexts/PrivacyContext";

interface PrivacyToggleProps {
  className?: string;
}

export function PrivacyToggle({ className }: PrivacyToggleProps) {
  const { isPrivate, togglePrivacy } = usePrivacy();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePrivacy}
            className={className}
            aria-label={
              isPrivate
                ? "Mostrar valores (Modo Privacidade Ativo)"
                : "Ocultar valores (Modo Privacidade)"
            }
          >
            {isPrivate ? (
              <EyeOff className="h-5 w-5 text-amber-500 hover:text-amber-400 transition-colors" />
            ) : (
              <Eye className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {isPrivate
              ? "Modo Privacidade ativado (Clique para mostrar valores)"
              : "Ocultar valores na tela"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
