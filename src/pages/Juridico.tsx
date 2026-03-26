import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Scale, UserX, Search, Plus, Trash2, FileText, AlertTriangle,
  X, ChevronDown, ChevronUp, Loader2, Shield, ShieldAlert,
} from 'lucide-react'

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Colab {
  id: string; nome: string; chapa: string; cpf: string | null
  rg: string | null; pis_nit: string | null; data_nascimento: string | null
  funcao_id: string | null; data_admissao: string | null; status: string
  telefone: string | null; email: string | null; endereco: string | null
  cnh: string | null; tipo_contrato: string | null; salario_base: number | null
  funcoes?: { nome: string } | null; obras?: { nome: string } | null
}

interface ListaNegra {
  id: string; nome: string; cpf: string | null; motivo: string
  data_registro: string; processo_numero: string | null
  observacoes: string | null; created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (d: string | null) => d
  ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
const fmtCPF = (v: string | null) => {
  if (!v) return '—'
  const n = v.replace(/\D/g, '')
  return n.length === 11 ? n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : v
}
const fmtCur = (v: number | null) =>
  v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Juridico() {
  const [aba, setAba] = useState<'ficha' | 'lista_negra'>('ficha')

  // ficha
  const [colabs, setColabs]         = useState<Colab[]>([])
  const [query, setQuery]           = useState('')
  const [selecionado, setSelecionado] = useState<Colab | null>(null)
  const [loadingFicha, setLoadingFicha] = useState(false)
  const [fichaData, setFichaData]   = useState<Record<string, any>>({})

  // lista negra
  const [listaNegra, setListaNegra]   = useState<ListaNegra[]>([])
  const [loadingLN, setLoadingLN]     = useState(false)
  const [modalLN, setModalLN]         = useState(false)
  const [formLN, setFormLN]           = useState({ nome: '', cpf: '', motivo: '', processo_numero: '', observacoes: '' })
  const [savingLN, setSavingLN]       = useState(false)
  const [deleteLNId, setDeleteLNId]   = useState<string | null>(null)
  const [searchLN, setSearchLN]       = useState('')

  // ── Buscar colaboradores ──────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('colaboradores')
      .select('id,nome,chapa,cpf,status')
      .order('nome')
      .then(({ data }) => setColabs((data ?? []) as any))
  }, [])

  // ── Buscar lista negra ────────────────────────────────────────────────────
  const fetchListaNegra = useCallback(async () => {
    setLoadingLN(true)
    const { data } = await supabase.from('lista_negra_juridico')
      .select('*').order('created_at', { ascending: false })
    setListaNegra((data ?? []) as any)
    setLoadingLN(false)
  }, [])

  useEffect(() => { fetchListaNegra() }, [fetchListaNegra])

  // ── Carregar ficha completa do colaborador ────────────────────────────────
  async function carregarFicha(c: Colab) {
    setLoadingFicha(true); setSelecionado(c); setFichaData({})
    const [colabRes, ocRes, eptRes, pontRes, adRes, premRes, docRes, atestRes, vtrRes] = await Promise.all([
      supabase.from('colaboradores').select('*, funcoes(nome), obras(nome)').eq('id', c.id).single(),
      supabase.from('ocorrencias').select('*').eq('colaborador_id', c.id).order('data', { ascending: false }),
      supabase.from('epis_entregues').select('*').eq('colaborador_id', c.id).order('data_entrega', { ascending: false }),
      supabase.from('ponto_lancamentos').select('*').eq('colaborador_id', c.id).order('data', { ascending: false }).limit(60),
      supabase.from('adiantamentos').select('*').eq('colaborador_id', c.id).order('created_at', { ascending: false }),
      supabase.from('premios').select('*').eq('colaborador_id', c.id).order('created_at', { ascending: false }),
      supabase.from('documentos').select('*').eq('colaborador_id', c.id).order('created_at', { ascending: false }),
      supabase.from('atestados').select('*').eq('colaborador_id', c.id).order('data', { ascending: false }),
      supabase.from('vale_transporte').select('*').eq('colaborador_id', c.id).order('created_at', { ascending: false }),
    ])
    setFichaData({
      colab:      colabRes.data,
      ocorrencias: ocRes.data ?? [],
      epis:       eptRes.data ?? [],
      ponto:      pontRes.data ?? [],
      adiantamentos: adRes.data ?? [],
      premios:    premRes.data ?? [],
      documentos: docRes.data ?? [],
      atestados:  atestRes.data ?? [],
      vt:         vtrRes.data ?? [],
    })
    setLoadingFicha(false)
  }

  // ── Salvar lista negra ────────────────────────────────────────────────────
  async function salvarLN() {
    if (!formLN.nome.trim()) return toast.error('Nome obrigatório')
    if (!formLN.motivo.trim()) return toast.error('Motivo obrigatório')
    setSavingLN(true)
    const { error } = await supabase.from('lista_negra_juridico').insert({
      nome:            formLN.nome.trim(),
      cpf:             formLN.cpf.replace(/\D/g, '') || null,
      motivo:          formLN.motivo.trim(),
      processo_numero: formLN.processo_numero.trim() || null,
      observacoes:     formLN.observacoes.trim() || null,
      data_registro:   new Date().toISOString().slice(0, 10),
    })
    setSavingLN(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('✅ Adicionado à lista negra')
    setModalLN(false)
    setFormLN({ nome: '', cpf: '', motivo: '', processo_numero: '', observacoes: '' })
    fetchListaNegra()
  }

  async function excluirLN(id: string) {
    const { error } = await supabase.from('lista_negra_juridico').delete().eq('id', id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Removido da lista')
    setDeleteLNId(null)
    fetchListaNegra()
  }

  // ── Gerar PDF da ficha ────────────────────────────────────────────────────
  function gerarPDF() {
    if (!fichaData.colab) return
    const d = fichaData.colab as any
    const ocs = fichaData.ocorrencias as any[]
    const ads = fichaData.adiantamentos as any[]
    const prs = fichaData.premios as any[]
    const docs = fichaData.documentos as any[]
    const ats = fichaData.atestados as any[]

    const sec = (titulo: string, corpo: string) => `
      <div class="secao">
        <div class="sec-titulo">${titulo}</div>
        ${corpo}
      </div>`

    const row2 = (l1: string, v1: string, l2: string, v2: string) => `
      <div class="row2">
        <div class="campo"><span class="label">${l1}</span><span class="valor">${v1}</span></div>
        <div class="campo"><span class="label">${l2}</span><span class="valor">${v2}</span></div>
      </div>`

    const tbl = (headers: string[], rows: string[][]) => `
      <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Ficha Jurídica — ${d.nome}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:24px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e3a5f;padding-bottom:12px;margin-bottom:18px}
      .header-left h1{font-size:20px;color:#1e3a5f;margin-bottom:3px}
      .header-left p{font-size:11px;color:#6b7280}
      .header-right{text-align:right;font-size:11px;color:#6b7280}
      .header-right .periodo{font-size:14px;font-weight:800;color:#1e3a5f}
      .badge-status{display:inline-block;padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;margin-top:6px}
      .ativo{background:#dcfce7;color:#15803d} .inativo{background:#fee2e2;color:#dc2626}
      .secao{margin-bottom:20px;break-inside:avoid}
      .sec-titulo{background:#1e3a5f;color:#fff;padding:6px 12px;font-size:11px;font-weight:800;border-radius:5px 5px 0 0;text-transform:uppercase;letter-spacing:0.05em}
      .sec-body{background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 5px 5px;padding:12px}
      .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px}
      .campo{display:flex;flex-direction:column;gap:2px}
      .label{font-size:9px;text-transform:uppercase;color:#9ca3af;font-weight:700;letter-spacing:0.04em}
      .valor{font-size:12px;color:#111;font-weight:600}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#f1f5f9;padding:5px 8px;text-align:left;font-weight:700;border-bottom:2px solid #cbd5e1;font-size:10px;text-transform:uppercase;color:#374151}
      td{padding:5px 8px;border-bottom:1px solid #e5e7eb}
      tr:nth-child(even){background:#fafafa}
      .vazio{padding:12px;text-align:center;color:#9ca3af;font-style:italic;font-size:11px}
      .assinatura{display:flex;gap:80px;margin-top:40px;padding:0 20px}
      .assinatura>div{flex:1;text-align:center;font-size:11px;color:#6b7280}
      .linha-ass{border-top:1px solid #9ca3af;margin-bottom:4px;margin-top:30px}
      @media print{body{padding:14px}.secao{break-inside:avoid}}
    </style></head><body>

    <div class="header">
      <div class="header-left">
        <h1>⚖️ Ficha Jurídica — ${d.nome}</h1>
        <p>ConstrutorRH · Gerado em ${new Date().toLocaleString('pt-BR')} · CONFIDENCIAL</p>
        <span class="badge-status ${d.status === 'ativo' ? 'ativo' : 'inativo'}">${d.status === 'ativo' ? '● Ativo' : '● Inativo'}</span>
      </div>
      <div class="header-right">
        <div class="periodo">Chapa: ${d.chapa ?? '—'}</div>
        <div>CPF: ${fmtCPF(d.cpf)}</div>
        <div>Adm.: ${fmtDate(d.data_admissao)}</div>
      </div>
    </div>

    ${sec('📋 Dados Pessoais', `
      <div class="sec-body">
        ${row2('Nome Completo', d.nome ?? '—', 'Chapa', d.chapa ?? '—')}
        ${row2('CPF', fmtCPF(d.cpf), 'RG', d.rg ?? '—')}
        ${row2('PIS/NIT', d.pis_nit ?? '—', 'Data de Nascimento', fmtDate(d.data_nascimento))}
        ${row2('Telefone', d.telefone ?? '—', 'E-mail', d.email ?? '—')}
        ${row2('Endereço', d.endereco ?? '—', 'CNH', d.cnh ?? '—')}
      </div>`)}

    ${sec('💼 Dados Profissionais', `
      <div class="sec-body">
        ${row2('Função', d.funcoes?.nome ?? '—', 'Obra', d.obras?.nome ?? '—')}
        ${row2('Tipo de Contrato', d.tipo_contrato ?? '—', 'Salário Base', fmtCur(d.salario_base))}
        ${row2('Data de Admissão', fmtDate(d.data_admissao), 'Status', d.status ?? '—')}
      </div>`)}

    ${sec('⚠️ Ocorrências (' + ocs.length + ')', ocs.length === 0
      ? '<div class="vazio">Nenhuma ocorrência registrada</div>'
      : tbl(['Data', 'Tipo', 'Descrição', 'Status'],
          ocs.map(o => [fmtDate(o.data), o.tipo ?? '—', (o.descricao ?? '—').substring(0, 60), o.status ?? '—']))
    )}

    ${sec('🏥 Atestados (' + ats.length + ')', ats.length === 0
      ? '<div class="vazio">Nenhum atestado registrado</div>'
      : tbl(['Data', 'Dias', 'CID', 'Médico', 'Status'],
          ats.map(a => [fmtDate(a.data), String(a.dias_afastamento ?? '—'), a.cid ?? '—', a.nome_medico ?? '—', a.status ?? '—']))
    )}

    ${sec('💵 Adiantamentos (' + ads.length + ')', ads.length === 0
      ? '<div class="vazio">Nenhum adiantamento registrado</div>'
      : tbl(['Competência', 'Tipo', 'Valor', 'Status'],
          ads.map(a => [a.competencia ?? '—', a.tipo ?? '—', fmtCur(a.valor), a.status ?? '—']))
    )}

    ${sec('🏆 Prêmios e Bonificações (' + prs.length + ')', prs.length === 0
      ? '<div class="vazio">Nenhum prêmio registrado</div>'
      : tbl(['Descrição', 'Tipo', 'Valor', 'Status'],
          prs.map(p => [(p.descricao ?? '—').substring(0, 40), p.tipo ?? '—', fmtCur(p.valor), p.status ?? '—']))
    )}

    ${sec('📄 Documentos (' + docs.length + ')', docs.length === 0
      ? '<div class="vazio">Nenhum documento registrado</div>'
      : tbl(['Tipo', 'Nome', 'Validade', 'Status'],
          docs.map(d2 => [d2.tipo ?? '—', (d2.nome ?? '—').substring(0, 40), fmtDate(d2.data_validade), d2.status ?? '—']))
    )}

    <div class="assinatura">
      <div><div class="linha-ass"></div>Responsável Jurídico / Assinatura</div>
      <div><div class="linha-ass"></div>Gestor de RH / Carimbo</div>
    </div>

    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`

    const win = window.open('', '_blank', 'width=1100,height=800')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ─── Filtragens ───────────────────────────────────────────────────────────
  const colabsFiltrados = colabs.filter(c => {
    const q = query.toLowerCase()
    return !q || c.nome.toLowerCase().includes(q) || (c.chapa ?? '').toLowerCase().includes(q) || (c.cpf ?? '').includes(q)
  })

  const lnFiltradas = listaNegra.filter(l => {
    const q = searchLN.toLowerCase()
    return !q || l.nome.toLowerCase().includes(q) || (l.cpf ?? '').includes(q) || l.motivo.toLowerCase().includes(q)
  })

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Scale size={24} color="#93c5fd" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)' }}>Jurídico</h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Fichas completas e lista negra de colaboradores</p>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--muted)', borderRadius: 10, padding: 4, marginBottom: 24, width: 'fit-content' }}>
        {([
          { id: 'ficha',       label: '📋 Ficha do Colaborador', icon: FileText },
          { id: 'lista_negra', label: '🚫 Lista Negra',          icon: ShieldAlert },
        ] as const).map(a => (
          <button key={a.id} onClick={() => setAba(a.id)} style={{
            padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer',
            fontWeight: 700, fontSize: 13,
            background: aba === a.id ? 'var(--background)' : 'transparent',
            color: aba === a.id ? 'var(--foreground)' : 'var(--muted-foreground)',
            boxShadow: aba === a.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
          }}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ═══════════ ABA FICHA ═══════════ */}
      {aba === 'ficha' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
          {/* Painel esquerdo — busca de colaborador */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: '#1e3a5f' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 10 }}>🔍 Selecionar Colaborador</div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Nome, chapa ou CPF…"
                  style={{ width: '100%', height: 36, border: '1px solid #334155', borderRadius: 8, paddingLeft: 30, paddingRight: 10, fontSize: 13, background: '#0f172a', color: '#fff' }} />
              </div>
            </div>
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              {colabsFiltrados.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>Nenhum colaborador encontrado</div>
              )}
              {colabsFiltrados.map(c => (
                <button key={c.id} onClick={() => carregarFicha(c)} style={{
                  width: '100%', padding: '10px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: selecionado?.id === c.id ? '#eff6ff' : 'transparent',
                  borderLeft: selecionado?.id === c.id ? '3px solid #1e3a5f' : '3px solid transparent',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--foreground)' }}>{c.nome}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2, display: 'flex', gap: 8 }}>
                    <span>Chapa: {c.chapa ?? '—'}</span>
                    {c.cpf && <span>CPF: {fmtCPF(c.cpf)}</span>}
                    <span style={{ marginLeft: 'auto', fontWeight: 700, color: c.status === 'ativo' ? '#15803d' : '#dc2626' }}>
                      {c.status === 'ativo' ? '● Ativo' : '● Inativo'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Painel direito — ficha */}
          <div>
            {!selecionado && (
              <div style={{ background: 'var(--card)', border: '2px dashed var(--border)', borderRadius: 12, padding: 48, textAlign: 'center', color: 'var(--muted-foreground)' }}>
                <Scale size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <div style={{ fontWeight: 700, fontSize: 15 }}>Selecione um colaborador</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>A ficha completa será carregada aqui</div>
              </div>
            )}

            {loadingFicha && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 48, textAlign: 'center' }}>
                <Loader2 size={32} style={{ margin: '0 auto 12px', animation: 'spin 1s linear infinite', color: '#1e3a5f' }} />
                <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Carregando ficha completa…</div>
              </div>
            )}

            {selecionado && !loadingFicha && fichaData.colab && (
              <FichaCompleta
                d={fichaData.colab}
                ocorrencias={fichaData.ocorrencias}
                adiantamentos={fichaData.adiantamentos}
                premios={fichaData.premios}
                documentos={fichaData.documentos}
                atestados={fichaData.atestados}
                vt={fichaData.vt}
                ponto={fichaData.ponto}
                onPDF={gerarPDF}
              />
            )}
          </div>
        </div>
      )}

      {/* ═══════════ ABA LISTA NEGRA ═══════════ */}
      {aba === 'lista_negra' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                <input value={searchLN} onChange={e => setSearchLN(e.target.value)}
                  placeholder="Buscar por nome, CPF ou motivo…"
                  style={{ height: 38, border: '1px solid var(--border)', borderRadius: 8, paddingLeft: 32, paddingRight: 10, fontSize: 13, width: 280, background: 'var(--background)', color: 'var(--foreground)' }} />
              </div>
              <div style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
                🚫 {listaNegra.length} registros
              </div>
            </div>
            <button onClick={() => setModalLN(true)} style={{
              height: 38, padding: '0 18px', background: '#dc2626', color: '#fff', border: 'none',
              borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Plus size={15} /> Adicionar à Lista Negra
            </button>
          </div>

          {loadingLN ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-foreground)' }}>
              <Loader2 size={24} style={{ margin: '0 auto 8px', animation: 'spin 1s linear infinite' }} />
              Carregando…
            </div>
          ) : lnFiltradas.length === 0 ? (
            <div style={{ background: 'var(--card)', border: '2px dashed var(--border)', borderRadius: 12, padding: 48, textAlign: 'center', color: 'var(--muted-foreground)' }}>
              <ShieldAlert size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>Lista negra vazia</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Adicione profissionais que já processaram a empresa</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lnFiltradas.map(ln => (
                <div key={ln.id} style={{
                  background: 'var(--card)', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626',
                  borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start',
                }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fee2e2', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserX size={20} color="#dc2626" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--foreground)' }}>{ln.nome}</span>
                      {ln.cpf && <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>CPF: {fmtCPF(ln.cpf)}</span>}
                      {ln.processo_numero && <span style={{ background: '#fef3c7', color: '#b45309', borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>Proc. {ln.processo_numero}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>⚠ {ln.motivo}</div>
                    {ln.observacoes && <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{ln.observacoes}</div>}
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 6 }}>Registrado em {fmtDate(ln.data_registro)}</div>
                  </div>
                  <button onClick={() => setDeleteLNId(ln.id)} style={{
                    background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 8px',
                    cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center',
                  }}>
                    <Trash2 size={14} color="#dc2626" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ MODAL: Adicionar à Lista Negra ══ */}
      {modalLN && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--background)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserX size={18} color="#dc2626" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>Adicionar à Lista Negra</div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Profissional que processou a empresa</div>
                </div>
              </div>
              <button onClick={() => setModalLN(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}>
                <X size={20} />
              </button>
            </div>

            {[
              { label: 'Nome Completo *', key: 'nome', placeholder: 'Nome do profissional', type: 'text' },
              { label: 'CPF', key: 'cpf', placeholder: '000.000.000-00', type: 'text' },
              { label: 'Número do Processo', key: 'processo_numero', placeholder: 'Ex.: 0001234-56.2024.5.02.0001', type: 'text' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', display: 'block', marginBottom: 5 }}>{f.label}</label>
                <input value={(formLN as any)[f.key]} onChange={e => setFormLN(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder} type={f.type}
                  style={{ width: '100%', height: 40, border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', fontSize: 13, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', display: 'block', marginBottom: 5 }}>Motivo / Descrição do processo *</label>
              <textarea value={formLN.motivo} onChange={e => setFormLN(p => ({ ...p, motivo: e.target.value }))}
                placeholder="Ex.: Reclamação trabalhista por horas extras não pagas…"
                rows={3}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--foreground)', display: 'block', marginBottom: 5 }}>Observações</label>
              <textarea value={formLN.observacoes} onChange={e => setFormLN(p => ({ ...p, observacoes: e.target.value }))}
                placeholder="Informações adicionais…"
                rows={2}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalLN(false)} style={{ flex: 1, height: 44, border: '1px solid var(--border)', background: 'transparent', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', color: 'var(--foreground)' }}>
                Cancelar
              </button>
              <button onClick={salvarLN} disabled={savingLN} style={{ flex: 2, height: 44, border: 'none', background: savingLN ? '#9ca3af' : '#dc2626', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {savingLN ? <><Loader2 size={15} className="animate-spin" />Salvando…</> : <><ShieldAlert size={15} />Adicionar à Lista Negra</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Confirmar exclusão lista negra ══ */}
      {deleteLNId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 340 }}>
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8 }}>Remover da Lista Negra?</div>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 20 }}>Esta ação não pode ser desfeita.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteLNId(null)} style={{ flex: 1, height: 42, border: '1px solid var(--border)', background: 'transparent', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Cancelar</button>
              <button onClick={() => excluirLN(deleteLNId)} style={{ flex: 1, height: 42, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>Remover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-componente: Ficha Completa ──────────────────────────────────────────
function FichaCompleta({ d, ocorrencias, adiantamentos, premios, documentos, atestados, vt, ponto, onPDF }: {
  d: any; ocorrencias: any[]; adiantamentos: any[]; premios: any[]
  documentos: any[]; atestados: any[]; vt: any[]; ponto: any[]; onPDF: () => void
}) {
  const [abasAbertas, setAbasAbertas] = useState<Record<string, boolean>>({
    pessoal: true, profissional: true, ocorrencias: false,
    atestados: false, adiantamentos: false, premios: false, documentos: false,
  })
  const toggle = (k: string) => setAbasAbertas(p => ({ ...p, [k]: !p[k] }))

  const Badge = ({ label, val, cor, bg }: { label: string; val: string | number; cor: string; bg: string }) => (
    <div style={{ background: bg, border: `1px solid ${cor}30`, borderRadius: 8, padding: '8px 12px', flex: 1, minWidth: 80 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: cor }}>{val}</div>
      <div style={{ fontSize: 9, color: cor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{label}</div>
    </div>
  )

  const SecaoCollapse = ({ id, titulo, count, children }: { id: string; titulo: string; count: number; children: React.ReactNode }) => (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
      <button onClick={() => toggle(id)} style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--foreground)' }}>{titulo}</span>
          <span style={{ background: count > 0 ? '#fee2e2' : 'var(--muted)', color: count > 0 ? '#dc2626' : 'var(--muted-foreground)', borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{count}</span>
        </div>
        {abasAbertas[id] ? <ChevronUp size={16} color="var(--muted-foreground)" /> : <ChevronDown size={16} color="var(--muted-foreground)" />}
      </button>
      {abasAbertas[id] && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  )

  const Campo = ({ label, value }: { label: string; value: string }) => (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>{value || '—'}</div>
    </div>
  )

  const totalAdiant = adiantamentos.reduce((s, a) => s + (a.valor ?? 0), 0)
  const totalPremio = premios.reduce((s, p) => s + (p.valor ?? 0), 0)
  const totalOcorr  = ocorrencias.length

  return (
    <div>
      {/* Topo da ficha */}
      <div style={{ background: '#1e3a5f', borderRadius: 12, padding: '20px 24px', marginBottom: 16, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{d.nome}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Chapa: {d.chapa ?? '—'}</span>
              {d.funcoes?.nome && <span style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>⚙️ {d.funcoes.nome}</span>}
              {d.obras?.nome && <span style={{ background: 'rgba(255,255,255,0.22)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>🏗️ {d.obras.nome}</span>}
              <span style={{ background: d.status === 'ativo' ? 'rgba(134,239,172,0.3)' : 'rgba(252,165,165,0.3)', color: d.status === 'ativo' ? '#86efac' : '#fca5a5', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                {d.status === 'ativo' ? '● Ativo' : '● Inativo'}
              </span>
            </div>
          </div>
          <button onClick={onPDF} style={{
            background: '#fff', color: '#1e3a5f', border: 'none', borderRadius: 8, padding: '8px 16px',
            fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <FileText size={14} /> Gerar PDF
          </button>
        </div>

        {/* Cards resumo */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <Badge label="Ocorrências" val={totalOcorr} cor={totalOcorr > 0 ? '#dc2626' : '#15803d'} bg={totalOcorr > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)'} />
          <Badge label="Atestados" val={atestados.length} cor="#b45309" bg="rgba(234,179,8,0.15)" />
          <Badge label="Adiantamentos" val={adiantamentos.length} cor="#1d4ed8" bg="rgba(59,130,246,0.15)" />
          <Badge label="Prêmios" val={premios.length} cor="#7c3aed" bg="rgba(124,58,237,0.15)" />
          <Badge label="Valor Adiant." val={totalAdiant.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} cor="#1d4ed8" bg="rgba(59,130,246,0.1)" />
          <Badge label="Valor Prêmios" val={totalPremio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} cor="#7c3aed" bg="rgba(124,58,237,0.1)" />
        </div>
      </div>

      {/* Seção dados pessoais */}
      <SecaoCollapse id="pessoal" titulo="📋 Dados Pessoais" count={0}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
          <Campo label="CPF" value={fmtCPF(d.cpf)} />
          <Campo label="RG" value={d.rg ?? '—'} />
          <Campo label="PIS/NIT" value={d.pis_nit ?? '—'} />
          <Campo label="Data de Nascimento" value={fmtDate(d.data_nascimento)} />
          <Campo label="Telefone" value={d.telefone ?? '—'} />
          <Campo label="E-mail" value={d.email ?? '—'} />
          <Campo label="CNH" value={d.cnh ?? '—'} />
          <Campo label="Endereço" value={d.endereco ?? '—'} />
        </div>
      </SecaoCollapse>

      <SecaoCollapse id="profissional" titulo="💼 Dados Profissionais" count={0}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
          <Campo label="Função" value={d.funcoes?.nome ?? '—'} />
          <Campo label="Obra" value={d.obras?.nome ?? '—'} />
          <Campo label="Tipo de Contrato" value={d.tipo_contrato ?? '—'} />
          <Campo label="Salário Base" value={fmtCur(d.salario_base)} />
          <Campo label="Data de Admissão" value={fmtDate(d.data_admissao)} />
          <Campo label="Status" value={d.status ?? '—'} />
        </div>
      </SecaoCollapse>

      <SecaoCollapse id="ocorrencias" titulo="⚠️ Ocorrências" count={ocorrencias.length}>
        {ocorrencias.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--muted-foreground)', textAlign: 'center', padding: 12 }}>Nenhuma ocorrência registrada</p>
          : <TabelaSimples headers={['Data', 'Tipo', 'Descrição', 'Status']}
              rows={ocorrencias.map(o => [fmtDate(o.data), o.tipo ?? '—', (o.descricao ?? '—').substring(0, 60), o.status ?? '—'])} />
        }
      </SecaoCollapse>

      <SecaoCollapse id="atestados" titulo="🏥 Atestados" count={atestados.length}>
        {atestados.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--muted-foreground)', textAlign: 'center', padding: 12 }}>Nenhum atestado registrado</p>
          : <TabelaSimples headers={['Data', 'Dias', 'CID', 'Médico', 'Status']}
              rows={atestados.map(a => [fmtDate(a.data), String(a.dias_afastamento ?? '—'), a.cid ?? '—', a.nome_medico ?? '—', a.status ?? '—'])} />
        }
      </SecaoCollapse>

      <SecaoCollapse id="adiantamentos" titulo="💵 Adiantamentos" count={adiantamentos.length}>
        {adiantamentos.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--muted-foreground)', textAlign: 'center', padding: 12 }}>Nenhum adiantamento registrado</p>
          : <TabelaSimples headers={['Competência', 'Tipo', 'Valor', 'Status']}
              rows={adiantamentos.map(a => [a.competencia ?? '—', a.tipo ?? '—', fmtCur(a.valor), a.status ?? '—'])} />
        }
      </SecaoCollapse>

      <SecaoCollapse id="premios" titulo="🏆 Prêmios e Bonificações" count={premios.length}>
        {premios.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--muted-foreground)', textAlign: 'center', padding: 12 }}>Nenhum prêmio registrado</p>
          : <TabelaSimples headers={['Descrição', 'Tipo', 'Valor', 'Status']}
              rows={premios.map(p => [(p.descricao ?? '—').substring(0, 40), p.tipo ?? '—', fmtCur(p.valor), p.status ?? '—'])} />
        }
      </SecaoCollapse>

      <SecaoCollapse id="documentos" titulo="📄 Documentos" count={documentos.length}>
        {documentos.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--muted-foreground)', textAlign: 'center', padding: 12 }}>Nenhum documento registrado</p>
          : <TabelaSimples headers={['Tipo', 'Nome', 'Validade', 'Status']}
              rows={documentos.map(doc => [doc.tipo ?? '—', (doc.nome ?? '—').substring(0, 40), fmtDate(doc.data_validade), doc.status ?? '—'])} />
        }
      </SecaoCollapse>
    </div>
  )
}

function TabelaSimples({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div style={{ overflow: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--muted)' }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--muted-foreground)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--muted)/50' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '7px 10px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', color: 'var(--foreground)', fontSize: 12 }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
