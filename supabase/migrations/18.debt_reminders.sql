-- Create debt_reminders table for storing reminder configurations
CREATE TABLE public.debt_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  divida_id UUID NOT NULL REFERENCES public.dividas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_hours INTEGER NOT NULL CHECK (reminder_hours > 0),
  trigger_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.debt_reminders ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX idx_debt_reminders_user_id ON public.debt_reminders(user_id);
CREATE INDEX idx_debt_reminders_divida_id ON public.debt_reminders(divida_id);
CREATE INDEX idx_debt_reminders_status ON public.debt_reminders(status);
CREATE INDEX idx_debt_reminders_trigger_at ON public.debt_reminders(trigger_at);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_debt_reminders_updated_at
BEFORE UPDATE ON public.debt_reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for debt_reminders

-- Users can view their own reminders
CREATE POLICY "Users can view their own debt_reminders" 
ON public.debt_reminders 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can create their own reminders
CREATE POLICY "Users can create their own debt_reminders" 
ON public.debt_reminders 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own reminders
CREATE POLICY "Users can update their own debt_reminders" 
ON public.debt_reminders 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Users can delete their own reminders
CREATE POLICY "Users can delete their own debt_reminders" 
ON public.debt_reminders 
FOR DELETE 
USING (auth.uid() = user_id);

-- Admins can view all reminders for audit purposes
CREATE POLICY "Admins can view all debt_reminders" 
ON public.debt_reminders 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Comment explaining the table
COMMENT ON TABLE public.debt_reminders IS 'Stores reminder configurations for debts with webhook integration';
COMMENT ON COLUMN public.debt_reminders.reminder_hours IS 'Hours before due date to trigger the reminder';
COMMENT ON COLUMN public.debt_reminders.trigger_at IS 'Calculated timestamp when the reminder should be triggered';
COMMENT ON COLUMN public.debt_reminders.status IS 'Reminder status: pending, sent, or failed';
