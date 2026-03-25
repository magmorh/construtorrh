-- ============================================================
-- SCRIPT COMPLETO — Portal Documentos + EPIs + Aprovações
-- Execute inteiro de uma vez no Supabase SQL Editor
-- ============================================================

-- ── 1. portal_solicitacoes: colunas de aprovação ─────────────
ALTER TABLE portal_solicitacoes
  ADD COLUMN IF NOT EXISTS aprovado_por   text,
  ADD COLUMN IF NOT EXISTS aprovado_em    timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_nome  text;

-- ── 2. portal_ocorrencias: colunas de aprovação + status ─────
ALTER TABLE portal_ocorrencias
  ADD COLUMN IF NOT EXISTS status         text    DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS motivo_recusa  text,
  ADD COLUMN IF NOT EXISTS aprovado_por   uuid,
  ADD COLUMN IF NOT EXISTS aprovado_em    timestamptz,
  ADD COLUMN IF NOT EXISTS aprovado_nome  text;

UPDATE portal_ocorrencias SET status = 'pendente' WHERE status IS NULL;

-- ── 3. Tabela portal_epi_solicitacoes ─────────────────────────
CREATE TABLE IF NOT EXISTS portal_epi_solicitacoes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid        REFERENCES obras(id)         ON DELETE CASCADE,
  colaborador_id    uuid        REFERENCES colaboradores(id) ON DELETE SET NULL,
  portal_usuario_id uuid,
  status            text        NOT NULL DEFAULT 'pendente',
  urgencia          text        NOT NULL DEFAULT 'normal',
  itens             jsonb       NOT NULL DEFAULT '[]',
  observacoes       text,
  motivo_recusa     text,
  aprovado_por      text,
  aprovado_em       timestamptz,
  aprovado_nome     text,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_epi_obra_id   ON portal_epi_solicitacoes(obra_id);
CREATE INDEX IF NOT EXISTS idx_portal_epi_status    ON portal_epi_solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_portal_epi_criado_em ON portal_epi_solicitacoes(criado_em);

ALTER TABLE portal_epi_solicitacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_epi_anon_read"   ON portal_epi_solicitacoes;
DROP POLICY IF EXISTS "portal_epi_anon_insert" ON portal_epi_solicitacoes;
DROP POLICY IF EXISTS "portal_epi_auth_all"    ON portal_epi_solicitacoes;

CREATE POLICY "portal_epi_anon_read"   ON portal_epi_solicitacoes FOR SELECT USING (true);
CREATE POLICY "portal_epi_anon_insert" ON portal_epi_solicitacoes FOR INSERT WITH CHECK (true);
CREATE POLICY "portal_epi_auth_all"    ON portal_epi_solicitacoes FOR ALL USING (auth.role() = 'authenticated');

-- ── 4. Tabela portal_documentos ───────────────────────────────
CREATE TABLE IF NOT EXISTS portal_documentos (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid        REFERENCES obras(id)         ON DELETE CASCADE,
  colaborador_id    uuid        REFERENCES colaboradores(id) ON DELETE SET NULL,
  portal_usuario_id uuid,
  tipo              text        NOT NULL DEFAULT 'foto',
  descricao         text,
  arquivo_url       text,
  arquivo_nome      text,
  arquivo_tipo      text,
  status            text        NOT NULL DEFAULT 'pendente',
  observacoes       text,
  motivo_recusa     text,
  aprovado_por      uuid,
  aprovado_em       timestamptz,
  aprovado_nome     text,
  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_docs_obra_id   ON portal_documentos(obra_id);
CREATE INDEX IF NOT EXISTS idx_portal_docs_status    ON portal_documentos(status);
CREATE INDEX IF NOT EXISTS idx_portal_docs_criado_em ON portal_documentos(criado_em);

ALTER TABLE portal_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_docs_anon_read"   ON portal_documentos;
DROP POLICY IF EXISTS "portal_docs_anon_insert" ON portal_documentos;
DROP POLICY IF EXISTS "portal_docs_auth_all"    ON portal_documentos;

CREATE POLICY "portal_docs_anon_read"   ON portal_documentos FOR SELECT USING (true);
CREATE POLICY "portal_docs_anon_insert" ON portal_documentos FOR INSERT WITH CHECK (true);
CREATE POLICY "portal_docs_auth_all"    ON portal_documentos FOR ALL USING (auth.role() = 'authenticated');

-- ── 5. Verificação final ──────────────────────────────────────
SELECT 'portal_epi_solicitacoes' AS tabela, count(*) FROM portal_epi_solicitacoes
UNION ALL
SELECT 'portal_documentos',                  count(*) FROM portal_documentos;
