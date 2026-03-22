import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { Obra } from '@/lib/supabase'
import { formatDate, cn } from '@/lib/utils'
import { PageHeader, BadgeStatus, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Building2, Plus, Search, Pencil, Trash2, MapPin, Clock,
  Calendar, Users, X, ChevronRight,
} from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ObraWithCount = Obra & { colaboradores_count?: number; has_horarios?: boolean }

type FormData = {
  nome: string; codigo: string; endereco: string; cidade: string
  estado: string; cliente: string; responsavel: string
  data_inicio: string; data_previsao_fim: string
  status: string; observacoes: string
}

const DIAS_SEMANA = [
  { key: 'seg', label: 'Segunda-feira' },
  { key: 'ter', label: 'Terça-feira' },
  { key: 'qua', label: 'Quarta-feira' },
  { key: 'qui', label: 'Quinta-feira' },
  { key: 'sex', label: 'Sexta-feira' },
  { key: 'sab', label: 'Sábado' },
  { key: 'dom', label: 'Domingo' },
]

interface HorarioDia {
  dia_semana: string
  hora_entrada: string
  saida_almoco: string
  retorno_almoco: string
  hora_saida: string
  ativo: boolean
}

const HORARIO_DEFAULT: HorarioDia[] = [
  { dia_semana: 'seg', hora_entrada: '07:00', saida_almoco: '12:00', retorno_almoco: '13:00', hora_saida: '17:00', ativo: true },
  { dia_semana: 'ter', hora_entrada: '07:00', saida_almoco: '12:00', retorno_almoco: '13:00', hora_saida: '17:00', ativo: true },
  { dia_semana: 'qua', hora_entrada: '07:00', saida_almoco: '12:00', retorno_almoco: '13:00', hora_saida: '17:00', ativo: true },
  { dia_semana: 'qui', hora_entrada: '07:00', saida_almoco: '12:00', retorno_almoco: '13:00', hora_saida: '17:00', ativo: true },
  { dia_semana: 'sex', hora_entrada: '07:00', saida_almoco: '12:00', retorno_almoco: '13:00', hora_saida: '16:00', ativo: true },
  { dia_semana: 'sab', hora_entrada: '07:00', saida_almoco: '',      retorno_almoco: '',      hora_saida: '13:00', ativo: true },
  { dia_semana: 'dom', hora_entrada: '',      saida_almoco: '',      retorno_almoco: '',      hora_saida: '',      ativo: false },
]

const EMPTY_FORM: FormData = {
  nome: '', codigo: '', endereco: '', cidade: '', estado: '',
  cliente: '', responsavel: '', data_inicio: '', data_previsao_fim: '',
  status: 'em_andamento', observacoes: '',
}

const STATUS_BORDER_COLOR: Record<string, string> = {
  planejamento: '#94a3b8', em_andamento: '#3b82f6',
  concluida: '#22c55e', pausada: '#f59e0b', cancelada: '#ef4444',
}
const STATUS_LABEL: Record<string, string> = {
  em_andamento: 'Em andamento', concluida: 'Concluída',
  pausada: 'Pausada', cancelada: 'Cancelada',
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Obras() {
  const [obras,  setObras]  = useState<ObraWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]  = useState('')
  const [filterStatus, setFilterStatus] = useState('todos')

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form,   setForm]         = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [modalTab, setModalTab]   = useState<'dados' | 'horarios'>('dados')

  // Horários da obra
  const [horarios,     setHorarios]     = useState<HorarioDia[]>(HORARIO_DEFAULT)
  const [savingHor,    setSavingHor]    = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: obrasData } = await supabase.from('obras').select('*').order('nome')
    if (!obrasData) { setLoading(false); return }

    const { data: counts } = await supabase
      .from('colaboradores').select('obra_id')
      .in('obra_id', obrasData.map(o => o.id))

    const countMap: Record<string, number> = {}
    counts?.forEach(c => { if (c.obra_id) countMap[c.obra_id] = (countMap[c.obra_id] ?? 0) + 1 })

    // Buscar quais obras têm horários cadastrados
    const { data: horCounts } = await supabase
      .from('obra_horarios')
      .select('obra_id')
      .eq('ativo', true)

    const horSet = new Set<string>((horCounts ?? []).map((h: any) => h.obra_id))

    setObras(obrasData.map(o => ({
      ...o,
      colaboradores_count: countMap[o.id] ?? 0,
      has_horarios: horSet.has(o.id),
    })) as ObraWithCount[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── carregar horários da obra ─────────────────────────────────────────────
  const fetchHorarios = useCallback(async (obraId: string) => {
    const { data } = await supabase
      .from('obra_horarios')
      .select('*')
      .eq('obra_id', obraId)

    if (data && data.length > 0) {
      // Monta array na ordem dos dias
      const mapa: Record<string, any> = {}
      data.forEach((h: any) => { mapa[h.dia_semana] = h })
      setHorarios(DIAS_SEMANA.map(d => ({
        dia_semana:     d.key,
        hora_entrada:   mapa[d.key]?.hora_entrada   ?? '',
        saida_almoco:   mapa[d.key]?.saida_almoco   ?? '',
        retorno_almoco: mapa[d.key]?.retorno_almoco ?? '',
        hora_saida:     mapa[d.key]?.hora_saida     ?? '',
        ativo:          mapa[d.key]?.ativo          ?? false,
      })))
    } else {
      setHorarios(HORARIO_DEFAULT)
    }
  }, [])

  // ── modal abrir ───────────────────────────────────────────────────────────
  const openNew = () => {
    setEditId(null); setForm(EMPTY_FORM)
    setHorarios(HORARIO_DEFAULT); setModalTab('dados'); setModalOpen(true)
  }
  const openEdit = (o: Obra) => {
    setEditId(o.id)
    setForm({
      nome: o.nome, codigo: o.codigo ?? '', endereco: o.endereco ?? '',
      cidade: o.cidade ?? '', estado: o.estado ?? '', cliente: o.cliente ?? '',
      responsavel: o.responsavel ?? '', data_inicio: o.data_inicio ?? '',
      data_previsao_fim: o.data_previsao_fim ?? '', status: o.status,
      observacoes: o.observacoes ?? '',
    })
    setHorarios(HORARIO_DEFAULT)
    fetchHorarios(o.id)
    setModalTab('dados'); setModalOpen(true)
  }

  const set = (k: keyof FormData, v: string) => setForm(p => ({ ...p, [k]: v }))

  // ── atualizar campo de horário ────────────────────────────────────────────
  function updHor(idx: number, field: keyof HorarioDia, value: unknown) {
    setHorarios(prev => prev.map((h, i) => i !== idx ? h : { ...h, [field]: value }))
  }

  // ── salvar obra ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSaving(true)

    const payload: Partial<Obra> = {
      nome: form.nome.trim(), codigo: form.codigo || null,
      endereco: form.endereco || null, cidade: form.cidade || null,
      estado: form.estado || null, cliente: form.cliente || null,
      responsavel: form.responsavel || null, data_inicio: form.data_inicio || null,
      data_previsao_fim: form.data_previsao_fim || null,
      status: form.status as Obra['status'], observacoes: form.observacoes || null,
    }

    let obraId = editId
    if (editId) {
      const { error } = await supabase.from('obras').update(payload).eq('id', editId)
      if (error) { toast.error(error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('obras').insert(payload).select('id').single()
      if (error || !data) { toast.error(error?.message ?? 'Erro'); setSaving(false); return }
      obraId = data.id
    }

    setSaving(false)
    toast.success(editId ? 'Obra atualizada!' : 'Obra criada!')
    // Vai para aba de horários logo após criar
    if (!editId && obraId) { setEditId(obraId); setModalTab('horarios') }
    else { setModalOpen(false); fetchData() }
    fetchData()
  }

  // ── salvar horários ───────────────────────────────────────────────────────
  const handleSaveHorarios = async () => {
    if (!editId) { toast.error('Salve a obra primeiro'); return }
    setSavingHor(true)

    // Delete e reinsere
    await supabase.from('obra_horarios').delete().eq('obra_id', editId)

    const rows = horarios
      .filter(h => h.ativo)
      .map(h => ({
        obra_id:        editId,
        dia_semana:     h.dia_semana,
        hora_entrada:   h.hora_entrada   || null,
        saida_almoco:   h.saida_almoco   || null,
        retorno_almoco: h.retorno_almoco || null,
        hora_saida:     h.hora_saida     || null,
        ativo:          true,
      }))

    if (rows.length > 0) {
      const { error } = await supabase.from('obra_horarios').insert(rows)
      if (error) { toast.error('Erro ao salvar horários: ' + error.message); setSavingHor(false); return }
    }

    setSavingHor(false)
    toast.success('Horários salvos!')
    setModalOpen(false)
    fetchData()
  }

  // ── delete obra ───────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const { error } = await supabase.from('obras').delete().eq('id', deleteId)
    setDeleting(false); setDeleteId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Obra excluída!'); fetchData()
  }

  const filtered = obras.filter(o => {
    const q = search.toLowerCase()
    return (!q || o.nome.toLowerCase().includes(q) || (o.codigo ?? '').toLowerCase().includes(q) || (o.cliente ?? '').toLowerCase().includes(q))
      && (filterStatus === 'todos' || o.status === filterStatus)
  })

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <PageHeader
        title="Obras"
        subtitle={`${obras.length} obra${obras.length !== 1 ? 's' : ''} cadastrada${obras.length !== 1 ? 's' : ''}`}
        action={<Button onClick={openNew} className="gap-2"><Plus size={16} /> Nova Obra</Button>}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome, código ou cliente…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <LoadingSkeleton rows={6} /> : filtered.length === 0 ? (
        <EmptyState icon={<Building2 size={32} />} title="Nenhuma obra encontrada" description="Cadastre a primeira obra ou ajuste os filtros." />
      ) : (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background: 'var(--muted)' }}>
                {['Obra','Cliente / Responsável','Localização','Período','Colaboradores','Status',''].map((h, i) => (
                  <TableHead key={i} style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i >= 4 && i <= 5 ? 'center' : undefined, width: i === 6 ? 100 : undefined }}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(o => (
                <TableRow key={o.id} className="hover:bg-muted/40">
                  <TableCell style={{ paddingTop: 12, paddingBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 4, height: 36, borderRadius: 2, flexShrink: 0, background: STATUS_BORDER_COLOR[o.status] ?? '#e2e8f0' }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, display:'flex', alignItems:'center', gap:6 }}>
                          {o.nome}
                          {o.has_horarios
                            ? <span title="Horários configurados" style={{ color:'#16a34a', fontSize:11, display:'flex', alignItems:'center', gap:2, background:'#dcfce7', borderRadius:4, padding:'1px 5px', fontWeight:600 }}>🕐 Horários</span>
                            : <span title="Sem horários cadastrados" style={{ color:'#92400e', fontSize:11, background:'#fef3c7', borderRadius:4, padding:'1px 5px', fontWeight:600 }}>⚠️ Sem horários</span>
                          }
                        </div>
                        {o.codigo && <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted-foreground)', marginTop: 2 }}>#{o.codigo}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {o.cliente && <div style={{ fontSize: 13 }}>{o.cliente}</div>}
                    {o.responsavel && <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>{o.responsavel}</div>}
                    {!o.cliente && !o.responsavel && <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>—</span>}
                  </TableCell>
                  <TableCell>
                    {(o.cidade || o.estado) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                        <MapPin size={12} style={{ color: 'var(--muted-foreground)' }} />
                        {[o.cidade, o.estado].filter(Boolean).join(' — ')}
                      </div>
                    ) : <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>—</span>}
                  </TableCell>
                  <TableCell style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {o.data_inicio ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{formatDate(o.data_inicio)}</span>
                        {o.data_previsao_fim && <><ChevronRight size={10} style={{ color: 'var(--muted-foreground)' }} /><span style={{ color: 'var(--muted-foreground)' }}>{formatDate(o.data_previsao_fim)}</span></>}
                      </div>
                    ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                  </TableCell>
                  <TableCell style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Users size={13} style={{ color: 'var(--muted-foreground)' }} />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{o.colaboradores_count ?? 0}</span>
                    </div>
                  </TableCell>
                  <TableCell style={{ textAlign: 'center' }}><BadgeStatus status={o.status} /></TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => openEdit(o)} title="Editar"><Pencil size={13} /></Button>
                      <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => { openEdit(o); setTimeout(() => setModalTab('horarios'), 100) }} title="Horários"><Clock size={13} /></Button>
                      <Button variant="ghost" size="icon" style={{ width: 30, height: 30, color: 'var(--destructive)' }} onClick={() => setDeleteId(o.id)} title="Excluir"><Trash2 size={13} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Modal obra ─────────────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent style={{ maxWidth: 620 }} onPointerDownOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Obra' : 'Nova Obra'}</DialogTitle>
          </DialogHeader>

          {/* abas */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
            {[
              { key: 'dados',    label: '📋 Dados da Obra' },
              { key: 'horarios', label: '🕐 Horários de Trabalho' },
            ].map(t => (
              <button key={t.key} onClick={() => setModalTab(t.key as any)}
                disabled={t.key === 'horarios' && !editId}
                style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none',
                  background: 'none', cursor: t.key === 'horarios' && !editId ? 'not-allowed' : 'pointer',
                  borderBottom: modalTab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
                  color: modalTab === t.key ? 'var(--primary)' : t.key === 'horarios' && !editId ? '#9ca3af' : 'var(--muted-foreground)',
                  marginBottom: -1,
                }}>
                {t.label}
                {t.key === 'horarios' && !editId && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>(salve primeiro)</span>}
              </button>
            ))}
          </div>

          {/* ── aba dados ── */}
          {modalTab === 'dados' && (
            <>
              <div className="grid grid-cols-2 gap-3 py-2">
                <FG label="Nome da obra *" span={2}><Input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex.: Residencial Alfa" /></FG>
                <FG label="Código"><Input value={form.codigo} onChange={e => set('codigo', e.target.value)} placeholder="OBR-001" /></FG>
                <FG label="Cliente"><Input value={form.cliente} onChange={e => set('cliente', e.target.value)} placeholder="Nome do cliente" /></FG>
                <FG label="Responsável" span={2}><Input value={form.responsavel} onChange={e => set('responsavel', e.target.value)} placeholder="Nome do responsável" /></FG>
                <FG label="Endereço" span={2}><Input value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número" /></FG>
                <FG label="Cidade"><Input value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Cidade" /></FG>
                <FG label="Estado"><Input value={form.estado} onChange={e => set('estado', e.target.value)} placeholder="MG" maxLength={2} /></FG>
                <FG label="Data de início"><Input type="date" value={form.data_inicio} onChange={e => set('data_inicio', e.target.value)} /></FG>
                <FG label="Previsão de fim"><Input type="date" value={form.data_previsao_fim} onChange={e => set('data_previsao_fim', e.target.value)} /></FG>
                <FG label="Status">
                  <Select value={form.status} onValueChange={v => set('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </FG>
                <FG label="Observações" span={2}><Textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} placeholder="Observações…" /></FG>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Criar obra →'}</Button>
              </DialogFooter>
            </>
          )}

          {/* ── aba horários ── */}
          {modalTab === 'horarios' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 10 }}>
                Configure os horários padrão de trabalho. Serão usados automaticamente ao confirmar presença no ponto.
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--muted)' }}>
                    <th style={TH2}>Dia</th>
                    <th style={TH2}>Ativo</th>
                    <th style={TH2}>Entrada</th>
                    <th style={TH2}>Saída Alm.</th>
                    <th style={TH2}>Ret. Alm.</th>
                    <th style={TH2}>Saída</th>
                    <th style={TH2}>Horas</th>
                  </tr>
                </thead>
                <tbody>
                  {horarios.map((h, idx) => {
                    const label = DIAS_SEMANA.find(d => d.key === h.dia_semana)?.label ?? h.dia_semana
                    const horas = calcHorasDia(h)
                    return (
                      <tr key={h.dia_semana} style={{ borderBottom: '1px solid var(--border)', background: h.ativo ? 'transparent' : 'rgba(0,0,0,0.02)', opacity: h.ativo ? 1 : 0.5 }}>
                        <td style={{ ...TD2, fontWeight: 600 }}>{label}</td>
                        <td style={{ ...TD2, textAlign: 'center' }}>
                          <input type="checkbox" checked={h.ativo} onChange={e => updHor(idx, 'ativo', e.target.checked)} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                        </td>
                        <td style={TD2}><TI2 disabled={!h.ativo} value={h.hora_entrada}    onChange={v => updHor(idx, 'hora_entrada',    v)} /></td>
                        <td style={TD2}><TI2 disabled={!h.ativo} value={h.saida_almoco}   onChange={v => updHor(idx, 'saida_almoco',   v)} /></td>
                        <td style={TD2}><TI2 disabled={!h.ativo} value={h.retorno_almoco} onChange={v => updHor(idx, 'retorno_almoco', v)} /></td>
                        <td style={TD2}><TI2 disabled={!h.ativo} value={h.hora_saida}     onChange={v => updHor(idx, 'hora_saida',     v)} /></td>
                        <td style={{ ...TD2, textAlign: 'center', fontWeight: 600, color: horas > 0 ? '#15803d' : '#9ca3af' }}>
                          {horas > 0 ? `${horas.toFixed(1)}h` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <DialogFooter style={{ marginTop: 12 }}>
                <Button variant="outline" onClick={() => setModalOpen(false)} disabled={savingHor}>Fechar</Button>
                <Button onClick={handleSaveHorarios} disabled={savingHor}>{savingHor ? 'Salvando…' : '💾 Salvar Horários'}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* AlertDialog de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir obra?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Utilitários ──────────────────────────────────────────────────────────────
function calcHorasDia(h: HorarioDia): number {
  if (!h.ativo || !h.hora_entrada || !h.hora_saida) return 0
  const toM = (t: string) => { const [hh, mm] = t.split(':').map(Number); return hh * 60 + mm }
  let min = toM(h.hora_saida) - toM(h.hora_entrada)
  if (h.saida_almoco && h.retorno_almoco) min -= (toM(h.retorno_almoco) - toM(h.saida_almoco))
  return Math.max(0, min / 60)
}

const TH2: React.CSSProperties = { padding: '7px 8px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', background: 'var(--muted)' }
const TD2: React.CSSProperties = { padding: '5px 6px' }

function TI2({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <input type="time" value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      style={{
        width: 76, padding: '3px 4px', fontSize: 12,
        border: '1px solid var(--border)', borderRadius: 4,
        background: disabled ? 'transparent' : 'var(--background)',
        color: disabled ? '#9ca3af' : 'var(--foreground)',
        fontFamily: 'monospace', textAlign: 'center', outline: 'none',
        cursor: disabled ? 'not-allowed' : 'text',
      }}
    />
  )
}

function FG({ label, children, span }: { label: string; children: React.ReactNode; span?: number }) {
  return (
    <div className={cn('flex flex-col gap-1', span === 2 && 'col-span-2')}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
