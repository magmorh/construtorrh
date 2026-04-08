-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — Documentos do Colaborador (Portal)
-- 
-- OBJETIVO: Criar tabela para documentos pessoais dos colaboradores
-- (contrato de trabalho, ficha admissional, rescisão, etc.) que podem
-- ser visualizados pelo colaborador no Portal (aba "Meus Documentos").
--
-- SEGURO re-executar (IF NOT EXISTS / OR REPLACE)
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Tabela colaborador_documentos
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colaborador_documentos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  colaborador_id      uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,

  -- Tipo: contrato_trabalho | admissao | rescisao | exame_medico | ferias | comprovante | outro
  tipo                text NOT NULL DEFAULT 'outro',
  titulo              text NOT NULL,
  descricao           text,

  -- URL do arquivo (Supabase Storage ou externo)
  arquivo_url         text,

  -- Controle de visibilidade no portal do colaborador
  visivel_colaborador boolean NOT NULL DEFAULT false,

  -- Criado / atualizado por
  criado_por          uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Data em que o colaborador "assinou" ou confirmou leitura (opcional)
  assinou_em          timestamptz,

  -- Referência ao contrato gerado (opcional)
  contrato_gerado_id  uuid REFERENCES contratos_gerados(id) ON DELETE SET NULL,

  criado_em           timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_colab_docs_colaborador ON colaborador_documentos(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_colab_docs_visivel     ON colaborador_documentos(colaborador_id, visivel_colaborador);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. RLS — Row Level Security
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE colaborador_documentos ENABLE ROW LEVEL SECURITY;

-- Authenticated (RH/Admin): acesso total
DROP POLICY IF EXISTS "colab_docs_auth_all" ON colaborador_documentos;
CREATE POLICY "colab_docs_auth_all"
  ON colaborador_documentos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Anon (Portal do colaborador): só lê os próprios documentos habilitados
DROP POLICY IF EXISTS "colab_docs_anon_select" ON colaborador_documentos;
CREATE POLICY "colab_docs_anon_select"
  ON colaborador_documentos FOR SELECT TO anon
  USING (visivel_colaborador = true);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Trigger de updated_at
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_colaborador_documentos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_colab_docs_updated_at ON colaborador_documentos;
CREATE TRIGGER trg_colab_docs_updated_at
  BEFORE UPDATE ON colaborador_documentos
  FOR EACH ROW EXECUTE FUNCTION update_colaborador_documentos_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 4. VERIFICAÇÃO
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'colaborador_documentos';
-- SELECT id, colaborador_id, titulo, tipo, visivel_colaborador FROM colaborador_documentos LIMIT 10;
