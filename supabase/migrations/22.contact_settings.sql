-- Add contact settings to system_settings
INSERT INTO public.system_settings (key, value) 
VALUES 
  ('contact_email', 'contato@wallet.cortexx.online'),
  ('contact_phone', '1133333333')
ON CONFLICT (key) DO NOTHING;

-- Create RLS policy allowing public SELECT for contact settings
CREATE POLICY "Public can view contact_email" 
ON public.system_settings 
FOR SELECT 
USING (key = 'contact_email');

CREATE POLICY "Public can view contact_phone" 
ON public.system_settings 
FOR SELECT 
USING (key = 'contact_phone');

-- Comment explaining the settings
COMMENT ON TABLE public.system_settings IS 'Stores system-wide configuration settings including contact information';
