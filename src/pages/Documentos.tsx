import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { EmptyState, LoadingSkeleton } from '@/components/Shared'
import { useProfile } from '@/hooks/useProfile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { FileText, Search, Plus, Upload, X, Trash2, ExternalLink, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

type Colaborador = { id: string; nome: string; chapa: string; status: string }

type DocEntry = {
  id: string
  source: 'documento' | 'avulso' | 'atestado' | 'advertencia' | 'acidente'
  tipo: string
  colaborador_id: string | null
  data: string
  descricao: string
  documento_url: string
  documento_nome: string
}

const TIPOS_PADRAO = [
  'Contrato de Trabalho','Exame Admissional','Exame Demissional','Exame Periódico',
  'Atestado Médico','Certificado de Treinamento','Declaração de Vínculo',
  'Carteira de Trabalho (CTPS)','Documento de Identidade (RG/CNH)','CPF',
  'Comprovante de Residência','Foto 3x4','Ficha de Registro','Advertência',
  'Suspensão','Comunicação de Acidente (CAT)','ASO (Atestado de Saúde Ocupacional)',
  'NR-35 (Trabalho em Altura)','NR-18 (Construção Civil)','Outros',
]

function getTiposDoc(): string[] {
  try {
    const s = localStorage.getItem('rh_tipos_documentos')
    if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) return p }
  } catch {}
  return TIPOS_PADRAO
}

const TIPO_COLORS: Record<string, { bg: string; color: string }> = {
  'Atestado Médico':    { bg: '#eff6ff', color: '#1d4ed8' },
  'Advertência':        { bg: '#fffbeb', color: '#d97706' },
  'Comunicação de Acidente (CAT)': { bg: '#fff1f2', color: '#dc2626' },
  'Contrato de Trabalho': { bg: '#f0fdf4', color: '#16a34a' },
  'Exame Admissional':  { bg: '#fdf4ff', color: '#7c3aed' },
  'Exame Periódico':    { bg: '#fdf4ff', color: '#7c3aed' },
  'Certificado de Treinamento': { bg: '#ecfdf5', color: '#059669' },
}

const BUCKET = 'ocorrencias-documentos'
async function uploadDoc(file: File): Promise<{ url: string; nome: string } | null> {
  const ext  = file.name.split('.').pop()
  const path = `docs/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
  if (error) { toast.error('Erro no upload: ' + error.message); return null }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, nome: file.name }
}

function TipoBadge({ tipo }: { tipo: string }) {
  const s = TIPO_COLORS[tipo] ?? { bg: '#f3f4f6', color: '#6b7280' }
  return <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{tipo}</span>
}

type DocForm = { colaborador_id: string; tipo: string; data: string; descricao: string; documento_url: string; documento_nome: string }
const EMPTY_FORM: DocForm = { colaborador_id: '', tipo: '', data: new Date().toISOString().slice(0, 10), descricao: '', documento_url: '', documento_nome: '' }

export default function Documentos() {
  const { profile } = useProfile()
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [docs, setDocs]       = useState<DocEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [colabSel, setColabSel] = useState<Colaborador | null>(null)
  const [busca, setBusca]     = useState('')
  const [tiposDoc, setTiposDoc] = useState<string[]>(getTiposDoc())

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]   = useState<DocForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // delete
  const [deleteId, setDeleteId]       = useState<string | null>(null)
  const [deleteSource, setDeleteSource] = useState<DocEntry['source'] | null>(null)

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    // Recarrega tipos do localStorage
    setTiposDoc(getTiposDoc())

    const [
      { data: cols },
      { data: docsPes },   // tabela documentos (documentos pessoais)
      { data: docsAvul },  // tabela documentos_avulsos
      { data: atst },
      { data: acid },
      { data: advt },
    ] = await Promise.all([
      supabase.from('colaboradores').select('id,nome,chapa,status').order('nome'),
      supabase.from('documentos').select('id,colaborador_id,tipo,created_at,descricao,arquivo_url,arquivo_nome,colaboradores(nome,chapa)').order('created_at', { ascending: false }),
      supabase.from('documentos_avulsos').select('id,colaborador_id,tipo,created_at,descricao,documento_url,documento_nome,colaboradores(nome,chapa)').order('created_at', { ascending: false }),
      supabase.from('atestados').select('id,colaborador_id,data,data_inicio,tipo,descricao,documento_url,documento_nome,colaboradores(nome,chapa)').order('data_inicio', { ascending: false }),
      supabase.from('acidentes').select('id,colaborador_id,data_ocorrencia,tipo,descricao,documento_url,documento_nome,colaboradores(nome,chapa)').order('data_ocorrencia', { ascending: false }),
      supabase.from('advertencias').select('id,colaborador_id,data_advertencia,tipo,descricao,documento_url,documento_nome,colaboradores(nome,chapa)').order('data_advertencia', { ascending: false }),
    ])

    if (cols) setColaboradores(cols as Colaborador[])

    const entries: DocEntry[] = []
    for (const r of (docsPes ?? []) as any[])  entries.push({ id: r.id, source: 'documento',   tipo: r.tipo ?? 'Documento',       colaborador_id: r.colaborador_id, data: r.created_at?.slice(0,10) ?? '', descricao: r.descricao ?? '', documento_url: r.arquivo_url ?? '',    documento_nome: r.arquivo_nome ?? '' })
    for (const r of (docsAvul ?? []) as any[]) entries.push({ id: r.id, source: 'avulso',      tipo: r.tipo ?? 'Outros',           colaborador_id: r.colaborador_id, data: r.created_at?.slice(0,10) ?? '', descricao: r.descricao ?? '', documento_url: r.documento_url ?? '', documento_nome: r.documento_nome ?? '' })
    for (const r of (atst ?? []) as any[])     entries.push({ id: r.id, source: 'atestado',    tipo: 'Atestado Médico',             colaborador_id: r.colaborador_id, data: r.data_inicio ?? r.data ?? '', descricao: r.tipo ?? r.descricao ?? '', documento_url: r.documento_url ?? '', documento_nome: r.documento_nome ?? '' })
    for (const r of (acid ?? []) as any[])     entries.push({ id: r.id, source: 'acidente',    tipo: 'Comunicação de Acidente (CAT)', colaborador_id: r.colaborador_id, data: r.data_ocorrencia ?? '', descricao: r.descricao ?? '', documento_url: r.documento_url ?? '', documento_nome: r.documento_nome ?? '' })
    for (const r of (advt ?? []) as any[])     entries.push({ id: r.id, source: 'advertencia', tipo: 'Advertência',                 colaborador_id: r.colaborador_id, data: r.data_advertencia ?? '', descricao: r.tipo ?? r.descricao ?? '', documento_url: r.documento_url ?? '', documento_nome: r.documento_nome ?? '' })

    entries.sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''))
    setDocs(entries)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── filtros ────────────────────────────────────────────────────────────────
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const colabsFiltrados = useMemo(() => {
    const q = norm(busca)
    return colaboradores.filter(c => !q || norm(c.nome).includes(q) || norm(c.chapa ?? '').includes(q))
  }, [colaboradores, busca])

  const docsColab = useMemo(() => colabSel ? docs.filter(d => d.colaborador_id === colabSel.id) : [], [docs, colabSel])
  const countMap  = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of docs) { if (d.colaborador_id) m[d.colaborador_id] = (m[d.colaborador_id] ?? 0) + 1 }
    return m
  }, [docs])

  // ── upload ─────────────────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    const res = await uploadDoc(file)
    setUploading(false)
    if (res) setForm(p => ({ ...p, documento_url: res.url, documento_nome: res.nome }))
  }

  // ── salvar ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Selecione um colaborador')
    if (!form.tipo) return toast.error('Selecione o tipo')
    if (!form.data) return toast.error('Data obrigatória')
    setSaving(true)
    const { error } = await supabase.from('documentos_avulsos').insert({
      colaborador_id: form.colaborador_id, tipo: form.tipo, data: form.data || new Date().toISOString().slice(0,10), descricao: form.descricao || null,
      documento_url: form.documento_url || null, documento_nome: form.documento_nome || null,
    })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success('✅ Documento salvo!')
    setModalOpen(false); setForm(EMPTY_FORM); fetchAll()
  }

  // ── deletar ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId || !deleteSource) return
    const tableMap: Record<DocEntry['source'], string> = {
      documento: 'documentos', avulso: 'documentos_avulsos',
      atestado: 'atestados', advertencia: 'advertencias', acidente: 'acidentes',
    }
    const { error } = await supabase.from(tableMap[deleteSource]).delete().eq('id', deleteId)
    setDeleteId(null); setDeleteSource(null)
    if (error) { toast.error('Erro ao excluir'); return }
    toast.success('Documento excluído!')
    fetchAll()
  }

  const isAdmin = profile?.role === 'admin' || profile?.role === 'rh'

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 57px)', overflow: 'hidden' }}>

      {/* ══ PAINEL ESQUERDO ══════════════════════════════════════════════════ */}
      <div style={{ width: 272, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 12px 8px', background: '#1e3a5f', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>📄 Documentos</div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar colaborador…"
              style={{ width: '100%', height: 33, border: '1px solid #334155', borderRadius: 7, paddingLeft: 28, paddingRight: 8, fontSize: 12, background: '#0f172a', color: '#fff', boxSizing: 'border-box' }} />
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{colaboradores.length} colaborador(es) · {docs.length} doc(s)</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? <LoadingSkeleton rows={6} /> : colabsFiltrados.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Nenhum colaborador</div>
          ) : colabsFiltrados.map(c => {
            const qtd = countMap[c.id] ?? 0
            const sel = colabSel?.id === c.id
            return (
              <div key={c.id} onClick={() => setColabSel(sel ? null : c)}
                style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: sel ? 'hsl(var(--primary)/.08)' : 'transparent', borderLeft: sel ? '3px solid hsl(var(--primary))' : '3px solid transparent' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: sel ? 700 : 500, fontSize: 13, color: sel ? 'hsl(var(--primary))' : 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 1 }}>{c.chapa}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {qtd > 0 && <span style={{ background: sel ? 'hsl(var(--primary))' : '#e2e8f0', color: sel ? '#fff' : '#475569', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{qtd}</span>}
                  <ChevronRight size={14} color={sel ? 'hsl(var(--primary))' : '#94a3b8'} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ══ PAINEL DIREITO ═══════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            {colabSel ? (
              <><div style={{ fontWeight: 700, fontSize: 15 }}>{colabSel.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{colabSel.chapa} · {docsColab.length} documento(s)</div></>
            ) : <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--muted-foreground)' }}>← Selecione um colaborador</div>}
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => { setForm({ ...EMPTY_FORM, colaborador_id: colabSel?.id ?? '' }); setModalOpen(true) }}>
              <Plus size={14} /> Novo Documento
            </Button>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!colabSel ? (
            <EmptyState icon={<FileText size={32} />} title="Selecione um colaborador" description="Escolha um colaborador no painel à esquerda para ver seus documentos." />
          ) : loading ? <LoadingSkeleton rows={4} /> : docsColab.length === 0 ? (
            <EmptyState icon={<FileText size={32} />} title="Nenhum documento"
              description={`${colabSel.nome} não possui documentos cadastrados.`}
              action={isAdmin ? <Button size="sm" onClick={() => { setForm({ ...EMPTY_FORM, colaborador_id: colabSel.id }); setModalOpen(true) }}><Plus size={13} /> Novo Documento</Button> : undefined} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {docsColab.map(doc => (
                <div key={`${doc.source}-${doc.id}`} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flexShrink: 0, marginTop: 2 }}><TipoBadge tipo={doc.tipo} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 2 }}>{formatDate(doc.data)}</div>
                    {doc.descricao && <div style={{ fontSize: 13, color: 'var(--foreground)', marginBottom: 4 }}>{doc.descricao}</div>}
                    {doc.documento_url && (
                      <a href={doc.documento_url} target="_blank" rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'hsl(var(--primary))', textDecoration: 'none' }}>
                        <ExternalLink size={12} /> {doc.documento_nome || 'Ver documento'}
                      </a>
                    )}
                  </div>
                  {isAdmin && (doc.source === 'avulso' || doc.source === 'documento') && (
                    <button onClick={() => { setDeleteId(doc.id); setDeleteSource(doc.source) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, flexShrink: 0 }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ══ MODAL NOVO DOCUMENTO ═════════════════════════════════════════════ */}
      <Dialog open={modalOpen} onOpenChange={o => { if (!o) { setModalOpen(false); setForm(EMPTY_FORM) } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>📄 Novo Documento</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs font-semibold">Colaborador *</Label>
              <select value={form.colaborador_id} onChange={e => setForm(p => ({ ...p, colaborador_id: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-input rounded-md bg-background mt-1">
                <option value="">— selecione —</option>
                {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.chapa})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Tipo *</Label>
                <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {tiposDoc.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Data *</Label>
                <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} className="h-9 mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Descrição</Label>
              <Textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} rows={2} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Arquivo (PDF/imagem)</Label>
              <div className="flex gap-2 mt-1 flex-wrap items-center">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Upload size={13} /> {uploading ? 'Enviando…' : 'Selecionar arquivo'}
                </Button>
                {form.documento_nome && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText size={12} />{form.documento_nome}
                    <button onClick={() => setForm(p => ({ ...p, documento_url: '', documento_nome: '' }))}><X size={12} /></button>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFile} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || uploading}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ CONFIRM DELETE ═══════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) { setDeleteId(null); setDeleteSource(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
