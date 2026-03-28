-- =============================================================================
-- sql_revisao_v21.sql
-- Adiciona colunas faltantes para snapshot de fechamento (VT e Auditoria)
-- =============================================================================

-- 1. Coluna para congelar regra de sábado da obra no fechamento
ALTER TABLE public.ponto_lancamentos 
ADD COLUMN IF NOT EXISTS snap_considera_sabado_util BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN public.ponto_lancamentos.snap_considera_sabado_util IS 
'Snapshot imutável do flag considera_sabado_util da obra no momento do fechamento.';

-- 2. Coluna para auditoria de quem liberou (caso não exista)
ALTER TABLE public.ponto_lancamentos 
ADD COLUMN IF NOT EXISTS liberado_por TEXT,
ADD COLUMN IF NOT EXISTS liberado_em TIMESTAMPTZ;

-- 3. Índices extras para performance no fechamento (por mês e status)
CREATE INDEX IF NOT EXISTS idx_ponto_lanc_mes_status ON public.ponto_lancamentos (mes_referencia, status);

-- 4. Verificação final
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'ponto_lancamentos' 
  AND column_name IN ('snap_considera_sabado_util', 'liberado_por', 'liberado_em');