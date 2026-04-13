-- ══════════════════════════════════════════════════════════════════
-- MIGRAÇÃO: Controle de Equipamentos e Ferramentas por Obra
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS obra_equipamentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id         UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,

  -- Tipo: 'locado' (alugado de fornecedor) ou 'proprio' (comprado/da empresa)
  tipo            TEXT NOT NULL DEFAULT 'locado'
                  CHECK (tipo IN ('locado', 'proprio')),

  -- Dados do item
  nome            TEXT NOT NULL,
  descricao       TEXT,
  quantidade      INTEGER NOT NULL DEFAULT 1,
  fornecedor      TEXT,

  -- Locação
  data_inicio     DATE,
  data_prevista   DATE,    -- previsão de devolução (locado)
  data_devolucao  DATE,    -- efetiva devolução (locado)

  -- Status
  -- locado:  'ativo' | 'devolvido' | 'defeito'
  -- proprio: 'ativo' | 'baixa' | 'defeito'
  status          TEXT NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo', 'devolvido', 'baixa', 'defeito')),

  -- Controle
  observacoes     TEXT,
  lancado_por     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obra_equip_obra  ON obra_equipamentos (obra_id, status);
CREATE INDEX IF NOT EXISTS idx_obra_equip_tipo  ON obra_equipamentos (tipo, status);

ALTER TABLE obra_equipamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "obra_equip_all" ON obra_equipamentos;
CREATE POLICY "obra_equip_all" ON obra_equipamentos
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS obra_equip_updated_at ON obra_equipamentos;
CREATE TRIGGER obra_equip_updated_at
  BEFORE UPDATE ON obra_equipamentos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

SELECT 'OK — tabela obra_equipamentos criada' AS status;
