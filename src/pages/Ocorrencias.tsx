import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Pencil, Trash2, Stethoscope, AlertTriangle, FileWarning, Upload, FileText, X, ExternalLink } from 'lucide-react'

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Colaborador = { id: string; nome: string; chapa: string }
type Obra        = { id: string; nome: string }

type Atestado = {
  id: string
  colaborador_id: string
  data: string
  tipo: string | null
  dias_afastamento: number | null
  com_afastamento: boolean | null
  cid: string | null
  medico: string | null
  descricao: string | null
  observacoes: string | null
  documento_url: string | null
  documento_nome: string | null
  colaboradores: { id: string; nome: string; chapa: string } | null
}
type AtestadoForm = {
  colaborador_id: string; data: string; tipo: string; dias_afastamento: string
  com_afastamento: boolean; cid: string; medico: string; descricao: string; observacoes: string
  documento_url: string; documento_nome: string
}
const ATEST_EMPTY: AtestadoForm = {
  colaborador_id: '', data: '', tipo: 'medico', dias_afastamento: '',
  com_afastamento: false, cid: '', medico: '', descricao: '', observacoes: '',
  documento_url: '', documento_nome: '',
}

type Acidente = {
  id: string; colaborador_id: string; obra_id: string | null
  data_acidente: string; hora_acidente: string | null
  tipo: string | null; gravidade: string | null; descricao: string
  local_acidente: string | null; com_afastamento: boolean | null
  dias_afastamento: number | null; cat_emitida: boolean | null
  status: string | null; observacoes: string | null
  colaboradores: { id: string; nome: string; chapa: string } | null
  obras: { id: string; nome: string } | null
}
type AcidenteForm = {
  colaborador_id: string; obra_id: string; data_acidente: string; hora_acidente: string
  tipo: string; gravidade: string; descricao: string; local_acidente: string
  com_afastamento: boolean; dias_afastamento: string; cat_emitida: boolean; observacoes: string
}
const ACID_EMPTY: AcidenteForm = {
  colaborador_id: '', obra_id: '', data_acidente: '', hora_acidente: '',
  tipo: '', gravidade: '', descricao: '', local_acidente: '',
  com_afastamento: false, dias_afastamento: '', cat_emitida: false, observacoes: '',
}

type Advertencia = {
  id: string; colaborador_id: string; data_advertencia: string
  tipo: string; motivo: string; descricao: string | null
  assinada: boolean | null; observacoes: string | null
  documento_url: string | null; documento_nome: string | null
  colaboradores: { id: string; nome: string; chapa: string } | null
}
type AdvertenciaForm = {
  colaborador_id: string; data_advertencia: string; tipo: string
  motivo: string; descricao: string; assinada: boolean; observacoes: string
  documento_url: string; documento_nome: string
}
const ADV_EMPTY: AdvertenciaForm = {
  colaborador_id: '', data_advertencia: '', tipo: 'escrita', motivo: '',
  descricao: '', assinada: false, observacoes: '',
  documento_url: '', documento_nome: '',
}

// ─── CONSTANTES ──────────────────────────────────────────────────────────────
const TIPOS_ATESTADO    = [{ value: 'medico', label: 'Médico' }, { value: 'comparecimento', label: 'Comparecimento' }, { value: 'declaracao', label: 'Declaração' }]
const TIPOS_ACIDENTE    = [{ value: 'tipico', label: 'Típico (no trabalho)' }, { value: 'trajeto', label: 'De Trajeto' }, { value: 'doenca_ocupacional', label: 'Doença Ocupacional' }]
const GRAVIDADES        = [{ value: 'leve', label: 'Leve' }, { value: 'moderado', label: 'Moderado' }, { value: 'grave', label: 'Grave' }, { value: 'fatal', label: 'Fatal' }]
const STATUS_ACIDENTE   = [{ value: 'em_investigacao', label: 'Em Investigação' }, { value: 'concluido', label: 'Concluído' }, { value: 'arquivado', label: 'Arquivado' }]
const TIPOS_ADVERTENCIA = [
  { value: 'verbal', label: 'Verbal' }, { value: 'escrita', label: 'Escrita' },
  { value: 'suspensao', label: 'Suspensão' }, { value: 'demissional', label: 'Demissional (Justa Causa)' },
]
const MOTIVOS_ADVERTENCIA = [
  'Atraso injustificado', 'Falta injustificada', 'Descumprimento de normas',
  'Desrespeito a superior', 'Uso inadequado de EPI', 'Dano ao patrimônio',
  'Comportamento inadequado', 'Reincidência de infração', 'Outro',
]

function labelTipo(v: string | null, lista: { value: string; label: string }[]) {
  return lista.find(x => x.value === v)?.label ?? v ?? '—'
}

function GravBadge({ g }: { g: string | null }) {
  const map: Record<string, { bg: string; color: string }> = {
    leve: { bg: '#f0fdf4', color: '#16a34a' }, moderado: { bg: '#fffbeb', color: '#d97706' },
    grave: { bg: '#fff1f2', color: '#dc2626' }, fatal: { bg: '#1e1e2e', color: '#f8fafc' },
  }
  const s = map[g ?? ''] ?? { bg: '#f3f4f6', color: '#6b7280' }
  return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>{labelTipo(g, GRAVIDADES)}</span>
}
function AdvTipoBadge({ tipo }: { tipo: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    verbal: { bg: '#eff6ff', color: '#1d4ed8', label: 'Verbal' }, escrita: { bg: '#fffbeb', color: '#d97706', label: 'Escrita' },
    suspensao: { bg: '#fff1f2', color: '#dc2626', label: 'Suspensão' }, demissional: { bg: '#1e1e2e', color: '#f8fafc', label: 'Justa Causa' },
  }
  const s = map[tipo] ?? { bg: '#f3f4f6', color: '#6b7280', label: tipo }
  return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>
}

// ─── UPLOAD HELPER ────────────────────────────────────────────────────────────
const BUCKET = 'ocorrencias-documentos'

async function uploadDocumento(file: File, pasta: string): Promise<{ url: string; nome: string } | null> {
  const ext  = file.name.split('.').pop()
  const path = `${pasta}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
  if (error) { toast.error('Erro no upload: ' + error.message); return null }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, nome: file.name }
}

// ─── COMPONENTE DE UPLOAD ─────────────────────────────────────────────────────
function UploadDocumento({
  url, nome, onChange, obrigatorio = true,
}: {
  url: string; nome: string
  onChange: (url: string, nome: string) => void
  obrigatorio?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) { toast.error('Apenas PDF ou imagem (JPG, PNG, WEBP)'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo muito grande (máx 10 MB)'); return }
    setUploading(true)
    const res = await uploadDocumento(file, 'docs')
    setUploading(false)
    if (res) { onChange(res.url, res.nome); toast.success('Documento anexado!') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Label>Documento {obrigatorio && <span style={{ color: '#dc2626' }}>*</span>}</Label>
        {obrigatorio && !url && (
          <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>⚠ Obrigatório para salvar</span>
        )}
      </div>

      {url ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
          <FileText size={16} color="#16a34a" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome || 'Documento'}</span>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#16a34a' }} title="Abrir"><ExternalLink size={14} /></a>
          <button onClick={() => onChange('', '')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2 }} title="Remover"><X size={14} /></button>
        </div>
      ) : (
        <div
          onClick={() => !uploading && ref.current?.click()}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '20px 16px', borderRadius: 8, border: '2px dashed #d1d5db', background: '#fafafa', cursor: uploading ? 'wait' : 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={e => { if (!uploading) (e.currentTarget as HTMLElement).style.borderColor = '#6366f1' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#d1d5db' }}
        >
          <Upload size={20} color="#9ca3af" />
          <span style={{ fontSize: 13, color: '#6b7280' }}>{uploading ? 'Enviando…' : 'Clique para anexar PDF ou imagem'}</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>PDF, JPG, PNG • máx 10 MB</span>
        </div>
      )}
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
type Aba = 'atestados' | 'acidentes' | 'advertencias'

export default function Ocorrencias() {
  const [aba, setAba] = useState<Aba>('atestados')

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [obras,         setObras]         = useState<Obra[]>([])
  const [loadingShared, setLoadingShared] = useState(true)

  // ── atestados ─────────────────────────────────────────────────────────────
  const [atestados,      setAtestados]     = useState<Atestado[]>([])
  const [loadingAtest,   setLoadingAtest]  = useState(false)
  const [atestOpen,      setAtestOpen]     = useState(false)
  const [atestEditId,    setAtestEditId]   = useState<string | null>(null)
  const [atestForm,      setAtestForm]     = useState<AtestadoForm>(ATEST_EMPTY)
  const [savingAtest,    setSavingAtest]   = useState(false)
  const [atestDeleteId,  setAtestDeleteId] = useState<string | null>(null)

  // ── acidentes ─────────────────────────────────────────────────────────────
  const [acidentes,     setAcidentes]    = useState<Acidente[]>([])
  const [loadingAcid,   setLoadingAcid]  = useState(false)
  const [acidOpen,      setAcidOpen]     = useState(false)
  const [acidEditId,    setAcidEditId]   = useState<string | null>(null)
  const [acidForm,      setAcidForm]     = useState<AcidenteForm>(ACID_EMPTY)
  const [savingAcid,    setSavingAcid]   = useState(false)
  const [acidDeleteId,  setAcidDeleteId] = useState<string | null>(null)

  // ── advertências ──────────────────────────────────────────────────────────
  const [advertencias,   setAdvertencias]   = useState<Advertencia[]>([])
  const [loadingAdv,     setLoadingAdv]     = useState(false)
  const [advOpen,        setAdvOpen]        = useState(false)
  const [advEditId,      setAdvEditId]      = useState<string | null>(null)
  const [advForm,        setAdvForm]        = useState<AdvertenciaForm>(ADV_EMPTY)
  const [savingAdv,      setSavingAdv]      = useState(false)
  const [advDeleteId,    setAdvDeleteId]    = useState<string | null>(null)

  // ── load shared ─────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      supabase.from('colaboradores').select('id, nome, chapa').eq('status', 'ativo').order('nome'),
      supabase.from('obras').select('id, nome').order('nome'),
    ]).then(([r1, r2]) => {
      setColaboradores((r1.data as Colaborador[]) ?? [])
      setObras((r2.data as Obra[]) ?? [])
      setLoadingShared(false)
    })
  }, [])

  // ── fetches ──────────────────────────────────────────────────────────────────
  const fetchAtestados = useCallback(async () => {
    setLoadingAtest(true)
    const { data, error } = await supabase
      .from('atestados')
      .select('id, colaborador_id, data, tipo, dias_afastamento, com_afastamento, cid, medico, descricao, observacoes, documento_url, documento_nome, colaboradores(id, nome, chapa)')
      .order('data', { ascending: false })
    if (error) toast.error('Erro atestados: ' + error.message)
    else setAtestados((data as unknown as Atestado[]) ?? [])
    setLoadingAtest(false)
  }, [])

  const fetchAcidentes = useCallback(async () => {
    setLoadingAcid(true)
    const { data, error } = await supabase
      .from('acidentes')
      .select('id, colaborador_id, obra_id, data_acidente, hora_acidente, tipo, gravidade, descricao, local_acidente, com_afastamento, dias_afastamento, cat_emitida, status, observacoes, colaboradores(id, nome, chapa), obras(id, nome)')
      .order('data_acidente', { ascending: false })
    if (error) toast.error('Erro acidentes: ' + error.message)
    else setAcidentes((data as unknown as Acidente[]) ?? [])
    setLoadingAcid(false)
  }, [])

  const fetchAdvertencias = useCallback(async () => {
    setLoadingAdv(true)
    const { data, error } = await supabase
      .from('advertencias')
      .select('id, colaborador_id, data_advertencia, tipo, motivo, descricao, assinada, observacoes, documento_url, documento_nome, colaboradores(id, nome, chapa)')
      .order('data_advertencia', { ascending: false })
    if (error) toast.error('Erro advertências: ' + error.message)
    else setAdvertencias((data as unknown as Advertencia[]) ?? [])
    setLoadingAdv(false)
  }, [])

  useEffect(() => { fetchAtestados(); fetchAcidentes(); fetchAdvertencias() }, [fetchAtestados, fetchAcidentes, fetchAdvertencias])

  // ── ATESTADO ─────────────────────────────────────────────────────────────────
  function openAtestCreate() { setAtestEditId(null); setAtestForm(ATEST_EMPTY); setAtestOpen(true) }
  function openAtestEdit(a: Atestado) {
    setAtestEditId(a.id)
    setAtestForm({
      colaborador_id: a.colaborador_id ?? '', data: a.data ?? '', tipo: a.tipo ?? 'medico',
      dias_afastamento: a.dias_afastamento != null ? String(a.dias_afastamento) : '',
      com_afastamento: a.com_afastamento ?? false, cid: a.cid ?? '', medico: a.medico ?? '',
      descricao: a.descricao ?? '', observacoes: a.observacoes ?? '',
      documento_url: a.documento_url ?? '', documento_nome: a.documento_nome ?? '',
    })
    setAtestOpen(true)
  }
  async function saveAtestado() {
    if (!atestForm.colaborador_id) { toast.error('Selecione um colaborador'); return }
    if (!atestForm.data)           { toast.error('Data é obrigatória'); return }
    if (!atestForm.documento_url)  { toast.error('Anexe o documento antes de salvar'); return }
    setSavingAtest(true)
    const payload = {
      colaborador_id: atestForm.colaborador_id, data: atestForm.data,
      tipo: atestForm.tipo || null,
      dias_afastamento: atestForm.dias_afastamento ? Number(atestForm.dias_afastamento) : null,
      com_afastamento: atestForm.com_afastamento,
      cid: atestForm.cid || null, medico: atestForm.medico || null,
      descricao: atestForm.descricao || null, observacoes: atestForm.observacoes || null,
      documento_url: atestForm.documento_url, documento_nome: atestForm.documento_nome,
    }
    const res = atestEditId
      ? await supabase.from('atestados').update(payload).eq('id', atestEditId)
      : await supabase.from('atestados').insert(payload)
    setSavingAtest(false)
    if (res.error) { toast.error('Erro ao salvar: ' + res.error.message); return }
    toast.success(atestEditId ? 'Atestado atualizado!' : 'Atestado cadastrado!')
    setAtestOpen(false); fetchAtestados()
  }
  async function deleteAtestado() {
    if (!atestDeleteId) return
    const { error } = await supabase.from('atestados').delete().eq('id', atestDeleteId)
    setAtestDeleteId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Atestado excluído'); fetchAtestados()
  }

  // ── ACIDENTE ─────────────────────────────────────────────────────────────────
  function openAcidCreate() { setAcidEditId(null); setAcidForm(ACID_EMPTY); setAcidOpen(true) }
  function openAcidEdit(a: Acidente) {
    setAcidEditId(a.id)
    setAcidForm({
      colaborador_id: a.colaborador_id ?? '', obra_id: a.obra_id ?? '',
      data_acidente: a.data_acidente ?? '', hora_acidente: a.hora_acidente ?? '',
      tipo: a.tipo ?? '', gravidade: a.gravidade ?? '', descricao: a.descricao ?? '',
      local_acidente: a.local_acidente ?? '', com_afastamento: a.com_afastamento ?? false,
      dias_afastamento: a.dias_afastamento != null ? String(a.dias_afastamento) : '',
      cat_emitida: a.cat_emitida ?? false, observacoes: a.observacoes ?? '',
    })
    setAcidOpen(true)
  }
  async function saveAcidente() {
    if (!acidForm.colaborador_id)   { toast.error('Selecione um colaborador'); return }
    if (!acidForm.data_acidente)    { toast.error('Data é obrigatória'); return }
    if (!acidForm.descricao.trim()) { toast.error('Descrição é obrigatória'); return }
    setSavingAcid(true)
    const payload = {
      colaborador_id: acidForm.colaborador_id, obra_id: acidForm.obra_id || null,
      data_acidente: acidForm.data_acidente, hora_acidente: acidForm.hora_acidente || null,
      tipo: acidForm.tipo || null, gravidade: acidForm.gravidade || null,
      descricao: acidForm.descricao, local_acidente: acidForm.local_acidente || null,
      com_afastamento: acidForm.com_afastamento,
      dias_afastamento: acidForm.com_afastamento && acidForm.dias_afastamento ? Number(acidForm.dias_afastamento) : null,
      cat_emitida: acidForm.cat_emitida, observacoes: acidForm.observacoes || null,
    }
    const res = acidEditId
      ? await supabase.from('acidentes').update(payload).eq('id', acidEditId)
      : await supabase.from('acidentes').insert(payload)
    setSavingAcid(false)
    if (res.error) { toast.error('Erro ao salvar: ' + res.error.message); return }
    toast.success(acidEditId ? 'Acidente atualizado!' : 'Acidente cadastrado!')
    setAcidOpen(false); fetchAcidentes()
  }
  async function deleteAcidente() {
    if (!acidDeleteId) return
    const { error } = await supabase.from('acidentes').delete().eq('id', acidDeleteId)
    setAcidDeleteId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Acidente excluído'); fetchAcidentes()
  }

  // ── ADVERTÊNCIA ───────────────────────────────────────────────────────────────
  function openAdvCreate() { setAdvEditId(null); setAdvForm(ADV_EMPTY); setAdvOpen(true) }
  function openAdvEdit(a: Advertencia) {
    setAdvEditId(a.id)
    setAdvForm({
      colaborador_id: a.colaborador_id ?? '', data_advertencia: a.data_advertencia ?? '',
      tipo: a.tipo ?? 'escrita', motivo: a.motivo ?? '', descricao: a.descricao ?? '',
      assinada: a.assinada ?? false, observacoes: a.observacoes ?? '',
      documento_url: a.documento_url ?? '', documento_nome: a.documento_nome ?? '',
    })
    setAdvOpen(true)
  }
  async function saveAdvertencia() {
    if (!advForm.colaborador_id)   { toast.error('Selecione um colaborador'); return }
    if (!advForm.data_advertencia) { toast.error('Data é obrigatória'); return }
    if (!advForm.motivo.trim())    { toast.error('Motivo é obrigatório'); return }
    if (!advForm.documento_url)    { toast.error('Anexe o documento da advertência antes de salvar'); return }
    setSavingAdv(true)
    const payload = {
      colaborador_id: advForm.colaborador_id, data_advertencia: advForm.data_advertencia,
      tipo: advForm.tipo, motivo: advForm.motivo, descricao: advForm.descricao || null,
      assinada: advForm.assinada, observacoes: advForm.observacoes || null,
      documento_url: advForm.documento_url, documento_nome: advForm.documento_nome,
    }
    const res = advEditId
      ? await supabase.from('advertencias').update(payload).eq('id', advEditId)
      : await supabase.from('advertencias').insert(payload)
    setSavingAdv(false)
    if (res.error) { toast.error('Erro ao salvar: ' + res.error.message); return }
    toast.success(advEditId ? 'Advertência atualizada!' : 'Advertência cadastrada!')
    setAdvOpen(false); fetchAdvertencias()
  }
  async function deleteAdvertencia() {
    if (!advDeleteId) return
    const { error } = await supabase.from('advertencias').delete().eq('id', advDeleteId)
    setAdvDeleteId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Advertência excluída'); fetchAdvertencias()
  }

  // ─── estilos ──────────────────────────────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
    fontWeight: active ? 700 : 400, background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--muted-foreground)', transition: 'all 0.15s',
  })
  const fieldRow: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
  const grid2: React.CSSProperties    = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }

  // ─── DocBadge inline na tabela ────────────────────────────────────────────────
  function DocBadge({ url, nome }: { url: string | null; nome: string | null }) {
    if (!url) return <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>⏳ Pendente</span>
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#16a34a', fontWeight: 600, textDecoration: 'none' }}>
        <FileText size={12} /> {nome ? nome.slice(0, 20) + (nome.length > 20 ? '…' : '') : 'Ver'}
      </a>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
      <PageHeader
        title="Ocorrências"
        subtitle="Atestados, Acidentes de Trabalho e Advertências"
        action={
          <Button onClick={() => {
            if (aba === 'atestados')    openAtestCreate()
            if (aba === 'acidentes')    openAcidCreate()
            if (aba === 'advertencias') openAdvCreate()
          }}>
            <Plus size={14} style={{ marginRight: 6 }} />
            {aba === 'atestados' ? 'Novo Atestado' : aba === 'acidentes' ? 'Novo Acidente' : 'Nova Advertência'}
          </Button>
        }
      />

      {/* Abas */}
      <div style={{ display: 'flex', gap: 6, background: 'var(--muted)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {([
          { key: 'atestados',    icon: <Stethoscope size={13} />,  label: 'Atestados' },
          { key: 'acidentes',    icon: <AlertTriangle size={13} />, label: 'Acidentes' },
          { key: 'advertencias', icon: <FileWarning size={13} />,  label: 'Advertências' },
        ] as const).map(t => (
          <button key={t.key} style={tabStyle(aba === t.key)} onClick={() => setAba(t.key)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{t.icon}{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ ABA ATESTADOS ══ */}
      {aba === 'atestados' && (
        loadingAtest || loadingShared ? <LoadingSkeleton /> :
        atestados.length === 0 ? (
          <EmptyState icon={<Stethoscope size={40} color="#94a3b8" />} title="Nenhum atestado cadastrado"
            description="Registre atestados médicos e afastamentos"
            action={<Button onClick={openAtestCreate}><Plus size={14} style={{ marginRight: 6 }} />Novo Atestado</Button>} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead><TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead><TableHead style={{ textAlign: 'center' }}>Dias</TableHead>
                  <TableHead>CID</TableHead><TableHead>Médico</TableHead>
                  <TableHead>Afastamento</TableHead><TableHead>Documento</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atestados.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div style={{ fontWeight: 600 }}>{a.colaboradores?.nome ?? '—'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.colaboradores?.chapa ?? ''}</div>
                    </TableCell>
                    <TableCell style={{ fontSize: 13 }}>{formatDate(a.data)}</TableCell>
                    <TableCell style={{ fontSize: 13 }}>{labelTipo(a.tipo, TIPOS_ATESTADO)}</TableCell>
                    <TableCell style={{ textAlign: 'center', fontWeight: 700 }}>{a.dias_afastamento != null ? `${a.dias_afastamento}d` : '—'}</TableCell>
                    <TableCell>{a.cid ? <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{a.cid}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</TableCell>
                    <TableCell style={{ fontSize: 13 }}>{a.medico ?? '—'}</TableCell>
                    <TableCell>
                      {a.com_afastamento
                        ? <span style={{ background: '#fff1f2', color: '#dc2626', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Sim</span>
                        : <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Não</span>}
                    </TableCell>
                    <TableCell><DocBadge url={a.documento_url} nome={a.documento_nome} /></TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button variant="outline" size="sm" onClick={() => openAtestEdit(a)}><Pencil size={14} /></Button>
                        <Button variant="outline" size="sm" style={{ color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => setAtestDeleteId(a.id)}><Trash2 size={14} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* ══ ABA ACIDENTES ══ */}
      {aba === 'acidentes' && (
        loadingAcid || loadingShared ? <LoadingSkeleton /> :
        acidentes.length === 0 ? (
          <EmptyState icon={<AlertTriangle size={40} color="#94a3b8" />} title="Nenhum acidente registrado"
            description="Registre acidentes de trabalho e ocorrências"
            action={<Button onClick={openAcidCreate}><Plus size={14} style={{ marginRight: 6 }} />Novo Acidente</Button>} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead><TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead><TableHead>Gravidade</TableHead>
                  <TableHead>Descrição</TableHead><TableHead>CAT</TableHead>
                  <TableHead>Status</TableHead><TableHead style={{ textAlign: 'right' }}>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acidentes.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div style={{ fontWeight: 600 }}>{a.colaboradores?.nome ?? '—'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.colaboradores?.chapa ?? ''}</div>
                      {a.obras && <div style={{ fontSize: 11, color: '#6366f1' }}>{a.obras.nome}</div>}
                    </TableCell>
                    <TableCell style={{ fontSize: 13 }}>
                      {formatDate(a.data_acidente)}
                      {a.hora_acidente && <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.hora_acidente}</div>}
                    </TableCell>
                    <TableCell style={{ fontSize: 13 }}>{labelTipo(a.tipo, TIPOS_ACIDENTE)}</TableCell>
                    <TableCell><GravBadge g={a.gravidade} /></TableCell>
                    <TableCell style={{ fontSize: 12, maxWidth: 200 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.descricao}</div></TableCell>
                    <TableCell>
                      {a.cat_emitida
                        ? <span style={{ background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>Emitida</span>
                        : <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>Não</span>}
                    </TableCell>
                    <TableCell style={{ fontSize: 12 }}>{labelTipo(a.status, STATUS_ACIDENTE)}</TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button variant="outline" size="sm" onClick={() => openAcidEdit(a)}><Pencil size={14} /></Button>
                        <Button variant="outline" size="sm" style={{ color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => setAcidDeleteId(a.id)}><Trash2 size={14} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* ══ ABA ADVERTÊNCIAS ══ */}
      {aba === 'advertencias' && (
        loadingAdv || loadingShared ? <LoadingSkeleton /> :
        advertencias.length === 0 ? (
          <EmptyState icon={<FileWarning size={40} color="#94a3b8" />} title="Nenhuma advertência registrada"
            description="Registre advertências, suspensões e ocorrências disciplinares"
            action={<Button onClick={openAdvCreate}><Plus size={14} style={{ marginRight: 6 }} />Nova Advertência</Button>} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead><TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead><TableHead>Motivo</TableHead>
                  <TableHead>Assinada</TableHead><TableHead>Documento</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advertencias.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div style={{ fontWeight: 600 }}>{a.colaboradores?.nome ?? '—'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.colaboradores?.chapa ?? ''}</div>
                    </TableCell>
                    <TableCell style={{ fontSize: 13 }}>{formatDate(a.data_advertencia)}</TableCell>
                    <TableCell><AdvTipoBadge tipo={a.tipo} /></TableCell>
                    <TableCell style={{ fontSize: 13, maxWidth: 180 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.motivo}</div></TableCell>
                    <TableCell>
                      {a.assinada
                        ? <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>✅ Sim</span>
                        : <span style={{ background: '#fffbeb', color: '#d97706', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>⏳ Pendente</span>}
                    </TableCell>
                    <TableCell><DocBadge url={a.documento_url} nome={a.documento_nome} /></TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button variant="outline" size="sm" onClick={() => openAdvEdit(a)}><Pencil size={14} /></Button>
                        <Button variant="outline" size="sm" style={{ color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => setAdvDeleteId(a.id)}><Trash2 size={14} /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* ══ MODAL ATESTADO ══ */}
      <Dialog open={atestOpen} onOpenChange={setAtestOpen}>
        <DialogContent style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}
          onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>{atestEditId ? 'Editar Atestado' : 'Novo Atestado'}</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            <div style={fieldRow}>
              <Label>Colaborador *</Label>
              <Select value={atestForm.colaborador_id || undefined} onValueChange={v => setAtestForm(p => ({ ...p, colaborador_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa ? ` — ${c.chapa}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div style={grid2}>
              <div style={fieldRow}>
                <Label>Data *</Label>
                <Input type="date" value={atestForm.data} onChange={e => setAtestForm(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div style={fieldRow}>
                <Label>Tipo</Label>
                <Select value={atestForm.tipo} onValueChange={v => setAtestForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_ATESTADO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div style={grid2}>
              <div style={fieldRow}>
                <Label>Dias de afastamento</Label>
                <Input type="number" min="0" value={atestForm.dias_afastamento} onChange={e => setAtestForm(p => ({ ...p, dias_afastamento: e.target.value }))} placeholder="0" />
              </div>
              <div style={fieldRow}>
                <Label>CID</Label>
                <Input value={atestForm.cid} onChange={e => setAtestForm(p => ({ ...p, cid: e.target.value }))} placeholder="Ex: J45.0" />
              </div>
            </div>
            <div style={fieldRow}>
              <Label>Médico</Label>
              <Input value={atestForm.medico} onChange={e => setAtestForm(p => ({ ...p, medico: e.target.value }))} placeholder="Nome do médico" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="ca" checked={atestForm.com_afastamento} onChange={e => setAtestForm(p => ({ ...p, com_afastamento: e.target.checked }))} />
              <label htmlFor="ca" style={{ fontSize: 13, cursor: 'pointer' }}>Com afastamento</label>
            </div>
            <div style={fieldRow}>
              <Label>Descrição / Diagnóstico</Label>
              <Textarea value={atestForm.descricao} onChange={e => setAtestForm(p => ({ ...p, descricao: e.target.value }))} rows={2} />
            </div>
            <div style={fieldRow}>
              <Label>Observações</Label>
              <Textarea value={atestForm.observacoes} onChange={e => setAtestForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} />
            </div>
            <UploadDocumento
              url={atestForm.documento_url} nome={atestForm.documento_nome}
              onChange={(url, nome) => setAtestForm(p => ({ ...p, documento_url: url, documento_nome: nome }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAtestOpen(false)}>Cancelar</Button>
            <Button onClick={saveAtestado} disabled={savingAtest || !atestForm.documento_url}>
              {savingAtest ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ MODAL ACIDENTE ══ */}
      <Dialog open={acidOpen} onOpenChange={setAcidOpen}>
        <DialogContent style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}
          onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>{acidEditId ? 'Editar Acidente' : 'Novo Acidente de Trabalho'}</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            <div style={grid2}>
              <div style={fieldRow}>
                <Label>Colaborador *</Label>
                <Select value={acidForm.colaborador_id || undefined} onValueChange={v => setAcidForm(p => ({ ...p, colaborador_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa ? ` — ${c.chapa}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div style={fieldRow}>
                <Label>Obra</Label>
                <Select value={acidForm.obra_id || undefined} onValueChange={v => setAcidForm(p => ({ ...p, obra_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div style={grid2}>
              <div style={fieldRow}>
                <Label>Data *</Label>
                <Input type="date" value={acidForm.data_acidente} onChange={e => setAcidForm(p => ({ ...p, data_acidente: e.target.value }))} />
              </div>
              <div style={fieldRow}>
                <Label>Hora</Label>
                <Input type="time" value={acidForm.hora_acidente} onChange={e => setAcidForm(p => ({ ...p, hora_acidente: e.target.value }))} />
              </div>
            </div>
            <div style={grid2}>
              <div style={fieldRow}>
                <Label>Tipo</Label>
                <Select value={acidForm.tipo || undefined} onValueChange={v => setAcidForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{TIPOS_ACIDENTE.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div style={fieldRow}>
                <Label>Gravidade</Label>
                <Select value={acidForm.gravidade || undefined} onValueChange={v => setAcidForm(p => ({ ...p, gravidade: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{GRAVIDADES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div style={fieldRow}>
              <Label>Local do acidente</Label>
              <Input value={acidForm.local_acidente} onChange={e => setAcidForm(p => ({ ...p, local_acidente: e.target.value }))} />
            </div>
            <div style={fieldRow}>
              <Label>Descrição *</Label>
              <Textarea value={acidForm.descricao} onChange={e => setAcidForm(p => ({ ...p, descricao: e.target.value }))} rows={3} />
            </div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="caa" checked={acidForm.com_afastamento} onChange={e => setAcidForm(p => ({ ...p, com_afastamento: e.target.checked }))} />
                <label htmlFor="caa" style={{ fontSize: 13, cursor: 'pointer' }}>Com afastamento</label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="cat" checked={acidForm.cat_emitida} onChange={e => setAcidForm(p => ({ ...p, cat_emitida: e.target.checked }))} />
                <label htmlFor="cat" style={{ fontSize: 13, cursor: 'pointer' }}>CAT emitida</label>
              </div>
            </div>
            {acidForm.com_afastamento && (
              <div style={fieldRow}>
                <Label>Dias de afastamento</Label>
                <Input type="number" min="0" value={acidForm.dias_afastamento} onChange={e => setAcidForm(p => ({ ...p, dias_afastamento: e.target.value }))} />
              </div>
            )}
            <div style={fieldRow}>
              <Label>Observações</Label>
              <Textarea value={acidForm.observacoes} onChange={e => setAcidForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcidOpen(false)}>Cancelar</Button>
            <Button onClick={saveAcidente} disabled={savingAcid}>{savingAcid ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ MODAL ADVERTÊNCIA ══ */}
      <Dialog open={advOpen} onOpenChange={setAdvOpen}>
        <DialogContent style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}
          onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>{advEditId ? 'Editar Advertência' : 'Nova Advertência'}</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            <div style={fieldRow}>
              <Label>Colaborador *</Label>
              <Select value={advForm.colaborador_id || undefined} onValueChange={v => setAdvForm(p => ({ ...p, colaborador_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa ? ` — ${c.chapa}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div style={grid2}>
              <div style={fieldRow}>
                <Label>Data *</Label>
                <Input type="date" value={advForm.data_advertencia} onChange={e => setAdvForm(p => ({ ...p, data_advertencia: e.target.value }))} />
              </div>
              <div style={fieldRow}>
                <Label>Tipo *</Label>
                <Select value={advForm.tipo} onValueChange={v => setAdvForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_ADVERTENCIA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div style={fieldRow}>
              <Label>Motivo *</Label>
              <Select value={advForm.motivo || undefined} onValueChange={v => setAdvForm(p => ({ ...p, motivo: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o motivo…" /></SelectTrigger>
                <SelectContent>{MOTIVOS_ADVERTENCIA.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div style={fieldRow}>
              <Label>Descrição detalhada</Label>
              <Textarea value={advForm.descricao} onChange={e => setAdvForm(p => ({ ...p, descricao: e.target.value }))} rows={3} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="assinada" checked={advForm.assinada} onChange={e => setAdvForm(p => ({ ...p, assinada: e.target.checked }))} />
              <label htmlFor="assinada" style={{ fontSize: 13, cursor: 'pointer' }}>Documento assinado pelo colaborador</label>
            </div>
            <div style={fieldRow}>
              <Label>Observações</Label>
              <Textarea value={advForm.observacoes} onChange={e => setAdvForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} />
            </div>
            <UploadDocumento
              url={advForm.documento_url} nome={advForm.documento_nome}
              onChange={(url, nome) => setAdvForm(p => ({ ...p, documento_url: url, documento_nome: nome }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvOpen(false)}>Cancelar</Button>
            <Button onClick={saveAdvertencia} disabled={savingAdv || !advForm.documento_url}>
              {savingAdv ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ CONFIRMS EXCLUSÃO ══ */}
      {([
        { id: atestDeleteId, setId: setAtestDeleteId, title: 'Excluir atestado?', del: deleteAtestado },
        { id: acidDeleteId,  setId: setAcidDeleteId,  title: 'Excluir acidente?', del: deleteAcidente },
        { id: advDeleteId,   setId: setAdvDeleteId,   title: 'Excluir advertência?', del: deleteAdvertencia },
      ] as const).map((item, i) => (
        <AlertDialog key={i} open={!!item.id} onOpenChange={o => { if (!o) item.setId(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{item.title}</AlertDialogTitle>
              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={item.del} style={{ background: '#dc2626' }}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ))}
    </div>
  )
}
