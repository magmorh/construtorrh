import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { useProfile } from '@/hooks/useProfile'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { FileText, ExternalLink, Search, Plus, Upload, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type Colaborador = { id: string; nome: string; chapa: string }

type DocEntry = {
  id: string
  source: 'atestado' | 'advertencia' | 'acidente' | 'avulso'
  tipo: string
  colaborador_id: string | null
  colaborador_nome: string
  colaborador_chapa: string
  data: string
  descricao: string
  documento_url: string
  documento_nome: string
}

const TIPOS_AVULSO = [
  { value: 'contrato',    label: 'Contrato' },
  { value: 'exame',       label: 'Exame Médico' },
  { value: 'treinamento', label: 'Treinamento / Certificado' },
  { value: 'declaracao',  label: 'Declaração' },
  { value: 'outros',      label: 'Outros' },
]

const TIPO_COLORS: Record<string, { bg: string; color: string }> = {
  'Atestado':       { bg: '#eff6ff', color: '#1d4ed8' },
  'Advertência':    { bg: '#fffbeb', color: '#d97706' },
  'CAT (Acidente)': { bg: '#fff1f2', color: '#dc2626' },
  'Contrato':       { bg: '#f0fdf4', color: '#16a34a' },
  'Exame Médico':   { bg: '#fdf4ff', color: '#7c3aed' },
  'Treinamento / Certificado': { bg: '#ecfdf5', color: '#059669' },
  'Declaração':     { bg: '#fefce8', color: '#ca8a04' },
  'Outros':         { bg: '#f3f4f6', color: '#6b7280' },
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
  return (
    <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
      {tipo}
    </span>
  )
}

type AvulsoForm = {
  colaborador_id: string; tipo: string; data: string
  descricao: string; documento_url: string; documento_nome: string
}
const EMPTY_FORM: AvulsoForm = { colaborador_id: '', tipo: '', data: '', descricao: '', documento_url: '', documento_nome: '' }

export default function Documentos() {
  const { permissions } = useProfile()

  const [docs,          setDocs]          = useState<DocEntry[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading,       setLoading]       = useState(true)
  const [filtroColabo,  setFiltroColabo]  = useState<string>('todos')
  const [filtroTipo,    setFiltroTipo]    = useState<string>('todos')
  const [busca,         setBusca]         = useState('')

  // modal novo doc avulso
  const [modalOpen,   setModalOpen]   = useState(false)
  const [form,        setForm]        = useState<AvulsoForm>(EMPTY_FORM)
  const [uploading,   setUploading]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // delete
  const [deleteId,     setDeleteId]     = useState<string | null>(null)
  const [deleteSource, setDeleteSource] = useState<string>('')

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const [r1, r2, r3, r4, r5] = await Promise.all([
      supabase.from('atestados')
        .select('id, colaborador_id, data, tipo, descricao, documento_url, documento_nome, colaboradores(id, nome, chapa)')
        .not('documento_url', 'is', null),
      supabase.from('advertencias')
        .select('id, colaborador_id, data_advertencia, tipo, motivo, documento_url, documento_nome, colaboradores(id, nome, chapa)')
        .not('documento_url', 'is', null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase.from('acidentes' as any)
        .select('id, colaborador_id, data_acidente, tipo, descricao, documento_url, documento_nome, colaboradores(id, nome, chapa)')
        .not('documento_url', 'is', null)
        .eq('cat_emitida', true),
      supabase.from('documentos_avulsos')
        .select('id, colaborador_id, tipo, data, descricao, documento_url, documento_nome, colaboradores(id, nome, chapa)')
        .order('data', { ascending: false }),
      supabase.from('colaboradores').select('id, nome, chapa').eq('status', 'ativo').order('nome'),
    ])

    const entries: DocEntry[] = []

    for (const a of ((r1.data ?? []) as any[])) {
      if (!a.documento_url) continue
      const col = Array.isArray(a.colaboradores) ? a.colaboradores[0] : a.colaboradores
      entries.push({ id: a.id, source: 'atestado', tipo: 'Atestado', colaborador_id: a.colaborador_id,
        colaborador_nome: col?.nome ?? '—', colaborador_chapa: col?.chapa ?? '',
        data: a.data, descricao: `Tipo: ${a.tipo ?? '—'}${a.descricao ? ' · ' + a.descricao : ''}`,
        documento_url: a.documento_url, documento_nome: a.documento_nome ?? 'Atestado' })
    }
    for (const a of ((r2.data ?? []) as any[])) {
      if (!a.documento_url) continue
      const col = Array.isArray(a.colaboradores) ? a.colaboradores[0] : a.colaboradores
      entries.push({ id: a.id, source: 'advertencia', tipo: 'Advertência', colaborador_id: a.colaborador_id,
        colaborador_nome: col?.nome ?? '—', colaborador_chapa: col?.chapa ?? '',
        data: a.data_advertencia, descricao: `${a.tipo ?? ''} · ${a.motivo ?? ''}`,
        documento_url: a.documento_url, documento_nome: a.documento_nome ?? 'Advertência' })
    }
    if (!r3.error) {
      for (const a of ((r3.data ?? []) as any[])) {
        if (!a.documento_url) continue
        const col = Array.isArray(a.colaboradores) ? a.colaboradores[0] : a.colaboradores
        entries.push({ id: a.id, source: 'acidente', tipo: 'CAT (Acidente)', colaborador_id: a.colaborador_id,
          colaborador_nome: col?.nome ?? '—', colaborador_chapa: col?.chapa ?? '',
          data: a.data_acidente, descricao: `${a.tipo ?? ''} · ${a.descricao ?? ''}`,
          documento_url: a.documento_url, documento_nome: a.documento_nome ?? 'CAT' })
      }
    }
    if (!r4.error) {
      for (const a of ((r4.data ?? []) as any[])) {
        const col = Array.isArray(a.colaboradores) ? a.colaboradores[0] : a.colaboradores
        const tipoLabel = TIPOS_AVULSO.find(t => t.value === a.tipo)?.label ?? a.tipo ?? 'Outros'
        entries.push({ id: a.id, source: 'avulso', tipo: tipoLabel, colaborador_id: a.colaborador_id,
          colaborador_nome: col?.nome ?? 'Geral', colaborador_chapa: col?.chapa ?? '',
          data: a.data, descricao: a.descricao ?? '',
          documento_url: a.documento_url, documento_nome: a.documento_nome ?? 'Documento' })
      }
    }

    entries.sort((a, b) => (a.data > b.data ? -1 : 1))
    setDocs(entries)
    setColaboradores((r5.data as Colaborador[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── upload file ───────────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)) { toast.error('Apenas PDF ou imagem'); return }
    if (file.size > 10 * 1024 * 1024) { toast.error('Máx 10 MB'); return }
    setUploading(true)
    const res = await uploadDoc(file)
    setUploading(false)
    if (res) { setForm(p => ({ ...p, documento_url: res.url, documento_nome: res.nome })); toast.success('Documento anexado!') }
  }

  // ── salvar doc avulso ─────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.tipo)            { toast.error('Selecione o tipo'); return }
    if (!form.data)            { toast.error('Data obrigatória'); return }
    if (!form.documento_url)   { toast.error('Anexe o documento'); return }
    setSaving(true)
    const { error } = await supabase.from('documentos_avulsos').insert({
      colaborador_id: form.colaborador_id || null,
      tipo: form.tipo, data: form.data,
      descricao: form.descricao || null,
      documento_url: form.documento_url, documento_nome: form.documento_nome,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Documento adicionado!')
    setModalOpen(false); setForm(EMPTY_FORM); fetchAll()
  }

  // ── deletar doc avulso ────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId || deleteSource !== 'avulso') return
    const { error } = await supabase.from('documentos_avulsos').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Documento excluído'); fetchAll()
  }

  const tiposDisponiveis = [
    'Atestado', 'Advertência', 'CAT (Acidente)',
    ...TIPOS_AVULSO.map(t => t.label),
  ]

  const filtered = docs.filter(d => {
    if (filtroColabo !== 'todos' && d.colaborador_id !== filtroColabo) return false
    if (filtroTipo   !== 'todos' && d.tipo !== filtroTipo)             return false
    if (busca.trim()) {
      const q = busca.toLowerCase()
      if (!d.colaborador_nome.toLowerCase().includes(q) &&
          !d.descricao.toLowerCase().includes(q) &&
          !d.documento_nome.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
      <PageHeader
        title="Documentos"
        subtitle={`Todos os documentos do sistema · ${filtered.length} documento${filtered.length !== 1 ? 's' : ''}`}
        action={
          permissions.canCreate ? (
            <Button onClick={() => { setForm(EMPTY_FORM); setModalOpen(true) }}>
              <Plus size={14} style={{ marginRight: 6 }} /> Novo Documento
            </Button>
          ) : undefined
        }
      />

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', top: 10, left: 10, color: '#9ca3af' }} />
          <Input placeholder="Buscar…" value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <div style={{ minWidth: 220 }}>
          <Select value={filtroColabo} onValueChange={setFiltroColabo}>
            <SelectTrigger><SelectValue placeholder="Todos os colaboradores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os colaboradores</SelectItem>
              {colaboradores.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa ? ` — ${c.chapa}` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div style={{ minWidth: 200 }}>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {tiposDisponiveis.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <LoadingSkeleton /> :
        filtered.length === 0 ? (
          <EmptyState icon={<FileText size={40} color="#94a3b8" />} title="Nenhum documento encontrado"
            description="Os documentos aparecerão aqui. Use o botão acima para adicionar."
            action={permissions.canCreate ? <Button onClick={() => setModalOpen(true)}><Plus size={14} style={{ marginRight: 6 }} />Novo Documento</Button> : undefined} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Arquivo</TableHead>
                  {permissions.canDelete && <TableHead style={{ textAlign: 'right' }}>Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(d => (
                  <TableRow key={`${d.source}-${d.id}`}>
                    <TableCell><TipoBadge tipo={d.tipo} /></TableCell>
                    <TableCell>
                      <div style={{ fontWeight: 600 }}>{d.colaborador_nome}</div>
                      {d.colaborador_chapa && <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.colaborador_chapa}</div>}
                    </TableCell>
                    <TableCell style={{ fontSize: 13 }}>{formatDate(d.data)}</TableCell>
                    <TableCell style={{ fontSize: 12, color: '#64748b', maxWidth: 240 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.descricao}</div>
                    </TableCell>
                    <TableCell>
                      <a href={d.documento_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none', padding: '4px 10px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff' }}>
                        <FileText size={13} />
                        {d.documento_nome.length > 24 ? d.documento_nome.slice(0, 21) + '…' : d.documento_nome}
                        <ExternalLink size={11} />
                      </a>
                    </TableCell>
                    {permissions.canDelete && (
                      <TableCell style={{ textAlign: 'right' }}>
                        {d.source === 'avulso' && (
                          <Button variant="outline" size="sm"
                            style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                            onClick={() => { setDeleteId(d.id); setDeleteSource(d.source) }}>
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      }

      {/* Modal: Novo documento avulso */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent style={{ maxWidth: 480 }}
          onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
          <DialogHeader><DialogTitle>Novo Documento</DialogTitle></DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label>Colaborador</Label>
              <Select value={form.colaborador_id || 'nenhum'} onValueChange={v => setForm(p => ({ ...p, colaborador_id: v === 'nenhum' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">— Documento geral (sem colaborador) —</SelectItem>
                  {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa ? ` — ${c.chapa}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Label>Tipo *</Label>
                <Select value={form.tipo || undefined} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{TIPOS_AVULSO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Label>Data *</Label>
                <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} rows={2} placeholder="Informações adicionais…" />
            </div>

            {/* Upload */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label>Arquivo <span style={{ color: '#dc2626' }}>*</span></Label>
              {form.documento_url ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
                  <FileText size={15} color="#16a34a" />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#15803d', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.documento_nome}</span>
                  <a href={form.documento_url} target="_blank" rel="noopener noreferrer" style={{ color: '#16a34a' }}><ExternalLink size={13} /></a>
                  <button onClick={() => setForm(p => ({ ...p, documento_url: '', documento_nome: '' }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={13} /></button>
                </div>
              ) : (
                <div onClick={() => !uploading && fileRef.current?.click()}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '18px', borderRadius: 8, border: '2px dashed #d1d5db', background: '#fafafa', cursor: uploading ? 'wait' : 'pointer' }}>
                  <Upload size={18} color="#9ca3af" />
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{uploading ? 'Enviando…' : 'Clique para anexar arquivo'}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>PDF, JPG, PNG, WEBP · máx 10 MB</span>
                </div>
              )}
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={handleFile} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.documento_url}>{saving ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>⚠️ Esta ação é permanente e não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} style={{ background: '#dc2626' }}>Excluir mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
