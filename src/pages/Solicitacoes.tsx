import React, { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchEmpresaData, CABECALHO_CSS, gerarCabecalhoHTML } from '@/lib/relatorioHeader'
import { useProfile } from '@/hooks/useProfile'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Users, AlertTriangle, ShieldCheck, FileImage, RefreshCw, Download, X, Check, Eye, FileBarChart2, FileText, Pencil, Trash2, Save } from 'lucide-react'

// ─── tipos ────────────────────────────────────────────────────────────────────
interface Obra      { id: string; nome: string }
interface Funcao    { id: string; nome: string }
interface Colab     { id: string; nome: string; chapa?: string; cpf?: string }

// ─── helper: geração de PDF de cadastro ──────────────────────────────────────
async function gerarPDFCadastro(r: any, funcoes: Funcao[], obras: Obra[]) {
  const emp = await fetchEmpresaData()
  const d    = r.dados ?? {}
  const fn   = funcoes.find(f => f.id === d.funcao_id)?.nome ?? '—'
  const ob   = obras.find(o => o.id === r.obra_id)?.nome ?? '—'
  const fmt  = (v: any) => v || '—'
  const fmtDate = (v: string) => {
    if (!v) return '—'
    try { return new Date(v + 'T12:00:00').toLocaleDateString('pt-BR') } catch { return v }
  }
  const vtLabel: Record<string,string> = { nenhum:'Não recebe', gasolina:'Aux. Gasolina', transporte:'Transporte Público' }
  const contr:   Record<string,string> = { clt:'CLT', autonomo:'Autônomo / PJ', estagio:'Estágio' }
  const tconta:  Record<string,string> = { corrente:'Corrente', poupanca:'Poupança', salario:'Conta Salário' }
  const sexo:    Record<string,string> = { M:'Masculino', F:'Feminino' }
  const civil:   Record<string,string> = { solteiro:'Solteiro(a)', casado:'Casado(a)', divorciado:'Divorciado(a)', viuvo:'Viúvo(a)', uniao_estavel:'União Estável' }

  const r2 = (a: string, av: string, b: string, bv: string) =>
    `<tr><td class="lb">${a}</td><td>${av}</td><td class="lb">${b}</td><td>${bv}</td></tr>`
  const r1 = (a: string, av: string) =>
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
  subtitulo: `Obra: ${ob} · Aprovado por: ${r.aprovado_nome ?? '—'}`,
  periodo: `Solicitado em ${new Date(r.criado_em).toLocaleString('pt-BR')}`,
})}
<div class="sec">
  <div class="sec-title">Identificação</div>
  <table>
    ${r1('Nome Completo', `<strong>${fmt(d.nome)}</strong>`)}
    ${r2('CPF', fmt(d.cpf), 'RG', fmt(d.rg))}
    ${r2('PIS / NIT', fmt(d.pis_nit), 'Nascimento', fmtDate(d.data_nascimento))}
    ${r2('Sexo', sexo[d.genero??'']??fmt(d.genero), 'Estado Civil', civil[d.estado_civil??'']??fmt(d.estado_civil))}
    ${r2('Telefone', fmt(d.telefone), 'E-mail', fmt(d.email))}
    ${r2('CTPS Nº', fmt(d.ctps_numero), 'Série CTPS', fmt(d.ctps_serie))}
  </table>
</div>
<div class="sec">
  <div class="sec-title">Endereço</div>
  <table>
    ${r1('Endereço', fmt(d.endereco))}
    ${r2('Cidade', fmt(d.cidade), 'UF', fmt(d.estado))}
    ${r1('CEP', fmt(d.cep))}
  </table>
</div>
<div class="sec">
  <div class="sec-title">Contrato</div>
  <table>
    ${r2('Função', fn, 'Tipo de Contrato', contr[d.tipo_contrato??'']??fmt(d.tipo_contrato))}
    ${r2('Data de Admissão', fmtDate(d.data_admissao), 'Obra', ob)}
  </table>
</div>
<div class="sec">
  <div class="sec-title">Dados Bancários</div>
  <table>
    ${r2('Banco', fmt(d.banco), 'Tipo de Conta', tconta[d.tipo_conta??'']??fmt(d.tipo_conta))}
    ${r2('Agência', fmt(d.agencia), 'Conta', fmt(d.conta))}
    ${r2('Tipo PIX', fmt(d.pix_tipo), 'Chave PIX', fmt(d.pix_chave))}
  </table>
</div>
<div class="sec">
  <div class="sec-title">Vale Transporte</div>
  <table>
    ${r1('Modalidade', vtLabel[d.vt_modalidade??'nenhum']??fmt(d.vt_modalidade))}
    ${d.vt_modalidade==='gasolina' ? r1('Valor diário', d.vt_gasolina_valor_dia ? `R$ ${parseFloat(d.vt_gasolina_valor_dia).toFixed(2)}` : '—') : ''}
    ${d.vt_modalidade==='transporte' ? r2('Empresa Cartão', fmt(d.vt_cartao_tipo), 'Nº Cartão', fmt(d.vt_cartao_numero)) : ''}
    ${d.vt_modalidade==='transporte' ? r1('Trechos de Ida', fmt(d.vt_trecho_ida)) : ''}
    ${d.vt_modalidade==='transporte' ? r1('Trechos de Volta', fmt(d.vt_trecho_volta)) : ''}
  </table>
</div>
${d.observacoes ? `<div class="sec"><div class="sec-title">Observações</div><table>${r1('Obs.', fmt(d.observacoes))}</table></div>` : ''}
<div class="assinatura">
  <div>Colaborador / Assinatura</div>
  <div>Responsável RH / Carimbo</div>
</div>
<div class="rodape">Gerado automaticamente — ConstrutorRH — ${new Date().toLocaleString('pt-BR')}</div>
<script>window.onload=()=>{window.print()}<\/script>
</body></html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (win) { win.document.write(html); win.document.close() }
}

// ─── aba: Cadastros de Colaborador ───────────────────────────────────────────
function TabCadastros({ obras, funcoes, perfil }: { obras: Obra[]; funcoes: Funcao[]; perfil: any }) {
  const [rows,   setRows]   = useState<any[]>([])
  const [load,   setLoad]   = useState(true)
  const [filtro, setFiltro] = useState<'pendente'|'aprovado'|'recusado'|'todos'>('pendente')
  const [modalVer,    setModalVer]    = useState<any | null>(null)
  const [recusaId,    setRecusaId]    = useState<string|null>(null)
  const [motivoRecusa,setMotivoRecusa]= useState('')

  const fetch = useCallback(async () => {
    setLoad(true)
    const q = supabase.from('portal_solicitacoes').select('*').eq('tipo','novo_colaborador').order('criado_em', { ascending: false })
    if (filtro !== 'todos') q.eq('status', filtro)
    const { data } = await q
    setRows(data ?? [])
    setLoad(false)
  }, [filtro])

  useEffect(() => { fetch() }, [fetch])

  async function aprovar(r: any) {
    const nome = perfil?.username ?? perfil?.email ?? 'RH'
    // Tenta com colunas extras; se falhar, tenta só o status
    let { error } = await supabase.from('portal_solicitacoes').update({
      status: 'aprovado',
      aprovado_por:  perfil?.id ?? null,
      aprovado_em:   new Date().toISOString(),
      aprovado_nome: nome,
    }).eq('id', r.id)

    if (error) {
      // colunas extras ainda não existem no banco — salva só o status
      const { error: err2 } = await supabase.from('portal_solicitacoes')
        .update({ status: 'aprovado' }).eq('id', r.id)
      if (err2) { toast.error('Erro ao aprovar: ' + err2.message); return }
    }
    toast.success('Solicitação aprovada!')
    fetch()
  }

  async function recusar() {
    if (!recusaId) return
    const { error } = await supabase.from('portal_solicitacoes').update({
      status: 'recusado',
      observacoes_admin: motivoRecusa || 'Recusado',
    }).eq('id', recusaId)
    if (error) {
      // tenta sem observacoes_admin caso coluna não exista
      const { error: err2 } = await supabase.from('portal_solicitacoes')
        .update({ status: 'recusado' }).eq('id', recusaId)
      if (err2) { toast.error('Erro: ' + err2.message); return }
    }
    toast.success('Solicitação recusada')
    setRecusaId(null); setMotivoRecusa(''); fetch()
  }

  const badge = (s: string) => {
    if (s==='aprovado') return { bg:'#dcfce7', cor:'#15803d', label:'✓ Aprovado' }
    if (s==='recusado') return { bg:'#fee2e2', cor:'#dc2626', label:'✗ Recusado' }
    return                     { bg:'#fef3c7', cor:'#b45309', label:'⏳ Pendente' }
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {(['pendente','aprovado','recusado','todos'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            height:32, padding:'0 12px', borderRadius:7, cursor:'pointer', fontWeight:600, fontSize:12,
            border:`1px solid ${filtro===f?'var(--primary)':'var(--border)'}`,
            background:filtro===f?'var(--primary)':'var(--card)',
            color:filtro===f?'#fff':'var(--foreground)',
          }}>
            {f==='pendente'?'⏳ Pendentes':f==='aprovado'?'✓ Aprovadas':f==='recusado'?'✗ Recusadas':'Todas'}
          </button>
        ))}
        <button onClick={fetch} style={{ height:32, width:32, borderRadius:7, border:'1px solid var(--border)', background:'var(--card)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <RefreshCw size={14}/>
        </button>
      </div>

      {load ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--muted-foreground)' }}>Carregando…</div>
      ) : rows.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:48, textAlign:'center', color:'var(--muted-foreground)' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
          Nenhuma solicitação {filtro !== 'todos' ? `"${filtro}"` : ''}
        </div>
      ) : (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          {rows.map((r, i) => {
            const d  = r.dados ?? {}
            const b  = badge(r.status)
            const fn = funcoes.find(f => f.id === d.funcao_id)
            const ob = obras.find(o => o.id === r.obra_id)
            return (
              <div key={r.id} style={{ padding:'14px 18px', borderTop:i>0?'1px solid var(--border)':'none', display:'flex', gap:14, alignItems:'center' }}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:'linear-gradient(135deg,#1e3a5f,#2d6a4f)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:800, fontSize:14, flexShrink:0 }}>
                  {(d.nome??'?').slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:14 }}>{d.nome??'—'}</div>
                  <div style={{ fontSize:11, color:'var(--muted-foreground)', marginTop:2, display:'flex', gap:8, flexWrap:'wrap' }}>
                    {d.cpf && <span>CPF: {d.cpf}</span>}
                    {fn && <span>🏷️ {fn.nome}</span>}
                    {ob && <span>🏗️ {ob.nome}</span>}
                    {d.data_admissao && <span>📅 {new Date(d.data_admissao+'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted-foreground)', marginTop:2 }}>
                    Enviado {new Date(r.criado_em).toLocaleString('pt-BR')}
                    {r.aprovado_nome && <span style={{ marginLeft:8, color:'#15803d', fontWeight:600 }}>· ✓ {r.aprovado_nome}</span>}
                    {r.observacoes_admin && <span style={{ marginLeft:8, color:'#dc2626' }}>· {r.observacoes_admin}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <span style={{ background:b.bg, color:b.cor, borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:700 }}>{b.label}</span>
                  <Button size="sm" variant="outline" onClick={() => setModalVer(r)} style={{ height:30, fontSize:12, gap:4 }}>
                    <Eye size={13}/> Ver
                  </Button>
                  <Button size="sm" onClick={() => gerarPDFCadastro(r, funcoes, obras)}
                    style={{ height:30, fontSize:12, background:'#1e3a5f', color:'#fff', gap:4 }}>
                    🖨️ PDF
                  </Button>
                  {r.status === 'pendente' && (<>
                    <Button size="sm" onClick={() => aprovar(r)}
                      style={{ height:30, fontSize:12, background:'#15803d', color:'#fff' }}>
                      <Check size={13}/> Aprovar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setRecusaId(r.id); setMotivoRecusa('') }}
                      style={{ height:30, fontSize:12, borderColor:'#dc2626', color:'#dc2626' }}>
                      <X size={13}/>
                    </Button>
                  </>)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Ver */}
      {modalVer && (() => {
        const d = modalVer.dados ?? {}
        const fn = funcoes.find(f => f.id === d.funcao_id)
        const ob = obras.find(o => o.id === modalVer.obra_id)
        const b  = badge(modalVer.status)
        const fmtDate = (v: string) => v ? new Date(v+'T12:00:00').toLocaleDateString('pt-BR') : '—'
        const fmt = (v: any) => v || '—'
        const sexo: Record<string,string>  = { M:'Masculino', F:'Feminino' }
        const civil: Record<string,string> = { solteiro:'Solteiro(a)', casado:'Casado(a)', divorciado:'Divorciado(a)', viuvo:'Viúvo(a)', uniao_estavel:'União Estável' }
        const vtLabel: Record<string,string> = { nenhum:'Não recebe', gasolina:'Aux. Gasolina', transporte:'Transporte Público' }
        const contr:   Record<string,string> = { clt:'CLT', autonomo:'Autônomo / PJ', estagio:'Estágio' }
        const tconta:  Record<string,string> = { corrente:'Corrente', poupanca:'Poupança', salario:'Conta Salário' }

        const SV = ({ t, children }: { t: string; children: React.ReactNode }) => (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'.07em', color:'#fff', background:'#1e3a5f', padding:'3px 8px', borderRadius:'3px 3px 0 0' }}>{t}</div>
            <div style={{ border:'1px solid #e5e7eb', borderTop:'none', borderRadius:'0 0 5px 5px', overflow:'hidden' }}>{children}</div>
          </div>
        )
        const Row = ({ a, av, b: bb, bv }: { a:string; av:string; b?:string; bv?:string }) => (
          <div style={{ display:'grid', gridTemplateColumns: bb ? '1fr 1fr' : '1fr', borderBottom:'1px solid #e5e7eb' }}>
            <div style={{ display:'flex' }}>
              <span style={{ width:130, padding:'6px 8px', background:'#f9fafb', fontSize:11, fontWeight:700, color:'#374151', flexShrink:0 }}>{a}</span>
              <span style={{ padding:'6px 8px', fontSize:12 }}>{av}</span>
            </div>
            {bb && (
              <div style={{ display:'flex', borderLeft:'1px solid #e5e7eb' }}>
                <span style={{ width:130, padding:'6px 8px', background:'#f9fafb', fontSize:11, fontWeight:700, color:'#374151', flexShrink:0 }}>{bb}</span>
                <span style={{ padding:'6px 8px', fontSize:12 }}>{bv}</span>
              </div>
            )}
          </div>
        )

        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
            <div style={{ background:'var(--background)', borderRadius:14, width:'100%', maxWidth:720, maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:16 }}>👷 {d.nome??'—'}</div>
                  <div style={{ fontSize:12, color:'var(--muted-foreground)', marginTop:2, display:'flex', gap:8, flexWrap:'wrap' }}>
                    {ob && <span>🏗️ {ob.nome}</span>}
                    <span style={{ background:b.bg, color:b.cor, borderRadius:5, padding:'1px 7px', fontWeight:700, fontSize:11 }}>{b.label}</span>
                    {modalVer.aprovado_nome && <span style={{ color:'#15803d', fontWeight:600 }}>✓ {modalVer.aprovado_nome}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <Button size="sm" onClick={() => gerarPDFCadastro(modalVer, funcoes, obras)} style={{ background:'#1e3a5f', color:'#fff', height:32, fontSize:12 }}>
                    🖨️ PDF
                  </Button>
                  <button onClick={() => setModalVer(null)} style={{ border:'none', background:'none', cursor:'pointer', fontSize:18, color:'var(--muted-foreground)', padding:'0 4px' }}>✕</button>
                </div>
              </div>
              <div style={{ overflowY:'auto', flex:1, padding:'16px 20px' }}>
                <SV t="Identificação">
                  <Row a="Nome" av={fmt(d.nome)} />
                  <Row a="CPF" av={fmt(d.cpf)} b="RG" bv={fmt(d.rg)} />
                  <Row a="PIS / NIT" av={fmt(d.pis_nit)} b="Nascimento" bv={fmtDate(d.data_nascimento)} />
                  <Row a="Sexo" av={sexo[d.genero??'']??fmt(d.genero)} b="Estado Civil" bv={civil[d.estado_civil??'']??fmt(d.estado_civil)} />
                  <Row a="Telefone" av={fmt(d.telefone)} b="E-mail" bv={fmt(d.email)} />
                  <Row a="CTPS Nº" av={fmt(d.ctps_numero)} b="Série" bv={fmt(d.ctps_serie)} />
                </SV>
                <SV t="Endereço">
                  <Row a="Endereço" av={fmt(d.endereco)} />
                  <Row a="Cidade" av={fmt(d.cidade)} b="UF" bv={fmt(d.estado)} />
                  <Row a="CEP" av={fmt(d.cep)} />
                </SV>
                <SV t="Contrato">
                  <Row a="Função" av={fn?.nome??'—'} b="Tipo" bv={contr[d.tipo_contrato??'']??fmt(d.tipo_contrato)} />
                  <Row a="Data de Admissão" av={fmtDate(d.data_admissao)} b="Obra" bv={ob?.nome??'—'} />
                </SV>
                <SV t="Dados Bancários">
                  <Row a="Banco" av={fmt(d.banco)} b="Tipo de Conta" bv={tconta[d.tipo_conta??'']??fmt(d.tipo_conta)} />
                  <Row a="Agência" av={fmt(d.agencia)} b="Conta" bv={fmt(d.conta)} />
                  <Row a="Tipo PIX" av={fmt(d.pix_tipo)} b="Chave PIX" bv={fmt(d.pix_chave)} />
                </SV>
                <SV t="Vale Transporte">
                  <Row a="Modalidade" av={vtLabel[d.vt_modalidade??'nenhum']??fmt(d.vt_modalidade)} />
                  {d.vt_modalidade==='gasolina' && <Row a="Valor diário" av={d.vt_gasolina_valor_dia ? `R$ ${parseFloat(d.vt_gasolina_valor_dia).toFixed(2)}` : '—'} />}
                  {d.vt_modalidade==='transporte' && <>
                    <Row a="Empresa Cartão" av={fmt(d.vt_cartao_tipo)} b="Nº Cartão" bv={fmt(d.vt_cartao_numero)} />
                    <Row a="Trechos de Ida" av={fmt(d.vt_trecho_ida)} />
                    <Row a="Trechos de Volta" av={fmt(d.vt_trecho_volta)} />
                  </>}
                </SV>
                {d.observacoes && <SV t="Observações"><Row a="Obs." av={d.observacoes} /></SV>}
              </div>
              <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:11, color:'var(--muted-foreground)' }}>ℹ️ Cadastre manualmente após verificar os dados</span>
                <div style={{ display:'flex', gap:8 }}>
                  {modalVer.status==='pendente' && (
                    <Button size="sm" onClick={() => { aprovar(modalVer); setModalVer(null) }} style={{ height:32, fontSize:12, background:'#15803d', color:'#fff' }}>
                      <Check size={13}/> Aprovar
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setModalVer(null)} style={{ height:32 }}>Fechar</Button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modal Recusa */}
      {recusaId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:14, width:'100%', maxWidth:400, padding:22, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:12 }}>✗ Recusar Solicitação</div>
            <label style={{ fontSize:12, fontWeight:700, display:'block', marginBottom:6, color:'var(--muted-foreground)' }}>Motivo (opcional)</label>
            <textarea value={motivoRecusa} onChange={e => setMotivoRecusa(e.target.value)} rows={3}
              placeholder="Motivo da recusa…"
              style={{ width:'100%', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', fontSize:13, boxSizing:'border-box', background:'var(--input)', color:'var(--foreground)', marginBottom:14, resize:'none' }} />
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <Button variant="outline" onClick={() => setRecusaId(null)}>Cancelar</Button>
              <Button onClick={recusar} style={{ background:'#dc2626', color:'#fff' }}>✗ Confirmar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── HELPERS compartilhados ───────────────────────────────────────────────────
function stBadge(s: string) {
  if (s === 'aprovado'   || s === 'atendido' || s === 'processado')
    return { bg:'#dcfce7', cor:'#15803d', label:'✓ Aprovado' }
  if (s === 'recusado'   || s === 'descartado')
    return { bg:'#fee2e2', cor:'#dc2626', label:'✗ Recusado' }
  return { bg:'#fef3c7', cor:'#b45309', label:'⏳ Pendente' }
}

// ─── utilitário global: abre/baixa URL ou base64 ─────────────────────────────
function abrirArquivo(url: string, nome?: string) {
  if (!url) return
  if (url.startsWith('http')) { window.open(url, '_blank', 'noopener,noreferrer'); return }
  try {
    const arr   = url.split(',')
    const mime  = arr[0].match(/:(.*?);/)?.[1] ?? 'application/octet-stream'
    const bstr  = atob(arr[1])
    const u8arr = new Uint8Array(bstr.length)
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i)
    const blob    = new Blob([u8arr], { type: mime })
    const blobUrl = URL.createObjectURL(blob)
    const ext     = mime.includes('pdf') ? 'pdf' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : mime.includes('png') ? 'png' : 'bin'
    const link    = document.createElement('a')
    link.href = blobUrl; link.download = nome ?? `arquivo.${ext}`
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)
  } catch {
    const win = window.open('', '_blank')
    if (win) { win.document.write(`<html><body style="margin:0;background:#000"><img src="${url}" style="max-width:100%;display:block;margin:auto"/></body></html>`); win.document.close() }
  }
}

// ─── aba: Ocorrências ─────────────────────────────────────────────────────────
function TabOcorrencias({ obras, colabs, perfil }: { obras: Obra[]; colabs: Colab[]; perfil: any }) {
  const [rows,       setRows]       = useState<any[]>([])
  const [load,       setLoad]       = useState(true)
  const [filtro,     setFiltro]     = useState<'pendente'|'aprovado'|'recusado'|'todos'>('pendente')
  const [modal,      setModal]      = useState<any|null>(null)
  const [recusaId,   setRecusaId]   = useState<string|null>(null)
  const [motivoRec,  setMotivoRec]  = useState('')

  const doFetch = useCallback(async () => {
    setLoad(true)
    const q = supabase.from('portal_ocorrencias').select('*').order('criado_em', { ascending: false })
    if (filtro === 'pendente')  q.is('sincronizado_em', null).neq('status','recusado')
    if (filtro === 'aprovado')  q.not('sincronizado_em', 'is', null)
    if (filtro === 'recusado')  q.eq('status','recusado')
    const { data } = await q
    setRows(data ?? [])
    setLoad(false)
  }, [filtro])

  useEffect(() => { doFetch() }, [doFetch])

  async function aprovar(id: string) {
    const nome = perfil?.username ?? perfil?.email ?? 'RH'
    await supabase.from('portal_ocorrencias').update({
      sincronizado_em: new Date().toISOString(),
      aprovado_por: perfil?.id, aprovado_nome: nome,
    }).eq('id', id)
    toast.success('Ocorrência aprovada')
    doFetch()
    if (modal?.id === id) setModal(null)
  }

  async function recusar(id: string) {
    await supabase.from('portal_ocorrencias').update({
      status: 'recusado', motivo_recusa: motivoRec || 'Sem motivo informado',
    }).eq('id', id)
    toast.success('Ocorrência recusada')
    setRecusaId(null); setMotivoRec('')
    doFetch()
  }

  async function gerarPDF(r: any) {
    const ob = obras.find(o => o.id === r.obra_id)?.nome ?? '—'
    const co = colabs.find(c => c.id === r.colaborador_id)?.nome ?? '—'
    const tipoLabel: Record<string,string> = { acidente:'🚨 Acidente', atestado:'🏥 Atestado', advertencia:'⚠️ Advertência', geral:'📋 Geral' }
    const titulo = tipoLabel[r.tipo] ?? r.tipo

    const campos = [
      ['Tipo',             titulo],
      ['Colaborador',      co],
      ['Obra',             ob],
      ['Data Ocorrência',  r.data_ocorrencia ? new Date(r.data_ocorrencia+'T12:00:00').toLocaleDateString('pt-BR') : ''],
      ['Hora',             r.hora_acidente],
      ['Local',            r.local],
      ['Gravidade',        r.gravidade],
      ['CAT Emitida',      r.cat_emitida != null ? (r.cat_emitida ? 'Sim' : 'Não') : ''],
      ['Tipo de Acidente', r.tipo_acidente],
      ['Tipo de Atestado', r.tipo_atestado],
      ['Dias Afastamento', r.dias_afastamento],
      ['CID',              r.cid],
      ['Médico',           r.medico],
      ['Tipo Advertência', r.tipo_adv],
      ['Dias Suspensão',   r.dias_suspensao],
      ['Assinada',         r.assinada != null ? (r.assinada ? 'Sim' : 'Não') : ''],
      ['Motivo',           r.motivo],
      ['Observações',      r.observacoes],
      ['Enviado em',       new Date(r.criado_em).toLocaleString('pt-BR')],
    ].filter(([,v]) => v)

    const linhas = campos.map(([l,v]) =>
      `<tr><td style="width:160px;font-weight:700;color:#4b5563;padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">${l}</td>
       <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">${v}</td></tr>`
    ).join('')

    const _empOco = await fetchEmpresaData()
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${titulo}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:28px;color:#111}
    ${CABECALHO_CSS}
    table{width:100%;border-collapse:collapse}
    .ass{display:flex;gap:60px;margin-top:32px}.ass>div{flex:1;text-align:center;font-size:11px;color:#6b7280}
    .linha{border-top:1px solid #9ca3af;margin-top:28px;margin-bottom:6px}
    @media print{body{padding:16px}}</style></head><body>
    ${gerarCabecalhoHTML(_empOco, { titulo: 'Ocorrência — ' + titulo, subtitulo: 'Colaborador: ' + co + ' · Obra: ' + ob })}
    <table><tbody>${linhas}</tbody></table>
    <div class="ass">
      <div><div class="linha"></div>Colaborador / Assinatura</div>
      <div><div class="linha"></div>Responsável RH / Carimbo</div>
    </div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`

    const win = window.open('','_blank','width=850,height=700')
    if (win) { win.document.write(html); win.document.close() }
  }

  const tipoColor: Record<string,string> = { acidente:'#dc2626', atestado:'#f97316', advertencia:'#7c3aed', geral:'#0284c7' }
  const tipoLabel: Record<string,string> = { acidente:'🚨 Acidente', atestado:'🏥 Atestado', advertencia:'⚠️ Advertência', geral:'📋 Geral' }
  const isPendente = (r: any) => !r.sincronizado_em && r.status !== 'recusado'

  // usa função global abrirArquivo
  const abrirAtestado = (url: string, nome?: string) => abrirArquivo(url, nome)

  return (
    <div>
      {/* barra de filtros */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {(['pendente','aprovado','recusado','todos'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            height:32, padding:'0 12px', borderRadius:7, cursor:'pointer', fontWeight:600, fontSize:12,
            border:`1px solid ${filtro===f?'var(--primary)':'var(--border)'}`,
            background:filtro===f?'var(--primary)':'var(--card)',
            color:filtro===f?'#fff':'var(--foreground)',
          }}>
            {f==='pendente'?'⏳ Pendentes':f==='aprovado'?'✓ Aprovadas':f==='recusado'?'✗ Recusadas':'Todas'}
          </button>
        ))}
        <button onClick={doFetch} style={{ height:32, width:32, borderRadius:7, border:'1px solid var(--border)', background:'var(--card)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <RefreshCw size={14}/>
        </button>
      </div>

      {load ? <div style={{ textAlign:'center', padding:48, color:'var(--muted-foreground)' }}>Carregando…</div>
      : rows.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:48, textAlign:'center', color:'var(--muted-foreground)' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>✅</div>Nenhuma ocorrência {filtro==='pendente'?'pendente':filtro==='aprovado'?'aprovada':filtro==='recusado'?'recusada':'registrada'}
        </div>
      ) : (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          {rows.map((r, i) => {
            const ob  = obras.find(o => o.id === r.obra_id)
            const co  = colabs.find(c => c.id === r.colaborador_id)
            const cor = tipoColor[r.tipo] ?? '#6b7280'
            const b   = r.sincronizado_em
              ? { bg:'#dcfce7', cor:'#15803d', label:'✓ Aprovado' }
              : r.status === 'recusado'
              ? { bg:'#fee2e2', cor:'#dc2626', label:'✗ Recusado' }
              : { bg:'#fef3c7', cor:'#b45309', label:'⏳ Pendente' }
            return (
              <div key={r.id} style={{ padding:'12px 18px', borderTop:i>0?'1px solid var(--border)':'none', display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ width:6, height:44, borderRadius:4, background:cor, flexShrink:0 }}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <span style={{ fontWeight:700, fontSize:13 }}>{tipoLabel[r.tipo] ?? r.tipo}</span>
                    {co && <span style={{ fontSize:12, color:'var(--muted-foreground)' }}>· {co.nome}</span>}
                    {ob && <span style={{ fontSize:11, background:'#eff6ff', color:'#1d4ed8', borderRadius:4, padding:'1px 6px' }}>{ob.nome}</span>}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted-foreground)', marginTop:3, display:'flex', gap:10, flexWrap:'wrap' }}>
                    {r.data_ocorrencia && <span>📅 {new Date(r.data_ocorrencia+'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                    {r.motivo && <span style={{ fontStyle:'italic' }}>"{r.motivo}"</span>}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted-foreground)', marginTop:2 }}>
                    Enviado {new Date(r.criado_em).toLocaleString('pt-BR')}
                    {r.aprovado_nome && <span style={{ color:'#15803d', marginLeft:6 }}>✓ {r.aprovado_nome}</span>}
                    {r.motivo_recusa  && <span style={{ color:'#dc2626', marginLeft:6 }}>✗ {r.motivo_recusa}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <span style={{ background:b.bg, color:b.cor, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{b.label}</span>
                  <Button size="sm" variant="outline" onClick={() => setModal(r)} style={{ height:28, fontSize:12, padding:'0 8px' }}><Eye size={12}/></Button>
                  <Button size="sm" variant="outline" onClick={() => gerarPDF(r)} style={{ height:28, fontSize:12, padding:'0 8px' }}><FileText size={12}/></Button>
                  {r.atestado_url && (
                    <Button size="sm" variant="outline"
                      onClick={() => abrirAtestado(r.atestado_url, r.atestado_nome)}
                      style={{ height:28, fontSize:12, padding:'0 8px', borderColor:'#2563eb', color:'#2563eb' }}>
                      <Download size={12}/> Atestado
                    </Button>
                  )}
                  {isPendente(r) && <>
                    <Button size="sm" onClick={() => aprovar(r.id)} style={{ height:28, fontSize:12, background:'#15803d', color:'#fff', padding:'0 10px' }}>
                      <Check size={12}/> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setRecusaId(r.id); setMotivoRec('') }} style={{ height:28, fontSize:12, padding:'0 8px', borderColor:'#dc2626', color:'#dc2626' }}>
                      <X size={12}/> Recusar
                    </Button>
                  </>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal detalhe */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:14, width:'100%', maxWidth:520, padding:22, boxShadow:'0 20px 60px rgba(0,0,0,0.3)', maxHeight:'92vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:16 }}>{tipoLabel[modal.tipo] ?? modal.tipo}</div>
              <button onClick={() => setModal(null)} style={{ border:'none', background:'none', cursor:'pointer', fontSize:20, color:'var(--muted-foreground)' }}>✕</button>
            </div>
            {[
              ['Obra',           obras.find(o => o.id === modal.obra_id)?.nome],
              ['Colaborador',    colabs.find(c => c.id === modal.colaborador_id)?.nome],
              ['Data',           modal.data_ocorrencia ? new Date(modal.data_ocorrencia+'T12:00:00').toLocaleDateString('pt-BR') : null],
              ['Hora',           modal.hora_acidente],
              ['Local',          modal.local],
              ['Gravidade',      modal.gravidade],
              ['CAT Emitida',    modal.cat_emitida != null ? (modal.cat_emitida ? 'Sim' : 'Não') : null],
              ['Tipo Acidente',  modal.tipo_acidente],
              ['Tipo Atestado',  modal.tipo_atestado],
              ['Dias Afastamento', modal.dias_afastamento],
              ['CID',            modal.cid],
              ['Médico',         modal.medico],
              ['Tipo Advertência', modal.tipo_adv],
              ['Dias Suspensão', modal.dias_suspensao],
              ['Assinada',       modal.assinada != null ? (modal.assinada ? 'Sim' : 'Não') : null],
              ['Motivo',         modal.motivo],
              ['Observações',    modal.observacoes],
            ].filter(([,v]) => v != null && v !== '').map(([label, value]) => (
              <div key={String(label)} style={{ display:'flex', borderBottom:'1px solid var(--border)', padding:'6px 0' }}>
                <span style={{ width:150, fontSize:11, fontWeight:700, color:'var(--muted-foreground)', flexShrink:0 }}>{label}</span>
                <span style={{ fontSize:12 }}>{String(value)}</span>
              </div>
            ))}
            {modal.atestado_url && (
              <button onClick={() => abrirAtestado(modal.atestado_url, modal.atestado_nome)}
                style={{ display:'flex', alignItems:'center', gap:8, margin:'14px 0 0',
                  padding:'10px 14px', background:'#eff6ff', border:'1px solid #bfdbfe',
                  borderRadius:10, color:'#1d4ed8', fontWeight:700, fontSize:13, cursor:'pointer', width:'100%' }}>
                <Download size={16}/> 📄 Visualizar / Baixar Atestado
              </button>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16, gap:8, flexWrap:'wrap' }}>
              <Button variant="outline" onClick={() => gerarPDF(modal)} style={{ height:32, fontSize:12 }}><FileText size={13}/> PDF</Button>
              {isPendente(modal) && <>
                <Button onClick={() => aprovar(modal.id)} style={{ background:'#15803d', color:'#fff', height:32, fontSize:12 }}>
                  <Check size={13}/> Aprovar
                </Button>
                <Button variant="outline" onClick={() => { setRecusaId(modal.id); setMotivoRec(''); setModal(null) }} style={{ height:32, fontSize:12, borderColor:'#dc2626', color:'#dc2626' }}>
                  <X size={13}/> Recusar
                </Button>
              </>}
              <Button variant="outline" onClick={() => setModal(null)} style={{ height:32 }}>Fechar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal recusa */}
      {recusaId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:14, width:'100%', maxWidth:420, padding:22, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:12, color:'#dc2626' }}>✗ Recusar Ocorrência</div>
            <div style={{ fontSize:13, color:'var(--muted-foreground)', marginBottom:10 }}>Informe o motivo da recusa (opcional):</div>
            <textarea value={motivoRec} onChange={e => setMotivoRec(e.target.value)} rows={3} placeholder="Ex: Informações insuficientes…"
              style={{ width:'100%', borderRadius:8, border:'1px solid var(--border)', padding:'8px 10px', fontSize:13, resize:'vertical', background:'var(--card)', color:'var(--foreground)' }}/>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}>
              <Button variant="outline" onClick={() => setRecusaId(null)} style={{ height:32 }}>Cancelar</Button>
              <Button onClick={() => recusar(recusaId!)} style={{ background:'#dc2626', color:'#fff', height:32, fontSize:12 }}>
                <X size={13}/> Confirmar Recusa
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── aba: EPIs ────────────────────────────────────────────────────────────────
function TabEpis({ obras, colabs, perfil }: { obras: Obra[]; colabs: Colab[]; perfil: any }) {
  const [rows,      setRows]      = useState<any[]>([])
  const [load,      setLoad]      = useState(true)
  const [filtro,    setFiltro]    = useState<'pendente'|'aprovado'|'recusado'|'todos'>('pendente')
  const [modal,     setModal]     = useState<any|null>(null)
  const [recusaId,  setRecusaId]  = useState<string|null>(null)
  const [motivoRec, setMotivoRec] = useState('')

  const doFetch = useCallback(async () => {
    setLoad(true)
    const q = supabase.from('portal_epi_solicitacoes').select('*').order('criado_em', { ascending: false })
    if (filtro !== 'todos') q.eq('status', filtro)
    const { data } = await q
    setRows(data ?? [])
    setLoad(false)
  }, [filtro])

  useEffect(() => { doFetch() }, [doFetch])

  async function aprovar(id: string) {
    const nome = perfil?.username ?? perfil?.email ?? 'RH'
    await supabase.from('portal_epi_solicitacoes').update({
      status:'aprovado', aprovado_por:perfil?.id, aprovado_em:new Date().toISOString(), aprovado_nome:nome,
    }).eq('id', id)
    toast.success('EPI aprovado')
    doFetch()
    if (modal?.id === id) setModal(null)
  }

  async function recusar(id: string) {
    await supabase.from('portal_epi_solicitacoes').update({
      status:'recusado', motivo_recusa: motivoRec || 'Sem motivo informado',
    }).eq('id', id)
    toast.success('EPI recusado')
    setRecusaId(null); setMotivoRec('')
    doFetch()
  }

  async function gerarPDF(r: any) {
    const ob  = obras.find(o => o.id === r.obra_id)?.nome ?? '—'
    const co  = colabs.find(c => c.id === r.colaborador_id)?.nome ?? 'Toda a equipe'
    const _empEpi = await fetchEmpresaData()
    const ugL = (u: string) => u==='critico'?'🔴 Crítico':u==='urgente'?'🟠 Urgente':'🟢 Normal'

    const itensHtml = (r.itens ?? []).map((it: any) =>
      `<tr><td style="padding:5px 10px;border-bottom:1px solid #e5e7eb;font-size:12px">${it.nome}</td>
       <td style="padding:5px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;text-align:right;font-weight:700">×${it.quantidade}</td></tr>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Solicitação de EPI</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:28px;color:#111}
    ${CABECALHO_CSS}
    .info{display:grid;grid-template-columns:140px 1fr;gap:0;margin-bottom:18px}
    .info .label{font-weight:700;color:#4b5563;padding:5px 0;font-size:12px;border-bottom:1px solid #e5e7eb}
    .info .val{padding:5px 10px;font-size:12px;border-bottom:1px solid #e5e7eb}
    table{width:100%;border-collapse:collapse}th{background:#f1f5f9;padding:6px 10px;text-align:left;font-size:11px;font-weight:700}
    .ass{display:flex;gap:60px;margin-top:32px}.ass>div{flex:1;text-align:center;font-size:11px;color:#6b7280}
    .linha{border-top:1px solid #9ca3af;margin-top:28px;margin-bottom:6px}
    @media print{body{padding:16px}}</style></head><body>
    ${gerarCabecalhoHTML(_empEpi, { titulo: 'Solicitação de EPI', subtitulo: 'Obra: ' + ob + ' · Colaborador: ' + co })}
    <div class="info">
      <span class="label">Obra</span><span class="val">${ob}</span>
      <span class="label">Colaborador</span><span class="val">${co}</span>
      <span class="label">Urgência</span><span class="val">${ugL(r.urgencia)}</span>
      ${r.observacoes ? `<span class="label">Observações</span><span class="val">${r.observacoes}</span>` : ''}
      <span class="label">Enviado em</span><span class="val">${new Date(r.criado_em).toLocaleString('pt-BR')}</span>
    </div>
    <table><thead><tr><th>Item / EPI</th><th style="text-align:right">Qtd.</th></tr></thead>
    <tbody>${itensHtml}</tbody></table>
    <div class="ass">
      <div><div class="linha"></div>Solicitante / Assinatura</div>
      <div><div class="linha"></div>Responsável RH / Carimbo</div>
    </div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`

    const win = window.open('','_blank','width=850,height=700')
    if (win) { win.document.write(html); win.document.close() }
  }

  const ugColor = (u: string) => u==='critico'?'#dc2626':u==='urgente'?'#f97316':'#16a34a'
  const ugLabel = (u: string) => u==='critico'?'🔴 Crítico':u==='urgente'?'🟠 Urgente':'🟢 Normal'

  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {(['pendente','aprovado','recusado','todos'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            height:32, padding:'0 12px', borderRadius:7, cursor:'pointer', fontWeight:600, fontSize:12,
            border:`1px solid ${filtro===f?'var(--primary)':'var(--border)'}`,
            background:filtro===f?'var(--primary)':'var(--card)',
            color:filtro===f?'#fff':'var(--foreground)',
          }}>
            {f==='pendente'?'⏳ Pendentes':f==='aprovado'?'✓ Aprovadas':f==='recusado'?'✗ Recusadas':'Todas'}
          </button>
        ))}
        <button onClick={doFetch} style={{ height:32, width:32, borderRadius:7, border:'1px solid var(--border)', background:'var(--card)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <RefreshCw size={14}/>
        </button>
      </div>

      {load ? <div style={{ textAlign:'center', padding:48, color:'var(--muted-foreground)' }}>Carregando…</div>
      : rows.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:48, textAlign:'center', color:'var(--muted-foreground)' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🦺</div>Nenhuma solicitação {filtro==='pendente'?'pendente':filtro==='aprovado'?'aprovada':filtro==='recusado'?'recusada':'registrada'}
        </div>
      ) : (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          {rows.map((r, i) => {
            const ob = obras.find(o => o.id === r.obra_id)
            const co = colabs.find(c => c.id === r.colaborador_id)
            const b  = stBadge(r.status)
            const pend = r.status === 'pendente'
            return (
              <div key={r.id} style={{ padding:'12px 18px', borderTop:i>0?'1px solid var(--border)':'none', display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontWeight:700, fontSize:13 }}>🦺 {r.itens?.length ?? 0} item(s)</span>
                    <span style={{ fontSize:11, fontWeight:700, color:ugColor(r.urgencia) }}>{ugLabel(r.urgencia)}</span>
                    {ob && <span style={{ fontSize:11, background:'#eff6ff', color:'#1d4ed8', borderRadius:4, padding:'1px 6px' }}>{ob.nome}</span>}
                    {co && <span style={{ fontSize:11, color:'var(--muted-foreground)' }}>· {co.nome}</span>}
                  </div>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:4 }}>
                    {(r.itens ?? []).slice(0,4).map((it: any, j: number) => (
                      <span key={j} style={{ background:'#f3f4f6', color:'#374151', borderRadius:5, padding:'2px 7px', fontSize:11 }}>{it.nome} ×{it.quantidade}</span>
                    ))}
                    {(r.itens ?? []).length > 4 && <span style={{ fontSize:11, color:'var(--muted-foreground)' }}>+{r.itens.length-4} mais</span>}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted-foreground)' }}>
                    {new Date(r.criado_em).toLocaleString('pt-BR')}
                    {r.aprovado_nome && <span style={{ color:'#15803d', marginLeft:6 }}>✓ {r.aprovado_nome}</span>}
                    {r.motivo_recusa  && <span style={{ color:'#dc2626', marginLeft:6 }}>✗ {r.motivo_recusa}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <span style={{ background:b.bg, color:b.cor, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{b.label}</span>
                  <Button size="sm" variant="outline" onClick={() => setModal(r)} style={{ height:28, fontSize:12, padding:'0 8px' }}><Eye size={12}/></Button>
                  <Button size="sm" variant="outline" onClick={() => gerarPDF(r)} style={{ height:28, fontSize:12, padding:'0 8px' }}><FileText size={12}/></Button>
                  {pend && <>
                    <Button size="sm" onClick={() => aprovar(r.id)} style={{ height:28, fontSize:12, background:'#15803d', color:'#fff', padding:'0 10px' }}>
                      <Check size={12}/> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setRecusaId(r.id); setMotivoRec('') }} style={{ height:28, fontSize:12, padding:'0 8px', borderColor:'#dc2626', color:'#dc2626' }}>
                      <X size={12}/> Recusar
                    </Button>
                  </>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal detalhe */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:14, width:'100%', maxWidth:500, padding:22, boxShadow:'0 20px 60px rgba(0,0,0,0.3)', maxHeight:'92vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:16 }}>🦺 Solicitação de EPI</div>
              <button onClick={() => setModal(null)} style={{ border:'none', background:'none', cursor:'pointer', fontSize:20, color:'var(--muted-foreground)' }}>✕</button>
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted-foreground)', marginBottom:6, letterSpacing:.5 }}>ITENS SOLICITADOS</div>
              {(modal.itens ?? []).map((it: any, idx: number) => (
                <div key={idx} style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid var(--border)', padding:'6px 0' }}>
                  <span style={{ fontSize:13 }}>{it.nome}</span>
                  <span style={{ fontSize:12, fontWeight:700 }}>×{it.quantidade}</span>
                </div>
              ))}
            </div>
            {[
              ['Obra',       obras.find(o => o.id === modal.obra_id)?.nome],
              ['Colaborador',colabs.find(c => c.id === modal.colaborador_id)?.nome ?? 'Toda a equipe'],
              ['Urgência',   modal.urgencia],
              ['Observações',modal.observacoes],
            ].filter(([,v]) => v).map(([l,v]) => (
              <div key={String(l)} style={{ display:'flex', borderBottom:'1px solid var(--border)', padding:'6px 0' }}>
                <span style={{ width:130, fontSize:11, fontWeight:700, color:'var(--muted-foreground)', flexShrink:0 }}>{l}</span>
                <span style={{ fontSize:12 }}>{String(v)}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16, gap:8, flexWrap:'wrap' }}>
              <Button variant="outline" onClick={() => gerarPDF(modal)} style={{ height:32, fontSize:12 }}><FileText size={13}/> PDF</Button>
              {modal.status === 'pendente' && <>
                <Button onClick={() => aprovar(modal.id)} style={{ background:'#15803d', color:'#fff', height:32, fontSize:12 }}>
                  <Check size={13}/> Aprovar
                </Button>
                <Button variant="outline" onClick={() => { setRecusaId(modal.id); setMotivoRec(''); setModal(null) }} style={{ height:32, fontSize:12, borderColor:'#dc2626', color:'#dc2626' }}>
                  <X size={13}/> Recusar
                </Button>
              </>}
              <Button variant="outline" onClick={() => setModal(null)} style={{ height:32 }}>Fechar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal recusa */}
      {recusaId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:14, width:'100%', maxWidth:420, padding:22, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:12, color:'#dc2626' }}>✗ Recusar Solicitação de EPI</div>
            <div style={{ fontSize:13, color:'var(--muted-foreground)', marginBottom:10 }}>Informe o motivo (opcional):</div>
            <textarea value={motivoRec} onChange={e => setMotivoRec(e.target.value)} rows={3}
              placeholder="Ex: Itens não disponíveis em estoque…"
              style={{ width:'100%', borderRadius:8, border:'1px solid var(--border)', padding:'8px 10px', fontSize:13, resize:'vertical', background:'var(--card)', color:'var(--foreground)' }}/>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}>
              <Button variant="outline" onClick={() => setRecusaId(null)} style={{ height:32 }}>Cancelar</Button>
              <Button onClick={() => recusar(recusaId!)} style={{ background:'#dc2626', color:'#fff', height:32, fontSize:12 }}>
                <X size={13}/> Confirmar Recusa
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── aba: Documentos ─────────────────────────────────────────────────────────
function TabDocumentos({ obras, colabs, perfil }: { obras: Obra[]; colabs: Colab[]; perfil: any }) {
  const [rows,      setRows]      = useState<any[]>([])
  const [load,      setLoad]      = useState(true)
  const [filtro,    setFiltro]    = useState<'pendente'|'aprovado'|'recusado'|'todos'>('pendente')
  const [modal,     setModal]     = useState<any|null>(null)
  const [recusaId,  setRecusaId]  = useState<string|null>(null)
  const [motivoRec, setMotivoRec] = useState('')

  const doFetch = useCallback(async () => {
    setLoad(true)
    const q = supabase.from('portal_documentos').select('*').order('criado_em', { ascending: false })
    if (filtro !== 'todos') q.eq('status', filtro)
    const { data } = await q
    setRows(data ?? [])
    setLoad(false)
  }, [filtro])

  useEffect(() => { doFetch() }, [doFetch])

  async function aprovar(id: string) {
    const nome = perfil?.username ?? perfil?.email ?? 'RH'
    await supabase.from('portal_documentos').update({
      status:'aprovado', aprovado_por:perfil?.id, aprovado_em:new Date().toISOString(), aprovado_nome:nome,
    }).eq('id', id)
    toast.success('Documento aprovado')
    doFetch()
    if (modal?.id === id) setModal(null)
  }

  async function recusar(id: string) {
    await supabase.from('portal_documentos').update({
      status:'recusado', motivo_recusa: motivoRec || 'Sem motivo informado',
    }).eq('id', id)
    toast.success('Documento recusado')
    setRecusaId(null); setMotivoRec('')
    doFetch()
  }

  async function gerarPDF(r: any) {
    const ob = obras.find(o => o.id === r.obra_id)?.nome ?? '—'
    const co = colabs.find(c => c.id === r.colaborador_id)?.nome ?? 'Geral'
    const tipoLabel: Record<string,string> = {
      rg:'RG', cpf:'CPF', aso:'ASO / Exame Médico', ctps:'CTPS',
      comprovante:'Comprovante de Residência', foto:'Foto do Colaborador',
      certificado:'Certificado / Treinamento', nr:'NR / Segurança', outro:'Outro',
      atestado:'🏥 Atestado Médico',
    }

    const imgHtml = r.arquivo_url && r.arquivo_tipo?.startsWith('image/')
      ? `<div style="margin:12px 0;text-align:center"><img src="${r.arquivo_url}" style="max-width:100%;max-height:300px;object-fit:contain;border-radius:6px;border:1px solid #e5e7eb"/></div>`
      : r.arquivo_url
      ? `<div style="margin:12px 0"><a href="${r.arquivo_url}" style="color:#1e3a5f;font-weight:700">📎 Ver arquivo anexado</a></div>`
      : ''

    const _empDoc = await fetchEmpresaData()
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Documento — ${tipoLabel[r.tipo]??r.tipo}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;padding:28px;color:#111}
    ${CABECALHO_CSS}
    .row{display:flex;border-bottom:1px solid #e5e7eb;padding:6px 0}
    .row .label{width:160px;font-weight:700;color:#4b5563;font-size:12px;flex-shrink:0}
    .row .val{font-size:12px}
    .ass{display:flex;gap:60px;margin-top:32px}.ass>div{flex:1;text-align:center;font-size:11px;color:#6b7280}
    .linha{border-top:1px solid #9ca3af;margin-top:28px;margin-bottom:6px}
    @media print{body{padding:16px}}</style></head><body>
    ${gerarCabecalhoHTML(_empDoc, { titulo: 'Documento — ' + (tipoLabel[r.tipo]??r.tipo), subtitulo: 'Obra: ' + ob + ' · Colaborador: ' + co })}
    ${imgHtml}
    <div class="row"><span class="label">Tipo</span><span class="val">${tipoLabel[r.tipo]??r.tipo}</span></div>
    <div class="row"><span class="label">Obra</span><span class="val">${ob}</span></div>
    <div class="row"><span class="label">Colaborador</span><span class="val">${co}</span></div>
    ${r.descricao?`<div class="row"><span class="label">Descrição</span><span class="val">${r.descricao}</span></div>`:''}
    ${r.arquivo_nome?`<div class="row"><span class="label">Arquivo</span><span class="val">${r.arquivo_nome}</span></div>`:''}
    <div class="row"><span class="label">Enviado em</span><span class="val">${new Date(r.criado_em).toLocaleString('pt-BR')}</span></div>
    <div class="ass">
      <div><div class="linha"></div>Colaborador / Assinatura</div>
      <div><div class="linha"></div>Responsável RH / Carimbo</div>
    </div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`

    const win = window.open('','_blank','width=850,height=700')
    if (win) { win.document.write(html); win.document.close() }
  }

  const tipoLabel: Record<string,string> = {
    rg:'RG', cpf:'CPF', aso:'ASO / Exame Médico', ctps:'CTPS',
    comprovante:'Comprovante de Residência', foto:'Foto do Colaborador',
    certificado:'Certificado / Treinamento', nr:'NR / Segurança', outro:'Outro',
  }

  return (
    <div>
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {(['pendente','aprovado','recusado','todos'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            height:32, padding:'0 12px', borderRadius:7, cursor:'pointer', fontWeight:600, fontSize:12,
            border:`1px solid ${filtro===f?'var(--primary)':'var(--border)'}`,
            background:filtro===f?'var(--primary)':'var(--card)',
            color:filtro===f?'#fff':'var(--foreground)',
          }}>
            {f==='pendente'?'⏳ Pendentes':f==='aprovado'?'✓ Aprovados':f==='recusado'?'✗ Recusados':'Todos'}
          </button>
        ))}
        <button onClick={doFetch} style={{ height:32, width:32, borderRadius:7, border:'1px solid var(--border)', background:'var(--card)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <RefreshCw size={14}/>
        </button>
      </div>

      {load ? <div style={{ textAlign:'center', padding:48, color:'var(--muted-foreground)' }}>Carregando…</div>
      : rows.length === 0 ? (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:48, textAlign:'center', color:'var(--muted-foreground)' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📭</div>Nenhum documento {filtro==='pendente'?'pendente':filtro==='aprovado'?'aprovado':filtro==='recusado'?'recusado':'registrado'}
        </div>
      ) : (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          {rows.map((r, i) => {
            const ob   = obras.find(o => o.id === r.obra_id)
            const co   = colabs.find(c => c.id === r.colaborador_id)
            const b    = stBadge(r.status)
            const pend = r.status === 'pendente'
            const isImg = r.arquivo_tipo?.startsWith('image/')
            return (
              <div key={r.id} style={{ padding:'12px 18px', borderTop:i>0?'1px solid var(--border)':'none', display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ width:44, height:44, borderRadius:8, overflow:'hidden', flexShrink:0, background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {isImg && r.arquivo_url
                    ? <img src={r.arquivo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                    : <span style={{ fontSize:20 }}>📄</span>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{tipoLabel[r.tipo] ?? r.tipo}</div>
                  <div style={{ fontSize:11, color:'var(--muted-foreground)', marginTop:2, display:'flex', gap:8, flexWrap:'wrap' }}>
                    {co && <span>👤 {co.nome}</span>}
                    {ob && <span style={{ background:'#eff6ff', color:'#1d4ed8', borderRadius:4, padding:'1px 5px' }}>{ob.nome}</span>}
                    {r.descricao && <span style={{ fontStyle:'italic' }}>{r.descricao}</span>}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted-foreground)', marginTop:2 }}>
                    {new Date(r.criado_em).toLocaleString('pt-BR')}
                    {r.aprovado_nome && <span style={{ color:'#15803d', marginLeft:6 }}>✓ {r.aprovado_nome}</span>}
                    {r.motivo_recusa  && <span style={{ color:'#dc2626', marginLeft:6 }}>✗ {r.motivo_recusa}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:5, alignItems:'center', flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <span style={{ background:b.bg, color:b.cor, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{b.label}</span>
                  <Button size="sm" variant="outline" onClick={() => setModal(r)} style={{ height:28, fontSize:12, padding:'0 8px' }}><Eye size={12}/></Button>
                  <Button size="sm" variant="outline" onClick={() => gerarPDF(r)} style={{ height:28, fontSize:12, padding:'0 8px' }}><FileText size={12}/></Button>
                  {r.arquivo_url && (
                    <Button size="sm" variant="outline"
                      onClick={() => abrirArquivo(r.arquivo_url, r.arquivo_nome)}
                      style={{ height:28, fontSize:12, padding:'0 8px' }}>
                      <Download size={12}/>
                    </Button>
                  )}
                  {pend && <>
                    <Button size="sm" onClick={() => aprovar(r.id)} style={{ height:28, fontSize:12, background:'#15803d', color:'#fff', padding:'0 10px' }}>
                      <Check size={12}/> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setRecusaId(r.id); setMotivoRec('') }} style={{ height:28, fontSize:12, padding:'0 8px', borderColor:'#dc2626', color:'#dc2626' }}>
                      <X size={12}/> Recusar
                    </Button>
                  </>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal detalhe */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:14, width:'100%', maxWidth:560, padding:22, boxShadow:'0 20px 60px rgba(0,0,0,0.3)', maxHeight:'92vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:16 }}>📎 {tipoLabel[modal.tipo] ?? modal.tipo}</div>
              <button onClick={() => setModal(null)} style={{ border:'none', background:'none', cursor:'pointer', fontSize:20, color:'var(--muted-foreground)' }}>✕</button>
            </div>
            {modal.arquivo_url && modal.arquivo_tipo?.startsWith('image/') && (
              <img src={modal.arquivo_url} alt="documento" style={{ width:'100%', maxHeight:300, objectFit:'contain', borderRadius:8, marginBottom:12, background:'#f9fafb', border:'1px solid var(--border)' }} />
            )}
            {modal.arquivo_url && !modal.arquivo_tipo?.startsWith('image/') && (
              <button onClick={() => abrirArquivo(modal.arquivo_url, modal.arquivo_nome)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'#eff6ff', borderRadius:8, marginBottom:12, color:'#1e3a5f', fontWeight:600, border:'none', cursor:'pointer', width:'100%' }}>
                <Download size={16}/> Baixar arquivo anexado
              </button>
            )}
            {[
              ['Tipo',       tipoLabel[modal.tipo] ?? modal.tipo],
              ['Obra',       obras.find(o => o.id === modal.obra_id)?.nome],
              ['Colaborador',colabs.find(c => c.id === modal.colaborador_id)?.nome ?? 'Geral'],
              ['Descrição',  modal.descricao],
              ['Arquivo',    modal.arquivo_nome],
            ].filter(([,v]) => v).map(([l,v]) => (
              <div key={String(l)} style={{ display:'flex', borderBottom:'1px solid var(--border)', padding:'6px 0' }}>
                <span style={{ width:130, fontSize:11, fontWeight:700, color:'var(--muted-foreground)', flexShrink:0 }}>{l}</span>
                <span style={{ fontSize:12 }}>{String(v)}</span>
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16, gap:8, flexWrap:'wrap' }}>
              <Button variant="outline" onClick={() => gerarPDF(modal)} style={{ height:32, fontSize:12 }}><FileText size={13}/> PDF</Button>
              {modal.status === 'pendente' && <>
                <Button onClick={() => aprovar(modal.id)} style={{ background:'#15803d', color:'#fff', height:32, fontSize:12 }}>
                  <Check size={13}/> Aprovar
                </Button>
                <Button variant="outline" onClick={() => { setRecusaId(modal.id); setMotivoRec(''); setModal(null) }} style={{ height:32, fontSize:12, borderColor:'#dc2626', color:'#dc2626' }}>
                  <X size={13}/> Recusar
                </Button>
              </>}
              <Button variant="outline" onClick={() => setModal(null)} style={{ height:32 }}>Fechar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal recusa */}
      {recusaId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:14, width:'100%', maxWidth:420, padding:22, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:12, color:'#dc2626' }}>✗ Recusar Documento</div>
            <div style={{ fontSize:13, color:'var(--muted-foreground)', marginBottom:10 }}>Informe o motivo (opcional):</div>
            <textarea value={motivoRec} onChange={e => setMotivoRec(e.target.value)} rows={3}
              placeholder="Ex: Documento ilegível, enviar novamente…"
              style={{ width:'100%', borderRadius:8, border:'1px solid var(--border)', padding:'8px 10px', fontSize:13, resize:'vertical', background:'var(--card)', color:'var(--foreground)' }}/>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}>
              <Button variant="outline" onClick={() => setRecusaId(null)} style={{ height:32 }}>Cancelar</Button>
              <Button onClick={() => recusar(recusaId!)} style={{ background:'#dc2626', color:'#fff', height:32, fontSize:12 }}>
                <X size={13}/> Confirmar Recusa
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ABA: DESLIGAMENTOS ───────────────────────────────────────────────────────
function TabDesligamentos({ obras, perfil }: { obras: Obra[]; perfil: any }) {
  const [rows,    setRows]    = useState<any[]>([])
  const [load,    setLoad]    = useState(true)
  const [filtro,  setFiltro]  = useState<'pendente'|'aprovado'|'recusado'|'todos'>('pendente')
  const [recusaId,setRecusaId]= useState<string|null>(null)
  const [motivo,  setMotivo]  = useState('')

  const motivoLabels: Record<string,string> = {
    pedido_demissao:    'Pedido de Demissão',
    demissao_sem_justa: 'Demissão sem Justa Causa',
    demissao_com_justa: 'Demissão com Justa Causa',
    fim_contrato:       'Fim de Contrato',
    acordo:             'Acordo (§ 484-A CLT)',
    aposentadoria:      'Aposentadoria',
    falecimento:        'Falecimento',
    outro:              'Outro',
  }

  const fetchRows = useCallback(async () => {
    setLoad(true)
    const q = supabase.from('portal_solicitacoes')
      .select('id,obra_id,dados,status,criado_em,aprovado_nome,observacoes_admin')
      .eq('tipo','desligamento')
      .order('criado_em', { ascending: false })
    if (filtro !== 'todos') q.eq('status', filtro)
    const { data } = await q
    setRows(data ?? [])
    setLoad(false)
  }, [filtro])

  useEffect(() => { fetchRows() }, [fetchRows])

  async function aprovar(id: string, _dados: any) {
    const nome = perfil?.nome ?? perfil?.email ?? 'RH'
    await supabase.from('portal_solicitacoes').update({
      status: 'aprovado', aprovado_nome: nome, aprovado_em: new Date().toISOString(),
    }).eq('id', id)
    // ⚠️ Colaborador NÃO é inativado automaticamente.
    // O RH deve inativar manualmente em Colaboradores após concluir o processo de desligamento.
    fetchRows()
  }

  async function recusar(id: string) {
    const nome = perfil?.nome ?? perfil?.email ?? 'RH'
    await supabase.from('portal_solicitacoes').update({
      status: 'recusado', aprovado_nome: nome, aprovado_em: new Date().toISOString(),
      observacoes_admin: motivo,
    }).eq('id', id)
    setRecusaId(null); setMotivo(''); fetchRows()
  }

  const badge = (s: string) => {
    if (s === 'aprovado') return { bg:'#dcfce7', cor:'#15803d', label:'✓ Aprovado' }
    if (s === 'recusado') return { bg:'#fee2e2', cor:'#dc2626', label:'✗ Recusado' }
    return                       { bg:'#fef3c7', cor:'#b45309', label:'⏳ Pendente' }
  }

  return (
    <div>
      {/* Filtros */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
        {(['pendente','aprovado','recusado','todos'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            height:32, padding:'0 14px', borderRadius:20, border:'none', cursor:'pointer',
            fontWeight:700, fontSize:12,
            background: filtro===f ? '#7c3aed' : '#f3f4f6',
            color: filtro===f ? '#fff' : '#6b7280',
          }}>
            {f === 'pendente' ? '⏳ Pendentes' : f === 'aprovado' ? '✓ Aprovados' : f === 'recusado' ? '✗ Recusados' : '📋 Todos'}
          </button>
        ))}
      </div>

      {load ? (
        <div style={{ textAlign:'center', padding:40, color:'#9ca3af' }}>Carregando…</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'#9ca3af', background:'#fff', borderRadius:12 }}>
          🚪 Nenhuma solicitação de desligamento {filtro !== 'todos' ? `com status "${filtro}"` : ''}
        </div>
      ) : rows.map(r => {
        const d  = r.dados ?? {}
        const b  = badge(r.status)
        const ob = obras.find(o => o.id === r.obra_id)?.nome ?? '—'
        const dt = d.data_prevista ? new Date(d.data_prevista + 'T12:00:00').toLocaleDateString('pt-BR') : '—'
        return (
          <div key={r.id} style={{ background:'#fff', border:'1px solid #e5e7eb', borderLeft:`4px solid ${b.cor}`,
            borderRadius:10, padding:'16px', marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:15, color:'#111', marginBottom:4 }}>
                  🚪 {d.colaborador_nome || '—'}
                  {d.colaborador_chapa && <span style={{ fontSize:12, color:'#6b7280', fontWeight:400, marginLeft:6 }}>({d.colaborador_chapa})</span>}
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', fontSize:12, color:'#374151', marginBottom:6 }}>
                  <span>🏗️ {ob}</span>
                  <span>📅 Data prevista: <strong>{dt}</strong></span>
                </div>
                <div style={{ fontSize:13, fontWeight:700, color:'#7c3aed', marginBottom:4 }}>
                  {motivoLabels[d.motivo_desligamento] ?? d.motivo_desligamento ?? '—'}
                </div>
                {d.observacoes && (
                  <div style={{ fontSize:12, color:'#6b7280', marginBottom:4 }}>💬 {d.observacoes}</div>
                )}
                {r.aprovado_nome && (
                  <div style={{ fontSize:11, color:'#15803d', marginTop:4 }}>✓ Processado por: {r.aprovado_nome}</div>
                )}
                {r.status === 'aprovado' && (
                  <div style={{ marginTop:8, padding:'8px 12px', borderRadius:8, background:'#fef3c7', border:'1px solid #fbbf24', fontSize:12, color:'#92400e', fontWeight:600 }}>
                    ⚠️ Lembre-se: inative o colaborador manualmente em <strong>Colaboradores</strong> após concluir o processo de desligamento.
                  </div>
                )}
                {r.observacoes_admin && (
                  <div style={{ background:'#fef9c3', borderRadius:6, padding:'6px 10px', fontSize:12, color:'#92400e', marginTop:6 }}>
                    💬 {r.observacoes_admin}
                  </div>
                )}
              </div>
              <span style={{ background:b.bg, color:b.cor, borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>
                {b.label}
              </span>
            </div>

            {r.status === 'pendente' && (
              recusaId === r.id ? (
                <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
                  <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
                    placeholder="Motivo da recusa (opcional)…"
                    style={{ width:'100%', border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 10px', fontSize:12, boxSizing:'border-box', resize:'none' }}/>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => recusar(r.id)} style={{
                      flex:1, height:36, background:'#dc2626', color:'#fff', border:'none', borderRadius:8,
                      cursor:'pointer', fontWeight:700, fontSize:13,
                    }}>✗ Confirmar Recusa</button>
                    <button onClick={() => setRecusaId(null)} style={{
                      height:36, padding:'0 16px', background:'#f3f4f6', color:'#374151', border:'none',
                      borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:13,
                    }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', gap:8, marginTop:12 }}>
                  <button onClick={() => aprovar(r.id, d)} style={{
                    flex:1, height:36, background:'#15803d', color:'#fff', border:'none', borderRadius:8,
                    cursor:'pointer', fontWeight:700, fontSize:13,
                  }}>✓ Aprovar Solicitação</button>
                  <button onClick={() => setRecusaId(r.id)} style={{
                    flex:1, height:36, background:'#fff', color:'#dc2626', border:'1px solid #fca5a5',
                    borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:13,
                  }}>✗ Recusar</button>
                </div>
              )
            )}
            <div style={{ fontSize:10, color:'#9ca3af', marginTop:8 }}>
              Solicitado em {new Date(r.criado_em).toLocaleString('pt-BR')}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── ABA: RELATÓRIO DE PRESENÇA ───────────────────────────────────────────────
function TabRelatorio({ obras, colabs }: { obras: Obra[]; colabs: Colab[] }) {
  const hoje = new Date()
  const [modo,      setModo]      = useState<'colaborador'|'obra'>('colaborador')
  const [colabId,   setColabId]   = useState('')
  const [colabBusca,setColabBusca]= useState('')
  const [obraId,    setObraId]    = useState('')
  const [mesAno,    setMesAno]    = useState(`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`)
  const [loading,   setLoading]   = useState(false)
  const [resultado, setResultado] = useState<ResultadoRel | null>(null)

  // Edição inline de um dia do portal
  const [editDia,   setEditDia]   = useState<{id:string; status:string; he:number; hf:number; obs:string} | null>(null)
  const [savingEdit,setSavingEdit]= useState(false)
  const [deletingId,setDeletingId]= useState<string|null>(null)

  interface DiaRel {
    id?: string; data:string; status:string; he:number; hf:number; obs:string
    sincronizado:boolean; lancamento_portal:boolean; editavel:boolean
  }
  interface ColabRel  { nome:string; chapa:string; funcao:string; obra:string; dias:DiaRel[]; presentes:number; faltas:number; he:number; hf:number }
  interface ResultadoRel { periodo:string; registros:ColabRel[] }

  const STATUS_OPTIONS = [
    { value:'presente',          label:'Presente' },
    { value:'falta',             label:'Falta' },
    { value:'meio_periodo',      label:'Meio Período' },
    { value:'falta_justificada', label:'Falta Justif.' },
    { value:'producao',          label:'Produção' },
  ]

  async function gerar() {
    setLoading(true); setResultado(null); setEditDia(null)
    const [ano, mes] = mesAno.split('-').map(Number)
    const inicio = `${ano}-${String(mes).padStart(2,'0')}-01`
    const fim    = `${ano}-${String(mes).padStart(2,'0')}-31`

    // ── 1. Busca portal_ponto_diario ───────────────────────────────────────
    let qPortal = supabase
      .from('portal_ponto_diario')
      .select('id,colaborador_id,obra_id,data,status,horas_extra,horas_falta,observacoes,sincronizado_em,colaboradores(nome,chapa,funcoes(nome)),obras(nome)')
      .gte('data', inicio).lte('data', fim)
      .order('colaborador_id').order('data')
    if (modo === 'colaborador' && colabId) qPortal = qPortal.eq('colaborador_id', colabId)
    if (modo === 'obra'        && obraId)  qPortal = qPortal.eq('obra_id', obraId)
    const { data: rowsPortal } = await qPortal

    // ── 2. Busca registro_ponto (sistema) — avulsos e por obra ─────────────
    let qSist = supabase
      .from('registro_ponto')
      .select('id,colaborador_id,obra_id,data,presente,falta,horas_trabalhadas,horas_extras,observacoes,lancamento_id,colaboradores(nome,chapa,funcoes(nome)),obras(nome)')
      .gte('data', inicio).lte('data', fim)
      .order('colaborador_id').order('data')
    if (modo === 'colaborador' && colabId) qSist = qSist.eq('colaborador_id', colabId)
    if (modo === 'obra'        && obraId)  qSist = qSist.eq('obra_id', obraId)
    const { data: rowsSist } = await qSist

    const totalRows = (rowsPortal?.length ?? 0) + (rowsSist?.length ?? 0)
    if (totalRows === 0) { toast.info('Nenhum registro encontrado para o período.'); setLoading(false); return }

    // ── 3. Consolida num mapa: chave = colabId|obraId ──────────────────────
    const mapaColab: Record<string, ColabRel> = {}

    function getOrCreate(colabId2: string, obraId2: string|null, cNome: string, cChapa: string, cFuncao: string, oNome: string) {
      const key = colabId2 + '|' + (obraId2 ?? '__avulso__')
      if (!mapaColab[key]) mapaColab[key] = { nome:cNome, chapa:cChapa, funcao:cFuncao, obra:oNome || '(avulso)', dias:[], presentes:0, faltas:0, he:0, hf:0 }
      return mapaColab[key]
    }

    // Registros do portal
    for (const r of (rowsPortal ?? []) as any[]) {
      const cNome  = r.colaboradores?.nome  ?? colabs.find(c=>c.id===r.colaborador_id)?.nome ?? 'Desconhecido'
      const cChapa = r.colaboradores?.chapa ?? '—'
      const cFuncao= r.colaboradores?.funcoes?.nome ?? '—'
      const oNome  = r.obras?.nome ?? obras.find(o=>o.id===r.obra_id)?.nome ?? ''
      const reg    = getOrCreate(r.colaborador_id, r.obra_id, cNome, cChapa, cFuncao, oNome)
      const presente = r.status==='presente'||r.status==='meio_periodo'
      const falta    = r.status==='falta'||r.status==='falta_justificada'
      const heMin    = Math.round((r.horas_extra ?? 0) * 60)
      const hfMin    = Math.round((r.horas_falta ?? 0) * 60)
      const statusLabel =
        r.status==='falta'?'FALTA':r.status==='meio_periodo'?'Meio período':
        r.status==='presente'?'Presente':r.status==='atestado'?'Atestado':
        r.status==='feriado'?'Feriado':r.status==='falta_justificada'?'Falta Justif.':
        r.status==='producao'?'Produção': r.status??'—'
      reg.dias.push({ id:r.id, data:r.data, status:statusLabel, he:heMin, hf:hfMin, obs:r.observacoes??'', sincronizado:!!r.sincronizado_em, lancamento_portal:true, editavel:false })
      if (presente) reg.presentes++
      if (falta)    reg.faltas++
      reg.he += heMin; reg.hf += hfMin
    }

    // Registros do sistema (registro_ponto)
    for (const r of (rowsSist ?? []) as any[]) {
      const cNome  = r.colaboradores?.nome  ?? colabs.find(c=>c.id===r.colaborador_id)?.nome ?? 'Desconhecido'
      const cChapa = r.colaboradores?.chapa ?? '—'
      const cFuncao= r.colaboradores?.funcoes?.nome ?? '—'
      const oNome  = r.obras?.nome ?? obras.find(o=>o.id===r.obra_id)?.nome ?? ''
      // Evita duplicar se já vier do portal
      const key = r.colaborador_id + '|' + (r.obra_id ?? '__avulso__')
      const diaJaNoPortal = mapaColab[key]?.dias.find(d=>d.data===r.data&&d.lancamento_portal)
      if (diaJaNoPortal) continue  // portal tem precedência
      const reg    = getOrCreate(r.colaborador_id, r.obra_id, cNome, cChapa, cFuncao, oNome)
      const presente = r.presente && !r.falta
      const falta    = r.falta
      const heMin    = Math.round((r.horas_extras ?? 0) * 60)
      const hfMin    = 0
      const statusLabel = falta?'FALTA':presente?'Presente':'—'
      reg.dias.push({ id:undefined, data:r.data, status:statusLabel, he:heMin, hf:hfMin, obs:r.observacoes??'', sincronizado:true, lancamento_portal:false, editavel:false })
      if (presente) reg.presentes++
      if (falta)    reg.faltas++
      reg.he += heMin; reg.hf += hfMin
    }

    for (const v of Object.values(mapaColab)) v.dias.sort((a,b)=>a.data.localeCompare(b.data))

    const MESES_N = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    setResultado({ periodo:`${MESES_N[mes-1]}/${ano}`, registros:Object.values(mapaColab) })
    setLoading(false)
  }

  async function salvarEdicao() {
    if (!editDia) return
    setSavingEdit(true)
    const { error } = await supabase.from('portal_ponto_diario').update({
      status:     editDia.status,
      horas_extra: editDia.he / 60,
      horas_falta: editDia.hf / 60,
      observacoes: editDia.obs || null,
    }).eq('id', editDia.id)
    setSavingEdit(false)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Registro atualizado!')
    setEditDia(null)
    gerar()
  }

  async function excluirDia(id: string) {
    if (!confirm('Excluir este registro de ponto?')) return
    setDeletingId(id)
    const { error } = await supabase.from('portal_ponto_diario').delete().eq('id', id)
    setDeletingId(null)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Registro excluído!')
    gerar()
  }

  function minToHM(min: number) {
    if (!min) return '—'
    return `${Math.floor(min/60)}h${String(min%60).padStart(2,'0')}m`
  }

  async function gerarPDF() {
    if (!resultado) return
    const linhas = resultado.registros.map(c => {
      const tabDias = c.dias.map(d => {
        const dtFmt = new Date(d.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})
        const cor   = d.status==='FALTA'?'#fee2e2':d.status==='Presente'?'#f0fdf4':'#fefce8'
        const corSt = d.status==='FALTA'?'#dc2626':d.status==='Presente'?'#15803d':'#92400e'
        const sinc  = d.sincronizado ? '✓ Sim' : '⏳ Pend.'
        const portal= d.lancamento_portal ? '● Portal' : '● Sistema'
        return `<tr style="background:${cor}">
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px">${dtFmt}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:700;color:${corSt}">${d.status}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#15803d">${d.he?`+${minToHM(d.he)}`:''}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#dc2626">${d.hf?`-${minToHM(d.hf)}`:''}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:10px;color:#6b7280">${d.obs||'—'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:center;color:${d.lancamento_portal?'#1d4ed8':'#059669'}">${portal}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:center;color:${d.sincronizado?'#15803d':'#b45309'}">${sinc}</td>
        </tr>`
      }).join('')
      return `<div class="colaborador">
        <div class="cab-colab">
          <div class="cab-info">
            <div class="cab-nome">${c.nome}</div>
            <div class="cab-meta">
              <span class="badge-chapa">Chapa: ${c.chapa}</span>
              <span class="badge-funcao">⚙️ ${c.funcao}</span>
              ${c.obra ? `<span class="badge-obra">🏗️ ${c.obra}</span>` : ''}
            </div>
          </div>
          <div class="cab-totais">
            <span class="tot-item tot-pres">✓ ${c.presentes} pres.</span>
            <span class="tot-item tot-falt">✗ ${c.faltas} faltas</span>
            ${c.he ? `<span class="tot-item tot-he">HE: ${minToHM(c.he)}</span>` : ''}
          </div>
        </div>
        <table>
          <thead><tr>
            <th>Data</th><th>Status</th><th>H.Extra</th><th>H.Falta</th><th>Observação</th><th>Origem</th><th>Sincronizado</th>
          </tr></thead>
          <tbody>${tabDias}</tbody>
          <tfoot><tr style="background:#f1f5f9;font-weight:700">
            <td colspan="2" style="padding:6px 8px">TOTAIS</td>
            <td style="padding:6px 8px;color:#15803d">${minToHM(c.he)}</td>
            <td style="padding:6px 8px;color:#dc2626">${minToHM(c.hf)}</td>
            <td colspan="3" style="padding:6px 8px">${c.presentes} dias • ${c.faltas} falta${c.faltas!==1?'s':''}</td>
          </tr></tfoot>
        </table>
        <div class="assinatura">
          <div><div class="linha-ass"></div>Colaborador / Assinatura</div>
          <div><div class="linha-ass"></div>Responsável RH / Carimbo</div>
        </div>
      </div>`
    }).join('<div class="quebra"></div>')

    const _empPonto = await fetchEmpresaData()
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
    <title>Espelho de Ponto – ${resultado.periodo}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}
      ${CABECALHO_CSS}
      .colaborador{margin-bottom:32px;break-inside:avoid}
      .cab-colab{background:#1e3a5f;color:#fff;padding:10px 14px;border-radius:6px 6px 0 0;display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
      .cab-info{flex:1}
      .cab-nome{font-size:15px;font-weight:800;margin-bottom:5px}
      .cab-meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .badge-chapa{background:rgba(255,255,255,0.15);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700}
      .badge-funcao{background:rgba(255,255,255,0.15);border-radius:4px;padding:2px 8px;font-size:10px}
      .badge-obra{background:rgba(255,255,255,0.25);border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700}
      .cab-totais{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .tot-item{border-radius:4px;padding:3px 8px;font-size:10px;font-weight:700}
      .tot-pres{background:rgba(134,239,172,0.3);color:#86efac}
      .tot-falt{background:rgba(252,165,165,0.3);color:#fca5a5}
      .tot-he{background:rgba(253,230,138,0.3);color:#fde68a}
      table{width:100%;border-collapse:collapse}
      th{background:#f1f5f9;padding:6px 8px;text-align:left;font-size:10px;font-weight:700;border-bottom:2px solid #cbd5e1;color:#374151;text-transform:uppercase;letter-spacing:0.04em}
      .assinatura{display:flex;gap:60px;margin-top:16px;padding:0 20px}
      .assinatura>div{flex:1;text-align:center;font-size:11px;color:#6b7280}
      .linha-ass{border-top:1px solid #9ca3af;margin-bottom:4px;margin-top:30px}
      .quebra{page-break-after:always;height:0;margin:0}
      @media print{.quebra{page-break-after:always}.colaborador{break-inside:avoid}}
    </style></head><body>
    ${gerarCabecalhoHTML(_empPonto, { titulo: 'Espelho de Ponto — Portal + Sistema', periodo: resultado.periodo })}
    ${linhas}
    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`

    const win = window.open('','_blank','width=1100,height=800')
    if (win) { win.document.write(html); win.document.close() }
  }

  return (
    <div>
      {/* ── Filtros ── */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:20, marginBottom:20 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:4, color:'var(--foreground)' }}>📊 Espelho de Ponto — Portal + Sistema</div>
        <div style={{ fontSize:12, color:'var(--muted-foreground)', marginBottom:14 }}>
          Exibe registros do <strong>portal da obra</strong> e do <strong>sistema</strong> (lançamentos internos + avulsos). Dias do portal podem ser editados ou excluídos aqui.
        </div>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          {/* Modo */}
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:4 }}>TIPO</div>
            <div style={{ display:'flex', gap:0, border:'1px solid var(--border)', borderRadius:7, overflow:'hidden' }}>
              {(['colaborador','obra'] as const).map(m => (
                <button key={m} onClick={() => { setModo(m); setResultado(null) }} style={{
                  padding:'7px 16px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                  background:modo===m?'var(--primary)':'var(--card)',
                  color:modo===m?'#fff':'var(--muted-foreground)', transition:'all 120ms',
                }}>
                  {m==='colaborador' ? '👷 Por Colaborador' : '🏗️ Por Obra'}
                </button>
              ))}
            </div>
          </div>
          {/* Seletor */}
          {modo === 'colaborador' ? (
            <div style={{ position:'relative' }}>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:4 }}>COLABORADOR</div>
              {/* Input de busca */}
              <div style={{ position:'relative' }}>
                <input
                  type="text"
                  placeholder="🔍 Nome, chapa ou CPF…"
                  value={colabBusca}
                  onChange={e => {
                    setColabBusca(e.target.value)
                    // Ao digitar, limpa seleção anterior
                    setColabId('')
                  }}
                  style={{
                    height:36, borderRadius: colabBusca && !colabId ? '7px 7px 0 0' : 7,
                    border:'1px solid var(--border)', borderBottom: colabBusca && !colabId ? 'none' : '1px solid var(--border)',
                    padding:'0 30px 0 10px', fontSize:13, minWidth:240,
                    background:'var(--card)', color:'var(--foreground)', outline:'none', width:'100%', boxSizing:'border-box'
                  }}
                />
                {colabBusca && (
                  <button
                    onClick={() => { setColabBusca(''); setColabId('') }}
                    style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:16, lineHeight:1 }}
                  >✕</button>
                )}
              </div>
              {/* Dropdown filtrado — só abre quando está digitando e ainda não selecionou */}
              {colabBusca && !colabId && (() => {
                const q = colabBusca.trim().toLowerCase()
                const sugs = colabs.filter(c => {
                  const nome  = c.nome.toLowerCase()
                  const chapa = (c.chapa ?? '').toLowerCase()
                  const cpf   = (c.cpf ?? '').replace(/\D/g,'')
                  const qCpf  = q.replace(/\D/g,'')
                  // match EXATO no início do nome OU qualquer parte da chapa OU CPF
                  return nome.includes(q) || chapa.includes(q) || (qCpf.length >= 3 && cpf.includes(qCpf))
                })
                // Ordena: começa com q primeiro
                .sort((a,b) => {
                  const aN = a.nome.toLowerCase().startsWith(q) ? 0 : 1
                  const bN = b.nome.toLowerCase().startsWith(q) ? 0 : 1
                  return aN !== bN ? aN - bN : a.nome.localeCompare(b.nome)
                })
                .slice(0, 15)

                return (
                  <div style={{
                    position:'absolute', zIndex:200, top:'100%', left:0, right:0,
                    background:'var(--card)', border:'1px solid var(--border)', borderTop:'none',
                    borderRadius:'0 0 7px 7px', boxShadow:'0 8px 24px rgba(0,0,0,0.15)',
                    maxHeight:260, overflowY:'auto', minWidth:240
                  }}>
                    {/* "Todos" sempre disponível no topo */}
                    <div
                      onClick={() => { setColabId(''); setColabBusca('') }}
                      style={{ padding:'8px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:12, color:'var(--muted-foreground)', fontWeight:600 }}
                      onMouseEnter={e => (e.currentTarget.style.background='var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.background='')}
                    >
                      👥 Todos os colaboradores
                    </div>
                    {sugs.length === 0 ? (
                      <div style={{ padding:'12px', textAlign:'center', fontSize:13, color:'var(--muted-foreground)' }}>
                        Nenhum resultado para "<strong>{colabBusca}</strong>"
                      </div>
                    ) : sugs.map(c => (
                      <div
                        key={c.id}
                        onClick={() => { setColabId(c.id); setColabBusca(c.nome + (c.chapa ? ` · ${c.chapa}` : '')) }}
                        style={{ padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)', fontSize:13 }}
                        onMouseEnter={e => (e.currentTarget.style.background='var(--accent)')}
                        onMouseLeave={e => (e.currentTarget.style.background='')}
                      >
                        <div style={{ fontWeight:700, color:'var(--foreground)' }}>{c.nome}</div>
                        {c.chapa && <div style={{ fontSize:11, color:'var(--muted-foreground)' }}>Chapa: {c.chapa}</div>}
                      </div>
                    ))}
                  </div>
                )
              })()}
              {/* Badge de selecionado */}
              {colabId && (
                <div style={{ marginTop:4, fontSize:11, color:'#15803d', fontWeight:700 }}>
                  ✓ {colabs.find(c=>c.id===colabId)?.nome}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:4 }}>OBRA</div>
              <select value={obraId} onChange={e=>setObraId(e.target.value)} style={{ height:36, borderRadius:7, border:'1px solid var(--border)', padding:'0 10px', fontSize:13, minWidth:220, background:'var(--card)', color:'var(--foreground)' }}>
                <option value="">— Todas —</option>
                {obras.map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
          )}
          {/* Mês */}
          <div>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--muted-foreground)', marginBottom:4 }}>MÊS / ANO</div>
            <input type="month" value={mesAno} onChange={e=>{setMesAno(e.target.value);setResultado(null)}} style={{ height:36, borderRadius:7, border:'1px solid var(--border)', padding:'0 10px', fontSize:13, background:'var(--card)', color:'var(--foreground)' }} />
          </div>
          <Button onClick={gerar} disabled={loading} style={{ height:36, gap:6, background:'#1e3a5f', color:'#fff', fontWeight:700 }}>
            {loading ? <><RefreshCw size={14} className="animate-spin"/> Gerando…</> : <><FileBarChart2 size={14}/> Gerar</>}
          </Button>
          {resultado && resultado.registros.length > 0 && (
            <Button onClick={gerarPDF} style={{ height:36, gap:6, background:'#15803d', color:'#fff', fontWeight:700 }}>
              <Download size={14}/> Imprimir / PDF
            </Button>
          )}
        </div>
      </div>

      {/* ── Modal editar dia ── */}
      {editDia && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:80, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--background)', borderRadius:12, width:'100%', maxWidth:420, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight:800, fontSize:15, marginBottom:16 }}>✏️ Editar Registro de Ponto</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted-foreground)', marginBottom:4 }}>STATUS</div>
                <select value={editDia.status} onChange={e => setEditDia(d => d ? {...d, status:e.target.value} : null)}
                  style={{ width:'100%', height:38, border:'1px solid var(--border)', borderRadius:7, padding:'0 10px', fontSize:13, background:'var(--background)' }}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted-foreground)', marginBottom:4 }}>H. EXTRA (min)</div>
                  <input type="number" min={0} max={480} value={editDia.he} onChange={e => setEditDia(d => d ? {...d, he:Number(e.target.value)} : null)}
                    style={{ width:'100%', height:38, border:'1px solid var(--border)', borderRadius:7, padding:'0 10px', fontSize:13, background:'var(--background)' }} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted-foreground)', marginBottom:4 }}>H. FALTA (min)</div>
                  <input type="number" min={0} max={480} value={editDia.hf} onChange={e => setEditDia(d => d ? {...d, hf:Number(e.target.value)} : null)}
                    style={{ width:'100%', height:38, border:'1px solid var(--border)', borderRadius:7, padding:'0 10px', fontSize:13, background:'var(--background)' }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted-foreground)', marginBottom:4 }}>OBSERVAÇÃO</div>
                <textarea value={editDia.obs} onChange={e => setEditDia(d => d ? {...d, obs:e.target.value} : null)} rows={2}
                  style={{ width:'100%', border:'1px solid var(--border)', borderRadius:7, padding:'8px 10px', fontSize:13, background:'var(--background)', resize:'vertical' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:18 }}>
              <Button variant="outline" onClick={() => setEditDia(null)}>Cancelar</Button>
              <Button onClick={salvarEdicao} disabled={savingEdit} style={{ background:'#1e3a5f', color:'#fff', gap:6 }}>
                {savingEdit ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>} Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resultado ── */}
      {resultado && resultado.registros.length === 0 && (
        <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--muted-foreground)', fontSize:14 }}>
          Nenhum registro encontrado para o período selecionado.
        </div>
      )}

      {resultado && resultado.registros.length > 0 && (
        <div>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:'var(--foreground)' }}>
            📋 {resultado.periodo}
            <span style={{ fontWeight:400, fontSize:12, color:'var(--muted-foreground)', marginLeft:10 }}>
              {resultado.registros.length} colaborador{resultado.registros.length!==1?'es':''}
              {' · '}{resultado.registros.reduce((s,r)=>s+r.dias.length,0)} registros
            </span>
          </div>

          {resultado.registros.map((c, ci) => (
            <div key={ci} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, marginBottom:20, overflow:'hidden' }}>
              {/* Cabeçalho */}
              <div style={{ background:'#1e3a5f', color:'#fff', padding:'10px 16px', display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:14, marginBottom:4 }}>{c.nome}</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {c.chapa && c.chapa!=='—' && <span style={{ background:'rgba(255,255,255,0.15)', borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }}>Chapa: {c.chapa}</span>}
                    {c.funcao && c.funcao!=='—' && <span style={{ background:'rgba(255,255,255,0.15)', borderRadius:4, padding:'2px 8px', fontSize:10 }}>⚙️ {c.funcao}</span>}
                    {c.obra && <span style={{ background:'rgba(255,255,255,0.22)', borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }}>🏗️ {c.obra}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:12, fontSize:12, flexWrap:'wrap', alignItems:'center' }}>
                  <span style={{ color:'#86efac' }}>✓ {c.presentes} presentes</span>
                  <span style={{ color:'#fca5a5' }}>✗ {c.faltas} faltas</span>
                  {c.he>0 && <span style={{ color:'#fde68a' }}>HE: {minToHM(c.he)}</span>}
                  {c.hf>0 && <span style={{ color:'#fca5a5' }}>HF: {minToHM(c.hf)}</span>}
                </div>
              </div>

              {/* Tabela */}
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'var(--muted)' }}>
                      {['Data','Status','H.Extra','H.Falta','Observação','Origem','Sincronizado','Ações'].map(h=>(
                        <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontWeight:700, fontSize:11, color:'var(--muted-foreground)', borderBottom:'2px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.dias.map((d, di) => {
                      const dtFmt = new Date(d.data+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})
                      const corBg = d.status==='FALTA'?'#fef2f2':d.status==='Presente'?'#f0fdf4':'var(--card)'
                      const corSt = d.status==='FALTA'?'#dc2626':d.status==='Presente'?'#15803d':'#b45309'
                      return (
                        <tr key={di} style={{ background:corBg, borderBottom:'1px solid var(--border)' }}>
                          <td style={{ padding:'6px 10px', fontWeight:600, whiteSpace:'nowrap' }}>{dtFmt}</td>
                          <td style={{ padding:'6px 10px', fontWeight:700, color:corSt, whiteSpace:'nowrap' }}>{d.status}</td>
                          <td style={{ padding:'6px 10px', color:'#15803d', fontWeight:600 }}>{d.he?`+${minToHM(d.he)}`:'—'}</td>
                          <td style={{ padding:'6px 10px', color:'#dc2626', fontWeight:600 }}>{d.hf?`-${minToHM(d.hf)}`:'—'}</td>
                          <td style={{ padding:'6px 10px', fontSize:11, color:'var(--muted-foreground)', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.obs||'—'}</td>
                          <td style={{ padding:'6px 10px', fontSize:11, textAlign:'center' }}>
                            {d.lancamento_portal
                              ? <span style={{ color:'#1d4ed8', fontWeight:700 }}>● Portal</span>
                              : <span style={{ color:'#059669', fontWeight:700 }}>● Sistema</span>}
                          </td>
                          <td style={{ padding:'6px 10px', fontSize:11 }}>
                            {d.sincronizado
                              ? <span style={{ color:'#15803d', fontWeight:700 }}>✓ sim</span>
                              : <span style={{ color:'#b45309' }}>⏳ pendente</span>}
                          </td>
                          <td style={{ padding:'6px 8px', whiteSpace:'nowrap' }}>
                            {d.editavel && d.id ? (
                              <div style={{ display:'flex', gap:4 }}>
                                <button
                                  onClick={() => setEditDia({ id:d.id!, status: STATUS_OPTIONS.find(s=>s.label===d.status)?.value ?? 'presente', he:d.he, hf:d.hf, obs:d.obs })}
                                  title="Editar" style={{ background:'none', border:'1px solid #93c5fd', borderRadius:5, padding:'3px 6px', cursor:'pointer', color:'#1d4ed8', display:'flex', alignItems:'center', gap:3, fontSize:11 }}>
                                  <Pencil size={11}/>
                                </button>
                                <button
                                  onClick={() => excluirDia(d.id!)}
                                  disabled={deletingId===d.id}
                                  title="Excluir" style={{ background:'none', border:'1px solid #fca5a5', borderRadius:5, padding:'3px 6px', cursor:'pointer', color:'#dc2626', display:'flex', alignItems:'center', gap:3, fontSize:11 }}>
                                  {deletingId===d.id ? <RefreshCw size={11} className="animate-spin"/> : <Trash2 size={11}/>}
                                </button>
                              </div>
                            ) : (
                              <span style={{ color:'#d1d5db', fontSize:10 }}>—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'var(--muted)', fontWeight:700 }}>
                      <td colSpan={2} style={{ padding:'7px 10px', fontSize:12 }}>TOTAIS</td>
                      <td style={{ padding:'7px 10px', color:'#15803d' }}>{minToHM(c.he)}</td>
                      <td style={{ padding:'7px 10px', color:'#dc2626' }}>{minToHM(c.hf)}</td>
                      <td colSpan={4} style={{ padding:'7px 10px', fontSize:11, color:'var(--muted-foreground)' }}>{c.presentes} dias · {c.faltas} falta{c.faltas!==1?'s':''}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Assinaturas */}
              <div style={{ display:'flex', gap:40, padding:'14px 40px 18px', borderTop:'1px solid var(--border)' }}>
                {['Colaborador / Assinatura','Responsável RH / Carimbo'].map(l=>(
                  <div key={l} style={{ flex:1, textAlign:'center' }}>
                    <div style={{ borderTop:'1px solid var(--border)', paddingTop:6, fontSize:11, color:'var(--muted-foreground)', marginTop:28 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── PÁGINA PRINCIPAL ─────────────────────────────────────────────────────────
export default function Solicitacoes() {
  const { profile: perfil } = useProfile()
  const [aba, setAba] = useState<'cadastros'|'ocorrencias'|'epis'|'documentos'|'desligamentos'|'relatorio'>('cadastros')
  const [obras,  setObras]  = useState<Obra[]>([])
  const [funcoes,setFuncoes]= useState<Funcao[]>([])
  const [colabs, setColabs] = useState<Colab[]>([])
  const [counts, setCounts] = useState({ cadastros:0, ocorrencias:0, epis:0, documentos:0, desligamentos:0 })

  const fetchBase = useCallback(async () => {
    const [o, f, c] = await Promise.all([
      supabase.from('obras').select('id,nome').eq('ativo',true).order('nome'),
      supabase.from('funcoes').select('id,nome').eq('ativo',true).order('nome'),
      supabase.from('colaboradores').select('id,nome,chapa,cpf').eq('status','ativo').order('nome'),
    ])
    if (o.data) setObras(o.data)
    if (f.data) setFuncoes(f.data)
    if (c.data) setColabs(c.data)
  }, [])

  const fetchCounts = useCallback(async () => {
    const [cad, ocor, epi, doc, deslig] = await Promise.all([
      supabase.from('portal_solicitacoes').select('id', { count:'exact', head:true }).eq('tipo','novo_colaborador').eq('status','pendente'),
      supabase.from('portal_ocorrencias').select('id', { count:'exact', head:true }).is('sincronizado_em', null),
      supabase.from('portal_epi_solicitacoes').select('id', { count:'exact', head:true }).eq('status','pendente'),
      supabase.from('portal_documentos').select('id', { count:'exact', head:true }).eq('status','pendente'),
      supabase.from('portal_solicitacoes').select('id', { count:'exact', head:true }).eq('tipo','desligamento').eq('status','pendente'),
    ])
    setCounts({
      cadastros:     cad.count    ?? 0,
      ocorrencias:   ocor.count   ?? 0,
      epis:          epi.count    ?? 0,
      documentos:    doc.count    ?? 0,
      desligamentos: deslig.count ?? 0,
    })
  }, [])

  useEffect(() => { fetchBase(); fetchCounts() }, [fetchBase, fetchCounts])

  const ABAS = [
    { id:'cadastros',    label:'👷 Cadastros',      count: counts.cadastros,    icon: Users },
    { id:'ocorrencias',  label:'🚨 Ocorrências',    count: counts.ocorrencias,  icon: AlertTriangle },
    { id:'epis',         label:'🦺 EPIs',           count: counts.epis,         icon: ShieldCheck },
    { id:'documentos',   label:'📎 Documentos',     count: counts.documentos,   icon: FileImage },
    { id:'desligamentos',label:'🚪 Desligamentos',  count: counts.desligamentos,icon: FileText },
    { id:'relatorio',    label:'📊 Rel. Presença',  count: 0,                   icon: FileBarChart2 },
  ] as const

  const totalPendente = counts.cadastros + counts.ocorrencias + counts.epis + counts.documentos + counts.desligamentos

  return (
    <div style={{ padding:'24px 28px', minHeight:'100vh', background:'var(--background)' }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontWeight:800, fontSize:22, color:'var(--foreground)' }}>📥 Solicitações do Portal</div>
          {totalPendente > 0 && (
            <span style={{ background:'#ef4444', color:'#fff', borderRadius:20, padding:'2px 10px', fontSize:12, fontWeight:700 }}>
              {totalPendente} pendente{totalPendente !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ fontSize:13, color:'var(--muted-foreground)', marginTop:4 }}>
          Gerencie todas as solicitações enviadas pelos encarregados via portal da obra
        </div>
      </div>

      {/* Abas */}
      <div style={{ display:'flex', gap:6, marginBottom:22, flexWrap:'wrap', borderBottom:'1px solid var(--border)', paddingBottom:1 }}>
        {ABAS.map(a => (
          <button key={a.id} onClick={() => { setAba(a.id as any); fetchCounts() }} style={{
            height:40, padding:'0 16px', border:'none', borderBottom:`2px solid ${aba===a.id?'var(--primary)':'transparent'}`,
            background:'transparent', cursor:'pointer', fontWeight:aba===a.id?700:500, fontSize:13,
            color:aba===a.id?'var(--primary)':'var(--muted-foreground)',
            display:'flex', alignItems:'center', gap:7, transition:'all 120ms',
          }}>
            {a.label}
            {a.count > 0 && (
              <span style={{ background:'#ef4444', color:'#fff', borderRadius:10, padding:'0 6px', fontSize:10, fontWeight:700, minWidth:18, textAlign:'center' }}>
                {a.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === 'cadastros'    && <TabCadastros     obras={obras} funcoes={funcoes} perfil={perfil} />}
      {aba === 'ocorrencias'  && <TabOcorrencias   obras={obras} colabs={colabs} perfil={perfil} />}
      {aba === 'epis'         && <TabEpis          obras={obras} colabs={colabs} perfil={perfil} />}
      {aba === 'documentos'   && <TabDocumentos    obras={obras} colabs={colabs} perfil={perfil} />}
      {aba === 'desligamentos'&& <TabDesligamentos obras={obras} perfil={perfil} />}
      {aba === 'relatorio'    && <TabRelatorio     obras={obras} colabs={colabs} />}
    </div>
  )
}
