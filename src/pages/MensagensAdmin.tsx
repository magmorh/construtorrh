import React, { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Send, RefreshCw, Building2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'

interface Mensagem {
  id: string
  obra_id: string
  remetente: string
  remetente_nome?: string | null
  texto: string
  lida: boolean
  criado_em: string
}
interface Obra { id: string; nome: string }

export default function MensagensAdmin() {
  const [obras,      setObras]      = useState<Obra[]>([])
  const [obraId,     setObraId]     = useState<string>('')
  const [mensagens,  setMensagens]  = useState<Mensagem[]>([])
  const [texto,      setTexto]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [sending,    setSending]    = useState(false)
  const [naoLidas,   setNaoLidas]   = useState<Record<string,number>>({})
  const bottomRef = useRef<HTMLDivElement>(null)

  // ── Carrega obras com mensagens não lidas ──────────────────────────────────
  const fetchObras = useCallback(async () => {
    const [{ data: obs }, { data: msgs }] = await Promise.all([
      supabase.from('obras').select('id,nome').order('nome'),
      supabase.from('portal_mensagens').select('obra_id').eq('remetente','obra').eq('lida', false),
    ])
    if (obs) setObras(obs)
    const cnt: Record<string,number> = {}
    msgs?.forEach((m: any) => { cnt[m.obra_id] = (cnt[m.obra_id] ?? 0) + 1 })
    setNaoLidas(cnt)
    if (!obraId && obs && obs.length > 0) setObraId(obs[0].id)
  }, [])

  // ── Mensagens da obra selecionada ──────────────────────────────────────────
  const fetchMensagens = useCallback(async () => {
    if (!obraId) return
    setLoading(true)
    const { data } = await supabase
      .from('portal_mensagens')
      .select('id,obra_id,remetente,remetente_nome,texto,lida,criado_em')
      .eq('obra_id', obraId)
      .order('criado_em', { ascending: true })
    setMensagens(data ?? [])
    // Marca msgs da obra como lidas
    const naoLidasIds = (data ?? []).filter((m: Mensagem) => m.remetente === 'obra' && !m.lida).map((m: Mensagem) => m.id)
    if (naoLidasIds.length) {
      await supabase.from('portal_mensagens').update({ lida: true }).in('id', naoLidasIds)
      setNaoLidas(prev => ({ ...prev, [obraId]: 0 }))
    }
    setLoading(false)
  }, [obraId])

  useEffect(() => { fetchObras() }, [fetchObras])
  useEffect(() => { fetchMensagens() }, [fetchMensagens])
  useRefreshOnFocus(fetchObras)

  // Auto scroll
  useEffect(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [mensagens])

  async function handleEnviar() {
    if (!texto.trim() || !obraId) return
    setSending(true)
    const { error } = await supabase.from('portal_mensagens').insert({
      obra_id: obraId,
      remetente: 'admin',
      remetente_nome: 'Painel Admin',
      texto: texto.trim(),
      lida: false,
    })
    if (error) { toast.error('Erro ao enviar mensagem'); setSending(false); return }
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

  const grupos: { data: string; msgs: Mensagem[] }[] = []
  mensagens.forEach(m => {
    const d = m.criado_em.slice(0,10)
    const last = grupos[grupos.length-1]
    if (last && last.data === d) last.msgs.push(m)
    else grupos.push({ data: d, msgs: [m] })
  })

  const totalNaoLidas = Object.values(naoLidas).reduce((a,b) => a+b, 0)
  const obraAtual = obras.find(o => o.id === obraId)

  return (
    <div className="page-root">
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontWeight:800, fontSize:22, margin:0, display:'flex', alignItems:'center', gap:8 }}>
            <MessageSquare size={22} style={{ color:'#7c3aed' }}/> Mensagens das Obras
          </h1>
          <p style={{ fontSize:13, color:'var(--muted-foreground)', marginTop:4 }}>
            Comunicação direta com os encarregados via portal
            {totalNaoLidas > 0 && (
              <span style={{ marginLeft:8, background:'#dc2626', color:'#fff', borderRadius:10, padding:'1px 8px', fontSize:11, fontWeight:700 }}>
                {totalNaoLidas} não lida{totalNaoLidas > 1 ? 's':''}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" onClick={fetchObras} style={{ gap:6 }}>
          <RefreshCw size={14}/> Atualizar
        </Button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'240px 1fr', gap:16, height:'calc(100vh - 220px)' }}>
        {/* Lista de obras */}
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', background:'#1e3a5f' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#fff' }}>
              <Building2 size={13} style={{ display:'inline', marginRight:6 }}/>OBRAS
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {obras.map(o => {
              const cnt = naoLidas[o.id] ?? 0
              const ativo = o.id === obraId
              return (
                <button key={o.id} onClick={() => setObraId(o.id)}
                  style={{
                    width:'100%', padding:'10px 14px', border:'none', textAlign:'left', cursor:'pointer',
                    borderBottom:'1px solid var(--border)',
                    background: ativo ? '#eff6ff':'transparent',
                    borderLeft: ativo ? '3px solid #1e3a5f':'3px solid transparent',
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                  }}>
                  <div style={{ fontSize:12, fontWeight: ativo ? 700:500, color:'var(--foreground)', lineHeight:1.3 }}>{o.nome}</div>
                  {cnt > 0 && (
                    <span style={{ background:'#dc2626', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:700, flexShrink:0 }}>{cnt}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Chat */}
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Header do chat */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'#f8fafc', display:'flex', alignItems:'center', gap:8 }}>
            <Building2 size={15} color="#1e3a5f"/>
            <div style={{ fontWeight:700, fontSize:13 }}>{obraAtual?.nome ?? 'Selecione uma obra'}</div>
          </div>

          {/* Mensagens */}
          <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', display:'flex', flexDirection:'column', gap:4 }}>
            {loading ? (
              <div style={{ textAlign:'center', padding:40, color:'var(--muted-foreground)', fontSize:13 }}>Carregando…</div>
            ) : mensagens.length === 0 ? (
              <div style={{ textAlign:'center', padding:60 }}>
                <div style={{ fontSize:36, marginBottom:8 }}>💬</div>
                <div style={{ fontWeight:700, color:'var(--foreground)' }}>Nenhuma mensagem</div>
                <div style={{ fontSize:12, color:'var(--muted-foreground)', marginTop:4 }}>O encarregado ainda não enviou mensagens desta obra.</div>
              </div>
            ) : (
              grupos.map(grupo => (
                <div key={grupo.data}>
                  <div style={{ textAlign:'center', margin:'10px 0 6px' }}>
                    <span style={{ background:'var(--muted)', borderRadius:10, padding:'3px 10px', fontSize:10, color:'var(--muted-foreground)', fontWeight:600 }}>
                      {fmtData(grupo.data)}
                    </span>
                  </div>
                  {grupo.msgs.map(msg => {
                    const ehAdmin = msg.remetente === 'admin'
                    return (
                      <div key={msg.id} style={{
                        display:'flex', justifyContent: ehAdmin ? 'flex-end':'flex-start',
                        marginBottom:6,
                      }}>
                        <div style={{
                          maxWidth:'72%',
                          background: ehAdmin ? '#1e3a5f':'var(--muted)',
                          color: ehAdmin ? '#fff':'var(--foreground)',
                          borderRadius: ehAdmin ? '14px 14px 4px 14px':'14px 14px 14px 4px',
                          padding:'9px 13px',
                          border: ehAdmin ? 'none':'1px solid var(--border)',
                        }}>
                          {!ehAdmin && (
                            <div style={{ fontSize:10, fontWeight:700, color:'#f97316', marginBottom:3 }}>
                              {msg.remetente_nome ?? 'Encarregado'}
                            </div>
                          )}
                          <div style={{ fontSize:13, lineHeight:1.5 }}>{msg.texto}</div>
                          <div style={{ fontSize:9, marginTop:4, textAlign:'right', color: ehAdmin?'rgba(255,255,255,0.6)':'var(--muted-foreground)' }}>
                            {fmtHora(msg.criado_em)}
                            {!ehAdmin && !msg.lida && <span style={{ marginLeft:4, background:'#fbbf24', borderRadius:3, padding:'0 4px', fontSize:9, fontWeight:700, color:'#111' }}>NOVA</span>}
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

          {/* Input */}
          <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:8, alignItems:'center' }}>
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() }}}
              placeholder={`Responder a ${obraAtual?.nome ?? 'obra'}…`}
              rows={1}
              style={{ flex:1, border:'1px solid var(--border)', borderRadius:20, padding:'8px 14px', fontSize:13, resize:'none', outline:'none', background:'var(--background)', fontFamily:'inherit', lineHeight:1.4 }}
            />
            <Button onClick={handleEnviar} disabled={sending || !texto.trim()} style={{ background:'#1e3a5f', color:'#fff', borderRadius:'50%', width:38, height:38, padding:0, flexShrink:0 }}>
              <Send size={15}/>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
