-- ============================================================
-- Script: Criar bucket 'portal-documentos' no Supabase Storage
-- Execute este script no SQL Editor do Supabase Dashboard
-- ============================================================

-- 1. Criar o bucket (público = false para segurança)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portal-documentos',
  'portal-documentos',
  false,  -- privado
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy: Permitir INSERT (upload) por usuários autenticados e anônimos (portal)
CREATE POLICY "Portal pode fazer upload"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'portal-documentos');

-- 3. Policy: Permitir SELECT (download/leitura) por todos
CREATE POLICY "Portal pode ler documentos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'portal-documentos');

-- 4. Policy: Permitir DELETE por autenticados
CREATE POLICY "Portal pode deletar documentos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'portal-documentos');

-- Verificar se o bucket foi criado:
-- SELECT * FROM storage.buckets WHERE id = 'portal-documentos';
