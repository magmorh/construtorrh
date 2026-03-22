-- ═══════════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — SCHEMA DEFINITIVO COMPLETO
-- Versão: v6  |  Data: 2026-03-22
-- Autor:  ConstrutorRH Team
--
-- ▸ BANCO NOVO/VAZIO:       execute ESTE arquivo integralmente
-- ▸ BANCO JÁ EXISTENTE:     NÃO execute — pode causar conflitos
--                           (usuário já fez backup e vai recriar do zero)
--
-- MUDANÇAS v6 (vs v5):
--   • Revisão geral: comentários, ordem, clareza
--   • colaboradores: adicionado campo vale_transporte (boolean) explícito
--   • ponto_lancamentos: status inclui 'pago' diretamente (sem etapa fechamento obrigatória)
--   • ponto_fechamentos: mantido para agrupamento opcional, não obrigatório no fluxo
--   • funcoes: mantido campo contratos_valores JSONB (legado) + funcao_valores (novo)
--   • Índices revisados e otimizados
-- ═══════════════════════════════════════════════════════════════════════════════

-- Extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 1 — USUÁRIOS, PERFIS E CONFIGURAÇÕES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Perfis de usuário ───────────────────────────────────────────────────────
-- Criado automaticamente para cada usuário do Supabase Auth
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  nome       TEXT NOT NULL DEFAULT '',
  email      TEXT,
  role       TEXT NOT NULL DEFAULT 'visualizador'
             CHECK (role IN ('admin','rh','obra','visualizador')),
  ativo      BOOLEAN DEFAULT TRUE
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_auth" ON public.profiles;
CREATE POLICY "profiles_auth" ON public.profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Auto-criar perfil no cadastro de usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email,'@',1)),
    NEW.email,
    'visualizador'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Configurações da empresa ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.configuracoes (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  chave      TEXT UNIQUE NOT NULL,
  valor      TEXT,
  descricao  TEXT
);
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "config_auth" ON public.configuracoes;
CREATE POLICY "config_auth" ON public.configuracoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('empresa_nome',     'Minha Construtora', 'Nome da empresa'),
  ('empresa_cnpj',     '',                  'CNPJ da empresa'),
  ('empresa_endereco', '',                  'Endereço completo'),
  ('empresa_telefone', '',                  'Telefone de contato'),
  ('empresa_email',    '',                  'E-mail de contato'),
  ('horas_dia_normal', '8',                 'Horas de trabalho por dia normal'),
  ('horas_semana',     '44',                'Horas semanais (CLT padrão)')
ON CONFLICT (chave) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 2 — CADASTROS BASE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Funções / Cargos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.funcoes (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  nome              TEXT NOT NULL,
  sigla             TEXT,
  descricao         TEXT,
  cbo               TEXT,                    -- Classificação Brasileira de Ocupações
  contratos_valores JSONB DEFAULT '{}',      -- Legado: {clt:{ativo,valor_hora}, autonomo:{...}}
  ativo             BOOLEAN DEFAULT TRUE
);
ALTER TABLE public.funcoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funcoes_auth" ON public.funcoes;
CREATE POLICY "funcoes_auth" ON public.funcoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Valor/hora por função + tipo de contrato (tabela principal) ─────────────
-- Esta tabela substitui o JSONB contratos_valores para consultas mais eficientes
-- TRAVA: funcao_id e tipo_contrato de um colaborador NÃO podem ser alterados
--        se existirem lançamentos de ponto para ele (verificado na aplicação)
CREATE TABLE IF NOT EXISTS public.funcao_valores (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  funcao_id      UUID NOT NULL REFERENCES public.funcoes(id) ON DELETE CASCADE,
  tipo_contrato  TEXT NOT NULL
                 CHECK (tipo_contrato IN ('clt','autonomo','pj','estagiario','aprendiz','temporario')),
  valor_hora     NUMERIC(10,4) NOT NULL DEFAULT 0,
  UNIQUE (funcao_id, tipo_contrato)
);
ALTER TABLE public.funcao_valores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funcao_valores_auth" ON public.funcao_valores;
CREATE POLICY "funcao_valores_auth" ON public.funcao_valores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Obras ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obras (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  nome              TEXT NOT NULL,
  codigo            TEXT,
  endereco          TEXT,
  cidade            TEXT,
  estado            TEXT,
  cliente           TEXT,
  responsavel       TEXT,
  data_inicio       DATE,
  data_previsao_fim DATE,
  status            TEXT DEFAULT 'em_andamento'
                    CHECK (status IN ('em_andamento','concluida','pausada','cancelada')),
  observacoes       TEXT
);
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "obras_auth" ON public.obras;
CREATE POLICY "obras_auth" ON public.obras
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Horários por obra (modelo de jornada) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obra_horarios (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  obra_id         UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  dia_semana      TEXT NOT NULL
                  CHECK (dia_semana IN ('seg','ter','qua','qui','sex','sab','dom')),
  ativo           BOOLEAN DEFAULT TRUE,
  hora_entrada    TIME,
  saida_almoco    TIME,
  retorno_almoco  TIME,
  hora_saida      TIME,
  UNIQUE (obra_id, dia_semana)
);
ALTER TABLE public.obra_horarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "obra_horarios_auth" ON public.obra_horarios;
CREATE POLICY "obra_horarios_auth" ON public.obra_horarios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Playbooks de produção (tabela de preços por obra) ────────────────────────
-- Usados para lançar produção no ponto (ex: m² de reboco, m² de pintura)
CREATE TABLE IF NOT EXISTS public.playbook_itens (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  obra_id         UUID NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  descricao       TEXT NOT NULL,
  categoria       TEXT,
  unidade         TEXT NOT NULL DEFAULT 'm²',
  preco_unitario  NUMERIC(12,2) NOT NULL DEFAULT 0,
  ativo           BOOLEAN DEFAULT TRUE
);
ALTER TABLE public.playbook_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "playbook_itens_auth" ON public.playbook_itens;
CREATE POLICY "playbook_itens_auth" ON public.playbook_itens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 3 — COLABORADORES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.colaboradores (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  -- Dados pessoais
  nome             TEXT NOT NULL,
  chapa            TEXT UNIQUE,              -- Código imutável gerado automaticamente
  cpf              TEXT UNIQUE,
  rg               TEXT,
  pis_nit          TEXT,
  data_nascimento  DATE,
  genero           TEXT CHECK (genero IN ('masculino','feminino','outro','nao_informado')),
  estado_civil     TEXT,
  telefone         TEXT,
  email            TEXT,
  -- Endereço
  endereco         TEXT,
  cidade           TEXT,
  estado           TEXT,
  cep              TEXT,
  -- Vínculo
  funcao_id        UUID REFERENCES public.funcoes(id),
  obra_id          UUID REFERENCES public.obras(id),
  salario          NUMERIC(10,2),
  tipo_contrato    TEXT DEFAULT 'clt'
                   CHECK (tipo_contrato IN ('clt','pj','temporario','aprendiz','estagiario','autonomo')),
  data_admissao    DATE,
  data_demissao    DATE,
  -- CLT
  ctps_numero      TEXT,
  ctps_serie       TEXT,
  -- Banco
  banco            TEXT,
  agencia          TEXT,
  conta            TEXT,
  tipo_conta       TEXT,
  pix_chave        TEXT,
  pix_tipo         TEXT,
  -- Vale transporte
  vale_transporte  BOOLEAN DEFAULT FALSE,
  vt_dados         JSONB DEFAULT '{}',       -- {modalidade, gasolina_valor_dia, trechos_ida, trechos_volta}
  -- Status
  status           TEXT DEFAULT 'ativo'
                   CHECK (status IN ('ativo','inativo','afastado','ferias')),
  observacoes      TEXT
);
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "colaboradores_auth" ON public.colaboradores;
CREATE POLICY "colaboradores_auth" ON public.colaboradores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Histórico de mudança de função/chapa ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historico_chapa (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id  UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  chapa           TEXT,
  funcao_id       UUID REFERENCES public.funcoes(id),
  tipo_contrato   TEXT,
  data_inicio     DATE,
  data_fim        DATE,
  motivo_troca    TEXT
);
ALTER TABLE public.historico_chapa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historico_auth" ON public.historico_chapa;
CREATE POLICY "historico_auth" ON public.historico_chapa
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 4 — EPI (Equipamento de Proteção Individual)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.epi_catalogo (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  nome             TEXT NOT NULL,
  categoria        TEXT,
  numero_ca        TEXT,                     -- Certificado de Aprovação
  ca_validade      DATE,
  unidade          TEXT DEFAULT 'unidade',
  requer_tamanho   BOOLEAN DEFAULT FALSE,
  requer_numero    BOOLEAN DEFAULT FALSE,
  vida_util_meses  INTEGER,
  descricao        TEXT,
  ativo            BOOLEAN DEFAULT TRUE
);
ALTER TABLE public.epi_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "epi_catalogo_auth" ON public.epi_catalogo;
CREATE POLICY "epi_catalogo_auth" ON public.epi_catalogo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- EPIs obrigatórios por função
CREATE TABLE IF NOT EXISTS public.funcao_epi (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  funcao_id   UUID NOT NULL REFERENCES public.funcoes(id) ON DELETE CASCADE,
  epi_id      UUID NOT NULL REFERENCES public.epi_catalogo(id) ON DELETE CASCADE,
  obrigatorio BOOLEAN DEFAULT TRUE,
  quantidade  INTEGER DEFAULT 1,
  UNIQUE (funcao_id, epi_id)
);
ALTER TABLE public.funcao_epi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funcao_epi_auth" ON public.funcao_epi;
CREATE POLICY "funcao_epi_auth" ON public.funcao_epi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- EPIs entregues ao colaborador
CREATE TABLE IF NOT EXISTS public.colaborador_epi (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id      UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  epi_id              UUID NOT NULL REFERENCES public.epi_catalogo(id),
  funcao_id           UUID REFERENCES public.funcoes(id),
  tamanho             TEXT,
  numero              TEXT,
  data_entrega        DATE,
  quantidade_entregue INTEGER DEFAULT 0,
  status              TEXT DEFAULT 'pendente'
                      CHECK (status IN ('pendente','entregue','devolvido','substituido')),
  documento_url       TEXT,
  documento_nome      TEXT,
  observacoes         TEXT,
  UNIQUE (colaborador_id, epi_id)
);
ALTER TABLE public.colaborador_epi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "colaborador_epi_auth" ON public.colaborador_epi;
CREATE POLICY "colaborador_epi_auth" ON public.colaborador_epi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage para documentos de recibo de EPI
INSERT INTO storage.buckets (id, name, public)
VALUES ('epi-documentos', 'epi-documentos', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

DROP POLICY IF EXISTS "epi_docs_insert" ON storage.objects;
DROP POLICY IF EXISTS "epi_docs_select" ON storage.objects;
DROP POLICY IF EXISTS "epi_docs_delete" ON storage.objects;
CREATE POLICY "epi_docs_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'epi-documentos');
CREATE POLICY "epi_docs_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'epi-documentos');
CREATE POLICY "epi_docs_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'epi-documentos');

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 5 — SST (Saúde e Segurança do Trabalho)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Acidentes de trabalho ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acidentes (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id   UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id          UUID REFERENCES public.obras(id),
  data_ocorrencia  DATE,
  hora_ocorrencia  TIME,
  tipo_acidente    TEXT,
  descricao        TEXT,
  comunicado_cat   BOOLEAN DEFAULT FALSE,    -- Comunicação de Acidente de Trabalho
  afastamento      BOOLEAN DEFAULT FALSE,
  dias_afastamento INTEGER DEFAULT 0,
  gravidade        TEXT CHECK (gravidade IN ('leve','moderado','grave','fatal')),
  medidas_tomadas  TEXT,
  observacoes      TEXT
);
ALTER TABLE public.acidentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acidentes_auth" ON public.acidentes;
CREATE POLICY "acidentes_auth" ON public.acidentes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Atestados e afastamentos médicos ────────────────────────────────────────
-- Os atestados bloqueiam automaticamente os dias correspondentes no ponto
CREATE TABLE IF NOT EXISTS public.atestados (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id    UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  data              DATE,                    -- Data do atestado
  data_inicio       DATE,                    -- Início do afastamento
  data_fim          DATE,                    -- Fim do afastamento (calculado)
  dias_afastamento  INTEGER DEFAULT 0,
  tipo_afastamento  TEXT,
  cid               TEXT,                    -- Código Internacional de Doenças
  medico            TEXT,
  crm               TEXT,
  acidente_id       UUID REFERENCES public.acidentes(id),
  observacoes       TEXT
);
ALTER TABLE public.atestados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atestados_auth" ON public.atestados;
CREATE POLICY "atestados_auth" ON public.atestados
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Advertências e suspensões ───────────────────────────────────────────────
-- Suspensões bloqueiam automaticamente os dias correspondentes no ponto
CREATE TABLE IF NOT EXISTS public.advertencias (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id      UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo                TEXT DEFAULT 'verbal'
                      CHECK (tipo IN ('verbal','escrita','suspensao')),
  data_advertencia    DATE,
  dias_suspensao      INTEGER DEFAULT 0,
  motivo              TEXT,
  descricao           TEXT,
  testemunha          TEXT,
  observacoes         TEXT
);
ALTER TABLE public.advertencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advertencias_auth" ON public.advertencias;
CREATE POLICY "advertencias_auth" ON public.advertencias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Ocorrências gerais ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ocorrencias (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id  UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id         UUID REFERENCES public.obras(id),
  tipo            TEXT,
  data_ocorrencia DATE,
  descricao       TEXT,
  providencias    TEXT,
  status          TEXT DEFAULT 'aberta'
                  CHECK (status IN ('aberta','em_andamento','resolvida','arquivada')),
  observacoes     TEXT
);
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ocorrencias_auth" ON public.ocorrencias;
CREATE POLICY "ocorrencias_auth" ON public.ocorrencias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 6 — DOCUMENTOS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.documentos (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id  UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id         UUID REFERENCES public.obras(id),
  tipo            TEXT,
  nome            TEXT NOT NULL,
  descricao       TEXT,
  arquivo_url     TEXT,
  arquivo_nome    TEXT,
  data_emissao    DATE,
  data_validade   DATE,
  status          TEXT DEFAULT 'ativo'
                  CHECK (status IN ('ativo','vencido','arquivado')),
  observacoes     TEXT
);
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "documentos_auth" ON public.documentos;
CREATE POLICY "documentos_auth" ON public.documentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 7 — FINANCEIRO
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Pagamentos avulsos ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id  UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  competencia     TEXT,                      -- YYYY-MM
  tipo            TEXT,
  descricao       TEXT,
  valor           NUMERIC(12,2) DEFAULT 0,
  data_pagamento  DATE,
  status          TEXT DEFAULT 'pendente'
                  CHECK (status IN ('pendente','pago','cancelado')),
  observacoes     TEXT
);
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pagamentos_auth" ON public.pagamentos;
CREATE POLICY "pagamentos_auth" ON public.pagamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Prêmios ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.premios (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id  UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  competencia     TEXT,
  descricao       TEXT,
  valor           NUMERIC(12,2) DEFAULT 0,
  data_pagamento  DATE,
  status          TEXT DEFAULT 'pendente'
                  CHECK (status IN ('pendente','pago','cancelado')),
  observacoes     TEXT
);
ALTER TABLE public.premios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "premios_auth" ON public.premios;
CREATE POLICY "premios_auth" ON public.premios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Vale Transporte ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vale_transporte (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id  UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  competencia     TEXT,
  valor_diario    NUMERIC(8,2) DEFAULT 0,
  dias_uteis      INTEGER DEFAULT 0,
  valor_total     NUMERIC(10,2) DEFAULT 0,
  desconto_folha  NUMERIC(10,2) DEFAULT 0,
  status          TEXT DEFAULT 'pendente'
                  CHECK (status IN ('pendente','pago','cancelado')),
  observacoes     TEXT
);
ALTER TABLE public.vale_transporte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vt_auth" ON public.vale_transporte;
CREATE POLICY "vt_auth" ON public.vale_transporte
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Provisões (Férias / 13º / FGTS / INSS) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provisoes (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id     UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  competencia        TEXT,
  tipo               TEXT CHECK (tipo IN ('ferias','decimo_terceiro','fgts','inss')),
  valor_provisionado NUMERIC(12,2) DEFAULT 0,
  observacoes        TEXT
);
ALTER TABLE public.provisoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provisoes_auth" ON public.provisoes;
CREATE POLICY "provisoes_auth" ON public.provisoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 8 — CONTROLE DE PONTO
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- MODELO MULTI-OBRA:
--   Um colaborador pode ter múltiplos lançamentos no mesmo mês,
--   em obras diferentes, com períodos potencialmente sobrepostos.
--   A mesma obra pode ter até 2 lançamentos por mês.
--   Um dia só pode pertencer a 1 lançamento da mesma obra.
--
-- FLUXO DE APROVAÇÃO:
--   rascunho → aguardando_aprovacao → aprovado → pago
--                                  ↘ recusado → (editar → aguardando_aprovacao)
--
-- VALOR/HORA:
--   Buscado da tabela funcao_valores com base em (funcao_id, tipo_contrato)
--   do colaborador no momento do lançamento.
--   TRAVA: funcao_id e tipo_contrato NÃO podem mudar se houver lançamentos.
--
-- PRODUÇÃO:
--   Lançada separadamente via ponto_producao, referenciando playbook_itens.
--   Cálculo do valor a receber:
--     - Autônomo: (horas_sem_prod × valor_hora) + valor_producao
--     - CLT: max(horas_trabalhadas × valor_hora, valor_producao)
--            com excedente da produção como prêmio
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 8.1 FECHAMENTOS (agrupamento opcional para pagamento em lote) ────────────
CREATE TABLE IF NOT EXISTS public.ponto_fechamentos (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  criado_em            TIMESTAMPTZ DEFAULT NOW(),
  mes_referencia       TEXT,                 -- YYYY-MM
  periodo_inicio       DATE,
  periodo_fim          DATE,
  status               TEXT NOT NULL DEFAULT 'aberto'
                       CHECK (status IN ('aberto','fechado','pago')),
  total_colaboradores  INTEGER DEFAULT 0,
  total_lancamentos    INTEGER DEFAULT 0,
  valor_total          NUMERIC(14,2) DEFAULT 0,
  observacoes          TEXT
);
ALTER TABLE public.ponto_fechamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ponto_fechamentos_auth" ON public.ponto_fechamentos;
CREATE POLICY "ponto_fechamentos_auth" ON public.ponto_fechamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 8.2 LANÇAMENTOS DE PONTO ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ponto_lancamentos (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id   UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id          UUID NOT NULL REFERENCES public.obras(id) ON DELETE RESTRICT,
  mes_referencia   TEXT NOT NULL,            -- YYYY-MM
  data_inicio      DATE NOT NULL,
  data_fim         DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'rascunho'
                   CHECK (status IN (
                     'rascunho',             -- editável
                     'aguardando_aprovacao', -- aguardando gestor aprovar
                     'aprovado',             -- aprovado, pronto para pagamento
                     'recusado',             -- devolvido para correção
                     'em_fechamento',        -- incluído em fechamento em lote
                     'pago'                  -- pago (status final)
                   )),
  motivo_recusa    TEXT,
  fechamento_id    UUID REFERENCES public.ponto_fechamentos(id) ON DELETE SET NULL
  -- Regras aplicadas na aplicação:
  -- • Máximo 2 lançamentos por obra por mês (verificado em criarLancamento)
  -- • Dias da mesma obra não podem se sobrepor (verificado em criarLancamento)
  -- • Obras diferentes podem ter datas sobrepostas (visual 🔒 no dia)
);
ALTER TABLE public.ponto_lancamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ponto_lancamentos_auth" ON public.ponto_lancamentos;
CREATE POLICY "ponto_lancamentos_auth" ON public.ponto_lancamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 8.3 REGISTRO DIÁRIO DE PONTO ────────────────────────────────────────────
-- ATENÇÃO: constraint UNIQUE é (lancamento_id, data)
--          NÃO usar (colaborador_id, data) — causaria erro no modelo multi-obra
CREATE TABLE IF NOT EXISTS public.registro_ponto (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  lancamento_id     UUID NOT NULL REFERENCES public.ponto_lancamentos(id) ON DELETE CASCADE,
  colaborador_id    UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id           UUID REFERENCES public.obras(id),
  data              DATE NOT NULL,
  hora_entrada      TIME,
  saida_almoco      TIME,
  retorno_almoco    TIME,
  hora_saida        TIME,
  he_entrada        TIME,                    -- Início da hora extra
  he_saida          TIME,                    -- Fim da hora extra
  horas_trabalhadas NUMERIC(5,2) DEFAULT 0,  -- Horas normais calculadas
  horas_extras      NUMERIC(5,2) DEFAULT 0,  -- Horas extras calculadas
  falta             BOOLEAN DEFAULT FALSE,
  justificativa     TEXT,
  UNIQUE (lancamento_id, data)               -- ← correto para multi-obra
);
ALTER TABLE public.registro_ponto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "registro_ponto_auth" ON public.registro_ponto;
CREATE POLICY "registro_ponto_auth" ON public.registro_ponto
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── 8.4 PRODUÇÃO ────────────────────────────────────────────────────────────
-- Lançamentos de produção referenciando itens do playbook
CREATE TABLE IF NOT EXISTS public.ponto_producao (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id    UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  lancamento_id     UUID REFERENCES public.ponto_lancamentos(id) ON DELETE CASCADE,
  obra_id           UUID REFERENCES public.obras(id),
  mes_referencia    TEXT NOT NULL,           -- YYYY-MM
  playbook_item_id  UUID NOT NULL REFERENCES public.playbook_itens(id) ON DELETE RESTRICT,
  dias              TEXT[] NOT NULL,         -- Array de datas YYYY-MM-DD relacionadas
  quantidade        NUMERIC(12,4) NOT NULL DEFAULT 0,
  valor_total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacoes       TEXT
);
ALTER TABLE public.ponto_producao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ponto_producao_auth" ON public.ponto_producao;
CREATE POLICY "ponto_producao_auth" ON public.ponto_producao
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 9 — ÍNDICES DE PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════════

-- Colaboradores
CREATE INDEX IF NOT EXISTS idx_colaboradores_obra      ON public.colaboradores(obra_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_funcao    ON public.colaboradores(funcao_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_status    ON public.colaboradores(status);
CREATE INDEX IF NOT EXISTS idx_colaboradores_chapa     ON public.colaboradores(chapa);
-- Histórico
CREATE INDEX IF NOT EXISTS idx_historico_colab         ON public.historico_chapa(colaborador_id);
-- Funções
CREATE INDEX IF NOT EXISTS idx_funcao_valores_func     ON public.funcao_valores(funcao_id);
CREATE INDEX IF NOT EXISTS idx_funcao_epi_funcao       ON public.funcao_epi(funcao_id);
-- EPIs
CREATE INDEX IF NOT EXISTS idx_colab_epi_colab         ON public.colaborador_epi(colaborador_id);
-- SST
CREATE INDEX IF NOT EXISTS idx_atestados_colab         ON public.atestados(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_atestados_data          ON public.atestados(data_inicio);
CREATE INDEX IF NOT EXISTS idx_advertencias_colab      ON public.advertencias(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_acidentes_colab         ON public.acidentes(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_colab       ON public.ocorrencias(colaborador_id);
-- Documentos
CREATE INDEX IF NOT EXISTS idx_documentos_colab        ON public.documentos(colaborador_id);
-- Obras
CREATE INDEX IF NOT EXISTS idx_obra_horarios_obra      ON public.obra_horarios(obra_id);
CREATE INDEX IF NOT EXISTS idx_playbook_itens_obra     ON public.playbook_itens(obra_id);
-- Ponto
CREATE INDEX IF NOT EXISTS idx_lancamentos_colab_mes   ON public.ponto_lancamentos(colaborador_id, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_lancamentos_obra_mes    ON public.ponto_lancamentos(obra_id, mes_referencia);
CREATE INDEX IF NOT EXISTS idx_lancamentos_status      ON public.ponto_lancamentos(status);
CREATE INDEX IF NOT EXISTS idx_lancamentos_fechamento  ON public.ponto_lancamentos(fechamento_id);
CREATE INDEX IF NOT EXISTS idx_reg_ponto_lancamento    ON public.registro_ponto(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_reg_ponto_data          ON public.registro_ponto(data);
CREATE INDEX IF NOT EXISTS idx_reg_ponto_colab_data    ON public.registro_ponto(colaborador_id, data);
-- Produção
CREATE INDEX IF NOT EXISTS idx_producao_lancamento     ON public.ponto_producao(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_producao_colab_mes      ON public.ponto_producao(colaborador_id, mes_referencia);
-- Financeiro
CREATE INDEX IF NOT EXISTS idx_pagamentos_colab        ON public.pagamentos(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_premios_colab           ON public.premios(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_vt_colab                ON public.vale_transporte(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_provisoes_colab         ON public.provisoes(colaborador_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOCO 10 — VERIFICAÇÃO FINAL
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT
  '✅ ConstrutorRH Schema v6 aplicado com sucesso!' AS resultado,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') AS total_tabelas;
