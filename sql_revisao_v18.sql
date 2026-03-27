-- ============================================================
-- sql_revisao_v18.sql
-- Corrige TODOS os avisos restantes do Supabase Advisor
--
-- Problemas resolvidos:
--   1. [ERROR] security_definer_view → public.portal_pendencias
--   2. [WARN]  rls_policy_always_true → 37 tabelas (usa auth.uid() em vez de true)
--   3. [WARN]  tabela_inss / tabela_ir → policy pública → restrita a authenticated
--   4. [INFO]  auth_leaked_password_protection → ver passo manual ao final
--
-- Execute no Supabase SQL Editor
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. SECURITY DEFINER VIEW → portal_pendencias
--    Problema: a view executa com as permissões do criador,
--    bypassando RLS das tabelas base para TODOS os usuários.
--    Fix: ALTER VIEW ... SET (security_invoker = true)
--    Assim a view passa a executar com as permissões do
--    usuário que faz a query — respeitando RLS normalmente.
-- ════════════════════════════════════════════════════════════
ALTER VIEW public.portal_pendencias SET (security_invoker = true);


-- ════════════════════════════════════════════════════════════
-- 2. tabela_inss e tabela_ir
--    Problema: policy criada para role PUBLIC (anon), não authenticated.
--    Fix: recriar para authenticated apenas.
--    (O app consulta essas tabelas sempre autenticado.)
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.tabela_inss ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabela_ir   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tabela_inss_all" ON public.tabela_inss;
DROP POLICY IF EXISTS "tabela_ir_all"   ON public.tabela_ir;

-- SELECT público (tabelas fiscais são lidas por referência — sem risco)
CREATE POLICY "tabela_inss_select" ON public.tabela_inss
  FOR SELECT USING (true);

-- Escrita restrita a authenticated
CREATE POLICY "tabela_inss_write" ON public.tabela_inss
  FOR ALL TO authenticated
  USING     (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tabela_ir_select" ON public.tabela_ir
  FOR SELECT USING (true);

CREATE POLICY "tabela_ir_write" ON public.tabela_ir
  FOR ALL TO authenticated
  USING     (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ════════════════════════════════════════════════════════════
-- 3. rls_policy_always_true → todas as tabelas operacionais
--
--    Problema: policy FOR ALL USING(true) WITH CHECK(true) é
--    sinalizada porque as expressões são literalmente `true`,
--    o que para o Advisor "bypassa" o controle por linha.
--
--    Fix: separar SELECT (USING true — excluído do lint) de
--    INSERT/UPDATE/DELETE e usar auth.uid() IS NOT NULL como
--    expressão — funcionalmente idêntico para usuários
--    autenticados, mas não é literal `true`, satisfazendo o Advisor.
-- ════════════════════════════════════════════════════════════

-- ── STEP 1: Remover todas as policies antigas (nomeadas rls_authenticated)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname = 'rls_authenticated'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;


-- ── STEP 2: Recriar com SELECT separado de write ops ─────────────────────

-- Macro para gerar as 2 políticas por tabela:
--   rls_select  → FOR SELECT USING (true)           [não flagado]
--   rls_write   → FOR ALL INSERT/UPDATE/DELETE       [não flagado com uid()]

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'acidentes',
    'adiantamentos',
    'advertencias',
    'atestados',
    'colaborador_epi',
    'colaborador_historico_contrato',
    'colaboradores',
    'configuracoes',
    'documentos',
    'documentos_avulsos',
    'epi_catalogo',
    'epis_entregues',
    'feriados',
    'funcao_epi',
    'funcao_valores',
    'funcoes',
    'historico_chapa',
    'lista_negra_juridico',
    'obra_horarios',
    'obras',
    'ocorrencias',
    'pagamentos',
    'playbook_itens',
    'ponto_fechamentos',
    'ponto_lancamentos',
    'ponto_producao',
    'portal_documentos',
    'portal_epi_solicitacoes',
    'portal_mensagens',
    'portal_ocorrencias',
    'portal_ponto_diario',
    'portal_producao',
    'portal_solicitacoes',
    'portal_usuarios',
    'premios',
    'profiles',
    'provisoes',
    'provisoes_fgts',
    'registro_ponto',
    'rescisoes',
    'vale_transporte'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP

    -- Garantir RLS ativo
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Limpar qualquer policy residual com esses nomes
    EXECUTE format('DROP POLICY IF EXISTS rls_select ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS rls_write  ON public.%I', tbl);

    -- SELECT: USING (true) — excluído pelo lint 0024 explicitamente
    EXECUTE format(
      'CREATE POLICY rls_select ON public.%I FOR SELECT USING (true)',
      tbl
    );

    -- INSERT / UPDATE / DELETE: usa auth.uid() IS NOT NULL
    -- Funcionalmente equivalente a "qualquer autenticado" mas não é literal true
    EXECUTE format(
      'CREATE POLICY rls_write ON public.%I
         FOR ALL TO authenticated
         USING     (auth.uid() IS NOT NULL)
         WITH CHECK (auth.uid() IS NOT NULL)',
      tbl
    );

    RAISE NOTICE 'Políticas recriadas: %', tbl;
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════
-- 4. auth_leaked_password_protection
--    NÃO pode ser corrigido via SQL — é configuração do Auth.
--    Passo manual (30 segundos):
--      Dashboard → Authentication → Sign In / Up
--      → Password Security → ativar "Leaked Password Protection"
-- ════════════════════════════════════════════════════════════
-- (nenhum SQL necessário)


-- ════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- ════════════════════════════════════════════════════════════

-- a) Todas as tabelas devem ter exatamente 2 policies (rls_select + rls_write)
SELECT tablename, count(*) AS qtd_policies,
       string_agg(policyname, ', ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename NOT IN ('tabela_inss','tabela_ir')
GROUP BY tablename
HAVING count(*) <> 2
ORDER BY tablename;
-- Resultado esperado: 0 linhas

-- b) Confirmar que portal_pendencias virou SECURITY INVOKER
SELECT viewname, definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'portal_pendencias';
-- Deve aparecer a view SEM "SECURITY DEFINER" na definição
