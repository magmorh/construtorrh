-- =============================================================
-- CRIAR TABELA: holerites
-- Cole este SQL no Supabase Dashboard > SQL Editor e execute
-- =============================================================

CREATE TABLE IF NOT EXISTS public.holerites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id     uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  referencia         text NOT NULL,
  salario_base       numeric(12,2) DEFAULT 0,
  total_proventos    numeric(12,2) DEFAULT 0,
  total_descontos    numeric(12,2) DEFAULT 0,
  valor_liquido      numeric(12,2) DEFAULT 0,
  status             text NOT NULL DEFAULT 'rascunho'
                       CHECK (status IN ('rascunho','publicado','cancelado')),
  observacao         text,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_holerites_colaborador ON public.holerites(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_holerites_referencia  ON public.holerites(referencia);
CREATE INDEX IF NOT EXISTS idx_holerites_status      ON public.holerites(status);

ALTER TABLE public.holerites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "holerites_all" ON public.holerites;
CREATE POLICY "holerites_all" ON public.holerites
  FOR ALL USING (true) WITH CHECK (true);

SELECT 'Tabela holerites criada com sucesso!' AS resultado;
