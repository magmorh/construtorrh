-- ============================================================
-- ConstrutorRH – Migração: Encarregado/Cabo como valor R$
-- e tabela de vínculos por obra
-- ============================================================

-- 1. Adicionar colunas de VALOR (R$) na tabela playbook_precos
--    (substitui/complementa as % antigas de comissão)
ALTER TABLE playbook_precos
  ADD COLUMN IF NOT EXISTS valor_premiacao_enc  NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_premiacao_cabo NUMERIC(10,2) DEFAULT 0;

-- 2. Adicionar colunas de VALOR nas atividades padrão do playbook
ALTER TABLE playbook_atividades
  ADD COLUMN IF NOT EXISTS valor_premiacao_enc  NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_premiacao_cabo NUMERIC(10,2) DEFAULT 0;

-- 3. Criar tabela de vínculos Encarregado/Cabo por obra
CREATE TABLE IF NOT EXISTS obra_vinculos_equipe (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  colaborador_id  UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  funcao          TEXT NOT NULL CHECK (funcao IN ('encarregado', 'cabo')),
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (obra_id, colaborador_id, funcao)
);

CREATE INDEX IF NOT EXISTS idx_obra_vinculos_obra   ON obra_vinculos_equipe (obra_id);
CREATE INDEX IF NOT EXISTS idx_obra_vinculos_colab  ON obra_vinculos_equipe (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_obra_vinculos_funcao ON obra_vinculos_equipe (funcao);

ALTER TABLE obra_vinculos_equipe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obra_vinculos_equipe_all" ON obra_vinculos_equipe;
CREATE POLICY "obra_vinculos_equipe_all" ON obra_vinculos_equipe
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger updated_at
DROP TRIGGER IF EXISTS obra_vinculos_equipe_updated_at ON obra_vinculos_equipe;
CREATE TRIGGER obra_vinculos_equipe_updated_at
  BEFORE UPDATE ON obra_vinculos_equipe
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Manter coluna encarregado_id em playbook_precos (compatibilidade retroativa)
-- A coluna já existe, mantemos apenas para não quebrar código legado

-- 5. Nova tabela comissoes_equipe_v2 (cálculo automático por obra/competência)
CREATE TABLE IF NOT EXISTS comissoes_equipe_v2 (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id                  UUID REFERENCES obras(id) ON DELETE SET NULL,
  colaborador_id           UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  funcao                   TEXT NOT NULL CHECK (funcao IN ('encarregado', 'cabo')),
  descricao                TEXT,
  quantidade_total         NUMERIC(12,3) NOT NULL DEFAULT 0,
  valor_unitario_premiacao NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_bruto              NUMERIC(10,2) NOT NULL DEFAULT 0,
  num_cabos                INTEGER NOT NULL DEFAULT 1,
  valor_final              NUMERIC(10,2) NOT NULL DEFAULT 0,
  competencia              TEXT NOT NULL,  -- formato YYYY-MM
  status                   TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','cancelado')),
  premio_id                UUID REFERENCES premios(id) ON DELETE SET NULL,
  observacoes              TEXT,
  data_geracao             DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (obra_id, colaborador_id, funcao, competencia)
);

CREATE INDEX IF NOT EXISTS idx_comissoes_v2_competencia ON comissoes_equipe_v2 (competencia);
CREATE INDEX IF NOT EXISTS idx_comissoes_v2_colab       ON comissoes_equipe_v2 (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_v2_obra        ON comissoes_equipe_v2 (obra_id);

ALTER TABLE comissoes_equipe_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comissoes_equipe_v2_all" ON comissoes_equipe_v2;
CREATE POLICY "comissoes_equipe_v2_all" ON comissoes_equipe_v2
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS comissoes_equipe_v2_updated_at ON comissoes_equipe_v2;
CREATE TRIGGER comissoes_equipe_v2_updated_at
  BEFORE UPDATE ON comissoes_equipe_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Migração v2: Adicionar cabo_id em playbook_precos
-- Permite vincular um Cabo diretamente à atividade na obra
-- ============================================================
ALTER TABLE playbook_precos
  ADD COLUMN IF NOT EXISTS cabo_id UUID REFERENCES colaboradores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_playbook_precos_cabo ON playbook_precos (cabo_id);

-- ============================================================
-- Migração v3: Coluna retrabalhos em ponto_producao
-- Controla fator de premiação por linha de produção:
--   0 = sem retrabalho → 100%
--   1 = 1 retrabalho   → 50%
--   2+ = perde         → 0%
-- ============================================================
ALTER TABLE ponto_producao
  ADD COLUMN IF NOT EXISTS retrabalhos INTEGER NOT NULL DEFAULT 0
  CHECK (retrabalhos >= 0);

COMMENT ON COLUMN ponto_producao.retrabalhos IS
  '0=sem retrabalho (100%), 1=1 retrabalho (50%), 2+=perde a premiação (0%)';
