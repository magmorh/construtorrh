import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, BookOpen, Search, Tag, Building2,
  ChevronRight, HardHat, Globe, DollarSign, Settings, Copy,
  CheckCircle2, AlertCircle, Layers,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useProfile } from '@/hooks/useProfile'
import { traduzirErro } from '@/lib/erros'

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Atividade global — cadastro padrão, sem preço */
interface Atividade {
  id: string
  descricao: string
  unidade: string
  categoria: string | null
  ativo: boolean
  codigo: string | null
}

/** Preço de uma atividade em uma obra específica */
interface AtividadePreco {
  id: string
  atividade_id: string
  obra_id: string
  preco_unitario: number
  ativo: boolean
}

interface Obra {
  id: string
  nome: string
  codigo: string | null
  status: string | null
}

type Aba = 'atividades' | 'precos'

const UNIDADES = ['m²', 'm³', 'm', 'un', 'pç', 'kg', 't', 'h', 'verba', 'CJ', 'Vb', 'outro']
const CATEGORIAS = [
  'Alvenaria', 'Argamassa', 'Concretagem', 'Revestimento', 'Pintura',
  'Instalações', 'Estrutura', 'Cobertura', 'Esquadrias', 'Terraplanagem',
  'Fundação', 'Impermeabilização', 'Outros',
]

const ATIV_EMPTY = (): Omit<Atividade, 'id'> => ({
  descricao: '', unidade: 'm²', categoria: null, ativo: true, codigo: null,
})

// ─── Helper: badge de status ──────────────────────────────────────────────────
function BadgeAtivo({ ativo }: { ativo: boolean }) {
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
      background: ativo ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
      color: ativo ? '#15803d' : '#dc2626',
    }}>{ativo ? 'Ativo' : 'Inativo'}</span>
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function Playbooks() {
  const { permissions: { canCreate, canEdit, canDelete } } = useProfile()

  const [aba, setAba] = useState<Aba>('atividades')

  // ─── Dados globais ─────────────────────────────────────────────────────────
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [obras, setObras]           = useState<Obra[]>([])
  const [precos, setPrecos]         = useState<AtividadePreco[]>([])
  const [prodPorItem, setProdPorItem] = useState<Record<string, number>>({})
  const [loading, setLoading]       = useState(true)

  // ─── Aba Atividades ────────────────────────────────────────────────────────
  const [searchAtiv, setSearchAtiv]       = useState('')
  const [catFiltro, setCatFiltro]         = useState('todas')
  const [modalAtiv, setModalAtiv]         = useState(false)
  const [editAtiv, setEditAtiv]           = useState<Atividade | null>(null)
  const [formAtiv, setFormAtiv]           = useState(ATIV_EMPTY())
  const [savingAtiv, setSavingAtiv]       = useState(false)
  const [deleteAtiv, setDeleteAtiv]       = useState<Atividade | null>(null)

  // ─── Aba Preços por Obra ───────────────────────────────────────────────────
  const [obraSel, setObraSel]             = useState<Obra | null>(null)
  const [searchObra, setSearchObra]       = useState('')
  const [savingPreco, setSavingPreco]     = useState<string | null>(null)  // atividade_id em saving
  const [editandoPreco, setEditandoPreco] = useState<string | null>(null)  // atividade_id em edição
  const [valorTemp, setValorTemp]         = useState('')
  const [modalCopiar, setModalCopiar]     = useState(false)
  const [obraOrigem, setObraOrigem]       = useState('')
  const [copiando, setCopiando]           = useState(false)

  // ── Fetch tudo ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [
      { data: ativRaw },
      { data: obrasRaw },
      { data: precosRaw },
      { data: prodPPD },
      { data: prodProd },
    ] = await Promise.all([
      supabase.from('playbook_atividades').select('*').order('categoria').order('descricao'),
      supabase.from('obras').select('id, nome, codigo, status').order('nome'),
      supabase.from('playbook_precos').select('*'),
      supabase.from('portal_ponto_diario').select('playbook_item_id').not('playbook_item_id', 'is', null),
      supabase.from('portal_producao').select('playbook_item_id').not('playbook_item_id', 'is', null),
    ])
    setAtividades((ativRaw ?? []) as Atividade[])
    setObras((obrasRaw ?? []) as Obra[])
    setPrecos((precosRaw ?? []) as AtividadePreco[])
    // Contar usos de cada atividade
    const cnt: Record<string, number> = {}
    ;[...(prodPPD ?? []), ...(prodProd ?? [])].forEach((p: any) => {
      if (p.playbook_item_id) cnt[p.playbook_item_id] = (cnt[p.playbook_item_id] ?? 0) + 1
    })
    setProdPorItem(cnt)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ─── Mapa rápido precos: atividade_id+obra_id → AtividadePreco ─────────────
  const precosMap = useMemo(() => {
    const m = new Map<string, AtividadePreco>()
    precos.forEach(p => m.set(`${p.atividade_id}::${p.obra_id}`, p))
    return m
  }, [precos])

  // ─── Derivados aba atividades ───────────────────────────────────────────────
  const ativFiltradas = useMemo(() => {
    const q = searchAtiv.toLowerCase()
    return atividades.filter(a =>
      (!q || a.descricao.toLowerCase().includes(q) || (a.codigo ?? '').toLowerCase().includes(q)) &&
      (catFiltro === 'todas' || a.categoria === catFiltro)
    )
  }, [atividades, searchAtiv, catFiltro])

  const ativPorCat = useMemo(() => {
    const m = new Map<string, Atividade[]>()
    ativFiltradas.forEach(a => {
      const c = a.categoria ?? 'Outros'
      if (!m.has(c)) m.set(c, [])
      m.get(c)!.push(a)
    })
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [ativFiltradas])

  // ─── Derivados aba preços ───────────────────────────────────────────────────
  const precosObra = useMemo(() => {
    if (!obraSel) return []
    return atividades.filter(a => a.ativo)
  }, [atividades, obraSel])

  const totalObra = useMemo(() => {
    if (!obraSel) return 0
    return atividades.reduce((s, a) => {
      const p = precosMap.get(`${a.id}::${obraSel.id}`)
      return s + (p?.preco_unitario ?? 0)
    }, 0)
  }, [atividades, precosMap, obraSel])

  const atvsComPreco = useMemo(() => {
    if (!obraSel) return 0
    return atividades.filter(a => precosMap.has(`${a.id}::${obraSel.id}`)).length
  }, [atividades, precosMap, obraSel])

  // ─── CRUD Atividades ────────────────────────────────────────────────────────
  function openNovaAtiv() {
    setEditAtiv(null); setFormAtiv(ATIV_EMPTY()); setModalAtiv(true)
  }
  function openEditAtiv(a: Atividade) {
    setEditAtiv(a)
    setFormAtiv({ descricao: a.descricao, unidade: a.unidade, categoria: a.categoria, ativo: a.ativo, codigo: a.codigo })
    setModalAtiv(true)
  }
  const setFA = <K extends keyof typeof formAtiv>(k: K, v: (typeof formAtiv)[K]) =>
    setFormAtiv(p => ({ ...p, [k]: v }))

  async function handleSaveAtiv() {
    if (!formAtiv.descricao.trim()) { toast.error('Informe a descrição'); return }
    setSavingAtiv(true)
    const payload = {
      descricao: formAtiv.descricao.trim(),
      unidade: formAtiv.unidade,
      categoria: formAtiv.categoria,
      ativo: formAtiv.ativo,
      codigo: formAtiv.codigo?.trim() || null,
    }
    const { error } = editAtiv
      ? await supabase.from('playbook_atividades').update(payload).eq('id', editAtiv.id)
      : await supabase.from('playbook_atividades').insert(payload)
    setSavingAtiv(false)
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success(editAtiv ? 'Atividade atualizada!' : 'Atividade criada!')
    setModalAtiv(false); fetchData()
  }

  async function handleDeleteAtiv() {
    if (!deleteAtiv) return
    if ((prodPorItem[deleteAtiv.id] ?? 0) > 0) {
      toast.error('Há lançamentos vinculados — não é possível excluir.')
      setDeleteAtiv(null); return
    }
    const { error } = await supabase.from('playbook_atividades').delete().eq('id', deleteAtiv.id)
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success('Atividade excluída!'); setDeleteAtiv(null); fetchData()
  }

  // ─── CRUD Preços por Obra ──────────────────────────────────────────────────
  async function salvarPreco(ativId: string, valor: number) {
    if (!obraSel) return
    setSavingPreco(ativId)
    const existing = precosMap.get(`${ativId}::${obraSel.id}`)
    const payload = { atividade_id: ativId, obra_id: obraSel.id, preco_unitario: valor, ativo: true }
    const { error } = existing
      ? await supabase.from('playbook_precos').update({ preco_unitario: valor }).eq('id', existing.id)
      : await supabase.from('playbook_precos').insert(payload)
    setSavingPreco(null)
    if (error) { toast.error(traduzirErro(error.message)); return }
    toast.success('Preço salvo!')
    setEditandoPreco(null); setValorTemp(''); fetchData()
  }

  async function removerPreco(ativId: string) {
    if (!obraSel) return
    const existing = precosMap.get(`${ativId}::${obraSel.id}`)
    if (!existing) return
    await supabase.from('playbook_precos').delete().eq('id', existing.id)
    toast.success('Preço removido'); fetchData()
  }

  async function copiarPrecos() {
    if (!obraOrigem || !obraSel || obraOrigem === obraSel.id) return
    setCopiando(true)
    const precosOrigem = precos.filter(p => p.obra_id === obraOrigem)
    let ok = 0
    for (const p of precosOrigem) {
      const existing = precosMap.get(`${p.atividade_id}::${obraSel.id}`)
      if (existing) {
        await supabase.from('playbook_precos').update({ preco_unitario: p.preco_unitario }).eq('id', existing.id)
      } else {
        await supabase.from('playbook_precos').insert({ atividade_id: p.atividade_id, obra_id: obraSel.id, preco_unitario: p.preco_unitario, ativo: true })
      }
      ok++
    }
    setCopiando(false); setModalCopiar(false)
    toast.success(`${ok} preço(s) copiados de "${obras.find(o => o.id === obraOrigem)?.nome}"!`)
    fetchData()
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-root" style={{ height: '100%' }}>
      <PageHeader
        title="Playbook de Atividades"
        subtitle={`${atividades.length} atividade(s) padrão · ${obras.length} obra(s)`}
        action={undefined}
      />

      {/* ── Abas ── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        {([
          { key: 'atividades', label: '📋 Atividades Padrão', icon: <Layers size={14} /> },
          { key: 'precos',     label: '💰 Preços por Obra',   icon: <DollarSign size={14} /> },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setAba(t.key)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: aba === t.key ? 700 : 500, fontSize: 13,
            borderBottom: aba === t.key ? '2px solid var(--primary)' : '2px solid transparent',
            color: aba === t.key ? 'var(--primary)' : 'var(--muted-foreground)',
            marginBottom: -1,
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSkeleton rows={5} /> : (

        /* ════════ ABA: ATIVIDADES PADRÃO ════════════════════════════════════ */
        aba === 'atividades' ? (
          <div>
            {/* Toolbar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)', pointerEvents: 'none' }} />
                <Input style={{ paddingLeft: 28 }} placeholder="Buscar por descrição ou código…" value={searchAtiv} onChange={e => setSearchAtiv(e.target.value)} />
              </div>
              <Select value={catFiltro} onValueChange={setCatFiltro}>
                <SelectTrigger style={{ width: 180 }}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as categorias</SelectItem>
                  {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {canCreate && (
                <Button onClick={openNovaAtiv} size="sm" style={{ gap: 6 }}>
                  <Plus size={14} /> Nova Atividade
                </Button>
              )}
            </div>

            {/* Resumo */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { label: 'Total', val: atividades.length, cor: '#2563eb', bg: '#eff6ff' },
                { label: 'Ativas', val: atividades.filter(a => a.ativo).length, cor: '#16a34a', bg: '#f0fdf4' },
                { label: 'Categorias', val: new Set(atividades.map(a => a.categoria ?? 'Outros')).size, cor: '#7c3aed', bg: '#f5f3ff' },
              ].map(k => (
                <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.cor}33`, borderRadius: 10, padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: k.cor }}>{k.val}</span>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{k.label}</span>
                </div>
              ))}
            </div>

            {/* Lista por categoria */}
            {ativFiltradas.length === 0 ? (
              <EmptyState icon={<BookOpen size={28} />} title="Nenhuma atividade" description='Clique em "Nova Atividade" para criar o catálogo padrão.' action={canCreate ? <Button size="sm" onClick={openNovaAtiv}><Plus size={13} /> Nova Atividade</Button> : undefined} />
            ) : ativPorCat.map(([cat, itens]) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(37,99,235,0.04)', borderRadius: '8px 8px 0 0', border: '1px solid var(--border)' }}>
                  <Tag size={11} color="var(--primary)" />
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>({itens.length})</span>
                </div>
                <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                  <Table>
                    <TableHeader>
                      <TableRow style={{ background: 'var(--muted)' }}>
                        <TableHead style={{ width: 80 }}>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead style={{ width: 80, textAlign: 'center' }}>Unidade</TableHead>
                        <TableHead style={{ width: 80, textAlign: 'center' }}>Status</TableHead>
                        <TableHead style={{ width: 90, textAlign: 'center' }}>Usos</TableHead>
                        <TableHead style={{ width: 80, textAlign: 'right' }}>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((a, idx) => (
                        <TableRow key={a.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--muted)/10' }}>
                          <TableCell>
                            {a.codigo ? (
                              <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#f1f5f9', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>{a.codigo}</span>
                            ) : <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>—</span>}
                          </TableCell>
                          <TableCell style={{ fontWeight: 500, fontSize: 13 }}>{a.descricao}</TableCell>
                          <TableCell style={{ textAlign: 'center' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, background: 'var(--muted)', borderRadius: 4, padding: '2px 8px' }}>{a.unidade}</span>
                          </TableCell>
                          <TableCell style={{ textAlign: 'center' }}><BadgeAtivo ativo={a.ativo} /></TableCell>
                          <TableCell style={{ textAlign: 'center' }}>
                            {(prodPorItem[a.id] ?? 0) > 0 ? (
                              <span style={{ fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#b45309', borderRadius: 6, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <HardHat size={11} /> {prodPorItem[a.id]}
                              </span>
                            ) : <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>—</span>}
                          </TableCell>
                          <TableCell style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                              {canEdit && <Button variant="ghost" size="icon" style={{ width: 30, height: 30 }} onClick={() => openEditAtiv(a)}><Pencil size={13} /></Button>}
                              {canDelete && (prodPorItem[a.id] ?? 0) === 0 && (
                                <Button variant="ghost" size="icon" style={{ width: 30, height: 30, color: '#dc2626' }} onClick={() => setDeleteAtiv(a)}><Trash2 size={13} /></Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>

        /* ════════ ABA: PREÇOS POR OBRA ══════════════════════════════════════ */
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>

            {/* Coluna Obras */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}>
                <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={13} color="var(--primary)" /> Obras
                </p>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                  <Input style={{ paddingLeft: 28, height: 30, fontSize: 12 }} placeholder="Filtrar…" value={searchObra} onChange={e => setSearchObra(e.target.value)} />
                </div>
              </div>
              <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                {obras.filter(o => !searchObra || o.nome.toLowerCase().includes(searchObra.toLowerCase())).map(obra => {
                  const qtd = precos.filter(p => p.obra_id === obra.id).length
                  const isSel = obraSel?.id === obra.id
                  const pct = atividades.length > 0 ? Math.round((qtd / atividades.filter(a => a.ativo).length) * 100) : 0
                  return (
                    <button key={obra.id} type="button" onClick={() => setObraSel(obra)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 14px',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      borderLeft: isSel ? '3px solid var(--primary)' : '3px solid transparent',
                      background: isSel ? 'rgba(37,99,235,0.06)' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700,
                        background: isSel ? 'var(--primary)' : 'var(--muted)',
                        color: isSel ? '#fff' : 'var(--muted-foreground)',
                      }}>
                        {obra.codigo?.slice(0, 3).toUpperCase() ?? obra.nome.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isSel ? 600 : 400, color: isSel ? 'var(--primary)' : 'var(--foreground)' }}>
                          {obra.nome}
                        </p>
                        <div style={{ marginTop: 3 }}>
                          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#e2e8f0', borderRadius: 2, transition: 'width .4s' }} />
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{qtd} preços ({pct}%)</span>
                        </div>
                      </div>
                      <ChevronRight size={13} color={isSel ? 'var(--primary)' : 'var(--border)'} />
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Coluna Preços */}
            {!obraSel ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, border: '2px dashed var(--border)', borderRadius: 10, color: 'var(--muted-foreground)', gap: 10 }}>
                <DollarSign size={38} style={{ opacity: 0.2 }} />
                <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Selecione uma obra</p>
                <p style={{ margin: 0, fontSize: 13 }}>← Escolha a obra para configurar os preços</p>
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--card)', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--muted)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {obraSel.nome}
                      {obraSel.codigo && <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 7px', borderRadius: 20, background: 'rgba(37,99,235,0.1)', color: 'var(--primary)', fontFamily: 'monospace' }}>{obraSel.codigo}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 2 }}>
                      {atvsComPreco} de {atividades.filter(a => a.ativo).length} atividades com preço configurado
                      {totalObra > 0 && <span style={{ marginLeft: 10, color: '#b45309' }}>· Soma: {formatCurrency(totalObra)}</span>}
                    </div>
                  </div>
                  {canCreate && (
                    <Button variant="outline" size="sm" onClick={() => { setObraOrigem(''); setModalCopiar(true) }} style={{ gap: 5 }}>
                      <Copy size={13} /> Copiar preços de outra obra
                    </Button>
                  )}
                </div>

                {/* Alerta de atividades sem preço */}
                {atvsComPreco < atividades.filter(a => a.ativo).length && (
                  <div style={{ padding: '8px 16px', background: '#fefce8', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={14} color="#b45309" />
                    <span style={{ fontSize: 12, color: '#92400e' }}>
                      {atividades.filter(a => a.ativo).length - atvsComPreco} atividade(s) sem preço — aparecerão como R$ 0,00 no portal
                    </span>
                  </div>
                )}

                {/* Tabela de preços */}
                {atividades.filter(a => a.ativo).length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
                    Nenhuma atividade ativa. Cadastre atividades primeiro na aba "Atividades Padrão".
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <Table>
                      <TableHeader>
                        <TableRow style={{ background: 'var(--muted)' }}>
                          <TableHead style={{ width: 80 }}>Código</TableHead>
                          <TableHead>Atividade</TableHead>
                          <TableHead style={{ width: 80, textAlign: 'center' }}>Unidade</TableHead>
                          <TableHead style={{ width: 80 }}>Categoria</TableHead>
                          <TableHead style={{ width: 160, textAlign: 'right' }}>Preço Unit. (R$)</TableHead>
                          <TableHead style={{ width: 80, textAlign: 'center' }}>Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {atividades.filter(a => a.ativo)
                          .sort((a, b) => (a.categoria ?? 'Outros').localeCompare(b.categoria ?? 'Outros') || a.descricao.localeCompare(b.descricao))
                          .map((a, idx) => {
                            const precoAtual = precosMap.get(`${a.id}::${obraSel.id}`)
                            const emEdicao = editandoPreco === a.id
                            const salvando = savingPreco === a.id
                            return (
                              <TableRow key={a.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'var(--muted)/10' }}>
                                <TableCell>
                                  {a.codigo ? <span style={{ fontFamily: 'monospace', fontSize: 11, background: '#f1f5f9', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>{a.codigo}</span> : '—'}
                                </TableCell>
                                <TableCell>
                                  <div style={{ fontWeight: 500, fontSize: 13 }}>{a.descricao}</div>
                                </TableCell>
                                <TableCell style={{ textAlign: 'center' }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>{a.unidade}</span>
                                </TableCell>
                                <TableCell>
                                  <span style={{ fontSize: 11, background: 'rgba(37,99,235,0.07)', color: 'var(--primary)', borderRadius: 4, padding: '2px 7px' }}>{a.categoria ?? '—'}</span>
                                </TableCell>
                                <TableCell style={{ textAlign: 'right' }}>
                                  {emEdicao ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                                      <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--muted-foreground)' }}>R$</span>
                                        <Input
                                          type="number" step="0.01" min="0"
                                          autoFocus
                                          value={valorTemp}
                                          onChange={e => setValorTemp(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') salvarPreco(a.id, parseFloat(valorTemp) || 0)
                                            if (e.key === 'Escape') { setEditandoPreco(null); setValorTemp('') }
                                          }}
                                          style={{ width: 110, paddingLeft: 26, textAlign: 'right' }}
                                        />
                                      </div>
                                      <Button size="icon" style={{ width: 28, height: 28, background: '#16a34a' }} disabled={salvando}
                                        onClick={() => salvarPreco(a.id, parseFloat(valorTemp) || 0)}>
                                        <CheckCircle2 size={13} color="#fff" />
                                      </Button>
                                      <Button variant="ghost" size="icon" style={{ width: 28, height: 28 }}
                                        onClick={() => { setEditandoPreco(null); setValorTemp('') }}>
                                        ✕
                                      </Button>
                                    </div>
                                  ) : (
                                    <span
                                      style={{ fontWeight: 700, fontSize: 14, color: precoAtual ? '#15803d' : '#94a3b8', cursor: canEdit ? 'pointer' : 'default' }}
                                      onClick={() => {
                                        if (!canEdit) return
                                        setEditandoPreco(a.id)
                                        setValorTemp(precoAtual ? String(precoAtual.preco_unitario) : '')
                                      }}
                                      title="Clique para editar o preço"
                                    >
                                      {precoAtual ? formatCurrency(precoAtual.preco_unitario) : '+ definir preço'}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell style={{ textAlign: 'center' }}>
                                  {precoAtual && canEdit && (
                                    <Button variant="ghost" size="icon" style={{ width: 28, height: 28, color: '#dc2626' }}
                                      title="Remover preço desta obra"
                                      onClick={() => removerPreco(a.id)}>
                                      <Trash2 size={12} />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Rodapé */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, padding: '10px 16px', borderTop: '2px solid var(--border)', background: 'var(--muted)' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                    {atvsComPreco}/{atividades.filter(a => a.ativo).length} preços definidos
                  </span>
                  {totalObra > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>
                      Soma tabela: {formatCurrency(totalObra)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ════════ Modal Nova/Editar Atividade ════════════════════════════════ */}
      <Dialog open={modalAtiv} onOpenChange={setModalAtiv}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={16} color="var(--primary)" />
              {editAtiv ? 'Editar Atividade' : 'Nova Atividade Padrão'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Descrição *</Label>
              <Input value={formAtiv.descricao} onChange={e => setFA('descricao', e.target.value)} placeholder="Ex.: Reboco externo, Concretagem laje…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Código (opcional)</Label>
                <Input value={formAtiv.codigo ?? ''} onChange={e => setFA('codigo', e.target.value || null)} placeholder="Ex.: ALV-001" style={{ fontFamily: 'monospace' }} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Unidade *</Label>
                <Select value={formAtiv.unidade} onValueChange={v => setFA('unidade', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <Select value={formAtiv.categoria ?? 'Outros'} onValueChange={v => setFA('categoria', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setFA('ativo', !formAtiv.ativo)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formAtiv.ativo ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${formAtiv.ativo ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <Label className="text-sm cursor-pointer" onClick={() => setFA('ativo', !formAtiv.ativo)}>
                {formAtiv.ativo ? 'Ativa' : 'Inativa'}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAtiv(false)}>Cancelar</Button>
            <Button disabled={savingAtiv} onClick={handleSaveAtiv}>{savingAtiv ? 'Salvando…' : editAtiv ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ Modal Copiar Preços ════════════════════════════════════════ */}
      <Dialog open={modalCopiar} onOpenChange={setModalCopiar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Copy size={15} color="var(--primary)" /> Copiar Preços de Outra Obra
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>
              Selecione a obra de origem. Os preços serão copiados para <strong>{obraSel?.nome}</strong>.
            </p>
            <Select value={obraOrigem} onValueChange={setObraOrigem}>
              <SelectTrigger><SelectValue placeholder="Selecione a obra de origem…" /></SelectTrigger>
              <SelectContent>
                {obras.filter(o => o.id !== obraSel?.id && precos.filter(p => p.obra_id === o.id).length > 0).map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.nome} ({precos.filter(p => p.obra_id === o.id).length} preços)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCopiar(false)}>Cancelar</Button>
            <Button disabled={!obraOrigem || copiando} onClick={copiarPrecos}>
              {copiando ? 'Copiando…' : 'Copiar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ AlertDialog Excluir Atividade ═════════════════════════════ */}
      <AlertDialog open={!!deleteAtiv} onOpenChange={o => !o && setDeleteAtiv(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir atividade?</AlertDialogTitle>
            <AlertDialogDescription>
              A atividade <strong>"{deleteAtiv?.descricao}"</strong> será removida permanentemente do catálogo padrão, assim como todos os preços por obra vinculados a ela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAtiv} style={{ background: '#dc2626', color: '#fff' }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
