-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — Tabela Adiantamentos
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.adiantamentos (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id   UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id          UUID REFERENCES public.obras(id),
  competencia      TEXT NOT NULL,           -- "2026-03"
  data_solicitacao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_pagamento   DATE,
  valor            NUMERIC(12,2) NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','pago','cancelado')),
  tipo             TEXT NOT NULL DEFAULT 'adiantamento'
    CHECK (tipo IN ('adiantamento','vale','ajuda_custo','outro')),
  observacoes      TEXT,
  descontado_em    TEXT   -- competencia em que foi descontado na folha ex: "2026-03"
);

ALTER TABLE public.adiantamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adiantamentos_auth" ON public.adiantamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_adiantamentos_colab ON public.adiantamentos(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_adiantamentos_comp  ON public.adiantamentos(competencia);
CREATE INDEX IF NOT EXISTS idx_adiantamentos_status ON public.adiantamentos(status);
