-- Create pagamentos_dividas table
CREATE TABLE public.pagamentos_dividas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  divida_id UUID NOT NULL REFERENCES public.dividas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor DECIMAL(10,2) NOT NULL CHECK (valor > 0),
  data_pagamento DATE NOT NULL DEFAULT CURRENT_DATE,
  metodo_pagamento VARCHAR(20) NOT NULL CHECK (metodo_pagamento IN ('pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'transferencia')),
  conta_id UUID REFERENCES public.contas_usuario(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.pagamentos_dividas ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for pagamentos_dividas
CREATE POLICY "Users can view their own pagamentos" 
ON public.pagamentos_dividas 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own pagamentos" 
ON public.pagamentos_dividas 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pagamentos" 
ON public.pagamentos_dividas 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pagamentos" 
ON public.pagamentos_dividas 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update divida after payment
CREATE OR REPLACE FUNCTION public.update_divida_after_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Update valor_pago in dividas table
  UPDATE public.dividas
  SET valor_pago = valor_pago + NEW.valor,
      parcelas_pagas = parcelas_pagas + 1
  WHERE id = NEW.divida_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update divida after payment
CREATE TRIGGER update_divida_on_payment
AFTER INSERT ON public.pagamentos_dividas
FOR EACH ROW
EXECUTE FUNCTION public.update_divida_after_payment();

-- Create function to revert divida update on payment deletion
CREATE OR REPLACE FUNCTION public.revert_divida_after_payment_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Revert valor_pago in dividas table
  UPDATE public.dividas
  SET valor_pago = valor_pago - OLD.valor,
      parcelas_pagas = GREATEST(0, parcelas_pagas - 1)
  WHERE id = OLD.divida_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to revert divida update on payment deletion
CREATE TRIGGER revert_divida_on_payment_deletion
AFTER DELETE ON public.pagamentos_dividas
FOR EACH ROW
EXECUTE FUNCTION public.revert_divida_after_payment_deletion();

-- Create indexes for better performance
CREATE INDEX idx_pagamentos_dividas_user_id ON public.pagamentos_dividas(user_id);
CREATE INDEX idx_pagamentos_dividas_divida_id ON public.pagamentos_dividas(divida_id);
CREATE INDEX idx_pagamentos_dividas_data_pagamento ON public.pagamentos_dividas(data_pagamento);
CREATE INDEX idx_pagamentos_dividas_metodo_pagamento ON public.pagamentos_dividas(metodo_pagamento);
CREATE INDEX idx_pagamentos_dividas_conta_id ON public.pagamentos_dividas(conta_id);
