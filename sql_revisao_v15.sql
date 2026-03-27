-- ============================================================
-- sql_revisao_v15.sql
-- Snapshot de considera_sabado_util ao entrar em fechamento
--
-- REGRA: uma vez que um lançamento entra em "em_fechamento",
-- a configuração da obra (considera_sabado_util) é congelada.
-- Alterações posteriores na obra NÃO afetam lançamentos já em fechamento.
-- ============================================================

-- Coluna de snapshot do flag da obra no momento do fechamento
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS snap_considera_sabado_util BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.ponto_lancamentos.snap_considera_sabado_util IS
  'Snapshot de obras.considera_sabado_util no momento em que o lançamento
   entrou em "em_fechamento". Imutável após essa transição — alterações
   posteriores na obra não reprocessam lançamentos já em fechamento.
   NULL = lançamentos antigos (fallback para o valor atual da obra).';

-- Índice para consultas que filtram pelo campo
CREATE INDEX IF NOT EXISTS idx_ponto_lanc_snap_sab
  ON public.ponto_lancamentos (snap_considera_sabado_util)
  WHERE snap_considera_sabado_util IS NOT NULL;
