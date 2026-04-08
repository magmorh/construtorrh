-- CONSTRUTOR RH — Fix RLS portal_ponto_diario para anon (portal colaborador)
-- Execute no Supabase SQL Editor

-- Garantir que anon pode ler seus próprios pontos no portal
ALTER TABLE portal_ponto_diario ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas conflitantes
DROP POLICY IF EXISTS "portal_ponto_anon_select" ON portal_ponto_diario;
DROP POLICY IF EXISTS "anon_select_ponto" ON portal_ponto_diario;
DROP POLICY IF EXISTS "portal anon select ponto" ON portal_ponto_diario;

-- Nova política: anon pode ler todos os registros (colaborador filtra pelo proprio colaborador_id no frontend)
-- Isso é necessário pois o portal usa chave anon e não tem JWT para RLS row-by-row
CREATE POLICY "portal_ponto_anon_select"
  ON portal_ponto_diario FOR SELECT TO anon
  USING (true);

-- Authenticated (gestor/admin): acesso total
DROP POLICY IF EXISTS "portal_ponto_auth_all" ON portal_ponto_diario;
CREATE POLICY "portal_ponto_auth_all"
  ON portal_ponto_diario FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Verificar
-- SELECT policyname, cmd, roles FROM pg_policies WHERE tablename='portal_ponto_diario';
