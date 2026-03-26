-- =============================================================================
--  ConstrutorRH — SQL COMPLETO: adiantamentos + premios  (versão final)
--  Cole no SQL Editor do Supabase e clique em RUN
--  Versão com parcelamento de desconto (-AD) e controle de parcelas
-- =============================================================================

create extension if not exists "uuid-ossp";

-- =============================================================================
--  1.  ADIANTAMENTOS  (versão final com parcelamento)
-- =============================================================================
drop table if exists adiantamentos cascade;

create table adiantamentos (
  id                    uuid          primary key default uuid_generate_v4(),

  -- relacionamentos
  colaborador_id        uuid          not null references colaboradores(id) on delete cascade,
  obra_id               uuid          references obras(id) on delete set null,
  pagamento_id          uuid          references pagamentos(id) on delete set null,

  -- dados do adiantamento
  competencia           text          not null,          -- 'YYYY-MM' (mês do adiantamento)
  valor                 numeric(10,2) not null,
  tipo                  text          not null default 'adiantamento',
                    -- 'adiantamento' | 'vale' | 'ajuda_custo' | 'outro'
  status                text          not null default 'pendente',
                    -- 'pendente' | 'aprovado' | 'pago' | 'cancelado'
  observacoes           text,

  -- ── DESCONTO NO FECHAMENTO (-AD) ──────────────────────────────────────
  desconto_tipo         text          not null default 'unico',
                    -- 'unico' (desconto integral em 1 fechamento)
                    -- 'parcelado' (dividido em N fechamentos)
  desconto_parcelas     int           not null default 1,   -- total de parcelas
  desconto_parcela_atual int          not null default 0,   -- quantas já foram descontadas
  desconto_a_partir     text,                               -- 'YYYY-MM': mês a partir do qual descontar
  desconto_obs          text,                               -- texto livre que aparece no fechamento
  descontado_em         text,                               -- 'YYYY-MM': preenchido quando quitado integralmente

  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now()
);

-- índices
create index idx_adiant_colab         on adiantamentos (colaborador_id);
create index idx_adiant_comp          on adiantamentos (competencia);
create index idx_adiant_obra          on adiantamentos (obra_id);
create index idx_adiant_status        on adiantamentos (status);
create index idx_adiant_desconto_apt  on adiantamentos (desconto_a_partir);
create index idx_adiant_descontado    on adiantamentos (descontado_em);

-- =============================================================================
--  2.  PREMIOS  (versão final com obra_id e data)
-- =============================================================================
drop table if exists premios cascade;

create table premios (
  id              uuid          primary key default uuid_generate_v4(),

  -- relacionamentos
  colaborador_id  uuid          not null references colaboradores(id) on delete cascade,
  obra_id         uuid          references obras(id) on delete set null,
  pagamento_id    uuid          references pagamentos(id) on delete set null,

  -- dados do prêmio
  tipo            text,          -- 'Produtividade' | 'Assiduidade' | 'Segurança' | 'Meta' | 'Outro'
  descricao       text          not null,
  valor           numeric(10,2),
  data            date,          -- data específica do prêmio/evento
  competencia     text,          -- 'YYYY-MM'
  status          text          not null default 'pendente',
                    -- 'pendente' | 'aprovado' | 'pago' | 'cancelado'

  observacoes     text,

  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

-- índices
create index idx_premios_colab  on premios (colaborador_id);
create index idx_premios_comp   on premios (competencia);
create index idx_premios_obra   on premios (obra_id);
create index idx_premios_status on premios (status);
create index idx_premios_data   on premios (data);

-- =============================================================================
--  3.  RLS (opcional)
-- =============================================================================
-- alter table adiantamentos enable row level security;
-- alter table premios        enable row level security;
-- create policy "auth" on adiantamentos for all using (auth.role() = 'authenticated');
-- create policy "auth" on premios        for all using (auth.role() = 'authenticated');
