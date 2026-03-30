-- ============================================================
-- sql_revisao_v24.sql
-- Adiciona coluna desconta_vt na tabela obras
-- Controla se a obra desconta 6% do salário bruto no VT (CLT)
-- ============================================================

-- 1. Adicionar coluna desconta_vt (boolean, padrão false)
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS desconta_vt boolean NOT NULL DEFAULT false;

-- 2. Comentário explicativo
COMMENT ON COLUMN public.obras.desconta_vt IS
  'Se true: colaboradores CLT desta obra terão 6% do salário bruto descontado no VT (limitado ao valor do VT). Autônomos/PJ nunca são descontados.';

-- 3. Índice para queries de filtragem por desconto
CREATE INDEX IF NOT EXISTS idx_obras_desconta_vt
  ON public.obras(desconta_vt)
  WHERE desconta_vt = true;

-- ============================================================
-- IMPORTANTE: Execute este script no Supabase SQL Editor
-- antes de usar a nova funcionalidade de desconto por obra.
-- ============================================================
