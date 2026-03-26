-- ============================================================
--  SCRIPT SQL — ConstrutorRH (v4 — sem storage, só tabelas)
--  Cole no SQL Editor do Supabase e execute.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. adiantamentos — URL da requisição assinada
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS requisicao_url text;


-- ─────────────────────────────────────────────────────────────
-- 2. ponto_lancamentos — colunas snap_*
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS snap_valor_total      numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_liquido          numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_horas      numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_dsr        numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_producao   numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_premio     numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_inss             numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_ir               numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_desconto_vt      numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_desconto_adiant  numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_horas_normais    numeric(8,2),
  ADD COLUMN IF NOT EXISTS snap_horas_extras     numeric(8,2),
  ADD COLUMN IF NOT EXISTS snap_valor_hora       numeric(10,4),
  ADD COLUMN IF NOT EXISTS snap_vt_diario        numeric(10,4),
  ADD COLUMN IF NOT EXISTS snap_faltas           integer,
  ADD COLUMN IF NOT EXISTS snap_horas            numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_dsr              numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_producao         numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_premio           numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_vt               numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_ad               numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_fechado_em       timestamptz,
  ADD COLUMN IF NOT EXISTS snap_fechado_por      text;


-- ─────────────────────────────────────────────────────────────
-- 3. Tabela rescisoes (nova)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rescisoes (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id             uuid        NOT NULL
                               REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  data_rescisao              date        NOT NULL,
  tipo                       text        NOT NULL
                               CHECK (tipo IN (
                                 'sem_justa_causa','com_justa_causa','pedido_demissao',
                                 'acordo','aposentadoria','outros'
                               )),
  valor_saldo_fgts           numeric(12,2) NOT NULL DEFAULT 0,
  valor_aviso_previo         numeric(12,2) NOT NULL DEFAULT 0,
  valor_ferias_proporcionais numeric(12,2) NOT NULL DEFAULT 0,
  valor_13_proporcional      numeric(12,2) NOT NULL DEFAULT 0,
  valor_multa_fgts           numeric(12,2) NOT NULL DEFAULT 0,
  valor_outros               numeric(12,2) NOT NULL DEFAULT 0,
  total_rescisao             numeric(12,2) NOT NULL DEFAULT 0,
  observacoes                text,
  created_at                 timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.rescisoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'rescisoes'
      AND policyname = 'rescisoes_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY rescisoes_all
        ON public.rescisoes FOR ALL
        TO authenticated
        USING (true) WITH CHECK (true)
    $policy$;
  END IF;
END $$;
