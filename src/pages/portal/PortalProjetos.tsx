import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { FolderOpen, ExternalLink, RefreshCw, Cloud, HardDrive, FileText } from 'lucide-react'

interface ObraOption { id: string; nome: string; link_projetos?: string | null; obs_projetos?: string | null }

function detectarIcone(url: string) {
  if (!url) return <FolderOpen size={28} color="#1e3a5f"/>
  const u = url.toLowerCase()
  if (u.includes('drive.google')) return <span style={{fontSize:28}}>📁</span>
  if (u.includes('docs.google'))  return <span style={{fontSize:28}}>📄</span>
  if (u.includes('onedrive') || u.includes('sharepoint')) return <span style={{fontSize:28}}>☁️</span>
  if (u.includes('dropbox'))      return <span style={{fontSize:28}}>📦</span>
  if (u.includes('notion'))       return <span style={{fontSize:28}}>📝</span>
  return <Cloud size={28} color="#1e3a5f"/>
}

function detectarLabel(url: string) {
  if (!url) return 'Link de Projetos'
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
  const session = getPortalSession()

  const [obras,   setObras]   = useState<ObraOption[]>([])
  const [obraId,  setObraId]  = useState<string>('')
  const [loading, setLoading] = useState(false)

  const fetchObras = useCallback(async () => {
    if (!session) { nav('/portal'); return }
    const ids = session.obras_ids ?? []
    if (!ids.length) return
    setLoading(true)
    const { data } = await supabase
      .from('obras')
      .select('id,nome,link_projetos,obs_projetos')
      .in('id', ids)
      .order('nome')
    if (data) {
      setObras(data)
      if (!obraId && data.length > 0) setObraId(data[0].id)
    }
    setLoading(false)
  }, [session, nav])

  useEffect(() => { fetchObras() }, [fetchObras])

  if (!session) return null

  const obra = obras.find(o => o.id === obraId)

  return (
    <PortalLayout>
      <div style={{ padding:'16px 16px 8px' }}>
        <div style={{ fontSize:20, fontWeight:800, color:'#1e3a5f', marginBottom:4 }}>
          🗂️ Projetos da Obra
        </div>
        <div style={{ fontSize:12, color:'#6b7280', marginBottom:14 }}>
          Acesso aos documentos e arquivos da obra
        </div>

        {/* Seletor de obra */}
        {obras.length > 1 && (
          <select value={obraId} onChange={e => setObraId(e.target.value)}
            style={{ width:'100%', height:38, borderRadius:8, border:'1px solid #d1d5db', background:'#fff', fontSize:13, paddingLeft:10, marginBottom:14, color:'#111' }}>
            {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        )}

        <button onClick={fetchObras}
          style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#6b7280', background:'transparent', border:'none', cursor:'pointer', marginBottom:16, padding:0 }}>
          <RefreshCw size={12}/> Atualizar
        </button>
      </div>

      {/* Card principal */}
      <div style={{ padding:'0 16px 24px' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#9ca3af', fontSize:13 }}>Carregando…</div>
        ) : !obra ? null : !obra.link_projetos ? (
          /* Sem link configurado */
          <div style={{ background:'#fff', borderRadius:16, border:'2px dashed #d1d5db', padding:'48px 24px', textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
            <div style={{ fontWeight:700, fontSize:15, color:'#374151', marginBottom:6 }}>
              Nenhum link de projetos configurado
            </div>
            <div style={{ fontSize:12, color:'#9ca3af', lineHeight:1.6 }}>
              O responsável deve acessar o painel administrativo e cadastrar o link do Google Drive,
              OneDrive ou outro sistema de nuvem para esta obra.
            </div>
          </div>
        ) : (
          /* Link configurado */
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {/* Card de acesso principal */}
            <div style={{
              background:'linear-gradient(135deg, #1e3a5f 0%, #1a5276 100%)',
              borderRadius:16, padding:'20px 18px',
              boxShadow:'0 4px 20px rgba(30,58,95,0.25)',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                <div style={{ width:52, height:52, borderRadius:12, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {detectarIcone(obra.link_projetos)}
                </div>
                <div>
                  <div style={{ color:'rgba(255,255,255,0.65)', fontSize:11, fontWeight:600 }}>PROJETOS DA OBRA</div>
                  <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>{detectarLabel(obra.link_projetos)}</div>
                  <div style={{ color:'rgba(255,255,255,0.55)', fontSize:11, marginTop:2 }}>{obra.nome}</div>
                </div>
              </div>
              <a
                href={obra.link_projetos}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  background:'rgba(255,255,255,0.15)',
                  border:'1.5px solid rgba(255,255,255,0.3)',
                  borderRadius:10, padding:'12px 16px',
                  color:'#fff', fontWeight:700, fontSize:14,
                  textDecoration:'none',
                  transition:'background 0.15s',
                }}>
                <ExternalLink size={16}/> Abrir Pasta de Projetos
              </a>
            </div>

            {/* Observações se houver */}
            {obra.obs_projetos && (
              <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                  <FileText size={13} color="#b45309"/>
                  <span style={{ fontSize:11, fontWeight:700, color:'#b45309' }}>OBSERVAÇÕES DO RESPONSÁVEL</span>
                </div>
                <div style={{ fontSize:12, color:'#374151', lineHeight:1.6 }}>{obra.obs_projetos}</div>
              </div>
            )}

            {/* Informativo */}
            <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#0369a1', marginBottom:4 }}>ℹ️ Como utilizar</div>
              <ul style={{ margin:0, paddingLeft:16, fontSize:11, color:'#374151', lineHeight:1.8 }}>
                <li>Toque em <strong>"Abrir Pasta de Projetos"</strong> para acessar os arquivos</li>
                <li>Você poderá <strong>visualizar e baixar</strong> os documentos</li>
                <li>Para enviar arquivos, siga as permissões configuradas pelo responsável</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  )
}
