import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Receipt, LogOut, AlertCircle, Key, Eye, EyeOff, Loader2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Download, Printer, Plus, Minus, Info,
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

type ColabInfo = {
  nome: string; chapa: string | null; cpf: string | null
  funcao: string | null; tipo_contrato: string | null
  data_admissao: string | null; salario_base: number | null
}

type EmpresaInfo = {
  nome: string; cnpj: string; cidade: string; logo_url: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

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

const TIPO_LABEL: Record<string, string> = {
  mensal:'Mensal', '13o_1a':'13º Salário — 1ª Parcela',
  '13o_2a':'13º Salário — 2ª Parcela', ferias:'Férias', adiantamento:'Adiantamento',
}

const SESSION_KEY = 'contracheque_session'

// ─── Gráfico Donut SVG simples ────────────────────────────────────────────────
function DonutChart({ slices, size = 120 }: {
  slices: { valor: number; cor: string; label: string }[]
  size?: number
}) {
  const total = slices.reduce((s, sl) => s + sl.valor, 0)
  if (total <= 0) return null

  const r = size / 2 - 12
  const cx = size / 2
  const cy = size / 2
  const strokeW = 22

  let acum = -90 // começa do topo
  const arcos = slices.map(sl => {
    const pct = sl.valor / total
    const deg = pct * 360
    const start = acum
    acum += deg
    const startRad = (start * Math.PI) / 180
    const endRad   = ((start + deg) * Math.PI) / 180
    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const largeArc = deg > 180 ? 1 : 0
    return { ...sl, pct, path: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, deg }
  })

  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      {/* Fundo */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={strokeW} />
      {arcos.map((a, i) => (
        <path key={i} d={a.path} fill="none" stroke={a.cor} strokeWidth={strokeW}
          strokeLinecap="butt" style={{ transition: 'all .4s' }} />
      ))}
    </svg>
  )
}

// ─── Seção expansível (accordion) ────────────────────────────────────────────
function Secao({ titulo, icone, cor, aberto, onToggle, children }: {
  titulo: string; icone: React.ReactNode; cor: string
  aberto: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ borderBottom: '1px solid #e5e7eb' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 24, height: 24, borderRadius: '50%', background: cor,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {icone}
          </span>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{titulo}</span>
        </div>
        {aberto
          ? <ChevronUp size={18} color="#6b7280" />
          : <ChevronDown size={18} color="#6b7280" />}
      </button>
      {aberto && (
        <div style={{ paddingBottom: 8 }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Linha de item (rendimento ou desconto) ──────────────────────────────────
function LinhaDetalhe({ codigo, descricao, valor, cor = '#111827' }: {
  codigo?: string; descricao: string; valor: number | null; cor?: string
}) {
  if (!valor || valor <= 0) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 16px', borderBottom: '1px solid #f3f4f6',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {codigo && (
          <span style={{
            fontSize: 10, color: '#9ca3af', fontWeight: 600, minWidth: 36,
            background: '#f3f4f6', padding: '1px 5px', borderRadius: 4,
          }}>{codigo}</span>
        )}
        <span style={{ fontSize: 14, color: '#374151' }}>{descricao}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: cor, whiteSpace: 'nowrap', marginLeft: 8 }}>
        {fmtR(valor)}
      </span>
    </div>
  )
}

// ─── Card resumo Bruto / Descontos / Líquido ─────────────────────────────────
function CardResumo({ bruto, descontos, liquido }: {
  bruto: number; descontos: number; liquido: number
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
      background: '#fff', borderRadius: 12, overflow: 'hidden',
      border: '1px solid #e5e7eb',
      boxShadow: '0 2px 8px rgba(0,0,0,.06)',
      margin: '0 0 4px',
    }}>
      {/* Bruto */}
      <div style={{ padding: '14px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .4 }}>Bruto</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>{fmtR(bruto)}</div>
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={12} color="#16a34a" strokeWidth={3} />
          </span>
        </div>
      </div>

      <div style={{ background: '#e5e7eb' }}/>

      {/* Descontos */}
      <div style={{ padding: '14px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .4 }}>Descontos</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626' }}>{fmtR(descontos)}</div>
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Minus size={12} color="#dc2626" strokeWidth={3} />
          </span>
        </div>
      </div>

      <div style={{ background: '#e5e7eb' }}/>

      {/* Líquido */}
      <div style={{ padding: '14px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .4 }}>Líquido</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1d4ed8' }}>{fmtR(liquido)}</div>
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="none" stroke="#1d4ed8" strokeWidth="2"/><path d="M3 6l2 2 4-4" stroke="#1d4ed8" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Tela de contracheque completo ───────────────────────────────────────────
function TelaHolerite({ h, colab, empresa, onVoltar }: {
  h: Contracheque; colab: ColabInfo | null; empresa: EmpresaInfo | null; onVoltar: () => void
}) {
  const [secAberta, setSecAberta] = useState<'rendimentos' | 'descontos' | 'infos' | null>('rendimentos')

  const bruto    = h.bruto    ?? 0
  const descontos = (h.inss ?? 0) + (h.irrf ?? 0) + (h.desconto_vt ?? 0) + (h.desconto_adiant ?? 0) + (h.cesta_basica ?? 0) || (h.descontos ?? 0)
  const liquido  = h.liquido  ?? Math.max(0, bruto - descontos)

  // Rendimentos para gráfico
  const rendimentos = [
    { cod:'0001', desc:'Salário / Valor Horas',  val: h.salario_base,   cor:'#3b82f6' },
    { cod:'0002', desc:'Produção',               val: h.valor_producao, cor:'#10b981' },
    { cod:'0003', desc:'DSR',                    val: h.valor_dsr,      cor:'#6366f1' },
    { cod:'0004', desc:'Prêmios',                val: h.valor_premio,   cor:'#f59e0b' },
  ].filter(r => r.val && r.val > 0)

  // Se sem detalhes mas tem bruto, mostra total genérico
  if (!rendimentos.length && bruto > 0) {
    rendimentos.push({ cod:'0001', desc:'Total Rendimentos', val: bruto, cor:'#3b82f6' })
  }

  const descontosList = [
    { cod:'0101', desc:'INSS',            val: h.inss,            cor:'#ef4444' },
    { cod:'0102', desc:'IRRF',            val: h.irrf,            cor:'#f97316' },
    { cod:'0103', desc:'Vale Transporte', val: h.desconto_vt,     cor:'#8b5cf6' },
    { cod:'0104', desc:'Adiantamento',    val: h.desconto_adiant, cor:'#ec4899' },
    { cod:'0105', desc:'Cesta Básica',    val: h.cesta_basica,    cor:'#14b8a6' },
  ].filter(d => d.val && d.val > 0)

  if (!descontosList.length && descontos > 0) {
    descontosList.push({ cod:'0101', desc:'Total Descontos', val: descontos, cor:'#ef4444' })
  }

  // Slices para o gráfico dos rendimentos
  const slicesRend = rendimentos.map(r => ({ valor: r.val!, cor: r.cor, label: r.desc }))
  const slicesDesc = descontosList.map(d => ({ valor: d.val!, cor: d.cor, label: d.desc }))

  function imprimir() {
    const w = window.open('', '_blank')
    if (!w) return
    const empresa_nome = empresa?.nome ?? 'Empresa'

    const rowsRend = rendimentos.map(r =>
      `<tr><td class="cod">${r.cod}</td><td>${r.desc}</td><td class="val green">${fmtR(r.val)}</td></tr>`).join('')
    const rowsDesc = descontosList.map(d =>
      `<tr><td class="cod">${d.cod}</td><td>${d.desc}</td><td class="val red">- ${fmtR(d.val)}</td></tr>`).join('')
    const fgtsRow = h.fgts && h.fgts > 0
      ? `<tr><td class="cod">—</td><td>FGTS (empregador)</td><td class="val blue">* ${fmtR(h.fgts)}</td></tr>` : ''

    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><title>Contracheque — ${fmtComp(h.competencia)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;background:#fff;padding:20px}
  .page{max-width:700px;margin:0 auto;border:1.5px solid #0d3f56;border-radius:6px;overflow:hidden}
  .header{background:#1a56a0;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center}
  .header h1{font-size:16px;font-weight:700}
  .header .sub{font-size:11px;opacity:.8;margin-top:2px}
  .func-bar{background:#f0f4f8;padding:10px 18px;border-bottom:1px solid #d0dae5;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .func-item label{font-size:9px;text-transform:uppercase;color:#6b7280;font-weight:700;display:block;margin-bottom:2px}
  .func-item span{font-size:11px;font-weight:600;color:#111}
  .resumo{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:2px solid #0d3f56;background:#f9fafb}
  .resumo-cell{padding:12px 18px;text-align:center;border-right:1px solid #e5e7eb}
  .resumo-cell:last-child{border-right:none}
  .resumo-label{font-size:10px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:4px}
  .resumo-val{font-size:15px;font-weight:800}
  .green{color:#16a34a}.red{color:#dc2626}.blue{color:#1d4ed8}
  .sec-title{background:#f3f4f6;padding:7px 18px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#374151;border-bottom:1px solid #e5e7eb}
  table{width:100%;border-collapse:collapse}
  td{padding:7px 18px;border-bottom:1px solid #f3f4f6}
  td.cod{width:50px;color:#9ca3af;font-size:10px}
  td.val{text-align:right;font-weight:700;white-space:nowrap}
  .fgts-note{font-size:10px;color:#6b7280;padding:6px 18px;background:#eff6ff;border-top:1px solid #bfdbfe}
  .footer{padding:8px 18px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}
  @media print{body{padding:0}}
</style></head><body>
<div class="page">
  <div class="header">
    <div>
      <h1>Contracheque</h1>
      <div class="sub">${fmtComp(h.competencia)} · ${TIPO_LABEL[h.tipo] ?? h.tipo}</div>
    </div>
    <div style="text-align:right">
      <div style="font-weight:700;font-size:14px">${empresa_nome}</div>
      ${empresa?.cnpj ? `<div class="sub">CNPJ: ${empresa.cnpj}</div>` : ''}
    </div>
  </div>
  <div class="func-bar">
    <div class="func-item"><label>Matrícula</label><span>${colab?.chapa ?? '—'}</span></div>
    <div class="func-item"><label>Nome</label><span>${colab?.nome ?? '—'}</span></div>
    <div class="func-item"><label>CPF</label><span>${colab?.cpf ? fmtCPF(colab.cpf) : '—'}</span></div>
    <div class="func-item"><label>Admissão</label><span>${fmtData(colab?.data_admissao ?? null)}</span></div>
    <div class="func-item"><label>Cargo</label><span>${h.funcao ?? colab?.funcao ?? '—'}</span></div>
    <div class="func-item"><label>Vínculo</label><span>${(h.tipo_contrato_snap ?? colab?.tipo_contrato ?? 'CLT').toUpperCase()}</span></div>
    ${h.obra_nome ? `<div class="func-item"><label>Obra</label><span>${h.obra_nome}</span></div>` : ''}
    ${h.dias_trabalhados != null ? `<div class="func-item"><label>Dias / Faltas</label><span>${h.dias_trabalhados}d${h.faltas ? ` / ${h.faltas}f` : ''}</span></div>` : ''}
  </div>
  <div class="resumo">
    <div class="resumo-cell"><div class="resumo-label">Total Bruto</div><div class="resumo-val green">${fmtR(bruto)}</div></div>
    <div class="resumo-cell"><div class="resumo-label">Total Descontos</div><div class="resumo-val red">- ${fmtR(descontos)}</div></div>
    <div class="resumo-cell"><div class="resumo-label">Líquido a Receber</div><div class="resumo-val blue">${fmtR(liquido)}</div></div>
  </div>
  <div class="sec-title">Rendimentos</div>
  <table><tbody>${rowsRend}</tbody></table>
  <div class="sec-title">Descontos</div>
  <table><tbody>${rowsDesc}</tbody></table>
  ${h.fgts && h.fgts > 0 ? `<div class="fgts-note">* FGTS depositado pelo empregador — não deduzido do salário: <strong>${fmtR(h.fgts)}</strong></div>` : ''}
  ${fgtsRow ? `<table><tbody>${fgtsRow}</tbody></table>` : ''}
  <div class="footer">
    <span>${colab?.nome ?? ''} · Chapa ${colab?.chapa ?? '—'}</span>
    <span>Publicado: ${h.publicado_em ? new Date(h.publicado_em).toLocaleDateString('pt-BR') : '—'}</span>
  </div>
</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`)
    w.document.close()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', flexDirection: 'column' }}>
      {/* Header azul */}
      <div style={{ background: '#1a56a0', padding: '0 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', height: 52, gap: 10 }}>
          <button onClick={onVoltar}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', padding: 4 }}>
            <ChevronLeft size={22} />
          </button>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, flex: 1 }}>Contracheque</span>
          <button onClick={imprimir} style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 7, padding: '5px 10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Printer size={13}/> Imprimir
          </button>
          {h.arquivo_url && (
            <a href={h.arquivo_url} target="_blank" rel="noreferrer"
              style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 7, padding: '5px 10px', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <Download size={13}/> PDF
            </a>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', width: '100%', padding: '0 0 32px' }}>
        {/* Info da competência */}
        <div style={{ background: '#1a56a0', padding: '0 16px 16px', color: '#fff' }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            {/* Órgão / Matrícula */}
            <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', marginBottom: 1 }}>Empresa · Matrícula</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{empresa?.nome ?? '—'} · {colab?.chapa ?? '—'}</div>
            </div>
            {/* Cargo */}
            <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', marginBottom: 1 }}>Cargo / Função</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{h.funcao ?? colab?.funcao ?? '—'}</div>
            </div>
          </div>
        </div>

        {/* Competência badge */}
        <div style={{ background: '#fff', padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1a56a0' }}>
            {fmtComp(h.competencia)}
          </span>
          <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '3px 10px', borderRadius: 12, fontWeight: 600, border: '1px solid #bfdbfe' }}>
            {TIPO_LABEL[h.tipo] ?? h.tipo}
          </span>
        </div>

        {/* Card Bruto / Descontos / Líquido */}
        <div style={{ padding: '14px 16px 8px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: .4 }}>Total</div>
          <CardResumo bruto={bruto} descontos={descontos} liquido={liquido} />
        </div>

        {/* ── Seções expansíveis ── */}
        <div style={{ background: '#fff', marginTop: 12 }}>

          {/* Rendimentos */}
          <Secao
            titulo="Rendimentos"
            icone={<Plus size={12} color="#fff" strokeWidth={3}/>}
            cor="#16a34a"
            aberto={secAberta === 'rendimentos'}
            onToggle={() => setSecAberta(s => s === 'rendimentos' ? null : 'rendimentos')}
          >
            {/* Gráfico */}
            {slicesRend.length > 0 && (
              <div style={{ padding: '16px 0 8px' }}>
                <DonutChart slices={slicesRend} size={140} />
                <div style={{ padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {slicesRend.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.cor, flexShrink: 0 }}/>
                      <span style={{ flex: 1 }}>{s.label}</span>
                      <span style={{ fontWeight: 600, color: s.cor }}>
                        {((s.valor / slicesRend.reduce((a,b)=>a+b.valor,0))*100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Linhas */}
            <div style={{ marginTop: 8 }}>
              <LinhaDetalhe codigo="0001" descricao="Salário / Valor Horas"  valor={h.salario_base}   cor="#16a34a" />
              <LinhaDetalhe codigo="0002" descricao="Produção"               valor={h.valor_producao} cor="#16a34a" />
              <LinhaDetalhe codigo="0003" descricao="DSR"                    valor={h.valor_dsr}      cor="#16a34a" />
              <LinhaDetalhe codigo="0004" descricao="Prêmios"                valor={h.valor_premio}   cor="#16a34a" />
              {!h.salario_base && !h.valor_producao && bruto > 0 && (
                <LinhaDetalhe codigo="0001" descricao="Total Rendimentos" valor={bruto} cor="#16a34a" />
              )}
              {/* Total */}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 16px', background:'#f0fdf4', borderTop:'2px solid #bbf7d0' }}>
                <span style={{ fontWeight:700, fontSize:13, color:'#15803d' }}>Total Rendimentos</span>
                <span style={{ fontWeight:800, fontSize:14, color:'#15803d' }}>{fmtR(bruto)}</span>
              </div>
            </div>
          </Secao>

          {/* Descontos */}
          <Secao
            titulo="Descontos"
            icone={<Minus size={12} color="#fff" strokeWidth={3}/>}
            cor="#dc2626"
            aberto={secAberta === 'descontos'}
            onToggle={() => setSecAberta(s => s === 'descontos' ? null : 'descontos')}
          >
            {slicesDesc.length > 0 && (
              <div style={{ padding: '16px 0 8px' }}>
                <DonutChart slices={slicesDesc} size={140} />
                <div style={{ padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {slicesDesc.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.cor, flexShrink: 0 }}/>
                      <span style={{ flex: 1 }}>{s.label}</span>
                      <span style={{ fontWeight: 600, color: s.cor }}>
                        {((s.valor / slicesDesc.reduce((a,b)=>a+b.valor,0))*100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <LinhaDetalhe codigo="0101" descricao="INSS"            valor={h.inss}            cor="#dc2626" />
              <LinhaDetalhe codigo="0102" descricao="IRRF"            valor={h.irrf}            cor="#f97316" />
              <LinhaDetalhe codigo="0103" descricao="Vale Transporte" valor={h.desconto_vt}     cor="#8b5cf6" />
              <LinhaDetalhe codigo="0104" descricao="Adiantamento"    valor={h.desconto_adiant} cor="#ec4899" />
              <LinhaDetalhe codigo="0105" descricao="Cesta Básica"    valor={h.cesta_basica}    cor="#14b8a6" />
              {!h.inss && !h.irrf && descontos > 0 && (
                <LinhaDetalhe codigo="0101" descricao="Total Descontos" valor={descontos} cor="#dc2626" />
              )}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 16px', background:'#fff1f2', borderTop:'2px solid #fecaca' }}>
                <span style={{ fontWeight:700, fontSize:13, color:'#dc2626' }}>Total Descontos</span>
                <span style={{ fontWeight:800, fontSize:14, color:'#dc2626' }}>- {fmtR(descontos)}</span>
              </div>
            </div>
          </Secao>

          {/* Informações Adicionais */}
          <Secao
            titulo="Informações Adicionais"
            icone={<Info size={12} color="#fff"/>}
            cor="#6b7280"
            aberto={secAberta === 'infos'}
            onToggle={() => setSecAberta(s => s === 'infos' ? null : 'infos')}
          >
            <div style={{ padding: '8px 0' }}>
              {[
                { label: 'Colaborador',      valor: colab?.nome ?? '—' },
                { label: 'Matrícula',        valor: colab?.chapa ?? '—' },
                { label: 'CPF',              valor: colab?.cpf ? fmtCPF(colab.cpf) : '—' },
                { label: 'Data de Admissão', valor: fmtData(colab?.data_admissao ?? null) },
                { label: 'Vínculo',          valor: (h.tipo_contrato_snap ?? colab?.tipo_contrato ?? 'CLT').toUpperCase() },
                { label: 'Obra / Setor',     valor: h.obra_nome ?? '—' },
                { label: 'Horas Normais',    valor: h.horas_normais ? `${h.horas_normais}h` : '—' },
                { label: 'Horas Extras',     valor: h.horas_extras ? `${h.horas_extras}h` : '—' },
                { label: 'Dias Trabalhados', valor: h.dias_trabalhados != null ? String(h.dias_trabalhados) : '—' },
                { label: 'Faltas',           valor: h.faltas != null ? String(h.faltas) : '—' },
              ].filter(i => i.valor !== '—' && i.valor !== null).map(({ label, valor }) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid #f3f4f6' }}>
                  <span style={{ fontSize:13, color:'#6b7280' }}>{label}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{valor}</span>
                </div>
              ))}
              {h.fgts && h.fgts > 0 && (
                <div style={{ margin:'10px 16px 4px', padding:'9px 13px', background:'#eff6ff', borderRadius:8, border:'1px solid #bfdbfe' }}>
                  <div style={{ fontSize:11, color:'#1d4ed8', fontWeight:700, marginBottom:2 }}>FGTS — depositado pelo empregador</div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#1d4ed8' }}>{fmtR(h.fgts)}</div>
                  <div style={{ fontSize:11, color:'#3b82f6', marginTop:2 }}>Valor não deduzido do seu salário</div>
                </div>
              )}
              {h.publicado_em && (
                <div style={{ padding:'8px 16px', fontSize:11, color:'#9ca3af' }}>
                  Publicado em {new Date(h.publicado_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })}
                </div>
              )}
            </div>
          </Secao>
        </div>

        {/* Líquido fixo no final */}
        <div style={{ margin: '16px 16px 0', background: '#1a56a0', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 13, fontWeight: 600 }}>💰 Líquido a Receber</span>
          <span style={{ color: '#fff', fontSize: 22, fontWeight: 900, letterSpacing: -.5 }}>{fmtR(liquido)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Tela de Troca de Senha ───────────────────────────────────────────────────
function TrocaSenha({ acessoId, nome, onConcluido }: {
  acessoId: string; nome: string; onConcluido: (s: Sessao) => void
}) {
  const [nova, setNova]       = useState('')
  const [conf, setConf]       = useState('')
  const [showN, setShowN]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState('')

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (nova.length < 4) { setErro('Mínimo 4 caracteres.'); return }
    if (nova !== conf)   { setErro('As senhas não conferem.'); return }
    setLoading(true); setErro('')
    const hash = await sha256(nova)
    const { error } = await supabase.from('colaborador_acessos')
      .update({ senha_hash: hash, must_change_password: false, ultimo_acesso: new Date().toISOString() })
      .eq('id', acessoId)
    setLoading(false)
    if (error) { setErro('Erro ao salvar.'); return }
    const { data } = await supabase.from('colaborador_acessos')
      .select('colaborador_id, cpf, colaboradores(nome, chapa)')
      .eq('id', acessoId).single()
    if (!data) { setErro('Sessão inválida.'); return }
    const col = data.colaboradores as any
    const sessao: Sessao = {
      colaborador_id: data.colaborador_id, acesso_id: acessoId,
      login: data.cpf, nome: col?.nome ?? nome, chapa: col?.chapa ?? '',
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessao))
    onConcluido(sessao)
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a56a0,#0d3f56)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'32px 28px', width:'100%', maxWidth:380, boxShadow:'0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ textAlign:'center', marginBottom:22 }}>
          <div style={{ width:58, height:58, borderRadius:14, background:'linear-gradient(135deg,#f59e0b,#d97706)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
            <Key size={26} color="#fff"/>
          </div>
          <h1 style={{ fontSize:18, fontWeight:800, color:'#111827', margin:0 }}>Criar Nova Senha</h1>
          <p style={{ fontSize:13, color:'#6b7280', margin:'6px 0 0', lineHeight:1.5 }}>
            Olá, <strong>{nome.split(' ')[0]}</strong>! Crie sua senha pessoal.
          </p>
        </div>
        <div style={{ background:'#fefce8', border:'1px solid #fde68a', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#92400e', marginBottom:16, fontWeight:600 }}>
          🔐 Primeiro acesso — defina uma senha para continuar.
        </div>
        <form onSubmit={salvar} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Nova Senha</label>
            <div style={{ position:'relative' }}>
              <input type={showN?'text':'password'} value={nova} onChange={e=>setNova(e.target.value)}
                placeholder="Mínimo 4 caracteres" autoComplete="new-password"
                style={{ width:'100%', height:44, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 44px 0 14px', fontSize:15, outline:'none', boxSizing:'border-box' }}/>
              <button type="button" onClick={()=>setShowN(s=>!s)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                {showN?<EyeOff size={17}/>:<Eye size={17}/>}
              </button>
            </div>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Confirmar Senha</label>
            <input type="password" value={conf} onChange={e=>setConf(e.target.value)}
              placeholder="Repita a senha" autoComplete="new-password"
              style={{ width:'100%', height:44, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 14px', fontSize:15, outline:'none', boxSizing:'border-box' }}/>
            {conf && nova !== conf && <p style={{ fontSize:11, color:'#dc2626', margin:'4px 0 0' }}>As senhas não conferem.</p>}
          </div>
          {erro && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'#dc2626', fontSize:13 }}>
              <AlertCircle size={13}/> {erro}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{ height:46, borderRadius:10, border:'none', cursor:loading?'not-allowed':'pointer', background:loading?'#9ca3af':'linear-gradient(135deg,#f59e0b,#d97706)', color:'#fff', fontWeight:700, fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loading?<><Loader2 size={17} className="animate-spin"/>Salvando…</>:<><Key size={15}/>Salvar e Entrar</>}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Tela de Login ────────────────────────────────────────────────────────────
function TelaLogin({ onLogin }: { onLogin: (s: Sessao) => void }) {
  const [cpfInput, setCpfInput]   = useState('')
  const [senha, setSenha]         = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [erro, setErro]           = useState('')
  const [trocar, setTrocar]       = useState<{ acessoId: string; nome: string } | null>(null)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    const cpf = cpfInput.replace(/\D/g, '')
    if (cpf.length !== 11) { setErro('CPF inválido — informe os 11 dígitos.'); return }
    if (!senha.trim())     { setErro('Informe a senha.'); return }
    setLoading(true); setErro('')
    try {
      const hash = await sha256(senha.trim())
      const { data: ac, error: errA } = await supabase
        .from('colaborador_acessos')
        .select('id,colaborador_id,cpf,senha_hash,must_change_password,ativo,colaboradores(id,nome,chapa,status)')
        .eq('cpf', cpf).single()
      if (errA || !ac)        { setErro('CPF não encontrado ou sem acesso.'); setLoading(false); return }
      if (!ac.ativo)           { setErro('Acesso desativado. Contate o RH.'); setLoading(false); return }
      if (ac.senha_hash !== hash) { setErro('Senha incorreta.'); setLoading(false); return }
      const col = ac.colaboradores as any
      if (ac.must_change_password) { setTrocar({ acessoId: ac.id, nome: col?.nome ?? 'Colaborador' }); setLoading(false); return }
      await supabase.from('colaborador_acessos').update({ ultimo_acesso: new Date().toISOString() }).eq('id', ac.id)
      const sessao: Sessao = { colaborador_id: ac.colaborador_id, acesso_id: ac.id, login: cpf, nome: col?.nome ?? 'Colaborador', chapa: col?.chapa ?? '' }
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessao))
      onLogin(sessao)
    } catch { setErro('Erro ao autenticar. Tente novamente.') }
    finally { setLoading(false) }
  }

  if (trocar) return <TrocaSenha acessoId={trocar.acessoId} nome={trocar.nome} onConcluido={onLogin} />

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a56a0,#0d3f56)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:20 }}>
      {/* Logo SOU-GOV style */}
      <div style={{ textAlign:'center', marginBottom:28 }}>
        <div style={{ width:72, height:72, borderRadius:18, background:'rgba(255,255,255,.15)', border:'2px solid rgba(255,255,255,.3)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', backdropFilter:'blur(4px)' }}>
          <Receipt size={32} color="#fff"/>
        </div>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#fff', margin:0 }}>Meus Contracheques</h1>
        <p style={{ fontSize:13, color:'rgba(255,255,255,.75)', margin:'6px 0 0' }}>Portal do Colaborador</p>
      </div>

      <div style={{ background:'#fff', borderRadius:16, padding:'28px 24px', width:'100%', maxWidth:380, boxShadow:'0 20px 50px rgba(0,0,0,.3)' }}>
        <form onSubmit={entrar} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:.4 }}>CPF</label>
            <input type="text" inputMode="numeric" value={cpfInput} onChange={e=>setCpfInput(formatarCPF(e.target.value))}
              placeholder="000.000.000-00" maxLength={14} autoComplete="username"
              style={{ width:'100%', height:48, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 14px', fontSize:16, outline:'none', boxSizing:'border-box' }}/>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:.4 }}>Senha</label>
            <div style={{ position:'relative' }}>
              <input type={showSenha?'text':'password'} value={senha} onChange={e=>setSenha(e.target.value)}
                placeholder="Sua senha" autoComplete="current-password"
                style={{ width:'100%', height:48, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 44px 0 14px', fontSize:16, outline:'none', boxSizing:'border-box' }}/>
              <button type="button" onClick={()=>setShowSenha(s=>!s)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                {showSenha?<EyeOff size={18}/>:<Eye size={18}/>}
              </button>
            </div>
            <p style={{ fontSize:11, color:'#9ca3af', margin:'5px 0 0' }}>
              Primeiro acesso? Use a senha <strong>123</strong> e crie sua senha pessoal.
            </p>
          </div>
          {erro && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'#dc2626', fontSize:13 }}>
              <AlertCircle size={13}/> {erro}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{ height:48, borderRadius:10, border:'none', cursor:loading?'not-allowed':'pointer', background:loading?'#9ca3af':'#1a56a0', color:'#fff', fontWeight:700, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loading?<><Loader2 size={18} className="animate-spin"/>Verificando…</>:'Entrar'}
          </button>
        </form>
        <p style={{ textAlign:'center', fontSize:12, color:'#9ca3af', marginTop:16 }}>
          Problemas? Fale com o RH da empresa.
        </p>
      </div>
    </div>
  )
}

// ─── Tela de lista de contracheques (carrossel de meses) ─────────────────────
function TelaLista({ sessao, holerites, colab, empresa, onSelecionar, onSair }: {
  sessao: Sessao; holerites: Contracheque[]
  colab: ColabInfo | null; empresa: EmpresaInfo | null
  onSelecionar: (h: Contracheque) => void; onSair: () => void
}) {
  // Índice do mês ativo (mais recente = 0)
  const [idxAtivo, setIdxAtivo] = useState(0)
  const carrosselRef = useRef<HTMLDivElement>(null)

  // Scroll automático quando troca de índice
  useEffect(() => {
    if (!carrosselRef.current) return
    const btns = carrosselRef.current.querySelectorAll('button[data-idx]')
    const btn = btns[idxAtivo] as HTMLElement | undefined
    btn?.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' })
  }, [idxAtivo])

  const h = holerites[idxAtivo] ?? null

  const bruto     = h?.bruto    ?? 0
  const descontos = h ? ((h.inss??0)+(h.irrf??0)+(h.desconto_vt??0)+(h.desconto_adiant??0)+(h.cesta_basica??0)) || (h.descontos??0) : 0
  const liquido   = h?.liquido  ?? Math.max(0, bruto - descontos)

  return (
    <div style={{ minHeight:'100vh', background:'#f3f4f6', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ background:'#1a56a0' }}>
        <div style={{ maxWidth:500, margin:'0 auto', padding:'0 16px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', height:54 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <Receipt size={20} color="#fff"/>
              <span style={{ color:'#fff', fontWeight:700, fontSize:16 }}>Contracheque</span>
            </div>
            <button onClick={onSair}
              style={{ background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)', borderRadius:7, padding:'5px 11px', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontSize:12 }}>
              <LogOut size={13}/> Sair
            </button>
          </div>

          {/* Órgão / Matrícula */}
          <div style={{ background:'rgba(255,255,255,.12)', borderRadius:8, padding:'7px 12px', marginBottom:8 }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.65)', marginBottom:1 }}>Empresa · Matrícula</div>
            <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>
              {empresa?.nome ?? '—'} · {colab?.chapa ?? '—'}
            </div>
          </div>
          {/* Cargo */}
          <div style={{ background:'rgba(255,255,255,.12)', borderRadius:8, padding:'7px 12px', marginBottom:14 }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.65)', marginBottom:1 }}>Cargo / Função</div>
            <div style={{ fontSize:13, fontWeight:600, color:'#fff' }}>
              {colab?.funcao ?? '—'}
            </div>
          </div>

          {/* Carrossel de meses */}
          <div style={{ overflowX:'auto', paddingBottom:4, scrollbarWidth:'none' }} ref={carrosselRef}>
            <div style={{ display:'flex', gap:4, paddingBottom:2, minWidth:'max-content' }}>
              {holerites.map((hl, i) => {
                const ativo = i === idxAtivo
                return (
                  <button key={hl.id} data-idx={i} onClick={() => setIdxAtivo(i)}
                    style={{
                      padding:'5px 13px', borderRadius:20, fontSize:12, fontWeight:700, whiteSpace:'nowrap',
                      background: ativo ? '#fff' : 'rgba(255,255,255,.18)',
                      color: ativo ? '#1a56a0' : 'rgba(255,255,255,.85)',
                      border: ativo ? '2px solid #fff' : '2px solid transparent',
                      cursor:'pointer', transition:'all .15s',
                    }}>
                    {fmtCompAbr(hl.competencia)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Dots indicadores */}
          <div style={{ display:'flex', justifyContent:'center', gap:5, padding:'8px 0 12px' }}>
            {holerites.slice(0, 6).map((_, i) => (
              <span key={i} style={{ width:6, height:6, borderRadius:'50%', background: i===idxAtivo ? '#fff' : 'rgba(255,255,255,.4)', cursor:'pointer', transition:'all .2s' }}
                onClick={() => setIdxAtivo(i)}/>
            ))}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div style={{ maxWidth:500, margin:'0 auto', width:'100%', padding:'16px 16px 32px' }}>
        {!h ? (
          <div style={{ background:'#fff', borderRadius:14, padding:'36px 24px', textAlign:'center', border:'1px solid #e5e7eb' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <Receipt size={32} strokeWidth={1} color="#9ca3af"/>
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:'#374151', marginBottom:8 }}>Nenhum contracheque disponível</div>
            <div style={{ fontSize:13, color:'#6b7280', lineHeight:1.7, maxWidth:320, margin:'0 auto' }}>
              Seus contracheques serão exibidos aqui assim que o RH publicar os holerites do mês.
            </div>
            <div style={{ marginTop:20, padding:'12px 16px', background:'#eff6ff', borderRadius:10, border:'1px solid #bfdbfe', fontSize:12, color:'#1d4ed8', display:'inline-block', textAlign:'left' }}>
              <strong>Dúvidas?</strong> Entre em contato com o departamento de RH da empresa.
            </div>
          </div>
        ) : (
          <>
            {/* Card Bruto / Descontos / Líquido */}
            <div style={{ background:'#fff', borderRadius:14, padding:'14px 14px 10px', border:'1px solid #e5e7eb', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#111827', marginBottom:10 }}>
                {fmtComp(h.competencia)}
                <span style={{ fontSize:11, background:'#eff6ff', color:'#1d4ed8', padding:'2px 8px', borderRadius:10, marginLeft:8, fontWeight:600 }}>
                  {TIPO_LABEL[h.tipo] ?? h.tipo}
                </span>
              </div>
              <CardResumo bruto={bruto} descontos={descontos} liquido={liquido}/>
            </div>

            {/* Navegação prev/next */}
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
              <button onClick={() => setIdxAtivo(i => Math.min(holerites.length-1, i+1))} disabled={idxAtivo >= holerites.length-1}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', cursor:idxAtivo>=holerites.length-1?'not-allowed':'pointer', fontSize:13, color:idxAtivo>=holerites.length-1?'#d1d5db':'#374151', fontWeight:600 }}>
                <ChevronLeft size={15}/> Anterior
              </button>
              <button onClick={() => onSelecionar(h)}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 18px', borderRadius:8, border:'none', background:'#1a56a0', cursor:'pointer', fontSize:13, color:'#fff', fontWeight:700 }}>
                Ver Detalhes <ChevronRight size={15}/>
              </button>
              <button onClick={() => setIdxAtivo(i => Math.max(0, i-1))} disabled={idxAtivo <= 0}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', cursor:idxAtivo<=0?'not-allowed':'pointer', fontSize:13, color:idxAtivo<=0?'#d1d5db':'#374151', fontWeight:600 }}>
                Próximo <ChevronRight size={15}/>
              </button>
            </div>

            {/* Preview rápido das seções */}
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e5e7eb', overflow:'hidden' }}>
              {/* Rendimentos preview */}
              <button onClick={() => onSelecionar(h)}
                style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:'none', border:'none', cursor:'pointer', borderBottom:'1px solid #e5e7eb' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Plus size={11} color="#16a34a" strokeWidth={3}/>
                  </span>
                  <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Rendimentos</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'#16a34a' }}>{fmtR(bruto)}</span>
                  <ChevronDown size={16} color="#9ca3af"/>
                </div>
              </button>

              {/* Descontos preview */}
              <button onClick={() => onSelecionar(h)}
                style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:'none', border:'none', cursor:'pointer', borderBottom:'1px solid #e5e7eb' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Minus size={11} color="#dc2626" strokeWidth={3}/>
                  </span>
                  <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Descontos</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'#dc2626' }}>- {fmtR(descontos)}</span>
                  <ChevronDown size={16} color="#9ca3af"/>
                </div>
              </button>

              {/* Informações Adicionais preview */}
              <button onClick={() => onSelecionar(h)}
                style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:'none', border:'none', cursor:'pointer' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <Info size={11} color="#6b7280"/>
                  </span>
                  <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Informações Adicionais</span>
                </div>
                <ChevronDown size={16} color="#9ca3af"/>
              </button>
            </div>

            {/* Histórico abaixo */}
            {holerites.length > 1 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>
                  Histórico de Contracheques
                </div>
                <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden' }}>
                  {holerites.map((hl, i) => {
                    const brutoHl    = hl.bruto ?? 0
                    const descHl     = ((hl.inss??0)+(hl.irrf??0)+(hl.desconto_vt??0)+(hl.desconto_adiant??0)+(hl.cesta_basica??0)) || (hl.descontos??0)
                    const liquidoHl  = hl.liquido ?? Math.max(0, brutoHl - descHl)
                    return (
                      <button key={hl.id} onClick={() => { setIdxAtivo(i); onSelecionar(hl) }}
                        style={{
                          width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                          padding:'11px 16px', background: i===idxAtivo?'#eff6ff':'transparent',
                          borderLeft: i===idxAtivo ? '3px solid #1a56a0' : '3px solid transparent',
                          border:'none', borderBottom:'1px solid #f3f4f6', cursor:'pointer',
                        }}>
                        <div style={{ textAlign:'left' }}>
                          <div style={{ fontSize:13, fontWeight:700, color: i===idxAtivo?'#1a56a0':'#111827' }}>{fmtComp(hl.competencia)}</div>
                          <div style={{ fontSize:11, color:'#9ca3af' }}>{TIPO_LABEL[hl.tipo] ?? hl.tipo}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#1d4ed8' }}>{fmtR(liquidoHl)}</div>
                          <div style={{ fontSize:10, color:'#9ca3af' }}>Líquido</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function PortalContracheque() {
  const [sessao, setSessao]         = useState<Sessao | null>(() => {
    try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null }
    catch { return null }
  })
  const [holerites, setHolerites]   = useState<Contracheque[]>([])
  const [colab, setColab]           = useState<ColabInfo | null>(null)
  const [empresa, setEmpresa]       = useState<EmpresaInfo | null>(null)
  const [loading, setLoading]       = useState(false)
  const [selecionado, setSelecionado] = useState<Contracheque | null>(null)

  const carregar = useCallback(async (colaboradorId: string) => {
    setLoading(true)
    try {
      const [holRes, colRes, empRes] = await Promise.all([
        supabase.from('contracheques')
          .select('*')
          .eq('colaborador_id', colaboradorId)
          .eq('publicado', true)
          .order('competencia', { ascending: false }),
        supabase.from('colaboradores')
          .select('nome,chapa,cpf,funcao_id,tipo_contrato,data_admissao,salario_base,funcoes(nome)')
          .eq('id', colaboradorId).single(),
        supabase.from('configuracoes')
          .select('chave,valor')
          .in('chave', ['empresa_nome','empresa_cnpj','empresa_endereco','empresa_cidade','empresa_telefone','empresa_logo_url']),
      ])
      setHolerites((holRes.data as Contracheque[]) ?? [])
      // Normalizar: mapear funcoes(nome) → funcao e manter salario_base
      const rawColab = colRes.data as any
      if (rawColab) {
        rawColab.funcao = rawColab.funcoes?.nome ?? null
        delete rawColab.funcoes
        delete rawColab.funcao_id
      }
      setColab((rawColab as ColabInfo) ?? null)
      const map: Record<string,string> = {}
      ;(empRes.data ?? []).forEach((r: any) => { map[r.chave] = r.valor })
      setEmpresa({
        nome: map['empresa_nome'] ?? '',
        cnpj: map['empresa_cnpj'] ?? '',
        cidade: map['empresa_cidade'] ?? '',
        logo_url: map['empresa_logo_url'] ?? '',
      })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (sessao) carregar(sessao.colaborador_id) }, [sessao, carregar])

  function sair() {
    localStorage.removeItem(SESSION_KEY)
    setSessao(null); setHolerites([]); setSelecionado(null)
  }

  if (!sessao) return <TelaLogin onLogin={setSessao} />

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a56a0,#0d3f56)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <Loader2 size={40} className="animate-spin" color="#fff"/>
      <span style={{ color:'rgba(255,255,255,.8)', fontSize:14 }}>Carregando contracheques…</span>
    </div>
  )

  if (selecionado) return (
    <TelaHolerite
      h={selecionado}
      colab={colab}
      empresa={empresa}
      onVoltar={() => setSelecionado(null)}
    />
  )

  return (
    <TelaLista
      sessao={sessao}
      holerites={holerites}
      colab={colab}
      empresa={empresa}
      onSelecionar={setSelecionado}
      onSair={sair}
    />
  )
}
