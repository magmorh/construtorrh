-- ============================================================
--   ConstrutorRH — Script completo de criação das tabelas
--   Banco: Supabase (PostgreSQL)
--   Gerado em: 2026-03-26
--   Execute no SQL Editor do Supabase na ordem abaixo
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 0. EXTENSÕES
-- ════════════════════════════════════════════════════════════
create extension if not exists "uuid-ossp";


-- ════════════════════════════════════════════════════════════
-- 1. TABELAS BASE (sem FK externas)
-- ════════════════════════════════════════════════════════════

-- ── funcoes ──────────────────────────────────────────────────
create table if not exists funcoes (
  id                   uuid primary key default uuid_generate_v4(),
  nome                 text not null,
  sigla                text not null,
  descricao            text,
  cbo                  text,
  categoria            text,
  valor_hora_clt       numeric(10,2),
  valor_hora_autonomo  numeric(10,2),
  ativo                boolean not null default true,
  created_at           timestamptz not null default now()
);

-- ── funcao_valores (histórico de valores por tipo de contrato) ──
create table if not exists funcao_valores (
  id              uuid primary key default uuid_generate_v4(),
  funcao_id       uuid not null references funcoes(id) on delete cascade,
  tipo_contrato   text not null,          -- 'clt' | 'autonomo' | 'pj'
  valor_hora      numeric(10,2),
  vigencia_inicio date,
  vigencia_fim    date,
  created_at      timestamptz not null default now()
);

-- ── funcao_epi (EPIs padrão por função) ──────────────────────
create table if not exists funcao_epi (
  id         uuid primary key default uuid_generate_v4(),
  funcao_id  uuid not null references funcoes(id) on delete cascade,
  epi_id     uuid,                        -- referência a epi_catalogo
  created_at timestamptz not null default now()
);

-- ── obras ─────────────────────────────────────────────────────
create table if not exists obras (
  id                  uuid primary key default uuid_generate_v4(),
  nome                text not null,
  codigo              text,
  endereco            text,
  cidade              text,
  estado              text,
  cliente             text,
  responsavel         text,
  data_inicio         date,
  data_previsao_fim   date,
  status              text not null default 'ativa',
                        -- 'ativa' | 'concluida' | 'pausada' | 'cancelada'
  observacoes         text,
  created_at          timestamptz not null default now()
);

-- ── obra_horarios (horários de trabalho por obra e dia da semana) ──
create table if not exists obra_horarios (
  id              uuid primary key default uuid_generate_v4(),
  obra_id         uuid not null references obras(id) on delete cascade,
  dia_semana      int  not null,           -- 0=Domingo … 6=Sábado
  hora_entrada    text,                    -- 'HH:MM'
  saida_almoco    text,
  retorno_almoco  text,
  hora_saida      text,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ── feriados ─────────────────────────────────────────────────
create table if not exists feriados (
  id          uuid primary key default uuid_generate_v4(),
  data        date not null,
  nome        text not null,
  tipo        text not null default 'nacional',
                -- 'nacional' | 'estadual' | 'municipal' | 'facultativo'
  recorrente  boolean not null default false,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── epi_catalogo ─────────────────────────────────────────────
create table if not exists epi_catalogo (
  id               uuid primary key default uuid_generate_v4(),
  nome             text not null,
  categoria        text,
  numero_ca        text,
  unidade          text not null default 'unidade',
  requer_tamanho   boolean not null default false,
  requer_numero    boolean not null default false,
  vida_util_meses  int,
  ativo            boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ── configuracoes (chave-valor do sistema) ────────────────────
create table if not exists configuracoes (
  id         uuid primary key default uuid_generate_v4(),
  chave      text not null unique,
  valor      text,
  updated_at timestamptz not null default now()
);

-- ── playbook_itens ───────────────────────────────────────────
create table if not exists playbook_itens (
  id          uuid primary key default uuid_generate_v4(),
  obra_id     uuid references obras(id) on delete cascade,
  descricao   text not null,
  categoria   text,
  unidade     text,
  valor_unit  numeric(10,2),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- alias legado (caso alguma query use o nome antigo)
-- create view playbook_items as select * from playbook_itens;


-- ════════════════════════════════════════════════════════════
-- 2. COLABORADORES E RELACIONAMENTOS
-- ════════════════════════════════════════════════════════════

-- ── colaboradores ────────────────────────────────────────────
create table if not exists colaboradores (
  id                  uuid primary key default uuid_generate_v4(),
  chapa               text,
  nome                text not null,
  cpf                 text,
  rg                  text,
  pis_nit             text,
  data_nascimento     date,
  genero              text,              -- 'masculino' | 'feminino' | 'outro'
  estado_civil        text,              -- 'solteiro' | 'casado' | 'divorciado' | 'viuvo' | 'uniao_estavel'
  telefone            text,
  email               text,
  endereco            text,
  cidade              text,
  estado              text,
  cep                 text,
  cnh                 text,
  funcao_id           uuid references funcoes(id),
  obra_id             uuid references obras(id),
  tipo_contrato       text,              -- 'clt' | 'autonomo' | 'pj' | 'menor_aprendiz' | 'estagio'
  data_admissao       date,
  data_status         date,              -- data de demissão / reativação
  salario_base        numeric(10,2),
  ctps_numero         text,
  ctps_serie          text,
  banco               text,
  agencia             text,
  conta               text,
  tipo_conta          text,              -- 'corrente' | 'poupanca'
  pix_tipo            text,              -- 'cpf' | 'telefone' | 'email' | 'chave_aleatoria'
  pix_chave           text,
  vale_transporte     boolean not null default false,
  vt_dados            jsonb,             -- {modalidade, trechos_ida, trechos_volta, ...}
  status              text not null default 'ativo',
                                         -- 'ativo' | 'inativo' | 'ferias' | 'afastado'
  observacoes         text,
  created_at          timestamptz not null default now()
);

-- ── colaborador_epi (EPIs vinculados ao colaborador) ─────────
create table if not exists colaborador_epi (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid not null references colaboradores(id) on delete cascade,
  epi_id          uuid references epi_catalogo(id),
  created_at      timestamptz not null default now()
);

-- ── epis_entregues (controle de entrega) ─────────────────────
create table if not exists epis_entregues (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid not null references colaboradores(id) on delete cascade,
  epi_id          uuid references epi_catalogo(id),
  data_entrega    date,
  data_validade   date,
  quantidade      int  default 1,
  tamanho         text,
  numero          text,
  assinado        boolean not null default false,
  observacoes     text,
  created_at      timestamptz not null default now()
);

-- ── historico_chapa (mudança de função / chapa) ───────────────
create table if not exists historico_chapa (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid references colaboradores(id) on delete cascade,
  chapa           text,
  funcao_id       uuid references funcoes(id),
  tipo_contrato   text,
  data_inicio     date,
  data_fim        date,
  motivo_troca    text,
  created_at      timestamptz not null default now()
);

-- ── colaborador_historico_contrato ────────────────────────────
create table if not exists colaborador_historico_contrato (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid not null references colaboradores(id) on delete cascade,
  tipo_contrato   text,
  funcao_id       uuid references funcoes(id),
  obra_id         uuid references obras(id),
  salario_base    numeric(10,2),
  data_inicio     date,
  data_fim        date,
  motivo          text,
  created_at      timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════
-- 3. SAÚDE & SEGURANÇA
-- ════════════════════════════════════════════════════════════

-- ── ocorrencias ──────────────────────────────────────────────
-- Tabela unificada de eventos (atestados, advertências, acidentes importados do portal)
create table if not exists ocorrencias (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid references colaboradores(id),
  obra_id         uuid references obras(id),
  data            date,
  tipo            text,                   -- 'acidente' | 'advertencia' | 'atestado' | 'outro'
  descricao       text,
  status          text default 'aberto',  -- 'aberto' | 'encerrado'
  observacoes     text,
  origem_id       text,                   -- id do portal_ocorrencias original
  created_at      timestamptz not null default now()
);

-- ── atestados ────────────────────────────────────────────────
create table if not exists atestados (
  id               uuid primary key default uuid_generate_v4(),
  colaborador_id   uuid references colaboradores(id),
  data             date,
  tipo             text default 'medico',  -- 'medico' | 'odontologico' | 'acompanhamento'
  com_afastamento  boolean not null default false,
  dias_afastamento int,
  cid              text,
  medico           text,
  nome_medico      text,
  crm              text,
  arquivo_url      text,
  descricao        text,
  observacoes      text,
  status           text default 'registrado',
  created_at       timestamptz not null default now()
);

-- ── acidentes ────────────────────────────────────────────────
create table if not exists acidentes (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid references colaboradores(id),
  obra_id         uuid references obras(id),
  data_ocorrencia date,
  hora_acidente   text,
  tipo            text,     -- 'com_afastamento' | 'sem_afastamento' | 'fatal' | 'quase_acidente'
  gravidade       text,     -- 'leve' | 'moderado' | 'grave'
  descricao       text,
  local_acidente  text,
  cat_emitida     boolean not null default false,
  status          text not null default 'aberto',
  observacoes     text,
  created_at      timestamptz not null default now()
);

-- ── advertencias ─────────────────────────────────────────────
create table if not exists advertencias (
  id                 uuid primary key default uuid_generate_v4(),
  colaborador_id     uuid references colaboradores(id),
  data_advertencia   date,
  tipo               text,    -- 'escrita' | 'verbal' | 'suspensao'
  motivo             text,
  descricao          text,
  dias_suspensao     int,
  assinada           boolean not null default false,
  arquivo_url        text,
  observacoes        text,
  created_at         timestamptz not null default now()
);

-- ── documentos (individuais do colaborador, ex.: CNH, diplomas) ──
create table if not exists documentos (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid references colaboradores(id),
  tipo            text,
  nome            text,
  descricao       text,
  data_emissao    date,
  data_validade   date,
  arquivo_url     text,
  status          text default 'ativo',  -- 'ativo' | 'vencido' | 'revogado'
  observacoes     text,
  created_at      timestamptz not null default now()
);

-- ── documentos_avulsos (documentos gerais não vinculados a colaborador) ──
create table if not exists documentos_avulsos (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid references colaboradores(id),
  tipo            text,
  data            date,
  descricao       text,
  documento_url   text,
  documento_nome  text,
  created_at      timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════
-- 4. PONTO
-- ════════════════════════════════════════════════════════════

-- ── ponto_lancamentos (cabeçalho do período de ponto por colab/obra) ──
create table if not exists ponto_lancamentos (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid not null references colaboradores(id),
  obra_id         uuid references obras(id),
  mes_referencia  text,                   -- 'YYYY-MM'
  data_inicio     date,
  data_fim        date,
  status          text not null default 'rascunho',
                    -- 'rascunho' | 'fechado' | 'aprovado'
  criado_por      text,                   -- 'sistema' | 'portal' | id do usuário
  observacoes     text,
  created_at      timestamptz not null default now()
);

-- ── registro_ponto (linhas diárias de ponto) ─────────────────
create table if not exists registro_ponto (
  id                  uuid primary key default uuid_generate_v4(),
  lancamento_id       uuid references ponto_lancamentos(id) on delete cascade,
  colaborador_id      uuid references colaboradores(id),
  obra_id             uuid references obras(id),
  data                date not null,
  hora_entrada        text,
  saida_almoco        text,
  retorno_almoco      text,
  hora_saida          text,
  horas_trabalhadas   numeric(5,2),
  horas_extras        numeric(5,2) default 0,
  falta               boolean not null default false,
  status              text default 'presente',
                        -- 'presente' | 'falta' | 'falta_justificada' | 'ferias' | 'afastado'
  observacoes         text,
  created_at          timestamptz not null default now()
);

-- ── ponto_producao (apontamento de produção no ponto) ────────
create table if not exists ponto_producao (
  id                 uuid primary key default uuid_generate_v4(),
  lancamento_id      uuid references ponto_lancamentos(id) on delete cascade,
  colaborador_id     uuid references colaboradores(id),
  obra_id            uuid references obras(id),
  playbook_item_id   uuid references playbook_itens(id),
  data               date,
  quantidade         numeric(10,3),
  valor_unit         numeric(10,2),
  valor_total        numeric(10,2),
  dias               int,
  observacoes        text,
  created_at         timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════
-- 5. FINANCEIRO
-- ════════════════════════════════════════════════════════════

-- ── pagamentos ───────────────────────────────────────────────
create table if not exists pagamentos (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid references colaboradores(id),
  obra_id         uuid references obras(id),
  competencia     text,                   -- 'YYYY-MM'
  data_pagamento  date,
  tipo            text,                   -- 'salario' | 'adiantamento' | 'premio' | 'rescisao' | 'vale_transporte' | 'outro'
  valor_bruto     numeric(10,2),
  inss            numeric(10,2) default 0,
  fgts            numeric(10,2) default 0,
  ir              numeric(10,2) default 0,
  vale_transporte numeric(10,2) default 0,
  adiantamento    numeric(10,2) default 0,
  valor_liquido   numeric(10,2),
  status          text not null default 'pendente',
                    -- 'pendente' | 'aprovado' | 'pago' | 'cancelado'
  observacoes     text,
  created_at      timestamptz not null default now()
);

-- ── adiantamentos ────────────────────────────────────────────
create table if not exists adiantamentos (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid not null references colaboradores(id),
  competencia     text not null,          -- 'YYYY-MM'
  valor           numeric(10,2) not null,
  tipo            text not null default 'adiantamento',
                    -- 'adiantamento' | 'vale' | 'ajuda_custo' | 'outro'
  status          text not null default 'pendente',
                    -- 'pendente' | 'aprovado' | 'pago' | 'cancelado'
  pagamento_id    uuid references pagamentos(id),
  descontado_em   text,                   -- 'YYYY-MM' em que foi descontado
  observacoes     text,
  created_at      timestamptz not null default now()
);

-- ── premios ──────────────────────────────────────────────────
create table if not exists premios (
  id              uuid primary key default uuid_generate_v4(),
  colaborador_id  uuid not null references colaboradores(id),
  tipo            text,                   -- 'Produtividade' | 'Assiduidade' | 'Segurança' | ...
  descricao       text not null,
  valor           numeric(10,2),
  competencia     text,                   -- 'YYYY-MM'
  status          text not null default 'pendente',
                    -- 'pendente' | 'aprovado' | 'pago' | 'cancelado'
  pagamento_id    uuid references pagamentos(id),
  observacoes     text,
  created_at      timestamptz not null default now()
);

-- ── vale_transporte ──────────────────────────────────────────
create table if not exists vale_transporte (
  id                    uuid primary key default uuid_generate_v4(),
  colaborador_id        uuid not null references colaboradores(id),
  competencia           text not null,    -- 'YYYY-MM'
  data_inicio           date,
  data_fim              date,
  tipo                  text,             -- 'onibus' | 'metro' | 'trem' | 'gasolina' | 'misto'
  valor                 numeric(10,2),
  dias_trabalhados      int default 0,
  desconto_colaborador  numeric(10,2),
  valor_empresa         numeric(10,2),
  descontar_6pct        boolean not null default false,
  pagamento_id          uuid references pagamentos(id),
  status                text not null default 'pendente',
  observacoes           text,
  created_at            timestamptz not null default now()
);

-- ── provisoes_fgts ───────────────────────────────────────────
create table if not exists provisoes_fgts (
  id                      uuid primary key default uuid_generate_v4(),
  colaborador_id          uuid not null references colaboradores(id),
  obra_id                 uuid references obras(id),
  competencia             text not null,  -- 'YYYY-MM'
  salario_base            numeric(10,2),
  fgts_mensal             numeric(10,2),
  ferias_provisionadas    numeric(10,2),
  decimo_terceiro         numeric(10,2),
  total_provisao          numeric(10,2),
  observacoes             text,
  created_at              timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════
-- 6. PORTAL DA OBRA (app mobile/web dos encarregados)
-- ════════════════════════════════════════════════════════════

-- ── portal_usuarios ──────────────────────────────────────────
create table if not exists portal_usuarios (
  id          uuid primary key default uuid_generate_v4(),
  login       text not null unique,
  nome        text,
  senha_hash  text not null,
  obras_ids   uuid[] not null default '{}',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── portal_ponto_diario (ponto lançado pelo portal) ──────────
create table if not exists portal_ponto_diario (
  id                 uuid primary key default uuid_generate_v4(),
  obra_id            uuid not null references obras(id),
  colaborador_id     uuid references colaboradores(id),
  data               date not null,
  status             text not null,
                       -- 'presente' | 'falta' | 'falta_justificada' | 'meio_periodo' | 'producao'
  horas_extra        numeric(4,2) default 0,
  horas_falta        numeric(4,2) default 0,
  observacoes        text,
  portal_usuario_id  uuid references portal_usuarios(id),
  sincronizado_em    timestamptz,
  lancamento_id      uuid references ponto_lancamentos(id),
  created_at         timestamptz not null default now()
);

-- ── portal_ocorrencias ───────────────────────────────────────
create table if not exists portal_ocorrencias (
  id                  uuid primary key default uuid_generate_v4(),
  obra_id             uuid references obras(id),
  colaborador_id      uuid references colaboradores(id),
  data                date,
  tipo                text,
                        -- 'acidente' | 'quase_acidente' | 'atestado' | 'advertencia' | 'outro'
  descricao           text,
  tipo_atestado       text,    -- quando tipo='atestado'
  tipo_adv            text,    -- quando tipo='advertencia'
  tipo_acidente       text,    -- quando tipo='acidente'
  gravidade           text,
  local               text,
  hora_acidente       text,
  cat_emitida         boolean default false,
  com_afastamento     boolean default false,
  dias_afastamento    int,
  cid                 text,
  medico              text,
  motivo              text,
  assinada            boolean default false,
  dias_suspensao      int,
  arquivo_url         text,
  status              text not null default 'pendente',
  portal_usuario_id   uuid references portal_usuarios(id),
  sincronizado_em     timestamptz,
  destino_id          text,            -- id do registro gerado no RH após sincronização
  criado_em           timestamptz not null default now()
);

-- ── portal_solicitacoes ──────────────────────────────────────
create table if not exists portal_solicitacoes (
  id                  uuid primary key default uuid_generate_v4(),
  obra_id             uuid references obras(id),
  tipo                text not null,
                        -- 'novo_colaborador' | 'desligamento' | 'transferencia' | 'outro'
  dados               jsonb,
  status              text not null default 'pendente',
                        -- 'pendente' | 'aprovado' | 'recusado'
  motivo_recusa       text,
  portal_usuario_id   uuid references portal_usuarios(id),
  processado_por      uuid,            -- id do usuário do RH que processou
  processado_em       timestamptz,
  criado_em           timestamptz not null default now()
);

-- ── portal_epi_solicitacoes ───────────────────────────────────
create table if not exists portal_epi_solicitacoes (
  id                 uuid primary key default uuid_generate_v4(),
  obra_id            uuid references obras(id),
  colaborador_id     uuid references colaboradores(id),
  epi_id             uuid references epi_catalogo(id),
  quantidade         int default 1,
  tamanho            text,
  numero             text,
  motivo             text,
  status             text not null default 'pendente',
                       -- 'pendente' | 'aprovado' | 'recusado' | 'entregue'
  portal_usuario_id  uuid references portal_usuarios(id),
  sincronizado_em    timestamptz,
  criado_em          timestamptz not null default now()
);

-- ── portal_producao (produção lançada pelo portal) ────────────
create table if not exists portal_producao (
  id                  uuid primary key default uuid_generate_v4(),
  obra_id             uuid references obras(id),
  colaborador_id      uuid references colaboradores(id),
  playbook_item_id    uuid references playbook_itens(id),
  data                date,
  quantidade          numeric(10,3),
  obs                 text,
  status              text not null default 'pendente',
  portal_usuario_id   uuid references portal_usuarios(id),
  sincronizado_em     timestamptz,
  lancamento_prod_id  uuid references ponto_producao(id),
  lancamento_id       uuid references ponto_lancamentos(id),
  criado_em           timestamptz not null default now()
);

-- ── portal_documentos (documentos enviados pelo portal) ───────
create table if not exists portal_documentos (
  id                 uuid primary key default uuid_generate_v4(),
  obra_id            uuid references obras(id),
  colaborador_id     uuid references colaboradores(id),
  tipo               text,
  descricao          text,
  arquivo_url        text,
  status             text not null default 'pendente',
                       -- 'pendente' | 'aprovado' | 'recusado'
  portal_usuario_id  uuid references portal_usuarios(id),
  sincronizado_em    timestamptz,
  criado_em          timestamptz not null default now()
);


-- ════════════════════════════════════════════════════════════
-- 7. SISTEMA / AUTENTICAÇÃO
-- ════════════════════════════════════════════════════════════

-- ── profiles (usuários internos do RH, ligados ao auth.users) ──
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text,
  email       text,
  role        text not null default 'operador',
                -- 'admin' | 'rh' | 'operador' | 'visualizador'
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- trigger: criar profile automaticamente ao criar usuário Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', new.email));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ════════════════════════════════════════════════════════════
-- 8. JURÍDICO  ← NOVO
-- ════════════════════════════════════════════════════════════

-- ── lista_negra_juridico ─────────────────────────────────────
-- Profissionais que abriram processos trabalhistas contra a empresa.
-- Ao cadastrar um colaborador com CPF presente aqui, o sistema exibe alerta.
create table if not exists lista_negra_juridico (
  id               uuid primary key default uuid_generate_v4(),
  nome             text not null,
  cpf              text,                  -- apenas dígitos: '12345678901'
  motivo           text not null,         -- resumo do motivo / processo
  processo_numero  text,                  -- ex.: '0001234-56.2024.5.02.0001'
  data_registro    date not null default current_date,
  observacoes      text,
  created_at       timestamptz not null default now()
);

-- índice para busca rápida por CPF (usado no alerta do cadastro)
create index if not exists idx_lista_negra_cpf on lista_negra_juridico (cpf);


-- ════════════════════════════════════════════════════════════
-- 9. ÍNDICES ADICIONAIS (desempenho)
-- ════════════════════════════════════════════════════════════

create index if not exists idx_colaboradores_funcao   on colaboradores (funcao_id);
create index if not exists idx_colaboradores_obra     on colaboradores (obra_id);
create index if not exists idx_colaboradores_status   on colaboradores (status);
create index if not exists idx_colaboradores_cpf      on colaboradores (cpf);

create index if not exists idx_ponto_colabmes  on ponto_lancamentos (colaborador_id, mes_referencia);
create index if not exists idx_ponto_obra      on ponto_lancamentos (obra_id);

create index if not exists idx_registro_lanc   on registro_ponto (lancamento_id);
create index if not exists idx_registro_data   on registro_ponto (data);

create index if not exists idx_pponto_obra_data on portal_ponto_diario (obra_id, data);
create index if not exists idx_pponto_colab     on portal_ponto_diario (colaborador_id);

create index if not exists idx_pagamentos_colab on pagamentos (colaborador_id);
create index if not exists idx_pagamentos_comp  on pagamentos (competencia);

create index if not exists idx_adiant_colab  on adiantamentos (colaborador_id);
create index if not exists idx_adiant_comp   on adiantamentos (competencia);

create index if not exists idx_premios_colab  on premios (colaborador_id);

create index if not exists idx_vt_colab  on vale_transporte (colaborador_id);
create index if not exists idx_vt_comp   on vale_transporte (competencia);

create index if not exists idx_ocorr_colab  on ocorrencias (colaborador_id);
create index if not exists idx_atestados_colab on atestados (colaborador_id);
create index if not exists idx_acid_colab  on acidentes (colaborador_id);
create index if not exists idx_adv_colab   on advertencias (colaborador_id);
create index if not exists idx_docs_colab  on documentos (colaborador_id);


-- ════════════════════════════════════════════════════════════
-- 10. RLS — Row Level Security (recomendado para Supabase)
--     Habilite conforme necessidade; a configuração abaixo
--     permite acesso apenas a usuários autenticados.
-- ════════════════════════════════════════════════════════════

-- Exemplo para colaboradores (replique o padrão nas demais tabelas):
-- alter table colaboradores enable row level security;
-- create policy "Autenticados lêem colaboradores"
--   on colaboradores for select using (auth.role() = 'authenticated');
-- create policy "Autenticados escrevem colaboradores"
--   on colaboradores for all using (auth.role() = 'authenticated');


-- ════════════════════════════════════════════════════════════
-- FIM DO SCRIPT
-- ════════════════════════════════════════════════════════════
