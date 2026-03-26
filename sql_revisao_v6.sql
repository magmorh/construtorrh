-- ============================================================
--  ConstrutorRH — Script SQL Definitivo v6
--  Todas as operações são idempotentes (seguras para re-executar)
--  Cole no SQL Editor do Supabase e execute.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. adiantamentos
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS desconto_tipo          text
    CHECK (desconto_tipo IN ('unico','parcelado')),
  ADD COLUMN IF NOT EXISTS desconto_parcelas      integer,
  ADD COLUMN IF NOT EXISTS desconto_parcela_atual integer,
  ADD COLUMN IF NOT EXISTS desconto_a_partir      text,          -- 'YYYY-MM'
  ADD COLUMN IF NOT EXISTS desconto_obs           text,
  ADD COLUMN IF NOT EXISTS descontado_em          text,          -- 'YYYY-MM'
  ADD COLUMN IF NOT EXISTS requisicao_url         text;          -- URL PDF assinado


-- ─────────────────────────────────────────────────────────────
-- 2. premios
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.premios
  ADD COLUMN IF NOT EXISTS obra_id     uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo        text,
  ADD COLUMN IF NOT EXISTS data        date,
  ADD COLUMN IF NOT EXISTS competencia text;                     -- 'YYYY-MM'


-- ─────────────────────────────────────────────────────────────
-- 3. ponto_lancamentos — snap_*
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
  -- aliases curtos (Pagamentos.tsx / Juridico.tsx)
  ADD COLUMN IF NOT EXISTS snap_horas            numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_dsr              numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_producao         numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_premio           numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_vt               numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_ad               numeric(12,2),
  -- auditoria
  ADD COLUMN IF NOT EXISTS snap_fechado_em       timestamptz,
  ADD COLUMN IF NOT EXISTS snap_fechado_por      text;


-- ─────────────────────────────────────────────────────────────
-- 4. registro_ponto — espelho de ponto completo
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.registro_ponto
  ADD COLUMN IF NOT EXISTS lancamento_id      uuid REFERENCES public.ponto_lancamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS obra_id            uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hora_entrada       text,              -- '07:00'
  ADD COLUMN IF NOT EXISTS saida_almoco       text,              -- '12:00'
  ADD COLUMN IF NOT EXISTS retorno_almoco     text,              -- '13:00'
  ADD COLUMN IF NOT EXISTS hora_saida         text,              -- '17:00'
  ADD COLUMN IF NOT EXISTS he_entrada         text,              -- hora início H.Extra
  ADD COLUMN IF NOT EXISTS he_saida           text,              -- hora fim / qtd H.Extra
  ADD COLUMN IF NOT EXISTS horas_trabalhadas  numeric(5,2),
  ADD COLUMN IF NOT EXISTS horas_extras       numeric(5,2),
  ADD COLUMN IF NOT EXISTS presente           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS falta              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS status             text,
  ADD COLUMN IF NOT EXISTS justificativa      text,
  ADD COLUMN IF NOT EXISTS observacoes        text;


-- ─────────────────────────────────────────────────────────────
-- 5. atestados — colunas usadas no espelho de ponto do Jurídico
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS dias_afastamento   integer,
  ADD COLUMN IF NOT EXISTS com_afastamento    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cid                text,
  ADD COLUMN IF NOT EXISTS medico             text,
  ADD COLUMN IF NOT EXISTS tipo               text
    CHECK (tipo IN ('medico','comparecimento','declaracao')),
  ADD COLUMN IF NOT EXISTS observacoes        text,
  ADD COLUMN IF NOT EXISTS documento_url      text,
  ADD COLUMN IF NOT EXISTS documento_nome     text,
  ADD COLUMN IF NOT EXISTS acidente_id        uuid REFERENCES public.acidentes(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────
-- 6. advertencias — coluna dias_suspensao
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.advertencias
  ADD COLUMN IF NOT EXISTS dias_suspensao   integer,
  ADD COLUMN IF NOT EXISTS documento_url    text,
  ADD COLUMN IF NOT EXISTS documento_nome   text;


-- ─────────────────────────────────────────────────────────────
-- 7. acidentes — colunas usadas no dossiê
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.acidentes
  ADD COLUMN IF NOT EXISTS hora_acidente    text,
  ADD COLUMN IF NOT EXISTS gravidade        text
    CHECK (gravidade IN ('leve','moderado','grave','fatal')),
  ADD COLUMN IF NOT EXISTS local_acidente   text,
  ADD COLUMN IF NOT EXISTS cat_emitida      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS documento_url    text,
  ADD COLUMN IF NOT EXISTS documento_nome   text;


-- ─────────────────────────────────────────────────────────────
-- 8. Tabela rescisoes (nova)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rescisoes (
  id                         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id             uuid          NOT NULL
                               REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  data_rescisao              date          NOT NULL,
  tipo                       text          NOT NULL
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
  created_at                 timestamptz   NOT NULL DEFAULT now()
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


-- ─────────────────────────────────────────────────────────────
-- 9. Storage — bucket "documentos" + políticas via RLS
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'documentos_upload'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY documentos_upload ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'documentos')
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'documentos_select_public'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY documentos_select_public ON storage.objects
        FOR SELECT TO public
        USING (bucket_id = 'documentos')
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'documentos_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY documentos_delete ON storage.objects
        FOR DELETE TO authenticated
        USING (bucket_id = 'documentos')
    $policy$;
  END IF;
END $$;
