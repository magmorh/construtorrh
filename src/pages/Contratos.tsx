import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useProfile } from '@/hooks/useProfile'
import { supabase } from '@/lib/supabase'
import type { Colaborador, Funcao, Obra } from '@/lib/supabase'
import { fetchEmpresaData, type EmpresaData } from '@/lib/relatorioHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Search, Plus, Pencil, Trash2, FileText, Eye, Printer, X, ChevronDown, Settings, Save, BookOpen, Briefcase, Layers, Building2, User, CheckCircle2 } from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
interface Modelo {
  id: string
  created_at: string
  updated_at: string
  numero: number | null
  titulo: string
  categoria: string
  tipo_contrato: string[] | null
  descricao: string | null
  conteudo: string
  ativo: boolean
  ordem: number
}

interface FuncaoRow {
  id: string
  nome: string
  sigla: string | null
  descricao: string | null
  cbo: string | null
}

type ColaboradorRow = Colaborador & {
  funcoes?: Pick<Funcao, 'nome' | 'sigla' | 'descricao' | 'valor_hora_clt' | 'valor_hora_autonomo'>
  obras?: Pick<Obra, 'nome' | 'codigo' | 'endereco' | 'cidade' | 'estado'>
}

// ─── constantes ──────────────────────────────────────────────────────────────
const CATEGORIAS: Record<string, { label: string; cor: string; bg: string; emoji: string }> = {
  admissional: { label: 'Admissional',  cor: '#0369a1', bg: '#e0f2fe', emoji: '📋' },
  contrato:    { label: 'Contrato',     cor: '#15803d', bg: '#dcfce7', emoji: '📜' },
  termo:       { label: 'Termo',        cor: '#7c3aed', bg: '#ede9fe', emoji: '📝' },
  declaracao:  { label: 'Declaração',   cor: '#b45309', bg: '#fef3c7', emoji: '✍️'  },
  politica:    { label: 'Política',     cor: '#be185d', bg: '#fce7f3', emoji: '⚖️'  },
  ficha:       { label: 'Ficha',        cor: '#0f766e', bg: '#ccfbf1', emoji: '📁' },
  outro:       { label: 'Outro',        cor: '#64748b', bg: '#f1f5f9', emoji: '📄' },
}

const ALL_CATS = ['todos', ...Object.keys(CATEGORIAS)]

const FONTS = ['Times New Roman', 'Arial', 'Georgia', 'Calibri', 'Courier New', 'Verdana', 'Tahoma', 'Helvetica']
// Tamanhos em pt (usamos CSS font-size via span, NÃO execCommand fontSize que usa escala 1-7)
const FONT_SIZES_PT = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48]
const LINE_HEIGHTS = ['1.0', '1.2', '1.4', '1.5', '1.6', '1.8', '2.0', '2.4', '3.0']

// Estilos de bloco de texto
const BLOCK_STYLES = [
  { value: 'p',          label: 'Parágrafo',   css: 'font-size:12pt;font-weight:400;margin:8px 0;line-height:1.6;' },
  { value: 'h1',         label: 'Título 1',    css: 'font-size:18pt;font-weight:900;margin:0 0 12px;text-align:center;text-transform:uppercase;letter-spacing:.04em;line-height:1.3;' },
  { value: 'h2',         label: 'Título 2',    css: 'font-size:14pt;font-weight:800;margin:16px 0 6px;text-transform:uppercase;border-bottom:1.5px solid #334155;padding-bottom:3px;line-height:1.3;' },
  { value: 'h3',         label: 'Título 3',    css: 'font-size:12pt;font-weight:700;margin:12px 0 4px;line-height:1.4;' },
  { value: 'h4',         label: 'Subtítulo',   css: 'font-size:11pt;font-weight:700;margin:10px 0 3px;font-style:italic;line-height:1.4;' },
  { value: 'blockquote', label: 'Citação',     css: 'font-size:11pt;font-weight:400;margin:10px 0;border-left:3px solid #94a3b8;padding-left:12px;color:#475569;font-style:italic;line-height:1.6;' },
]

// ─── helpers ─────────────────────────────────────────────────────────────────
// ─── Valor monetário por extenso ─────────────────────────────────────────────
function valorPorExtenso(v: number | null | undefined): string {
  if (!v || v <= 0) return ''
  const unidades = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove',
    'dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove']
  const dezenas  = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa']
  const centenas = ['','cem','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos']

  function grupo(n: number): string {
    if (n === 0) return ''
    if (n === 100) return 'cem'
    const c = Math.floor(n/100), d = Math.floor((n%100)/10), u = n%10
    const partes: string[] = []
    if (c) partes.push(centenas[c])
    if (d >= 2) { partes.push(dezenas[d]); if (u) partes.push(unidades[u]) }
    else if (d === 1) partes.push(unidades[10 + u])
    else if (u) partes.push(unidades[u])
    return partes.join(' e ')
  }

  const inteiro = Math.floor(v)
  const cents   = Math.round((v - inteiro) * 100)
  const mil = Math.floor(inteiro/1000), resto = inteiro % 1000
  const partes: string[] = []
  if (mil > 0) partes.push((mil === 1 ? 'mil' : grupo(mil) + ' mil'))
  if (resto > 0) partes.push(grupo(resto))
  const inteiroStr = partes.join(' e ') + (inteiro === 1 ? ' real' : ' reais')
  if (cents > 0) return inteiroStr + ' e ' + grupo(cents) + (cents === 1 ? ' centavo' : ' centavos')
  return inteiroStr
}

function buildVarMap(
  c: ColaboradorRow | null,
  emp: { nome: string; cnpj: string; endereco: string; cidade: string; razaoSocial: string }
): Record<string, string> {
  if (!c) return {}
  const hoje  = new Date()
  const dia   = String(hoje.getDate()).padStart(2, '0')
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
  const mes   = meses[hoje.getMonth()]
  const ano   = String(hoje.getFullYear())
  const fmtDate = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : ''
  const salFmt  = c.salario ? `R$ ${c.salario.toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '[Salário não cadastrado]'
  const salMensalNum = c.salario ?? 0
  const salExtenso  = salMensalNum > 0 ? valorPorExtenso(salMensalNum) : '[salário não cadastrado]'
  const fn  = (c.funcoes as any)?.nome ?? ''
  const ob  = (c.obras  as any)?.nome  ?? ''

  // Endereço da obra
  const obraEndereco = (() => {
    const o = c.obras as any
    if (!o) return ''
    const parts = [o.endereco, o.cidade, o.estado].filter(Boolean)
    return parts.join(', ')
  })()
  const obraCidade = (c.obras as any)?.cidade ?? emp.cidade ?? ''

  // Valor hora da função
  const fnData = c.funcoes as any
  const fmtHora = (v: number | null | undefined) =>
    v ? `R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : ''
  const fmtHoraNum = (v: number | null | undefined) =>
    v ? Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2}) : ''
  const valorHoraCLTNum   = fmtHoraNum(fnData?.valor_hora_clt)
  const valorHoraExtNum   = fmtHoraNum(fnData?.valor_hora_autonomo)
  const valorHoraExt      = fmtHora(fnData?.valor_hora_autonomo)
  // Valor hora CLT: número + extenso combinados
  const valorHoraCLTExtVal  = fnData?.valor_hora_clt ? Number(fnData.valor_hora_clt) : 0
  const valorHoraCLTExtenso = valorHoraCLTExtVal > 0 ? valorPorExtenso(valorHoraCLTExtVal) : ''
  const valorHoraCLT = valorHoraCLTExtVal > 0
    ? `R$ ${valorHoraCLTExtVal.toLocaleString('pt-BR',{minimumFractionDigits:2})} (${valorHoraCLTExtenso})`
    : '[valor/hora não cadastrado]'

  // Descrição da função
  const fnDescricao = fnData?.descricao ?? ''
  const fnCBO       = fnData?.cbo ?? ''
  const fnSigla     = fnData?.sigla ?? ''

  const genero: Record<string,string> = { masculino:'brasileiro', feminino:'brasileira', outro:'brasileiro(a)' }
  const civil:  Record<string,string> = { solteiro:'solteiro(a)', casado:'casado(a)', divorciado:'divorciado(a)', viuvo:'viúvo(a)', uniao_estavel:'em união estável' }

  return {
    // Colaborador
    'Nome Completo': c.nome, 'NOME': c.nome, 'Nome Completo do Empregado': c.nome,
    'Nome do(a) Novo(a) Colaborador(a)': c.nome, 'NOME COMPLETO': c.nome,
    'CPF': c.cpf ?? '', 'Número do CPF': c.cpf ?? '',
    'RG': c.rg ?? '', 'Número do RG': c.rg ?? '',
    'PIS/NIT': c.pis_nit ?? '', 'Número do PIS/PASEP': c.pis_nit ?? '',
    'CTPS Nº': c.ctps_numero ?? '', 'Número da CTPS': c.ctps_numero ?? '',
    'Série CTPS': c.ctps_serie ?? '', 'Série da CTPS': c.ctps_serie ?? '',
    // Função — nome
    'Função': fn, 'FUNÇÃO': fn, 'NOME DA FUNÇÃO': fn, 'Profissão': fn, 'Profissão/Função': fn,
    'NOME COMPLETO DA FUNÇÃO': fn,
    // Função — sigla / CBO
    'Sigla da Função': fnSigla,
    'CBO': fnCBO, 'Código CBO': fnCBO,
    // Função — descrição de atividades
    'Descrição da Função': fnDescricao,
    'DESCRIÇÃO DAS ATIVIDADES': fnDescricao,
    'Atividades da Função': fnDescricao,
    'Descrição das Atividades': fnDescricao,
    // Função — valor hora
    'Valor Hora CLT': valorHoraCLT,
    'Valor da Hora CLT': valorHoraCLT,
    'Hora CLT': valorHoraCLT,
    'Valor Hora Externo': valorHoraExt,
    'Valor da Hora Externo': valorHoraExt,
    'Hora Externa': valorHoraExt,
    'Hora Autônomo': valorHoraExt,
    'Valor Hora Numérico CLT': valorHoraCLTNum,
    'Valor Hora Numérico Externo': valorHoraExtNum,
    // Obra
    'Obra': ob, 'LOCAL DA PRESTAÇÃO DOS SERVIÇOS': ob,
    'Nome da Obra': ob,
    'Endereço da Obra': obraEndereco,
    'Local de Trabalho': obraEndereco || ob,
    'Endereço do Local de Trabalho': obraEndereco,
    // Colaborador — data / salário / endereço
    'Data Admissão': fmtDate(c.data_admissao), 'Data de Início': fmtDate(c.data_admissao),
    'Salário': salFmt, 'valor numérico': salFmt,
    'Salário por Extenso': salExtenso, 'Salário Extenso': salExtenso,
    'Valor por Extenso': salExtenso, 'Valor Extenso': salExtenso,
    'Endereço': `${c.endereco ?? ''}, ${c.cidade ?? ''} - ${c.estado ?? ''}, CEP ${c.cep ?? ''}`,
    'Endereço Completo do Empregado': `${c.endereco ?? ''}, ${c.cidade ?? ''} - ${c.estado ?? ''}`,
    'Endereço Completo do Empregado, não esquecer de colocar número, quadra, lote e CEP': `${c.endereco ?? ''}, ${c.cidade ?? ''} - ${c.estado ?? ''}, CEP ${c.cep ?? ''}`,
    'Cidade': c.cidade ?? '', 'Estado Civil': civil[c.estado_civil ?? ''] ?? '',
    'Nacionalidade': genero[c.genero ?? ''] ?? 'brasileiro(a)',
    // Empresa
    'Nome Empresa': emp.nome, 'NOME FANTASIA DA EMPRESA': emp.nome,
    'Nome Completo ou Razão Social do Empregador': emp.razaoSocial || emp.nome,
    'Razão Social da Empresa': emp.razaoSocial || emp.nome,
    'CNPJ': emp.cnpj, 'Número do CNPJ': emp.cnpj,
    'Endereço Empresa': emp.endereco, 'Endereço Completo do Empregador': emp.endereco,
    // Data
    'Dia': dia, 'DIA': dia, 'Mês': mes, 'MÊS': mes, 'Ano': ano, 'ANO': ano,
    'CIDADE': emp.cidade || obraCidade || c.cidade || 'São Paulo',
    'cidade/estado/raio km': emp.cidade || obraCidade,
    'região metropolitana de CIDADE DA PRESTAÇÃO DE SERVIÇOS': emp.cidade || obraCidade,
  }
}

function aplicarVariaveis(conteudo: string, varMap: Record<string, string>): string {
  return conteudo.replace(/\{\{([^}]+)\}\}/g, (_, chave) => {
    if (varMap[chave] !== undefined)
      return varMap[chave] || `<span style="background:#fef9c3;border-bottom:2px solid #ca8a04;padding:0 3px;border-radius:3px">{{${chave}}}</span>`
    const k = chave.toLowerCase()
    for (const [key, val] of Object.entries(varMap)) {
      if (key.toLowerCase().includes(k) || k.includes(key.toLowerCase()))
        return val || `<span style="background:#fef9c3;border-bottom:2px solid #ca8a04;padding:0 3px;border-radius:3px">{{${chave}}}</span>`
    }
    return `<span style="background:#fef9c3;border-bottom:2px solid #ca8a04;padding:0 3px;border-radius:3px">{{${chave}}}</span>`
  })
}

function markdownToHtml(md: string): string {
  return md
    .replace(/^#{3}\s+(.+)$/gm, '<h3 style="font-size:14px;font-weight:700;margin:14px 0 6px">$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2 style="font-size:16px;font-weight:800;margin:18px 0 8px">$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1 style="font-size:20px;font-weight:900;margin:0 0 14px;text-align:center">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,   '<em>$1</em>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>')
    .replace(/\n\n/g, '</p><p style="margin:8px 0">')
}

// ─── Variáveis fixas para o painel lateral ───────────────────────────────────
const VARS_COLABORADOR = [
  { label: 'Nome Completo', value: 'Nome Completo' },
  { label: 'CPF', value: 'CPF' },
  { label: 'RG', value: 'RG' },
  { label: 'PIS/NIT', value: 'PIS/NIT' },
  { label: 'CTPS Nº', value: 'CTPS Nº' },
  { label: 'Série CTPS', value: 'Série CTPS' },
  { label: 'Data Admissão', value: 'Data Admissão' },
  { label: 'Salário', value: 'Salário' },
  { label: 'Endereço', value: 'Endereço' },
  { label: 'Cidade', value: 'Cidade' },
  { label: 'Estado Civil', value: 'Estado Civil' },
  { label: 'Nacionalidade', value: 'Nacionalidade' },
]
const VARS_FUNCAO = [
  { label: 'Função', value: 'Função' },
  { label: 'Sigla', value: 'Sigla da Função' },
  { label: 'CBO', value: 'CBO' },
  { label: 'Descrição', value: 'Descrição da Função' },
  { label: 'Hora CLT', value: 'Valor Hora CLT' },
]
const VARS_OBRA = [
  { label: 'Obra', value: 'Obra' },
  { label: 'Endereço da Obra', value: 'Endereço da Obra' },
  { label: 'Local de Trabalho', value: 'Local de Trabalho' },
]
const VARS_EMPRESA = [
  { label: 'Nome Empresa', value: 'Nome Empresa' },
  { label: 'CNPJ', value: 'CNPJ' },
  { label: 'Endereço Empresa', value: 'Endereço Empresa' },
]
const VARS_DATA = [
  { label: 'Dia', value: 'Dia' },
  { label: 'Mês', value: 'Mês' },
  { label: 'Ano', value: 'Ano' },
  { label: 'Cidade', value: 'CIDADE' },
]

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Contratos() {
  const editorRef = useRef<HTMLDivElement>(null)
  const { isAdmin } = useProfile()

  // listas
  const [modelos, setModelos]         = useState<Modelo[]>([])
  const [colaboradores, setColabs]    = useState<ColaboradorRow[]>([])
  const [funcoes, setFuncoes]         = useState<FuncaoRow[]>([])
  const [loading, setLoading]         = useState(true)

  // filtros / seleção
  const [busca, setBusca]             = useState('')
  const [catFiltro, setCatFiltro]     = useState('todos')
  const [modeloSel, setModeloSel]     = useState<Modelo | null>(null)
  const [colabSel, setColabSel]       = useState<ColaboradorRow | null>(null)
  const [buscaColab, setBuscaColab]   = useState('')

  // empresa
  const [empData, setEmpData]         = useState<EmpresaData>({ nome: '', razaoSocial: '', cnpj: '', endereco: '', cidade: '', cep: '', telefone: '', email: '', logoUrl: '' })

  // editor de modelo
  const [modalEditor, setModalEditor] = useState(false)
  const [editModelo, setEditModelo]   = useState<Partial<Modelo> | null>(null)
  const [saving, setSaving]           = useState(false)
  const [editorTab, setEditorTab]     = useState<'variaveis' | 'funcoes'>('variaveis')
  const [funcaoSel, setFuncaoSel]     = useState('')

  // aba banco de funções
  const [abaAtiva, setAbaAtiva]       = useState<'contratos' | 'funcoes'>('contratos')
  const [descricaoEdit, setDescricaoEdit] = useState<Record<string, string>>({})
  const [savingFunc, setSavingFunc]   = useState<string | null>(null)

  // modal Configurar Funções
  const [modalFuncoes, setModalFuncoes]       = useState(false)
  const [funcaoEditando, setFuncaoEditando]   = useState<FuncaoRow | null>(null)
  const [descricaoRascunho, setDescricaoRascunho] = useState('')
  const [salvandoFuncao, setSalvandoFuncao]   = useState(false)

  function abrirEdicaoFuncao(fn: FuncaoRow) {
    setFuncaoEditando(fn)
    setDescricaoRascunho(fn.descricao ?? '')
  }

  function fecharEdicaoFuncao() {
    setFuncaoEditando(null)
    setDescricaoRascunho('')
  }

  async function salvarEdicaoFuncao() {
    if (!funcaoEditando) return
    setSalvandoFuncao(true)
    const { error } = await supabase
      .from('funcoes')
      .update({ descricao: descricaoRascunho.trim() || null })
      .eq('id', funcaoEditando.id)
    setSalvandoFuncao(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    const novaDescricao = descricaoRascunho.trim() || null
    setFuncoes(prev => prev.map(f =>
      f.id === funcaoEditando.id ? { ...f, descricao: novaDescricao } : f
    ))
    toast.success(`✅ "${funcaoEditando.nome}" salva!`)
    fecharEdicaoFuncao()
  }

  // confirmação exclusão
  const [confirmDel, setConfirmDel]   = useState<Modelo | null>(null)

  // aba principal da página
  const [abaMain, setAbaMain]         = useState<'gerar' | 'modelos'>('gerar')
  const [painelModelosAberto, setPainelModelosAberto] = useState(false)

  // ── Geração em lote ──────────────────────────────────────────────────────
  const [modalLote, setModalLote]         = useState(false)
  const [loteSel, setLoteSel]             = useState<string[]>([])
  const [loteGerado, setLoteGerado]       = useState(false)
  const [gerando, setGerando]             = useState(false)
  const [buscaLote, setBuscaLote]         = useState('')
  const [filtroObraLote, setFiltroObraLote]   = useState('')
  const [filtroFuncaoLote, setFiltroFuncaoLote] = useState('')

  // ── Kit de documentos padrão ────────────────────────────────────────────
  const [modalKit, setModalKit]           = useState(false)   // modal visualizar/configurar kit
  const [gerandoKit, setGerandoKit]       = useState(false)
  const [kitGerado, setKitGerado]         = useState(false)

  // IDs dos modelos selecionados no kit padrão (persistido em localStorage)
  const [kitModelosIds, setKitModelosIds] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem('rh_kit_modelos')
      if (s) { const p = JSON.parse(s); if (Array.isArray(p)) return p }
    } catch {}
    return []
  })

  function salvarKitModelos(ids: string[]) {
    setKitModelosIds(ids)
    localStorage.setItem('rh_kit_modelos', JSON.stringify(ids))
  }

  // busca do painel esquerdo de colaboradores
  const [buscaColabEsq, setBuscaColabEsq] = useState('')
  const colabsEsqFiltrados = colaboradores.filter(c => {
    const q = buscaColabEsq.toLowerCase()
    return !q || c.nome.toLowerCase().includes(q) || (c.chapa ?? '').toLowerCase().includes(q)
  })

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [modRes, colRes, fnRes] = await Promise.all([
      supabase.from('contratos_modelos').select('*').eq('ativo', true).order('ordem'),
      supabase.from('colaboradores')
        .select('id,nome,chapa,cpf,rg,pis_nit,ctps_numero,ctps_serie,genero,estado_civil,funcao_id,obra_id,salario,tipo_contrato,data_admissao,endereco,cidade,estado,cep,telefone,email,funcoes(nome,sigla,descricao,cbo,valor_hora_clt,valor_hora_autonomo),obras(nome,codigo,endereco,cidade,estado)')
        .eq('status', 'ativo').order('nome'),
      supabase.from('funcoes').select('id,nome,sigla,descricao,cbo').eq('ativo', true).order('nome'),
    ])
    if (modRes.data) setModelos(modRes.data as Modelo[])
    if (colRes.data) setColabs(colRes.data as ColaboradorRow[])
    if (fnRes.data)  setFuncoes(fnRes.data as FuncaoRow[])
    try {
      const emp = await fetchEmpresaData()
      setEmpData(emp)
    } catch { /* silencioso */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── filtros ────────────────────────────────────────────────────────────────
  const modelosFiltrados = modelos.filter(m => {
    const matchCat = catFiltro === 'todos' || m.categoria === catFiltro
    const q = busca.toLowerCase()
    return matchCat && (!q || m.titulo.toLowerCase().includes(q) || (m.descricao ?? '').toLowerCase().includes(q))
  })

  const colabsFiltrados = colaboradores.filter(c => {
    const q = buscaColab.toLowerCase()
    return !q || c.nome.toLowerCase().includes(q) || (c.chapa ?? '').toLowerCase().includes(q)
  })

  // ── toolbar WYSIWYG ────────────────────────────────────────────────────────

  // execCommand genérico (bold, italic, underline, listas, alinhamento, etc.)
  function exec(cmd: string, value?: string) {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value ?? undefined)
  }

  // Retorna o bloco pai mais próximo (filho direto do editor) do nó atual
  function getBlockEl(): HTMLElement | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    let node: Node | null = sel.getRangeAt(0).startContainer
    while (node && node.nodeType !== 1) node = node.parentNode
    let el = node as HTMLElement | null
    while (el && el.parentElement !== editorRef.current) el = el.parentElement
    return el
  }

  // Aplicar tamanho de fonte em pt via span inline (evita a escala 1-7 do execCommand fontSize)
  function applyFontSize(pt: number) {
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    if (sel.isCollapsed) {
      // Sem seleção: aplica no bloco inteiro
      const block = getBlockEl()
      if (block) { block.style.fontSize = `${pt}pt`; return }
    }
    // Com seleção: envolve em <span style="font-size:Xpt">
    const range = sel.getRangeAt(0)
    const span = document.createElement('span')
    span.style.fontSize = `${pt}pt`
    try {
      range.surroundContents(span)
    } catch {
      // Se a seleção cruza elementos, usa extractContents
      const frag = range.extractContents()
      span.appendChild(frag)
      range.insertNode(span)
    }
    sel.removeAllRanges()
    const newRange = document.createRange()
    newRange.selectNodeContents(span)
    sel.addRange(newRange)
  }

  // Aplicar fonte via span inline
  function applyFontFamily(family: string) {
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    if (sel.isCollapsed) {
      const block = getBlockEl()
      if (block) { block.style.fontFamily = family; return }
    }
    const range = sel.getRangeAt(0)
    const span = document.createElement('span')
    span.style.fontFamily = family
    try {
      range.surroundContents(span)
    } catch {
      const frag = range.extractContents()
      span.appendChild(frag)
      range.insertNode(span)
    }
  }

  // Aplicar estilo de bloco (h1, h2, h3, h4, p, blockquote)
  function applyBlockStyle(tag: string) {
    const bs = BLOCK_STYLES.find(b => b.value === tag)
    if (!bs) return
    editorRef.current?.focus()
    document.execCommand('formatBlock', false, tag)
    // Aplica o style inline robustamente
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) { editorRef.current?.focus(); return }
      let node: Node | null = sel.getRangeAt(0).startContainer
      while (node && node.nodeType !== 1) node = node.parentNode
      let el = node as HTMLElement | null
      // Tenta closest() primeiro; se não, sobe manualmente
      const found = el?.closest(tag) as HTMLElement | null
      const target = found ?? (() => {
        let cur = el
        while (cur && cur.tagName?.toLowerCase() !== tag) cur = cur.parentElement
        return cur
      })()
      if (target && target !== editorRef.current) {
        target.setAttribute('style', bs.css)
        // Remove font-size herdado de spans filhos para evitar conflito
        target.querySelectorAll('[style*="font-size"]').forEach(c => {
          (c as HTMLElement).style.removeProperty('font-size')
        })
      }
      editorRef.current?.focus()
    }, 10)
  }

  // Aplicar line-height ao bloco atual
  function applyLineHeight(lh: string) {
    editorRef.current?.focus()
    const block = getBlockEl()
    if (block) block.style.lineHeight = lh
  }

  function inserirVariavel(texto: string) {
    editorRef.current?.focus()
    document.execCommand('insertText', false, `{{${texto}}}`)
  }

  function inserirFuncao() {
    if (!funcaoSel) return
    const fn = funcoes.find(f => f.id === funcaoSel)
    if (!fn) return
    editorRef.current?.focus()
    const bloco = `\n**${fn.nome}**${fn.descricao ? '\n' + fn.descricao : ''}\n`
    document.execCommand('insertText', false, bloco)
    setFuncaoSel('')
  }

  function getConteudo() {
    return editorRef.current?.innerHTML ?? ''
  }

  // ── abrir editor ───────────────────────────────────────────────────────────
  function abrirEditor(modelo?: Modelo) {
    const m: Partial<Modelo> = modelo
      ? { ...modelo }
      : { titulo: '', categoria: 'outro', conteudo: '', descricao: '' }
    setEditModelo(m)
    setModalEditor(true)
    // Carrega conteúdo no editor depois do render
    setTimeout(() => {
      if (!editorRef.current) return
      let html = m.conteudo ?? ''
      // Backward compat: Markdown → HTML
      if (html.trimStart().startsWith('#') || (!html.includes('<') && html.includes('\n'))) {
        html = markdownToHtml(html)
      }
      editorRef.current.innerHTML = html
    }, 50)
  }

  // ── salvar modelo ──────────────────────────────────────────────────────────
  async function salvarModelo() {
    if (!editModelo?.titulo?.trim()) { toast.error('Título obrigatório'); return }
    const html = getConteudo().trim()
    if (!html) { toast.error('Conteúdo obrigatório'); return }
    setSaving(true)
    const payload = {
      titulo:     editModelo.titulo.trim(),
      categoria:  editModelo.categoria ?? 'outro',
      conteudo:   html,
      descricao:  editModelo.descricao ?? null,
      ativo:      true,
      updated_at: new Date().toISOString(),
    }
    const { error } = editModelo.id
      ? await supabase.from('contratos_modelos').update(payload).eq('id', editModelo.id)
      : await supabase.from('contratos_modelos').insert({ ...payload, ordem: modelos.length + 1 })
    if (error) toast.error('Erro ao salvar: ' + error.message)
    else {
      toast.success(editModelo.id ? 'Modelo atualizado!' : 'Modelo criado!')
      setModalEditor(false)
      setEditModelo(null)
      fetchAll()
    }
    setSaving(false)
  }

  // ── excluir modelo ─────────────────────────────────────────────────────────
  async function excluirModelo(m: Modelo) {
    const { error } = await supabase.from('contratos_modelos').update({ ativo: false }).eq('id', m.id)
    if (error) toast.error('Erro ao excluir')
    else {
      toast.success('Modelo removido')
      setConfirmDel(null)
      if (modeloSel?.id === m.id) setModeloSel(null)
      fetchAll()
    }
  }

  // ── gerar Kit Padrão (1 colaborador, N modelos) ──────────────────────────
  async function gerarKitPadrao() {
    if (!colabSel || kitModelosIds.length === 0) return
    const kitModelos = modelos.filter(m => kitModelosIds.includes(m.id))
    if (kitModelos.length === 0) { toast.warning('Nenhum modelo válido no kit'); return }
    setGerandoKit(true)

    const dataGer  = new Date().toLocaleDateString('pt-BR')
    let logoBlock  = `<div class="logo-fallback">🏗️</div>`
    if (empData.logoUrl)
      logoBlock = `<img src="${empData.logoUrl}" class="logo" alt="Logo" onerror="this.style.display='none'" />`

    const paginaHtml = (m: Modelo, idx: number) => {
      const cat    = CATEGORIAS[m.categoria] ?? CATEGORIAS.outro
      const varMap = buildVarMap(colabSel, empData)
      let html = m.conteudo
      if (html.trimStart().startsWith('#') || (!html.includes('<') && html.includes('\n')))
        html = markdownToHtml(html)
      html = aplicarVariaveis(html, varMap)
      const isLast = idx === kitModelos.length - 1
      return `
<div class="folha${isLast ? ' ultima' : ''}">
  <div class="timbre">
    ${logoBlock}
    <div>
      <div class="emp-nome">${empData.nome || 'EMPRESA'}</div>
      <div class="emp-det">${empData.cnpj ? 'CNPJ: ' + empData.cnpj : ''}${empData.cnpj && empData.endereco ? ' &nbsp;|&nbsp; ' : ''}${empData.endereco}${empData.cidade ? ' &nbsp;|&nbsp; ' + empData.cidade : ''}</div>
    </div>
  </div>
  <div class="linha-dupla"></div>
  <div class="corpo">
    <div class="doc-meta">
      <div>
        <span class="badge" style="background:${cat.bg};color:${cat.cor}">${cat.emoji} ${cat.label}</span>
        <span class="kit-badge">📋 Kit Padrão · Doc ${idx + 1}/${kitModelos.length}</span>
      </div>
      <div class="meta-right">
        Emitido em ${dataGer}<br/>
        <strong>${colabSel.nome}</strong>${colabSel.chapa ? ' · ' + colabSel.chapa : ''}
      </div>
    </div>
    <div class="conteudo">${html}</div>
    <div class="assinaturas">
      <div class="ass">${empData.nome || 'Empresa'}<br/><span>Representante Legal</span></div>
      <div class="ass">${colabSel.nome}<br/><span>${(colabSel.funcoes as any)?.nome ?? 'Colaborador(a)'}</span></div>
    </div>
  </div>
  <div class="rodape">
    ${m.titulo} &nbsp;·&nbsp; ${colabSel.nome} &nbsp;·&nbsp; ${dataGer}
  </div>
</div>`
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Kit Padrão — ${colabSel.nome}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html,body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #1a1a1a; }
  .folha {
    width: 100%; min-height: 246mm;
    page-break-after: always; break-after: page;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .folha.ultima { page-break-after: avoid; break-after: avoid; }
  .timbre { background:#1e3a5f; color:#fff; padding:12px 18px; display:flex; align-items:center; gap:14px; flex-shrink:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .logo { height:52px; max-width:160px; object-fit:contain; filter:brightness(0) invert(1); border-radius:3px; }
  .logo-fallback { width:44px; height:44px; background:rgba(255,255,255,.15); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0; }
  .emp-nome { font-size:15pt; font-weight:900; letter-spacing:.04em; line-height:1.2; }
  .emp-det  { font-size:8.5pt; color:#93c5fd; margin-top:3px; }
  .linha-dupla { border-top:3pt solid #1e3a5f; border-bottom:1pt solid #93c5fd; flex-shrink:0; }
  .corpo { flex:1; padding:14pt 0 0; display:flex; flex-direction:column; }
  .doc-meta { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12pt; gap:8pt; }
  .meta-right { font-size:9pt; color:#555; text-align:right; line-height:1.5; }
  .badge { border-radius:20px; padding:2px 10px; font-size:8.5pt; font-weight:700; display:inline-block; }
  .kit-badge { display:inline-block; background:#fef3c7; color:#b45309; border-radius:20px; padding:2px 10px; font-size:8pt; font-weight:700; margin-left:6pt; }
  .conteudo { flex:1; }
  .conteudo h1 { font-size:15pt; font-weight:900; text-align:center; margin:0 0 12pt; text-transform:uppercase; letter-spacing:.04em; line-height:1.3; }
  .conteudo h2 { font-size:12pt; font-weight:800; margin:12pt 0 5pt; text-transform:uppercase; border-bottom:1.5pt solid #334155; padding-bottom:3pt; line-height:1.3; }
  .conteudo h3 { font-size:11pt; font-weight:700; margin:9pt 0 4pt; }
  .conteudo h4 { font-size:10pt; font-weight:700; font-style:italic; margin:7pt 0 3pt; }
  .conteudo p  { font-size:11pt; margin:5pt 0; line-height:1.7; text-align:justify; orphans:3; widows:3; }
  .conteudo li { font-size:11pt; line-height:1.7; text-align:justify; margin-bottom:3pt; }
  .conteudo strong,.conteudo b { font-weight:700; }
  .conteudo blockquote { font-size:10.5pt; margin:7pt 0; border-left:2.5pt solid #94a3b8; padding-left:10pt; color:#475569; font-style:italic; line-height:1.6; }
  .conteudo table { width:100%; border-collapse:collapse; margin:7pt 0; font-size:9.5pt; }
  .conteudo td,.conteudo th { border:0.5pt solid #d1d5db; padding:4pt 6pt; }
  .conteudo th { background:#f8fafc; font-weight:700; }
  .assinaturas { display:grid; grid-template-columns:1fr 1fr; gap:28pt; margin-top:24pt; flex-shrink:0; page-break-inside:avoid; }
  .ass { border-top:1pt solid #0f172a; padding-top:6pt; font-size:10pt; font-weight:700; text-align:center; line-height:1.5; }
  .ass span { font-size:8.5pt; font-weight:400; color:#555; }
  .rodape { font-size:7.5pt; color:#aaa; text-align:center; border-top:0.5pt solid #e5e7eb; padding-top:5pt; margin-top:10pt; flex-shrink:0; }
  @media screen {
    body { background:#3c3f41; padding:24px; }
    .folha { background:#fff; padding:12mm 14mm; margin:0 auto 24px; max-width:210mm; box-shadow:0 2px 16px rgba(0,0,0,.4),0 8px 32px rgba(0,0,0,.25); }
    .btn-imprimir { position:fixed; bottom:20px; right:20px; background:#b45309; color:#fff; border:none; border-radius:9px; padding:11px 22px; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.25); z-index:9999; font-family:Calibri,Arial,sans-serif; }
    .btn-imprimir:hover { background:#92400e; }
  }
  @media print {
    body { background:#fff; padding:0; }
    .folha { margin:0; padding:0; box-shadow:none; }
    .btn-imprimir { display:none!important; }
    h1,h2,h3,h4 { page-break-after:avoid; }
  }
</style>
</head>
<body>
${kitModelos.map((m, i) => paginaHtml(m, i)).join('')}
<button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir Kit (${kitModelos.length} docs)</button>
<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script>
</body></html>`

    // Registrar no banco
    for (const m of kitModelos) {
      const varMap = buildVarMap(colabSel, empData)
      let html = m.conteudo
      if (html.trimStart().startsWith('#') || (!html.includes('<') && html.includes('\n')))
        html = markdownToHtml(html)
      await supabase.from('contratos_gerados').insert({
        modelo_id: m.id, colaborador_id: colabSel.id,
        titulo_gerado: `[Kit] ${m.titulo} — ${colabSel.nome}`,
        conteudo_final: aplicarVariaveis(html, varMap),
      }).then(() => {})
    }

    const win = window.open('', '_blank', 'width=960,height=800')
    if (win) { win.document.write(fullHtml); win.document.close() }
    else toast.error('Bloqueio de pop-up — libere pop-ups para este site.')
    setGerandoKit(false)
    setKitGerado(true)
    setTimeout(() => setKitGerado(false), 3000)
    toast.success(`Kit com ${kitModelos.length} documento(s) gerado para ${colabSel.nome}!`)
  }

  // ── geração em lote ───────────────────────────────────────────────────────
  async function gerarLote() {
    if (!modeloSel || loteSel.length === 0) return
    setGerando(true)

    const colabsLote = colaboradores.filter(c => loteSel.includes(c.id))
    const cat        = CATEGORIAS[modeloSel.categoria] ?? CATEGORIAS.outro
    const dataGer    = new Date().toLocaleDateString('pt-BR')

    let logoBlock = `<div class="logo-fallback">🏗️</div>`
    if (empData.logoUrl) {
      logoBlock = `<img src="${empData.logoUrl}" class="logo" alt="Logo" onerror="this.style.display='none'" />`
    }

    const paginaHtml = (c: ColaboradorRow, idx: number) => {
      const varMap = buildVarMap(c, empData)
      let html = modeloSel.conteudo
      if (html.trimStart().startsWith('#') || (!html.includes('<') && html.includes('\n')))
        html = markdownToHtml(html)
      html = aplicarVariaveis(html, varMap)
      const isLast = idx === colabsLote.length - 1
      return `
<div class="folha${isLast ? ' ultima' : ''}">
  <div class="timbre">
    ${logoBlock}
    <div>
      <div class="emp-nome">${empData.nome || 'EMPRESA'}</div>
      <div class="emp-det">${empData.cnpj ? 'CNPJ: ' + empData.cnpj : ''}${empData.cnpj && empData.endereco ? ' &nbsp;|&nbsp; ' : ''}${empData.endereco}${empData.cidade ? ' &nbsp;|&nbsp; ' + empData.cidade : ''}</div>
    </div>
  </div>
  <div class="linha-dupla"></div>
  <div class="corpo">
    <div class="doc-meta">
      <span class="badge">${cat.emoji} ${cat.label}</span>
      <div class="meta-right">
        Emitido em ${dataGer}<br/>
        <strong>${c.nome}</strong>${c.chapa ? ' · ' + c.chapa : ''}<br/>
        <span style="font-size:8pt;color:#888;">Via ${idx + 1} de ${colabsLote.length}</span>
      </div>
    </div>
    <div class="conteudo">${html}</div>
    <div class="assinaturas">
      <div class="ass">${empData.nome || 'Empresa'}<br/><span>Representante Legal</span></div>
      <div class="ass">${c.nome}<br/><span>${(c.funcoes as any)?.nome ?? 'Colaborador(a)'}</span></div>
    </div>
  </div>
  <div class="rodape">
    ${modeloSel.titulo} &nbsp;·&nbsp; ${c.nome} &nbsp;·&nbsp; ${dataGer}
  </div>
</div>`
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>${modeloSel.titulo} — ${colabsLote.length} via(s)</title>
<style>
  @page { size: A4 portrait; margin: 12mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html,body { font-family: Calibri, Arial, sans-serif; font-size: 12pt; color: #1a1a1a; }
  /* Cada .folha = 1 página A4 impressa */
  .folha {
    width: 100%;
    min-height: 246mm;        /* 297 - 12*2 = 273; 273 - 27mm content padding ≈ 246 */
    page-break-after: always;
    break-after: page;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .folha.ultima {
    page-break-after: avoid;
    break-after: avoid;
  }
  /* Timbre */
  .timbre { background:#1e3a5f; color:#fff; padding:12px 18px; display:flex; align-items:center; gap:14px; flex-shrink:0; }
  .logo { height:52px; max-width:160px; object-fit:contain; filter:brightness(0) invert(1); border-radius:3px; }
  .logo-fallback { width:44px; height:44px; background:rgba(255,255,255,.15); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:22px; flex-shrink:0; }
  .emp-nome { font-size:15pt; font-weight:900; letter-spacing:.04em; line-height:1.2; }
  .emp-det  { font-size:8.5pt; color:#93c5fd; margin-top:3px; }
  .linha-dupla { border-top:3pt solid #1e3a5f; border-bottom:1pt solid #93c5fd; flex-shrink:0; }
  /* Corpo */
  .corpo { flex:1; padding:16px 0 0; display:flex; flex-direction:column; }
  .doc-meta { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14pt; }
  .meta-right { font-size:9pt; color:#555; text-align:right; line-height:1.5; }
  .badge { background:${cat.bg}; color:${cat.cor}; border-radius:20px; padding:2px 10px; font-size:8.5pt; font-weight:700; display:inline-block; }
  /* Conteúdo do documento */
  .conteudo { flex:1; }
  .conteudo h1 { font-size:15pt; font-weight:900; text-align:center; margin:0 0 14pt; text-transform:uppercase; letter-spacing:.04em; line-height:1.3; }
  .conteudo h2 { font-size:12pt; font-weight:800; margin:14pt 0 6pt; text-transform:uppercase; border-bottom:1.5pt solid #334155; padding-bottom:3pt; line-height:1.3; }
  .conteudo h3 { font-size:11pt; font-weight:700; margin:10pt 0 4pt; }
  .conteudo h4 { font-size:10pt; font-weight:700; font-style:italic; margin:8pt 0 3pt; }
  .conteudo p  { font-size:11pt; margin:6pt 0; line-height:1.7; text-align:justify; }
  .conteudo li { font-size:11pt; line-height:1.7; text-align:justify; margin-bottom:3pt; }
  .conteudo strong, .conteudo b { font-weight:700; }
  .conteudo blockquote { font-size:10.5pt; margin:8pt 0; border-left:2.5pt solid #94a3b8; padding-left:10pt; color:#475569; font-style:italic; line-height:1.6; }
  .conteudo table { width:100%; border-collapse:collapse; margin:8pt 0; font-size:9.5pt; }
  .conteudo td, .conteudo th { border:0.5pt solid #d1d5db; padding:4pt 6pt; }
  .conteudo th { background:#f8fafc; font-weight:700; }
  /* Assinaturas */
  .assinaturas { display:grid; grid-template-columns:1fr 1fr; gap:28pt; margin-top:28pt; flex-shrink:0; }
  .ass { border-top:1pt solid #0f172a; padding-top:6pt; font-size:10pt; font-weight:700; text-align:center; line-height:1.5; }
  .ass span { font-size:8.5pt; font-weight:400; color:#555; }
  /* Rodapé */
  .rodape { font-size:7.5pt; color:#aaa; text-align:center; border-top:0.5pt solid #e5e7eb; padding-top:5pt; margin-top:10pt; flex-shrink:0; }
  /* Separadores visuais somente na tela */
  @media screen {
    body { background:#3c3f41; padding:24px; }
    .folha { background:#fff; padding:12mm 14mm; margin:0 auto 24px; max-width:210mm; box-shadow:0 2px 16px rgba(0,0,0,.4), 0 8px 32px rgba(0,0,0,.25); }
    .btn-imprimir { position:fixed; bottom:20px; right:20px; background:#1d4ed8; color:#fff; border:none; border-radius:9px; padding:11px 22px; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.25); z-index:9999; font-family:Calibri,Arial,sans-serif; }
    .btn-imprimir:hover { background:#1e40af; }
  }
  @media print {
    body { background:#fff; padding:0; }
    .folha { margin:0; padding:0; box-shadow:none; }
    .btn-imprimir { display:none!important; }
    p { orphans:3; widows:3; }
    h1,h2,h3,h4 { page-break-after:avoid; }
  }
</style>
</head>
<body>
${colabsLote.map((c, i) => paginaHtml(c, i)).join('')}
<button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script>
</body></html>`

    // Salvar no banco
    for (const c of colabsLote) {
      const varMap = buildVarMap(c, empData)
      let html = modeloSel.conteudo
      if (html.trimStart().startsWith('#') || (!html.includes('<') && html.includes('\n')))
        html = markdownToHtml(html)
      await supabase.from('contratos_gerados').insert({
        modelo_id: modeloSel.id,
        colaborador_id: c.id,
        titulo_gerado: `${modeloSel.titulo} — ${c.nome}`,
        conteudo_final: aplicarVariaveis(html, varMap),
      }).then(() => {})
    }

    const win = window.open('', '_blank', 'width=960,height=800')
    if (win) {
      win.document.write(fullHtml)
      win.document.close()
    } else {
      toast.error('Bloqueio de pop-up — libere pop-ups para este site.')
    }
    setGerando(false)
    setLoteGerado(true)
    setTimeout(() => { setLoteGerado(false); setModalLote(false) }, 2000)
    toast.success(`${colabsLote.length} via(s) gerada(s) com sucesso!`)
  }

  // ── salvar descrição de função ─────────────────────────────────────────────
  async function salvarDescricaoFuncao(id: string) {
    setSavingFunc(id)
    const { error } = await supabase.from('funcoes').update({ descricao: descricaoEdit[id] ?? '' }).eq('id', id)
    if (error) toast.error('Erro ao salvar')
    else {
      toast.success('Descrição salva!')
      setFuncoes(prev => prev.map(f => f.id === id ? { ...f, descricao: descricaoEdit[id] ?? f.descricao } : f))
    }
    setSavingFunc(null)
  }

  // ── preview em nova janela ─────────────────────────────────────────────────
  function abrirPreview() {
    if (!modeloSel) return
    const varMap = buildVarMap(colabSel, empData)
    let htmlConteudo = modeloSel.conteudo
    if (htmlConteudo.trimStart().startsWith('#') || (!htmlConteudo.includes('<') && htmlConteudo.includes('\n'))) {
      htmlConteudo = markdownToHtml(htmlConteudo)
    }
    htmlConteudo = aplicarVariaveis(htmlConteudo, varMap)
    const cat = CATEGORIAS[modeloSel.categoria] ?? CATEGORIAS.outro

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Preview — ${modeloSel.titulo}</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { background:#f0f4f8; font-family:'Times New Roman',Georgia,serif; }
.page { max-width:700px; margin:30px auto; background:#fff; border-radius:8px; padding:40px 44px; box-shadow:0 2px 20px rgba(0,0,0,.12); font-size:12px; line-height:1.8; color:#1a1a1a; }
.badge { display:inline-block; background:${cat.bg}; color:${cat.cor}; border-radius:20px; padding:2px 10px; font-size:10px; font-weight:700; margin-bottom:12px; }
h1 { font-size:18pt; font-weight:900; text-align:center; margin:0 0 12px; text-transform:uppercase; letter-spacing:.04em; line-height:1.3; }
h2 { font-size:14pt; font-weight:800; margin:16px 0 6px; text-transform:uppercase; border-bottom:1.5px solid #334155; padding-bottom:3px; line-height:1.3; }
h3 { font-size:12pt; font-weight:700; margin:12px 0 4px; line-height:1.4; }
h4 { font-size:11pt; font-weight:700; margin:10px 0 3px; font-style:italic; line-height:1.4; }
blockquote { font-size:11pt; margin:10px 0; border-left:3px solid #94a3b8; padding-left:12px; color:#475569; font-style:italic; line-height:1.6; }
p  { font-size:12pt; margin:8px 0; line-height:1.6; }
table { width:100%; border-collapse:collapse; margin:10px 0; font-size:11px; }
table td,table th { border:1px solid #d1d5db; padding:5px 8px; }
table th { background:#f8fafc; font-weight:700; }
</style></head><body>
<div class="page">
  <div class="badge">${cat.emoji} ${cat.label}</div>
  <div>${htmlConteudo}</div>
</div>
</body></html>`

    const win = window.open('', '_blank', 'width=900,height=750')
    if (win) { win.document.write(html); win.document.close() }
    else toast.error('Bloqueio de pop-up detectado — libere pop-ups para este site.')
  }

  // ── gerar PDF com papel timbrado (1 colaborador) ─────────────────────────
  async function gerarPDF() {
    if (!modeloSel) return
    const varMap = buildVarMap(colabSel, empData)
    let htmlConteudo = modeloSel.conteudo
    if (htmlConteudo.trimStart().startsWith('#') || (!htmlConteudo.includes('<') && htmlConteudo.includes('\n')))
      htmlConteudo = markdownToHtml(htmlConteudo)
    htmlConteudo = aplicarVariaveis(htmlConteudo, varMap)
    const cat     = CATEGORIAS[modeloSel.categoria] ?? CATEGORIAS.outro
    const dataGer = new Date().toLocaleDateString('pt-BR')

    if (colabSel) {
      await supabase.from('contratos_gerados').insert({
        modelo_id: modeloSel.id, colaborador_id: colabSel.id,
        titulo_gerado: `${modeloSel.titulo} — ${colabSel.nome}`,
        conteudo_final: htmlConteudo,
      })
    }

    let logoBlock = `<div class="logo-fallback">🏗️</div>`
    if (empData.logoUrl)
      logoBlock = `<img src="${empData.logoUrl}" class="logo" alt="Logo" onerror="this.style.display='none'" />`

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>${modeloSel.titulo}${colabSel ? ' — ' + colabSel.nome : ''}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 14mm; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { font-family:Calibri,Arial,sans-serif; font-size:12pt; color:#1a1a1a; }
  /* Folha única */
  .folha {
    width:100%;
    min-height:246mm;
    display:flex;
    flex-direction:column;
    overflow:hidden;
  }
  /* Timbre */
  .timbre { background:#1e3a5f; color:#fff; padding:13px 18px; display:flex; align-items:center; gap:14px; flex-shrink:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .logo { height:54px; max-width:170px; object-fit:contain; filter:brightness(0) invert(1); border-radius:3px; }
  .logo-fallback { width:46px; height:46px; background:rgba(255,255,255,.15); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:24px; flex-shrink:0; }
  .emp-nome { font-size:16pt; font-weight:900; letter-spacing:.04em; line-height:1.2; }
  .emp-det  { font-size:8.5pt; color:#93c5fd; margin-top:3px; }
  .linha-dupla { border-top:3pt solid #1e3a5f; border-bottom:1pt solid #93c5fd; flex-shrink:0; }
  /* Corpo */
  .corpo { flex:1; padding:14pt 0 0; display:flex; flex-direction:column; }
  .doc-meta { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14pt; }
  .meta-right { font-size:9pt; color:#555; text-align:right; line-height:1.5; }
  .badge { background:${cat.bg}; color:${cat.cor}; border-radius:20px; padding:2px 10px; font-size:8.5pt; font-weight:700; display:inline-block; }
  /* Marca d'água */
  .watermark { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-45deg); font-size:70pt; color:rgba(30,58,95,.04); font-weight:900; pointer-events:none; z-index:0; white-space:nowrap; letter-spacing:.1em; }
  /* Conteúdo */
  .conteudo { flex:1; }
  .conteudo h1 { font-size:15pt; font-weight:900; text-align:center; margin:0 0 14pt; text-transform:uppercase; letter-spacing:.04em; line-height:1.3; }
  .conteudo h2 { font-size:12pt; font-weight:800; margin:14pt 0 6pt; text-transform:uppercase; border-bottom:1.5pt solid #334155; padding-bottom:3pt; line-height:1.3; }
  .conteudo h3 { font-size:11pt; font-weight:700; margin:10pt 0 4pt; }
  .conteudo h4 { font-size:10pt; font-weight:700; font-style:italic; margin:8pt 0 3pt; }
  .conteudo p  { font-size:11pt; margin:6pt 0; line-height:1.7; text-align:justify; orphans:3; widows:3; }
  .conteudo li { font-size:11pt; line-height:1.7; text-align:justify; margin-bottom:3pt; }
  .conteudo strong,.conteudo b { font-weight:700; }
  .conteudo blockquote { font-size:10.5pt; margin:8pt 0; border-left:2.5pt solid #94a3b8; padding-left:10pt; color:#475569; font-style:italic; line-height:1.6; }
  .conteudo table { width:100%; border-collapse:collapse; margin:8pt 0; font-size:9.5pt; }
  .conteudo td,.conteudo th { border:0.5pt solid #d1d5db; padding:4pt 6pt; }
  .conteudo th { background:#f8fafc; font-weight:700; }
  /* Assinaturas */
  .assinaturas { display:grid; grid-template-columns:1fr 1fr; gap:28pt; margin-top:28pt; flex-shrink:0; page-break-inside:avoid; }
  .ass { border-top:1pt solid #0f172a; padding-top:6pt; font-size:10pt; font-weight:700; text-align:center; line-height:1.5; }
  .ass span { font-size:8.5pt; font-weight:400; color:#555; }
  /* Rodapé */
  .rodape { font-size:7.5pt; color:#aaa; text-align:center; border-top:0.5pt solid #e5e7eb; padding-top:5pt; margin-top:10pt; flex-shrink:0; }
  /* Tela */
  @media screen {
    body { background:#3c3f41; padding:24px; }
    .folha { background:#fff; padding:12mm 14mm; margin:0 auto; max-width:210mm; box-shadow:0 2px 16px rgba(0,0,0,.4),0 8px 32px rgba(0,0,0,.25); }
    .btn-imprimir { position:fixed; bottom:20px; right:20px; background:#1d4ed8; color:#fff; border:none; border-radius:9px; padding:11px 22px; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.25); z-index:9999; font-family:Calibri,Arial,sans-serif; }
    .btn-imprimir:hover { background:#1e40af; }
  }
  @media print {
    body { background:#fff; padding:0; }
    .folha { margin:0; padding:0; box-shadow:none; }
    .btn-imprimir { display:none!important; }
    h1,h2,h3,h4 { page-break-after:avoid; }
  }
</style>
</head>
<body>
<div class="watermark">${empData.nome || 'EMPRESA'}</div>
<div class="folha">
  <div class="timbre">
    ${logoBlock}
    <div>
      <div class="emp-nome">${empData.nome || 'EMPRESA'}</div>
      <div class="emp-det">${empData.cnpj ? 'CNPJ: ' + empData.cnpj : ''}${empData.cnpj && empData.endereco ? ' &nbsp;|&nbsp; ' : ''}${empData.endereco}${empData.cidade ? ' &nbsp;|&nbsp; ' + empData.cidade : ''}</div>
    </div>
  </div>
  <div class="linha-dupla"></div>
  <div class="corpo">
    <div class="doc-meta">
      <span class="badge">${cat.emoji} ${cat.label}</span>
      <div class="meta-right">
        Emitido em ${dataGer}${colabSel ? '<br/><strong>' + colabSel.nome + '</strong>' + (colabSel.chapa ? ' · ' + colabSel.chapa : '') : ''}
      </div>
    </div>
    <div class="conteudo">${htmlConteudo}</div>
    <div class="assinaturas">
      <div class="ass">${empData.nome || 'Empresa'}<br/><span>Representante Legal</span></div>
      ${colabSel
        ? `<div class="ass">${colabSel.nome}<br/><span>${(colabSel.funcoes as any)?.nome ?? 'Colaborador(a)'}</span></div>`
        : '<div class="ass">Colaborador(a)<br/><span>Assinatura</span></div>'}
    </div>
  </div>
  <div class="rodape">${modeloSel.titulo}${colabSel ? ' &nbsp;·&nbsp; ' + colabSel.nome : ''} &nbsp;·&nbsp; ${dataGer}</div>
</div>
<button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
</body></html>`

    const win = window.open('', '_blank', 'width=960,height=800')
    if (win) { win.document.write(html); win.document.close() }
    else toast.error('Bloqueio de pop-up detectado — libere pop-ups para este site.')
  }

  // ── preview inline (col 3) ────────────────────────────────────────────────
  const previewHtml = modeloSel ? (() => {
    let html = modeloSel.conteudo
    if (html.trimStart().startsWith('#') || (!html.includes('<') && html.includes('\n'))) {
      html = markdownToHtml(html)
    }
    return aplicarVariaveis(html, buildVarMap(colabSel, empData))
  })() : ''


  // ─────────────────────────────────────────────────────────────────────────
  // ── RENDER ───────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 57px)', overflow: 'hidden', background: 'var(--background)' }}>

      {/* ══ BARRA DE ABAS PRINCIPAL ══════════════════════════════════════════ */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0, gap: 0 }}>
        {/* Abas */}
        <button onClick={() => setAbaMain('gerar')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: abaMain === 'gerar' ? 700 : 500, color: abaMain === 'gerar' ? 'hsl(var(--primary))' : 'var(--muted-foreground)', borderBottom: abaMain === 'gerar' ? '2px solid hsl(var(--primary))' : '2px solid transparent', marginBottom: -1 }}>
          📄 Gerar Documento
        </button>
        {isAdmin && (
          <button onClick={() => setAbaMain('modelos')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: abaMain === 'modelos' ? 700 : 500, color: abaMain === 'modelos' ? 'hsl(var(--primary))' : 'var(--muted-foreground)', borderBottom: abaMain === 'modelos' ? '2px solid hsl(var(--primary))' : '2px solid transparent', marginBottom: -1 }}>
            🗂️ Modelos <span style={{ fontSize: 10, background: '#fef3c7', color: '#b45309', borderRadius: 4, padding: '1px 6px', fontWeight: 700, marginLeft: 4 }}>Admin</span>
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
          {abaMain === 'gerar' && (
            <button
              onClick={() => setPainelModelosAberto(s => !s)}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:7,
                border: painelModelosAberto ? '1.5px solid #1e3a5f' : '1px solid var(--border)',
                background: painelModelosAberto ? '#eff6ff' : 'var(--card)',
                color: painelModelosAberto ? '#1e3a5f' : 'var(--muted-foreground)',
                fontSize:12, fontWeight:700, cursor:'pointer' }}>
              <FileText size={13}/> {painelModelosAberto ? '✕ Fechar lista' : '📋 Ver modelos'}
            </button>
          )}
          {isAdmin && abaMain === 'modelos' && (
            <>
              <button onClick={() => setModalFuncoes(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1.5px solid #7c3aed', background: '#ede9fe', color: '#7c3aed', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <Settings size={13} /> Configurar Funções
              </button>
              <button onClick={() => abrirEditor()}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '2px solid #059669', background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                <Plus size={13} /> Novo Modelo
              </button>
            </>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
            {modelos.length} modelo(s) · {colaboradores.length} colaborador(es)
          </div>
        </div>
      </div>

      {/* ══ ABA: GERAR DOCUMENTO ════════════════════════════════════════════ */}
      {abaMain === 'gerar' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

          {/* ── PAINEL ESQUERDO: Colaboradores (estilo Ponto) ── */}
          <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Cabeçalho escuro */}
            <div style={{ padding: '12px 12px 8px', background: '#1e3a5f', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                👤 Selecionar Colaborador
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  value={buscaColabEsq}
                  onChange={e => setBuscaColabEsq(e.target.value)}
                  placeholder="Nome ou chapa…"
                  style={{ width: '100%', height: 33, border: '1px solid #334155', borderRadius: 7, paddingLeft: 28, paddingRight: 8, fontSize: 12, background: '#0f172a', color: '#fff', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>
                {colabSel
                  ? <span style={{ color: '#86efac', fontWeight: 700 }}>✓ {colabSel.nome}</span>
                  : `${colabsEsqFiltrados.length} colaborador(es)`
                }
              </div>
            </div>

            {/* Lista colaboradores */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Carregando…</div>
              ) : colabsEsqFiltrados.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Nenhum colaborador</div>
              ) : colabsEsqFiltrados.map(c => {
                const sel = colabSel?.id === c.id
                return (
                  <div
                    key={c.id}
                    onClick={() => setColabSel(sel ? null : c)}
                    style={{
                      padding: '10px 12px', cursor: 'pointer',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                      background: sel ? 'hsl(var(--primary)/.10)' : 'transparent',
                      borderLeft: `3px solid ${sel ? 'hsl(var(--primary))' : 'transparent'}`,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: sel ? 700 : 500, fontSize: 13, color: sel ? 'hsl(var(--primary))' : 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 1 }}>
                        {c.chapa} {(c.funcoes as any)?.nome ? `· ${(c.funcoes as any).nome}` : ''}
                      </div>
                    </div>
                    {sel && (
                      <span style={{ background: 'hsl(var(--primary))', color: '#fff', borderRadius: 20, padding: '1px 7px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>✓</span>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Rodapé: colaborador selecionado + botão Kit Padrão */}
            {colabSel && (
              <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', background: '#f0fdf4', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{colabSel.nome}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>{colabSel.chapa}</div>
                  </div>
                  <button onClick={() => setColabSel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2, flexShrink: 0 }}><X size={13} /></button>
                </div>
                {/* Botão Kit Padrão — sempre abre o modal */}
                <button
                  onClick={() => setModalKit(true)}
                  disabled={gerandoKit}
                  style={{
                    width: '100%', height: 34, borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: kitGerado
                      ? '#16a34a'
                      : gerandoKit
                        ? '#94a3b8'
                        : 'linear-gradient(135deg,#b45309,#d97706)',
                    color: '#fff', fontWeight: 700, fontSize: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'all .2s',
                  }}
                >
                  {kitGerado
                    ? <><CheckCircle2 size={14}/> Kit gerado!</>
                    : gerandoKit
                      ? 'Gerando…'
                      : <><span style={{ fontSize: 14 }}>📋</span> Kit Padrão{kitModelosIds.length > 0 ? ` (${kitModelosIds.length} docs)` : ''}</>
                  }
                </button>
              </div>
            )}
          </div>

          {/* ── PAINEL CENTRAL: Lista de Modelos — overlay sobre painel direito ── */}
          {painelModelosAberto && (
          <>
          {/* Overlay escuro clicável para fechar */}
          <div onClick={() => setPainelModelosAberto(false)} style={{ position: 'absolute', top: 0, left: 260, right: 0, bottom: 0, zIndex: 19, background: 'rgba(0,0,0,.18)', cursor: 'pointer' }}/>
          <div style={{ position: 'absolute', top: 0, left: 260, bottom: 0, width: 290, zIndex: 20, boxShadow: '4px 0 24px rgba(0,0,0,.13)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff', borderRight: '1px solid #e2e8f0' }}>

            <div style={{ padding: '10px 10px 6px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>📋 Escolha o Documento</span>
                <button onClick={() => setPainelModelosAberto(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, display: 'flex', alignItems: 'center' }}>
                  <X size={14}/>
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar modelo…"
                  style={{ width: '100%', height: 30, paddingLeft: 26, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', fontSize: 12, color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {/* Filtro categoria — scroll horizontal */}
              <div style={{ display: 'flex', gap: 3, overflowX: 'auto', paddingBottom: 2 }}>
                {ALL_CATS.map(cat => {
                  const info = CATEGORIAS[cat]
                  const ativo = catFiltro === cat
                  return (
                    <button key={cat} onClick={() => setCatFiltro(cat)}
                      style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, border: `1.5px solid ${ativo ? (info?.cor ?? '#1e3a5f') : '#e2e8f0'}`, background: ativo ? (info?.bg ?? '#e2e8f0') : '#fff', color: ativo ? (info?.cor ?? '#1e3a5f') : '#64748b' }}>
                      {cat === 'todos' ? 'Todos' : info?.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{modelosFiltrados.length} modelo(s)</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Carregando…</div>
              ) : modelosFiltrados.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Nenhum modelo encontrado</div>
              ) : modelosFiltrados.map(m => {
                const cat = CATEGORIAS[m.categoria] ?? CATEGORIAS.outro
                const sel = modeloSel?.id === m.id
                return (
                  <div key={m.id} onClick={() => setModeloSel(sel ? null : m)}
                    style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: sel ? 'hsl(var(--primary)/.08)' : 'transparent', borderLeft: `3px solid ${sel ? 'hsl(var(--primary))' : 'transparent'}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'inline-block', background: cat.bg, color: cat.cor, borderRadius: 8, padding: '1px 6px', fontSize: 9, fontWeight: 700, marginBottom: 3 }}>{cat.emoji} {cat.label}</span>
                        <div style={{ fontSize: 12, fontWeight: sel ? 700 : 600, color: sel ? 'hsl(var(--primary))' : 'var(--foreground)', lineHeight: 1.3 }}>{m.titulo}</div>
                        {m.descricao && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descricao}</div>}
                      </div>
                      {sel && <span style={{ fontSize: 16, color: 'hsl(var(--primary))', flexShrink: 0, marginTop: 2 }}>✓</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          </>
          )}

          {/* ── PAINEL DIREITO: Preview + Ações ── */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {!modeloSel ? (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
                <div style={{ background:'var(--card)', borderRadius:16, padding:'32px 36px', maxWidth:420,
                  border:'1px solid var(--border)', boxShadow:'0 2px 12px rgba(0,0,0,.06)', textAlign:'center' }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📄</div>
                  <div style={{ fontSize:17, fontWeight:800, marginBottom:8 }}>Gerar Documento</div>
                  <div style={{ fontSize:13, color:'var(--muted-foreground)', lineHeight:1.7, marginBottom:20 }}>
                    {!colabSel
                      ? 'Selecione um colaborador ao lado e escolha como gerar o documento.'
                      : 'Colaborador selecionado. Agora escolha o modelo ou use o Kit Padrão.'}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <button onClick={() => setPainelModelosAberto(true)}
                      style={{ height:40, borderRadius:9, border:'1.5px solid #1e3a5f', background:'#eff6ff',
                        color:'#1e3a5f', fontWeight:700, fontSize:13, cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      <FileText size={15}/> Ver lista de modelos
                    </button>
                    <div style={{ fontSize:11, color:'var(--muted-foreground)' }}>
                      — ou selecione o colaborador e use o —
                    </div>
                    <div style={{ background:'linear-gradient(135deg,#b45309,#d97706)', borderRadius:9,
                      padding:'10px 16px', color:'#fff', fontWeight:700, fontSize:13,
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                      📋 Kit Padrão (veja no rodapé do colaborador)
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Header do preview */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                      📄 {modeloSel.titulo}
                    </span>
                    {colabSel ? (
                      <span style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#15803d', fontWeight: 700 }}>👤 {colabSel.nome}</span>
                    ) : (
                      <span style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: '#b45309', fontWeight: 600 }}>⚠️ Sem colaborador</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={abrirPreview}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid #0369a1', background: '#eff6ff', color: '#0369a1', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <Eye size={13} /> Pré-visualizar
                    </button>
                    <button
                      onClick={() => {
                        setLoteSel(colaboradores.map(c => c.id))
                        setBuscaLote('')
                        setFiltroObraLote('')
                        setFiltroFuncaoLote('')
                        setModalLote(true)
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1.5px solid #7c3aed', background: '#ede9fe', color: '#7c3aed', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <Layers size={13} /> Gerar em Lote
                    </button>
                    <button onClick={gerarPDF}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '2px solid #059669', background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(5,150,105,.25)' }}>
                      <Printer size={13} /> Gerar PDF com Timbre
                    </button>
                  </div>
                </div>

                {/* Preview do documento — folha A4 com fundo cinza */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 32px', background: '#3c3f41' }}>
                  {/* Rótulo */}
                  <div style={{ maxWidth: 794, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', letterSpacing: 1 }}>📄 A4 · 210 × 297 mm — Preview</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>Timbre + Assinatura incluídos na versão impressa</span>
                  </div>
                  {/* Folha branca */}
                  <div style={{ background: '#fff', maxWidth: 794, margin: '0 auto', boxShadow: '0 2px 12px rgba(0,0,0,.5), 0 8px 32px rgba(0,0,0,.3)', overflow: 'hidden', position: 'relative' }}>
                    {/* Régua de margem */}
                    <div style={{ position: 'absolute', top: 28, right: 28, bottom: 28, left: 28, border: '1px dashed rgba(30,58,95,0.1)', pointerEvents: 'none', zIndex: 1 }} />
                    {/* Mini cabeçalho timbrado */}
                    <div style={{ background: '#1e3a5f', color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      {empData.logoUrl
                        ? <img src={empData.logoUrl} alt="Logo" style={{ height: 32, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} onError={e => (e.currentTarget.style.display='none')} />
                        : <span style={{ fontSize: 20 }}>🏗️</span>}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.04em' }}>{empData.nome || 'EMPRESA'}</div>
                        {empData.cnpj && <div style={{ fontSize: 9, color: '#93c5fd' }}>CNPJ: {empData.cnpj}</div>}
                      </div>
                    </div>
                    <div style={{ height: 3, background: '#1e3a5f', borderBottom: '1px solid #93c5fd' }} />
                    <div style={{ padding: '24px 28px', fontFamily: "'Times New Roman',Georgia,serif", fontSize: '12pt', lineHeight: 1.6, color: '#1a1a1a' }}
                      dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ ABA: MODELOS (somente admin) ════════════════════════════════════ */}
      {abaMain === 'modelos' && isAdmin && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Lista de modelos */}
          <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar modelo…"
                  style={{ width: '100%', height: 32, paddingLeft: 28, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', fontSize: 12, color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                {ALL_CATS.map(cat => {
                  const info = CATEGORIAS[cat]
                  const ativo = catFiltro === cat
                  return (
                    <button key={cat} onClick={() => setCatFiltro(cat)}
                      style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${ativo ? (info?.cor ?? '#1e3a5f') : '#e2e8f0'}`, background: ativo ? (info?.bg ?? '#e2e8f0') : '#fff', color: ativo ? (info?.cor ?? '#1e3a5f') : '#64748b' }}>
                      {cat === 'todos' ? 'Todos' : info?.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{modelosFiltrados.length} modelo(s)</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Carregando…</div>
              ) : modelosFiltrados.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Nenhum modelo encontrado</div>
              ) : modelosFiltrados.map(m => {
                const cat = CATEGORIAS[m.categoria] ?? CATEGORIAS.outro
                const sel = modeloSel?.id === m.id
                return (
                  <div key={m.id} onClick={() => setModeloSel(m)}
                    style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: sel ? 'hsl(var(--primary)/.08)' : 'transparent', borderLeft: `3px solid ${sel ? 'hsl(var(--primary))' : 'transparent'}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {m.numero && <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700 }}>#{String(m.numero).padStart(2,'0')} </span>}
                        <span style={{ display: 'inline-block', background: cat.bg, color: cat.cor, borderRadius: 10, padding: '1px 6px', fontSize: 9, fontWeight: 700, marginBottom: 2 }}>{cat.emoji} {cat.label}</span>
                        <div style={{ fontSize: 12, fontWeight: sel ? 700 : 600, color: sel ? 'hsl(var(--primary))' : 'var(--foreground)', lineHeight: 1.3 }}>{m.titulo}</div>
                        {m.descricao && <div style={{ fontSize: 10, color: '#64748b', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descricao}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button onClick={e => { e.stopPropagation(); abrirEditor(m) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 3, borderRadius: 4 }} title="Editar modelo">
                          <Pencil size={12} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setConfirmDel(m) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 3, borderRadius: 4 }} title="Remover modelo">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Área de preview do modelo selecionado (col direita) */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {!modeloSel ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#94a3b8' }}>
                <FileText size={56} strokeWidth={1} />
                <div style={{ fontSize: 14 }}>Selecione um modelo para ver o preview</div>
              </div>
            ) : (
              <>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>📄 {modeloSel.titulo}</span>
                  <button onClick={() => abrirEditor(modeloSel)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: '2px solid hsl(var(--primary))', background: 'hsl(var(--primary))', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Pencil size={13} /> Editar Modelo
                  </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#f0f4f8' }}>
                  <div style={{ background: '#fff', maxWidth: '210mm', margin: '0 auto', borderRadius: 6, boxShadow: '0 2px 12px rgba(0,0,0,.1)', overflow: 'hidden' }}>
                    <div style={{ background: '#1e3a5f', color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      {empData.logoUrl
                        ? <img src={empData.logoUrl} alt="Logo" style={{ height: 32, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} onError={e => (e.currentTarget.style.display='none')} />
                        : <span style={{ fontSize: 20 }}>🏗️</span>}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>{empData.nome || 'EMPRESA'}</div>
                        {empData.cnpj && <div style={{ fontSize: 9, color: '#93c5fd' }}>CNPJ: {empData.cnpj}</div>}
                      </div>
                    </div>
                    <div style={{ height: 3, background: '#1e3a5f', borderBottom: '1px solid #93c5fd' }} />
                    <div style={{ padding: '24px 28px', fontFamily: "'Times New Roman',Georgia,serif", fontSize: '12pt', lineHeight: 1.6, color: '#1a1a1a' }}
                      dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Aviso para não-admin que tenta acessar modelos */}
      {abaMain === 'modelos' && !isAdmin && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#94a3b8' }}>
          <span style={{ fontSize: 40 }}>🔒</span>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Acesso restrito</div>
          <div style={{ fontSize: 13 }}>Somente administradores podem editar os modelos de documentos.</div>
        </div>
      )}

      {/* ══ MODAL: Editor WYSIWYG fullscreen ══ */}
      {modalEditor && editModelo !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 9000, display: 'flex', alignItems: 'stretch', justifyContent: 'stretch', padding: 0 }}>
          <div style={{ background: 'var(--card)', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>

            {/* ── Header do modal ── */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, background: 'var(--card)' }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{editModelo.id ? '✏️ Editar Modelo' : '➕ Novo Modelo'}</span>
              <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                <Input
                  value={editModelo.titulo ?? ''}
                  onChange={e => setEditModelo(p => ({ ...p, titulo: e.target.value }))}
                  placeholder="Título do documento *"
                  style={{ maxWidth: 340, height: 34, fontSize: 13 }}
                />
                <select value={editModelo.categoria ?? 'outro'} onChange={e => setEditModelo(p => ({ ...p, categoria: e.target.value }))}
                  style={{ height: 34, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13, paddingLeft: 8, paddingRight: 8 }}>
                  {Object.entries(CATEGORIAS).map(([key, v]) => (
                    <option key={key} value={key}>{v.emoji} {v.label}</option>
                  ))}
                </select>
                <Input
                  value={editModelo.descricao ?? ''}
                  onChange={e => setEditModelo(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Descrição (opcional)"
                  style={{ maxWidth: 260, height: 34, fontSize: 12 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <button onClick={salvarModelo} disabled={saving}
                  style={{ padding: '7px 20px', borderRadius: 8, border: '2px solid #059669', background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Salvando…' : '💾 Salvar'}
                </button>
                <button onClick={() => { setModalEditor(false); setEditModelo(null) }}
                  style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#64748b' }}>
                  Cancelar
                </button>
              </div>
            </div>

            {/* ── Toolbar WYSIWYG ── */}
            <div style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', background: '#f8fafc', flexShrink: 0 }}>

              {/* ── GRUPO 1: Estilo de Bloco ── */}
              <select
                onChange={e => { if (e.target.value) applyBlockStyle(e.target.value); e.target.value = '' }}
                defaultValue=""
                style={{ height: 28, minWidth: 105, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, paddingLeft: 5, paddingRight: 4, cursor: 'pointer', fontWeight: 600, color: '#1e3a5f' }}
                title="Estilo do parágrafo">
                <option value="" disabled>¶ Estilo…</option>
                {BLOCK_STYLES.map(bs => (
                  <option key={bs.value} value={bs.value}>{bs.label}</option>
                ))}
              </select>

              <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />

              {/* ── GRUPO 2: Fonte + Tamanho ── */}
              <select
                onChange={e => { if (e.target.value) applyFontFamily(e.target.value); e.target.value = '' }}
                defaultValue=""
                style={{ height: 28, minWidth: 130, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, paddingLeft: 4, paddingRight: 4, cursor: 'pointer' }}>
                <option value="" disabled>Fonte…</option>
                {FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
              </select>

              <select
                onChange={e => { if (e.target.value) applyFontSize(Number(e.target.value)); e.target.value = '' }}
                defaultValue=""
                style={{ height: 28, width: 68, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, paddingLeft: 4, paddingRight: 4, cursor: 'pointer' }}>
                <option value="" disabled>Tam…</option>
                {FONT_SIZES_PT.map(s => <option key={s} value={s}>{s}pt</option>)}
              </select>

              {/* Altura do texto */}
              <select
                onChange={e => { if (e.target.value) applyLineHeight(e.target.value); e.target.value = '' }}
                defaultValue=""
                style={{ height: 28, width: 72, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', fontSize: 11, paddingLeft: 4, paddingRight: 4, cursor: 'pointer' }}
                title="Altura da linha">
                <option value="" disabled>↕ Alt.</option>
                {LINE_HEIGHTS.map(lh => <option key={lh} value={lh}>× {lh}</option>)}
              </select>

              <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />

              {/* ── GRUPO 3: B I U S ── */}
              {[
                { cmd: 'bold',          label: <strong style={{ fontSize: 13 }}>B</strong>,  title: 'Negrito (Ctrl+B)' },
                { cmd: 'italic',        label: <em style={{ fontSize: 13 }}>I</em>,           title: 'Itálico (Ctrl+I)' },
                { cmd: 'underline',     label: <span style={{ textDecoration: 'underline', fontSize: 13 }}>U</span>, title: 'Sublinhado (Ctrl+U)' },
                { cmd: 'strikeThrough', label: <span style={{ textDecoration: 'line-through', fontSize: 13 }}>S</span>, title: 'Riscado' },
              ].map(({ cmd, label, title }) => (
                <button key={cmd} onMouseDown={e => { e.preventDefault(); exec(cmd) }}
                  title={title}
                  style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontFamily: 'serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {label}
                </button>
              ))}

              <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />

              {/* ── GRUPO 4: Alinhamentos ── */}
              {([
                { cmd: 'justifyLeft',   title: 'Alinhar à esquerda', svg: <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><rect x="0" y="0" width="14" height="2" rx="1" fill="#475569"/><rect x="0" y="5" width="10" height="2" rx="1" fill="#475569"/><rect x="0" y="10" width="12" height="2" rx="1" fill="#475569"/></svg> },
                { cmd: 'justifyCenter', title: 'Centralizar',        svg: <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><rect x="0" y="0" width="14" height="2" rx="1" fill="#475569"/><rect x="2" y="5" width="10" height="2" rx="1" fill="#475569"/><rect x="1" y="10" width="12" height="2" rx="1" fill="#475569"/></svg> },
                { cmd: 'justifyRight',  title: 'Alinhar à direita',  svg: <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><rect x="0" y="0" width="14" height="2" rx="1" fill="#475569"/><rect x="4" y="5" width="10" height="2" rx="1" fill="#475569"/><rect x="2" y="10" width="12" height="2" rx="1" fill="#475569"/></svg> },
                { cmd: 'justifyFull',   title: 'Justificado',         svg: <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><rect x="0" y="0" width="14" height="2" rx="1" fill="#475569"/><rect x="0" y="5" width="14" height="2" rx="1" fill="#475569"/><rect x="0" y="10" width="14" height="2" rx="1" fill="#475569"/></svg> },
              ] as const).map(({ cmd, title, svg }) => (
                <button key={cmd} onMouseDown={e => { e.preventDefault(); exec(cmd) }}
                  title={title}
                  style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {svg}
                </button>
              ))}

              <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />

              {/* ── GRUPO 5: Indentação ── */}
              <button onMouseDown={e => { e.preventDefault(); exec('indent') }} title="Aumentar recuo"
                style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M0 1h14M4 5h10M4 9h10M0 5l3 2-3 2V5z" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
              </button>
              <button onMouseDown={e => { e.preventDefault(); exec('outdent') }} title="Diminuir recuo"
                style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M0 1h14M4 5h10M4 9h10M3 5l-3 2 3 2V5z" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
              </button>

              <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />

              {/* ── GRUPO 6: Listas ── */}
              <button onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }} title="Lista com marcadores"
                style={{ height: 28, padding: '0 8px', borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 14 }}>•</span> Lista
              </button>
              <button onMouseDown={e => { e.preventDefault(); exec('insertOrderedList') }} title="Lista numerada"
                style={{ height: 28, padding: '0 8px', borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 11 }}>1.</span> Lista
              </button>

              <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />

              {/* ── GRUPO 7: Cores ── */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#475569', cursor: 'pointer' }} title="Cor do texto">
                <span style={{ fontSize: 13 }}>A</span>
                <input type="color" defaultValue="#000000"
                  onChange={e => exec('foreColor', e.target.value)}
                  style={{ width: 20, height: 20, border: '1px solid #cbd5e1', borderRadius: 3, cursor: 'pointer', padding: 0 }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#475569', cursor: 'pointer' }} title="Cor de fundo">
                <span style={{ fontSize: 13 }}>◨</span>
                <input type="color" defaultValue="#ffffff"
                  onChange={e => exec('hiliteColor', e.target.value)}
                  style={{ width: 20, height: 20, border: '1px solid #cbd5e1', borderRadius: 3, cursor: 'pointer', padding: 0 }} />
              </label>

              <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />

              {/* ── GRUPO 8: Inserções especiais ── */}
              <button onMouseDown={e => { e.preventDefault(); exec('insertHTML', '<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0"/>') }}
                title="Inserir linha divisória"
                style={{ height: 28, padding: '0 8px', borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 11 }}>
                ─ Linha
              </button>
              <button onMouseDown={e => { e.preventDefault(); exec('insertHTML', '<p style="margin:8px 0">&nbsp;</p>') }}
                title="Adicionar parágrafo em branco"
                style={{ height: 28, padding: '0 8px', borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                + ¶
              </button>

              <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />

              {/* ── GRUPO 9: Desfazer / Refazer ── */}
              <button onMouseDown={e => { e.preventDefault(); exec('undo') }} title="Desfazer (Ctrl+Z)"
                style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↩</button>
              <button onMouseDown={e => { e.preventDefault(); exec('redo') }} title="Refazer (Ctrl+Y)"
                style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↪</button>

              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }}>Ctrl+B/I/U · Selecione texto para formatar</span>
            </div>

            {/* ── Área principal: Editor + Painel lateral ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

              {/* Área de edição */}
              <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', background: '#f0f4f8' }}>
                {/* CSS base do editor — headings sem style inline herdam daqui */}
                <style>{`
                  .rh-editor h1 { font-size:18pt; font-weight:900; text-align:center; margin:0 0 12px; text-transform:uppercase; letter-spacing:.04em; line-height:1.3; }
                  .rh-editor h2 { font-size:14pt; font-weight:800; margin:16px 0 6px; text-transform:uppercase; border-bottom:1.5px solid #334155; padding-bottom:3px; line-height:1.3; }
                  .rh-editor h3 { font-size:12pt; font-weight:700; margin:12px 0 4px; line-height:1.4; }
                  .rh-editor h4 { font-size:11pt; font-weight:700; margin:10px 0 3px; font-style:italic; line-height:1.4; }
                  .rh-editor blockquote { font-size:11pt; margin:10px 0; border-left:3px solid #94a3b8; padding-left:12px; color:#475569; font-style:italic; line-height:1.6; }
                  .rh-editor p { font-size:12pt; margin:8px 0; line-height:1.6; }
                  .rh-editor ul { margin:6px 0 6px 24px; padding:0; list-style:disc; }
                  .rh-editor ol { margin:6px 0 6px 24px; padding:0; list-style:decimal; }
                  .rh-editor li { font-size:12pt; line-height:1.6; margin:2px 0; }
                  .rh-editor hr { border:none; border-top:1px solid #e2e8f0; margin:14px 0; }
                `}</style>
                {/* Papel A4 */}
                <div
                  ref={editorRef}
                  className="rh-editor"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  style={{
                    minHeight: 'calc(297mm)',
                    maxWidth: '210mm',
                    margin: '0 auto',
                    background: '#fff',
                    borderRadius: 6,
                    padding: '25mm 20mm',
                    boxShadow: '0 2px 16px rgba(0,0,0,.1)',
                    fontFamily: "'Times New Roman',Georgia,serif",
                    fontSize: '12pt',
                    lineHeight: 1.6,
                    color: '#1a1a1a',
                    outline: 'none',
                    cursor: 'text',
                  }}
                />
              </div>

              {/* ── Painel lateral: Variáveis / Funções ── */}
              <div style={{ width: 260, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>

                {/* Tabs do painel */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
                  {(['variaveis', 'funcoes'] as const).map(tab => (
                    <button key={tab} onClick={() => setEditorTab(tab)}
                      style={{ flex: 1, padding: '8px 4px', border: 'none', borderBottom: `2px solid ${editorTab === tab ? 'hsl(var(--primary))' : 'transparent'}`, background: 'transparent', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: editorTab === tab ? 'hsl(var(--primary))' : '#64748b' }}>
                      {tab === 'variaveis' ? '📌 Variáveis' : '💼 Funções'}
                    </button>
                  ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>

                  {editorTab === 'variaveis' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                      {/* Colaborador */}
                      {[
                        { titulo: '👤 Colaborador', vars: VARS_COLABORADOR, border: '#bae6fd', bg: '#e0f2fe', cor: '#0369a1' },
                        { titulo: '🔧 Função', vars: VARS_FUNCAO, border: '#c4b5fd', bg: '#ede9fe', cor: '#7c3aed' },
                        { titulo: '🏗️ Obra / Local', vars: VARS_OBRA, border: '#fed7aa', bg: '#fff7ed', cor: '#c2410c' },
                        { titulo: '🏢 Empresa', vars: VARS_EMPRESA, border: '#bbf7d0', bg: '#dcfce7', cor: '#15803d' },
                        { titulo: '📅 Data', vars: VARS_DATA, border: '#fde68a', bg: '#fef3c7', cor: '#b45309' },
                      ].map(grupo => (
                        <div key={grupo.titulo}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>{grupo.titulo}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {grupo.vars.map(v => (
                              <button key={v.value} onMouseDown={e => { e.preventDefault(); inserirVariavel(v.value) }}
                                style={{ padding: '3px 8px', borderRadius: 5, border: `1px solid ${grupo.border}`, background: grupo.bg, color: grupo.cor, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace' }}>
                                {v.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Funções (dropdown — inserir bloco completo) */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>💼 Funções</div>
                        <select value={funcaoSel} onChange={e => setFuncaoSel(e.target.value)}
                          style={{ width: '100%', height: 30, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 11, paddingLeft: 6 }}>
                          <option value="">Selecionar função…</option>
                          {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                        <button onMouseDown={e => { e.preventDefault(); inserirFuncao() }}
                          disabled={!funcaoSel}
                          style={{ marginTop: 5, width: '100%', padding: '5px', borderRadius: 6, border: '1.5px solid #7c3aed', background: funcaoSel ? '#ede9fe' : '#f1f5f9', color: funcaoSel ? '#7c3aed' : '#94a3b8', fontSize: 11, fontWeight: 700, cursor: funcaoSel ? 'pointer' : 'not-allowed' }}>
                          ↗ Inserir nome + descrição
                        </button>
                      </div>
                    </div>
                  )}

                  {editorTab === 'funcoes' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                        Clique em uma função para inserir o bloco com nome e descrição no documento.
                      </div>
                      {funcoes.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>Nenhuma função cadastrada.</div>}
                      {funcoes.map(fn => (
                        <div key={fn.id}
                          style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}
                          onClick={() => {
                            editorRef.current?.focus()
                            const bloco = `<p><strong>${fn.nome}</strong>${fn.sigla ? ` (${fn.sigla})` : ''}</p>${fn.descricao ? `<p>${fn.descricao}</p>` : ''}`
                            document.execCommand('insertHTML', false, bloco)
                          }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{fn.nome}</div>
                          {fn.sigla && <span style={{ fontSize: 10, color: '#0369a1' }}>{fn.sigla}</span>}
                          {fn.descricao && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{fn.descricao.slice(0, 80)}{fn.descricao.length > 80 ? '…' : ''}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Configurar Funções — layout 2 painéis ══════════════════ */}
      {modalFuncoes && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) { fecharEdicaoFuncao(); setModalFuncoes(false) } }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, width: '100%', maxWidth: 900, height: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 80px rgba(0,0,0,.4)', overflow: 'hidden' }}>

            {/* ── Header ── */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'var(--card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Settings size={18} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--foreground)' }}>Configurar Funções</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                    Edite a descrição de atividades de cada função para inserir nos contratos · {funcoes.filter(f => f.descricao).length}/{funcoes.length} configuradas
                  </div>
                </div>
              </div>
              <button onClick={() => { fecharEdicaoFuncao(); setModalFuncoes(false) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                <X size={20} />
              </button>
            </div>

            {/* ── Body: 2 painéis ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

              {/* ── PAINEL ESQUERDO: lista de funções ── */}
              <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Funções cadastradas
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {loading ? (
                    <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Carregando…</div>
                  ) : funcoes.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                      <Briefcase size={28} strokeWidth={1} style={{ marginBottom: 6, opacity: .4 }} />
                      <div>Nenhuma função cadastrada.</div>
                    </div>
                  ) : funcoes.map(fn => {
                    const ativa = funcaoEditando?.id === fn.id
                    const temDesc = Boolean(fn.descricao?.trim())
                    return (
                      <div key={fn.id}
                        onClick={() => abrirEdicaoFuncao(fn)}
                        style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: ativa ? '#ede9fe' : 'transparent', borderLeft: `3px solid ${ativa ? '#7c3aed' : 'transparent'}` }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: ativa ? '#7c3aed' : '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Briefcase size={14} color="#fff" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: ativa ? 700 : 500, fontSize: 13, color: ativa ? '#6d28d9' : 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fn.nome}</div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                            {fn.sigla && <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 4, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>{fn.sigla}</span>}
                            {fn.cbo && <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 4, padding: '0 5px', fontSize: 9 }}>CBO {fn.cbo}</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 14, flexShrink: 0 }} title={temDesc ? 'Descrição configurada' : 'Sem descrição'}>
                          {temDesc ? '✅' : '⚠️'}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {/* rodapé lista */}
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${funcoes.length ? (funcoes.filter(f=>f.descricao).length / funcoes.length) * 100 : 0}%`, background: '#7c3aed', borderRadius: 3, transition: 'width .3s' }} />
                  </div>
                  <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {funcoes.filter(f => f.descricao).length}/{funcoes.length}
                  </span>
                </div>
              </div>

              {/* ── PAINEL DIREITO: editor focado ── */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {!funcaoEditando ? (
                  /* Estado vazio */
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#94a3b8', padding: 32, textAlign: 'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Briefcase size={28} color="#a78bfa" strokeWidth={1.5} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#6d28d9' }}>Selecione uma função</div>
                    <div style={{ fontSize: 12 }}>Clique em qualquer função à esquerda para editar a descrição das atividades</div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#15803d' }}>{funcoes.filter(f => f.descricao).length}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>configuradas</div>
                      </div>
                      <div style={{ width: 1, background: '#e2e8f0' }} />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#b45309' }}>{funcoes.filter(f => !f.descricao).length}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>sem descrição</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Editor */
                  <>
                    {/* Header do editor */}
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 800, color: '#6d28d9', marginBottom: 4 }}>{funcaoEditando.nome}</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {funcaoEditando.sigla && <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{funcaoEditando.sigla}</span>}
                            {funcaoEditando.cbo && <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 5, padding: '2px 8px', fontSize: 11 }}>CBO: {funcaoEditando.cbo}</span>}
                            <span style={{ background: '#fef3c7', color: '#b45309', borderRadius: 5, padding: '2px 8px', fontSize: 11 }}>
                              💡 Esta descrição será inserida no contrato quando você selecionar esta função no editor
                            </span>
                          </div>
                        </div>
                        <button onClick={fecharEdicaoFuncao}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, flexShrink: 0 }}>
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Área de texto */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px', gap: 10, overflow: 'auto' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <BookOpen size={12} color="#7c3aed" /> Descrição das Atividades
                      </div>
                      <textarea
                        value={descricaoRascunho}
                        onChange={e => setDescricaoRascunho(e.target.value)}
                        autoFocus
                        placeholder={`Descreva as atividades, atribuições e responsabilidades do(a) ${funcaoEditando.nome}…\n\nExemplo:\nExecutar serviços de alvenaria, assentamento de tijolos, blocos e pedras. Preparar argamassa, realizar reboco, massa corrida e acabamentos. Interpretar plantas e especificações técnicas. Zelar pela organização do canteiro de obras e pelo uso correto dos equipamentos de proteção individual.`}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvarEdicaoFuncao() }
                          if (e.key === 'Escape') { e.preventDefault(); fecharEdicaoFuncao() }
                        }}
                        style={{
                          flex: 1,
                          minHeight: 260,
                          width: '100%',
                          padding: '16px 18px',
                          borderRadius: 10,
                          border: '2px solid #a78bfa',
                          background: '#faf5ff',
                          fontSize: '12pt',
                          fontFamily: "'Times New Roman', Georgia, serif",
                          lineHeight: 1.8,
                          resize: 'none',
                          outline: 'none',
                          color: '#1a1a1a',
                          boxSizing: 'border-box',
                          boxShadow: '0 0 0 4px rgba(167,139,250,.12)',
                        }}
                      />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>Ctrl+Enter para salvar · Esc para cancelar</span>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>
                          {descricaoRascunho.length} caractere(s)
                        </span>
                      </div>
                    </div>

                    {/* Footer do editor */}
                    <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexShrink: 0, background: 'var(--card)' }}>
                      <button onClick={fecharEdicaoFuncao} disabled={salvandoFuncao}
                        style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#64748b' }}>
                        Cancelar
                      </button>
                      <button onClick={salvarEdicaoFuncao} disabled={salvandoFuncao}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 22px', borderRadius: 7, border: '2px solid #7c3aed', background: salvandoFuncao ? '#ede9fe' : 'linear-gradient(135deg,#7c3aed,#6d28d9)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: salvandoFuncao ? 'not-allowed' : 'pointer', opacity: salvandoFuncao ? .8 : 1, boxShadow: '0 2px 8px rgba(124,58,237,.3)' }}>
                        <Save size={14} /> {salvandoFuncao ? 'Salvando…' : 'Salvar Descrição'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Confirmar exclusão ══ */}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmDel(null) }}>
          <div style={{ background: 'var(--card)', borderRadius: 12, padding: 24, maxWidth: 400, width: '92vw', boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>🗑️ Remover modelo?</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
              O modelo <strong>"{confirmDel.titulo}"</strong> será desativado. Documentos já gerados não serão afetados.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDel(null)} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => excluirModelo(confirmDel)} style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Sim, remover</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Kit Padrão — configurar ════════════════════════════════ */}
      {modalKit && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:9300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => { if (e.target === e.currentTarget) setModalKit(false) }}>
          <div style={{ background:'var(--card)', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 16px 48px rgba(0,0,0,.4)', overflow:'hidden' }}>

            {/* Header */}
            <div style={{ padding:'16px 20px', background:'linear-gradient(135deg,#b45309,#d97706)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div>
                <div style={{ color:'#fff', fontWeight:800, fontSize:15, display:'flex', alignItems:'center', gap:8 }}>
                  📋 Kit de Documentos Padrão
                </div>
                <div style={{ color:'rgba(255,255,255,.75)', fontSize:11, marginTop:2 }}>
                  Selecione os modelos que compõem o kit de admissão padrão
                </div>
              </div>
              <button onClick={() => setModalKit(false)}
                style={{ background:'rgba(255,255,255,.2)', border:'none', borderRadius:8, padding:'6px 10px', color:'#fff', cursor:'pointer', fontSize:13 }}>
                ✕
              </button>
            </div>

            {/* Info */}
            <div style={{ padding:'10px 16px', background:'#fef3c7', borderBottom:'1px solid #fcd34d', fontSize:12, color:'#92400e', flexShrink:0 }}>
              💡 O botão <strong>"Kit Padrão"</strong> gera todos os documentos abaixo de uma vez, personalizados com os dados do colaborador selecionado.
            </div>

            {/* Lista de modelos */}
            <div style={{ flex:1, overflowY:'auto', padding:12 }}>
              {['admissional','contrato','termo','declaracao','politica','ficha','outro'].map(cat => {
                const modelosCat = modelos.filter(m => m.categoria === cat)
                if (modelosCat.length === 0) return null
                const catInfo = CATEGORIAS[cat] ?? CATEGORIAS.outro
                return (
                  <div key={cat} style={{ marginBottom:10 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:catInfo.cor, background:catInfo.bg,
                      borderRadius:6, padding:'4px 8px', marginBottom:4, display:'inline-block' }}>
                      {catInfo.emoji} {catInfo.label}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      {modelosCat.map(m => {
                        const sel = kitModelosIds.includes(m.id)
                        return (
                          <div key={m.id} onClick={() => salvarKitModelos(sel ? kitModelosIds.filter(id => id !== m.id) : [...kitModelosIds, m.id])}
                            style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, cursor:'pointer',
                              border:`1px solid ${sel ? catInfo.cor : 'var(--border)'}`,
                              background: sel ? catInfo.bg : 'var(--card)',
                              transition:'all .12s' }}>
                            <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${sel ? catInfo.cor : '#d1d5db'}`,
                              background:sel ? catInfo.cor : '#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                              {sel && <span style={{ color:'#fff', fontSize:11, lineHeight:1, fontWeight:900 }}>✓</span>}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:sel?700:600, color:sel?catInfo.cor:'var(--foreground)' }}>{m.titulo}</div>
                              {m.descricao && <div style={{ fontSize:10, color:'var(--muted-foreground)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.descricao}</div>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', background:'var(--background)', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
              <div style={{ fontSize:12, color:'var(--muted-foreground)' }}>
                {kitModelosIds.length > 0
                  ? <><strong style={{ color:'#b45309' }}>{kitModelosIds.length} documento(s)</strong> no kit</>
                  : <span style={{ color:'#ef4444' }}>Nenhum documento selecionado</span>
                }
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {kitModelosIds.length > 0 && (
                  <button onClick={() => salvarKitModelos([])}
                    style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #fecaca', background:'#fff1f2', fontSize:12, fontWeight:600, cursor:'pointer', color:'#dc2626' }}>
                    Limpar kit
                  </button>
                )}
                <button onClick={() => setModalKit(false)}
                  style={{ padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'var(--card)', fontSize:13, fontWeight:600, cursor:'pointer', color:'var(--foreground)' }}>
                  Fechar
                </button>
                <button
                  onClick={async () => { await gerarKitPadrao() }}
                  disabled={gerandoKit || kitModelosIds.length === 0}
                  style={{ padding:'8px 20px', borderRadius:8, border:'none', fontSize:13, fontWeight:700,
                    cursor: (gerandoKit || kitModelosIds.length === 0) ? 'not-allowed' : 'pointer',
                    background: kitGerado ? '#16a34a' : (gerandoKit || kitModelosIds.length === 0) ? '#94a3b8' : 'linear-gradient(135deg,#b45309,#d97706)',
                    color:'#fff', display:'flex', alignItems:'center', gap:8 }}>
                  {kitGerado
                    ? <><CheckCircle2 size={14}/> Gerado!</>
                    : gerandoKit
                      ? 'Gerando…'
                      : <>🖨️ Gerar Kit ({kitModelosIds.length} doc{kitModelosIds.length !== 1 ? 's' : ''})</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Geração em Lote ══════════════════════════════════════════ */}
      {modalLote && modeloSel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 9200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setModalLote(false) }}>
          <div style={{ background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,.4)', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '16px 20px', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Layers size={16} color="#93c5fd" /> Geração em Lote
                </div>
                <div style={{ color: '#93c5fd', fontSize: 11, marginTop: 2 }}>
                  📄 {modeloSel.titulo} — selecione os colaboradores
                </div>
              </div>
              <button onClick={() => setModalLote(false)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
                ✕ Fechar
              </button>
            </div>

            {/* Filtros */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--background)', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input value={buscaLote} onChange={e => setBuscaLote(e.target.value)}
                  placeholder="Buscar colaborador…"
                  style={{ width: '100%', height: 32, paddingLeft: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12, boxSizing: 'border-box', color: 'var(--foreground)' }} />
              </div>
              {/* Por obra */}
              <select value={filtroObraLote} onChange={e => setFiltroObraLote(e.target.value)}
                style={{ height: 32, borderRadius: 7, border: '1px solid var(--border)', padding: '0 10px', fontSize: 12, background: 'var(--card)', color: 'var(--foreground)' }}>
                <option value="">🏗️ Todas as obras</option>
                {[...new Set(colaboradores.map(c => (c.obras as any)?.nome).filter(Boolean))].sort().map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              {/* Por função */}
              <select value={filtroFuncaoLote} onChange={e => setFiltroFuncaoLote(e.target.value)}
                style={{ height: 32, borderRadius: 7, border: '1px solid var(--border)', padding: '0 10px', fontSize: 12, background: 'var(--card)', color: 'var(--foreground)' }}>
                <option value="">🪪 Todas as funções</option>
                {[...new Set(colaboradores.map(c => (c.funcoes as any)?.nome).filter(Boolean))].sort().map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  const ids = colaboradores
                    .filter(c => {
                      const q = buscaLote.toLowerCase()
                      const obraNome = (c.obras as any)?.nome ?? ''
                      const fnNome   = (c.funcoes as any)?.nome ?? ''
                      const matchBusca = !q || c.nome.toLowerCase().includes(q) || c.chapa?.toLowerCase().includes(q)
                      const matchObra  = !filtroObraLote || obraNome === filtroObraLote
                      const matchFn    = !filtroFuncaoLote || fnNome === filtroFuncaoLote
                      return matchBusca && matchObra && matchFn
                    })
                    .map(c => c.id)
                  setLoteSel(prev => prev.length === ids.length && ids.every(id => prev.includes(id)) ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])])
                }}
                style={{ height: 32, paddingInline: 12, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 12, cursor: 'pointer', color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
                Sel. filtrados
              </button>
              <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {loteSel.length} selecionado(s)
              </span>
            </div>

            {/* Lista de colaboradores */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 6 }}>
                {colaboradores
                  .filter(c => {
                    const q = buscaLote.toLowerCase()
                    const obraNome = (c.obras as any)?.nome ?? ''
                    const fnNome   = (c.funcoes as any)?.nome ?? ''
                    return (!q || c.nome.toLowerCase().includes(q) || (c.chapa ?? '').toLowerCase().includes(q))
                      && (!filtroObraLote || obraNome === filtroObraLote)
                      && (!filtroFuncaoLote || fnNome === filtroFuncaoLote)
                  })
                  .map(c => {
                    const sel = loteSel.includes(c.id)
                    return (
                      <div key={c.id}
                        onClick={() => setLoteSel(s => sel ? s.filter(id => id !== c.id) : [...s, c.id])}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                          borderRadius: 8, border: `1px solid ${sel ? '#1e3a5f' : 'var(--border)'}`,
                          background: sel ? '#eff6ff' : 'var(--card)', cursor: 'pointer', transition: 'all .1s' }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? '#1e3a5f' : '#d1d5db'}`,
                          background: sel ? '#1e3a5f' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {sel && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: sel ? '#1e3a5f' : 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                            {c.chapa}{(c.funcoes as any)?.nome ? ` · ${(c.funcoes as any).nome}` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })
                }
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--background)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                Será gerada <strong>1 folha A4 por colaborador</strong>, com timbre e assinatura.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModalLote(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--foreground)' }}>
                  Cancelar
                </button>
                <button onClick={gerarLote} disabled={gerando || loteSel.length === 0 || loteGerado}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: (gerando || loteSel.length === 0) ? 'not-allowed' : 'pointer',
                    background: loteGerado ? '#16a34a' : (gerando || loteSel.length === 0) ? '#94a3b8' : 'linear-gradient(135deg,#7c3aed,#6d28d9)',
                    color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {loteGerado
                    ? <><CheckCircle2 size={15}/> Gerado!</>
                    : gerando
                      ? 'Gerando…'
                      : <><Layers size={15}/> Gerar {loteSel.length} via(s)</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
