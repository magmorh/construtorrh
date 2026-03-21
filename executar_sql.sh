#!/bin/bash
# Execute este script no seu computador local (não no servidor)
# Substitua SERVICE_ROLE_KEY pela sua chave service_role do Supabase

SUPABASE_URL="https://rbhmfqngnjxdemavtvxk.supabase.co"
SERVICE_ROLE_KEY="COLE_AQUI_SUA_SERVICE_ROLE_KEY"

SQL=$(cat << 'ENDSQL'

-- ============================================================
-- CONSTRUTOR RH - Schema Supabase / PostgreSQL
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABELA: profiles (perfis dos usuários)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user', 'gestor', 'rh')),
  ativo BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- TABELA: funcoes (Funções/Cargos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.funcoes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  nome TEXT NOT NULL,
  descricao TEXT,
  cbo TEXT,
  salario_base NUMERIC(10,2),
  ativo BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- TABELA: obras (Obras/Projetos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.obras (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  nome TEXT NOT NULL,
  codigo TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cliente TEXT,
  responsavel TEXT,
  data_inicio DATE,
  data_previsao_fim DATE,
  status TEXT DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','concluida','pausada','cancelada')),
  ativo BOOLEAN DEFAULT TRUE,
  observacoes TEXT
);

-- ============================================================
-- TABELA: colaboradores
-- ============================================================
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  nome TEXT NOT NULL,
  chapa TEXT UNIQUE,
  cpf TEXT UNIQUE,
  rg TEXT,
  pis_nit TEXT,
  data_nascimento DATE,
  genero TEXT,
  estado_civil TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  funcao_id UUID REFERENCES public.funcoes(id),
  obra_id UUID REFERENCES public.obras(id),
  salario NUMERIC(10,2),
  tipo_contrato TEXT DEFAULT 'clt' CHECK (tipo_contrato IN ('clt','pj','temporario','aprendiz','estagiario')),
  data_admissao DATE,
  ctps_numero TEXT,
  ctps_serie TEXT,
  banco TEXT,
  agencia TEXT,
  conta TEXT,
  tipo_conta TEXT,
  pix_chave TEXT,
  vale_transporte BOOLEAN DEFAULT FALSE,
  vt_tipo TEXT,
  vt_trechos_ida INTEGER DEFAULT 0,
  vt_trechos_volta INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','inativo','afastado','ferias')),
  observacoes TEXT
);

-- ============================================================
-- TABELA: epi_catalogo
-- ============================================================
CREATE TABLE IF NOT EXISTS public.epi_catalogo (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  nome TEXT NOT NULL,
  descricao TEXT,
  numero_ca TEXT,
  fabricante TEXT,
  validade_meses INTEGER,
  requer_tamanho BOOLEAN DEFAULT FALSE,
  ativo BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- TABELA: epi_registros
-- ============================================================
CREATE TABLE IF NOT EXISTS public.epi_registros (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  epi_id UUID REFERENCES public.epi_catalogo(id),
  epi_nome TEXT,
  numero_ca TEXT,
  tamanho TEXT,
  quantidade INTEGER DEFAULT 1,
  data_entrega DATE NOT NULL,
  data_devolucao DATE,
  data_validade DATE,
  devolvido BOOLEAN DEFAULT FALSE,
  observacoes TEXT
);

-- ============================================================
-- TABELA: acidentes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.acidentes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id),
  obra_id UUID REFERENCES public.obras(id),
  data_acidente DATE NOT NULL,
  hora_acidente TIME,
  tipo TEXT CHECK (tipo IN ('tipico','trajeto','doenca_ocupacional')),
  gravidade TEXT CHECK (gravidade IN ('leve','moderado','grave','fatal')),
  descricao TEXT NOT NULL,
  local_acidente TEXT,
  com_afastamento BOOLEAN DEFAULT FALSE,
  dias_afastamento INTEGER DEFAULT 0,
  cat_emitida BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'em_investigacao' CHECK (status IN ('em_investigacao','concluido','arquivado')),
  observacoes TEXT
);

-- ============================================================
-- TABELA: atestados
-- ============================================================
CREATE TABLE IF NOT EXISTS public.atestados (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo TEXT CHECK (tipo IN ('medico','comparecimento','declaracao')),
  data DATE NOT NULL,
  dias_afastamento INTEGER DEFAULT 0,
  com_afastamento BOOLEAN DEFAULT FALSE,
  cid TEXT,
  medico TEXT,
  descricao TEXT,
  observacoes TEXT
);

-- ============================================================
-- TABELA: documentos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documentos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  numero TEXT,
  data_emissao DATE,
  data_vencimento DATE,
  orgao_emissor TEXT,
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','vencido','renovar')),
  observacoes TEXT
);

-- ============================================================
-- TABELA: registro_ponto
-- ============================================================
CREATE TABLE IF NOT EXISTS public.registro_ponto (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  hora_entrada TIME,
  saida_almoco TIME,
  retorno_almoco TIME,
  hora_saida TIME,
  horas_trabalhadas NUMERIC(4,2),
  horas_extras NUMERIC(4,2) DEFAULT 0,
  falta BOOLEAN DEFAULT FALSE,
  justificativa TEXT,
  obra_id UUID REFERENCES public.obras(id)
);

-- ============================================================
-- TABELA: pagamentos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pagamentos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id UUID REFERENCES public.obras(id),
  competencia TEXT NOT NULL,
  data_pagamento DATE,
  tipo TEXT CHECK (tipo IN ('folha','adiantamento','13_salario','ferias','rescisao')),
  valor_bruto NUMERIC(10,2),
  valor_liquido NUMERIC(10,2),
  inss NUMERIC(10,2) DEFAULT 0,
  fgts NUMERIC(10,2) DEFAULT 0,
  ir NUMERIC(10,2) DEFAULT 0,
  vale_transporte NUMERIC(10,2) DEFAULT 0,
  adiantamento NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  observacoes TEXT
);

-- ============================================================
-- TABELA: premios
-- ============================================================
CREATE TABLE IF NOT EXISTS public.premios (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id UUID REFERENCES public.obras(id),
  tipo TEXT,
  descricao TEXT NOT NULL,
  valor NUMERIC(10,2),
  data DATE NOT NULL,
  competencia TEXT,
  observacoes TEXT
);

-- ============================================================
-- TABELA: provisoes_fgts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provisoes_fgts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  obra_id UUID REFERENCES public.obras(id),
  competencia TEXT NOT NULL,
  salario_base NUMERIC(10,2),
  fgts_mensal NUMERIC(10,2),
  ferias_provisionadas NUMERIC(10,2),
  decimo_terceiro NUMERIC(10,2),
  total_provisao NUMERIC(10,2),
  observacoes TEXT
);

-- ============================================================
-- TABELA: vale_transporte
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vale_transporte (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  colaborador_id UUID REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('cartao','bilhete_unico','dinheiro')),
  valor NUMERIC(10,2),
  dias_trabalhados INTEGER DEFAULT 0,
  desconto_colaborador NUMERIC(10,2),
  valor_empresa NUMERIC(10,2),
  observacoes TEXT
);

-- ============================================================
-- TABELA: configuracoes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.configuracoes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  chave TEXT UNIQUE NOT NULL,
  valor TEXT,
  descricao TEXT,
  categoria TEXT
);

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','funcoes','obras','colaboradores','epi_catalogo','epi_registros',
    'acidentes','atestados','documentos','registro_ponto','pagamentos','premios',
    'provisoes_fgts','vale_transporte','configuracoes']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_%s ON public.%s;
      CREATE TRIGGER trg_updated_%s BEFORE UPDATE ON public.%s FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      t, t, t, t);
  END LOOP;
END $$;

-- ============================================================
-- RLS
-- ============================================================
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','funcoes','obras','colaboradores','epi_catalogo','epi_registros',
    'acidentes','atestados','documentos','registro_ponto','pagamentos','premios',
    'provisoes_fgts','vale_transporte','configuracoes']
  LOOP
    EXECUTE format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_all_%s" ON public.%s;
      CREATE POLICY "authenticated_all_%s" ON public.%s FOR ALL TO authenticated USING (true) WITH CHECK (true);',
      t, t, t, t);
  END LOOP;
END $$;

-- ============================================================
-- AUTO-CRIAR PROFILE NO SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), 'admin')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_colab_cpf ON public.colaboradores(cpf);
CREATE INDEX IF NOT EXISTS idx_colab_chapa ON public.colaboradores(chapa);
CREATE INDEX IF NOT EXISTS idx_colab_obra ON public.colaboradores(obra_id);
CREATE INDEX IF NOT EXISTS idx_colab_status ON public.colaboradores(status);
CREATE INDEX IF NOT EXISTS idx_ponto_colab ON public.registro_ponto(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_ponto_data ON public.registro_ponto(data);
CREATE INDEX IF NOT EXISTS idx_pag_colab ON public.pagamentos(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_pag_comp ON public.pagamentos(competencia);

-- ============================================================
-- CONFIGURAÇÕES PADRÃO
-- ============================================================
INSERT INTO public.configuracoes (chave, valor, descricao, categoria) VALUES
  ('empresa_nome','Minha Construtora','Nome da empresa','empresa'),
  ('empresa_cnpj','','CNPJ da empresa','empresa'),
  ('jornada_horas','8','Horas por dia','ponto'),
  ('he_percentual_60','60','Hora extra 60%','pagamento'),
  ('he_percentual_100','100','Hora extra 100%','pagamento'),
  ('vt_desconto_pct','6','Desconto VT (%)','vt')
ON CONFLICT (chave) DO NOTHING;

SELECT '✅ ConstrutorRH schema criado!' AS resultado;

ENDSQL
)

curl -s -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"sql\": $(echo "$SQL" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}"

echo "Script concluído."
