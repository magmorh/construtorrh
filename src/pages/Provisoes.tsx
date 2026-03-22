import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ProvisaoFgts, Colaborador, Obra } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
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
import { TrendingUp, Plus, Search, Pencil, Trash2 } from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
type ProvisaoRow = ProvisaoFgts & {
  colaboradores?: Pick<Colaborador, 'nome' | 'chapa'>
  obras?: Pick<Obra, 'nome'>
}

type FormData = {
  colaborador_id: string
  obra_id: string
  competencia: string
  salario_base: string
  fgts_mensal: string
  ferias_provisionadas: string
  decimo_terceiro: string
  total_provisao: string
  observacoes: string
}

const EMPTY_FORM: FormData = {
  colaborador_id: '',
  obra_id: '',
  competencia: new Date().toISOString().slice(0, 7),
  salario_base: '',
  fgts_mensal: '',
  ferias_provisionadas: '',
  decimo_terceiro: '',
  total_provisao: '',
  observacoes: '',
}

// ─── helpers de cálculo ──────────────────────────────────────────────────────
function calcProvisoes(salario: number) {
  const fgts = salario * 0.08
  const ferias = salario / 12
  const decimo = salario / 12
  return {
    fgts_mensal: fgts,
    ferias_provisionadas: ferias,
    decimo_terceiro: decimo,
    total_provisao: fgts + ferias + decimo,
  }
}

// ─── componente ──────────────────────────────────────────────────────────────
export default function Provisoes() {
  const [rows, setRows] = useState<ProvisaoRow[]>([])
  const [colaboradores, setColaboradores] = useState<Pick<Colaborador, 'id' | 'nome' | 'chapa'>[]>([])
  const [obras, setObras] = useState<Pick<Obra, 'id' | 'nome'>[]>([])
  const [loading, setLoading] = useState(true)

  // filtros
  const [filtroCompetencia, setFiltroCompetencia] = useState(new Date().toISOString().slice(0, 7))
  const [filtroColaborador, setFiltroColaborador] = useState('')
  const [filtroObra, setFiltroObra] = useState('todas')

  // modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<ProvisaoRow | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ─── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [provRes, colRes, obrRes] = await Promise.all([
      supabase
        .from('provisoes_fgts')
        .select('*, colaboradores(nome,chapa), obras(nome)')
        .order('competencia', { ascending: false }),
      supabase.from('colaboradores').select('id,nome,chapa').eq('status', 'ativo').order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
    ])
    if (provRes.error) toast.error('Erro ao carregar provisões')
    else setRows((provRes.data as ProvisaoRow[]) ?? [])
    if (colRes.data) setColaboradores(colRes.data)
    if (obrRes.data) setObras(obrRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── filtrar ───────────────────────────────────────────────────────────────
  const filtered = rows.filter((r) => {
    const matchComp = filtroCompetencia ? r.competencia === filtroCompetencia : true
    const matchCol = filtroColaborador
      ? r.colaboradores?.nome.toLowerCase().includes(filtroColaborador.toLowerCase())
      : true
    const matchObra = filtroObra !== 'todas' ? r.obra_id === filtroObra : true
    return matchComp && matchCol && matchObra
  })

  // totais
  const totFgts = filtered.reduce((s, r) => s + (r.fgts_mensal ?? 0), 0)
  const totFerias = filtered.reduce((s, r) => s + (r.ferias_provisionadas ?? 0), 0)
  const totDecimo = filtered.reduce((s, r) => s + (r.decimo_terceiro ?? 0), 0)
  const totTotal = filtered.reduce((s, r) => s + (r.total_provisao ?? 0), 0)

  // ─── modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(row: ProvisaoRow) {
    setEditando(row)
    setForm({
      colaborador_id: row.colaborador_id,
      obra_id: row.obra_id ?? '',
      competencia: row.competencia,
      salario_base: String(row.salario_base ?? ''),
      fgts_mensal: String(row.fgts_mensal ?? ''),
      ferias_provisionadas: String(row.ferias_provisionadas ?? ''),
      decimo_terceiro: String(row.decimo_terceiro ?? ''),
      total_provisao: String(row.total_provisao ?? ''),
      observacoes: row.observacoes ?? '',
    })
    setModalOpen(true)
  }

  function setField(key: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      // Recalcula automaticamente ao alterar salário
      if (key === 'salario_base') {
        const sal = parseFloat(value) || 0
        const calc = calcProvisoes(sal)
        return {
          ...next,
          fgts_mensal: calc.fgts_mensal.toFixed(2),
          ferias_provisionadas: calc.ferias_provisionadas.toFixed(2),
          decimo_terceiro: calc.decimo_terceiro.toFixed(2),
          total_provisao: calc.total_provisao.toFixed(2),
        }
      }
      // Recalcula total ao mudar qualquer campo calculado
      if (['fgts_mensal', 'ferias_provisionadas', 'decimo_terceiro'].includes(key)) {
        const fgts = parseFloat(key === 'fgts_mensal' ? value : next.fgts_mensal) || 0
        const ferias = parseFloat(key === 'ferias_provisionadas' ? value : next.ferias_provisionadas) || 0
        const decimo = parseFloat(key === 'decimo_terceiro' ? value : next.decimo_terceiro) || 0
        return { ...next, total_provisao: (fgts + ferias + decimo).toFixed(2) }
      }
      return next
    })
  }

  // ─── save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador obrigatório')
    if (!form.competencia) return toast.error('Competência obrigatória')
    if (!form.salario_base) return toast.error('Salário base obrigatório')
    setSaving(true)
    const payload = {
      colaborador_id: form.colaborador_id,
      obra_id: form.obra_id || null,
      competencia: form.competencia,
      salario_base: parseFloat(form.salario_base) || null,
      fgts_mensal: parseFloat(form.fgts_mensal) || null,
      ferias_provisionadas: parseFloat(form.ferias_provisionadas) || null,
      decimo_terceiro: parseFloat(form.decimo_terceiro) || null,
      total_provisao: parseFloat(form.total_provisao) || null,
      observacoes: form.observacoes || null,
    }
    const { error } = editando
      ? await supabase.from('provisoes_fgts').update(payload).eq('id', editando.id)
      : await supabase.from('provisoes_fgts').insert(payload)
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success(editando ? 'Provisão atualizada!' : 'Provisão criada!')
    setModalOpen(false)
    fetchData()
  }

  // ─── delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId) return
    const { error } = await supabase.from('provisoes_fgts').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) toast.error('Erro ao excluir')
    else { toast.success('Provisão excluída!'); fetchData() }
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <PageHeader
        title="Provisões FGTS"
        subtitle="Controle de provisões mensais de FGTS, férias e 13º salário"
        action={
          <Button onClick={openCreate} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Nova Provisão
          </Button>
        }
      />

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
        <Select value={filtroObra} onValueChange={setFiltroObra}>
          <SelectTrigger className="h-8 w-44 text-sm">
            <SelectValue placeholder="Obra" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as obras</SelectItem>
            {obras.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      {loading ? (
        <LoadingSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<TrendingUp className="w-8 h-8" />} title="Nenhuma provisão encontrada" />
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Colaborador</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Salário</TableHead>
                <TableHead className="text-right">FGTS 8%</TableHead>
                <TableHead className="text-right">Férias</TableHead>
                <TableHead className="text-right">13º</TableHead>
                <TableHead className="text-right">Total</TableHead>
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
                  <TableCell className="text-sm">{row.obras?.nome ?? '—'}</TableCell>
                  <TableCell className="text-sm">{row.competencia}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(row.salario_base)}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(row.fgts_mensal)}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(row.ferias_provisionadas)}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(row.decimo_terceiro)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">{formatCurrency(row.total_provisao)}</TableCell>
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
            <TableFooter>
              <TableRow className="bg-muted font-semibold text-sm">
                <TableCell colSpan={3}>Totais do período</TableCell>
                <TableCell className="text-right">—</TableCell>
                <TableCell className="text-right">{formatCurrency(totFgts)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totFerias)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totDecimo)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totTotal)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Provisão' : 'Nova Provisão'}</DialogTitle>
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

            {/* Competência */}
            <div>
              <Label>Competência *</Label>
              <Input
                type="month"
                value={form.competencia}
                onChange={(e) => setField('competencia', e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Salário base */}
            <div className="col-span-2">
              <Label>Salário Base *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.salario_base}
                onChange={(e) => setField('salario_base', e.target.value)}
                className="mt-1"
                placeholder="0,00 — campos abaixo são calculados automaticamente"
              />
            </div>

            {/* FGTS 8% */}
            <div>
              <Label>FGTS Mensal (8%)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.fgts_mensal}
                onChange={(e) => setField('fgts_mensal', e.target.value)}
                className="mt-1 bg-muted"
                placeholder="0,00"
              />
            </div>

            {/* Férias */}
            <div>
              <Label>Férias Provisionadas (1/12)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.ferias_provisionadas}
                onChange={(e) => setField('ferias_provisionadas', e.target.value)}
                className="mt-1 bg-muted"
                placeholder="0,00"
              />
            </div>

            {/* 13º */}
            <div>
              <Label>13º Salário (1/12)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.decimo_terceiro}
                onChange={(e) => setField('decimo_terceiro', e.target.value)}
                className="mt-1 bg-muted"
                placeholder="0,00"
              />
            </div>

            {/* Total */}
            <div>
              <Label>Total Provisão</Label>
              <Input
                type="number"
                step="0.01"
                value={form.total_provisao}
                readOnly
                className="mt-1 bg-muted font-semibold"
                placeholder="0,00"
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
            <AlertDialogTitle>Excluir provisão?</AlertDialogTitle>
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
