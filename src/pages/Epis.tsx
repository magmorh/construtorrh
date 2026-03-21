import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Shield, Plus, Search, Pencil, Trash2, Link2, Unlink2,
  Package, Tag, CheckCircle2, AlertCircle, X, ChevronRight,
  Users, Building2, FileText, Download,
} from 'lucide-react'
import { toast } from 'sonner'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'

// ─── tipos ────────────────────────────────────────────────────────────────────

interface EpiCatalogo {
  id: string
  nome: string
  categoria: string
  numero_ca: string | null
  unidade: string
  requer_tamanho: boolean
  requer_numero: boolean
  vida_util_meses: number | null
  ativo: boolean
  created_at?: string
}

interface Funcao {
  id: string
  nome: string
  sigla: string | null
  ativo: boolean
}

interface FuncaoEpi {
  id: string
  funcao_id: string
  epi_id: string
  obrigatorio: boolean
  quantidade: number
  epi_catalogo: {
    id: string
    nome: string
    categoria: string
    requer_tamanho: boolean
    requer_numero: boolean
  } | null
}

interface Colaborador {
  id: string
  nome: string
  chapa: string | null
  obra_id?: string | null
}

interface Obra {
  id: string
  nome: string
}

interface ColaboradorEpi {
  id: string
  colaborador_id: string
  epi_id: string
  tamanho: string | null
  numero: string | null
  quantidade: number
  status: string | null
  epi_catalogo: {
    id: string
    nome: string
    categoria: string
  } | null
  colaboradores: {
    id: string
    nome: string
    chapa: string | null
    obra_id?: string | null
  } | null
}

type ColaboradorEpiItem = {
  id: string
  epi_id: string
  documento_url: string | null
  documento_nome: string | null
  status: string | null
  epi_catalogo: { id: string; nome: string; categoria: string | null } | null
}
type ColaboradorComEpis = {
  id: string
  nome: string
  chapa: string | null
  epis: ColaboradorEpiItem[]
  expanded: boolean
}

interface EpiFormData {
  nome: string
  categoria: string
  numero_ca: string
  unidade: string
  requer_tamanho: boolean
  requer_numero: boolean
  vida_util_meses: string
  ativo: boolean
}

interface VinculoFormData {
  epi_id: string
  obrigatorio: boolean
  quantidade: string
}

// ─── constantes ───────────────────────────────────────────────────────────────

const EMPTY_EPI_FORM: EpiFormData = {
  nome: '',
  categoria: '',
  numero_ca: '',
  unidade: 'unidade',
  requer_tamanho: false,
  requer_numero: false,
  vida_util_meses: '',
  ativo: true,
}

const EMPTY_VINCULO_FORM: VinculoFormData = {
  epi_id: '',
  obrigatorio: true,
  quantidade: '1',
}

const CATEGORIAS = [
  'Cabeça', 'Mãos', 'Pés', 'Corpo', 'Olhos', 'Respiratório', 'Auditivo', 'Outros',
]

const UNIDADES = ['unidade', 'par', 'jogo', 'conjunto']

type Aba = 'catalogo' | 'funcao' | 'solicitacoes' | 'comprovantes'

// ─── toggle inline ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          width: 40,
          height: 22,
          borderRadius: 999,
          backgroundColor: checked ? '#16a34a' : '#d1d5db',
          transition: 'background 0.2s',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            backgroundColor: '#fff',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </span>
      {label && (
        <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>
      )}
    </button>
  )
}

// ─── badge categoria ──────────────────────────────────────────────────────────

function CategoriaBadge({ categoria }: { categoria: string | null | undefined }) {
  if (!categoria) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        background: '#eff6ff',
        color: '#1d4ed8',
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      <Tag size={10} />
      {categoria}
    </span>
  )
}

// ─── componente principal ─────────────────────────────────────────────────────

export default function Epis() {
  const [aba, setAba] = useState<Aba>('catalogo')

  // ── Aba 1: catálogo ─────────────────────────────────────────────────────────
  const [epis, setEpis] = useState<EpiCatalogo[]>([])
  const [loadingEpis, setLoadingEpis] = useState(true)
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<EpiFormData>(EMPTY_EPI_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Aba 2: função-EPI ───────────────────────────────────────────────────────
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const [loadingFuncoes, setLoadingFuncoes] = useState(true)
  const [searchFuncao, setSearchFuncao] = useState('')
  const [funcaoSelecionada, setFuncaoSelecionada] = useState<Funcao | null>(null)
  const [vinculos, setVinculos] = useState<FuncaoEpi[]>([])
  const [loadingVinculos, setLoadingVinculos] = useState(false)
  const [episPorFuncao, setEpisPorFuncao] = useState<Record<string, number>>({})

  const [vinculoModalOpen, setVinculoModalOpen] = useState(false)
  const [vinculoForm, setVinculoForm] = useState<VinculoFormData>(EMPTY_VINCULO_FORM)
  const [savingVinculo, setSavingVinculo] = useState(false)
  const [deleteVinculoId, setDeleteVinculoId] = useState<string | null>(null)
  const [deletingVinculo, setDeletingVinculo] = useState(false)

  // ── Aba 3: solicitações ─────────────────────────────────────────────────────
  const [modoSolicitacao, setModoSolicitacao] = useState<'colaborador' | 'obra'>('colaborador')
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [loadingColaboradores, setLoadingColaboradores] = useState(false)
  const [loadingObras, setLoadingObras] = useState(false)
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState<string>('')
  const [obraSelecionada, setObraSelecionada] = useState<string>('')
  const [itensEpi, setItensEpi] = useState<ColaboradorEpi[]>([])
  const [loadingItens, setLoadingItens] = useState(false)
  const [gerou, setGerou] = useState(false)

  // ── Aba 4: comprovantes ──────────────────────────────────────────────────────
  const [comprovColabId, setComprovColabId]     = useState('')
  const [comprovEpiId, setComprovEpiId]         = useState('')
  const [comprovFile, setComprovFile]           = useState<File | null>(null)
  const [comprovEpis, setComprovEpis]           = useState<ColaboradorEpiItem[]>([])
  const [loadingComprov, setLoadingComprov]     = useState(false)
  const [uploadingComprov, setUploadingComprov] = useState(false)
  const [uploadModalOpen, setUploadModalOpen]   = useState(false)
  // lista completa (todos os colaboradores com EPIs)
  const [colabsComEpis, setColabsComEpis]       = useState<ColaboradorComEpis[]>([])
  const [loadingTodos, setLoadingTodos]         = useState(false)
  const [buscaColab, setBuscaColab]             = useState('')
  const [baixandoZip, setBaixandoZip]           = useState(false)

  // ── fetch catálogo ──────────────────────────────────────────────────────────
  const fetchEpis = useCallback(async () => {
    setLoadingEpis(true)
    const { data, error } = await supabase
      .from('epi_catalogo')
      .select('*')
      .order('nome')
    setLoadingEpis(false)
    if (error) { toast.error(error.message); return }
    setEpis(data ?? [])
  }, [])

  // ── fetch funções ───────────────────────────────────────────────────────────
  const fetchFuncoes = useCallback(async () => {
    setLoadingFuncoes(true)
    const { data, error } = await supabase
      .from('funcoes')
      .select('id, nome, sigla, ativo')
      .eq('ativo', true)
      .order('nome')
    setLoadingFuncoes(false)
    if (error) { toast.error(error.message); return }
    setFuncoes((data as Funcao[]) ?? [])
  }, [])

  // ── fetch contagem de EPIs por função ───────────────────────────────────────
  const fetchEpisPorFuncao = useCallback(async () => {
    const { data, error } = await supabase
      .from('funcao_epi')
      .select('funcao_id')
    if (error || !data) return
    const contagem: Record<string, number> = {}
    data.forEach((row: { funcao_id: string }) => {
      contagem[row.funcao_id] = (contagem[row.funcao_id] ?? 0) + 1
    })
    setEpisPorFuncao(contagem)
  }, [])

  // ── fetch vínculos da função ────────────────────────────────────────────────
  const fetchVinculos = useCallback(async (funcaoId: string) => {
    if (!funcaoId) { setVinculos([]); return }
    setLoadingVinculos(true)
    const { data, error } = await supabase
      .from('funcao_epi')
      .select('*, epi_catalogo(id, nome, categoria, requer_tamanho, requer_numero)')
      .eq('funcao_id', funcaoId)
    setLoadingVinculos(false)
    if (error) { toast.error(error.message); return }
    setVinculos((data as FuncaoEpi[]) ?? [])
  }, [])

  // ── fetch colaboradores ─────────────────────────────────────────────────────
  const fetchColaboradores = useCallback(async () => {
    setLoadingColaboradores(true)
    const { data, error } = await supabase
      .from('colaboradores')
      .select('id, nome, chapa')
      .eq('status', 'ativo')
      .order('nome')
    setLoadingColaboradores(false)
    if (error) { toast.error(error.message); return }
    setColaboradores((data as Colaborador[]) ?? [])
  }, [])

  // ── fetch obras ─────────────────────────────────────────────────────────────
  const fetchObras = useCallback(async () => {
    setLoadingObras(true)
    const { data, error } = await supabase
      .from('obras')
      .select('id, nome')
      .order('nome')
    setLoadingObras(false)
    if (error) { toast.error(error.message); return }
    setObras((data as Obra[]) ?? [])
  }, [])

  useEffect(() => { fetchEpis() }, [fetchEpis])
  useEffect(() => { fetchFuncoes(); fetchEpisPorFuncao() }, [fetchFuncoes, fetchEpisPorFuncao])
  useEffect(() => {
    if (aba === 'comprovantes') {
      fetchTodosColabsEpis()
    }
    if (aba === 'solicitacoes') {
      fetchColaboradores()
      fetchObras()
    }
  }, [aba, fetchColaboradores, fetchObras])
  useEffect(() => {
    if (funcaoSelecionada) fetchVinculos(funcaoSelecionada.id)
    else setVinculos([])
  }, [funcaoSelecionada, fetchVinculos])

  // ── filtro busca catálogo ───────────────────────────────────────────────────
  const filtered = epis.filter(e =>
    e.nome.toLowerCase().includes(search.toLowerCase()) ||
    (e.categoria ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (e.numero_ca ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  // ── filtro busca funções ────────────────────────────────────────────────────
  const funcoesFiltradas = funcoes.filter(f =>
    f.nome.toLowerCase().includes(searchFuncao.toLowerCase()) ||
    (f.sigla ?? '').toLowerCase().includes(searchFuncao.toLowerCase()),
  )

  // ── abrir modal catálogo ────────────────────────────────────────────────────
  const openNew = () => {
    setEditId(null)
    setForm(EMPTY_EPI_FORM)
    setModalOpen(true)
  }

  const openEdit = (epi: EpiCatalogo) => {
    setEditId(epi.id)
    setForm({
      nome: epi.nome,
      categoria: epi.categoria ?? '',
      numero_ca: epi.numero_ca ?? '',
      unidade: epi.unidade ?? 'unidade',
      requer_tamanho: epi.requer_tamanho,
      requer_numero: epi.requer_numero,
      vida_util_meses: epi.vida_util_meses != null ? String(epi.vida_util_meses) : '',
      ativo: epi.ativo,
    })
    setModalOpen(true)
  }

  // ── salvar EPI ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    const payload = {
      nome: form.nome.trim(),
      categoria: form.categoria || null,
      numero_ca: form.numero_ca.trim() || null,
      unidade: form.unidade || 'unidade',
      requer_tamanho: form.requer_tamanho,
      requer_numero: form.requer_numero,
      vida_util_meses: form.vida_util_meses ? parseInt(form.vida_util_meses, 10) : null,
      ativo: form.ativo,
    }
    const { error } = editId
      ? await supabase.from('epi_catalogo').update(payload).eq('id', editId)
      : await supabase.from('epi_catalogo').insert(payload)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editId ? 'EPI atualizado!' : 'EPI cadastrado!')
    setModalOpen(false)
    fetchEpis()
  }

  // ── excluir EPI ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const { error } = await supabase.from('epi_catalogo').delete().eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    if (error) { toast.error(error.message); return }
    toast.success('EPI excluído!')
    fetchEpis()
  }

  // ── vincular EPI à função ───────────────────────────────────────────────────
  const handleSaveVinculo = async () => {
    if (!funcaoSelecionada) { toast.error('Selecione uma função'); return }
    if (!vinculoForm.epi_id) { toast.error('Selecione um EPI'); return }
    setSavingVinculo(true)
    const { error } = await supabase.from('funcao_epi').insert({
      funcao_id: funcaoSelecionada.id,
      epi_id: vinculoForm.epi_id,
      obrigatorio: vinculoForm.obrigatorio,
      quantidade: parseInt(vinculoForm.quantidade, 10) || 1,
    })
    setSavingVinculo(false)
    if (error) { toast.error(error.message); return }
    toast.success('EPI vinculado à função!')
    setVinculoModalOpen(false)
    setVinculoForm(EMPTY_VINCULO_FORM)
    fetchVinculos(funcaoSelecionada.id)
    fetchEpisPorFuncao()
    // ── Auto-sync: inserir EPI para colaboradores que já têm esta função ────────
    try {
      const { data: colabs } = await supabase
        .from('colaboradores')
        .select('id')
        .eq('funcao_id', funcaoSelecionada.id)
        .eq('ativo', true)
      if (colabs && colabs.length > 0) {
        const rows = colabs.map((col: any) => ({
          colaborador_id: col.id,
          epi_id: vinculoForm.epi_id,
          status: 'pendente',
          obrigatorio: vinculoForm.obrigatorio,
          quantidade: parseInt(vinculoForm.quantidade, 10) || 1,
        }))
        // upsert: ignora se já existe (evita duplicatas)
        await supabase.from('colaborador_epi').upsert(rows, { onConflict: 'colaborador_id,epi_id', ignoreDuplicates: true })
        if (colabs.length > 0) {
          toast.info(`🔄 EPI adicionado a ${colabs.length} colaborador(es) com esta função`)
        }
      }
    } catch { /* não bloqueia */ }
  }

  // ── desvincular EPI ─────────────────────────────────────────────────────────
  const handleDeleteVinculo = async () => {
    if (!deleteVinculoId) return
    setDeletingVinculo(true)
    const { error } = await supabase.from('funcao_epi').delete().eq('id', deleteVinculoId)
    setDeletingVinculo(false)
    setDeleteVinculoId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Vínculo removido!')
    if (funcaoSelecionada) fetchVinculos(funcaoSelecionada.id)
    fetchEpisPorFuncao()
  }

  // ── gerar solicitação ───────────────────────────────────────────────────────
  const handleGerarSolicitacao = async () => {
    if (modoSolicitacao === 'colaborador' && !colaboradorSelecionado) {
      toast.error('Selecione um colaborador')
      return
    }
    if (modoSolicitacao === 'obra' && !obraSelecionada) {
      toast.error('Selecione uma obra')
      return
    }

    setLoadingItens(true)
    setGerou(false)

    if (modoSolicitacao === 'colaborador') {
      const { data, error } = await supabase
        .from('colaborador_epi')
        .select('*, epi_catalogo(id, nome, categoria), colaboradores(id, nome, chapa, obra_id)')
        .eq('colaborador_id', colaboradorSelecionado)
      setLoadingItens(false)
      if (error) { toast.error(error.message); return }
      setItensEpi((data as ColaboradorEpi[]) ?? [])
    } else {
      // Busca colaboradores da obra e seus EPIs
      const { data: colabs, error: erColabs } = await supabase
        .from('colaboradores')
        .select('id')
        .eq('obra_id', obraSelecionada)
        .eq('status', 'ativo')

      if (erColabs) { toast.error(erColabs.message); setLoadingItens(false); return }

      const ids = (colabs ?? []).map((c: { id: string }) => c.id)
      if (ids.length === 0) {
        setLoadingItens(false)
        setItensEpi([])
        setGerou(true)
        return
      }

      const { data, error } = await supabase
        .from('colaborador_epi')
        .select('*, epi_catalogo(id, nome, categoria), colaboradores(id, nome, chapa, obra_id)')
        .in('colaborador_id', ids)
      setLoadingItens(false)
      if (error) { toast.error(error.message); return }
      setItensEpi((data as ColaboradorEpi[]) ?? [])
    }

    setGerou(true)
  }

  // ── EPIs disponíveis para vincular (excluindo já vinculados) ─────────────────
  const episDisponiveis = epis.filter(
    e => e.ativo && !vinculos.some(v => v.epi_id === e.id),
  )

  // ── totais por categoria (Aba 3) ────────────────────────────────────────────
  const totaisPorCategoria: Record<string, number> = {}
  itensEpi.forEach(item => {
    const cat = item.epi_catalogo?.categoria ?? 'Outros'
    totaisPorCategoria[cat] = (totaisPorCategoria[cat] ?? 0) + (item.quantidade ?? 1)
  })

  // ─── estilos das abas ──────────────────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--color-primary, #2563eb)' : '#6b7280',
    borderBottom: active ? '2px solid var(--color-primary, #2563eb)' : '2px solid transparent',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  })

  // ─── nome da obra selecionada (para título da solicitação) ─────────────────
  const obraNome = obras.find(o => o.id === obraSelecionada)?.nome ?? ''
  const colaboradorNome = colaboradores.find(c => c.id === colaboradorSelecionado)?.nome ?? ''

  // ── fetch EPIs do colaborador (aba Comprovantes) ─────────────────────────────
  const fetchComprovEpis = async (colaboradorId: string) => {
    setLoadingComprov(true)
    const { data } = await supabase
      .from('colaborador_epi')
      .select('id, epi_id, documento_url, documento_nome, status, epi_catalogo(id, nome, categoria)')
      .eq('colaborador_id', colaboradorId)
    setComprovEpis((data as unknown as ColaboradorEpiItem[]) ?? [])
    setLoadingComprov(false)
  }

  // Carrega TODOS colaboradores com seus EPIs
  const fetchTodosColabsEpis = async () => {
    setLoadingTodos(true)
    const { data } = await supabase
      .from('colaborador_epi')
      .select('id, epi_id, documento_url, documento_nome, status, colaborador_id, epi_catalogo(id, nome, categoria), colaboradores(id, nome, chapa)')
      .order('colaborador_id')
    if (!data) { setLoadingTodos(false); return }
    // Agrupar por colaborador
    const map = new Map<string, ColaboradorComEpis>()
    for (const row of data as any[]) {
      const colId = row.colaborador_id
      const colNome = row.colaboradores?.nome ?? '—'
      const colChapa = row.colaboradores?.chapa ?? null
      if (!map.has(colId)) {
        map.set(colId, { id: colId, nome: colNome, chapa: colChapa, epis: [], expanded: false })
      }
      map.get(colId)!.epis.push({
        id: row.id,
        epi_id: row.epi_id,
        documento_url: row.documento_url,
        documento_nome: row.documento_nome,
        status: row.status,
        epi_catalogo: row.epi_catalogo,
      })
    }
    setColabsComEpis(Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome)))
    setLoadingTodos(false)
  }

  // Baixar todos os comprovantes como ZIP
  const baixarTodosZip = async () => {
    const todosComDoc = colabsComEpis
      .flatMap(c => c.epis.filter(e => e.documento_url).map(e => ({ colab: c.nome, epi: e })))
    if (todosComDoc.length === 0) { toast.warning('Nenhum comprovante disponível para download'); return }
    setBaixandoZip(true)
    try {
      const zip = new JSZip()
      await Promise.all(
        todosComDoc.map(async ({ colab, epi }) => {
          try {
            const resp = await fetch(epi.documento_url!)
            const blob = await resp.blob()
            const ext  = epi.documento_nome?.split('.').pop() ?? 'pdf'
            const nome = `${colab.replace(/[^a-zA-Z0-9]/g, '_')}_${(epi.epi_catalogo?.nome ?? epi.epi_id).replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`
            zip.file(nome, blob)
          } catch { /* ignorar arquivo indisponível */ }
        })
      )
      const blob = await zip.generateAsync({ type: 'blob' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `comprovantes_epi_${new Date().toISOString().slice(0,10)}.zip`
      a.click(); URL.revokeObjectURL(url)
      toast.success(`✅ ${todosComDoc.length} comprovante(s) baixado(s)!`)
    } catch (e: any) {
      toast.error('Erro ao gerar ZIP: ' + e.message)
    }
    setBaixandoZip(false)
  }

  // Toggle expand de um colaborador na listagem
  const toggleExpand = (colabId: string) =>
    setColabsComEpis(prev => prev.map(c => c.id === colabId ? { ...c, expanded: !c.expanded } : c))

  // ── gerarPDF (aba Solicitações) ──────────────────────────────────────────────
  const gerarPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' })

    const titulo = modoSolicitacao === 'colaborador'
      ? `Solicitação de EPIs — ${colaboradorNome}`
      : `Solicitação de EPIs — ${obraNome}`

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(titulo, 14, 18)

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 25)
    doc.setTextColor(0)

    const colunas: string[] = modoSolicitacao === 'obra'
      ? ['Colaborador', 'EPI', 'Categoria', 'Tamanho', 'Nº Calç.', 'Qtd']
      : ['EPI', 'Categoria', 'Tamanho', 'Nº Calç.', 'Qtd']

    const linhas = itensEpi.map(item => {
      const base = [
        item.epi_catalogo?.nome ?? '—',
        item.epi_catalogo?.categoria ?? '—',
        item.tamanho ?? '—',
        item.numero ?? '—',
        String(item.quantidade ?? 1),
      ]
      if (modoSolicitacao === 'obra') {
        return [item.colaboradores?.nome ?? '—', ...base]
      }
      return base
    })

    autoTable(doc, {
      head: [colunas],
      body: linhas,
      startY: 30,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 248, 255] },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY ?? 100
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Resumo por Categoria', 14, finalY + 12)

    const resumoLinhas = Object.entries(
      itensEpi.reduce((acc, item) => {
        const cat = item.epi_catalogo?.categoria ?? 'Sem categoria'
        acc[cat] = (acc[cat] ?? 0) + (item.quantidade ?? 1)
        return acc
      }, {} as Record<string, number>)
    ).map(([cat, total]) => [cat, String(total)])

    resumoLinhas.push(['TOTAL GERAL', String(itensEpi.reduce((acc, i) => acc + (i.quantidade ?? 1), 0))])

    autoTable(doc, {
      head: [['Categoria', 'Quantidade']],
      body: resumoLinhas,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      startY: (finalY as any) + 16,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { font: 'helvetica' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      willDrawCell: (data: any) => {
        if (data.row.index === resumoLinhas.length - 1) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [219, 234, 254]
        }
      },
    })

    const nomearq = modoSolicitacao === 'colaborador'
      ? `epi_${colaboradorNome.replace(/\s+/g, '_')}.pdf`
      : `epi_obra_${obraNome.replace(/\s+/g, '_')}.pdf`

    doc.save(nomearq)
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="EPIs"
        subtitle="Equipamentos de Proteção Individual — catálogo, vínculos e solicitações"
        action={
          aba === 'catalogo' ? (
            <Button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} /> Novo EPI
            </Button>
          ) : aba === 'funcao' && funcaoSelecionada ? (
            <Button
              onClick={() => { setVinculoForm(EMPTY_VINCULO_FORM); setVinculoModalOpen(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Link2 size={16} /> Vincular EPI
            </Button>
          ) : aba === 'solicitacoes' && gerou && itensEpi.length > 0 ? (
            <Button
              variant="outline"
              onClick={gerarPDF}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={16} /> Gerar PDF
            </Button>
          ) : null
        }
      />

      {/* ── abas ── */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb',
          marginBottom: 24,
          gap: 4,
          overflowX: 'auto',
        }}
      >
        <button style={tabStyle(aba === 'catalogo')} onClick={() => setAba('catalogo')}>
          📦 Catálogo de EPIs
        </button>
        <button style={tabStyle(aba === 'funcao')} onClick={() => setAba('funcao')}>
          🔗 EPIs por Função
        </button>
        <button style={tabStyle(aba === 'solicitacoes')} onClick={() => setAba('solicitacoes')}>
          📋 Solicitações de EPI
        </button>
        <button style={tabStyle(aba === 'comprovantes')} onClick={() => setAba('comprovantes')}>
          📎 Comprovantes
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          ABA 1 — CATÁLOGO
      ══════════════════════════════════════════════════════════════════════════ */}
      {aba === 'catalogo' && (
        <div>
          {/* Busca */}
          <div style={{ position: 'relative', maxWidth: 380, marginBottom: 20 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
                pointerEvents: 'none',
              }}
            />
            <Input
              style={{ paddingLeft: 36 }}
              placeholder="Buscar por nome, categoria ou CA…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Tabela */}
          {loadingEpis ? (
            <LoadingSkeleton rows={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Package size={32} />}
              title="Nenhum EPI encontrado"
              description="Cadastre o primeiro EPI ou ajuste a busca."
              action={
                <Button onClick={openNew} size="sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Plus size={14} /> Novo EPI
                </Button>
              }
            />
          ) : (
            <div style={{ borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#fff' }}>
              <Table>
                <TableHeader>
                  <TableRow style={{ background: '#f9fafb' }}>
                    <TableHead>Nome</TableHead>
                    <TableHead style={{ width: 120 }}>Categoria</TableHead>
                    <TableHead style={{ width: 110 }}>Nº CA</TableHead>
                    <TableHead style={{ width: 100, textAlign: 'center' }}>Requer Tam.</TableHead>
                    <TableHead style={{ width: 100, textAlign: 'center' }}>Requer Nº</TableHead>
                    <TableHead style={{ width: 110, textAlign: 'center' }}>Vida Útil</TableHead>
                    <TableHead style={{ width: 80, textAlign: 'center' }}>Status</TableHead>
                    <TableHead style={{ width: 80, textAlign: 'right' }}>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(epi => (
                    <TableRow key={epi.id} style={{ transition: 'background 0.15s' }}>
                      {/* Nome */}
                      <TableCell>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Shield size={15} style={{ color: '#2563eb', flexShrink: 0 }} />
                          <span style={{ fontWeight: 500 }}>{epi.nome}</span>
                        </div>
                      </TableCell>

                      {/* Categoria */}
                      <TableCell>
                        <CategoriaBadge categoria={epi.categoria} />
                      </TableCell>

                      {/* Nº CA */}
                      <TableCell>
                        {epi.numero_ca ? (
                          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#374151' }}>
                            {epi.numero_ca}
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                        )}
                      </TableCell>

                      {/* Requer Tamanho */}
                      <TableCell style={{ textAlign: 'center' }}>
                        {epi.requer_tamanho ? (
                          <CheckCircle2 size={16} style={{ color: '#16a34a', margin: '0 auto' }} />
                        ) : (
                          <X size={16} style={{ color: '#d1d5db', margin: '0 auto' }} />
                        )}
                      </TableCell>

                      {/* Requer Número */}
                      <TableCell style={{ textAlign: 'center' }}>
                        {epi.requer_numero ? (
                          <CheckCircle2 size={16} style={{ color: '#16a34a', margin: '0 auto' }} />
                        ) : (
                          <X size={16} style={{ color: '#d1d5db', margin: '0 auto' }} />
                        )}
                      </TableCell>

                      {/* Vida Útil */}
                      <TableCell style={{ textAlign: 'center' }}>
                        {epi.vida_util_meses != null ? (
                          <span style={{ fontSize: 13, color: '#374151' }}>
                            {epi.vida_util_meses}{' '}
                            <span style={{ fontSize: 11, color: '#6b7280' }}>
                              {epi.vida_util_meses === 1 ? 'mês' : 'meses'}
                            </span>
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 500,
                            background: epi.ativo ? '#dcfce7' : '#fee2e2',
                            color: epi.ativo ? '#166534' : '#991b1b',
                          }}
                        >
                          {epi.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </TableCell>

                      {/* Ações */}
                      <TableCell style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                          <Button
                            variant="ghost"
                            size="icon"
                            style={{ width: 32, height: 32 }}
                            onClick={() => openEdit(epi)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            style={{ width: 32, height: 32, color: '#dc2626' }}
                            onClick={() => setDeleteId(epi.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          ABA 2 — EPIs POR FUNÇÃO (layout 2 colunas)
      ══════════════════════════════════════════════════════════════════════════ */}
      {aba === 'funcao' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>

          {/* ─── Coluna esquerda: lista de funções ─── */}
          <div
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              background: '#fff',
              overflow: 'hidden',
            }}
          >
            {/* Header + busca */}
            <div
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #e5e7eb',
                background: '#f9fafb',
              }}
            >
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                <Users size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                Funções Ativas
              </p>
              <div style={{ position: 'relative' }}>
                <Search
                  size={13}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#9ca3af',
                    pointerEvents: 'none',
                  }}
                />
                <Input
                  style={{ paddingLeft: 30, height: 32, fontSize: 13 }}
                  placeholder="Filtrar funções…"
                  value={searchFuncao}
                  onChange={e => setSearchFuncao(e.target.value)}
                />
              </div>
            </div>

            {/* Lista */}
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              {loadingFuncoes ? (
                <div style={{ padding: 16 }}>
                  <LoadingSkeleton rows={5} />
                </div>
              ) : funcoesFiltradas.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  Nenhuma função encontrada
                </div>
              ) : (
                funcoesFiltradas.map(f => {
                  const isSelected = funcaoSelecionada?.id === f.id
                  const qtdEpis = episPorFuncao[f.id] ?? 0
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFuncaoSelecionada(f)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '12px 16px',
                        border: 'none',
                        borderLeft: isSelected ? '3px solid #2563eb' : '3px solid transparent',
                        background: isSelected ? '#eff6ff' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        borderBottom: '1px solid #f3f4f6',
                      }}
                    >
                      {/* Sigla */}
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: isSelected ? '#2563eb' : '#e5e7eb',
                          color: isSelected ? '#fff' : '#4b5563',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {f.sigla ? f.sigla.substring(0, 3).toUpperCase() : f.nome.substring(0, 2).toUpperCase()}
                      </div>

                      {/* Nome + badge */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 13,
                            fontWeight: isSelected ? 600 : 400,
                            color: isSelected ? '#1e40af' : '#374151',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {f.nome}
                        </p>
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: 2,
                            fontSize: 11,
                            padding: '1px 6px',
                            borderRadius: 999,
                            background: qtdEpis > 0 ? '#dcfce7' : '#f3f4f6',
                            color: qtdEpis > 0 ? '#166534' : '#9ca3af',
                            fontWeight: 500,
                          }}
                        >
                          {qtdEpis} {qtdEpis === 1 ? 'EPI' : 'EPIs'}
                        </span>
                      </div>

                      <ChevronRight
                        size={14}
                        style={{ color: isSelected ? '#2563eb' : '#d1d5db', flexShrink: 0 }}
                      />
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* ─── Coluna direita: EPIs da função ─── */}
          <div>
            {!funcaoSelecionada ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 60,
                  border: '2px dashed #e5e7eb',
                  borderRadius: 10,
                  color: '#9ca3af',
                  gap: 12,
                }}
              >
                <Unlink2 size={40} style={{ color: '#d1d5db' }} />
                <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Nenhuma função selecionada</p>
                <p style={{ margin: 0, fontSize: 13 }}>← Selecione uma função na lista ao lado</p>
              </div>
            ) : (
              <div>
                {/* Header da coluna direita */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>
                      {funcaoSelecionada.nome}
                      {funcaoSelecionada.sigla && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 12,
                            fontWeight: 500,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: '#eff6ff',
                            color: '#2563eb',
                            verticalAlign: 'middle',
                          }}
                        >
                          {funcaoSelecionada.sigla}
                        </span>
                      )}
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>
                      {vinculos.length} EPI{vinculos.length !== 1 ? 's' : ''} vinculado{vinculos.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => { setVinculoForm(EMPTY_VINCULO_FORM); setVinculoModalOpen(true) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Plus size={14} /> Vincular EPI
                  </Button>
                </div>

                {/* Tabela de vínculos */}
                {loadingVinculos ? (
                  <LoadingSkeleton rows={4} />
                ) : vinculos.length === 0 ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '40px 24px',
                      border: '1px dashed #e5e7eb',
                      borderRadius: 8,
                      color: '#9ca3af',
                      gap: 8,
                      background: '#fafafa',
                    }}
                  >
                    <Shield size={28} style={{ color: '#d1d5db' }} />
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Nenhum EPI vinculado</p>
                    <p style={{ margin: 0, fontSize: 13 }}>
                      Clique em "+ Vincular EPI" para adicionar EPIs a esta função.
                    </p>
                  </div>
                ) : (
                  <div style={{ borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#fff' }}>
                    <Table>
                      <TableHeader>
                        <TableRow style={{ background: '#f9fafb' }}>
                          <TableHead>Nome EPI</TableHead>
                          <TableHead style={{ width: 120 }}>Categoria</TableHead>
                          <TableHead style={{ width: 110, textAlign: 'center' }}>Obrigatório</TableHead>
                          <TableHead style={{ width: 100, textAlign: 'center' }}>Quantidade</TableHead>
                          <TableHead style={{ width: 80, textAlign: 'center' }}>Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vinculos.map(v => (
                          <TableRow key={v.id} style={{ transition: 'background 0.15s' }}>
                            {/* Nome EPI */}
                            <TableCell>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Shield size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                                <span style={{ fontWeight: 500 }}>
                                  {v.epi_catalogo?.nome ?? '—'}
                                </span>
                              </div>
                            </TableCell>

                            {/* Categoria */}
                            <TableCell>
                              <CategoriaBadge categoria={v.epi_catalogo?.categoria} />
                            </TableCell>

                            {/* Obrigatório */}
                            <TableCell style={{ textAlign: 'center' }}>
                              {v.obrigatorio ? (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    background: '#fef2f2',
                                    color: '#991b1b',
                                    fontSize: 11,
                                    fontWeight: 600,
                                  }}
                                >
                                  <AlertCircle size={11} />
                                  Sim
                                </span>
                              ) : (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    background: '#f3f4f6',
                                    color: '#6b7280',
                                    fontSize: 11,
                                    fontWeight: 500,
                                  }}
                                >
                                  Não
                                </span>
                              )}
                            </TableCell>

                            {/* Quantidade */}
                            <TableCell style={{ textAlign: 'center', fontWeight: 600, fontSize: 14 }}>
                              {v.quantidade}
                            </TableCell>

                            {/* Desvincular */}
                            <TableCell style={{ textAlign: 'center' }}>
                              <Button
                                variant="ghost"
                                size="icon"
                                style={{ width: 32, height: 32, color: '#dc2626' }}
                                title="Desvincular EPI"
                                onClick={() => setDeleteVinculoId(v.id)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          ABA 3 — SOLICITAÇÕES DE EPI
      ══════════════════════════════════════════════════════════════════════════ */}
      {aba === 'solicitacoes' && (
        <div>
          {/* ── Painel de filtros ── */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: '20px 24px',
              marginBottom: 24,
            }}
          >
            <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <FileText size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Gerar Solicitação
            </p>

            {/* Modo */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => { setModoSolicitacao('colaborador'); setGerou(false); setItensEpi([]) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid',
                  borderColor: modoSolicitacao === 'colaborador' ? '#2563eb' : '#e5e7eb',
                  background: modoSolicitacao === 'colaborador' ? '#eff6ff' : '#f9fafb',
                  color: modoSolicitacao === 'colaborador' ? '#1d4ed8' : '#6b7280',
                  fontSize: 13,
                  fontWeight: modoSolicitacao === 'colaborador' ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <Users size={14} />
                👤 Por Colaborador
              </button>
              <button
                type="button"
                onClick={() => { setModoSolicitacao('obra'); setGerou(false); setItensEpi([]) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid',
                  borderColor: modoSolicitacao === 'obra' ? '#2563eb' : '#e5e7eb',
                  background: modoSolicitacao === 'obra' ? '#eff6ff' : '#f9fafb',
                  color: modoSolicitacao === 'obra' ? '#1d4ed8' : '#6b7280',
                  fontSize: 13,
                  fontWeight: modoSolicitacao === 'obra' ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <Building2 size={14} />
                🏗️ Por Obra
              </button>
            </div>

            {/* Select de colaborador ou obra */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                {modoSolicitacao === 'colaborador' ? (
                  <>
                    <Label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                      Colaborador
                    </Label>
                    {loadingColaboradores ? (
                      <div style={{ height: 38, background: '#f3f4f6', borderRadius: 6 }} />
                    ) : (
                      <Select
                        value={colaboradorSelecionado || undefined}
                        onValueChange={v => { setColaboradorSelecionado(v); setGerou(false); setItensEpi([]) }}
                      >
                        <SelectTrigger style={{ width: '100%' }}>
                          <SelectValue placeholder="Selecione um colaborador…" />
                        </SelectTrigger>
                        <SelectContent>
                          {colaboradores.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}{c.chapa ? ` — ${c.chapa}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                ) : (
                  <>
                    <Label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                      Obra
                    </Label>
                    {loadingObras ? (
                      <div style={{ height: 38, background: '#f3f4f6', borderRadius: 6 }} />
                    ) : (
                      <Select
                        value={obraSelecionada || undefined}
                        onValueChange={v => { setObraSelecionada(v); setGerou(false); setItensEpi([]) }}
                      >
                        <SelectTrigger style={{ width: '100%' }}>
                          <SelectValue placeholder="Selecione uma obra…" />
                        </SelectTrigger>
                        <SelectContent>
                          {obras.map(o => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                )}
              </div>

              <Button
                onClick={handleGerarSolicitacao}
                disabled={loadingItens}
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38 }}
              >
                {loadingItens ? (
                  'Gerando…'
                ) : (
                  <>
                    <FileText size={14} /> Gerar Solicitação
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* ── Resultado ── */}
          {loadingItens ? (
            <LoadingSkeleton rows={6} />
          ) : gerou && (
            <div>
              {/* Cabeçalho do resultado */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 16,
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111827' }}>
                    {modoSolicitacao === 'colaborador'
                      ? `EPIs de: ${colaboradorNome}`
                      : `EPIs da Obra: ${obraNome}`}
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>
                    {itensEpi.length} registro{itensEpi.length !== 1 ? 's' : ''} encontrado{itensEpi.length !== 1 ? 's' : ''}
                  </p>
                </div>
                {itensEpi.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={gerarPDF}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Download size={14} /> Gerar PDF
                  </Button>
                )}
              </div>

              {itensEpi.length === 0 ? (
                <EmptyState
                  icon={<Package size={32} />}
                  title="Nenhum item encontrado"
                  description={
                    modoSolicitacao === 'colaborador'
                      ? 'Este colaborador não possui registros de EPIs.'
                      : 'Nenhum colaborador ativo nesta obra possui registros de EPIs.'
                  }
                />
              ) : (
                <>
                  {/* Tabela */}
                  <div style={{ borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#fff', marginBottom: 16 }}>
                    <Table>
                      <TableHeader>
                        <TableRow style={{ background: '#f9fafb' }}>
                          {modoSolicitacao === 'obra' && (
                            <TableHead style={{ width: 180 }}>Colaborador</TableHead>
                          )}
                          <TableHead>EPI</TableHead>
                          <TableHead style={{ width: 120 }}>Categoria</TableHead>
                          <TableHead style={{ width: 90, textAlign: 'center' }}>Tamanho</TableHead>
                          <TableHead style={{ width: 80, textAlign: 'center' }}>Número</TableHead>
                          <TableHead style={{ width: 100, textAlign: 'center' }}>Qtd</TableHead>

                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensEpi.map(item => {

                          return (
                            <TableRow key={item.id} style={{ transition: 'background 0.15s' }}>
                              {modoSolicitacao === 'obra' && (
                                <TableCell>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <span style={{ fontWeight: 500, fontSize: 13 }}>
                                      {item.colaboradores?.nome ?? '—'}
                                    </span>
                                    {item.colaboradores?.chapa && (
                                      <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'monospace' }}>
                                        {item.colaboradores.chapa}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                              <TableCell>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Shield size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                                  <span style={{ fontWeight: 500 }}>
                                    {item.epi_catalogo?.nome ?? '—'}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <CategoriaBadge categoria={item.epi_catalogo?.categoria} />
                              </TableCell>
                              <TableCell style={{ textAlign: 'center' }}>
                                {item.tamanho ? (
                                  <span style={{ fontSize: 13, fontWeight: 500 }}>{item.tamanho}</span>
                                ) : (
                                  <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                                )}
                              </TableCell>
                              <TableCell style={{ textAlign: 'center' }}>
                                {item.numero ? (
                                  <span style={{ fontSize: 13, fontWeight: 500 }}>{item.numero}</span>
                                ) : (
                                  <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                                )}
                              </TableCell>
                              <TableCell style={{ textAlign: 'center', fontWeight: 600, fontSize: 14 }}>
                                {item.quantidade ?? 1}
                              </TableCell>

                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Totais por categoria */}
                  <div
                    style={{
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      padding: '14px 18px',
                    }}
                  >
                    <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Totais por Categoria
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {Object.entries(totaisPorCategoria).map(([cat, total]) => (
                        <div
                          key={cat}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 8,
                            background: '#fff',
                            border: '1px solid #e5e7eb',
                            fontSize: 13,
                          }}
                        >
                          <Tag size={12} style={{ color: '#2563eb' }} />
                          <span style={{ fontWeight: 500, color: '#374151' }}>{cat}</span>
                          <span
                            style={{
                              marginLeft: 4,
                              background: '#2563eb',
                              color: '#fff',
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              padding: '1px 7px',
                            }}
                          >
                            {total}
                          </span>
                        </div>
                      ))}
                      {/* Total geral */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          borderRadius: 8,
                          background: '#1e40af',
                          fontSize: 13,
                          marginLeft: 4,
                        }}
                      >
                        <Package size={12} style={{ color: '#bfdbfe' }} />
                        <span style={{ fontWeight: 600, color: '#bfdbfe' }}>Total geral</span>
                        <span
                          style={{
                            marginLeft: 4,
                            background: '#fff',
                            color: '#1e40af',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '1px 7px',
                          }}
                        >
                          {itensEpi.reduce((acc, i) => acc + (i.quantidade ?? 1), 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}


      {/* ════════════════════════════════════════════════════════════════════════
          ABA 4 — COMPROVANTES
      ══════════════════════════════════════════════════════════════════════════ */}
      {aba === 'comprovantes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Cabeçalho com busca e download ZIP ── */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
              <input
                value={buscaColab}
                onChange={e => setBuscaColab(e.target.value)}
                placeholder="Buscar colaborador…"
                style={{ width: '100%', paddingLeft: 32, paddingRight: 12, height: 36, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: 'var(--background)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={baixarTodosZip}
              disabled={baixandoZip || colabsComEpis.every(c => c.epis.every(e => !e.documento_url))}
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              {baixandoZip ? '⏳ Gerando ZIP…' : <><Download size={14} /> Baixar Todos</>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTodosColabsEpis}
              disabled={loadingTodos}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              🔄 Atualizar
            </Button>
          </div>

          {/* ── Resumo geral ── */}
          {!loadingTodos && colabsComEpis.length > 0 && (() => {
            const total     = colabsComEpis.reduce((a, c) => a + c.epis.length, 0)
            const comDoc    = colabsComEpis.reduce((a, c) => a + c.epis.filter(e => e.documento_url).length, 0)
            const pendentes = total - comDoc
            return (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { label: 'Colaboradores', val: colabsComEpis.length, cor: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
                  { label: 'EPIs registrados', val: total, cor: '#2563eb', bg: 'rgba(37,99,235,0.08)' },
                  { label: 'Com comprovante', val: comDoc, cor: '#059669', bg: 'rgba(5,150,105,0.08)' },
                  { label: 'Pendentes', val: pendentes, cor: pendentes > 0 ? '#d97706' : '#9ca3af', bg: pendentes > 0 ? 'rgba(217,119,6,0.08)' : 'var(--muted)' },
                ].map(r => (
                  <div key={r.label} style={{ flex: 1, minWidth: 120, padding: '12px 16px', borderRadius: 8, border: `1px solid ${r.bg}`, background: r.bg, textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: r.cor }}>{r.val}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>{r.label}</div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* ── Lista de colaboradores ── */}
          {loadingTodos ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
              ⏳ Carregando comprovantes…
            </div>
          ) : colabsComEpis.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted-foreground)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🦺</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Nenhum EPI registrado ainda</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Vincule EPIs aos colaboradores primeiro.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {colabsComEpis
                .filter(col => !buscaColab || col.nome.toLowerCase().includes(buscaColab.toLowerCase()) || (col.chapa ?? '').toLowerCase().includes(buscaColab.toLowerCase()))
                .map(col => {
                  const comDoc    = col.epis.filter(e => e.documento_url).length
                  const pendentes = col.epis.length - comDoc
                  const pct       = col.epis.length > 0 ? Math.round((comDoc / col.epis.length) * 100) : 0
                  return (
                    <div key={col.id} style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--background)' }}>
                      {/* Linha do colaborador */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: col.expanded ? 'rgba(99,102,241,0.04)' : 'transparent' }}
                        onClick={() => toggleExpand(col.id)}
                      >
                        {/* Avatar */}
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                          👤
                        </div>
                        {/* Nome + chapa */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.nome}</div>
                          {col.chapa && (
                            <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>{col.chapa}</div>
                          )}
                        </div>
                        {/* Barra de progresso */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--muted)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: pct === 100 ? '#059669' : pct > 50 ? '#3b82f6' : '#f59e0b', transition: 'width 300ms' }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: pct === 100 ? '#059669' : 'var(--muted-foreground)', minWidth: 38 }}>
                            {comDoc}/{col.epis.length}
                          </span>
                        </div>
                        {/* Badges */}
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          {comDoc > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(5,150,105,0.1)', color: '#059669', fontWeight: 700 }}>✅ {comDoc}</span>}
                          {pendentes > 0 && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(245,158,11,0.1)', color: '#d97706', fontWeight: 700 }}>⏳ {pendentes}</span>}
                        </div>
                        {/* Seta */}
                        <span style={{ fontSize: 14, color: 'var(--muted-foreground)', transform: col.expanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 150ms', flexShrink: 0 }}>▶</span>
                      </div>

                      {/* EPIs expandidos */}
                      {col.expanded && (
                        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--muted)/30' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ background: 'var(--muted)' }}>
                                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>EPI</th>
                                <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Categoria</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comprovante</th>
                                <th style={{ padding: '8px 16px', textAlign: 'center', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', width: 120 }}>Ação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {col.epis.map((epi, idx) => (
                                <tr key={epi.id} style={{ borderTop: '1px solid var(--border)' }}>
                                  <td style={{ padding: '10px 16px', fontWeight: 500 }}>{epi.epi_catalogo?.nome ?? '—'}</td>
                                  <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--muted-foreground)' }}>{epi.epi_catalogo?.categoria ?? '—'}</td>
                                  <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                                    {epi.documento_url ? (
                                      <a href={epi.documento_url} target="_blank" rel="noopener noreferrer"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#059669', fontWeight: 600, textDecoration: 'none' }}>
                                        ✅ {epi.documento_nome ?? 'Ver documento'}
                                      </a>
                                    ) : (
                                      <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>⏳ Pendente</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      style={{ fontSize: 11, height: 28, padding: '0 10px' }}
                                      onClick={() => {
                                        setComprovColabId(col.id)
                                        setComprovEpiId(epi.id)
                                        setComprovEpis(col.epis)
                                        setComprovFile(null)
                                        setUploadModalOpen(true)
                                      }}
                                    >
                                      📎 {epi.documento_url ? 'Substituir' : 'Anexar'}
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          )}

          {/* ── Modal de Upload ── */}
          <Dialog open={uploadModalOpen} onOpenChange={open => { if (!open) setUploadModalOpen(false) }}>
            <DialogContent style={{ maxWidth: 480 }}>
              <DialogHeader>
                <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  📎 Upload de Comprovante
                </DialogTitle>
              </DialogHeader>
              {(() => {
                const colSel  = colabsComEpis.find(x => x.id === comprovColabId)
                const epiSel  = comprovEpis.find(e => e.id === comprovEpiId)
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Info */}
                    <div style={{ padding: '10px 14px', borderRadius: 7, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{colSel?.nome ?? '—'}</div>
                      {colSel?.chapa && <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted-foreground)' }}>{colSel.chapa}</div>}
                      <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4 }}>
                        EPI: <strong>{epiSel?.epi_catalogo?.nome ?? '—'}</strong>
                      </div>
                    </div>

                    {/* Documento atual */}
                    {epiSel?.documento_url && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.04)' }}>
                        <span>✅</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#059669' }}>Comprovante atual</div>
                          <a href={epiSel.documento_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--primary)' }}>
                            📄 {epiSel.documento_nome ?? 'Ver documento'}
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Input arquivo */}
                    <label style={{ cursor: 'pointer' }}>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                        onChange={e => setComprovFile(e.target.files?.[0] ?? null)} />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '20px', borderRadius: 8, border: '2px dashed var(--border)', background: comprovFile ? 'rgba(59,130,246,0.04)' : 'var(--muted)' }}>
                        {comprovFile ? (
                          <>
                            <span style={{ fontSize: 20 }}>📄</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{comprovFile.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{(comprovFile.size / 1024).toFixed(0)} KB · clique para trocar</div>
                            </div>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: 24 }}>📎</span>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>Clique para selecionar</div>
                              <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>PDF, JPG ou PNG</div>
                            </div>
                          </>
                        )}
                      </div>
                    </label>

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Button variant="outline" onClick={() => setUploadModalOpen(false)}>Cancelar</Button>
                      <Button
                        disabled={!comprovFile || uploadingComprov}
                        onClick={async () => {
                          if (!comprovFile || !comprovEpiId) return
                          setUploadingComprov(true)
                          const ext  = comprovFile.name.split('.').pop()
                          const path = `${comprovColabId}/${epiSel?.epi_id ?? comprovEpiId}_${Date.now()}.${ext}`
                          const { error: upErr } = await supabase.storage.from('epi-documentos').upload(path, comprovFile, { upsert: true })
                          if (upErr) { toast.error('Falha no upload: ' + upErr.message); setUploadingComprov(false); return }
                          const { data: urlData } = supabase.storage.from('epi-documentos').getPublicUrl(path)
                          const { error: dbErr } = await supabase.from('colaborador_epi')
                            .update({ documento_url: urlData?.publicUrl, documento_nome: comprovFile.name, status: 'entregue' })
                            .eq('id', comprovEpiId)
                          if (dbErr) { toast.error('Erro ao salvar: ' + dbErr.message) }
                          else {
                            toast.success('✅ Comprovante enviado!')
                            setUploadModalOpen(false)
                            setComprovFile(null)
                            fetchTodosColabsEpis()
                          }
                          setUploadingComprov(false)
                        }}
                      >
                        {uploadingComprov ? '⏳ Enviando…' : '📤 Enviar'}
                      </Button>
                    </div>
                  </div>
                )
              })()}
            </DialogContent>
          </Dialog>

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL — CADASTRO / EDIÇÃO DE EPI
      ══════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={modalOpen} onOpenChange={open => { if (!open) setModalOpen(false) }}>
        <DialogContent style={{ maxWidth: 540 }}>
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={18} style={{ color: '#2563eb' }} />
              {editId ? 'Editar EPI' : 'Novo EPI'}
            </DialogTitle>
          </DialogHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>

            {/* Nome */}
            <div>
              <Label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                Nome <span style={{ color: '#dc2626' }}>*</span>
              </Label>
              <Input
                placeholder="Ex.: Capacete de segurança"
                value={form.nome}
                onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
              />
            </div>

            {/* Categoria + Unidade */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Categoria</Label>
                <Select
                  value={form.categoria || undefined}
                  onValueChange={v => setForm(p => ({ ...p, categoria: v }))}
                >
                  <SelectTrigger style={{ width: '100%' }}>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Unidade</Label>
                <Select
                  value={form.unidade || undefined}
                  onValueChange={v => setForm(p => ({ ...p, unidade: v }))}
                >
                  <SelectTrigger style={{ width: '100%' }}>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map(u => (
                      <SelectItem key={u} value={u}>
                        {u.charAt(0).toUpperCase() + u.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Nº CA + Vida Útil */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                  Certificado de Aprovação (CA)
                </Label>
                <Input
                  placeholder="Ex.: 12345"
                  value={form.numero_ca}
                  onChange={e => setForm(p => ({ ...p, numero_ca: e.target.value }))}
                />
              </div>

              <div>
                <Label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                  Vida Útil (meses)
                </Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Ex.: 12"
                  value={form.vida_util_meses}
                  onChange={e => setForm(p => ({ ...p, vida_util_meses: e.target.value }))}
                />
              </div>
            </div>

            {/* Toggles */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: '12px 16px',
                background: '#f9fafb',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Configurações adicionais
              </p>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: '#374151' }}>
                    Requer Tamanho
                  </p>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>
                    Vestimentas (P, M, G, GG…)
                  </p>
                </div>
                <Toggle
                  checked={form.requer_tamanho}
                  onChange={v => setForm(p => ({ ...p, requer_tamanho: v }))}
                />
              </div>

              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: '#374151' }}>
                    Requer Número
                  </p>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>
                    Calçados (número do pé)
                  </p>
                </div>
                <Toggle
                  checked={form.requer_numero}
                  onChange={v => setForm(p => ({ ...p, requer_numero: v }))}
                />
              </div>

              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: '#374151' }}>
                    EPI Ativo
                  </p>
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>
                    Disponível para uso e vinculação
                  </p>
                </div>
                <Toggle
                  checked={form.ativo}
                  onChange={v => setForm(p => ({ ...p, ativo: v }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter style={{ gap: 8 }}>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Cadastrar EPI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL — VINCULAR EPI À FUNÇÃO
      ══════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={vinculoModalOpen} onOpenChange={open => { if (!open) setVinculoModalOpen(false) }}>
        <DialogContent style={{ maxWidth: 460 }}>
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Link2 size={18} style={{ color: '#2563eb' }} />
              Vincular EPI
              {funcaoSelecionada && (
                <span style={{ fontSize: 14, fontWeight: 400, color: '#6b7280' }}>
                  — {funcaoSelecionada.nome}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>

            {/* EPI */}
            <div>
              <Label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                EPI <span style={{ color: '#dc2626' }}>*</span>
              </Label>
              {episDisponiveis.length === 0 ? (
                <div
                  style={{
                    padding: '10px 14px',
                    background: '#fef9c3',
                    borderRadius: 6,
                    fontSize: 13,
                    color: '#92400e',
                    border: '1px solid #fde68a',
                  }}
                >
                  Todos os EPIs ativos já estão vinculados a esta função.
                </div>
              ) : (
                <Select
                  value={vinculoForm.epi_id || undefined}
                  onValueChange={v => setVinculoForm(p => ({ ...p, epi_id: v }))}
                >
                  <SelectTrigger style={{ width: '100%' }}>
                    <SelectValue placeholder="Selecione um EPI…" />
                  </SelectTrigger>
                  <SelectContent>
                    {episDisponiveis.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}{e.categoria ? ` — ${e.categoria}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Obrigatório + Quantidade */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Label style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>Obrigatório</Label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setVinculoForm(p => ({ ...p, obrigatorio: true }))}
                    style={{
                      flex: 1,
                      padding: '7px 0',
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: vinculoForm.obrigatorio ? '#dc2626' : '#e5e7eb',
                      background: vinculoForm.obrigatorio ? '#fef2f2' : '#fff',
                      color: vinculoForm.obrigatorio ? '#dc2626' : '#374151',
                      fontSize: 13,
                      fontWeight: vinculoForm.obrigatorio ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setVinculoForm(p => ({ ...p, obrigatorio: false }))}
                    style={{
                      flex: 1,
                      padding: '7px 0',
                      borderRadius: 6,
                      border: '1px solid',
                      borderColor: !vinculoForm.obrigatorio ? '#2563eb' : '#e5e7eb',
                      background: !vinculoForm.obrigatorio ? '#eff6ff' : '#fff',
                      color: !vinculoForm.obrigatorio ? '#2563eb' : '#374151',
                      fontSize: 13,
                      fontWeight: !vinculoForm.obrigatorio ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    Não
                  </button>
                </div>
              </div>

              <div>
                <Label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  value={vinculoForm.quantidade}
                  onChange={e => setVinculoForm(p => ({ ...p, quantidade: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter style={{ gap: 8 }}>
            <Button variant="outline" onClick={() => setVinculoModalOpen(false)} disabled={savingVinculo}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveVinculo}
              disabled={savingVinculo || episDisponiveis.length === 0}
            >
              {savingVinculo ? 'Vinculando…' : 'Vincular EPI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          ALERT — EXCLUIR EPI
      ══════════════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir EPI?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O EPI será removido do catálogo e todos os vínculos
              associados poderão ser afetados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              style={{ background: '#dc2626', color: '#fff' }}
            >
              {deleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════════════════════════════════════════════════════════════════════════
          ALERT — DESVINCULAR EPI
      ══════════════════════════════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteVinculoId} onOpenChange={open => { if (!open) setDeleteVinculoId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular EPI?</AlertDialogTitle>
            <AlertDialogDescription>
              O EPI será removido dos requisitos desta função. Esta ação pode ser desfeita
              vinculando novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingVinculo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVinculo}
              disabled={deletingVinculo}
              style={{ background: '#dc2626', color: '#fff' }}
            >
              {deletingVinculo ? 'Removendo…' : 'Desvincular'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
