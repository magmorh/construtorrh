-- =============================================================================
-- sql_revisao_v22_consolidado.sql
-- REESTRUTURAÇÃO COMPLETA: Consolidando melhorias e corrigindo erros de schema
-- =============================================================================

-- 1. Tabelas de Snapshot: Adicionar colunas faltantes para congelamento de dados
ALTER TABLE public.ponto_lancamentos 
ADD COLUMN IF NOT EXISTS snap_considera_sabado_util BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS liberado_por TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS liberado_em TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS snap_valor_hora NUMERIC(15,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS snap_horas_normais NUMERIC(15,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS snap_horas_extras NUMERIC(15,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS snap_valor_horas NUMERIC(15,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS snap_valor_producao NUMERIC(15,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS snap_valor_dsr NUMERIC(15,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS snap_valor_premio NUMERIC(15,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS snap_valor_total NUMERIC(15,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS snap_faltas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS snap_vt_diario NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS snap_desconto_vt NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS snap_desconto_adiant NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS snap_inss NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS snap_ir NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS snap_liquido NUMERIC(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS snap_fechado_em TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS snap_fechado_por TEXT DEFAULT NULL;

-- 2. Tabela Colaboradores: Colunas de auditoria e campos faltantes
ALTER TABLE public.colaboradores 
ADD COLUMN IF NOT EXISTS salario NUMERIC(15,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS inativado_por TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS inativado_em TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS motivo_encerramento TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS confirmou_sem_pendencias BOOLEAN DEFAULT FALSE;

-- 3. Tabela Obras: Configurações de fechamento
ALTER TABLE public.obras 
ADD COLUMN IF NOT EXISTS considera_sabado_util BOOLEAN DEFAULT FALSE;

-- 4. Unificação de Políticas RLS (Loop para garantir 1 única policy "rls_unified" por tabela)
DO $outer$
DECLARE
  tabelas TEXT[] := ARRAY[
    'acidentes','adiantamentos','advertencias','atestados',
    'colaborador_epi','colaborador_historico_contrato','colaboradores',
    'configuracoes','documentos','documentos_avulsos',
    'epi_catalogo','feriados',
    'funcao_epi','funcao_valores','funcoes',
    'historico_chapa','lista_negra_juridico',
    'obra_horarios','obras','ocorrencias',
    'pagamentos','playbook_itens','ponto_lancamentos','ponto_producao',
    'portal_documentos','portal_epi_solicitacoes','portal_mensagens',
    'portal_ocorrencias','portal_ponto_diario','portal_producao',
    'portal_solicitacoes','portal_usuarios',
    'premios','profiles','provisoes_fgts',
    'registro_ponto','rescisoes','vale_transporte',
    'tabela_inss','tabela_ir'
  ];
  t TEXT;
  pol TEXT;
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    -- Drop de TODAS as policies existentes
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;
    -- Criação da policy unificada (Autenticado pode tudo — Alinhado com v19)
    EXECUTE format('CREATE POLICY rls_unified ON public.%I FOR ALL USING (true) WITH CHECK ((select auth.uid()) IS NOT NULL)', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $outer$;

-- 5. Performance: Índices de Chaves Estrangeiras (Consolidação v20)
CREATE INDEX IF NOT EXISTS idx_colaboradores_obra_id ON public.colaboradores(obra_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_funcao_id ON public.colaboradores(funcao_id);
CREATE INDEX IF NOT EXISTS idx_registro_ponto_colab_data ON public.registro_ponto(colaborador_id, data);
CREATE INDEX IF NOT EXISTS idx_ponto_lanc_mes_status ON public.ponto_lancamentos (mes_referencia, status);
CREATE INDEX IF NOT EXISTS idx_ponto_lanc_colab_mes ON public.ponto_lancamentos (colaborador_id, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_portal_producao_obra_data ON public.portal_producao(obra_id, data);

-- 6. Verificação de Integridade
SELECT table_name, count(*) as pol_count 
FROM pg_policies 
WHERE schemaname = 'public' 
GROUP BY table_name;