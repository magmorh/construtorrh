import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { Send, RefreshCw, Clock, CheckCheck } from 'lucide-react'

interface Mensagem {
  id: string
  obra_id: string
  obra_nome?: string
  remetente: string        // 'obra' | 'admin'
  texto: string
  lida: boolean
  criado_em: string
}

interface ObraOption { id: string; nome: string }

export default function PortalMensagens() {
  const nav     = useNavigate()
  const session = getPortalSession()

  const [obras,    setObras]    = useState<ObraOption[]>([])
  const [obraId,   setObraId]   = useState<string>('')
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [texto,    setTexto]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [sending,  setSending]  = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Obras do encarregado ───────────────────────────────────────────────────
  const fetchObras = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    const ids = session.obras_ids ?? []
    if (!ids.length) return
    const { data } = await supabase.from('obras').select('id,nome').in('id', ids).order('nome')
    if (data) {
      setObras(data)
      if (!obraId && data.length > 0) setObraId(data[0].id)
    }
  }, [session, nav])

  // ── Mensagens da obra ──────────────────────────────────────────────────────
  const fetchMensagens = useCallback(async () => {
    if (!obraId) return
    setLoading(true)
    const { data } = await supabase
      .from('portal_mensagens')
      .select('id,obra_id,remetente,texto,lida,criado_em')
      .eq('obra_id', obraId)
      .order('criado_em', { ascending: true })
    setMensagens(data ?? [])
    // Marca mensagens do admin como lidas
    const naoLidas = (data ?? []).filter((m: Mensagem) => m.remetente === 'admin' && !m.lida)
    if (naoLidas.length) {
      await supabase.from('portal_mensagens').update({ lida: true }).in('id', naoLidas.map((m: Mensagem) => m.id))
    }
    setLoading(false)
  }, [obraId])

  useEffect(() => { fetchObras() }, [fetchObras])
  useEffect(() => { fetchMensagens() }, [fetchMensagens])

  // Auto scroll para o fim
  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [mensagens])

  if (!session) return null

  async function handleEnviar() {
    if (!texto.trim() || !obraId) return
    setSending(true)
    const nomeRemetente = session?.nome ?? session?.login ?? 'Encarregado'
    await supabase.from('portal_mensagens').insert({
      obra_id: obraId,
      remetente: 'obra',
      remetente_nome: nomeRemetente,
      texto: texto.trim(),
      lida: false,
    })
    setTexto('')
    await fetchMensagens()
    setSending(false)
  }

  function fmtHora(dt: string) {
    return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  function fmtData(dt: string) {
    return new Date(dt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  // Agrupa mensagens por data
  const grupos: { data: string; msgs: Mensagem[] }[] = []
  mensagens.forEach(m => {
    const d = m.criado_em.slice(0, 10)
    const last = grupos[grupos.length - 1]
    if (last && last.data === d) last.msgs.push(m)
    else grupos.push({ data: d, msgs: [m] })
  })

  const obraAtual = obras.find(o => o.id === obraId)

  return (
    <PortalLayout>
      <div style={{ display:'flex', flexDirection:'column', height:'calc(100dvh - 132px)' }}>

        {/* Cabeçalho */}
        <div style={{ padding:'14px 16px 10px', background:'#fff', borderBottom:'1px solid #e5e7eb' }}>
          <div style={{ fontSize:18, fontWeight:800, color:'#1e3a5f', marginBottom:4 }}>
            💬 Mensagens
          </div>
          {obras.length > 1 ? (
            <select value={obraId} onChange={e => setObraId(e.target.value)}
              style={{ width:'100%', height:34, borderRadius:7, border:'1px solid #d1d5db', background:'#f8fafc', fontSize:12, paddingLeft:8, color:'#111' }}>
              {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          ) : (
            <div style={{ fontSize:12, color:'#6b7280' }}>{obraAtual?.nome}</div>
          )}
        </div>

        {/* Área de mensagens */}
        <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:4 }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:'#9ca3af', fontSize:13 }}>Carregando…</div>
          ) : mensagens.length === 0 ? (
            <div style={{ textAlign:'center', padding:60 }}>
              <div style={{ fontSize:36, marginBottom:8 }}>💬</div>
              <div style={{ fontWeight:700, color:'#374151' }}>Nenhuma mensagem ainda</div>
              <div style={{ fontSize:12, color:'#9ca3af', marginTop:4 }}>Envie uma mensagem para o painel administrativo</div>
            </div>
          ) : (
            grupos.map(grupo => (
              <div key={grupo.data}>
                {/* Separador de data */}
                <div style={{ textAlign:'center', margin:'10px 0 6px' }}>
                  <span style={{ background:'#e5e7eb', borderRadius:10, padding:'3px 10px', fontSize:10, color:'#6b7280', fontWeight:600 }}>
                    {fmtData(grupo.data)}
                  </span>
                </div>
                {grupo.msgs.map(msg => {
                  const ehObra = msg.remetente === 'obra'
                  return (
                    <div key={msg.id} style={{
                      display:'flex', justifyContent: ehObra ? 'flex-end':'flex-start',
                      marginBottom:6,
                    }}>
                      <div style={{
                        maxWidth:'78%', background: ehObra ? '#1e3a5f':'#fff',
                        color: ehObra ? '#fff':'#111',
                        border: ehObra ? 'none':'1px solid #e5e7eb',
                        borderRadius: ehObra ? '14px 14px 4px 14px':'14px 14px 14px 4px',
                        padding:'9px 13px',
                        boxShadow:'0 1px 3px rgba(0,0,0,0.07)',
                      }}>
                        {!ehObra && (
                          <div style={{ fontSize:10, fontWeight:700, color:'#7c3aed', marginBottom:3 }}>Painel Admin</div>
                        )}
                        <div style={{ fontSize:13, lineHeight:1.5 }}>{msg.texto}</div>
                        <div style={{ fontSize:9, marginTop:4, textAlign:'right', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4,
                          color: ehObra ? 'rgba(255,255,255,0.6)':'#9ca3af' }}>
                          <Clock size={9}/>{fmtHora(msg.criado_em)}
                          {ehObra && msg.lida && <CheckCheck size={10} color="#86efac"/>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Campo de envio */}
        <div style={{ padding:'10px 12px', background:'#fff', borderTop:'1px solid #e5e7eb',
          display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={fetchMensagens}
            style={{ width:34, height:34, borderRadius:8, border:'1px solid #e5e7eb', background:'#f8fafc', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <RefreshCw size={13} color="#6b7280"/>
          </button>
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() }}}
            placeholder="Digite sua mensagem…"
            rows={1}
            style={{ flex:1, border:'1px solid #d1d5db', borderRadius:20, padding:'8px 14px', fontSize:13, resize:'none', outline:'none', background:'#f8fafc', fontFamily:'inherit', lineHeight:1.4 }}
          />
          <button onClick={handleEnviar} disabled={sending || !texto.trim()}
            style={{
              width:38, height:38, borderRadius:'50%', border:'none', flexShrink:0,
              background: texto.trim() ? '#1e3a5f':'#e5e7eb',
              cursor: texto.trim() ? 'pointer':'default',
              display:'flex', alignItems:'center', justifyContent:'center',
              transition:'background 0.15s',
            }}>
            <Send size={15} color={texto.trim()?'#fff':'#9ca3af'}/>
          </button>
        </div>
      </div>
    </PortalLayout>
  )
}
