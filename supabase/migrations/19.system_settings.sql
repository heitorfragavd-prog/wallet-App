-- Create system_settings table for storing system-wide configuration
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for system_settings

-- Only admins can view system settings
CREATE POLICY "Admins can view system_settings" 
ON public.system_settings 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can update system settings
CREATE POLICY "Admins can update system_settings" 
ON public.system_settings 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can insert system settings
CREATE POLICY "Admins can insert system_settings" 
ON public.system_settings 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can delete system settings
CREATE POLICY "Admins can delete system_settings" 
ON public.system_settings 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Insert default webhook_url setting (using service role, bypasses RLS)
INSERT INTO public.system_settings (key, value) 
VALUES ('webhook_url', NULL);

-- Comment explaining the table
COMMENT ON TABLE public.system_settings IS 'Stores system-wide configuration settings';
COMMENT ON COLUMN public.system_settings.key IS 'Unique setting identifier';
COMMENT ON COLUMN public.system_settings.value IS 'Setting value (can be null for unconfigured settings)';
