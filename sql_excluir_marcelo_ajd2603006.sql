-- ============================================================
--  Excluir TODOS os lançamentos de MARCELO DE JESUS OLIVEIRA
--  Chapa: AJD2603-006
--  ATENÇÃO: Irreversível. Confirme antes de executar.
-- ============================================================

-- 1. Identificar o colaborador
DO $$
DECLARE
  v_colab_id uuid;
BEGIN
  SELECT id INTO v_colab_id
  FROM public.colaboradores
  WHERE UPPER(nome) LIKE '%MARCELO%JESUS%OLIVEIRA%'
     OR chapa = 'AJD2603-006'
  LIMIT 1;

  IF v_colab_id IS NULL THEN
    RAISE EXCEPTION 'Colaborador MARCELO DE JESUS OLIVEIRA / AJD2603-006 não encontrado.';
  END IF;

  RAISE NOTICE 'Colaborador encontrado: %', v_colab_id;

  -- 2. Excluir vale_transporte
  DELETE FROM public.vale_transporte WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Vale transporte excluídos';

  -- 3. Excluir ponto_lancamentos
  DELETE FROM public.ponto_lancamentos WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Lançamentos de ponto excluídos';

  -- 4. Excluir registro_ponto
  DELETE FROM public.registro_ponto WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Registros de ponto excluídos';

  -- 5. Excluir portal_ponto_diario
  DELETE FROM public.portal_ponto_diario WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Portal ponto diário excluídos';

  -- 6. Excluir adiantamentos
  DELETE FROM public.adiantamentos WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Adiantamentos excluídos';

  -- 7. Excluir premios
  DELETE FROM public.premios WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Prêmios excluídos';

  -- 8. Excluir provisionamento
  DELETE FROM public.provisao_fgts WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Provisão FGTS excluída';

  -- 9. Excluir encargos se houver tabela separada
  -- (caso exista tabela encargos_lancamentos)
  -- DELETE FROM public.encargos_lancamentos WHERE colaborador_id = v_colab_id;

  -- 10. Excluir atestados / advertencias / acidentes
  DELETE FROM public.atestados   WHERE colaborador_id = v_colab_id;
  DELETE FROM public.advertencias WHERE colaborador_id = v_colab_id;
  DELETE FROM public.acidentes    WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Atestados, advertências e acidentes excluídos';

  RAISE NOTICE '✅ Todos os lançamentos de MARCELO DE JESUS OLIVEIRA (%) foram excluídos.', v_colab_id;
END $$;

-- ── Opcional: se quiser INATIVAR em vez de excluir o colaborador ─────────────
-- UPDATE public.colaboradores
--   SET status = 'inativo', data_demissao = CURRENT_DATE
--   WHERE chapa = 'AJD2603-006';
