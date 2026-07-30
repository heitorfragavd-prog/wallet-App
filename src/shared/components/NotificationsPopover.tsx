import React from "react";
import { useNotificacoes } from "@/domains/notifications/hooks/useNotificacoes";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Bell, CheckCheck, ExternalLink, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const NotificationsPopover: React.FC = () => {
  const { notificacoes, naoLidasCount, marcarComoLida, marcarTodasComoLidas } = useNotificacoes();
  const navigate = useNavigate();

  const handleNotifClick = (n: typeof notificacoes[0]) => {
    marcarComoLida(n.id);
    if (n.link_redirecionamento) {
      navigate(n.link_redirecionamento);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full hover:bg-muted" aria-label="Notificações">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {naoLidasCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-[10px] font-bold rounded-full border-2 border-background"
            >
              {naoLidasCount > 9 ? "9+" : naoLidasCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notificações</span>
            {naoLidasCount > 0 && (
              <Badge variant="secondary" className="text-[10px] py-0">
                {naoLidasCount} novas
              </Badge>
            )}
          </div>
          {naoLidasCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={marcarTodasComoLidas}
              className="text-xs h-7 text-muted-foreground hover:text-foreground gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Lidas
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {notificacoes.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-xs space-y-1">
              <Info className="h-6 w-6 mx-auto text-muted-foreground/50 mb-1" />
              <p>Nenhuma notificação por enquanto.</p>
            </div>
          ) : (
            notificacoes.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotifClick(n)}
                className={`p-3 text-xs cursor-pointer transition-colors hover:bg-accent/50 ${
                  !n.lida ? "bg-orange-500/5 font-medium" : "opacity-75"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-semibold ${!n.lida ? "text-foreground" : "text-muted-foreground"}`}>
                    {n.titulo}
                  </span>
                  {!n.lida && <div className="h-2 w-2 rounded-full bg-orange-500 shrink-0" />}
                </div>
                <p className="text-muted-foreground line-clamp-2 leading-relaxed">{n.mensagem}</p>
                {n.link_redirecionamento && (
                  <span className="text-[10px] text-orange-600 dark:text-orange-400 mt-1 flex items-center gap-0.5">
                    Ver detalhes <ExternalLink className="h-2.5 w-2.5" />
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
