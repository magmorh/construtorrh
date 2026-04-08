-- =========================================================================
-- FIX: Competência dos lançamentos de ponto — Março 2025
-- =========================================================================
-- Regra: colaboradores trabalham em março e recebem em abril.
-- Lançamentos com data_inicio entre 05/03/2025 e 06/04/2025 têm
-- mes_referencia = '2025-03' (competência de março).
--
-- Este script corrige lançamentos que possam ter sido criados com
-- mes_referencia errado (ex: '2025-04') para os períodos de março.
-- =========================================================================

-- 1. Verificar lançamentos afetados (só consulta, não altera)
SELECT
  id,
  colaborador_id,
  obra_id,
  mes_referencia  AS "competência atual",
  data_inicio,
  data_fim,
  status
FROM ponto_lancamentos
WHERE data_inicio >= '2025-03-05'
  AND data_inicio <= '2025-04-06'
ORDER BY data_inicio, mes_referencia;

-- =========================================================================
-- 2. CORREÇÃO: Atualizar mes_referencia para '2025-03' onde necessário
--    (lançamentos cujo período de trabalho cai dentro de 05/03 a 06/04)
-- =========================================================================
UPDATE ponto_lancamentos
SET mes_referencia = '2025-03'
WHERE data_inicio >= '2025-03-05'
  AND data_inicio <= '2025-04-06'
  AND mes_referencia <> '2025-03';

-- Verificar quantos registros foram afetados
-- (execute o SELECT acima novamente para confirmar)

-- =========================================================================
-- 3. (Opcional) Corrigir contracheques vinculados a esses lançamentos
--    Atualiza competencia dos contracheques gerados desses lançamentos
-- =========================================================================
UPDATE contracheques
SET competencia = '2025-03-01'
WHERE lancamento_id IN (
  SELECT id FROM ponto_lancamentos
  WHERE data_inicio >= '2025-03-05'
    AND data_inicio <= '2025-04-06'
    AND mes_referencia = '2025-03'
)
AND competencia <> '2025-03-01';

-- =========================================================================
-- Resumo do que foi feito:
-- - ponto_lancamentos com data_inicio 05/03 a 06/04 → mes_referencia='2025-03'
-- - contracheques gerados desses lançamentos → competencia='2025-03-01'
-- =========================================================================
