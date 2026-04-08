import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { Colaborador, Funcao, Obra } from '@/lib/supabase'
import { formatCPF, formatDate, formatCurrency, cn } from '@/lib/utils'
import { maskCPF, maskRG, maskPIS, maskCEP, maskTelefone, maskCTPS, maskCTPSSerie, maskAgencia, maskConta } from '@/lib/masks'
import { fetchEmpresaData, CABECALHO_CSS, gerarCabecalhoHTML } from '@/lib/relatorioHeader'
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
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Users, Plus, Search, Pencil, Trash2, HardHat, History,
  Briefcase, Tag, Clock, AlertTriangle, CheckCircle2,
  ShieldAlert, Loader2, XCircle, Printer,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
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
  salario: string;
  status: string; data_status: string; observacoes: string
  // ── Campos da Ficha de Registro (contabilidade) ──────────────────────────
  nome_pai: string; nome_mae: string
  cor_raca: string
  deficiencia: boolean; tipo_deficiencia: string
  doc_militar: string
  matricula_esocial: string
  tipo_desligamento: string; data_aviso_previo: string
}

const EMPTY: FormData = {
  nome: '', chapa: '', cpf: '', rg: '', pis_nit: '', data_nascimento: '',
  genero: '', estado_civil: '', telefone: '', email: '', endereco: '',
  cidade: '', estado: '', cep: '', funcao_id: '', obra_id: '',
  salario: '',
  tipo_contrato: 'clt', data_admissao: '', ctps_numero: '', ctps_serie: '', data_exame_admissional: '',
  banco: '', agencia: '', conta: '', tipo_conta: '',
  pix_tipo: '', pix_chave: '',
  vt_modalidade: 'nenhum', vt_gasolina_valor_dia: '',
  vt_cartao_tipo: '', vt_cartao_numero: '',
  vt_trechos_ida: [], vt_trechos_volta: [],
  data_status: '',
  status: 'ativo', observacoes: '',
  nome_pai: '', nome_mae: '',
  cor_raca: '', deficiencia: false, tipo_deficiencia: '',
  doc_militar: '', matricula_esocial: '',
  tipo_desligamento: '', data_aviso_previo: '',
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
    <div className="page-root">
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
// ─── helper: gera e imprime o PDF via window.print() ────────────────────────
async function gerarPDF(r: any, funcoes: Funcao[], obras: Obra[]) {
  const emp = await fetchEmpresaData()
  const d = r.dados ?? {}
  const fn  = funcoes.find(f => f.id === d.funcao_id)?.nome ?? '—'
  const ob  = obras.find(o => o.id === r.obra_id)?.nome ?? '—'
  const fmt = (v: string | null | undefined) => v || '—'
  const fmtDate = (v: string | null | undefined) => {
    if (!v) return '—'
    try { return new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') } catch { return v }
  }

  const vtLabel: Record<string,string> = { nenhum: 'Não recebe', gasolina: 'Aux. Gasolina', transporte: 'Transporte Público' }
  const contr: Record<string,string>   = { clt: 'CLT', autonomo: 'Autônomo / PJ', estagio: 'Estágio' }
  const sexo: Record<string,string>    = { M: 'Masculino', F: 'Feminino' }
  const civil: Record<string,string>   = { solteiro:'Solteiro(a)', casado:'Casado(a)', divorciado:'Divorciado(a)', viuvo:'Viúvo(a)', uniao_estavel:'União Estável' }
  const tconta: Record<string,string>  = { corrente:'Corrente', poupanca:'Poupança', salario:'Conta Salário' }
  const pix: Record<string,string>     = { cpf:'CPF', telefone:'Telefone', email:'E-mail', chave_aleatoria:'Chave Aleatória' }

  const row2 = (a: string, av: string, b: string, bv: string) =>
    `<tr><td class="lb">${a}</td><td>${av}</td><td class="lb">${b}</td><td>${bv}</td></tr>`
  const row1 = (a: string, av: string) =>
    `<tr><td class="lb">${a}</td><td colspan="3">${av}</td></tr>`

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Ficha de Cadastro — ${d.nome ?? ''}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px 28px}
  ${CABECALHO_CSS}
  .sec{margin-bottom:12px}
  .sec-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;
    color:#fff;background:#1e3a5f;padding:4px 8px;border-radius:3px 3px 0 0}
  table{width:100%;border-collapse:collapse}
  td{border:1px solid #d1d5db;padding:5px 8px;vertical-align:top;min-width:80px}
  td.lb{font-weight:700;color:#374151;background:#f9fafb;width:22%;white-space:nowrap}
  .assinatura{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:32px}
  .assinatura div{border-top:1px solid #374151;padding-top:4px;text-align:center;font-size:10px;color:#555}
  .rodape{margin-top:18px;font-size:9px;color:#9ca3af;text-align:right}
  @media print{body{padding:10px 14px}}
</style></head><body>

${gerarCabecalhoHTML(emp, {
  titulo: 'Ficha de Cadastro de Colaborador',
  subtitulo: `Obra: ${ob} · Status: ${r.status?.toUpperCase() ?? '—'}`,
  periodo: `Solicitado em ${new Date(r.criado_em).toLocaleString('pt-BR')}`,
})}

<div class="sec">
  <div class="sec-title">Identificação</div>
  <table>
    ${row1('Nome Completo', `<strong>${fmt(d.nome)}</strong>`)}
    ${row2('CPF', fmt(d.cpf), 'RG', fmt(d.rg))}
    ${row2('PIS / NIT', fmt(d.pis_nit), 'Data de Nascimento', fmtDate(d.data_nascimento))}
    ${row2('Sexo', sexo[d.genero ?? ''] ?? fmt(d.genero), 'Estado Civil', civil[d.estado_civil ?? ''] ?? fmt(d.estado_civil))}
    ${row2('Telefone', fmt(d.telefone), 'E-mail', fmt(d.email))}
    ${row2('CTPS Nº', fmt(d.ctps_numero), 'Série CTPS', fmt(d.ctps_serie))}
  </table>
</div>

<div class="sec">
  <div class="sec-title">Endereço</div>
  <table>
    ${row1('Endereço', fmt(d.endereco))}
    ${row2('Cidade', fmt(d.cidade), 'UF', fmt(d.estado))}
    ${row1('CEP', fmt(d.cep))}
  </table>
</div>

<div class="sec">
  <div class="sec-title">Contrato</div>
  <table>
    ${row2('Função', fn, 'Tipo de Contrato', contr[d.tipo_contrato ?? ''] ?? fmt(d.tipo_contrato))}
    ${row2('Data de Admissão', fmtDate(d.data_admissao), 'Obra', ob)}
  </table>
</div>

<div class="sec">
  <div class="sec-title">Dados Bancários</div>
  <table>
    ${row2('Banco', fmt(d.banco), 'Tipo de Conta', tconta[d.tipo_conta ?? ''] ?? fmt(d.tipo_conta))}
    ${row2('Agência', fmt(d.agencia), 'Conta', fmt(d.conta))}
    ${row2('Tipo de PIX', pix[d.pix_tipo ?? ''] ?? fmt(d.pix_tipo), 'Chave PIX', fmt(d.pix_chave))}
  </table>
</div>

<div class="sec">
  <div class="sec-title">Vale Transporte</div>
  <table>
    ${row1('Modalidade', vtLabel[d.vt_modalidade ?? 'nenhum'] ?? fmt(d.vt_modalidade))}
    ${d.vt_modalidade === 'gasolina' ? row1('Valor diário', d.vt_gasolina_valor_dia ? `R$ ${parseFloat(d.vt_gasolina_valor_dia).toFixed(2)}` : '—') : ''}
    ${d.vt_modalidade === 'transporte' ? row2('Empresa Cartão', fmt(d.vt_cartao_tipo), 'Nº Cartão', fmt(d.vt_cartao_numero)) : ''}
    ${d.vt_modalidade === 'transporte' ? row1('Trechos de Ida', fmt(d.vt_trecho_ida)) : ''}
    ${d.vt_modalidade === 'transporte' ? row1('Trechos de Volta', fmt(d.vt_trecho_volta)) : ''}
  </table>
</div>

${d.observacoes ? `<div class="sec"><div class="sec-title">Observações</div><table>${row1('Obs.', fmt(d.observacoes))}</table></div>` : ''}

<div class="assinatura">
  <div>Colaborador / Assinatura</div>
  <div>Responsável RH / Carimbo</div>
</div>

<div class="rodape">Gerado automaticamente pelo sistema ConstrutorRH em ${new Date().toLocaleString('pt-BR')}</div>

<script>window.onload=()=>{window.print()}<\/script>
</body></html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (win) { win.document.write(html); win.document.close() }
}

// ─── COMPONENTE PRINCIPAL da aba ─────────────────────────────────────────────
function SolicitacoesPortalTab({ obras, funcoes }: { obras: Obra[]; funcoes: Funcao[] }) {
  const [rows, setRows]           = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<'pendente'|'aprovado'|'recusado'|'todos'>('pendente')
  const [recusaId, setRecusaId]   = useState<string | null>(null)
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [modalVer, setModalVer]   = useState<any | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const q = supabase.from('portal_solicitacoes')
      .select('*').eq('tipo', 'novo_colaborador')
      .order('criado_em', { ascending: false })
    if (filtroStatus !== 'todos') q.eq('status', filtroStatus)
    const { data } = await q
    setRows(data ?? [])
    setLoading(false)
  }, [filtroStatus])

  useEffect(() => { fetch() }, [fetch])

  async function marcarAprovado(id: string) {
    await supabase.from('portal_solicitacoes').update({ status: 'aprovado' }).eq('id', id)
    toast.success('Solicitação marcada como aprovada')
    fetch()
  }

  async function recusar() {
    if (!recusaId) return
    await supabase.from('portal_solicitacoes').update({
      status: 'recusado',
      observacoes_admin: motivoRecusa || 'Recusado pelo administrador',
    }).eq('id', recusaId)
    toast.success('Solicitação recusada')
    setRecusaId(null); setMotivoRecusa(''); fetch()
  }

  const statusBadge = (s: string) => {
    if (s === 'aprovado') return { bg: '#dcfce7', cor: '#15803d', label: '✓ Aprovado' }
    if (s === 'recusado') return { bg: '#fee2e2', cor: '#dc2626', label: '✗ Recusado' }
    return                       { bg: '#fef3c7', cor: '#b45309', label: '⏳ Pendente' }
  }

  return (
    <div className="page-root">
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:16 }}>📥 Solicitações de Cadastro</div>
          <div style={{ fontSize:12, color:'var(--muted-foreground)' }}>Enviadas pelos encarregados via Portal · Cadastre manualmente no sistema</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {(['pendente','aprovado','recusado','todos'] as const).map(s => (
            <button key={s} onClick={() => setFiltroStatus(s)} style={{
              height:32, padding:'0 12px', border:`1px solid ${filtroStatus===s?'var(--primary)':'var(--border)'}`,
              borderRadius:7, background:filtroStatus===s?'var(--primary)':'var(--card)', cursor:'pointer',
              fontWeight:600, fontSize:12, color:filtroStatus===s?'#fff':'var(--foreground)',
            }}>
              {s==='pendente'?'⏳ Pendentes':s==='aprovado'?'✓ Aprovadas':s==='recusado'?'✗ Recusadas':'Todas'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--muted-foreground)' }}>Carregando…</div>
      ) : rows.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12,
          padding:48, textAlign:'center', color:'var(--muted-foreground)' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
          Nenhuma solicitação {filtroStatus !== 'todos' ? `"${filtroStatus}"` : ''}
        </div>
      ) : (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          {rows.map((r, i) => {
            const d = r.dados ?? {}
            const badge = statusBadge(r.status)
            const fn = funcoes.find(f => f.id === d.funcao_id)
            const ob = obras.find(o => o.id === r.obra_id)
            return (
              <div key={r.id} style={{ padding:'14px 18px',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                display:'flex', gap:14, alignItems:'center' }}>
                {/* Avatar */}
                <div style={{ width:40, height:40, borderRadius:'50%',
                  background:'linear-gradient(135deg,#1e3a5f,#2d6a4f)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color:'#fff', fontWeight:800, fontSize:14, flexShrink:0 }}>
                  {(d.nome ?? '?').slice(0,2).toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{d.nome ?? '—'}</div>
                  <div style={{ fontSize:11, color:'var(--muted-foreground)', marginTop:2, display:'flex', gap:8, flexWrap:'wrap' }}>
                    {d.cpf && <span>CPF: {d.cpf}</span>}
                    {fn && <span>🏷️ {fn.nome}</span>}
                    {ob && <span>🏗️ {ob.nome}</span>}
                    {d.tipo_contrato && <span style={{ textTransform:'uppercase' }}>📋 {d.tipo_contrato}</span>}
                    {d.data_admissao && <span>📅 {new Date(d.data_admissao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted-foreground)', marginTop:3 }}>
                    Enviado {new Date(r.criado_em).toLocaleString('pt-BR')}
                    {r.observacoes_admin && (
                      <span style={{ marginLeft:8, background:'#fee2e2', color:'#dc2626', borderRadius:4, padding:'1px 5px' }}>
                        {r.observacoes_admin}
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <span style={{ background:badge.bg, color:badge.cor, borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:700 }}>
                    {badge.label}
                  </span>
                  {/* Visualizar + PDF */}
                  <Button size="sm" variant="outline" onClick={() => setModalVer(r)}
                    style={{ height:30, fontSize:12, gap:4 }}>
                    👁 Ver
                  </Button>
                  <Button size="sm" onClick={() => gerarPDF(r, funcoes, obras)}
                    style={{ height:30, fontSize:12, background:'#1e3a5f', color:'#fff', gap:4 }}>
                    🖨️ PDF
                  </Button>
                  {r.status === 'pendente' && (<>
                    <Button size="sm" onClick={() => marcarAprovado(r.id)}
                      style={{ height:30, fontSize:12, background:'#15803d', color:'#fff' }}>
                      ✓ OK
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setRecusaId(r.id); setMotivoRecusa('') }}
                      style={{ height:30, fontSize:12, borderColor:'#dc2626', color:'#dc2626' }}>
                      ✗
                    </Button>
                  </>)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal Visualizar ── */}
      {modalVer && (() => {
        const d = modalVer.dados ?? {}
        const fn = funcoes.find(f => f.id === d.funcao_id)
        const ob = obras.find(o => o.id === modalVer.obra_id)
        const badge = statusBadge(modalVer.status)
        const fmtDate = (v: string) => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
        const fmt = (v: any) => v || '—'
        const sexo: Record<string,string> = { M:'Masculino', F:'Feminino' }
        const civil: Record<string,string> = { solteiro:'Solteiro(a)', casado:'Casado(a)', divorciado:'Divorciado(a)', viuvo:'Viúvo(a)', uniao_estavel:'União Estável' }
        const vtLabel: Record<string,string> = { nenhum:'Não recebe', gasolina:'Aux. Gasolina', transporte:'Transporte Público' }
        const contr: Record<string,string> = { clt:'CLT', autonomo:'Autônomo / PJ', estagio:'Estágio' }
        const tconta: Record<string,string> = { corrente:'Corrente', poupanca:'Poupança', salario:'Conta Salário' }

        const SV = ({ t, children }: { t: string; children: React.ReactNode }) => (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'.07em',
              color:'#fff', background:'#1e3a5f', padding:'3px 8px', borderRadius:'3px 3px 0 0' }}>{t}</div>
            <div style={{ border:'1px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 5px 5px', overflow:'hidden' }}>
              {children}
            </div>
          </div>
        )
        const Row = ({ a, av, b, bv }: { a:string; av:string; b?:string; bv?:string }) => (
          <div style={{ display:'grid', gridTemplateColumns: b ? '1fr 1fr' : '1fr', borderBottom:'1px solid #e5e7eb' }}>
            <div style={{ display:'flex' }}>
              <span style={{ width:130, padding:'6px 8px', background:'#f9fafb', fontSize:11, fontWeight:700, color:'#374151', flexShrink:0 }}>{a}</span>
              <span style={{ padding:'6px 8px', fontSize:12 }}>{av}</span>
            </div>
            {b && (
              <div style={{ display:'flex', borderLeft:'1px solid #e5e7eb' }}>
                <span style={{ width:130, padding:'6px 8px', background:'#f9fafb', fontSize:11, fontWeight:700, color:'#374151', flexShrink:0 }}>{b}</span>
                <span style={{ padding:'6px 8px', fontSize:12 }}>{bv}</span>
              </div>
            )}
          </div>
        )

        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:300,
            display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'var(--background)', borderRadius:14, width:'100%', maxWidth:720,
              maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden',
              boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
              {/* Header */}
              <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid var(--border)',
                display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:16 }}>👷 {d.nome ?? '—'}</div>
                  <div style={{ fontSize:12, color:'var(--muted-foreground)', marginTop:2, display:'flex', gap:8 }}>
                    {ob && <span>🏗️ {ob.nome}</span>}
                    <span style={{ background:badge.bg, color:badge.cor, borderRadius:5, padding:'1px 7px', fontWeight:700, fontSize:11 }}>{badge.label}</span>
                    <span style={{ color:'var(--muted-foreground)' }}>Enviado {new Date(modalVer.criado_em).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <Button size="sm" onClick={() => gerarPDF(modalVer, funcoes, obras)}
                    style={{ background:'#1e3a5f', color:'#fff', height:32, fontSize:12 }}>
                    🖨️ Imprimir / PDF
                  </Button>
                  <button onClick={() => setModalVer(null)}
                    style={{ border:'none', background:'none', cursor:'pointer', fontSize:18, color:'var(--muted-foreground)', padding:'0 4px' }}>✕</button>
                </div>
              </div>

              {/* Corpo scrollável */}
              <div style={{ overflowY:'auto', flex:1, padding:'16px 20px' }}>
                <SV t="Identificação">
                  <Row a="Nome" av={fmt(d.nome)} />
                  <Row a="CPF" av={fmt(d.cpf)} b="RG" bv={fmt(d.rg)} />
                  <Row a="PIS / NIT" av={fmt(d.pis_nit)} b="Nascimento" bv={fmtDate(d.data_nascimento)} />
                  <Row a="Sexo" av={sexo[d.genero ?? ''] ?? fmt(d.genero)} b="Estado Civil" bv={civil[d.estado_civil ?? ''] ?? fmt(d.estado_civil)} />
                  <Row a="Telefone" av={fmt(d.telefone)} b="E-mail" bv={fmt(d.email)} />
                  <Row a="CTPS Nº" av={fmt(d.ctps_numero)} b="Série" bv={fmt(d.ctps_serie)} />
                </SV>

                <SV t="Endereço">
                  <Row a="Endereço" av={fmt(d.endereco)} />
                  <Row a="Cidade" av={fmt(d.cidade)} b="UF" bv={fmt(d.estado)} />
                  <Row a="CEP" av={fmt(d.cep)} />
                </SV>

                <SV t="Contrato">
                  <Row a="Função" av={fn?.nome ?? '—'} b="Tipo" bv={contr[d.tipo_contrato ?? ''] ?? fmt(d.tipo_contrato)} />
                  <Row a="Data de Admissão" av={fmtDate(d.data_admissao)} b="Obra" bv={ob?.nome ?? '—'} />
                </SV>

                <SV t="Dados Bancários">
                  <Row a="Banco" av={fmt(d.banco)} b="Tipo de Conta" bv={tconta[d.tipo_conta ?? ''] ?? fmt(d.tipo_conta)} />
                  <Row a="Agência" av={fmt(d.agencia)} b="Conta" bv={fmt(d.conta)} />
                  <Row a="Tipo PIX" av={fmt(d.pix_tipo)} b="Chave PIX" bv={fmt(d.pix_chave)} />
                </SV>

                <SV t="Vale Transporte">
                  <Row a="Modalidade" av={vtLabel[d.vt_modalidade ?? 'nenhum'] ?? fmt(d.vt_modalidade)} />
                  {d.vt_modalidade === 'gasolina' && (
                    <Row a="Valor diário" av={d.vt_gasolina_valor_dia ? `R$ ${parseFloat(d.vt_gasolina_valor_dia).toFixed(2)}` : '—'} />
                  )}
                  {d.vt_modalidade === 'transporte' && (<>
                    <Row a="Empresa Cartão" av={fmt(d.vt_cartao_tipo)} b="Nº Cartão" bv={fmt(d.vt_cartao_numero)} />
                    <Row a="Trechos de Ida" av={fmt(d.vt_trecho_ida)} />
                    <Row a="Trechos de Volta" av={fmt(d.vt_trecho_volta)} />
                  </>)}
                </SV>

                {d.observacoes && (
                  <SV t="Observações">
                    <Row a="Obs." av={d.observacoes} />
                  </SV>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)',
                display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                <div style={{ fontSize:11, color:'var(--muted-foreground)' }}>
                  ℹ️ Cadastre manualmente no sistema após conferir os dados
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  {modalVer.status === 'pendente' && (
                    <Button size="sm" onClick={() => { marcarAprovado(modalVer.id); setModalVer(null) }}
                      style={{ height:32, fontSize:12, background:'#15803d', color:'#fff' }}>
                      ✓ Marcar como Aprovado
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setModalVer(null)} style={{ height:32, fontSize:12 }}>Fechar</Button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Modal Recusa ── */}
      {recusaId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:300,
          display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:14, width:'100%', maxWidth:400,
            padding:22, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:12 }}>✗ Recusar Solicitação</div>
            <label style={{ fontSize:12, fontWeight:700, display:'block', marginBottom:6, color:'var(--muted-foreground)' }}>
              Motivo (opcional)
            </label>
            <textarea value={motivoRecusa} onChange={e => setMotivoRecusa(e.target.value)} rows={3}
              placeholder="Explique o motivo da recusa…"
              style={{ width:'100%', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px',
                fontSize:13, boxSizing:'border-box', background:'var(--input)', color:'var(--foreground)', marginBottom:14 }} />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <Button variant="outline" onClick={() => setRecusaId(null)}>Cancelar</Button>
              <Button onClick={recusar} style={{ background:'#dc2626', color:'#fff' }}>✗ Confirmar Recusa</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function Colaboradores() {
  const { user } = useAuth()
  const [pageTab, setPageTab] = useState<'colaboradores' | 'funcoes'>('colaboradores')

  const [rows, setRows]     = useState<ColaboradorRow[]>([])
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const [obras, setObras]   = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filterStatus, setFilterStatus] = useState('ativo')
  const [filterFuncao, setFilterFuncao] = useState('todas')
  const [filterContrato, setFilterContrato] = useState('todos')

  // ── Crachás em lote ──────────────────────────────────────────────────────
  const [modalLote, setModalLote] = useState(false)
  const [loteObra, setLoteObra]   = useState('todas')

  // Contadores
  const totalAtivos    = rows.filter(r => r.status === 'ativo').length
  const totalCLT       = rows.filter(r => r.status === 'ativo' && (r.tipo_contrato ?? '').toLowerCase() === 'clt').length
  const totalAutonomo  = rows.filter(r => r.status === 'ativo' && (r.tipo_contrato ?? '').toLowerCase() !== 'clt').length
  const totalInativos  = rows.filter(r => r.status === 'inativo').length

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId]       = useState<string | null>(null)
  const [form, setForm]           = useState<FormData>(EMPTY)
  const [section, setSection]     = useState<'status' | 'pessoal' | 'funcao' | 'bancario' | 'vt' | 'epis' | 'docs'>('status')
  // ── Modo edição inline no painel direito ─────────────────────────────────
  const [inlineEditing, setInlineEditing] = useState(false)

  // ── modal pré-cadastro (etapa 1) ─────────────────────────────────────────
  const [preModal, setPreModal]           = useState(false)
  const [preFuncaoId, setPreFuncaoId]     = useState('')
  const [preAdmissao, setPreAdmissao]     = useState('')
  const [preLoading, setPreLoading]       = useState(false)
  const [epiList, setEpiList]         = useState<ColabEpiItem[]>([])
  // documentos do colaborador
  const [colabDocs, setColabDocs]     = useState<Array<{id:string;titulo:string;tipo:string;descricao:string|null;arquivo_url:string|null;visivel_colaborador:boolean;criado_em:string}>>([]);
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [savingDoc, setSavingDoc]     = useState(false)
  const [novoDoc, setNovoDoc]         = useState<{titulo:string;tipo:string;descricao:string;arquivo_url:string;visivel_colaborador:boolean}>({titulo:'',tipo:'contrato_trabalho',descricao:'',arquivo_url:'',visivel_colaborador:false})
  const [showNovoDoc, setShowNovoDoc] = useState(false)
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

  // histórico de contratos (por colaborador em edição)
  const [historicoContratos, setHistoricoContratos] = useState<HistoricoContrato[]>([])

  // histórico chapa
  const [histModal, setHistModal]     = useState(false)
  const [histColabId, setHistColabId] = useState<string | null>(null)
  const [histRows, setHistRows]       = useState<HistoricoChapa[]>([])
  const [histLoading, setHistLoading] = useState(false)

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null)
  // ficha lateral (painel direito estilo Ponto)
  const [colabFicha, setColabFicha] = useState<ColaboradorRow | null>(null)
  const [gerandoPDF, setGerandoPDF] = useState(false)
  // foto de perfil
  const [fotoUrl, setFotoUrl]         = useState<string>('')
  const [uploadingFoto, setUploadingFoto] = useState(false)
  const fotoInputRef = useRef<HTMLInputElement>(null)

  async function uploadFoto(file: File): Promise<string | null> {
    if (file.size > 5 * 1024 * 1024) { toast.error('Foto muito grande — máx. 5 MB'); return null }
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem (JPG, PNG, WebP)'); return null }
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `fotos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('ocorrencias-documentos').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { toast.error('Erro no upload da foto: ' + error.message); return null }
    const { data } = supabase.storage.from('ocorrencias-documentos').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingFoto(true)
    const url = await uploadFoto(file)
    setUploadingFoto(false)
    if (fotoInputRef.current) fotoInputRef.current.value = ''
    if (url) setFotoUrl(url)
  }

  // Salva foto diretamente no banco para o colaborador selecionado
  async function salvarFotoColab(colabId: string, url: string) {
    const { error } = await supabase.from('colaboradores').update({ foto_url: url }).eq('id', colabId)
    if (error) { toast.error('Erro ao salvar foto'); return }
    toast.success('Foto salva!')
    fetchData()
    setColabFicha(prev => prev ? { ...prev, foto_url: url } as any : prev)
  }

  // ── Gera PDF da Ficha de Registro do colaborador selecionado ──────────────
  async function gerarFichaRegistroPDF(c: ColaboradorRow) {
    setGerandoPDF(true)
    try {
      const emp = await fetchEmpresaData()
      const fn  = (c.funcoes as any)?.nome ?? '—'
      const ob  = (c.obras  as any)?.nome  ?? '—'
      const fmt = (v: any) => v || '—'
      const fmtDate = (v: string | null | undefined) => {
        if (!v) return '—'
        try { return new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') } catch { return v }
      }
      const contr: Record<string,string> = { clt:'CLT', autonomo:'Autônomo', pj:'PJ', temporario:'Temporário', aprendiz:'Menor Aprendiz', estagiario:'Estagiário' }
      const civil: Record<string,string> = { solteiro:'Solteiro(a)', casado:'Casado(a)', divorciado:'Divorciado(a)', viuvo:'Viúvo(a)', uniao_estavel:'União Estável' }
      const genero: Record<string,string> = { masculino:'Masculino', feminino:'Feminino', outro:'Outro' }
      const tconta: Record<string,string> = { corrente:'Corrente', poupanca:'Poupança', salario:'Conta Salário' }
      const pixTipo: Record<string,string> = { cpf:'CPF', telefone:'Telefone', email:'E-mail', chave_aleatoria:'Chave Aleatória' }
      const corRacaPDF: Record<string,string> = { branca:'Branca', preta:'Preta', parda:'Parda', amarela:'Amarela', indigena:'Indígena', nao_declarada:'Não declarada' }

      const row2 = (a: string, av: string, b: string, bv: string) =>
        `<tr><td class="lb">${a}</td><td>${av}</td><td class="lb">${b}</td><td>${bv}</td></tr>`
      const row1 = (a: string, av: string) =>
        `<tr><td class="lb">${a}</td><td colspan="3">${av}</td></tr>`

      const vtDados = (c.vt_dados ?? {}) as any
      const vtModalidade = vtDados.modalidade ?? (c.vale_transporte ? 'transporte' : 'nenhum')
      const vtLabel: Record<string,string> = { nenhum:'Não recebe', gasolina:'Aux. Gasolina', transporte:'Transporte Público' }

      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Ficha de Registro — ${c.nome}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px 28px}
  ${CABECALHO_CSS}
  .sec{margin-bottom:10px}
  .sec-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;
    color:#fff;background:#1e3a5f;padding:4px 8px;border-radius:3px 3px 0 0}
  table{width:100%;border-collapse:collapse}
  td{border:1px solid #d1d5db;padding:5px 8px;vertical-align:top;min-width:80px;font-size:11px}
  td.lb{font-weight:700;color:#374151;background:#f9fafb;width:22%;white-space:nowrap}
  .assinatura{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
  .assinatura div{border-top:1.5px solid #374151;padding-top:5px;text-align:center;font-size:10px;color:#555}
  .rodape{margin-top:16px;font-size:9px;color:#9ca3af;text-align:right}
  @media print{body{padding:10px 14px}}
</style></head><body>
${gerarCabecalhoHTML(emp, {
  titulo: 'Ficha de Registro de Colaborador',
  subtitulo: `Chapa: ${c.chapa ?? '—'} · Status: ${c.status?.toUpperCase() ?? '—'}`,
  periodo: `Emitida em ${new Date().toLocaleDateString('pt-BR')}`,
})}

${(c as any).foto_url ? `
<div style="display:flex;justify-content:flex-end;margin-bottom:10px">
  <div style="text-align:center">
    <img src="${(c as any).foto_url}" alt="Foto" style="width:80px;height:100px;object-fit:cover;border:2px solid #d1d5db;border-radius:4px;display:block"/>
    <div style="font-size:9px;color:#6b7280;margin-top:3px">Foto do colaborador</div>
  </div>
</div>` : ''}

<div class="sec">
  <div class="sec-title">Identificação</div>
  <table>
    ${row1('Nome Completo', `<strong>${fmt(c.nome)}</strong>`)}
    ${row2('CPF', fmt(c.cpf), 'RG', fmt(c.rg))}
    ${row2('PIS / NIT', fmt(c.pis_nit), 'Matrícula eSocial', fmt((c as any).matricula_esocial))}
    ${row2('Data de Nascimento', fmtDate(c.data_nascimento), 'Doc. Militar', fmt((c as any).doc_militar))}
    ${row2('Gênero', genero[c.genero ?? ''] ?? fmt(c.genero), 'Estado Civil', civil[c.estado_civil ?? ''] ?? fmt(c.estado_civil))}
    ${row2('Cor / Raça', corRacaPDF[(c as any).cor_raca ?? ''] ?? fmt((c as any).cor_raca), 'Deficiência', (c as any).deficiencia ? ((c as any).tipo_deficiencia || 'Sim') : 'Não')}
    ${row2('Nome do Pai', fmt((c as any).nome_pai), 'Nome da Mãe', fmt((c as any).nome_mae))}
    ${row2('Telefone', fmt(c.telefone), 'E-mail', fmt(c.email))}
    ${row2('CTPS Nº', fmt(c.ctps_numero), 'Série CTPS', fmt(c.ctps_serie))}
  </table>
</div>
<div class="sec">
  <div class="sec-title">Endereço</div>
  <table>
    ${row1('Endereço', fmt(c.endereco))}
    ${row2('Cidade', fmt(c.cidade), 'UF', fmt(c.estado))}
    ${row1('CEP', fmt(c.cep))}
  </table>
</div>
<div class="sec">
  <div class="sec-title">Contrato & Obra</div>
  <table>
    ${row2('Função', fn, 'Tipo de Contrato', contr[c.tipo_contrato ?? ''] ?? fmt(c.tipo_contrato))}
    ${row2('Data de Admissão', fmtDate(c.data_admissao), 'Obra', ob)}
    ${row2('Salário Base', c.salario ? `R$ ${Number(c.salario).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '—', 'Chapa', fmt(c.chapa))}
  </table>
</div>
<div class="sec">
  <div class="sec-title">Dados Bancários</div>
  <table>
    ${row2('Banco', fmt(c.banco), 'Tipo de Conta', tconta[c.tipo_conta ?? ''] ?? fmt(c.tipo_conta))}
    ${row2('Agência', fmt(c.agencia), 'Conta', fmt(c.conta))}
    ${row2('Tipo de PIX', pixTipo[c.pix_tipo ?? ''] ?? fmt(c.pix_tipo), 'Chave PIX', fmt(c.pix_chave))}
  </table>
</div>
<div class="sec">
  <div class="sec-title">Vale Transporte</div>
  <table>
    ${row1('Modalidade', vtLabel[vtModalidade] ?? fmt(vtModalidade))}
    ${vtModalidade === 'gasolina' ? row1('Valor diário', vtDados.gasolina_valor_dia ? `R$ ${parseFloat(vtDados.gasolina_valor_dia).toFixed(2)}` : '—') : ''}
    ${vtModalidade === 'transporte' ? row2('Empresa/Cartão', fmt(vtDados.cartao_tipo), 'Nº Cartão', fmt(vtDados.cartao_numero)) : ''}
  </table>
</div>
${c.observacoes ? `<div class="sec"><div class="sec-title">Observações</div><table>${row1('Obs.', fmt(c.observacoes))}</table></div>` : ''}
<div class="assinatura">
  <div>Assinatura do Colaborador</div>
  <div>Responsável RH / Carimbo</div>
</div>
<div class="rodape">Gerado pelo ConstrutorRH em ${new Date().toLocaleString('pt-BR')}</div>
<script>window.onload=()=>{window.print()}<\/script>
</body></html>`

      const win = window.open('', '_blank', 'width=960,height=720')
      if (win) { win.document.write(html); win.document.close() }
      else toast.error('Bloqueio de pop-up detectado. Permita pop-ups para este site.')
    } finally {
      setGerandoPDF(false)
    }
  }

  // ── helpers compartilhados de crachá ─────────────────────────────────────
  const CRACHA_AZUL   = '#1e3a5f'
  const CRACHA_AZULCL = '#2563eb'

  /** CSS e estrutura HTML idênticos para crachá singular e em lote */
  function crachaCSS(azul: string, azulCl: string, branco: string) {
    return `
  * { box-sizing:border-box; margin:0; padding:0; }
  .card {
    width:86mm; height:54mm;
    background:${branco};
    border-radius:3mm;
    overflow:hidden;
    display:flex; flex-direction:row;
    box-shadow:0 2px 8px rgba(0,0,0,.18);
    page-break-inside:avoid; break-inside:avoid;
    position:relative;
  }
  .side {
    width:14mm; background:${azul};
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    flex-shrink:0; padding:3mm 0; gap:2mm;
  }
  .side-text {
    writing-mode:vertical-rl; text-orientation:mixed;
    transform:rotate(180deg); color:${branco};
    font-size:6.5pt; font-weight:800;
    letter-spacing:.12em; text-transform:uppercase;
    white-space:nowrap; opacity:.9;
  }
  .side-dot { width:5mm;height:5mm;border-radius:50%;background:${azulCl};opacity:.7;flex-shrink:0; }
  .side-logo { width:10mm;height:10mm;object-fit:contain;border-radius:1mm;filter:brightness(0) invert(1); }
  .main { flex:1;display:flex;flex-direction:column;overflow:hidden; }
  .header { background:${azul};padding:2.5mm 3mm 2mm;display:flex;align-items:center;gap:2.5mm; }
  .header-empresa { color:${branco};font-size:7.5pt;font-weight:900;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
  .header-line { flex:1;height:1px;background:rgba(255,255,255,.25);min-width:2mm; }
  .header-chapa { color:#93c5fd;font-size:6pt;font-weight:700;white-space:nowrap;letter-spacing:.05em; }
  .body { flex:1;display:flex;flex-direction:row;padding:2.5mm 3mm 2mm;gap:3mm;align-items:center; }
  .foto-wrap { width:20mm;height:26mm;border-radius:2mm;overflow:hidden;flex-shrink:0;border:.5mm solid #cbd5e1;background:#334155; }
  .dados { flex:1;display:flex;flex-direction:column;justify-content:center;gap:1.8mm;min-width:0;overflow:hidden; }
  .nome { font-size:9.5pt;font-weight:900;color:#0f172a;line-height:1.15;word-break:break-word;hyphens:auto; }
  .divider { height:.4mm;background:linear-gradient(90deg,${azulCl},transparent);border-radius:1mm;width:80%; }
  .funcao-label { font-size:5.5pt;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.1em; }
  .funcao-val { font-size:8pt;font-weight:700;color:${azulCl};word-break:break-word;hyphens:auto;line-height:1.2; }
  .footer { background:#f1f5f9;border-top:.3mm solid #e2e8f0;padding:1.5mm 3mm;display:flex;align-items:center;justify-content:space-between; }
  .footer-chapa { font-size:6pt;font-weight:800;color:${azul};letter-spacing:.06em;text-transform:uppercase; }
  .footer-barras { display:flex;gap:.8mm;align-items:flex-end; }
  .barra { background:${azul};border-radius:.3mm;opacity:.6; }
  /* ── Marcas de corte ── */
  .cut-wrap {
    position:relative;
    display:inline-block;
    /* margem ao redor para as marcas de corte não ficarem fora */
    padding:4mm;
  }
  .cut-wrap .card { position:relative; z-index:1; }
  .cut-line {
    position:absolute;
    background:#b0b8c1;
    z-index:0;
  }
  /* cantos: 4 traços por cartão */
  .cut-tl-h { top:0; left:4mm; width:3mm; height:.3px; }
  .cut-tl-v { top:0; left:4mm; width:.3px; height:3mm; }
  .cut-tr-h { top:0; right:4mm; width:3mm; height:.3px; margin-left:-3mm; }
  .cut-tr-v { top:0; right:4mm; width:.3px; height:3mm; }
  .cut-bl-h { bottom:0; left:4mm; width:3mm; height:.3px; }
  .cut-bl-v { bottom:0; left:4mm; width:.3px; height:3mm; margin-top:-3mm; }
  .cut-br-h { bottom:0; right:4mm; width:3mm; height:.3px; margin-left:-3mm; }
  .cut-br-v { bottom:0; right:4mm; width:.3px; height:3mm; margin-top:-3mm; }
  @media print { .cut-line { background:#999; } }
`
  }

  function crachaCardHTML(
    c: ColaboradorRow,
    empNome: string,
    logoUrl: string
  ): string {
    const fn   = (c.funcoes as any)?.nome ?? '—'
    const foto = (c as any).foto_url ?? ''

    const fotoBloco = foto
      ? `<img src="${foto}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block;"/>`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#334155;font-size:20px;font-weight:900;color:#94a3b8;">${c.nome.trim().split(/\s+/).map((n: string) => n[0]).slice(0,2).join('').toUpperCase()}</div>`

    // Lateral: logo (se houver) OU nome texto vertical
    const sideContent = logoUrl
      ? `<img src="${logoUrl}" alt="Logo" class="side-logo" onerror="this.style.display='none'"/>`
      : `<span class="side-text">${empNome}</span>`

    const barras = [7,10,6,9,5,8,4,7,6,10,5]
      .map(h => `<div class="barra" style="width:1.2mm;height:${h}px"></div>`)
      .join('')

    return `
<div class="cut-wrap">
  <div class="cut-line cut-tl-h"></div><div class="cut-line cut-tl-v"></div>
  <div class="cut-line cut-tr-h"></div><div class="cut-line cut-tr-v"></div>
  <div class="cut-line cut-bl-h"></div><div class="cut-line cut-bl-v"></div>
  <div class="cut-line cut-br-h"></div><div class="cut-line cut-br-v"></div>
  <div class="card">
    <div class="side">
      <div class="side-dot"></div>
      ${sideContent}
      <div class="side-dot"></div>
    </div>
    <div class="main">
      <div class="header">
        <span class="header-empresa">${empNome}</span>
        <div class="header-line"></div>
        <span class="header-chapa">${c.chapa ?? ''}</span>
      </div>
      <div class="body">
        <div class="foto-wrap">${fotoBloco}</div>
        <div class="dados">
          <div class="nome">${c.nome.trim()}</div>
          <div class="divider"></div>
          <div class="funcao-label">Função</div>
          <div class="funcao-val">${fn}</div>
        </div>
      </div>
      <div class="footer">
        <span class="footer-chapa">Chapa: ${c.chapa ?? '—'}</span>
        <div class="footer-barras">${barras}</div>
      </div>
    </div>
  </div>
</div>`
  }

  // ── Gera Crachá SINGULAR CR-80 e abre para impressão ──────────────────────
  async function gerarCracha(c: ColaboradorRow) {
    const emp     = await fetchEmpresaData()
    const empNome = emp.nome || 'Empresa'
    const logoUrl = emp.logoUrl || ''

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Crachá — ${c.nome}</title>
<style>
  html,body { background:#e2e8f0; display:flex; align-items:center; justify-content:center; min-height:100vh; font-family:'Segoe UI',Arial,sans-serif; }
  @page { size:94mm 62mm; margin:0; }
  @media print { html,body { background:#fff; width:94mm; height:62mm; } .no-print { display:none !important; } }
  ${crachaCSS(CRACHA_AZUL, CRACHA_AZULCL, '#ffffff')}
  .no-print {
    position:fixed; bottom:12px; right:12px;
    background:${CRACHA_AZULCL}; color:#fff; border:none; border-radius:8px;
    padding:10px 22px; font-size:14px; font-weight:700; cursor:pointer;
    box-shadow:0 4px 12px rgba(0,0,0,.25); z-index:9999;
  }
  .no-print:hover { background:#1d4ed8; }
</style>
</head>
<body>
${crachaCardHTML(c, empNome, logoUrl)}
<button class="no-print" onclick="window.print()">🖨️ Imprimir Crachá</button>
<script>
  const img = document.querySelector('.foto-wrap img')
  if (img) {
    const print = () => window.print()
    img.onload = print; img.onerror = print
    if (img.complete) setTimeout(print, 300)
  } else { window.onload = () => setTimeout(() => window.print(), 200) }
<\/script>
</body>
</html>`

    const win = window.open('', '_blank', 'width=520,height=440')
    if (win) { win.document.write(html); win.document.close() }
    else toast.error('Bloqueio de pop-up detectado. Permita pop-ups para este site.')
  }

  // ── Gera crachás em LOTE por obra — grid A4 com marcas de corte ───────────
  async function gerarCrachaLote(obraId: string) {
    const lista = rows.filter(c => {
      if (c.status !== 'ativo') return false
      if (obraId !== 'todas' && (c as any).obra_id !== obraId) return false
      return true
    })

    if (lista.length === 0) {
      toast.warning('Nenhum colaborador ativo encontrado para essa seleção.')
      return
    }

    const emp     = await fetchEmpresaData()
    const empNome = emp.nome || 'Empresa'
    const logoUrl = emp.logoUrl || ''

    const obraNome = obraId === 'todas'
      ? 'Todas as Obras'
      : obras.find(o => o.id === obraId)?.nome ?? '—'

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Crachás em Lote — ${obraNome}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  @page { size:A4; margin:8mm; }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#e2e8f0; padding:60px 12px 12px; }
  @media print { body { background:#fff; padding:0; } .no-print { display:none !important; } }
  ${crachaCSS(CRACHA_AZUL, CRACHA_AZULCL, '#ffffff')}
  /* Grid: 2 crachás por linha em A4 (área útil ~190mm; 2×86mm+gap~12mm = 184mm ✓) */
  .grid {
    display:grid;
    grid-template-columns:repeat(2, max-content);
    gap:0;
    justify-content:center;
    align-items:start;
  }
  /* Barra topo (some ao imprimir) */
  .no-print {
    position:fixed; top:0; left:0; right:0;
    background:${CRACHA_AZUL}; color:#fff;
    padding:10px 20px;
    display:flex; align-items:center; justify-content:space-between;
    font-family:'Segoe UI',Arial,sans-serif; font-size:13px; font-weight:700;
    box-shadow:0 2px 8px rgba(0,0,0,.3); z-index:9999; gap:12px;
  }
  .no-print button {
    background:${CRACHA_AZULCL}; color:#fff; border:none; border-radius:7px;
    padding:8px 20px; font-size:13px; font-weight:700; cursor:pointer;
  }
  .no-print button:hover { background:#1d4ed8; }
</style>
</head>
<body>
<div class="no-print">
  <span>🪪 Crachás em Lote — ${obraNome} · ${lista.length} colaborador(es)</span>
  <button onclick="window.print()">🖨️ Imprimir / PDF</button>
</div>
<div class="grid">
  ${lista.map(c => crachaCardHTML(c, empNome, logoUrl)).join('\n')}
</div>
<script>
  const imgs = Array.from(document.querySelectorAll('.foto-wrap img'))
  if (!imgs.length) { window.onload = () => setTimeout(() => window.print(), 300) }
  else {
    let n = 0
    const done = () => { if (++n >= imgs.length) setTimeout(() => window.print(), 300) }
    imgs.forEach(img => { if ((img as HTMLImageElement).complete) done(); else { img.onload = done; img.onerror = done } })
  }
<\/script>
</body>
</html>`

    const win = window.open('', '_blank', 'width=920,height=740')
    if (win) { win.document.write(html); win.document.close() }
    else toast.error('Bloqueio de pop-up detectado. Permita pop-ups para este site.')
  }



  // mapa: colaborador_id → tem ponto lançado? (bloqueia exclusão visualmente)
  const [colabsComPonto, setColabsComPonto] = useState<Set<string>>(new Set())

  // atualizar EPIs da função
  const [atualizandoEpis, setAtualizandoEpis] = useState(false)
  const [confirmarAtualizEpis, setConfirmarAtualizEpis] = useState(false)

  // alerta lista negra
  const [alertaListaNegra, setAlertaListaNegra] = useState<{ nome: string; motivo: string } | null>(null)

  // Modal recontratação
  const [modalRecontratar, setModalRecontratar]   = useState(false)
  const [recontStep, setRecontStep]               = useState<1|2>(1)
  const [recontDataEnc, setRecontDataEnc]         = useState('')
  const [recontMotivo, setRecontMotivo]           = useState<string>('mudanca_vinculo')
  const [recontNovoTipo, setRecontNovoTipo]       = useState<'clt'|'autonomo'>('clt')
  const [recontNovoFuncaoId, setRecontNovoFuncaoId] = useState<string>('__manter')
  const [recontDataAdm, setRecontDataAdm]         = useState('')
  const [recontSaving, setRecontSaving]           = useState(false)
  const [recontColabId, setRecontColabId]         = useState<string|null>(null)

  // ── modal de inativação ───────────────────────────────────────────────────
  type PendenciaItem = { tipo: string; label: string; qtd: number; ok: boolean }
  const [modalInativar, setModalInativar]           = useState(false)
  const [inativarColabId, setInativarColabId]       = useState<string|null>(null)
  const [inativarNome, setInativarNome]             = useState('')
  const [inativarData, setInativarData]             = useState(new Date().toISOString().split('T')[0])
  const [inativarMotivo, setInativarMotivo]         = useState('')
  const [inativarPendencias, setInativarPendencias] = useState<PendenciaItem[]>([])
  const [inativarLoadingPend, setInativarLoadingPend] = useState(false)
  const [inativarConfirmou, setInativarConfirmou]   = useState(false)
  const [inativarSaving, setInativarSaving]         = useState(false)
  const inativarFormStatusPrev = useRef<string>('ativo') // guarda status anterior ao abrir

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
  // Filtro inline — calculado a cada render
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const filtered = rows.filter(c => {
    const matchS = filterStatus === 'todos' || c.status === filterStatus
    const matchF = filterFuncao === 'todas' || (c as any).funcao_id === filterFuncao
    const matchC = filterContrato === 'todos' || (c.tipo_contrato ?? '').toLowerCase() === filterContrato
    const q = norm(busca.trim())
    const matchB = !q || norm(c.nome).includes(q) || norm(c.chapa ?? '').includes(q) || norm((c.funcoes as any)?.nome ?? '').includes(q)
    return matchS && matchF && matchC && matchB
  })

  // ── helpers form ──────────────────────────────────────────────────────────
  const set = (k: keyof FormData, v: string | boolean) => setForm(p => ({ ...p, [k]: v }))

  // ── verificar lista negra ao digitar CPF ──────────────────────────────────
  async function verificarListaNegra(cpf: string) {
    const digits = cpf.replace(/\D/g, '')
    if (digits.length !== 11) return
    const { data } = await supabase.from('lista_negra_juridico')
      .select('nome,motivo').eq('cpf', digits).limit(1)
    if (data && data.length > 0) {
      setAlertaListaNegra({ nome: data[0].nome, motivo: data[0].motivo })
    } else {
      setAlertaListaNegra(null)
    }
  }

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
    setSection(epis.length > 0 ? 'epis' : 'status')
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
    // Bloquear só se tiver lançamento ABERTO (rascunho/aguardando/em_fechamento)
    // Lançamentos aprovados/pagos não bloqueiam — valor já congelado no snapshot
    const { count } = await supabase.from('ponto_lancamentos')
      .select('id', { count: 'exact', head: true })
      .eq('colaborador_id', c.id)
      .in('status', ['rascunho', 'aguardando_aprovacao', 'em_fechamento'])
    setTemPontoLancado((count ?? 0) > 0)
    // Carregar histórico de contratos
    const { data: hcData } = await supabase
      .from('colaborador_historico_contrato')
      .select('*')
      .eq('colaborador_id', c.id)
      .order('data_inicio', { ascending: false })
    setHistoricoContratos((hcData ?? []) as HistoricoContrato[])
    setSection('status')
    setForm({
      nome: c.nome, chapa: c.chapa ?? '', cpf: c.cpf ?? '', rg: c.rg ?? '',
      pis_nit: c.pis_nit ?? '', data_nascimento: c.data_nascimento ?? '',
      genero: c.genero ?? '', estado_civil: c.estado_civil ?? '',
      telefone: c.telefone ?? '', email: c.email ?? '', endereco: c.endereco ?? '',
      cidade: c.cidade ?? '', estado: c.estado ?? '', cep: c.cep ?? '',
      funcao_id: c.funcao_id ?? '', obra_id: c.obra_id ?? '',
      salario: c.salario ? String(c.salario) : '',
      tipo_contrato: c.tipo_contrato ?? 'clt', data_admissao: c.data_admissao ?? '',
      ctps_numero: c.ctps_numero ?? '', ctps_serie: c.ctps_serie ?? '', data_exame_admissional: (c as any).data_exame_admissional ?? '',
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
      status: c.status ?? 'ativo',
      data_status: (c as any).data_status ?? '', observacoes: c.observacoes ?? '',
      nome_pai: (c as any).nome_pai ?? '', nome_mae: (c as any).nome_mae ?? '',
      cor_raca: (c as any).cor_raca ?? '',
      deficiencia: (c as any).deficiencia ?? false,
      tipo_deficiencia: (c as any).tipo_deficiencia ?? '',
      doc_militar: (c as any).doc_militar ?? '',
      matricula_esocial: (c as any).matricula_esocial ?? '',
      tipo_desligamento: (c as any).tipo_desligamento ?? '',
      data_aviso_previo: (c as any).data_aviso_previo ?? '',
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

  // ── abrir edição INLINE (sem popup) ─────────────────────────────────────
  const openEditInline = async (c: ColaboradorRow) => {
    await openEdit(c)   // reutiliza toda a lógica de carregamento
    setModalOpen(false) // mas não abre o modal
    setSection('pessoal') // primeira aba é Dados Pessoais
    setInlineEditing(true)
  }

  // ── CRUD Histórico de Contratos ──────────────────────────────────────────────
  const handleSalvarPeriodo = async (periodo: Omit<HistoricoContrato,'id'|'created_at'>) => {
    // Encerrar período vigente anterior (data_fim = null) se existir
    const vigente = historicoContratos.find(p => p.data_fim === null)
    if(vigente && vigente.data_inicio < periodo.data_inicio){
      const dataFimAnt = new Date(periodo.data_inicio)
      dataFimAnt.setDate(dataFimAnt.getDate() - 1)
      await supabase.from('colaborador_historico_contrato')
        .update({ data_fim: dataFimAnt.toISOString().slice(0,10) })
        .eq('id', vigente.id)
    }
    const { data, error } = await supabase.from('colaborador_historico_contrato')
      .insert(periodo).select().single()
    if(error){ toast.error('Erro ao salvar período: '+error.message); return }
    setHistoricoContratos(prev => [data as HistoricoContrato, ...prev.filter(p=>p.id!==vigente?.id), ...(vigente&&vigente.data_inicio<periodo.data_inicio?[{...vigente,data_fim:new Date(new Date(periodo.data_inicio).getTime()-86400000).toISOString().slice(0,10)}]:prev.filter(p=>p.id===vigente?.id))])
    // Recarregar histórico completo
    const { data: hcData } = await supabase.from('colaborador_historico_contrato').select('*').eq('colaborador_id', periodo.colaborador_id).order('data_inicio',{ascending:false})
    setHistoricoContratos((hcData??[]) as HistoricoContrato[])
    // Atualizar tipo_contrato do colaborador para o novo período vigente
    await supabase.from('colaboradores').update({ tipo_contrato: periodo.tipo_contrato }).eq('id', periodo.colaborador_id)
    toast.success('Período salvo! Colaborador agora é '+periodo.tipo_contrato.toUpperCase())
  }

  const handleEncerrarPeriodo = async (id: string, dataFim: string) => {
    const { error } = await supabase.from('colaborador_historico_contrato').update({ data_fim: dataFim }).eq('id', id)
    if(error){ toast.error('Erro: '+error.message); return }
    setHistoricoContratos(prev => prev.map(p => p.id===id ? {...p,data_fim:dataFim} : p))
    toast.success('Período encerrado em '+new Date(dataFim+'T12:00').toLocaleDateString('pt-BR'))
  }

  const handleExcluirPeriodo = async (id: string) => {
    const { error } = await supabase.from('colaborador_historico_contrato').delete().eq('id', id)
    if(error){ toast.error('Erro: '+error.message); return }
    setHistoricoContratos(prev => prev.filter(p => p.id!==id))
    toast.success('Período excluído')
  }

  // ── salvar ────────────────────────────────────────────────────────────────
  // ── Abrir modal de inativação: busca pendências ───────────────────────────
  async function abrirModalInativar(colabId: string, colabNome: string, statusAtual: string) {
    setInativarColabId(colabId)
    setInativarNome(colabNome)
    setInativarData(new Date().toISOString().split('T')[0])
    setInativarMotivo('')
    setInativarConfirmou(false)
    inativarFormStatusPrev.current = statusAtual
    setInativarPendencias([])
    setModalInativar(true)
    setInativarLoadingPend(true)

    // Buscar pendências em paralelo
    const hoje = new Date().toISOString().split('T')[0]
    const compAtual = hoje.slice(0, 7) // YYYY-MM

    const [
      { data: pontos },
      { data: vts },
      { data: adiantamentos },
      { data: premios },
    ] = await Promise.all([
      supabase.from('ponto_lancamentos')
        .select('id', { count: 'exact' })
        .eq('colaborador_id', colabId)
        .in('status', ['pendente', 'aberto']),
      supabase.from('vale_transporte')
        .select('id', { count: 'exact' })
        .eq('colaborador_id', colabId)
        .in('status', ['pendente', 'aguardando_pagamento']),
      supabase.from('adiantamentos')
        .select('id', { count: 'exact' })
        .eq('colaborador_id', colabId)
        .in('status', ['pendente', 'aprovado']),
      supabase.from('premios')
        .select('id', { count: 'exact' })
        .eq('colaborador_id', colabId)
        .in('status', ['pendente', 'aprovado']),
    ])

    const pends: PendenciaItem[] = [
      { tipo: 'ponto',       label: 'Ponto em aberto / pendente',          qtd: pontos?.length ?? 0,       ok: (pontos?.length ?? 0) === 0 },
      { tipo: 'vt',          label: 'Vale-Transporte pendente / a pagar',  qtd: vts?.length ?? 0,          ok: (vts?.length ?? 0) === 0 },
      { tipo: 'adiantamento',label: 'Adiantamentos pendentes / aprovados', qtd: adiantamentos?.length ?? 0, ok: (adiantamentos?.length ?? 0) === 0 },
      { tipo: 'premio',      label: 'Prêmios pendentes / aprovados',       qtd: premios?.length ?? 0,       ok: (premios?.length ?? 0) === 0 },
    ]
    setInativarPendencias(pends)
    setInativarLoadingPend(false)
  }

  // ── Confirmar inativação ──────────────────────────────────────────────────
  async function confirmarInativacao() {
    if (!inativarColabId) return
    if (!inativarData) { toast.error('Informe a data de inativação'); return }
    if (!inativarConfirmou) { toast.error('Você precisa confirmar que verificou as pendências'); return }

    setInativarSaving(true)

    const userEmail = user?.email ?? 'sistema'
    const agora     = new Date().toISOString()

    const { error } = await supabase.from('colaboradores').update({
      status:                  'inativo',
      data_status:             inativarData,
      data_encerramento:       inativarData,
      motivo_encerramento:     inativarMotivo || 'outros',
      inativado_por:           userEmail,
      inativado_em:            agora,
      confirmou_sem_pendencias: true,
    } as any).eq('id', inativarColabId)

    // Se falhar por check constraint no motivo, tentar sem motivo
    let finalError = error
    if (error && error.message?.includes('motivo_encerramento_check')) {
      const { error: e2 } = await supabase.from('colaboradores').update({
        status:                  'inativo',
        data_status:             inativarData,
        data_encerramento:       inativarData,
        motivo_encerramento:     null,
        observacoes:             inativarMotivo ? `Motivo inativação: ${inativarMotivo}` : undefined,
        inativado_por:           userEmail,
        inativado_em:            agora,
        confirmou_sem_pendencias: true,
      } as any).eq('id', inativarColabId)
      finalError = e2
    }

    setInativarSaving(false)

    if (finalError) {
      toast.error('Erro ao inativar: ' + finalError.message)
      return
    }

    toast.success(`✅ ${inativarNome} inativado(a) com sucesso!`)
    setModalInativar(false)

    // Se o modal de edição estava aberto com esse colaborador, atualizar o form
    if (editId === inativarColabId) {
      set('status', 'inativo')
      set('data_status', inativarData)
    }

    fetchData()
  }

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); setSection('pessoal'); return }
    if (!form.funcao_id)   { toast.error('Selecione a função'); setSection('funcao'); return }
    if (!form.chapa && !editId) { toast.error('Chapa não gerada — selecione a função'); setSection('funcao'); return }
    if (!editId && form.status === 'inativo') { toast.error('Novo colaborador não pode ser criado como Inativo'); setSection('status'); return }

    // Trava: não pode mudar função ou contrato se tiver ponto lançado
    const mudouFuncao     = editId && form.funcao_id !== funcaoOriginal && funcaoOriginal !== ''
    const mudouContrato   = editId && form.tipo_contrato !== tipoContratoOriginal && tipoContratoOriginal !== ''
    if (temPontoLancado && (mudouFuncao || mudouContrato)) {
      toast.error('⛔ Colaborador possui ponto em aberto. Finalize ou aprove os lançamentos antes de alterar função ou tipo de contrato.')
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
      data_exame_admissional: (form as any).data_exame_admissional || null,
      banco: form.banco || null,
      agencia: form.agencia || null,
      conta: form.conta || null,
      tipo_conta: form.tipo_conta || null,
      pix_chave: form.pix_chave || null,
      vale_transporte: form.vt_modalidade !== 'nenhum',
      salario: form.salario ? parseFloat(form.salario) : null,
      status: form.status as Colaborador['status'],
      observacoes: form.observacoes || null,
    }
    // Campos JSONB/extras via cast (não tipados na interface Colaborador)
    const payloadFull: any = {
      ...payload,
      data_status: form.data_status || null,
      pix_tipo: form.pix_tipo || null,
      vt_dados: form.vt_modalidade === 'nenhum' ? null : {
        modalidade: form.vt_modalidade,
        gasolina_valor_dia: form.vt_gasolina_valor_dia ? parseFloat(form.vt_gasolina_valor_dia) : null,
        cartao_tipo: form.vt_cartao_tipo || null,
        cartao_numero: form.vt_cartao_numero || null,
        trechos_ida: form.vt_trechos_ida,
        trechos_volta: form.vt_trechos_volta,
      },
      // ── Campos da Ficha de Registro ────────────────────────────────────
      nome_pai:          form.nome_pai          || null,
      nome_mae:          form.nome_mae          || null,
      cor_raca:          form.cor_raca          || null,
      deficiencia:       form.deficiencia,
      tipo_deficiencia:  form.tipo_deficiencia  || null,
      doc_militar:       form.doc_militar       || null,
      matricula_esocial: form.matricula_esocial || null,
      tipo_desligamento: form.tipo_desligamento || null,
      data_aviso_previo: form.data_aviso_previo || null,
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
      if (error || !inserted) {
        // Tratamento especial: CPF duplicado pode ser recontratação
        if (error?.message?.includes('colaboradores_cpf_key') || (error?.message?.includes('unique') && error?.message?.includes('cpf'))) {
          const cpfDigits = form.cpf ? form.cpf.replace(/\D/g, '') : ''
          const { data: existente } = await supabase
            .from('colaboradores')
            .select('id, status, nome')
            .eq('cpf', cpfDigits)
            .eq('status', 'inativo')
            .single()
          if (existente) {
            toast.warning(`CPF já existe para ${existente.nome} (inativo). Crie um novo registro sem CPF ou use a recontratação.`)
          } else {
            toast.error('CPF já cadastrado para um colaborador ativo.')
          }
          setSaving(false); return
        }
        toast.error(traduzirErro(error?.message ?? 'Erro ao criar colaborador')); setSaving(false); return
      }
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
    setInlineEditing(false)
    // Recarrega dados e atualiza a ficha exibida com os dados novos
    const savedId = editId ?? colaboradorId
    await fetchData()
    if (savedId) {
      const { data: updated } = await supabase
        .from('colaboradores')
        .select('*, funcoes(id,nome,sigla,valor_hora_clt,valor_hora_autonomo,contratos_valores), obras(id,nome,codigo)')
        .eq('id', savedId)
        .single()
      if (updated) setColabFicha(updated as any)
    }
  }

  // ── recontratação ─────────────────────────────────────────────────────────
  async function handleRecontratar() {
    if (!editId || !recontDataEnc || !recontDataAdm) {
      toast.error('Preencha as datas obrigatórias')
      return
    }
    if (recontDataAdm <= recontDataEnc) {
      toast.error('Data de início do novo vínculo deve ser após o encerramento')
      return
    }

    setRecontSaving(true)

    // 1. Encerrar colaborador atual
    const { error: errEnc } = await supabase
      .from('colaboradores')
      .update({
        status: 'inativo',
        data_demissao: recontDataEnc,
        data_encerramento: recontDataEnc,
        motivo_encerramento: recontMotivo,
      } as any)
      .eq('id', editId)

    if (errEnc) {
      toast.error('Erro ao encerrar vínculo: ' + errEnc.message)
      setRecontSaving(false)
      return
    }

    // 2. Buscar dados completos do colaborador atual
    const colabAtual = rows.find(r => r.id === editId)
    if (!colabAtual) {
      toast.error('Colaborador não encontrado')
      setRecontSaving(false)
      return
    }

    // 3. Gerar nova chapa baseada no novo tipo/data de admissão
    // Usa a nova função selecionada (ou mantém a atual se __manter)
    const novaFuncaoId = recontNovoFuncaoId !== '__manter' ? recontNovoFuncaoId : colabAtual.funcao_id
    const fn = funcoes.find(f => f.id === novaFuncaoId)
    let novaChapa = ''
    if (fn?.sigla) {
      novaChapa = await gerarChapa(fn.sigla, recontDataAdm)
    }

    // 4. Criar novo colaborador (cópia dos dados pessoais + novo vínculo)
    const novoPayload: any = {
      nome:              colabAtual.nome,
      cpf:               null,           // CPF removido: constraint unique — histórico preservado via vinculo_anterior_id
      rg:                colabAtual.rg,
      pis_nit:           colabAtual.pis_nit,
      data_nascimento:   colabAtual.data_nascimento,
      genero:            colabAtual.genero,
      estado_civil:      colabAtual.estado_civil,
      telefone:          colabAtual.telefone,
      email:             colabAtual.email,
      endereco:          colabAtual.endereco,
      cidade:            colabAtual.cidade,
      estado:            colabAtual.estado,
      cep:               colabAtual.cep,
      banco:             colabAtual.banco,
      agencia:           colabAtual.agencia,
      conta:             colabAtual.conta,
      tipo_conta:        colabAtual.tipo_conta,
      pix_chave:         colabAtual.pix_chave,
      pix_tipo:          (colabAtual as any).pix_tipo,
      funcao_id:         recontNovoFuncaoId !== '__manter' ? recontNovoFuncaoId : colabAtual.funcao_id,
      obra_id:           colabAtual.obra_id,
      vale_transporte:   colabAtual.vale_transporte,
      vt_dados:          colabAtual.vt_dados,
      // Novo vínculo
      chapa:             novaChapa,
      tipo_contrato:     recontNovoTipo,
      data_admissao:     recontDataAdm,
      status:            'ativo',
      vinculo_anterior_id: editId,
      observacoes:       colabAtual.observacoes,
    }

    const { data: inserido, error: errIns } = await supabase
      .from('colaboradores')
      .insert(novoPayload)
      .select('id')
      .single()

    if (errIns || !inserido) {
      toast.error('Erro ao criar novo vínculo: ' + (errIns?.message ?? 'desconhecido'))
      setRecontSaving(false)
      return
    }

    setRecontSaving(false)
    setModalRecontratar(false)
    setModalOpen(false)
    const tipoLabel = recontNovoTipo === 'clt' ? 'CLT' : 'Autônomo/PJ'
    toast.success(`✅ Recontratação concluída! Nova chapa: ${novaChapa} (${tipoLabel})`)
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
  // ── Carregar documentos do colaborador ──────────────────────────────────
  const fetchColabDocs = useCallback(async (colaboradorId: string) => {
    setLoadingDocs(true)
    const { data } = await supabase
      .from('colaborador_documentos')
      .select('id,titulo,tipo,descricao,arquivo_url,visivel_colaborador,criado_em')
      .eq('colaborador_id', colaboradorId)
      .order('criado_em', { ascending: false })
    setColabDocs((data ?? []) as any)
    setLoadingDocs(false)
  }, [])

  const salvarNovoDoc = useCallback(async (colaboradorId: string) => {
    if (!novoDoc.titulo.trim()) { toast.error('Informe o título do documento.'); return }
    setSavingDoc(true)
    const { error } = await supabase.from('colaborador_documentos').insert({
      colaborador_id: colaboradorId,
      titulo: novoDoc.titulo.trim(),
      tipo: novoDoc.tipo,
      descricao: novoDoc.descricao || null,
      arquivo_url: novoDoc.arquivo_url || null,
      visivel_colaborador: novoDoc.visivel_colaborador,
    })
    setSavingDoc(false)
    if (error) { toast.error('Erro ao salvar documento: ' + error.message); return }
    toast.success('Documento adicionado!')
    setNovoDoc({ titulo:'', tipo:'contrato_trabalho', descricao:'', arquivo_url:'', visivel_colaborador:false })
    setShowNovoDoc(false)
    fetchColabDocs(colaboradorId)
  }, [novoDoc, fetchColabDocs])

  const toggleVisivelDoc = useCallback(async (docId: string, visivel: boolean, colaboradorId: string) => {
    const { error } = await supabase.from('colaborador_documentos').update({ visivel_colaborador: visivel }).eq('id', docId)
    if (error) { toast.error('Erro ao atualizar visibilidade.'); return }
    toast.success(visivel ? '✅ Documento visível no portal' : '🔒 Documento ocultado do portal')
    fetchColabDocs(colaboradorId)
  }, [fetchColabDocs])

  const excluirDoc = useCallback(async (docId: string, colaboradorId: string) => {
    if (!window.confirm('Excluir este documento?')) return
    const { error } = await supabase.from('colaborador_documentos').delete().eq('id', docId)
    if (error) { toast.error('Erro ao excluir.'); return }
    toast.success('Documento excluído.')
    fetchColabDocs(colaboradorId)
  }, [fetchColabDocs])

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
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 56px)', overflow:'hidden', background:'var(--background)' }}>
      {/* Tabs de página */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', flexShrink: 0, background:'var(--background)', paddingLeft: 24 }}>
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

      {/* ── ABA COLABORADORES — layout estilo Ponto ─────────────────────── */}
      <div style={{ display: pageTab === 'colaboradores' ? 'flex' : 'none', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* ── PAINEL ESQUERDO — busca + filtros + lista ── */}
        <div style={{ width: colabFicha ? 300 : 360, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width .2s' }}>

          {/* Header escuro estilo Ponto */}
          <div style={{ padding: '12px 12px 10px', background: '#1e3a5f', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>👷 Colaboradores</span>
              <div style={{ display:'flex', gap:5 }}>
                <button onClick={() => { setLoteObra('todas'); setModalLote(true) }}
                  style={{ background:'rgba(5,150,105,.35)', border:'1px solid rgba(5,150,105,.6)', borderRadius:6, color:'#6ee7b7', cursor:'pointer', padding:'4px 9px', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4 }}
                  title="Gerar crachás em lote por obra">
                  🪪 Lote
                </button>
                <button onClick={openNew} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>+ Novo</button>
              </div>
            </div>

            {/* Badges de filtro rápido */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                { key: 'todos',    label: 'todos',    val: rows.length,      bg: 'rgba(255,255,255,.15)', cor: '#fff',    field: 'status' },
                { key: 'ativo',    label: 'ativos',   val: totalAtivos,      bg: 'rgba(34,197,94,.25)',   cor: '#86efac', field: 'status' },
                { key: 'inativo',  label: 'inativos', val: totalInativos,    bg: 'rgba(248,113,113,.25)', cor: '#fca5a5', field: 'status' },
                { key: 'clt',      label: 'CLT',      val: totalCLT,         bg: 'rgba(59,130,246,.25)',  cor: '#93c5fd', field: 'contrato' },
                { key: 'autonomo', label: 'autôn.',   val: totalAutonomo,    bg: 'rgba(167,139,250,.25)', cor: '#c4b5fd', field: 'contrato' },
              ].map(b => {
                const ativo = b.field === 'status' ? filterStatus === b.key : filterContrato === b.key
                return (
                  <button key={b.key}
                    onClick={() => {
                      if (b.key === 'todos') { setFilterStatus('todos'); setFilterContrato('todos') }
                      else if (b.field === 'status') { setFilterStatus(s => s === b.key ? 'todos' : b.key); setFilterContrato('todos') }
                      else { setFilterContrato(s => s === b.key ? 'todos' : b.key); setFilterStatus('todos') }
                    }}
                    style={{ background: ativo ? b.bg : 'rgba(255,255,255,.07)', border: `1.5px solid ${ativo ? b.cor : 'transparent'}`, borderRadius: 5, padding: '2px 7px', fontSize: 10, fontWeight: 700, color: ativo ? b.cor : '#94a3b8', cursor: 'pointer' }}>
                    {b.label}: {b.val}
                  </button>
                )
              })}
            </div>
            {/* Campo de busca por nome */}
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none' }} />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome, chapa…"
                style={{ width: '100%', height: 32, paddingLeft: 28, paddingRight: busca ? 28 : 8, borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#fff', fontSize: 12, boxSizing: 'border-box', outline: 'none' }}
              />
              {busca && (
                <button onClick={() => setBusca('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 0, display: 'flex', lineHeight: 1 }}>
                  <XCircle size={14} />
                </button>
              )}
            </div>
            {/* Filtro função */}
            <select value={filterFuncao} onChange={e => setFilterFuncao(e.target.value)}
              style={{ height: 28, borderRadius: 6, border: '1px solid #334155', background: '#0f172a', color: '#94a3b8', fontSize: 11, paddingLeft: 8 }}>
              <option value="todas">Todas as funções</option>
              {funcoes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {filtered.length} de {rows.length} colaborador(es)
              {busca && <span style={{ color: '#fbbf24', marginLeft: 4 }}>· "{busca}"</span>}
            </div>
          </div>

          {/* Lista de colaboradores */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <LoadingSkeleton rows={6} /> : filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum colaborador encontrado</div>
            ) : filtered.map(c => {
              const fn = (c.funcoes as any)?.nome ?? '—'
              const sel = colabFicha?.id === c.id
              const statusDot = c.status === 'ativo' ? '#22c55e' : c.status === 'inativo' ? '#ef4444' : '#f59e0b'
              return (
                <div key={c.id} onClick={() => { setColabFicha(c); setInlineEditing(false); setEditId(null) }}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: sel ? 'hsl(var(--primary)/.08)' : 'transparent', borderLeft: `3px solid ${sel ? 'hsl(var(--primary))' : 'transparent'}`, transition: 'background .12s' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: sel ? 'hsl(var(--primary))' : '#94a3b8', fontWeight: 600, marginBottom: 1 }}>{c.chapa ?? '—'}</div>
                      <div style={{ fontSize: 13, fontWeight: sel ? 700 : 600, color: sel ? 'hsl(var(--primary))' : 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{c.nome}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 1 }}>{fn} · <span style={{ color: c.tipo_contrato === 'clt' ? '#60a5fa' : '#a78bfa', fontWeight: 600 }}>{(c.tipo_contrato ?? '').toUpperCase() || '—'}</span></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusDot, display: 'inline-block', marginTop: 3 }} title={c.status} />
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button onClick={e => { e.stopPropagation(); setColabFicha(c); openEditInline(c) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }} title="Editar">
                          <Pencil size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Painel direito: tela vazia ou ficha ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tela de boas-vindas */}
          {!colabFicha && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--muted-foreground)', padding: 40 }}>
              <Users size={48} strokeWidth={1.2} />
              <div style={{ fontSize: 16, fontWeight: 600 }}>Selecione um colaborador</div>
              <div style={{ fontSize: 13, textAlign: 'center' }}>Clique em qualquer colaborador na lista à esquerda para ver sua ficha completa.</div>
              <Button onClick={openNew} size="sm" style={{ marginTop: 8 }}><Plus size={13} /> Novo Colaborador</Button>
            </div>
          )}

          {/* ── Ficha / Edição inline ── */}
          {colabFicha && (() => {
            const c = colabFicha
            const fn = (c.funcoes as any)?.nome ?? '—'
            const ob = (c.obras  as any)?.nome  ?? '—'
            const statusColor = c.status === 'ativo' ? '#16a34a' : c.status === 'inativo' ? '#dc2626' : '#d97706'
            const statusBg    = c.status === 'ativo' ? '#f0fdf4' : c.status === 'inativo' ? '#fff1f2' : '#fffbeb'
            const fmtDate = (v: string | null | undefined) => v ? new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
            const contr: Record<string,string> = { clt:'CLT', autonomo:'Autônomo', pj:'PJ', temporario:'Temporário', aprendiz:'Menor Aprendiz', estagiario:'Estagiário' }
            const civil: Record<string,string> = { solteiro:'Solteiro(a)', casado:'Casado(a)', divorciado:'Divorciado(a)', viuvo:'Viúvo(a)', uniao_estavel:'União Estável' }
            const genero: Record<string,string> = { masculino:'Masculino', feminino:'Feminino', outro:'Outro' }
            const tconta: Record<string,string> = { corrente:'Corrente', poupanca:'Poupança', salario:'Conta Salário' }
            const pixTipo: Record<string,string> = { cpf:'CPF', telefone:'Telefone', email:'E-mail', chave_aleatoria:'Chave Aleatória' }
            const corRaca: Record<string,string> = { branca:'Branca', preta:'Preta', parda:'Parda', amarela:'Amarela', indigena:'Indígena', nao_declarada:'Não declarada' }
            const tipoDeslig: Record<string,string> = { pedido_demissao:'Pedido de Demissão', demissao_sem_justa_causa:'Demissão s/ Justa Causa', demissao_justa_causa:'Demissão c/ Justa Causa', termino_contrato:'Término de Contrato', falecimento:'Falecimento', aposentadoria:'Aposentadoria', outros:'Outros' }
            const vtDados = (c.vt_dados ?? {}) as any
            const vtMod = vtDados.modalidade ?? (c.vale_transporte ? 'transporte' : 'nenhum')
            const vtLabel: Record<string,string> = { nenhum:'Não recebe', gasolina:'Aux. Gasolina', transporte:'Transporte Público' }

            // helper linha de dado
            const Campo = ({ label, value, wide }: { label: string; value: string; wide?: boolean }) => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--border)', gap: 8, gridColumn: wide ? 'span 2' : undefined }}>
                <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', wordBreak: 'break-word', maxWidth: '65%' }}>{value || '—'}</span>
              </div>
            )

            const Secao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
              <div style={{ background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '7px 14px', background: '#1e3a5f', color: '#fff', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {titulo}
                </div>
                <div style={{ padding: '4px 14px 8px' }}>{children}</div>
              </div>
            )

            return (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--card)' }}>

                {/* ── Header ── */}
                <div style={{ padding: '14px 18px 12px', background: '#1e3a5f', color: '#fff', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>

                      {/* ── Avatar / Foto ── */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {(c as any).foto_url ? (
                            <img src={(c as any).foto_url} alt="Foto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,.7)' }}>
                              {c.nome.split(' ').map((n: string) => n[0]).slice(0,2).join('').toUpperCase()}
                            </span>
                          )}
                        </div>
                        {/* Botão trocar foto */}
                        <button
                          onClick={() => fotoInputRef.current?.click()}
                          disabled={uploadingFoto}
                          title="Trocar foto de perfil"
                          style={{ position: 'absolute', bottom: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: '#0ea5e9', border: '2px solid #1e3a5f', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                          {uploadingFoto ? '…' : '📷'}
                        </button>
                        <input ref={fotoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return
                          setUploadingFoto(true)
                          const url = await uploadFoto(file)
                          setUploadingFoto(false)
                          if (fotoInputRef.current) fotoInputRef.current.value = ''
                          if (url) { await salvarFotoColab(c.id, url) }
                        }} />
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: '#93c5fd', fontWeight: 700, marginBottom: 2, letterSpacing: '0.05em' }}>{c.chapa ?? '—'}</div>
                        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6, lineHeight: 1.2 }}>{c.nome}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ background: 'rgba(255,255,255,.15)', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>🏷️ {fn}</span>
                          <span style={{ background: statusBg, color: statusColor, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>{c.status?.toUpperCase()}</span>
                          <span style={{ background: 'rgba(255,255,255,.10)', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>{contr[c.tipo_contrato ?? ''] ?? c.tipo_contrato?.toUpperCase() ?? '—'}</span>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => { setColabFicha(null); setInlineEditing(false); setEditId(null) }} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', padding: '5px 10px', fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap' }}>✕ Fechar</button>
                  </div>
                </div>

                {/* ── Barra de ação (visualização) ── */}
                {!inlineEditing && (
                <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: '#f8fafc', flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
                  <button onClick={() => openEditInline(c)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid hsl(var(--primary))', background: 'hsl(var(--primary)/.08)', color: 'hsl(var(--primary))', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    <Pencil size={12} /> Editar
                  </button>
                  <button onClick={() => openHist(c.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid #7c3aed', background: '#faf5ff', color: '#7c3aed', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    <History size={12} /> Histórico
                  </button>
                  <button onClick={() => gerarFichaRegistroPDF(c)} disabled={gerandoPDF}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid #0ea5e9', background: '#f0f9ff', color: '#0284c7', fontWeight: 700, fontSize: 12, cursor: gerandoPDF ? 'not-allowed' : 'pointer', opacity: gerandoPDF ? 0.7 : 1 }}>
                    <Printer size={12} /> {gerandoPDF ? 'Gerando…' : 'Ficha PDF'}
                  </button>
                  <button onClick={() => gerarCracha(c)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid #059669', background: '#f0fdf4', color: '#059669', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    🪪 Crachá
                  </button>
                  {c.status !== 'inativo' && (
                    <button onClick={() => { abrirModalInativar(c.id, c.nome, c.status ?? 'ativo') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid #dc2626', background: '#fff1f2', color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      <XCircle size={12} /> Inativar
                    </button>
                  )}
                  {c.status === 'inativo' && (
                    <button onClick={() => { setRecontColabId(c.id); setModalRecontratar(true) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      🔄 Recontratar
                    </button>
                  )}
                </div>
                )}

                {/* ── Barra de ação (modo edição inline) ── */}
                {inlineEditing && (
                <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: '#f8fafc', flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>

                  {/* Bloco de status compacto */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--background)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted-foreground)', fontWeight: 600, whiteSpace: 'nowrap' }}>Status:</span>
                    <select
                      value={form.status}
                      onChange={e => {
                        const v = e.target.value
                        if (v === 'inativo' && editId) {
                          const colab = rows.find(r => r.id === editId)
                          abrirModalInativar(editId, colab?.nome ?? form.nome, form.status)
                        } else { set('status', v); if (v === 'ativo') set('data_status', '') }
                      }}
                      style={{ height: 28, border: 'none', background: 'transparent', fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none', color:
                        form.status === 'ativo' ? '#16a34a' : form.status === 'inativo' ? '#dc2626' : form.status === 'afastado' ? '#d97706' : '#0ea5e9',
                      }}>
                      <option value="ativo">✅ Ativo</option>
                      <option value="inativo">🔴 Inativo</option>
                      <option value="afastado">🟡 Afastado</option>
                      <option value="ferias">🌴 Férias</option>
                    </select>
                    {form.status !== 'ativo' && (
                      <input type="date" value={form.data_status} onChange={e => set('data_status', e.target.value)}
                        style={{ height: 28, border: '1px solid var(--border)', borderRadius: 5, fontSize: 11, padding: '0 6px', background: 'var(--background)', color: 'var(--foreground)' }} />
                    )}
                  </div>

                  {/* Salvar + Cancelar */}
                  <button onClick={handleSave} disabled={saving || gerando}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 16px', borderRadius: 7, border: 'none', background: saving ? '#94a3b8' : '#16a34a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: saving ? 'none' : '0 2px 6px rgba(22,163,74,0.35)' }}>
                    {saving ? <><Loader2 size={12} className="animate-spin" /> Salvando…</> : '✓ Salvar'}
                  </button>
                  <button onClick={() => { setInlineEditing(false); setEditId(null) }} disabled={saving}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    ✕ Cancelar
                  </button>

                  {/* Encerrar e Recontratar — direita */}
                  {editId && form.status === 'ativo' && (
                    <button
                      onClick={() => {
                        const hoje = new Date().toISOString().split('T')[0]
                        setRecontDataEnc(hoje); setRecontDataAdm(hoje)
                        setRecontMotivo('mudanca_vinculo')
                        setRecontNovoTipo(form.tipo_contrato === 'clt' ? 'autonomo' : 'clt')
                        setRecontNovoFuncaoId('__manter')
                        setRecontStep(1); setRecontColabId(editId)
                        setInlineEditing(false)
                        setModalRecontratar(true)
                      }}
                      style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid #fde68a', background: '#fffbeb', color: '#d97706', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                      🔄 Encerrar e Recontratar
                    </button>
                  )}
                </div>
                )}

                {/* ── Conteúdo: MODO EDIÇÃO INLINE ── */}
                {inlineEditing && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Abas (sem Status) */}
                    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', padding: '0 14px', flexShrink: 0, background: 'var(--background)', flexWrap: 'wrap' }}>
                      {(['pessoal', 'funcao', 'bancario', 'vt', 'epis', 'docs'] as const).map(s => {
                        const labels: Record<string, string> = { pessoal: 'Dados Pessoais', funcao: 'Função & Contrato', bancario: 'Dados Bancários', vt: 'Vale Transporte', epis: '🦺 EPIs', docs: '📄 Documentos' }
                        const hasEpis = s === 'epis' && epiList.length > 0
                        const hasDocs = s === 'docs' && colabDocs.length > 0
                        return (
                          <button key={s} onClick={() => { setSection(s); if (s === 'docs' && editId) fetchColabDocs(editId) }} style={{
                            padding: '8px 12px', fontSize: 12, fontWeight: 500, border: 'none', background: 'none',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                            borderBottom: section === s ? '2px solid var(--primary)' : '2px solid transparent',
                            color: section === s ? 'var(--primary)' : 'var(--muted-foreground)',
                            marginBottom: -1, whiteSpace: 'nowrap',
                          }}>
                            {labels[s]}
                            {hasEpis && (
                              <span style={{ background: section === s ? 'var(--primary)' : '#16a34a', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 5px' }}>
                                {epiList.length}
                              </span>
                            )}
                            {hasDocs && (
                              <span style={{ background: section === s ? 'var(--primary)' : '#1d4ed8', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 5px' }}>
                                {colabDocs.length}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* Conteúdo das abas — sem aba Status */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>

                      {/* ── DADOS PESSOAIS (+ Complementares + Endereço) ── */}
                      {section === 'pessoal' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                          {/* Observações — compacta no topo */}
                          <Sec title="📝 Observações">
                            <Textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} placeholder="Observações gerais sobre o colaborador…" />
                          </Sec>

                          <Sec title="Identificação">
                            <Grid cols={2}>
                              <Field label="Nome completo *" span={2}>
                                <Input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" />
                              </Field>
                              <Field label={editId && trocandoFuncao && form.funcao_id !== funcaoOriginal ? "CPF (protegido)" : "CPF"}>
                                {editId && trocandoFuncao && form.funcao_id !== funcaoOriginal ? (
                                  <Input value={form.cpf.replace(/\d/g, '*')} readOnly disabled style={{ background:'#f8fafc', color:'#94a3b8', cursor:'not-allowed' }} />
                                ) : !editId ? (
                                  <Input value={form.cpf.replace(/\D/g,'')} onChange={e => { const v=e.target.value.replace(/\D/g,'').slice(0,11); set('cpf',v); verificarListaNegra(v) }} placeholder="Somente números (11 dígitos)" inputMode="numeric" maxLength={11} />
                                ) : (
                                  <Input value={form.cpf} onChange={e => { const v = maskCPF(e.target.value); set('cpf', v); verificarListaNegra(v) }} placeholder="000.000.000-00" inputMode="numeric" />
                                )}
                                {alertaListaNegra && (
                                  <div style={{ marginTop: 6, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <span style={{ fontSize: 16, flexShrink: 0 }}>🚫</span>
                                    <div>
                                      <div style={{ fontWeight: 700, fontSize: 12, color: '#dc2626' }}>CPF em Lista Negra Jurídica!</div>
                                      <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>{alertaListaNegra.nome} — {alertaListaNegra.motivo}</div>
                                    </div>
                                  </div>
                                )}
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

                          {/* Dados Complementares — integrados em Dados Pessoais */}
                          <Sec title="📋 Dados Complementares">
                            <Grid cols={2}>
                              <Field label="Nome do Pai">
                                <Input value={form.nome_pai} onChange={e => set('nome_pai', e.target.value)} placeholder="Nome completo do pai" />
                              </Field>
                              <Field label="Nome da Mãe">
                                <Input value={form.nome_mae} onChange={e => set('nome_mae', e.target.value)} placeholder="Nome completo da mãe" />
                              </Field>
                              <Field label="Cor / Raça">
                                <Select value={form.cor_raca} onValueChange={v => set('cor_raca', v)}>
                                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="branca">Branca</SelectItem>
                                    <SelectItem value="preta">Preta</SelectItem>
                                    <SelectItem value="parda">Parda</SelectItem>
                                    <SelectItem value="amarela">Amarela</SelectItem>
                                    <SelectItem value="indigena">Indígena</SelectItem>
                                    <SelectItem value="nao_declarada">Não declarada</SelectItem>
                                  </SelectContent>
                                </Select>
                              </Field>
                              <Field label="Documento Militar">
                                <Input value={form.doc_militar} onChange={e => set('doc_militar', e.target.value)} placeholder="Nº do documento" />
                              </Field>
                              <Field label="Matrícula eSocial">
                                <Input value={form.matricula_esocial} onChange={e => set('matricula_esocial', e.target.value)} placeholder="Ex: 11" />
                              </Field>
                              <Field label="Deficiência">
                                <div style={{ display:'flex', alignItems:'center', gap:10, height:36 }}>
                                  <button type="button"
                                    onClick={() => { set('deficiencia', !form.deficiencia); if (form.deficiencia) set('tipo_deficiencia', '') }}
                                    style={{ position:'relative', display:'inline-flex', width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', background: form.deficiencia ? '#dc2626' : 'rgba(0,0,0,0.15)', transition:'background 150ms', flexShrink:0 }}>
                                    <span style={{ position:'absolute', top:3, left: form.deficiencia ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left 150ms' }} />
                                  </button>
                                  <span style={{ fontSize:12, color:'var(--muted-foreground)' }}>{form.deficiencia ? 'Sim' : 'Não'}</span>
                                </div>
                              </Field>
                              {form.deficiencia && (
                                <Field label="Tipo de Deficiência" span={2}>
                                  <Input value={form.tipo_deficiencia} onChange={e => set('tipo_deficiencia', e.target.value)} placeholder="Ex: Visual, Auditiva, Física…" />
                                </Field>
                              )}
                            </Grid>
                          </Sec>

                        </div>
                      )}

                      {/* ── FUNÇÃO & CONTRATO ── */}
                      {section === 'funcao' && (
                        <FuncaoSection
                          form={form} funcoes={funcoes} obras={obras}
                          editId={editId} funcaoOriginal={funcaoOriginal}
                          chapaOriginal={chapaOriginal} gerando={gerando}
                          trocandoFuncao={trocandoFuncao} motivoTroca={motivoTroca}
                          setMotivoTroca={setMotivoTroca} onFuncaoChange={handleFuncaoChange}
                          onSet={set} onDataAdmissao={handleDataAdmissao}
                          onGotoFuncoes={() => { setInlineEditing(false); setPageTab('funcoes') }}
                          temPontoLancado={temPontoLancado}
                          historicoContratos={historicoContratos}
                          onSalvarPeriodo={handleSalvarPeriodo}
                          onEncerrarPeriodo={handleEncerrarPeriodo}
                          onExcluirPeriodo={handleExcluirPeriodo}
                        />
                      )}

                      {/* ── DADOS BANCÁRIOS ── */}
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
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {[
                                  { v: 'cpf', label: '🪪 CPF' },
                                  { v: 'telefone', label: '📱 Celular' },
                                  { v: 'email', label: '✉️ E-mail' },
                                  { v: 'chave_aleatoria', label: '🔑 Chave aleatória' },
                                ].map(t => (
                                  <button key={t.v} type="button"
                                    onClick={() => {
                                      let chave = ''
                                      if (t.v === 'cpf') chave = form.cpf
                                      if (t.v === 'telefone') chave = form.telefone
                                      if (t.v === 'email') chave = form.email
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

                      {/* ── VALE TRANSPORTE ── */}
                      {section === 'vt' && (
                        <VTSection form={form} setForm={setForm} />
                      )}

                      {/* ── EPIs ── */}
                      {section === 'epis' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {editId && form.funcao_id && (
                            <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 20 }}>🔄</span>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>Sincronizar EPIs com a função atual</div>
                                  <div style={{ fontSize: 11, color: '#16a34a', marginTop: 1 }}>Função: <strong>{funcoes.find(f => f.id === form.funcao_id)?.nome}</strong></div>
                                </div>
                              </div>
                              <button onClick={() => setConfirmarAtualizEpis(true)} disabled={atualizandoEpis}
                                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #16a34a', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: atualizandoEpis ? 'not-allowed' : 'pointer', opacity: atualizandoEpis ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                                {atualizandoEpis ? '⏳ Atualizando…' : '⟳ Atualizar EPIs'}
                              </button>
                            </div>
                          )}
                          <EpiColabSection epiList={epiList} setEpiList={setEpiList} funcaoNome={funcoes.find(f => f.id === form.funcao_id)?.nome} />
                        </div>
                      )}

                    </div>{/* fim scroll inline */}
                  </div>
                )}

                {/* ── Conteúdo scrollável (MODO VISUALIZAÇÃO) ── */}
                {!inlineEditing && (
                <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

                  {/* Grid 2 colunas para as seções */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

                    {/* Identificação */}
                    <Secao titulo="👤 Identificação">
                      <Campo label="CPF"            value={c.cpf ?? ''} />
                      <Campo label="RG"             value={c.rg ?? ''} />
                      <Campo label="PIS / NIT"      value={c.pis_nit ?? ''} />
                      <Campo label="Nascimento"     value={fmtDate(c.data_nascimento)} />
                      <Campo label="Gênero"         value={genero[c.genero ?? ''] ?? c.genero ?? ''} />
                      <Campo label="Estado Civil"   value={civil[c.estado_civil ?? ''] ?? c.estado_civil ?? ''} />
                      <Campo label="Cor / Raça"     value={corRaca[(c as any).cor_raca ?? ''] ?? (c as any).cor_raca ?? ''} />
                      <Campo label="Doc. Militar"   value={(c as any).doc_militar ?? ''} />
                      <Campo label="Deficiência"    value={(c as any).deficiencia ? ((c as any).tipo_deficiencia || 'Sim') : 'Não'} />
                      <Campo label="Telefone"       value={c.telefone ?? ''} />
                      <Campo label="E-mail"         value={c.email ?? ''} />
                    </Secao>

                    {/* Contrato */}
                    <Secao titulo="📋 Contrato & Obra">
                      <Campo label="Matrícula eSocial" value={(c as any).matricula_esocial ?? ''} />
                      <Campo label="Obra"            value={ob} />
                      <Campo label="Função"          value={fn} />
                      <Campo label="Tipo Contrato"   value={contr[c.tipo_contrato ?? ''] ?? c.tipo_contrato ?? ''} />
                      <Campo label="Admissão"        value={fmtDate(c.data_admissao)} />
                      <Campo label="Salário Base"    value={c.salario ? `R$ ${Number(c.salario).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : ''} />
                      <Campo label="CTPS Nº"         value={c.ctps_numero ?? ''} />
                      <Campo label="Série CTPS"      value={c.ctps_serie ?? ''} />
                      {c.status === 'inativo' && <>
                        <Campo label="Desligamento"   value={fmtDate(c.data_demissao ?? c.data_encerramento ?? '')} />
                        <Campo label="Tipo Deslig."   value={tipoDeslig[(c as any).tipo_desligamento ?? ''] ?? (c as any).tipo_desligamento ?? ''} />
                        <Campo label="Aviso Prévio"   value={fmtDate((c as any).data_aviso_previo ?? '')} />
                      </>}
                    </Secao>

                    {/* Filiação — nova seção */}
                    <Secao titulo="👨‍👩‍👦 Filiação">
                      <Campo label="Nome do Pai" value={(c as any).nome_pai ?? ''} />
                      <Campo label="Nome da Mãe" value={(c as any).nome_mae ?? ''} />
                    </Secao>

                    {/* Endereço */}
                    <Secao titulo="🏠 Endereço">
                      <Campo label="Endereço"   value={c.endereco ?? ''} />
                      <Campo label="Cidade"     value={c.cidade ?? ''} />
                      <Campo label="UF"         value={c.estado ?? ''} />
                      <Campo label="CEP"        value={c.cep ?? ''} />
                    </Secao>

                    {/* Bancário */}
                    <Secao titulo="🏦 Dados Bancários">
                      <Campo label="Banco"        value={c.banco ?? ''} />
                      <Campo label="Agência"      value={c.agencia ?? ''} />
                      <Campo label="Conta"        value={c.conta ?? ''} />
                      <Campo label="Tipo Conta"   value={tconta[c.tipo_conta ?? ''] ?? c.tipo_conta ?? ''} />
                      <Campo label="Tipo PIX"     value={pixTipo[c.pix_tipo ?? ''] ?? c.pix_tipo ?? ''} />
                      <Campo label="Chave PIX"    value={c.pix_chave ?? ''} />
                    </Secao>

                  </div>

                  {/* Vale Transporte — largura total */}
                  <Secao titulo="🚌 Vale Transporte">
                    <Campo label="Modalidade" value={vtLabel[vtMod] ?? vtMod} />
                    {vtMod === 'gasolina' && <Campo label="Valor Diário" value={vtDados.gasolina_valor_dia ? `R$ ${parseFloat(vtDados.gasolina_valor_dia).toFixed(2)}` : '—'} />}
                    {vtMod === 'transporte' && <>
                      <Campo label="Empresa/Cartão" value={vtDados.cartao_tipo ?? ''} />
                      <Campo label="Nº Cartão"      value={vtDados.cartao_numero ?? ''} />
                    </>}
                  </Secao>

                  {/* Observações — se houver */}
                  {c.observacoes && (
                    <Secao titulo="📝 Observações">
                      <div style={{ fontSize: 12, padding: '8px 0', lineHeight: 1.6, color: 'var(--foreground)' }}>{c.observacoes}</div>
                    </Secao>
                  )}

                </div>
                )}
              </div>
            )
          })()}

        </div>{/* fim painel direito */}
      </div>{/* fim layout colaboradores */}

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

      {/* ═══════════ MODAL: CRACHÁS EM LOTE ════════════════════════════════ */}
      {modalLote && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target === e.currentTarget) setModalLote(false) }}>
          <div style={{ background:'var(--card)', borderRadius:14, padding:28, width:420, maxWidth:'95vw', boxShadow:'0 8px 40px rgba(0,0,0,.35)', display:'flex', flexDirection:'column', gap:20 }}>

            {/* Cabeçalho */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:17, fontWeight:800, display:'flex', alignItems:'center', gap:8 }}>🪪 Crachás em Lote</div>
                <div style={{ fontSize:12, color:'var(--muted-foreground)', marginTop:3 }}>Gera um PDF A4 com todos os crachás CR-80 e marcas de corte</div>
              </div>
              <button onClick={() => setModalLote(false)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--muted-foreground)', padding:'0 4px', lineHeight:1 }}>✕</button>
            </div>

            {/* Filtro por obra */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--muted-foreground)', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>
                🏗️ Filtrar por Obra
              </label>
              <select
                value={loteObra}
                onChange={e => setLoteObra(e.target.value)}
                style={{ width:'100%', height:38, borderRadius:8, border:'1px solid var(--border)', background:'var(--background)', color:'var(--foreground)', fontSize:13, paddingLeft:10 }}>
                <option value="todas">Todas as obras ({rows.filter(c=>c.status==='ativo').length} ativos)</option>
                {obras.map(o => {
                  const qtd = rows.filter(c => c.status==='ativo' && (c as any).obra_id === o.id).length
                  return <option key={o.id} value={o.id}>{o.nome} ({qtd})</option>
                })}
              </select>
            </div>

            {/* Preview da contagem */}
            {(() => {
              const qtd = rows.filter(c => {
                if (c.status !== 'ativo') return false
                if (loteObra !== 'todas' && (c as any).obra_id !== loteObra) return false
                return true
              }).length
              const comFoto = rows.filter(c => {
                if (c.status !== 'ativo') return false
                if (loteObra !== 'todas' && (c as any).obra_id !== loteObra) return false
                return !!(c as any).foto_url
              }).length
              return (
                <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:9, padding:'12px 16px', display:'flex', gap:20 }}>
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:24, fontWeight:900, color:'#15803d' }}>{qtd}</div>
                    <div style={{ fontSize:11, color:'#166534', fontWeight:600 }}>crachás</div>
                  </div>
                  <div style={{ borderLeft:'1px solid #bbf7d0' }} />
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:24, fontWeight:900, color:'#0369a1' }}>{comFoto}</div>
                    <div style={{ fontSize:11, color:'#075985', fontWeight:600 }}>com foto</div>
                  </div>
                  <div style={{ borderLeft:'1px solid #bbf7d0' }} />
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:24, fontWeight:900, color:'#92400e' }}>{qtd - comFoto}</div>
                    <div style={{ fontSize:11, color:'#78350f', fontWeight:600 }}>só iniciais</div>
                  </div>
                  <div style={{ marginLeft:'auto', display:'flex', alignItems:'center' }}>
                    <div style={{ fontSize:11, color:'#64748b', textAlign:'right', lineHeight:1.5 }}>
                      {Math.ceil(qtd/2)} página(s) A4<br/>2 crachás por linha
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Info marcas de corte */}
            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#92400e', display:'flex', gap:8, alignItems:'flex-start' }}>
              <span style={{ fontSize:16, flexShrink:0 }}>✂️</span>
              <span>Cada crachá inclui <strong>marcas de corte nos 4 cantos</strong> para facilitar o recorte no tamanho CR-80 (86 × 54 mm). O logo e nome da empresa são buscados automaticamente das configurações do sistema.</span>
            </div>

            {/* Ações */}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setModalLote(false)}
                style={{ padding:'8px 20px', borderRadius:8, border:'1px solid var(--border)', background:'var(--background)', color:'var(--foreground)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={() => {
                  const qtd = rows.filter(c => {
                    if (c.status !== 'ativo') return false
                    if (loteObra !== 'todas' && (c as any).obra_id !== loteObra) return false
                    return true
                  }).length
                  if (qtd === 0) { toast.warning('Nenhum colaborador ativo para a obra selecionada.'); return }
                  setModalLote(false)
                  gerarCrachaLote(loteObra)
                }}
                style={{ padding:'8px 22px', borderRadius:8, border:'2px solid #059669', background:'linear-gradient(135deg,#059669,#047857)', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', gap:7, boxShadow:'0 2px 8px rgba(5,150,105,.35)' }}>
                🖨️ Gerar e Imprimir
              </button>
            </div>
          </div>
        </div>
      )}

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
          style={{ maxWidth: 860, width: '95vw', padding: 0, display: 'flex', flexDirection: 'column', height: '92vh', maxHeight: '92vh', overflow: 'hidden' }}>

          {/* cabeçalho colorido */}
          <div style={{ background: '#0d3f56', padding: '20px 24px 16px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* Avatar com iniciais */}
              <div style={{
                width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                background: form.status === 'ativo' ? '#1d9a6c' : form.status === 'ferias' ? '#d97706' : '#dc2626',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 800, color: '#fff', border: '3px solid rgba(255,255,255,0.25)',
                letterSpacing: -1,
              }}>
                {form.nome ? form.nome.trim().split(' ').slice(0,2).map((n: string) => n[0]?.toUpperCase()).join('') : (editId ? '?' : '+')}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                  {form.nome || (editId ? 'Colaborador' : 'Novo Colaborador')}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {/* Badge função */}
                  {form.funcao_id && (() => { const fn = funcoes.find(f => f.id === form.funcao_id); return fn ? (
                    <span style={{ background: 'rgba(255,255,255,0.18)', color: '#e2e8f0', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.25)' }}>
                      🏷️ {fn.sigla ? `[${fn.sigla}] ` : ''}{fn.nome}
                    </span>
                  ) : null })()}
                  {/* Badge status */}
                  <span style={{
                    background: form.status === 'ativo' ? 'rgba(29,154,108,0.35)' : form.status === 'ferias' ? 'rgba(217,119,6,0.35)' : 'rgba(220,38,38,0.35)',
                    color: form.status === 'ativo' ? '#6ee7b7' : form.status === 'ferias' ? '#fde68a' : '#fca5a5',
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                    border: `1px solid ${form.status === 'ativo' ? 'rgba(110,231,183,0.4)' : form.status === 'ferias' ? 'rgba(253,230,138,0.4)' : 'rgba(252,165,165,0.4)'}`,
                    textTransform: 'uppercase' as const,
                  }}>
                    {form.status === 'ativo' ? '● Ativo' : form.status === 'ferias' ? '☀ Férias' : form.status === 'inativo' ? '✕ Inativo' : form.status || '—'}
                  </span>
                  {/* Badge tipo contrato */}
                  {form.tipo_contrato && (
                    <span style={{
                      background: form.tipo_contrato === 'clt' ? 'rgba(29,78,216,0.35)' : 'rgba(249,115,22,0.35)',
                      color: form.tipo_contrato === 'clt' ? '#93c5fd' : '#fdba74',
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                      border: `1px solid ${form.tipo_contrato === 'clt' ? 'rgba(147,197,253,0.4)' : 'rgba(253,186,116,0.4)'}`,
                      textTransform: 'uppercase' as const,
                    }}>
                      {form.tipo_contrato.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'right', flexShrink: 0 }}>
                {form.chapa && <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>#{form.chapa}</div>}
                <div>{editId ? 'Editar' : 'Novo'}</div>
              </div>
            </div>
          </div>

          {/* abas do modal — sem Status */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e2e8f0', margin: '0 24px', flexShrink: 0, background: '#fff' }}>
            {(['pessoal', 'funcao', 'bancario', 'vt', 'epis', 'docs'] as const).map(s => {
              const labels: Record<string, string> = { pessoal: 'Dados Pessoais', funcao: 'Função & Contrato', bancario: 'Dados Bancários', vt: 'Vale Transporte', epis: '🦺 EPIs', docs: '📄 Documentos' }
              const isEpisTab = s === 'epis'
              const hasEpis   = isEpisTab && epiList.length > 0
              const hasDocs   = s === 'docs' && colabDocs.length > 0
              const icons: Record<string, string> = { pessoal: '👤', funcao: '💼', bancario: '🏦', vt: '🚌', epis: '🦺', docs: '📄' }
              return (
                <button key={s} onClick={() => { setSection(s); if (s === 'docs' && editId) fetchColabDocs(editId) }} style={{
                  padding: '10px 16px', fontSize: 13, fontWeight: section === s ? 700 : 500, border: 'none',
                  background: section === s ? '#fff' : 'transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  borderBottom: section === s ? '2px solid #0d3f56' : '2px solid transparent',
                  color: section === s ? '#0d3f56' : '#64748b',
                  marginBottom: -2, transition: 'color 0.15s',
                }}>
                  <span style={{ fontSize: 14 }}>{icons[s]}</span>
                  {labels[s]}
                  {hasEpis && (
                    <span style={{
                      background: section === s ? '#0d3f56' : '#16a34a',
                      color: '#fff', fontSize: 10, fontWeight: 700,
                      borderRadius: 10, padding: '1px 6px', lineHeight: '16px',
                    }}>
                      {epiList.length}
                    </span>
                  )}
                  {hasDocs && (
                    <span style={{
                      background: section === s ? '#0d3f56' : '#1d4ed8',
                      color: '#fff', fontSize: 10, fontWeight: 700,
                      borderRadius: 10, padding: '1px 6px', lineHeight: '16px',
                    }}>
                      {colabDocs.length}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* conteúdo scrollável */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#f8fafc' }}>

            {/* ── SEÇÃO DADOS PESSOAIS (+ Complementares + Endereço) ──────────── */}
            {section === 'pessoal' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Observações compactas no topo */}
                <Sec title="📝 Observações">
                  <Textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2} placeholder="Observações gerais…" />
                </Sec>

                <Sec title="Identificação">
                  <Grid cols={2}>
                    <Field label="Nome completo *" span={2}>
                      <Input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome completo" />
                    </Field>
                    <Field label={editId && trocandoFuncao && form.funcao_id !== funcaoOriginal ? "CPF (protegido)" : "CPF"}>
                      {editId && trocandoFuncao && form.funcao_id !== funcaoOriginal ? (
                        <Input value={form.cpf.replace(/\d/g, '*')} readOnly disabled style={{ background:'#f8fafc', color:'#94a3b8', cursor:'not-allowed' }} />
                      ) : !editId ? (
                        <Input value={form.cpf.replace(/\D/g,'')} onChange={e => { const v=e.target.value.replace(/\D/g,'').slice(0,11); set('cpf',v); verificarListaNegra(v) }} placeholder="Somente números (11 dígitos)" inputMode="numeric" maxLength={11} />
                      ) : (
                        <Input value={form.cpf} onChange={e => { const v = maskCPF(e.target.value); set('cpf', v); verificarListaNegra(v) }} placeholder="000.000.000-00" inputMode="numeric" />
                      )}
                      {alertaListaNegra && (
                        <div style={{ marginTop: 6, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 16, flexShrink: 0 }}>🚫</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 12, color: '#dc2626' }}>CPF em Lista Negra Jurídica!</div>
                            <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>{alertaListaNegra.nome} — {alertaListaNegra.motivo}</div>
                          </div>
                        </div>
                      )}
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

                {/* Dados Complementares integrados */}
                <Sec title="📋 Dados Complementares">
                  <Grid cols={2}>
                    <Field label="Nome do Pai">
                      <Input value={form.nome_pai} onChange={e => set('nome_pai', e.target.value)} placeholder="Nome completo do pai" />
                    </Field>
                    <Field label="Nome da Mãe">
                      <Input value={form.nome_mae} onChange={e => set('nome_mae', e.target.value)} placeholder="Nome completo da mãe" />
                    </Field>
                    <Field label="Cor / Raça">
                      <Select value={form.cor_raca} onValueChange={v => set('cor_raca', v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="branca">Branca</SelectItem>
                          <SelectItem value="preta">Preta</SelectItem>
                          <SelectItem value="parda">Parda</SelectItem>
                          <SelectItem value="amarela">Amarela</SelectItem>
                          <SelectItem value="indigena">Indígena</SelectItem>
                          <SelectItem value="nao_declarada">Não declarada</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Documento Militar">
                      <Input value={form.doc_militar} onChange={e => set('doc_militar', e.target.value)} placeholder="Nº do documento" />
                    </Field>
                    <Field label="Matrícula eSocial">
                      <Input value={form.matricula_esocial} onChange={e => set('matricula_esocial', e.target.value)} placeholder="Ex: 11" />
                    </Field>
                    <Field label="Deficiência">
                      <div style={{ display:'flex', alignItems:'center', gap:10, height:36 }}>
                        <button type="button"
                          onClick={() => { set('deficiencia', !form.deficiencia); if (form.deficiencia) set('tipo_deficiencia', '') }}
                          style={{ position:'relative', display:'inline-flex', width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', background: form.deficiencia ? '#dc2626' : 'rgba(0,0,0,0.15)', transition:'background 150ms', flexShrink:0 }}>
                          <span style={{ position:'absolute', top:3, left: form.deficiencia ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left 150ms' }} />
                        </button>
                        <span style={{ fontSize:12, color:'var(--muted-foreground)' }}>{form.deficiencia ? 'Sim' : 'Não'}</span>
                      </div>
                    </Field>
                    {form.deficiencia && (
                      <Field label="Tipo de Deficiência" span={2}>
                        <Input value={form.tipo_deficiencia} onChange={e => set('tipo_deficiencia', e.target.value)} placeholder="Ex: Visual, Auditiva, Física…" />
                      </Field>
                    )}
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
                historicoContratos={historicoContratos}
                onSalvarPeriodo={handleSalvarPeriodo}
                onEncerrarPeriodo={handleEncerrarPeriodo}
                onExcluirPeriodo={handleExcluirPeriodo}
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

            {/* ── SEÇÃO DOCUMENTOS DO COLABORADOR ──────────────────────── */}
            {section === 'docs' && editId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Aviso */}
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
                  📄 Adicione documentos do colaborador (contrato, exames, etc.) e habilite a visualização no portal.
                  <br/><span style={{ fontWeight: 400, fontSize: 12, color: '#3b82f6' }}>O toggle <strong>Visível no Portal</strong> libera o acesso para o colaborador ver o documento.</span>
                </div>

                {/* Botão novo */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowNovoDoc(s => !s)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    <Plus size={14}/> {showNovoDoc ? 'Cancelar' : 'Novo Documento'}
                  </button>
                </div>

                {/* Formulário novo doc */}
                {showNovoDoc && (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Título *</label>
                        <input value={novoDoc.titulo} onChange={e => setNovoDoc(d => ({ ...d, titulo: e.target.value }))}
                          placeholder="Ex: Contrato de Trabalho"
                          style={{ width: '100%', height: 38, borderRadius: 8, border: '1.5px solid #e5e7eb', padding: '0 10px', fontSize: 13, boxSizing: 'border-box' as const }}/>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Tipo</label>
                        <select value={novoDoc.tipo} onChange={e => setNovoDoc(d => ({ ...d, tipo: e.target.value }))}
                          style={{ width: '100%', height: 38, borderRadius: 8, border: '1.5px solid #e5e7eb', padding: '0 8px', fontSize: 13, boxSizing: 'border-box' as const, cursor: 'pointer' }}>
                          <option value="contrato_trabalho">Contrato de Trabalho</option>
                          <option value="admissao">Documentos Admissionais</option>
                          <option value="rescisao">Rescisão</option>
                          <option value="exame_medico">Exame Médico</option>
                          <option value="ferias">Aviso de Férias</option>
                          <option value="comprovante">Comprovante</option>
                          <option value="outro">Outro</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Descrição (opcional)</label>
                      <input value={novoDoc.descricao} onChange={e => setNovoDoc(d => ({ ...d, descricao: e.target.value }))}
                        placeholder="Descrição curta…"
                        style={{ width: '100%', height: 38, borderRadius: 8, border: '1.5px solid #e5e7eb', padding: '0 10px', fontSize: 13, boxSizing: 'border-box' as const }}/>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>URL do Arquivo (opcional)</label>
                      <input value={novoDoc.arquivo_url} onChange={e => setNovoDoc(d => ({ ...d, arquivo_url: e.target.value }))}
                        placeholder="https://… (link do arquivo)"
                        style={{ width: '100%', height: 38, borderRadius: 8, border: '1.5px solid #e5e7eb', padding: '0 10px', fontSize: 13, boxSizing: 'border-box' as const }}/>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox" id="visivel_portal" checked={novoDoc.visivel_colaborador}
                        onChange={e => setNovoDoc(d => ({ ...d, visivel_colaborador: e.target.checked }))}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}/>
                      <label htmlFor="visivel_portal" style={{ fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                        ✅ Visível no Portal do Colaborador
                      </label>
                    </div>
                    <button onClick={() => salvarNovoDoc(editId)} disabled={savingDoc}
                      style={{ alignSelf: 'flex-end', padding: '8px 20px', borderRadius: 8, border: 'none', background: savingDoc ? '#94a3b8' : '#16a34a', color: '#fff', fontWeight: 700, fontSize: 13, cursor: savingDoc ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {savingDoc ? <><Loader2 size={14} className="animate-spin"/>Salvando…</> : <>✓ Salvar Documento</>}
                    </button>
                  </div>
                )}

                {/* Lista de documentos */}
                {loadingDocs ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Loader2 size={20} className="animate-spin"/> Carregando documentos…
                  </div>
                ) : colabDocs.length === 0 ? (
                  <div style={{ background: '#f9fafb', borderRadius: 10, padding: '24px', textAlign: 'center', border: '1px dashed #e5e7eb', color: '#9ca3af', fontSize: 13 }}>
                    Nenhum documento cadastrado ainda.<br/>
                    <span style={{ fontSize: 12 }}>Clique em "Novo Documento" para adicionar.</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {colabDocs.map((doc: any) => {
                      const tipoLabel: Record<string,string> = { contrato_trabalho:'Contrato de Trabalho', admissao:'Admissional', rescisao:'Rescisão', exame_medico:'Exame Médico', ferias:'Férias', comprovante:'Comprovante', outro:'Outro' }
                      return (
                        <div key={doc.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>{doc.titulo}</div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' as const }}>
                              <span style={{ fontSize: 10, background: '#f3f4f6', color: '#374151', padding: '1px 7px', borderRadius: 6, fontWeight: 600 }}>
                                {tipoLabel[doc.tipo] ?? doc.tipo}
                              </span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6,
                                background: doc.visivel_colaborador ? '#dcfce7' : '#fee2e2',
                                color: doc.visivel_colaborador ? '#15803d' : '#dc2626',
                              }}>
                                {doc.visivel_colaborador ? '✅ Visível no Portal' : '🔒 Oculto'}
                              </span>
                            </div>
                            {doc.descricao && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>{doc.descricao}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                            {/* Toggle visibilidade */}
                            <button
                              onClick={() => toggleVisivelDoc(doc.id, !doc.visivel_colaborador, editId)}
                              title={doc.visivel_colaborador ? 'Ocultar do portal' : 'Tornar visível no portal'}
                              style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${doc.visivel_colaborador ? '#fca5a5' : '#86efac'}`, background: doc.visivel_colaborador ? '#fff1f2' : '#f0fdf4', color: doc.visivel_colaborador ? '#dc2626' : '#16a34a', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
                              {doc.visivel_colaborador ? '🔒 Ocultar' : '👁 Liberar'}
                            </button>
                            {/* Download */}
                            {doc.arquivo_url && (
                              <a href={doc.arquivo_url} target="_blank" rel="noreferrer"
                                style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                🔗
                              </a>
                            )}
                            {/* Excluir */}
                            <button onClick={() => excluirDoc(doc.id, editId)}
                              style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff1f2', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                              🗑
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* rodapé */}
          <DialogFooter style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--muted)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
              {editId && form.status === 'ativo' && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const hoje = new Date().toISOString().split('T')[0]
                    setRecontDataEnc(hoje)
                    setRecontDataAdm(hoje)
                    setRecontMotivo('mudanca_vinculo')
                    setRecontNovoTipo(form.tipo_contrato === 'clt' ? 'autonomo' : 'clt')
                    setRecontNovoFuncaoId('__manter')
                    setRecontStep(1)
                    setRecontColabId(editId)
                    setModalRecontratar(true)
                  }}
                  style={{ color: '#d97706', borderColor: '#fde68a', background: '#fffbeb', marginRight: 'auto' }}
                  disabled={saving}
                >
                  🔄 Encerrar e Recontatar
                </Button>
              )}
              <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || gerando}>
                {saving ? 'Salvando…' : editId ? 'Salvar alterações' : 'Criar colaborador'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ MODAL RECONTRATAÇÃO ═══════════════════════════════ */}
      <Dialog open={modalRecontratar} onOpenChange={o => { if (!recontSaving) setModalRecontratar(o) }}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              🔄 Encerrar Vínculo e Recontatar
            </DialogTitle>
          </DialogHeader>

          <div style={{ padding: '4px 0 16px' }}>
            {/* Indicador de passos */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 20 }}>
              {[
                { n: 1, label: 'Encerramento' },
                { n: 2, label: 'Novo Vínculo' },
              ].map((p, i) => (
                <div key={p.n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                  {i > 0 && <div style={{ position: 'absolute', top: 14, left: '-50%', width: '100%', height: 2, background: recontStep > 1 ? '#1d4ed8' : '#e5e7eb', zIndex: 0 }} />}
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', zIndex: 1,
                    background: recontStep >= p.n ? '#1d4ed8' : '#e5e7eb',
                    color: recontStep >= p.n ? '#fff' : '#9ca3af',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 13,
                  }}>{p.n}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: recontStep >= p.n ? '#1d4ed8' : '#9ca3af', marginTop: 4 }}>{p.label}</div>
                </div>
              ))}
            </div>

            {recontStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>
                  ⚠️ O cadastro atual será <strong>inativado</strong> na data de encerramento. Um novo cadastro será criado com nova chapa.
                </div>

                <div>
                  <Label className="text-xs">Data de encerramento do vínculo atual *</Label>
                  <Input type="date" value={recontDataEnc}
                    onChange={e => setRecontDataEnc(e.target.value)}
                    className="mt-1" />
                </div>

                <div>
                  <Label className="text-xs">Motivo do encerramento *</Label>
                  <select value={recontMotivo} onChange={e => setRecontMotivo(e.target.value)}
                    style={{ width: '100%', height: 36, border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', fontSize: 13, background: 'var(--background)', marginTop: 4 }}>
                    <option value="mudanca_vinculo">Mudança de vínculo (CLT ↔ Autônomo)</option>
                    <option value="rescisao_amigavel">Rescisão amigável</option>
                    <option value="demissao">Demissão</option>
                    <option value="aposentadoria">Aposentadoria</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <Button variant="outline" onClick={() => setModalRecontratar(false)}>Cancelar</Button>
                  <Button onClick={() => {
                    if (!recontDataEnc) { toast.error('Informe a data de encerramento'); return }
                    setRecontStep(2)
                  }}>Próximo →</Button>
                </div>
              </div>
            )}

            {recontStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1e40af' }}>
                  ✅ Encerramento em <strong>{recontDataEnc ? new Date(recontDataEnc + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</strong> confirmado. Configure o novo vínculo:
                </div>

                <div>
                  <Label className="text-xs">Novo tipo de contrato *</Label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                    {(['clt', 'autonomo'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setRecontNovoTipo(t)}
                        style={{
                          padding: '10px 8px', borderRadius: 8, border: `2px solid ${recontNovoTipo === t ? '#1d4ed8' : '#e5e7eb'}`,
                          background: recontNovoTipo === t ? '#dbeafe' : 'var(--card)',
                          color: recontNovoTipo === t ? '#1d4ed8' : 'var(--foreground)',
                          fontWeight: 700, fontSize: 12, cursor: 'pointer',
                          textTransform: 'uppercase',
                        }}
                      >
                        {t === 'clt' ? '🟦 CLT' : '🟧 Autônomo / PJ'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Função no novo vínculo */}
                <div>
                  <Label className="text-xs">Função no novo vínculo</Label>
                  <select
                    value={recontNovoFuncaoId}
                    onChange={e => setRecontNovoFuncaoId(e.target.value)}
                    style={{ width:'100%', height:36, borderRadius:6, border:'1px solid var(--border)', background:'var(--background)', color:'var(--foreground)', fontSize:12, paddingLeft:8, marginTop:4 }}
                  >
                    <option value="__manter">🔄 Manter função atual</option>
                    {funcoes.map(f => (
                      <option key={f.id} value={f.id}>{f.nome}{f.sigla ? ` (${f.sigla})` : ''}</option>
                    ))}
                  </select>
                  <div style={{ fontSize:10, color:'var(--muted-foreground)', marginTop:3 }}>
                    Deixe "Manter função atual" para copiar a função do vínculo anterior.
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Data de início do novo vínculo *</Label>
                  <Input type="date" value={recontDataAdm}
                    onChange={e => setRecontDataAdm(e.target.value)}
                    className="mt-1"
                    min={recontDataEnc}
                  />
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 3 }}>
                    A nova chapa será gerada automaticamente com base nesta data.
                  </div>
                </div>

                <div style={{ background: 'var(--muted)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 O que será copiado automaticamente:</div>
                  <div style={{ color: 'var(--muted-foreground)', lineHeight: 1.8 }}>
                    ✅ Dados pessoais (nome, CPF, RG, endereço, contato)<br/>
                    ✅ Dados bancários e PIX<br/>
                    ✅ Função e obra atuais<br/>
                    ✅ Configuração de Vale Transporte<br/>
                    ⚠️ <strong>Salário/valor hora</strong>: atualize após a recontratação<br/>
                    ❌ Ponto, VT lançados e adiantamentos ficam no vínculo anterior
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <Button variant="outline" onClick={() => setRecontStep(1)} disabled={recontSaving}>← Voltar</Button>
                  <Button onClick={handleRecontratar} disabled={recontSaving}
                    style={{ background: '#1d4ed8', color: '#fff' }}>
                    {recontSaving ? '⏳ Processando…' : '✅ Confirmar Recontratação'}
                  </Button>
                </div>
              </div>
            )}
          </div>
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

      {/* ── Modal de Inativação ─────────────────────────────────────────── */}
      <Dialog open={modalInativar} onOpenChange={o => { if (!inativarSaving) setModalInativar(o) }}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle style={{ display:'flex', alignItems:'center', gap:8, color:'#dc2626' }}>
              <ShieldAlert size={20} />
              Inativar colaborador
            </DialogTitle>
          </DialogHeader>

          <div style={{ display:'flex', flexDirection:'column', gap:16, marginTop:4 }}>

            {/* Identificação */}
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'12px 14px' }}>
              <div style={{ fontWeight:700, color:'#dc2626', fontSize:15 }}>{inativarNome}</div>
              <div style={{ fontSize:12, color:'#b91c1c', marginTop:2 }}>
                Após a inativação, este colaborador <strong>não aparecerá</strong> em nenhum módulo de lançamento.
              </div>
            </div>

            {/* Verificação de pendências */}
            <div>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                {inativarLoadingPend
                  ? <><Loader2 size={14} className="animate-spin" /> Verificando pendências…</>
                  : <><ShieldAlert size={14} /> Verificação de pendências</>
                }
              </div>
              {inativarLoadingPend ? (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {[1,2,3,4].map(i => <div key={i} style={{ height:36, background:'var(--muted)', borderRadius:6, animation:'pulse 1.5s infinite' }} />)}
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {inativarPendencias.map(p => (
                    <div key={p.tipo} style={{
                      display:'flex', alignItems:'center', justifyContent:'space-between',
                      padding:'9px 12px', borderRadius:6,
                      background: p.ok ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${p.ok ? '#bbf7d0' : '#fecaca'}`,
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        {p.ok
                          ? <CheckCircle2 size={15} style={{ color:'#16a34a', flexShrink:0 }} />
                          : <AlertTriangle size={15} style={{ color:'#dc2626', flexShrink:0 }} />
                        }
                        <span style={{ fontSize:13, color: p.ok ? '#15803d':'#dc2626', fontWeight: p.ok ? 400:600 }}>
                          {p.label}
                        </span>
                      </div>
                      {!p.ok && (
                        <span style={{ background:'#dc2626', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:11, fontWeight:700 }}>
                          {p.qtd} pendente{p.qtd > 1 ? 's':''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {!inativarLoadingPend && inativarPendencias.some(p => !p.ok) && (
                <div style={{ marginTop:8, background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#92400e' }}>
                  ⚠ Há pendências em aberto. Recomendamos resolver antes de inativar. Mas você pode prosseguir confirmando abaixo.
                </div>
              )}
            </div>

            {/* Campos obrigatórios */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                <Label className="text-xs">Data de inativação *</Label>
                <Input type="date" value={inativarData} onChange={e => setInativarData(e.target.value)}
                  style={{ marginTop:4 }} />
              </div>
              <div>
                <Label className="text-xs">Inativado por</Label>
                <div style={{ marginTop:4, height:36, display:'flex', alignItems:'center', padding:'0 10px',
                  background:'var(--muted)', border:'1px solid var(--border)', borderRadius:6,
                  fontSize:12, color:'var(--muted-foreground)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {user?.email ?? 'sistema'}
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Motivo da inativação *</Label>
              <select
                value={inativarMotivo}
                onChange={e => setInativarMotivo(e.target.value)}
                style={{ width:'100%', height:38, border:'1px solid var(--border)', borderRadius:6, padding:'0 10px', fontSize:13, background:'var(--background)', marginTop:4, color: inativarMotivo ? 'inherit' : '#9ca3af' }}
              >
                <option value="">Selecione o motivo…</option>
                <option value="demissao_sem_justa_causa">Demissão sem justa causa</option>
                <option value="demissao_por_justa_causa">Demissão por justa causa</option>
                <option value="pedido_demissao">Pedido de demissão (colaborador)</option>
                <option value="termino_contrato">Término de contrato</option>
                <option value="rescisao_amigavel">Rescisão amigável</option>
                <option value="abandono_emprego">Abandono de emprego</option>
                <option value="aposentadoria">Aposentadoria</option>
                <option value="falecimento">Falecimento</option>
                <option value="mudanca_vinculo">Mudança de vínculo (CLT ↔ Autônomo)</option>
                <option value="outros">Outros</option>
              </select>
            </div>

            {/* Confirmação de responsabilidade */}
            <div
              onClick={() => setInativarConfirmou(v => !v)}
              style={{
                display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer',
                padding:'12px 14px', borderRadius:8,
                background: inativarConfirmou ? '#f0fdf4' : '#fffbeb',
                border: `2px solid ${inativarConfirmou ? '#16a34a' : '#f59e0b'}`,
                userSelect:'none',
              }}
            >
              <div style={{
                width:18, height:18, borderRadius:3, border:`2px solid ${inativarConfirmou ? '#16a34a':'#d97706'}`,
                background: inativarConfirmou ? '#16a34a':'transparent',
                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1,
              }}>
                {inativarConfirmou && <CheckCircle2 size={12} style={{ color:'#fff' }} />}
              </div>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color: inativarConfirmou ? '#15803d':'#92400e' }}>
                  Confirmo que verifiquei todas as pendências
                </div>
                <div style={{ fontSize:11, color: inativarConfirmou ? '#16a34a':'#b45309', marginTop:2 }}>
                  Declaro, como responsável, que não há lançamentos pendentes de ponto, VT, adiantamentos ou prêmios
                  que precisem ser resolvidos antes desta inativação. Esta confirmação ficará registrada junto ao meu usuário.
                </div>
              </div>
            </div>
          </div>

          <DialogFooter style={{ marginTop:16 }}>
            <Button variant="outline" onClick={() => setModalInativar(false)} disabled={inativarSaving}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarInativacao}
              disabled={inativarSaving || inativarLoadingPend || !inativarConfirmou || !inativarData}
              style={{ background:'#dc2626', color:'#fff', opacity: (!inativarConfirmou || !inativarData) ? 0.5 : 1 }}
            >
              {inativarSaving ? <><Loader2 size={14} className="animate-spin" style={{ marginRight:6 }} />Inativando…</> : '🔴 Confirmar inativação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

// ─── HistoricoContrato ────────────────────────────────────────────────────────
interface HistoricoContrato {
  id: string
  colaborador_id: string
  tipo_contrato: 'clt' | 'autonomo' | 'pj'
  data_inicio: string
  data_fim: string | null
  observacao: string | null
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
  // Histórico de contratos
  historicoContratos: HistoricoContrato[]
  onSalvarPeriodo: (periodo: Omit<HistoricoContrato,'id'|'created_at'>) => Promise<void>
  onEncerrarPeriodo: (id: string, dataFim: string) => Promise<void>
  onExcluirPeriodo: (id: string) => Promise<void>
}

function FuncaoSection({
  form, funcoes, obras, editId, funcaoOriginal, chapaOriginal,
  gerando, trocandoFuncao, motivoTroca, setMotivoTroca,
  onFuncaoChange, onSet, onDataAdmissao, onGotoFuncoes, temPontoLancado,
  historicoContratos, onSalvarPeriodo, onEncerrarPeriodo, onExcluirPeriodo,
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

  // Estados locais para o formulário de novo período de contrato
  const [novoTipoContrato, setNovoTipoContrato] = React.useState<'clt'|'autonomo'|'pj'>('clt')
  const [novoDataInicio, setNovoDataInicio] = React.useState('')
  const [novoObs, setNovoObs] = React.useState('')
  const [salvandoPeriodo, setSalvandoPeriodo] = React.useState(false)

  async function handleSalvarPeriodo() {
    if(!editId || !novoDataInicio) return
    setSalvandoPeriodo(true)
    // Verificar sobreposição
    const conflito = historicoContratos.find(p => {
      if(p.data_fim === null) return novoDataInicio >= p.data_inicio
      return novoDataInicio >= p.data_inicio && novoDataInicio <= p.data_fim
    })
    if(conflito){ alert('A data de início conflita com um período já existente.'); setSalvandoPeriodo(false); return }
    await onSalvarPeriodo({ colaborador_id: editId, tipo_contrato: novoTipoContrato, data_inicio: novoDataInicio, data_fim: null, observacao: novoObs||null })
    setNovoDataInicio(''); setNovoObs('')
    setSalvandoPeriodo(false)
  }

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
              ⚠️ Ponto em Aberto — Função e Contrato bloqueados
            </div>
            <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>
              Este colaborador possui <strong>ponto(s) em aberto</strong> (rascunho ou aguardando aprovação).<br />
              Finalize ou aprove os lançamentos antes de alterar função ou tipo de contrato.<br />
              Lançamentos já <strong>aprovados/pagos</strong> não são afetados — o valor foi congelado no snapshot.
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
            ) : editId ? (
              // MODO EDIÇÃO: tipo_contrato é somente leitura
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 8,
                  background: form.tipo_contrato === 'clt' ? '#dbeafe' : '#fef3c7',
                  border: `2px solid ${form.tipo_contrato === 'clt' ? '#93c5fd' : '#fde68a'}`,
                }}>
                  <span style={{ fontSize: 18 }}>{form.tipo_contrato === 'clt' ? '🟦' : '🟧'}</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: form.tipo_contrato === 'clt' ? '#1d4ed8' : '#d97706' }}>
                      {form.tipo_contrato?.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      🔒 Somente leitura — para mudar, use "Encerrar e Recontatar"
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // MODO CRIAÇÃO: Select normal
              <Select
                value={
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

          {/* Salário */}
          <Field label="Salário Mensal (R$)">
            <input
              type="text"
              placeholder="0,00"
              value={form.salario}
              onChange={e => onSet('salario', e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)', fontSize: 13, width: '100%' }}
            />
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

          {/* Obra — SearchableSelect */}
          <Field label="Obra" span={2}>
            <SearchableSelect
              options={obras.map(o => ({ value: o.id, label: o.nome }))}
              value={form.obra_id || ''}
              onChange={v => onSet('obra_id', v)}
              placeholder="— Sem obra vinculada —"
              emptyLabel="— Sem obra vinculada —"
            />
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

      {/* ── HISTÓRICO DE CONTRATOS ──────────────────────────────────── */}
      {editId && (
        <Sec title="📋 Histórico de Contratos">
          {/* Lista de períodos */}
          {historicoContratos.length === 0 ? (
            <div style={{fontSize:12,color:'var(--muted-foreground)',padding:'8px 0'}}>Nenhum período cadastrado ainda.</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
              {[...historicoContratos].sort((a,b)=>b.data_inicio.localeCompare(a.data_inicio)).map(p=>{
                const ativo = p.data_fim === null
                const cor = p.tipo_contrato==='clt' ? '#1d4ed8' : '#d97706'
                const label = p.tipo_contrato==='clt' ? '🟦 CLT' : '🟧 Autônomo/PJ'
                return (
                  <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderRadius:8,border:`1px solid ${ativo?cor+'66':'var(--border)'}`,background:ativo?cor+'0a':'transparent'}}>
                    <span style={{fontWeight:700,fontSize:12,color:cor,minWidth:80}}>{label}</span>
                    <span style={{fontSize:12,color:'var(--muted-foreground)',flex:1}}>
                      {new Date(p.data_inicio+'T12:00').toLocaleDateString('pt-BR')}
                      {' → '}
                      {p.data_fim ? new Date(p.data_fim+'T12:00').toLocaleDateString('pt-BR') : <strong style={{color:'#16a34a'}}>atual</strong>}
                    </span>
                    {p.observacao && <span style={{fontSize:11,color:'var(--muted-foreground)',fontStyle:'italic'}}>{p.observacao}</span>}
                    {ativo && (
                      <button onClick={()=>{
                        const d = prompt('Informe a data de encerramento deste período (AAAA-MM-DD):')
                        if(d) onEncerrarPeriodo(p.id, d)
                      }} style={{fontSize:10,padding:'2px 8px',borderRadius:4,border:'1px solid #d97706',background:'transparent',color:'#d97706',cursor:'pointer'}}>
                        Encerrar
                      </button>
                    )}
                    {!ativo && (
                      <button onClick={()=>{ if(confirm('Excluir este período?')) onExcluirPeriodo(p.id) }}
                        style={{fontSize:10,padding:'2px 8px',borderRadius:4,border:'1px solid #dc2626',background:'transparent',color:'#dc2626',cursor:'pointer'}}>
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Sec>
      )}

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

      {/* ── Exame Admissional ─────────────────────────────────────────── */}
      <Sec title="Exame Admissional (ASO)">
        <Grid cols={1}>
          <Field label="Data do Exame Admissional">
            <Input type="date" value={(form as any).data_exame_admissional ?? ''} onChange={e => onSet('data_exame_admissional', e.target.value)} />
          </Field>
        </Grid>
      </Sec>

    </div>
  )
}

// ─── micro-componentes ────────────────────────────────────────────────────────
function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '14px 16px', marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#0d3f56' }}>
          {title}
        </span>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, #cbd5e1, transparent)' }} />
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
      <Label style={{ fontSize: 11, color: '#475569', fontWeight: 600, letterSpacing: '0.03em' }}>{label}</Label>
      {children}
    </div>
  )
}
