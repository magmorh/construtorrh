import { useState, useEffect, useCallback } from 'react'
import { Loader2, CalendarDays, Download, Eye } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function fmtR(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
function fmtData(d: string | null) {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}
function fmtDiaSemana(d: string): string {
  const data = new Date(d + 'T12:00:00')
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  return dias[data.getDay()]
}
function abrirHtmlComoPdf(html: string, titulo: string): void {
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document || iframe.contentDocument
  if (!doc) return
  (doc as any).open()
  (doc as any).write(html)
  (doc as any).close()
  setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    setTimeout(() => document.body.removeChild(iframe), 1000)
  }, 500)
}


interface Sessao { colaborador_id: string; nome: string; chapa?: string }
interface Lancamento { id: string; mes_referencia: string; data_inicio: string; data_fim: string; status: string; snap_horas_normais?: number; snap_horas_extras?: number; snap_valor_producao?: number; snap_liquido?: number }

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function fmtComp(m: string) {
  const [y, mo] = m.split('-')
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${nomes[parseInt(mo)-1]} ${y}`
}
function fmtHora(h?: string | null) { return h ? h.slice(0,5) : '—' }

export default function AbaFolhaPontoNova({
  sessao, dataAdmissao, lancamentos
}: {
  sessao: Sessao
  dataAdmissao: string | null
  lancamentos: Lancamento[]
}) {
  const [mesSel, setMesSel]     = useState(mesAtual)
  const [registros, setRegistros] = useState<any[]>([])
  const [producoes, setProducoes] = useState<any[]>([])
  const [loading, setLoading]   = useState(false)
  const [erro, setErro]         = useState<string|null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Montar opções de mês a partir da admissão
  const opcoesMes = useCallback((): {val:string; label:string}[] => {
    const opts: {val:string; label:string}[] = []
    const inicio = dataAdmissao ? new Date(dataAdmissao) : new Date()
    const fim = new Date()
    let cur = new Date(inicio.getFullYear(), inicio.getMonth(), 1)
    while (cur <= fim) {
      const v = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`
      opts.push({ val: v, label: fmtComp(v) })
      cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1)
    }
    return opts.reverse()
  }, [dataAdmissao])

  const carregar = useCallback(async (mes: string) => {
    setLoading(true)
    setErro(null)
    try {
      // 1. Buscar lançamento fechado para pegar data_inicio/data_fim reais
      const { data: lancsRef, error: eLanc } = await supabase
        .from('ponto_lancamentos')
        .select('id,data_inicio,data_fim')
        .eq('colaborador_id', sessao.colaborador_id)
        .eq('mes_referencia', mes)
        .in('status', ['pago','liberado','aprovado'])
        .order('data_inicio', { ascending: true })
        .limit(1)

      if (eLanc) console.warn('ponto_lancamentos error:', eLanc)

      const lancId = lancsRef?.[0]?.id ?? null
      const inicio = lancsRef?.[0]?.data_inicio ?? mes + '-01'
      const fim    = lancsRef?.[0]?.data_fim    ?? mes + '-31'

      // 2. Buscar registros de ponto em paralelo (portal_ponto_diario e registro_ponto)
      const [r1, r2, rp] = await Promise.all([
        supabase
          .from('portal_ponto_diario')
          .select('id,data,hora_entrada,hora_saida,horas_trabalhadas,horas_extra,horas_falta,status,observacoes')
          .eq('colaborador_id', sessao.colaborador_id)
          .gte('data', inicio).lte('data', fim)
          .order('data', { ascending: true }),
        lancId
          ? supabase
              .from('registro_ponto')
              .select('id,data,hora_entrada,hora_saida,horas_trabalhadas,horas_extras,horas_falta,status,observacoes')
              .eq('lancamento_id', lancId)
              .order('data', { ascending: true })
          : supabase
              .from('registro_ponto')
              .select('id,data,hora_entrada,hora_saida,horas_trabalhadas,horas_extras,horas_falta,status,observacoes')
              .eq('colaborador_id', sessao.colaborador_id)
              .gte('data', inicio).lte('data', fim)
              .order('data', { ascending: true }),
        supabase
          .from('ponto_producao')
          .select('id,data,quantidade,valor_total,observacoes,playbook_itens(descricao,unidade)')
          .eq('colaborador_id', sessao.colaborador_id)
          .gte('data', inicio).lte('data', fim)
          .order('data', { ascending: true }),
      ])

      // Normalizar r2 (registro_ponto usa horas_extras em vez de horas_extra)
      const norm2 = (r2.data ?? []).map((r:any) => ({
        ...r,
        horas_extra: r.horas_extras ?? r.horas_extra ?? 0,
        status: r.status ?? (r.hora_entrada ? 'presente' : null),
      }))

      // Preferir portal_ponto_diario; fallback para registro_ponto
      const lista = (r1.data ?? []).length > 0 ? (r1.data ?? []) : norm2
      setRegistros(lista)
      setProducoes(rp.data ?? [])
    } catch (e: any) {
      setErro(e?.message ?? 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }, [sessao.colaborador_id])

  useEffect(() => { carregar(mesSel) }, [mesSel, carregar])

  // Totalizadores
  const totalHoras    = registros.reduce((s:number, r:any) => s + (Number(r.horas_trabalhadas)||0), 0)
  const totalExtras   = registros.reduce((s:number, r:any) => s + (Number(r.horas_extra)||0), 0)
  const totalFaltas   = registros.filter((r:any) => ['falta','falta_justificada'].includes((r.status??'').toLowerCase())).length
  const totalPresentes = registros.filter((r:any) => !['falta','falta_justificada'].includes((r.status??'').toLowerCase()) && (r.hora_entrada || r.status)).length

  // Lançamentos do mês selecionado (para fallback resumo)
  const lancsMes = lancamentos.filter(l => l.mes_referencia === mesSel)

  function badgeStatus(status: string | null) {
    const s = (status ?? '').toLowerCase()
    if (s === 'falta')             return { label:'Falta',     bg:'#fee2e2', cor:'#dc2626' }
    if (s === 'falta_justificada') return { label:'Falta Just.',bg:'#fef3c7', cor:'#92400e' }
    if (s === 'folga')             return { label:'Folga',      bg:'#dbeafe', cor:'#1d4ed8' }
    if (s === 'meio_periodo')      return { label:'Meio Per.',  bg:'#fef3c7', cor:'#d97706' }
    return { label:'Presente', bg:'#dcfce7', cor:'#16a34a' }
  }


  function gerarPdfPonto() {
    const mesLabel = fmtComp(mesSel)
    const fh = (hh: string|null) => hh ? hh.slice(0,5) : '—'
    const temRegistros = registros.length > 0
    const tbodyRows = temRegistros ? registros.map((reg, i) => {
      const statusPdf = reg.status ?? (reg.hora_entrada ? 'presente' : null)
      const isFalta = ['falta','falta_justificada'].includes((statusPdf??'').toLowerCase())
      const cor = isFalta ? '#fee2e2' : (i%2===0 ? '#fff' : '#f8fafc')
      const statusLabel = isFalta ? 'FALTA' : (reg.status ?? (reg.hora_entrada ? 'Presente' : '—'))
      const statusCor = isFalta ? '#dc2626' : '#374151'
      const [y,m,d]=reg.data.split('-')
      return `<tr style="background:${cor}">
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px">${d}/${m}/${y}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#16a34a;font-weight:600">${fh(reg.hora_entrada)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#6b7280">${isFalta ? '—' : '12:00'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#6b7280">${isFalta ? '—' : '13:00'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#dc2626;font-weight:600">${fh(reg.hora_saida)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;font-weight:700;color:#1e3a5f">${reg.horas_trabalhadas ? Number(reg.horas_trabalhadas).toFixed(2)+'h' : '0,00h'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:${(Number(reg.horas_extra)||0)>0?'#92400e':'#6b7280'}">${reg.horas_extra ? Number(reg.horas_extra).toFixed(2)+'h' : '0,00h'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;font-weight:700;color:${statusCor}">${statusLabel}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">${reg.observacoes??'—'}</td>
      </tr>`
    }).join('') : ''
    
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
  <div style="background:#1e3a5f;padding:14px 16px;margin-bottom:12px;border-radius:6px">
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
      <div style="font-size:18px;font-weight:800;color:#16a34a">${totalPresentes}</div>
      <div style="font-size:10px;color:#16a34a;font-weight:600">Presenças</div>
    </div>
    <div style="background:#fee2e2;border-radius:6px;padding:8px 12px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#dc2626">${totalFaltas}</div>
      <div style="font-size:10px;color:#dc2626;font-weight:600">Faltas</div>
    </div>
    <div style="background:#dbeafe;border-radius:6px;padding:8px 12px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#1d4ed8">${totalHoras.toFixed(0)}h</div>
      <div style="font-size:10px;color:#1d4ed8;font-weight:600">H. Trabalhadas</div>
    </div>
    <div style="background:#fef9c3;border-radius:6px;padding:8px 12px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#92400e">${totalExtras.toFixed(0)}h</div>
      <div style="font-size:10px;color:#92400e;font-weight:600">H. Extras</div>
    </div>
  </div>
  ${temRegistros ? `
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
    <thead>
      <tr style="background:#1e3a5f">
        ${['Data','Entrada','Saída Alm.','Retorno','Saída','Hs Trab.','Hs Extra','Status','Justificativa'].map(hh=>
          `<th style="padding:8px 8px;color:#fff;font-size:10px;text-align:center;font-weight:700;white-space:nowrap">${hh}</th>`
        ).join('')}
      </tr>
    </thead>
    <tbody>${tbodyRows}</tbody>
    <tfoot>
      <tr style="background:#1e3a5f">
        <td colspan="5" style="padding:8px 8px;color:#fff;font-size:11px;font-weight:700">TOTAIS — ${totalPresentes} dias</td>
        <td style="padding:8px 8px;color:#fff;font-size:11px;font-weight:700;text-align:center">${totalHoras.toFixed(2)}h</td>
        <td style="padding:8px 8px;color:#fbbf24;font-size:11px;font-weight:700;text-align:center">${totalExtras.toFixed(2)}h</td>
        <td style="padding:8px 8px;color:#fca5a5;font-size:11px;font-weight:700;text-align:center">${totalFaltas} falta(s)</td>
        <td></td>
      </tr>
    </tfoot>
  </table>` : `
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-bottom:14px;text-align:center">
    Nenhum registro diário disponível para este período.
  </div>`}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:30px;padding-top:12px">
    <div style="border-top:1.5px solid #1e3a5f;padding-top:6px">
      <div style="font-size:11px;color:#374151;font-weight:600">${sessao.nome.toUpperCase()}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px">Colaborador(a) — Assinatura</div>
    </div>
    <div style="border-top:1.5px solid #1e3a5f;padding-top:6px">
      <div style="font-size:11px;color:#374151;font-weight:600">___________________________</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px">Responsável RH / Carimbo</div>
    </div>
  </div>
<script>window.onload=()=>{ window.print() }</script>
</body></html>`
    abrirHtmlComoPdf(html, `Folha de Ponto — ${sessao.nome} — ${mesLabel}`)
  }

  return (
    <div style={{ paddingBottom: 100, background: '#f8fafc', minHeight: '100vh' }}>

      {/* ── Seletor de mês ── */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'12px 16px' }}>
        <label style={{ fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 }}>
          Competência
        </label>
        <select
          value={mesSel}
          onChange={e => setMesSel(e.target.value)}
          style={{ width:'100%', height:42, borderRadius:10, border:'1.5px solid #d1d5db', padding:'0 12px', fontSize:14, fontWeight:600, color:'#1e3a5f', background:'#fff', outline:'none' }}
        >
          {opcoesMes().map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Cards resumo ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, padding:'10px 12px 0' }}>
        {[
          { label:'Presenças', val:totalPresentes, cor:'#16a34a', bg:'#dcfce7' },
          { label:'Faltas',    val:totalFaltas,    cor:'#dc2626', bg:'#fee2e2' },
          { label:'H.Trab.',   val:`${totalHoras.toFixed(0)}h`, cor:'#1d4ed8', bg:'#dbeafe' },
          { label:'H.Extra',   val:`${totalExtras.toFixed(0)}h`, cor:'#92400e', bg:'#fef9c3' },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, borderRadius:10, padding:'8px 4px', textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:17, color:s.cor }}>{s.val}</div>
            <div style={{ fontSize:9, color:s.cor, fontWeight:600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Conteúdo principal ── */}
      <div style={{ padding:'10px 12px 0' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'60px 0', gap:10 }}>
            <Loader2 size={22} className="animate-spin" color="#1e3a5f" />
            <span style={{ fontSize:13, color:'#6b7280' }}>Carregando…</span>
          </div>

        ) : erro ? (
          <div style={{ background:'#fee2e2', borderRadius:10, padding:'16px', textAlign:'center', fontSize:13, color:'#dc2626' }}>
            ⚠️ {erro}
            <br/>
            <button onClick={() => carregar(mesSel)} style={{ marginTop:8, padding:'4px 14px', borderRadius:7, border:'none', background:'#dc2626', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              Tentar novamente
            </button>
          </div>

        ) : registros.length === 0 ? (
          /* ── Estado vazio: mostra resumo do lançamento ── */
          <div style={{ background:'#fff', borderRadius:12, padding:'20px 14px', border:'1px solid #e5e7eb', textAlign:'center' }}>
            <CalendarDays size={36} color="#9ca3af" strokeWidth={1.5} style={{ margin:'0 auto 10px' }} />
            <div style={{ fontSize:14, fontWeight:700, color:'#374151', marginBottom:4 }}>
              Registros diários não disponíveis
            </div>
            <div style={{ fontSize:12, color:'#6b7280', marginBottom: lancsMes.length > 0 ? 14 : 0 }}>
              Nenhum registro lançado para <strong>{fmtComp(mesSel)}</strong>
            </div>
            {lancsMes.length > 0 && (
              <div style={{ background:'#eff6ff', borderRadius:10, padding:'12px', border:'1px solid #bfdbfe', textAlign:'left' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#1d4ed8', marginBottom:8, textTransform:'uppercase' }}>
                  📊 Resumo do Fechamento
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
                  {[
                    { l:'Horas Normais', v:`${lancsMes.reduce((s,l)=>s+(l.snap_horas_normais??0),0).toFixed(1)}h`, c:'#1d4ed8' },
                    { l:'Horas Extras',  v:`${lancsMes.reduce((s,l)=>s+(l.snap_horas_extras??0),0).toFixed(1)}h`,  c:'#92400e' },
                    { l:'Produção',      v:`R$ ${lancsMes.reduce((s,l)=>s+(l.snap_valor_producao??0),0).toFixed(2)}`, c:'#7c3aed' },
                    { l:'Líquido',       v:`R$ ${lancsMes.reduce((s,l)=>s+(l.snap_liquido??0),0).toFixed(2)}`,       c:'#15803d' },
                  ].map(x => (
                    <div key={x.l} style={{ background:'#fff', borderRadius:7, padding:'7px 9px' }}>
                      <div style={{ fontSize:9, color:'#6b7280', fontWeight:600 }}>{x.l}</div>
                      <div style={{ fontSize:14, fontWeight:800, color:x.c }}>{x.v}</div>
                    </div>
                  ))}
                </div>
                {lancsMes.map((l,i) => (
                  <div key={l.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fff', borderRadius:7, padding:'6px 9px', border:'1px solid #dbeafe', fontSize:11, marginBottom:4 }}>
                    <span style={{ color:'#374151', fontWeight:600 }}>Período {i+1}: {l.data_inicio?.slice(8)}/{l.data_inicio?.slice(5,7)} → {l.data_fim?.slice(8)}/{l.data_fim?.slice(5,7)}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6, background:l.status==='pago'?'#dcfce7':'#dbeafe', color:l.status==='pago'?'#15803d':'#1d4ed8' }}>{l.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : (
          /* ── TABELA DE REGISTROS ── */
          <>
            <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', border:'1px solid #e2e8f0', boxShadow:'0 1px 6px rgba(0,0,0,.06)', marginBottom:12 }}>

              {/* Contagem */}
              <div style={{ padding:'7px 12px', fontSize:11, color:'#6b7280', fontWeight:600, borderBottom:'1px solid #f1f5f9' }}>
                {registros.length} registro(s) · {fmtComp(mesSel)}
              </div>

              {/* Header da tabela */}
              <div style={{ display:'grid', gridTemplateColumns:'90px 52px 58px 54px 52px 54px 54px 1fr', background:'#1e3a5f', padding:'8px 8px' }}>
                {['DATA','ENTRADA','S.ALMOÇO','RETORNO','SAÍDA','H.TRAB','H.EXTRA','STATUS'].map(h => (
                  <div key={h} style={{ fontSize:8, fontWeight:700, color:'#fff', textAlign:'center', letterSpacing:'.05em' }}>{h}</div>
                ))}
              </div>

              {/* Linhas */}
              {registros.map((reg:any, i:number) => {
                const statusEf = reg.status ?? (reg.hora_entrada ? 'presente' : null)
                const badge    = badgeStatus(statusEf)
                const isFalta  = ['falta','falta_justificada'].includes((statusEf??'').toLowerCase())
                const htrab    = Number(reg.horas_trabalhadas) || 0
                const hext     = Number(reg.horas_extra) || 0
                const [yy,mm,dd] = (reg.data??'').split('-')
              
  function gerarPdfPonto() {
    const mesLabel = fmtComp(mesSel)
    const fh = (hh: string|null) => hh ? hh.slice(0,5) : '—'
    const temRegistros = registros.length > 0
    const tbodyRows = temRegistros ? registros.map((reg, i) => {
      const statusPdf = reg.status ?? (reg.hora_entrada ? 'presente' : null)
      const isFalta = ['falta','falta_justificada'].includes((statusPdf??'').toLowerCase())
      const cor = isFalta ? '#fee2e2' : (i%2===0 ? '#fff' : '#f8fafc')
      const statusLabel = isFalta ? 'FALTA' : (reg.status ?? (reg.hora_entrada ? 'Presente' : '—'))
      const statusCor = isFalta ? '#dc2626' : '#374151'
      const [y,m,d]=reg.data.split('-')
      return `<tr style="background:${cor}">
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px">${d}/${m}/${y}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#16a34a;font-weight:600">${fh(reg.hora_entrada)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#6b7280">${isFalta ? '—' : '12:00'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#6b7280">${isFalta ? '—' : '13:00'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#dc2626;font-weight:600">${fh(reg.hora_saida)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;font-weight:700;color:#1e3a5f">${reg.horas_trabalhadas ? Number(reg.horas_trabalhadas).toFixed(2)+'h' : '0,00h'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:${(Number(reg.horas_extra)||0)>0?'#92400e':'#6b7280'}">${reg.horas_extra ? Number(reg.horas_extra).toFixed(2)+'h' : '0,00h'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;font-weight:700;color:${statusCor}">${statusLabel}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">${reg.observacoes??'—'}</td>
      </tr>`
    }).join('') : ''
    
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
  <div style="background:#1e3a5f;padding:14px 16px;margin-bottom:12px;border-radius:6px">
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
      <div style="font-size:18px;font-weight:800;color:#16a34a">${totalPresentes}</div>
      <div style="font-size:10px;color:#16a34a;font-weight:600">Presenças</div>
    </div>
    <div style="background:#fee2e2;border-radius:6px;padding:8px 12px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#dc2626">${totalFaltas}</div>
      <div style="font-size:10px;color:#dc2626;font-weight:600">Faltas</div>
    </div>
    <div style="background:#dbeafe;border-radius:6px;padding:8px 12px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#1d4ed8">${totalHoras.toFixed(0)}h</div>
      <div style="font-size:10px;color:#1d4ed8;font-weight:600">H. Trabalhadas</div>
    </div>
    <div style="background:#fef9c3;border-radius:6px;padding:8px 12px;text-align:center">
      <div style="font-size:18px;font-weight:800;color:#92400e">${totalExtras.toFixed(0)}h</div>
      <div style="font-size:10px;color:#92400e;font-weight:600">H. Extras</div>
    </div>
  </div>
  ${temRegistros ? `
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
    <thead>
      <tr style="background:#1e3a5f">
        ${['Data','Entrada','Saída Alm.','Retorno','Saída','Hs Trab.','Hs Extra','Status','Justificativa'].map(hh=>
          `<th style="padding:8px 8px;color:#fff;font-size:10px;text-align:center;font-weight:700;white-space:nowrap">${hh}</th>`
        ).join('')}
      </tr>
    </thead>
    <tbody>${tbodyRows}</tbody>
    <tfoot>
      <tr style="background:#1e3a5f">
        <td colspan="5" style="padding:8px 8px;color:#fff;font-size:11px;font-weight:700">TOTAIS — ${totalPresentes} dias</td>
        <td style="padding:8px 8px;color:#fff;font-size:11px;font-weight:700;text-align:center">${totalHoras.toFixed(2)}h</td>
        <td style="padding:8px 8px;color:#fbbf24;font-size:11px;font-weight:700;text-align:center">${totalExtras.toFixed(2)}h</td>
        <td style="padding:8px 8px;color:#fca5a5;font-size:11px;font-weight:700;text-align:center">${totalFaltas} falta(s)</td>
        <td></td>
      </tr>
    </tfoot>
  </table>` : `
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-bottom:14px;text-align:center">
    Nenhum registro diário disponível para este período.
  </div>`}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:30px;padding-top:12px">
    <div style="border-top:1.5px solid #1e3a5f;padding-top:6px">
      <div style="font-size:11px;color:#374151;font-weight:600">${sessao.nome.toUpperCase()}</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px">Colaborador(a) — Assinatura</div>
    </div>
    <div style="border-top:1.5px solid #1e3a5f;padding-top:6px">
      <div style="font-size:11px;color:#374151;font-weight:600">___________________________</div>
      <div style="font-size:10px;color:#6b7280;margin-top:2px">Responsável RH / Carimbo</div>
    </div>
  </div>
<script>window.onload=()=>{ window.print() }</script>
</body></html>`
    abrirHtmlComoPdf(html, `Folha de Ponto — ${sessao.nome} — ${mesLabel}`)
  }

  return (
                  <div
                    key={reg.id ?? i}
                    style={{ display:'grid', gridTemplateColumns:'90px 52px 58px 54px 52px 54px 54px 1fr', padding:'7px 8px', borderBottom:'1px solid #f1f5f9', background: isFalta ? '#fff5f5' : i%2===0 ? '#fff' : '#f9fafb', alignItems:'center' }}
                  >
                    <div style={{ fontSize:11, fontWeight:700, color:'#1e293b' }}>{dd}/{mm}/{yy}</div>
                    <div style={{ fontSize:11, color: reg.hora_entrada ? '#16a34a' : '#9ca3af', textAlign:'center', fontWeight:600 }}>{fmtHora(reg.hora_entrada)}</div>
                    <div style={{ fontSize:11, color:'#6b7280', textAlign:'center' }}>12:00</div>
                    <div style={{ fontSize:11, color:'#6b7280', textAlign:'center' }}>13:00</div>
                    <div style={{ fontSize:11, color: reg.hora_saida ? '#dc2626' : '#9ca3af', textAlign:'center', fontWeight:600 }}>{fmtHora(reg.hora_saida)}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:'#1e3a5f', textAlign:'center' }}>{htrab > 0 ? htrab.toFixed(2)+'h' : '—'}</div>
                    <div style={{ fontSize:11, fontWeight:700, color: hext > 0 ? '#d97706' : '#9ca3af', textAlign:'center' }}>{hext.toFixed(2)}h</div>
                    <div style={{ textAlign:'center' }}>
                      <span style={{ fontSize:9, fontWeight:700, background:badge.bg, color:badge.cor, borderRadius:20, padding:'2px 8px', whiteSpace:'nowrap' }}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                )
              })}

              {/* Rodapé TOTAIS */}
              <div style={{ display:'grid', gridTemplateColumns:'90px 52px 58px 54px 52px 54px 54px 1fr', padding:'8px 8px', background:'#1e3a5f', alignItems:'center' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'#fff' }}>TOTAIS</div>
                <div/><div/><div/><div/>
                <div style={{ fontSize:11, fontWeight:800, color:'#fff', textAlign:'center' }}>{totalHoras.toFixed(2)}h</div>
                <div style={{ fontSize:11, fontWeight:800, color:'#fbbf24', textAlign:'center' }}>{totalExtras.toFixed(2)}h</div>
                <div style={{ fontSize:10, fontWeight:700, color:'#fca5a5', textAlign:'center' }}>{totalFaltas} falta{totalFaltas!==1?'s':''}</div>
              </div>
            </div>

            {/* Produções */}
            {producoes.length > 0 && (
              <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', border:'1px solid #e2e8f0', boxShadow:'0 1px 6px rgba(0,0,0,.06)', marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', borderBottom:'1px solid #f1f5f9' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'#7c3aed' }}>⚡ Produções ({producoes.length})</span>
                  <span style={{ fontSize:12, fontWeight:800, color:'#7c3aed' }}>
                    R$ {producoes.reduce((s:number,r:any)=>s+Number(r.valor_total||0),0).toFixed(2)}
                  </span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 90px', padding:'7px 10px', background:'#1e3a5f' }}>
                  {['SERVIÇO','QTD','TOTAL'].map(h => (
                    <div key={h} style={{ fontSize:9, fontWeight:700, color:'#fff', letterSpacing:'.05em' }}>{h}</div>
                  ))}
                </div>
                {producoes.map((r:any, i:number) => (
                  <div key={r.id??i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 90px', padding:'8px 10px', borderBottom:'1px solid #f1f5f9', background:i%2===0?'#fff':'#faf5ff', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:'#111' }}>{r.playbook_itens?.descricao ?? 'Serviço'}</div>
                      <div style={{ fontSize:10, color:'#9ca3af' }}>{r.data?.slice(8)}/{r.data?.slice(5,7)}</div>
                    </div>
                    <div style={{ fontSize:11, color:'#374151' }}>{r.quantidade} {r.playbook_itens?.unidade??''}</div>
                    <div style={{ fontSize:12, fontWeight:800, color:'#7c3aed' }}>R$ {Number(r.valor_total||0).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Botão gerar PDF ── */}
      {!loading && (
        <div style={{ padding:'0 12px', marginTop:8, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <button
            onClick={() => setShowPreview(true)}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'12px', borderRadius:10, border:'1.5px solid #1e3a5f', background:'#fff', color:'#1e3a5f', fontSize:13, fontWeight:700, cursor:'pointer' }}
          >
            <Eye size={15} />
            Visualizar
          </button>
          <button
            onClick={gerarPdfPonto}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:7, padding:'12px', borderRadius:10, border:'none', background:'#1e3a5f', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}
          >
            <Download size={15} />
            Baixar PDF
          </button>
        </div>
      )}
    </div>

      {/* ── Modal de Preview ── */}
      {showPreview && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:100, display:'flex', flexDirection:'column' }}>
          <div style={{ background:'#fff', padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #e5e7eb' }}>
            <span style={{ fontWeight:800, color:'#1e3a5f' }}>Visualizar Folha</span>
            <button onClick={() => setShowPreview(false)} style={{ background:'#f3f4f6', border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700 }}>Fechar</button>
          </div>
          <div style={{ flex:1, overflow:'auto', padding:10, background:'#94a3b8' }}>
            <div style={{ background:'#fff', width:'100%', maxWidth:800, margin:'0 auto', padding:'20px', borderRadius:4, boxShadow:'0 10px 25px rgba(0,0,0,.2)', minHeight:'100%' }}>
               {/* Usando o mesmo layout do PDF aqui para o preview */}
               <div dangerouslySetInnerHTML={{ __html: `
                 <div style="font-family:sans-serif; color:#333;">
                   <div style="background:#1e3a5f; color:#fff; padding:15px; border-radius:6px; margin-bottom:15px;">
                     <div style="font-weight:bold; font-size:16px;">${sessao.nome.toUpperCase()}</div>
                     <div style="font-size:12px; margin-top:4px;">Folha de Ponto · ${fmtComp(mesSel)}</div>
                   </div>
                   <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:15px;">
                     <div style="background:#dcfce7; padding:10px; border-radius:6px; text-align:center;">
                       <div style="font-weight:bold; font-size:18px; color:#16a34a;">${totalPresentes}</div>
                       <div style="font-size:10px; color:#16a34a;">Presenças</div>
                     </div>
                     <div style="background:#fee2e2; padding:10px; border-radius:6px; text-align:center;">
                       <div style="font-weight:bold; font-size:18px; color:#dc2626;">${totalFaltas}</div>
                       <div style="font-size:10px; color:#dc2626;">Faltas</div>
                     </div>
                     <div style="background:#dbeafe; padding:10px; border-radius:6px; text-align:center;">
                       <div style="font-weight:bold; font-size:18px; color:#1d4ed8;">${totalHoras.toFixed(0)}h</div>
                       <div style="font-size:10px; color:#1d4ed8;">Trabalhadas</div>
                     </div>
                     <div style="background:#fef9c3; padding:10px; border-radius:6px; text-align:center;">
                       <div style="font-weight:bold; font-size:18px; color:#92400e;">${totalExtras.toFixed(0)}h</div>
                       <div style="font-size:10px; color:#92400e;">Extras</div>
                     </div>
                   </div>
                   <table style="width:100%; border-collapse:collapse; font-size:10px; border:1px solid #eee;">
                     <thead>
                       <tr style="background:#f8fafc;">
                         <th style="padding:6px; border:1px solid #eee; text-align:left;">Data</th>
                         <th style="padding:6px; border:1px solid #eee; text-align:center;">Entrada</th>
                         <th style="padding:6px; border:1px solid #eee; text-align:center;">Saída</th>
                         <th style="padding:6px; border:1px solid #eee; text-align:center;">Horas</th>
                         <th style="padding:6px; border:1px solid #eee; text-align:center;">Status</th>
                       </tr>
                     </thead>
                     <tbody>
                       ${registros.map(r => `
                         <tr>
                           <td style="padding:6px; border:1px solid #eee;">${fmtData(r.data)}</td>
                           <td style="padding:6px; border:1px solid #eee; text-align:center;">${fmtHora(r.hora_entrada)}</td>
                           <td style="padding:6px; border:1px solid #eee; text-align:center;">${fmtHora(r.hora_saida)}</td>
                           <td style="padding:6px; border:1px solid #eee; text-align:center; font-weight:bold;">${(r.horas_trabalhadas||0).toFixed(2)}h</td>
                           <td style="padding:6px; border:1px solid #eee; text-align:center;">${r.status||'Presente'}</td>
                         </tr>
                       `).join('')}
                     </tbody>
                   </table>
                 </div>
               ` }} />
            </div>
          </div>
          <div style={{ padding:'12px 16px', background:'#fff', borderTop:'1px solid #e5e7eb' }}>
            <button onClick={gerarPdfPonto} style={{ width:'100%', padding:'12px', borderRadius:10, border:'none', background:'#1e3a5f', color:'#fff', fontWeight:700 }}>Imprimir / Baixar PDF</button>
          </div>
        </div>
      )}

  )
}
