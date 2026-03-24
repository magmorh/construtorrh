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
import { Plus, Pencil, Trash2, Stethoscope, AlertTriangle, FileWarning, Upload, FileText, X, ExternalLink, Link2 } from 'lucide-react'
import { useProfile } from '@/hooks/useProfile'
import { traduzirErro } from '@/lib/erros'

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Colaborador = { id: string; nome: string; chapa: string }
type Obra        = { id: string; nome: string }

type AcidenteRef = { id: string; data_ocorrencia: string; tipo: string | null; descricao: string }

type Atestado = {
  id: string; colaborador_id: string
  data: string                         // coluna real no banco
  tipo: string | null; dias_afastamento: number | null
  com_afastamento: boolean | null; cid: string | null
  medico: string | null; descricao: string | null; observacoes: string | null
  acidente_id: string | null
  documento_url: string | null; documento_nome: string | null
  colaboradores: { id: string; nome: string; chapa: string } | null
  acidentes?: { id: string; data_ocorrencia: string; tipo: string | null } | null
}
type AtestadoForm = {
  colaborador_id: string; data: string; tipo: string; dias_afastamento: string
  com_afastamento: boolean; cid: string; medico: string; descricao: string; observacoes: string
  acidente_id: string; documento_url: string; documento_nome: string
}
const ATEST_EMPTY: AtestadoForm = {
  colaborador_id: '', data: '', tipo: 'medico', dias_afastamento: '',
  com_afastamento: false, cid: '', medico: '', descricao: '', observacoes: '',
  acidente_id: '', documento_url: '', documento_nome: '',
}

type Acidente = {
  id: string; colaborador_id: string; obra_id: string | null
  data_ocorrencia: string; hora_acidente: string | null
  tipo: string | null; gravidade: string | null; descricao: string
  local_acidente: string | null; cat_emitida: boolean | null
  status: string | null; observacoes: string | null
  documento_url: string | null; documento_nome: string | null
  colaboradores: { id: string; nome: string; chapa: string } | null
  obras: { id: string; nome: string } | null
}
type AcidenteForm = {
  colaborador_id: string; obra_id: string; data_ocorrencia: string; hora_acidente: string
  tipo: string; gravidade: string; descricao: string; local_acidente: string
  cat_emitida: boolean; observacoes: string
  documento_url: string; documento_nome: string
}
const ACID_EMPTY: AcidenteForm = {
  colaborador_id: '', obra_id: '', data_ocorrencia: '', hora_acidente: '',
  tipo: '', gravidade: '', descricao: '', local_acidente: '',
  cat_emitida: false, observacoes: '',
  documento_url: '', documento_nome: '',
}

type Advertencia = {
  id: string; colaborador_id: string; data_advertencia: string
  tipo: string; motivo: string; descricao: string | null
  assinada: boolean | null; dias_suspensao: number | null; observacoes: string | null
  documento_url: string | null; documento_nome: string | null
  colaboradores: { id: string; nome: string; chapa: string } | null
}
type AdvertenciaForm = {
  colaborador_id: string; data_advertencia: string; tipo: string
  motivo: string; descricao: string; assinada: boolean
  dias_suspensao: string; observacoes: string
  documento_url: string; documento_nome: string
}
const ADV_EMPTY: AdvertenciaForm = {
  colaborador_id: '', data_advertencia: '', tipo: 'escrita', motivo: '',
  descricao: '', assinada: false, dias_suspensao: '', observacoes: '',
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

// Calcula data_fim a partir de data_inicio + dias
function calcDataFim(dataInicio: string, dias: string): string | null {
  if (!dataInicio || !dias || Number(dias) <= 0) return null
  const d = new Date(dataInicio)
  d.setDate(d.getDate() + Number(dias) - 1)
  return d.toISOString().split('T')[0]
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
    verbal: { bg: '#eff6ff', color: '#1d4ed8', label: 'Verbal' },
    escrita: { bg: '#fffbeb', color: '#d97706', label: 'Escrita' },
    suspensao: { bg: '#fff1f2', color: '#dc2626', label: 'Suspensão' },
    demissional: { bg: '#1e1e2e', color: '#f8fafc', label: 'Justa Causa' },
  }
  const s = map[tipo] ?? { bg: '#f3f4f6', color: '#6b7280', label: tipo }
  return <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>
}

// ─── BUCKET ──────────────────────────────────────────────────────────────────
const BUCKET = 'ocorrencias-documentos'

async function uploadDoc(file: File, pasta: string): Promise<{ url: string; nome: string } | null> {
  const ext  = file.name.split('.').pop()
  const path = `${pasta}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
  if (error) { toast.error('Erro no upload: ' + error.message); return null }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, nome: file.name }
}

// ─── COMPONENTE UPLOAD ────────────────────────────────────────────────────────
function UploadDoc({
  url, nome, onChange, label = 'Documento', obrigatorio = true,
}: {
  url: string; nome: string
  onChange: (url: string, nome: string) => void
  label?: string; obrigatorio?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)) {
      toast.error('Apenas PDF ou imagem (JPG, PNG, WEBP)'); return
    }
    if (file.size > 10 * 1024 * 1024) { toast.error('Máx 10 MB'); return }
    setUploading(true)
    const res = await uploadDoc(file, 'docs')
    setUploading(false)
    if (res) { onChange(res.url, res.nome); toast.success('Documento anexado!') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Label>{label}{obrigatorio && <span style={{ color: '#dc2626' }}> *</span>}</Label>
        {obrigatorio && !url && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>⚠ Obrigatório para salvar</span>}
      </div>
      {url ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
          <FileText size={16} color="#16a34a" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome || 'Documento'}</span>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#16a34a' }}><ExternalLink size={14} /></a>
          <button onClick={() => onChange('', '')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2 }}><X size={14} /></button>
        </div>
      ) : (
        <div onClick={() => !uploading && ref.current?.click()}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px', borderRadius: 8, border: '2px dashed #d1d5db', background: '#fafafa', cursor: uploading ? 'wait' : 'pointer' }}>
          <Upload size={18} color="#9ca3af" />
          <span style={{ fontSize: 12, color: '#6b7280' }}>{uploading ? 'Enviando…' : 'Clique para anexar PDF ou imagem'}</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>PDF, JPG, PNG • máx 10 MB</span>
        </div>
      )}
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  )
}

function DocBadge({ url, nome }: { url: string | null; nome: string | null }) {
  if (!url) return <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>⏳ Pendente</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#16a34a', fontWeight: 600, textDecoration: 'none' }}>
      <FileText size={12} />{nome ? nome.slice(0,22) + (nome.length > 22 ? '…' : '') : 'Ver'}
    </a>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
type Aba = 'acidentes' | 'atestados' | 'advertencias' | 'portal'

// ─── ABA OCORRÊNCIAS DO PORTAL ────────────────────────────────────────────────
function OcorrenciasPortalTab({ obras, colaboradores }: { obras: {id:string;nome:string}[]; colaboradores: {id:string;nome:string;chapa:string}[] }) {
  const [rows, setRows]       = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroObra, setFiltroObra] = useState('')
  const [sincronizando, setSincronizando] = useState<Set<string>>(new Set())

  const TIPOS_LABEL: Record<string,string> = {
    ocorrencia:'Ocorrência', acidente:'Acidente', quase_acidente:'Quase Acidente', epi:'EPI/Segurança', disciplinar:'Disciplinar'
  }
  const GRAV_COR: Record<string,{bg:string;cor:string}> = {
    baixa:{bg:'#dcfce7',cor:'#15803d'}, media:{bg:'#fef3c7',cor:'#b45309'},
    alta:{bg:'#fee2e2',cor:'#dc2626'},  critica:{bg:'#ede9fe',cor:'#7c3aed'},
  }

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const q = supabase.from('portal_ocorrencias').select('*,colaboradores(nome)').order('criado_em', { ascending: false })
    if (filtroObra) q.eq('obra_id', filtroObra)
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }, [filtroObra])

  useEffect(() => { fetchRows() }, [fetchRows])

  async function sincronizar(r: any) {
    setSincronizando(prev => new Set([...prev, r.id]))
    // Cria na tabela de acidentes se for acidente, caso contrário apenas marca como sincronizado
    if (r.tipo === 'acidente' || r.tipo === 'quase_acidente') {
      await supabase.from('acidentes').insert({
        colaborador_id: r.colaborador_id ?? null,
        obra_id: r.obra_id,
        data_ocorrencia: r.data,
        tipo: r.tipo === 'acidente' ? 'com_afastamento' : 'sem_afastamento',
        descricao: `[PORTAL] ${r.titulo}${r.descricao ? ' — ' + r.descricao : ''}`,
        gravidade: r.gravidade,
      })
    }
    await supabase.from('portal_ocorrencias').update({ sincronizado_em: new Date().toISOString() }).eq('id', r.id)
    toast.success('Ocorrência sincronizada!')
    setSincronizando(prev => { const s = new Set(prev); s.delete(r.id); return s })
    fetchRows()
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:16 }}>📲 Ocorrências do Portal</div>
          <div style={{ fontSize:12, color:'var(--muted-foreground)' }}>Registradas pelo encarregado no app móvel</div>
        </div>
        <select value={filtroObra} onChange={e => setFiltroObra(e.target.value)}
          style={{ height:34, border:'1px solid var(--border)', borderRadius:7, padding:'0 12px', fontSize:13, background:'var(--input)', color:'var(--foreground)' }}>
          <option value="">Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
      </div>
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--muted-foreground)' }}>Carregando…</div>
      ) : rows.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:40, textAlign:'center', color:'var(--muted-foreground)' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📭</div>Nenhuma ocorrência registrada no portal
        </div>
      ) : (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          {rows.map((r, i) => {
            const gc = GRAV_COR[r.gravidade] ?? { bg:'#f3f4f6', cor:'#374151' }
            const jaSync = !!r.sincronizado_em
            const sync = sincronizando.has(r.id)
            return (
              <div key={r.id} style={{ padding:'14px 18px', borderTop:i>0?'1px solid var(--border)':'none', display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontWeight:700, fontSize:14 }}>{TIPOS_LABEL[r.tipo] ?? r.tipo} — {r.titulo}</span>
                    <span style={{ background:gc.bg, color:gc.cor, borderRadius:5, padding:'2px 7px', fontSize:11, fontWeight:700 }}>{r.gravidade?.charAt(0).toUpperCase()+r.gravidade?.slice(1)}</span>
                    {jaSync && <span style={{ background:'#dcfce7', color:'#15803d', borderRadius:5, padding:'2px 7px', fontSize:11, fontWeight:700 }}>✓ Sincronizado</span>}
                  </div>
                  {r.colaboradores?.nome && <div style={{ fontSize:12, color:'var(--muted-foreground)' }}>👤 {r.colaboradores.nome}</div>}
                  {r.descricao && <div style={{ fontSize:11, color:'var(--muted-foreground)', marginTop:3, fontStyle:'italic' }}>{r.descricao}</div>}
                  <div style={{ fontSize:10, color:'var(--muted-foreground)', marginTop:4 }}>
                    📅 {new Date(r.data).toLocaleDateString('pt-BR')} · Registrado {new Date(r.criado_em).toLocaleString('pt-BR')}
                  </div>
                </div>
                {!jaSync && (
                  <button onClick={() => sincronizar(r)} disabled={sync}
                    style={{ background:'#1e3a5f', color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:sync?'wait':'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
                    {sync ? '⏳…' : '🔄 Sincronizar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── PRINCIPAL ────────────────────────────────────────────────────────────────
export default function Ocorrencias() {
  const [aba, setAba] = useState<Aba>('acidentes')
  const { permissions } = useProfile()

  const [colaboradores,    setColaboradores]    = useState<Colaborador[]>([])
  const [obras,            setObras]            = useState<Obra[]>([])
  const [loadingShared,    setLoadingShared]    = useState(true)
  const [acidDoColaborador, setAcidDoColaborador] = useState<AcidenteRef[]>([])

  // ── atestados ─────────────────────────────────────────────────────────────
  const [atestados,     setAtestados]     = useState<Atestado[]>([])
  const [loadingAtest,  setLoadingAtest]  = useState(false)
  const [atestOpen,     setAtestOpen]     = useState(false)
  const [atestEditId,   setAtestEditId]   = useState<string | null>(null)
  const [atestForm,     setAtestForm]     = useState<AtestadoForm>(ATEST_EMPTY)
  const [savingAtest,   setSavingAtest]   = useState(false)
  const [atestDeleteId, setAtestDeleteId] = useState<string | null>(null)

  // ── acidentes ─────────────────────────────────────────────────────────────
  const [acidentes,    setAcidentes]    = useState<Acidente[]>([])
  const [loadingAcid,  setLoadingAcid]  = useState(false)
  const [acidOpen,     setAcidOpen]     = useState(false)
  const [acidEditId,   setAcidEditId]   = useState<string | null>(null)
  const [acidForm,     setAcidForm]     = useState<AcidenteForm>(ACID_EMPTY)
  const [savingAcid,   setSavingAcid]   = useState(false)
  const [acidDeleteId, setAcidDeleteId] = useState<string | null>(null)

  // ── advertências ──────────────────────────────────────────────────────────
  const [advertencias,  setAdvertencias]  = useState<Advertencia[]>([])
  const [loadingAdv,    setLoadingAdv]    = useState(false)
  const [advOpen,       setAdvOpen]       = useState(false)
  const [advEditId,     setAdvEditId]     = useState<string | null>(null)
  const [advForm,       setAdvForm]       = useState<AdvertenciaForm>(ADV_EMPTY)
  const [savingAdv,     setSavingAdv]     = useState(false)
  const [advDeleteId,   setAdvDeleteId]   = useState<string | null>(null)

  // ── load shared ───────────────────────────────────────────────────────────
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

  // ── fetches ───────────────────────────────────────────────────────────────
  const fetchAtestados = useCallback(async () => {
    setLoadingAtest(true)
    const { data, error } = await supabase
      .from('atestados')
      .select('id, colaborador_id, data, tipo, dias_afastamento, com_afastamento, cid, medico, descricao, observacoes, acidente_id, documento_url, documento_nome, colaboradores(id, nome, chapa), acidentes(id, data_ocorrencia, tipo)')
      .order('data', { ascending: false })
    if (error) toast.error('Erro atestados: ' + error.message)
    else setAtestados((data as unknown as Atestado[]) ?? [])
    setLoadingAtest(false)
  }, [])

  const fetchAcidentes = useCallback(async () => {
    setLoadingAcid(true)
    // Tenta com colunas de documento; se falhar (coluna não existe no banco), tenta sem
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let res: any = await supabase
      .from('acidentes')
      .select('id, colaborador_id, obra_id, data_ocorrencia, hora_acidente, tipo, gravidade, descricao, local_acidente, cat_emitida, status, observacoes, documento_url, documento_nome, colaboradores(id, nome, chapa), obras(id, nome)')
      .order('data_ocorrencia', { ascending: false })
    if (res.error && res.error.message.includes('documento_')) {
      res = await supabase
        .from('acidentes')
        .select('id, colaborador_id, obra_id, data_ocorrencia, hora_acidente, tipo, gravidade, descricao, local_acidente, cat_emitida, status, observacoes, colaboradores(id, nome, chapa), obras(id, nome)')
        .order('data_ocorrencia', { ascending: false })
    }
    if (res.error) toast.error('Erro acidentes: ' + res.error.message)
    else setAcidentes((res.data as unknown as Acidente[]) ?? [])
    setLoadingAcid(false)
  }, [])

  const fetchAdvertencias = useCallback(async () => {
    setLoadingAdv(true)
    const { data, error } = await supabase
      .from('advertencias')
      .select('id, colaborador_id, data_advertencia, tipo, motivo, descricao, assinada, dias_suspensao, observacoes, documento_url, documento_nome, colaboradores(id, nome, chapa)')
      .order('data_advertencia', { ascending: false })
    if (error) toast.error('Erro advertências: ' + error.message)
    else setAdvertencias((data as unknown as Advertencia[]) ?? [])
    setLoadingAdv(false)
  }, [])

  useEffect(() => { fetchAtestados(); fetchAcidentes(); fetchAdvertencias() },
    [fetchAtestados, fetchAcidentes, fetchAdvertencias])

  // Buscar acidentes do colaborador selecionado (para vincular ao atestado)
  async function fetchAcidColaborador(colabId: string) {
    if (!colabId) { setAcidDoColaborador([]); return }
    const { data } = await supabase
      .from('acidentes')
      .select('id, data_ocorrencia, tipo, descricao')
      .eq('colaborador_id', colabId)
      .order('data_ocorrencia', { ascending: false })
    setAcidDoColaborador((data as AcidenteRef[]) ?? [])
  }

  // ── ATESTADO handlers ─────────────────────────────────────────────────────
  function openAtestCreate() {
    setAtestEditId(null)
    setAtestForm(ATEST_EMPTY)
    setAcidDoColaborador([])
    setAtestOpen(true)
  }
  function openAtestEdit(a: Atestado) {
    setAtestEditId(a.id)
    setAtestForm({
      colaborador_id: a.colaborador_id ?? '', data: a.data ?? '', tipo: a.tipo ?? 'medico',
      dias_afastamento: a.dias_afastamento != null ? String(a.dias_afastamento) : '',
      com_afastamento: a.com_afastamento ?? false, cid: a.cid ?? '', medico: a.medico ?? '',
      descricao: a.descricao ?? '', observacoes: a.observacoes ?? '',
      acidente_id: a.acidente_id ?? '',
      documento_url: a.documento_url ?? '', documento_nome: a.documento_nome ?? '',
    })
    fetchAcidColaborador(a.colaborador_id)
    setAtestOpen(true)
  }
  async function saveAtestado() {
    if (!atestForm.colaborador_id) { toast.error('Selecione um colaborador'); return }
    if (!atestForm.data)           { toast.error('Data de início é obrigatória'); return }
    if (!atestForm.documento_url)  { toast.error('Anexe o documento antes de salvar'); return }
    setSavingAtest(true)
    const payload: Record<string, unknown> = {
      colaborador_id: atestForm.colaborador_id, data: atestForm.data, tipo: atestForm.tipo || null,
      dias_afastamento: atestForm.dias_afastamento ? Number(atestForm.dias_afastamento) : null,
      com_afastamento: atestForm.com_afastamento, cid: atestForm.cid || null,
      medico: atestForm.medico || null, descricao: atestForm.descricao || null,
      observacoes: atestForm.observacoes || null, acidente_id: atestForm.acidente_id || null,
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
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success('Atestado excluído'); fetchAtestados()
  }

  // ── ACIDENTE handlers ─────────────────────────────────────────────────────
  function openAcidCreate() { setAcidEditId(null); setAcidForm(ACID_EMPTY); setAcidOpen(true) }
  function openAcidEdit(a: Acidente) {
    setAcidEditId(a.id)
    setAcidForm({
      colaborador_id: a.colaborador_id ?? '', obra_id: a.obra_id ?? '',
      data_ocorrencia: a.data_ocorrencia ?? '', hora_acidente: a.hora_acidente ?? '',
      tipo: a.tipo ?? '', gravidade: a.gravidade ?? '', descricao: a.descricao ?? '',
      local_acidente: a.local_acidente ?? '', cat_emitida: a.cat_emitida ?? false,
      observacoes: a.observacoes ?? '',
      documento_url: a.documento_url ?? '', documento_nome: a.documento_nome ?? '',
    })
    setAcidOpen(true)
  }
  async function saveAcidente() {
    if (!acidForm.colaborador_id)   { toast.error('Selecione um colaborador'); return }
    if (!acidForm.data_ocorrencia)    { toast.error('Data é obrigatória'); return }
    if (!acidForm.descricao.trim()) { toast.error('Descrição é obrigatória'); return }
    if (acidForm.cat_emitida && !acidForm.documento_url) {
      toast.error('CAT emitida: anexe o documento da CAT para salvar'); return
    }
    setSavingAcid(true)
    const payload: Record<string, unknown> = {
      colaborador_id: acidForm.colaborador_id, obra_id: acidForm.obra_id || null,
      data_ocorrencia: acidForm.data_ocorrencia, hora_acidente: acidForm.hora_acidente || null,
      tipo: acidForm.tipo || null, gravidade: acidForm.gravidade || null,
      descricao: acidForm.descricao, local_acidente: acidForm.local_acidente || null,
      cat_emitida: acidForm.cat_emitida, observacoes: acidForm.observacoes || null,
      documento_url: acidForm.documento_url || null, documento_nome: acidForm.documento_nome || null,
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
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success('Acidente excluído'); fetchAcidentes()
  }

  // ── ADVERTÊNCIA handlers ──────────────────────────────────────────────────
  function openAdvCreate() { setAdvEditId(null); setAdvForm(ADV_EMPTY); setAdvOpen(true) }
  function openAdvEdit(a: Advertencia) {
    setAdvEditId(a.id)
    setAdvForm({
      colaborador_id: a.colaborador_id ?? '', data_advertencia: a.data_advertencia ?? '',
      tipo: a.tipo ?? 'escrita', motivo: a.motivo ?? '', descricao: a.descricao ?? '',
      assinada: a.assinada ?? false,
      dias_suspensao: a.dias_suspensao != null ? String(a.dias_suspensao) : '',
      observacoes: a.observacoes ?? '',
      documento_url: a.documento_url ?? '', documento_nome: a.documento_nome ?? '',
    })
    setAdvOpen(true)
  }
  async function saveAdvertencia() {
    if (!advForm.colaborador_id)   { toast.error('Selecione um colaborador'); return }
    if (!advForm.data_advertencia) { toast.error('Data é obrigatória'); return }
    if (!advForm.motivo.trim())    { toast.error('Motivo é obrigatório'); return }
    if (!advForm.documento_url)    { toast.error('Anexe o documento antes de salvar'); return }
    setSavingAdv(true)
    const payload: Record<string, unknown> = {
      colaborador_id: advForm.colaborador_id, data_advertencia: advForm.data_advertencia,
      tipo: advForm.tipo, motivo: advForm.motivo, descricao: advForm.descricao || null,
      assinada: advForm.assinada,
      dias_suspensao: (advForm.tipo === 'suspensao' && advForm.dias_suspensao) ? Number(advForm.dias_suspensao) : null,
      observacoes: advForm.observacoes || null,
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
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success('Advertência excluída'); fetchAdvertencias()
  }

  // ── estilos ───────────────────────────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
    fontWeight: active ? 700 : 400, background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--muted-foreground)', transition: 'all 0.15s',
  })
  const fRow: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
  const g2: React.CSSProperties   = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }

  // Data fim calculada (atestado)
  const atestDataFim = calcDataFim(atestForm.data, atestForm.dias_afastamento)

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
      <PageHeader
        title="Ocorrências"
        subtitle="Acidentes de Trabalho, Atestados e Advertências"
        action={
          permissions.canCreate ? (
            <Button onClick={() => {
              if (aba === 'acidentes')    openAcidCreate()
              if (aba === 'atestados')    openAtestCreate()
              if (aba === 'advertencias') openAdvCreate()
            }}>
              <Plus size={14} style={{ marginRight: 6 }} />
              {aba === 'acidentes' ? 'Novo Acidente' : aba === 'atestados' ? 'Novo Atestado' : 'Nova Advertência'}
            </Button>
          ) : undefined
        }
      />

      {/* Abas */}
      <div style={{ display: 'flex', gap: 6, background: 'var(--muted)', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {([
          { key: 'acidentes',    icon: <AlertTriangle size={13} />, label: 'Acidentes' },
          { key: 'atestados',    icon: <Stethoscope size={13} />,  label: 'Atestados' },
          { key: 'advertencias', icon: <FileWarning size={13} />,  label: 'Advertências' },
          { key: 'portal',       icon: <span style={{fontSize:12}}>📲</span>,          label: 'Do Portal' },
        ] as const).map(t => (
          <button key={t.key} style={tabStyle(aba === t.key)} onClick={() => setAba(t.key)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{t.icon}{t.label}</span>
          </button>
        ))}
      </div>

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
                  <TableHead>Colaborador</TableHead><TableHead>Data / Hora</TableHead>
                  <TableHead>Tipo</TableHead><TableHead>Gravidade</TableHead>
                  <TableHead>Descrição</TableHead><TableHead>CAT</TableHead>
                  <TableHead>Documento CAT</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Ações</TableHead>
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
                      {formatDate(a.data_ocorrencia)}
                      {a.hora_acidente && <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.hora_acidente}</div>}
                    </TableCell>
                    <TableCell style={{ fontSize: 13 }}>{labelTipo(a.tipo, TIPOS_ACIDENTE)}</TableCell>
                    <TableCell><GravBadge g={a.gravidade} /></TableCell>
                    <TableCell style={{ fontSize: 12, maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.descricao}</div>
                    </TableCell>
                    <TableCell>
                      {a.cat_emitida
                        ? <span style={{ background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>✅ Emitida</span>
                        : <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>Não</span>}
                    </TableCell>
                    <TableCell>
                      {a.cat_emitida ? <DocBadge url={a.documento_url} nome={a.documento_nome} /> : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {permissions.canEdit   && <Button variant="outline" size="sm" onClick={() => openAcidEdit(a)}><Pencil size={14} /></Button>}
                        {permissions.canDelete && <Button variant="outline" size="sm" style={{ color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => setAcidDeleteId(a.id)}><Trash2 size={14} /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* ══ ABA ATESTADOS ══ */}
      {aba === 'atestados' && (
        loadingAtest || loadingShared ? <LoadingSkeleton /> :
        atestados.length === 0 ? (
          <EmptyState icon={<Stethoscope size={40} color="#94a3b8" />} title="Nenhum atestado cadastrado"
            description="Registre atestados e afastamentos. O documento é obrigatório."
            action={<Button onClick={openAtestCreate}><Plus size={14} style={{ marginRight: 6 }} />Novo Atestado</Button>} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead><TableHead>Data início</TableHead>
                  <TableHead>Válido até</TableHead><TableHead style={{ textAlign: 'center' }}>Dias</TableHead>
                  <TableHead>Tipo</TableHead><TableHead>CID</TableHead>
                  <TableHead>Acidente vinc.</TableHead><TableHead>Documento</TableHead>
                  <TableHead style={{ textAlign: 'right' }}>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atestados.map(a => {
                  const fim = calcDataFim(a.data, a.dias_afastamento != null ? String(a.dias_afastamento) : '')
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div style={{ fontWeight: 600 }}>{a.colaboradores?.nome ?? '—'}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.colaboradores?.chapa ?? ''}</div>
                      </TableCell>
                      <TableCell style={{ fontSize: 13 }}>{formatDate(a.data)}</TableCell>
                      <TableCell>
                        {fim
                          ? <span style={{ fontSize: 12, fontWeight: 600, color: '#dc2626' }}>{formatDate(fim)}</span>
                          : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                      </TableCell>
                      <TableCell style={{ textAlign: 'center', fontWeight: 700 }}>
                        {a.dias_afastamento != null ? `${a.dias_afastamento}d` : '—'}
                      </TableCell>
                      <TableCell style={{ fontSize: 13 }}>{labelTipo(a.tipo, TIPOS_ATESTADO)}</TableCell>
                      <TableCell>
                        {a.cid ? <span style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{a.cid}</span>
                          : <span style={{ color: '#94a3b8' }}>—</span>}
                      </TableCell>
                      <TableCell>
                        {a.acidentes
                          ? <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Link2 size={12} color="#6366f1" />
                              <span style={{ fontSize: 12, color: '#6366f1' }}>{formatDate((a.acidentes as any).data_ocorrencia)}</span>
                            </div>
                          : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                      </TableCell>
                      <TableCell><DocBadge url={a.documento_url} nome={a.documento_nome} /></TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {permissions.canEdit   && <Button variant="outline" size="sm" onClick={() => openAtestEdit(a)}><Pencil size={14} /></Button>}
                          {permissions.canDelete && <Button variant="outline" size="sm" style={{ color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => setAtestDeleteId(a.id)}><Trash2 size={14} /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
            description="Registre advertências, suspensões e ocorrências disciplinares. Documento obrigatório."
            action={<Button onClick={openAdvCreate}><Plus size={14} style={{ marginRight: 6 }} />Nova Advertência</Button>} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead><TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead><TableHead>Motivo</TableHead>
                  <TableHead>Suspensão / Retorno</TableHead>
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
                    <TableCell style={{ fontSize: 13, maxWidth: 180 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.motivo}</div>
                    </TableCell>
                    <TableCell>
                      {a.tipo === 'suspensao' && a.dias_suspensao
                        ? (() => {
                            const fim    = calcDataFim(a.data_advertencia, String(a.dias_suspensao))
                            const retorno = fim ? new Date(new Date(fim).getTime() + 86400000).toISOString().split('T')[0] : null
                            return (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{a.dias_suspensao}d · até {fim ? formatDate(fim) : '—'}</div>
                                {retorno && <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Retorno: {formatDate(retorno)}</div>}
                              </div>
                            )
                          })()
                        : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                    </TableCell>
                    <TableCell>
                      {a.assinada
                        ? <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>✅ Sim</span>
                        : <span style={{ background: '#fffbeb', color: '#d97706', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>⏳ Pendente</span>}
                    </TableCell>
                    <TableCell><DocBadge url={a.documento_url} nome={a.documento_nome} /></TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {permissions.canEdit   && <Button variant="outline" size="sm" onClick={() => openAdvEdit(a)}><Pencil size={14} /></Button>}
                        {permissions.canDelete && <Button variant="outline" size="sm" style={{ color: '#ef4444', borderColor: '#fca5a5' }} onClick={() => setAdvDeleteId(a.id)}><Trash2 size={14} /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* ══ ABA DO PORTAL ══ */}
      {aba === 'portal' && (
        <OcorrenciasPortalTab obras={obras} colaboradores={colaboradores} />
      )}

      {/* ══ MODAL ACIDENTE ══ */}
      <Dialog open={acidOpen} onOpenChange={setAcidOpen}>
        <DialogContent style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}
          onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>{acidEditId ? 'Editar Acidente' : 'Novo Acidente de Trabalho'}</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            <div style={g2}>
              <div style={fRow}>
                <Label>Colaborador *</Label>
                <Select value={acidForm.colaborador_id || undefined} onValueChange={v => setAcidForm(p => ({ ...p, colaborador_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa ? ` — ${c.chapa}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div style={fRow}>
                <Label>Obra</Label>
                <Select value={acidForm.obra_id || undefined} onValueChange={v => setAcidForm(p => ({ ...p, obra_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div style={g2}>
              <div style={fRow}><Label>Data *</Label><Input type="date" value={acidForm.data_ocorrencia} onChange={e => setAcidForm(p => ({ ...p, data_ocorrencia: e.target.value }))} /></div>
              <div style={fRow}><Label>Hora</Label><Input type="time" value={acidForm.hora_acidente} onChange={e => setAcidForm(p => ({ ...p, hora_acidente: e.target.value }))} /></div>
            </div>
            <div style={g2}>
              <div style={fRow}>
                <Label>Tipo</Label>
                <Select value={acidForm.tipo || undefined} onValueChange={v => setAcidForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{TIPOS_ACIDENTE.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div style={fRow}>
                <Label>Gravidade</Label>
                <Select value={acidForm.gravidade || undefined} onValueChange={v => setAcidForm(p => ({ ...p, gravidade: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{GRAVIDADES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div style={fRow}><Label>Local do acidente</Label><Input value={acidForm.local_acidente} onChange={e => setAcidForm(p => ({ ...p, local_acidente: e.target.value }))} /></div>
            <div style={fRow}><Label>Descrição *</Label><Textarea value={acidForm.descricao} onChange={e => setAcidForm(p => ({ ...p, descricao: e.target.value }))} rows={3} /></div>
            <div style={fRow}><Label>Observações</Label><Textarea value={acidForm.observacoes} onChange={e => setAcidForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} /></div>

            {/* CAT */}
            <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fafafa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: acidForm.cat_emitida ? 14 : 0 }}>
                <input type="checkbox" id="cat_emitida" checked={acidForm.cat_emitida}
                  onChange={e => setAcidForm(p => ({ ...p, cat_emitida: e.target.checked, documento_url: e.target.checked ? p.documento_url : '', documento_nome: e.target.checked ? p.documento_nome : '' }))} />
                <label htmlFor="cat_emitida" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  CAT emitida (Comunicação de Acidente de Trabalho)
                </label>
              </div>
              {acidForm.cat_emitida && (
                <UploadDoc url={acidForm.documento_url} nome={acidForm.documento_nome}
                  label="Documento da CAT" obrigatorio={true}
                  onChange={(url, nome) => setAcidForm(p => ({ ...p, documento_url: url, documento_nome: nome }))} />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcidOpen(false)}>Cancelar</Button>
            <Button onClick={saveAcidente} disabled={savingAcid || (acidForm.cat_emitida && !acidForm.documento_url)}>
              {savingAcid ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ MODAL ATESTADO ══ */}
      <Dialog open={atestOpen} onOpenChange={setAtestOpen}>
        <DialogContent style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}
          onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>{atestEditId ? 'Editar Atestado' : 'Novo Atestado'}</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            <div style={fRow}>
              <Label>Colaborador *</Label>
              <Select value={atestForm.colaborador_id || undefined} onValueChange={v => {
                setAtestForm(p => ({ ...p, colaborador_id: v, acidente_id: '' }))
                fetchAcidColaborador(v)
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa ? ` — ${c.chapa}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Vincular acidente */}
            {atestForm.colaborador_id && (
              <div style={fRow}>
                <Label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Link2 size={13} color="#6366f1" /> Vincular a acidente de trabalho</Label>
                <Select value={atestForm.acidente_id || 'nenhum'} onValueChange={v => setAtestForm(p => ({ ...p, acidente_id: v === 'nenhum' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">— Nenhum —</SelectItem>
                    {acidDoColaborador.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {formatDate(a.data_ocorrencia)} · {labelTipo(a.tipo, TIPOS_ACIDENTE)} · {a.descricao?.slice(0, 40) ?? ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {acidDoColaborador.length === 0 && <span style={{ fontSize: 11, color: '#9ca3af' }}>Nenhum acidente registrado para este colaborador</span>}
              </div>
            )}

            <div style={g2}>
              <div style={fRow}><Label>Data início *</Label><Input type="date" value={atestForm.data} onChange={e => setAtestForm(p => ({ ...p, data: e.target.value }))} /></div>
              <div style={fRow}>
                <Label>Dias de afastamento</Label>
                <Input type="number" min="0" value={atestForm.dias_afastamento} onChange={e => setAtestForm(p => ({ ...p, dias_afastamento: e.target.value }))} placeholder="0" />
              </div>
            </div>

            {/* Calculado */}
            {atestDataFim && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}>
                <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>📅 Válido até: {formatDate(atestDataFim)}</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>(retorno em {formatDate(new Date(new Date(atestDataFim).getTime() + 86400000).toISOString().split('T')[0])})</span>
              </div>
            )}

            <div style={g2}>
              <div style={fRow}>
                <Label>Tipo</Label>
                <Select value={atestForm.tipo} onValueChange={v => setAtestForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_ATESTADO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div style={fRow}><Label>CID</Label><Input value={atestForm.cid} onChange={e => setAtestForm(p => ({ ...p, cid: e.target.value }))} placeholder="Ex: J45.0" /></div>
            </div>
            <div style={fRow}><Label>Médico</Label><Input value={atestForm.medico} onChange={e => setAtestForm(p => ({ ...p, medico: e.target.value }))} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="ca" checked={atestForm.com_afastamento} onChange={e => setAtestForm(p => ({ ...p, com_afastamento: e.target.checked }))} />
              <label htmlFor="ca" style={{ fontSize: 13, cursor: 'pointer' }}>Com afastamento</label>
            </div>
            <div style={fRow}><Label>Descrição / Diagnóstico</Label><Textarea value={atestForm.descricao} onChange={e => setAtestForm(p => ({ ...p, descricao: e.target.value }))} rows={2} /></div>
            <div style={fRow}><Label>Observações</Label><Textarea value={atestForm.observacoes} onChange={e => setAtestForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} /></div>
            <UploadDoc url={atestForm.documento_url} nome={atestForm.documento_nome} label="Atestado (PDF ou imagem)" obrigatorio={true}
              onChange={(url, nome) => setAtestForm(p => ({ ...p, documento_url: url, documento_nome: nome }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAtestOpen(false)}>Cancelar</Button>
            <Button onClick={saveAtestado} disabled={savingAtest || !atestForm.documento_url}>
              {savingAtest ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ MODAL ADVERTÊNCIA ══ */}
      <Dialog open={advOpen} onOpenChange={setAdvOpen}>
        <DialogContent style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}
          onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>{advEditId ? 'Editar Advertência' : 'Nova Advertência'}</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            <div style={fRow}>
              <Label>Colaborador *</Label>
              <Select value={advForm.colaborador_id || undefined} onValueChange={v => setAdvForm(p => ({ ...p, colaborador_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa ? ` — ${c.chapa}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div style={g2}>
              <div style={fRow}><Label>Data *</Label><Input type="date" value={advForm.data_advertencia} onChange={e => setAdvForm(p => ({ ...p, data_advertencia: e.target.value }))} /></div>
              <div style={fRow}>
                <Label>Tipo *</Label>
                <Select value={advForm.tipo} onValueChange={v => setAdvForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_ADVERTENCIA.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div style={fRow}>
              <Label>Motivo *</Label>
              <Select value={advForm.motivo || undefined} onValueChange={v => setAdvForm(p => ({ ...p, motivo: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{MOTIVOS_ADVERTENCIA.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Suspensão: dias + data de retorno */}
            {advForm.tipo === 'suspensao' && (
              <>
                <div style={fRow}>
                  <Label>Dias de suspensão</Label>
                  <Input
                    type="number" min="1"
                    value={advForm.dias_suspensao}
                    onChange={e => setAdvForm(p => ({ ...p, dias_suspensao: e.target.value }))}
                    placeholder="Ex: 3"
                  />
                </div>
                {calcDataFim(advForm.data_advertencia, advForm.dias_suspensao) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                      🔴 Suspenso até: {formatDate(calcDataFim(advForm.data_advertencia, advForm.dias_suspensao)!)}
                    </span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>
                      (retorno em {formatDate(new Date(new Date(calcDataFim(advForm.data_advertencia, advForm.dias_suspensao)!).getTime() + 86400000).toISOString().split('T')[0])})
                    </span>
                  </div>
                )}
              </>
            )}

            <div style={fRow}><Label>Descrição detalhada</Label><Textarea value={advForm.descricao} onChange={e => setAdvForm(p => ({ ...p, descricao: e.target.value }))} rows={3} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="assinada" checked={advForm.assinada} onChange={e => setAdvForm(p => ({ ...p, assinada: e.target.checked }))} />
              <label htmlFor="assinada" style={{ fontSize: 13, cursor: 'pointer' }}>Documento assinado pelo colaborador</label>
            </div>
            <div style={fRow}><Label>Observações</Label><Textarea value={advForm.observacoes} onChange={e => setAdvForm(p => ({ ...p, observacoes: e.target.value }))} rows={2} /></div>
            <UploadDoc url={advForm.documento_url} nome={advForm.documento_nome} label="Documento da advertência" obrigatorio={true}
              onChange={(url, nome) => setAdvForm(p => ({ ...p, documento_url: url, documento_nome: nome }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvOpen(false)}>Cancelar</Button>
            <Button onClick={saveAdvertencia} disabled={savingAdv || !advForm.documento_url}>
              {savingAdv ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ CONFIRMS DE EXCLUSÃO ══ */}
      <AlertDialog open={!!atestDeleteId} onOpenChange={o => { if (!o) setAtestDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir atestado?</AlertDialogTitle>
            <AlertDialogDescription>
              ⚠️ Este registro possui um documento anexado. A exclusão é permanente e não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAtestado} style={{ background: '#dc2626' }}>Excluir mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!acidDeleteId} onOpenChange={o => { if (!o) setAcidDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir acidente?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O documento CAT (se houver) não será removido do storage.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAcidente} style={{ background: '#dc2626' }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!advDeleteId} onOpenChange={o => { if (!o) setAdvDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir advertência?</AlertDialogTitle>
            <AlertDialogDescription>⚠️ Este registro possui um documento anexado. A exclusão é permanente e não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteAdvertencia} style={{ background: '#dc2626' }}>Excluir mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
