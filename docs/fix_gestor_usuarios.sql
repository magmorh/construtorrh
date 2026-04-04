-- ============================================================
-- SQL: Tabela gestor_usuarios (Portal do Gestor)
-- Execute no Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS gestor_usuarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login       TEXT NOT NULL UNIQUE,
  nome        TEXT,
  senha_hash  TEXT NOT NULL,
  obras_ids   UUID[] NOT NULL DEFAULT '{}',
  nivel       TEXT NOT NULL DEFAULT 'gestor',  -- 'gestor' | 'master'
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gestor_usuarios_login ON gestor_usuarios (login);

ALTER TABLE gestor_usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gestor_usuarios_all" ON gestor_usuarios;
CREATE POLICY "gestor_usuarios_all" ON gestor_usuarios
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gestor_usuarios_updated_at ON gestor_usuarios;
CREATE TRIGGER gestor_usuarios_updated_at
  BEFORE UPDATE ON gestor_usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

SELECT 'gestor_usuarios criada com sucesso!' AS resultado;
