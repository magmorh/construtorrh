-- ============================================================
-- 006_fix_ocorrencias.sql
-- Correção definitiva das tabelas acidentes e atestados
-- Execute no Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ACIDENTES
-- ────────────────────────────────────────────────────────────

-- 1. Remover constraints CHECK antigas que bloqueiam os valores
ALTER TABLE public.acidentes DROP CONSTRAINT IF EXISTS acidentes_tipo_check;
ALTER TABLE public.acidentes DROP CONSTRAINT IF EXISTS acidentes_status_check;
ALTER TABLE public.acidentes DROP CONSTRAINT IF EXISTS acidentes_gravidade_check;

-- 2. Renomear colunas legadas → novo padrão (com segurança)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acidentes' AND column_name='data_acidente')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acidentes' AND column_name='data_ocorrencia')
  THEN
    ALTER TABLE public.acidentes RENAME COLUMN data_acidente TO data_ocorrencia;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acidentes' AND column_name='hora_acidente')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acidentes' AND column_name='hora_ocorrencia')
  THEN
    ALTER TABLE public.acidentes RENAME COLUMN hora_acidente TO hora_ocorrencia;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acidentes' AND column_name='tipo')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acidentes' AND column_name='tipo_acidente')
  THEN
    ALTER TABLE public.acidentes RENAME COLUMN tipo TO tipo_acidente;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acidentes' AND column_name='cat_emitida')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acidentes' AND column_name='comunicado_cat')
  THEN
    ALTER TABLE public.acidentes RENAME COLUMN cat_emitida TO comunicado_cat;
  END IF;
END $$;

-- 3. Garantir que as colunas existam (caso as renomeações já tenham ocorrido)
ALTER TABLE public.acidentes
  ADD COLUMN IF NOT EXISTS data_ocorrencia  DATE,
  ADD COLUMN IF NOT EXISTS hora_ocorrencia  TIME,
  ADD COLUMN IF NOT EXISTS tipo_acidente    TEXT,
  ADD COLUMN IF NOT EXISTS comunicado_cat   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS descricao        TEXT,
  ADD COLUMN IF NOT EXISTS observacoes      TEXT,
  ADD COLUMN IF NOT EXISTS obra_id          UUID REFERENCES public.obras(id);

-- ────────────────────────────────────────────────────────────
-- ATESTADOS
-- ────────────────────────────────────────────────────────────

-- 1. Remover constraints CHECK antigas
ALTER TABLE public.atestados DROP CONSTRAINT IF EXISTS atestados_tipo_check;

-- 2. Renomear data → data_inicio
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atestados' AND column_name='data')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atestados' AND column_name='data_inicio')
  THEN
    ALTER TABLE public.atestados RENAME COLUMN data TO data_inicio;
  END IF;
END $$;

-- 3. Garantir colunas existam
ALTER TABLE public.atestados
  ADD COLUMN IF NOT EXISTS data_inicio       DATE,
  ADD COLUMN IF NOT EXISTS data_fim          DATE,
  ADD COLUMN IF NOT EXISTS dias_afastamento  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tipo_afastamento  TEXT,
  ADD COLUMN IF NOT EXISTS cid               TEXT,
  ADD COLUMN IF NOT EXISTS medico            TEXT,
  ADD COLUMN IF NOT EXISTS crm               TEXT,
  ADD COLUMN IF NOT EXISTS acidente_id       UUID REFERENCES public.acidentes(id),
  ADD COLUMN IF NOT EXISTS observacoes       TEXT;

-- ────────────────────────────────────────────────────────────
-- COLABORADORES: garantir colunas extras
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS pix_tipo TEXT,
  ADD COLUMN IF NOT EXISTS vt_dados JSONB DEFAULT '{}';

-- Fix constraint tipo_contrato para incluir 'autonomo'
ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colaboradores_tipo_contrato_check;
ALTER TABLE public.colaboradores
  ADD CONSTRAINT colaboradores_tipo_contrato_check
  CHECK (tipo_contrato IN ('clt','autonomo','temporario','aprendiz','estagiario','pj'));

-- ────────────────────────────────────────────────────────────
-- COLABORADOR_EPI
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.colaborador_epi
  ADD COLUMN IF NOT EXISTS tamanho        TEXT,
  ADD COLUMN IF NOT EXISTS numero         TEXT,
  ADD COLUMN IF NOT EXISTS data_entrega   DATE,
  ADD COLUMN IF NOT EXISTS status         TEXT DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS documento_url  TEXT,
  ADD COLUMN IF NOT EXISTS documento_nome TEXT,
  ADD COLUMN IF NOT EXISTS observacoes    TEXT;

-- Unique constraint para upsert seguro
ALTER TABLE public.colaborador_epi
  DROP CONSTRAINT IF EXISTS colaborador_epi_unico;
ALTER TABLE public.colaborador_epi
  ADD CONSTRAINT colaborador_epi_unico UNIQUE (colaborador_id, epi_id);

-- ────────────────────────────────────────────────────────────
-- FUNCAO_EPI
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.funcao_epi
  ADD COLUMN IF NOT EXISTS obrigatorio BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS quantidade  INTEGER DEFAULT 1;

-- ────────────────────────────────────────────────────────────
-- HISTORICO_CHAPA
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historico_chapa (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id  UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  funcao_id       UUID REFERENCES public.funcoes(id),
  tipo_contrato   TEXT,
  chapa           TEXT NOT NULL,
  data_inicio     DATE NOT NULL,
  data_fim        DATE,
  motivo_troca    TEXT
);

-- RLS historico_chapa
ALTER TABLE public.historico_chapa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all_historico_chapa" ON public.historico_chapa;
CREATE POLICY "authenticated_all_historico_chapa"
  ON public.historico_chapa FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- EPI_CATALOGO: colunas extras
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.epi_catalogo
  ADD COLUMN IF NOT EXISTS categoria       TEXT,
  ADD COLUMN IF NOT EXISTS numero_ca       TEXT,
  ADD COLUMN IF NOT EXISTS unidade         TEXT DEFAULT 'unidade',
  ADD COLUMN IF NOT EXISTS requer_tamanho  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS requer_numero   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS vida_util_meses INTEGER,
  ADD COLUMN IF NOT EXISTS ativo           BOOLEAN DEFAULT true;

-- ────────────────────────────────────────────────────────────
-- FUNCOES: contratos_valores
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.funcoes
  ADD COLUMN IF NOT EXISTS sigla             TEXT,
  ADD COLUMN IF NOT EXISTS contratos_valores JSONB DEFAULT '{}';

-- ────────────────────────────────────────────────────────────
-- Storage bucket EPI documentos
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('epi-documentos', 'epi-documentos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies storage
DROP POLICY IF EXISTS "Authenticated can upload EPI docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read EPI docs"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete EPI docs" ON storage.objects;

CREATE POLICY "Authenticated can upload EPI docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'epi-documentos');

CREATE POLICY "Authenticated can read EPI docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'epi-documentos');

CREATE POLICY "Authenticated can delete EPI docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'epi-documentos');

CREATE POLICY "Public read EPI docs"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'epi-documentos');
