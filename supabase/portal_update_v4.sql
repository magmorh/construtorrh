-- Migração: adicionar colunas de aprovação/recusa nas tabelas portal_ocorrencias e portal_documentos
-- Execute este script no Supabase SQL Editor

-- portal_ocorrencias: adicionar status, aprovado_*, motivo_recusa
ALTER TABLE portal_ocorrencias
  ADD COLUMN IF NOT EXISTS status         text    DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS motivo_recusa  text,
  ADD COLUMN IF NOT EXISTS aprovado_por   uuid,
  ADD COLUMN IF NOT EXISTS aprovado_em    timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_nome  text;

-- portal_documentos: adicionar aprovado_*, motivo_recusa (status já existe)
ALTER TABLE portal_documentos
  ADD COLUMN IF NOT EXISTS motivo_recusa  text,
  ADD COLUMN IF NOT EXISTS aprovado_por   uuid,
  ADD COLUMN IF NOT EXISTS aprovado_em    timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_nome  text;

-- portal_epi_solicitacoes: adicionar motivo_recusa (demais colunas já existem)
ALTER TABLE portal_epi_solicitacoes
  ADD COLUMN IF NOT EXISTS motivo_recusa  text;

-- Atualizar registros existentes com status NULL
UPDATE portal_ocorrencias SET status = 'pendente' WHERE status IS NULL;
UPDATE portal_documentos  SET status = 'pendente' WHERE status IS NULL;
