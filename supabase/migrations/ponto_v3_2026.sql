-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — Migração Ponto v3
-- Execute na ordem abaixo no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FUNCAO_VALORES — Valor/hora tabelado por função + tipo de contrato
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.funcao_valores (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  funcao_id       UUID NOT NULL REFERENCES public.funcoes(id) ON DELETE CASCADE,
  tipo_contrato   TEXT NOT NULL CHECK (tipo_contrato IN ('clt','autonomo','pj','estagiario','menor_aprendiz')),
  valor_hora      NUMERIC(10,4) NOT NULL DEFAULT 0,
  UNIQUE (funcao_id, tipo_contrato)
);
ALTER TABLE public.funcao_valores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "funcao_valores_auth" ON public.funcao_valores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PONTO_LANCAMENTOS — Atualizar colunas (status, fechamento_id)
--    Remover constraint numero_lancamento se existir
-- ─────────────────────────────────────────────────────────────────────────────

-- Adicionar coluna status
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aguardando_aprovacao','aprovado','recusado','em_fechamento','pago')),
  ADD COLUMN IF NOT EXISTS motivo_recusa TEXT,
  ADD COLUMN IF NOT EXISTS fechamento_id UUID;  -- preenchido depois da FK

-- Remover constraint de número de lançamento se existir
ALTER TABLE public.ponto_lancamentos
  DROP CONSTRAINT IF EXISTS max2_lancamentos;

-- Remover coluna numero_lancamento se existir (não é mais usada)
ALTER TABLE public.ponto_lancamentos
  DROP COLUMN IF EXISTS numero_lancamento;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. REGISTRO_PONTO — Garantir constraint UNIQUE para o upsert funcionar
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.registro_ponto
  DROP CONSTRAINT IF EXISTS reg_ponto_lanc_data_unique;

ALTER TABLE public.registro_ponto
  ADD CONSTRAINT reg_ponto_lanc_data_unique UNIQUE (lancamento_id, data);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PONTO_FECHAMENTOS — Consolidação para pagamento
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ponto_fechamentos (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  criado_em             TIMESTAMPTZ DEFAULT NOW(),
  mes_referencia        TEXT,
  periodo_inicio        DATE,
  periodo_fim           DATE,
  status                TEXT NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto','fechado','pago')),
  total_colaboradores   INT DEFAULT 0,
  total_lancamentos     INT DEFAULT 0,
  valor_total           NUMERIC(14,2) DEFAULT 0,
  observacoes           TEXT
);
ALTER TABLE public.ponto_fechamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ponto_fechamentos_auth" ON public.ponto_fechamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- FK de ponto_lancamentos para ponto_fechamentos (agora que a tabela existe)
ALTER TABLE public.ponto_lancamentos
  ADD CONSTRAINT fk_lancamento_fechamento
    FOREIGN KEY (fechamento_id)
    REFERENCES public.ponto_fechamentos(id)
    ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PONTO_PRODUCAO — Garantir campos lancamento_id e obra_id
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ponto_producao
  ADD COLUMN IF NOT EXISTS lancamento_id UUID REFERENCES public.ponto_lancamentos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS obra_id UUID REFERENCES public.obras(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ÍNDICES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lancamentos_status     ON public.ponto_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_fechamento ON public.ponto_lancamentos(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_reg_ponto_lancamento   ON public.registro_ponto(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_producao_lancamento    ON public.ponto_producao(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_funcao_valores_func    ON public.funcao_valores(funcao_id);
