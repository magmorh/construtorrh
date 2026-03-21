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

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      colaboradores: { Row: Colaborador; Insert: Partial<Colaborador>; Update: Partial<Colaborador> }
      obras: { Row: Obra; Insert: Partial<Obra>; Update: Partial<Obra> }
      funcoes: { Row: Funcao; Insert: Partial<Funcao>; Update: Partial<Funcao> }
      epi_catalogo: { Row: EpiCatalogo; Insert: Partial<EpiCatalogo>; Update: Partial<EpiCatalogo> }
      epi_registros: { Row: EpiRegistro; Insert: Partial<EpiRegistro>; Update: Partial<EpiRegistro> }
      acidentes: { Row: Acidente; Insert: Partial<Acidente>; Update: Partial<Acidente> }
      atestados: { Row: Atestado; Insert: Partial<Atestado>; Update: Partial<Atestado> }
      documentos: { Row: Documento; Insert: Partial<Documento>; Update: Partial<Documento> }
      registro_ponto: { Row: RegistroPonto; Insert: Partial<RegistroPonto>; Update: Partial<RegistroPonto> }
      pagamentos: { Row: Pagamento; Insert: Partial<Pagamento>; Update: Partial<Pagamento> }
      premios: { Row: Premio; Insert: Partial<Premio>; Update: Partial<Premio> }
      provisoes_fgts: { Row: ProvisaoFgts; Insert: Partial<ProvisaoFgts>; Update: Partial<ProvisaoFgts> }
      vale_transporte: { Row: ValeTransporte; Insert: Partial<ValeTransporte>; Update: Partial<ValeTransporte> }
      configuracoes: { Row: Configuracao; Insert: Partial<Configuracao>; Update: Partial<Configuracao> }
    }
  }
}

// ============ TIPOS ============
export interface Profile {
  id: string; created_at: string; updated_at: string
  email: string | null; full_name: string | null
  role: 'admin' | 'user' | 'gestor' | 'rh'; ativo: boolean
}

export interface Funcao {
  id: string; created_at: string; updated_at: string
  nome: string; descricao: string | null; cbo: string | null
  sigla: string | null
  salario_base: number | null   // legado — não usar na interface
  valor_hora_clt: number | null
  valor_hora_autonomo: number | null
  ativo: boolean
}

export interface EpiCatalogo {
  id: string; created_at: string
  nome: string; categoria: string | null; numero_ca: string | null
  unidade: string | null; requer_tamanho: boolean; requer_numero: boolean
  vida_util_meses: number | null; ativo: boolean
}

export interface FuncaoEpi {
  id: string; created_at: string
  funcao_id: string; epi_id: string
  obrigatorio: boolean; quantidade: number
}

export interface ColaboradorEpi {
  id: string; created_at: string
  colaborador_id: string; epi_id: string; funcao_id: string | null
  tamanho: string | null; numero: string | null
  data_entrega: string | null; quantidade_entregue: number
  status: 'pendente' | 'entregue' | 'devolvido' | 'substituido'
  observacoes: string | null
}

export interface Acidente {
  id: string; created_at: string; updated_at: string
  colaborador_id: string | null; obra_id: string | null
  data_ocorrencia: string; hora_ocorrencia: string | null
  tipo_acidente: string | null; descricao: string
  comunicado_cat: boolean; observacoes: string | null
}

export interface Atestado {
  id: string; created_at: string; updated_at: string
  colaborador_id: string | null; acidente_id: string | null
  data_inicio: string; data_fim: string | null
  dias_afastamento: number | null
  tipo_afastamento: 'doenca' | 'acidente_trabalho' | 'acidente_trajeto' | 'cirurgia' | 'maternidade' | 'outros'
  cid: string | null; medico: string | null; crm: string | null
  data_retorno: string | null; observacoes: string | null
  status: string
}


export interface Obra {
  id: string; created_at: string; updated_at: string
  nome: string; codigo: string | null; endereco: string | null
  cidade: string | null; estado: string | null; cliente: string | null
  responsavel: string | null; data_inicio: string | null
  data_previsao_fim: string | null
  status: 'em_andamento' | 'concluida' | 'pausada' | 'cancelada'
  ativo: boolean; observacoes: string | null
}

export interface Colaborador {
  id: string; created_at: string; updated_at: string
  nome: string; chapa: string | null; cpf: string | null; rg: string | null
  pis_nit: string | null; data_nascimento: string | null
  genero: string | null; estado_civil: string | null
  telefone: string | null; email: string | null; endereco: string | null
  cidade: string | null; estado: string | null; cep: string | null
  funcao_id: string | null; obra_id: string | null
  salario: number | null
  tipo_contrato: 'clt' | 'autonomo' | 'pj' | 'temporario' | 'aprendiz' | 'estagiario'
  data_admissao: string | null
  ctps_numero: string | null; ctps_serie: string | null
  banco: string | null; agencia: string | null; conta: string | null
  tipo_conta: string | null; pix_chave: string | null
  vale_transporte: boolean; vt_tipo: string | null
  vt_trechos_ida: number; vt_trechos_volta: number
  status: 'ativo' | 'inativo' | 'afastado' | 'ferias'
  observacoes: string | null
  // joins
  funcoes?: Funcao
  obras?: Obra
}

export interface EpiCatalogo {
  id: string; created_at: string; updated_at: string
  nome: string; descricao: string | null; numero_ca: string | null
  fabricante: string | null; validade_meses: number | null
  requer_tamanho: boolean; ativo: boolean
}

export interface EpiRegistro {
  id: string; created_at: string; updated_at: string
  colaborador_id: string; epi_id: string | null
  epi_nome: string | null; numero_ca: string | null
  tamanho: string | null; quantidade: number
  data_entrega: string; data_devolucao: string | null
  data_validade: string | null; devolvido: boolean; observacoes: string | null
  colaboradores?: Colaborador; epi_catalogo?: EpiCatalogo
}

export interface Acidente {
  id: string; created_at: string; updated_at: string
  colaborador_id: string | null; obra_id: string | null
  data_acidente: string; hora_acidente: string | null
  tipo: 'tipico' | 'trajeto' | 'doenca_ocupacional' | null
  gravidade: 'leve' | 'moderado' | 'grave' | 'fatal' | null
  descricao: string; local_acidente: string | null
  com_afastamento: boolean; dias_afastamento: number
  cat_emitida: boolean
  status: 'em_investigacao' | 'concluido' | 'arquivado'
  observacoes: string | null
  colaboradores?: Colaborador; obras?: Obra
}

export interface Atestado {
  id: string; created_at: string; updated_at: string
  colaborador_id: string
  tipo: 'medico' | 'comparecimento' | 'declaracao' | null
  data: string; dias_afastamento: number; com_afastamento: boolean
  cid: string | null; medico: string | null
  descricao: string | null; observacoes: string | null
  colaboradores?: Colaborador
}

export interface Documento {
  id: string; created_at: string; updated_at: string
  colaborador_id: string; tipo: string; titulo: string
  numero: string | null; data_emissao: string | null
  data_vencimento: string | null; orgao_emissor: string | null
  status: 'ativo' | 'vencido' | 'renovar'; observacoes: string | null
  colaboradores?: Colaborador
}

export interface RegistroPonto {
  id: string; created_at: string; updated_at: string
  colaborador_id: string; data: string
  hora_entrada: string | null; saida_almoco: string | null
  retorno_almoco: string | null; hora_saida: string | null
  horas_trabalhadas: number | null; horas_extras: number
  falta: boolean; justificativa: string | null; obra_id: string | null
  colaboradores?: Colaborador; obras?: Obra
}

export interface Pagamento {
  id: string; created_at: string; updated_at: string
  colaborador_id: string; obra_id: string | null
  competencia: string; data_pagamento: string | null
  tipo: 'folha' | 'adiantamento' | '13_salario' | 'ferias' | 'rescisao' | null
  valor_bruto: number | null; valor_liquido: number | null
  inss: number; fgts: number; ir: number
  vale_transporte: number; adiantamento: number
  status: 'pendente' | 'pago' | 'cancelado'; observacoes: string | null
  colaboradores?: Colaborador
}

export interface Premio {
  id: string; created_at: string; updated_at: string
  colaborador_id: string; obra_id: string | null
  tipo: string | null; descricao: string; valor: number | null
  data: string; competencia: string | null; observacoes: string | null
  colaboradores?: Colaborador
}

export interface ProvisaoFgts {
  id: string; created_at: string; updated_at: string
  colaborador_id: string; obra_id: string | null; competencia: string
  salario_base: number | null; fgts_mensal: number | null
  ferias_provisionadas: number | null; decimo_terceiro: number | null
  total_provisao: number | null; observacoes: string | null
  colaboradores?: Colaborador
}

export interface ValeTransporte {
  id: string; created_at: string; updated_at: string
  colaborador_id: string; competencia: string
  tipo: 'cartao' | 'bilhete_unico' | 'dinheiro' | null
  valor: number | null; dias_trabalhados: number
  desconto_colaborador: number | null; valor_empresa: number | null
  observacoes: string | null
  colaboradores?: Colaborador
}

export interface Configuracao {
  id: string; created_at: string; updated_at: string
  chave: string; valor: string | null; descricao: string | null; categoria: string | null
}
