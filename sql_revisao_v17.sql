-- ============================================================
-- sql_revisao_v17.sql
-- Corrige TODAS as "RLS Policy Always True" duplicadas
-- e "Multiple Permissive Policies" apontadas pelo Supabase Advisor
--
-- O problema: cada tabela tem 2-5 policies ALL duplicadas,
-- forçando o PostgreSQL a avaliar N predicados por query.
-- Solução: dropar todas e recriar UMA única policy por tabela.
--
-- Execute no Supabase SQL Editor
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- HELPER: remover TODAS as policies de uma tabela de uma vez
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        -- Tabelas com Multiple Permissive Policies ou RLS Always True duplicadas
        'acidentes',
        'advertencias',
        'atestados',
        'colaborador_epi',
        'colaborador_historico_contrato',
        'colaboradores',
        'configuracoes',
        'documentos_avulsos',
        'documentos',
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
        'provisoes_fgts',
        'provisoes',
        'registro_ponto',
        'rescisoes',
        'adiantamentos',
        'vale_transporte',
        'feriados'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════
-- RECRIAR: uma única policy por tabela (autenticados = acesso total)
-- ════════════════════════════════════════════════════════════

-- Módulo RH / Colaboradores
ALTER TABLE public.colaboradores                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaborador_epi              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colaborador_historico_contrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_chapa              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcoes                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcao_valores               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funcao_epi                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_authenticated" ON public.colaboradores                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.colaborador_epi              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.colaborador_historico_contrato FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.historico_chapa              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.funcoes                      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.funcao_valores               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.funcao_epi                   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.configuracoes                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.profiles                     FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Módulo Obras / Ponto
ALTER TABLE public.obras                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obra_horarios                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playbook_itens               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ponto_lancamentos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ponto_producao               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ponto_fechamentos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_ponto               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feriados                     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_authenticated" ON public.obras                        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.obra_horarios                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.playbook_itens               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.ponto_lancamentos            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.ponto_producao               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.ponto_fechamentos            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.registro_ponto               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.feriados                     FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Módulo Financeiro
ALTER TABLE public.adiantamentos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vale_transporte              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premios                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provisoes                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provisoes_fgts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rescisoes                    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_authenticated" ON public.adiantamentos                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.vale_transporte              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.premios                      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.pagamentos                   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.provisoes                    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.provisoes_fgts               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.rescisoes                    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Módulo Documentos / EPIs
ALTER TABLE public.documentos                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_avulsos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epi_catalogo                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epis_entregues               ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_authenticated" ON public.documentos                   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.documentos_avulsos           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.epi_catalogo                 FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.epis_entregues               FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Módulo Saúde / Ocorrências
ALTER TABLE public.atestados                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acidentes                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertencias                 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_authenticated" ON public.atestados                    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.ocorrencias                  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.acidentes                    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.advertencias                 FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Módulo Jurídico
ALTER TABLE public.lista_negra_juridico         ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_authenticated" ON public.lista_negra_juridico         FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Portal da Obra
ALTER TABLE public.portal_usuarios              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_ponto_diario          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_producao              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_solicitacoes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_mensagens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_ocorrencias           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_documentos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_epi_solicitacoes      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_authenticated" ON public.portal_usuarios              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.portal_ponto_diario          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.portal_producao              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.portal_solicitacoes          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.portal_mensagens             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.portal_ocorrencias           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.portal_documentos            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "rls_authenticated" ON public.portal_epi_solicitacoes      FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- REMOVER ÍNDICES DUPLICADOS
-- (Duplicate Index em public.acidentes e public.advertencias)
-- ════════════════════════════════════════════════════════════
-- O Supabase mantém o índice da PRIMARY KEY automaticamente.
-- Qualquer outro índice na mesma coluna "id" é redundante.
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Buscar índices duplicados (mesmo conjunto de colunas, não é PK, não é unique constraint)
  FOR r IN
    SELECT i.indexname, i.tablename
    FROM pg_indexes i
    WHERE i.schemaname = 'public'
      AND i.tablename IN ('acidentes', 'advertencias')
      AND i.indexname NOT LIKE '%_pkey'
      AND i.indexname NOT LIKE '%_key'
      AND i.indexdef LIKE '% ON public.%(%id%)'
      -- Apenas índices simples na coluna id (os PKs já cobrem)
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
    RAISE NOTICE 'Dropped duplicate index: %', r.indexname;
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL
-- Execute para confirmar: cada tabela deve ter exatamente 1 policy
-- ════════════════════════════════════════════════════════════
SELECT tablename, count(*) as qtd_policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
HAVING count(*) > 1
ORDER BY qtd_policies DESC;
-- Resultado esperado: nenhuma linha (todas as tabelas com 1 policy apenas)
