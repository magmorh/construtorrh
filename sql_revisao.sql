-- ============================================================
--  SCRIPT DE REVISÃO SQL — ConstrutorRH
--  Cole este conteúdo no SQL Editor do Supabase e execute.
--  Todas as operações usam IF NOT EXISTS / IF EXISTS para
--  serem seguras mesmo se o banco já estiver parcialmente
--  atualizado.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. TABELA: adiantamentos
--    Nova coluna: requisicao_url (URL do PDF/imagem assinado)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS requisicao_url text;


-- ─────────────────────────────────────────────────────────────
-- 2. TABELA: ponto_lancamentos
--    Colunas snap_* usadas em Pagamentos, Encargos e Jurídico.
--    (Já podem existir — ADD COLUMN IF NOT EXISTS é seguro)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS snap_valor_total    numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_liquido        numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_horas          numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_dsr            numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_producao       numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_premio         numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_vt             numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_ad             numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_inss           numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_ir             numeric(12,2),
  -- aliases usados em Pagamentos.tsx (snap_desconto_vt / snap_desconto_adiant)
  ADD COLUMN IF NOT EXISTS snap_desconto_vt    numeric(12,2),
  ADD COLUMN IF NOT EXISTS snap_desconto_adiant numeric(12,2);


-- ─────────────────────────────────────────────────────────────
-- 3. TABELA: rescisoes  (NOVA — criada pela página Provisões Rescisão)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rescisoes (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id             uuid        NOT NULL
                               REFERENCES public.colaboradores(id) ON DELETE RESTRICT,
  data_rescisao              date        NOT NULL,
  tipo                       text        NOT NULL
                               CHECK (tipo IN (
                                 'sem_justa_causa',
                                 'com_justa_causa',
                                 'pedido_demissao',
                                 'acordo',
                                 'aposentadoria',
                                 'outros'
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


-- ─────────────────────────────────────────────────────────────
-- 4. RLS — Row Level Security para rescisoes
--    Ajuste as policies conforme sua estrutura de autenticação.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.rescisoes ENABLE ROW LEVEL SECURITY;

-- Permitir SELECT para todos os usuários autenticados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rescisoes' AND policyname = 'rescisoes_select'
  ) THEN
    CREATE POLICY rescisoes_select
      ON public.rescisoes FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

-- Permitir INSERT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rescisoes' AND policyname = 'rescisoes_insert'
  ) THEN
    CREATE POLICY rescisoes_insert
      ON public.rescisoes FOR INSERT
      TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- Permitir UPDATE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rescisoes' AND policyname = 'rescisoes_update'
  ) THEN
    CREATE POLICY rescisoes_update
      ON public.rescisoes FOR UPDATE
      TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Permitir DELETE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rescisoes' AND policyname = 'rescisoes_delete'
  ) THEN
    CREATE POLICY rescisoes_delete
      ON public.rescisoes FOR DELETE
      TO authenticated USING (true);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────
-- 5. STORAGE — Bucket "documentos" (para requisições de AD)
--    Execute apenas se o bucket ainda não existir.
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: qualquer autenticado pode fazer upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies
    WHERE bucket_id = 'documentos' AND name = 'docs_upload'
  ) THEN
    INSERT INTO storage.policies (bucket_id, name, definition, operation)
    VALUES (
      'documentos',
      'docs_upload',
      '(role() = ''authenticated'')',
      'INSERT'
    );
  END IF;
END $$;

-- Policy: leitura pública (URLs públicas funcionam)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies
    WHERE bucket_id = 'documentos' AND name = 'docs_select'
  ) THEN
    INSERT INTO storage.policies (bucket_id, name, definition, operation)
    VALUES (
      'documentos',
      'docs_select',
      'true',
      'SELECT'
    );
  END IF;
END $$;
