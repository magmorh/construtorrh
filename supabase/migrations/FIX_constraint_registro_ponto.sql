-- ═══════════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — FIX constraint duplicada em registro_ponto
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Remover constraint ANTIGA que causava o erro de duplicate key
--    (era única por colaborador+data, mas agora pode ter o mesmo dia em obras diferentes)
ALTER TABLE public.registro_ponto
  DROP CONSTRAINT IF EXISTS registro_ponto_colaborador_id_data_key;

-- 2. Garantir que a constraint NOVA (por lancamento + data) exista
ALTER TABLE public.registro_ponto
  DROP CONSTRAINT IF EXISTS reg_ponto_lanc_data_unique;

ALTER TABLE public.registro_ponto
  ADD CONSTRAINT reg_ponto_lanc_data_unique
    UNIQUE (lancamento_id, data);

SELECT '✅ Constraint corrigida com sucesso!' AS resultado;
