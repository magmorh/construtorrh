import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Colaborador, Funcao, Obra } from '@/lib/supabase'
import { formatCPF, formatDate, formatCurrency, cn } from '@/lib/utils'
import { PageHeader, BadgeStatus, EmptyState, LoadingSkeleton } from '@/components/Shared'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Users, Plus, Search, Pencil, Trash2, X,
} from 'lucide-react'

// ─── tipos locais ─────────────────────────────────────────────────────────────
type ColaboradorRow = Colaborador & { funcoes?: Funcao; obras?: Obra }

type FormData = {
  nome: string; chapa: string; cpf: string; rg: string; pis_nit: string
  data_nascimento: string; genero: string; estado_civil: string
  telefone: string; email: string; endereco: string; cidade: string
  estado: string; cep: string; funcao_id: string; obra_id: string
  salario: string; tipo_contrato: string; data_admissao: string
  ctps_numero: string; ctps_serie: string; banco: string; agencia: string
  conta: string; tipo_conta: string; pix_chave: string
  vale_transporte: boolean; vt_tipo: string; vt_trechos_ida: string
  vt_trechos_volta: string; status: string; observacoes: string
}

const EMPTY_FORM: FormData = {
  nome: '', chapa: '', cpf: '', rg: '', pis_nit: '', data_nascimento: '',
  genero: '', estado_civil: '', telefone: '', email: '', endereco: '',
  cidade: '', estado: '', cep: '', funcao_id: '', obra_id: '', salario: '',
  tipo_contrato: 'clt', data_admissao: '', ctps_numero: '', ctps_serie: '',
  banco: '', agencia: '', conta: '', tipo_conta: '', pix_chave: '',
  vale_transporte: false, vt_tipo: '', vt_trechos_ida: '1', vt_trechos_volta: '1',
  status: 'ativo', observacoes: '',
}

// ─── toast simples ─────────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const show = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3500)
  }, [])
  return { msg, show }
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function Colaboradores() {
  const { msg, show } = useToast()

  const [rows, setRows] = useState<ColaboradorRow[]>([])
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('todos')
  const [filterObra, setFilterObra] = useState<string>('todas')

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: cols }, { data: fns }, { data: obs }] = await Promise.all([
      supabase
        .from('colaboradores')
        .select('*, funcoes(id, nome, cbo, sigla, valor_hora_clt, valor_hora_autonomo, ativo), obras(id, nome, codigo, status, ativo)')
        .order('nome'),
      supabase.from('funcoes').select('*').eq('ativo', true).order('nome'),
      supabase.from('obras').select('*').order('nome'),
    ])
    if (cols) setRows(cols as ColaboradorRow[])
    if (fns) setFuncoes(fns as Funcao[])
    if (obs) setObras(obs as Obra[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── filtro ────────────────────────────────────────────────────────────────
  const filtered = rows.filter(c => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      c.nome.toLowerCase().includes(q) ||
      (c.chapa ?? '').toLowerCase().includes(q) ||
      (c.cpf ?? '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    const matchStatus = filterStatus === 'todos' || c.status === filterStatus
    const matchObra = filterObra === 'todas' || c.obra_id === filterObra
    return matchSearch && matchStatus && matchObra
  })

  // ── modal ─────────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEdit = (c: ColaboradorRow) => {
    setEditId(c.id)
    setForm({
      nome: c.nome,
      chapa: c.chapa ?? '',
      cpf: c.cpf ?? '',
      rg: c.rg ?? '',
      pis_nit: c.pis_nit ?? '',
      data_nascimento: c.data_nascimento ?? '',
      genero: c.genero ?? '',
      estado_civil: c.estado_civil ?? '',
      telefone: c.telefone ?? '',
      email: c.email ?? '',
      endereco: c.endereco ?? '',
      cidade: c.cidade ?? '',
      estado: c.estado ?? '',
      cep: c.cep ?? '',
      funcao_id: c.funcao_id ?? '',
      obra_id: c.obra_id ?? '',
      salario: c.salario != null ? String(c.salario) : '',
      tipo_contrato: c.tipo_contrato ?? 'clt',
      data_admissao: c.data_admissao ?? '',
      ctps_numero: c.ctps_numero ?? '',
      ctps_serie: c.ctps_serie ?? '',
      banco: c.banco ?? '',
      agencia: c.agencia ?? '',
      conta: c.conta ?? '',
      tipo_conta: c.tipo_conta ?? '',
      pix_chave: c.pix_chave ?? '',
      vale_transporte: c.vale_transporte,
      vt_tipo: c.vt_tipo ?? '',
      vt_trechos_ida: String(c.vt_trechos_ida),
      vt_trechos_volta: String(c.vt_trechos_volta),
      status: c.status,
      observacoes: c.observacoes ?? '',
    })
    setModalOpen(true)
  }

  const set = (k: keyof FormData, v: string | boolean) =>
    setForm(p => ({ ...p, [k]: v }))

  // ── Auto-preenchimento valor/hora ao trocar função ou tipo de contrato ──────
  const handleFuncaoChange = (funcaoId: string) => {
    setForm(p => {
      const fn = funcoes.find(f => f.id === funcaoId)
      let valorHora = ''
      if (fn) {
        if (p.tipo_contrato === 'pj') {
          valorHora = fn.valor_hora_autonomo != null ? String(fn.valor_hora_autonomo) : ''
        } else {
          valorHora = fn.valor_hora_clt != null ? String(fn.valor_hora_clt) : ''
        }
      }
      return { ...p, funcao_id: funcaoId, salario: valorHora }
    })
  }

  const handleTipoContratoChange = (tipo: string) => {
    setForm(p => {
      const fn = funcoes.find(f => f.id === p.funcao_id)
      let valorHora = p.salario
      if (fn) {
        if (tipo === 'pj') {
          valorHora = fn.valor_hora_autonomo != null ? String(fn.valor_hora_autonomo) : ''
        } else {
          valorHora = fn.valor_hora_clt != null ? String(fn.valor_hora_clt) : ''
        }
      }
      return { ...p, tipo_contrato: tipo, salario: valorHora }
    })
  }

  // ── save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nome.trim()) { show('Nome é obrigatório', 'error'); return }
    setSaving(true)

    const payload: Partial<Colaborador> = {
      nome: form.nome.trim(),
      chapa: form.chapa || null,
      cpf: form.cpf || null,
      rg: form.rg || null,
      pis_nit: form.pis_nit || null,
      data_nascimento: form.data_nascimento || null,
      genero: form.genero || null,
      estado_civil: form.estado_civil || null,
      telefone: form.telefone || null,
      email: form.email || null,
      endereco: form.endereco || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      cep: form.cep || null,
      funcao_id: form.funcao_id || null,
      obra_id: form.obra_id || null,
      salario: form.salario ? parseFloat(form.salario) : null,
      tipo_contrato: (form.tipo_contrato as Colaborador['tipo_contrato']) || 'clt',
      data_admissao: form.data_admissao || null,
      ctps_numero: form.ctps_numero || null,
      ctps_serie: form.ctps_serie || null,
      banco: form.banco || null,
      agencia: form.agencia || null,
      conta: form.conta || null,
      tipo_conta: form.tipo_conta || null,
      pix_chave: form.pix_chave || null,
      vale_transporte: form.vale_transporte,
      vt_tipo: form.vt_tipo || null,
      vt_trechos_ida: parseInt(form.vt_trechos_ida) || 1,
      vt_trechos_volta: parseInt(form.vt_trechos_volta) || 1,
      status: form.status as Colaborador['status'],
      observacoes: form.observacoes || null,
    }

    const { error } = editId
      ? await supabase.from('colaboradores').update(payload).eq('id', editId)
      : await supabase.from('colaboradores').insert(payload)

    setSaving(false)
    if (error) { show(error.message, 'error'); return }
    show(editId ? 'Colaborador atualizado!' : 'Colaborador criado!')
    setModalOpen(false)
    fetchData()
  }

  // ── delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    const { error } = await supabase.from('colaboradores').delete().eq('id', deleteId)
    setDeleting(false)
    setDeleteId(null)
    if (error) { show(error.message, 'error'); return }
    show('Colaborador excluído!')
    fetchData()
  }

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      {/* Toast */}
      {msg && (
        <div className={cn(
          'fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2',
          msg.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
        )}>
          {msg.text}
          <button onClick={() => {}} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      <PageHeader
        title="Colaboradores"
        subtitle={`${rows.length} colaborador${rows.length !== 1 ? 'es' : ''} cadastrado${rows.length !== 1 ? 's' : ''}`}
        action={
          <Button onClick={openNew} className="gap-2">
            <Plus size={16} /> Novo Colaborador
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nome, chapa ou CPF…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
            <SelectItem value="afastado">Afastado</SelectItem>
            <SelectItem value="ferias">Férias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterObra} onValueChange={setFilterObra}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Obra" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as obras</SelectItem>
            {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      {loading ? (
        <LoadingSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users size={32} />} title="Nenhum colaborador encontrado" description="Cadastre o primeiro colaborador ou ajuste os filtros." />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Chapa</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contrato</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => (
                <TableRow key={c.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-mono text-sm text-muted-foreground">{c.chapa ?? '—'}</TableCell>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="font-mono text-sm">{c.cpf ? formatCPF(c.cpf) : '—'}</TableCell>
                  <TableCell className="text-sm">{c.funcoes?.nome ?? '—'}</TableCell>
                  <TableCell className="text-sm">{c.obras?.nome ?? '—'}</TableCell>
                  <TableCell><BadgeStatus status={c.status} /></TableCell>
                  <TableCell className="text-sm capitalize">{c.tipo_contrato?.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}>
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

      {/* Modal Criar/Editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle className="text-lg">
              {editId ? 'Editar Colaborador' : 'Novo Colaborador'}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="pessoal" className="flex-1">
            <TabsList className="mx-6 mb-1">
              <TabsTrigger value="pessoal">Dados Pessoais</TabsTrigger>
              <TabsTrigger value="contrato">Contrato</TabsTrigger>
              <TabsTrigger value="bancario">Bancário / VT</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[70vh]">
              {/* ── TAB DADOS PESSOAIS ─────────────────────────────────────── */}
              <TabsContent value="pessoal" className="px-6 pb-4 mt-0 space-y-4">
                <SectionTitle>Identificação</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Nome completo *" span={2}>
                    <Input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" />
                  </FieldGroup>
                  <FieldGroup label="Chapa">
                    <Input value={form.chapa} onChange={e => set('chapa', e.target.value)} placeholder="0001" />
                  </FieldGroup>
                  <FieldGroup label="CPF">
                    <Input value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" />
                  </FieldGroup>
                  <FieldGroup label="RG">
                    <Input value={form.rg} onChange={e => set('rg', e.target.value)} placeholder="MG-00.000.000" />
                  </FieldGroup>
                  <FieldGroup label="PIS / NIT">
                    <Input value={form.pis_nit} onChange={e => set('pis_nit', e.target.value)} placeholder="000.00000.00-0" />
                  </FieldGroup>
                  <FieldGroup label="Data de nascimento">
                    <Input type="date" value={form.data_nascimento} onChange={e => set('data_nascimento', e.target.value)} />
                  </FieldGroup>
                  <FieldGroup label="Gênero">
                    <Select value={form.genero} onValueChange={v => set('genero', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Masculino</SelectItem>
                        <SelectItem value="F">Feminino</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                  <FieldGroup label="Estado civil">
                    <Select value={form.estado_civil} onValueChange={v => set('estado_civil', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                        <SelectItem value="casado">Casado(a)</SelectItem>
                        <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                        <SelectItem value="viuvo">Viúvo(a)</SelectItem>
                        <SelectItem value="uniao_estavel">União estável</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                  <FieldGroup label="Telefone">
                    <Input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(31) 99999-9999" />
                  </FieldGroup>
                  <FieldGroup label="E-mail">
                    <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
                  </FieldGroup>
                </div>

                <SectionTitle>Endereço</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Endereço" span={2}>
                    <Input value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, complemento" />
                  </FieldGroup>
                  <FieldGroup label="Cidade">
                    <Input value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Belo Horizonte" />
                  </FieldGroup>
                  <FieldGroup label="Estado">
                    <Input value={form.estado} onChange={e => set('estado', e.target.value)} placeholder="MG" maxLength={2} />
                  </FieldGroup>
                  <FieldGroup label="CEP">
                    <Input value={form.cep} onChange={e => set('cep', e.target.value)} placeholder="00000-000" />
                  </FieldGroup>
                </div>

                <SectionTitle>Status</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Status do colaborador">
                    <Select value={form.status} onValueChange={v => set('status', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                        <SelectItem value="afastado">Afastado</SelectItem>
                        <SelectItem value="ferias">Férias</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                  <FieldGroup label="Observações" span={2}>
                    <Textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} placeholder="Observações gerais…" />
                  </FieldGroup>
                </div>
              </TabsContent>

              {/* ── TAB CONTRATO ───────────────────────────────────────────── */}
              <TabsContent value="contrato" className="px-6 pb-4 mt-0 space-y-4">
                <SectionTitle>Vínculo</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Função">
                    <Select value={form.funcao_id} onValueChange={handleFuncaoChange}>
                      <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— Sem função —</SelectItem>
                        {funcoes.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                  <FieldGroup label="Obra">
                    <Select value={form.obra_id} onValueChange={v => set('obra_id', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— Sem obra —</SelectItem>
                        {obras.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                  <FieldGroup label="Tipo de contrato">
                    <Select value={form.tipo_contrato} onValueChange={handleTipoContratoChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="clt">CLT</SelectItem>
                        <SelectItem value="pj">PJ</SelectItem>
                        <SelectItem value="temporario">Temporário</SelectItem>
                        <SelectItem value="aprendiz">Aprendiz</SelectItem>
                        <SelectItem value="estagiario">Estagiário</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                  <FieldGroup label={form.tipo_contrato === 'pj' ? 'Valor/Hora Autônomo (R$)' : 'Valor/Hora CLT (R$)'}>
                    <Input
                      type="number" step="0.01" min="0"
                      value={form.salario}
                      onChange={e => set('salario', e.target.value)}
                      placeholder="0,00"
                    />
                    {form.funcao_id && funcoes.find(f => f.id === form.funcao_id) && (() => {
                      const fn = funcoes.find(f => f.id === form.funcao_id)!
                      const hint = form.tipo_contrato === 'pj'
                        ? fn.valor_hora_autonomo != null ? `Tabela função: R$ ${fn.valor_hora_autonomo.toFixed(2)}/h` : null
                        : fn.valor_hora_clt != null ? `Tabela função: R$ ${fn.valor_hora_clt.toFixed(2)}/h` : null
                      return hint ? <p className="text-[10px] text-muted-foreground mt-1">{hint}</p> : null
                    })()}
                  </FieldGroup>
                  <FieldGroup label="Data de admissão">
                    <Input type="date" value={form.data_admissao} onChange={e => set('data_admissao', e.target.value)} />
                  </FieldGroup>
                </div>

                <SectionTitle>CTPS</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Nº CTPS">
                    <Input value={form.ctps_numero} onChange={e => set('ctps_numero', e.target.value)} placeholder="000000" />
                  </FieldGroup>
                  <FieldGroup label="Série CTPS">
                    <Input value={form.ctps_serie} onChange={e => set('ctps_serie', e.target.value)} placeholder="000" />
                  </FieldGroup>
                </div>
              </TabsContent>

              {/* ── TAB BANCÁRIO / VT ─────────────────────────────────────── */}
              <TabsContent value="bancario" className="px-6 pb-4 mt-0 space-y-4">
                <SectionTitle>Dados Bancários</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Banco">
                    <Input value={form.banco} onChange={e => set('banco', e.target.value)} placeholder="Banco do Brasil" />
                  </FieldGroup>
                  <FieldGroup label="Agência">
                    <Input value={form.agencia} onChange={e => set('agencia', e.target.value)} placeholder="0000" />
                  </FieldGroup>
                  <FieldGroup label="Conta">
                    <Input value={form.conta} onChange={e => set('conta', e.target.value)} placeholder="00000-0" />
                  </FieldGroup>
                  <FieldGroup label="Tipo de conta">
                    <Select value={form.tipo_conta} onValueChange={v => set('tipo_conta', v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="corrente">Corrente</SelectItem>
                        <SelectItem value="poupanca">Poupança</SelectItem>
                        <SelectItem value="salario">Conta Salário</SelectItem>
                      </SelectContent>
                    </Select>
                  </FieldGroup>
                  <FieldGroup label="Chave PIX" span={2}>
                    <Input value={form.pix_chave} onChange={e => set('pix_chave', e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" />
                  </FieldGroup>
                </div>

                <SectionTitle>Vale Transporte</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Recebe VT?">
                    <div className="flex items-center h-10 gap-2">
                      <button
                        type="button"
                        onClick={() => set('vale_transporte', !form.vale_transporte)}
                        className={cn(
                          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                          form.vale_transporte ? 'bg-primary' : 'bg-muted-foreground/30',
                        )}
                      >
                        <span className={cn(
                          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                          form.vale_transporte ? 'translate-x-6' : 'translate-x-1',
                        )} />
                      </button>
                      <span className="text-sm text-muted-foreground">{form.vale_transporte ? 'Sim' : 'Não'}</span>
                    </div>
                  </FieldGroup>
                  {form.vale_transporte && (
                    <>
                      <FieldGroup label="Tipo de VT">
                        <Select value={form.vt_tipo} onValueChange={v => set('vt_tipo', v)}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cartao">Cartão</SelectItem>
                            <SelectItem value="bilhete_unico">Bilhete Único</SelectItem>
                            <SelectItem value="dinheiro">Dinheiro</SelectItem>
                          </SelectContent>
                        </Select>
                      </FieldGroup>
                      <FieldGroup label="Trechos de ida">
                        <Input type="number" min="0" max="10" value={form.vt_trechos_ida} onChange={e => set('vt_trechos_ida', e.target.value)} />
                      </FieldGroup>
                      <FieldGroup label="Trechos de volta">
                        <Input type="number" min="0" max="10" value={form.vt_trechos_volta} onChange={e => set('vt_trechos_volta', e.target.value)} />
                      </FieldGroup>
                    </>
                  )}
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Criar colaborador'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir colaborador?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível e removerá todos os dados do colaborador.
            </AlertDialogDescription>
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

// ─── subcomponentes auxiliares ────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-2 border-b border-border pb-1">
      {children}
    </p>
  )
}

function FieldGroup({
  label, children, span,
}: {
  label: string; children: React.ReactNode; span?: number
}) {
  return (
    <div className={cn('flex flex-col gap-1', span === 2 && 'col-span-2')}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
