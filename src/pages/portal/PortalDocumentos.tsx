import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { Camera, Upload, FileText, CheckCircle2, Loader2, Trash2, Download, Image as ImgIcon } from 'lucide-react'

interface DocRow { id: string; tipo: string; descricao?: string; arquivo_url?: string; arquivo_nome?: string; arquivo_tipo?: string; status: string; criado_em: string }
interface ColabRow { id: string; nome: string }

const TIPOS = [
  { value:'foto',        label:'📷 Foto do Colaborador' },
  { value:'rg',          label:'🪪 RG' },
  { value:'cpf',         label:'🪪 CPF' },
  { value:'aso',         label:'🏥 ASO / Exame Médico' },
  { value:'ctps',        label:'📗 CTPS' },
  { value:'comprovante', label:'🏠 Comprovante de Residência' },
  { value:'certificado', label:'📜 Certificado / Treinamento' },
  { value:'nr',          label:'⛑️ NR / Segurança' },
  { value:'outro',       label:'📄 Outro' },
]

const I: React.CSSProperties = { width:'100%', height:40, border:'1px solid #d1d5db', borderRadius:7, padding:'0 10px', fontSize:13, boxSizing:'border-box', background:'#fff', color:'#111' }
const S: React.CSSProperties = { ...I, cursor:'pointer' }


const BUCKET = 'portal-documentos'
// Compressão: máximo 1600px de largura, qualidade 82%
const MAX_PX = 1600
const QUAL   = 0.82

/** Comprime uma imagem via Canvas. Retorna base64 JPEG menor. */
function comprimirImagem(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = ev => {
      const img = new window.Image()
      img.onerror = reject
      img.onload = () => {
        let { width, height } = img
        // Redimensiona se necessário mantendo proporção
        if (width > MAX_PX || height > MAX_PX) {
          if (width >= height) {
            height = Math.round((height * MAX_PX) / width)
            width  = MAX_PX
          } else {
            width  = Math.round((width * MAX_PX) / height)
            height = MAX_PX
          }
        }
        const canvas  = document.createElement('canvas')
        canvas.width  = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', QUAL))
      }
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

export default function PortalDocumentos() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const obras   = session?.obras_ids ?? []

  const [obraId,    setObraId]    = useState(obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{ id:string; nome:string }[]>([])
  const [colabs,    setColabs]    = useState<ColabRow[]>([])
  const [aba,       setAba]       = useState<'enviar'|'historico'>('enviar')
  const [historico, setHistorico] = useState<DocRow[]>([])
  const [saving,    setSaving]    = useState(false)
  const [sucesso,   setSucesso]   = useState(false)
  const [progresso, setProgresso] = useState('')   // mensagem de etapa

  // form
  const [colabId,    setColabId]    = useState('')
  const [tipo,       setTipo]       = useState('foto')
  const [descricao,  setDescricao]  = useState('')
  const [arquivo,    setArquivo]    = useState<File | null>(null)
  const [preview,    setPreview]    = useState<string | null>(null)
  const [tamanhoInfo,setTamanhoInfo]= useState('')   // ex: "2.1 MB → 320 KB"
  const [erroUpload, setErroUpload] = useState('')

  const fotoRef   = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  const fetchObras = useCallback(async () => {
    if (!obras.length) return
    const { data } = await supabase.from('obras').select('id,nome').in('id', obras).order('nome')
    if (data) setObrasData(data)
  }, [obras.join(',')])

  const fetchColabs = useCallback(async () => {
    if (!obraId) return
    const { data } = await supabase.from('colaboradores').select('id,nome')
      .eq('obra_id', obraId).eq('status','ativo').order('nome')
    if (data) setColabs(data)
  }, [obraId])

  const fetchHistorico = useCallback(async () => {
    if (!obraId) return
    const { data, error } = await supabase.from('portal_documentos')
      .select('id,tipo,descricao,arquivo_url,arquivo_nome,arquivo_tipo,status,criado_em')
      .eq('obra_id', obraId).order('criado_em', { ascending: false })
    if (!error && data) setHistorico(data)
  }, [obraId])

  useEffect(() => { if (!session) { nav('/portal'); return }; fetchObras() }, [])
  useEffect(() => { fetchColabs(); fetchHistorico() }, [fetchColabs, fetchHistorico])

  async function selecionarArquivo(file: File | null) {
    setArquivo(null); setPreview(null); setTamanhoInfo(''); setErroUpload('')
    if (!file) return

    if (file.type.startsWith('image/')) {
      // Comprime imagem antes de guardar
      try {
        const originalKB = (file.size / 1024).toFixed(0)
        const b64 = await comprimirImagem(file)
        // Calcula tamanho resultante (base64 tem overhead de ~33%)
        const compressedKB = Math.round((b64.length * 3) / 4 / 1024)
        setTamanhoInfo(`${originalKB} KB → ~${compressedKB} KB (comprimido)`)
        setPreview(b64)
        // Cria um "fake File" com o b64 para o submit usar
        const blob = await fetch(b64).then(r => r.blob())
        const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type:'image/jpeg' })
        setArquivo(compressed)
      } catch {
        // fallback sem compressão
        setArquivo(file)
        const reader = new FileReader()
        reader.onload = e => setPreview(e.target?.result as string)
        reader.readAsDataURL(file)
        setTamanhoInfo(`${(file.size/1024).toFixed(0)} KB`)
      }
    } else {
      // PDF / DOC — sem compressão, apenas valida tamanho
      if (file.size > 8 * 1024 * 1024) {
        setErroUpload('Arquivo muito grande (máx. 8 MB para PDF/DOC).')
        return
      }
      setArquivo(file)
      setTamanhoInfo(`${(file.size/1024).toFixed(0)} KB`)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!arquivo) return
    setSaving(true); setErroUpload(''); setProgresso('Preparando…')

    let arquivoUrl  = ''
    const arquivoNome = arquivo.name

    // 1. Tenta Supabase Storage
    try {
      setProgresso('Enviando para nuvem…')
      const ext  = arquivo.name.split('.').pop() ?? 'jpg'
      const path = `${obraId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: storageErr } = await supabase.storage.from(BUCKET).upload(path, arquivo, {
        contentType: arquivo.type, upsert: false,
      })
      if (!storageErr) {
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
        arquivoUrl = pub.publicUrl
      }
    } catch (_) { /* segue fallback */ }

    // 2. Fallback base64 (funciona sempre)
    if (!arquivoUrl) {
      setProgresso('Salvando localmente…')
      if (arquivo.size > 5 * 1024 * 1024) {
        setErroUpload('Arquivo muito grande após compressão (máx. 5 MB). Tente uma foto com menos resolução.')
        setSaving(false); setProgresso('')
        return
      }
      arquivoUrl = await new Promise(res => {
        const r = new FileReader()
        r.onload = ev => res(ev.target?.result as string)
        r.readAsDataURL(arquivo)
      })
    }

    setProgresso('Registrando…')
    const { error: insertErr } = await supabase.from('portal_documentos').insert({
      obra_id:           obraId,
      colaborador_id:    colabId || null,
      portal_usuario_id: session?.id,
      tipo,
      descricao:         descricao || null,
      arquivo_url:       arquivoUrl,
      arquivo_nome:      arquivoNome,
      arquivo_tipo:      arquivo.type,
      status:            'pendente',
    })

    if (insertErr) {
      setErroUpload(`Erro ao salvar: ${insertErr.message}`)
      setSaving(false); setProgresso('')
      return
    }

    setSaving(false); setSucesso(true); setProgresso('')
    setArquivo(null); setPreview(null); setDescricao(''); setColabId(''); setTamanhoInfo('')
    fetchHistorico()
    setTimeout(() => { setSucesso(false); setAba('historico') }, 1800)
  }

  const tipoLabel = (v: string) => TIPOS.find(t => t.value === v)?.label ?? v
  const tipoIcon  = (v: string) => {
    if (v === 'foto') return '📷'
    if (['rg','cpf','ctps','comprovante'].includes(v)) return '🪪'
    if (v === 'aso') return '🏥'
    if (['certificado','nr'].includes(v)) return '📜'
    return '📄'
  }
  const stBadge = (s: string) => {
    if (s === 'aprovado'  || s === 'processado') return { bg:'#dcfce7', cor:'#15803d', label:'✓ Aprovado' }
    if (s === 'recusado'  || s === 'descartado') return { bg:'#fee2e2', cor:'#dc2626', label:'✗ Recusado' }
    return                                               { bg:'#fef3c7', cor:'#b45309', label:'⏳ Pendente' }
  }

  return (
    <PortalLayout>
      <div style={{ padding:'16px 16px 8px' }}>
        <div style={{ fontWeight:800, fontSize:17, color:'#1e3a5f' }}>📎 Documentos e Fotos</div>
        <div style={{ fontSize:12, color:'#9ca3af', marginTop:2 }}>Envie fotos de documentos, ASO, CTPS e registros de obra</div>
      </div>

      {obrasData.length > 1 && (
        <div style={{ padding:'0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)} style={S}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}

      {/* Abas */}
      <div style={{ display:'flex', margin:'0 16px 12px', background:'#f3f4f6', borderRadius:10, padding:4 }}>
        {(['enviar','historico'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)} style={{
            flex:1, height:34, border:'none', borderRadius:7, cursor:'pointer',
            fontWeight:700, fontSize:13, background:aba===a?'#fff':'transparent',
            color:aba===a?'#1e3a5f':'#9ca3af', boxShadow:aba===a?'0 1px 4px rgba(0,0,0,0.1)':'none',
            transition:'all 0.15s',
          }}>
            {a === 'enviar' ? '+ Enviar Documento' : `Enviados (${historico.length})`}
          </button>
        ))}
      </div>

      {/* ── FORMULÁRIO ── */}
      {aba === 'enviar' && (
        <form onSubmit={handleSubmit} style={{ padding:'0 16px 32px', display:'flex', flexDirection:'column', gap:12 }}>
          {sucesso && (
            <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:10,
              padding:'12px 16px', display:'flex', alignItems:'center', gap:8, color:'#15803d', fontWeight:700 }}>
              <CheckCircle2 size={17}/> Documento enviado com sucesso!
            </div>
          )}

          {/* Tipo */}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4, textTransform:'uppercase' }}>Tipo de Documento *</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={S}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Colaborador */}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4, textTransform:'uppercase' }}>Colaborador (opcional)</label>
            <select value={colabId} onChange={e => setColabId(e.target.value)} style={S}>
              <option value="">Geral / Obra</option>
              {colabs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          {/* Descrição */}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:4, textTransform:'uppercase' }}>Descrição</label>
            <input value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Ex.: ASO periódico 2025, RG frente…" style={I} />
          </div>

          {/* Captura da foto / arquivo */}
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:8, textTransform:'uppercase' }}>
              Arquivo / Foto *
              <span style={{ fontSize:10, color:'#9ca3af', fontWeight:500, marginLeft:6, textTransform:'none' }}>
                (imagens comprimidas automaticamente)
              </span>
            </label>

            {!arquivo && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {/* Câmera */}
                <button type="button" onClick={() => fotoRef.current?.click()} style={{
                  height:96, border:'2px dashed #1e3a5f', borderRadius:14, cursor:'pointer',
                  background:'linear-gradient(135deg,#f0f7ff,#e0eaff)', display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:6, color:'#1e3a5f',
                }}>
                  <Camera size={28} strokeWidth={1.8}/>
                  <span style={{ fontSize:12, fontWeight:800 }}>📸 Tirar Foto</span>
                  <span style={{ fontSize:10, color:'#6b7280' }}>câmera traseira</span>
                </button>
                <input ref={fotoRef} type="file" accept="image/*" capture="environment"
                  style={{ display:'none' }} onChange={e => selecionarArquivo(e.target.files?.[0] ?? null)} />

                {/* Upload arquivo */}
                <button type="button" onClick={() => uploadRef.current?.click()} style={{
                  height:96, border:'2px dashed #9ca3af', borderRadius:14, cursor:'pointer',
                  background:'#f9fafb', display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center', gap:6, color:'#6b7280',
                }}>
                  <Upload size={28} strokeWidth={1.8}/>
                  <span style={{ fontSize:12, fontWeight:800 }}>📁 Selecionar</span>
                  <span style={{ fontSize:10, color:'#9ca3af' }}>foto, PDF, doc</span>
                </button>
                <input ref={uploadRef} type="file" accept="image/*,application/pdf,.doc,.docx"
                  style={{ display:'none' }} onChange={e => selecionarArquivo(e.target.files?.[0] ?? null)} />
              </div>
            )}

            {/* Preview */}
            {arquivo && (
              <div style={{ border:'1px solid #d1d5db', borderRadius:12, padding:12, background:'#f9fafb' }}>
                {preview ? (
                  <img src={preview} alt="preview" style={{ width:'100%', maxHeight:240, objectFit:'contain', borderRadius:8, marginBottom:8 }} />
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', marginBottom:8 }}>
                    <FileText size={32} color="#1e3a5f"/>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13 }}>{arquivo.name}</div>
                    </div>
                  </div>
                )}
                {/* Info de compressão */}
                {tamanhoInfo && (
                  <div style={{ fontSize:11, color:'#16a34a', fontWeight:700, marginBottom:6,
                    display:'flex', alignItems:'center', gap:4 }}>
                    <ImgIcon size={11}/> {tamanhoInfo}
                  </div>
                )}
                <button type="button" onClick={() => { setArquivo(null); setPreview(null); setTamanhoInfo('') }} style={{
                  width:'100%', height:34, border:'1px solid #fca5a5', borderRadius:7,
                  background:'#fff', color:'#dc2626', cursor:'pointer', fontWeight:600, fontSize:12,
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                }}>
                  <Trash2 size={13}/> Remover
                </button>
              </div>
            )}

            {erroUpload && (
              <div style={{ marginTop:8, fontSize:12, color:'#dc2626', fontWeight:700,
                background:'#fee2e2', borderRadius:8, padding:'8px 12px' }}>
                ⚠️ {erroUpload}
              </div>
            )}
          </div>

          <button type="submit" disabled={saving || !arquivo} style={{
            marginTop:4, height:52, background:saving||!arquivo?'#94a3b8':'#1e3a5f', color:'#fff',
            border:'none', borderRadius:12, fontSize:15, fontWeight:700,
            cursor:saving||!arquivo?'not-allowed':'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
            {saving
              ? <><Loader2 size={17} className="animate-spin"/>{progresso || 'Enviando…'}</>
              : <><Upload size={17}/>Enviar Documento</>}
          </button>
        </form>
      )}

      {/* ── HISTÓRICO ── */}
      {aba === 'historico' && (
        <div style={{ padding:'0 16px 24px', display:'flex', flexDirection:'column', gap:8 }}>
          {historico.length === 0 ? (
            <div style={{ background:'#fff', borderRadius:12, padding:32, textAlign:'center', color:'#9ca3af' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
              Nenhum documento enviado ainda
            </div>
          ) : historico.map(d => {
            const b     = stBadge(d.status)
            const isImg = d.arquivo_tipo?.startsWith('image/')
            return (
              <div key={d.id} style={{ background:'#fff', border:'1px solid #e5e7eb',
                borderLeft:`4px solid ${b.cor}`, borderRadius:10, padding:'12px 14px',
                display:'flex', gap:12, alignItems:'center' }}>
                {/* Thumb */}
                <div style={{ width:48, height:48, borderRadius:8, overflow:'hidden', flexShrink:0,
                  background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {isImg && d.arquivo_url
                    ? <img src={d.arquivo_url} alt="" referrerPolicy="no-referrer" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                    : <span style={{ fontSize:22 }}>{tipoIcon(d.tipo)}</span>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{tipoLabel(d.tipo)}</div>
                  {d.descricao && <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{d.descricao}</div>}
                  <div style={{ fontSize:10, color:'#9ca3af', marginTop:3 }}>{new Date(d.criado_em).toLocaleString('pt-BR')}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end' }}>
                  <span style={{ background:b.bg, color:b.cor, borderRadius:5, padding:'2px 8px', fontSize:10, fontWeight:700 }}>
                    {b.label}
                  </span>
                  {d.arquivo_url && (
                    <button
                      onClick={() => {
                        const url = d.arquivo_url!
                        // base64 → abre em nova aba diretamente
                        if (url.startsWith('data:')) {
                          const w = window.open()
                          if (w) { w.document.write(`<img src="${url}" style="max-width:100%"><br><a href="${url}" download="${d.arquivo_nome||'documento'}">Baixar</a>`) }
                          return
                        }
                        // URL Storage / externa → tenta abrir
                        window.open(url, '_blank')
                      }}
                      style={{ fontSize:11, color:'#1e3a5f', fontWeight:600, background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', alignItems:'center', gap:3 }}
                    >
                      <Download size={11}/> Ver
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PortalLayout>
  )
}
