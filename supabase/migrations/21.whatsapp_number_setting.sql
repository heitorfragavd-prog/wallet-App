-- Add whatsapp_number setting to system_settings
INSERT INTO public.system_settings (key, value) 
VALUES ('whatsapp_number', NULL);

-- Create RLS policy allowing public SELECT for whatsapp_number key
CREATE POLICY "Public can view whatsapp_number" 
ON public.system_settings 
FOR SELECT 
USING (key = 'whatsapp_number');

-- Comment explaining the setting
COMMENT ON TABLE public.system_settings IS 'Stores system-wide configuration settings including WhatsApp contact number';
