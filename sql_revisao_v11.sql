-- ============================================================
-- ConstrutorRH - SQL v11
-- Novidades: link_projetos/obs_projetos em obras,
--            tabela portal_mensagens (chat obra ↔ admin)
-- ============================================================

-- ── 1. Colunas novas em obras ──────────────────────────────
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS link_projetos  text,
  ADD COLUMN IF NOT EXISTS obs_projetos   text;

-- ── 2. Tabela portal_mensagens ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_mensagens (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         uuid          NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  remetente       text          NOT NULL CHECK (remetente IN ('obra','admin')),
  remetente_nome  text,
  texto           text          NOT NULL,
  lida            boolean       NOT NULL DEFAULT false,
  criado_em       timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_mensagens_obra
  ON public.portal_mensagens (obra_id, criado_em DESC);

ALTER TABLE public.portal_mensagens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='portal_mensagens' AND policyname='pm_all'
  ) THEN
    EXECUTE $p$
      CREATE POLICY pm_all ON public.portal_mensagens
        FOR ALL TO authenticated
        USING (true) WITH CHECK (true)
    $p$;
  END IF;
END $$;

-- ── 3. Herança dos blocos v10 (idempotentes) ───────────────
-- vinculo_anterior_id em colaboradores
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS vinculo_anterior_id uuid REFERENCES public.colaboradores(id),
  ADD COLUMN IF NOT EXISTS motivo_encerramento  text,
  ADD COLUMN IF NOT EXISTS data_encerramento    date;

CREATE INDEX IF NOT EXISTS idx_colab_vinculo_anterior
  ON public.colaboradores (vinculo_anterior_id)
  WHERE vinculo_anterior_id IS NOT NULL;

-- considera_sabado_util em obras
ALTER TABLE public.obras
  ADD COLUMN IF NOT EXISTS considera_sabado_util boolean NOT NULL DEFAULT false;

-- status aguardando_pagamento em vale_transporte
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints cc
    WHERE cc.constraint_name = 'vale_transporte_status_check'
    AND cc.check_clause LIKE '%aguardando_pagamento%'
  ) THEN
    ALTER TABLE public.vale_transporte DROP CONSTRAINT IF EXISTS vale_transporte_status_check;
    ALTER TABLE public.vale_transporte ADD CONSTRAINT vale_transporte_status_check
      CHECK (status IN ('pendente','aguardando_pagamento','pago','cancelado'));
  END IF;
END $$;

-- colaborador_historico_contrato
CREATE TABLE IF NOT EXISTS public.colaborador_historico_contrato (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid          NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo_contrato   text          NOT NULL CHECK (tipo_contrato IN ('clt','autonomo','pj')),
  data_inicio     date          NOT NULL,
  data_fim        date,
  observacao      text,
  created_at      timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_historico_contrato_colaborador
  ON public.colaborador_historico_contrato (colaborador_id);
ALTER TABLE public.colaborador_historico_contrato ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='colaborador_historico_contrato' AND policyname='hc_all') THEN
    EXECUTE $p$ CREATE POLICY hc_all ON public.colaborador_historico_contrato FOR ALL TO authenticated USING (true) WITH CHECK (true) $p$;
  END IF;
END $$;

-- configuracoes empresa
INSERT INTO public.configuracoes (chave, valor) VALUES
  ('empresa_razao_social',''),('empresa_email',''),
  ('empresa_endereco',''),('empresa_cidade',''),
  ('empresa_cep',''),('empresa_logo_url','')
ON CONFLICT (chave) DO NOTHING;

-- storage bucket documentos
INSERT INTO storage.buckets (id, name, public) VALUES ('documentos','documentos',true) ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_upload') THEN EXECUTE $p$ CREATE POLICY documentos_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='documentos') $p$; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_select_public') THEN EXECUTE $p$ CREATE POLICY documentos_select_public ON storage.objects FOR SELECT TO public USING (bucket_id='documentos') $p$; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='documentos_delete') THEN EXECUTE $p$ CREATE POLICY documentos_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='documentos') $p$; END IF; END $$;

