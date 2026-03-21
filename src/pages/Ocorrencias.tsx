import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate, cn } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton, BadgeStatus } from '@/components/Shared'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Plus,
  Pencil,
  Trash2,
  Stethoscope,
  AlertTriangle,
  Calendar,
  User,
  Link2,
  ShieldAlert,
} from 'lucide-react'

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Colaborador = {
  id: string
  nome: string
  chapa: string
}

type Obra = {
  id: string
  nome: string
}

type AcidenteRef = {
  id: string
  data_ocorrencia: string
  tipo_acidente: string
  descricao: string
}

type Atestado = {
  id: string
  colaborador_id: string
  data_inicio: string
  data_fim: string | null
  dias_afastamento: number | null
  tipo_afastamento: string | null
  cid: string | null
  medico: string | null
  crm: string | null
  acidente_id: string | null
  data_retorno: string | null
  observacoes: string | null
  status: string | null
  colaboradores: { id: string; nome: string; chapa: string } | null
  acidentes?: { id: string; data_ocorrencia: string; tipo_acidente: string | null } | null
}

type Acidente = {
  id: string
  colaborador_id: string
  obra_id: string | null
  data_ocorrencia: string
  hora_ocorrencia: string | null
  tipo_acidente: string
  descricao: string
  comunicado_cat: boolean
  observacoes: string | null
  colaboradores: { id: string; nome: string; chapa: string } | null
  obras: { id: string; nome: string } | null
}

type AtestadoForm = {
  colaborador_id: string
  data_inicio: string
  data_fim: string
  dias_afastamento: string
  tipo_afastamento: string
  cid: string
  medico: string
  crm: string
  acidente_id: string
  data_retorno: string
  observacoes: string
  status: string
}

type AcidenteForm = {
  colaborador_id: string
  obra_id: string
  data_ocorrencia: string
  hora_ocorrencia: string
  tipo_acidente: string
  descricao: string
  comunicado_cat: boolean
  observacoes: string
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TIPOS_AFASTAMENTO: { value: string; label: string }[] = [
  { value: 'doenca', label: 'Doença' },
  { value: 'acidente_trabalho', label: 'Acidente de Trabalho' },
  { value: 'acidente_trajeto', label: 'Acidente de Trajeto' },
  { value: 'cirurgia', label: 'Cirurgia' },
  { value: 'maternidade', label: 'Maternidade / Paternidade' },
  { value: 'outros', label: 'Outros' },
]

const TIPOS_ACIDENTE: { value: string; label: string }[] = [
  { value: 'queda', label: 'Queda' },
  { value: 'corte', label: 'Corte' },
  { value: 'choque_eletrico', label: 'Choque Elétrico' },
  { value: 'queimadura', label: 'Queimadura' },
  { value: 'atropelamento', label: 'Atropelamento' },
  { value: 'esmagamento', label: 'Esmagamento' },
  { value: 'outros', label: 'Outros' },
]

const ATESTADO_FORM_EMPTY: AtestadoForm = {
  colaborador_id: '',
  data_inicio: '',
  data_fim: '',
  dias_afastamento: '',
  tipo_afastamento: '',
  cid: '',
  medico: '',
  crm: '',
  acidente_id: '',
  data_retorno: '',
  observacoes: '',
  status: 'ativo',
}

const ACIDENTE_FORM_EMPTY: AcidenteForm = {
  colaborador_id: '',
  obra_id: '',
  data_ocorrencia: '',
  hora_ocorrencia: '',
  tipo_acidente: '',
  descricao: '',
  comunicado_cat: false,
  observacoes: '',
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function labelTipoAfastamento(value: string) {
  return TIPOS_AFASTAMENTO.find((t) => t.value === value)?.label ?? value
}

function labelTipoAcidente(value: string) {
  return TIPOS_ACIDENTE.find((t) => t.value === value)?.label ?? value
}

function calcDias(inicio: string, fim: string): number | null {
  if (!inicio || !fim) return null
  const a = new Date(inicio)
  const b = new Date(fim)
  const diff = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
  return diff >= 0 ? diff : null
}

function BadgeAtestadoStatus({ status }: { status: string }) {
  const isAtivo = status === 'ativo'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        background: isAtivo ? '#fee2e2' : '#dcfce7',
        color: isAtivo ? '#b91c1c' : '#15803d',
        border: `1px solid ${isAtivo ? '#fca5a5' : '#86efac'}`,
      }}
    >
      {isAtivo ? 'Afastado' : 'Retornou'}
    </span>
  )
}

function BadgeCAT({ comunicado }: { comunicado: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        background: comunicado ? '#fff7ed' : '#f3f4f6',
        color: comunicado ? '#c2410c' : '#6b7280',
        border: `1px solid ${comunicado ? '#fdba74' : '#d1d5db'}`,
      }}
    >
      {comunicado ? 'CAT Comunicada' : 'Sem CAT'}
    </span>
  )
}

function BadgeTemAtestado({ tem }: { tem: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        background: tem ? '#eff6ff' : '#f3f4f6',
        color: tem ? '#1d4ed8' : '#6b7280',
        border: `1px solid ${tem ? '#93c5fd' : '#d1d5db'}`,
      }}
    >
      {tem ? 'Com atestado' : 'Sem atestado'}
    </span>
  )
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function Ocorrencias() {
  const [activeTab, setActiveTab] = useState<'atestados' | 'acidentes'>('atestados')

  // ── Shared data ─────────────────────────────────────────────────────────────
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [loadingShared, setLoadingShared] = useState(true)

  // ── Atestados ───────────────────────────────────────────────────────────────
  const [atestados, setAtestados] = useState<Atestado[]>([])
  const [loadingAtestados, setLoadingAtestados] = useState(true)
  const [atestadoModalOpen, setAtestadoModalOpen] = useState(false)
  const [atestadoEditId, setAtestadoEditId] = useState<string | null>(null)
  const [atestadoForm, setAtestadoForm] = useState<AtestadoForm>(ATESTADO_FORM_EMPTY)
  const [atestadoDeleteId, setAtestadoDeleteId] = useState<string | null>(null)
  const [savingAtestado, setSavingAtestado] = useState(false)
  const [deletingAtestado, setDeletingAtestado] = useState(false)
  const [acidentesDoColaborador, setAcidentesDoColaborador] = useState<AcidenteRef[]>([])
  const [loadingAcidentesColaborador, setLoadingAcidentesColaborador] = useState(false)

  // ── Acidentes ───────────────────────────────────────────────────────────────
  const [acidentes, setAcidentes] = useState<Acidente[]>([])
  const [loadingAcidentes, setLoadingAcidentes] = useState(true)
  const [acidenModalOpen, setAcidenModalOpen] = useState(false)
  const [acidenEditId, setAcidenEditId] = useState<string | null>(null)
  const [acidenForm, setAcidenForm] = useState<AcidenteForm>(ACIDENTE_FORM_EMPTY)
  const [acidenDeleteId, setAcidenDeleteId] = useState<string | null>(null)
  const [savingAciden, setSavingAciden] = useState(false)
  const [deletingAciden, setDeletingAciden] = useState(false)

  // ── Load shared ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchShared() {
      setLoadingShared(true)
      const [colabRes, obraRes] = await Promise.all([
        supabase.from('colaboradores').select('id, nome, chapa').eq('status', 'ativo').order('nome'),
        supabase.from('obras').select('id, nome').order('nome'),
      ])
      if (colabRes.data) setColaboradores(colabRes.data)
      if (obraRes.data) setObras(obraRes.data)
      setLoadingShared(false)
    }
    fetchShared()
  }, [])

  // ── Load atestados ───────────────────────────────────────────────────────────
  async function fetchAtestados() {
    setLoadingAtestados(true)
    const { data, error } = await supabase
      .from('atestados')
      .select('*, colaboradores(id, nome, chapa)')
      .order('data_inicio', { ascending: false })
    if (error) {
      toast.error('Erro ao carregar atestados: ' + (error?.message ?? error))
    } else {
      setAtestados(data as Atestado[])
    }
    setLoadingAtestados(false)
  }

  // ── Load acidentes ───────────────────────────────────────────────────────────
  async function fetchAcidentes() {
    setLoadingAcidentes(true)
    const { data, error } = await supabase
      .from('acidentes')
      .select('*, colaboradores(id, nome, chapa), obras(id, nome)')
      .order('data_ocorrencia', { ascending: false })
    if (error) {
      toast.error('Erro ao carregar acidentes: ' + (error?.message ?? error))
    } else {
      setAcidentes(data as Acidente[])
    }
    setLoadingAcidentes(false)
  }

  useEffect(() => {
    fetchAtestados()
    fetchAcidentes()
  }, [])

  // ── Acidentes do colaborador (para vincular ao atestado) ─────────────────────
  async function fetchAcidentesColaborador(colaboradorId: string) {
    if (!colaboradorId) {
      setAcidentesDoColaborador([])
      return
    }
    setLoadingAcidentesColaborador(true)
    const { data } = await supabase
      .from('acidentes')
      .select('id, data_ocorrencia, tipo_acidente, descricao')
      .eq('colaborador_id', colaboradorId)
      .order('data_ocorrencia', { ascending: false })
    setAcidentesDoColaborador((data as AcidenteRef[]) ?? [])
    setLoadingAcidentesColaborador(false)
  }

  // ─── ATESTADO handlers ────────────────────────────────────────────────────────

  function openAtestadoCreate() {
    setAtestadoEditId(null)
    setAtestadoForm(ATESTADO_FORM_EMPTY)
    setAcidentesDoColaborador([])
    setAtestadoModalOpen(true)
  }

  function openAtestadoEdit(a: Atestado) {
    setAtestadoEditId(a.id)
    setAtestadoForm({
      colaborador_id: a.colaborador_id ?? '',
      data_inicio: a.data_inicio ?? '',
      data_fim: a.data_fim ?? '',
      dias_afastamento: a.dias_afastamento != null ? String(a.dias_afastamento) : '',
      tipo_afastamento: a.tipo_afastamento ?? '',
      cid: a.cid ?? '',
      medico: a.medico ?? '',
      crm: a.crm ?? '',
      acidente_id: a.acidente_id ?? '',
      data_retorno: a.data_retorno ?? '',
      observacoes: a.observacoes ?? '',
      status: a.status ?? 'ativo',
    })
    fetchAcidentesColaborador(a.colaborador_id)
    setAtestadoModalOpen(true)
  }

  function handleAtestadoColaboradorChange(val: string) {
    setAtestadoForm((prev) => ({ ...prev, colaborador_id: val, acidente_id: '' }))
    fetchAcidentesColaborador(val)
  }

  function handleAtestadoDateChange(field: 'data_inicio' | 'data_fim', value: string) {
    setAtestadoForm((prev) => {
      const updated = { ...prev, [field]: value }
      const inicio = field === 'data_inicio' ? value : prev.data_inicio
      const fim = field === 'data_fim' ? value : prev.data_fim
      const dias = calcDias(inicio, fim)
      return { ...updated, dias_afastamento: dias != null ? String(dias) : prev.dias_afastamento }
    })
  }

  async function saveAtestado() {
    if (!atestadoForm.colaborador_id) {
      toast.error('Selecione um colaborador')
      return
    }
    if (!atestadoForm.data_inicio) {
      toast.error('Data de início é obrigatória')
      return
    }
    setSavingAtestado(true)

    const payload: Record<string, unknown> = {
      colaborador_id: atestadoForm.colaborador_id,
      data_inicio: atestadoForm.data_inicio,
      data_fim: atestadoForm.data_fim || null,
      dias_afastamento: atestadoForm.dias_afastamento ? Number(atestadoForm.dias_afastamento) : null,
      tipo_afastamento: atestadoForm.tipo_afastamento || null,
      cid: atestadoForm.cid || null,
      medico: atestadoForm.medico || null,
      crm: atestadoForm.crm || null,
      acidente_id: atestadoForm.acidente_id || null,
      observacoes: atestadoForm.observacoes || null,
    }

    let error: unknown
    if (atestadoEditId) {
      const res = await supabase.from('atestados').update(payload).eq('id', atestadoEditId)
      error = res.error
    } else {
      const res = await supabase.from('atestados').insert(payload)
      error = res.error
    }

    setSavingAtestado(false)
    if (error) {
      toast.error('Erro ao salvar atestado: ' + ((error as any)?.message ?? String(error)))
    } else {
      toast.success(atestadoEditId ? 'Atestado atualizado!' : 'Atestado cadastrado!')
      setAtestadoModalOpen(false)
      fetchAtestados()
    }
  }

  async function deleteAtestado() {
    if (!atestadoDeleteId) return
    setDeletingAtestado(true)
    const { error } = await supabase.from('atestados').delete().eq('id', atestadoDeleteId)
    setDeletingAtestado(false)
    setAtestadoDeleteId(null)
    if (error) {
      toast.error('Erro ao excluir atestado')
    } else {
      toast.success('Atestado excluído')
      fetchAtestados()
    }
  }

  // ─── ACIDENTE handlers ────────────────────────────────────────────────────────

  function openAcidenCreate() {
    setAcidenEditId(null)
    setAcidenForm(ACIDENTE_FORM_EMPTY)
    setAcidenModalOpen(true)
  }

  function openAcidenEdit(a: Acidente) {
    setAcidenEditId(a.id)
    setAcidenForm({
      colaborador_id: a.colaborador_id ?? '',
      obra_id: a.obra_id ?? '',
      data_ocorrencia: a.data_ocorrencia ?? '',
      hora_ocorrencia: a.hora_ocorrencia ?? '',
      tipo_acidente: a.tipo_acidente ?? '',
      descricao: a.descricao ?? '',
      comunicado_cat: a.comunicado_cat ?? false,
      observacoes: a.observacoes ?? '',
    })
    setAcidenModalOpen(true)
  }

  async function saveAcidente() {
    if (!acidenForm.colaborador_id) {
      toast.error('Selecione um colaborador')
      return
    }
    if (!acidenForm.data_ocorrencia) {
      toast.error('Data da ocorrência é obrigatória')
      return
    }
    if (!acidenForm.descricao.trim()) {
      toast.error('Descrição é obrigatória')
      return
    }
    setSavingAciden(true)

    const payload: Record<string, unknown> = {
      colaborador_id: acidenForm.colaborador_id,
      obra_id: acidenForm.obra_id || null,
      data_ocorrencia: acidenForm.data_ocorrencia,
      hora_ocorrencia: acidenForm.hora_ocorrencia || null,
      tipo_acidente: acidenForm.tipo_acidente || null,
      descricao: acidenForm.descricao,
      comunicado_cat: acidenForm.comunicado_cat,
      observacoes: acidenForm.observacoes || null,
    }

    let error: unknown
    if (acidenEditId) {
      const res = await supabase.from('acidentes').update(payload).eq('id', acidenEditId)
      error = res.error
    } else {
      const res = await supabase.from('acidentes').insert(payload)
      error = res.error
    }

    setSavingAciden(false)
    if (error) {
      toast.error('Erro ao salvar acidente: ' + ((error as any)?.message ?? String(error)))
    } else {
      toast.success(acidenEditId ? 'Acidente atualizado!' : 'Acidente cadastrado!')
      setAcidenModalOpen(false)
      fetchAcidentes()
    }
  }

  async function deleteAcidente() {
    if (!acidenDeleteId) return
    setDeletingAciden(true)
    const { error } = await supabase.from('acidentes').delete().eq('id', acidenDeleteId)
    setDeletingAciden(false)
    setAcidenDeleteId(null)
    if (error) {
      toast.error('Erro ao excluir acidente')
    } else {
      toast.success('Acidente excluído')
      fetchAcidentes()
    }
  }

  // ─── Derived: acidentes com atestado vinculado ────────────────────────────────
  const acidenteIdsComAtestado = new Set(
    atestados.filter((a) => a.acidente_id).map((a) => a.acidente_id as string)
  )

  // ─── TAB STYLES ───────────────────────────────────────────────────────────────

  function tabStyle(tab: 'atestados' | 'acidentes') {
    const isActive = activeTab === tab
    return {
      padding: '10px 24px',
      cursor: 'pointer',
      fontSize: 15,
      fontWeight: isActive ? 700 : 500,
      color: isActive ? '#1d4ed8' : '#64748b',
      background: 'none',
      border: 'none',
      borderBottom: isActive ? '2px solid #1d4ed8' : '2px solid transparent',
      outline: 'none',
      transition: 'all 0.15s',
    } as React.CSSProperties
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Ocorrências e Atestados"
        subtitle="Gerencie atestados médicos, afastamentos e acidentes de trabalho"
        action={
          <Button
            onClick={activeTab === 'atestados' ? openAtestadoCreate : openAcidenCreate}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} />
            {activeTab === 'atestados' ? 'Novo Atestado' : 'Nova Ocorrência'}
          </Button>
        }
      />

      {/* ── TABS ────────────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: 24,
          marginTop: 8,
        }}
      >
        <button style={tabStyle('atestados')} onClick={() => setActiveTab('atestados')}>
          🩺 Atestados / Afastamentos
        </button>
        <button style={tabStyle('acidentes')} onClick={() => setActiveTab('acidentes')}>
          ⚠️ Acidentes / Ocorrências
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          ABA 1 — ATESTADOS
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'atestados' && (
        <>
          {loadingAtestados || loadingShared ? (
            <LoadingSkeleton />
          ) : atestados.length === 0 ? (
            <EmptyState
              icon={<Stethoscope size={40} color="#94a3b8" />}
              title="Nenhum atestado cadastrado"
              description="Registre afastamentos e atestados médicos dos colaboradores"
              action={
                <Button onClick={openAtestadoCreate}>
                  <Plus size={14} style={{ marginRight: 6 }} />
                  Cadastrar Atestado
                </Button>
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Dias</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>CID</TableHead>
                    <TableHead>Acidente vinculado</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead style={{ textAlign: 'right' }}>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atestados.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div style={{ fontWeight: 600 }}>{a.colaboradores?.nome ?? '—'}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>
                          {a.colaboradores?.chapa ?? ''}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div style={{ fontSize: 13 }}>
                          {formatDate(a.data_inicio)}
                          {a.data_fim ? ` → ${formatDate(a.data_fim)}` : ' → em aberto'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span style={{ fontWeight: 600 }}>
                          {a.dias_afastamento != null ? `${a.dias_afastamento}d` : '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span style={{ fontSize: 13 }}>
                          {labelTipoAfastamento(a.tipo_afastamento)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            background: '#f1f5f9',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        >
                          {a.cid ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {a.acidentes ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Link2 size={13} color="#6366f1" />
                            <span style={{ fontSize: 12 }}>
                              {formatDate(a.acidentes.data_ocorrencia)} ·{' '}
                              {labelTipoAcidente(a.acidentes.tipo_acidente)}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <BadgeAtestadoStatus status={a.status} />
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAtestadoEdit(a)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                            onClick={() => setAtestadoDeleteId(a.id)}
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
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          ABA 2 — ACIDENTES
         ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'acidentes' && (
        <>
          {loadingAcidentes || loadingShared ? (
            <LoadingSkeleton />
          ) : acidentes.length === 0 ? (
            <EmptyState
              icon={<AlertTriangle size={40} color="#94a3b8" />}
              title="Nenhum acidente registrado"
              description="Registre ocorrências e acidentes de trabalho nas obras"
              action={
                <Button onClick={openAcidenCreate}>
                  <Plus size={14} style={{ marginRight: 6 }} />
                  Registrar Acidente
                </Button>
              }
            />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead>Data / Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>CAT</TableHead>
                    <TableHead>Atestado</TableHead>
                    <TableHead style={{ textAlign: 'right' }}>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {acidentes.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div style={{ fontWeight: 600 }}>{a.colaboradores?.nome ?? '—'}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>
                          {a.colaboradores?.chapa ?? ''}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span style={{ fontSize: 13 }}>{a.obras?.nome ?? '—'}</span>
                      </TableCell>
                      <TableCell>
                        <div style={{ fontSize: 13 }}>{formatDate(a.data_ocorrencia)}</div>
                        {a.hora_ocorrencia && (
                          <div style={{ fontSize: 12, color: '#64748b' }}>{a.hora_ocorrencia}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span style={{ fontSize: 13 }}>{labelTipoAcidente(a.tipo_acidente)}</span>
                      </TableCell>
                      <TableCell>
                        <BadgeCAT comunicado={a.comunicado_cat} />
                      </TableCell>
                      <TableCell>
                        <BadgeTemAtestado tem={acidenteIdsComAtestado.has(a.id)} />
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAcidenEdit(a)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                            onClick={() => setAcidenDeleteId(a.id)}
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
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL — ATESTADO
         ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={atestadoModalOpen} onOpenChange={setAtestadoModalOpen}>
        <DialogContent style={{ maxWidth: 620, maxHeight: '90vh', overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle>
              {atestadoEditId ? 'Editar Atestado' : 'Cadastrar Atestado / Afastamento'}
            </DialogTitle>
          </DialogHeader>

          <div style={{ display: 'grid', gap: 14, padding: '4px 0' }}>
            {/* Colaborador */}
            <div style={{ display: 'grid', gap: 4 }}>
              <Label>Colaborador *</Label>
              <Select
                value={atestadoForm.colaborador_id || undefined}
                onValueChange={handleAtestadoColaboradorChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} {c.chapa ? `(${c.chapa})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data início / fim */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <Label>Data de Início *</Label>
                <Input
                  type="date"
                  value={atestadoForm.data_inicio}
                  onChange={(e) => handleAtestadoDateChange('data_inicio', e.target.value)}
                />
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <Label>Data de Fim</Label>
                <Input
                  type="date"
                  value={atestadoForm.data_fim}
                  onChange={(e) => handleAtestadoDateChange('data_fim', e.target.value)}
                />
              </div>
            </div>

            {/* Dias + Tipo afastamento */}
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <Label>Dias</Label>
                <Input
                  type="number"
                  min={0}
                  value={atestadoForm.dias_afastamento}
                  onChange={(e) =>
                    setAtestadoForm((prev) => ({ ...prev, dias_afastamento: e.target.value }))
                  }
                  placeholder="Auto"
                />
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <Label>Tipo de Afastamento</Label>
                <Select
                  value={atestadoForm.tipo_afastamento || undefined}
                  onValueChange={(v) =>
                    setAtestadoForm((prev) => ({ ...prev, tipo_afastamento: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_AFASTAMENTO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* CID + Médico */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <Label>CID</Label>
                <Input
                  placeholder="Ex: M54.5"
                  value={atestadoForm.cid}
                  onChange={(e) => setAtestadoForm((prev) => ({ ...prev, cid: e.target.value }))}
                />
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <Label>Médico</Label>
                <Input
                  placeholder="Nome do médico"
                  value={atestadoForm.medico}
                  onChange={(e) => setAtestadoForm((prev) => ({ ...prev, medico: e.target.value }))}
                />
              </div>
            </div>

            {/* CRM + Data retorno */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <Label>CRM</Label>
                <Input
                  placeholder="CRM do médico"
                  value={atestadoForm.crm}
                  onChange={(e) => setAtestadoForm((prev) => ({ ...prev, crm: e.target.value }))}
                />
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <Label>Data de Retorno</Label>
                <Input
                  type="date"
                  value={atestadoForm.data_retorno}
                  onChange={(e) =>
                    setAtestadoForm((prev) => ({ ...prev, data_retorno: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Acidente vinculado */}
            <div style={{ display: 'grid', gap: 4 }}>
              <Label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Link2 size={14} color="#6366f1" />
                Vinculado a Acidente (opcional)
              </Label>
              {loadingAcidentesColaborador ? (
                <p style={{ fontSize: 12, color: '#64748b' }}>Carregando acidentes...</p>
              ) : acidentesDoColaborador.length === 0 ? (
                <p style={{ fontSize: 12, color: '#94a3b8' }}>
                  {atestadoForm.colaborador_id
                    ? 'Nenhum acidente registrado para este colaborador'
                    : 'Selecione um colaborador para ver acidentes vinculáveis'}
                </p>
              ) : (
                <Select
                  value={atestadoForm.acidente_id || undefined}
                  onValueChange={(v) =>
                    setAtestadoForm((prev) => ({ ...prev, acidente_id: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum acidente vinculado" />
                  </SelectTrigger>
                  <SelectContent>
                    {acidentesDoColaborador.map((ac) => (
                      <SelectItem key={ac.id} value={ac.id}>
                        {formatDate(ac.data_ocorrencia)} · {labelTipoAcidente(ac.tipo_acidente)}
                        {ac.descricao ? ` — ${ac.descricao.substring(0, 40)}...` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Status */}
            <div style={{ display: 'grid', gap: 4 }}>
              <Label>Status</Label>
              <Select
                value={atestadoForm.status || undefined}
                onValueChange={(v) => setAtestadoForm((prev) => ({ ...prev, status: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Afastado (ativo)</SelectItem>
                  <SelectItem value="encerrado">Retornou (encerrado)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Observações */}
            <div style={{ display: 'grid', gap: 4 }}>
              <Label>Observações</Label>
              <Textarea
                rows={3}
                placeholder="Anotações adicionais..."
                value={atestadoForm.observacoes}
                onChange={(e) =>
                  setAtestadoForm((prev) => ({ ...prev, observacoes: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter style={{ marginTop: 8 }}>
            <Button variant="outline" onClick={() => setAtestadoModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveAtestado} disabled={savingAtestado}>
              {savingAtestado ? 'Salvando...' : atestadoEditId ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL — ACIDENTE
         ════════════════════════════════════════════════════════════════════════ */}
      <Dialog open={acidenModalOpen} onOpenChange={setAcidenModalOpen}>
        <DialogContent style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
          <DialogHeader>
            <DialogTitle>
              {acidenEditId ? 'Editar Acidente / Ocorrência' : 'Registrar Acidente / Ocorrência'}
            </DialogTitle>
          </DialogHeader>

          <div style={{ display: 'grid', gap: 14, padding: '4px 0' }}>
            {/* Colaborador */}
            <div style={{ display: 'grid', gap: 4 }}>
              <Label>Colaborador *</Label>
              <Select
                value={acidenForm.colaborador_id || undefined}
                onValueChange={(v) =>
                  setAcidenForm((prev) => ({ ...prev, colaborador_id: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} {c.chapa ? `(${c.chapa})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Obra */}
            <div style={{ display: 'grid', gap: 4 }}>
              <Label>Obra</Label>
              <Select
                value={acidenForm.obra_id || undefined}
                onValueChange={(v) => setAcidenForm((prev) => ({ ...prev, obra_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a obra" />
                </SelectTrigger>
                <SelectContent>
                  {obras.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data + Hora */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <Label>Data da Ocorrência *</Label>
                <Input
                  type="date"
                  value={acidenForm.data_ocorrencia}
                  onChange={(e) =>
                    setAcidenForm((prev) => ({ ...prev, data_ocorrencia: e.target.value }))
                  }
                />
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <Label>Hora</Label>
                <Input
                  type="time"
                  value={acidenForm.hora_ocorrencia}
                  onChange={(e) =>
                    setAcidenForm((prev) => ({ ...prev, hora_ocorrencia: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* Tipo acidente */}
            <div style={{ display: 'grid', gap: 4 }}>
              <Label>Tipo de Acidente</Label>
              <Select
                value={acidenForm.tipo_acidente || undefined}
                onValueChange={(v) =>
                  setAcidenForm((prev) => ({ ...prev, tipo_acidente: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ACIDENTE.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Descrição */}
            <div style={{ display: 'grid', gap: 4 }}>
              <Label>Descrição *</Label>
              <Textarea
                rows={3}
                placeholder="Descreva o acidente / ocorrência..."
                value={acidenForm.descricao}
                onChange={(e) =>
                  setAcidenForm((prev) => ({ ...prev, descricao: e.target.value }))
                }
              />
            </div>

            {/* CAT comunicada */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: acidenForm.comunicado_cat ? '#fff7ed' : '#f8fafc',
                border: `1px solid ${acidenForm.comunicado_cat ? '#fdba74' : '#e2e8f0'}`,
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onClick={() =>
                setAcidenForm((prev) => ({ ...prev, comunicado_cat: !prev.comunicado_cat }))
              }
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: `2px solid ${acidenForm.comunicado_cat ? '#f97316' : '#cbd5e1'}`,
                  background: acidenForm.comunicado_cat ? '#f97316' : 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.15s',
                }}
              >
                {acidenForm.comunicado_cat && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  CAT — Comunicação de Acidente de Trabalho
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {acidenForm.comunicado_cat
                    ? 'Comunicação registrada'
                    : 'Marque se a CAT foi emitida'}
                </div>
              </div>
            </div>

            {/* Observações */}
            <div style={{ display: 'grid', gap: 4 }}>
              <Label>Observações</Label>
              <Textarea
                rows={3}
                placeholder="Informações adicionais..."
                value={acidenForm.observacoes}
                onChange={(e) =>
                  setAcidenForm((prev) => ({ ...prev, observacoes: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter style={{ marginTop: 8 }}>
            <Button variant="outline" onClick={() => setAcidenModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveAcidente} disabled={savingAciden}>
              {savingAciden ? 'Salvando...' : acidenEditId ? 'Salvar' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM DELETE — ATESTADO ────────────────────────────────────────── */}
      <AlertDialog
        open={!!atestadoDeleteId}
        onOpenChange={(open) => { if (!open) setAtestadoDeleteId(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Atestado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O registro de afastamento será permanentemente
              removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteAtestado}
              disabled={deletingAtestado}
              style={{ background: '#ef4444', color: '#fff' }}
            >
              {deletingAtestado ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── CONFIRM DELETE — ACIDENTE ────────────────────────────────────────── */}
      <AlertDialog
        open={!!acidenDeleteId}
        onOpenChange={(open) => { if (!open) setAcidenDeleteId(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Acidente / Ocorrência?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. A ocorrência e todos os vínculos com atestados serão
              removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteAcidente}
              disabled={deletingAciden}
              style={{ background: '#ef4444', color: '#fff' }}
            >
              {deletingAciden ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
