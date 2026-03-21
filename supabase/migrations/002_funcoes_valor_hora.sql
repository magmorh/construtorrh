-- Migração 002: Adicionar campos de valor/hora e sigla em funcoes
ALTER TABLE public.funcoes
  ADD COLUMN IF NOT EXISTS sigla TEXT,
  ADD COLUMN IF NOT EXISTS valor_hora_clt NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_hora_autonomo NUMERIC(10,2);

-- Manter salario_base para não quebrar registros antigos (nullable)
-- mas não será mais usado na interface

SELECT '✅ Migração 002 aplicada!' AS resultado;
