-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — Fix: Portal Contracheque — RLS e acesso colaboradores
-- Execute no Supabase SQL Editor (seguro re-executar — IF NOT EXISTS / OR REPLACE)
-- ═══════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────
-- 1. CORRIGIR RLS da tabela colaboradores para o portal anon
--    PROBLEMA: a policy anterior bloqueava colaboradores com status 'ferias'
--    e 'afastado', impedindo que eles vissem seus contracheques no portal.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;

-- Remover policy restritiva anterior
DROP POLICY IF EXISTS "portal anon read colaboradores" ON colaboradores;

-- Nova policy: anon pode ler colaboradores ativos, afastados e em férias
-- (todos que podem ter contracheques para visualizar)
CREATE POLICY "portal anon read colaboradores"
  ON colaboradores FOR SELECT TO anon
  USING (status IN ('ativo', 'afastado', 'ferias', 'inativo'));

-- Garantir policy para authenticated (RH/Admin)
DROP POLICY IF EXISTS "colaboradores_all" ON colaboradores;
CREATE POLICY "colaboradores_all"
  ON colaboradores FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 2. GARANTIR RLS da tabela funcoes para anon (join no portal)
--    PROBLEMA: o portal agora busca funcoes(nome) via join, 
--    se a tabela funcoes não permitir leitura anon o join retorna null.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE funcoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal anon read funcoes" ON funcoes;
CREATE POLICY "portal anon read funcoes"
  ON funcoes FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "funcoes_all" ON funcoes;
CREATE POLICY "funcoes_all"
  ON funcoes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 3. GARANTIR que contracheques_anon_select está correto
--    (portal usa chave anon para ler holerites publicados)
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE contracheques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contracheques_anon_select" ON contracheques;
CREATE POLICY "contracheques_anon_select"
  ON contracheques FOR SELECT TO anon
  USING (publicado = true);

-- Garantir acesso total para authenticated (RH/Admin)
DROP POLICY IF EXISTS "contracheques_auth_all"  ON contracheques;
DROP POLICY IF EXISTS "contracheques_all"        ON contracheques;
CREATE POLICY "contracheques_auth_all"
  ON contracheques FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 4. GARANTIR que colaborador_acessos tem acesso anon correto
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE colaborador_acessos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rh_full_access"   ON colaborador_acessos;
DROP POLICY IF EXISTS "portal_read_own"  ON colaborador_acessos;
DROP POLICY IF EXISTS "portal_update_own" ON colaborador_acessos;

CREATE POLICY "rh_full_access"
  ON colaborador_acessos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "portal_read_own"
  ON colaborador_acessos FOR SELECT TO anon
  USING (true);

CREATE POLICY "portal_update_own"
  ON colaborador_acessos FOR UPDATE TO anon
  USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- VERIFICAÇÃO — execute separado para confirmar as policies
-- ──────────────────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd, roles::text
-- FROM pg_policies
-- WHERE tablename IN (
--   'colaboradores','funcoes','contracheques','colaborador_acessos'
-- )
-- ORDER BY tablename, cmd;
