-- ============================================================
-- sql_revisao_v23.sql
-- Adiciona coluna feriado_remunerado na tabela registro_ponto
--
-- NOVA LÓGICA DE FERIADOS/SÁBADOS (simplificada):
--   • Feriado + presença          → +100% em todas as horas
--   • Feriado + feriado_remunerado → dia normal pago (jornada padrão)
--   • Feriado sem presença/rem    → R$ 0
--   • Sábado + presença           → +50% em todas as horas
--   • Sábado NÃO é dia útil       → não entra no DSR
--   • DSR: apenas Domingos são candidatos
-- ============================================================

-- 1. Adicionar coluna feriado_remunerado
ALTER TABLE public.registro_ponto
  ADD COLUMN IF NOT EXISTS feriado_remunerado boolean NOT NULL DEFAULT false;

-- 2. Índice para consultas por feriado remunerado
CREATE INDEX IF NOT EXISTS idx_reg_ponto_feriado_rem
  ON public.registro_ponto(lancamento_id)
  WHERE feriado_remunerado = true;

-- 3. Comentário explicativo
COMMENT ON COLUMN public.registro_ponto.feriado_remunerado IS
  'Feriado não trabalhado mas remunerado: paga a jornada padrão do dia (sem adicional).
   Se presente=true, o feriado é tratado como trabalhado (+100%), este campo é ignorado.';
