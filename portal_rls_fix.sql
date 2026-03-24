-- ═══════════════════════════════════════════════════════════════
-- Portal da Obra — COOPERAÇÃO TOTAL: Sistema Principal ↔ Portal
-- Execute no Supabase SQL Editor (pode re-executar com segurança)
-- ═══════════════════════════════════════════════════════════════
-- LEITURA: Portal (anon) lê dados do sistema principal
-- ESCRITA:  Portal (anon) grava em portal_* 
-- SINCRONIZAÇÃO: Sistema principal importa do portal
-- ═══════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════╗
-- ║  1. PORTAL LÊ DO SISTEMA PRINCIPAL (anon → tabelas core)  ║
-- ╚═══════════════════════════════════════════════════════════╝

-- Habilitar RLS nas tabelas principais (idempotente)
ALTER TABLE obras          ENABLE ROW LEVEL SECURITY;
ALTER TABLE colaboradores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcoes        ENABLE ROW LEVEL SECURITY;

-- obras: anon pode ler (filtro de quais obras é feito no app pelo portal_usuarios.obras_ids)
DROP POLICY IF EXISTS "portal anon read obras" ON obras;
CREATE POLICY "portal anon read obras"
  ON obras FOR SELECT TO anon USING (true);

-- colaboradores: anon lê apenas ativos (filtro por obra_id feito no app)
DROP POLICY IF EXISTS "portal anon read colaboradores" ON colaboradores;
CREATE POLICY "portal anon read colaboradores"
  ON colaboradores FOR SELECT TO anon
  USING (status = 'ativo');

-- funcoes: anon lê funções ativas (para solicitar novo colaborador)
DROP POLICY IF EXISTS "portal anon read funcoes" ON funcoes;
CREATE POLICY "portal anon read funcoes"
  ON funcoes FOR SELECT TO anon
  USING (ativo = true);


-- ╔═══════════════════════════════════════════════════════════╗
-- ║  2. PORTAL GRAVA NAS TABELAS portal_*  (anon → INSERT)    ║
-- ╚═══════════════════════════════════════════════════════════╝

-- portal_usuarios: apenas leitura para anon (login)
ALTER TABLE portal_usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portal anon read usuarios" ON portal_usuarios;
CREATE POLICY "portal anon read usuarios"
  ON portal_usuarios FOR SELECT TO anon
  USING (ativo = true);

-- portal_ponto_diario: anon lê e grava (encarregado lança presença)
ALTER TABLE portal_ponto_diario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portal anon read ponto"   ON portal_ponto_diario;
DROP POLICY IF EXISTS "portal anon insert ponto"  ON portal_ponto_diario;
DROP POLICY IF EXISTS "portal anon update ponto"  ON portal_ponto_diario;
CREATE POLICY "portal anon read ponto"
  ON portal_ponto_diario FOR SELECT TO anon USING (true);
CREATE POLICY "portal anon insert ponto"
  ON portal_ponto_diario FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "portal anon update ponto"
  ON portal_ponto_diario FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- portal_ocorrencias: anon lê e insere
ALTER TABLE portal_ocorrencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portal anon read ocorr"   ON portal_ocorrencias;
DROP POLICY IF EXISTS "portal anon insert ocorr"  ON portal_ocorrencias;
CREATE POLICY "portal anon read ocorr"
  ON portal_ocorrencias FOR SELECT TO anon USING (true);
CREATE POLICY "portal anon insert ocorr"
  ON portal_ocorrencias FOR INSERT TO anon WITH CHECK (true);

-- portal_solicitacoes: anon lê e insere
ALTER TABLE portal_solicitacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "portal anon read solic"   ON portal_solicitacoes;
DROP POLICY IF EXISTS "portal anon insert solic"  ON portal_solicitacoes;
CREATE POLICY "portal anon read solic"
  ON portal_solicitacoes FOR SELECT TO anon USING (true);
CREATE POLICY "portal anon insert solic"
  ON portal_solicitacoes FOR INSERT TO anon WITH CHECK (true);


-- ╔═══════════════════════════════════════════════════════════╗
-- ║  3. SISTEMA PRINCIPAL LÊ DO PORTAL (authenticated → *)    ║
-- ╚═══════════════════════════════════════════════════════════╝
-- Usuários autenticados (sistema principal) podem ler tudo do portal
-- e atualizar status de solicitações / ocorrências

DROP POLICY IF EXISTS "admin read portal_ponto"       ON portal_ponto_diario;
DROP POLICY IF EXISTS "admin read portal_ocorr"       ON portal_ocorrencias;
DROP POLICY IF EXISTS "admin read portal_solic"       ON portal_solicitacoes;
DROP POLICY IF EXISTS "admin update portal_solic"     ON portal_solicitacoes;
DROP POLICY IF EXISTS "admin update portal_ocorr"     ON portal_ocorrencias;
DROP POLICY IF EXISTS "admin rw portal_usuarios"      ON portal_usuarios;

CREATE POLICY "admin read portal_ponto"
  ON portal_ponto_diario FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin read portal_ocorr"
  ON portal_ocorrencias  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin read portal_solic"
  ON portal_solicitacoes FOR SELECT TO authenticated USING (true);

-- Admin pode aprovar/recusar solicitações e atualizar status de ocorrências
CREATE POLICY "admin update portal_solic"
  ON portal_solicitacoes FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
CREATE POLICY "admin update portal_ocorr"
  ON portal_ocorrencias  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

-- Admin gerencia usuários do portal
CREATE POLICY "admin rw portal_usuarios"
  ON portal_usuarios FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ╔═══════════════════════════════════════════════════════════╗
-- ║  4. CAMPO sincronizado_em nas tabelas do portal           ║
-- ╚═══════════════════════════════════════════════════════════╝
-- Marca quando o registro foi importado para o sistema principal

ALTER TABLE portal_ponto_diario
  ADD COLUMN IF NOT EXISTS sincronizado_em  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lancamento_id    uuid         REFERENCES ponto_lancamentos(id) ON DELETE SET NULL;

ALTER TABLE portal_ocorrencias
  ADD COLUMN IF NOT EXISTS sincronizado_em  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ocorrencia_id    uuid         DEFAULT NULL;   -- ref à tabela de ocorrências principal

ALTER TABLE portal_solicitacoes
  ADD COLUMN IF NOT EXISTS sincronizado_em  timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS colaborador_id   uuid         REFERENCES colaboradores(id) ON DELETE SET NULL;


-- ╔═══════════════════════════════════════════════════════════╗
-- ║  5. VIEW auxiliar: resumo de pendências do portal         ║
-- ╚═══════════════════════════════════════════════════════════╝
CREATE OR REPLACE VIEW portal_pendencias AS
SELECT
  'ponto'          AS tipo,
  COUNT(*)::int    AS total
FROM portal_ponto_diario
WHERE sincronizado_em IS NULL

UNION ALL

SELECT
  'ocorrencia'     AS tipo,
  COUNT(*)::int    AS total
FROM portal_ocorrencias
WHERE sincronizado_em IS NULL

UNION ALL

SELECT
  'solicitacao'    AS tipo,
  COUNT(*)::int    AS total
FROM portal_solicitacoes
WHERE status = 'pendente';

-- Acesso à view para ambos os papéis
GRANT SELECT ON portal_pendencias TO authenticated, anon;


-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (execute separado para confirmar)
-- ═══════════════════════════════════════════════════════════════
-- SELECT tablename, policyname, cmd, roles::text
-- FROM pg_policies
-- WHERE tablename IN (
--   'obras','colaboradores','funcoes',
--   'portal_usuarios','portal_ponto_diario',
--   'portal_ocorrencias','portal_solicitacoes'
-- )
-- ORDER BY tablename, cmd;
