-- ============================================================
-- ConstrutorRH — Migration: Contracheques + Portal Colaborador
-- Execute no Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Tabela de holerites/contracheques
CREATE TABLE IF NOT EXISTS contracheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  tipo varchar(30) NOT NULL DEFAULT 'mensal',
  descricao text,
  arquivo_url text,
  arquivo_nome text,
  bruto numeric(12,2),
  liquido numeric(12,2),
  descontos numeric(12,2),
  inss numeric(12,2),
  fgts numeric(12,2),
  irrf numeric(12,2),
  publicado boolean NOT NULL DEFAULT false,
  publicado_em timestamptz,
  CONSTRAINT contracheques_tipo_check CHECK (tipo IN ('mensal','13o_1a','13o_2a','ferias','adiantamento'))
);

-- Tabela de acesso portal do colaborador (para contracheque)
CREATE TABLE IF NOT EXISTS colaboradores_portal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  colaborador_id uuid NOT NULL UNIQUE REFERENCES colaboradores(id) ON DELETE CASCADE,
  login varchar(60) NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_acesso timestamptz,
  acesso_contracheque boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_contracheques_colab ON contracheques(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_contracheques_comp  ON contracheques(competencia DESC);
CREATE INDEX IF NOT EXISTS idx_colabportal_login   ON colaboradores_portal(login);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE contracheques         ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaboradores_portal  ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados (admin/rh) têm acesso total
CREATE POLICY "contracheques_auth_all"
  ON contracheques FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "colabportal_auth_all"
  ON colaboradores_portal FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Anon pode SELECT em contracheques (portal do colaborador usa anon key + filtro por id)
CREATE POLICY "contracheques_anon_select"
  ON contracheques FOR SELECT
  TO anon
  USING (publicado = true);

-- Anon pode SELECT em colaboradores_portal (para validar login/senha)
CREATE POLICY "colabportal_anon_select"
  ON colaboradores_portal FOR SELECT
  TO anon
  USING (ativo = true);

-- Anon pode UPDATE ultimo_acesso em colaboradores_portal
CREATE POLICY "colabportal_anon_update_acesso"
  ON colaboradores_portal FOR UPDATE
  TO anon
  USING (ativo = true)
  WITH CHECK (ativo = true);
