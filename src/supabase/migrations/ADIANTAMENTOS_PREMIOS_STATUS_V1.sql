-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Padronização Adiantamentos + Prêmios com fluxo de aprovação
-- Executar no Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. ADIANTAMENTOS: adicionar colunas faltantes ─────────────────────────

-- Coluna obra_id
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS obra_id UUID REFERENCES public.obras(id) ON DELETE SET NULL;

-- Coluna pagamento_id (referência ao pagamento gerado ao aprovar)
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS pagamento_id UUID REFERENCES public.pagamentos(id) ON DELETE SET NULL;

-- Coluna observacoes
ALTER TABLE public.adiantamentos
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- Expandir status para incluir 'aprovado'
-- (Remove constraint antiga e recria com os 4 valores)
ALTER TABLE public.adiantamentos
  DROP CONSTRAINT IF EXISTS adiantamentos_status_check;

ALTER TABLE public.adiantamentos
  ADD CONSTRAINT adiantamentos_status_check
    CHECK (status IN ('pendente','aprovado','pago','cancelado'));

-- Atualizar default (mantém pendente)
ALTER TABLE public.adiantamentos
  ALTER COLUMN status SET DEFAULT 'pendente';

-- Expandir tipo para incluir 'ajuda_custo' (já existe) e 'outro' (estava como 'outros')
ALTER TABLE public.adiantamentos
  DROP CONSTRAINT IF EXISTS adiantamentos_tipo_check;

ALTER TABLE public.adiantamentos
  ADD CONSTRAINT adiantamentos_tipo_check
    CHECK (tipo IN ('adiantamento','vale','ajuda_custo','outro','outros'));


-- ── 2. PRÊMIOS: adicionar colunas de status e pagamento ───────────────────

-- Verificar se a tabela premios existe (se não existir, criar)
CREATE TABLE IF NOT EXISTS public.premios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id         UUID REFERENCES public.obras(id) ON DELETE SET NULL,
  tipo            TEXT,
  descricao       TEXT,
  valor           NUMERIC(12,2),
  data            DATE NOT NULL DEFAULT CURRENT_DATE,
  competencia     TEXT,
  observacoes     TEXT,
  status          TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','aprovado','pago','cancelado')),
  pagamento_id    UUID REFERENCES public.pagamentos(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Se a tabela já existia (sem status/pagamento_id), adicionar as colunas:
ALTER TABLE public.premios
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovado','pago','cancelado'));

ALTER TABLE public.premios
  ADD COLUMN IF NOT EXISTS pagamento_id UUID REFERENCES public.pagamentos(id) ON DELETE SET NULL;

-- Garantir RLS na tabela premios
ALTER TABLE public.premios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "premios_all" ON public.premios;
CREATE POLICY "premios_all" ON public.premios
  FOR ALL USING (true) WITH CHECK (true);

-- Atualizar registros antigos para status = 'pendente' onde está NULL
UPDATE public.premios SET status = 'pendente' WHERE status IS NULL;


-- ── 3. PAGAMENTOS: garantir tipo 'premio' e 'adiantamento' aceitos ────────
-- (Se houver check constraint no tipo de pagamento, expandi-la)
ALTER TABLE public.pagamentos
  DROP CONSTRAINT IF EXISTS pagamentos_tipo_check;

-- Sem constraint restritiva no tipo (campo livre para máxima flexibilidade)
-- Ou adicionar com todos os valores conhecidos:
-- ALTER TABLE public.pagamentos ADD CONSTRAINT pagamentos_tipo_check
--   CHECK (tipo IN ('mensal','quinzenal','semanal','adiantamento','rescisao','ferias',
--                   'decimo_terceiro','bonus','outro','folha','13_salario','vale_transporte',
--                   'premio','ajuda_custo'));

-- ══════════════════════════════════════════════════════════════════════════
-- FIM DA MIGRATION
-- ══════════════════════════════════════════════════════════════════════════
