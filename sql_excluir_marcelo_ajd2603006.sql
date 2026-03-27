-- ============================================================
--  Excluir TODOS os lançamentos de MARCELO DE JESUS OLIVEIRA
--  Chapa: AJD2603-006
--  ATENÇÃO: Irreversível. Confirme antes de executar.
-- ============================================================

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

  -- Vale transporte
  DELETE FROM public.vale_transporte        WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Vale transporte excluídos';

  -- Ponto
  DELETE FROM public.ponto_lancamentos      WHERE colaborador_id = v_colab_id;
  DELETE FROM public.registro_ponto         WHERE colaborador_id = v_colab_id;
  DELETE FROM public.portal_ponto_diario    WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Lançamentos de ponto excluídos';

  -- Financeiro
  DELETE FROM public.adiantamentos          WHERE colaborador_id = v_colab_id;
  DELETE FROM public.premios                WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Adiantamentos e prêmios excluídos';

  -- Provisões / rescisões
  DELETE FROM public.provisoes_fgts         WHERE colaborador_id = v_colab_id;
  DELETE FROM public.rescisoes              WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Provisões e rescisões excluídas';

  -- Jurídico
  DELETE FROM public.atestados              WHERE colaborador_id = v_colab_id;
  DELETE FROM public.advertencias           WHERE colaborador_id = v_colab_id;
  DELETE FROM public.acidentes              WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Atestados, advertências e acidentes excluídos';

  -- EPIs
  DELETE FROM public.colaborador_epi        WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'EPIs excluídos';

  -- Histórico de chapas / contratos
  DELETE FROM public.historico_chapa                WHERE colaborador_id = v_colab_id;
  DELETE FROM public.colaborador_historico_contrato WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Histórico de chapas excluído';

  -- Portal
  DELETE FROM public.portal_documentos      WHERE colaborador_id = v_colab_id;
  DELETE FROM public.portal_epi_solicitacoes WHERE colaborador_id = v_colab_id;
  DELETE FROM public.portal_ocorrencias     WHERE colaborador_id = v_colab_id;
  DELETE FROM public.portal_solicitacoes    WHERE colaborador_id = v_colab_id;
  RAISE NOTICE 'Portal excluído';

  RAISE NOTICE '✅ Todos os lançamentos de MARCELO DE JESUS OLIVEIRA (%) foram excluídos.', v_colab_id;
END $$;

-- ── Opcional: inativar o colaborador em vez de excluí-lo ─────────────────────
-- UPDATE public.colaboradores
--   SET status = 'inativo', data_demissao = CURRENT_DATE
--   WHERE chapa = 'AJD2603-006';
