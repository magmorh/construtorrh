import { useState, useEffect, useCallback } from 'react'
import { Loader2, CalendarDays, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Sessao { colaborador_id: string; nome: string; chapa?: string }
interface Lancamento { id: string; mes_referencia: string; data_inicio: string; data_fim: string; status: string; snap_horas_normais?: number; snap_horas_extras?: number; snap_valor_producao?: number; snap_liquido?: number }

function fmtComp(m: string) {
  const [y, mo] = m.split('-')
  const n = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${n[parseInt(mo)-1]} ${y}`
}
function fmtData(d: string|null) { if(!d)return'—'; const[y,m,dd]=d.split('-'); return `${dd}/${m}/${y}` }
function fmtHora(h?: string|null) { return h ? h.slice(0,5) : '—' }
function fmtR(v: number) { return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v) }

function abrirHtmlComoPdf(html: string): void {
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const doc = f.contentWindow?.document || f.contentDocument
  if(!doc) return
  ;(doc as any).open(); (doc as any).write(html); (doc as any).close()
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if(ios) { setTimeout(()=>{ f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(()=>document.body.removeChild(f),2000)},1000) }
  else { f.onload = ()=>{ f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(()=>document.body.removeChild(f),1000) } }
}

export default function AbaFolhaPontoNova({ sessao, dataAdmissao, lancamentos, colab, empresa }:{
  sessao: Sessao; dataAdmissao: string|null; lancamentos: Lancamento[]; colab?: any; empresa?: any
}) {
  const [mesSel, setMesSel] = useState(()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })
  const [registros, setRegistros] = useState<any[]>([])
  const [producoes, setProducoes] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [periodoReal, setPeriodoReal] = useState<{inicio:string;fim:string}|null>(null)

  const opcoesMes = useCallback((): {val:string;label:string}[] => {
    const opts: {val:string;label:string}[] = []
    const ini = dataAdmissao ? new Date(dataAdmissao) : new Date()
    let cur = new Date(ini.getFullYear(), ini.getMonth(), 1)
    const fim = new Date()
    while(cur<=fim){ const v=`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`; opts.push({val:v,label:fmtComp(v)}); cur=new Date(cur.getFullYear(),cur.getMonth()+1,1) }
    return opts.reverse()
  }, [dataAdmissao])

  const carregar = useCallback(async(mes:string)=>{
    setLoading(true)
    const {data:lr} = await supabase.from('ponto_lancamentos').select('id,data_inicio,data_fim,status').eq('colaborador_id',sessao.colaborador_id).eq('mes_referencia',mes).order('created_at',{ascending:false}).limit(1)
    const inicio = lr?.[0]?.data_inicio ?? mes+'-01'
    const fim    = lr?.[0]?.data_fim    ?? mes+'-31'
    if(lr?.[0]) setPeriodoReal({inicio,fim}); else setPeriodoReal(null)
    const [r1,r2,rp] = await Promise.all([
      supabase.from('portal_ponto_diario').select('id,data,hora_entrada,hora_saida,horas_trabalhadas,horas_extra,horas_falta,status').eq('colaborador_id',sessao.colaborador_id).gte('data',inicio).lte('data',fim).order('data',{ascending:true}),
      supabase.from('registro_ponto').select('id,data,hora_entrada,hora_saida,horas_trabalhadas,horas_extras,horas_falta,status').eq('colaborador_id',sessao.colaborador_id).gte('data',inicio).lte('data',fim).order('data',{ascending:true}),
      supabase.from('ponto_producao').select('id,data,quantidade,valor_total,playbook_itens(descricao,unidade)').eq('colaborador_id',sessao.colaborador_id).gte('data',inicio).lte('data',fim).order('data',{ascending:true})
    ])
    const norm2 = (r2.data??[]).map((r:any)=>({...r,horas_extra:r.horas_extras??r.horas_extra??0,status:r.status??(r.hora_entrada?'presente':null)}))
    setRegistros((r1.data??[]).length>0?(r1.data??[]):norm2)
    setProducoes(rp.data??[])
    setLoading(false)
  },[sessao.colaborador_id])

  useEffect(()=>{ carregar(mesSel) },[mesSel,carregar])

  const totalHoras    = registros.reduce((s:number,r:any)=>s+(Number(r.horas_trabalhadas)||0),0)
  const totalExtras   = registros.reduce((s:number,r:any)=>s+(Number(r.horas_extra)||0),0)
  const totalFaltas   = registros.filter((r:any)=>['falta','falta_justificada'].includes((r.status??'').toLowerCase())).length
  const totalPresentes= registros.filter((r:any)=>!['falta','falta_justificada'].includes((r.status??'').toLowerCase())&&(r.hora_entrada||r.status)).length
  const lancsMes      = lancamentos.filter(l=>l.mes_referencia===mesSel)

  function gerarPdf() {
    const mesLabel = fmtComp(mesSel)
    const nomeColab  = colab?.nome ?? sessao.nome
    const nomeEmpresa = empresa?.nome ?? 'ConstrutorRH'
    const cnpj = empresa?.cnpj ? `CNPJ: ${empresa.cnpj}` : ''
    const cpf = colab?.cpf ?? '—'
    const funcao = colab?.funcao ?? '—'
    const admissao = fmtData(colab?.data_admissao ?? null)
    const chapa = colab?.chapa ?? sessao.chapa ?? '—'
    const periodo = periodoReal ? `${fmtData(periodoReal.inicio)} a ${fmtData(periodoReal.fim)}` : mesLabel
    const rows = registros.map((r:any,i:number)=>{
      const [y,m,d]=r.data.split('-')
      const st = r.status??(r.hora_entrada?'presente':null)
      const isFalta=['falta','falta_justificada'].includes((st??'').toLowerCase())
      return `<tr style="background:${isFalta?'#fff1f2':i%2===0?'#fff':'#f8fafc'}">
        <td style="padding:5px 8px;font-weight:600">${d}/${m}/${y}</td>
        <td style="padding:5px 8px;text-align:center;color:#16a34a;font-weight:600">${fmtHora(r.hora_entrada)}</td>
        <td style="padding:5px 8px;text-align:center;color:#6b7280">${isFalta?'—':'12:00'}</td>
        <td style="padding:5px 8px;text-align:center;color:#6b7280">${isFalta?'—':'13:00'}</td>
        <td style="padding:5px 8px;text-align:center;color:#dc2626;font-weight:600">${fmtHora(r.hora_saida)}</td>
        <td style="padding:5px 8px;text-align:center;font-weight:700;color:#1a56a0">${r.horas_trabalhadas?Number(r.horas_trabalhadas).toFixed(2)+'h':'—'}</td>
        <td style="padding:5px 8px;text-align:center;color:${Number(r.horas_extra)>0?'#92400e':'#9ca3af'}">${Number(r.horas_extra||0).toFixed(2)}h</td>
        <td style="padding:5px 8px;text-align:center"><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:${isFalta?'#fee2e2':'#dcfce7'};color:${isFalta?'#dc2626':'#15803d'}">${isFalta?'FALTA':'Presente'}</span></td>
      </tr>`
    }).join('')
    const prodRows = producoes.length>0 ? producoes.map((r:any,i:number)=>`
      <tr style="background:${i%2===0?'#fff':'#faf5ff'}">
        <td style="padding:5px 8px">${r.data?.slice(8)}/${r.data?.slice(5,7)}</td>
        <td style="padding:5px 8px">${r.playbook_itens?.descricao??'Serviço'}</td>
        <td style="padding:5px 8px;text-align:center">${r.quantidade} ${r.playbook_itens?.unidade??''}</td>
        <td style="padding:5px 8px;text-align:right;font-weight:700;color:#7c3aed">${fmtR(Number(r.valor_total||0))}</td>
      </tr>`).join('') : ''
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;background:#fff}@page{size:A4 portrait;margin:0}.page{width:210mm;min-height:297mm;background:#fff}table{width:100%;border-collapse:collapse}</style></head>
<body><div class="page">
<div style="background:#1a56a0;padding:14px 20px;display:flex;justify-content:space-between;align-items:center">
  <div><div style="color:#fff;font-size:17px;font-weight:800">Folha de Ponto</div><div style="color:rgba(255,255,255,.7);font-size:10px">${mesLabel} · Período: ${periodo}</div></div>
  <div style="text-align:right"><div style="color:#fff;font-size:13px;font-weight:700">${nomeEmpresa}</div><div style="color:rgba(255,255,255,.6);font-size:10px">${cnpj}</div></div>
</div>
<div style="background:#f0f4f8;padding:10px 20px;border-bottom:1px solid #d0dae5">
  <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px">
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Colaborador</div><div style="font-size:12px;font-weight:800">${nomeColab}</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Chapa</div><div style="font-size:12px;font-weight:700">${chapa}</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">CPF</div><div style="font-size:11px">${cpf}</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Admissão</div><div style="font-size:11px">${admissao}</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Função</div><div style="font-size:11px">${funcao}</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">Presenças</div><div style="font-size:12px;font-weight:700;color:#15803d">${totalPresentes}</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">H. Normais</div><div style="font-size:12px;font-weight:700;color:#1d4ed8">${totalHoras.toFixed(1)}h</div></div>
    <div><div style="font-size:8px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:2px">H. Extras</div><div style="font-size:12px;font-weight:700;color:#92400e">${totalExtras.toFixed(1)}h</div></div>
  </div>
</div>
<div style="padding:14px 20px">
  <div style="font-size:9px;font-weight:700;color:#1a56a0;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Espelho de Ponto — Registros Diários</div>
  <table style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">
    <thead><tr style="background:#1a56a0">${['Data','Entrada','S.Almoço','Retorno','Saída','H.Trab.','H.Extra','Status'].map(h=>`<th style="padding:6px 8px;color:#fff;font-size:9px;font-weight:700;text-align:center">${h}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#1a56a0">
      <td colspan="5" style="padding:6px 8px;color:#fff;font-size:10px;font-weight:700">TOTAIS — ${totalPresentes} dia(s) trabalhado(s)</td>
      <td style="padding:6px 8px;color:#fff;font-size:10px;font-weight:700;text-align:center">${totalHoras.toFixed(2)}h</td>
      <td style="padding:6px 8px;color:#fbbf24;font-size:10px;font-weight:700;text-align:center">${totalExtras.toFixed(2)}h</td>
      <td style="padding:6px 8px;color:#fca5a5;font-size:9px;text-align:center">${totalFaltas} falta(s)</td>
    </tr></tfoot>
  </table>
</div>
${producoes.length>0?`<div style="padding:0 20px 14px">
  <div style="font-size:9px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Produções do Período — Total: ${fmtR(producoes.reduce((s:number,r:any)=>s+Number(r.valor_total||0),0))}</div>
  <table style="border:1px solid #e9d5ff;border-radius:6px;overflow:hidden">
    <thead><tr style="background:#7c3aed">${['Data','Serviço','Qtd','Total'].map(h=>`<th style="padding:5px 8px;color:#fff;font-size:9px;font-weight:700">${h}</th>`).join('')}</tr></thead>
    <tbody>${prodRows}</tbody>
  </table>
</div>`:''}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin:10px 20px;padding-top:30px;border-top:1px solid #e5e7eb">
  <div style="border-top:1.5px solid #1a56a0;padding-top:6px;text-align:center"><div style="font-size:10px;color:#374151;font-weight:600">${nomeColab.toUpperCase()}</div><div style="font-size:9px;color:#9ca3af">Colaborador(a) — Assinatura</div></div>
  <div style="border-top:1.5px solid #1a56a0;padding-top:6px;text-align:center"><div style="font-size:10px;color:#374151">___________________________</div><div style="font-size:9px;color:#9ca3af">Responsável RH / Carimbo</div></div>
</div>
</div><script>window.onload=()=>window.print()</script></body></html>`
    abrirHtmlComoPdf(html)
  }

  return (
    <div style={{ paddingBottom:90, background:'#f8fafc', minHeight:'100vh' }}>
      {/* Header azul */}
      <div style={{ background:'linear-gradient(135deg,#1e3a5f 0%,#1a56a0 100%)', padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>{sessao.nome.toUpperCase()}</div>
          <div style={{ color:'rgba(255,255,255,.7)', fontSize:11, marginTop:2 }}>Folha de Ponto · {fmtComp(mesSel)}</div>
          {periodoReal && (() => {
            const [,mi] = periodoReal.inicio.split('-'), [,mf] = periodoReal.fim.split('-')
            const cruz = mi!==mf
            return <div style={{ color:cruz?'#fcd34d':'rgba(255,255,255,.6)', fontSize:10, marginTop:2 }}>
              {cruz?'⚠️ ':''}{fmtData(periodoReal.inicio)} → {fmtData(periodoReal.fim)}
            </div>
          })()}
        </div>
        <div style={{ background:'rgba(255,255,255,.15)', borderRadius:8, padding:'4px 10px', textAlign:'center' }}>
          <div style={{ color:'#fff', fontSize:9, fontWeight:700 }}>Chapa</div>
          <div style={{ color:'#fff', fontSize:13, fontWeight:800 }}>{sessao.chapa??'—'}</div>
        </div>
      </div>

      {/* Seletor */}
      <div style={{ background:'#fff', borderBottom:'1px solid #e5e7eb', padding:'10px 14px' }}>
        <select value={mesSel} onChange={e=>setMesSel(e.target.value)} style={{ width:'100%', height:42, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 12px', fontSize:14, fontWeight:600, color:'#1a56a0', background:'#fff', outline:'none' }}>
          {opcoesMes().map(o=><option key={o.val} value={o.val}>{o.label}</option>)}
        </select>
      </div>

      {/* Cards resumo compactos */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, padding:'10px 12px 0' }}>
        {[
          { l:'Presenças', v:totalPresentes, c:'#15803d', bg:'#dcfce7' },
          { l:'Faltas',    v:totalFaltas,    c:'#dc2626', bg:'#fee2e2' },
          { l:'H.Normais', v:`${totalHoras.toFixed(0)}h`, c:'#1d4ed8', bg:'#dbeafe' },
          { l:'H.Extras',  v:`${totalExtras.toFixed(0)}h`, c:'#92400e', bg:'#fef9c3' },
        ].map(s=>(
          <div key={s.l} style={{ background:s.bg, borderRadius:10, padding:'8px 4px', textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:17, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:8, color:s.c, fontWeight:600 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Lista simplificada: só dia + horas */}
      <div style={{ padding:'10px 12px 0' }}>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', padding:'48px 0', gap:10 }}>
            <Loader2 size={20} className="animate-spin" color="#1e3a5f"/>
            <span style={{ fontSize:13, color:'#6b7280' }}>Carregando…</span>
          </div>
        ) : registros.length === 0 ? (
          <div style={{ background:'#fff', borderRadius:12, padding:'20px', border:'1px solid #e5e7eb', textAlign:'center' }}>
            <CalendarDays size={34} color="#9ca3af" style={{ margin:'0 auto 10px' }}/>
            <div style={{ fontSize:14, fontWeight:700, color:'#374151' }}>Sem registros</div>
            {lancsMes.length>0&&(
              <div style={{ background:'#eff6ff', borderRadius:8, padding:'10px', border:'1px solid #bfdbfe', textAlign:'left', marginTop:10 }}>
                <div style={{ fontSize:9, fontWeight:700, color:'#1d4ed8', marginBottom:6 }}>📊 RESUMO DO FECHAMENTO</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
                  <div style={{ background:'#fff', padding:6, borderRadius:5 }}><div style={{ fontSize:8, color:'#6b7280' }}>H. Normais</div><div style={{ fontSize:13, fontWeight:800 }}>{lancsMes[0].snap_horas_normais}h</div></div>
                  <div style={{ background:'#fff', padding:6, borderRadius:5 }}><div style={{ fontSize:8, color:'#6b7280' }}>Líquido</div><div style={{ fontSize:13, fontWeight:800, color:'#15803d' }}>{fmtR(lancsMes[0].snap_liquido??0)}</div></div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', border:'1px solid #e2e8f0', boxShadow:'0 1px 4px rgba(0,0,0,.05)' }}>
            {/* Cabeçalho tabela simplificada */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', background:'#1e3a5f', padding:'8px 12px' }}>
              {['DIA','H. NORMAIS','H. EXTRAS'].map(h=><div key={h} style={{ fontSize:9, fontWeight:700, color:'#fff', textAlign:'center', letterSpacing:'.05em' }}>{h}</div>)}
            </div>
            {/* Linhas compactas */}
            {registros.map((r:any,i:number)=>{
              const [,m,d] = r.data.split('-')
              const ht = Number(r.horas_trabalhadas)||0
              const he = Number(r.horas_extra)||0
              const isFalta = ['falta','falta_justificada'].includes((r.status??'').toLowerCase())
              const diasSemana = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
              const diaSem = diasSemana[new Date(r.data+'T12:00:00').getDay()]
              return (
                <div key={r.id||i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', padding:'8px 12px', borderBottom:'1px solid #f1f5f9', background:isFalta?'#fff5f5':i%2===0?'#fff':'#f9fafb', alignItems:'center' }}>
                  <div>
                    <span style={{ fontSize:12, fontWeight:700, color:'#1e293b' }}>{d}/{m}</span>
                    <span style={{ fontSize:10, color:'#9ca3af', marginLeft:4 }}>{diaSem}</span>
                    {isFalta && <span style={{ fontSize:9, fontWeight:700, background:'#fee2e2', color:'#dc2626', borderRadius:10, padding:'1px 5px', marginLeft:4 }}>F</span>}
                  </div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#1e3a5f', textAlign:'center' }}>{ht>0?ht.toFixed(1)+'h':'—'}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:he>0?'#d97706':'#9ca3af', textAlign:'center' }}>{he>0?he.toFixed(1)+'h':'—'}</div>
                </div>
              )
            })}
            {/* Totais */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', padding:'8px 12px', background:'#1e3a5f' }}>
              <div style={{ fontSize:10, fontWeight:800, color:'#fff' }}>TOTAL</div>
              <div style={{ fontSize:11, fontWeight:800, color:'#fff', textAlign:'center' }}>{totalHoras.toFixed(1)}h</div>
              <div style={{ fontSize:11, fontWeight:800, color:'#fbbf24', textAlign:'center' }}>{totalExtras.toFixed(1)}h</div>
            </div>
          </div>
        )}
        {/* Produções resumidas */}
        {producoes.length>0&&(
          <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e9d5ff', padding:'10px 12px', marginTop:8 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#7c3aed', marginBottom:6 }}>⚡ Produções ({producoes.length}) · {fmtR(producoes.reduce((s:number,r:any)=>s+Number(r.valor_total||0),0))}</div>
            {producoes.slice(0,3).map((r:any,i:number)=>(
              <div key={r.id||i} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'3px 0', borderBottom:i<2?'1px solid #f3e8ff':'none' }}>
                <span style={{ color:'#374151' }}>{r.data?.slice(8)}/{r.data?.slice(5,7)} · {r.playbook_itens?.descricao??'Serviço'}</span>
                <span style={{ fontWeight:700, color:'#7c3aed' }}>{fmtR(Number(r.valor_total||0))}</span>
              </div>
            ))}
            {producoes.length>3&&<div style={{ fontSize:10, color:'#9ca3af', marginTop:4 }}>+{producoes.length-3} mais no PDF</div>}
          </div>
        )}
      </div>

      {/* Botão PDF */}
      {!loading&&registros.length>0&&(
        <div style={{ padding:'12px 12px 0' }}>
          <button onClick={gerarPdf} style={{ width:'100%', height:46, borderRadius:10, border:'none', background:'#1e3a5f', color:'#fff', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:14 }}>
            <Download size={17}/> Baixar Espelho Completo (PDF)
          </button>
        </div>
      )}
    </div>
  )
}
