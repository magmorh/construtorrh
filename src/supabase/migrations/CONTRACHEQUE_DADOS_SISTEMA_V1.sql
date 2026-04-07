-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — Contracheque: colunas detalhadas para geração automática
-- Execute no Supabase SQL Editor (seguro re-executar — IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Adicionar colunas de breakdown detalhado na tabela contracheques
ALTER TABLE public.contracheques
  ADD COLUMN IF NOT EXISTS salario_base       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS horas_normais      NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS horas_extras       NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS valor_producao     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_dsr          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_premio       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS desconto_vt        NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS desconto_adiant    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cesta_basica       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS funcao             TEXT,
  ADD COLUMN IF NOT EXISTS tipo_contrato_snap TEXT,
  ADD COLUMN IF NOT EXISTS obra_nome          TEXT,
  ADD COLUMN IF NOT EXISTS dias_trabalhados   INT,
  ADD COLUMN IF NOT EXISTS faltas             INT,
  ADD COLUMN IF NOT EXISTS lancamento_id      UUID,
  ADD COLUMN IF NOT EXISTS gerado_do_sistema  BOOLEAN DEFAULT FALSE;

-- Garantir que a tabela tem RLS aberta (já existente, só reforço)
ALTER TABLE public.contracheques ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contracheques_all" ON public.contracheques;
CREATE POLICY "contracheques_all" ON public.contracheques
  FOR ALL USING (true) WITH CHECK (true);
