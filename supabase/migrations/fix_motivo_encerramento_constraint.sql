-- =========================================================
-- Migration: Corrigir check constraint motivo_encerramento
-- Adiciona 'abandono_emprego' aos valores permitidos
-- Data: 2026-03-28
-- =========================================================

-- 1. Remove o constraint antigo
ALTER TABLE colaboradores
  DROP CONSTRAINT IF EXISTS colaboradores_motivo_encerramento_check;

-- 2. Recria com todos os valores válidos do sistema
ALTER TABLE colaboradores
  ADD CONSTRAINT colaboradores_motivo_encerramento_check
  CHECK (motivo_encerramento IN (
    'demissao_sem_justa_causa',
    'demissao_por_justa_causa',
    'pedido_demissao',
    'termino_contrato',
    'rescisao_amigavel',
    'abandono_emprego',
    'abandono_de_emprego',
    'aposentadoria',
    'falecimento',
    'mudanca_vinculo',
    'outros'
  ));
