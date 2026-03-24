-- ============================================================
-- portal_update_v2.sql
-- Adiciona campos detalhados em portal_ocorrencias e
-- cria tabela portal_producao
-- Execute no Supabase → SQL Editor
-- ============================================================

-- ── 1. Colunas extras em portal_ocorrencias ──────────────────────────────────
ALTER TABLE portal_ocorrencias
  ADD COLUMN IF NOT EXISTS hora_acidente      VARCHAR(5),      -- HH:MM
  ADD COLUMN IF NOT EXISTS local              TEXT,
  ADD COLUMN IF NOT EXISTS cat_emitida        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tipo_acidente      VARCHAR(50),     -- sem_afastamento, com_afastamento, trajeto, quase_acidente
  ADD COLUMN IF NOT EXISTS tipo_atestado      VARCHAR(50),     -- medico, odontologico, acompanhamento, outros
  ADD COLUMN IF NOT EXISTS dias_afastamento   INTEGER,
  ADD COLUMN IF NOT EXISTS com_afastamento    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cid                VARCHAR(20),
  ADD COLUMN IF NOT EXISTS medico             TEXT,
  ADD COLUMN IF NOT EXISTS tipo_adv           VARCHAR(50),     -- verbal, escrita, suspensao
  ADD COLUMN IF NOT EXISTS motivo             TEXT,
  ADD COLUMN IF NOT EXISTS assinada           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dias_suspensao     INTEGER;

-- ── 2. Cria tabela portal_producao ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS portal_producao (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id             UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  colaborador_id      UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  playbook_item_id    UUID REFERENCES playbook_items(id) ON DELETE SET NULL,
  lancamento_id       UUID REFERENCES ponto_lancamentos(id) ON DELETE SET NULL,
  portal_usuario_id   UUID REFERENCES portal_usuarios(id) ON DELETE SET NULL,
  data                DATE NOT NULL,
  quantidade          NUMERIC(12,4) NOT NULL DEFAULT 0,
  valor_unitario      NUMERIC(12,4),
  obs                 TEXT,
  sincronizado_em     TIMESTAMPTZ,
  lancamento_prod_id  UUID,    -- id em ponto_producao após sincronização
  criado_em           TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE portal_producao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal anon read producao"   ON portal_producao;
DROP POLICY IF EXISTS "portal anon insert producao" ON portal_producao;
DROP POLICY IF EXISTS "portal anon delete producao" ON portal_producao;
DROP POLICY IF EXISTS "admin read portal_producao"  ON portal_producao;
DROP POLICY IF EXISTS "admin update portal_producao" ON portal_producao;

CREATE POLICY "portal anon read producao"
  ON portal_producao FOR SELECT TO anon USING (true);

CREATE POLICY "portal anon insert producao"
  ON portal_producao FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "portal anon delete producao"
  ON portal_producao FOR DELETE TO anon USING (sincronizado_em IS NULL);

CREATE POLICY "admin read portal_producao"
  ON portal_producao FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin update portal_producao"
  ON portal_producao FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_portal_producao_obra   ON portal_producao(obra_id);
CREATE INDEX IF NOT EXISTS idx_portal_producao_colab  ON portal_producao(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_portal_producao_sync   ON portal_producao(sincronizado_em);
CREATE INDEX IF NOT EXISTS idx_portal_producao_data   ON portal_producao(data);

-- ── 3. Também garante que portal_ocorrencias permite DELETE para pendentes ──
DROP POLICY IF EXISTS "portal anon delete ocorr" ON portal_ocorrencias;
CREATE POLICY "portal anon delete ocorr"
  ON portal_ocorrencias FOR DELETE TO anon USING (sincronizado_em IS NULL);

-- ── 4. Também garante que portal_producao permite DELETE de pendentes ────────
-- (já coberto acima)

-- ── FIM ──────────────────────────────────────────────────────────────────────
