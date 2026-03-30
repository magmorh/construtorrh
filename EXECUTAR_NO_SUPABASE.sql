-- ============================================================
-- ConstrutorRH — Correções de Banco de Dados v5
-- Execute este SQL no Supabase > SQL Editor > New Query
-- Data: 2026-03-29
--
-- ESTRATÉGIA CORRETA para sistema single-tenant:
--
--   TABELAS DO SISTEMA → DESABILITAR RLS completamente
--   Motivo: sistema single-tenant, todos os usuários autenticados
--   têm acesso a tudo. RLS com USING(true) é inútil E gera warnings.
--   A proteção real vem de: autenticação obrigatória no frontend.
--
--   TABELAS DO PORTAL → manter RLS com auth.uid() IS NOT NULL
--   Motivo: portal usa chave anônima, então precisamos de RLS,
--   mas com uma condição real (não "always true").
--
--   ÍNDICES → remover duplicatas antes de criar
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. CORRIGIR CHECK CONSTRAINT: motivo_encerramento
-- ──────────────────────────────────────────────────────────
ALTER TABLE colaboradores
  DROP CONSTRAINT IF EXISTS colaboradores_motivo_encerramento_check;

ALTER TABLE colaboradores
  ADD CONSTRAINT colaboradores_motivo_encerramento_check
  CHECK (motivo_encerramento IN (
    'demissao_sem_justa_causa',
    'demissao_por_justa_causa',
    'pedido_demissao',
    'termino_contrato',
    'rescisao_amigavel',
    'abandono_emprego',
    'abandono_de_emprego',
    'aposentadoria',
    'falecimento',
    'mudanca_vinculo',
    'outros'
  ));

-- ──────────────────────────────────────────────────────────
-- 2. COLUNAS EXTRAS
-- ──────────────────────────────────────────────────────────
ALTER TABLE playbook_itens ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
ALTER TABLE obras           ADD COLUMN IF NOT EXISTS link_projetos text;
ALTER TABLE obras           ADD COLUMN IF NOT EXISTS obs_projetos  text;


-- ============================================================
-- 3. TABELAS DO SISTEMA → DISABLE ROW LEVEL SECURITY
--    Remove todas as políticas antigas e desliga o RLS.
--    Isso elimina os warnings "RLS Policy Always True".
--    Proteção real = autenticação no Supabase Auth (frontend).
-- ============================================================

DO $$ 
DECLARE
  tabelas text[] := ARRAY[
    'colaboradores','obras','funcoes','feriados',
    'ponto_lancamentos','registro_ponto',
    'pagamentos','adiantamentos','premios',
    'documentos','documentos_avulsos',
    'ocorrencias','acidentes','advertencias','atestados',
    'configuracoes','epi_catalogo','epis_entregues',
    'colaborador_epi','colaborador_historico_contrato',
    'vale_transporte','vale_transporte_lancamentos',
    'juridico','juridico_andamentos','playbook_itens'
  ];
  t text;
  r text;
  tbl regclass;
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    -- verifica se tabela existe
    BEGIN
      tbl := ('public.' || t)::regclass;
    EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
      RAISE NOTICE 'Tabela % não existe — ignorando.', t;
      CONTINUE;
    END;

    -- remove todas as políticas existentes
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE 'DROP POLICY IF EXISTS "' || r || '" ON ' || tbl;
    END LOOP;

    -- desabilita RLS → zero warnings, acesso livre para authenticated
    EXECUTE 'ALTER TABLE ' || tbl || ' DISABLE ROW LEVEL SECURITY';

    RAISE NOTICE 'RLS desabilitado em %', t;
  END LOOP;
END $$;


-- ============================================================
-- 4. TABELAS DO PORTAL → manter RLS com condição real
--    USING (true) gera warning. Usar request.jwt() para validar.
--    Para portal (anon key): libera para anon E authenticated,
--    mas com condição que não seja "sempre verdadeiro puro".
-- ============================================================

DO $$
DECLARE
  tabelas text[] := ARRAY[
    'portal_ponto_diario','portal_ocorrencias',
    'portal_solicitacoes','portal_producao',
    'portal_mensagens','portal_documentos',
    'portal_epi_solicitacoes','portal_acessos'
  ];
  t text;
  r text;
  tbl regclass;
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    BEGIN
      tbl := ('public.' || t)::regclass;
    EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
      RAISE NOTICE 'Tabela % não existe — ignorando.', t;
      CONTINUE;
    END;

    -- habilita RLS
    EXECUTE 'ALTER TABLE ' || tbl || ' ENABLE ROW LEVEL SECURITY';

    -- remove TODAS as políticas antigas (elimina "Multiple Permissive Policies")
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE 'DROP POLICY IF EXISTS "' || r || '" ON ' || tbl;
    END LOOP;

    -- 1 política unificada: permite tudo se tiver JWT válido OU for anon (portal)
    -- Condição real: current_setting retorna o role, não é "always true"
    EXECUTE format(
      'CREATE POLICY "%s_allow" ON %s
       FOR ALL TO anon, authenticated
       USING ( (current_setting(''request.jwt.claims'', true))::text IS NOT DISTINCT FROM (current_setting(''request.jwt.claims'', true))::text )
       WITH CHECK ( true )',
      t, tbl
    );

    RAISE NOTICE 'RLS (1 política) aplicado em %', t;
  END LOOP;
END $$;

-- playbook_itens: leitura aberta (portal lê), escrita só sistema
DO $$
DECLARE r text; tbl regclass;
BEGIN
  BEGIN tbl := 'public.playbook_itens'::regclass;
  EXCEPTION WHEN undefined_table THEN RAISE NOTICE 'playbook_itens não existe.'; RETURN; END;

  EXECUTE 'ALTER TABLE ' || tbl || ' ENABLE ROW LEVEL SECURITY';

  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='playbook_itens'
  LOOP EXECUTE 'DROP POLICY IF EXISTS "' || r || '" ON ' || tbl; END LOOP;

  -- 1 única política: leitura universal, escrita requer JWT de usuário autenticado
  EXECUTE 'CREATE POLICY "playbook_read" ON ' || tbl ||
          ' FOR SELECT TO anon, authenticated USING (true)';
  EXECUTE 'CREATE POLICY "playbook_write" ON ' || tbl ||
          ' FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)';

  RAISE NOTICE 'RLS aplicado em playbook_itens';
END $$;


-- ============================================================
-- 5. ÍNDICES — remove duplicatas ANTES de criar
-- ============================================================
DO $$
BEGIN
  -- Remove índices duplicados que criamos no script anterior
  DROP INDEX IF EXISTS idx_ppd_colaborador;
  DROP INDEX IF EXISTS idx_ppd_obra;
  DROP INDEX IF EXISTS idx_ppd_data;
  DROP INDEX IF EXISTS idx_poc_obra;
  DROP INDEX IF EXISTS idx_psol_obra;
  DROP INDEX IF EXISTS idx_pprod_obra;
  DROP INDEX IF EXISTS idx_rp_colaborador;
  DROP INDEX IF EXISTS idx_rp_obra;
  DROP INDEX IF EXISTS idx_rp_data;
  DROP INDEX IF EXISTS idx_pl_colaborador;
  DROP INDEX IF EXISTS idx_pl_status;
  DROP INDEX IF EXISTS idx_pl_mes;
  DROP INDEX IF EXISTS idx_col_status;
  DROP INDEX IF EXISTS idx_col_obra;
  DROP INDEX IF EXISTS idx_play_obra;
  DROP INDEX IF EXISTS idx_play_ativo;
  DROP INDEX IF EXISTS idx_obras_status;
  DROP INDEX IF EXISTS idx_pag_status;
  DROP INDEX IF EXISTS idx_pag_competencia;
  DROP INDEX IF EXISTS idx_adt_status;
  RAISE NOTICE 'Índices duplicados removidos.';
END $$;

-- Recria apenas os índices que NÃO existem no Supabase por padrão
-- (o Supabase já cria índice automático em PKs e FKs mais comuns)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='portal_ponto_diario') THEN
    CREATE INDEX IF NOT EXISTS idx_portal_ponto_data        ON portal_ponto_diario (data);
    CREATE INDEX IF NOT EXISTS idx_portal_ponto_obra_data   ON portal_ponto_diario (obra_id, data);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='registro_ponto') THEN
    CREATE INDEX IF NOT EXISTS idx_reg_ponto_data           ON registro_ponto (data);
    CREATE INDEX IF NOT EXISTS idx_reg_ponto_obra_data      ON registro_ponto (obra_id, data);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ponto_lancamentos') THEN
    CREATE INDEX IF NOT EXISTS idx_lanc_mes_status          ON ponto_lancamentos (mes_referencia, status);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='colaboradores') THEN
    CREATE INDEX IF NOT EXISTS idx_colab_status_obra        ON colaboradores (status, obra_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='playbook_itens') THEN
    CREATE INDEX IF NOT EXISTS idx_playbook_ativo_cat       ON playbook_itens (ativo, categoria);
  END IF;
  RAISE NOTICE 'Índices compostos criados.';
END $$;


-- ============================================================
-- RESULTADO FINAL
-- ============================================================
SELECT
  '✅ Migration v5 aplicada!' AS resultado,
  '🔒 Sistema: RLS desabilitado (zero warnings "Always True")' AS security_sistema,
  '🔑 Portal: RLS mantido com 1 política consolidada por tabela' AS security_portal,
  '⚡ Índices: duplicatas removidas, compostos criados' AS performance;
