import React, { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Colaborador, Funcao, Obra } from '@/lib/supabase'
import { fetchEmpresaData, type EmpresaData } from '@/lib/relatorioHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Search, Plus, Pencil, Trash2, FileText, Eye, Printer, X, ChevronDown } from 'lucide-react'

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
  funcoes?: Pick<Funcao, 'nome' | 'sigla'>
  obras?: Pick<Obra, 'nome' | 'codigo'>
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
  const salFmt  = c.salario ? `R$ ${c.salario.toLocaleString('pt-BR',{minimumFractionDigits:2})}` : ''
  const fn  = (c.funcoes as any)?.nome ?? ''
  const ob  = (c.obras  as any)?.nome  ?? ''
  const genero: Record<string,string> = { masculino:'brasileiro', feminino:'brasileira', outro:'brasileiro(a)' }
  const civil:  Record<string,string> = { solteiro:'solteiro(a)', casado:'casado(a)', divorciado:'divorciado(a)', viuvo:'viúvo(a)', uniao_estavel:'em união estável' }

  return {
    'Nome Completo': c.nome, 'NOME': c.nome, 'Nome Completo do Empregado': c.nome,
    'Nome do(a) Novo(a) Colaborador(a)': c.nome, 'NOME COMPLETO': c.nome,
    'CPF': c.cpf ?? '', 'Número do CPF': c.cpf ?? '',
    'RG': c.rg ?? '', 'Número do RG': c.rg ?? '',
    'PIS/NIT': c.pis_nit ?? '', 'Número do PIS/PASEP': c.pis_nit ?? '',
    'CTPS Nº': c.ctps_numero ?? '', 'Número da CTPS': c.ctps_numero ?? '',
    'Série CTPS': c.ctps_serie ?? '', 'Série da CTPS': c.ctps_serie ?? '',
    'Função': fn, 'FUNÇÃO': fn, 'NOME DA FUNÇÃO': fn, 'Profissão': fn, 'Profissão/Função': fn,
    'Obra': ob, 'LOCAL DA PRESTAÇÃO DOS SERVIÇOS': ob,
    'Data Admissão': fmtDate(c.data_admissao), 'Data de Início': fmtDate(c.data_admissao),
    'Salário': salFmt, 'valor numérico': salFmt,
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
    'CIDADE': emp.cidade || c.cidade || 'São Paulo',
    'cidade/estado/raio km': emp.cidade,
    'região metropolitana de CIDADE DA PRESTAÇÃO DE SERVIÇOS': emp.cidade,
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
  { label: 'Função', value: 'Função' },
  { label: 'Obra', value: 'Obra' },
  { label: 'Data Admissão', value: 'Data Admissão' },
  { label: 'Salário', value: 'Salário' },
  { label: 'Endereço', value: 'Endereço' },
  { label: 'Cidade', value: 'Cidade' },
  { label: 'Estado Civil', value: 'Estado Civil' },
  { label: 'Nacionalidade', value: 'Nacionalidade' },
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

  // confirmação exclusão
  const [confirmDel, setConfirmDel]   = useState<Modelo | null>(null)

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [modRes, colRes, fnRes] = await Promise.all([
      supabase.from('contratos_modelos').select('*').eq('ativo', true).order('ordem'),
      supabase.from('colaboradores')
        .select('id,nome,chapa,cpf,rg,pis_nit,ctps_numero,ctps_serie,genero,estado_civil,funcao_id,obra_id,salario,tipo_contrato,data_admissao,endereco,cidade,estado,cep,telefone,email,funcoes(nome,sigla),obras(nome,codigo)')
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

  // ── gerar PDF com papel timbrado ───────────────────────────────────────────
  async function gerarPDF() {
    if (!modeloSel) return
    const varMap = buildVarMap(colabSel, empData)
    let htmlConteudo = modeloSel.conteudo
    if (htmlConteudo.trimStart().startsWith('#') || (!htmlConteudo.includes('<') && htmlConteudo.includes('\n'))) {
      htmlConteudo = markdownToHtml(htmlConteudo)
    }
    htmlConteudo = aplicarVariaveis(htmlConteudo, varMap)
    const cat       = CATEGORIAS[modeloSel.categoria] ?? CATEGORIAS.outro
    const dataGer   = new Date().toLocaleDateString('pt-BR')

    if (colabSel) {
      await supabase.from('contratos_gerados').insert({
        modelo_id:      modeloSel.id,
        colaborador_id: colabSel.id,
        titulo_gerado:  `${modeloSel.titulo} — ${colabSel.nome}`,
        conteudo_final: htmlConteudo,
      })
    }

    let logoBlock = `<div class="logo-fallback">🏗️</div>`
    if (empData.logoUrl) {
      logoBlock = `<img src="${empData.logoUrl}" class="logo" alt="Logo" onerror="this.style.display='none'" />`
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>${modeloSel.titulo}${colabSel ? ' — ' + colabSel.nome : ''}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  @page { size:A4; margin:0; }
  body { font-family:'Times New Roman',Georgia,serif; font-size:12px; color:#1a1a1a; background:#fff; }
  @media print { .no-print { display:none!important; } }

  /* ── Cabeçalho timbrado ── */
  .header-timbrado { background:#1e3a5f; color:#fff; padding:16px 28px; display:flex; align-items:center; gap:16px; }
  .logo { height:60px; max-width:180px; object-fit:contain; filter:brightness(0) invert(1); border-radius:4px; }
  .logo-fallback { width:52px; height:52px; border-radius:10px; background:rgba(255,255,255,.15); display:flex; align-items:center; justify-content:center; font-size:26px; }
  .empresa-nome { font-size:18px; font-weight:900; letter-spacing:0.05em; }
  .empresa-detalhes { font-size:11px; color:#93c5fd; margin-top:4px; }

  /* ── Linha dupla ── */
  .linha-dupla { border-top:3px solid #1e3a5f; border-bottom:1px solid #93c5fd; margin-bottom:0; }

  /* ── Área de conteúdo ── */
  .content-area { padding:28px 36px 36px; font-family:'Times New Roman',serif; font-size:12px; line-height:1.8; position:relative; }

  /* ── Marca d'água ── */
  .watermark { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-45deg); font-size:72px; color:rgba(30,58,95,.04); font-weight:900; pointer-events:none; z-index:0; white-space:nowrap; font-family:Arial,sans-serif; letter-spacing:.1em; }

  /* ── Conteúdo do doc ── */
  h1 { font-size:18pt; font-weight:900; text-align:center; margin:0 0 12px; text-transform:uppercase; letter-spacing:.04em; line-height:1.3; }
  h2 { font-size:14pt; font-weight:800; margin:16px 0 6px; text-transform:uppercase; letter-spacing:.04em; border-bottom:1.5px solid #334155; padding-bottom:3px; line-height:1.3; }
  h3 { font-size:12pt; font-weight:700; margin:12px 0 4px; line-height:1.4; }
  h4 { font-size:11pt; font-weight:700; margin:10px 0 3px; font-style:italic; line-height:1.4; }
  blockquote { font-size:11pt; margin:10px 0; border-left:3px solid #94a3b8; padding-left:12px; color:#475569; font-style:italic; line-height:1.6; }
  p  { font-size:12pt; margin:8px 0; line-height:1.6; }
  table { width:100%; border-collapse:collapse; margin:10px 0; font-size:11px; }
  table td,table th { border:1px solid #d1d5db; padding:5px 8px; }
  table th { background:#f8fafc; font-weight:700; }

  /* ── Badge categoria ── */
  .badge { display:inline-block; background:${cat.bg}; color:${cat.cor}; border-radius:20px; padding:2px 10px; font-size:10px; font-weight:700; margin-bottom:12px; font-family:Arial,sans-serif; }

  /* ── Info doc ── */
  .doc-meta { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; }
  .doc-meta-right { font-size:10px; color:#64748b; text-align:right; font-family:Arial,sans-serif; }

  /* ── Assinaturas ── */
  .sign-block { margin-top:48px; display:flex; gap:40px; }
  .sign-line { flex:1; border-top:1px solid #0f172a; padding-top:8px; text-align:center; font-size:11px; }

  /* ── Botão imprimir ── */
  .no-print { position:fixed; bottom:20px; right:20px; background:#1d4ed8; color:#fff; border:none; border-radius:9px; padding:11px 22px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.25); z-index:9999; font-family:Arial,sans-serif; }
  .no-print:hover { background:#1e40af; }
</style>
</head>
<body>
<div class="watermark">${empData.nome || 'EMPRESA'}</div>

<!-- Cabeçalho timbrado -->
<div class="header-timbrado">
  ${logoBlock}
  <div>
    <div class="empresa-nome">${empData.nome || 'EMPRESA'}</div>
    <div class="empresa-detalhes">${empData.cnpj ? 'CNPJ: ' + empData.cnpj : ''}${empData.cnpj && empData.endereco ? ' | ' : ''}${empData.endereco}${empData.cidade ? ' | ' + empData.cidade : ''}</div>
  </div>
</div>
<div class="linha-dupla"></div>

<!-- Conteúdo -->
<div class="content-area">
  <div class="doc-meta">
    <span class="badge">${cat.emoji} ${cat.label}</span>
    <div class="doc-meta-right">
      Emitido em ${dataGer}${colabSel ? '<br/><strong>' + colabSel.nome + '</strong>' + (colabSel.chapa ? ' · ' + colabSel.chapa : '') : ''}
    </div>
  </div>

  ${htmlConteudo}

  <div class="sign-block">
    <div class="sign-line">${empData.nome || 'Empresa'}<br/>Representante Legal</div>
    ${colabSel
      ? `<div class="sign-line">${colabSel.nome}<br/>${(colabSel.funcoes as any)?.nome ?? 'Colaborador(a)'}</div>`
      : '<div class="sign-line">Colaborador(a)<br/>Assinatura</div>'}
  </div>
</div>

<button class="no-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
</body>
</html>`

    const win = window.open('', '_blank', 'width=940,height=780')
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--background)' }}>

      {/* ── Topo ── */}
      <div style={{ padding: '12px 24px 10px', borderBottom: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            📜 Contratos e Documentos
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
            Selecione o modelo, escolha o colaborador e gere o documento preenchido automaticamente
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Abas */}
          <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 8, padding: 3 }}>
            {(['contratos', 'funcoes'] as const).map(aba => (
              <button key={aba} onClick={() => setAbaAtiva(aba)}
                style={{ padding: '5px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: abaAtiva === aba ? '#fff' : 'transparent',
                  color: abaAtiva === aba ? '#1e3a5f' : '#64748b',
                  boxShadow: abaAtiva === aba ? '0 1px 4px rgba(0,0,0,.1)' : 'none' }}>
                {aba === 'contratos' ? '📜 Contratos' : '📋 Funções'}
              </button>
            ))}
          </div>
          <button
            onClick={() => abrirEditor()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '2px solid #059669', background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            <Plus size={15} /> Novo Modelo
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* ── ABA: BANCO DE FUNÇÕES ── */}
      {/* ══════════════════════════════════════════════════════ */}
      {abaAtiva === 'funcoes' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 4px' }}>📋 Banco de Funções</h2>
              <p style={{ fontSize: 12, color: '#64748b' }}>
                Edite a descrição de cada função para que ela apareça como bloco inserível no editor de contratos.
              </p>
            </div>
            {loading ? (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>Carregando funções…</div>
            ) : funcoes.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>Nenhuma função cadastrada.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {funcoes.map(fn => (
                  <div key={fn.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{fn.nome}</div>
                      {fn.sigla && <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 6, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{fn.sigla}</span>}
                      {fn.cbo && <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 6, padding: '1px 8px', fontSize: 11 }}>CBO: {fn.cbo}</span>}
                    </div>
                    <textarea
                      value={descricaoEdit[fn.id] !== undefined ? descricaoEdit[fn.id] : (fn.descricao ?? '')}
                      onChange={e => setDescricaoEdit(prev => ({ ...prev, [fn.id]: e.target.value }))}
                      rows={3}
                      placeholder="Descreva as atividades e atribuições desta função…"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 12, fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                      <button
                        onClick={() => salvarDescricaoFuncao(fn.id)}
                        disabled={savingFunc === fn.id}
                        style={{ padding: '5px 16px', borderRadius: 7, border: '1.5px solid #059669', background: '#f0fdf4', color: '#15803d', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: savingFunc === fn.id ? 0.6 : 1 }}>
                        {savingFunc === fn.id ? 'Salvando…' : '💾 Salvar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* ── ABA: CONTRATOS — 3 colunas ── */}
      {/* ══════════════════════════════════════════════════════ */}
      {abaAtiva === 'contratos' && (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── COL 1: Lista de modelos ── */}
          <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar modelo…"
                  style={{ width: '100%', height: 32, paddingLeft: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 12, color: 'var(--foreground)', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {ALL_CATS.map(cat => {
                  const info = CATEGORIAS[cat]
                  const ativo = catFiltro === cat
                  return (
                    <button key={cat} onClick={() => setCatFiltro(cat)}
                      style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${ativo ? (info?.cor ?? '#1e3a5f') : 'transparent'}`, background: ativo ? (info?.bg ?? '#e2e8f0') : 'transparent', color: ativo ? (info?.cor ?? '#1e3a5f') : '#64748b' }}>
                      {cat === 'todos' ? 'Todos' : info?.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{modelosFiltrados.length} modelo(s)</div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando…</div>
              ) : modelosFiltrados.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum modelo encontrado</div>
              ) : modelosFiltrados.map(m => {
                const cat = CATEGORIAS[m.categoria] ?? CATEGORIAS.outro
                const sel = modeloSel?.id === m.id
                return (
                  <div key={m.id} onClick={() => setModeloSel(m)}
                    style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: sel ? 'hsl(var(--primary)/.08)' : 'transparent', borderLeft: `3px solid ${sel ? 'hsl(var(--primary))' : 'transparent'}`, transition: 'background .1s' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ minWidth: 0 }}>
                        {m.numero && <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700 }}>#{String(m.numero).padStart(2,'0')} </span>}
                        <span style={{ display: 'inline-block', background: cat.bg, color: cat.cor, borderRadius: 10, padding: '1px 6px', fontSize: 9, fontWeight: 700, marginBottom: 2 }}>{cat.emoji} {cat.label}</span>
                        <div style={{ fontSize: 12, fontWeight: sel ? 700 : 600, color: sel ? 'hsl(var(--primary))' : 'var(--foreground)', lineHeight: 1.3, marginTop: 1 }}>{m.titulo}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button onClick={e => { e.stopPropagation(); abrirEditor(m) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }} title="Editar">
                          <Pencil size={11} />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setConfirmDel(m) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }} title="Excluir">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── COL 2: Painel central ── */}
          <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {!modeloSel ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#94a3b8', padding: 24, textAlign: 'center' }}>
                <FileText size={40} strokeWidth={1.2} />
                <div style={{ fontSize: 13 }}>Selecione um modelo na lista ao lado</div>
              </div>
            ) : (
              <>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
                  {(() => { const cat = CATEGORIAS[modeloSel.categoria] ?? CATEGORIAS.outro; return (
                    <span style={{ display: 'inline-block', background: cat.bg, color: cat.cor, borderRadius: 10, padding: '2px 8px', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{cat.emoji} {cat.label}</span>
                  )})()}
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{modeloSel.titulo}</div>
                  {modeloSel.descricao && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{modeloSel.descricao}</div>}
                </div>

                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>👤 Colaborador (opcional)</div>
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <Search size={12} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input value={buscaColab} onChange={e => setBuscaColab(e.target.value)} placeholder="Nome ou chapa…"
                      style={{ width: '100%', height: 30, paddingLeft: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', fontSize: 12, outline: 'none' }} />
                  </div>
                  {colabSel && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '6px 10px', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>{colabSel.nome}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{colabSel.chapa} · {(colabSel.funcoes as any)?.nome ?? '—'}</div>
                      </div>
                      <button onClick={() => setColabSel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={13} /></button>
                    </div>
                  )}
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                    {colabsFiltrados.slice(0, 50).map(c => (
                      <div key={c.id} onClick={() => { setColabSel(c); setBuscaColab('') }}
                        style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: colabSel?.id === c.id ? 'hsl(var(--primary)/.08)' : 'transparent', fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>{c.nome}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.chapa} · {(c.funcoes as any)?.nome ?? '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {!colabSel && (
                  <div style={{ margin: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '8px 10px', fontSize: 11, color: '#92400e' }}>
                    ⚠️ Sem colaborador, os campos <span style={{ background: '#fef9c3', borderBottom: '1px solid #ca8a04', padding: '0 2px' }}>{'{{variáveis}}'}</span> ficarão em destaque.
                  </div>
                )}

                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
                  <button onClick={abrirPreview}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, border: '1px solid #0369a1', background: '#eff6ff', color: '#0369a1', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <Eye size={14} /> Pré-visualizar
                  </button>
                  <button onClick={gerarPDF}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, border: '2px solid #059669', background: 'linear-gradient(135deg,#059669,#047857)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 8px rgba(5,150,105,.3)' }}>
                    <Printer size={14} /> Gerar PDF com Timbre
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── COL 3: Preview do documento ── */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {!modeloSel ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#94a3b8' }}>
                <FileText size={56} strokeWidth={1} />
                <div style={{ fontSize: 14, textAlign: 'center' }}>Selecione um modelo para ver o preview</div>
              </div>
            ) : (
              <>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>
                    📄 Preview — {modeloSel.titulo}{colabSel ? ` · ${colabSel.nome}` : ' · (sem colaborador)'}
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8', padding: '2px 8px', background: '#f1f5f9', borderRadius: 4 }}>
                    Campos <span style={{ background: '#fef9c3', borderBottom: '1px solid #ca8a04', padding: '0 2px' }}>amarelos</span> = preenchimento manual
                  </span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: '#f0f4f8' }}>
                  {/* Papel A4 simulado */}
                  <div style={{ background: '#fff', maxWidth: 680, margin: '0 auto', borderRadius: 6, boxShadow: '0 2px 12px rgba(0,0,0,.1)', overflow: 'hidden' }}>
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
                    {/* Conteúdo */}
                    <div style={{ padding: '24px 28px', fontFamily: "'Times New Roman',Georgia,serif", fontSize: 12, lineHeight: 1.8, color: '#1a1a1a' }}
                      dangerouslySetInnerHTML={{ __html: previewHtml }} />
                  </div>
                </div>
              </>
            )}
          </div>
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
              {[
                { cmd: 'justifyLeft',   label: '⬛▬▬', title: 'Alinhar à esquerda' },
                { cmd: 'justifyCenter', label: '▬⬛▬', title: 'Centralizar' },
                { cmd: 'justifyRight',  label: '▬▬⬛', title: 'Alinhar à direita' },
                { cmd: 'justifyFull',   label: '▬▬▬', title: 'Justificado' },
              ].map(({ cmd, label, title }) => (
                <button key={cmd} onMouseDown={e => { e.preventDefault(); exec(cmd) }}
                  title={title}
                  style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {label === '⬛▬▬' ? (
                    <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><rect x="0" y="0" width="14" height="2" rx="1" fill="#475569"/><rect x="0" y="5" width="10" height="2" rx="1" fill="#475569"/><rect x="0" y="10" width="12" height="2" rx="1" fill="#475569"/></svg>
                  ) : cmd === 'justifyCenter' ? (
                    <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><rect x="0" y="0" width="14" height="2" rx="1" fill="#475569"/><rect x="2" y="5" width="10" height="2" rx="1" fill="#475569"/><rect x="1" y="10" width="12" height="2" rx="1" fill="#475569"/></svg>
                  ) : cmd === 'justifyRight' ? (
                    <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><rect x="0" y="0" width="14" height="2" rx="1" fill="#475569"/><rect x="4" y="5" width="10" height="2" rx="1" fill="#475569"/><rect x="2" y="10" width="12" height="2" rx="1" fill="#475569"/></svg>
                  ) : (
                    <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><rect x="0" y="0" width="14" height="2" rx="1" fill="#475569"/><rect x="0" y="5" width="14" height="2" rx="1" fill="#475569"/><rect x="0" y="10" width="14" height="2" rx="1" fill="#475569"/></svg>
                  )}
                </button>
              ))}

              <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />

              {/* ── GRUPO 5: Indentação ── */}
              <button onMouseDown={e => { e.preventDefault(); exec('indent') }}
                title="Aumentar recuo"
                style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M0 1h14M4 5h10M4 9h10M0 5l3 2-3 2V5z" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
              </button>
              <button onMouseDown={e => { e.preventDefault(); exec('outdent') }}
                title="Diminuir recuo"
                style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M0 1h14M4 5h10M4 9h10M3 5l-3 2 3 2V5z" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
              </button>

              <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />

              {/* ── GRUPO 6: Listas ── */}
              <button onMouseDown={e => { e.preventDefault(); exec('insertUnorderedList') }}
                title="Lista com marcadores"
                style={{ height: 28, padding: '0 8px', borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 14 }}>•</span> Lista
              </button>
              <button onMouseDown={e => { e.preventDefault(); exec('insertOrderedList') }}
                title="Lista numerada"
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
              <button onMouseDown={e => {
                e.preventDefault()
                exec('insertHTML', '<p style="margin:8px 0">&nbsp;</p>')
              }}
                title="Adicionar parágrafo em branco"
                style={{ height: 28, padding: '0 8px', borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                + ¶
              </button>

              <div style={{ width: 1, height: 22, background: '#e2e8f0', margin: '0 2px' }} />

              {/* ── GRUPO 9: Desfazer / Refazer ── */}
              <button onMouseDown={e => { e.preventDefault(); exec('undo') }}
                title="Desfazer (Ctrl+Z)"
                style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↩</button>
              <button onMouseDown={e => { e.preventDefault(); exec('redo') }}
                title="Refazer (Ctrl+Y)"
                style={{ width: 28, height: 28, borderRadius: 5, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↪</button>

              {/* ── Dica de atalho ── */}
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Colaborador */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>👤 Colaborador</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {VARS_COLABORADOR.map(v => (
                            <button key={v.value} onMouseDown={e => { e.preventDefault(); inserirVariavel(v.value) }}
                              style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #bae6fd', background: '#e0f2fe', color: '#0369a1', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace' }}>
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Empresa */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>🏢 Empresa</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {VARS_EMPRESA.map(v => (
                            <button key={v.value} onMouseDown={e => { e.preventDefault(); inserirVariavel(v.value) }}
                              style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #bbf7d0', background: '#dcfce7', color: '#15803d', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace' }}>
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Data */}
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>📅 Data</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {VARS_DATA.map(v => (
                            <button key={v.value} onMouseDown={e => { e.preventDefault(); inserirVariavel(v.value) }}
                              style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #fde68a', background: '#fef3c7', color: '#b45309', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'monospace' }}>
                              {v.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Funções (dropdown) */}
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
                          {fn.descricao && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, lineClamp: 2 }}>{fn.descricao.slice(0, 80)}{fn.descricao.length > 80 ? '…' : ''}</div>}
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
    </div>
  )
}
