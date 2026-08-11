import { supabase } from "@/integrations/supabase/client";

export interface PaymentRequest {
  amount: number;
  items: Array<{ id: string; name: string; quantity: number; price: number }>;
  paymentMethod: "credit" | "debit" | "pix" | "cash";
  terminal_serial?: string;
}

export interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  status: "approved" | "declined" | "pending" | "cancelled";
  message: string;
  timestamp: string;
}

export const TERMINALS = [
  { serial: "PBA1243L72491", label: "PAY + GESTÃO (Principal)" },
  { serial: "PBA1244T74333", label: "GMAIS (Terminal 1)" },
  { serial: "PBA1233876583", label: "GMAIS (Terminal 2)" },
  { serial: "PBA1235674001", label: "GMAIS (Terminal 3)" },
] as const;

export const DEFAULT_TERMINAL_SERIAL = "PBA1243L72491";

export const DEFAULT_EVENT_ID = "49602";
export const DEFAULT_POINT_ID = "119085";

export function getActiveTerminalSerial(): string {
  if (typeof window === "undefined") return DEFAULT_TERMINAL_SERIAL;
  return localStorage.getItem("pdv_terminal_serial") ?? DEFAULT_TERMINAL_SERIAL;
}

export function getActiveEventId(): string {
  if (typeof window === "undefined") return DEFAULT_EVENT_ID;
  return localStorage.getItem("pdv_event_id") ?? DEFAULT_EVENT_ID;
}

export function getActivePointId(): string {
  if (typeof window === "undefined") return DEFAULT_POINT_ID;
  return localStorage.getItem("pdv_point_id") ?? DEFAULT_POINT_ID;
}

export const pdvActionService = {
  async sendToMachine(request: PaymentRequest): Promise<PaymentResponse> {
    const terminalSerial = request.terminal_serial ?? getActiveTerminalSerial();
    const eventId = getActiveEventId();
    const pointId = getActivePointId();
    console.log("[Eyemobile] Criando pedido na nuvem para terminal:", terminalSerial, request);
    
    try {
      const { data, error } = await supabase.functions.invoke("eyemobile-sync", {
        body: {
          mode: "CREATE_ORDER",
          event_id: eventId,
          point_id: pointId,
          reference_key: `TXN-${Date.now()}`,
          comment: `Pedido PDV Terminal ${terminalSerial}`,
          order_items: request.items.map(item => ({
            product_id: item.id,
            price: item.price,
            quantity: item.quantity,
            measure: 0
          }))
        }
      });

      if (error) {
        console.error("[Eyemobile] Erro ao criar pedido:", error);
        return { 
          success: false, 
          status: "declined", 
          message: error.message || "Erro de comunicação com a API", 
          timestamp: new Date().toISOString() 
        };
      }

      if (data?.success) {
        console.log("[Eyemobile] Pedido criado com sucesso:", data);
        return { 
          success: true, 
          transactionId: data.order?.id || `TXN-${Date.now()}`, 
          status: "approved", 
          message: "Pedido enviado para a maquininha! Selecione-o na tela para pagar.", 
          timestamp: new Date().toISOString() 
        };
      }

      return { 
        success: false, 
        status: "declined", 
        message: data?.error || "Erro ao processar criação do pedido no Eyemobile", 
        timestamp: new Date().toISOString() 
      };
    } catch (e: any) {
      console.error("[Eyemobile] Falha na rede:", e);
      return { 
        success: false, 
        status: "declined", 
        message: e.message || "Falha de conexão", 
        timestamp: new Date().toISOString() 
      };
    }
  },
  calculateChange(total: number, received: number): number {
    return Math.max(0, received - total);
  },
};
