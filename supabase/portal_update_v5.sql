-- Migração v5: corrige CHECK constraint e adiciona status aprovado/recusado em portal_documentos
-- Execute no Supabase SQL Editor

-- 1. Remove o CHECK antigo (só aceitava pendente/processado/descartado)
ALTER TABLE portal_documentos DROP CONSTRAINT IF EXISTS portal_documentos_status_check;

-- 2. Recria com todos os valores necessários
ALTER TABLE portal_documentos
  ADD CONSTRAINT portal_documentos_status_check
  CHECK (status IN ('pendente','processado','descartado','aprovado','recusado'));

-- 3. Garante colunas de aprovação (caso v4 não tenha rodado)
ALTER TABLE portal_documentos
  ADD COLUMN IF NOT EXISTS motivo_recusa  text,
  ADD COLUMN IF NOT EXISTS aprovado_por   uuid,
  ADD COLUMN IF NOT EXISTS aprovado_em    timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_nome  text;

-- 4. Garante que registros existentes tenham status válido
UPDATE portal_documentos SET status = 'pendente' WHERE status IS NULL OR status = '';

-- Verificação
SELECT status, count(*) FROM portal_documentos GROUP BY status;
