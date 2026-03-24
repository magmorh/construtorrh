-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — FIX COMPLETO: Fluxo de Status + Colunas Snapshot + Adiantamentos
-- Execute INTEGRALMENTE no Supabase SQL Editor
--
-- FLUXO CORRETO DE STATUS:
--   Ponto:      rascunho → aguardando_aprovacao → em_fechamento
--   Fechamento: em_fechamento → aprovado → liberado
--   Pagamentos: liberado → pago
--
-- STATUS EXTRAS: recusado (volta para rascunho no Ponto)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Remover constraint antiga e recriar com todos os status ────────────
ALTER TABLE public.ponto_lancamentos
  DROP CONSTRAINT IF EXISTS ponto_lancamentos_status_check,
  DROP CONSTRAINT IF EXISTS check_status;

ALTER TABLE public.ponto_lancamentos
  ADD CONSTRAINT ponto_lancamentos_status_check
    CHECK (status IN (
      'rascunho',
      'aguardando_aprovacao',
      'em_fechamento',
      'aprovado',
      'recusado',
      'liberado',
      'pago'
    ));

-- ── 2. Migrar registros com status legado 'aprovado' que ainda não foram
--       processados no Fechamento → transformar em 'em_fechamento'
--       (apenas os que NÃO têm snap_valor_total preenchido, ou seja, não
--        passaram pelo novo fluxo de aprovação do Fechamento)
UPDATE public.ponto_lancamentos
  SET status = 'em_fechamento'
  WHERE status = 'aprovado'
    AND (snap_valor_total IS NULL OR snap_valor_total = 0);

-- ── 3. Colunas de pagamento (já podem existir — IF NOT EXISTS protege) ────
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS data_pagamento   DATE,
  ADD COLUMN IF NOT EXISTS obs_pagamento    TEXT;

-- ── 4. Colunas de Snapshot (trava de valores ao fechar) ──────────────────
ALTER TABLE public.ponto_lancamentos
  ADD COLUMN IF NOT EXISTS snap_valor_hora        NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS snap_horas_normais     NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS snap_horas_extras      NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS snap_valor_horas       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_producao    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_dsr         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_premio      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_valor_total       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_faltas            INT,
  ADD COLUMN IF NOT EXISTS snap_vt_diario         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS snap_desconto_vt       NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_desconto_adiant   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_inss              NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_ir                NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_liquido           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS snap_fechado_em        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snap_fechado_por       TEXT;

-- ── 5. Tabela de adiantamentos (cria se não existir) ─────────────────────
CREATE TABLE IF NOT EXISTS public.adiantamentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  competencia     TEXT NOT NULL,          -- formato YYYY-MM
  tipo            TEXT NOT NULL DEFAULT 'adiantamento'
                    CHECK (tipo IN ('adiantamento','vale','ajuda_custo','outros')),
  valor           NUMERIC(12,2) NOT NULL DEFAULT 0,
  descricao       TEXT,
  status          TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','pago','cancelado')),
  data_pagamento  DATE,
  descontado_em   TEXT,                   -- competência YYYY-MM em que foi descontado na folha
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS básico para adiantamentos
ALTER TABLE public.adiantamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "adiantamentos_all" ON public.adiantamentos;
CREATE POLICY "adiantamentos_all" ON public.adiantamentos
  FOR ALL USING (true) WITH CHECK (true);

-- ── 6. Tabela de encargos trabalhistas (para EncargosPage) ───────────────
CREATE TABLE IF NOT EXISTS public.tabela_inss (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faixa_ini   NUMERIC(12,2) NOT NULL,
  faixa_fim   NUMERIC(12,2),              -- NULL = sem limite
  aliquota    NUMERIC(5,2) NOT NULL,
  vigencia    TEXT NOT NULL DEFAULT '2026',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tabela_ir (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faixa_ini   NUMERIC(12,2) NOT NULL,
  faixa_fim   NUMERIC(12,2),
  aliquota    NUMERIC(5,2) NOT NULL,
  deducao     NUMERIC(12,2) NOT NULL DEFAULT 0,
  vigencia    TEXT NOT NULL DEFAULT '2026',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tabela_inss ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabela_ir   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tabela_inss_all" ON public.tabela_inss;
DROP POLICY IF EXISTS "tabela_ir_all"   ON public.tabela_ir;
CREATE POLICY "tabela_inss_all" ON public.tabela_inss FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tabela_ir_all"   ON public.tabela_ir   FOR ALL USING (true) WITH CHECK (true);

-- Valores padrão INSS 2026 (progressiva)
INSERT INTO public.tabela_inss (faixa_ini, faixa_fim, aliquota, vigencia)
SELECT * FROM (VALUES
  (0.00,     1518.00,  7.50, '2026'),
  (1518.01,  2793.88,  9.00, '2026'),
  (2793.89,  4190.83, 12.00, '2026'),
  (4190.84,  8157.41, 14.00, '2026')
) AS v(faixa_ini, faixa_fim, aliquota, vigencia)
WHERE NOT EXISTS (SELECT 1 FROM public.tabela_inss WHERE vigencia = '2026');

-- Valores padrão IR 2026 (isento até R$5.000)
INSERT INTO public.tabela_ir (faixa_ini, faixa_fim, aliquota, deducao, vigencia)
SELECT * FROM (VALUES
  (0.00,      5000.00,  0.00,     0.00,    '2026'),
  (5000.01,   5479.00,  7.50,   375.00,    '2026'),
  (5479.01,   6433.68, 15.00,   785.93,    '2026'),
  (6433.69,   7764.05, 22.50,  1268.67,    '2026'),
  (7764.06,  NULL,     27.50,  1651.87,    '2026')
) AS v(faixa_ini, faixa_fim, aliquota, deducao, vigencia)
WHERE NOT EXISTS (SELECT 1 FROM public.tabela_ir WHERE vigencia = '2026');

-- ── 7. Confirmar situação atual ───────────────────────────────────────────
SELECT status, COUNT(*) as total
FROM public.ponto_lancamentos
GROUP BY status
ORDER BY status;
