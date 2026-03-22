-- ═══════════════════════════════════════════════════════════════════
-- PONTO_LANCAMENTOS  — Agrupa dias de ponto por obra + período
-- Máximo 2 lançamentos por obra/mês por colaborador
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ponto_lancamentos (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id      UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id             UUID NOT NULL REFERENCES public.obras(id)         ON DELETE RESTRICT,
  mes_referencia      TEXT NOT NULL,          -- YYYY-MM
  data_inicio         DATE NOT NULL,
  data_fim            DATE NOT NULL,
  numero_lancamento   SMALLINT NOT NULL CHECK (numero_lancamento IN (1,2)),
  CONSTRAINT max2_lancamentos UNIQUE (colaborador_id, obra_id, mes_referencia, numero_lancamento)
);
ALTER TABLE public.ponto_lancamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ponto_lancamentos_auth" ON public.ponto_lancamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Adicionar lancamento_id e obra_id ao registro_ponto (se não existir)
ALTER TABLE public.registro_ponto
  ADD COLUMN IF NOT EXISTS lancamento_id UUID REFERENCES public.ponto_lancamentos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS obra_id       UUID REFERENCES public.obras(id)             ON DELETE RESTRICT;

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_reg_ponto_lancamento  ON public.registro_ponto(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_colab_mes ON public.ponto_lancamentos(colaborador_id, mes_referencia);

-- Adicionar lancamento_id ao ponto_producao (vincula produção ao lançamento)
ALTER TABLE public.ponto_producao
  ADD COLUMN IF NOT EXISTS lancamento_id UUID REFERENCES public.ponto_lancamentos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS obra_id       UUID REFERENCES public.obras(id);
