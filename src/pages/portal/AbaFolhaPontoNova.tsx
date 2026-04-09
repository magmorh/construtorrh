import { useState, useEffect, useCallback } from 'react'
import { Loader2, CalendarDays, Download, Eye } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Sessao { colaborador_id: string; nome: string; chapa?: string }
interface Lancamento { id: string; mes_referencia: string; data_inicio: string; data_fim: string; status: string; snap_horas_normais?: number; snap_horas_extras?: number; snap_valor_producao?: number; snap_liquido?: number }

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtR(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
function fmtData(d: string | null) {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}
function fmtComp(m: string) {
  const [y, mo] = m.split('-')
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${nomes[parseInt(mo)-1]} ${y}`
}
function fmtHora(h?: string | null) { return h ? h.slice(0,5) : '—' }

function abrirHtmlComoPdf(html: string, titulo: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) return;
  (doc as any).open();
  (doc as any).write(html);
  (doc as any).close();
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isiOS) {
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 1000);
  } else {
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    };
  }
}

// ── Componente Principal ─────────────────────────────────────────────────────
export default function AbaFolhaPontoNova({
  sessao, dataAdmissao, lancamentos
}: {
  sessao: Sessao
  dataAdmissao: string | null
  lancamentos: Lancamento[]
}) {
  const [mesSel, setMesSel]     = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [registros, setRegistros] = useState<any[]>([])
  const [producoes, setProducoes] = useState<any[]>([])
  const [loading, setLoading]   = useState(false)
  const [erro, setErro]         = useState<string|null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [periodoReal, setPeriodoReal] = useState<{inicio:string; fim:string} | null>(null)

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
      // Buscar lançamento do mês - sem filtro de status para garantir encontrar
      const { data: lancsRef, error: eLanc } = await supabase
        .from('ponto_lancamentos')
        .select('id,data_inicio,data_fim,status')
        .eq('colaborador_id', sessao.colaborador_id)
        .eq('mes_referencia', mes)
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (eLanc) console.warn('[AbaFolha] ponto_lancamentos error:', eLanc.message)
      console.log('[AbaFolha] mes:', mes, '| lançamento:', JSON.stringify(lancsRef?.[0] ?? null))

      const lancId = lancsRef?.[0]?.id ?? null
      const inicio = lancsRef?.[0]?.data_inicio ?? mes + '-01'
      const fim    = lancsRef?.[0]?.data_fim    ?? mes + '-31'
      console.log('[AbaFolha] periodo busca:', inicio, '->', fim)
      // Guardar período real para exibir ao usuário
      if (lancsRef?.[0]?.data_inicio && lancsRef?.[0]?.data_fim) {
        setPeriodoReal({ inicio: lancsRef[0].data_inicio, fim: lancsRef[0].data_fim })
      } else {
        setPeriodoReal(null)
      }

      const [r1, r2, rp] = await Promise.all([
        supabase
          .from('portal_ponto_diario')
          .select('id,data,hora_entrada,hora_saida,horas_trabalhadas,horas_extra,horas_falta,status,observacoes')
          .eq('colaborador_id', sessao.colaborador_id)
          .gte('data', inicio).lte('data', fim)
          .order('data', { ascending: true }),
        // Busca por colaborador_id + período (compatível com RLS anon do portal)
        supabase
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

      const norm2 = (r2.data ?? []).map((r:any) => ({
        ...r,
        horas_extra: r.horas_extras ?? r.horas_extra ?? 0,
        status: r.status ?? (r.hora_entrada ? 'presente' : null),
      }))

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

  const totalHoras    = registros.reduce((s:number, r:any) => s + (Number(r.horas_trabalhadas)||0), 0)
  const totalExtras   = registros.reduce((s:number, r:any) => s + (Number(r.horas_extra)||0), 0)
  const totalFaltas   = registros.filter((r:any) => ['falta','falta_justificada'].includes((r.status??'').toLowerCase())).length
  const totalPresentes = registros.filter((r:any) => !['falta','falta_justificada'].includes((r.status??'').toLowerCase()) && (r.hora_entrada || r.status)).length
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
    const tbodyRows = registros.map((reg, i) => {
      const statusPdf = reg.status ?? (reg.hora_entrada ? 'presente' : null)
      const isFalta = ['falta','falta_justificada'].includes((statusPdf??'').toLowerCase())
      const cor = isFalta ? '#fee2e2' : (i%2===0 ? '#fff' : '#f8fafc')
      const statusLabel = isFalta ? 'FALTA' : (reg.status ?? (reg.hora_entrada ? 'Presente' : '—'))
      const [y,m,d]=reg.data.split('-')
      return `<tr style="background:${cor}">
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px">${d}/${m}/${y}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#16a34a;font-weight:600">${fh(reg.hora_entrada)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#6b7280">12:00</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#6b7280">13:00</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:#dc2626;font-weight:600">${fh(reg.hora_saida)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;font-weight:700;color:#1e3a5f">${reg.horas_trabalhadas ? Number(reg.horas_trabalhadas).toFixed(2)+'h' : '0,00h'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;color:${(Number(reg.horas_extra)||0)>0?'#92400e':'#6b7280'}">${reg.horas_extra ? Number(reg.horas_extra).toFixed(2)+'h' : '0,00h'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;text-align:center;font-weight:700;color:${isFalta?'#dc2626':'#374151'}">${statusLabel}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">${reg.observacoes??'—'}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;font-size:12px}@page{size:A4 landscape;margin:10mm}</style></head>
<body>
  <div style="background:#1e3a5f;padding:15px;color:#fff;border-radius:6px;margin-bottom:10px;display:flex;justify-content:space-between">
    <div><div style="font-size:16px;font-weight:bold">${sessao.nome.toUpperCase()}</div><div style="font-size:11px;opacity:0.8">Chapa: ${sessao.chapa||'—'}</div></div>
    <div style="text-align:right"><div style="font-size:14px;font-weight:bold">Folha de Ponto</div><div style="font-size:12px">${mesLabel}</div></div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px">
    <div style="background:#dcfce7;padding:10px;border-radius:6px;text-align:center"><div style="font-size:18px;font-weight:bold;color:#16a34a">${totalPresentes}</div><div style="font-size:10px;color:#16a34a">Presenças</div></div>
    <div style="background:#fee2e2;padding:10px;border-radius:6px;text-align:center"><div style="font-size:18px;font-weight:bold;color:#dc2626">${totalFaltas}</div><div style="font-size:10px;color:#dc2626">Faltas</div></div>
    <div style="background:#dbeafe;padding:10px;border-radius:6px;text-align:center"><div style="font-size:18px;font-weight:bold;color:#1d4ed8">${totalHoras.toFixed(0)}h</div><div style="font-size:10px;color:#1d4ed8">Trabalhadas</div></div>
    <div style="background:#fef9c3;padding:10px;border-radius:6px;text-align:center"><div style="font-size:18px;font-weight:bold;color:#92400e">${totalExtras.toFixed(0)}h</div><div style="font-size:10px;color:#92400e">Extras</div></div>
  </div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #eee">
    <thead><tr style="background:#1e3a5f;color:#fff">${['Data','Entrada','S.Alm','Ret','Saída','Horas','Extra','Status','Obs'].map(h=>`<th style="padding:8px;font-size:10px">${h}</th>`).join('')}</tr></thead>
    <tbody>${tbodyRows}</tbody>
    <tfoot><tr style="background:#1e3a5f;color:#fff"><td colspan="5" style="padding:8px;font-weight:bold">TOTAIS</td><td style="text-align:center;font-weight:bold">${totalHoras.toFixed(2)}h</td><td style="text-align:center;font-weight:bold">${totalExtras.toFixed(2)}h</td><td colspan="2" style="text-align:center">${totalFaltas} falta(s)</td></tr></tfoot>
  </table>
  <div style="margin-top:30px;display:flex;justify-content:space-between;padding:0 40px">
    <div style="border-top:1px solid #333;width:200px;text-align:center;padding-top:5px;font-size:10px">Assinatura do Colaborador</div>
    <div style="border-top:1px solid #333;width:200px;text-align:center;padding-top:5px;font-size:10px">Responsável RH</div>
  </div>
  <script>window.onload=()=>window.print()</script>
</body></html>`
    abrirHtmlComoPdf(html, `Folha de Ponto — ${sessao.nome} — ${mesLabel}`)
  }

  return (
    <div style={{ paddingBottom: 100, background: '#f8fafc', minHeight: '100vh' }}>
      {/* Seletor */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'12px 16px' }}>
        <label style={{ fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase', display:'block', marginBottom:5 }}>Competência</label>
        <select value={mesSel} onChange={e => setMesSel(e.target.value)} style={{ width:'100%', height:42, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 12px', fontSize:14, fontWeight:600, color:'#1a56a0', background:'#fff', outline:'none' }}>
          {opcoesMes().map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
        </select>
        {periodoReal && (() => {
          const [yi,mi,di] = periodoReal.inicio.split('-')
          const [yf,mf,df] = periodoReal.fim.split('-')
          const cruzaMes = mi !== mf
          return (
            <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <span style={{ fontSize:11, color:'#6b7280' }}>Período de trabalho:</span>
              <span style={{ fontSize:11, fontWeight:700, background: cruzaMes ? '#fef3c7' : '#dbeafe', color: cruzaMes ? '#92400e' : '#1d4ed8', padding:'2px 9px', borderRadius:20 }}>
                {di}/{mi} → {df}/{mf}/{yf}
              </span>
              {cruzaMes && (
                <span style={{ fontSize:10, color:'#92400e', fontWeight:600 }}>⚠️ Período entre meses</span>
              )}
            </div>
          )
        })()}
      </div>

      {/* Resumo */}
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

      {/* Conteúdo */}
      <div style={{ padding:'10px 12px 0' }}>
        {loading ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'60px 0', gap:10 }}><Loader2 size={22} className="animate-spin" color="#1e3a5f" /><span style={{ fontSize:13, color:'#6b7280' }}>Carregando…</span></div>
        ) : erro ? (
          <div style={{ background:'#fee2e2', borderRadius:10, padding:'16px', textAlign:'center', color:'#dc2626' }}>⚠️ {erro}</div>
        ) : registros.length === 0 ? (
          <div style={{ background:'#fff', borderRadius:12, padding:'20px 14px', border:'1px solid #e5e7eb', textAlign:'center' }}>
            <CalendarDays size={36} color="#9ca3af" style={{ margin:'0 auto 10px' }} />
            <div style={{ fontSize:14, fontWeight:700, color:'#374151', marginBottom:4 }}>Registros não disponíveis</div>
            {lancsMes.length > 0 && (
              <div style={{ background:'#eff6ff', borderRadius:10, padding:'12px', border:'1px solid #bfdbfe', textAlign:'left', marginTop:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#1d4ed8', marginBottom:8 }}>📊 RESUMO DO FECHAMENTO</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  <div style={{ background:'#fff', padding:7, borderRadius:6 }}><div style={{ fontSize:9, color:'#6b7280' }}>H. Normais</div><div style={{ fontSize:14, fontWeight:800 }}>{lancsMes[0].snap_horas_normais}h</div></div>
                  <div style={{ background:'#fff', padding:7, borderRadius:6 }}><div style={{ fontSize:9, color:'#6b7280' }}>Líquido</div><div style={{ fontSize:14, fontWeight:800, color:'#15803d' }}>{fmtR(lancsMes[0].snap_liquido)}</div></div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', border:'1px solid #e2e8f0', boxShadow:'0 1px 6px rgba(0,0,0,.06)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'90px 52px 58px 54px 52px 54px 54px 1fr', background:'#1e3a5f', padding:'8px 8px' }}>
              {['DATA','ENTRADA','S.ALM','RET','SAÍDA','HORAS','EXTRA','STATUS'].map(h => (<div key={h} style={{ fontSize:8, fontWeight:700, color:'#fff', textAlign:'center' }}>{h}</div>))}
            </div>
            {registros.map((reg:any, i:number) => {
              const statusEf = reg.status ?? (reg.hora_entrada ? 'presente' : null)
              const badge = badgeStatus(statusEf)
              const [yy,mm,dd] = (reg.data??'').split('-')
              return (
                <div key={reg.id || i} style={{ display:'grid', gridTemplateColumns:'90px 52px 58px 54px 52px 54px 54px 1fr', padding:'7px 8px', borderBottom:'1px solid #f1f5f9', background: i%2===0 ? '#fff' : '#f9fafb', alignItems:'center' }}>
                  <div style={{ fontSize:11, fontWeight:700 }}>{dd}/{mm}/{yy}</div>
                  <div style={{ fontSize:11, color: reg.hora_entrada ? '#16a34a' : '#9ca3af', textAlign:'center' }}>{fmtHora(reg.hora_entrada)}</div>
                  <div style={{ fontSize:11, color:'#6b7280', textAlign:'center' }}>12:00</div>
                  <div style={{ fontSize:11, color:'#6b7280', textAlign:'center' }}>13:00</div>
                  <div style={{ fontSize:11, color: reg.hora_saida ? '#dc2626' : '#9ca3af', textAlign:'center' }}>{fmtHora(reg.hora_saida)}</div>
                  <div style={{ fontSize:11, fontWeight:700, textAlign:'center' }}>{reg.horas_trabalhadas ? Number(reg.horas_trabalhadas).toFixed(1)+'h' : '—'}</div>
                  <div style={{ fontSize:11, fontWeight:700, color: Number(reg.horas_extra) > 0 ? '#d97706' : '#9ca3af', textAlign:'center' }}>{Number(reg.horas_extra) > 0 ? Number(reg.horas_extra).toFixed(1)+'h' : '—'}</div>
                  <div style={{ textAlign:'center' }}><span style={{ fontSize:9, fontWeight:700, background:badge.bg, color:badge.cor, borderRadius:20, padding:'2px 8px' }}>{badge.label}</span></div>
                </div>
              )
            })}
            <div style={{ display:'grid', gridTemplateColumns:'90px 52px 58px 54px 52px 54px 54px 1fr', padding:'8px 8px', background:'#1e3a5f', color:'#fff' }}>
              <div style={{ fontSize:10, fontWeight:800 }}>TOTAIS</div><div/><div/><div/><div/>
              <div style={{ fontSize:11, fontWeight:800, textAlign:'center' }}>{totalHoras.toFixed(1)}h</div>
              <div style={{ fontSize:11, fontWeight:800, color:'#fbbf24', textAlign:'center' }}>{totalExtras.toFixed(1)}h</div>
              <div style={{ fontSize:10, textAlign:'center' }}>{totalFaltas} f.</div>
            </div>
          </div>
        )}
      </div>

      {!loading && (
        <div style={{ padding:'12px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <button onClick={() => setShowPreview(true)} style={{ height:44, borderRadius:10, border:'1.5px solid #1e3a5f', background:'#fff', color:'#1e3a5f', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Eye size={16}/> Visualizar</button>
          <button onClick={gerarPdfPonto} style={{ height:44, borderRadius:10, border:'none', background:'#1e3a5f', color:'#fff', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Download size={16}/> Baixar PDF</button>
        </div>
      )}

      {showPreview && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:100, display:'flex', flexDirection:'column' }}>
          <div style={{ background:'#fff', padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}><span style={{ fontWeight:800 }}>Prévia da Folha</span><button onClick={()=>setShowPreview(false)} style={{ background:'#eee', border:'none', padding:'6px 12px', borderRadius:6 }}>Fechar</button></div>
          <div style={{ flex:1, overflow:'auto', padding:10 }}><div style={{ background:'#fff', padding:15, maxWidth:800, margin:'0 auto', borderRadius:4 }}>
            <div dangerouslySetInnerHTML={{ __html: `
              <div style="font-family:sans-serif">
                <div style="background:#1e3a5f;color:#fff;padding:12px;border-radius:6px;margin-bottom:10px">
                  <b>${sessao.nome.toUpperCase()}</b><br/><small>Folha de Ponto · ${fmtComp(mesSel)}</small>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:10px">
                  <thead><tr style="background:#f1f5f9">
                    <th style="padding:5px;border:1px solid #ddd">Data</th>
                    <th style="padding:5px;border:1px solid #ddd">Entrada</th>
                    <th style="padding:5px;border:1px solid #ddd">Saída</th>
                    <th style="padding:5px;border:1px solid #ddd">Horas</th>
                    <th style="padding:5px;border:1px solid #ddd">Status</th>
                  </tr></thead>
                  <tbody>
                    ${registros.map(r=>`<tr>
                      <td style="padding:5px;border:1px solid #ddd">${fmtData(r.data)}</td>
                      <td style="padding:5px;border:1px solid #ddd;text-align:center">${fmtHora(r.hora_entrada)}</td>
                      <td style="padding:5px;border:1px solid #ddd;text-align:center">${fmtHora(r.hora_saida)}</td>
                      <td style="padding:5px;border:1px solid #ddd;text-align:center;font-weight:bold">${(r.horas_trabalhadas||0).toFixed(1)}h</td>
                      <td style="padding:5px;border:1px solid #ddd;text-align:center">${r.status||'Presente'}</td>
                    </tr>`).join('')}
                  </tbody>
                </table>
              </div>
            ` }} />
          </div></div>
          <div style={{ padding:12, background:'#fff' }}><button onClick={gerarPdfPonto} style={{ width:'100%', height:44, borderRadius:10, border:'none', background:'#1e3a5f', color:'#fff', fontWeight:700 }}>Imprimir Agora</button></div>
        </div>
      )}
    </div>
  )
}
