import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Receipt, LogOut, AlertCircle, Key, Eye, EyeOff, Loader2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Download, Printer, Plus, Minus, Info, CalendarDays,
  Clock, FolderOpen, FileCheck, FileX, CheckCircle2, ShieldCheck,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Sessao = {
  colaborador_id: string; acesso_id: string
  login: string; nome: string; chapa: string
}

type Contracheque = {
  id: string; competencia: string; tipo: string
  descricao: string | null; arquivo_url: string | null
  bruto: number | null; liquido: number | null; descontos: number | null
  inss: number | null; fgts: number | null; irrf: number | null
  salario_base: number | null; horas_normais: number | null; horas_extras: number | null
  valor_producao: number | null; valor_dsr: number | null; valor_premio: number | null
  desconto_vt: number | null; desconto_adiant: number | null; cesta_basica: number | null
  funcao: string | null; tipo_contrato_snap: string | null; obra_nome: string | null
  dias_trabalhados: number | null; faltas: number | null
  gerado_do_sistema: boolean | null; publicado_em: string | null
}

type AceiteDigital = {
  id: string; contracheque_id: string; aceito_em: string
  ip_address: string | null; nome_colaborador: string | null; chapa: string | null; competencia: string | null
}

// Busca o IP público via API externa (fallback: 'desconhecido')
async function getIpPublico(): Promise<string> {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) })
    const j = await r.json()
    return j.ip ?? 'desconhecido'
  } catch { return 'desconhecido' }
}

type PontoLancamento = {
  id: string; mes_referencia: string; data_inicio: string; data_fim: string
  status: string; data_pagamento: string | null
  snap_horas_normais: number | null; snap_horas_extras: number | null
  snap_valor_horas: number | null; snap_valor_producao: number | null
  snap_valor_dsr: number | null; snap_valor_premio: number | null
  snap_valor_total: number | null; snap_faltas: number | null
  snap_desconto_vt: number | null; snap_desconto_adiant: number | null
  snap_inss: number | null; snap_ir: number | null; snap_liquido: number | null
}

type ColabInfo = {
  nome: string; chapa: string | null; cpf: string | null
  funcao: string | null; tipo_contrato: string | null
  data_admissao: string | null; salario: number | null
}

type EmpresaInfo = {
  nome: string; cnpj: string; cidade: string; logo_url: string
  codigos?: Record<string, string>  // codigos contabeis configurados: { salario:'0001', producao:'0002', ... }
}

type RegistroPonto = {
  id: string; data: string
  hora_entrada: string | null; hora_saida: string | null
  horas_trabalhadas: number | null; horas_extra: number | null
  horas_falta: number | null; status: string | null; observacoes: string | null
}

type ColaboradorDocumento = {
  id: string; titulo: string; tipo: string
  descricao: string | null; arquivo_url: string | null
  visivel_colaborador: boolean; criado_em: string; assinou_em: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

function mesAtualStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtComp(d: string) {
  const [y, m] = d.slice(0, 7).split('-')
  return `${MESES[parseInt(m) - 1]} ${y}`
}
function fmtCompAbr(d: string) {
  const [y, m] = d.slice(0, 7).split('-')
  return `${MESES_ABR[parseInt(m) - 1]}/${y}`
}
function fmtR(v: number | null | undefined): string {
  if (!v) return 'R$ 0,00'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtCPF(c: string) {
  const d = c.replace(/\D/g, '')
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}
function fmtData(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function formatarCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`
}
function fmtHora(h: string | null): string {
  if (!h) return '—'
  return h.slice(0, 5)
}

// Converte URL pública do Storage em link seguro /doc-viewer
// Só redireciona URLs reais do Supabase Storage (não base64, não URLs externas)
function secureDocUrl(url: string | null | undefined): string {
  if (!url || url === '#') return '#'
  // Base64: não redirecionar (é dado local)
  if (url.startsWith('data:')) return url
  // Supabase Storage: redirecionar pelo DocViewer autenticado
  const isSupabaseStorage = url.includes('.supabase.co/storage/') || url.includes('.supabase_')
  if (isSupabaseStorage) {
    return `${window.location.origin}${window.location.pathname}#/doc-viewer?url=${encodeURIComponent(url)}`
  }
  // URL externa ou outro: abrir diretamente
  return url
}
function fmtDiaSemana(d: string): string {
  const [y, m, day] = d.split('-')
  const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(day))
  return `${DIAS_SEMANA[dt.getDay()]}, ${day}/${m}`
}
// Gera lista de meses desde a admissão até o mês atual
function mesesDesdeAdmissao(dataAdmissao: string | null): { val: string; label: string }[] {
  const result = []
  const now = new Date()
  const mesAtual = new Date(now.getFullYear(), now.getMonth(), 1)
  // Início: mês de admissão (ou 12 meses atrás como fallback)
  let inicio: Date
  if (dataAdmissao) {
    const [y, m] = dataAdmissao.split('-').map(Number)
    inicio = new Date(y, m - 1, 1)
  } else {
    inicio = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  }
  // Gera do mais recente para o mais antigo
  let cur = new Date(mesAtual)
  while (cur >= inicio) {
    const val = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
    result.push({ val, label: `${MESES[cur.getMonth()]} ${cur.getFullYear()}` })
    cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1)
  }
  return result
}

// Fallback para 12 meses (sem data de admissão)
function mesesDisponiveis(): { val: string; label: string }[] {
  return mesesDesdeAdmissao(null)
}

const TIPO_LABEL: Record<string, string> = {
  mensal:'Mensal', '13o_1a':'13º — 1ª Parcela',
  '13o_2a':'13º — 2ª Parcela', ferias:'Férias', adiantamento:'Adiantamento',
}
const SESSION_KEY = 'contracheque_session'

// ─── Donut Chart ──────────────────────────────────────────────────────────────
function DonutChart({ slices, size = 120 }: {
  slices: { valor: number; cor: string; label: string }[]; size?: number
}) {
  const total = slices.reduce((s, sl) => s + sl.valor, 0)
  if (total <= 0) return null
  const r = size / 2 - 12; const cx = size / 2; const cy = size / 2; const strokeW = 22
  let acum = -90
  const arcos = slices.map(sl => {
    const pct = sl.valor / total; const deg = pct * 360; const start = acum; acum += deg
    const sr = (start * Math.PI) / 180; const er = ((start + deg) * Math.PI) / 180
    const x1 = cx + r * Math.cos(sr); const y1 = cy + r * Math.sin(sr)
    const x2 = cx + r * Math.cos(er); const y2 = cy + r * Math.sin(er)
    return { ...sl, pct, path: `M ${x1} ${y1} A ${r} ${r} 0 ${deg > 180 ? 1 : 0} 1 ${x2} ${y2}`, deg }
  })
  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={strokeW} />
      {arcos.map((a, i) => (
        <path key={i} d={a.path} fill="none" stroke={a.cor} strokeWidth={strokeW} strokeLinecap="butt" />
      ))}
    </svg>
  )
}

// ─── Secao accordion ─────────────────────────────────────────────────────────
function Secao({ titulo, icone, cor, aberto, onToggle, children }: {
  titulo: string; icone: React.ReactNode; cor: string
  aberto: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ borderBottom: '1px solid #e5e7eb' }}>
      <button onClick={onToggle} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'none', border:'none', cursor:'pointer', textAlign:'left' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ width:24, height:24, borderRadius:'50%', background:cor, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{icone}</span>
          <span style={{ fontWeight:700, fontSize:15, color:'#111827' }}>{titulo}</span>
        </div>
        {aberto ? <ChevronUp size={18} color="#6b7280" /> : <ChevronDown size={18} color="#6b7280" />}
      </button>
      {aberto && <div style={{ paddingBottom:8 }}>{children}</div>}
    </div>
  )
}

function LinhaDetalhe({ codigo, descricao, valor, cor = '#111827' }: {
  codigo?: string; descricao: string; valor: number | null; cor?: string
}) {
  if (!valor || valor <= 0) return null
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid #f3f4f6' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        {codigo && <span style={{ fontSize:10, color:'#9ca3af', fontWeight:600, minWidth:36, background:'#f3f4f6', padding:'1px 5px', borderRadius:4 }}>{codigo}</span>}
        <span style={{ fontSize:14, color:'#374151' }}>{descricao}</span>
      </div>
      <span style={{ fontSize:14, fontWeight:700, color:cor, whiteSpace:'nowrap', marginLeft:8 }}>{fmtR(valor)}</span>
    </div>
  )
}

// ─── Card Bruto/Descontos/Líquido ─────────────────────────────────────────────
function CardResumo({ bruto, descontos, liquido }: { bruto: number; descontos: number; liquido: number }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1px 1fr 1px 1fr', background:'#fff', borderRadius:12, overflow:'hidden', border:'1px solid #e5e7eb', boxShadow:'0 2px 8px rgba(0,0,0,.06)', margin:'0 0 4px' }}>
      <div style={{ padding:'14px 10px', textAlign:'center' }}>
        <div style={{ fontSize:10, color:'#6b7280', fontWeight:600, marginBottom:5, textTransform:'uppercase', letterSpacing:.4 }}>Bruto</div>
        <div style={{ fontSize:15, fontWeight:800, color:'#16a34a' }}>{fmtR(bruto)}</div>
        <div style={{ marginTop:5, display:'flex', justifyContent:'center' }}>
          <span style={{ width:20, height:20, borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center' }}><Plus size={11} color="#16a34a" strokeWidth={3}/></span>
        </div>
      </div>
      <div style={{ background:'#e5e7eb' }}/>
      <div style={{ padding:'14px 10px', textAlign:'center' }}>
        <div style={{ fontSize:10, color:'#6b7280', fontWeight:600, marginBottom:5, textTransform:'uppercase', letterSpacing:.4 }}>Descontos</div>
        <div style={{ fontSize:15, fontWeight:800, color:'#dc2626' }}>{fmtR(descontos)}</div>
        <div style={{ marginTop:5, display:'flex', justifyContent:'center' }}>
          <span style={{ width:20, height:20, borderRadius:'50%', background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}><Minus size={11} color="#dc2626" strokeWidth={3}/></span>
        </div>
      </div>
      <div style={{ background:'#e5e7eb' }}/>
      <div style={{ padding:'14px 10px', textAlign:'center' }}>
        <div style={{ fontSize:10, color:'#6b7280', fontWeight:600, marginBottom:5, textTransform:'uppercase', letterSpacing:.4 }}>Líquido</div>
        <div style={{ fontSize:15, fontWeight:800, color:'#1d4ed8' }}>{fmtR(liquido)}</div>
        <div style={{ marginTop:5, display:'flex', justifyContent:'center' }}>
          <span style={{ width:20, height:20, borderRadius:'50%', background:'#dbeafe', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="11" height="11" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="none" stroke="#1d4ed8" strokeWidth="2"/><path d="M3 6l2 2 4-4" stroke="#1d4ed8" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Detalhe do Contracheque (tela completa) ──────────────────────────────────
function TelaHolerite({ h, colab, empresa, aceite, onVoltar }: {
  h: Contracheque; colab: ColabInfo | null; empresa: EmpresaInfo | null
  aceite: AceiteDigital | null; onVoltar: () => void
}) {
  const [secAberta, setSecAberta] = useState<'rendimentos'|'descontos'|'infos'|null>('rendimentos')
  const bruto     = h.bruto ?? 0
  const descontos = (h.inss??0)+(h.irrf??0)+(h.desconto_vt??0)+(h.desconto_adiant??0)+(h.cesta_basica??0) || (h.descontos??0)
  const liquido   = h.liquido ?? Math.max(0, bruto - descontos)

  const rendimentos = [
    { cod:'0001', desc:'Salário / Valor Horas', val:h.salario_base,   cor:'#3b82f6' },
    { cod:'0002', desc:'Produção',              val:h.valor_producao, cor:'#10b981' },
    { cod:'0003', desc:'DSR',                   val:h.valor_dsr,      cor:'#6366f1' },
    { cod:'0004', desc:'Prêmios',               val:h.valor_premio,   cor:'#f59e0b' },
  ].filter(r => r.val && r.val > 0)
  if (!rendimentos.length && bruto > 0) rendimentos.push({ cod:'0001', desc:'Total Rendimentos', val:bruto, cor:'#3b82f6' })

  const descontosList = [
    { cod:'0101', desc:'INSS',            val:h.inss,            cor:'#ef4444' },
    { cod:'0102', desc:'IRRF',            val:h.irrf,            cor:'#f97316' },
    { cod:'0103', desc:'Vale Transporte', val:h.desconto_vt,     cor:'#8b5cf6' },
    { cod:'0104', desc:'Adiantamento',    val:h.desconto_adiant, cor:'#ec4899' },
    { cod:'0105', desc:'Cesta Básica',    val:h.cesta_basica,    cor:'#14b8a6' },
  ].filter(d => d.val && d.val > 0)
  if (!descontosList.length && descontos > 0) descontosList.push({ cod:'0101', desc:'Total Descontos', val:descontos, cor:'#ef4444' })

  function imprimir() {
    const w = window.open('', '_blank'); if (!w) return
    const en = empresa?.nome ?? 'Empresa'
    const cnpj = empresa?.cnpj ? `CNPJ: ${empresa.cnpj}` : ''
    const rowsR = rendimentos.map(r => `
      <tr>
        <td style="padding:7px 16px;color:#9ca3af;font-size:10px;width:50px">${r.cod}</td>
        <td style="padding:7px 16px;font-size:13px;color:#111">${r.desc}</td>
        <td style="padding:7px 16px;text-align:right;font-weight:700;color:#16a34a;font-size:13px;white-space:nowrap">${fmtR(r.val)}</td>
      </tr>`).join('')
    const rowsD = descontosList.map(d => `
      <tr>
        <td style="padding:7px 16px;color:#9ca3af;font-size:10px;width:50px">${d.cod}</td>
        <td style="padding:7px 16px;font-size:13px;color:#111">${d.desc}</td>
        <td style="padding:7px 16px;text-align:right;font-weight:700;color:#dc2626;font-size:13px;white-space:nowrap">- ${fmtR(d.val)}</td>
      </tr>`).join('')
    const aceiteHtml = aceite ? `
      <div style="margin:16px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:8px;padding:12px 16px">
        <div style="font-size:10px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">✅ Aceite Digital — Comprovante de Ciência</div>
        <table style="width:100%;font-size:11px;color:#374151;border-collapse:collapse">
          <tr><td style="padding:2px 0;color:#6b7280;width:110px">Colaborador:</td><td style="font-weight:600">${aceite.nome_colaborador ?? colab?.nome ?? '—'}</td></tr>
          <tr><td style="padding:2px 0;color:#6b7280">Aceito em:</td><td style="font-weight:600">${new Date(aceite.aceito_em).toLocaleString('pt-BR')}</td></tr>
          <tr><td style="padding:2px 0;color:#6b7280">IP:</td><td style="font-weight:600;font-family:monospace">${aceite.ip_address ?? '—'}</td></tr>
          <tr><td style="padding:2px 0;color:#6b7280">Competência:</td><td style="font-weight:600">${aceite.competencia ?? fmtComp(h.competencia)}</td></tr>
        </table>
        <div style="font-size:9px;color:#9ca3af;margin-top:6px">Este registro constitui prova de ciência do colaborador nos termos da legislação trabalhista.</div>
      </div>` : ''
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Contracheque — ${fmtComp(h.competencia)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:13px; color:#111; background:#fff }
  @page { size:A4 portrait; margin:0 }
  @media print { body { margin:0 } }
  .page { width:210mm; min-height:297mm; background:#fff; margin:0 auto }
  table { width:100%; border-collapse:collapse }
  tr { border-bottom:1px solid #f3f4f6 }
  tr:last-child { border-bottom:none }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div style="background:#1a56a0;padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-.3px">Contracheque</div>
      <div style="color:rgba(255,255,255,.7);font-size:11px;margin-top:2px">${fmtComp(h.competencia)} · ${TIPO_LABEL[h.tipo]??h.tipo}</div>
    </div>
    <div style="text-align:right">
      <div style="color:#fff;font-size:14px;font-weight:700">${en}</div>
      <div style="color:rgba(255,255,255,.65);font-size:11px">${cnpj}</div>
    </div>
  </div>

  <!-- DADOS DO COLABORADOR -->
  <div style="background:#f0f4f8;padding:10px 20px;border-bottom:1px solid #d0dae5">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px 16px">
      <div><div style="font-size:9px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Matrícula</div><div style="font-size:12px;font-weight:700">${colab?.chapa??'—'}</div></div>
      <div><div style="font-size:9px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Nome</div><div style="font-size:12px;font-weight:700">${colab?.nome??'—'}</div></div>
      <div><div style="font-size:9px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">CPF</div><div style="font-size:12px">${colab?.cpf?fmtCPF(colab.cpf):'—'}</div></div>
      <div><div style="font-size:9px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Admissão</div><div style="font-size:12px">${fmtData(colab?.data_admissao??null)}</div></div>
      <div><div style="font-size:9px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Cargo</div><div style="font-size:12px">${h.funcao??colab?.funcao??'—'}</div></div>
      <div><div style="font-size:9px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Vínculo</div><div style="font-size:12px">${(h.tipo_contrato_snap??colab?.tipo_contrato??'CLT').toUpperCase()}</div></div>
      ${h.obra_nome?`<div style="grid-column:span 2"><div style="font-size:9px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Obra</div><div style="font-size:12px">${h.obra_nome}</div></div>`:''}
    </div>
  </div>

  <!-- RESUMO FINANCEIRO -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:2px solid #1a56a0">
    <div style="padding:14px 20px;text-align:center;border-right:1px solid #e5e7eb">
      <div style="font-size:10px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:4px">Total Bruto</div>
      <div style="font-size:20px;font-weight:800;color:#16a34a">${fmtR(bruto)}</div>
    </div>
    <div style="padding:14px 20px;text-align:center;border-right:1px solid #e5e7eb">
      <div style="font-size:10px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:4px">Total Descontos</div>
      <div style="font-size:20px;font-weight:800;color:#dc2626">- ${fmtR(descontos)}</div>
    </div>
    <div style="padding:14px 20px;text-align:center">
      <div style="font-size:10px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:4px">Líquido a Receber</div>
      <div style="font-size:20px;font-weight:800;color:#1a56a0">${fmtR(liquido)}</div>
    </div>
  </div>

  <!-- RENDIMENTOS -->
  <div style="background:#f9fafb;padding:8px 20px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#374151;border-bottom:1px solid #e5e7eb">Rendimentos</div>
  <table><tbody>${rowsR}</tbody></table>
  <div style="display:flex;justify-content:space-between;padding:8px 16px;background:#f0fdf4;border-top:2px solid #bbf7d0;border-bottom:1px solid #e5e7eb">
    <span style="font-weight:700;font-size:13px;color:#15803d">Total Rendimentos</span>
    <span style="font-weight:800;font-size:14px;color:#15803d">${fmtR(bruto)}</span>
  </div>

  <!-- DESCONTOS -->
  <div style="background:#f9fafb;padding:8px 20px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#374151;border-bottom:1px solid #e5e7eb">Descontos</div>
  <table><tbody>${rowsD}</tbody></table>
  <div style="display:flex;justify-content:space-between;padding:8px 16px;background:#fff1f2;border-top:2px solid #fecaca;border-bottom:1px solid #e5e7eb">
    <span style="font-weight:700;font-size:13px;color:#dc2626">Total Descontos</span>
    <span style="font-weight:800;font-size:14px;color:#dc2626">- ${fmtR(descontos)}</span>
  </div>

  ${h.fgts&&h.fgts>0?`
  <!-- FGTS -->
  <div style="margin:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:11px;font-weight:700;color:#1d4ed8">🏦 FGTS depositado pela empresa</div>
      <div style="font-size:10px;color:#3b82f6">Valor não deduzido do seu salário</div>
    </div>
    <span style="font-size:16px;font-weight:800;color:#1d4ed8">${fmtR(h.fgts)}</span>
  </div>`:''}

  <!-- RODAPÉ -->
  <div style="margin:0 16px;padding:10px 0;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af">
    <span>${colab?.nome??''} · Chapa ${colab?.chapa??'—'}</span>
    <span>${h.publicado_em?new Date(h.publicado_em).toLocaleDateString('pt-BR'):'—'}</span>
  </div>

  <!-- ACEITE DIGITAL -->
  ${aceiteHtml}

</div>
<script>window.onload=()=>{ window.print() }</script>
</body>
</html>`
    w.document.write(html)
    w.document.close()
  }

  // ── bloco de aceite na tela ─────────────────────────────────────────────────
  const aceiteBlock = aceite ? (
    <div style={{ margin:'12px 16px 0', background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:12, padding:'12px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
        <ShieldCheck size={16} color="#16a34a"/>
        <span style={{ fontSize:13, fontWeight:700, color:'#15803d' }}>Aceite Digital Registrado</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:'3px 10px', fontSize:12 }}>
        <span style={{ color:'#6b7280' }}>Aceito em:</span>
        <span style={{ fontWeight:600, color:'#1e293b' }}>{new Date(aceite.aceito_em).toLocaleString('pt-BR')}</span>
        <span style={{ color:'#6b7280' }}>IP:</span>
        <span style={{ fontWeight:600, color:'#1e293b', fontFamily:'monospace' }}>{aceite.ip_address??'—'}</span>
      </div>
      <div style={{ fontSize:10, color:'#9ca3af', marginTop:6 }}>Registro jurídico de ciência do colaborador.</div>
    </div>
  ) : null

  return (
    <div style={{ minHeight:'100vh', background:'#f3f4f6', display:'flex', flexDirection:'column' }}>
      <div style={{ background:'#1a56a0', padding:'0 16px', position:'sticky', top:0, zIndex:10 }}>
        <div style={{ maxWidth:480, margin:'0 auto', display:'flex', alignItems:'center', height:52, gap:10 }}>
          <button onClick={onVoltar} style={{ background:'none', border:'none', cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', padding:4 }}>
            <ChevronLeft size={22}/>
          </button>
          <span style={{ color:'#fff', fontWeight:700, fontSize:17, flex:1 }}>Contracheque</span>
          <button onClick={imprimir} style={{ background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)', borderRadius:7, padding:'5px 10px', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontSize:12 }}>
            <Download size={13}/> Gerar PDF
          </button>
          {h.arquivo_url && (
            <a href={secureDocUrl(h.arquivo_url)} target="_blank" rel="noreferrer" style={{ background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)', borderRadius:7, padding:'5px 10px', color:'#fff', textDecoration:'none', display:'flex', alignItems:'center', gap:5, fontSize:12 }}>
              <Download size={13}/> PDF
            </a>
          )}
        </div>
      </div>
      <div style={{ maxWidth:480, margin:'0 auto', width:'100%', padding:'0 0 32px' }}>
        {/* Barra de FGTS se houver */}
        <div style={{ background:'#1a56a0', padding:'0 16px 16px', color:'#fff' }}>
          <div style={{ background:'rgba(255,255,255,.12)', borderRadius:8, padding:'8px 12px', marginBottom:8 }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.7)', marginBottom:1 }}>Empresa · Matrícula</div>
            <div style={{ fontSize:13, fontWeight:600 }}>{empresa?.nome??'—'} · {colab?.chapa??'—'}</div>
          </div>
          <div style={{ background:'rgba(255,255,255,.12)', borderRadius:8, padding:'8px 12px' }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.7)', marginBottom:1 }}>Cargo / Função</div>
            <div style={{ fontSize:13, fontWeight:600 }}>{h.funcao??colab?.funcao??'—'}</div>
          </div>
        </div>
        <div style={{ background:'#fff', padding:'12px 16px', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:14, fontWeight:700, color:'#1a56a0' }}>{fmtComp(h.competencia)}</span>
          <span style={{ fontSize:11, background:'#eff6ff', color:'#1d4ed8', padding:'3px 10px', borderRadius:12, fontWeight:600, border:'1px solid #bfdbfe' }}>{TIPO_LABEL[h.tipo]??h.tipo}</span>
        </div>
        <div style={{ padding:'14px 16px 8px', background:'#fff', borderBottom:'1px solid #e5e7eb' }}>
          <CardResumo bruto={bruto} descontos={descontos} liquido={liquido}/>
        </div>
        <div style={{ background:'#fff', marginTop:12 }}>
          <Secao titulo="Rendimentos" icone={<Plus size={12} color="#fff" strokeWidth={3}/>} cor="#16a34a" aberto={secAberta==='rendimentos'} onToggle={()=>setSecAberta(s=>s==='rendimentos'?null:'rendimentos')}>
            {([...rendimentos.map(r=>({valor:r.val!,cor:r.cor,label:r.desc}))]).length>0&&(
              <div style={{ padding:'16px 0 8px' }}>
                <DonutChart slices={rendimentos.map(r=>({valor:r.val!,cor:r.cor,label:r.desc}))} size={140}/>
              </div>
            )}
            <div style={{ marginTop:8 }}>
              <LinhaDetalhe codigo={empresa?.codigos?.salario??'0001'} descricao="Salário / Valor Horas" valor={h.salario_base} cor="#16a34a"/>
              <LinhaDetalhe codigo={empresa?.codigos?.producao??'0002'} descricao="Produção"              valor={h.valor_producao} cor="#16a34a"/>
              <LinhaDetalhe codigo={empresa?.codigos?.dsr??'0003'} descricao="DSR"                   valor={h.valor_dsr} cor="#16a34a"/>
              <LinhaDetalhe codigo={empresa?.codigos?.premio??'0004'} descricao="Prêmios"               valor={h.valor_premio} cor="#16a34a"/>
              {!h.salario_base&&!h.valor_producao&&bruto>0&&<LinhaDetalhe codigo={empresa?.codigos?.salario??'0001'} descricao="Total Rendimentos" valor={bruto} cor="#16a34a"/>}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 16px', background:'#f0fdf4', borderTop:'2px solid #bbf7d0' }}>
                <span style={{ fontWeight:700, fontSize:13, color:'#15803d' }}>Total Rendimentos</span>
                <span style={{ fontWeight:800, fontSize:14, color:'#15803d' }}>{fmtR(bruto)}</span>
              </div>
            </div>
          </Secao>
          <Secao titulo="Descontos" icone={<Minus size={12} color="#fff" strokeWidth={3}/>} cor="#dc2626" aberto={secAberta==='descontos'} onToggle={()=>setSecAberta(s=>s==='descontos'?null:'descontos')}>
            {descontosList.length>0&&(
              <div style={{ padding:'16px 0 8px' }}>
                <DonutChart slices={descontosList.map(d=>({valor:d.val!,cor:d.cor,label:d.desc}))} size={140}/>
              </div>
            )}
            <div style={{ marginTop:8 }}>
              <LinhaDetalhe codigo={empresa?.codigos?.inss??'0101'} descricao="INSS"            valor={h.inss}            cor="#dc2626"/>
              <LinhaDetalhe codigo={empresa?.codigos?.irrf??'0102'} descricao="IRRF"            valor={h.irrf}            cor="#f97316"/>
              <LinhaDetalhe codigo={empresa?.codigos?.vt??'0103'} descricao="Vale Transporte" valor={h.desconto_vt}     cor="#8b5cf6"/>
              <LinhaDetalhe codigo={empresa?.codigos?.adiantamento??'0104'} descricao="Adiantamento"    valor={h.desconto_adiant} cor="#ec4899"/>
              <LinhaDetalhe codigo={empresa?.codigos?.cesta_basica??'0105'} descricao="Cesta Básica"    valor={h.cesta_basica}    cor="#14b8a6"/>
              {!h.inss&&!h.irrf&&descontos>0&&<LinhaDetalhe codigo={empresa?.codigos?.inss??'0101'} descricao="Total Descontos" valor={descontos} cor="#dc2626"/>}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 16px', background:'#fff1f2', borderTop:'2px solid #fecaca' }}>
                <span style={{ fontWeight:700, fontSize:13, color:'#dc2626' }}>Total Descontos</span>
                <span style={{ fontWeight:800, fontSize:14, color:'#dc2626' }}>- {fmtR(descontos)}</span>
              </div>
            </div>
          </Secao>
          <Secao titulo="Informações Adicionais" icone={<Info size={12} color="#fff"/>} cor="#6b7280" aberto={secAberta==='infos'} onToggle={()=>setSecAberta(s=>s==='infos'?null:'infos')}>
            <div style={{ padding:'8px 0' }}>
              {[
                { label:'Colaborador',      valor:colab?.nome??'—' },
                { label:'Matrícula',        valor:colab?.chapa??'—' },
                { label:'CPF',              valor:colab?.cpf?fmtCPF(colab.cpf):'—' },
                { label:'Data de Admissão', valor:fmtData(colab?.data_admissao??null) },
                { label:'Vínculo',          valor:(h.tipo_contrato_snap??colab?.tipo_contrato??'CLT').toUpperCase() },
                { label:'Obra / Setor',     valor:h.obra_nome??'—' },
                { label:'Horas Normais',    valor:h.horas_normais?`${h.horas_normais}h`:'—' },
                { label:'Horas Extras',     valor:h.horas_extras?`${h.horas_extras}h`:'—' },
                { label:'Dias Trabalhados', valor:h.dias_trabalhados!=null?String(h.dias_trabalhados):'—' },
                { label:'Faltas',           valor:h.faltas!=null?String(h.faltas):'—' },
              ].filter(i=>i.valor!=='—').map(({label,valor})=>(
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid #f3f4f6' }}>
                  <span style={{ fontSize:13, color:'#6b7280' }}>{label}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{valor}</span>
                </div>
              ))}
              {h.fgts&&h.fgts>0&&(
                <div style={{ margin:'10px 16px 4px', padding:'9px 13px', background:'#eff6ff', borderRadius:8, border:'1px solid #bfdbfe' }}>
                  <div style={{ fontSize:11, color:'#1d4ed8', fontWeight:700, marginBottom:2 }}>FGTS — depositado pelo empregador</div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#1d4ed8' }}>{fmtR(h.fgts)}</div>
                </div>
              )}
            </div>
          </Secao>
        </div>
        {h.fgts && h.fgts > 0 && (
          <div style={{ margin:'12px 16px 0', background:'#dcfce7', border:'1px solid #86efac', borderRadius:12, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:11, color:'#15803d', fontWeight:700, marginBottom:2 }}>🏦 FGTS depositado pela empresa</div>
              <div style={{ fontSize:10, color:'#16a34a' }}>Valor não deduzido do seu salário</div>
            </div>
            <span style={{ color:'#15803d', fontSize:18, fontWeight:900 }}>{fmtR(h.fgts)}</span>
          </div>
        )}
        <div style={{ margin:'12px 16px 0', background:'#1a56a0', borderRadius:12, padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color:'rgba(255,255,255,.85)', fontSize:13, fontWeight:600 }}>💰 Líquido a Receber</span>
          <span style={{ color:'#fff', fontSize:22, fontWeight:900, letterSpacing:-.5 }}>{fmtR(liquido)}</span>
        </div>
        {/* Bloco de aceite digital */}
        {aceiteBlock}
      </div>
    </div>
  )
}

// ─── ABA CONTRACHEQUE ─────────────────────────────────────────────────────────
// Mês padrão = mês atual. Sem carrossel de botões no topo, sem histórico de lista.
function AbaContracheque({ sessao, holerites, lancamentos, colab, empresa, aceites, onSelecionar }: {
  sessao: Sessao; holerites: Contracheque[]; lancamentos: PontoLancamento[]
  colab: ColabInfo | null; empresa: EmpresaInfo | null
  aceites: Record<string, AceiteDigital>
  onSelecionar: (h: Contracheque) => void
}) {
  // Inicia sempre no mês atual (ou o primeiro disponível se não houver do mês atual)
  const [mesSel, setMesSel] = useState<string>(() => {
    const atual = mesAtualStr()
    const temAtual = holerites.some(hl => hl.competencia.startsWith(atual))
    if (temAtual) return atual
    return holerites[0]?.competencia?.slice(0, 7) ?? atual
  })

  // Atualiza quando holerites carregam
  useEffect(() => {
    const atual = mesAtualStr()
    const temAtual = holerites.some(hl => hl.competencia.startsWith(atual))
    if (temAtual) setMesSel(atual)
    else if (holerites.length > 0) setMesSel(holerites[0].competencia.slice(0, 7))
  }, [holerites.length])

  const hAtual = holerites.find(hl => hl.competencia.startsWith(mesSel)) ?? null
  const [pontoAberto, setPontoAberto] = useState<string|null>(null)

  const bruto     = hAtual?.bruto ?? 0
  const descontos = hAtual ? ((hAtual.inss??0)+(hAtual.irrf??0)+(hAtual.desconto_vt??0)+(hAtual.desconto_adiant??0)+(hAtual.cesta_basica??0)) || (hAtual.descontos??0) : 0
  const liquido   = hAtual?.liquido ?? Math.max(0, bruto - descontos)

  // Lançamentos do mês selecionado
  const lancsMes = lancamentos.filter(l => l.mes_referencia === mesSel || l.mes_referencia.startsWith(mesSel))
  const totalHorasNormais = lancsMes.reduce((s,l)=>s+(l.snap_horas_normais??0),0)
  const totalHorasExtras  = lancsMes.reduce((s,l)=>s+(l.snap_horas_extras??0),0)
  const totalProducao     = lancsMes.reduce((s,l)=>s+(l.snap_valor_producao??0),0)
  const totalBruto        = lancsMes.reduce((s,l)=>s+(l.snap_valor_total??0),0)

  function statusMesLanc(grupo: PontoLancamento[]) {
    const todos = grupo.map(l=>l.status)
    if (todos.every(s=>s==='pago'))                         return { texto:'Pago',     cor:'#15803d', bg:'#dcfce7', border:'#86efac' }
    if (todos.some(s=>s==='aprovado'||s==='liberado'))      return { texto:'Aprovado', cor:'#1d4ed8', bg:'#dbeafe', border:'#93c5fd' }
    return { texto:'Pendente', cor:'#92400e', bg:'#fef3c7', border:'#fde68a' }
  }

  const mesesOptions = mesesDesdeAdmissao(colab?.data_admissao ?? null)

  return (
    <div style={{ paddingBottom: 90 }}>
      {/* Faixa azul com empresa/matrícula/cargo */}
      <div style={{ background:'#1a56a0', padding:'10px 16px 14px', color:'#fff' }}>
        <div style={{ background:'rgba(255,255,255,.12)', borderRadius:8, padding:'7px 12px', marginBottom:8 }}>
          <div style={{ fontSize:10, color:'rgba(255,255,255,.65)', marginBottom:1 }}>Empresa · Matrícula</div>
          <div style={{ fontSize:13, fontWeight:600 }}>{empresa?.nome??'—'} · {colab?.chapa??'—'}</div>
        </div>
        <div style={{ background:'rgba(255,255,255,.12)', borderRadius:8, padding:'7px 12px' }}>
          <div style={{ fontSize:10, color:'rgba(255,255,255,.65)', marginBottom:1 }}>Cargo / Função</div>
          <div style={{ fontSize:13, fontWeight:600 }}>{hAtual?.funcao??colab?.funcao??'—'}</div>
        </div>
      </div>

      {/* Seletor de mês — dropdown simples */}
      <div style={{ padding:'12px 16px 0', background:'#fff', borderBottom:'1px solid #e5e7eb' }}>
        <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>Mês de Referência</label>
        <select
          value={mesSel}
          onChange={e => setMesSel(e.target.value)}
          style={{ width:'100%', height:42, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 12px', fontSize:14, fontWeight:600, color:'#1a56a0', background:'#fff', cursor:'pointer', outline:'none', marginBottom:12 }}
        >
          {mesesOptions.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
          {/* Meses do histórico que não estejam nos 12 últimos */}
          {holerites
            .map(hl => hl.competencia.slice(0,7))
            .filter((m, i, arr) => arr.indexOf(m) === i && !mesesOptions.find(o => o.val === m))
            .map(m => <option key={m} value={m}>{fmtComp(m)}</option>)
          }
        </select>
      </div>

      <div style={{ padding:'12px 16px 16px' }}>
        {!hAtual ? (
          <div style={{ background:'#fff', borderRadius:14, padding:'36px 20px', textAlign:'center', border:'1px solid #e5e7eb', marginBottom:12 }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <Receipt size={28} strokeWidth={1.5} color="#9ca3af"/>
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:'#374151', marginBottom:6 }}>Nenhum contracheque para {fmtComp(mesSel)}</div>
            <div style={{ fontSize:12, color:'#6b7280', lineHeight:1.7 }}>
              Selecione outro mês ou aguarde o RH publicar o holerite.
            </div>
          </div>
        ) : (
          <>
            {/* Card resumo */}
            <div style={{ background:'#fff', borderRadius:14, padding:'14px 14px 10px', border:'1px solid #e5e7eb', marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#111827', marginBottom:10, display:'flex', alignItems:'center', flexWrap:'wrap', gap:6 }}>
                {fmtComp(hAtual.competencia)}
                <span style={{ fontSize:11, background:'#eff6ff', color:'#1d4ed8', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>
                  {TIPO_LABEL[hAtual.tipo]??hAtual.tipo}
                </span>
                {/* Badge aceite digital */}
                {aceites[hAtual.id]
                  ? <span style={{ fontSize:10, background:'#dcfce7', color:'#15803d', padding:'2px 8px', borderRadius:10, fontWeight:700, display:'flex', alignItems:'center', gap:3 }}><CheckCircle2 size={10}/> Ciente</span>
                  : <span style={{ fontSize:10, background:'#fef3c7', color:'#92400e', padding:'2px 8px', borderRadius:10, fontWeight:700 }}>⚠ Pendente aceite</span>
                }
              </div>
              <CardResumo bruto={bruto} descontos={descontos} liquido={liquido}/>
            </div>

            {hAtual.fgts && hAtual.fgts > 0 && (
              <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:10, padding:'9px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:11, color:'#15803d', fontWeight:700 }}>🏦 FGTS depositado pela empresa</div>
                  <div style={{ fontSize:10, color:'#16a34a' }}>Não deduzido do salário</div>
                </div>
                <span style={{ color:'#15803d', fontSize:16, fontWeight:900 }}>{fmtR(hAtual.fgts)}</span>
              </div>
            )}
            {/* Botão Ver Detalhes */}
            <button onClick={()=>onSelecionar(hAtual)}
              style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'12px', borderRadius:10, border:'none',
                background: aceites[hAtual.id] ? '#1a56a0' : 'linear-gradient(135deg,#1d4ed8,#1a56a0)',
                cursor:'pointer', fontSize:14, color:'#fff', fontWeight:700, marginBottom:12, boxShadow:'0 2px 8px rgba(26,86,160,.3)' }}>
              {aceites[hAtual.id]
                ? <><Receipt size={15}/> Ver Contracheque Completo <ChevronRight size={16}/></>
                : <><ShieldCheck size={15}/> Li e estou ciente — Abrir Holerite <ChevronRight size={16}/></>
              }
            </button>

            {/* Preview seções */}
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e5e7eb', overflow:'hidden', marginBottom:14 }}>
              <button onClick={()=>onSelecionar(hAtual)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:'none', border:'none', cursor:'pointer', borderBottom:'1px solid #e5e7eb' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center' }}><Plus size={11} color="#16a34a" strokeWidth={3}/></span>
                  <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Rendimentos</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'#16a34a' }}>{fmtR(bruto)}</span>
                  <ChevronDown size={16} color="#9ca3af"/>
                </div>
              </button>
              <button onClick={()=>onSelecionar(hAtual)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:'none', border:'none', cursor:'pointer', borderBottom:'1px solid #e5e7eb' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}><Minus size={11} color="#dc2626" strokeWidth={3}/></span>
                  <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Descontos</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'#dc2626' }}>- {fmtR(descontos)}</span>
                  <ChevronDown size={16} color="#9ca3af"/>
                </div>
              </button>
              <button onClick={()=>onSelecionar(hAtual)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:'none', border:'none', cursor:'pointer' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center' }}><Info size={11} color="#6b7280"/></span>
                  <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Informações Adicionais</span>
                </div>
                <ChevronDown size={16} color="#9ca3af"/>
              </button>
            </div>

            {/* Histórico de fechamento de ponto (para o mês selecionado) */}
            {lancsMes.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:.5, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                  <CalendarDays size={13}/> HISTÓRICO DE FECHAMENTO DE PONTO
                </div>
                <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden' }}>
                  {(() => {
                    const st = statusMesLanc(lancsMes)
                    const ab = pontoAberto === mesSel
                    return (
                      <>
                        <button onClick={()=>setPontoAberto(ab?null:mesSel)}
                          style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', background:'none', border:'none', cursor:'pointer' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:15 }}>📅</span>
                            <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{fmtComp(mesSel)}</span>
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, color:st.cor, background:st.bg, border:`1px solid ${st.border}` }}>{st.texto}</span>
                          </div>
                          {ab?<ChevronUp size={16} color="#6b7280"/>:<ChevronDown size={16} color="#6b7280"/>}
                        </button>
                        <div style={{ height:1, background:'#e5e7eb', margin:'0 14px' }}/>
                        <div style={{ padding:'9px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 10px' }}>
                          <div style={{ display:'flex', gap:5, fontSize:11, color:'#374151', alignItems:'center' }}>
                            <span>⏱</span><span style={{ color:'#6b7280' }}>H. Normais:</span>
                            <span style={{ fontWeight:700 }}>{totalHorasNormais.toFixed(1)}h</span>
                          </div>
                          <div style={{ display:'flex', gap:5, fontSize:11, color:'#374151', alignItems:'center' }}>
                            <span>⚡</span><span style={{ color:'#6b7280' }}>H. Extras:</span>
                            <span style={{ fontWeight:700 }}>{totalHorasExtras.toFixed(1)}h</span>
                          </div>
                          <div style={{ display:'flex', gap:5, fontSize:11, color:'#374151', alignItems:'center' }}>
                            <span>📦</span><span style={{ color:'#6b7280' }}>Produção:</span>
                            <span style={{ fontWeight:700 }}>{fmtR(totalProducao)}</span>
                          </div>
                          <div style={{ display:'flex', gap:5, fontSize:11, color:'#374151', alignItems:'center' }}>
                            <span>💰</span><span style={{ color:'#6b7280' }}>Total:</span>
                            <span style={{ fontWeight:800, color:'#1a56a0' }}>{fmtR(totalBruto)}</span>
                          </div>
                        </div>
                        {ab && (
                          <div style={{ borderTop:'1px solid #e5e7eb', background:'#f9fafb', padding:'8px 14px 10px' }}>
                            {lancsMes.map((l,idx)=>{
                              const stL = l.status==='pago'?{cor:'#15803d',bg:'#dcfce7'}:l.status==='aprovado'||l.status==='liberado'?{cor:'#1d4ed8',bg:'#dbeafe'}:{cor:'#92400e',bg:'#fef3c7'}
                              const fmtDM = (d:string)=>{ const [,m,day]=d.split('-'); return `${day}/${m}` }
                              return (
                                <div key={l.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', marginBottom:4, background:'#fff', borderRadius:8, border:'1px solid #e5e7eb', fontSize:12 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                    <span style={{ fontWeight:600, color:'#1a56a0', minWidth:16 }}>P{idx+1}</span>
                                    <span style={{ color:'#374151' }}>{fmtDM(l.data_inicio)}–{fmtDM(l.data_fim)}</span>
                                  </div>
                                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <span style={{ fontWeight:700, color:'#111827' }}>{fmtR(l.snap_liquido)}</span>
                                    <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:8, color:stL.cor, background:stL.bg }}>{l.status}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── ABA FOLHA DE PONTO ───────────────────────────────────────────────────────
// Mês padrão = mês atual. Busca lançamentos do portal_ponto_diario.
function AbaFolhaPonto({ sessao, dataAdmissao, lancamentos }: { sessao: Sessao; dataAdmissao: string | null; lancamentos: PontoLancamento[] }) {
  const [mesSel, setMesSel]       = useState(mesAtualStr)
  const [registros, setRegistros] = useState<RegistroPonto[]>([])
  const [loading, setLoading]     = useState(false)

  const opcoesMes = mesesDesdeAdmissao(dataAdmissao)

  const carregarPonto = useCallback(async (mes: string) => {
    setLoading(true)
    const inicio = mes + '-01'
    const fim    = mes + '-31'
    const { data, error } = await supabase
      .from('portal_ponto_diario')
      .select('id,data,hora_entrada,hora_saida,horas_trabalhadas,horas_extra,horas_falta,status,observacoes')
      .eq('colaborador_id', sessao.colaborador_id)
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: true })
    if (!error) setRegistros((data as RegistroPonto[]) ?? [])
    setLoading(false)
  }, [sessao.colaborador_id])

  useEffect(() => { carregarPonto(mesSel) }, [mesSel, carregarPonto])

  const totalHoras    = registros.reduce((s,r)=>s+(r.horas_trabalhadas??0),0)
  const totalExtras   = registros.reduce((s,r)=>s+(r.horas_extra??0),0)
  const totalPresentes = registros.filter(r=>['presente','meio_periodo','producao'].includes((r.status??'').toLowerCase())).length
  const totalFaltas   = registros.filter(r=>['falta','falta_justificada'].includes((r.status??'').toLowerCase())).length

  function badgeStatus(status: string | null) {
    const s = (status??'').toLowerCase()
    if (s==='presente')          return { texto:'Presente',     cor:'#16a34a', bg:'#dcfce7', border:'#86efac', emoji:'✅' }
    if (s==='falta')             return { texto:'Falta',        cor:'#dc2626', bg:'#fee2e2', border:'#fca5a5', emoji:'❌' }
    if (s==='falta_justificada') return { texto:'Falta Just.',  cor:'#6b7280', bg:'#f3f4f6', border:'#e5e7eb', emoji:'📋' }
    if (s==='meio_periodo')      return { texto:'Meio Período', cor:'#92400e', bg:'#fef3c7', border:'#fde68a', emoji:'🟡' }
    if (s==='producao')          return { texto:'Produção',     cor:'#7c3aed', bg:'#f3e8ff', border:'#ddd6fe', emoji:'⚡' }
    if (s==='folga')             return { texto:'Folga',        cor:'#1d4ed8', bg:'#dbeafe', border:'#93c5fd', emoji:'🔵' }
    return { texto:status??'—', cor:'#6b7280', bg:'#f3f4f6', border:'#e5e7eb', emoji:'📅' }
  }

  // Lançamentos de ponto do mês selecionado (fallback quando não há registros diários)
  const lancsMes = lancamentos.filter(l => l.mes_referencia === mesSel || l.mes_referencia.startsWith(mesSel))
  const totalHorasNormaisLanc = lancsMes.reduce((s,l)=>s+(l.snap_horas_normais??0),0)
  const totalHorasExtrasLanc  = lancsMes.reduce((s,l)=>s+(l.snap_horas_extras??0),0)
  const totalProducaoLanc     = lancsMes.reduce((s,l)=>s+(l.snap_valor_producao??0),0)
  const totalLiquidoLanc      = lancsMes.reduce((s,l)=>s+(l.snap_liquido??0),0)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [gerandoPdf, setGerandoPdf] = useState(false)

  function gerarPdfPonto() {
    const w = window.open('', '_blank'); if (!w) return
    const mesLabel = fmtComp(mesSel)
    const fh = (hh: string|null) => hh ? hh.slice(0,5) : '—'
    const temRegistros = registros.length > 0
    const tbodyRows = temRegistros ? registros.map((reg, i) => {
      const isFalta = ['falta','falta_justificada'].includes((reg.status??'').toLowerCase())
      const cor = isFalta ? '#fee2e2' : (i%2===0 ? '#fff' : '#f8fafc')
      const statusLabel = isFalta ? 'FALTA' : (reg.status??'—')
      const statusCor = isFalta ? '#dc2626' : '#374151'
      const [y,m,d]=reg.data.split('-')
      return `<tr style="background:${cor}">
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px">${d}/${m}/${y}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#16a34a;font-weight:600">${fh(reg.hora_entrada)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#6b7280">${isFalta ? '—' : '12:00'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#6b7280">${isFalta ? '—' : '13:00'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#dc2626;font-weight:600">${fh(reg.hora_saida)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;font-weight:700;color:#1a56a0">${reg.horas_trabalhadas ? reg.horas_trabalhadas.toFixed(2)+'h' : '0,00h'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:${(reg.horas_extra??0)>0?'#92400e':'#6b7280'}">${reg.horas_extra ? reg.horas_extra.toFixed(2)+'h' : '0,00h'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;font-weight:700;color:${statusCor}">${statusLabel}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">${reg.observacoes??'—'}</td>
      </tr>`
    }).join('') : ''
    const totalHorasPdf = registros.reduce((s,r)=>s+(r.horas_trabalhadas??0),0)
    const totalExtrasPdf = registros.reduce((s,r)=>s+(r.horas_extra??0),0)
    const totalFaltasPdf = registros.filter(r=>['falta','falta_justificada'].includes((r.status??'').toLowerCase())).length
    const totalPresencasPdf = registros.filter(r=>['presente','meio_periodo','producao'].includes((r.status??'').toLowerCase())).length
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Folha de Ponto — ${sessao.nome} — ${mesLabel}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:12px; background:#fff }
  @page { size:A4 landscape; margin:15mm 10mm }
  @media print { body { margin:0 } }
</style>
</head>
<body>
  <div style="background:#1a56a0;padding:14px 16px;margin-bottom:12px;border-radius:6px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="color:#fff;font-size:16px;font-weight:800">${sessao.nome.toUpperCase()}</div>
        <div style="display:flex;gap:16px;margin-top:5px">
          <span style="background:rgba(255,255,255,.2);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px">Chapa: ${sessao.chapa||'—'}</span>
        </div>
      </div>
      <div style="text-align:right">
        <div style="color:#fff;font-size:14px;font-weight:700">Folha de Ponto</div>
        <div style="color:rgba(255,255,255,.7);font-size:12px">${mesLabel}</div>
      </div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">
    <div style="background:#dcfce7;border-radius:6px;padding:8px 12px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#16a34a">${totalPresencasPdf}</div>
      <div style="font-size:10px;color:#16a34a;font-weight:600">Presenças</div>
    </div>
    <div style="background:#fee2e2;border-radius:6px;padding:8px 12px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#dc2626">${totalFaltasPdf}</div>
      <div style="font-size:10px;color:#dc2626;font-weight:600">Faltas</div>
    </div>
    <div style="background:#dbeafe;border-radius:6px;padding:8px 12px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#1d4ed8">${totalHorasPdf.toFixed(0)}h</div>
      <div style="font-size:10px;color:#1d4ed8;font-weight:600">H. Trabalhadas</div>
    </div>
    <div style="background:#fef3c7;border-radius:6px;padding:8px 12px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#92400e">${totalExtrasPdf.toFixed(0)}h</div>
      <div style="font-size:10px;color:#92400e;font-weight:600">H. Extras</div>
    </div>
  </div>
  ${temRegistros ? `
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
    <thead>
      <tr style="background:#1a56a0">
        ${['Data','Entrada','Saída Alm.','Retorno','Saída','Hs Trab.','Hs Extra','Status','Justificativa'].map(hh=>
          `<th style="padding:8px 8px;color:#fff;font-size:10px;text-align:center;font-weight:700;white-space:nowrap">${hh}</th>`
        ).join('')}
      </tr>
    </thead>
    <tbody>${tbodyRows}</tbody>
    <tfoot>
      <tr style="background:#1a56a0">
        <td colspan="5" style="padding:8px 8px;color:#fff;font-size:11px;font-weight:700">TOTAIS — ${totalPresencasPdf} dias</td>
        <td style="padding:8px 8px;color:#fff;font-size:11px;font-weight:700;text-align:center">${totalHorasPdf.toFixed(2)}h</td>
        <td style="padding:8px 8px;color:#fbbf24;font-size:11px;font-weight:700;text-align:center">${totalExtrasPdf.toFixed(2)}h</td>
        <td style="padding:8px 8px;color:#fca5a5;font-size:11px;font-weight:700;text-align:center">${totalFaltasPdf} falta(s)</td>
        <td></td>
      </tr>
    </tfoot>
  </table>` : `
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-bottom:14px">
    <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:10px;text-transform:uppercase">Resumo do Fechamento de Ponto</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">
      <div style="background:#fff;border-radius:6px;padding:8px 10px">
        <div style="font-size:9px;color:#6b7280;font-weight:600">Horas Normais</div>
        <div style="font-size:16px;font-weight:800;color:#1d4ed8">${totalHorasNormaisLanc.toFixed(1)}h</div>
      </div>
      <div style="background:#fff;border-radius:6px;padding:8px 10px">
        <div style="font-size:9px;color:#6b7280;font-weight:600">Horas Extras</div>
        <div style="font-size:16px;font-weight:800;color:#92400e">${totalHorasExtrasLanc.toFixed(1)}h</div>
      </div>
      <div style="background:#fff;border-radius:6px;padding:8px 10px">
        <div style="font-size:9px;color:#6b7280;font-weight:600">Produção</div>
        <div style="font-size:16px;font-weight:800;color:#7c3aed">${fmtR(totalProducaoLanc)}</div>
      </div>
      <div style="background:#fff;border-radius:6px;padding:8px 10px">
        <div style="font-size:9px;color:#6b7280;font-weight:600">Líquido</div>
        <div style="font-size:16px;font-weight:800;color:#15803d">${fmtR(totalLiquidoLanc)}</div>
      </div>
    </div>
    ${lancsMes.map((l,idx)=>`
    <div style="margin-top:8px;display:flex;justify-content:space-between;background:#fff;border-radius:6px;padding:7px 10px;border:1px solid #dbeafe;font-size:11px">
      <span style="color:#374151;font-weight:600">Período ${idx+1}: ${l.data_inicio} → ${l.data_fim}</span>
      <span style="font-weight:700;padding:2px 8px;border-radius:6px;background:${l.status==='pago'?'#dcfce7':'#dbeafe'};color:${l.status==='pago'?'#15803d':'#1d4ed8'}">${l.status}</span>
    </div>`).join('')}
  </div>`}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:30px;padding-top:12px">
    <div style="border-top:1.5px solid #1a56a0;padding-top:6px">
      <div style="font-size:11px;color:#374151;font-weight:600">${sessao.nome.toUpperCase()}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px">Colaborador(a) — Assinatura</div>
    </div>
    <div style="border-top:1.5px solid #1a56a0;padding-top:6px">
      <div style="font-size:11px;color:#374151;font-weight:600">___________________________</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px">Responsável RH / Carimbo</div>
    </div>
  </div>
<script>window.onload=()=>{ window.print() }</script>
</body></html>`
    w.document.write(html)
    w.document.close()
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      {/* Seletor de mês */}
      <div style={{ padding:'12px 16px 10px', background:'#fff', borderBottom:'1px solid #e5e7eb' }}>
        <label style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>
          Mês de Referência
        </label>
        <select
          value={mesSel}
          onChange={e=>setMesSel(e.target.value)}
          style={{ width:'100%', height:42, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 12px', fontSize:14, fontWeight:600, color:'#1a56a0', background:'#fff', cursor:'pointer', outline:'none' }}
        >
          {opcoesMes.map(o=><option key={o.val} value={o.val}>{o.label}</option>)}
          {lancamentos.map(l=>l.mes_referencia.slice(0,7)).filter((m,i,arr)=>arr.indexOf(m)===i&&!opcoesMes.find(o=>o.val===m)).map(m=><option key={m} value={m}>{fmtComp(m)}</option>)}
        </select>
      </div>
      {/* Botão Gerar PDF da folha de ponto */}
      <div style={{ padding:'0 16px 10px', display:'flex', justifyContent:'flex-end', background:'#fff', borderBottom:'1px solid #e5e7eb' }}>
        <button
          onClick={gerarPdfPonto}
          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:8, border:'none', background:'#1a56a0', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Gerar PDF da Folha
        </button>
      </div>

      {/* Cards de resumo */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, padding:'10px 12px 6px' }}>
        {[
          { label:'Presenças', val:totalPresentes,                    cor:'#16a34a', bg:'#dcfce7' },
          { label:'Faltas',    val:totalFaltas,                       cor:'#dc2626', bg:'#fee2e2' },
          { label:'H. Trab.',  val:`${totalHoras.toFixed(0)}h`,       cor:'#1d4ed8', bg:'#dbeafe' },
          { label:'H. Extra',  val:`${totalExtras.toFixed(0)}h`,      cor:'#92400e', bg:'#fef3c7' },
        ].map(s=>(
          <div key={s.label} style={{ background:s.bg, borderRadius:10, padding:'8px 4px', textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:15, color:s.cor }}>{s.val}</div>
            <div style={{ fontSize:9, color:s.cor, fontWeight:600, lineHeight:1.2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Lista de registros */}
      <div style={{ padding:'0 12px' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 0', gap:10 }}>
            <Loader2 size={24} className="animate-spin" color="#1a56a0"/>
            <span style={{ fontSize:13, color:'#6b7280' }}>Carregando registros…</span>
          </div>
        ) : registros.length === 0 ? (
          <div style={{ background:'#fff', borderRadius:14, padding:'28px 16px', textAlign:'center', border:'1px solid #e5e7eb' }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
              <CalendarDays size={26} strokeWidth={1.5} color="#9ca3af"/>
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:'#374151', marginBottom:4 }}>Registro diário não disponível</div>
            <div style={{ fontSize:12, color:'#6b7280', lineHeight:1.7, marginBottom: lancsMes.length>0?14:0 }}>
              Registros por dia não foram lançados para <strong>{fmtComp(mesSel)}</strong>.
            </div>
            {/* Fallback: mostrar resumo do lançamento de ponto (snap_) se disponível */}
            {lancsMes.length > 0 && (
              <div style={{ background:'#eff6ff', borderRadius:12, padding:'14px 16px', border:'1px solid #bfdbfe', textAlign:'left' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#1d4ed8', marginBottom:10, textTransform:'uppercase', letterSpacing:.5 }}>📊 Resumo do Fechamento de Ponto</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                  {[
                    { label:'Horas Normais', val:`${totalHorasNormaisLanc.toFixed(1)}h`, cor:'#1d4ed8' },
                    { label:'Horas Extras',  val:`${totalHorasExtrasLanc.toFixed(1)}h`,  cor:'#92400e' },
                    { label:'Produção',      val:fmtR(totalProducaoLanc),                cor:'#7c3aed' },
                    { label:'Líquido',       val:fmtR(totalLiquidoLanc),                 cor:'#15803d' },
                  ].map(item=>(
                    <div key={item.label} style={{ background:'#fff', borderRadius:8, padding:'8px 10px' }}>
                      <div style={{ fontSize:10, color:'#6b7280', fontWeight:600 }}>{item.label}</div>
                      <div style={{ fontSize:14, fontWeight:800, color:item.cor }}>{item.val}</div>
                    </div>
                  ))}
                </div>
                {lancsMes.map((l,idx)=>(
                  <div key={l.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fff', borderRadius:8, padding:'7px 10px', border:'1px solid #dbeafe', fontSize:12, marginBottom:4 }}>
                    <span style={{ color:'#374151', fontWeight:600 }}>Período {idx+1}: {fmtData(l.data_inicio)} → {fmtData(l.data_fim)}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8,
                      background: l.status==='pago'?'#dcfce7':l.status==='aprovado'?'#dbeafe':'#fef3c7',
                      color: l.status==='pago'?'#15803d':l.status==='aprovado'?'#1d4ed8':'#92400e' }}>
                      {l.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {registros.map(reg=>{
                const badge   = badgeStatus(reg.status)
                const isFalta = ['falta','falta_justificada'].includes((reg.status??'').toLowerCase())
                const htrab   = reg.horas_trabalhadas ?? 0
                const hext    = reg.horas_extra ?? 0
                return (
                  <div key={reg.id} style={{ background:'#fff', borderRadius:12, border:`1px solid ${badge.border}`, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,.04)' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:isFalta?'none':`1px solid #f3f4f6`, background:badge.bg+'40' }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{badge.emoji} {fmtDiaSemana(reg.data)}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, color:badge.cor, background:badge.bg, border:`1px solid ${badge.border}` }}>{badge.texto}</span>
                    </div>
                    {isFalta && reg.observacoes && (
                      <div style={{ padding:'6px 14px 10px', fontSize:11, color:'#6b7280', fontStyle:'italic' }}>📝 {reg.observacoes}</div>
                    )}
                    {!isFalta && (
                      <div style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                          <span style={{ fontSize:11, color:'#6b7280', fontWeight:600, minWidth:52 }}>Entrada:</span>
                          <span style={{ fontSize:12, fontWeight:700, color:reg.hora_entrada?'#16a34a':'#9ca3af', background:reg.hora_entrada?'#dcfce7':'#f3f4f6', padding:'2px 8px', borderRadius:7 }}>
                            🟢 {fmtHora(reg.hora_entrada)}
                          </span>
                          <span style={{ color:'#d1d5db' }}>→</span>
                          <span style={{ fontSize:11, color:'#6b7280', fontWeight:600 }}>Saída:</span>
                          <span style={{ fontSize:12, fontWeight:700, color:reg.hora_saida?'#dc2626':'#9ca3af', background:reg.hora_saida?'#fee2e2':'#f3f4f6', padding:'2px 8px', borderRadius:7 }}>
                            🔴 {fmtHora(reg.hora_saida)}
                          </span>
                        </div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                          {htrab>0&&<span style={{ fontSize:11, color:'#1a56a0', fontWeight:700, background:'#eff6ff', padding:'2px 8px', borderRadius:7 }}>⏱ {htrab.toFixed(1)}h trabalhadas</span>}
                          {hext>0&&<span style={{ fontSize:11, color:'#92400e', fontWeight:700, background:'#fef3c7', padding:'2px 8px', borderRadius:7 }}>⚡ {hext.toFixed(1)}h extras</span>}
                          {!!(reg.horas_falta&&reg.horas_falta>0)&&<span style={{ fontSize:11, color:'#dc2626', fontWeight:700, background:'#fee2e2', padding:'2px 8px', borderRadius:7 }}>-{reg.horas_falta.toFixed(1)}h falta</span>}
                        </div>
                        {reg.observacoes&&<div style={{ marginTop:5, fontSize:11, color:'#6b7280', fontStyle:'italic' }}>📝 {reg.observacoes}</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Rodapé resumo */}
            <div style={{ marginTop:14, background:'#1a56a0', borderRadius:12, padding:'13px 16px' }}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,.7)', fontWeight:700, textTransform:'uppercase', marginBottom:8 }}>
                Resumo — {fmtComp(mesSel)}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6 }}>
                <div style={{ background:'rgba(255,255,255,.12)', borderRadius:8, padding:'8px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.65)', marginBottom:2 }}>Trabalhadas</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>{totalHoras.toFixed(0)}h</div>
                </div>
                <div style={{ background:'rgba(255,255,255,.12)', borderRadius:8, padding:'8px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.65)', marginBottom:2 }}>Extras</div>
                  <div style={{ fontSize:16, fontWeight:800, color:totalExtras>0?'#fbbf24':'#fff' }}>{totalExtras.toFixed(0)}h</div>
                </div>
                <div style={{ background:'rgba(255,255,255,.12)', borderRadius:8, padding:'8px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,.65)', marginBottom:2 }}>Faltas</div>
                  <div style={{ fontSize:16, fontWeight:800, color:totalFaltas>0?'#fca5a5':'#fff' }}>{totalFaltas}</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── ABA MEUS DOCUMENTOS ─────────────────────────────────────────────────────
function AbaMeusDocumentos({ sessao }: { sessao: Sessao }) {
  const [documentos, setDocumentos] = useState<any[]>([])
  const [loading, setLoading]       = useState(false)
  const [erro, setErro]             = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setErro('')
    try {
      // 1 – Buscar tipos visíveis das configurações
      const { data: cfgData } = await supabase
        .from('configuracoes').select('valor').eq('chave','tipos_documentos').single()
      let tiposVisiveis: string[] = []
      if (cfgData?.valor) {
        try {
          const arr = JSON.parse(cfgData.valor)
          tiposVisiveis = arr
            .filter((t: any) => typeof t === 'object' ? t.visivel : false)
            .map((t: any) => typeof t === 'string' ? t : t.label)
        } catch {}
      }

      // 2 – Buscar documentos_avulsos do colaborador
      const { data: avulsos } = await supabase
        .from('documentos_avulsos')
        .select('id,tipo,data,descricao,documento_url,documento_nome')
        .eq('colaborador_id', sessao.colaborador_id)
        .order('data', { ascending: false })

      // 3 – Buscar documentos formais (colaborador_documentos)
      let formais: any[] = []
      try {
        const { data } = await supabase
          .from('colaborador_documentos')
          .select('id,titulo,tipo,descricao,arquivo_url,visivel_colaborador,criado_em')
          .eq('colaborador_id', sessao.colaborador_id)
          .eq('visivel_colaborador', true)
          .order('criado_em', { ascending: false })
        formais = data ?? []
      } catch {}

      // 4 – Montar lista: formais + avulsos filtrados por tipo visível
      const lista: any[] = []

      // Documentos formais (sempre visíveis se marcados)
      for (const d of formais as any[]) {
        lista.push({ id: d.id, titulo: d.titulo, tipo: d.tipo, descricao: d.descricao, url: d.arquivo_url, nome: d.titulo, data: d.criado_em, fonte: 'formal' })
      }

      // Avulsos filtrados por tipo visível
      for (const d of (avulsos ?? []) as any[]) {
        const visivel = tiposVisiveis.some(tv => tv.toLowerCase() === (d.tipo ?? '').toLowerCase())
        if (visivel) {
          lista.push({ id: d.id, titulo: d.tipo, tipo: d.tipo, descricao: d.descricao, url: d.documento_url, nome: d.documento_nome, data: d.data, fonte: 'avulso' })
        }
      }

      setDocumentos(lista)
    } catch (e: any) {
      setErro('Erro ao carregar documentos.')
    }
    setLoading(false)
  }, [sessao.colaborador_id])

  useEffect(()=>{ carregar() }, [carregar])

  function iconeTipo(tipo: string) {
    const t=(tipo??'').toLowerCase()
    if (t.includes('contrato')) return { icon:<FileCheck size={20}/>, cor:'#16a34a', bg:'#dcfce7' }
    if (t.includes('rescisao')||t.includes('rescisão')) return { icon:<FileX size={20}/>, cor:'#dc2626', bg:'#fee2e2' }
    return { icon:<Receipt size={20}/>, cor:'#6b7280', bg:'#f3f4f6' }
  }

  const TIPO_DOC: Record<string,string> = { contrato_trabalho:'Contrato de Trabalho', rescisao:'Rescisão', admissao:'Admissional', exame_medico:'Exame Médico', ferias:'Férias', comprovante:'Comprovante', outro:'Documento' }

  return (
    <div style={{ paddingBottom:90 }}>
      <div style={{ padding:'12px 14px 6px', background:'#fff', borderBottom:'1px solid #e5e7eb' }}>
        <div style={{ fontSize:12, color:'#6b7280', fontWeight:500, lineHeight:1.5 }}>
          📂 Documentos disponibilizados pelo RH para o seu acesso.
        </div>
      </div>
      <div style={{ padding:'12px 12px 16px' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 0', gap:10 }}>
            <Loader2 size={24} className="animate-spin" color="#1a56a0"/>
            <span style={{ fontSize:13, color:'#6b7280' }}>Carregando documentos…</span>
          </div>
        ) : erro ? (
          <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, padding:'14px 16px', color:'#dc2626', fontSize:13 }}>{erro}</div>
        ) : documentos.length===0 ? (
          <div style={{ background:'#fff', borderRadius:14, padding:'36px 20px', textAlign:'center', border:'1px solid #e5e7eb' }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
              <FolderOpen size={28} strokeWidth={1.5} color="#9ca3af"/>
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:'#374151', marginBottom:6 }}>Nenhum documento disponível</div>
            <div style={{ fontSize:12, color:'#6b7280', lineHeight:1.7 }}>
              Seus documentos aparecerão aqui quando o RH<br/>os disponibilizar para você.
            </div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {documentos.map(doc=>{
              const {icon,cor,bg} = iconeTipo(doc.tipo)
              return (
                <div key={doc.id} style={{ background:'#fff', borderRadius:14, border:'1px solid #e5e7eb', overflow:'hidden', boxShadow:'0 1px 5px rgba(0,0,0,.05)' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'14px 14px 10px' }}>
                    <div style={{ width:44, height:44, borderRadius:12, flexShrink:0, background:bg, display:'flex', alignItems:'center', justifyContent:'center', color:cor }}>{icon}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:'#111827' }}>{doc.titulo}</div>
                      <div style={{ display:'flex', gap:6, marginTop:4, flexWrap:'wrap' }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:8, color:cor, background:bg }}>{doc.tipo}</span>
                      </div>
                      {doc.descricao&&<div style={{ fontSize:11, color:'#6b7280', marginTop:5 }}>{doc.descricao}</div>}
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px 12px', borderTop:'1px solid #f3f4f6' }}>
                    <span style={{ fontSize:10, color:'#9ca3af' }}>📅 {fmtData((doc.data??'').slice(0,10))}</span>
                    {(doc.url||doc.arquivo_url) ? (
                      <button
                        onClick={async () => {
                          const url = doc.url || doc.arquivo_url
                          if (!url) return
                          try {
                            const resp = await fetch(url)
                            const blob = await resp.blob()
                            const a = document.createElement('a')
                            a.href = URL.createObjectURL(blob)
                            a.download = doc.nome || doc.titulo || 'documento'
                            a.click()
                            URL.revokeObjectURL(a.href)
                          } catch {
                            window.open(url, '_blank')
                          }
                        }}
                        style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 14px', borderRadius:8, background:'#1a56a0', color:'#fff', fontSize:12, fontWeight:700, border:'none', cursor:'pointer' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        Download
                      </button>
                    ) : (
                      <span style={{ fontSize:11, color:'#9ca3af', padding:'5px 10px', background:'#f3f4f6', borderRadius:8 }}>Sem arquivo</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tela Troca de Senha ──────────────────────────────────────────────────────
function TrocaSenha({ acessoId, nome, onConcluido }: { acessoId:string; nome:string; onConcluido:(s:Sessao)=>void }) {
  const [nova,setNova]=useState(''); const [conf,setConf]=useState(''); const [showN,setShowN]=useState(false)
  const [loading,setLoading]=useState(false); const [erro,setErro]=useState('')

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (nova.length<4) { setErro('Mínimo 4 caracteres.'); return }
    if (nova!==conf)   { setErro('As senhas não conferem.'); return }
    setLoading(true); setErro('')
    const hash = await sha256(nova)
    const {error} = await supabase.from('colaborador_acessos').update({ senha_hash:hash, must_change_password:false, ultimo_acesso:new Date().toISOString() }).eq('id',acessoId)
    setLoading(false)
    if (error) { setErro('Erro ao salvar.'); return }
    const {data} = await supabase.from('colaborador_acessos').select('colaborador_id, cpf, colaboradores(nome, chapa)').eq('id',acessoId).single()
    if (!data) { setErro('Sessão inválida.'); return }
    const col = data.colaboradores as any
    const sessao: Sessao = { colaborador_id:data.colaborador_id, acesso_id:acessoId, login:data.cpf, nome:col?.nome??nome, chapa:col?.chapa??'' }
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessao))
    onConcluido(sessao)
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a56a0,#0d3f56)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'32px 28px', width:'100%', maxWidth:380, boxShadow:'0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ textAlign:'center', marginBottom:22 }}>
          <div style={{ width:58, height:58, borderRadius:14, background:'linear-gradient(135deg,#f59e0b,#d97706)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}><Key size={26} color="#fff"/></div>
          <h1 style={{ fontSize:18, fontWeight:800, color:'#111827', margin:0 }}>Criar Nova Senha</h1>
          <p style={{ fontSize:13, color:'#6b7280', margin:'6px 0 0' }}>Olá, <strong>{nome.split(' ')[0]}</strong>! Crie sua senha pessoal.</p>
        </div>
        <div style={{ background:'#fefce8', border:'1px solid #fde68a', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#92400e', marginBottom:16, fontWeight:600 }}>
          🔐 Primeiro acesso — defina uma senha para continuar.
        </div>
        <form onSubmit={salvar} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Nova Senha</label>
            <div style={{ position:'relative' }}>
              <input type={showN?'text':'password'} value={nova} onChange={e=>setNova(e.target.value)} placeholder="Mínimo 4 caracteres" autoComplete="new-password"
                style={{ width:'100%', height:44, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 44px 0 14px', fontSize:15, outline:'none', boxSizing:'border-box' as const }}/>
              <button type="button" onClick={()=>setShowN(s=>!s)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                {showN?<EyeOff size={17}/>:<Eye size={17}/>}
              </button>
            </div>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Confirmar Senha</label>
            <input type="password" value={conf} onChange={e=>setConf(e.target.value)} placeholder="Repita a senha" autoComplete="new-password"
              style={{ width:'100%', height:44, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 14px', fontSize:15, outline:'none', boxSizing:'border-box' as const }}/>
            {conf&&nova!==conf&&<p style={{ fontSize:11, color:'#dc2626', margin:'4px 0 0' }}>As senhas não conferem.</p>}
          </div>
          {erro&&<div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'#dc2626', fontSize:13 }}><AlertCircle size={13}/> {erro}</div>}
          <button type="submit" disabled={loading} style={{ height:46, borderRadius:10, border:'none', cursor:loading?'not-allowed':'pointer', background:loading?'#9ca3af':'linear-gradient(135deg,#f59e0b,#d97706)', color:'#fff', fontWeight:700, fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loading?<><Loader2 size={17} className="animate-spin"/>Salvando…</>:<><Key size={15}/>Salvar e Entrar</>}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Tela Login ───────────────────────────────────────────────────────────────
function TelaLogin({ onLogin }: { onLogin:(s:Sessao)=>void }) {
  const [cpfInput,setCpfInput]=useState(''); const [senha,setSenha]=useState('')
  const [showSenha,setShowSenha]=useState(false); const [loading,setLoading]=useState(false)
  const [erro,setErro]=useState(''); const [trocar,setTrocar]=useState<{acessoId:string;nome:string}|null>(null)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    const cpf = cpfInput.replace(/\D/g,'')
    if (cpf.length!==11) { setErro('CPF inválido.'); return }
    if (!senha.trim())   { setErro('Informe a senha.'); return }
    setLoading(true); setErro('')
    try {
      const hash = await sha256(senha.trim())
      const {data:ac,error:errA} = await supabase.from('colaborador_acessos')
        .select('id,colaborador_id,cpf,senha_hash,must_change_password,ativo,colaboradores(id,nome,chapa,status)')
        .eq('cpf',cpf).single()
      if (errA||!ac)        { setErro('CPF não encontrado ou sem acesso.'); setLoading(false); return }
      if (!ac.ativo)         { setErro('Acesso desativado. Contate o RH.'); setLoading(false); return }
      if (ac.senha_hash!==hash) { setErro('Senha incorreta.'); setLoading(false); return }
      const col = ac.colaboradores as any
      if (ac.must_change_password) { setTrocar({acessoId:ac.id,nome:col?.nome??'Colaborador'}); setLoading(false); return }
      await supabase.from('colaborador_acessos').update({ultimo_acesso:new Date().toISOString()}).eq('id',ac.id)
      const sessao: Sessao = { colaborador_id:ac.colaborador_id, acesso_id:ac.id, login:cpf, nome:col?.nome??'Colaborador', chapa:col?.chapa??'' }
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessao))
      onLogin(sessao)
    } catch { setErro('Erro ao autenticar.') }
    finally { setLoading(false) }
  }

  if (trocar) return <TrocaSenha acessoId={trocar.acessoId} nome={trocar.nome} onConcluido={onLogin}/>

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a56a0,#0d3f56)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ textAlign:'center', marginBottom:28 }}>
        <div style={{ width:72, height:72, borderRadius:20, background:'rgba(255,255,255,.18)', border:'2px solid rgba(255,255,255,.35)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
          <Receipt size={32} color="#fff"/>
        </div>
        <h1 style={{ color:'#fff', fontSize:22, fontWeight:800, margin:0 }}>Portal do Colaborador</h1>
        <p style={{ color:'rgba(255,255,255,.7)', fontSize:13, margin:'6px 0 0' }}>Contracheque · Ponto · Documentos</p>
      </div>
      <div style={{ background:'#fff', borderRadius:16, padding:'28px 24px', width:'100%', maxWidth:380, boxShadow:'0 20px 50px rgba(0,0,0,.30)' }}>
        <form onSubmit={entrar} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>CPF</label>
            <input type="tel" inputMode="numeric" value={cpfInput} onChange={e=>setCpfInput(formatarCPF(e.target.value))} placeholder="000.000.000-00"
              style={{ width:'100%', height:48, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 14px', fontSize:16, outline:'none', boxSizing:'border-box' as const, fontFamily:'monospace' }}/>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>Senha</label>
            <div style={{ position:'relative' }}>
              <input type={showSenha?'text':'password'} value={senha} onChange={e=>setSenha(e.target.value)} placeholder="Sua senha" autoComplete="current-password"
                style={{ width:'100%', height:48, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 44px 0 14px', fontSize:16, outline:'none', boxSizing:'border-box' as const }}/>
              <button type="button" onClick={()=>setShowSenha(s=>!s)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                {showSenha?<EyeOff size={18}/>:<Eye size={18}/>}
              </button>
            </div>
            <p style={{ fontSize:11, color:'#9ca3af', margin:'5px 0 0' }}>Primeiro acesso? Use a senha <strong>123</strong>.</p>
          </div>
          {erro&&<div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'#dc2626', fontSize:13 }}><AlertCircle size={13}/> {erro}</div>}
          <button type="submit" disabled={loading} style={{ height:48, borderRadius:10, border:'none', cursor:loading?'not-allowed':'pointer', background:loading?'#9ca3af':'#1a56a0', color:'#fff', fontWeight:700, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loading?<><Loader2 size={18} className="animate-spin"/>Verificando…</>:'Entrar'}
          </button>
        </form>
        <p style={{ textAlign:'center', fontSize:12, color:'#9ca3af', marginTop:16 }}>Problemas? Fale com o RH da empresa.</p>
      </div>
    </div>
  )
}

// ─── Layout Principal com Bottom Nav ─────────────────────────────────────────
type Aba = 'contracheque' | 'ponto' | 'documentos'

function PortalLayout({ sessao, aba, onAba, onSair, children }: {
  sessao: Sessao; aba: Aba; onAba:(a:Aba)=>void; onSair:()=>void; children: React.ReactNode
}) {
  const iniciais = sessao.nome.split(' ').slice(0,2).map(s=>s.charAt(0).toUpperCase()).join('')

  const abas: {id:Aba;label:string;icon:React.ReactNode}[] = [
    { id:'contracheque', label:'Contracheque', icon:<Receipt size={20}/> },
    { id:'ponto',        label:'Folha de Ponto', icon:<Clock size={20}/> },
    { id:'documentos',   label:'Meus Docs',   icon:<FolderOpen size={20}/> },
  ]

  return (
    <div style={{ minHeight:'100vh', background:'#f0f2f5', display:'flex', flexDirection:'column', fontFamily:"'Inter','Segoe UI',sans-serif" }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1565C0,#0D47A1)', padding:'0 14px', height:54, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100, boxShadow:'0 2px 12px rgba(13,71,161,.35)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, flexShrink:0, background:'rgba(255,255,255,.22)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:900, color:'#fff', letterSpacing:'-.01em', border:'1.5px solid rgba(255,255,255,.35)' }}>
            {iniciais}
          </div>
          <div>
            <div style={{ color:'#fff', fontWeight:700, fontSize:13, lineHeight:1.2 }}>{sessao.nome.toUpperCase()}</div>
            <div style={{ color:'rgba(255,255,255,.65)', fontSize:10, fontWeight:500 }}>Portal do Colaborador</div>
          </div>
        </div>
        <button onClick={onSair} style={{ background:'rgba(239,68,68,.18)', border:'1px solid rgba(239,68,68,.35)', borderRadius:8, padding:'6px 10px', cursor:'pointer', color:'#fca5a5', display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700 }}>
          <LogOut size={12}/> Sair
        </button>
      </div>

      {/* Conteúdo */}
      <div style={{ flex:1, overflowY:'auto' }}>{children}</div>

      {/* Bottom Nav */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#fff', borderTop:'1.5px solid #e2e8f0', display:'flex', zIndex:100, boxShadow:'0 -4px 16px rgba(0,0,0,.10)' }}>
        {abas.map(a=>{
          const isActive = aba===a.id
          const cor = isActive ? '#1565C0' : '#94a3b8'
          return (
            <button key={a.id} onClick={()=>onAba(a.id)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, padding:'10px 4px 12px', background:'none', border:'none', cursor:'pointer', borderTop:isActive?'2.5px solid #1565C0':'2.5px solid transparent', transition:'all .15s' }}>
              <span style={{ color:cor, transition:'color .15s' }}>{a.icon}</span>
              <span style={{ fontSize:10, fontWeight:isActive?700:500, color:cor, whiteSpace:'nowrap', lineHeight:1.2 }}>{a.label}</span>
              {isActive&&<span style={{ width:4, height:4, borderRadius:'50%', background:'#1565C0', marginTop:-2 }}/>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function PortalContracheque() {
  const [sessao, setSessao]         = useState<Sessao|null>(()=>{ try { const s=localStorage.getItem(SESSION_KEY); return s?JSON.parse(s):null } catch { return null } })
  const [holerites, setHolerites]   = useState<Contracheque[]>([])
  const [lancamentos, setLancamentos] = useState<PontoLancamento[]>([])
  const [colab, setColab]           = useState<ColabInfo|null>(null)
  const [empresa, setEmpresa]       = useState<EmpresaInfo|null>(null)
  const [loading, setLoading]       = useState(false)
  const [selecionado, setSelecionado] = useState<Contracheque|null>(null)
  const [aceites, setAceites]       = useState<Record<string, AceiteDigital>>({})
  const [modalAceite, setModalAceite] = useState<Contracheque|null>(null)
  const [salvandoAceite, setSalvandoAceite] = useState(false)
  const [aba, setAba]               = useState<Aba>('contracheque')

  const carregar = useCallback(async (colaboradorId: string) => {
    setLoading(true)
    try {
      const [holRes, colRes, empRes, pontRes] = await Promise.all([
        supabase.from('contracheques').select('*').eq('colaborador_id',colaboradorId).eq('publicado',true).order('competencia',{ascending:false}),
        supabase.from('colaboradores').select('nome,chapa,cpf,funcao_id,tipo_contrato,data_admissao,salario,funcoes(nome)').eq('id',colaboradorId).single(),
        supabase.from('configuracoes').select('chave,valor').in('chave',['empresa_nome','empresa_cnpj','empresa_cidade','empresa_logo_url','codigos_contracheque']),
        supabase.from('ponto_lancamentos')
          .select('id,mes_referencia,data_inicio,data_fim,status,data_pagamento,snap_horas_normais,snap_horas_extras,snap_valor_horas,snap_valor_producao,snap_valor_dsr,snap_valor_premio,snap_valor_total,snap_faltas,snap_desconto_vt,snap_desconto_adiant,snap_inss,snap_ir,snap_liquido')
          .eq('colaborador_id',colaboradorId)
          .in('status',['pago','aprovado','liberado'])
          .order('mes_referencia',{ascending:false}).order('data_inicio',{ascending:true}),
      ])
      const hols = (holRes.data as Contracheque[]) ?? []
      setHolerites(hols)
      setLancamentos((pontRes.data as PontoLancamento[]) ?? [])
      const rawColab = colRes.data as any
      if (rawColab) { rawColab.funcao=rawColab.funcoes?.nome??null; delete rawColab.funcoes; delete rawColab.funcao_id }
      setColab((rawColab as ColabInfo) ?? null)
      const map: Record<string,string> = {}
      ;(empRes.data??[]).forEach((r:any)=>{ map[r.chave]=r.valor })
      const codsRaw = map['codigos_contracheque']
      const codsContabeis = codsRaw ? (() => { try { return JSON.parse(codsRaw) } catch { return {} } })() : {}
      setEmpresa({ nome:map['empresa_nome']??'', cnpj:map['empresa_cnpj']??'', cidade:map['empresa_cidade']??'', logo_url:map['empresa_logo_url']??'', codigos:codsContabeis })
      // Carregar aceites dos holerites do colaborador
      if (hols.length > 0) {
        const ids = hols.map(h => h.id)
        const { data: acData } = await supabase
          .from('contracheque_aceites')
          .select('*')
          .eq('colaborador_id', colaboradorId)
          .in('contracheque_id', ids)
        if (acData) {
          const m: Record<string, AceiteDigital> = {}
          for (const a of acData as AceiteDigital[]) m[a.contracheque_id] = a
          setAceites(m)
        }
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(()=>{ if (sessao) carregar(sessao.colaborador_id) }, [sessao, carregar])

  // ── Registrar aceite digital ───────────────────────────────────────────────
  async function confirmarAceite(h: Contracheque) {
    if (!sessao) return
    setSalvandoAceite(true)
    try {
      const ip = await getIpPublico()
      const agora = new Date().toISOString()

      // Tenta upsert (insert ou atualiza se já existe)
      const { data: upserted, error: upsertErr } = await supabase
        .from('contracheque_aceites')
        .upsert({
          contracheque_id:  h.id,
          colaborador_id:   sessao.colaborador_id,
          ip_address:       ip,
          user_agent:       navigator.userAgent.slice(0, 300),
          nome_colaborador: sessao.nome,
          chapa:            sessao.chapa,
          competencia:      h.competencia.slice(0, 7),
          aceito_em:        agora,
        }, { onConflict: 'contracheque_id,colaborador_id' })
        .select()
        .single()

      let aceiteRegistrado: AceiteDigital | null = null

      if (!upsertErr && upserted) {
        aceiteRegistrado = upserted as AceiteDigital
      } else {
        // Fallback: buscar registro existente caso upsert falhou mas o dado já existe
        const { data: existing } = await supabase
          .from('contracheque_aceites')
          .select()
          .eq('contracheque_id', h.id)
          .eq('colaborador_id', sessao.colaborador_id)
          .single()

        if (existing) {
          aceiteRegistrado = existing as AceiteDigital
        } else {
          // Último fallback: objeto local para não bloquear o usuário
          aceiteRegistrado = {
            id: String(Date.now()),
            contracheque_id: h.id,
            aceito_em: agora,
            ip_address: ip,
            nome_colaborador: sessao.nome,
            chapa: sessao.chapa,
            competencia: h.competencia.slice(0, 7),
          } as AceiteDigital
        }
      }

      // Atualizar estado ANTES de abrir holerite — garante re-render correto
      setAceites(prev => ({ ...prev, [h.id]: aceiteRegistrado! }))
      setModalAceite(null)
      setSelecionado(h)
    } catch {
      // Falha total: ainda assim permite abrir o holerite
      setModalAceite(null)
      setSelecionado(h)
    } finally {
      setSalvandoAceite(false)
    }
  }

  // Quando o colaborador clica em "Ver Detalhes" / card do holerite:
  // Se já tem aceite → abrir direto. Se não → exibir modal de aceite primeiro.
  function abrirHolerite(h: Contracheque) {
    if (aceites[h.id]) {
      setSelecionado(h)
    } else {
      setModalAceite(h)
    }
  }

  function sair() {
    localStorage.removeItem(SESSION_KEY)
    setSessao(null); setHolerites([]); setLancamentos([]); setSelecionado(null); setAba('contracheque'); setAceites({}); setModalAceite(null)
  }

  if (!sessao) return <TelaLogin onLogin={setSessao}/>

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a56a0,#0d3f56)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <Loader2 size={40} className="animate-spin" color="#fff"/>
      <span style={{ color:'rgba(255,255,255,.8)', fontSize:14 }}>Carregando…</span>
    </div>
  )

  if (selecionado) return (
    <TelaHolerite h={selecionado} colab={colab} empresa={empresa} aceite={aceites[selecionado.id]??null} onVoltar={()=>setSelecionado(null)}/>
  )

  return (
    <PortalLayout sessao={sessao} aba={aba} onAba={setAba} onSair={sair}>
      {aba==='contracheque' && (
        <AbaContracheque sessao={sessao} holerites={holerites} lancamentos={lancamentos} colab={colab} empresa={empresa} aceites={aceites} onSelecionar={abrirHolerite}/>
      )}
      {aba==='ponto' && <AbaFolhaPonto sessao={sessao} dataAdmissao={colab?.data_admissao ?? null} lancamentos={lancamentos}/>}
      {aba==='documentos' && <AbaMeusDocumentos sessao={sessao}/>}

      {/* ══ MODAL ACEITE DIGITAL ══ */}
      {modalAceite && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div style={{ background:'#fff', borderRadius:16, padding:'24px 20px 28px', width:'100%', maxWidth:460, animation:'fadeIn .2s ease', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
              <span style={{ width:44, height:44, borderRadius:'50%', background:'#dbeafe', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <ShieldCheck size={22} color="#1d4ed8"/>
              </span>
            </div>
            <h2 style={{ textAlign:'center', fontSize:18, fontWeight:800, color:'#0f172a', margin:'0 0 6px' }}>Aceite Digital</h2>
            <p style={{ textAlign:'center', fontSize:13, color:'#6b7280', lineHeight:1.6, margin:'0 0 18px' }}>
              Ao confirmar, você declara que <strong>leu e está ciente</strong> do conteúdo do seu contracheque de 
              <strong>{fmtComp(modalAceite.competencia)}</strong>.
            </p>
            {/* Resumo do holerite */}
            <div style={{ background:'#f8fafc', borderRadius:10, padding:'12px 14px', marginBottom:18, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4 }}>
              {[['Bruto','#16a34a',modalAceite.bruto],['Descontos','#dc2626',modalAceite.descontos??((modalAceite.inss??0)+(modalAceite.irrf??0))],['Líquido','#1d4ed8',modalAceite.liquido]].map(([label,cor,val])=>(
                <div key={String(label)} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:9, color:'#9ca3af', fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>{String(label)}</div>
                  <div style={{ fontSize:13, fontWeight:800, color:String(cor) }}>{fmtR(val as number|null)}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:11, color:'#9ca3af', background:'#f8fafc', borderRadius:8, padding:'8px 12px', marginBottom:18, lineHeight:1.7 }}>
              🛡️ Serão registrados: <strong>data/hora</strong>, <strong>IP do dispositivo</strong> e <strong>identificação do usuário</strong> para fins jurídicos.
            </div>
            <button
              onClick={() => confirmarAceite(modalAceite)}
              disabled={salvandoAceite}
              style={{ width:'100%', height:50, borderRadius:12, border:'none', background: salvandoAceite ? '#93c5fd' : 'linear-gradient(135deg,#1d4ed8,#0d3f56)', color:'#fff', fontWeight:800, fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:10, boxShadow:'0 4px 16px rgba(29,78,216,.3)' }}
            >
              {salvandoAceite ? <Loader2 size={18} className="animate-spin"/> : <CheckCircle2 size={18}/>}
              {salvandoAceite ? 'Registrando…' : 'Li e estou ciente ✓'}
            </button>
            <button onClick={()=>setModalAceite(null)} style={{ width:'100%', height:40, borderRadius:10, border:'1px solid #e2e8f0', background:'#f8fafc', color:'#64748b', fontWeight:600, fontSize:14, cursor:'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <style>{`@keyframes fadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}`}</style>
    </PortalLayout>
  )
}
