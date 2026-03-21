import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
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
import { Badge } from '@/components/ui/badge'
import {
  Shield, Plus, Search, Pencil, Trash2, Link, Unlink,
  Package, Tag, CheckCircle2, AlertCircle, X,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── tipos ────────────────────────────────────────────────────────────────────

type EpiCatalogo = {
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

type Funcao = {
  id: string
  nome: string
  sigla: string | null
}

type FuncaoEpi = {
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

type EpiFormData = {
  nome: string
  categoria: string
  numero_ca: string
  unidade: string
  requer_tamanho: boolean
  requer_numero: boolean
  vida_util_meses: string
  ativo: boolean
}

type VinculoFormData = {
  epi_id: string
  obrigatorio: boolean
  quantidade: string
}

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

// ─── componente principal ─────────────────────────────────────────────────────

export default function Epis() {
  const [aba, setAba] = useState<'catalogo' | 'funcao'>('catalogo')

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
  const [funcaoSelecionada, setFuncaoSelecionada] = useState<string>('')
  const [vinculos, setVinculos] = useState<FuncaoEpi[]>([])
  const [loadingVinculos, setLoadingVinculos] = useState(false)

  const [vinculoModalOpen, setVinculoModalOpen] = useState(false)
  const [vinculoForm, setVinculoForm] = useState<VinculoFormData>(EMPTY_VINCULO_FORM)
  const [savingVinculo, setSavingVinculo] = useState(false)
  const [deleteVinculoId, setDeleteVinculoId] = useState<string | null>(null)
  const [deletingVinculo, setDeletingVinculo] = useState(false)

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
      .select('id, nome, sigla')
      .eq('ativo', true)
      .order('nome')
    setLoadingFuncoes(false)
    if (error) { toast.error(error.message); return }
    setFuncoes(data ?? [])
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

  useEffect(() => { fetchEpis() }, [fetchEpis])
  useEffect(() => { fetchFuncoes() }, [fetchFuncoes])
  useEffect(() => {
    if (funcaoSelecionada) fetchVinculos(funcaoSelecionada)
    else setVinculos([])
  }, [funcaoSelecionada, fetchVinculos])

  // ── filtro busca ────────────────────────────────────────────────────────────
  const filtered = epis.filter(e =>
    e.nome.toLowerCase().includes(search.toLowerCase()) ||
    (e.categoria ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (e.numero_ca ?? '').toLowerCase().includes(search.toLowerCase()),
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
      funcao_id: funcaoSelecionada,
      epi_id: vinculoForm.epi_id,
      obrigatorio: vinculoForm.obrigatorio,
      quantidade: parseInt(vinculoForm.quantidade, 10) || 1,
    })

    setSavingVinculo(false)
    if (error) { toast.error(error.message); return }
    toast.success('EPI vinculado à função!')
    setVinculoModalOpen(false)
    setVinculoForm(EMPTY_VINCULO_FORM)
    fetchVinculos(funcaoSelecionada)
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
    if (funcaoSelecionada) fetchVinculos(funcaoSelecionada)
  }

  // ── EPIs disponíveis para vincular (excluindo já vinculados) ─────────────────
  const episDisponiveis = epis.filter(
    e => e.ativo && !vinculos.some(v => v.epi_id === e.id),
  )

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

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="EPIs"
        subtitle="Equipamentos de Proteção Individual — catálogo e vínculos por função"
        action={
          aba === 'catalogo' ? (
            <Button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} /> Novo EPI
            </Button>
          ) : funcaoSelecionada ? (
            <Button
              onClick={() => { setVinculoForm(EMPTY_VINCULO_FORM); setVinculoModalOpen(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Link size={16} /> Vincular EPI
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
        }}
      >
        <button style={tabStyle(aba === 'catalogo')} onClick={() => setAba('catalogo')}>
          📦 Catálogo de EPIs
        </button>
        <button style={tabStyle(aba === 'funcao')} onClick={() => setAba('funcao')}>
          🔗 EPIs por Função
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          ABA 1 — CATÁLOGO
      ══════════════════════════════════════════════════════════════════════════ */}
      {aba === 'catalogo' && (
        <div>
          {/* Busca */}
          <div style={{ position: 'relative', maxWidth: 360, marginBottom: 20 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
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
                    <TableHead style={{ width: 90, textAlign: 'center' }}>Requer Tam.</TableHead>
                    <TableHead style={{ width: 90, textAlign: 'center' }}>Requer Nº</TableHead>
                    <TableHead style={{ width: 100, textAlign: 'center' }}>Vida Útil</TableHead>
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
                        {epi.categoria ? (
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
                            {epi.categoria}
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                        )}
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
          ABA 2 — EPIs POR FUNÇÃO
      ══════════════════════════════════════════════════════════════════════════ */}
      {aba === 'funcao' && (
        <div>
          {/* Seletor de função */}
          <div style={{ maxWidth: 400, marginBottom: 24 }}>
            <Label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
              Selecionar Função
            </Label>
            {loadingFuncoes ? (
              <div style={{ height: 38, background: '#f3f4f6', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
            ) : (
              <Select
                value={funcaoSelecionada || undefined}
                onValueChange={v => setFuncaoSelecionada(v)}
              >
                <SelectTrigger style={{ width: '100%' }}>
                  <SelectValue placeholder="Selecione uma função…" />
                </SelectTrigger>
                <SelectContent>
                  {funcoes.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}{f.sigla ? ` (${f.sigla})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Conteúdo da aba 2 */}
          {!funcaoSelecionada ? (
            <EmptyState
              icon={<Link size={32} />}
              title="Nenhuma função selecionada"
              description="Selecione uma função acima para ver os EPIs vinculados."
            />
          ) : loadingVinculos ? (
            <LoadingSkeleton rows={4} />
          ) : vinculos.length === 0 ? (
            <EmptyState
              icon={<Unlink size={32} />}
              title="Nenhum EPI vinculado"
              description="Esta função ainda não possui EPIs vinculados."
              action={
                <Button
                  size="sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => { setVinculoForm(EMPTY_VINCULO_FORM); setVinculoModalOpen(true) }}
                >
                  <Link size={14} /> Vincular EPI
                </Button>
              }
            />
          ) : (
            <div style={{ borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#fff' }}>
              <Table>
                <TableHeader>
                  <TableRow style={{ background: '#f9fafb' }}>
                    <TableHead>EPI</TableHead>
                    <TableHead style={{ width: 120 }}>Categoria</TableHead>
                    <TableHead style={{ width: 100, textAlign: 'center' }}>Obrigatório</TableHead>
                    <TableHead style={{ width: 100, textAlign: 'center' }}>Quantidade</TableHead>
                    <TableHead style={{ width: 80, textAlign: 'center' }}>Desvincular</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vinculos.map(v => (
                    <TableRow key={v.id} style={{ transition: 'background 0.15s' }}>
                      {/* EPI */}
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
                        {v.epi_catalogo?.categoria ? (
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
                            {v.epi_catalogo.categoria}
                          </span>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                        )}
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
                      <TableCell style={{ textAlign: 'center', fontWeight: 500, fontSize: 14 }}>
                        {v.quantidade}
                      </TableCell>

                      {/* Desvincular */}
                      <TableCell style={{ textAlign: 'center' }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          style={{ width: 32, height: 32, color: '#dc2626' }}
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
              <Link size={18} style={{ color: '#2563eb' }} />
              Vincular EPI à Função
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
                        {e.nome}
                        {e.categoria ? ` — ${e.categoria}` : ''}
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
              vinculando o EPI novamente.
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
