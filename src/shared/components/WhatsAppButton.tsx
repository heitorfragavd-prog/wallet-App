import { MessageCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { useWhatsAppNumber } from "@/shared/hooks/useWhatsAppNumber";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/ui/tooltip";

interface WhatsAppButtonProps {
  isCollapsed?: boolean;
  onClick?: () => void;
}

export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({
  isCollapsed = false,
  onClick,
}) => {
  const { whatsappUrl, loading } = useWhatsAppNumber();

  // Don't render if number is not configured or still loading
  if (loading || !whatsappUrl) {
    return null;
  }

  const handleClick = () => {
    if (onClick) {
      onClick();
    }
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  if (isCollapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleClick}
              className="w-full justify-center bg-[#25D366] hover:bg-[#20BD5A] text-white"
              size="icon"
            >
              <MessageCircle className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Wallet AI</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      onClick={handleClick}
      className="w-full justify-start bg-[#25D366] hover:bg-[#20BD5A] text-white"
    >
      <MessageCircle className="h-5 w-5 mr-2" />
      Wallet AI
    </Button>
  );
};
