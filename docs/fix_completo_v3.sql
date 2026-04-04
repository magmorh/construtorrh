-- ============================================================
--   ConstrutorRH — SQL COMPLETO + MIGRAÇÃO
--   Inclui: novas tabelas, colunas faltantes, migração de dados
--   Execute no Supabase SQL Editor
--   Seguro para reexecutar (IF NOT EXISTS em tudo)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- BLOCO 1 — PLAYBOOK: nova estrutura
--   playbook_atividades  → catálogo global de atividades
--   playbook_precos      → preço por atividade + obra
--   playbook_itens       → tabela legada (mantida para histórico)
-- ════════════════════════════════════════════════════════════

-- 1.1 Tabela de atividades globais (sem preço, sem obra)
CREATE TABLE IF NOT EXISTS playbook_atividades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao   TEXT NOT NULL,
  unidade     TEXT NOT NULL DEFAULT 'm²',
  categoria   TEXT,
  codigo      TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_playbook_atividades_cat
  ON playbook_atividades (categoria);

CREATE INDEX IF NOT EXISTS idx_playbook_atividades_ativo
  ON playbook_atividades (ativo);

-- 1.2 Tabela de preços: uma atividade pode ter preços diferentes por obra
CREATE TABLE IF NOT EXISTS playbook_precos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id     UUID NOT NULL REFERENCES playbook_atividades(id) ON DELETE CASCADE,
  obra_id          UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  preco_unitario   NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo            BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (atividade_id, obra_id)
);

CREATE INDEX IF NOT EXISTS idx_playbook_precos_obra
  ON playbook_precos (obra_id);

CREATE INDEX IF NOT EXISTS idx_playbook_precos_atividade
  ON playbook_precos (atividade_id);

-- 1.3 Trigger updated_at (reutiliza função se já existir)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS playbook_atividades_updated_at ON playbook_atividades;
CREATE TRIGGER playbook_atividades_updated_at
  BEFORE UPDATE ON playbook_atividades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS playbook_precos_updated_at ON playbook_precos;
CREATE TRIGGER playbook_precos_updated_at
  BEFORE UPDATE ON playbook_precos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 1.4 RLS (acesso via anon key do portal e authenticated do admin)
ALTER TABLE playbook_atividades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "playbook_atividades_all" ON playbook_atividades;
CREATE POLICY "playbook_atividades_all" ON playbook_atividades
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE playbook_precos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "playbook_precos_all" ON playbook_precos;
CREATE POLICY "playbook_precos_all" ON playbook_precos
  FOR ALL USING (true) WITH CHECK (true);

-- 1.5 MIGRAÇÃO: converte playbook_itens existentes → nova estrutura
--   Regra:
--     - obra_id IS NULL → vira atividade global apenas
--     - obra_id NOT NULL → vira atividade global (se descrição nova)
--                          + preço na obra correspondente
DO $$
DECLARE
  item    RECORD;
  atv_id  UUID;
BEGIN
  FOR item IN
    SELECT DISTINCT ON (lower(trim(descricao)))
      id, descricao, unidade, categoria, ativo, obra_id, preco_unitario
    FROM playbook_itens
    ORDER BY lower(trim(descricao)), obra_id NULLS FIRST
  LOOP
    -- Tenta encontrar atividade já existente por descrição normalizada
    SELECT id INTO atv_id
    FROM playbook_atividades
    WHERE lower(trim(descricao)) = lower(trim(item.descricao))
    LIMIT 1;

    -- Se não existe, cria
    IF atv_id IS NULL THEN
      INSERT INTO playbook_atividades (descricao, unidade, categoria, ativo)
      VALUES (trim(item.descricao), item.unidade, item.categoria, item.ativo)
      RETURNING id INTO atv_id;
    END IF;

    -- Se havia obra_id e preco_unitario > 0, cria ou atualiza preço na obra
    IF item.obra_id IS NOT NULL AND item.preco_unitario IS NOT NULL AND item.preco_unitario > 0 THEN
      INSERT INTO playbook_precos (atividade_id, obra_id, preco_unitario, ativo)
      VALUES (atv_id, item.obra_id, item.preco_unitario, item.ativo)
      ON CONFLICT (atividade_id, obra_id)
      DO UPDATE SET preco_unitario = EXCLUDED.preco_unitario;
    END IF;
  END LOOP;

  -- Segunda passagem: itens com obra_id que têm descrição já mapeada
  FOR item IN
    SELECT id, descricao, unidade, categoria, ativo, obra_id, preco_unitario
    FROM playbook_itens
    WHERE obra_id IS NOT NULL
      AND preco_unitario IS NOT NULL
      AND preco_unitario > 0
  LOOP
    SELECT id INTO atv_id
    FROM playbook_atividades
    WHERE lower(trim(descricao)) = lower(trim(item.descricao))
    LIMIT 1;

    IF atv_id IS NOT NULL THEN
      INSERT INTO playbook_precos (atividade_id, obra_id, preco_unitario, ativo)
      VALUES (atv_id, item.obra_id, item.preco_unitario, item.ativo)
      ON CONFLICT (atividade_id, obra_id)
      DO UPDATE SET preco_unitario = EXCLUDED.preco_unitario;
    END IF;
  END LOOP;
END;
$$;

-- 1.6 Adiciona coluna atividade_id nas tabelas que referenciam playbook_itens
--     para compatibilidade futura (as queries antigas continuam funcionando)
ALTER TABLE portal_ponto_diario
  ADD COLUMN IF NOT EXISTS atividade_id UUID REFERENCES playbook_atividades(id) ON DELETE SET NULL;

ALTER TABLE portal_producao
  ADD COLUMN IF NOT EXISTS atividade_id UUID REFERENCES playbook_atividades(id) ON DELETE SET NULL;

ALTER TABLE ponto_producao
  ADD COLUMN IF NOT EXISTS atividade_id UUID REFERENCES playbook_atividades(id) ON DELETE SET NULL;


-- ════════════════════════════════════════════════════════════
-- BLOCO 2 — PORTAL_PONTO_DIARIO: colunas faltantes
-- ════════════════════════════════════════════════════════════
ALTER TABLE portal_ponto_diario
  ADD COLUMN IF NOT EXISTS horas_trabalhadas  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS playbook_item_id   UUID REFERENCES playbook_itens(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS servico_descricao  TEXT,
  ADD COLUMN IF NOT EXISTS lancado_por        TEXT;

CREATE INDEX IF NOT EXISTS idx_pponto_playbook
  ON portal_ponto_diario (playbook_item_id)
  WHERE playbook_item_id IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- BLOCO 3 — PORTAL_PRODUCAO: colunas faltantes
-- ════════════════════════════════════════════════════════════
ALTER TABLE portal_producao
  ADD COLUMN IF NOT EXISTS unidade            TEXT NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS servico_descricao  TEXT,
  ADD COLUMN IF NOT EXISTS data               DATE,
  ADD COLUMN IF NOT EXISTS lancado_por        TEXT;

-- Popula "data" a partir de criado_em onde estiver nulo
UPDATE portal_producao
SET data = criado_em::date
WHERE data IS NULL AND criado_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_producao_data
  ON portal_producao (data DESC);

CREATE INDEX IF NOT EXISTS idx_portal_producao_obra
  ON portal_producao (obra_id);


-- ════════════════════════════════════════════════════════════
-- BLOCO 4 — COLABORADORES: coluna "salario"
-- ════════════════════════════════════════════════════════════
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS salario NUMERIC(10,2);

-- Migra de salario_base onde salario estiver vazio
UPDATE colaboradores
SET salario = salario_base
WHERE salario IS NULL AND salario_base IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- BLOCO 5 — ATESTADOS: colunas data_inicio / data_fim / status
-- ════════════════════════════════════════════════════════════
ALTER TABLE atestados
  ADD COLUMN IF NOT EXISTS data_inicio  DATE,
  ADD COLUMN IF NOT EXISTS data_fim     DATE;

-- Migra: coluna legada "data" → "data_inicio"
UPDATE atestados
SET data_inicio = data
WHERE data_inicio IS NULL AND data IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- BLOCO 6 — ACIDENTES: colunas renomeadas / faltantes
-- ════════════════════════════════════════════════════════════
ALTER TABLE acidentes
  ADD COLUMN IF NOT EXISTS data_acidente    DATE,
  ADD COLUMN IF NOT EXISTS tipo_acidente    TEXT,
  ADD COLUMN IF NOT EXISTS dias_afastamento INT,
  ADD COLUMN IF NOT EXISTS cid              TEXT;

-- Migra colunas legadas
UPDATE acidentes SET
  data_acidente = data_ocorrencia,
  tipo_acidente = tipo
WHERE data_acidente IS NULL AND data_ocorrencia IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- BLOCO 7 — OBRA_CLIMA: tabela nova (estação meteorológica)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS obra_clima (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id          UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  data             DATE NOT NULL,
  choveu           BOOLEAN NOT NULL DEFAULT false,
  precipitacao_mm  NUMERIC(6,1),
  temperatura_max  NUMERIC(4,1),
  temperatura_min  NUMERIC(4,1),
  vento_kmh        NUMERIC(5,1),
  umidade_pct      NUMERIC(4,1),
  condicao         TEXT NOT NULL DEFAULT 'ensolarado',
  impacto_obra     TEXT NOT NULL DEFAULT 'nenhum',
  observacoes      TEXT,
  lancado_por      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (obra_id, data)
);

CREATE INDEX IF NOT EXISTS idx_obra_clima_obra_data  ON obra_clima (obra_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_obra_clima_data        ON obra_clima (data DESC);

ALTER TABLE obra_clima ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "obra_clima_all" ON obra_clima;
CREATE POLICY "obra_clima_all" ON obra_clima
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS obra_clima_updated_at ON obra_clima;
CREATE TRIGGER obra_clima_updated_at
  BEFORE UPDATE ON obra_clima
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ════════════════════════════════════════════════════════════
-- BLOCO 8 — FUNCOES: coluna contratos_valores (JSONB)
-- ════════════════════════════════════════════════════════════
ALTER TABLE funcoes
  ADD COLUMN IF NOT EXISTS contratos_valores JSONB;


-- ════════════════════════════════════════════════════════════
-- BLOCO 9 — COLABORADORES: colunas da ficha de registro
-- ════════════════════════════════════════════════════════════
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS nome_pai           TEXT,
  ADD COLUMN IF NOT EXISTS nome_mae           TEXT,
  ADD COLUMN IF NOT EXISTS cor_raca           TEXT,
  ADD COLUMN IF NOT EXISTS deficiencia        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipo_deficiencia   TEXT,
  ADD COLUMN IF NOT EXISTS doc_militar        TEXT,
  ADD COLUMN IF NOT EXISTS matricula_esocial  TEXT,
  ADD COLUMN IF NOT EXISTS tipo_desligamento  TEXT,
  ADD COLUMN IF NOT EXISTS data_aviso_previo  DATE,
  ADD COLUMN IF NOT EXISTS data_encerramento  DATE,
  ADD COLUMN IF NOT EXISTS motivo_encerramento TEXT,
  ADD COLUMN IF NOT EXISTS inativado_por      TEXT,
  ADD COLUMN IF NOT EXISTS inativado_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmou_sem_pendencias BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS vinculo_anterior_id UUID REFERENCES colaboradores(id),
  ADD COLUMN IF NOT EXISTS data_demissao      DATE,
  ADD COLUMN IF NOT EXISTS foto_url           TEXT,
  ADD COLUMN IF NOT EXISTS pix_tipo           TEXT;


-- ════════════════════════════════════════════════════════════
-- BLOCO 10 — PORTAL_SOLICITACOES: coluna observacoes_admin
-- ════════════════════════════════════════════════════════════
ALTER TABLE portal_solicitacoes
  ADD COLUMN IF NOT EXISTS observacoes_admin TEXT,
  ADD COLUMN IF NOT EXISTS observacoes       TEXT;


-- ════════════════════════════════════════════════════════════
-- BLOCO 11 — PORTAL_OCORRENCIAS: coluna data
-- ════════════════════════════════════════════════════════════
ALTER TABLE portal_ocorrencias
  ADD COLUMN IF NOT EXISTS data DATE;

-- Popula data de criado_em
UPDATE portal_ocorrencias
SET data = criado_em::date
WHERE data IS NULL AND criado_em IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- BLOCO 12 — RLS: habilita em tabelas principais
-- ════════════════════════════════════════════════════════════
DO $$ 
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'colaboradores','obras','funcoes','feriados',
    'atestados','acidentes','ocorrencias','advertencias',
    'ponto_lancamentos','registro_ponto','ponto_producao',
    'pagamentos','adiantamentos','premios','vale_transporte',
    'portal_ponto_diario','portal_ocorrencias','portal_solicitacoes',
    'portal_producao','portal_epi_solicitacoes','portal_documentos',
    'playbook_itens','playbook_atividades','playbook_precos',
    'epi_catalogo','colaborador_epi','epis_entregues',
    'documentos','historico_chapa','colaborador_historico_contrato'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = tbl AND policyname = tbl || '_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL USING (true) WITH CHECK (true)',
        tbl || '_all', tbl
      );
    END IF;
  END LOOP;
END;
$$;


-- ════════════════════════════════════════════════════════════
-- BLOCO 13 — VIEW: vw_playbook_com_precos
--   Facilita queries no portal (atividade + preço da obra)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW vw_playbook_com_precos AS
SELECT
  a.id             AS atividade_id,
  a.descricao,
  a.unidade,
  a.categoria,
  a.codigo,
  a.ativo,
  p.obra_id,
  p.preco_unitario,
  p.id             AS preco_id
FROM playbook_atividades a
LEFT JOIN playbook_precos p ON p.atividade_id = a.id
WHERE a.ativo = true;

-- ════════════════════════════════════════════════════════════
-- BLOCO 14 — VIEW: vw_presenca_resumo
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW vw_presenca_resumo AS
SELECT
  p.data,
  p.obra_id,
  o.nome                                                        AS obra_nome,
  COUNT(*)                                                      AS total_lancamentos,
  COUNT(*) FILTER (WHERE p.status IN ('presente','meio_periodo','producao')) AS presentes,
  COUNT(*) FILTER (WHERE p.status = 'falta')                    AS faltas,
  COUNT(*) FILTER (WHERE p.status = 'falta_justificada')        AS faltas_justificadas,
  ROUND(
    COUNT(*) FILTER (WHERE p.status IN ('presente','meio_periodo','producao'))::NUMERIC /
    NULLIF(COUNT(*), 0) * 100, 1
  )                                                             AS taxa_presenca_pct
FROM portal_ponto_diario p
LEFT JOIN obras o ON o.id = p.obra_id
GROUP BY p.data, p.obra_id, o.nome;


-- ════════════════════════════════════════════════════════════
-- VERIFICAÇÃO FINAL — retorna "OK" para cada item criado
-- ════════════════════════════════════════════════════════════
SELECT item, status FROM (
  VALUES
    ('playbook_atividades (tabela)',
     (SELECT 'OK' FROM information_schema.tables WHERE table_name='playbook_atividades')),
    ('playbook_precos (tabela)',
     (SELECT 'OK' FROM information_schema.tables WHERE table_name='playbook_precos')),
    ('obra_clima (tabela)',
     (SELECT 'OK' FROM information_schema.tables WHERE table_name='obra_clima')),
    ('colaboradores.salario',
     (SELECT 'OK' FROM information_schema.columns WHERE table_name='colaboradores' AND column_name='salario')),
    ('portal_ponto_diario.horas_trabalhadas',
     (SELECT 'OK' FROM information_schema.columns WHERE table_name='portal_ponto_diario' AND column_name='horas_trabalhadas')),
    ('portal_producao.unidade',
     (SELECT 'OK' FROM information_schema.columns WHERE table_name='portal_producao' AND column_name='unidade')),
    ('portal_producao.data',
     (SELECT 'OK' FROM information_schema.columns WHERE table_name='portal_producao' AND column_name='data')),
    ('atestados.data_inicio',
     (SELECT 'OK' FROM information_schema.columns WHERE table_name='atestados' AND column_name='data_inicio')),
    ('acidentes.data_acidente',
     (SELECT 'OK' FROM information_schema.columns WHERE table_name='acidentes' AND column_name='data_acidente')),
    ('funcoes.contratos_valores',
     (SELECT 'OK' FROM information_schema.columns WHERE table_name='funcoes' AND column_name='contratos_valores')),
    ('vw_playbook_com_precos (view)',
     (SELECT 'OK' FROM information_schema.views WHERE table_name='vw_playbook_com_precos'))
) AS t(item, status);
