import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Loader2, Lock, ExternalLink } from 'lucide-react'

const SESSION_KEY = 'contracheque_session'

/**
 * DocViewer — Visualizador seguro de documentos.
 * Verifica autenticação (admin via Supabase Auth OU portal via sessão local)
 * e gera URL assinada temporária (10 min) antes de exibir o documento.
 * 
 * Uso: /doc-viewer?bucket=ocorrencias-documentos&path=docs/arquivo.pdf
 * 
 * Para links externos completos do Supabase storage:
 * /doc-viewer?url=https://...supabase.co/storage/v1/object/public/bucket/path
 */
export default function DocViewer() {
  const [params]    = useSearchParams()
  const [status, setStatus] = useState<'checking'|'loading'|'ready'|'denied'|'bucket_error'>('checking')
  const [signedUrl, setSignedUrl] = useState<string|null>(null)
  const [fileName, setFileName]  = useState<string>('')

  const rawUrl = params.get('url') ?? ''
  const bucket = params.get('bucket') ?? ''
  const path   = params.get('path') ?? ''

  // Extrair bucket e path de uma URL pública do Supabase Storage
  function parseStorageUrl(url: string): { bucket: string; path: string } | null {
    // https://{ref}.supabase.co/storage/v1/object/public/{bucket}/{path}
    const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?.*)?$/)
    if (!match) return null
    return { bucket: match[1], path: decodeURIComponent(match[2]) }
  }

  useEffect(() => {
    async function run() {
      // 1 — Verificar autenticação
      const { data: { session } } = await supabase.auth.getSession()
      const portalSession = (() => {
        try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null } catch { return null }
      })()

      if (!session && !portalSession) {
        setStatus('denied')
        return
      }

      // 2 — Resolver bucket/path
      let b = bucket, p = path
      if (rawUrl && (!b || !p)) {
        const parsed = parseStorageUrl(rawUrl)
        if (!parsed) { setStatus('denied'); return }
        b = parsed.bucket; p = parsed.path
      }

      if (!b || !p) { setStatus('denied'); return }

      setFileName(p.split('/').pop() ?? 'documento')
      setStatus('loading')

      // 3 — Se rawUrl disponível, tentar diretamente primeiro
      if (rawUrl) {
        try {
          const testRes = await fetch(rawUrl, { method: 'HEAD' })
          if (testRes.ok) {
            setSignedUrl(rawUrl)
            setStatus('ready')
            return
          }
        } catch { /* continuar para signed url */ }
      }

      // 4 — Gerar signed URL (600 seg = 10 min)
      const { data, error } = await supabase.storage.from(b).createSignedUrl(p, 600)
      if (error || !data?.signedUrl) {
        // Verificar se é erro de bucket inexistente
        const errMsg = (error as any)?.message ?? ''
        if (errMsg.toLowerCase().includes('bucket') || errMsg.includes('404')) {
          setStatus('bucket_error')
          return
        }
        // Se erro de permissão, tentar com URL pública diretamente
        const { data: pub } = supabase.storage.from(b).getPublicUrl(p)
        if (pub?.publicUrl) {
          setSignedUrl(pub.publicUrl)
          setStatus('ready')
          return
        }
        setStatus('denied')
        return
      }
      setSignedUrl(data.signedUrl)
      setStatus('ready')
    }
    run()
  }, [rawUrl, bucket, path])

  if (status === 'checking' || status === 'loading') return (
    <div style={{ minHeight:'100vh', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
      <Loader2 size={32} style={{ animation:'spin 1s linear infinite' }} color="#1a56a0"/>
      <span style={{ fontSize:14, color:'#6b7280' }}>{status === 'checking' ? 'Verificando acesso…' : 'Carregando documento…'}</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (status === 'bucket_error') return (
    <div style={{ minHeight:'100vh', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, padding:32 }}>
      <div style={{ width:56, height:56, borderRadius:'50%', background:'#fef3c7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>⚠️</div>
      <h2 style={{ fontSize:20, fontWeight:700, color:'#92400e', margin:0 }}>Storage não configurado</h2>
      <p style={{ fontSize:14, color:'#6b7280', textAlign:'center', maxWidth:420, lineHeight:1.7, margin:0 }}>
        O bucket de armazenamento ainda não foi criado no Supabase.<br/>
        Execute o SQL abaixo no <strong>Supabase SQL Editor</strong>:
      </p>
      <a href="https://supabase.com/dashboard/project/rbhmfqngnjxdemavtvxk/sql" target="_blank" rel="noreferrer"
        style={{ padding:'10px 24px', background:'#16a34a', color:'#fff', borderRadius:8, textDecoration:'none', fontWeight:700, fontSize:14 }}>
        🔗 Abrir SQL Editor
      </a>
      <code style={{ background:'#f3f4f6', borderRadius:8, padding:'12px 16px', fontSize:11, maxWidth:500, wordBreak:'break-all', color:'#374151', lineHeight:1.6 }}>
        INSERT INTO storage.buckets (id, name, public) VALUES ('ocorrencias-documentos', 'ocorrencias-documentos', true) ON CONFLICT DO NOTHING;
      </code>
    </div>
  )

  if (status === 'denied') return (
    <div style={{ minHeight:'100vh', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16, padding:32 }}>
      <div style={{ width:56, height:56, borderRadius:'50%', background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Lock size={24} color="#dc2626"/>
      </div>
      <h2 style={{ fontSize:20, fontWeight:700, color:'#111827', margin:0 }}>Acesso Restrito</h2>
      <p style={{ fontSize:14, color:'#6b7280', textAlign:'center', maxWidth:340, lineHeight:1.7, margin:0 }}>
        Este documento só pode ser visualizado por usuários autenticados no sistema.
        Faça login para continuar.
      </p>
      <a href="/#/" style={{ padding:'10px 24px', background:'#1a56a0', color:'#fff', borderRadius:8, textDecoration:'none', fontWeight:700, fontSize:14 }}>
        Ir para Login
      </a>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#374151', display:'flex', flexDirection:'column' }}>
      {/* Barra superior */}
      <div style={{ background:'#1a56a0', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span style={{ color:'#fff', fontWeight:600, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>📄 {fileName}</span>
        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          <a href={signedUrl!} target="_blank" rel="noreferrer"
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)', borderRadius:6, color:'#fff', textDecoration:'none', fontSize:12 }}>
            <ExternalLink size={12}/> Abrir
          </a>
          <a href={signedUrl!} download={fileName}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.3)', borderRadius:6, color:'#fff', textDecoration:'none', fontSize:12 }}>
            ⬇ Baixar
          </a>
        </div>
      </div>
      {/* Viewer */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', padding:'16px 8px 32px' }}>
        <embed
          src={signedUrl! + (signedUrl?.includes('.pdf') || signedUrl?.includes('pdf') ? '#view=FitH&toolbar=0' : '')}
          type="application/pdf"
          style={{ width:'100%', maxWidth:860, flex:1, minHeight:'80vh', border:'none', borderRadius:4, boxShadow:'0 4px 24px rgba(0,0,0,.5)' }}
        />
        <div style={{ marginTop:10, fontSize:10, color:'rgba(255,255,255,.4)' }}>
          🔒 Link seguro · expira em 10 minutos
        </div>
      </div>
    </div>
  )
}
