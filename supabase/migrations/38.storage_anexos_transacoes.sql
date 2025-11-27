-- Create storage bucket for transaction attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anexos-transacoes',
  'anexos-transacoes',
  false,
  5242880, -- 5MB in bytes
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Storage policies for anexos-transacoes bucket
-- Policy: Users can view their own files
CREATE POLICY "Users can view their own transaction attachments"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'anexos-transacoes' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can upload their own files
CREATE POLICY "Users can upload their own transaction attachments"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'anexos-transacoes' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can update their own files
CREATE POLICY "Users can update their own transaction attachments"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'anexos-transacoes' 
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'anexos-transacoes' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete their own transaction attachments"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'anexos-transacoes' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add comment for documentation
COMMENT ON TABLE storage.buckets IS 'Storage buckets configuration';
COMMENT ON COLUMN storage.buckets.file_size_limit IS 'Maximum file size in bytes (5MB = 5242880 bytes)';
COMMENT ON COLUMN storage.buckets.allowed_mime_types IS 'Allowed MIME types: image/jpeg, image/png, application/pdf';
