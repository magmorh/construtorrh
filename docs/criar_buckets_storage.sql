-- ============================================================
-- EXECUTAR NO SUPABASE SQL EDITOR
-- https://supabase.com/dashboard/project/rbhmfqngnjxdemavtvxk/sql
-- ============================================================

-- 1. Criar bucket principal de documentos (público)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ocorrencias-documentos',
  'ocorrencias-documentos',
  true,
  52428800,  -- 50MB
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/gif','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- 2. Criar bucket de adiantamentos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos',
  'documentos',
  true,
  52428800,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- 3. Política: qualquer usuário autenticado pode fazer upload
CREATE POLICY "Authenticated upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('ocorrencias-documentos', 'documentos'));

-- 4. Política: leitura pública
CREATE POLICY "Public read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id IN ('ocorrencias-documentos', 'documentos'));

-- 5. Política: dono pode deletar
CREATE POLICY "Authenticated delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('ocorrencias-documentos', 'documentos'));
