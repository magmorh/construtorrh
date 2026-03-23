import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Funcao } from '@/lib/supabase'
import { formatCurrency, cn } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
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
import { Briefcase, Plus, Search, Pencil, Trash2, Clock, Tag } from 'lucide-react'
import { toast } from 'sonner'

// ─── tipos ────────────────────────────────────────────────────────────────────
const CATEGORIAS_FUNCAO = [
  { value: 'mestre',       label: 'Mestre' },
  { value: 'encarregado',  label: 'Encarregado' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'meio_oficial', label: 'Meio Oficial' },
  { value: 'ajudante',     label: 'Ajudante' },
]

type FormData = {
  nome: string
  sigla: string
  descricao: string
  cbo: string
  categoria: string
  valor_hora_clt: string
  valor_hora_autonomo: string
  ativo: boolean
}

const EMPTY_FORM: FormData = {
  nome: '', sigla: '', descricao: '', cbo: '', categoria: '',
  valor_hora_clt: '', valor_hora_autonomo: '', ativo: true,
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function Funcoes() {
  const [rows, setRows] = useState<Funcao[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // vínculos: mapa funcao_id → { colabs, epis }
  const [vinculos, setVinculos] = useState<Record<string, { colabs: number; epis: number }>>({})

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: colabsRaw }, { data: episRaw }] = await Promise.all([
      supabase.from('funcoes').select('*').order('nome'),
      supabase.from('colaboradores').select('funcao_id').not('funcao_id','is',null),
      supabase.from('funcao_epi').select('funcao_id').not('funcao_id','is',null),
    ])
    if (data) setRows(data as Funcao[])

    // montar mapa de vínculos
    const mapa: Record<string, { colabs: number; epis: number }> = {}
    const ensure = (id: string) => { if (!mapa[id]) mapa[id] = { colabs: 0, epis: 0 } }
    ;(colabsRaw ?? []).forEach((r: any) => { ensure(r.funcao_id); mapa[r.funcao_id].colabs++ })
    ;(episRaw   ?? []).forEach((r: any) => { ensure(r.funcao_id); mapa[r.funcao_id].epis++   })
    setVinculos(mapa)

    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── filtro ────────────────────────────────────────────────────────────────
  const filtered = rows.filter(f =>
    !search ||
    f.nome.toLowerCase().includes(search.toLowerCase()) ||
    (f.sigla ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (f.cbo ?? '').includes(search),
  )

  // ── modal ─────────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEdit = (f: Funcao) => {
    setEditId(f.id)
    setForm({
      nome: f.nome,
      sigla: f.sigla ?? '',
      descricao: f.descricao ?? '',
      cbo: f.cbo ?? '',
      categoria: (f as any).categoria ?? '',
      valor_hora_clt: f.valor_hora_clt != null ? String(f.valor_hora_clt) : '',
      valor_hora_autonomo: f.valor_hora_autonomo != null ? String(f.valor_hora_autonomo) : '',
      ativo: f.ativo,
    })
    setModalOpen(true)
  }

  const set = (k: keyof FormData, v: string | boolean) =>
    setForm(p => ({ ...p, [k]: v }))

  // ── Auto-sigla ────────────────────────────────────────────────────────────
  const handleNomeChange = (nome: string) => {
    setForm(p => {
      // Se sigla ainda não foi editada manualmente, sugere automaticamente
      const autoSigla = !p.sigla || p.sigla === autoGerarSigla(p.nome)
      return {
        ...p,
        nome,
        sigla: autoSigla ? autoGerarSigla(nome) : p.sigla,
      }
    })
  }

  function autoGerarSigla(nome: string): string {
    // Pega as primeiras letras de cada palavra (max 4 chars, uppercase)
    return nome
      .trim()
      .split(/\s+/)
      .map(w => w[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 4)
  }

  // ── save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    if (!form.sigla.trim()) { toast.error('Sigla é obrigatória'); return }
    setSaving(true)

    const payload: Partial<Funcao> & { categoria?: string|null } = {
      nome: form.nome.trim(),
      sigla: form.sigla.trim().toUpperCase(),
      descricao: form.descricao || null,
      cbo: form.cbo || null,
      categoria: form.categoria || null,
      valor_hora_clt: form.valor_hora_clt ? parseFloat(form.valor_hora_clt) : null,
      valor_hora_autonomo: form.valor_hora_autonomo ? parseFloat(form.valor_hora_autonomo) : null,
      ativo: form.ativo,
    }

    const { error } = editId
      ? await supabase.from('funcoes').update(payload).eq('id', editId)
      : await supabase.from('funcoes').insert(payload)

    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editId ? 'Função atualizada!' : 'Função criada!')
    setModalOpen(false)
    fetchData()
  }

  // ── delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)

    // Verificação server-side completa antes de excluir
    const [{ data: colabsVinc }, { data: episVinc }] = await Promise.all([
      supabase.from('colaboradores').select('id').eq('funcao_id', deleteId).limit(1),
      supabase.from('funcao_epi').select('id').eq('funcao_id', deleteId).limit(1),
    ])
    const temColabs = (colabsVinc?.length ?? 0) > 0
    const temEpis   = (episVinc?.length   ?? 0) > 0

    if (temColabs || temEpis) {
      const partes: string[] = []
      if (temColabs) partes.push('colaboradores vinculados')
      if (temEpis)   partes.push('EPIs vinculados')
      toast.error(`Não é possível excluir: há ${partes.join(' e ')}. Desvincule primeiro.`)
      setDeleting(false)
      setDeleteId(null)
      fetchData()
      return
    }

    const { error } = await supabase.from('funcoes').delete().eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    if (error) {
      toast.error('Não é possível excluir: esta função ainda está vinculada a registros do sistema.')
      fetchData()
      return
    }
    toast.success('Função excluída!')
    fetchData()
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Funções / Cargos"
        subtitle={`${rows.length} função${rows.length !== 1 ? 'ões' : ''} cadastrada${rows.length !== 1 ? 's' : ''}`}
        action={
          <Button onClick={openNew} className="gap-2">
            <Plus size={16} /> Nova Função
          </Button>
        }
      />

      {/* Busca */}
      <div className="relative max-w-sm mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, sigla ou CBO…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Tabela */}
      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Briefcase size={32} />}
          title="Nenhuma função encontrada"
          description="Cadastre a primeira função ou ajuste a busca."
          action={<Button onClick={openNew} size="sm" className="gap-1"><Plus size={14} /> Nova Função</Button>}
        />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Função</TableHead>
                <TableHead className="w-20">Sigla</TableHead>
                <TableHead className="w-32">Categoria</TableHead>
                <TableHead className="w-28">CBO</TableHead>
                <TableHead>
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className="text-blue-600" />
                    Valor/h CLT
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className="text-orange-500" />
                    Valor/h Autônomo
                  </div>
                </TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="text-right w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(f => (
                <TableRow key={f.id} className="hover:bg-muted/30 transition-colors">
                  {/* Nome + descrição */}
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{f.nome}</p>
                      {f.descricao && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{f.descricao}</p>
                      )}
                    </div>
                  </TableCell>

                  {/* Sigla */}
                  <TableCell>
                    {f.sigla ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-mono font-bold">
                        <Tag size={10} />
                        {f.sigla}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>

                  {/* Categoria */}
                  <TableCell>
                    {(f as any).categoria
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800">
                          {CATEGORIAS_FUNCAO.find(c=>c.value===(f as any).categoria)?.label ?? (f as any).categoria}
                        </span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>

                  {/* CBO */}
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {f.cbo ?? '—'}
                  </TableCell>

                  {/* Valor/hora CLT */}
                  <TableCell>
                    {f.valor_hora_clt != null ? (
                      <span className="text-sm font-medium text-blue-700">
                        {formatCurrency(f.valor_hora_clt)}<span className="text-xs font-normal text-muted-foreground">/h</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Valor/hora Autônomo */}
                  <TableCell>
                    {f.valor_hora_autonomo != null ? (
                      <span className="text-sm font-medium text-orange-600">
                        {formatCurrency(f.valor_hora_autonomo)}<span className="text-xs font-normal text-muted-foreground">/h</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      f.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800',
                    )}>
                      {f.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </TableCell>

                  {/* Ações */}
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(f)}>
                        <Pencil size={14} />
                      </Button>
                      {(()=>{
                        const v = vinculos[f.id]
                        const qtdColabs = v?.colabs ?? 0
                        const qtdEpis   = v?.epis   ?? 0
                        const temVinculo = qtdColabs > 0 || qtdEpis > 0
                        const tooltipParts: string[] = []
                        if (qtdColabs > 0) tooltipParts.push(`${qtdColabs} colaborador${qtdColabs !== 1 ? 'es' : ''} vinculado${qtdColabs !== 1 ? 's' : ''}`)
                        if (qtdEpis   > 0) tooltipParts.push(`${qtdEpis} EPI${qtdEpis !== 1 ? 's' : ''} vinculado${qtdEpis !== 1 ? 's' : ''}`)
                        const tooltip = temVinculo ? `Não pode excluir: ${tooltipParts.join(' e ')}` : 'Excluir função'

                        if (temVinculo) {
                          return (
                            <span title={tooltip} style={{ display: 'inline-flex', cursor: 'not-allowed' }}>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8"
                                disabled
                                tabIndex={-1}
                                style={{ opacity: 0.25, pointerEvents: 'none', color: '#9ca3af' }}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </span>
                          )
                        }
                        return (
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title={tooltip}
                            onClick={() => setDeleteId(f.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )
                      })()}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase size={18} className="text-primary" />
              {editId ? 'Editar Função' : 'Nova Função'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">

            {/* Nome + Sigla na mesma linha */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Nome da Função *</Label>
                <Input
                  value={form.nome}
                  onChange={e => handleNomeChange(e.target.value)}
                  placeholder="Ex.: Pedreiro, Eletricista…"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">
                  Sigla * <span className="text-[10px] font-normal">(usada na chapa)</span>
                </Label>
                <Input
                  value={form.sigla}
                  onChange={e => set('sigla', e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="PED"
                  className="font-mono font-bold tracking-widest"
                  maxLength={6}
                />
              </div>
            </div>

            {/* Categoria + CBO */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Categoria</Label>
                <Select value={form.categoria||'nenhuma'} onValueChange={v=>set('categoria',v==='nenhuma'?'':v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione…"/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">— Sem categoria —</SelectItem>
                    {CATEGORIAS_FUNCAO.map(cat=>(
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">CBO</Label>
                <Input
                  value={form.cbo}
                  onChange={e => set('cbo', e.target.value)}
                  placeholder="7152-10"
                  className="font-mono"
                />
              </div>
            </div>

            {/* Descrição */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Input
                value={form.descricao}
                onChange={e => set('descricao', e.target.value)}
                placeholder="Breve descrição das atribuições…"
              />
            </div>

            {/* Valores/hora */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground/80 uppercase tracking-wide flex items-center gap-1.5">
                <Clock size={12} /> Valor por Hora
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                    CLT / Temporário (R$/h)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.valor_hora_clt}
                    onChange={e => set('valor_hora_clt', e.target.value)}
                    placeholder="0,00"
                  />
                  {form.valor_hora_clt && (
                    <p className="text-[10px] text-muted-foreground">
                      ≈ {formatCurrency(parseFloat(form.valor_hora_clt) * 220)}/mês (220h)
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                    Autônomo / PJ (R$/h)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.valor_hora_autonomo}
                    onChange={e => set('valor_hora_autonomo', e.target.value)}
                    placeholder="0,00"
                  />
                  {form.valor_hora_autonomo && (
                    <p className="text-[10px] text-muted-foreground">
                      ≈ {formatCurrency(parseFloat(form.valor_hora_autonomo) * 220)}/mês (220h)
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => set('ativo', !form.ativo)}
                className={cn(
                  'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                  form.ativo ? 'bg-primary' : 'bg-muted-foreground/30',
                )}
              >
                <span className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                  form.ativo ? 'translate-x-6' : 'translate-x-1',
                )} />
              </button>
              <Label
                className="text-sm cursor-pointer select-none"
                onClick={() => set('ativo', !form.ativo)}
              >
                {form.ativo ? 'Função ativa' : 'Função inativa'}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Criar função'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir função?</AlertDialogTitle>
            <AlertDialogDescription>
              {(()=>{
                if (!deleteId) return 'Esta ação não pode ser desfeita.'
                const v = vinculos[deleteId]
                const parts: string[] = []
                if ((v?.colabs ?? 0) > 0) parts.push(`${v.colabs} colaborador${v.colabs !== 1 ? 'es' : ''} vinculado${v.colabs !== 1 ? 's' : ''}`)
                if ((v?.epis   ?? 0) > 0) parts.push(`${v.epis} EPI${v.epis !== 1 ? 's' : ''} vinculado${v.epis !== 1 ? 's' : ''}`)
                if (parts.length > 0) {
                  return `⛔ Não é possível excluir: há ${parts.join(' e ')}. Desvincule primeiro.`
                }
                return 'Esta ação não pode ser desfeita.'
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || (deleteId ? ((vinculos[deleteId]?.colabs ?? 0) > 0 || (vinculos[deleteId]?.epis ?? 0) > 0) : false)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
