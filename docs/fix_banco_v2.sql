-- ============================================================
--  ConstrutorRH - Ajustes Banco de Dados
--  Cole este conteudo no SQL Editor do Supabase e clique RUN
-- ============================================================

-- 1. ponto_lancamentos: colunas snap_* e controle de status
alter table ponto_lancamentos
  add column if not exists status                 text          default 'em_fechamento',
  add column if not exists valor_hora_snapshot    numeric(10,2),
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
  add column if not exists snap_desconto_adiant   numeric(10,2) default 0,
  add column if not exists snap_inss              numeric(10,2),
  add column if not exists snap_ir                numeric(10,2),
  add column if not exists snap_liquido           numeric(10,2),
  add column if not exists snap_fechado_em        timestamptz,
  add column if not exists motivo_recusa          text,
  add column if not exists aprovado_por           uuid,
  add column if not exists aprovado_em            timestamptz,
  add column if not exists liberado_por           uuid,
  add column if not exists liberado_em            timestamptz,
  add column if not exists pagamento_id           uuid references pagamentos(id) on delete set null,
  add column if not exists created_at             timestamptz default now(),
  add column if not exists updated_at             timestamptz default now();

create index if not exists idx_lancamentos_status on ponto_lancamentos (status);
create index if not exists idx_lancamentos_mes    on ponto_lancamentos (mes_referencia);
create index if not exists idx_lancamentos_pagto  on ponto_lancamentos (pagamento_id);


-- 2. adiantamentos: colunas de parcelamento -AD
alter table adiantamentos
  add column if not exists desconto_tipo          text    default 'unico',
  add column if not exists desconto_parcelas      int     default 1,
  add column if not exists desconto_parcela_atual int     default 0,
  add column if not exists desconto_a_partir      text,
  add column if not exists desconto_obs           text,
  add column if not exists descontado_em          text,
  add column if not exists obra_id                uuid    references obras(id) on delete set null;

create index if not exists idx_adiant_desconto_apt on adiantamentos (desconto_a_partir);
create index if not exists idx_adiant_descontado   on adiantamentos (descontado_em);


-- 3. premios: colunas data e obra_id
alter table premios
  add column if not exists data    date,
  add column if not exists obra_id uuid references obras(id) on delete set null;

create index if not exists idx_premios_data on premios (data);


-- 4. lista_negra_juridico
create table if not exists lista_negra_juridico (
  id             uuid        primary key default uuid_generate_v4(),
  cpf            text        not null unique,
  nome           text,
  motivo         text,
  observacoes    text,
  adicionado_por text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_lista_negra_cpf on lista_negra_juridico (cpf);
