-- =============================================================================
-- holerites_e_materiais.sql
-- Criação das tabelas: holerites e materiais (itens de NF/estoque)
-- =============================================================================

-- ── 1. HOLERITES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.holerites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id     uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  referencia         text NOT NULL,            -- Ex: "2026-03" (YYYY-MM)
  salario_base       numeric(12,2) DEFAULT 0,
  total_proventos    numeric(12,2) DEFAULT 0,
  total_descontos    numeric(12,2) DEFAULT 0,
  valor_liquido      numeric(12,2) DEFAULT 0,
  status             text NOT NULL DEFAULT 'rascunho'
                       CHECK (status IN ('rascunho','publicado','cancelado')),
  observacao         text,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_holerites_colaborador ON public.holerites(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_holerites_referencia  ON public.holerites(referencia);
CREATE INDEX IF NOT EXISTS idx_holerites_status      ON public.holerites(status);

-- RLS
ALTER TABLE public.holerites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "holerites_all" ON public.holerites;
CREATE POLICY "holerites_all" ON public.holerites
  FOR ALL USING (true) WITH CHECK (true);

-- ── 2. MATERIAIS (Itens de NF / Estoque) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.materiais (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                text NOT NULL,           -- CÓD. PROD.
  descricao             text NOT NULL,           -- DESCRIÇÃO DOS PRODUTOS/SERVIÇOS
  ncm                   text,                    -- NCM/SH (8 dígitos)
  cst                   text,                    -- CST (3 dígitos)
  cfop                  text,                    -- CFOP (4 dígitos)
  unidade               text DEFAULT 'PC',       -- Unidade de medida
  valor_unitario        numeric(14,4) DEFAULT 0,
  aliquota_icms         numeric(6,2)  DEFAULT 0,
  aliquota_ipi          numeric(6,2)  DEFAULT 0,
  categoria             text,                    -- Categoria livre (escoramento, viga, etc.)
  ativo                 boolean NOT NULL DEFAULT true,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now()
);

-- Índice único por código
CREATE UNIQUE INDEX IF NOT EXISTS idx_materiais_codigo ON public.materiais(codigo);
CREATE INDEX IF NOT EXISTS idx_materiais_descricao ON public.materiais(descricao);
CREATE INDEX IF NOT EXISTS idx_materiais_ativo ON public.materiais(ativo);

-- RLS
ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "materiais_all" ON public.materiais;
CREATE POLICY "materiais_all" ON public.materiais
  FOR ALL USING (true) WITH CHECK (true);

-- ── 3. ITENS_NF (Itens de cada Nota Fiscal — liga NF + material) ─────────────
CREATE TABLE IF NOT EXISTS public.itens_nf (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_fiscal_id        uuid,                    -- FK para futura tabela notas_fiscais
  material_id           uuid REFERENCES public.materiais(id) ON DELETE RESTRICT,
  obra_id               uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  codigo_produto        text NOT NULL,
  descricao             text NOT NULL,
  ncm                   text,
  cst                   text,
  cfop                  text,
  unidade               text DEFAULT 'PC',
  quantidade            numeric(14,4) DEFAULT 0,
  valor_unitario        numeric(14,4) DEFAULT 0,
  valor_total           numeric(14,2) DEFAULT 0,
  bc_icms               numeric(14,2) DEFAULT 0,
  valor_icms            numeric(14,2) DEFAULT 0,
  valor_ipi             numeric(14,2) DEFAULT 0,
  aliquota_icms         numeric(6,2)  DEFAULT 0,
  aliquota_ipi          numeric(6,2)  DEFAULT 0,
  total_tributos        numeric(14,2) DEFAULT 0,
  numero_nf             text,                    -- Número da NF de origem
  data_nf               date,
  criado_em             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itens_nf_obra     ON public.itens_nf(obra_id);
CREATE INDEX IF NOT EXISTS idx_itens_nf_material ON public.itens_nf(material_id);
CREATE INDEX IF NOT EXISTS idx_itens_nf_data     ON public.itens_nf(data_nf);

ALTER TABLE public.itens_nf ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "itens_nf_all" ON public.itens_nf;
CREATE POLICY "itens_nf_all" ON public.itens_nf
  FOR ALL USING (true) WITH CHECK (true);

-- ── 4. Inserir alguns materiais de exemplo (da NF) ────────────────────────────
INSERT INTO public.materiais (codigo, descricao, ncm, cst, cfop, unidade, valor_unitario, categoria) VALUES
  ('FUEIRO',   'FUEIRO',                              '73084000','041','1909','PC', 2.9500,  'Escoramento'),
  ('ET1C',     'PAINEL P/ ESCORAMENTO 1,00 X 1,00',  '73084000','041','1909','PC', 64.2900, 'Escoramento'),
  ('ET1B',     'PAINEL P/ ESCORAMENTO 1,00 X 1,25',  '73084000','041','1909','PC', 81.9700, 'Escoramento'),
  ('SAD',      'SUPORTE AJUSTAVEL DUPLO',             '73084000','041','1909','PC', 58.9300, 'Escoramento'),
  ('VT2-1.00', 'VIGA METALICA 2-1,00',               '73084000','041','1909','PC', 25.1800, 'Viga Metálica'),
  ('VT2-2.00', 'VIGA METALICA 2-2,00',               '73084000','041','1909','PC', 50.3600, 'Viga Metálica'),
  ('VT3-1.55', 'VIGA METALICA 3-1,55',               '73084000','041','1909','PC', 69.8900, 'Viga Metálica'),
  ('VT3-2.05', 'VIGA METALICA 3-2,05',               '73084000','041','1909','PC', 92.4400, 'Viga Metálica'),
  ('VT3-2.55', 'VIGA METALICA 3-2,55',               '73084000','041','1909','PC', 114.9800,'Viga Metálica'),
  ('VT3-3.10', 'VIGA METALICA 3-3,10',               '73084000','041','1909','PC', 139.7800,'Viga Metálica'),
  ('VT3-3.60', 'VIGA METALICA 3-3,60',               '73084000','041','1909','PC', 162.3300,'Viga Metálica'),
  ('VT3-4.10', 'VIGA METALICA 3-4,10',               '73084000','041','1909','PC', 184.8800,'Viga Metálica')
ON CONFLICT (codigo) DO NOTHING;
