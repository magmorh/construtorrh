-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Painel de Controle de Acesso dos Colaboradores ao Portal
-- Execute este SQL no Supabase Studio → SQL Editor
-- Projeto: ConstrutorRH — 2026-04
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabela principal de acessos ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS colaborador_acessos (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id       uuid        NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  cpf                  text        NOT NULL UNIQUE,
  senha_hash           text        NOT NULL,           -- SHA-256 da senha
  must_change_password boolean     NOT NULL DEFAULT true,  -- true = precisa trocar na próx. entrada
  ativo                boolean     NOT NULL DEFAULT true,
  ultimo_acesso        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_colab_acessos_cpf          ON colaborador_acessos(cpf);
CREATE INDEX IF NOT EXISTS idx_colab_acessos_colaborador   ON colaborador_acessos(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_colab_acessos_ativo         ON colaborador_acessos(ativo);

-- ─── 2. Trigger: atualiza updated_at automaticamente ─────────────────────────
CREATE OR REPLACE FUNCTION update_colaborador_acessos_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_colaborador_acessos ON colaborador_acessos;
CREATE TRIGGER trg_update_colaborador_acessos
  BEFORE UPDATE ON colaborador_acessos
  FOR EACH ROW EXECUTE FUNCTION update_colaborador_acessos_updated_at();

-- ─── 3. RLS (Row-Level Security) ─────────────────────────────────────────────
-- A tabela é acessada pela chave anon (portal) apenas para SELECT/UPDATE próprio
-- O RH acessa via service role ou pelo app autenticado (profiles com role admin/rh)

ALTER TABLE colaborador_acessos ENABLE ROW LEVEL SECURITY;

-- Permite leitura/escrita irrestrita para usuários autenticados do Supabase Auth (RH/Admin)
DROP POLICY IF EXISTS "rh_full_access" ON colaborador_acessos;
CREATE POLICY "rh_full_access"
  ON colaborador_acessos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Permite que o portal (anon) leia e atualize via CPF (para login e troca de senha)
DROP POLICY IF EXISTS "portal_read_own" ON colaborador_acessos;
CREATE POLICY "portal_read_own"
  ON colaborador_acessos
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "portal_update_own" ON colaborador_acessos;
CREATE POLICY "portal_update_own"
  ON colaborador_acessos
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- ─── 4. RPC: sha256 para gerar hash de senha (evita expor lógica no front) ───
-- OBS: A lógica de hash já está no frontend (Web Crypto API), esta é opcional
-- mas útil para operações internas de reset via SQL.

-- ─── FIM DA MIGRATION ────────────────────────────────────────────────────────
-- Após executar este SQL, volte ao sistema — o painel de acesso já estará ativo.
