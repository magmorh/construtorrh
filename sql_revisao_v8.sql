-- ============================================================
--  ConstrutorRH — Script SQL Definitivo v8
--  Inclui: historico_contrato, VT ajustes, obras status,
--          campos empresa, provisoes, storage
--  IDEMPOTENTE: seguro para re-executar
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. colaborador_historico_contrato
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.colaborador_historico_contrato (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid          NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo_contrato   text          NOT NULL
                    CHECK (tipo_contrato IN ('clt', 'autonomo', 'pj')),
  data_inicio     date          NOT NULL,
  data_fim        date,          -- NULL = vigente
  observacao      text,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historico_contrato_colaborador
  ON public.colaborador_historico_contrato (colaborador_id);

ALTER TABLE public.colaborador_historico_contrato ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'colaborador_historico_contrato'
      AND policyname = 'hc_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY hc_all
        ON public.colaborador_historico_contrato FOR ALL
        TO authenticated
        USING (true) WITH CHECK (true)
    $policy$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 2. obras — status 'em_andamento'
--    (o sistema usa 'em_andamento' como padrão)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Tenta adicionar 'em_andamento' e 'ativo' à constraint se necessário
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc USING (constraint_name)
    WHERE tc.table_name = 'obras'
      AND cc.check_clause NOT LIKE '%em_andamento%'
  ) THEN
    ALTER TABLE public.obras DROP CONSTRAINT IF EXISTS obras_status_check;
    ALTER TABLE public.obras ADD CONSTRAINT obras_status_check
      CHECK (status IN ('ativo','em_andamento','concluida','pausada','cancelada'));
  END IF;
END $$;

-- Migra obras com status 'ativo' para 'em_andamento' (valor padrão do sistema)
-- Comente esta linha se não quiser migrar automaticamente:
UPDATE public.obras SET status = 'em_andamento' WHERE status = 'ativo';


-- ─────────────────────────────────────────────────────────────
-- 3. adiantamentos
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS desconto_tipo          text
    CHECK (desconto_tipo IN ('unico','parcelado')),
  ADD COLUMN IF NOT EXISTS desconto_parcelas      integer,
  ADD COLUMN IF NOT EXISTS desconto_parcela_atual integer,
  ADD COLUMN IF NOT EXISTS desconto_a_partir      text,
  ADD COLUMN IF NOT EXISTS desconto_obs           text,
  ADD COLUMN IF NOT EXISTS descontado_em          text,
  ADD COLUMN IF NOT EXISTS requisicao_url         text;


-- ─────────────────────────────────────────────────────────────
-- 4. premios
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.premios
  ADD COLUMN IF NOT EXISTS obra_id     uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo        text,
  ADD COLUMN IF NOT EXISTS data        date,
  ADD COLUMN IF NOT EXISTS competencia text;


-- ─────────────────────────────────────────────────────────────
-- 5. ponto_lancamentos — snap_*
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
-- 6. registro_ponto
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.registro_ponto
  ADD COLUMN IF NOT EXISTS lancamento_id      uuid REFERENCES public.ponto_lancamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS obra_id            uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hora_entrada       text,
  ADD COLUMN IF NOT EXISTS saida_almoco       text,
  ADD COLUMN IF NOT EXISTS retorno_almoco     text,
  ADD COLUMN IF NOT EXISTS hora_saida         text,
  ADD COLUMN IF NOT EXISTS he_entrada         text,
  ADD COLUMN IF NOT EXISTS he_saida           text,
  ADD COLUMN IF NOT EXISTS horas_trabalhadas  numeric(5,2),
  ADD COLUMN IF NOT EXISTS horas_extras       numeric(5,2),
  ADD COLUMN IF NOT EXISTS presente           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS falta              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS status             text,
  ADD COLUMN IF NOT EXISTS justificativa      text,
  ADD COLUMN IF NOT EXISTS observacoes        text;


-- ─────────────────────────────────────────────────────────────
-- 7. atestados
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
  ADD COLUMN IF NOT EXISTS documento_nome     text;


-- ─────────────────────────────────────────────────────────────
-- 8. advertencias
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.advertencias
  ADD COLUMN IF NOT EXISTS dias_suspensao   integer,
  ADD COLUMN IF NOT EXISTS documento_url    text,
  ADD COLUMN IF NOT EXISTS documento_nome   text;


-- ─────────────────────────────────────────────────────────────
-- 9. acidentes
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
-- 10. rescisoes
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
-- 11. configuracoes — campos empresa
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.configuracoes (chave, valor) VALUES
  ('empresa_razao_social', ''),
  ('empresa_email',        ''),
  ('empresa_endereco',     ''),
  ('empresa_cidade',       ''),
  ('empresa_cep',          ''),
  ('empresa_logo_url',     '')
ON CONFLICT (chave) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 12. Storage — bucket "documentos"
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_upload') THEN
    EXECUTE $policy$ CREATE POLICY documentos_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos') $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_select_public') THEN
    EXECUTE $policy$ CREATE POLICY documentos_select_public ON storage.objects FOR SELECT TO public USING (bucket_id = 'documentos') $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_delete') THEN
    EXECUTE $policy$ CREATE POLICY documentos_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documentos') $policy$;
  END IF;
END $$;
