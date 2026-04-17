-- ============================================================
-- Tabela: vt_aceites
-- Armazena o aceite digital do colaborador no vale transporte
-- com fingerprint de dispositivo e geolocalização
-- ============================================================
CREATE TABLE IF NOT EXISTS vt_aceites (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Referência ao VT
  vt_id            UUID NOT NULL REFERENCES vale_transporte(id) ON DELETE CASCADE,

  -- Identificação do colaborador
  colaborador_id   UUID NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  nome_colaborador TEXT,
  cpf_colaborador  TEXT,
  competencia      TEXT,

  -- Dados do aceite
  aceito_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Evidências digitais
  ip_address       TEXT,
  user_agent       TEXT,
  device_fingerprint TEXT,  -- hash calculado no browser
  geo_lat          DOUBLE PRECISION,
  geo_lng          DOUBLE PRECISION,
  geo_accuracy     DOUBLE PRECISION,

  -- Metadados do dispositivo
  plataforma       TEXT,   -- 'Android', 'iOS', 'Windows', etc
  idioma           TEXT,
  fuso_horario     TEXT,

  CONSTRAINT vt_aceites_unique UNIQUE (vt_id, colaborador_id)
);

-- RLS: permitir insert/select pelo portal (anon key)
ALTER TABLE vt_aceites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vt_aceites_insert_portal" ON vt_aceites;
CREATE POLICY "vt_aceites_insert_portal" ON vt_aceites
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "vt_aceites_select_portal" ON vt_aceites;
CREATE POLICY "vt_aceites_select_portal" ON vt_aceites
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "vt_aceites_update_portal" ON vt_aceites;
CREATE POLICY "vt_aceites_update_portal" ON vt_aceites
  FOR UPDATE USING (true);

-- Índice para busca por colaborador
CREATE INDEX IF NOT EXISTS idx_vt_aceites_colaborador ON vt_aceites(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_vt_aceites_vt_id ON vt_aceites(vt_id);

COMMENT ON TABLE vt_aceites IS
  'Aceites digitais do colaborador no vale transporte. '
  'device_fingerprint é um hash de parâmetros do dispositivo gerado no browser. '
  'Serve como comprovação jurídica do recebimento (Lei 7.418/85).';
