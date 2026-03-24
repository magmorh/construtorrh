import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// ═══════════════════════════════════════════════════════════════
// INTERFACES — alinhadas 100% com o banco e com as pages
// ═══════════════════════════════════════════════════════════════

export interface Profile {
  id: string
  created_at: string
  nome: string
  email: string | null
  role: 'admin' | 'rh' | 'obra' | 'visualizador'
  ativo: boolean
}

export interface Funcao {
  id: string
  created_at: string
  nome: string
  sigla: string | null
  descricao: string | null
  cbo: string | null
  valor_hora_clt: number | null
  valor_hora_autonomo: number | null
  contratos_valores: Record<string, { valor_hora?: number }> | null
  ativo: boolean
}

export interface Obra {
  id: string
  created_at: string
  nome: string
  codigo: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  cliente: string | null
  responsavel: string | null
  data_inicio: string | null
  data_previsao_fim: string | null
  status: 'em_andamento' | 'concluida' | 'pausada' | 'cancelada'
  observacoes: string | null
}

export interface Colaborador {
  id: string
  created_at: string
  nome: string
  chapa: string | null
  cpf: string | null
  rg: string | null
  pis_nit: string | null
  data_nascimento: string | null
  genero: string | null
  estado_civil: string | null
  telefone: string | null
  email: string | null
  endereco: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  funcao_id: string | null
  obra_id: string | null
  salario: number | null
  tipo_contrato: 'clt' | 'autonomo' | 'pj' | 'temporario' | 'aprendiz' | 'estagiario'
  data_admissao: string | null
  data_demissao: string | null
  ctps_numero: string | null
  ctps_serie: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  tipo_conta: string | null
  pix_chave: string | null
  pix_tipo: string | null
  vale_transporte: boolean
  vt_dados: Record<string, unknown> | null
  status: 'ativo' | 'inativo' | 'afastado' | 'ferias'
  observacoes: string | null
  // joins
  funcoes?: Funcao
  obras?: Obra
}

export interface HistoricoChapa {
  id: string
  created_at: string
  colaborador_id: string
  chapa: string | null
  funcao_id: string | null
  tipo_contrato: string | null
  data_inicio: string | null
  data_fim: string | null
  motivo_troca: string | null
  funcoes?: Pick<Funcao, 'nome' | 'sigla'>
}

export interface EpiCatalogo {
  id: string
  created_at: string
  nome: string
  categoria: string | null
  numero_ca: string | null       // Certificado de Aprovação
  ca_validade: string | null     // data de validade do CA
  unidade: string | null         // unidade, par, jogo, conjunto
  vida_util_meses: number | null // vida útil em meses
  requer_tamanho: boolean
  requer_numero: boolean         // número de calçado
  descricao: string | null
  ativo: boolean
}

export interface FuncaoEpi {
  id: string
  created_at: string
  funcao_id: string
  epi_id: string
  obrigatorio: boolean
  quantidade: number
  epi_catalogo?: EpiCatalogo
}

export interface ColaboradorEpi {
  id: string
  created_at: string
  colaborador_id: string
  epi_id: string
  funcao_id: string | null
  tamanho: string | null
  numero: string | null
  data_entrega: string | null
  data_validade: string | null
  status: 'ativo' | 'devolvido' | 'vencido' | 'pendente' | 'entregue' | 'substituido'
  obrigatorio: boolean
  quantidade: number
  quantidade_entregue: number
  documento_url: string | null
  documento_nome: string | null
  observacoes: string | null
  // joins
  epi_catalogo?: EpiCatalogo
  colaboradores?: Pick<Colaborador, 'id' | 'nome' | 'chapa'>
}

export interface Acidente {
  id: string
  created_at: string
  colaborador_id: string | null
  obra_id: string | null
  data_ocorrencia: string
  hora_acidente: string | null
  tipo: 'tipico' | 'trajeto' | 'doenca_ocupacional' | null
  gravidade: 'leve' | 'moderado' | 'grave' | 'fatal' | null
  descricao: string
  local_acidente: string | null
  cat_emitida: boolean | null
  status: 'em_investigacao' | 'concluido' | 'arquivado' | null
  observacoes: string | null
  documento_url: string | null
  documento_nome: string | null
  colaboradores?: Pick<Colaborador, 'id' | 'nome' | 'chapa'>
  obras?: Pick<Obra, 'id' | 'nome'>
}

export interface Atestado {
  id: string
  created_at: string
  colaborador_id: string
  acidente_id: string | null
  data: string                     // data de início do atestado
  tipo: 'medico' | 'comparecimento' | 'declaracao' | null
  dias_afastamento: number | null
  com_afastamento: boolean | null
  cid: string | null
  medico: string | null
  descricao: string | null
  observacoes: string | null
  documento_url: string
  documento_nome: string | null
  colaboradores?: Pick<Colaborador, 'id' | 'nome' | 'chapa'>
  acidentes?: Pick<Acidente, 'id' | 'data_ocorrencia' | 'tipo'>
}

export interface Advertencia {
  id: string
  created_at: string
  colaborador_id: string
  data_advertencia: string
  tipo: 'verbal' | 'escrita' | 'suspensao' | 'demissional'
  motivo: string
  descricao: string | null
  assinada: boolean | null
  dias_suspensao: number | null
  observacoes: string | null
  documento_url: string
  documento_nome: string | null
  colaboradores?: Pick<Colaborador, 'id' | 'nome' | 'chapa'>
}

export interface DocumentoAvulso {
  id: string
  created_at: string
  colaborador_id: string | null
  tipo: 'contrato' | 'exame' | 'treinamento' | 'declaracao' | 'outros'
  descricao: string | null
  data: string
  documento_url: string
  documento_nome: string
  colaboradores?: Pick<Colaborador, 'id' | 'nome' | 'chapa'>
}

export interface RegistroPonto {
  id: string
  created_at: string
  colaborador_id: string
  obra_id: string | null
  data: string
  hora_entrada: string | null
  saida_almoco: string | null
  retorno_almoco: string | null
  hora_saida: string | null
  horas_trabalhadas: number | null
  horas_extras: number
  he_entrada: string | null
  he_saida: string | null
  falta: boolean
  justificativa: string | null
  colaboradores?: Pick<Colaborador, 'nome' | 'chapa'>
  obras?: Pick<Obra, 'nome'>
}

export interface Pagamento {
  id: string
  created_at: string
  colaborador_id: string
  obra_id: string | null
  competencia: string
  data_pagamento: string | null
  tipo: 'mensal' | 'quinzenal' | 'semanal' | 'adiantamento' | 'rescisao' | 'ferias' | 'decimo_terceiro' | 'bonus' | 'outro' | null
  valor_bruto: number | null
  inss: number
  fgts: number
  ir: number
  vale_transporte: number
  adiantamento: number
  valor_liquido: number | null
  status: 'pendente' | 'pago' | 'cancelado'
  observacoes: string | null
  colaboradores?: Pick<Colaborador, 'nome' | 'chapa'>
}

export interface Premio {
  id: string
  created_at: string
  colaborador_id: string
  obra_id: string | null
  tipo: string | null
  descricao: string | null
  valor: number
  data: string
  competencia: string | null
  observacoes: string | null
  colaboradores?: Pick<Colaborador, 'nome' | 'chapa'>
}

export interface ValeTransporte {
  id: string
  created_at: string
  colaborador_id: string
  competencia: string
  data_inicio: string | null   // período parcial: início
  data_fim: string | null      // período parcial: fim
  tipo: 'cartao' | 'dinheiro' | 'combustivel' | 'outro' | null
  valor: number | null
  dias_trabalhados: number
  desconto_colaborador: number | null
  valor_empresa: number | null
  descontar_6pct: boolean      // empresa desconta 6% do salário?
  observacoes: string | null
  colaboradores?: Pick<Colaborador, 'id' | 'nome' | 'chapa'> & { salario?: number | null; vt_dados?: Record<string,unknown> | null }
}

export interface ProvisaoFgts {
  id: string
  created_at: string
  colaborador_id: string
  obra_id: string | null
  competencia: string
  salario_base: number | null
  fgts_mensal: number | null
  ferias_provisionadas: number | null
  decimo_terceiro: number | null
  total_provisao: number | null
  observacoes: string | null
  colaboradores?: Pick<Colaborador, 'nome' | 'chapa'>
  obras?: Pick<Obra, 'nome'>
}

export interface Configuracao {
  id: string
  created_at: string
  chave: string
  valor: string | null
  descricao: string | null
}
