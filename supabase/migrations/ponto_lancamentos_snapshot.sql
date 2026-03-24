-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — Snapshot de Fechamento (trava de valores)
-- Execute no Supabase SQL Editor
--
-- REGRA: Quando um lançamento é aprovado no Fechamento, todos os valores
-- calculados são gravados nas colunas snap_*. A partir daí, mesmo que
-- valor/hora, horário da obra ou playbook mudem, o lançamento fechado
-- permanece com os valores do momento do fechamento.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ponto_lancamentos
  -- Valor/hora usado no cálculo
  ADD COLUMN IF NOT EXISTS snap_valor_hora        NUMERIC(10,4),

  -- Resultados calculados no momento do fechamento
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
  ADD COLUMN IF NOT EXISTS snap_fechado_por       TEXT;   -- email/nome do usuário
