-- ═══════════════════════════════════════════════════════════════════════════════
-- CONSTRUTOR RH — SQL DEFINITIVO E COMPLETO
-- Versão: 2026-03-21
-- ⚠️  Execute TODO este script no SQL Editor do Supabase
-- ⚠️  Pode ser rodado em banco vazio (DROP ... IF EXISTS) ou existente (IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROFILES (usuários e roles)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  nome       TEXT NOT NULL,
  email      TEXT,
  role       TEXT NOT NULL DEFAULT 'visualizador'
             CHECK (role IN ('admin','rh','obra','visualizador')),
  ativo      BOOLEAN DEFAULT TRUE
);

-- Adicionar coluna 'nome' se schema antigo tinha 'full_name'
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome TEXT;
UPDATE public.profiles SET nome = COALESCE(nome, email, 'Usuário') WHERE nome IS NULL OR nome = '';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_auth" ON public.profiles;
CREATE POLICY "profiles_auth" ON public.profiles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger: ao criar user no Auth → cria profile automático
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
-- 2. CONFIGURAÇÕES DO SISTEMA
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

-- Configurações padrão
INSERT INTO public.configuracoes (chave, valor, descricao) VALUES
  ('empresa_nome',    'Minha Construtora',   'Nome da empresa'),
  ('empresa_cnpj',    '',                    'CNPJ da empresa'),
  ('empresa_endereco','',                    'Endereço da empresa'),
  ('empresa_telefone','',                    'Telefone da empresa'),
  ('empresa_email',   '',                    'E-mail da empresa')
ON CONFLICT (chave) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FUNÇÕES / CARGOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.funcoes (
  id                   UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  nome                 TEXT NOT NULL,
  sigla                TEXT,
  descricao            TEXT,
  cbo                  TEXT,
  valor_hora_clt       NUMERIC(10,2),
  valor_hora_autonomo  NUMERIC(10,2),
  contratos_valores    JSONB,          -- {clt:{valor_hora}, autonomo:{valor_hora}, ...}
  ativo                BOOLEAN DEFAULT TRUE
);
ALTER TABLE public.funcoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funcoes_auth" ON public.funcoes;
CREATE POLICY "funcoes_auth" ON public.funcoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. OBRAS / PROJETOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.obras (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  nome                TEXT NOT NULL,
  codigo              TEXT,
  endereco            TEXT,
  cidade              TEXT,
  estado              TEXT,
  cliente             TEXT,
  responsavel         TEXT,
  data_inicio         DATE,
  data_previsao_fim   DATE,
  status              TEXT DEFAULT 'em_andamento'
                      CHECK (status IN ('em_andamento','concluida','pausada','cancelada')),
  observacoes         TEXT
);
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "obras_auth" ON public.obras;
CREATE POLICY "obras_auth" ON public.obras
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. COLABORADORES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  -- Identificação
  nome             TEXT NOT NULL,
  chapa            TEXT UNIQUE,
  cpf              TEXT UNIQUE,
  rg               TEXT,
  pis_nit          TEXT,
  data_nascimento  DATE,
  genero           TEXT,
  estado_civil     TEXT,
  -- Contato
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
  -- CTPS
  ctps_numero      TEXT,
  ctps_serie       TEXT,
  -- Bancário
  banco            TEXT,
  agencia          TEXT,
  conta            TEXT,
  tipo_conta       TEXT,
  pix_chave        TEXT,
  pix_tipo         TEXT,
  -- Vale Transporte (dados estruturados)
  vt_dados         JSONB,
  -- Status
  status           TEXT DEFAULT 'ativo'
                   CHECK (status IN ('ativo','inativo','afastado','ferias')),
  observacoes      TEXT
);
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "colaboradores_auth" ON public.colaboradores;
CREATE POLICY "colaboradores_auth" ON public.colaboradores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. HISTÓRICO DE CHAPA / FUNÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.historico_chapa (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id   UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  chapa            TEXT,
  funcao_id        UUID REFERENCES public.funcoes(id),
  tipo_contrato    TEXT,
  data_inicio      DATE,
  data_fim         DATE,
  motivo_troca     TEXT
);
ALTER TABLE public.historico_chapa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historico_auth" ON public.historico_chapa;
CREATE POLICY "historico_auth" ON public.historico_chapa
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. EPI — CATÁLOGO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.epi_catalogo (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  nome             TEXT NOT NULL,
  categoria        TEXT,
  ca_numero        TEXT,            -- Certificado de Aprovação
  ca_validade      DATE,
  requer_tamanho   BOOLEAN DEFAULT FALSE,
  requer_numero    BOOLEAN DEFAULT FALSE,  -- número de calçado
  descricao        TEXT,
  ativo            BOOLEAN DEFAULT TRUE
);
ALTER TABLE public.epi_catalogo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "epi_cat_auth" ON public.epi_catalogo;
CREATE POLICY "epi_cat_auth" ON public.epi_catalogo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. EPI — VÍNCULO FUNÇÃO × EPI
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.funcao_epi (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  funcao_id  UUID REFERENCES public.funcoes(id) ON DELETE CASCADE,
  epi_id     UUID REFERENCES public.epi_catalogo(id) ON DELETE CASCADE,
  UNIQUE(funcao_id, epi_id)
);
ALTER TABLE public.funcao_epi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funcao_epi_auth" ON public.funcao_epi;
CREATE POLICY "funcao_epi_auth" ON public.funcao_epi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. EPI — VÍNCULO COLABORADOR × EPI
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.colaborador_epi (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id   UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  epi_id           UUID REFERENCES public.epi_catalogo(id) ON DELETE CASCADE,
  funcao_id        UUID REFERENCES public.funcoes(id),
  tamanho          TEXT,
  numero           TEXT,           -- número de calçado
  data_entrega     DATE,
  data_validade    DATE,
  status           TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','devolvido','vencido')),
  documento_url    TEXT,           -- comprovante de entrega
  documento_nome   TEXT,
  observacoes      TEXT
);
ALTER TABLE public.colaborador_epi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "colab_epi_auth" ON public.colaborador_epi;
CREATE POLICY "colab_epi_auth" ON public.colaborador_epi
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. ACIDENTES DE TRABALHO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acidentes (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id   UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id          UUID REFERENCES public.obras(id),
  data_acidente    DATE NOT NULL,
  hora_acidente    TIME,
  tipo             TEXT CHECK (tipo IN ('tipico','trajeto','doenca_ocupacional')),
  gravidade        TEXT CHECK (gravidade IN ('leve','moderado','grave','fatal')),
  descricao        TEXT NOT NULL,
  local_acidente   TEXT,
  cat_emitida      BOOLEAN DEFAULT FALSE,
  status           TEXT DEFAULT 'em_investigacao'
                   CHECK (status IN ('em_investigacao','concluido','arquivado')),
  observacoes      TEXT,
  documento_url    TEXT,           -- documento da CAT
  documento_nome   TEXT
);
ALTER TABLE public.acidentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "acidentes_auth" ON public.acidentes;
CREATE POLICY "acidentes_auth" ON public.acidentes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. ATESTADOS MÉDICOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.atestados (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id    UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  acidente_id       UUID REFERENCES public.acidentes(id),   -- vínculo opcional
  data              DATE NOT NULL,                           -- data de início
  tipo              TEXT CHECK (tipo IN ('medico','comparecimento','declaracao')),
  dias_afastamento  INTEGER,
  com_afastamento   BOOLEAN DEFAULT FALSE,
  cid               TEXT,
  medico            TEXT,
  descricao         TEXT,
  observacoes       TEXT,
  documento_url     TEXT NOT NULL,    -- obrigatório
  documento_nome    TEXT
);
ALTER TABLE public.atestados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atestados_auth" ON public.atestados;
CREATE POLICY "atestados_auth" ON public.atestados
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. ADVERTÊNCIAS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.advertencias (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id    UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  data_advertencia  DATE NOT NULL,
  tipo              TEXT NOT NULL
                    CHECK (tipo IN ('verbal','escrita','suspensao','demissional')),
  motivo            TEXT NOT NULL,
  descricao         TEXT,
  assinada          BOOLEAN DEFAULT FALSE,
  dias_suspensao    INTEGER,         -- só para tipo='suspensao'
  observacoes       TEXT,
  documento_url     TEXT NOT NULL,   -- obrigatório
  documento_nome    TEXT
);
ALTER TABLE public.advertencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advertencias_auth" ON public.advertencias;
CREATE POLICY "advertencias_auth" ON public.advertencias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. DOCUMENTOS AVULSOS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documentos_avulsos (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id   UUID REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  tipo             TEXT NOT NULL DEFAULT 'outros'
                   CHECK (tipo IN ('contrato','exame','treinamento','declaracao','outros')),
  descricao        TEXT,
  data             DATE NOT NULL,
  documento_url    TEXT NOT NULL,
  documento_nome   TEXT NOT NULL
);
ALTER TABLE public.documentos_avulsos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "docs_avulsos_auth" ON public.documentos_avulsos;
CREATE POLICY "docs_avulsos_auth" ON public.documentos_avulsos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. REGISTRO DE PONTO
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.registro_ponto (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id      UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id             UUID REFERENCES public.obras(id),
  data                DATE NOT NULL,
  hora_entrada        TIME,
  saida_almoco        TIME,
  retorno_almoco      TIME,
  hora_saida          TIME,
  horas_trabalhadas   NUMERIC(5,2),
  horas_extras        NUMERIC(5,2) DEFAULT 0,
  falta               BOOLEAN DEFAULT FALSE,
  justificativa       TEXT,
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
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id     UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id            UUID REFERENCES public.obras(id),
  competencia        TEXT NOT NULL,       -- 'YYYY-MM'
  data_pagamento     DATE,
  tipo               TEXT CHECK (tipo IN ('mensal','quinzenal','semanal','adiantamento','rescisao','ferias','decimo_terceiro','bonus','outro')),
  valor_bruto        NUMERIC(10,2),
  inss               NUMERIC(10,2) DEFAULT 0,
  fgts               NUMERIC(10,2) DEFAULT 0,
  ir                 NUMERIC(10,2) DEFAULT 0,
  vale_transporte    NUMERIC(10,2) DEFAULT 0,
  adiantamento       NUMERIC(10,2) DEFAULT 0,
  valor_liquido      NUMERIC(10,2),
  status             TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  observacoes        TEXT
);
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pagamentos_auth" ON public.pagamentos;
CREATE POLICY "pagamentos_auth" ON public.pagamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. PRÊMIOS E BONIFICAÇÕES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.premios (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id   UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id          UUID REFERENCES public.obras(id),
  tipo             TEXT,
  descricao        TEXT,
  valor            NUMERIC(10,2) NOT NULL,
  data             DATE NOT NULL,
  competencia      TEXT,
  observacoes      TEXT
);
ALTER TABLE public.premios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "premios_auth" ON public.premios;
CREATE POLICY "premios_auth" ON public.premios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. VALE TRANSPORTE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vale_transporte (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id        UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  competencia           TEXT NOT NULL,
  tipo                  TEXT CHECK (tipo IN ('cartao','dinheiro','combustivel','outro')),
  valor                 NUMERIC(10,2),
  dias_trabalhados      INTEGER DEFAULT 0,
  desconto_colaborador  NUMERIC(10,2),
  valor_empresa         NUMERIC(10,2),
  observacoes           TEXT
);
ALTER TABLE public.vale_transporte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vt_auth" ON public.vale_transporte;
CREATE POLICY "vt_auth" ON public.vale_transporte
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. PROVISÕES FGTS / FÉRIAS / 13º
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provisoes_fgts (
  id                       UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id           UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id                  UUID REFERENCES public.obras(id),
  competencia              TEXT NOT NULL,
  salario_base             NUMERIC(10,2),
  fgts_mensal              NUMERIC(10,2),
  ferias_provisionadas     NUMERIC(10,2),
  decimo_terceiro          NUMERIC(10,2),
  total_provisao           NUMERIC(10,2),
  observacoes              TEXT
);
ALTER TABLE public.provisoes_fgts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "provisoes_auth" ON public.provisoes_fgts;
CREATE POLICY "provisoes_auth" ON public.provisoes_fgts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. STORAGE BUCKET — documentos de ocorrências
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('ocorrencias-documentos', 'ocorrencias-documentos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ocorr_upload"     ON storage.objects;
DROP POLICY IF EXISTS "ocorr_read_auth"  ON storage.objects;
DROP POLICY IF EXISTS "ocorr_read_pub"   ON storage.objects;
DROP POLICY IF EXISTS "ocorr_delete"     ON storage.objects;

CREATE POLICY "ocorr_upload"    ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ocorrencias-documentos');
CREATE POLICY "ocorr_read_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ocorrencias-documentos');
CREATE POLICY "ocorr_read_pub"  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'ocorrencias-documentos');
CREATE POLICY "ocorr_delete"    ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ocorrencias-documentos');

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. ATUALIZAR O PRIMEIRO USUÁRIO COMO ADMIN
-- ─────────────────────────────────────────────────────────────────────────────
-- Execute manualmente substituindo pelo seu e-mail:
-- UPDATE public.profiles SET role = 'admin', nome = 'Administrador' WHERE email = 'SEU_EMAIL@AQUI.COM';

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIM DO SCRIPT
-- ═══════════════════════════════════════════════════════════════════════════════
