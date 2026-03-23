-- ══════════════════════════════════════════════════════════════════════════════
-- FERIADOS NACIONAIS BRASILEIROS
-- Execute este script no Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.feriados (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data        DATE NOT NULL,
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'nacional'
                CHECK (tipo IN ('nacional','estadual','municipal','facultativo')),
  recorrente  BOOLEAN NOT NULL DEFAULT true,  -- true = repete todo ano (usa só mes/dia)
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feriados_data_unique ON public.feriados(data);
CREATE INDEX IF NOT EXISTS idx_feriados_ativo ON public.feriados(ativo);

-- RLS
ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feriados_all" ON public.feriados;
CREATE POLICY "feriados_all" ON public.feriados FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.feriados IS 'Feriados nacionais, estaduais e municipais para cálculo de DSR';
COMMENT ON COLUMN public.feriados.recorrente IS 'Se true, o feriado se repete todo ano na mesma data (usa mês/dia)';

-- ── Feriados Nacionais Fixos 2026 ─────────────────────────────────────────────
INSERT INTO public.feriados (data, nome, tipo, recorrente) VALUES
  ('2026-01-01', 'Confraternização Universal (Ano Novo)',        'nacional', true),
  ('2026-02-16', 'Carnaval (segunda-feira)',                     'nacional', false),
  ('2026-02-17', 'Carnaval (terça-feira)',                       'nacional', false),
  ('2026-02-18', 'Quarta-feira de Cinzas (meio dia)',            'facultativo', false),
  ('2026-04-02', 'Quinta-feira Santa',                          'facultativo', false),
  ('2026-04-03', 'Paixão de Cristo (Sexta-feira Santa)',        'nacional', false),
  ('2026-04-05', 'Páscoa',                                      'nacional', false),
  ('2026-04-21', 'Tiradentes',                                  'nacional', true),
  ('2026-05-01', 'Dia do Trabalhador',                          'nacional', true),
  ('2026-06-04', 'Corpus Christi',                              'nacional', false),
  ('2026-09-07', 'Independência do Brasil',                     'nacional', true),
  ('2026-10-12', 'Nossa Senhora Aparecida',                     'nacional', true),
  ('2026-11-02', 'Finados',                                     'nacional', true),
  ('2026-11-15', 'Proclamação da República',                    'nacional', true),
  ('2026-11-20', 'Consciência Negra',                           'nacional', true),
  ('2026-12-24', 'Véspera de Natal',                            'facultativo', false),
  ('2026-12-25', 'Natal',                                       'nacional', true),
  ('2026-12-31', 'Véspera de Ano Novo',                        'facultativo', false)
ON CONFLICT (data) DO NOTHING;

-- ── Feriados 2025 (retroativo) ─────────────────────────────────────────────────
INSERT INTO public.feriados (data, nome, tipo, recorrente) VALUES
  ('2025-01-01', 'Confraternização Universal (Ano Novo)',        'nacional', true),
  ('2025-03-03', 'Carnaval (segunda-feira)',                     'nacional', false),
  ('2025-03-04', 'Carnaval (terça-feira)',                       'nacional', false),
  ('2025-04-18', 'Paixão de Cristo (Sexta-feira Santa)',        'nacional', false),
  ('2025-04-20', 'Páscoa',                                      'nacional', false),
  ('2025-04-21', 'Tiradentes',                                  'nacional', true),
  ('2025-05-01', 'Dia do Trabalhador',                          'nacional', true),
  ('2025-06-19', 'Corpus Christi',                              'nacional', false),
  ('2025-09-07', 'Independência do Brasil',                     'nacional', true),
  ('2025-10-12', 'Nossa Senhora Aparecida',                     'nacional', true),
  ('2025-11-02', 'Finados',                                     'nacional', true),
  ('2025-11-15', 'Proclamação da República',                    'nacional', true),
  ('2025-11-20', 'Consciência Negra',                           'nacional', true),
  ('2025-12-25', 'Natal',                                       'nacional', true)
ON CONFLICT (data) DO NOTHING;

SELECT count(*) AS feriados_inseridos FROM public.feriados;
