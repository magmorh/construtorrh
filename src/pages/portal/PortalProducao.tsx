import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { FileImage, Upload, Camera, CheckCircle2, Loader2, Trash2, Download, Image as ImgIcon, FileText } from 'lucide-react'

interface Obra       { id: string; nome: string }
interface ColabRow   { id: string; nome: string; chapa: string }
interface FichaRow   {
  id: string; criado_em: string; tipo: string; descricao: string | null
  arquivo_url: string | null; arquivo_nome: string | null; arquivo_tipo: string | null
  status: string; sincronizado_em: string | null
  colaboradores?: { nome: string }
}

const BUCKET = 'portal-documentos'
const MAX_PX = 1600
const QUAL   = 0.82

function comprimirImagem(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = ev => {
      const img = new window.Image()
      img.onerror = reject
      img.onload = () => {
        let { width, height } = img
        if (width > MAX_PX || height > MAX_PX) {
          if (width >= height) { height = Math.round((height * MAX_PX) / width); width = MAX_PX }
          else { width = Math.round((width * MAX_PX) / height); height = MAX_PX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', QUAL))
      }
      img.src = ev.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}

const TIPOS_FICHA = [
  { value:'medicao',     label:'📏 Medição de serviços' },
  { value:'producao',    label:'📐 Ficha de produção' },
  { value:'boletim',     label:'📋 Boletim diário' },
  { value:'foto_obra',   label:'📷 Foto da obra' },
  { value:'rdo',         label:'📄 RDO (Relatório Diário)' },
  { value:'outro',       label:'📎 Outro documento' },
]

export default function PortalProducao() {
  const nav     = useNavigate()
  const session = getPortalSession()
  const obrasIds = session?.obras_ids ?? []

  const [obrasData, setObrasData] = useState<Obra[]>([])
  const [obraId, setObraId]       = useState('')
  const [colabs, setColabs]       = useState<ColabRow[]>([])
  const [historico, setHistorico] = useState<FichaRow[]>([])
  const [aba, setAba]             = useState<'enviar' | 'historico'>('enviar')
  const [saving, setSaving]       = useState(false)
  const [sucesso, setSucesso]     = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erroMsg, setErroMsg]     = useState('')

  // Formulário
  const [colabId,    setColabId]    = useState('')
  const [tipo,       setTipo]       = useState('medicao')
  const [descricao,  setDescricao]  = useState('')
  const [dataRef,    setDataRef]    = useState(new Date().toISOString().slice(0, 10))
  const [arquivo,    setArquivo]    = useState<File | null>(null)
  const [preview,    setPreview]    = useState<string | null>(null)
  const [tamanhoInfo,setTamanhoInfo]= useState('')
  const [erroUpload, setErroUpload] = useState('')
  const [deletandoId,setDeletandoId]= useState<string | null>(null)

  const fotoRef   = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)

  const loadBase = useCallback(async () => {
    if (!obrasIds.length) return
    const { data } = await supabase.from('obras').select('id,nome').in('id', obrasIds).order('nome')
    if (data) { setObrasData(data); if (!obraId && data.length) setObraId(data[0].id) }
  }, [obrasIds.join(',')])

  const loadColabs = useCallback(async (oid: string) => {
    if (!oid) return
    const { data } = await supabase.from('colaboradores').select('id,nome,chapa').eq('obra_id', oid).eq('status','ativo').order('nome')
    setColabs(data ?? [])
  }, [])

  const loadHistorico = useCallback(async (oid: string) => {
    if (!oid) return
    const { data } = await supabase
      .from('portal_producao')
      .select('id,criado_em,tipo,descricao,arquivo_url,arquivo_nome,arquivo_tipo,status,sincronizado_em,colaboradores(nome)')
      .eq('obra_id', oid)
      .order('criado_em', { ascending: false })
      .limit(60)
    setHistorico((data ?? []) as any[])
  }, [])

  useEffect(() => { if (!session) { nav('/portal'); return } loadBase() }, [])
  useEffect(() => { if (obraId) { loadColabs(obraId); loadHistorico(obraId) } }, [obraId])

  async function selecionarArquivo(file: File | null) {
    setArquivo(null); setPreview(null); setTamanhoInfo(''); setErroUpload('')
    if (!file) return
    if (file.type.startsWith('image/')) {
      try {
        const originalKB = (file.size / 1024).toFixed(0)
        const b64 = await comprimirImagem(file)
        const compressedKB = Math.round((b64.length * 3) / 4 / 1024)
        setTamanhoInfo(`${originalKB} KB → ~${compressedKB} KB (comprimido)`)
        setPreview(b64)
        const blob = await fetch(b64).then(r => r.blob())
        setArquivo(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
      } catch {
        setArquivo(file)
        const reader = new FileReader()
        reader.onload = e => setPreview(e.target?.result as string)
        reader.readAsDataURL(file)
        setTamanhoInfo(`${(file.size / 1024).toFixed(0)} KB`)
      }
    } else {
      if (file.size > 8 * 1024 * 1024) { setErroUpload('Arquivo muito grande (máx. 8 MB).'); return }
      setArquivo(file)
      setTamanhoInfo(`${(file.size / 1024).toFixed(0)} KB`)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!arquivo) { setErroMsg('Selecione um arquivo.'); return }
    setSaving(true); setErroMsg(''); setProgresso('Preparando…')

    let arquivoUrl = ''
    const arquivoNome = arquivo.name

    // 1. Supabase Storage
    try {
      setProgresso('Enviando para nuvem…')
      const ext  = arquivo.name.split('.').pop() ?? 'jpg'
      const path = `producao/${obraId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: storageErr } = await supabase.storage.from(BUCKET).upload(path, arquivo, { contentType: arquivo.type, upsert: false })
      if (!storageErr) {
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
        arquivoUrl = pub.publicUrl
      }
    } catch (_) {}

    // 2. Fallback base64
    if (!arquivoUrl) {
      setProgresso('Salvando localmente…')
      if (arquivo.size > 5 * 1024 * 1024) {
        setErroMsg('Arquivo muito grande (máx. 5 MB). Tente foto com menos resolução.')
        setSaving(false); setProgresso(''); return
      }
      arquivoUrl = await new Promise(res => {
        const r = new FileReader()
        r.onload = ev => res(ev.target?.result as string)
        r.readAsDataURL(arquivo)
      })
    }

    setProgresso('Registrando…')
    const { error: insertErr } = await supabase.from('portal_producao').insert({
      obra_id:           obraId,
      colaborador_id:    colabId || null,
      portal_usuario_id: session?.id,
      tipo,
      descricao:         descricao || null,
      arquivo_url:       arquivoUrl,
      arquivo_nome:      arquivoNome,
      arquivo_tipo:      arquivo.type,
      data:              dataRef,
      status:            'pendente',
    })

    setSaving(false); setProgresso('')
    if (insertErr) { setErroMsg('Erro ao salvar: ' + insertErr.message); return }

    setSucesso(true)
    setArquivo(null); setPreview(null); setDescricao(''); setTamanhoInfo('')
    loadHistorico(obraId)
    setTimeout(() => { setSucesso(false); setAba('historico') }, 1800)
  }

  async function excluir(id: string, sync: string | null) {
    if (sync) { alert('Este documento já foi aprovado pelo RH e não pode ser excluído.'); return }
    if (!confirm('Excluir esta ficha?')) return
    setDeletandoId(id)
    await supabase.from('portal_producao').delete().eq('id', id)
    setDeletandoId(null); loadHistorico(obraId)
  }

  const isImg = (tipo: string | null) => tipo?.startsWith('image/')

  return (
    <PortalLayout>
      <div style={{ padding: '16px 16px 8px' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#1e3a5f' }}>📎 Anexar Ficha de Produção</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Envie fotos, fichas e documentos da obra</div>
      </div>

      {/* Seletor de obra */}
      {obrasData.length > 1 && (
        <div style={{ padding: '0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)}
            style={{ width:'100%', height:40, border:'1px solid #e5e7eb', borderRadius:8, padding:'0 12px', fontSize:13, background:'#fff' }}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}
      {obrasData.length === 1 && (
        <div style={{ padding:'0 16px 8px', fontSize:12, fontWeight:700, color:'#6b7280' }}>🏗️ {obrasData[0]?.nome}</div>
      )}

      {/* Abas */}
      <div style={{ display:'flex', margin:'0 16px 12px', background:'#f3f4f6', borderRadius:10, padding:4 }}>
        {(['enviar','historico'] as const).map(a => (
          <button key={a} onClick={() => setAba(a)} style={{
            flex:1, height:36, border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:13,
            background: aba===a?'#fff':'transparent', color: aba===a?'#1e3a5f':'#9ca3af',
            boxShadow: aba===a?'0 1px 4px rgba(0,0,0,0.1)':'none',
          }}>
            {a==='enviar' ? '+ Enviar Ficha' : `Histórico (${historico.length})`}
          </button>
        ))}
      </div>

      {/* ── FORMULÁRIO ── */}
      {aba==='enviar' && (
        <form onSubmit={handleSubmit} style={{ padding:'0 16px 32px', display:'flex', flexDirection:'column', gap:14 }}>

          {sucesso && (
            <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:8, color:'#15803d', fontWeight:700 }}>
              <CheckCircle2 size={18} /> Ficha enviada com sucesso!
            </div>
          )}
          {erroMsg && (
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'12px 16px', color:'#dc2626', fontWeight:700, fontSize:13 }}>
              ⚠️ {erroMsg}
            </div>
          )}

          {/* Tipo */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Tipo de documento *</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}
              style={{ width:'100%', height:44, border:'1px solid #e5e7eb', borderRadius:8, padding:'0 12px', fontSize:13, background:'#fff', boxSizing:'border-box' }}>
              {TIPOS_FICHA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Colaborador */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Colaborador (opcional)</label>
            <select value={colabId} onChange={e => setColabId(e.target.value)}
              style={{ width:'100%', height:44, border:'1px solid #e5e7eb', borderRadius:8, padding:'0 12px', fontSize:13, background:'#fff', boxSizing:'border-box' }}>
              <option value="">— Geral / toda a equipe —</option>
              {colabs.map(c => <option key={c.id} value={c.id}>{c.nome} {c.chapa?`(${c.chapa})`:''}</option>)}
            </select>
          </div>

          {/* Data */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Data de referência *</label>
            <input type="date" value={dataRef} onChange={e => setDataRef(e.target.value)} required
              style={{ width:'100%', height:44, border:'1px solid #e5e7eb', borderRadius:8, padding:'0 12px', fontSize:13, boxSizing:'border-box', background:'#fff' }} />
          </div>

          {/* Descrição */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>Descrição / observação</label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2}
              placeholder="Detalhe o conteúdo do documento…"
              style={{ width:'100%', border:'1px solid #e5e7eb', borderRadius:8, padding:'10px 12px', fontSize:13, boxSizing:'border-box', background:'#fff', resize:'vertical' }} />
          </div>

          {/* Botões de upload */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>Arquivo *</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button type="button" onClick={() => fotoRef.current?.click()}
                style={{ height:52, border:'2px dashed #93c5fd', borderRadius:10, background:'#eff6ff', color:'#1d4ed8', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <Camera size={18}/> Tirar foto
              </button>
              <button type="button" onClick={() => uploadRef.current?.click()}
                style={{ height:52, border:'2px dashed #a3a3a3', borderRadius:10, background:'#fafafa', color:'#374151', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <Upload size={18}/> Selecionar arquivo
              </button>
            </div>
            <input ref={fotoRef}   type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e => selecionarArquivo(e.target.files?.[0]??null)} />
            <input ref={uploadRef} type="file" accept="image/*,application/pdf,.doc,.docx" style={{ display:'none' }} onChange={e => selecionarArquivo(e.target.files?.[0]??null)} />
          </div>

          {erroUpload && <div style={{ color:'#dc2626', fontSize:12, fontWeight:600 }}>⚠️ {erroUpload}</div>}

          {/* Preview */}
          {preview && (
            <div style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden', position:'relative' }}>
              <img src={preview} alt="preview" style={{ width:'100%', maxHeight:240, objectFit:'cover', display:'block' }} />
              <div style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,0.55)', borderRadius:6, padding:'2px 8px', fontSize:11, color:'#fff', fontWeight:700 }}>
                {tamanhoInfo}
              </div>
              <button type="button" onClick={() => { setArquivo(null); setPreview(null); setTamanhoInfo('') }}
                style={{ position:'absolute', top:8, left:8, background:'rgba(239,68,68,0.8)', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', color:'#fff', fontSize:11, fontWeight:700 }}>
                ✕ Remover
              </button>
            </div>
          )}
          {arquivo && !preview && (
            <div style={{ background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:10, padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
              <FileText size={22} color="#64748b"/>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'#1e293b' }}>{arquivo.name}</div>
                <div style={{ fontSize:11, color:'#94a3b8' }}>{tamanhoInfo}</div>
              </div>
              <button type="button" onClick={() => { setArquivo(null); setTamanhoInfo('') }}
                style={{ background:'#fee2e2', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', color:'#dc2626', fontWeight:700, fontSize:12 }}>✕</button>
            </div>
          )}

          {progresso && (
            <div style={{ background:'#eff6ff', border:'1px solid #93c5fd', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#1d4ed8', fontWeight:600, display:'flex', alignItems:'center', gap:8 }}>
              <Loader2 size={15} className="animate-spin"/> {progresso}
            </div>
          )}

          <button type="submit" disabled={saving || !arquivo} style={{
            height:52, background: saving||!arquivo?'#94a3b8':'#1e3a5f', color:'#fff',
            border:'none', borderRadius:12, fontSize:16, fontWeight:700,
            cursor: saving||!arquivo?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
            {saving ? <><Loader2 size={18} className="animate-spin"/> Enviando…</> : <><Upload size={18}/> Enviar Ficha</>}
          </button>
        </form>
      )}

      {/* ── HISTÓRICO ── */}
      {aba==='historico' && (
        <div style={{ padding:'0 16px 32px' }}>
          {historico.length===0 ? (
            <div style={{ background:'#fff', borderRadius:12, padding:32, textAlign:'center', color:'#9ca3af' }}>
              Nenhuma ficha enviada ainda
            </div>
          ) : historico.map(h => {
            const colab = (h as any).colaboradores
            const jaSync = !!h.sincronizado_em
            const isImage = isImg(h.arquivo_tipo)
            const tipoLabel = TIPOS_FICHA.find(t => t.value === h.tipo)?.label ?? h.tipo ?? '📎 Documento'
            return (
              <div key={h.id} style={{ background:'#fff', borderRadius:12, border:`1px solid ${jaSync?'#86efac':'#e5e7eb'}`, marginBottom:8, overflow:'hidden' }}>
                {/* Preview imagem */}
                {isImage && h.arquivo_url && (
                  <img src={h.arquivo_url} alt="" style={{ width:'100%', maxHeight:160, objectFit:'cover', display:'block' }} />
                )}
                <div style={{ padding:'12px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'#111' }}>{tipoLabel}</div>
                      {colab?.nome && <div style={{ fontSize:12, color:'#374151', marginTop:2 }}>👷 {colab.nome}</div>}
                      {h.descricao && <div style={{ fontSize:11, color:'#9ca3af', marginTop:4, fontStyle:'italic' }}>{h.descricao}</div>}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                      {jaSync
                        ? <span style={{ background:'#dcfce7', color:'#15803d', borderRadius:5, padding:'2px 8px', fontSize:11, fontWeight:700 }}>✓ Aprovado</span>
                        : <span style={{ background:'#fef3c7', color:'#b45309', borderRadius:5, padding:'2px 8px', fontSize:11, fontWeight:700 }}>⏳ Pendente</span>}
                      {!jaSync && (
                        <button onClick={() => excluir(h.id, h.sincronizado_em)} disabled={deletandoId===h.id}
                          style={{ background:'none', border:'1px solid #fca5a5', borderRadius:6, padding:'3px 8px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'#dc2626', fontSize:11 }}>
                          <Trash2 size={12}/> {deletandoId===h.id?'…':'Excluir'}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Botões de ação */}
                  <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                    {h.arquivo_url && (
                      <a href={h.arquivo_url} target="_blank" rel="noopener noreferrer"
                        style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#1d4ed8', fontWeight:600, textDecoration:'none', background:'#eff6ff', borderRadius:7, padding:'5px 12px' }}>
                        {isImage ? <><ImgIcon size={13}/> Ver foto</> : <><Download size={13}/> Baixar arquivo</>}
                      </a>
                    )}
                    <span style={{ fontSize:10, color:'#9ca3af', display:'flex', alignItems:'center', marginLeft:'auto' }}>
                      {new Date(h.criado_em).toLocaleString('pt-BR')}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PortalLayout>
  )
}
