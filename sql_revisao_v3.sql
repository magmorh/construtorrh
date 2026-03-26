-- ============================================================
--  SCRIPT DE REVISÃO SQL — ConstrutorRH (versão corrigida)
--  Cole no SQL Editor do Supabase e execute.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. adiantamentos — coluna para URL da requisição assinada
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS requisicao_url text;


-- ─────────────────────────────────────────────────────────────
-- 2. ponto_lancamentos — colunas snap_*
--    Nomes reais extraídos do código (FechamentoPonto, Encargos,
--    Pagamentos, Jurídico). Todas com IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.ponto_lancamentos
  -- ── Valores calculados (usados em Fechamento, Encargos, Jurídico) ──
  ADD COLUMN IF NOT EXISTS snap_valor_total      numeric(12,2),   -- bruto total
  ADD COLUMN IF NOT EXISTS snap_liquido          numeric(12,2),   -- líquido a pagar
  ADD COLUMN IF NOT EXISTS snap_valor_horas      numeric(12,2),   -- valor das horas normais + extras
  ADD COLUMN IF NOT EXISTS snap_valor_dsr        numeric(12,2),   -- valor DSR
  ADD COLUMN IF NOT EXISTS snap_valor_producao   numeric(12,2),   -- valor produção
  ADD COLUMN IF NOT EXISTS snap_valor_premio     numeric(12,2),   -- valor prêmio
  ADD COLUMN IF NOT EXISTS snap_inss             numeric(12,2),   -- desconto INSS
  ADD COLUMN IF NOT EXISTS snap_ir               numeric(12,2),   -- desconto IR
  ADD COLUMN IF NOT EXISTS snap_desconto_vt      numeric(12,2),   -- desconto VT (funcionário)
  ADD COLUMN IF NOT EXISTS snap_desconto_adiant  numeric(12,2),   -- desconto adiantamento
  -- ── Quantidades / rates ──
  ADD COLUMN IF NOT EXISTS snap_horas_normais    numeric(8,2),    -- qtd horas normais
  ADD COLUMN IF NOT EXISTS snap_horas_extras     numeric(8,2),    -- qtd horas extras
  ADD COLUMN IF NOT EXISTS snap_valor_hora       numeric(10,4),   -- valor unitário da hora
  ADD COLUMN IF NOT EXISTS snap_vt_diario        numeric(10,4),   -- VT diário
  ADD COLUMN IF NOT EXISTS snap_faltas           integer,         -- dias de falta
  -- ── Aliases usados em Pagamentos.tsx e Jurídico.tsx ──
  --    (nomes curtos que o subagente gerou — mantidos por compatibilidade)
  ADD COLUMN IF NOT EXISTS snap_horas            numeric(12,2),   -- alias de snap_valor_horas
  ADD COLUMN IF NOT EXISTS snap_dsr              numeric(12,2),   -- alias de snap_valor_dsr
  ADD COLUMN IF NOT EXISTS snap_producao         numeric(12,2),   -- alias de snap_valor_producao
  ADD COLUMN IF NOT EXISTS snap_premio           numeric(12,2),   -- alias de snap_valor_premio
  ADD COLUMN IF NOT EXISTS snap_vt               numeric(12,2),   -- alias de snap_desconto_vt
  ADD COLUMN IF NOT EXISTS snap_ad               numeric(12,2),   -- alias de snap_desconto_adiant
  -- ── Auditoria do fechamento ──
  ADD COLUMN IF NOT EXISTS snap_fechado_em       timestamptz,     -- quando foi fechado
  ADD COLUMN IF NOT EXISTS snap_fechado_por      text;            -- quem fechou (user id ou nome)


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


-- ─────────────────────────────────────────────────────────────
-- 4. Storage — bucket "documentos" + policies via RLS
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

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
