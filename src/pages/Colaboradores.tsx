import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Colaborador, Funcao, Obra } from '@/lib/supabase'
import { formatCPF, formatDate, formatCurrency, cn } from '@/lib/utils'
import { maskCPF, maskRG, maskPIS, maskCEP, maskTelefone, maskCTPS, maskCTPSSerie, maskAgencia, maskConta } from '@/lib/masks'
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
import {
  Users, Plus, Search, Pencil, Trash2, History,
  Briefcase, Tag, Clock, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── tipos ────────────────────────────────────────────────────────────────────
type ColaboradorRow = Colaborador & {
  funcoes?: Pick<Funcao, 'id' | 'nome' | 'sigla' | 'valor_hora_clt' | 'valor_hora_autonomo'>
  obras?: Pick<Obra, 'id' | 'nome' | 'codigo'>
}

type HistoricoChapa = {
  id: string; chapa: string; funcao_id: string | null; tipo_contrato: string | null
  data_inicio: string; data_fim: string | null; motivo_troca: string | null
  funcoes?: { nome: string; sigla: string | null }
}

type FormData = {
  nome: string; chapa: string; cpf: string; rg: string; pis_nit: string
  data_nascimento: string; genero: string; estado_civil: string
  telefone: string; email: string; endereco: string; cidade: string
  estado: string; cep: string; funcao_id: string; obra_id: string
  tipo_contrato: string; data_admissao: string
  ctps_numero: string; ctps_serie: string
  banco: string; agencia: string; conta: string; tipo_conta: string; pix_chave: string
  vale_transporte: boolean; vt_tipo: string; vt_trechos_ida: string; vt_trechos_volta: string
  status: string; observacoes: string
}

const EMPTY: FormData = {
  nome: '', chapa: '', cpf: '', rg: '', pis_nit: '', data_nascimento: '',
  genero: '', estado_civil: '', telefone: '', email: '', endereco: '',
  cidade: '', estado: '', cep: '', funcao_id: '', obra_id: '',
  tipo_contrato: 'clt', data_admissao: '', ctps_numero: '', ctps_serie: '',
  banco: '', agencia: '', conta: '', tipo_conta: '', pix_chave: '',
  vale_transporte: false, vt_tipo: '', vt_trechos_ida: '1', vt_trechos_volta: '1',
  status: 'ativo', observacoes: '',
}

// ─── helpers ─────────────────────────────────────────────────────────────────
async function gerarChapa(sigla: string): Promise<string> {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const prefix = `${sigla.toUpperCase()}${yy}${mm}-`

  // Busca chapas existentes no prefix (ativas + históricas)
  const [{ data: ativos }, { data: hist }] = await Promise.all([
    supabase.from('colaboradores').select('chapa').like('chapa', `${prefix}%`),
    supabase.from('historico_chapa').select('chapa').like('chapa', `${prefix}%`),
  ])

  let max = 0
  ;[...(ativos ?? []), ...(hist ?? [])].forEach(r => {
    if (r.chapa) {
      const n = parseInt(r.chapa.split('-')[1] ?? '0', 10)
      if (!isNaN(n) && n > max) max = n
    }
  })

  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

// ─── FUNCOES INLINE ───────────────────────────────────────────────────────────
const TIPOS_CONTRATO = [
  { value: 'clt',        label: 'CLT',           cor: '#2563eb' },
  { value: 'autonomo',   label: 'Autônomo / PJ',  cor: '#ea580c' },
  { value: 'temporario', label: 'Temporário',     cor: '#7c3aed' },
  { value: 'aprendiz',   label: 'Aprendiz',       cor: '#0891b2' },
  { value: 'estagiario', label: 'Estagiário',     cor: '#059669' },
]

type ContratosValores = Record<string, { ativo: boolean; valor_hora: string }>

function emptyContratos(): ContratosValores {
  return Object.fromEntries(
    TIPOS_CONTRATO.map(t => [t.value, { ativo: t.value === 'clt', valor_hora: '' }])
  )
}

type FuncaoForm = {
  nome: string; sigla: string; descricao: string; cbo: string
  contratos: ContratosValores; ativo: boolean
}
const EMPTY_FN: FuncaoForm = {
  nome: '', sigla: '', descricao: '', cbo: '',
  contratos: emptyContratos(), ativo: true,
}

function autoSigla(nome: string) {
  return nome.trim().split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 4)
}

function FuncoesTab() {
  const [rows, setRows] = useState<Funcao[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FuncaoForm>(EMPTY_FN)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('funcoes').select('*').order('nome')
    if (data) setRows(data as Funcao[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(f =>
    !search || f.nome.toLowerCase().includes(search.toLowerCase()) ||
    (f.sigla ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const setF = (k: keyof FuncaoForm, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  const openNew = () => { setEditId(null); setForm(EMPTY_FN); setModal(true) }
  const openEdit = (f: Funcao) => {
    setEditId(f.id)
    // Merge contratos_valores do banco com os tipos padrão
    const saved = (f as any).contratos_valores as ContratosValores | null ?? {}
    // fallback para colunas legadas valor_hora_clt / valor_hora_autonomo
    const contratos = emptyContratos()
    for (const t of TIPOS_CONTRATO) {
      if (saved[t.value]) {
        contratos[t.value] = { ativo: saved[t.value].ativo ?? false, valor_hora: String(saved[t.value].valor_hora ?? '') }
      }
    }
    if (!saved['clt'] && f.valor_hora_clt != null) contratos['clt'] = { ativo: true, valor_hora: String(f.valor_hora_clt) }
    if (!saved['autonomo'] && f.valor_hora_autonomo != null) contratos['autonomo'] = { ativo: true, valor_hora: String(f.valor_hora_autonomo) }
    setForm({ nome: f.nome, sigla: f.sigla ?? '', descricao: f.descricao ?? '', cbo: f.cbo ?? '', contratos, ativo: f.ativo })
    setModal(true)
  }

  const handleNome = (nome: string) => {
    setForm(p => ({
      ...p, nome,
      sigla: (!p.sigla || p.sigla === autoSigla(p.nome)) ? autoSigla(nome) : p.sigla,
    }))
  }

  const save = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return }
    if (!form.sigla.trim()) { toast.error('Sigla obrigatória'); return }
    setSaving(true)
    // Converte para JSONB e mantém compatibilidade com colunas legadas
    const cv: Record<string, { ativo: boolean; valor_hora: number | null }> = {}
    for (const t of TIPOS_CONTRATO) {
      const c = form.contratos[t.value]
      cv[t.value] = { ativo: c.ativo, valor_hora: c.valor_hora ? parseFloat(c.valor_hora) : null }
    }
    const payload = {
      nome: form.nome.trim(),
      sigla: form.sigla.toUpperCase(),
      descricao: form.descricao || null,
      cbo: form.cbo || null,
      valor_hora_clt: cv['clt']?.valor_hora ?? null,
      valor_hora_autonomo: cv['autonomo']?.valor_hora ?? null,
      contratos_valores: cv,
      ativo: form.ativo,
    }
    const { error } = editId
      ? await supabase.from('funcoes').update(payload).eq('id', editId)
      : await supabase.from('funcoes').insert(payload)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editId ? 'Função atualizada!' : 'Função criada!')
    setModal(false); load()
  }

  const del = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('funcoes').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Função excluída!'); load()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ position: 'relative', width: 280 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
          <Input style={{ paddingLeft: 32 }} placeholder="Buscar por nome ou sigla…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button onClick={openNew} size="sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> Nova Função
        </Button>
      </div>

      {loading ? <LoadingSkeleton rows={4} /> : filtered.length === 0 ? (
        <EmptyState icon={<Briefcase size={28} />} title="Nenhuma função cadastrada" description="Crie a primeira função para vincular aos colaboradores." action={<Button size="sm" onClick={openNew}><Plus size={13} /> Nova Função</Button>} />
      ) : (
        <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <Table>
            <TableHeader>
              <TableRow style={{ background: 'var(--muted)' }}>
                <TableHead>Função</TableHead>
                <TableHead style={{ width: 80 }}>Sigla</TableHead>
                <TableHead style={{ width: 100 }}>CBO</TableHead>
                <TableHead>Contratos ativos</TableHead>
                <TableHead style={{ width: 80 }}>Status</TableHead>
                <TableHead style={{ width: 80, textAlign: 'right' }}>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(f => (
                <TableRow key={f.id}>
                  <TableCell>
                    <div style={{ fontWeight: 500 }}>{f.nome}</div>
                    {f.descricao && <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>{f.descricao}</div>}
                  </TableCell>
                  <TableCell>
                    {f.sigla ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>
                        <Tag size={9} />{f.sigla}
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--muted-foreground)' }}>{f.cbo ?? '—'}</TableCell>
                  <TableCell>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(() => {
                        const cv = (f as any).contratos_valores as Record<string,{ativo:boolean;valor_hora:number|null}> | null
                        if (!cv) {
                          // legado
                          return [
                            f.valor_hora_clt != null && <span key="clt" style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(37,99,235,0.1)', color: '#2563eb', fontWeight: 600 }}>CLT {formatCurrency(f.valor_hora_clt)}/h</span>,
                            f.valor_hora_autonomo != null && <span key="aut" style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(234,88,12,0.1)', color: '#ea580c', fontWeight: 600 }}>Aut. {formatCurrency(f.valor_hora_autonomo)}/h</span>,
                          ]
                        }
                        return TIPOS_CONTRATO.filter(t => cv[t.value]?.ativo && cv[t.value]?.valor_hora != null).map(t => (
                          <span key={t.value} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: t.cor + '18', color: t.cor, fontWeight: 600 }}>
                            {t.label.split('/')[0].trim()} {formatCurrency(cv[t.value].valor_hora!)}/h
                          </span>
                        ))
                      })()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: f.ativo ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: f.ativo ? '#059669' : '#dc2626',
                    }}>{f.ativo ? 'Ativo' : 'Inativo'}</span>
                  </TableCell>
                  <TableCell style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                      <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => openEdit(f)}><Pencil size={13} /></Button>
                      <Button variant="ghost" size="icon" style={{ width: 30, height: 30, color: 'var(--destructive)' }} onClick={() => setDeleteId(f.id)}><Trash2 size={13} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* modal função */}
      <Dialog open={modal} onOpenChange={setModal}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Briefcase size={16} color="var(--primary)" />
              {editId ? 'Editar Função' : 'Nova Função'}
            </DialogTitle>
          </DialogHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
              <Field label="Nome da Função *">
                <Input value={form.nome} onChange={e => handleNome(e.target.value)} placeholder="Ex.: Pedreiro, Eletricista…" />
              </Field>
              <Field label={<>Sigla * <span style={{ fontSize: 10, fontWeight: 400 }}>(chapa)</span></>}>
                <Input value={form.sigla} onChange={e => setF('sigla', e.target.value.toUpperCase().slice(0, 6))} placeholder="PED" style={{ fontFamily: 'monospace', fontWeight: 700, width: 90 }} maxLength={6} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="CBO">
                <Input value={form.cbo} onChange={e => setF('cbo', e.target.value)} placeholder="7152-10" style={{ fontFamily: 'monospace' }} />
              </Field>
              <Field label="Descrição">
                <Input value={form.descricao} onChange={e => setF('descricao', e.target.value)} placeholder="Atribuições…" />
              </Field>
            </div>

            <div style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)', padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={11} /> Valor por Hora — por tipo de contrato
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {TIPOS_CONTRATO.map(t => {
                  const c = form.contratos[t.value]
                  return (
                    <div key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, background: c.ativo ? 'rgba(255,255,255,0.05)' : 'transparent', border: `1px solid ${c.ativo ? t.cor + '33' : 'transparent'}` }}>
                      {/* toggle ativo */}
                      <button type="button"
                        onClick={() => setForm(p => ({ ...p, contratos: { ...p.contratos, [t.value]: { ...p.contratos[t.value], ativo: !c.ativo } } }))}
                        style={{ flexShrink: 0, position: 'relative', display: 'inline-flex', width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: c.ativo ? t.cor : 'rgba(0,0,0,0.15)', transition: 'background 150ms' }}>
                        <span style={{ position: 'absolute', top: 2, left: c.ativo ? 17 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 150ms' }} />
                      </button>
                      {/* label */}
                      <span style={{ width: 130, fontSize: 12, fontWeight: 500, color: c.ativo ? 'var(--foreground)' : 'var(--muted-foreground)' }}>{t.label}</span>
                      {/* input valor */}
                      <div style={{ flex: 1, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--muted-foreground)', pointerEvents: 'none' }}>R$</span>
                        <Input
                          type="number" step="0.01" min="0"
                          disabled={!c.ativo}
                          value={c.valor_hora}
                          onChange={e => setForm(p => ({ ...p, contratos: { ...p.contratos, [t.value]: { ...p.contratos[t.value], valor_hora: e.target.value } } }))}
                          placeholder={c.ativo ? '0,00' : '—'}
                          style={{ paddingLeft: 28, opacity: c.ativo ? 1 : 0.4 }}
                        />
                      </div>
                      {/* hint mensal */}
                      {c.ativo && c.valor_hora && (
                        <span style={{ fontSize: 10, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                          ≈ {formatCurrency(parseFloat(c.valor_hora) * 220)}/mês
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button type="button" onClick={() => setF('ativo', !form.ativo)}
                style={{ position: 'relative', display: 'inline-flex', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form.ativo ? 'var(--primary)' : 'rgba(0,0,0,0.15)', transition: 'background 150ms', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 3, left: form.ativo ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 150ms' }} />
              </button>
              <span style={{ fontSize: 13, color: 'var(--foreground)', cursor: 'pointer' }} onClick={() => setF('ativo', !form.ativo)}>
                {form.ativo ? 'Função ativa' : 'Função inativa'}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando…' : editId ? 'Salvar' : 'Criar função'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir função?</AlertDialogTitle>
            <AlertDialogDescription>Colaboradores vinculados perderão o vínculo com esta função.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={del} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function Colaboradores() {
  const [pageTab, setPageTab] = useState<'colaboradores' | 'funcoes'>('colaboradores')

  const [rows, setRows]     = useState<ColaboradorRow[]>([])
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const [obras, setObras]   = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('todos')

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState<FormData>(EMPTY)
  const [section, setSection]     = useState<'pessoal' | 'funcao' | 'bancario'>('pessoal')
  const [saving, setSaving]       = useState(false)

  // chapa
  const [chapaGerada, setChapaGerada]     = useState('')
  const [gerando, setGerando]             = useState(false)
  const [funcaoOriginal, setFuncaoOriginal] = useState('')  // id antes da edição
  const [chapaOriginal, setChapaOriginal]   = useState('')  // chapa antes da edição
  const [motivoTroca, setMotivoTroca]       = useState('')
  const [trocandoFuncao, setTrocandoFuncao] = useState(false)

  // histórico chapa
  const [histModal, setHistModal]     = useState(false)
  const [histColabId, setHistColabId] = useState<string | null>(null)
  const [histRows, setHistRows]       = useState<HistoricoChapa[]>([])
  const [histLoading, setHistLoading] = useState(false)

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: cols }, { data: fns }, { data: obs }] = await Promise.all([
      supabase.from('colaboradores')
        .select('*, funcoes(id,nome,sigla,valor_hora_clt,valor_hora_autonomo,contratos_valores), obras(id,nome,codigo)')
        .order('nome'),
      supabase.from('funcoes').select('*').eq('ativo', true).order('nome'),
      supabase.from('obras').select('*').order('nome'),
    ])
    if (cols) setRows(cols as ColaboradorRow[])
    if (fns)  setFuncoes(fns as Funcao[])
    if (obs)  setObras(obs as Obra[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── filtros ───────────────────────────────────────────────────────────────
  const filtered = rows.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || c.nome.toLowerCase().includes(q) || (c.chapa ?? '').toLowerCase().includes(q) || (c.cpf ?? '').includes(q)
    const matchS = filterStatus === 'todos' || c.status === filterStatus
    return matchQ && matchS
  })

  // ── helpers form ──────────────────────────────────────────────────────────
  const set = (k: keyof FormData, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  const handleFuncaoChange = async (funcaoId: string) => {
    const fn = funcoes.find(f => f.id === funcaoId)
    if (!fn) { set('funcao_id', ''); return }

    // Auto-preenche valor/hora conforme tipo de contrato atual
    const vhClt = fn.valor_hora_clt != null ? String(fn.valor_hora_clt) : ''
    const vhAuto = fn.valor_hora_autonomo != null ? String(fn.valor_hora_autonomo) : ''
    const valorHora = form.tipo_contrato === 'pj' || form.tipo_contrato === 'autonomo' ? vhAuto : vhClt

    setForm(p => ({ ...p, funcao_id: funcaoId }))

    // Se está criando (sem chapa ainda) ou trocando de função em edição
    const estaEditando = !!editId
    const mudouFuncao  = estaEditando && funcaoId !== funcaoOriginal && funcaoOriginal !== ''

    if (mudouFuncao) {
      setTrocandoFuncao(true)
    } else if (!estaEditando && fn.sigla) {
      // Criar: gera chapa automaticamente
      setGerando(true)
      const nova = await gerarChapa(fn.sigla)
      setChapaGerada(nova)
      setForm(p => ({ ...p, funcao_id: funcaoId, chapa: nova }))
      setGerando(false)
    }
  }

  // ── abrir modal criar ────────────────────────────────────────────────────
  const openNew = () => {
    setEditId(null)
    setForm(EMPTY)
    setChapaGerada('')
    setFuncaoOriginal('')
    setChapaOriginal('')
    setMotivoTroca('')
    setTrocandoFuncao(false)
    setSection('pessoal')
    setModalOpen(true)
  }

  // ── abrir modal editar ───────────────────────────────────────────────────
  const openEdit = (c: ColaboradorRow) => {
    setEditId(c.id)
    setFuncaoOriginal(c.funcao_id ?? '')
    setChapaOriginal(c.chapa ?? '')
    setChapaGerada(c.chapa ?? '')
    setMotivoTroca('')
    setTrocandoFuncao(false)
    setSection('pessoal')
    setForm({
      nome: c.nome, chapa: c.chapa ?? '', cpf: c.cpf ?? '', rg: c.rg ?? '',
      pis_nit: c.pis_nit ?? '', data_nascimento: c.data_nascimento ?? '',
      genero: c.genero ?? '', estado_civil: c.estado_civil ?? '',
      telefone: c.telefone ?? '', email: c.email ?? '', endereco: c.endereco ?? '',
      cidade: c.cidade ?? '', estado: c.estado ?? '', cep: c.cep ?? '',
      funcao_id: c.funcao_id ?? '', obra_id: c.obra_id ?? '',
      tipo_contrato: c.tipo_contrato ?? 'clt', data_admissao: c.data_admissao ?? '',
      ctps_numero: c.ctps_numero ?? '', ctps_serie: c.ctps_serie ?? '',
      banco: c.banco ?? '', agencia: c.agencia ?? '', conta: c.conta ?? '',
      tipo_conta: c.tipo_conta ?? '', pix_chave: c.pix_chave ?? '',
      vale_transporte: c.vale_transporte ?? false,
      vt_tipo: c.vt_tipo ?? '', vt_trechos_ida: String(c.vt_trechos_ida ?? 1),
      vt_trechos_volta: String(c.vt_trechos_volta ?? 1),
      status: c.status ?? 'ativo', observacoes: c.observacoes ?? '',
    })
    setModalOpen(true)
  }

  // ── salvar ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); setSection('pessoal'); return }
    if (!form.funcao_id)   { toast.error('Selecione a função'); setSection('funcao'); return }
    if (!form.chapa)       { toast.error('Chapa não gerada — selecione a função'); setSection('funcao'); return }

    // Troca de função sem motivo
    const mudouFuncao = editId && form.funcao_id !== funcaoOriginal && funcaoOriginal !== ''
    if (mudouFuncao && !motivoTroca.trim()) {
      toast.error('Informe o motivo da troca de função')
      setTrocandoFuncao(true)
      setSection('funcao')
      return
    }

    setSaving(true)

    const payload: Partial<Colaborador> = {
      nome: form.nome.trim(),
      chapa: form.chapa,
      cpf: form.cpf || null,
      rg: form.rg || null,
      pis_nit: form.pis_nit || null,
      data_nascimento: form.data_nascimento || null,
      genero: form.genero as Colaborador['genero'] || null,
      estado_civil: form.estado_civil as Colaborador['estado_civil'] || null,
      telefone: form.telefone || null,
      email: form.email || null,
      endereco: form.endereco || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      cep: form.cep || null,
      funcao_id: form.funcao_id || null,
      obra_id: form.obra_id || null,
      tipo_contrato: form.tipo_contrato as Colaborador['tipo_contrato'],
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
      vt_trechos_ida: form.vt_trechos_ida ? parseInt(form.vt_trechos_ida) : null,
      vt_trechos_volta: form.vt_trechos_volta ? parseInt(form.vt_trechos_volta) : null,
      status: form.status as Colaborador['status'],
      observacoes: form.observacoes || null,
    }

    // Se mudou função → registra histórico ANTES de atualizar
    if (mudouFuncao && editId) {
      await supabase.from('historico_chapa').insert({
        colaborador_id: editId,
        chapa: chapaOriginal,
        funcao_id: funcaoOriginal || null,
        tipo_contrato: rows.find(r => r.id === editId)?.tipo_contrato ?? null,
        data_inicio: rows.find(r => r.id === editId)?.data_admissao ?? new Date().toISOString().split('T')[0],
        data_fim: new Date().toISOString().split('T')[0],
        motivo_troca: motivoTroca.trim(),
      })
    }

    const { error } = editId
      ? await supabase.from('colaboradores').update(payload).eq('id', editId)
      : await supabase.from('colaboradores').insert(payload)

    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editId ? 'Colaborador atualizado!' : 'Colaborador criado!')
    setModalOpen(false)
    fetchData()
  }

  // ── deletar ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return
    const { error } = await supabase.from('colaboradores').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Colaborador excluído!'); fetchData()
  }

  // ── histórico chapa ───────────────────────────────────────────────────────
  const openHist = async (colaboradorId: string) => {
    setHistColabId(colaboradorId)
    setHistLoading(true)
    setHistModal(true)
    const { data } = await supabase
      .from('historico_chapa')
      .select('*, funcoes(nome, sigla)')
      .eq('colaborador_id', colaboradorId)
      .order('data_inicio', { ascending: false })
    if (data) setHistRows(data as HistoricoChapa[])
    setHistLoading(false)
  }

  // ── render: abas da página ────────────────────────────────────────────────
  return (
    <div>
      {/* Tabs de página */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {(['colaboradores', 'funcoes'] as const).map(t => (
          <button key={t} onClick={() => setPageTab(t)} style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: pageTab === t ? '2px solid var(--primary)' : '2px solid transparent',
            color: pageTab === t ? 'var(--primary)' : 'var(--muted-foreground)',
            marginBottom: -1, transition: 'color 120ms',
          }}>
            {t === 'colaboradores' ? '👷 Colaboradores' : '🏷️ Funções & Cargos'}
          </button>
        ))}
      </div>

      {/* ── ABA FUNÇÕES ─────────────────────────────────────────────────── */}
      {pageTab === 'funcoes' && <FuncoesTab />}

      {/* ── ABA COLABORADORES ───────────────────────────────────────────── */}
      {pageTab === 'colaboradores' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: 280 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                <Input style={{ paddingLeft: 32 }} placeholder="Buscar por nome, chapa ou CPF…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger style={{ width: 150 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="ativo">Ativos</SelectItem>
                  <SelectItem value="inativo">Inativos</SelectItem>
                  <SelectItem value="afastado">Afastados</SelectItem>
                  <SelectItem value="ferias">Férias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} /> Novo Colaborador
            </Button>
          </div>

          {loading ? <LoadingSkeleton rows={5} /> : filtered.length === 0 ? (
            <EmptyState icon={<Users size={32} />} title="Nenhum colaborador encontrado" description="Cadastre o primeiro colaborador ou ajuste os filtros." action={<Button onClick={openNew} size="sm"><Plus size={13} /> Novo Colaborador</Button>} />
          ) : (
            <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <Table>
                <TableHeader>
                  <TableRow style={{ background: 'var(--muted)' }}>
                    <TableHead style={{ width: 130 }}>Chapa</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead style={{ width: 90 }}>Tipo</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead style={{ width: 90 }}>Status</TableHead>
                    <TableHead style={{ width: 100, textAlign: 'right' }}>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.id} style={{ cursor: 'default' }}>
                      <TableCell>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: 'var(--primary)', background: 'rgba(59,130,246,0.08)', padding: '2px 8px', borderRadius: 4 }}>
                          {c.chapa ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell style={{ fontWeight: 500 }}>{c.nome}</TableCell>
                      <TableCell style={{ fontSize: 13 }}>{(c.funcoes as any)?.nome ?? '—'}</TableCell>
                      <TableCell style={{ fontSize: 12, textTransform: 'capitalize' }}>{c.tipo_contrato?.replace(/_/g, ' ') ?? '—'}</TableCell>
                      <TableCell style={{ fontSize: 13 }}>{(c.obras as any)?.nome ?? '—'}</TableCell>
                      <TableCell><BadgeStatus status={c.status} /></TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                          <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} title="Histórico de chapas" onClick={() => openHist(c.id)}><History size={13} /></Button>
                          <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => openEdit(c)}><Pencil size={13} /></Button>
                          <Button variant="ghost" size="icon" style={{ width: 30, height: 30, color: 'var(--destructive)' }} onClick={() => setDeleteId(c.id)}><Trash2 size={13} /></Button>
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

      {/* ═══════════ MODAL COLABORADOR ═══════════════════════════════════════ */}
      <Dialog open={modalOpen} onOpenChange={() => {}}>
        <DialogContent
          onInteractOutside={e => e.preventDefault()}
          onEscapeKeyDown={e => e.preventDefault()}
          style={{ maxWidth: 680, padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '92vh', overflow: 'hidden' }}>

          {/* cabeçalho */}
          <DialogHeader style={{ padding: '18px 24px 0', flexShrink: 0 }}>
            <DialogTitle style={{ fontSize: 16 }}>
              {editId ? 'Editar Colaborador' : 'Novo Colaborador'}
            </DialogTitle>
          </DialogHeader>

          {/* abas do modal */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', margin: '12px 24px 0', flexShrink: 0 }}>
            {(['pessoal', 'funcao', 'bancario'] as const).map(s => {
              const labels: Record<string, string> = { pessoal: 'Dados Pessoais', funcao: 'Função & Contrato', bancario: 'Bancário / VT' }
              return (
                <button key={s} onClick={() => setSection(s)} style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 500, border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: section === s ? '2px solid var(--primary)' : '2px solid transparent',
                  color: section === s ? 'var(--primary)' : 'var(--muted-foreground)',
                  marginBottom: -1,
                }}>
                  {labels[s]}
                </button>
              )
            })}
          </div>

          {/* conteúdo scrollável */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

            {/* ── SEÇÃO DADOS PESSOAIS ───────────────────────────────────── */}
            {section === 'pessoal' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Sec title="Identificação">
                  <Grid cols={2}>
                    <Field label="Nome completo *" span={2}>
                      <Input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" />
                    </Field>
                    <Field label="CPF">
                      <Input value={form.cpf} onChange={e => set('cpf', maskCPF(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
                    </Field>
                    <Field label="RG">
                      <Input value={form.rg} onChange={e => set('rg', maskRG(e.target.value))} placeholder="MG-00.000.000" />
                    </Field>
                    <Field label="PIS / NIT">
                      <Input value={form.pis_nit} onChange={e => set('pis_nit', maskPIS(e.target.value))} placeholder="000.00000.00-0" inputMode="numeric" />
                    </Field>
                    <Field label="Data de nascimento">
                      <Input type="date" value={form.data_nascimento} onChange={e => set('data_nascimento', e.target.value)} />
                    </Field>
                    <Field label="Sexo">
                      <Select value={form.genero} onValueChange={v => set('genero', v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M">Masculino</SelectItem>
                          <SelectItem value="F">Feminino</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Estado civil">
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
                    </Field>
                    <Field label="Telefone">
                      <Input value={form.telefone} onChange={e => set('telefone', maskTelefone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" />
                    </Field>
                    <Field label="E-mail">
                      <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
                    </Field>
                  </Grid>
                </Sec>

                <Sec title="Endereço">
                  <Grid cols={2}>
                    <Field label="Endereço" span={2}>
                      <Input value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, complemento" />
                    </Field>
                    <Field label="Cidade">
                      <Input value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Belo Horizonte" />
                    </Field>
                    <Field label="Estado (UF)">
                      <Input value={form.estado} onChange={e => set('estado', e.target.value)} placeholder="MG" maxLength={2} />
                    </Field>
                    <Field label="CEP">
                      <Input value={form.cep} onChange={e => set('cep', maskCEP(e.target.value))} placeholder="00000-000" inputMode="numeric" />
                    </Field>
                  </Grid>
                </Sec>

                <Sec title="Status">
                  <Grid cols={2}>
                    <Field label="Status">
                      <Select value={form.status} onValueChange={v => set('status', v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ativo">Ativo</SelectItem>
                          <SelectItem value="inativo">Inativo</SelectItem>
                          <SelectItem value="afastado">Afastado</SelectItem>
                          <SelectItem value="ferias">Férias</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Observações" span={2}>
                      <Textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} placeholder="Observações gerais…" />
                    </Field>
                  </Grid>
                </Sec>
              </div>
            )}

            {/* ── SEÇÃO FUNÇÃO & CONTRATO ────────────────────────────────── */}
            {section === 'funcao' && (
              <FuncaoSection
                form={form}
                funcoes={funcoes}
                obras={obras}
                editId={editId}
                funcaoOriginal={funcaoOriginal}
                chapaOriginal={chapaOriginal}
                gerando={gerando}
                trocandoFuncao={trocandoFuncao}
                motivoTroca={motivoTroca}
                setMotivoTroca={setMotivoTroca}
                onFuncaoChange={handleFuncaoChange}
                onSet={set}
                onGotoFuncoes={() => { setModalOpen(false); setPageTab('funcoes') }}
              />
            )}

            {/* ── SEÇÃO BANCÁRIO / VT ────────────────────────────────────── */}
            {section === 'bancario' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Sec title="Dados Bancários">
                  <Grid cols={2}>
                    <Field label="Banco">
                      <Input value={form.banco} onChange={e => set('banco', e.target.value)} placeholder="Banco do Brasil" />
                    </Field>
                    <Field label="Agência">
                      <Input value={form.agencia} onChange={e => set('agencia', maskAgencia(e.target.value))} placeholder="0000-0" inputMode="numeric" style={{ fontFamily: 'monospace' }} />
                    </Field>
                    <Field label="Conta">
                      <Input value={form.conta} onChange={e => set('conta', maskConta(e.target.value))} placeholder="00000000-0" inputMode="numeric" style={{ fontFamily: 'monospace' }} />
                    </Field>
                    <Field label="Tipo de conta">
                      <Select value={form.tipo_conta} onValueChange={v => set('tipo_conta', v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="corrente">Corrente</SelectItem>
                          <SelectItem value="poupanca">Poupança</SelectItem>
                          <SelectItem value="salario">Conta Salário</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Chave PIX" span={2}>
                      <Input value={form.pix_chave} onChange={e => set('pix_chave', e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" />
                    </Field>
                  </Grid>
                </Sec>

                <Sec title="Vale Transporte">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <button type="button" onClick={() => set('vale_transporte', !form.vale_transporte)}
                      style={{ position: 'relative', display: 'inline-flex', width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form.vale_transporte ? 'var(--primary)' : 'rgba(0,0,0,0.15)', transition: 'background 150ms', flexShrink: 0 }}>
                      <span style={{ position: 'absolute', top: 3, left: form.vale_transporte ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 150ms' }} />
                    </button>
                    <span style={{ fontSize: 13 }}>{form.vale_transporte ? 'Recebe Vale Transporte' : 'Não recebe Vale Transporte'}</span>
                  </div>
                  {form.vale_transporte && (
                    <Grid cols={2}>
                      <Field label="Tipo de VT">
                        <Select value={form.vt_tipo} onValueChange={v => set('vt_tipo', v)}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cartao">Cartão</SelectItem>
                            <SelectItem value="bilhete_unico">Bilhete Único</SelectItem>
                            <SelectItem value="dinheiro">Dinheiro</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Trechos ida">
                        <Input type="number" min="0" max="10" value={form.vt_trechos_ida} onChange={e => set('vt_trechos_ida', e.target.value)} />
                      </Field>
                      <Field label="Trechos volta">
                        <Input type="number" min="0" max="10" value={form.vt_trechos_volta} onChange={e => set('vt_trechos_volta', e.target.value)} />
                      </Field>
                    </Grid>
                  )}
                </Sec>
              </div>
            )}
          </div>

          {/* rodapé */}
          <DialogFooter style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--muted)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || gerando}>
                {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Criar colaborador'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ MODAL HISTÓRICO DE CHAPAS ═══════════════════════════════ */}
      <Dialog open={histModal} onOpenChange={setHistModal}>
        <DialogContent style={{ maxWidth: 540 }}>
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={16} color="var(--primary)" />
              Histórico de Chapas
            </DialogTitle>
          </DialogHeader>

          {/* chapa atual */}
          {histColabId && (() => {
            const colab = rows.find(r => r.id === histColabId)
            if (!colab) return null
            return (
              <div style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--primary)', background: 'rgba(59,130,246,0.05)', marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--primary)', letterSpacing: '0.07em', marginBottom: 4 }}>Chapa atual (ativa)</div>
                <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 20, color: 'var(--primary)' }}>{colab.chapa ?? '—'}</div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>{(colab.funcoes as any)?.nome ?? '—'} · {colab.tipo_contrato?.toUpperCase()}</div>
              </div>
            )
          })()}

          {histLoading ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted-foreground)', fontSize: 13 }}>Carregando histórico…</div>
          ) : histRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
              Nenhuma troca de função registrada ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {histRows.map(h => (
                <div key={h.id} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: 'var(--foreground)' }}>{h.chapa}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                      {formatDate(h.data_inicio)} → {h.data_fim ? formatDate(h.data_fim) : 'atual'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{(h.funcoes as any)?.nome ?? '—'} · {h.tipo_contrato?.toUpperCase()}</div>
                  {h.motivo_troca && (
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4, fontStyle: 'italic' }}>📝 {h.motivo_troca}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* delete */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir colaborador?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é irreversível e removerá todos os dados do colaborador.</AlertDialogDescription>
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

// ─── FuncaoSection — componente isolado para evitar crashes de render ─────────
interface FuncaoSectionProps {
  form: FormData
  funcoes: Funcao[]
  obras: Obra[]
  editId: string | null
  funcaoOriginal: string
  chapaOriginal: string
  gerando: boolean
  trocandoFuncao: boolean
  motivoTroca: string
  setMotivoTroca: (v: string) => void
  onFuncaoChange: (id: string) => void
  onSet: (k: keyof FormData, v: string | boolean) => void
  onGotoFuncoes: () => void
}

function FuncaoSection({
  form, funcoes, obras, editId, funcaoOriginal, chapaOriginal,
  gerando, trocandoFuncao, motivoTroca, setMotivoTroca,
  onFuncaoChange, onSet, onGotoFuncoes,
}: FuncaoSectionProps) {
  // Calcula valor/hora fora do JSX — sem IIFE, sem risco de crash
  const funcaoSelecionada = funcoes.find(f => f.id === form.funcao_id) ?? null

  // Tipos de contrato válidos para a função selecionada (ativo=true em contratos_valores)
  const tiposContratoAtivos: typeof TIPOS_CONTRATO = (() => {
    if (!funcaoSelecionada) return TIPOS_CONTRATO // sem função: mostra todos
    const cv = (funcaoSelecionada as any).contratos_valores as Record<string, { ativo: boolean; valor_hora: number | null }> | null
    if (!cv || Object.keys(cv).length === 0) return TIPOS_CONTRATO // função antiga sem JSONB: mostra todos
    return TIPOS_CONTRATO.filter(t => cv[t.value]?.ativo === true)
  })()

  const isPJ = form.tipo_contrato === 'autonomo'
  const valorHoraTabelado: number | null = funcaoSelecionada
    ? (isPJ ? (funcaoSelecionada.valor_hora_autonomo ?? null) : (funcaoSelecionada.valor_hora_clt ?? null))
    : null

  const mostrarAlertaTroca = trocandoFuncao && !!form.funcao_id && form.funcao_id !== funcaoOriginal && funcaoOriginal !== ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── CHAPA ─────────────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 8,
        border: `1px solid ${form.chapa ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
        background: form.chapa ? 'rgba(59,130,246,0.05)' : 'var(--muted)',
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted-foreground)', marginBottom: 6 }}>
            📋 Chapa (identificador imutável)
          </div>
          {form.chapa ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 24, color: 'var(--primary)', letterSpacing: '0.05em' }}>
                {form.chapa}
              </span>
              <CheckCircle2 size={18} color="#22c55e" />
            </div>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
              {gerando ? '⏳ Gerando número de chapa…' : '← Selecione a função para gerar automaticamente'}
            </span>
          )}
        </div>
        {form.chapa && (
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', textAlign: 'right', lineHeight: 1.5 }}>
            <div>{funcaoSelecionada?.nome ?? ''}</div>
            <div style={{ fontWeight: 600 }}>{form.tipo_contrato?.toUpperCase()}</div>
          </div>
        )}
      </div>

      {/* ── ALERTA TROCA DE FUNÇÃO ────────────────────────────────────── */}
      {mostrarAlertaTroca && (
        <div style={{ borderRadius: 8, border: '1px solid #f59e0b', background: 'rgba(245,158,11,0.07)', padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} color="#f59e0b" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
              Troca de Função — Registro Jurídico Obrigatório
            </span>
          </div>
          <p style={{ fontSize: 12, color: '#78350f', marginBottom: 10, lineHeight: 1.6 }}>
            A chapa <strong style={{ fontFamily: 'monospace' }}>{chapaOriginal}</strong> será arquivada no histórico.
            Uma nova chapa será gerada. Lançamentos já realizados <strong>não serão alterados</strong>.
          </p>
          <Field label="Motivo da troca *">
            <Input
              value={motivoTroca}
              onChange={e => setMotivoTroca(e.target.value)}
              placeholder="Ex.: Promoção, reclassificação, mudança de cargo…"
              style={{ borderColor: '#f59e0b' }}
            />
          </Field>
        </div>
      )}

      {/* ── FUNÇÃO & TIPO ─────────────────────────────────────────────── */}
      <Sec title="Função">
        <Grid cols={2}>

          {/* Select função — value nunca é string vazia (usa undefined) */}
          <Field label="Função *" span={2}>
            <Select
              value={form.funcao_id || undefined}
              onValueChange={onFuncaoChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a função…" />
              </SelectTrigger>
              <SelectContent>
                {funcoes.length === 0 && (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted-foreground)' }}>
                    Nenhuma função ativa.
                  </div>
                )}
                {funcoes.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.sigla ? `[${f.sigla}]  ` : ''}{f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {funcoes.length === 0 && (
              <button
                onClick={onGotoFuncoes}
                style={{ marginTop: 4, fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textAlign: 'left' }}
              >
                → Cadastre uma função primeiro
              </button>
            )}
          </Field>

          {/* Tipo de contrato — apenas tipos ativos na função selecionada */}
          <Field label="Tipo de contrato *">
            {tiposContratoAtivos.length === 0 ? (
              <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#dc2626' }}>
                ⚠️ Nenhum tipo de contrato ativo nesta função. Edite a função primeiro.
              </div>
            ) : (
              <Select
                value={
                  // garante que o valor atual é válido para essa função; se não, usa o primeiro disponível
                  tiposContratoAtivos.find(t => t.value === form.tipo_contrato)
                    ? (form.tipo_contrato || undefined)
                    : tiposContratoAtivos[0].value
                }
                onValueChange={v => onSet('tipo_contrato', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tiposContratoAtivos.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.cor, display: 'inline-block', flexShrink: 0 }} />
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          {/* Card de valor/hora — computed acima, sem IIFE */}
          {valorHoraTabelado !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: isPJ ? 'rgba(249,115,22,0.08)' : 'rgba(59,130,246,0.08)',
                border: `1px solid ${isPJ ? 'rgba(249,115,22,0.25)' : 'rgba(59,130,246,0.25)'}`,
              }}>
                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginBottom: 4 }}>
                  Valor/hora tabelado ({isPJ ? 'Autônomo' : 'CLT'})
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: isPJ ? '#ea580c' : '#2563eb' }}>
                  {formatCurrency(valorHoraTabelado)}
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted-foreground)' }}>/h</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>
                  ≈ {formatCurrency(valorHoraTabelado * 220)}/mês (220h)
                </div>
              </div>
            </div>
          ) : (
            <div /> /* placeholder para manter o grid 2 colunas */
          )}

          {/* Obra — sem SelectItem com value="" */}
          <Field label="Obra" span={2}>
            <Select
              value={form.obra_id || undefined}
              onValueChange={v => onSet('obra_id', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="— Sem obra vinculada —" />
              </SelectTrigger>
              <SelectContent>
                {obras.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Data de admissão">
            <Input
              type="date"
              value={form.data_admissao}
              onChange={e => onSet('data_admissao', e.target.value)}
            />
          </Field>

        </Grid>
      </Sec>

      {/* ── CTPS ──────────────────────────────────────────────────────── */}
      <Sec title="CTPS">
        <Grid cols={2}>
          <Field label="Nº CTPS">
            <Input value={form.ctps_numero} onChange={e => onSet('ctps_numero', maskCTPS(e.target.value))} placeholder="0000000" inputMode="numeric" style={{ fontFamily: 'monospace' }} />
          </Field>
          <Field label="Série CTPS">
            <Input value={form.ctps_serie} onChange={e => onSet('ctps_serie', maskCTPSSerie(e.target.value))} placeholder="0000" inputMode="numeric" style={{ fontFamily: 'monospace' }} />
          </Field>
        </Grid>
      </Sec>

    </div>
  )
}

// ─── micro-componentes ────────────────────────────────────────────────────────
function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Grid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
      {children}
    </div>
  )
}

function Field({ label, children, span }: { label: React.ReactNode; children: React.ReactNode; span?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: span ? `span ${span}` : undefined }}>
      <Label style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 500 }}>{label}</Label>
      {children}
    </div>
  )
}
