-- =============================================================================
--  ConstrutorRH — AJUSTES BANCO DE DADOS (versão final)
--  Execute no SQL Editor do Supabase — clique em RUN
--  Seguro para rodar mesmo que algumas colunas já existam (usa IF NOT EXISTS)
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
--  1. TABELA: ponto_lancamentos
--     Adicionar colunas de snapshot (snap_*) usadas no Fechamento de Ponto
-- ═══════════════════════════════════════════════════════════════════════════
alter table ponto_lancamentos
  add column if not exists status                 text          not null default 'em_fechamento',
  add column if not exists valor_hora_snapshot    numeric(10,2),

  -- snapshots calculados no fechamento (armazenados para histórico)
  add column if not exists snap_valor_hora        numeric(10,2),
  add column if not exists snap_horas_normais     numeric(6,2),
  add column if not exists snap_horas_extras      numeric(6,2),
  add column if not exists snap_valor_horas       numeric(10,2),
  add column if not exists snap_valor_producao    numeric(10,2),
  add column if not exists snap_valor_dsr         numeric(10,2),
  add column if not exists snap_valor_premio      numeric(10,2),
  add column if not exists snap_valor_total       numeric(10,2),

  add column if not exists snap_faltas            int,
  add column if not exists snap_vt_diario         numeric(10,2),
  add column if not exists snap_desconto_vt       numeric(10,2),
  add column if not exists snap_desconto_adiant   numeric(10,2) default 0,  -- ← desconto -AD
  add column if not exists snap_inss              numeric(10,2),
  add column if not exists snap_ir                numeric(10,2),
  add column if not exists snap_liquido           numeric(10,2),
  add column if not exists snap_fechado_em        timestamptz,

  -- motivo de recusa
  add column if not exists motivo_recusa          text,

  -- aprovações
  add column if not exists aprovado_por           uuid references auth.users(id),
  add column if not exists aprovado_em            timestamptz,
  add column if not exists liberado_por           uuid references auth.users(id),
  add column if not exists liberado_em            timestamptz,

  -- pagamento
  add column if not exists pagamento_id           uuid references pagamentos(id) on delete set null,

  add column if not exists created_at             timestamptz not null default now(),
  add column if not exists updated_at             timestamptz not null default now();

-- índices de desempenho
create index if not exists idx_lancamentos_status   on ponto_lancamentos (status);
create index if not exists idx_lancamentos_mes      on ponto_lancamentos (mes_referencia);
create index if not exists idx_lancamentos_pagto    on ponto_lancamentos (pagamento_id);


-- ═══════════════════════════════════════════════════════════════════════════
--  2. TABELA: adiantamentos
--     Recriar com todas as colunas de parcelamento (-AD)
--     ATENÇÃO: DROP CASCADE apaga dados existentes!
--     Se já tiver dados, use a versão ALTER abaixo no lugar do DROP.
-- ═══════════════════════════════════════════════════════════════════════════

-- OPÇÃO A — Recriar do zero (use se a tabela estiver vazia ou for nova)
-- -----------------------------------------------------------------------
drop table if exists adiantamentos cascade;

create table adiantamentos (
  id                     uuid          primary key default uuid_generate_v4(),

  colaborador_id         uuid          not null references colaboradores(id) on delete cascade,
  obra_id                uuid          references obras(id) on delete set null,
  pagamento_id           uuid          references pagamentos(id) on delete set null,

  competencia            text          not null,   -- 'YYYY-MM'
  valor                  numeric(10,2) not null,
  tipo                   text          not null default 'adiantamento',
    -- 'adiantamento' | 'vale' | 'ajuda_custo' | 'outro'
  status                 text          not null default 'pendente',
    -- 'pendente' | 'aprovado' | 'pago' | 'cancelado'
  observacoes            text,

  -- ── Desconto no Fechamento (-AD) ──────────────────────────────────────
  desconto_tipo          text          not null default 'unico',
    -- 'unico' | 'parcelado'
  desconto_parcelas      int           not null default 1,
  desconto_parcela_atual int           not null default 0,
  desconto_a_partir      text,         -- 'YYYY-MM': mês de início do desconto
  desconto_obs           text,         -- observação exibida no fechamento
  descontado_em          text,         -- 'YYYY-MM': quando foi totalmente quitado

  created_at             timestamptz   not null default now(),
  updated_at             timestamptz   not null default now()
);

create index idx_adiant_colab        on adiantamentos (colaborador_id);
create index idx_adiant_comp         on adiantamentos (competencia);
create index idx_adiant_obra         on adiantamentos (obra_id);
create index idx_adiant_status       on adiantamentos (status);
create index idx_adiant_desconto_apt on adiantamentos (desconto_a_partir);
create index idx_adiant_descontado   on adiantamentos (descontado_em);

-- -----------------------------------------------------------------------
-- OPÇÃO B — Apenas adicionar colunas novas (use se já houver dados)
-- Descomente as linhas abaixo e comente o bloco DROP/CREATE acima
-- -----------------------------------------------------------------------
-- alter table adiantamentos
--   add column if not exists desconto_tipo          text    not null default 'unico',
--   add column if not exists desconto_parcelas      int     not null default 1,
--   add column if not exists desconto_parcela_atual int     not null default 0,
--   add column if not exists desconto_a_partir      text,
--   add column if not exists desconto_obs           text,
--   add column if not exists descontado_em          text;


-- ═══════════════════════════════════════════════════════════════════════════
--  3. TABELA: premios
--     Recriar com campo 'data' e 'obra_id'
--     ATENÇÃO: DROP CASCADE apaga dados existentes!
-- ═══════════════════════════════════════════════════════════════════════════

-- OPÇÃO A — Recriar do zero
-- -----------------------------------------------------------------------
drop table if exists premios cascade;

create table premios (
  id              uuid          primary key default uuid_generate_v4(),

  colaborador_id  uuid          not null references colaboradores(id) on delete cascade,
  obra_id         uuid          references obras(id) on delete set null,
  pagamento_id    uuid          references pagamentos(id) on delete set null,

  tipo            text,
    -- 'Produtividade' | 'Assiduidade' | 'Segurança' | 'Meta' | 'Outros'
  descricao       text          not null,
  valor           numeric(10,2),
  data            date,         -- data do evento/prêmio
  competencia     text,         -- 'YYYY-MM'
  status          text          not null default 'pendente',
    -- 'pendente' | 'aprovado' | 'pago' | 'cancelado'
  observacoes     text,

  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index idx_premios_colab  on premios (colaborador_id);
create index idx_premios_comp   on premios (competencia);
create index idx_premios_obra   on premios (obra_id);
create index idx_premios_status on premios (status);
create index idx_premios_data   on premios (data);

-- -----------------------------------------------------------------------
-- OPÇÃO B — Apenas adicionar colunas (use se já houver dados)
-- -----------------------------------------------------------------------
-- alter table premios
--   add column if not exists data    date,
--   add column if not exists obra_id uuid references obras(id) on delete set null;


-- ═══════════════════════════════════════════════════════════════════════════
--  4. TABELA: lista_negra_juridico
--     Para verificação de CPF na tela Jurídico
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists lista_negra_juridico (
  id              uuid          primary key default uuid_generate_v4(),
  cpf             text          not null unique,
  nome            text,
  motivo          text,
  observacoes     text,
  adicionado_por  text,
  created_at      timestamptz   not null default now()
);

create index if not exists idx_lista_negra_cpf on lista_negra_juridico (cpf);


-- ═══════════════════════════════════════════════════════════════════════════
--  FIM DO SCRIPT
-- ═══════════════════════════════════════════════════════════════════════════
