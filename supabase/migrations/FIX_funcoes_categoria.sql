-- ══════════════════════════════════════════════════════════════
-- FIX: Adicionar coluna 'categoria' na tabela funcoes
-- Executar em bancos existentes
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.funcoes
  ADD COLUMN IF NOT EXISTS categoria TEXT
    CHECK (categoria IN ('mestre','encarregado','profissional','meio_oficial','ajudante'));

COMMENT ON COLUMN public.funcoes.categoria IS
  'Categoria hierárquica: mestre, encarregado, profissional, meio_oficial, ajudante';
