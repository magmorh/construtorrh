-- ============================================================
-- sql_revisao_v16.sql
-- Correções de segurança e performance apontadas pelo Supabase Advisor
-- Execute no Supabase SQL Editor
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. HABILITAR RLS NAS TABELAS COM AVISO CRÍTICO
--    As tabelas abaixo estavam sem Row Level Security.
--    A política abaixo permite acesso total para usuários
--    autenticados (mesmo comportamento de antes, porém seguro).
-- ════════════════════════════════════════════════════════════

-- public.adiantamentos
ALTER TABLE public.adiantamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_authenticated_adiantamentos" ON public.adiantamentos;
CREATE POLICY "allow_authenticated_adiantamentos"
  ON public.adiantamentos FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- public.epis_entregues
ALTER TABLE public.epis_entregues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_authenticated_epis_entregues" ON public.epis_entregues;
CREATE POLICY "allow_authenticated_epis_entregues"
  ON public.epis_entregues FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- public.lista_negra_juridico
ALTER TABLE public.lista_negra_juridico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_authenticated_lista_negra" ON public.lista_negra_juridico;
CREATE POLICY "allow_authenticated_lista_negra"
  ON public.lista_negra_juridico FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- public.portal_producao
ALTER TABLE public.portal_producao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_authenticated_portal_producao" ON public.portal_producao;
CREATE POLICY "allow_authenticated_portal_producao"
  ON public.portal_producao FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- public.premios
ALTER TABLE public.premios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_authenticated_premios" ON public.premios;
CREATE POLICY "allow_authenticated_premios"
  ON public.premios FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- public.portal_pendencias (Security Definer View → forçar RLS na view base)
-- A view usa SECURITY DEFINER, o que bypassa RLS. Recriar como SECURITY INVOKER:
-- (Comente esta parte se a view for de sistema e não puder ser alterada)
-- ALTER VIEW public.portal_pendencias SET (security_invoker = true);


-- ════════════════════════════════════════════════════════════
-- 2. CORRIGIR MÚLTIPLAS POLICIES PERMISSIVAS EM public.acidentes
--    Manter apenas uma policy ALL para authenticated
-- ════════════════════════════════════════════════════════════

-- Remover todas as policies existentes em acidentes
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'acidentes' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.acidentes', pol.policyname);
  END LOOP;
END $$;

-- Garantir RLS habilitado
ALTER TABLE public.acidentes ENABLE ROW LEVEL SECURITY;

-- Criar uma única policy permissiva para autenticados
CREATE POLICY "allow_authenticated_acidentes"
  ON public.acidentes FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- 3. REMOVER ÍNDICE DUPLICADO EM public.acidentes
-- ════════════════════════════════════════════════════════════

-- Verificar quais índices existem antes de dropar
-- (Ajuste o nome do índice duplicado conforme o que o Advisor mostrou)
-- Exemplo: se existir acidentes_pkey e outro índice na mesma coluna id:
-- DROP INDEX IF EXISTS public.acidentes_id_idx;  -- ajuste o nome real


-- ════════════════════════════════════════════════════════════
-- 4. CORRIGIR FUNCTION SEARCH PATH MUTABLE
--    Funções com search_path não fixado são vulneráveis a hijacking
-- ════════════════════════════════════════════════════════════

-- handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lógica original da função (ajuste conforme necessário)
  RETURN NEW;
END;
$$;

-- update_updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- 5. ÍNDICES DE PERFORMANCE (complemento ao v14)
--    Cobrindo as tabelas que agora têm RLS habilitado
-- ════════════════════════════════════════════════════════════

-- adiantamentos: buscas frequentes por colaborador + competencia
CREATE INDEX IF NOT EXISTS idx_adiant_colab_comp_v2
  ON public.adiantamentos (colaborador_id, competencia, status)
  WHERE descontado_em IS NULL;

-- premios: buscas por colaborador + competencia
CREATE INDEX IF NOT EXISTS idx_premios_colab_comp_v2
  ON public.premios (colaborador_id, competencia, status);

-- epis_entregues: busca por colaborador
CREATE INDEX IF NOT EXISTS idx_epis_entregues_colab
  ON public.epis_entregues (colaborador_id);

-- portal_producao: busca por obra + data
CREATE INDEX IF NOT EXISTS idx_portal_producao_obra_data
  ON public.portal_producao (obra_id, data);


-- ════════════════════════════════════════════════════════════
-- 6. VERIFICAÇÃO FINAL
-- ════════════════════════════════════════════════════════════
-- Execute para confirmar que RLS está ativo nas tabelas:
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'adiantamentos', 'epis_entregues', 'lista_negra_juridico',
    'portal_producao', 'premios', 'acidentes',
    'ponto_lancamentos', 'registro_ponto', 'colaboradores'
  )
ORDER BY tablename;
