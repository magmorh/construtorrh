-- ============================================================
-- sql_revisao_v13.sql
-- VT no Fechamento: fix cálculo por dias reais trabalhados
-- Sábado/Domingo trabalhados sempre contam para VT
-- ============================================================

-- Garante que considera_sabado_util existe (já criado em v9, safe IF NOT EXISTS)
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS considers_sabado_util BOOLEAN DEFAULT FALSE;

-- Garante campo considera_sabado_util (nome correto, caso typo acima)
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS considera_sabado_util BOOLEAN DEFAULT FALSE;

-- Atualiza obras que trabalham sábado para ter considera_sabado_util = true
-- (isso é apenas um lembrete — ajustar manualmente no cadastro de obras)
-- UPDATE public.obras SET considera_sabado_util = true WHERE <condição>;

-- Index para melhorar join de obras em ponto_lancamentos
CREATE INDEX IF NOT EXISTS idx_ponto_lancamentos_obra_id
  ON public.ponto_lancamentos (obra_id);

-- Index para melhorar busca de registro_ponto por lancamento_id + data
CREATE INDEX IF NOT EXISTS idx_registro_ponto_lancamento_data
  ON public.registro_ponto (lancamento_id, data);

-- Comentário na coluna para documentar a regra
COMMENT ON COLUMN public.obras.considera_sabado_util IS
  'TRUE = sábado já está incluso no cálculo de dias úteis do VT mensal. '
  'FALSE = sábado é dia trabalhado mas não está no VT mensal; pagar VT extra por dias trabalhados.';
