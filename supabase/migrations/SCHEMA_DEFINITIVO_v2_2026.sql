-- ═══════════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — SQL DEFINITIVO E COMPLETO  (v2 — 2026-03-21)
-- 
-- ✅ Alinhado 100% com o frontend (src/pages/*.tsx + src/lib/supabase.ts)
-- ⚠️  Execute TODO este script no SQL Editor do Supabase (pode rodar em banco
--     existente — usa IF NOT EXISTS / ALTER ... ADD COLUMN IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROFILES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  nome       TEXT NOT NULL DEFAULT '',
  email      TEXT,
  role       TEXT NOT NULL DEFAULT 'visualizador'
             CHECK (role IN ('admin','rh','obra','visualizador')),
  ativo      BOOLEAN DEFAULT TRUE
);
-- Migração segura: adiciona colunas novas sem quebrar o existente
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome  TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role  TEXT NOT NULL DEFAULT 'visualizador';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_auth" ON public.profiles;
CREATE POLICY "profiles_auth" ON public.profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger: cria profile quando novo usuário é criado no Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
    new.email,
    'visualizador'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CONFIGURAÇÕES
-- ─────────────────────────────────────────────────────────────────────────────
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
  ('empresa_nome',    'Minha Construtora', 'Nome da empresa'),
  ('empresa_cnpj',    '',                  'CNPJ'),
  ('empresa_endereco','',                  'Endereço'),
  ('empresa_telefone','',                  'Telefone'),
  ('empresa_email',   '',                  'E-mail')
ON CONFLICT (chave) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FUNÇÕES / CARGOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.funcoes (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  nome                TEXT NOT NULL,
  sigla               TEXT,
  descricao           TEXT,
  cbo                 TEXT,
  valor_hora_clt      NUMERIC(10,2),
  valor_hora_autonomo NUMERIC(10,2),
  contratos_valores   JSONB,
  ativo               BOOLEAN DEFAULT TRUE
);
ALTER TABLE public.funcoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funcoes_auth" ON public.funcoes;
CREATE POLICY "funcoes_auth" ON public.funcoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. OBRAS
-- ─────────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. COLABORADORES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  nome            TEXT NOT NULL,
  chapa           TEXT UNIQUE,
  cpf             TEXT UNIQUE,
  rg              TEXT,
  pis_nit         TEXT,
  data_nascimento DATE,
  genero          TEXT,
  estado_civil    TEXT,
  telefone        TEXT,
  email           TEXT,
  endereco        TEXT,
  cidade          TEXT,
  estado          TEXT,
  cep             TEXT,
  funcao_id       UUID REFERENCES public.funcoes(id),
  obra_id         UUID REFERENCES public.obras(id),
  salario         NUMERIC(10,2),
  tipo_contrato   TEXT DEFAULT 'clt'
                  CHECK (tipo_contrato IN ('clt','autonomo','pj','temporario','aprendiz','estagiario')),
  data_admissao   DATE,
  data_demissao   DATE,
  ctps_numero     TEXT,
  ctps_serie      TEXT,
  banco           TEXT,
  agencia         TEXT,
  conta           TEXT,
  tipo_conta      TEXT,
  pix_chave       TEXT,
  pix_tipo        TEXT,
  vale_transporte BOOLEAN DEFAULT FALSE,
  vt_dados        JSONB,
  status          TEXT DEFAULT 'ativo'
                  CHECK (status IN ('ativo','inativo','afastado','ferias')),
  observacoes     TEXT
);
-- Colunas adicionadas em versões anteriores (seguro rodar novamente)
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS data_demissao DATE;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS pix_tipo      TEXT;
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS vt_dados      JSONB;
-- Remove colunas legadas (se existirem) que foram substituídas por vt_dados
ALTER TABLE public.colaboradores DROP COLUMN IF EXISTS vt_tipo;
ALTER TABLE public.colaboradores DROP COLUMN IF EXISTS vt_trechos_ida;
ALTER TABLE public.colaboradores DROP COLUMN IF EXISTS vt_trechos_volta;

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "colaboradores_auth" ON public.colaboradores;
CREATE POLICY "colaboradores_auth" ON public.colaboradores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. HISTÓRICO DE CHAPA / FUNÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historico_chapa (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  chapa          TEXT,
  funcao_id      UUID REFERENCES public.funcoes(id),
  tipo_contrato  TEXT,
  data_inicio    DATE,
  data_fim       DATE,
  motivo_troca   TEXT
);
ALTER TABLE public.historico_chapa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historico_auth" ON public.historico_chapa;
CREATE POLICY "historico_auth" ON public.historico_chapa
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. EPI — CATÁLOGO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.epi_catalogo (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  nome           TEXT NOT NULL,
  categoria      TEXT,
  numero_ca      TEXT,          -- ← nome exato usado pelo frontend
  ca_validade    DATE,
  requer_tamanho BOOLEAN DEFAULT FALSE,
  requer_numero  BOOLEAN DEFAULT FALSE,
  descricao      TEXT,
  ativo          BOOLEAN DEFAULT TRUE
);
-- Migração: se existir coluna com nome antigo, renomeia
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='epi_catalogo' AND column_name='ca_numero'
  ) THEN
    ALTER TABLE public.epi_catalogo RENAME COLUMN ca_numero TO numero_ca;
  END IF;
END $$;
ALTER TABLE public.epi_catalogo ADD COLUMN IF NOT EXISTS numero_ca       TEXT;
ALTER TABLE public.epi_catalogo ADD COLUMN IF NOT EXISTS ca_validade     DATE;
ALTER TABLE public.epi_catalogo ADD COLUMN IF NOT EXISTS categoria        TEXT;
ALTER TABLE public.epi_catalogo ADD COLUMN IF NOT EXISTS requer_numero    BOOLEAN DEFAULT FALSE;
ALTER TABLE public.epi_catalogo ADD COLUMN IF NOT EXISTS unidade          TEXT DEFAULT 'unidade';
ALTER TABLE public.epi_catalogo ADD COLUMN IF NOT EXISTS vida_util_meses  INTEGER;

ALTER TABLE public.epi_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "epi_cat_auth" ON public.epi_catalogo;
CREATE POLICY "epi_cat_auth" ON public.epi_catalogo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. EPI — FUNÇÃO × EPI
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.funcao_epi (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  funcao_id   UUID REFERENCES public.funcoes(id) ON DELETE CASCADE,
  epi_id      UUID REFERENCES public.epi_catalogo(id) ON DELETE CASCADE,
  obrigatorio BOOLEAN DEFAULT TRUE,
  quantidade  INTEGER DEFAULT 1,
  UNIQUE(funcao_id, epi_id)
);
ALTER TABLE public.funcao_epi ADD COLUMN IF NOT EXISTS obrigatorio BOOLEAN DEFAULT TRUE;
ALTER TABLE public.funcao_epi ADD COLUMN IF NOT EXISTS quantidade  INTEGER DEFAULT 1;
ALTER TABLE public.funcao_epi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funcao_epi_auth" ON public.funcao_epi;
CREATE POLICY "funcao_epi_auth" ON public.funcao_epi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. EPI — COLABORADOR × EPI
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.colaborador_epi (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id     UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  epi_id             UUID REFERENCES public.epi_catalogo(id) ON DELETE CASCADE,
  funcao_id          UUID REFERENCES public.funcoes(id),
  tamanho            TEXT,
  numero             TEXT,
  data_entrega       DATE,
  data_validade      DATE,
  status             TEXT DEFAULT 'ativo'
                     CHECK (status IN ('ativo','devolvido','vencido','pendente','entregue','substituido')),
  obrigatorio        BOOLEAN DEFAULT TRUE,
  quantidade         INTEGER DEFAULT 1,
  quantidade_entregue INTEGER DEFAULT 0,
  documento_url      TEXT,
  documento_nome     TEXT,
  observacoes        TEXT
);
ALTER TABLE public.colaborador_epi ADD COLUMN IF NOT EXISTS data_validade       DATE;
ALTER TABLE public.colaborador_epi ADD COLUMN IF NOT EXISTS documento_url       TEXT;
ALTER TABLE public.colaborador_epi ADD COLUMN IF NOT EXISTS documento_nome      TEXT;
ALTER TABLE public.colaborador_epi ADD COLUMN IF NOT EXISTS obrigatorio         BOOLEAN DEFAULT TRUE;
ALTER TABLE public.colaborador_epi ADD COLUMN IF NOT EXISTS quantidade          INTEGER DEFAULT 1;
ALTER TABLE public.colaborador_epi ADD COLUMN IF NOT EXISTS quantidade_entregue INTEGER DEFAULT 0;
ALTER TABLE public.colaborador_epi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "colab_epi_auth" ON public.colaborador_epi;
CREATE POLICY "colab_epi_auth" ON public.colaborador_epi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ACIDENTES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acidentes (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id        UUID REFERENCES public.obras(id),
  data_acidente  DATE NOT NULL,
  hora_acidente  TIME,
  tipo           TEXT CHECK (tipo IN ('tipico','trajeto','doenca_ocupacional')),
  gravidade      TEXT CHECK (gravidade IN ('leve','moderado','grave','fatal')),
  descricao      TEXT NOT NULL DEFAULT '',
  local_acidente TEXT,
  cat_emitida    BOOLEAN DEFAULT FALSE,
  status         TEXT DEFAULT 'em_investigacao'
                 CHECK (status IN ('em_investigacao','concluido','arquivado')),
  observacoes    TEXT,
  documento_url  TEXT,
  documento_nome TEXT
);
ALTER TABLE public.acidentes ADD COLUMN IF NOT EXISTS documento_url  TEXT;
ALTER TABLE public.acidentes ADD COLUMN IF NOT EXISTS documento_nome TEXT;
-- Remove colunas legadas (se existirem) que não existem mais no frontend
ALTER TABLE public.acidentes DROP COLUMN IF EXISTS com_afastamento;
ALTER TABLE public.acidentes DROP COLUMN IF EXISTS dias_afastamento;

ALTER TABLE public.acidentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acidentes_auth" ON public.acidentes;
CREATE POLICY "acidentes_auth" ON public.acidentes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. ATESTADOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.atestados (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id   UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  acidente_id      UUID REFERENCES public.acidentes(id),
  data             DATE NOT NULL,
  tipo             TEXT CHECK (tipo IN ('medico','comparecimento','declaracao')),
  dias_afastamento INTEGER,
  com_afastamento  BOOLEAN DEFAULT FALSE,
  cid              TEXT,
  medico           TEXT,
  descricao        TEXT,
  observacoes      TEXT,
  documento_url    TEXT NOT NULL DEFAULT '',
  documento_nome   TEXT
);
ALTER TABLE public.atestados ADD COLUMN IF NOT EXISTS acidente_id    UUID REFERENCES public.acidentes(id);
ALTER TABLE public.atestados ADD COLUMN IF NOT EXISTS documento_url  TEXT NOT NULL DEFAULT '';
ALTER TABLE public.atestados ADD COLUMN IF NOT EXISTS documento_nome TEXT;
-- Remove colunas com nome antigo (se existirem)
ALTER TABLE public.atestados DROP COLUMN IF EXISTS data_inicio;
ALTER TABLE public.atestados DROP COLUMN IF EXISTS data_fim;
ALTER TABLE public.atestados DROP COLUMN IF EXISTS data_retorno;
ALTER TABLE public.atestados DROP COLUMN IF EXISTS tipo_afastamento;

ALTER TABLE public.atestados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atestados_auth" ON public.atestados;
CREATE POLICY "atestados_auth" ON public.atestados
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. ADVERTÊNCIAS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.advertencias (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id   UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  data_advertencia DATE NOT NULL,
  tipo             TEXT NOT NULL
                   CHECK (tipo IN ('verbal','escrita','suspensao','demissional')),
  motivo           TEXT NOT NULL DEFAULT '',
  descricao        TEXT,
  assinada         BOOLEAN DEFAULT FALSE,
  dias_suspensao   INTEGER,
  observacoes      TEXT,
  documento_url    TEXT NOT NULL DEFAULT '',
  documento_nome   TEXT
);
ALTER TABLE public.advertencias ADD COLUMN IF NOT EXISTS dias_suspensao INTEGER;
ALTER TABLE public.advertencias ADD COLUMN IF NOT EXISTS documento_url  TEXT NOT NULL DEFAULT '';
ALTER TABLE public.advertencias ADD COLUMN IF NOT EXISTS documento_nome TEXT;

ALTER TABLE public.advertencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advertencias_auth" ON public.advertencias;
CREATE POLICY "advertencias_auth" ON public.advertencias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. DOCUMENTOS AVULSOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documentos_avulsos (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  tipo           TEXT NOT NULL DEFAULT 'outros'
                 CHECK (tipo IN ('contrato','exame','treinamento','declaracao','outros')),
  descricao      TEXT,
  data           DATE NOT NULL,
  documento_url  TEXT NOT NULL,
  documento_nome TEXT NOT NULL
);
ALTER TABLE public.documentos_avulsos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "docs_avulsos_auth" ON public.documentos_avulsos;
CREATE POLICY "docs_avulsos_auth" ON public.documentos_avulsos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. REGISTRO DE PONTO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.registro_ponto (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id    UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id           UUID REFERENCES public.obras(id),
  data              DATE NOT NULL,
  hora_entrada      TIME,
  saida_almoco      TIME,
  retorno_almoco    TIME,
  hora_saida        TIME,
  horas_trabalhadas NUMERIC(5,2),
  horas_extras      NUMERIC(5,2) DEFAULT 0,
  falta             BOOLEAN DEFAULT FALSE,
  justificativa     TEXT,
  UNIQUE(colaborador_id, data)
);
ALTER TABLE public.registro_ponto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ponto_auth" ON public.registro_ponto;
CREATE POLICY "ponto_auth" ON public.registro_ponto
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. PAGAMENTOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id  UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id         UUID REFERENCES public.obras(id),
  competencia     TEXT NOT NULL,
  data_pagamento  DATE,
  tipo            TEXT CHECK (tipo IN ('mensal','quinzenal','semanal','adiantamento','rescisao','ferias','decimo_terceiro','bonus','outro')),
  valor_bruto     NUMERIC(10,2),
  inss            NUMERIC(10,2) DEFAULT 0,
  fgts            NUMERIC(10,2) DEFAULT 0,
  ir              NUMERIC(10,2) DEFAULT 0,
  vale_transporte NUMERIC(10,2) DEFAULT 0,
  adiantamento    NUMERIC(10,2) DEFAULT 0,
  valor_liquido   NUMERIC(10,2),
  status          TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  observacoes     TEXT
);
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pagamentos_auth" ON public.pagamentos;
CREATE POLICY "pagamentos_auth" ON public.pagamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. PRÊMIOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.premios (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id        UUID REFERENCES public.obras(id),
  tipo           TEXT,
  descricao      TEXT,
  valor          NUMERIC(10,2) NOT NULL,
  data           DATE NOT NULL,
  competencia    TEXT,
  observacoes    TEXT
);
ALTER TABLE public.premios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "premios_auth" ON public.premios;
CREATE POLICY "premios_auth" ON public.premios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. VALE TRANSPORTE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vale_transporte (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id       UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  competencia          TEXT NOT NULL,
  tipo                 TEXT CHECK (tipo IN ('cartao','dinheiro','combustivel','outro')),
  valor                NUMERIC(10,2),
  dias_trabalhados     INTEGER DEFAULT 0,
  desconto_colaborador NUMERIC(10,2),
  valor_empresa        NUMERIC(10,2),
  observacoes          TEXT
);
ALTER TABLE public.vale_transporte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vt_auth" ON public.vale_transporte;
CREATE POLICY "vt_auth" ON public.vale_transporte
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. PROVISÕES FGTS / FÉRIAS / 13º
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provisoes_fgts (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id       UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id              UUID REFERENCES public.obras(id),
  competencia          TEXT NOT NULL,
  salario_base         NUMERIC(10,2),
  fgts_mensal          NUMERIC(10,2),
  ferias_provisionadas NUMERIC(10,2),
  decimo_terceiro      NUMERIC(10,2),
  total_provisao       NUMERIC(10,2),
  observacoes          TEXT
);
ALTER TABLE public.provisoes_fgts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provisoes_auth" ON public.provisoes_fgts;
CREATE POLICY "provisoes_auth" ON public.provisoes_fgts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. STORAGE BUCKET — ocorrencias-documentos
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('ocorrencias-documentos', 'ocorrencias-documentos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ocorr_upload"    ON storage.objects;
DROP POLICY IF EXISTS "ocorr_read_auth" ON storage.objects;
DROP POLICY IF EXISTS "ocorr_read_pub"  ON storage.objects;
DROP POLICY IF EXISTS "ocorr_delete"    ON storage.objects;

CREATE POLICY "ocorr_upload"    ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ocorrencias-documentos');
CREATE POLICY "ocorr_read_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ocorrencias-documentos');
CREATE POLICY "ocorr_read_pub"  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'ocorrencias-documentos');
CREATE POLICY "ocorr_delete"    ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ocorrencias-documentos');

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. TORNAR O USUÁRIO ATUAL ADMIN
-- ─────────────────────────────────────────────────────────────────────────────
-- Substitua pelo seu e-mail e execute manualmente:
--
-- UPDATE public.profiles SET role = 'admin', nome = 'Administrador'
-- WHERE email = 'SEU_EMAIL@AQUI.COM';
--
-- Se a tabela profiles ainda estiver vazia (primeiro acesso), 
-- faça login uma vez e depois execute o UPDATE acima.

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIM DO SCRIPT — todas as 18 tabelas criadas/atualizadas com segurança
-- ═══════════════════════════════════════════════════════════════════════════════
