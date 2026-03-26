import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Scale, UserX, Search, Plus, Trash2, FileText, ChevronDown, ChevronUp,
  Loader2, ShieldAlert, X, Building2, Calendar, CreditCard, Clock,
  AlertTriangle, Shield, DollarSign, Truck, Package, MapPin, Phone,
  Mail, User, Briefcase, Hash, Camera, ExternalLink,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d + (d.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('pt-BR') : '—'
const fmtCPF = (v: string | null | undefined) => {
  if (!v) return '—'
  const n = v.replace(/\D/g, '')
  return n.length === 11 ? n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : v
}
const fmtCur = (v: number | null | undefined) =>
  v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'
const fmtMes = (ym: string | null | undefined) => {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[+m - 1]}/${y}`
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface ColabSimples { id: string; nome: string; chapa: string; cpf: string | null; status: string }
interface ListaNegra {
  id: string; nome: string; cpf: string | null; motivo: string
  data_registro: string; processo_numero: string | null; observacoes: string | null
}

export default function Juridico() {
  const [aba, setAba] = useState<'ficha' | 'lista_negra'>('ficha')
  const [colabs, setColabs]   = useState<ColabSimples[]>([])
  const [query, setQuery]     = useState('')
  const [selecionado, setSelecionado] = useState<ColabSimples | null>(null)
  const [loadingFicha, setLoadingFicha] = useState(false)
  const [fichaData, setFichaData]     = useState<Record<string, any>>({})
  const [listaNegra, setListaNegra]   = useState<ListaNegra[]>([])
  const [loadingLN, setLoadingLN]     = useState(false)
  const [modalLN, setModalLN]         = useState(false)
  const [formLN, setFormLN]           = useState({ nome: '', cpf: '', motivo: '', processo_numero: '', observacoes: '' })
  const [savingLN, setSavingLN]       = useState(false)
  const [deleteLNId, setDeleteLNId]   = useState<string | null>(null)
  const [searchLN, setSearchLN]       = useState('')
  const [alertaListaNegra, setAlertaListaNegra] = useState<ListaNegra | null>(null)

  useEffect(() => {
    supabase.from('colaboradores').select('id,nome,chapa,cpf,status').order('nome')
      .then(({ data }) => setColabs((data ?? []) as any))
  }, [])

  const fetchListaNegra = useCallback(async () => {
    setLoadingLN(true)
    const { data } = await supabase.from('lista_negra_juridico')
      .select('*').order('created_at', { ascending: false })
    setListaNegra((data ?? []) as any); setLoadingLN(false)
  }, [])
  useEffect(() => { fetchListaNegra() }, [fetchListaNegra])

  // ── Carrega ficha completa ────────────────────────────────────────────────
  async function carregarFicha(c: ColabSimples) {
    setLoadingFicha(true); setSelecionado(c); setFichaData({})
    try {
      const [
        colabRes, ocRes, atestRes, acidRes, advRes, docRes, docAvRes,
        epiRes, pontRes, regPontRes, adRes, premRes, vtRes, provRes, pagRes, histChRes, histContRes,
      ] = await Promise.all([
        supabase.from('colaboradores').select('*, funcoes(id,nome,sigla), obras(id,nome,codigo)').eq('id', c.id).single(),
        supabase.from('ocorrencias').select('*').eq('colaborador_id', c.id).order('data', { ascending: false }),
        supabase.from('atestados').select('*').eq('colaborador_id', c.id).order('data', { ascending: false }),
        supabase.from('acidentes').select('*, obras(nome)').eq('colaborador_id', c.id).order('data_ocorrencia', { ascending: false }),
        supabase.from('advertencias').select('*').eq('colaborador_id', c.id).order('data_advertencia', { ascending: false }),
        supabase.from('documentos').select('*').eq('colaborador_id', c.id).order('created_at', { ascending: false }),
        supabase.from('documentos_avulsos').select('*').eq('colaborador_id', c.id).order('created_at', { ascending: false }),
        supabase.from('colaborador_epi').select('*, epi_catalogo(nome,categoria,numero_ca)').eq('colaborador_id', c.id),
        supabase.from('ponto_lancamentos').select('*, obras(nome)').eq('colaborador_id', c.id).order('mes_referencia', { ascending: false }),
        supabase.from('registro_ponto').select('*').eq('colaborador_id', c.id).order('data', { ascending: false }).limit(120),
        supabase.from('adiantamentos').select('*').eq('colaborador_id', c.id).order('created_at', { ascending: false }),
        supabase.from('premios').select('*').eq('colaborador_id', c.id).order('created_at', { ascending: false }),
        supabase.from('vale_transporte').select('*').eq('colaborador_id', c.id).order('competencia', { ascending: false }),
        supabase.from('provisoes_fgts').select('*').eq('colaborador_id', c.id).order('competencia', { ascending: false }),
        supabase.from('pagamentos').select('*').eq('colaborador_id', c.id).order('created_at', { ascending: false }),
        supabase.from('historico_chapa').select('*, funcoes(nome)').eq('colaborador_id', c.id).order('data_inicio', { ascending: false }),
        supabase.from('colaborador_historico_contrato').select('*, funcoes(nome), obras(nome)').eq('colaborador_id', c.id).order('data_inicio', { ascending: false }),
      ])
      setFichaData({
        colab: colabRes.data,
        ocorrencias:  ocRes.data ?? [],
        atestados:    atestRes.data ?? [],
        acidentes:    acidRes.data ?? [],
        advertencias: advRes.data ?? [],
        documentos:   docRes.data ?? [],
        documentos_avulsos: docAvRes.data ?? [],
        epis:         epiRes.data ?? [],
        ponto:        pontRes.data ?? [],
        registros:    regPontRes.data ?? [],
        adiantamentos: adRes.data ?? [],
        premios:      premRes.data ?? [],
        vt:           vtRes.data ?? [],
        provisoes:    provRes.data ?? [],
        pagamentos:   pagRes.data ?? [],
        historico_chapa: histChRes.data ?? [],
        historico_contrato: histContRes.data ?? [],
      })
    } catch(e: any) { toast.error('Erro ao carregar ficha: ' + e.message) }
    setLoadingFicha(false)
  }

  // ── Lista Negra ───────────────────────────────────────────────────────────
  async function salvarLN() {
    if (!formLN.nome.trim()) return toast.error('Nome obrigatório')
    if (!formLN.motivo.trim()) return toast.error('Motivo obrigatório')
    setSavingLN(true)
    const { error } = await supabase.from('lista_negra_juridico').insert({
      nome: formLN.nome.trim(), cpf: formLN.cpf.replace(/\D/g, '') || null,
      motivo: formLN.motivo.trim(), processo_numero: formLN.processo_numero.trim() || null,
      observacoes: formLN.observacoes.trim() || null, data_registro: new Date().toISOString().slice(0, 10),
    })
    setSavingLN(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('✅ Adicionado à lista negra')
    setModalLN(false); setFormLN({ nome: '', cpf: '', motivo: '', processo_numero: '', observacoes: '' })
    fetchListaNegra()
  }
  async function excluirLN(id: string) {
    const { error } = await supabase.from('lista_negra_juridico').delete().eq('id', id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Removido da lista'); setDeleteLNId(null); fetchListaNegra()
  }

  // ── Verificar lista negra pelo CPF ───────────────────────────────────────
  async function verificarLNCPF(cpf: string) {
    const digits = cpf.replace(/\D/g, '')
    if (digits.length !== 11) { setAlertaListaNegra(null); return }
    const { data } = await supabase.from('lista_negra_juridico').select('*').eq('cpf', digits).limit(1)
    setAlertaListaNegra(data?.[0] ?? null)
  }

  // ── Gerar PDF do dossiê completo ─────────────────────────────────────────
  function gerarPDF() {
    if (!fichaData.colab) return
    const d       = fichaData.colab as any
    const ocs     = (fichaData.ocorrencias    as any[]) ?? []
    const ats     = (fichaData.atestados      as any[]) ?? []
    const acids   = (fichaData.acidentes      as any[]) ?? []
    const advs    = (fichaData.advertencias   as any[]) ?? []
    const docs    = (fichaData.documentos     as any[]) ?? []
    const docsAv  = (fichaData.documentos_avulsos as any[]) ?? []
    const epis    = (fichaData.epis           as any[]) ?? []
    const pontos  = (fichaData.ponto          as any[]) ?? []
    const regs    = (fichaData.registros      as any[]) ?? []
    const adiantos= (fichaData.adiantamentos  as any[]) ?? []
    const prs     = (fichaData.premios        as any[]) ?? []
    const vts     = (fichaData.vt             as any[]) ?? []
    const provs   = (fichaData.provisoes      as any[]) ?? []
    const pags    = (fichaData.pagamentos     as any[]) ?? []
    const histCh  = (fichaData.historico_chapa as any[]) ?? []
    const histCont= (fichaData.historico_contrato as any[]) ?? []

    const totalAdiant = adiantos.reduce((s:number, a:any) => s + (a.valor ?? 0), 0)
    const totalPremio = prs.reduce((s:number, p:any) => s + (p.valor ?? 0), 0)
    const totalVT     = vts.reduce((s:number, v:any) => s + (v.valor_empresa ?? v.valor ?? 0), 0)
    const totalPago   = pags.filter((p:any) => p.status === 'pago').reduce((s:number, p:any) => s + (p.valor_liquido ?? 0), 0)
    const totalFaltas = regs.filter((r:any) => r.falta).length
    const totalHExtra = regs.reduce((s:number, r:any) => s + (r.horas_extras ?? 0), 0)

    const CSS = `
      *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:18px}
      .capa{background:linear-gradient(135deg,#1e3a5f,#2d5a9e);color:#fff;border-radius:10px;padding:28px 32px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:flex-start}
      .capa h1{font-size:22px;font-weight:900;margin-bottom:6px}
      .capa .sub{font-size:11px;opacity:.8;margin-top:3px}
      .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700}
      .badge-ativo{background:#86efac;color:#14532d}
      .badge-inativo{background:#fca5a5;color:#7f1d1d}
      .badge-ferias{background:#bfdbfe;color:#1e3a8a}
      .badge-afastado{background:#fde68a;color:#78350f}
      .stats{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:18px}
      .stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;text-align:center}
      .stat .val{font-size:18px;font-weight:900;color:#1e3a5f}
      .stat .lbl{font-size:9px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-top:3px}
      .secao{margin-bottom:18px;break-inside:avoid}
      .sec-titulo{background:#1e3a5f;color:#fff;padding:7px 14px;font-size:11px;font-weight:800;border-radius:6px 6px 0 0;text-transform:uppercase;letter-spacing:.05em;display:flex;align-items:center;gap:6px}
      .sec-body{background:#fafafa;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 6px 6px;padding:14px}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px}
      .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px 16px}
      .campo{display:flex;flex-direction:column;gap:2px}
      .lbl{font-size:9px;text-transform:uppercase;color:#94a3b8;font-weight:700;letter-spacing:.04em}
      .val{font-size:12px;color:#111;font-weight:600}
      table{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:6px}
      th{background:#e8eef6;padding:5px 8px;text-align:left;font-weight:800;border-bottom:2px solid #cbd5e1;font-size:9.5px;text-transform:uppercase;color:#374151}
      td{padding:5px 8px;border-bottom:1px solid #e5e7eb;color:#374151}
      tr:nth-child(even)>td{background:#f9fafb}
      .vazio{padding:14px;text-align:center;color:#94a3b8;font-style:italic;font-size:11px}
      .anexo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}
      .anexo-card{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:8px;text-align:center;font-size:10px}
      .status-pill{display:inline-block;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:700}
      .pend{background:#fef3c7;color:#b45309} .aprov{background:#dcfce7;color:#15803d}
      .pago{background:#eff6ff;color:#1d4ed8} .canc{background:#fee2e2;color:#dc2626}
      .falt{background:#fecaca;color:#dc2626} .pres{background:#dcfce7;color:#15803d}
      .ass{display:flex;gap:60px;margin-top:44px;padding:0 16px}
      .ass>div{flex:1;text-align:center;font-size:10px;color:#9ca3af}
      .ass-linha{border-top:1px solid #9ca3af;margin-bottom:4px;margin-top:32px}
      .destaque{background:#fef9c3;border-left:3px solid #f59e0b;padding:6px 12px;border-radius:0 6px 6px 0;font-size:11px;margin-bottom:10px;font-weight:700;color:#78350f}
      @media print{body{padding:10px}.secao{break-inside:avoid}}
    `

    const statusBadge = (s:string) => {
      const map:Record<string,string> = { ativo:'badge-ativo', inativo:'badge-inativo', ferias:'badge-ferias', afastado:'badge-afastado' }
      const lbl:Record<string,string> = { ativo:'● Ativo', inativo:'● Inativo', ferias:'● Férias', afastado:'● Afastado' }
      return `<span class="badge ${map[s]??'badge-inativo'}">${lbl[s]??s}</span>`
    }
    const pill = (s:string) => {
      const m:Record<string,string> = { pendente:'pend', aprovado:'aprov', pago:'pago', cancelado:'canc', presente:'pres', falta:'falt' }
      return `<span class="status-pill ${m[s]??'pend'}">${s}</span>`
    }
    const campo = (l:string,v:string) => `<div class="campo"><span class="lbl">${l}</span><span class="val">${v}</span></div>`
    const vazio = '<div class="vazio">Nenhum registro encontrado</div>'

    const tbl = (headers:string[], rows:string[][]) => rows.length === 0 ? vazio :
      `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`

    // Resumo de pontos por lançamento
    const pontosHTML = pontos.length === 0 ? vazio : pontos.map((p:any) => {
      const linhas = regs.filter((r:any) => r.lancamento_id === p.id || (r.colaborador_id === d.id && r.data >= `${p.mes_referencia}-01` && r.data <= `${p.mes_referencia}-31`))
      const faltas = linhas.filter((r:any) => r.falta).length
      const hExtra = linhas.reduce((s:number,r:any) => s+(r.horas_extras??0), 0)
      return `<div style="margin-bottom:10px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
        <div style="background:#e8eef6;padding:6px 12px;display:flex;justify-content:space-between;align-items:center">
          <strong style="font-size:11px">${fmtMes(p.mes_referencia)} — ${p.obras?.nome ?? 'Sem obra'}</strong>
          <span style="display:flex;gap:12px;font-size:10px;color:#374151">
            <span>Dias: ${linhas.length}</span><span>Faltas: ${faltas}</span><span>HExtra: ${hExtra.toFixed(1)}h</span>
            ${pill(p.status)}
          </span>
        </div>
        ${linhas.length > 0 ? tbl(['Data','Status','H.Extras','Faltas','Obs'],
          linhas.slice(0,40).map((r:any) => [
            fmtDate(r.data),
            `<span style="font-weight:700;color:${r.falta?'#dc2626':'#15803d'}">${r.status??'—'}</span>`,
            r.horas_extras ? r.horas_extras+'h' : '—',
            r.falta ? '✗' : '',
            (r.observacoes??'').substring(0,30),
          ])) : vazio}
      </div>`
    }).join('')

    // Anexos
    const todosAnexos = [
      ...docs.filter((d2:any) => d2.arquivo_url).map((d2:any) => ({ nome: d2.nome ?? d2.tipo, url: d2.arquivo_url, tipo: 'Documento' })),
      ...docsAv.filter((d2:any) => d2.documento_url).map((d2:any) => ({ nome: d2.documento_nome ?? d2.tipo, url: d2.documento_url, tipo: 'Avulso' })),
      ...advs.filter((a:any) => a.arquivo_url).map((a:any) => ({ nome: 'Advertência ' + fmtDate(a.data_advertencia), url: a.arquivo_url, tipo: 'Advertência' })),
      ...ats.filter((a:any) => a.arquivo_url).map((a:any) => ({ nome: 'Atestado ' + fmtDate(a.data), url: a.arquivo_url, tipo: 'Atestado' })),
    ]
    const anexosHTML = todosAnexos.length === 0 ? vazio :
      `<div class="anexo-grid">${todosAnexos.map(a => `
        <div class="anexo-card">
          <div style="font-size:18px;margin-bottom:4px">📎</div>
          <div style="font-weight:700;word-break:break-word">${a.nome}</div>
          <div style="font-size:9px;color:#94a3b8;margin:3px 0">${a.tipo}</div>
          <a href="${a.url}" target="_blank" style="font-size:9px;color:#1d4ed8">Abrir ↗</a>
        </div>`).join('')}</div>`

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dossiê — ${d.nome}</title>
    <style>${CSS}</style></head><body>

    <!-- CAPA -->
    <div class="capa">
      <div>
        <h1>⚖️ Dossiê Completo do Colaborador</h1>
        <div class="sub">ConstrutorRH · Gerado em ${new Date().toLocaleString('pt-BR')} · CONFIDENCIAL</div>
        <div style="margin-top:10px;font-size:16px;font-weight:900">${d.nome}</div>
        <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span style="background:rgba(255,255,255,.15);border-radius:4px;padding:2px 8px;font-size:11px">Chapa: ${d.chapa ?? '—'}</span>
          ${d.funcoes?.nome ? `<span style="background:rgba(255,255,255,.15);border-radius:4px;padding:2px 8px;font-size:11px">⚙️ ${d.funcoes.nome}</span>` : ''}
          ${d.obras?.nome ? `<span style="background:rgba(255,255,255,.15);border-radius:4px;padding:2px 8px;font-size:11px">🏗️ ${d.obras.nome}</span>` : ''}
          ${statusBadge(d.status ?? 'inativo')}
        </div>
      </div>
      <div style="text-align:right;font-size:11px;opacity:.9">
        <div>CPF: ${fmtCPF(d.cpf)}</div>
        <div>Admissão: ${fmtDate(d.data_admissao)}</div>
        ${d.data_status ? `<div>Saída: ${fmtDate(d.data_status)}</div>` : ''}
        <div>PIS/NIT: ${d.pis_nit ?? '—'}</div>
      </div>
    </div>

    <!-- ESTATÍSTICAS -->
    <div class="stats">
      <div class="stat"><div class="val">${ocs.length+ats.length+acids.length}</div><div class="lbl">Ocorrências</div></div>
      <div class="stat"><div class="val">${adiantos.length}</div><div class="lbl">Adiantamentos</div></div>
      <div class="stat"><div class="val">${prs.length}</div><div class="lbl">Prêmios</div></div>
      <div class="stat"><div class="val">${pontos.length}</div><div class="lbl">Períodos de Ponto</div></div>
      <div class="stat"><div class="val" style="color:#dc2626">${totalFaltas}</div><div class="lbl">Faltas</div></div>
      <div class="stat"><div class="val">${totalPago ? fmtCur(totalPago) : '—'}</div><div class="lbl">Total Pago</div></div>
    </div>

    <!-- DADOS PESSOAIS -->
    <div class="secao">
      <div class="sec-titulo">👤 Dados Pessoais</div>
      <div class="sec-body">
        <div class="grid3">
          ${campo('CPF', fmtCPF(d.cpf))}
          ${campo('RG', d.rg ?? '—')}
          ${campo('PIS/NIT', d.pis_nit ?? '—')}
          ${campo('Data de Nascimento', fmtDate(d.data_nascimento))}
          ${campo('Gênero', d.genero ?? '—')}
          ${campo('Estado Civil', d.estado_civil ?? '—')}
          ${campo('Telefone', d.telefone ?? '—')}
          ${campo('E-mail', d.email ?? '—')}
          ${campo('CNH', d.cnh ?? '—')}
        </div>
      </div>
    </div>

    <!-- ENDEREÇO -->
    <div class="secao">
      <div class="sec-titulo">📍 Endereço</div>
      <div class="sec-body">
        <div class="grid2">
          ${campo('Endereço Completo', d.endereco ?? '—')}
          ${campo('CEP', d.cep ?? '—')}
          ${campo('Cidade', d.cidade ?? '—')}
          ${campo('Estado', d.estado ?? '—')}
        </div>
      </div>
    </div>

    <!-- DADOS PROFISSIONAIS -->
    <div class="secao">
      <div class="sec-titulo">💼 Dados Profissionais</div>
      <div class="sec-body">
        <div class="grid3">
          ${campo('Função Atual', d.funcoes?.nome ?? '—')}
          ${campo('Obra Atual', d.obras?.nome ?? '—')}
          ${campo('Tipo de Contrato', d.tipo_contrato ?? '—')}
          ${campo('Salário Base', fmtCur(d.salario_base))}
          ${campo('Data de Admissão', fmtDate(d.data_admissao))}
          ${campo('Data de Saída / Alteração', fmtDate(d.data_status))}
          ${campo('Status Atual', d.status ?? '—')}
          ${campo('CTPS Nº', d.ctps_numero ?? '—')}
          ${campo('CTPS Série', d.ctps_serie ?? '—')}
        </div>
      </div>
    </div>

    <!-- DADOS BANCÁRIOS -->
    <div class="secao">
      <div class="sec-titulo">🏦 Dados Bancários</div>
      <div class="sec-body">
        <div class="grid3">
          ${campo('Banco', d.banco ?? '—')}
          ${campo('Agência', d.agencia ?? '—')}
          ${campo('Conta', d.conta ?? '—')}
          ${campo('Tipo de Conta', d.tipo_conta ?? '—')}
          ${campo('Tipo de PIX', d.pix_tipo ?? '—')}
          ${campo('Chave PIX', d.pix_chave ?? '—')}
        </div>
      </div>
    </div>

    <!-- HISTÓRICO DE CHAPAS E FUNÇÕES -->
    ${histCh.length > 0 || histCont.length > 0 ? `
    <div class="secao">
      <div class="sec-titulo">🔄 Histórico de Chapas / Funções (${histCh.length})</div>
      <div class="sec-body">
        ${tbl(['Chapa','Função','Tipo Contrato','Data Início','Data Fim','Motivo'],
          histCh.map((h:any) => [h.chapa??'—', h.funcoes?.nome??'—', h.tipo_contrato??'—', fmtDate(h.data_inicio), fmtDate(h.data_fim), h.motivo_troca??'—']))}
      </div>
    </div>` : ''}

    <!-- PONTOS FECHADOS E PERÍODOS -->
    <div class="secao">
      <div class="sec-titulo">⏱️ Histórico de Ponto (${pontos.length} períodos · ${regs.length} registros · ${totalFaltas} faltas · ${totalHExtra.toFixed(1)}h extras)</div>
      <div class="sec-body">${pontosHTML}</div>
    </div>

    <!-- PAGAMENTOS -->
    <div class="secao">
      <div class="sec-titulo">💳 Pagamentos (${pags.length} · Total pago: ${fmtCur(totalPago)})</div>
      <div class="sec-body">
        ${tbl(['Competência','Tipo','Valor Bruto','Líquido','Status','Data'],
          pags.map((p:any) => [fmtMes(p.competencia), p.tipo??'—', fmtCur(p.valor_bruto), fmtCur(p.valor_liquido), pill(p.status), fmtDate(p.data_pagamento)]))}
      </div>
    </div>

    <!-- ADIANTAMENTOS -->
    <div class="secao">
      <div class="sec-titulo">💵 Adiantamentos (${adiantos.length} · Total: ${fmtCur(totalAdiant)})</div>
      <div class="sec-body">
        ${tbl(['Competência','Tipo','Valor','Status','Observações'],
          adiantos.map((a:any) => [fmtMes(a.competencia), a.tipo??'—', fmtCur(a.valor), pill(a.status), (a.observacoes??'').substring(0,40)]))}
      </div>
    </div>

    <!-- PRÊMIOS -->
    <div class="secao">
      <div class="sec-titulo">🏆 Prêmios e Bonificações (${prs.length} · Total: ${fmtCur(totalPremio)})</div>
      <div class="sec-body">
        ${tbl(['Competência','Tipo','Descrição','Valor','Status'],
          prs.map((p:any) => [fmtMes(p.competencia), p.tipo??'—', (p.descricao??'—').substring(0,40), fmtCur(p.valor), pill(p.status)]))}
      </div>
    </div>

    <!-- VALE TRANSPORTE -->
    <div class="secao">
      <div class="sec-titulo">🚌 Vale Transporte (${vts.length} · Total empresa: ${fmtCur(totalVT)})</div>
      <div class="sec-body">
        ${tbl(['Competência','Tipo','Valor','Desc. Colab.','Valor Empresa','Status'],
          vts.map((v:any) => [fmtMes(v.competencia), v.tipo??'—', fmtCur(v.valor), fmtCur(v.desconto_colaborador), fmtCur(v.valor_empresa), pill(v.status)]))}
      </div>
    </div>

    <!-- PROVISÕES FGTS -->
    ${provs.length > 0 ? `
    <div class="secao">
      <div class="sec-titulo">🏛️ Provisões FGTS (${provs.length})</div>
      <div class="sec-body">
        ${tbl(['Competência','Salário Base','FGTS Mensal','Férias','13º','Total Provisão'],
          provs.map((p:any) => [fmtMes(p.competencia), fmtCur(p.salario_base), fmtCur(p.fgts_mensal), fmtCur(p.ferias_provisionadas), fmtCur(p.decimo_terceiro), fmtCur(p.total_provisao)]))}
      </div>
    </div>` : ''}

    <!-- OCORRÊNCIAS -->
    <div class="secao">
      <div class="sec-titulo">⚠️ Ocorrências (${ocs.length})</div>
      <div class="sec-body">
        ${tbl(['Data','Tipo','Descrição','Status'],
          ocs.map((o:any) => [fmtDate(o.data), o.tipo??'—', (o.descricao??'—').substring(0,60), pill(o.status??'aberto')]))}
      </div>
    </div>

    <!-- ATESTADOS -->
    <div class="secao">
      <div class="sec-titulo">🏥 Atestados (${ats.length})</div>
      <div class="sec-body">
        ${tbl(['Data','Tipo','CID','Médico','Dias Afast.','Status'],
          ats.map((a:any) => [fmtDate(a.data), a.tipo??'—', a.cid??'—', a.medico??a.nome_medico??'—', a.dias_afastamento??'—', pill(a.status??'registrado')]))}
      </div>
    </div>

    <!-- ACIDENTES -->
    ${acids.length > 0 ? `
    <div class="secao">
      <div class="sec-titulo">🚨 Acidentes (${acids.length})</div>
      <div class="sec-body">
        ${tbl(['Data','Tipo','Gravidade','Local','CAT','Status'],
          acids.map((a:any) => [fmtDate(a.data_ocorrencia), a.tipo??'—', a.gravidade??'—', a.local_acidente??'—', a.cat_emitida?'Sim':'Não', pill(a.status??'aberto')]))}
      </div>
    </div>` : ''}

    <!-- ADVERTÊNCIAS -->
    ${advs.length > 0 ? `
    <div class="secao">
      <div class="sec-titulo">📋 Advertências (${advs.length})</div>
      <div class="sec-body">
        ${tbl(['Data','Tipo','Motivo','Suspensão','Assinada'],
          advs.map((a:any) => [fmtDate(a.data_advertencia), a.tipo??'—', (a.motivo??'—').substring(0,50), a.dias_suspensao?a.dias_suspensao+' dias':'—', a.assinada?'✓ Sim':'✗ Não']))}
      </div>
    </div>` : ''}

    <!-- EPIs -->
    ${epis.length > 0 ? `
    <div class="secao">
      <div class="sec-titulo">🦺 EPIs Vinculados (${epis.length})</div>
      <div class="sec-body">
        ${tbl(['EPI','Categoria','Nº CA'],
          epis.map((e:any) => [e.epi_catalogo?.nome??'—', e.epi_catalogo?.categoria??'—', e.epi_catalogo?.numero_ca??'—']))}
      </div>
    </div>` : ''}

    <!-- DOCUMENTOS E ANEXOS -->
    <div class="secao">
      <div class="sec-titulo">📎 Documentos e Anexos (${docs.length + docsAv.length})</div>
      <div class="sec-body">
        ${docs.length > 0 ? tbl(['Tipo','Nome','Validade','Status'], docs.map((d2:any) => [d2.tipo??'—', (d2.nome??'—').substring(0,40), fmtDate(d2.data_validade), pill(d2.status??'ativo')])) : ''}
        ${docsAv.length > 0 ? `<div style="margin-top:10px"><strong style="font-size:10px">Documentos Avulsos</strong>${tbl(['Tipo','Nome','Data'], docsAv.map((d2:any) => [d2.tipo??'—', (d2.documento_nome??'—').substring(0,40), fmtDate(d2.data)]))}</div>` : ''}
        <div style="margin-top:12px"><strong style="font-size:10px;color:#374151">LINKS DE ANEXOS</strong>${anexosHTML}</div>
      </div>
    </div>

    <!-- ASSINATURAS -->
    <div class="ass">
      <div><div class="ass-linha"></div>Colaborador / Assinatura</div>
      <div><div class="ass-linha"></div>Responsável Jurídico</div>
      <div><div class="ass-linha"></div>Gestor de RH / Carimbo</div>
    </div>

    <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
    </body></html>`

    const win = window.open('', '_blank', 'width=1200,height=900')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ─── Filtros ──────────────────────────────────────────────────────────────
  const colabsFiltrados = colabs.filter(c => {
    const q = query.toLowerCase()
    return !q || c.nome.toLowerCase().includes(q) || (c.chapa ?? '').toLowerCase().includes(q) || (c.cpf ?? '').includes(q)
  })
  const lnFiltradas = listaNegra.filter(l => {
    const q = searchLN.toLowerCase()
    return !q || l.nome.toLowerCase().includes(q) || (l.cpf ?? '').includes(q) || l.motivo.toLowerCase().includes(q)
  })

  const statusColor: Record<string, string> = {
    ativo: '#15803d', inativo: '#dc2626', ferias: '#1d4ed8', afastado: '#b45309',
  }
  const statusBg: Record<string, string> = {
    ativo: '#dcfce7', inativo: '#fee2e2', ferias: '#eff6ff', afastado: '#fef3c7',
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Scale size={24} color="#93c5fd" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)' }}>Jurídico</h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Dossiê completo + lista negra</p>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--muted)', borderRadius: 10, padding: 4, marginBottom: 24, width: 'fit-content' }}>
        {([['ficha','📋 Dossiê do Colaborador'],['lista_negra','🚫 Lista Negra']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)} style={{
            padding: '8px 20px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
            background: aba === id ? 'var(--background)' : 'transparent',
            color: aba === id ? 'var(--foreground)' : 'var(--muted-foreground)',
            boxShadow: aba === id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
          }}>{label}</button>
        ))}
      </div>

      {/* ═══ ABA FICHA ═══ */}
      {aba === 'ficha' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
          {/* Lista colaboradores */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', position: 'sticky', top: 20 }}>
            <div style={{ padding: '14px 16px', background: '#1e3a5f' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 8 }}>Selecionar Colaborador</div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome, chapa ou CPF…"
                  style={{ width: '100%', height: 36, border: '1px solid #334155', borderRadius: 8, paddingLeft: 30, paddingRight: 10, fontSize: 12, background: '#0f172a', color: '#fff', boxSizing: 'border-box' }} />
              </div>
              {/* Filtros status */}
              <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                {['ativo','inativo','ferias','afastado'].map(s => {
                  const cnt = colabs.filter(c => c.status === s).length
                  return <span key={s} style={{ background: 'rgba(255,255,255,.1)', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700 }}>{s}: {cnt}</span>
                })}
              </div>
            </div>
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {colabsFiltrados.map(c => (
                <button key={c.id} onClick={() => carregarFicha(c)} style={{
                  width: '100%', padding: '10px 16px', border: 'none', textAlign: 'left', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: selecionado?.id === c.id ? '#eff6ff' : 'transparent',
                  borderLeft: selecionado?.id === c.id ? '3px solid #1e3a5f' : '3px solid transparent',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--foreground)' }}>{c.nome}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>#{c.chapa ?? '—'}</span>
                    {c.cpf && <span>{fmtCPF(c.cpf)}</span>}
                    <span style={{ marginLeft: 'auto', background: statusBg[c.status] ?? '#fee2e2', color: statusColor[c.status] ?? '#dc2626', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                      {c.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Painel direito */}
          {!selecionado ? (
            <div style={{ background: 'var(--card)', border: '2px dashed var(--border)', borderRadius: 12, padding: 60, textAlign: 'center', color: 'var(--muted-foreground)' }}>
              <Scale size={48} style={{ margin: '0 auto 12px', opacity: 0.2 }} />
              <div style={{ fontWeight: 700, fontSize: 16 }}>Selecione um colaborador</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>O dossiê completo será carregado aqui</div>
              <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>Ativos, inativos, férias e afastados — todos os registros</div>
            </div>
          ) : loadingFicha ? (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 60, textAlign: 'center' }}>
              <Loader2 size={36} style={{ margin: '0 auto 12px', color: '#1e3a5f', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Carregando dossiê completo…</div>
            </div>
          ) : fichaData.colab ? (
            <FichaCompleta fichaData={fichaData} onPDF={gerarPDF} />
          ) : null}
        </div>
      )}

      {/* ═══ ABA LISTA NEGRA ═══ */}
      {aba === 'lista_negra' && (
        <div>
          {/* Verificação por CPF */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>🔍 Verificar CPF na Lista Negra</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <input placeholder="Digite o CPF para verificar: 000.000.000-00"
                style={{ flex: 1, height: 40, border: '1px solid var(--border)', borderRadius: 8, padding: '0 14px', fontSize: 13, background: 'var(--background)', color: 'var(--foreground)' }}
                onChange={e => verificarLNCPF(e.target.value)} />
            </div>
            {alertaListaNegra && (
              <div style={{ marginTop: 10, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🚫</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#dc2626' }}>CPF ENCONTRADO NA LISTA NEGRA!</div>
                  <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 3 }}><strong>{alertaListaNegra.nome}</strong> — {alertaListaNegra.motivo}</div>
                  {alertaListaNegra.processo_numero && <div style={{ fontSize: 11, color: '#b91c1c' }}>Processo: {alertaListaNegra.processo_numero}</div>}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
                <input value={searchLN} onChange={e => setSearchLN(e.target.value)} placeholder="Buscar…"
                  style={{ height: 38, border: '1px solid var(--border)', borderRadius: 8, paddingLeft: 30, paddingRight: 10, fontSize: 13, width: 260, background: 'var(--background)', color: 'var(--foreground)' }} />
              </div>
              <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>🚫 {listaNegra.length} registros</span>
            </div>
            <button onClick={() => setModalLN(true)} style={{ height: 38, padding: '0 18px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={15} /> Adicionar à Lista Negra
            </button>
          </div>

          {loadingLN ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto' }} /></div>
          ) : lnFiltradas.length === 0 ? (
            <div style={{ background: 'var(--card)', border: '2px dashed var(--border)', borderRadius: 12, padding: 48, textAlign: 'center', color: 'var(--muted-foreground)' }}>
              <ShieldAlert size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>Lista negra vazia</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lnFiltradas.map(ln => (
                <div key={ln.id} style={{ background: 'var(--card)', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fee2e2', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserX size={20} color="#dc2626" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>{ln.nome}</span>
                      {ln.cpf && <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>CPF: {fmtCPF(ln.cpf)}</span>}
                      {ln.processo_numero && <span style={{ background: '#fef3c7', color: '#b45309', borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>Proc: {ln.processo_numero}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 4 }}>⚠ {ln.motivo}</div>
                    {ln.observacoes && <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{ln.observacoes}</div>}
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>Registrado em {fmtDate(ln.data_registro)}</div>
                  </div>
                  <button onClick={() => setDeleteLNId(ln.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', flexShrink: 0 }}>
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
          <div style={{ background: 'var(--background)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>🚫 Adicionar à Lista Negra</div>
              <button onClick={() => setModalLN(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            {[
              { label: 'Nome Completo *', key: 'nome', placeholder: 'Nome do profissional' },
              { label: 'CPF', key: 'cpf', placeholder: '000.000.000-00' },
              { label: 'Número do Processo', key: 'processo_numero', placeholder: 'Ex.: 0001234-56.2024.5.02.0001' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>{f.label}</label>
                <input value={(formLN as any)[f.key]} onChange={e => setFormLN(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                  style={{ width: '100%', height: 40, border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', fontSize: 13, background: 'var(--background)', color: 'var(--foreground)', boxSizing: 'border-box' }} />
              </div>
            ))}
            {['motivo', 'observacoes'].map(k => (
              <div key={k} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>{k === 'motivo' ? 'Motivo *' : 'Observações'}</label>
                <textarea value={(formLN as any)[k]} onChange={e => setFormLN(p => ({ ...p, [k]: e.target.value }))} rows={3}
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: 13, background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModalLN(false)} style={{ flex: 1, height: 44, border: '1px solid var(--border)', background: 'transparent', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarLN} disabled={savingLN} style={{ flex: 2, height: 44, border: 'none', background: '#dc2626', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {savingLN ? <Loader2 size={15} className="animate-spin" /> : <ShieldAlert size={15} />} Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Confirmar exclusão lista negra ══ */}
      {deleteLNId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--background)', borderRadius: 14, padding: 24, maxWidth: 320, width: '100%' }}>
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

// ─── Ficha Completa ───────────────────────────────────────────────────────────
function FichaCompleta({ fichaData, onPDF }: { fichaData: Record<string,any>; onPDF: () => void }) {
  const d         = fichaData.colab as any
  const ocs       = (fichaData.ocorrencias    as any[]) ?? []
  const ats       = (fichaData.atestados      as any[]) ?? []
  const acids     = (fichaData.acidentes      as any[]) ?? []
  const advs      = (fichaData.advertencias   as any[]) ?? []
  const docs      = (fichaData.documentos     as any[]) ?? []
  const docsAv    = (fichaData.documentos_avulsos as any[]) ?? []
  const epis      = (fichaData.epis           as any[]) ?? []
  const pontos    = (fichaData.ponto          as any[]) ?? []
  const regs      = (fichaData.registros      as any[]) ?? []
  const adiantos  = (fichaData.adiantamentos  as any[]) ?? []
  const prs       = (fichaData.premios        as any[]) ?? []
  const vts       = (fichaData.vt             as any[]) ?? []
  const provs     = (fichaData.provisoes      as any[]) ?? []
  const pags      = (fichaData.pagamentos     as any[]) ?? []
  const histCh    = (fichaData.historico_chapa as any[]) ?? []
  const histCont  = (fichaData.historico_contrato as any[]) ?? []

  const totalFaltas = regs.filter((r: any) => r.falta).length
  const totalHExtra = regs.reduce((s: number, r: any) => s + (r.horas_extras ?? 0), 0)
  const totalAdiant = adiantos.reduce((s: number, a: any) => s + (a.valor ?? 0), 0)
  const totalPremio = prs.reduce((s: number, p: any) => s + (p.valor ?? 0), 0)
  const totalVT     = vts.reduce((s: number, v: any) => s + (v.valor_empresa ?? v.valor ?? 0), 0)
  const totalPago   = pags.filter((p: any) => p.status === 'pago').reduce((s: number, p: any) => s + (p.valor_liquido ?? 0), 0)

  const statusColor: Record<string, string> = { ativo: '#15803d', inativo: '#dc2626', ferias: '#1d4ed8', afastado: '#b45309' }
  const statusBg:    Record<string, string> = { ativo: '#dcfce7', inativo: '#fee2e2', ferias: '#eff6ff', afastado: '#fef3c7' }

  const todosAnexos = [
    ...docs.filter((d2: any) => d2.arquivo_url).map((d2: any) => ({ nome: d2.nome ?? d2.tipo, url: d2.arquivo_url, tipo: '📄 Documento' })),
    ...docsAv.filter((d2: any) => d2.documento_url).map((d2: any) => ({ nome: d2.documento_nome ?? d2.tipo, url: d2.documento_url, tipo: '📎 Avulso' })),
    ...advs.filter((a: any) => a.arquivo_url).map((a: any) => ({ nome: 'Adv. ' + fmtDate(a.data_advertencia), url: a.arquivo_url, tipo: '📋 Advertência' })),
    ...ats.filter((a: any) => a.arquivo_url).map((a: any) => ({ nome: 'Atestado ' + fmtDate(a.data), url: a.arquivo_url, tipo: '🏥 Atestado' })),
  ]

  const [abertas, setAbertas] = useState<Record<string, boolean>>({
    pessoal: true, profissional: true, historico: false, ponto: false,
    pagamentos: false, adiantamentos: false, premios: false, vt: false,
    provisoes: false, ocorrencias: false, atestados: false, acidentes: false,
    advertencias: false, epis: false, documentos: false,
  })
  const tog = (k: string) => setAbertas(p => ({ ...p, [k]: !p[k] }))

  const Sec = ({ id, icon, title, count, countRed = false, children }: { id: string; icon: React.ReactNode; title: string; count: number | string; countRed?: boolean; children: React.ReactNode }) => (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
      <button onClick={() => tog(id)} style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer' }}>
        <span>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, textAlign: 'left', color: 'var(--foreground)' }}>{title}</span>
        <span style={{ background: countRed && +count > 0 ? '#fee2e2' : 'var(--muted)', color: countRed && +count > 0 ? '#dc2626' : 'var(--muted-foreground)', borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
          {count}
        </span>
        {abertas[id] ? <ChevronUp size={15} color="var(--muted-foreground)" /> : <ChevronDown size={15} color="var(--muted-foreground)" />}
      </button>
      {abertas[id] && <div style={{ padding: '2px 16px 16px' }}>{children}</div>}
    </div>
  )

  const Campo = ({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted-foreground)', letterSpacing: '0.04em', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}<span>{label}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', wordBreak: 'break-word' }}>{value || '—'}</div>
    </div>
  )

  const Tabela = ({ headers, rows }: { headers: string[]; rows: string[][] }) => (
    rows.length === 0
      ? <div style={{ textAlign: 'center', padding: '14px', color: 'var(--muted-foreground)', fontSize: 12, fontStyle: 'italic' }}>Nenhum registro</div>
      : <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background: 'var(--muted)' }}>
              {headers.map(h => <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, fontSize: 10, color: 'var(--muted-foreground)', borderBottom: '2px solid var(--border)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}
            </tr></thead>
            <tbody>{rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 1 ? 'rgba(0,0,0,0.015)' : 'transparent' }}>
                {row.map((cell, j) => <td key={j} style={{ padding: '6px 10px', color: 'var(--foreground)', fontSize: 12 }}>{cell}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
  )

  return (
    <div>
      {/* Topo azul */}
      <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d5a9e)', borderRadius: 14, padding: '20px 24px', marginBottom: 14, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>{d.nome}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ background: 'rgba(255,255,255,.15)', borderRadius: 4, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>Chapa #{d.chapa ?? '—'}</span>
              {d.funcoes?.nome && <span style={{ background: 'rgba(255,255,255,.12)', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>⚙️ {d.funcoes.nome}</span>}
              {d.obras?.nome && <span style={{ background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>🏗️ {d.obras.nome}</span>}
              <span style={{ background: statusBg[d.status] ?? '#fee2e2', color: statusColor[d.status] ?? '#dc2626', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>
                {(d.status ?? 'inativo').toUpperCase()}
              </span>
            </div>
          </div>
          <button onClick={onPDF} style={{ background: '#fff', color: '#1e3a5f', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <FileText size={15} /> Gerar PDF Dossiê
          </button>
        </div>

        {/* Linha de info rápida */}
        <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', fontSize: 11, opacity: 0.9 }}>
          {[
            ['📅 Admissão', fmtDate(d.data_admissao)],
            d.data_status ? ['🚪 Saída', fmtDate(d.data_status)] : null,
            ['🪪 CPF', fmtCPF(d.cpf)],
            ['📋 PIS', d.pis_nit ?? '—'],
            ['📱 Tel', d.telefone ?? '—'],
            ['🏗️ Obra', d.obras?.nome ?? '—'],
          ].filter(Boolean).map(([l, v]: any) => (
            <span key={l} style={{ display: 'flex', gap: 4 }}><span style={{ opacity: 0.7 }}>{l}:</span><strong>{v}</strong></span>
          ))}
        </div>

        {/* Contadores rápidos */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          {[
            { l: 'Ocorrências', v: ocs.length + ats.length + acids.length, cor: ocs.length + ats.length + acids.length > 0 ? '#fca5a5' : 'rgba(255,255,255,.2)', tc: '#fff' },
            { l: 'Faltas', v: totalFaltas, cor: totalFaltas > 0 ? '#fca5a5' : 'rgba(255,255,255,.2)', tc: '#fff' },
            { l: 'H. Extras', v: totalHExtra.toFixed(1) + 'h', cor: 'rgba(255,255,255,.15)', tc: '#fff' },
            { l: 'Períodos Ponto', v: pontos.length, cor: 'rgba(255,255,255,.15)', tc: '#fff' },
            { l: 'Pagamentos', v: pags.length, cor: 'rgba(255,255,255,.15)', tc: '#fff' },
            { l: 'Total Pago', v: fmtCur(totalPago), cor: 'rgba(255,255,255,.15)', tc: '#fff' },
            { l: 'Adiantamentos', v: fmtCur(totalAdiant), cor: 'rgba(255,255,255,.15)', tc: '#fff' },
            { l: 'VT Total', v: fmtCur(totalVT), cor: 'rgba(255,255,255,.15)', tc: '#fff' },
          ].map(c => (
            <div key={c.l} style={{ background: c.cor, borderRadius: 8, padding: '7px 14px', textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: c.tc }}>{c.v}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,.75)', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>{c.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Seção dados pessoais */}
      <Sec id="pessoal" icon={<User size={15} />} title="Dados Pessoais" count={0}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 20px' }}>
          <Campo label="CPF" value={fmtCPF(d.cpf)} icon={<User size={10} />} />
          <Campo label="RG" value={d.rg ?? '—'} />
          <Campo label="PIS/NIT" value={d.pis_nit ?? '—'} />
          <Campo label="Data de Nascimento" value={fmtDate(d.data_nascimento)} icon={<Calendar size={10} />} />
          <Campo label="Gênero" value={d.genero ?? '—'} />
          <Campo label="Estado Civil" value={d.estado_civil ?? '—'} />
          <Campo label="Telefone" value={d.telefone ?? '—'} icon={<Phone size={10} />} />
          <Campo label="E-mail" value={d.email ?? '—'} icon={<Mail size={10} />} />
          <Campo label="CNH" value={d.cnh ?? '—'} />
          <Campo label="Endereço" value={d.endereco ?? '—'} icon={<MapPin size={10} />} />
          <Campo label="Cidade / Estado" value={[d.cidade, d.estado].filter(Boolean).join(' / ') || '—'} />
          <Campo label="CEP" value={d.cep ?? '—'} />
        </div>
      </Sec>

      <Sec id="profissional" icon={<Briefcase size={15} />} title="Dados Profissionais" count={0}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 20px' }}>
          <Campo label="Função Atual" value={d.funcoes?.nome ?? '—'} />
          <Campo label="Obra Atual" value={d.obras?.nome ?? '—'} icon={<Building2 size={10} />} />
          <Campo label="Tipo de Contrato" value={d.tipo_contrato ?? '—'} />
          <Campo label="Salário Base" value={fmtCur(d.salario_base)} icon={<DollarSign size={10} />} />
          <Campo label="Data de Admissão" value={fmtDate(d.data_admissao)} icon={<Calendar size={10} />} />
          <Campo label="Data de Saída/Alteração" value={fmtDate(d.data_status)} />
          <Campo label="Status" value={d.status ?? '—'} />
          <Campo label="CTPS Nº" value={d.ctps_numero ?? '—'} />
          <Campo label="CTPS Série" value={d.ctps_serie ?? '—'} />
          <Campo label="Banco" value={d.banco ?? '—'} icon={<CreditCard size={10} />} />
          <Campo label="Agência / Conta" value={[d.agencia, d.conta].filter(Boolean).join(' / ') || '—'} />
          <Campo label="Chave PIX" value={d.pix_chave ?? '—'} />
        </div>
      </Sec>

      <Sec id="historico" icon={<Hash size={15} />} title="Histórico de Chapas / Funções" count={histCh.length}>
        <Tabela headers={['Chapa','Função','Tipo Contrato','Início','Fim','Motivo']}
          rows={histCh.map((h: any) => [h.chapa??'—', h.funcoes?.nome??'—', h.tipo_contrato??'—', fmtDate(h.data_inicio), fmtDate(h.data_fim), h.motivo_troca??'—'])} />
      </Sec>

      <Sec id="ponto" icon={<Clock size={15} />} title="Histórico de Ponto" count={`${pontos.length} períodos · ${regs.length} dias · ${totalFaltas} faltas`} countRed={totalFaltas > 0}>
        {pontos.length === 0
          ? <div style={{ textAlign: 'center', padding: 16, color: 'var(--muted-foreground)', fontSize: 12, fontStyle: 'italic' }}>Nenhum período de ponto</div>
          : pontos.map((p: any) => {
              const linhas = regs.filter((r: any) => r.lancamento_id === p.id || (r.colaborador_id === d.id && r.data >= `${p.mes_referencia}-01` && r.data <= `${p.mes_referencia}-31`))
              const faltasP = linhas.filter((r: any) => r.falta).length
              const hExtraP = linhas.reduce((s: number, r: any) => s + (r.horas_extras ?? 0), 0)
              return (
                <PeriodoPonto key={p.id} periodo={p} registros={linhas} faltas={faltasP} hExtra={hExtraP} />
              )
            })}
      </Sec>

      <Sec id="pagamentos" icon={<CreditCard size={15} />} title="Pagamentos" count={`${pags.length} · ${fmtCur(totalPago)} pago`}>
        <Tabela headers={['Competência','Tipo','Valor Bruto','Líquido','Status','Data Pagto']}
          rows={pags.map((p: any) => [fmtMes(p.competencia), p.tipo??'—', fmtCur(p.valor_bruto), fmtCur(p.valor_liquido), p.status??'—', fmtDate(p.data_pagamento)])} />
      </Sec>

      <Sec id="adiantamentos" icon={<DollarSign size={15} />} title="Adiantamentos" count={`${adiantos.length} · ${fmtCur(totalAdiant)}`}>
        <Tabela headers={['Competência','Tipo','Valor','Status','Observações']}
          rows={adiantos.map((a: any) => [fmtMes(a.competencia), a.tipo??'—', fmtCur(a.valor), a.status??'—', (a.observacoes??'').substring(0,40)])} />
      </Sec>

      <Sec id="premios" icon={<span>🏆</span>} title="Prêmios e Bonificações" count={`${prs.length} · ${fmtCur(totalPremio)}`}>
        <Tabela headers={['Competência','Tipo','Descrição','Valor','Status']}
          rows={prs.map((p: any) => [fmtMes(p.competencia), p.tipo??'—', (p.descricao??'—').substring(0,40), fmtCur(p.valor), p.status??'—'])} />
      </Sec>

      <Sec id="vt" icon={<Truck size={15} />} title="Vale Transporte" count={`${vts.length} · ${fmtCur(totalVT)}`}>
        <Tabela headers={['Competência','Tipo','Valor','Desc. Colab.','Valor Empresa','Status']}
          rows={vts.map((v: any) => [fmtMes(v.competencia), v.tipo??'—', fmtCur(v.valor), fmtCur(v.desconto_colaborador), fmtCur(v.valor_empresa), v.status??'—'])} />
      </Sec>

      <Sec id="provisoes" icon={<span>🏛️</span>} title="Provisões FGTS" count={provs.length}>
        <Tabela headers={['Competência','Salário Base','FGTS Mensal','Férias','13º','Total']}
          rows={provs.map((p: any) => [fmtMes(p.competencia), fmtCur(p.salario_base), fmtCur(p.fgts_mensal), fmtCur(p.ferias_provisionadas), fmtCur(p.decimo_terceiro), fmtCur(p.total_provisao)])} />
      </Sec>

      <Sec id="ocorrencias" icon={<AlertTriangle size={15} />} title="Ocorrências" count={ocs.length} countRed>
        <Tabela headers={['Data','Tipo','Descrição','Status']}
          rows={ocs.map((o: any) => [fmtDate(o.data), o.tipo??'—', (o.descricao??'—').substring(0,60), o.status??'—'])} />
      </Sec>

      <Sec id="atestados" icon={<span>🏥</span>} title="Atestados" count={ats.length} countRed>
        <Tabela headers={['Data','Tipo','CID','Médico','Dias Afast.','Status']}
          rows={ats.map((a: any) => [fmtDate(a.data), a.tipo??'—', a.cid??'—', a.medico??a.nome_medico??'—', a.dias_afastamento??'—', a.status??'—'])} />
      </Sec>

      <Sec id="acidentes" icon={<span>🚨</span>} title="Acidentes" count={acids.length} countRed>
        <Tabela headers={['Data','Tipo','Gravidade','Local','CAT Emitida','Status']}
          rows={acids.map((a: any) => [fmtDate(a.data_ocorrencia), a.tipo??'—', a.gravidade??'—', a.local_acidente??'—', a.cat_emitida?'✓ Sim':'✗ Não', a.status??'—'])} />
      </Sec>

      <Sec id="advertencias" icon={<span>📋</span>} title="Advertências" count={advs.length} countRed>
        <Tabela headers={['Data','Tipo','Motivo','Suspensão','Assinada','Arquivo']}
          rows={advs.map((a: any) => [fmtDate(a.data_advertencia), a.tipo??'—', (a.motivo??'—').substring(0,50), a.dias_suspensao?a.dias_suspensao+' dias':'—', a.assinada?'✓ Sim':'✗ Não',
            a.arquivo_url ? '📎 Anexo' : '—'])} />
      </Sec>

      <Sec id="epis" icon={<Shield size={15} />} title="EPIs Vinculados" count={epis.length}>
        <Tabela headers={['EPI','Categoria','Nº CA']}
          rows={epis.map((e: any) => [e.epi_catalogo?.nome??'—', e.epi_catalogo?.categoria??'—', e.epi_catalogo?.numero_ca??'—'])} />
      </Sec>

      <Sec id="documentos" icon={<FileText size={15} />} title="Documentos e Anexos" count={docs.length + docsAv.length + todosAnexos.length}>
        {docs.length > 0 && <Tabela headers={['Tipo','Nome','Validade','Status']} rows={docs.map((d2: any) => [d2.tipo??'—', (d2.nome??'—').substring(0,40), fmtDate(d2.data_validade), d2.status??'—'])} />}
        {docsAv.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: 4 }}>DOCUMENTOS AVULSOS</div>
            <Tabela headers={['Tipo','Arquivo','Data']} rows={docsAv.map((d2: any) => [d2.tipo??'—', d2.documento_nome??'—', fmtDate(d2.data)])} />
          </div>
        )}
        {todosAnexos.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-foreground)', marginBottom: 8 }}>LINKS DE ANEXOS ({todosAnexos.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
              {todosAnexos.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--muted)', borderRadius: 8, padding: '10px 8px', textDecoration: 'none', gap: 4, border: '1px solid var(--border)' }}>
                  <ExternalLink size={16} color="#1d4ed8" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground)', textAlign: 'center', wordBreak: 'break-word' }}>{a.nome}</span>
                  <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>{a.tipo}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </Sec>
    </div>
  )
}

// ── Sub-componente para cada período de ponto ─────────────────────────────────
function PeriodoPonto({ periodo, registros, faltas, hExtra }: { periodo: any; registros: any[]; faltas: number; hExtra: number }) {
  const [aberto, setAberto] = useState(false)
  const statusCor: Record<string, string> = { rascunho: '#b45309', fechado: '#1d4ed8', aprovado: '#15803d' }
  const statusBgC: Record<string, string> = { rascunho: '#fef3c7', fechado: '#eff6ff', aprovado: '#dcfce7' }
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
      <button onClick={() => setAberto(p => !p)} style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--muted)', border: 'none', cursor: 'pointer' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{fmtMes(periodo.mes_referencia)}</span>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{periodo.obras?.nome ?? 'Sem obra'}</span>
          <span style={{ background: statusBgC[periodo.status] ?? '#f1f5f9', color: statusCor[periodo.status] ?? '#374151', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>{periodo.status}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, color: 'var(--muted-foreground)' }}>
          <span>📅 {registros.length} dias</span>
          {faltas > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>✗ {faltas} faltas</span>}
          {hExtra > 0 && <span style={{ color: '#15803d', fontWeight: 700 }}>+{hExtra.toFixed(1)}h</span>}
          {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </button>
      {aberto && registros.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ background: 'var(--muted)' }}>
              {['Data','Status','H.Trabalh.','H.Extra','Falta','Observações'].map(h => (
                <th key={h} style={{ padding: '5px 10px', textAlign: 'left', fontWeight: 700, fontSize: 10, color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {registros.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: r.falta ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                  <td style={{ padding: '5px 10px', fontWeight: 600, fontSize: 12 }}>{fmtDate(r.data)}</td>
                  <td style={{ padding: '5px 10px' }}>
                    <span style={{ fontWeight: 700, color: r.falta ? '#dc2626' : '#15803d', fontSize: 11 }}>{r.status ?? '—'}</span>
                  </td>
                  <td style={{ padding: '5px 10px', fontSize: 12 }}>{r.horas_trabalhadas ? r.horas_trabalhadas + 'h' : '—'}</td>
                  <td style={{ padding: '5px 10px', fontSize: 12, color: r.horas_extras > 0 ? '#15803d' : 'inherit', fontWeight: r.horas_extras > 0 ? 700 : 400 }}>{r.horas_extras ? '+' + r.horas_extras + 'h' : '—'}</td>
                  <td style={{ padding: '5px 10px', textAlign: 'center' }}>{r.falta ? <span style={{ color: '#dc2626', fontWeight: 700 }}>✗</span> : <span style={{ color: '#15803d' }}>✓</span>}</td>
                  <td style={{ padding: '5px 10px', fontSize: 11, color: 'var(--muted-foreground)', maxWidth: 200 }}>{(r.observacoes ?? '').substring(0, 40)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aberto && registros.length === 0 && (
        <div style={{ padding: 12, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12, fontStyle: 'italic' }}>Nenhum dia lançado neste período</div>
      )}
    </div>
  )
}
