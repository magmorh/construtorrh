import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Premio, Colaborador, Obra } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton, StatCard } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
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
import { toast } from 'sonner'
import { Gift, Plus, Search, Pencil, Trash2 } from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type PremioRow = Premio & {
  colaboradores?: Pick<Colaborador, 'nome' | 'chapa'>
}

type FormData = {
  colaborador_id: string
  obra_id: string
  tipo: string
  descricao: string
  valor: string
  data: string
  competencia: string
  observacoes: string
}

const TIPO_OPTIONS = [
  'Produtividade',
  'Assiduidade',
  'Segurança',
  'Desempenho',
  'Tempo de serviço',
  'Outros',
]

const EMPTY_FORM: FormData = {
  colaborador_id: '',
  obra_id: '',
  tipo: '',
  descricao: '',
  valor: '',
  data: new Date().toISOString().slice(0, 10),
  competencia: new Date().toISOString().slice(0, 7),
  observacoes: '',
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function Premios() {
  const [rows, setRows] = useState<PremioRow[]>([])
  const [colaboradores, setColaboradores] = useState<Pick<Colaborador, 'id' | 'nome' | 'chapa'>[]>([])
  const [obras, setObras] = useState<Pick<Obra, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)

  // filtros
  const [filtroCompetencia, setFiltroCompetencia] = useState(new Date().toISOString().slice(0, 7))
  const [filtroColaborador, setFiltroColaborador] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todos')

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<PremioRow | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [premRes, colRes, obrRes] = await Promise.all([
      supabase
        .from('premios')
        .select('*, colaboradores(nome,chapa)')
        .order('data', { ascending: false }),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status', 'ativo').order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])
    if (premRes.error) toast.error('Erro ao carregar prêmios')
    else setRows((premRes.data as PremioRow[]) ?? [])
    if (colRes.data) setColaboradores(colRes.data)
    if (obrRes.data) setObras(obrRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── filtrar ───────────────────────────────────────────────────────────────
  const filtered = rows.filter((r) => {
    const matchComp = filtroCompetencia
      ? r.competencia === filtroCompetencia
      : true
    const matchCol = filtroColaborador
      ? r.colaboradores?.nome.toLowerCase().includes(filtroColaborador.toLowerCase())
      : true
    const matchTipo = filtroTipo !== 'todos' ? r.tipo === filtroTipo : true
    return matchComp && matchCol && matchTipo
  })

  const totalPeriodo = filtered.reduce((s, r) => s + (r.valor ?? 0), 0)

  // ─── modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(row: PremioRow) {
    setEditando(row)
    setForm({
      colaborador_id: row.colaborador_id,
      obra_id: row.obra_id ?? '',
      tipo: row.tipo ?? '',
      descricao: row.descricao,
      valor: String(row.valor ?? ''),
      data: row.data,
      competencia: row.competencia ?? '',
      observacoes: row.observacoes ?? '',
    })
    setModalOpen(true)
  }

  function setField(key: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // ─── save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if (!form.descricao.trim()) return toast.error('Descrição obrigatória')
    if (!form.valor) return toast.error('Valor obrigatório')
    if (!form.data) return toast.error('Data obrigatória')
    setSaving(true)
    const payload = {
      colaborador_id: form.colaborador_id,
      obra_id: form.obra_id || null,
      tipo: form.tipo || null,
      descricao: form.descricao,
      valor: parseFloat(form.valor) || null,
      data: form.data,
      competencia: form.competencia || null,
      observacoes: form.observacoes || null,
    }
    const { error } = editando
      ? await supabase.from('premios').update(payload).eq('id', editando.id)
      : await supabase.from('premios').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editando ? 'Prêmio atualizado!' : 'Prêmio criado!')
    setModalOpen(false)
    fetchData()
  }

  // ─── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('premios').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Prêmio excluído!'); fetchData() }
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <PageHeader
        title="Prêmios e Bonificações"
        subtitle="Registro de prêmios e bonificações dos colaboradores"
        action={
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Novo Prêmio
          </Button>
        }
      />

      {/* Total do período */}
      <div className="mb-4 w-60">
        <StatCard
          title="Total do Período"
          value={formatCurrency(totalPeriodo)}
          icon={<Gift className="w-5 h-5 text-white" />}
          color="bg-amber-500"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Competência</Label>
          <Input
            type="month"
            value={filtroCompetencia}
            onChange={(e) => setFiltroCompetencia(e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar colaborador..."
            value={filtroColaborador}
            onChange={(e) => setFiltroColaborador(e.target.value)}
            className="h-8 pl-7 w-48 text-sm"
          />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {TIPO_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      {loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Gift className="w-8 h-8" />} title="Nenhum prêmio encontrado" />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Colaborador</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{row.colaboradores?.nome ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{row.colaboradores?.chapa}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(row.data)}</TableCell>
                  <TableCell className="text-sm">{row.tipo ?? '—'}</TableCell>
                  <TableCell className="text-sm max-w-48 truncate" title={row.descricao}>
                    {row.descricao}
                  </TableCell>
                  <TableCell className="text-right text-sm font-semibold text-emerald-600">
                    {formatCurrency(row.valor)}
                  </TableCell>
                  <TableCell className="text-sm">{row.competencia ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setDeleteId(row.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Prêmio' : 'Novo Prêmio'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {/* Colaborador */}
            <div className="col-span-2">
              <Label>Colaborador *</Label>
              <Select value={form.colaborador_id} onValueChange={(v) => setField('colaborador_id', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.chapa} — {c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Obra */}
            <div>
              <Label>Obra</Label>
              <Select value={form.obra_id} onValueChange={(v) => setField('obra_id', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar obra" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Nenhuma</SelectItem>
                  {obras.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo */}
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setField('tipo', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Descrição */}
            <div className="col-span-2">
              <Label>Descrição *</Label>
              <Input
                value={form.descricao}
                onChange={(e) => setField('descricao', e.target.value)}
                className="mt-1"
                placeholder="Descreva o prêmio..."
              />
            </div>

            {/* Valor */}
            <div>
              <Label>Valor *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.valor}
                onChange={(e) => setField('valor', e.target.value)}
                className="mt-1"
                placeholder="0,00"
              />
            </div>

            {/* Data */}
            <div>
              <Label>Data *</Label>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setField('data', e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Competência */}
            <div>
              <Label>Competência</Label>
              <Input
                type="month"
                value={form.competencia}
                onChange={(e) => setField('competencia', e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Observações */}
            <div className="col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setField('observacoes', e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir prêmio?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
