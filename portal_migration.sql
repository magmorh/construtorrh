-- ═══════════════════════════════════════════════════════════════
-- Portal Externo de Obra — Migration SQL
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Usuários do portal (gerenciados pelo admin)
CREATE TABLE IF NOT EXISTS portal_usuarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login       VARCHAR(50) UNIQUE NOT NULL,
  senha_hash  TEXT NOT NULL,         -- SHA-256 da senha
  nome        VARCHAR(100),
  obras_ids   UUID[] DEFAULT '{}',   -- obras que este usuário pode acessar
  ativo       BOOLEAN DEFAULT true,
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Lançamentos de ponto diário (vindos do portal)
CREATE TABLE IF NOT EXISTS portal_ponto_diario (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id              UUID REFERENCES obras(id) ON DELETE CASCADE,
  colaborador_id       UUID REFERENCES colaboradores(id) ON DELETE CASCADE,
  data                 DATE NOT NULL,
  status               VARCHAR(20) DEFAULT 'presente', -- presente, falta, meio_periodo, falta_justificada
  hora_entrada         TIME,
  hora_saida           TIME,
  horas_trabalhadas    DECIMAL(5,2) DEFAULT 0,
  horas_extra          DECIMAL(5,2) DEFAULT 0,
  horas_falta          DECIMAL(5,2) DEFAULT 0,   -- atraso ou saída antecipada
  observacoes          TEXT,
  foto_url             TEXT,
  portal_usuario_id    UUID REFERENCES portal_usuarios(id),
  sincronizado         BOOLEAN DEFAULT false,
  ponto_lancamento_id  UUID,                      -- preenchido quando vinculado ao sistema
  criado_em            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(colaborador_id, data)                    -- um registro por dia por colaborador
);

-- 3. Ocorrências registradas pelo portal
CREATE TABLE IF NOT EXISTS portal_ocorrencias (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           UUID REFERENCES obras(id) ON DELETE CASCADE,
  colaborador_id    UUID REFERENCES colaboradores(id) ON DELETE SET NULL,
  tipo              VARCHAR(50) DEFAULT 'ocorrencia', -- ocorrencia, acidente, quase_acidente, epi, disciplinar
  titulo            VARCHAR(200),
  descricao         TEXT,
  data              DATE NOT NULL DEFAULT CURRENT_DATE,
  gravidade         VARCHAR(20) DEFAULT 'media',  -- baixa, media, alta, critica
  foto_url          TEXT,
  portal_usuario_id UUID REFERENCES portal_usuarios(id),
  sincronizado      BOOLEAN DEFAULT false,
  ocorrencia_id     UUID,                          -- preenchido quando sincronizado com sistema
  criado_em         TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Solicitações de novo colaborador
CREATE TABLE IF NOT EXISTS portal_solicitacoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id           UUID REFERENCES obras(id) ON DELETE CASCADE,
  tipo              VARCHAR(30) DEFAULT 'novo_colaborador',
  dados             JSONB,           -- nome, cpf, função, etc
  status            VARCHAR(20) DEFAULT 'pendente', -- pendente, aprovado, recusado
  observacoes_admin TEXT,
  portal_usuario_id UUID REFERENCES portal_usuarios(id),
  colaborador_id    UUID,            -- preenchido quando aprovado e cadastrado
  criado_em         TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE portal_usuarios     ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_ponto_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_ocorrencias  ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_solicitacoes ENABLE ROW LEVEL SECURITY;

-- Permitir acesso total para usuários autenticados (admin do sistema)
CREATE POLICY "admin full access portal_usuarios"     ON portal_usuarios     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin full access portal_ponto_diario" ON portal_ponto_diario FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin full access portal_ocorrencias"  ON portal_ocorrencias  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin full access portal_solicitacoes" ON portal_solicitacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Permitir acesso anônimo para login do portal (leitura limitada)
CREATE POLICY "anon login portal" ON portal_usuarios FOR SELECT TO anon
  USING (ativo = true);

CREATE POLICY "anon insert ponto" ON portal_ponto_diario FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon select ponto" ON portal_ponto_diario FOR SELECT TO anon USING (true);
CREATE POLICY "anon update ponto" ON portal_ponto_diario FOR UPDATE TO anon USING (true);

CREATE POLICY "anon insert ocorrencia" ON portal_ocorrencias FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon select ocorrencia" ON portal_ocorrencias FOR SELECT TO anon USING (true);

CREATE POLICY "anon insert solicitacao" ON portal_solicitacoes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon select solicitacao" ON portal_solicitacoes FOR SELECT TO anon USING (true);

-- ─── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_portal_ponto_obra_data   ON portal_ponto_diario(obra_id, data);
CREATE INDEX IF NOT EXISTS idx_portal_ponto_colab_data  ON portal_ponto_diario(colaborador_id, data);
CREATE INDEX IF NOT EXISTS idx_portal_ocorr_obra        ON portal_ocorrencias(obra_id);
CREATE INDEX IF NOT EXISTS idx_portal_solic_obra        ON portal_solicitacoes(obra_id);
