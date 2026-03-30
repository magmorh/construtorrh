import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { FolderOpen, ExternalLink, RefreshCw, Cloud, FileText, Link2, AlertCircle } from 'lucide-react'

interface ObraOption {
  id: string
  nome: string
  link_projetos?: string | null
  obs_projetos?: string | null
}

function detectarIcone(url: string) {
  const u = url.toLowerCase()
  if (u.includes('drive.google')) return '📁'
  if (u.includes('docs.google'))  return '📄'
  if (u.includes('onedrive') || u.includes('sharepoint')) return '☁️'
  if (u.includes('dropbox'))      return '📦'
  if (u.includes('notion'))       return '📝'
  return '🔗'
}

function detectarLabel(url: string) {
  const u = url.toLowerCase()
  if (u.includes('drive.google')) return 'Google Drive'
  if (u.includes('docs.google'))  return 'Google Docs'
  if (u.includes('onedrive'))     return 'OneDrive'
  if (u.includes('sharepoint'))   return 'SharePoint'
  if (u.includes('dropbox'))      return 'Dropbox'
  if (u.includes('notion'))       return 'Notion'
  return 'Pasta de Projetos'
}

export default function PortalProjetos() {
  const nav     = useNavigate()
  // useMemo garante que session não muda referência a cada render
  const session = React.useMemo(() => getPortalSession(), [])

  const [obras,    setObras]   = useState<ObraOption[]>([])
  const [obraId,   setObraId]  = useState<string>('')
  const [loading,  setLoading] = useState(false)
  const [erro,     setErro]    = useState<string | null>(null)

  const fetchObras = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    const ids = session.obras_ids ?? []
    if (!ids.length) { setErro('Nenhuma obra vinculada a este acesso.'); setLoading(false); return }
    setLoading(true)
    setErro(null)
    const { data, error } = await supabase
      .from('obras')
      .select('id,nome,link_projetos,obs_projetos')
      .in('id', ids)
      .order('nome')
    if (error) { setErro('Erro ao buscar obras: ' + error.message); setLoading(false); return }
    if (data) {
      setObras(data)
      setObraId(prev => prev || (data.length > 0 ? data[0].id : ''))
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // só roda uma vez na montagem

  useEffect(() => { fetchObras() }, [fetchObras])

  if (!session) return null

  const obra = obras.find(o => o.id === obraId)

  return (
    <PortalLayout>
      <div style={{ padding:'16px 16px 8px' }}>

        {/* Título */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:'#0d3f56', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <FolderOpen size={18} color="#fff"/>
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:'#1e293b' }}>Projetos da Obra</div>
            <div style={{ fontSize:11, color:'#64748b' }}>Acesse os documentos e arquivos</div>
          </div>
        </div>

        {/* Seletor de obra */}
        {obras.length > 1 && (
          <select value={obraId} onChange={e => setObraId(e.target.value)}
            style={{ width:'100%', height:40, borderRadius:8, border:'2px solid #e2e8f0', background:'#fff', fontSize:13, padding:'0 12px', marginBottom:14, color:'#1e293b', fontWeight:600 }}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        )}

        <button onClick={fetchObras}
          style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#64748b', background:'transparent', border:'none', cursor:'pointer', marginBottom:16, padding:0 }}>
          <RefreshCw size={12}/> Atualizar
        </button>

        {erro && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'10px 12px', display:'flex', gap:8, alignItems:'flex-start', marginBottom:12 }}>
            <AlertCircle size={14} color="#dc2626" style={{ flexShrink:0, marginTop:1 }}/>
            <span style={{ fontSize:12, color:'#dc2626' }}>{erro}</span>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div style={{ padding:'0 16px 32px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#9ca3af', fontSize:13 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🔄</div>Carregando…
          </div>
        ) : !obra ? null : !obra.link_projetos ? (
          /* ── Sem link configurado ── */
          <div style={{ background:'#fff', borderRadius:16, border:'2px dashed #d1d5db', padding:'40px 24px', textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
            <div style={{ fontWeight:800, fontSize:15, color:'#374151', marginBottom:8 }}>
              Nenhum link de projetos cadastrado
            </div>
            <div style={{ fontSize:12, color:'#9ca3af', lineHeight:1.7, maxWidth:280, margin:'0 auto' }}>
              O responsável precisa cadastrar o link do Google Drive, OneDrive ou outro sistema de nuvem para a obra <strong>{obra.nome}</strong>.
            </div>
            <div style={{ marginTop:20, padding:'10px 14px', background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, textAlign:'left' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#1d4ed8', marginBottom:4 }}>Como configurar:</div>
              <div style={{ fontSize:11, color:'#374151', lineHeight:1.7 }}>
                Acesse o sistema ConstrutorRH → Obras → {obra.nome} → editar → campo "Link de Projetos"
              </div>
            </div>
          </div>
        ) : (
          /* ── Link configurado ── */
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Card principal */}
            <div style={{
              background:'linear-gradient(135deg, #0d3f56 0%, #0a3347 100%)',
              borderRadius:16, padding:'20px 18px',
              boxShadow:'0 6px 24px rgba(13,63,86,0.30)',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <div style={{ width:52, height:52, borderRadius:12, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 }}>
                  {detectarIcone(obra.link_projetos)}
                </div>
                <div>
                  <div style={{ color:'rgba(255,255,255,0.6)', fontSize:10, fontWeight:700, letterSpacing:'0.05em' }}>PROJETOS DA OBRA</div>
                  <div style={{ color:'#fff', fontWeight:800, fontSize:16 }}>{detectarLabel(obra.link_projetos)}</div>
                  <div style={{ color:'rgba(255,255,255,0.55)', fontSize:11, marginTop:2 }}>{obra.nome}</div>
                </div>
              </div>
              <a
                href={obra.link_projetos}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  background:'rgba(255,255,255,0.18)', border:'1.5px solid rgba(255,255,255,0.35)',
                  borderRadius:10, padding:'13px 16px',
                  color:'#fff', fontWeight:800, fontSize:14,
                  textDecoration:'none', transition:'background 0.15s',
                }}>
                <ExternalLink size={16}/> Abrir Pasta de Projetos
              </a>
            </div>

            {/* URL como texto (para copiar) */}
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 12px', display:'flex', alignItems:'center', gap:8 }}>
              <Link2 size={13} color="#94a3b8" style={{ flexShrink:0 }}/>
              <span style={{ fontSize:11, color:'#64748b', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {obra.link_projetos}
              </span>
            </div>

            {/* Observações */}
            {obra.obs_projetos && (
              <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                  <FileText size={13} color="#b45309"/>
                  <span style={{ fontSize:11, fontWeight:800, color:'#b45309' }}>OBSERVAÇÕES DO RESPONSÁVEL</span>
                </div>
                <div style={{ fontSize:12, color:'#374151', lineHeight:1.7 }}>{obra.obs_projetos}</div>
              </div>
            )}

            {/* Dicas */}
            <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#0369a1', marginBottom:6 }}>💡 Como utilizar</div>
              <ul style={{ margin:0, paddingLeft:16, fontSize:11, color:'#374151', lineHeight:1.9 }}>
                <li>Toque em <strong>"Abrir Pasta de Projetos"</strong> para acessar</li>
                <li>Você poderá <strong>visualizar e baixar</strong> os documentos</li>
                <li>Para envio de arquivos, siga as permissões configuradas</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  )
}
