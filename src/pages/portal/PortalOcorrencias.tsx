import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { AlertTriangle, Loader2, CheckCircle2, Trash2 } from 'lucide-react'

interface Obra        { id: string; nome: string }
interface Colaborador { id: string; nome: string; chapa: string }
interface OcorRow {
  id: string; tipo: string; gravidade: string | null; descricao: string; criado_em: string
  data_ocorrencia: string; colaboradores?: { nome: string }; sincronizado_em: string | null
  hora_acidente?: string | null; local?: string | null; cat_emitida?: boolean | null
  dias_afastamento?: number | null; com_afastamento?: boolean | null; cid?: string | null
  tipo_atestado?: string | null; tipo_adv?: string | null; assinada?: boolean | null
  dias_suspensao?: number | null; motivo?: string | null
}

type AbaOcor = 'acidente' | 'atestado' | 'advertencia' | 'geral'

export default function PortalOcorrencias() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const obrasIds = session?.obras_ids ?? []

  const [obrasData, setObrasData]   = useState<Obra[]>([])
  const [obraId, setObraId]         = useState('')
  const [colabs, setColabs]         = useState<Colaborador[]>([])
  const [aba, setAba]               = useState<AbaOcor>('acidente')
  const [subAba, setSubAba]         = useState<'nova' | 'historico'>('nova')
  const [historico, setHistorico]   = useState<OcorRow[]>([])
  const [saving, setSaving]         = useState(false)
  const [sucesso, setSucesso]       = useState(false)
  const [erroMsg, setErroMsg]       = useState('')
  const [deletandoId, setDeletandoId] = useState<string|null>(null)

  // ── Campos comuns ──────────────────────────────────────────────────────────
  const [colabId, setColabId]       = useState('')
  const [dataOcor, setDataOcor]     = useState(new Date().toISOString().slice(0,10))
  const [descricao, setDescricao]   = useState('')
  const [gravidade, setGravidade]   = useState('leve')

  // ── Acidente ───────────────────────────────────────────────────────────────
  const [hora, setHora]             = useState('')
  const [local, setLocal]           = useState('')
  const [tipoAcid, setTipoAcid]     = useState('sem_afastamento')
  const [catEmitida, setCatEmitida] = useState(false)

  // ── Atestado ───────────────────────────────────────────────────────────────
  const [tipoAtest, setTipoAtest]   = useState('medico')
  const [diasAfas, setDiasAfas]     = useState('')
  const [comAfas, setComAfas]       = useState(false)
  const [cid, setCid]               = useState('')
  const [medico, setMedico]         = useState('')

  // ── Advertência ───────────────────────────────────────────────────────────
  const [tipoAdv, setTipoAdv]       = useState('escrita')
  const [motivo, setMotivo]         = useState('')
  const [assinada, setAssinada]     = useState(false)
  const [diasSusp, setDiasSusp]     = useState('')

  const loadBase = useCallback(async () => {
    if (!obrasIds.length) return
    const { data: o } = await supabase.from('obras').select('id,nome').in('id', obrasIds).order('nome')
    if (o) { setObrasData(o); if (!obraId && o.length) setObraId(o[0].id) }
  }, [obrasIds.join(',')])

  const loadColabs = useCallback(async (oid: string) => {
    if (!oid) return
    const { data } = await supabase.from('colaboradores').select('id,nome,chapa').eq('obra_id', oid).eq('status','ativo').order('nome')
    setColabs(data ?? [])
  }, [])

  const loadHistorico = useCallback(async (oid: string, tipo: AbaOcor) => {
    if (!oid) return
    const q = supabase.from('portal_ocorrencias')
      .select('id,tipo,gravidade,descricao,criado_em,data_ocorrencia,hora_acidente,local,cat_emitida,dias_afastamento,com_afastamento,cid,tipo_atestado,tipo_adv,assinada,dias_suspensao,sincronizado_em,colaboradores(nome)')
      .eq('obra_id', oid)
    if (tipo !== 'geral') q.eq('tipo', tipo)
    q.order('criado_em', { ascending: false }).limit(50)
    const { data } = await q
    setHistorico((data ?? []) as any[])
  }, [])

  useEffect(() => { if (!session) { nav('/portal'); return } loadBase() }, [])
  useEffect(() => { if (obraId) { loadColabs(obraId); loadHistorico(obraId, aba) } }, [obraId, aba])
  useEffect(() => { if (obraId && subAba === 'historico') loadHistorico(obraId, aba) }, [subAba])

  function resetForm() {
    setColabId(''); setDataOcor(new Date().toISOString().slice(0,10)); setDescricao(''); setGravidade('leve')
    setHora(''); setLocal(''); setTipoAcid('sem_afastamento'); setCatEmitida(false)
    setTipoAtest('medico'); setDiasAfas(''); setComAfas(false); setCid(''); setMedico('')
    setTipoAdv('escrita'); setMotivo(''); setAssinada(false); setDiasSusp('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!descricao.trim()) { setErroMsg('⚠️ Preencha o campo DESCRIÇÃO antes de salvar.'); return }
    if (!obraId) { setErroMsg('⚠️ Nenhuma obra selecionada.'); return }
    setSaving(true); setErroMsg('')
    const base = {
      obra_id: obraId,
      colaborador_id: colabId || null,
      tipo: aba,
      data_ocorrencia: dataOcor,
      descricao,
      gravidade,
      status: 'pendente',
      portal_usuario_id: session?.id,
    }
    let extra: Record<string,any> = {}
    if (aba === 'acidente')    extra = { hora_acidente: hora||null, local: local||null, tipo_acidente: tipoAcid, cat_emitida: catEmitida }
    if (aba === 'atestado')    extra = { tipo_atestado: tipoAtest, dias_afastamento: diasAfas?parseInt(diasAfas):null, com_afastamento: comAfas, cid: cid||null, medico: medico||null }
    if (aba === 'advertencia') extra = { tipo_adv: tipoAdv, motivo: motivo||null, assinada, dias_suspensao: diasSusp?parseInt(diasSusp):null }

    const { error } = await supabase.from('portal_ocorrencias').insert({ ...base, ...extra })
    setSaving(false)
    if (error) {
      setErroMsg('Erro ao salvar: ' + error.message)
      return
    }
    setSucesso(true); resetForm(); loadHistorico(obraId, aba)
    setTimeout(() => { setSucesso(false); setSubAba('historico') }, 1600)
  }

  async function excluir(id: string, sync: string|null) {
    if (sync) { alert('Esta ocorrência já foi sincronizada e não pode ser excluída aqui.'); return }
    if (!confirm('Excluir esta ocorrência?')) return
    setDeletandoId(id)
    await supabase.from('portal_ocorrencias').delete().eq('id', id)
    setDeletandoId(null); loadHistorico(obraId, aba)
  }

  const INP: React.CSSProperties = { width:'100%',height:44,border:'1px solid #e5e7eb',borderRadius:8,padding:'0 12px',fontSize:13,boxSizing:'border-box',background:'#fff' }
  const SEL: React.CSSProperties = { ...INP, cursor:'pointer' }
  const LBL = (txt: string) => <label style={{ fontSize:12,fontWeight:700,color:'#374151',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em' }}>{txt}</label>

  const ABAS: { key: AbaOcor; icon: string; label: string; cor: string }[] = [
    { key:'acidente',    icon:'⚠️', label:'Acidente',    cor:'#dc2626' },
    { key:'atestado',    icon:'🏥', label:'Atestado',    cor:'#2563eb' },
    { key:'advertencia', icon:'📋', label:'Advertência', cor:'#ea580c' },
    { key:'geral',       icon:'📌', label:'Geral',       cor:'#7c3aed' },
  ]

  const GRAV_COR: Record<string,{bg:string;cor:string}> = {
    leve:   {bg:'#fef9c3',cor:'#a16207'},
    moderado:{bg:'#fef3c7',cor:'#b45309'},
    grave:  {bg:'#fee2e2',cor:'#dc2626'},
    fatal:  {bg:'#3f0000',cor:'#fff'},
  }

  return (
    <PortalLayout>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#1e3a5f' }}>⚠️ Ocorrências</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Registre acidentes, atestados, advertências e ocorrências</div>
      </div>

      {/* Obra */}
      {obrasData.length > 1 && (
        <div style={{ padding: '0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)} style={SEL}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}
      {obrasData.length === 1 && <div style={{ padding:'0 16px 6px',fontSize:12,fontWeight:700,color:'#6b7280' }}>🏗️ {obrasData[0]?.nome}</div>}

      {/* Tabs tipo ocorrência */}
      <div style={{ display:'flex',padding:'0 16px 0',gap:6,overflowX:'auto',marginBottom:12 }}>
        {ABAS.map(a => (
          <button type="button" key={a.key} onClick={()=>{setAba(a.key);setSubAba('nova');setErroMsg('')}} style={{
            flexShrink:0, height:36, padding:'0 14px', border:`2px solid ${aba===a.key?a.cor:'#e5e7eb'}`,
            borderRadius:20, cursor:'pointer', fontWeight:700, fontSize:12,
            background: aba===a.key?a.cor:'#fff', color: aba===a.key?'#fff':'#6b7280',
          }}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      {/* Abas Nova / Histórico */}
      {aba !== 'geral' && (
        <div style={{ display:'flex',margin:'0 16px 12px',background:'#f3f4f6',borderRadius:10,padding:4 }}>
          {(['nova','historico'] as const).map(s => (
            <button type="button" key={s} onClick={()=>setSubAba(s)} style={{
              flex:1, height:34, border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12,
              background:subAba===s?'#fff':'transparent', color:subAba===s?'#1e3a5f':'#9ca3af',
              boxShadow:subAba===s?'0 1px 4px rgba(0,0,0,0.1)':'none',
            }}>
              {s==='nova'?'+ Nova Ocorrência':`Histórico (${historico.length})`}
            </button>
          ))}
        </div>
      )}

      {/* ── FORMULÁRIO ── */}
      {subAba === 'nova' && aba !== 'geral' && (
        <form onSubmit={handleSubmit} style={{ padding:'0 16px 32px',display:'flex',flexDirection:'column',gap:14 }}>
          {sucesso && (
            <div style={{ background:'#dcfce7',border:'1px solid #86efac',borderRadius:10,padding:'12px 16px',display:'flex',alignItems:'center',gap:8,color:'#15803d',fontWeight:700 }}>
              <CheckCircle2 size={18}/> Ocorrência registrada com sucesso!
            </div>
          )}
          {erroMsg && (
            <div style={{ background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 16px',color:'#dc2626',fontWeight:700,fontSize:13 }}>
              ⚠️ {erroMsg}
            </div>
          )}

          {/* Colaborador */}
          <div>
            {LBL('Colaborador *')}
            <select value={colabId} onChange={e=>setColabId(e.target.value)} required style={SEL}>
              <option value="">Selecione…</option>
              {colabs.map(c=><option key={c.id} value={c.id}>{c.nome}{c.chapa?` (${c.chapa})`:''}</option>)}
            </select>
          </div>

          {/* Data + hora */}
          <div style={{ display:'grid',gridTemplateColumns:aba==='acidente'?'1fr 1fr':'1fr',gap:10 }}>
            <div>{LBL('Data *')}<input type="date" value={dataOcor} onChange={e=>setDataOcor(e.target.value)} required style={INP}/></div>
            {aba==='acidente'&&<div>{LBL('Hora')}<input type="time" value={hora} onChange={e=>setHora(e.target.value)} style={INP}/></div>}
          </div>

          {/* Gravidade — apenas acidente e geral */}
          {(aba==='acidente') && (
            <div>
              {LBL('Gravidade')}
              <select value={gravidade} onChange={e=>setGravidade(e.target.value)} style={SEL}>
                <option value="leve">Leve</option>
                <option value="moderado">Moderado</option>
                <option value="grave">Grave</option>
                <option value="fatal">Fatal</option>
              </select>
            </div>
          )}

          {/* Campos específicos por tipo */}
          {aba === 'acidente' && (<>
            <div>
              {LBL('Tipo de Acidente')}
              <select value={tipoAcid} onChange={e=>setTipoAcid(e.target.value)} style={SEL}>
                <option value="sem_afastamento">Sem Afastamento</option>
                <option value="com_afastamento">Com Afastamento</option>
                <option value="trajeto">De Trajeto</option>
                <option value="quase_acidente">Quase Acidente</option>
              </select>
            </div>
            <div>
              {LBL('Local do Acidente')}
              <input value={local} onChange={e=>setLocal(e.target.value)} placeholder="Descreva o local…" style={INP}/>
            </div>
            <label style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer',userSelect:'none' }}>
              <input type="checkbox" checked={catEmitida} onChange={e=>setCatEmitida(e.target.checked)} style={{ width:18,height:18 }}/>
              <span style={{ fontSize:14,fontWeight:600,color:'#374151' }}>CAT Emitida</span>
            </label>
          </>)}

          {aba === 'atestado' && (<>
            <div>
              {LBL('Tipo de Atestado')}
              <select value={tipoAtest} onChange={e=>setTipoAtest(e.target.value)} style={SEL}>
                <option value="medico">Médico</option>
                <option value="odontologico">Odontológico</option>
                <option value="acompanhamento">Acompanhamento Familiar</option>
                <option value="outros">Outros</option>
              </select>
            </div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10 }}>
              <div>
                {LBL('Dias de Afastamento')}
                <input type="number" value={diasAfas} onChange={e=>setDiasAfas(e.target.value)} min="0" placeholder="0" style={INP}/>
              </div>
              <div>
                {LBL('CID')}
                <input value={cid} onChange={e=>setCid(e.target.value)} placeholder="Ex.: J00" style={INP}/>
              </div>
            </div>
            <div>
              {LBL('Médico / Hospital')}
              <input value={medico} onChange={e=>setMedico(e.target.value)} placeholder="Nome do médico ou hospital" style={INP}/>
            </div>
            <label style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer',userSelect:'none' }}>
              <input type="checkbox" checked={comAfas} onChange={e=>setComAfas(e.target.checked)} style={{ width:18,height:18 }}/>
              <span style={{ fontSize:14,fontWeight:600,color:'#374151' }}>Com Afastamento</span>
            </label>
          </>)}

          {aba === 'advertencia' && (<>
            <div>
              {LBL('Tipo de Advertência')}
              <select value={tipoAdv} onChange={e=>setTipoAdv(e.target.value)} style={SEL}>
                <option value="verbal">Verbal</option>
                <option value="escrita">Escrita</option>
                <option value="suspensao">Suspensão</option>
              </select>
            </div>
            {tipoAdv === 'suspensao' && (
              <div>
                {LBL('Dias de Suspensão')}
                <input type="number" value={diasSusp} onChange={e=>setDiasSusp(e.target.value)} min="1" style={INP}/>
              </div>
            )}
            <div>
              {LBL('Motivo')}
              <input value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Motivo da advertência…" style={INP}/>
            </div>
            <label style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer',userSelect:'none' }}>
              <input type="checkbox" checked={assinada} onChange={e=>setAssinada(e.target.checked)} style={{ width:18,height:18 }}/>
              <span style={{ fontSize:14,fontWeight:600,color:'#374151' }}>Advertência Assinada</span>
            </label>
          </>)}

          {/* Descrição */}
          <div>
            {LBL('Descrição *')}
            <textarea value={descricao} onChange={e=>{ setDescricao(e.target.value); if(e.target.value.trim()) setErroMsg('') }} rows={4}
              placeholder={aba==='acidente'?'Descreva como ocorreu o acidente…':aba==='atestado'?'Motivo do afastamento…':'Detalhes da ocorrência…'}
              style={{ width:'100%',border:`2px solid ${!descricao.trim()?'#fca5a5':'#e5e7eb'}`,borderRadius:8,padding:'10px 12px',fontSize:13,boxSizing:'border-box',background:!descricao.trim()?'#fff5f5':'#fff',resize:'vertical' }}/>
            {!descricao.trim() && <p style={{ fontSize:11, color:'#dc2626', marginTop:4, fontWeight:600 }}>⚠️ Campo obrigatório — preencha antes de registrar</p>}
          </div>

          <button type="submit" disabled={saving} style={{
            height:52,background:saving?'#94a3b8':'#dc2626',color:'#fff',border:'none',borderRadius:12,fontSize:16,fontWeight:700,
            cursor:saving?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,
            opacity:1,
          }}>
            {saving?<><Loader2 size={18} className="animate-spin"/>Salvando…</>:<><AlertTriangle size={18}/>Registrar Ocorrência</>}
          </button>
        </form>
      )}

      {/* ── HISTÓRICO / GERAL ── */}
      {(subAba === 'historico' || aba === 'geral') && (
        <div style={{ padding:'0 16px 32px' }}>
          {aba==='geral'&&(
            <div style={{ marginBottom:12,fontWeight:700,fontSize:13,color:'var(--muted-foreground)' }}>
              Todas as ocorrências registradas — {historico.length} registros
            </div>
          )}
          {historico.length===0?(
            <div style={{ background:'#fff',borderRadius:12,padding:32,textAlign:'center',color:'#9ca3af' }}>
              Nenhuma ocorrência registrada ainda
            </div>
          ):historico.map(h=>{
            const jaSync=!!h.sincronizado_em
            const cNome=(h as any).colaboradores?.nome??'—'
            const gc=GRAV_COR[h.gravidade??'']??{bg:'#f3f4f6',cor:'#374151'}
            const tipoCor={acidente:'#dc2626',atestado:'#2563eb',advertencia:'#ea580c',geral:'#7c3aed'}[h.tipo]??'#6b7280'
            return(
              <div key={h.id} style={{ background:'#fff',borderRadius:12,border:`1px solid ${jaSync?'#86efac':'#e5e7eb'}`,marginBottom:8,padding:'14px 16px' }}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',marginBottom:4 }}>
                      <span style={{ background:tipoCor+'20',color:tipoCor,borderRadius:5,padding:'1px 8px',fontSize:11,fontWeight:700,textTransform:'uppercase' }}>{h.tipo}</span>
                      {h.gravidade&&<span style={{ background:gc.bg,color:gc.cor,borderRadius:5,padding:'1px 8px',fontSize:11,fontWeight:700 }}>{h.gravidade}</span>}
                    </div>
                    <div style={{ fontWeight:700,fontSize:14,color:'#111' }}>{cNome}</div>
                    <div style={{ fontSize:12,color:'#374151',marginTop:4,lineHeight:1.4 }}>{h.descricao}</div>
                    {h.local&&<div style={{ fontSize:11,color:'#6b7280',marginTop:2 }}>📍 {h.local}</div>}
                    {h.dias_afastamento&&<div style={{ fontSize:11,color:'#2563eb',marginTop:2 }}>🏥 {h.dias_afastamento} dia(s) afastamento</div>}
                    {h.motivo&&<div style={{ fontSize:11,color:'#ea580c',marginTop:2 }}>📋 {(h as any).motivo}</div>}
                  </div>
                  <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6 }}>
                    {jaSync?<span style={{ background:'#dcfce7',color:'#15803d',borderRadius:5,padding:'2px 8px',fontSize:11,fontWeight:700 }}>✓ Sincronizado</span>
                           :<span style={{ background:'#fef3c7',color:'#b45309',borderRadius:5,padding:'2px 8px',fontSize:11,fontWeight:700 }}>⏳ Pendente</span>}
                    {!jaSync&&(
                      <button onClick={()=>excluir(h.id,h.sincronizado_em)} disabled={deletandoId===h.id}
                        style={{ background:'none',border:'1px solid #fca5a5',borderRadius:6,padding:'3px 8px',cursor:'pointer',display:'flex',alignItems:'center',gap:4,color:'#dc2626',fontSize:11 }}>
                        <Trash2 size={12}/>{deletandoId===h.id?'…':'Excluir'}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize:10,color:'#9ca3af',marginTop:6 }}>
                  {h.data_ocorrencia.split('-').reverse().join('/')} · {new Date(h.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PortalLayout>
  )
}
