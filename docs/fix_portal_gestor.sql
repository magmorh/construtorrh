-- ============================================================
-- FIX: Portal do Gestor + Estação Meteorológica
-- ConstrutorRH — Execute no Supabase SQL Editor
-- Seguro para reexecutar (IF NOT EXISTS / IF EXISTS em tudo)
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- 1. COLABORADORES — coluna "salario"
--    Schema tem salario_base; o código usa c.salario
-- ════════════════════════════════════════════════════════════
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS salario numeric(10,2);

-- Migra valores existentes de salario_base → salario (se salario_base estiver preenchido)
UPDATE colaboradores
SET salario = salario_base
WHERE salario IS NULL AND salario_base IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- 2. PORTAL_PONTO_DIARIO — colunas que o gestor lê
--    (playbook_item_id e servico_descricao já podem existir
--     via fix_playbook_ponto_portal.sql — IF NOT EXISTS é seguro)
-- ════════════════════════════════════════════════════════════
ALTER TABLE portal_ponto_diario
  ADD COLUMN IF NOT EXISTS horas_trabalhadas  numeric(5,2),
  ADD COLUMN IF NOT EXISTS playbook_item_id   uuid REFERENCES playbook_itens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS servico_descricao  text,
  ADD COLUMN IF NOT EXISTS lancado_por        text;

CREATE INDEX IF NOT EXISTS idx_pponto_playbook
  ON portal_ponto_diario (playbook_item_id)
  WHERE playbook_item_id IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- 3. PORTAL_PRODUCAO — colunas que o gestor lê
--    Schema original tem: quantidade, obs, status — mas faltam
--    unidade e servico_descricao
-- ════════════════════════════════════════════════════════════
ALTER TABLE portal_producao
  ADD COLUMN IF NOT EXISTS unidade            text NOT NULL DEFAULT 'un',
  ADD COLUMN IF NOT EXISTS servico_descricao  text,
  ADD COLUMN IF NOT EXISTS data               date;

-- Índice de data (pode já existir, IF NOT EXISTS é seguro)
CREATE INDEX IF NOT EXISTS idx_portal_producao_data
  ON portal_producao (data DESC);


-- ════════════════════════════════════════════════════════════
-- 4. ATESTADOS — colunas data_inicio / data_fim
--    Schema tem: data (sem _inicio), com_afastamento, dias_afastamento
--    Código do gestor usa: data_inicio, data_fim
-- ════════════════════════════════════════════════════════════
ALTER TABLE atestados
  ADD COLUMN IF NOT EXISTS data_inicio  date,
  ADD COLUMN IF NOT EXISTS data_fim     date;

-- Migra coluna legada "data" → "data_inicio" onde data_inicio está nulo
UPDATE atestados
SET data_inicio = data
WHERE data_inicio IS NULL AND data IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- 5. ACIDENTES — colunas que o gestor lê
--    Schema tem: data_ocorrencia, tipo, gravidade
--    Código usa:  data_acidente,  tipo_acidente, dias_afastamento, cid
-- ════════════════════════════════════════════════════════════
ALTER TABLE acidentes
  ADD COLUMN IF NOT EXISTS data_acidente    date,
  ADD COLUMN IF NOT EXISTS tipo_acidente    text,
  ADD COLUMN IF NOT EXISTS dias_afastamento int,
  ADD COLUMN IF NOT EXISTS cid              text;

-- Migra colunas legadas
UPDATE acidentes
SET
  data_acidente = data_ocorrencia,
  tipo_acidente = tipo
WHERE data_acidente IS NULL AND data_ocorrencia IS NOT NULL;


-- ════════════════════════════════════════════════════════════
-- 6. OBRA_CLIMA — tabela nova (estação meteorológica)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS obra_clima (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           uuid NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  data              date NOT NULL,
  choveu            boolean NOT NULL DEFAULT false,
  precipitacao_mm   numeric(6,1),
  temperatura_max   numeric(4,1),
  temperatura_min   numeric(4,1),
  vento_kmh         numeric(5,1),
  umidade_pct       numeric(4,1),
  condicao          text NOT NULL DEFAULT 'ensolarado',
  impacto_obra      text NOT NULL DEFAULT 'nenhum',
  observacoes       text,
  lancado_por       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, data)
);

CREATE INDEX IF NOT EXISTS idx_obra_clima_obra_data
  ON obra_clima (obra_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_obra_clima_data
  ON obra_clima (data DESC);

-- RLS (permite acesso via anon key do portal e autenticados do admin)
ALTER TABLE obra_clima ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obra_clima_all" ON obra_clima;
CREATE POLICY "obra_clima_all" ON obra_clima
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger de updated_at (cria função apenas se não existir)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS obra_clima_updated_at ON obra_clima;
CREATE TRIGGER obra_clima_updated_at
  BEFORE UPDATE ON obra_clima
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ════════════════════════════════════════════════════════════
-- 7. RLS nas tabelas existentes que o Gestor lê via anon key
--    (só cria se ainda não houver política de SELECT)
-- ════════════════════════════════════════════════════════════

-- atestados
ALTER TABLE atestados ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='atestados' AND policyname='atestados_all'
  ) THEN
    EXECUTE 'CREATE POLICY atestados_all ON atestados FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- acidentes
ALTER TABLE acidentes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='acidentes' AND policyname='acidentes_all'
  ) THEN
    EXECUTE 'CREATE POLICY acidentes_all ON acidentes FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- colaboradores (pode já ter RLS)
ALTER TABLE colaboradores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='colaboradores' AND policyname='colaboradores_all'
  ) THEN
    EXECUTE 'CREATE POLICY colaboradores_all ON colaboradores FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- obras
ALTER TABLE obras ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='obras' AND policyname='obras_all'
  ) THEN
    EXECUTE 'CREATE POLICY obras_all ON obras FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- CONFIRMAÇÃO
-- ════════════════════════════════════════════════════════════
SELECT
  'colaboradores.salario'          AS coluna, column_name IS NOT NULL AS ok
FROM information_schema.columns
WHERE table_name='colaboradores' AND column_name='salario'
UNION ALL
SELECT 'portal_ponto_diario.horas_trabalhadas', column_name IS NOT NULL
FROM information_schema.columns
WHERE table_name='portal_ponto_diario' AND column_name='horas_trabalhadas'
UNION ALL
SELECT 'portal_producao.unidade', column_name IS NOT NULL
FROM information_schema.columns
WHERE table_name='portal_producao' AND column_name='unidade'
UNION ALL
SELECT 'atestados.data_inicio', column_name IS NOT NULL
FROM information_schema.columns
WHERE table_name='atestados' AND column_name='data_inicio'
UNION ALL
SELECT 'acidentes.data_acidente', column_name IS NOT NULL
FROM information_schema.columns
WHERE table_name='acidentes' AND column_name='data_acidente'
UNION ALL
SELECT 'obra_clima (tabela)', table_name IS NOT NULL
FROM information_schema.tables
WHERE table_name='obra_clima';
