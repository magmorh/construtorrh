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
  Users, Plus, Search, Pencil, Trash2, HardHat, History,
  Briefcase, Tag, Clock, AlertTriangle, CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { traduzirErro } from '@/lib/erros'

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

interface VtTrecho {
  id: string
  nome_linha: string
  tipo_veiculo: string
  valor: string
  tem_integracao: boolean
}

function novoTrecho(): VtTrecho {
  return { id: crypto.randomUUID(), nome_linha: '', tipo_veiculo: 'onibus', valor: '', tem_integracao: false }
}

type VtModalidade = 'nenhum' | 'gasolina' | 'transporte'

interface ColabEpiItem {
  epi_id: string
  epi_nome: string
  epi_categoria: string | null
  requer_tamanho: boolean
  requer_numero: boolean
  obrigatorio: boolean
  quantidade: number
  tamanho: string
  numero: string
  colaborador_epi_id?: string
  status: string
  documento_url?: string | null
  documento_nome?: string | null
  uploadingDoc?: boolean
  _foraFuncao?: boolean  // marcado após atualização: EPI não pertence mais à função atual
}

type FormData = {
  nome: string; chapa: string; cpf: string; rg: string; pis_nit: string
  data_nascimento: string; genero: string; estado_civil: string
  telefone: string; email: string; endereco: string; cidade: string
  estado: string; cep: string; funcao_id: string; obra_id: string
  tipo_contrato: string; data_admissao: string
  ctps_numero: string; ctps_serie: string
  // Bancário
  banco: string; agencia: string; conta: string; tipo_conta: string
  pix_tipo: string; pix_chave: string
  // VT
  vt_modalidade: VtModalidade
  vt_gasolina_valor_dia: string
  vt_cartao_tipo: string
  vt_cartao_numero: string
  vt_trechos_ida: VtTrecho[]
  vt_trechos_volta: VtTrecho[]
  status: string; observacoes: string
}

const EMPTY: FormData = {
  nome: '', chapa: '', cpf: '', rg: '', pis_nit: '', data_nascimento: '',
  genero: '', estado_civil: '', telefone: '', email: '', endereco: '',
  cidade: '', estado: '', cep: '', funcao_id: '', obra_id: '',
  tipo_contrato: 'clt', data_admissao: '', ctps_numero: '', ctps_serie: '',
  banco: '', agencia: '', conta: '', tipo_conta: '',
  pix_tipo: '', pix_chave: '',
  vt_modalidade: 'nenhum', vt_gasolina_valor_dia: '',
  vt_cartao_tipo: '', vt_cartao_numero: '',
  vt_trechos_ida: [], vt_trechos_volta: [],
  status: 'ativo', observacoes: '',
}

// ─── helpers ─────────────────────────────────────────────────────────────────
async function gerarChapa(sigla: string, dataAdmissao?: string): Promise<string> {
  // Usa a data de admissão do colaborador; fallback para hoje
  const base = dataAdmissao ? new Date(dataAdmissao + 'T12:00:00') : new Date()
  const yy = String(base.getFullYear()).slice(-2)
  const mm = String(base.getMonth() + 1).padStart(2, '0')
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
  { value: 'clt',      label: 'CLT',          cor: '#2563eb' },
  { value: 'autonomo', label: 'Autônomo / PJ', cor: '#ea580c' },
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
  const [deleteId, setDeleteId]           = useState<string | null>(null)
  const [vinculos, setVinculos]           = useState<Record<string, number>>({})
  const [vinculosReady, setVinculosReady] = useState(false)
  const [deleting, setDeleting]           = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data }, { data: colabsRaw }] = await Promise.all([
      supabase.from('funcoes').select('*').order('nome'),
      supabase.from('colaboradores').select('funcao_id').not('funcao_id', 'is', null),
    ])
    if (data) setRows(data as Funcao[])
    // Montar mapa funcao_id → qtd colaboradores
    const mapa: Record<string, number> = {}
    ;(colabsRaw ?? []).forEach((r: any) => {
      if (r.funcao_id) mapa[r.funcao_id] = (mapa[r.funcao_id] ?? 0) + 1
    })
    setVinculos(mapa)
    setVinculosReady(true)
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
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success(editId ? 'Função atualizada!' : 'Função criada!')
    setModal(false); load()
  }

  const del = async () => {
    if (!deleteId) return
    setDeleting(true)
    // Verificar server-side antes de deletar
    const { data: colabsVinc } = await supabase
      .from('colaboradores').select('id').eq('funcao_id', deleteId).limit(1)
    if ((colabsVinc?.length ?? 0) > 0) {
      toast.error('Não é possível excluir: há colaboradores vinculados a esta função.')
      setDeleting(false); setDeleteId(null); load(); return
    }
    const { error } = await supabase.from('funcoes').delete().eq('id', deleteId)
    setDeleting(false); setDeleteId(null)
    if (error) { toast.error(traduzirErro(error.message)); return }
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
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                      <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => openEdit(f)}>
                        <Pencil size={13} />
                      </Button>
                      {/* Badge ou botão excluir — depende de vinculos */}
                      {!vinculosReady
                        ? <span style={{ width: 30, display: 'inline-block' }} />
                        : (vinculos[f.id] ?? 0) > 0
                          ? (
                            <span
                              title={`${vinculos[f.id]} colaborador${vinculos[f.id] !== 1 ? 'es vinculados' : ' vinculado'} — remova-os para poder excluir`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                                background: 'rgba(37,99,235,0.1)', color: '#2563eb', cursor: 'default',
                              }}
                            >
                              <HardHat size={13} />
                              {vinculos[f.id]}
                            </span>
                          )
                          : (
                            <Button
                              variant="ghost" size="icon"
                              style={{ width: 30, height: 30, color: 'var(--destructive)' }}
                              title="Excluir função"
                              onClick={() => setDeleteId(f.id)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          )
                      }
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
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            {/* Button normal — AlertDialogAction ignora disabled */}
            <Button variant="destructive" disabled={deleting} onClick={del}>
              {deleting ? 'Excluindo…' : 'Excluir'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── SOLICITAÇÕES DO PORTAL ───────────────────────────────────────────────────
function SolicitacoesPortalTab({ obras, funcoes }: { obras: Obra[]; funcoes: Funcao[] }) {
  const [rows, setRows]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<'pendente'|'aprovado'|'recusado'|'todos'>('pendente')
  const [aprovando, setAprovando] = useState<Set<string>>(new Set())
  const [modalApr, setModalApr] = useState<any | null>(null) // solicitação para aprovar

  const fetch = useCallback(async () => {
    setLoading(true)
    const q = supabase.from('portal_solicitacoes').select('*').eq('tipo', 'novo_colaborador').order('criado_em', { ascending: false })
    if (filtroStatus !== 'todos') q.eq('status', filtroStatus)
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }, [filtroStatus])

  useEffect(() => { fetch() }, [fetch])

  async function aprovar(s: any) {
    setAprovando(prev => new Set([...prev, s.id]))
    // Cria colaborador no sistema
    const d = s.dados ?? {}
    const { data: novoColab, error } = await supabase.from('colaboradores').insert({
      nome: d.nome, cpf: d.cpf || null, telefone: d.telefone || null,
      funcao_id: d.funcao_id || null, tipo_contrato: d.tipo_contrato || 'clt',
      data_admissao: d.data_admissao || null, obra_id: modalApr?.obra_id_sel || null,
      status: 'ativo',
    }).select('id').single()
    if (!error && novoColab?.id) {
      await supabase.from('portal_solicitacoes').update({
        status: 'aprovado', sincronizado_em: new Date().toISOString(), colaborador_id: novoColab.id,
      }).eq('id', s.id)
      toast.success(`${d.nome} cadastrado com sucesso!`)
    } else {
      toast.error('Erro ao criar colaborador: ' + error?.message)
    }
    setAprovando(prev => { const ss = new Set(prev); ss.delete(s.id); return ss })
    setModalApr(null); fetch()
  }

  async function recusar(id: string, obs: string) {
    await supabase.from('portal_solicitacoes').update({ status: 'recusado', observacoes_admin: obs }).eq('id', id)
    toast.success('Solicitação recusada')
    setModalApr(null); fetch()
  }

  const statusBadge = (s: string) => {
    if (s === 'aprovado') return { bg: '#dcfce7', cor: '#15803d', label: '✓ Aprovado' }
    if (s === 'recusado') return { bg: '#fee2e2', cor: '#dc2626', label: '✗ Recusado' }
    return { bg: '#fef3c7', cor: '#b45309', label: '⏳ Pendente' }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>📥 Solicitações de Cadastro</div>
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Cadastros solicitados pelos encarregados via Portal da Obra</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['pendente','aprovado','recusado','todos'] as const).map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)}
              style={{ height: 32, padding: '0 12px', border: `1px solid ${filtroStatus===s?'var(--primary)':'var(--border)'}`,
                borderRadius: 7, background: filtroStatus===s?'var(--primary)':'var(--card)', cursor: 'pointer',
                fontWeight: 600, fontSize: 12, color: filtroStatus===s?'#fff':'var(--foreground)' }}>
              {s === 'pendente' ? '⏳ Pendentes' : s === 'aprovado' ? '✓ Aprovadas' : s === 'recusado' ? '✗ Recusadas' : 'Todas'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted-foreground)' }}>Carregando…</div>
      ) : rows.length === 0 ? (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 48, textAlign: 'center', color: 'var(--muted-foreground)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
          Nenhuma solicitação {filtroStatus !== 'todos' ? `com status "${filtroStatus}"` : ''}
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {rows.map((r, i) => {
            const d = r.dados ?? {}
            const badge = statusBadge(r.status)
            const fn = funcoes.find(f => f.id === d.funcao_id)
            return (
              <div key={r.id} style={{ padding: '14px 18px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#1e3a5f,#2d6a4f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                  {(d.nome ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{d.nome ?? '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {d.cpf && <span>CPF: {d.cpf}</span>}
                    {fn && <span>🏷️ {fn.nome}</span>}
                    {d.tipo_contrato && <span>📋 {d.tipo_contrato.toUpperCase()}</span>}
                    {d.data_admissao && <span>📅 Admissão: {new Date(d.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                    {d.telefone && <span>📞 {d.telefone}</span>}
                  </div>
                  {d.observacoes && <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4, fontStyle: 'italic' }}>{d.observacoes}</div>}
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 4 }}>
                    Enviado {new Date(r.criado_em).toLocaleString('pt-BR')}
                    {r.observacoes_admin && <span style={{ marginLeft: 8, background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 5px' }}>Admin: {r.observacoes_admin}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ background: badge.bg, color: badge.cor, borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>{badge.label}</span>
                  {r.status === 'pendente' && (
                    <>
                      <Button size="sm" onClick={() => setModalApr({ ...r, obra_id_sel: '' })}
                        style={{ gap: 4, height: 30, fontSize: 12, background: '#15803d', color: '#fff' }}>
                        ✓ Aprovar
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => recusar(r.id, 'Recusado pelo administrador')}
                        style={{ gap: 4, height: 30, fontSize: 12, borderColor: '#dc2626', color: '#dc2626' }}>
                        ✗ Recusar
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal aprovação */}
      {modalApr && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--background)', borderRadius: 16, width: '100%', maxWidth: 460, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 16 }}>✓ Aprovar Solicitação</div>
            <div style={{ background: 'var(--muted)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700 }}>👷 {modalApr.dados?.nome}</div>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                {funcoes.find(f => f.id === modalApr.dados?.funcao_id)?.nome ?? 'Função não informada'}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>Vincular à Obra</label>
              <select value={modalApr.obra_id_sel} onChange={e => setModalApr((m: any) => ({ ...m, obra_id_sel: e.target.value }))}
                style={{ width: '100%', height: 42, border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', fontSize: 13, background: 'var(--input)', color: 'var(--foreground)' }}>
                <option value="">Sem obra (definir depois)</option>
                {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button variant="outline" onClick={() => setModalApr(null)}>Cancelar</Button>
              <Button onClick={() => aprovar(modalApr)} disabled={aprovando.has(modalApr.id)}
                style={{ background: '#15803d', color: '#fff' }}>
                {aprovando.has(modalApr.id) ? '⏳ Cadastrando…' : '✓ Confirmar e Cadastrar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function Colaboradores() {
  const [pageTab, setPageTab] = useState<'colaboradores' | 'funcoes' | 'solicitacoes'>('colaboradores')

  const [rows, setRows]     = useState<ColaboradorRow[]>([])
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const [obras, setObras]   = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('todos')
  const [filterFuncao, setFilterFuncao] = useState('todas')

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState<FormData>(EMPTY)
  const [section, setSection]     = useState<'pessoal' | 'funcao' | 'bancario' | 'vt' | 'epis'>('pessoal')

  // ── modal pré-cadastro (etapa 1) ─────────────────────────────────────────
  const [preModal, setPreModal]           = useState(false)
  const [preFuncaoId, setPreFuncaoId]     = useState('')
  const [preAdmissao, setPreAdmissao]     = useState('')
  const [preLoading, setPreLoading]       = useState(false)
  const [epiList, setEpiList]         = useState<ColabEpiItem[]>([])
  const [saving, setSaving]       = useState(false)

  // chapa
  const [chapaGerada, setChapaGerada]     = useState('')
  const [gerando, setGerando]             = useState(false)
  const [funcaoOriginal, setFuncaoOriginal] = useState('')  // id antes da edição
  const [chapaOriginal, setChapaOriginal]   = useState('')  // chapa antes da edição
  const [tipoContratoOriginal, setTipoContratoOriginal] = useState('') // tipo_contrato antes da edição
  const [temPontoLancado, setTemPontoLancado] = useState(false) // trava: tem ponto lançado
  const [motivoTroca, setMotivoTroca]       = useState('')
  const [trocandoFuncao, setTrocandoFuncao] = useState(false)

  // histórico chapa
  const [histModal, setHistModal]     = useState(false)
  const [histColabId, setHistColabId] = useState<string | null>(null)
  const [histRows, setHistRows]       = useState<HistoricoChapa[]>([])
  const [histLoading, setHistLoading] = useState(false)

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null)
  // mapa: colaborador_id → tem ponto lançado? (bloqueia exclusão visualmente)
  const [colabsComPonto, setColabsComPonto] = useState<Set<string>>(new Set())

  // atualizar EPIs da função
  const [atualizandoEpis, setAtualizandoEpis] = useState(false)
  const [confirmarAtualizEpis, setConfirmarAtualizEpis] = useState(false)

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: cols }, { data: fns }, { data: obs }, { data: pontos }] = await Promise.all([
      supabase.from('colaboradores')
        .select('*, funcoes(id,nome,sigla,valor_hora_clt,valor_hora_autonomo,contratos_valores), obras(id,nome,codigo)')
        .order('nome'),
      supabase.from('funcoes').select('*').eq('ativo', true).order('nome'),
      supabase.from('obras').select('*').order('nome'),
      supabase.from('ponto_lancamentos').select('colaborador_id'),
    ])
    if (cols) setRows(cols as ColaboradorRow[])
    if (fns)  setFuncoes(fns as Funcao[])
    if (obs)  setObras(obs as Obra[])
    // Marcar colaboradores que possuem ponto lançado (não podem ser excluídos)
    if (pontos) setColabsComPonto(new Set((pontos as any[]).map(p => p.colaborador_id)))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── filtros ───────────────────────────────────────────────────────────────
  const filtered = rows.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || c.nome.toLowerCase().includes(q) || (c.chapa ?? '').toLowerCase().includes(q) || (c.cpf ?? '').includes(q)
    const matchS = filterStatus === 'todos' || c.status === filterStatus
    const matchF = filterFuncao === 'todas' || (c as any).funcao_id === filterFuncao
    return matchQ && matchS && matchF
  })

  // ── helpers form ──────────────────────────────────────────────────────────
  const set = (k: keyof FormData, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  // Quando a data de admissão muda e já tem função selecionada → regenera chapa
  const handleDataAdmissao = async (data: string) => {
    if (!editId && form.funcao_id && data) {
      const fn = funcoes.find(f => f.id === form.funcao_id)
      if (fn?.sigla) {
        setGerando(true)
        const nova = await gerarChapa(fn.sigla, data)
        setChapaGerada(nova)
        setForm(p => ({ ...p, data_admissao: data, chapa: nova }))
        setGerando(false)
        return
      }
    }
    set('data_admissao', data)
  }

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

    // Carregar EPIs da função selecionada
    const { data: funcaoEpis } = await supabase
      .from('funcao_epi')
      .select('*, epi_catalogo(id, nome, categoria, requer_tamanho, requer_numero)')
      .eq('funcao_id', funcaoId)

    if (funcaoEpis && funcaoEpis.length > 0) {
      setEpiList(funcaoEpis.map((fe: any) => {
        // Preservar tamanho/número já preenchido se EPI já existia na lista
        const existing = epiList.find(e => e.epi_id === fe.epi_id)
        return {
          epi_id: fe.epi_id,
          epi_nome: fe.epi_catalogo?.nome ?? '',
          epi_categoria: fe.epi_catalogo?.categoria ?? null,
          requer_tamanho: fe.epi_catalogo?.requer_tamanho ?? false,
          requer_numero: fe.epi_catalogo?.requer_numero ?? false,
          obrigatorio: fe.obrigatorio ?? true,
          quantidade: fe.quantidade ?? 1,
          tamanho: existing?.tamanho ?? '',
          numero: existing?.numero ?? '',
          colaborador_epi_id: existing?.colaborador_epi_id,
          status: existing?.status ?? 'pendente',
        }
      }))
    } else if (!mudouFuncao) {
      setEpiList([])
    }

    if (mudouFuncao) {
      setTrocandoFuncao(true)
      // Pré-gera nova chapa com a nova sigla (será confirmada ao salvar)
      if (fn.sigla) {
        setGerando(true)
        const nova = await gerarChapa(fn.sigla, form.data_admissao || undefined)
        setChapaGerada(nova)
        setForm(p => ({ ...p, funcao_id: funcaoId, chapa: nova }))
        setGerando(false)
      }
    } else if (!estaEditando && fn.sigla) {
      // Criar: gera chapa automaticamente
      setGerando(true)
      const nova = await gerarChapa(fn.sigla, form.data_admissao || undefined)
      setChapaGerada(nova)
      setForm(p => ({ ...p, funcao_id: funcaoId, chapa: nova }))
      setGerando(false)
    }
  }

  // ── abrir modal criar ────────────────────────────────────────────────────
  // ── abrir pré-modal (etapa 1 — só para novo colaborador) ───────────────────
  const openNew = () => {
    setPreFuncaoId('')
    setPreAdmissao(new Date().toISOString().slice(0,10))
    setPreModal(true)
  }

  // ── avançar do pré-modal para o formulário completo ──────────────────────
  const handlePreAvançar = async () => {
    if (!preFuncaoId) { toast.error('Selecione a função'); return }
    if (!preAdmissao) { toast.error('Informe a data de admissão'); return }
    setPreLoading(true)

    // Gera chapa com função + data já definidos
    const fn = funcoes.find(f => f.id === preFuncaoId)
    if (!fn?.sigla) { toast.error('Função sem sigla cadastrada'); setPreLoading(false); return }
    const chapa = await gerarChapa(fn.sigla, preAdmissao)

    // Carrega EPIs da função selecionada
    const { data: feData } = await supabase
      .from('funcao_epi')
      .select('*, epi_catalogo(id, nome, categoria, requer_tamanho, requer_numero)')
      .eq('funcao_id', preFuncaoId)

    const epis: ColabEpiItem[] = (feData ?? []).map((fe: any) => ({
      epi_id: fe.epi_id as string,
      epi_nome: (fe.epi_catalogo?.nome ?? '') as string,
      epi_categoria: (fe.epi_catalogo?.categoria ?? null) as string | null,
      requer_tamanho: (fe.epi_catalogo?.requer_tamanho ?? false) as boolean,
      requer_numero: (fe.epi_catalogo?.requer_numero ?? false) as boolean,
      obrigatorio: (fe.obrigatorio ?? true) as boolean,
      quantidade: (fe.quantidade ?? 1) as number,
      tamanho: '',
      numero: '',
      status: 'ativo',
      documento_url: null as string | null | undefined,
      documento_nome: null as string | null | undefined,
    }))

    setPreLoading(false)
    setPreModal(false)

    // Abre formulário completo já preenchido
    setEditId(null)
    setForm({ ...EMPTY, funcao_id: preFuncaoId, data_admissao: preAdmissao, chapa })
    setChapaGerada(chapa)
    setFuncaoOriginal('')
    setTipoContratoOriginal('')
    setTemPontoLancado(false)
    setChapaOriginal('')
    setMotivoTroca('')
    setTrocandoFuncao(false)
    setEpiList(epis)
    // Se já tem EPIs vinculados, abrir direto na aba EPIs para o usuário configurar tamanhos
    setSection(epis.length > 0 ? 'epis' : 'pessoal')
    setModalOpen(true)
  }

  // ── atualizar EPIs conforme a função atual ──────────────────────────────
  const atualizarEpisPorFuncao = async () => {
    if (!form.funcao_id) { return }
    setAtualizandoEpis(true)
    setConfirmarAtualizEpis(false)

    const { data: feData } = await supabase
      .from('funcao_epi')
      .select('*, epi_catalogo(id, nome, categoria, requer_tamanho, requer_numero)')
      .eq('funcao_id', form.funcao_id)

    // Substitui a lista pelos EPIs da função,
    // preservando tamanho/número se o mesmo EPI já existia antes
    setEpiList(prev => {
      return (feData ?? []).map((fe: any) => {
        const jaExistia = prev.find(e => e.epi_id === fe.epi_id)
        return {
          epi_id: fe.epi_id as string,
          epi_nome: (fe.epi_catalogo?.nome ?? '') as string,
          epi_categoria: (fe.epi_catalogo?.categoria ?? null) as string | null,
          requer_tamanho: (fe.epi_catalogo?.requer_tamanho ?? false) as boolean,
          requer_numero: (fe.epi_catalogo?.requer_numero ?? false) as boolean,
          obrigatorio: (fe.obrigatorio ?? true) as boolean,
          quantidade: (fe.quantidade ?? 1) as number,
          // preserva tamanho/número já preenchidos
          tamanho: jaExistia?.tamanho ?? '',
          numero: jaExistia?.numero ?? '',
          status: 'ativo',
          documento_url: (jaExistia?.documento_url ?? null) as string | null | undefined,
          documento_nome: (jaExistia?.documento_nome ?? null) as string | null | undefined,
          _foraFuncao: false,
        }
      })
    })

    setAtualizandoEpis(false)
    const total = (feData ?? []).length
    toast.success(`EPIs atualizados! ${total} EPI${total !== 1 ? 's' : ''} da função carregado${total !== 1 ? 's' : ''}.`)
  }

  // ── abrir modal editar ───────────────────────────────────────────────────
  const openEdit = async (c: ColaboradorRow) => {
    setEditId(c.id)
    setFuncaoOriginal(c.funcao_id ?? '')
    setTipoContratoOriginal(c.tipo_contrato ?? 'clt')
    setChapaOriginal(c.chapa ?? '')
    setChapaGerada(c.chapa ?? '')
    setMotivoTroca('')
    setTrocandoFuncao(false)
    // Verificar se tem ponto lançado → trava de função/contrato
    const { count } = await supabase.from('ponto_lancamentos')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', c.id)
    setTemPontoLancado((count ?? 0) > 0)
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
      tipo_conta: c.tipo_conta ?? '', pix_tipo: (c as any).pix_tipo ?? '', pix_chave: c.pix_chave ?? '',
      vt_modalidade: (() => {
        if (!c.vale_transporte) return 'nenhum'
        const m = (c as any).vt_dados?.modalidade ?? ''
        if (m === 'gasolina') return 'gasolina'
        if (m === 'transporte' || m === 'misto') return 'transporte'
        return 'nenhum'
      })() as VtModalidade,
      vt_gasolina_valor_dia: String((c as any).vt_dados?.gasolina_valor_dia ?? ''),
      vt_cartao_tipo: (c as any).vt_dados?.cartao_tipo ?? '',
      vt_cartao_numero: (c as any).vt_dados?.cartao_numero ?? '',
      vt_trechos_ida: ((c as any).vt_dados?.trechos_ida ?? []) as VtTrecho[],
      vt_trechos_volta: ((c as any).vt_dados?.trechos_volta ?? []) as VtTrecho[],
      status: c.status ?? 'ativo', observacoes: c.observacoes ?? '',
    })
    // Carregar EPIs do colaborador
    const { data: colabEpiData } = await supabase
      .from('colaborador_epi')
      .select('*, epi_catalogo(id, nome, categoria, requer_tamanho, requer_numero)')
      .eq('colaborador_id', c.id)
    if (colabEpiData) {
      setEpiList(colabEpiData.map((e: any) => ({
        epi_id: e.epi_id,
        epi_nome: e.epi_catalogo?.nome ?? '',
        epi_categoria: e.epi_catalogo?.categoria ?? null,
        requer_tamanho: e.epi_catalogo?.requer_tamanho ?? false,
        requer_numero: e.epi_catalogo?.requer_numero ?? false,
        obrigatorio: true,
        quantidade: e.quantidade_entregue ?? 1,
        tamanho: e.tamanho ?? '',
        numero: e.numero ?? '',
        colaborador_epi_id: e.id,
        status: e.status ?? 'pendente',
        documento_url: e.documento_url ?? null,
        documento_nome: e.documento_nome ?? null,
      })))
    }
    setModalOpen(true)
  }

  // ── salvar ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); setSection('pessoal'); return }
    if (!form.funcao_id)   { toast.error('Selecione a função'); setSection('funcao'); return }
    if (!form.chapa)       { toast.error('Chapa não gerada — selecione a função'); setSection('funcao'); return }

    // Trava: não pode mudar função ou contrato se tiver ponto lançado
    const mudouFuncao     = editId && form.funcao_id !== funcaoOriginal && funcaoOriginal !== ''
    const mudouContrato   = editId && form.tipo_contrato !== tipoContratoOriginal && tipoContratoOriginal !== ''
    if (temPontoLancado && (mudouFuncao || mudouContrato)) {
      toast.error('⛔ Este colaborador possui pontos lançados. Função e tipo de contrato não podem ser alterados.')
      setSection('funcao')
      return
    }
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
      vale_transporte: form.vt_modalidade !== 'nenhum',
      status: form.status as Colaborador['status'],
      observacoes: form.observacoes || null,
    }
    // Campos JSONB/extras via cast (não tipados na interface Colaborador)
    const payloadFull: any = {
      ...payload,
      pix_tipo: form.pix_tipo || null,
      vt_dados: form.vt_modalidade === 'nenhum' ? null : {
        modalidade: form.vt_modalidade,
        gasolina_valor_dia: form.vt_gasolina_valor_dia ? parseFloat(form.vt_gasolina_valor_dia) : null,
        cartao_tipo: form.vt_cartao_tipo || null,
        cartao_numero: form.vt_cartao_numero || null,
        trechos_ida: form.vt_trechos_ida,
        trechos_volta: form.vt_trechos_volta,
      },
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

    // ── 1. Salvar colaborador ────────────────────────────────────────────────
    let colaboradorId: string | null = editId

    if (editId) {
      const { error } = await supabase.from('colaboradores').update(payloadFull).eq('id', editId)
      if (error) { toast.error(traduzirErro(error.message)); setSaving(false); return }
    } else {
      // ✅ Regerar chapa no momento exato do INSERT para evitar race condition / duplicata
      // (o usuário pode ter demorado no formulário enquanto outro colaborador era criado)
      const fn = funcoes.find(f => f.id === form.funcao_id)
      if (fn?.sigla) {
        const chapaFinal = await gerarChapa(fn.sigla, form.data_admissao || undefined)
        payloadFull.chapa = chapaFinal
        setChapaGerada(chapaFinal)
      }

      const { data: inserted, error } = await supabase
        .from('colaboradores').insert(payloadFull).select('id').single()
      if (error || !inserted) { toast.error(traduzirErro(error?.message ?? 'Erro ao criar colaborador')); setSaving(false); return }
      colaboradorId = inserted.id
    }

    // ── 2. Salvar EPIs ───────────────────────────────────────────────────────
    if (colaboradorId && epiList.length > 0) {
      // Apaga todos os EPIs existentes do colaborador
      const { error: delErr } = await supabase
        .from('colaborador_epi')
        .delete()
        .eq('colaborador_id', colaboradorId)

      if (delErr) {
        console.error('Erro ao limpar EPIs:', delErr.message)
      }

      // Insere a lista atualizada
      const rows = epiList
        .filter(item => !item._foraFuncao)
        .map(item => ({
          colaborador_id: colaboradorId as string,
          epi_id: item.epi_id,
          funcao_id: form.funcao_id || null,
          tamanho: item.tamanho || null,
          numero: item.numero || null,
          obrigatorio: item.obrigatorio ?? true,
          quantidade: item.quantidade ?? 1,
          quantidade_entregue: 0,
          status: 'ativo',
          documento_url: item.documento_url || null,
          documento_nome: item.documento_nome || null,
        }))

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('colaborador_epi').insert(rows)
        if (insErr) {
          toast.error('Colaborador salvo, mas erro nos EPIs: ' + insErr.message)
          console.error('Erro insert EPIs:', insErr)
          setSaving(false)
          return
        }
      }
    }

    setSaving(false)
    toast.success(editId ? 'Colaborador atualizado!' : 'Colaborador criado!')
    setModalOpen(false)
    fetchData()
  }

  // ── deletar ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return

    // ✅ Bloco 1: verificar se há ponto lançado (qualquer status)
    const { count: cntPonto } = await supabase
      .from('ponto_lancamentos')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', deleteId)
    if ((cntPonto ?? 0) > 0) {
      toast.error('❌ Não é possível excluir: este colaborador possui ponto(s) lançado(s) no sistema.')
      setDeleteId(null)
      return
    }

    // ✅ Bloco 2: verificar pagamentos avulsos
    const { count: cntPgto } = await supabase
      .from('pagamentos')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', deleteId)
    if ((cntPgto ?? 0) > 0) {
      toast.error('❌ Não é possível excluir: existem pagamentos registrados para este colaborador.')
      setDeleteId(null)
      return
    }

    // ✅ Bloco 3: verificar adiantamentos
    const { count: cntAdiant } = await supabase
      .from('adiantamentos')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', deleteId)
    if ((cntAdiant ?? 0) > 0) {
      toast.error('❌ Não é possível excluir: existem adiantamentos registrados para este colaborador.')
      setDeleteId(null)
      return
    }

    const { error } = await supabase.from('colaboradores').delete().eq('id', deleteId)
    setDeleteId(null)
    if (error) { toast.error(traduzirErro(error.message)); return }
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
        {(['colaboradores', 'funcoes', 'solicitacoes'] as const).map(t => (
          <button key={t} onClick={() => setPageTab(t)} style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
            borderBottom: pageTab === t ? '2px solid var(--primary)' : '2px solid transparent',
            color: pageTab === t ? 'var(--primary)' : 'var(--muted-foreground)',
            marginBottom: -1, transition: 'color 120ms',
          }}>
            {t === 'colaboradores' ? '👷 Colaboradores' : t === 'funcoes' ? '🏷️ Funções & Cargos' : '📥 Solicitações do Portal'}
          </button>
        ))}
      </div>

      {/* ── ABA FUNÇÕES ─────────────────────────────────────────────────── */}
      {pageTab === 'funcoes' && <FuncoesTab />}

      {/* ── ABA SOLICITAÇÕES DO PORTAL ──────────────────────────────────── */}
      {pageTab === 'solicitacoes' && <SolicitacoesPortalTab obras={obras} funcoes={funcoes} />}

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
              <Select value={filterFuncao} onValueChange={setFilterFuncao}>
                <SelectTrigger style={{ width: 180 }}><SelectValue placeholder="Todas as funções" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as funções</SelectItem>
                  {funcoes.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
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
                          {colabsComPonto.has(c.id) ? (
                            <Button variant="ghost" size="icon" title="Não é possível excluir: colaborador possui ponto(s) lançado(s)"
                              style={{ width: 30, height: 30, color: '#d1d5db', cursor: 'not-allowed' }} disabled>
                              <Trash2 size={13} />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" title="Excluir colaborador"
                              style={{ width: 30, height: 30, color: 'var(--destructive)' }}
                              onClick={() => setDeleteId(c.id)}>
                              <Trash2 size={13} />
                            </Button>
                          )}
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

      {/* ═══════════ CONFIRMAR ATUALIZAÇÃO DE EPIs ════════════════════════ */}
      <AlertDialog open={confirmarAtualizEpis} onOpenChange={setConfirmarAtualizEpis}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🔄 Atualizar EPIs da função?</AlertDialogTitle>
            <AlertDialogDescription>
              <span>
                A lista de EPIs será <strong>substituída</strong> pelos EPIs da função{' '}
                <strong>{funcoes.find(f => f.id === form.funcao_id)?.nome}</strong>.
              </span>
              <br /><br />
              <span>
                ✅ Tamanhos e números já preenchidos <strong>serão preservados</strong>.<br />
                🗑️ EPIs que não pertencem à função <strong>serão removidos da lista</strong>.<br />
                💾 As alterações só são gravadas no banco ao clicar em <strong>Salvar</strong>.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={atualizarEpisPorFuncao}>
              Sim, atualizar EPIs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ═══════════ PRÉ-MODAL: ETAPA 1 — FUNÇÃO + ADMISSÃO ═════════════════ */}
      <Dialog open={preModal} onOpenChange={v => { if (!preLoading) setPreModal(v) }}>
        <DialogContent style={{ maxWidth: 480 }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>👷</span> Novo Colaborador
            </DialogTitle>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 4 }}>
              Selecione a função e a data de admissão para gerar o código e carregar os EPIs automaticamente.
            </p>
          </DialogHeader>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            {/* Função */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label style={{ fontSize: 12, fontWeight: 600 }}>Função *</Label>
              <Select value={preFuncaoId} onValueChange={setPreFuncaoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a função…" />
                </SelectTrigger>
                <SelectContent>
                  {funcoes.filter(f => f.ativo).map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      <span style={{ fontWeight: 600 }}>{f.sigla}</span>
                      <span style={{ color: 'var(--muted-foreground)', marginLeft: 8 }}>{f.nome}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data de Admissão */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Label style={{ fontSize: 12, fontWeight: 600 }}>Data de Admissão *</Label>
              <Input
                type="date"
                value={preAdmissao}
                onChange={e => setPreAdmissao(e.target.value)}
              />
            </div>

            {/* Preview do código gerado */}
            {preFuncaoId && preAdmissao && (() => {
              const fn = funcoes.find(f => f.id === preFuncaoId)
              if (!fn?.sigla) return null
              const base = new Date(preAdmissao + 'T12:00:00')
              const yy = String(base.getFullYear()).slice(-2)
              const mm = String(base.getMonth() + 1).padStart(2, '0')
              return (
                <div style={{ background: 'var(--muted)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🪪</span>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Código gerado automaticamente</div>
                    <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 15, letterSpacing: '0.05em' }}>
                      {fn.sigla.toUpperCase()}{yy}{mm}-<span style={{ color: 'var(--primary)' }}>XXX</span>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreModal(false)} disabled={preLoading}>Cancelar</Button>
            <Button onClick={handlePreAvançar} disabled={preLoading || !preFuncaoId || !preAdmissao}>
              {preLoading ? 'Carregando…' : 'Avançar →'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {(['pessoal', 'funcao', 'bancario', 'vt', 'epis'] as const).map(s => {
              const labels: Record<string, string> = { pessoal: 'Dados Pessoais', funcao: 'Função & Contrato', bancario: 'Dados Bancários', vt: 'Vale Transporte', epis: '🦺 EPIs' }
              const isEpisTab = s === 'epis'
              const hasEpis   = isEpisTab && epiList.length > 0
              return (
                <button key={s} onClick={() => setSection(s)} style={{
                  padding: '8px 16px', fontSize: 13, fontWeight: 500, border: 'none', background: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  borderBottom: section === s ? '2px solid var(--primary)' : '2px solid transparent',
                  color: section === s ? 'var(--primary)' : 'var(--muted-foreground)',
                  marginBottom: -1,
                }}>
                  {labels[s]}
                  {hasEpis && (
                    <span style={{
                      background: section === s ? 'var(--primary)' : '#16a34a',
                      color: '#fff', fontSize: 10, fontWeight: 700,
                      borderRadius: 10, padding: '1px 6px', lineHeight: '16px',
                    }}>
                      {epiList.length}
                    </span>
                  )}
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
                onDataAdmissao={handleDataAdmissao}
                onGotoFuncoes={() => { setModalOpen(false); setPageTab('funcoes') }}
                temPontoLancado={temPontoLancado}
              />
            )}

            {/* ── SEÇÃO DADOS BANCÁRIOS ─────────────────────────────────── */}
            {section === 'bancario' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Sec title="Conta Bancária">
                  <Grid cols={2}>
                    <Field label="Banco">
                      <Input value={form.banco} onChange={e => set('banco', e.target.value)} placeholder="Ex.: Banco do Brasil, Caixa, Nubank…" />
                    </Field>
                    <Field label="Tipo de conta">
                      <Select value={form.tipo_conta || undefined} onValueChange={v => set('tipo_conta', v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="corrente">Corrente</SelectItem>
                          <SelectItem value="poupanca">Poupança</SelectItem>
                          <SelectItem value="salario">Conta Salário</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Agência">
                      <Input value={form.agencia} onChange={e => set('agencia', maskAgencia(e.target.value))} placeholder="0000-0" inputMode="numeric" style={{ fontFamily: 'monospace' }} />
                    </Field>
                    <Field label="Conta">
                      <Input value={form.conta} onChange={e => set('conta', maskConta(e.target.value))} placeholder="00000000-0" inputMode="numeric" style={{ fontFamily: 'monospace' }} />
                    </Field>
                  </Grid>
                </Sec>

                <Sec title="Chave PIX">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Botões de tipo PIX */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { v: 'cpf',            label: '🪪 CPF',           hint: 'Usa o CPF do colaborador' },
                        { v: 'telefone',        label: '📱 Celular',       hint: 'Usa o telefone do colaborador' },
                        { v: 'email',           label: '✉️ E-mail',        hint: 'Usa o e-mail do colaborador' },
                        { v: 'chave_aleatoria', label: '🔑 Chave aleatória', hint: 'Inserir manualmente' },
                      ].map(t => (
                        <button key={t.v} type="button"
                          title={t.hint}
                          onClick={() => {
                            let chave = ''
                            if (t.v === 'cpf')      chave = form.cpf
                            if (t.v === 'telefone') chave = form.telefone
                            if (t.v === 'email')    chave = form.email
                            setForm(p => ({ ...p, pix_tipo: t.v, pix_chave: chave }))
                          }}
                          style={{
                            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                            border: `1px solid ${form.pix_tipo === t.v ? 'var(--primary)' : 'var(--border)'}`,
                            background: form.pix_tipo === t.v ? 'rgba(var(--primary-rgb),0.08)' : 'transparent',
                            color: form.pix_tipo === t.v ? 'var(--primary)' : 'var(--foreground)',
                          }}>
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {form.pix_tipo && (
                      <div>
                        <Input
                          value={form.pix_chave}
                          onChange={e => setForm(p => ({ ...p, pix_chave: e.target.value }))}
                          placeholder={
                            form.pix_tipo === 'cpf' ? '000.000.000-00' :
                            form.pix_tipo === 'telefone' ? '(00) 00000-0000' :
                            form.pix_tipo === 'email' ? 'email@exemplo.com' : 'Cole a chave aleatória aqui'
                          }
                          readOnly={form.pix_tipo !== 'chave_aleatoria'}
                          style={{ fontFamily: 'monospace', background: form.pix_tipo !== 'chave_aleatoria' ? 'var(--muted)' : undefined }}
                        />
                        {form.pix_tipo !== 'chave_aleatoria' && (
                          <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 4 }}>
                            🔒 Preenchido automaticamente com os dados do colaborador
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Sec>
              </div>
            )}

            {/* ── SEÇÃO VALE TRANSPORTE ─────────────────────────────────── */}
            {section === 'vt' && (
              <VTSection form={form} setForm={setForm} />
            )}

            {/* ── SEÇÃO EPIs DO COLABORADOR ─────────────────────────────── */}
            {section === 'epis' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Banner: novo colaborador */}
                {!editId && epiList.length > 0 && (
                  <div style={{
                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                    border: '1px solid #93c5fd', borderRadius: 8, padding: '10px 14px',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <span style={{ fontSize: 20 }}>🦺</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>
                        {epiList.length} EPI{epiList.length !== 1 ? 's' : ''} carregado{epiList.length !== 1 ? 's' : ''} automaticamente
                      </div>
                      <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>
                        EPIs vinculados à função <strong>{funcoes.find(f => f.id === form.funcao_id)?.nome}</strong>.
                        Preencha os tamanhos/números necessários, depois clique em <strong>Dados Pessoais</strong> para completar o cadastro.
                      </div>
                    </div>
                  </div>
                )}

                {/* Botão de atualização de EPIs — apenas na edição */}
                {editId && form.funcao_id && (
                  <div style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>🔄</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>
                          Sincronizar EPIs com a função atual
                        </div>
                        <div style={{ fontSize: 11, color: '#16a34a', marginTop: 1 }}>
                          Função: <strong>{funcoes.find(f => f.id === form.funcao_id)?.nome}</strong>
                          {' · '}Adiciona novos EPIs vinculados à função sem remover os já entregues
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmarAtualizEpis(true)}
                      disabled={atualizandoEpis}
                      style={{
                        padding: '6px 14px', borderRadius: 6, border: '1px solid #16a34a',
                        background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600,
                        cursor: atualizandoEpis ? 'not-allowed' : 'pointer',
                        opacity: atualizandoEpis ? 0.6 : 1,
                        display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                      }}
                    >
                      {atualizandoEpis ? '⏳ Atualizando…' : '⟳ Atualizar EPIs'}
                    </button>
                  </div>
                )}

                <EpiColabSection epiList={epiList} setEpiList={setEpiList} funcaoNome={funcoes.find(f => f.id === form.funcao_id)?.nome} />
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
        <DialogContent style={{ maxWidth: 560 }}>
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <History size={16} color="var(--primary)" />
              Histórico de Chapas
            </DialogTitle>
          </DialogHeader>

          {/* Linha do tempo: ativa + anteriores */}
          {(() => {
            const colab = histColabId ? rows.find(r => r.id === histColabId) : null
            const total = 1 + histRows.length
            return (
              <div style={{ padding: '4px 0' }}>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 12 }}>
                  {total} registro{total !== 1 ? 's' : ''} no histórico · ordenado do mais recente ao mais antigo
                </div>

                {/* Linha do tempo */}
                <div style={{ position: 'relative', paddingLeft: 28 }}>
                  {/* Trilha vertical */}
                  <div style={{ position: 'absolute', left: 10, top: 18, bottom: 18, width: 2, background: 'var(--border)', borderRadius: 1 }} />

                  {/* Chapa ATIVA */}
                  {colab && (
                    <div style={{ position: 'relative', marginBottom: 16 }}>
                      {/* Ponto */}
                      <div style={{
                        position: 'absolute', left: -28, top: 14,
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'var(--primary)', border: '3px solid var(--background)',
                        boxShadow: '0 0 0 2px var(--primary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }} />
                      <div style={{
                        borderRadius: 8, padding: '12px 14px',
                        border: '2px solid var(--primary)',
                        background: 'rgba(59,130,246,0.04)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{
                            fontFamily: 'monospace', fontWeight: 800, fontSize: 22,
                            color: 'var(--primary)', letterSpacing: '0.04em',
                          }}>
                            {colab.chapa ?? '—'}
                          </span>
                          <span style={{
                            fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                            background: 'rgba(34,197,94,0.1)', color: '#16a34a',
                          }}>
                            ● ATIVA
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--foreground)', fontWeight: 500 }}>
                          {(colab.funcoes as any)?.nome ?? '—'}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                            {colab.tipo_contrato?.toUpperCase()}
                          </span>
                          {colab.data_admissao && (
                            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                              desde {formatDate(colab.data_admissao)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Histórico */}
                  {histLoading ? (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                      Carregando histórico…
                    </div>
                  ) : histRows.length === 0 ? (
                    <div style={{ paddingLeft: 4, fontSize: 12, color: 'var(--muted-foreground)', fontStyle: 'italic', padding: '8px 0' }}>
                      Nenhuma troca de função registrada.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 340, overflowY: 'auto' }}>
                      {histRows.map((h, idx) => (
                        <div key={h.id} style={{ position: 'relative' }}>
                          {/* Ponto cinza */}
                          <div style={{
                            position: 'absolute', left: -28, top: 14,
                            width: 14, height: 14, borderRadius: '50%',
                            background: idx === 0 ? '#64748b' : '#cbd5e1',
                            border: '2px solid var(--background)',
                          }} />
                          <div style={{
                            borderRadius: 8, padding: '10px 14px',
                            border: '1px solid var(--border)',
                            background: 'var(--muted)',
                            opacity: idx > 1 ? 0.75 : 1,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: 'var(--foreground)' }}>
                                {h.chapa}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                                {formatDate(h.data_inicio)} → {h.data_fim ? formatDate(h.data_fim) : '—'}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--foreground)' }}>
                              {(h.funcoes as any)?.nome ?? '—'}
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginTop: 3 }}>
                              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                                {h.tipo_contrato?.toUpperCase()}
                              </span>
                            </div>
                            {h.motivo_troca && (
                              <div style={{
                                fontSize: 11, color: 'var(--muted-foreground)',
                                marginTop: 6, padding: '4px 8px',
                                borderRadius: 4, background: 'rgba(0,0,0,0.04)',
                                fontStyle: 'italic',
                              }}>
                                📝 {h.motivo_troca}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}
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


// ─── VTSection — Vale Transporte ─────────────────────────────────────────────
interface VTSectionProps {
  form: FormData
  setForm: React.Dispatch<React.SetStateAction<FormData>>
}

const VEICULOS = [
  { v: 'onibus',  label: '🚌 Ônibus' },
  { v: 'metro',   label: '🚇 Metrô' },
  { v: 'trem',    label: '🚆 Trem' },
  { v: 'brt',     label: '🚍 BRT' },
  { v: 'outro',   label: '🚐 Outro' },
]

function TrechoRow({
  trecho, onChange, onRemove,
}: {
  trecho: VtTrecho
  onChange: (t: VtTrecho) => void
  onRemove: () => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 90px 48px 32px', gap: 8, alignItems: 'end' }}>
      <Field label="Linha / Nome">
        <Input
          value={trecho.nome_linha}
          onChange={e => onChange({ ...trecho, nome_linha: e.target.value })}
          placeholder="Ex.: Linha 1 Verde, BRT Expresso…"
        />
      </Field>
      <Field label="Veículo">
        <Select value={trecho.tipo_veiculo} onValueChange={v => onChange({ ...trecho, tipo_veiculo: v })}>
          <SelectTrigger style={{ fontSize: 12 }}><SelectValue /></SelectTrigger>
          <SelectContent>
            {VEICULOS.map(v => <SelectItem key={v.v} value={v.v}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Valor">
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--muted-foreground)' }}>R$</span>
          <Input
            type="number" step="0.01" min="0"
            value={trecho.valor}
            onChange={e => onChange({ ...trecho, valor: e.target.value })}
            placeholder="0,00"
            style={{ paddingLeft: 28 }}
          />
        </div>
      </Field>
      <Field label="Integ.">
        <button type="button"
          onClick={() => onChange({ ...trecho, tem_integracao: !trecho.tem_integracao })}
          title={trecho.tem_integracao ? 'Com integração' : 'Sem integração'}
          style={{
            width: 42, height: 36, borderRadius: 6, border: `1px solid ${trecho.tem_integracao ? '#0891b2' : 'var(--border)'}`,
            background: trecho.tem_integracao ? 'rgba(8,145,178,0.1)' : 'transparent',
            cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          {trecho.tem_integracao ? '🔗' : '—'}
        </button>
      </Field>
      <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
        <button type="button" onClick={onRemove}
          style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--destructive)' }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>×</span>
        </button>
      </div>
    </div>
  )
}

function calcTotal(trechos: VtTrecho[]): number {
  return trechos.reduce((s, t) => s + (parseFloat(t.valor) || 0), 0)
}

function VTSection({ form, setForm }: VTSectionProps) {
  const mod = form.vt_modalidade

  // ── Detectar se já há dados lançados ────────────────────────────────────────
  const hasGasolinaData = form.vt_gasolina_valor_dia !== ''
  const hasTransporteData =
    form.vt_trechos_ida.length > 0 ||
    form.vt_trechos_volta.length > 0 ||
    form.vt_cartao_tipo !== ''
  const hasActiveData =
    (mod === 'gasolina' && hasGasolinaData) ||
    (mod === 'transporte' && hasTransporteData)

  // ── Limpa completamente os dados VT (sem trocar modalidade) ─────────────────
  const excluirLancamento = () =>
    setForm(p => ({
      ...p,
      vt_gasolina_valor_dia: '',
      vt_cartao_tipo: '',
      vt_cartao_numero: '',
      vt_trechos_ida: [],
      vt_trechos_volta: [],
    }))

  // ── Trocar modalidade: só permitido se não houver dados ativos ───────────────
  const setMod = (m: VtModalidade) => {
    if (m === mod) return
    // Bloquear troca direta se houver dados lançados (exceto ir para 'nenhum' = excluir)
    if (hasActiveData && m !== 'nenhum') {
      toast.warning('⚠️ Exclua o lançamento atual antes de trocar a modalidade.')
      return
    }
    setForm(p => ({
      ...p,
      vt_modalidade: m,
      vt_gasolina_valor_dia: '',
      vt_cartao_tipo: '',
      vt_cartao_numero: '',
      vt_trechos_ida: [],
      vt_trechos_volta: [],
    }))
  }

  const addTrecho = (dir: 'ida' | 'volta') =>
    setForm(p => ({
      ...p,
      [dir === 'ida' ? 'vt_trechos_ida' : 'vt_trechos_volta']: [
        ...(dir === 'ida' ? p.vt_trechos_ida : p.vt_trechos_volta),
        novoTrecho(),
      ],
    }))

  const updTrecho = (dir: 'ida' | 'volta', idx: number, t: VtTrecho) =>
    setForm(p => {
      const arr = dir === 'ida' ? [...p.vt_trechos_ida] : [...p.vt_trechos_volta]
      arr[idx] = t
      return { ...p, [dir === 'ida' ? 'vt_trechos_ida' : 'vt_trechos_volta']: arr }
    })

  const remTrecho = (dir: 'ida' | 'volta', idx: number) =>
    setForm(p => {
      const arr = (dir === 'ida' ? p.vt_trechos_ida : p.vt_trechos_volta).filter((_, i) => i !== idx)
      return { ...p, [dir === 'ida' ? 'vt_trechos_ida' : 'vt_trechos_volta']: arr }
    })

  const totalIda    = calcTotal(form.vt_trechos_ida)
  const totalVolta  = calcTotal(form.vt_trechos_volta)
  const totalDiario = totalIda + totalVolta
  const totalMensal = totalDiario * 22

  const OPCOES: { v: VtModalidade; label: string; cor: string; icon: string }[] = [
    { v: 'nenhum',     label: 'Não recebe',         cor: '#6b7280', icon: '🚫' },
    { v: 'gasolina',   label: 'Aux. Gasolina',       cor: '#f59e0b', icon: '⛽' },
    { v: 'transporte', label: 'Transporte Público',  cor: '#3b82f6', icon: '🚌' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Seletor de modalidade ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)', marginBottom: 8 }}>
          Modalidade de Vale Transporte
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {OPCOES.map(opt => {
            const isActive = mod === opt.v
            const isBlocked = hasActiveData && opt.v !== 'nenhum' && !isActive
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setMod(opt.v)}
                title={isBlocked ? 'Exclua o lançamento atual antes de trocar a modalidade' : undefined}
                style={{
                  padding: '8px 16px', borderRadius: 20, fontSize: 13,
                  fontWeight: isActive ? 700 : 400, cursor: isBlocked ? 'not-allowed' : 'pointer',
                  border: `2px solid ${isActive ? opt.cor : 'var(--border)'}`,
                  background: isActive ? opt.cor + '18' : isBlocked ? 'var(--muted)' : 'transparent',
                  color: isActive ? opt.cor : isBlocked ? 'var(--muted-foreground)' : 'var(--foreground)',
                  opacity: isBlocked ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 150ms',
                }}
              >
                {opt.icon} {opt.label}
                {isActive && mod !== 'nenhum' && (
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: opt.cor, color: '#fff', marginLeft: 2, fontWeight: 700 }}>
                    ATIVO
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Alerta de bloqueio */}
        {hasActiveData && (
          <div style={{
            marginTop: 10, display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 14px', borderRadius: 7,
            border: '1px solid rgba(245,158,11,0.4)',
            background: 'rgba(245,158,11,0.06)',
          }}>
            <span style={{ fontSize: 16 }}>🔒</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>
                Lançamento ativo — para trocar de modalidade, exclua o lançamento atual primeiro.
              </div>
              <div style={{ fontSize: 11, color: '#b45309', marginTop: 1 }}>
                Isso garante que nenhuma informação seja perdida por troca acidental.
              </div>
            </div>
            <button
              type="button"
              onClick={excluirLancamento}
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: '1px solid #ef4444', background: 'rgba(239,68,68,0.07)',
                color: '#dc2626', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              🗑️ Excluir lançamento
            </button>
          </div>
        )}
      </div>

      {/* ── GASOLINA ── */}
      {mod === 'gasolina' && (
        <Sec title="⛽ Auxílio Gasolina">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Valor por dia de trajeto (R$)">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--muted-foreground)' }}>R$</span>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.vt_gasolina_valor_dia}
                  onChange={e => setForm(p => ({ ...p, vt_gasolina_valor_dia: e.target.value }))}
                  placeholder="0,00"
                  style={{ paddingLeft: 28 }}
                />
              </div>
            </Field>
            {form.vt_gasolina_valor_dia && (
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 2 }}>
                <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', fontSize: 12 }}>
                  <span style={{ color: 'var(--muted-foreground)' }}>≈ Mensal (22 dias): </span>
                  <strong style={{ color: '#d97706' }}>
                    R$ {(parseFloat(form.vt_gasolina_valor_dia) * 22).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </div>
              </div>
            )}
          </div>
        </Sec>
      )}

      {/* ── TRANSPORTE PÚBLICO: Cartão ── */}
      {mod === 'transporte' && (
        <Sec title="💳 Cartão de Transporte">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Tipo de cartão *">
              <Select
                value={form.vt_cartao_tipo || undefined}
                onValueChange={v => setForm(p => ({ ...p, vt_cartao_tipo: v }))}
              >
                <SelectTrigger style={{ borderColor: !form.vt_cartao_tipo ? '#f59e0b' : undefined }}>
                  <SelectValue placeholder="Selecione o cartão…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cartao_top">🟡 Cartão TOP (Vale-Transporte)</SelectItem>
                  <SelectItem value="bilhete_unico">🔵 Bilhete Único (SPTrans)</SelectItem>
                  <SelectItem value="sptrans">🟢 Vale-Transporte SPTrans</SelectItem>
                  <SelectItem value="cartao_cidadao">🟣 Cartão Cidadão</SelectItem>
                  <SelectItem value="comum">⚪ Cartão Comum</SelectItem>
                </SelectContent>
              </Select>
              {!form.vt_cartao_tipo && (
                <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 2 }}>⚠️ Obrigatório para transporte público</div>
              )}
            </Field>
            <Field label="Número do cartão">
              <Input
                value={form.vt_cartao_numero}
                onChange={e => setForm(p => ({ ...p, vt_cartao_numero: e.target.value }))}
                placeholder="Ex.: 0000 0000 0000 0000"
                style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
              />
            </Field>
          </div>
        </Sec>
      )}

      {/* ── TRANSPORTE PÚBLICO: Trechos Ida ── */}
      {mod === 'transporte' && (
        <>
          <Sec title="🟢 Trechos — Ida">
            {form.vt_trechos_ida.map((t, i) => (
              <TrechoRow key={i} trecho={t} onChange={nt => updTrecho('ida', i, nt)} onRemove={() => remTrecho('ida', i)} />
            ))}
            <button type="button" onClick={() => addTrecho('ida')}
              style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 600 }}>
              + Adicionar trecho
            </button>
          </Sec>

          <Sec title="🔴 Trechos — Volta">
            {form.vt_trechos_volta.map((t, i) => (
              <TrechoRow key={i} trecho={t} onChange={nt => updTrecho('volta', i, nt)} onRemove={() => remTrecho('volta', i)} />
            ))}
            <button type="button" onClick={() => addTrecho('volta')}
              style={{ fontSize: 12, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 600 }}>
              + Adicionar trecho
            </button>
          </Sec>
        </>
      )}

      {/* ── RESUMO TRANSPORTE ── */}
      {mod === 'transporte' && (form.vt_trechos_ida.length > 0 || form.vt_trechos_volta.length > 0) && (
        <div style={{ borderRadius: 8, border: '1px solid rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.04)', padding: '12px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2563eb', marginBottom: 8 }}>
            💰 Resumo de Valores
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Ida (diário)', val: totalIda },
              { label: 'Volta (diário)', val: totalVolta },
              { label: 'Total diário', val: totalDiario },
            ].map(r => (
              <div key={r.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{r.label}</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>
                  R$ {r.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(59,130,246,0.15)', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Estimativa mensal (22 dias úteis)</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#2563eb' }}>
              R$ {totalMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}

      {/* Vazio */}
      {mod === 'nenhum' && (
        <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--muted-foreground)' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🚫</div>
          <div style={{ fontSize: 13 }}>Colaborador não recebe Vale Transporte</div>
        </div>
      )}

    </div>
  )
}


const TAMANHOS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG']
const NUMEROS_CALCADO = Array.from({ length: 14 }, (_, i) => String(34 + i)) // 34-47

interface EpiColabSectionProps {
  epiList: ColabEpiItem[]
  setEpiList: React.Dispatch<React.SetStateAction<ColabEpiItem[]>>
  funcaoNome?: string
}

function EpiColabSection({ epiList, setEpiList, funcaoNome }: EpiColabSectionProps) {
  const updEpi = <K extends keyof ColabEpiItem>(idx: number, field: K, value: ColabEpiItem[K]) => {
    setEpiList(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  if (!funcaoNome) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted-foreground)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🦺</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Selecione uma função primeiro</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>Os EPIs serão carregados automaticamente.</div>
      </div>
    )
  }

  if (epiList.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted-foreground)' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Nenhum EPI vinculado à função "{funcaoNome}"</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>
          Acesse <strong>EPIs → EPIs por Função</strong> para vincular EPIs a esta função.
        </div>
      </div>
    )
  }

  const semMedidas = epiList.filter(
    e => (e.requer_tamanho && !e.tamanho) || (e.requer_numero && !e.numero)
  ).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            EPIs — <span style={{ color: 'var(--primary)' }}>{funcaoNome}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
            {epiList.length} EPI{epiList.length !== 1 ? 's' : ''}
            {epiList.filter(e => e.requer_tamanho || e.requer_numero).length > 0 &&
              ` · ${epiList.filter(e => e.requer_tamanho || e.requer_numero).length} requerem medidas`}
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
          Para entregar EPIs e anexar comprovantes, use a página de EPIs
        </div>
      </div>

      {/* tabela */}
      <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>EPI</th>
              <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', width: 90 }}>Categ.</th>
              <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', width: 75 }}>Obrig.</th>
              <th style={{ padding: '8px 14px', textAlign: 'center', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', width: 50 }}>Qtd</th>
              <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', width: 130 }}>Tamanho</th>
              <th style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', width: 110 }}>Nº Calçado</th>
            </tr>
          </thead>
          <tbody>
            {epiList.map((epi, idx) => (
              <tr key={epi.epi_id}
                style={{
                  borderBottom: idx < epiList.length - 1 ? '1px solid var(--border)' : 'none',
                  background: epi._foraFuncao ? 'rgba(239,68,68,0.04)' : 'transparent',
                }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 500 }}>{epi.epi_nome}</span>
                    {epi._foraFuncao && (
                      <span style={{
                        fontSize: 10, background: '#fef2f2', color: '#dc2626',
                        border: '1px solid #fecaca', borderRadius: 4, padding: '1px 5px', fontWeight: 600,
                      }}>fora da função</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--muted-foreground)' }}>
                  {epi.epi_categoria ?? '—'}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                  {epi.obrigatorio
                    ? <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#dc2626', fontWeight: 700 }}>Sim</span>
                    : <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'rgba(107,114,128,0.1)', color: 'var(--muted-foreground)', fontWeight: 700 }}>Não</span>}
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>
                  {epi.quantidade}
                </td>
                <td style={{ padding: '6px 14px' }}>
                  {epi.requer_tamanho ? (
                    <select
                      value={epi.tamanho}
                      onChange={e => updEpi(idx, 'tamanho', e.target.value)}
                      style={{
                        width: '100%', padding: '5px 8px', borderRadius: 6,
                        border: `1px solid ${epi.tamanho ? 'var(--primary)' : '#f59e0b'}`,
                        background: 'var(--background)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      <option value="">Sel…</option>
                      {TAMANHOS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>—</span>}
                </td>
                <td style={{ padding: '6px 14px' }}>
                  {epi.requer_numero ? (
                    <select
                      value={epi.numero}
                      onChange={e => updEpi(idx, 'numero', e.target.value)}
                      style={{
                        width: '100%', padding: '5px 8px', borderRadius: 6,
                        border: `1px solid ${epi.numero ? 'var(--primary)' : '#f59e0b'}`,
                        background: 'var(--background)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      <option value="">Nº…</option>
                      {NUMEROS_CALCADO.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  ) : <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* aviso medidas */}
      {semMedidas > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ fontSize: 12, color: '#92400e' }}>
            {semMedidas} EPI{semMedidas > 1 ? 's' : ''} com tamanho/número não informados
          </span>
        </div>
      )}

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
  onDataAdmissao: (data: string) => void
  onGotoFuncoes: () => void
  temPontoLancado?: boolean
}

function FuncaoSection({
  form, funcoes, obras, editId, funcaoOriginal, chapaOriginal,
  gerando, trocandoFuncao, motivoTroca, setMotivoTroca,
  onFuncaoChange, onSet, onDataAdmissao, onGotoFuncoes, temPontoLancado,
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

      {/* ── TRAVA: TEM PONTO LANÇADO ─────────────────────────────────── */}
      {temPontoLancado && (
        <div style={{ borderRadius: 8, border: '2px solid #b45309', background: 'rgba(180,83,9,0.07)', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>🔒</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#92400e', marginBottom: 4 }}>
              Função e Tipo de Contrato bloqueados
            </div>
            <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
              Este colaborador possui <strong>pontos lançados</strong>. Alterar a função ou o tipo de contrato
              comprometeria o cálculo de valores já registrados.<br />
              Para alterar, <strong>exclua todos os lançamentos de ponto</strong> do colaborador primeiro.
            </div>
          </div>
        </div>
      )}

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
            {!editId ? (
              /* novo colaborador: função já definida na etapa 1 */
              <div style={{ background: 'var(--muted)', borderRadius: 6, padding: '8px 12px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🏷️</span>
                {(() => { const fn = funcoes.find(f => f.id === form.funcao_id); return fn ? `[${fn.sigla}] ${fn.nome}` : form.funcao_id })()}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 400 }}>definido na etapa anterior</span>
              </div>
            ) : (
              <>
                <Select
                  value={form.funcao_id || undefined}
                  onValueChange={temPontoLancado ? undefined : onFuncaoChange}
                  disabled={!!temPontoLancado}
                >
                  <SelectTrigger style={temPontoLancado ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
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
              </>
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
                  tiposContratoAtivos.find(t => t.value === form.tipo_contrato)
                    ? (form.tipo_contrato || undefined)
                    : tiposContratoAtivos[0].value
                }
                onValueChange={temPontoLancado ? undefined : v => onSet('tipo_contrato', v)}
                disabled={!!temPontoLancado}
              >
                <SelectTrigger style={temPontoLancado ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}><SelectValue /></SelectTrigger>
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
            {!editId ? (
              <div style={{ background: 'var(--muted)', borderRadius: 6, padding: '8px 12px', fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📅</span>
                {form.data_admissao ? new Date(form.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 400 }}>definido na etapa anterior</span>
              </div>
            ) : (
              <Input
                type="date"
                value={form.data_admissao}
                onChange={e => onDataAdmissao(e.target.value)}
              />
            )}
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
