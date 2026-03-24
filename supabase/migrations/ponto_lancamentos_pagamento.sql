-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — Migração: Colunas de pagamento em ponto_lancamentos
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Adicionar colunas de pagamento
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS data_pagamento  DATE,
  ADD COLUMN IF NOT EXISTS obs_pagamento   TEXT;

-- 2. Atualizar o CHECK de status para incluir 'liberado'
--    (remove constraint antiga e recria com o novo valor)
ALTER TABLE public.ponto_lancamentos
  DROP CONSTRAINT IF EXISTS ponto_lancamentos_status_check;

ALTER TABLE public.ponto_lancamentos
  ADD CONSTRAINT ponto_lancamentos_status_check
    CHECK (status IN (
      'rascunho',
      'aguardando_aprovacao',
      'aprovado',
      'recusado',
      'em_fechamento',
      'liberado',
      'pago'
    ));
