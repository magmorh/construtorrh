-- =============================================================================
--  ConstrutorRH — FIX: Remove check constraint restritivo em documentos_avulsos
--  Problema: "violates check constraint documentos_avulsos_tipo_check"
--  O sistema usa tipos livres configuráveis (ex: NR-18, Contrato, etc.)
--  Execute no SQL Editor do Supabase — clique em RUN
-- =============================================================================

-- Remove o check constraint que limita os valores do campo "tipo"
alter table documentos_avulsos
  drop constraint if exists documentos_avulsos_tipo_check;

-- Remove também variações de nome caso existam
alter table documentos_avulsos
  drop constraint if exists "documentos_avulsos_tipo_check";

-- Verifica se ainda existe algum constraint de tipo na tabela
-- (rode esta query separada para conferir — deve retornar vazio)
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'documentos_avulsos'::regclass;

-- =============================================================================
-- ✅ Após rodar: qualquer valor de texto será aceito no campo "tipo"
-- =============================================================================
