import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import ColabSearchSelect from '@/components/ColabSearchSelect'
import { AlertTriangle, Loader2, CheckCircle2, Trash2, Camera, Upload, FileText } from 'lucide-react'

interface Obra        { id: string; nome: string }
interface Colaborador { id: string; nome: string; chapa: string }
interface OcorRow {
  id: string; tipo: string; gravidade: string | null; descricao: string; criado_em: string
  data_ocorrencia: string; colaboradores?: { nome: string }; sincronizado_em: string | null
  hora_acidente?: string | null; local?: string | null; cat_emitida?: boolean | null
  dias_afastamento?: number | null; com_afastamento?: boolean | null; cid?: string | null
  tipo_atestado?: string | null; tipo_adv?: string | null; assinada?: boolean | null
  dias_suspensao?: number | null; motivo?: string | null; status?: string | null
}

type AbaOcor = 'acidente' | 'atestado' | 'advertencia' | 'geral' | 'desligamento'

// ── Compressão de imagem ──────────────────────────────────────────────────────
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

export default function PortalOcorrencias() {
  const nav      = useNavigate()
  const session  = getPortalSession()
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
  const [colabBusca, setColabBusca] = useState('')
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

  // ── Upload do atestado ─────────────────────────────────────────────────────
  const fotoRef   = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [arquivoAtestado,  setArquivoAtestado]  = useState<File | null>(null)
  const [previewAtestado,  setPreviewAtestado]  = useState<string | null>(null)
  const [tamanhoAtestado,  setTamanhoAtestado]  = useState('')
  const [erroArquivo,      setErroArquivo]      = useState('')
  // base64 sempre disponível para fallback garantido no submit
  const [atestadoB64,      setAtestadoB64]      = useState<string | null>(null)
  const [atestadoNomeSel,  setAtestadoNomeSel]  = useState('')

  async function selecionarAtestado(file: File | null) {
    setArquivoAtestado(null); setPreviewAtestado(null); setTamanhoAtestado('')
    setErroArquivo(''); setAtestadoB64(null); setAtestadoNomeSel('')
    if (!file) return
    const nomeBase = file.name || `atestado_${Date.now()}`
    if (file.type.startsWith('image/')) {
      try {
        const originalKB = (file.size / 1024).toFixed(0)
        const b64 = await comprimirImagem(file)
        const compressedKB = Math.round((b64.length * 3) / 4 / 1024)
        setTamanhoAtestado(`${originalKB} KB → ~${compressedKB} KB`)
        setPreviewAtestado(b64)
        setAtestadoB64(b64)   // ← guarda base64 já pronto
        const nomeJpg = nomeBase.replace(/\.[^.]+$/, '.jpg')
        setAtestadoNomeSel(nomeJpg)
        const blob = await fetch(b64).then(r => r.blob())
        setArquivoAtestado(new File([blob], nomeJpg, { type: 'image/jpeg' }))
      } catch {
        // Se compressão falhou, lê como base64 direto
        const b64raw = await new Promise<string>(res => {
          const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.readAsDataURL(file)
        })
        setPreviewAtestado(b64raw)
        setAtestadoB64(b64raw)
        setAtestadoNomeSel(nomeBase)
        setArquivoAtestado(file)
        setTamanhoAtestado(`${(file.size / 1024).toFixed(0)} KB`)
      }
    } else {
      if (file.size > 8 * 1024 * 1024) { setErroArquivo('Arquivo muito grande (máx. 8 MB).'); return }
      // PDF/doc: lê como base64 para garantir fallback
      const b64pdf = await new Promise<string>(res => {
        const r = new FileReader(); r.onload = e => res(e.target?.result as string); r.readAsDataURL(file)
      })
      setAtestadoB64(b64pdf)
      setAtestadoNomeSel(nomeBase)
      setArquivoAtestado(file)
      setTamanhoAtestado(`${(file.size / 1024).toFixed(0)} KB`)
    }
  }

  function limparAtestado() {
    setArquivoAtestado(null); setPreviewAtestado(null); setTamanhoAtestado('')
    setErroArquivo(''); setAtestadoB64(null); setAtestadoNomeSel('')
    if (fotoRef.current)   fotoRef.current.value   = ''
    if (uploadRef.current) uploadRef.current.value = ''
  }

  // ── Advertência ───────────────────────────────────────────────────────────
  const [tipoAdv, setTipoAdv]       = useState('escrita')
  const [motivo, setMotivo]         = useState('')
  const [assinada, setAssinada]     = useState(false)
  const [diasSusp, setDiasSusp]     = useState('')

  // ── Desligamento ──────────────────────────────────────────────────────────
  const [motivoDeslig,   setMotivoDeslig]   = useState('demissao_sem_justa')
  const [dataDeslig,     setDataDeslig]     = useState('')
  const [obsDeslig,      setObsDeslig]      = useState('')
  const [savingDeslig,   setSavingDeslig]   = useState(false)
  const [sucessoDeslig,  setSucessoDeslig]  = useState(false)

  // ── Carregamento ──────────────────────────────────────────────────────────
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
      .select('id,tipo,gravidade,descricao,criado_em,data_ocorrencia,hora_acidente,local,cat_emitida,dias_afastamento,com_afastamento,cid,tipo_atestado,tipo_adv,assinada,dias_suspensao,sincronizado_em,status,colaboradores(nome)')
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
    setMotivoDeslig('demissao_sem_justa'); setDataDeslig(''); setObsDeslig('')
    limparAtestado()
  }

  async function handleSubmitDesligamento(e: React.FormEvent) {
    e.preventDefault()
    if (!colabId) { setErroMsg('⚠️ Selecione o colaborador a ser desligado.'); return }
    if (!dataDeslig) { setErroMsg('⚠️ Informe a data prevista do desligamento.'); return }
    setSavingDeslig(true); setErroMsg('')
    const motivoLabels: Record<string,string> = {
      pedido_demissao:       'Pedido de Demissão',
      demissao_sem_justa:    'Demissão sem Justa Causa',
      demissao_com_justa:    'Demissão com Justa Causa',
      fim_contrato:          'Fim de Contrato',
      acordo:                'Acordo (§ 484-A CLT)',
      aposentadoria:         'Aposentadoria',
      falecimento:           'Falecimento',
      outro:                 'Outro',
    }
    const colab = colabs.find(c => c.id === colabId)
    const { error } = await supabase.from('portal_solicitacoes').insert({
      obra_id:           obraId,
      tipo:              'desligamento',
      status:            'pendente',
      portal_usuario_id: session?.id,
      dados: {
        colaborador_id:   colabId,
        colaborador_nome: colab?.nome ?? '',
        colaborador_chapa:colab?.chapa ?? '',
        motivo_desligamento:        motivoDeslig,
        motivo_desligamento_label:  motivoLabels[motivoDeslig] ?? motivoDeslig,
        data_prevista:    dataDeslig,
        observacoes:      obsDeslig || null,
      },
    })
    setSavingDeslig(false)
    if (error) { setErroMsg('Erro ao enviar: ' + error.message); return }
    setSucessoDeslig(true)
    setColabId(''); setDataDeslig(''); setObsDeslig(''); setMotivoDeslig('demissao_sem_justa')
    setTimeout(() => { setSucessoDeslig(false) }, 3000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!descricao.trim()) { setErroMsg('⚠️ Preencha o campo DESCRIÇÃO antes de salvar.'); return }
    if (!obraId)           { setErroMsg('⚠️ Nenhuma obra selecionada.'); return }
    if (aba === 'atestado' && !arquivoAtestado) {
      setErroMsg('⚠️ Anexe o atestado (foto ou arquivo) antes de registrar.')
      return
    }

    setSaving(true); setErroMsg('')

    // ── Upload do atestado (igual ao PortalDocumentos) ────────────────────────
    let atestadoUrl  = ''
    let atestadoNome = ''
    let atestadoTipo = ''
    if (aba === 'atestado' && arquivoAtestado && atestadoB64) {
      atestadoNome = atestadoNomeSel || arquivoAtestado.name || 'atestado'
      atestadoTipo = arquivoAtestado.type

      // 1. Tenta Supabase Storage
      try {
        const ext  = atestadoNome.split('.').pop() ?? 'jpg'
        const path = `atestados/${obraId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: storageErr } = await supabase.storage.from(BUCKET).upload(path, arquivoAtestado, {
          contentType: arquivoAtestado.type, upsert: false,
        })
        if (!storageErr) {
          const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
          atestadoUrl = pub.publicUrl
        }
      } catch (_) { /* segue com base64 */ }

      // 2. Fallback base64 garantido (já lido na seleção — sem novo FileReader)
      if (!atestadoUrl) atestadoUrl = atestadoB64
    }

    const base: Record<string,any> = {
      obra_id:           obraId,
      colaborador_id:    colabId || null,
      tipo:              aba,
      data_ocorrencia:   dataOcor,
      descricao,
      gravidade,
      status:            'pendente',
      portal_usuario_id: session?.id,
    }

    let extra: Record<string,any> = {}
    if (aba === 'acidente')    extra = { hora_acidente: hora||null, local: local||null, tipo_acidente: tipoAcid, cat_emitida: catEmitida }
    if (aba === 'atestado')    extra = { tipo_atestado: tipoAtest, dias_afastamento: diasAfas ? parseInt(diasAfas) : null, com_afastamento: comAfas, cid: cid||null, medico: medico||null, atestado_url: atestadoUrl||null, atestado_nome: atestadoNome||null }
    if (aba === 'advertencia') extra = { tipo_adv: tipoAdv, motivo: motivo||null, assinada, dias_suspensao: diasSusp ? parseInt(diasSusp) : null }

    // Insere na portal_ocorrencias
    const { error } = await supabase.from('portal_ocorrencias').insert({ ...base, ...extra })
    if (error) { setSaving(false); setErroMsg('Erro ao salvar: ' + error.message); return }

    // ── Salva também em portal_documentos (igual ao PortalDocumentos) ─────────
    // Assim o atestado aparece na aba Documentos do painel com preview/download
    if (aba === 'atestado' && atestadoUrl) {
      await supabase.from('portal_documentos').insert({
        obra_id:           obraId,
        colaborador_id:    colabId || null,
        portal_usuario_id: session?.id,
        tipo:              'atestado',
        descricao:         `Atestado — ${descricao}`,
        arquivo_url:       atestadoUrl,
        arquivo_nome:      atestadoNome,
        arquivo_tipo:      atestadoTipo || 'image/jpeg',
        status:            'pendente',
      })
    }

    setSaving(false)
    setSucesso(true); resetForm(); loadHistorico(obraId, aba)
    setTimeout(() => { setSucesso(false); setSubAba('historico') }, 1600)
  }

  async function excluir(id: string, sync: string|null, status: string) {
    if (sync || status === 'aprovado') {
      alert('Esta ocorrência já foi aprovada pelo RH e não pode mais ser excluída.')
      return
    }
    if (!confirm('Excluir esta ocorrência?')) return
    setDeletandoId(id)
    await supabase.from('portal_ocorrencias').delete().eq('id', id)
    setDeletandoId(null); loadHistorico(obraId, aba)
  }

  const INP = (err?: boolean): React.CSSProperties => ({
    width:'100%', height:42, border:`1.5px solid ${err?'#fca5a5':'#e5e7eb'}`, borderRadius:10,
    padding:'0 12px', fontSize:14, boxSizing:'border-box', background:err?'#fff5f5':'#fff', outline:'none'
  })
  const SEL = (err?: boolean): React.CSSProperties => ({ ...INP(err), cursor:'pointer' })
  const INPS = INP()
  const SELS = SEL()
  const LBL = (txt: string) => (
    <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>
      {txt}
    </label>
  )

  const ABAS: { key: AbaOcor; icon: string; label: string; cor: string }[] = [
    { key:'acidente',     icon:'⚠️', label:'Acidente',     cor:'#dc2626' },
    { key:'atestado',     icon:'🏥', label:'Atestado',     cor:'#2563eb' },
    { key:'advertencia',  icon:'📋', label:'Advertência',  cor:'#ea580c' },
    { key:'desligamento', icon:'🚪', label:'Desligamento', cor:'#7c3aed' },
    { key:'geral',        icon:'📌', label:'Geral',        cor:'#6b7280' },
  ]

  const GRAV_COR: Record<string,{bg:string;cor:string}> = {
    leve:    {bg:'#fef9c3', cor:'#a16207'},
    moderado:{bg:'#fef3c7', cor:'#b45309'},
    grave:   {bg:'#fee2e2', cor:'#dc2626'},
    fatal:   {bg:'#3f0000', cor:'#fff'},
  }

  return (
    <PortalLayout>
      <div style={{ padding:'16px 16px 8px' }}>
        <div style={{ fontWeight:800, fontSize:18, color:'#1e3a5f' }}>⚠️ Ocorrências</div>
        <div style={{ fontSize:12, color:'#9ca3af' }}>Registre acidentes, atestados, advertências e ocorrências</div>
      </div>

      {/* Obra */}
      {obrasData.length > 1 && (
        <div style={{ padding:'0 16px 10px' }}>
          <select value={obraId} onChange={e => setObraId(e.target.value)} style={SELS}>
            {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </div>
      )}
      {obrasData.length === 1 && (
        <div style={{ padding:'0 16px 6px', fontSize:12, fontWeight:700, color:'#6b7280' }}>🏗️ {obrasData[0]?.nome}</div>
      )}

      {/* Tabs tipo */}
      <div style={{ display:'flex', padding:'0 16px', gap:6, overflowX:'auto', marginBottom:12 }}>
        {ABAS.map(a => (
          <button type="button" key={a.key} onClick={() => { setAba(a.key); setSubAba('nova'); setErroMsg('') }} style={{
            flexShrink:0, height:36, padding:'0 14px',
            border:`2px solid ${aba===a.key ? a.cor : '#e5e7eb'}`,
            borderRadius:20, cursor:'pointer', fontWeight:700, fontSize:12,
            background: aba===a.key ? a.cor : '#fff',
            color: aba===a.key ? '#fff' : '#6b7280',
          }}>
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      {/* Sub-abas Nova / Histórico */}
      {aba !== 'geral' && aba !== 'desligamento' && (
        <div style={{ display:'flex', margin:'0 16px 12px', background:'#f3f4f6', borderRadius:10, padding:4 }}>
          {(['nova','historico'] as const).map(s => (
            <button type="button" key={s} onClick={() => setSubAba(s)} style={{
              flex:1, height:34, border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:12,
              background: subAba===s ? '#fff' : 'transparent',
              color: subAba===s ? '#1e3a5f' : '#9ca3af',
              boxShadow: subAba===s ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            }}>
              {s==='nova' ? '+ Nova Ocorrência' : `Histórico (${historico.length})`}
            </button>
          ))}
        </div>
      )}

      {/* ── FORMULÁRIO DESLIGAMENTO ── */}
      {aba === 'desligamento' && (
        <form onSubmit={handleSubmitDesligamento} style={{ padding:'0 16px 32px', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'#fef9c3', border:'1px solid #fde68a', borderRadius:10, padding:'12px 14px', fontSize:13, color:'#92400e', fontWeight:600 }}>
            ⚠️ Esta solicitação será enviada ao RH para análise. Após aprovação, o RH realizará o processo de desligamento e inativará o colaborador manualmente.
          </div>

          {sucessoDeslig && (
            <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:10,
              padding:'12px 16px', display:'flex', alignItems:'center', gap:8, color:'#15803d', fontWeight:700 }}>
              <CheckCircle2 size={18}/> Solicitação de desligamento enviada ao RH!
            </div>
          )}
          {erroMsg && (
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10,
              padding:'12px 16px', color:'#dc2626', fontWeight:700, fontSize:13 }}>
              {erroMsg}
            </div>
          )}

          {/* Colaborador */}
          <div>
            {LBL('Colaborador a ser desligado *')}
            <ColabSearchSelect
              colabs={colabs}
              value={colabId}
              onChange={id => { setColabId(id); setErroMsg('') }}
              label="Colaborador a ser desligado *"
              required
              erro={!colabId ? 'Selecione o colaborador' : undefined}
            />
          </div>

          {/* Motivo */}
          <div>
            {LBL('Motivo do Desligamento *')}
            <select value={motivoDeslig} onChange={e => setMotivoDeslig(e.target.value)} style={SELS}>
              <option value="pedido_demissao">Pedido de Demissão</option>
              <option value="demissao_sem_justa">Demissão sem Justa Causa</option>
              <option value="demissao_com_justa">Demissão com Justa Causa</option>
              <option value="fim_contrato">Fim de Contrato</option>
              <option value="acordo">Acordo (§ 484-A CLT)</option>
              <option value="aposentadoria">Aposentadoria</option>
              <option value="falecimento">Falecimento</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          {/* Data prevista */}
          <div>
            {LBL('Data Prevista do Desligamento *')}
            <input type="date" value={dataDeslig} onChange={e => { setDataDeslig(e.target.value); setErroMsg('') }}
              style={INP(!dataDeslig)}/>
            {!dataDeslig && <p style={{ fontSize:11, color:'#dc2626', marginTop:4, fontWeight:600 }}>⚠️ Informe a data prevista</p>}
          </div>

          {/* Observações */}
          <div>
            {LBL('Observações')}
            <textarea value={obsDeslig} onChange={e => setObsDeslig(e.target.value)} rows={3}
              placeholder="Detalhes adicionais para o RH…"
              style={{ width:'100%', border:'2px solid #e5e7eb', borderRadius:8, padding:'10px 12px',
                fontSize:13, boxSizing:'border-box', background:'#fff', resize:'vertical' }}/>
          </div>

          <button type="submit" disabled={savingDeslig} style={{
            height:52, background: savingDeslig ? '#94a3b8' : '#7c3aed', color:'#fff',
            border:'none', borderRadius:12, fontSize:16, fontWeight:700,
            cursor: savingDeslig ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
            {savingDeslig
              ? <><Loader2 size={18} className="animate-spin"/>Enviando…</>
              : <>🚪 Solicitar Desligamento</>}
          </button>
        </form>
      )}

      {/* ── FORMULÁRIO OCORRÊNCIAS ── */}
      {subAba === 'nova' && aba !== 'geral' && aba !== 'desligamento' && (
        <form onSubmit={handleSubmit} style={{ padding:'0 16px 32px', display:'flex', flexDirection:'column', gap:14 }}>

          {sucesso && (
            <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:10,
              padding:'12px 16px', display:'flex', alignItems:'center', gap:8, color:'#15803d', fontWeight:700 }}>
              <CheckCircle2 size={18}/> Ocorrência registrada com sucesso!
            </div>
          )}
          {erroMsg && (
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10,
              padding:'12px 16px', color:'#dc2626', fontWeight:700, fontSize:13 }}>
              {erroMsg}
            </div>
          )}

          {/* Colaborador */}
          <div>
            {LBL('Colaborador *')}
            <ColabSearchSelect
              colabs={colabs}
              value={colabId}
              onChange={id => { setColabId(id); setErroMsg('') }}
              label="Colaborador *"
              required
            />
            {!colabId && (
              <p style={{ fontSize:11, color:'#dc2626', marginTop:4, fontWeight:600 }}>⚠️ Selecione um colaborador</p>
            )}
          </div>

          {/* Data + Hora */}
          <div style={{ display:'grid', gridTemplateColumns: aba==='acidente' ? '1fr 1fr' : '1fr', gap:10 }}>
            <div>{LBL('Data *')}<input type="date" value={dataOcor} onChange={e => setDataOcor(e.target.value)} style={INPS}/></div>
            {aba==='acidente' && <div>{LBL('Hora')}<input type="time" value={hora} onChange={e => setHora(e.target.value)} style={INPS}/></div>}
          </div>

          {/* Gravidade */}
          {aba === 'acidente' && (
            <div>
              {LBL('Gravidade')}
              <select value={gravidade} onChange={e => setGravidade(e.target.value)} style={SELS}>
                <option value="leve">Leve</option>
                <option value="moderado">Moderado</option>
                <option value="grave">Grave</option>
                <option value="fatal">Fatal</option>
              </select>
            </div>
          )}

          {/* ── ACIDENTE ── */}
          {aba === 'acidente' && (<>
            <div>
              {LBL('Tipo de Acidente')}
              <select value={tipoAcid} onChange={e => setTipoAcid(e.target.value)} style={SELS}>
                <option value="sem_afastamento">Sem Afastamento</option>
                <option value="com_afastamento">Com Afastamento</option>
                <option value="trajeto">De Trajeto</option>
                <option value="quase_acidente">Quase Acidente</option>
              </select>
            </div>
            <div>
              {LBL('Local do Acidente')}
              <input value={local} onChange={e => setLocal(e.target.value)} placeholder="Descreva o local…" style={INPS}/>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={catEmitida} onChange={e => setCatEmitida(e.target.checked)} style={{ width:18, height:18 }}/>
              <span style={{ fontSize:14, fontWeight:600, color:'#374151' }}>CAT Emitida</span>
            </label>
          </>)}

          {/* ── ATESTADO ── */}
          {aba === 'atestado' && (<>
            <div>
              {LBL('Tipo de Atestado')}
              <select value={tipoAtest} onChange={e => setTipoAtest(e.target.value)} style={SELS}>
                <option value="medico">Médico</option>
                <option value="odontologico">Odontológico</option>
                <option value="acompanhamento">Acompanhamento Familiar</option>
                <option value="outros">Outros</option>
              </select>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div>
                {LBL('Dias de Afastamento')}
                <input type="number" value={diasAfas} onChange={e => setDiasAfas(e.target.value)} min="0" placeholder="0" style={INPS}/>
              </div>
              <div>
                {LBL('CID')}
                <input value={cid} onChange={e => setCid(e.target.value)} placeholder="Ex.: J00" style={INPS}/>
              </div>
            </div>
            <div>
              {LBL('Médico / Hospital')}
              <input value={medico} onChange={e => setMedico(e.target.value)} placeholder="Nome do médico ou hospital" style={INPS}/>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={comAfas} onChange={e => setComAfas(e.target.checked)} style={{ width:18, height:18 }}/>
              <span style={{ fontSize:14, fontWeight:600, color:'#374151' }}>Com Afastamento</span>
            </label>

            {/* ── ANEXO OBRIGATÓRIO DO ATESTADO ── */}
            <div style={{ border:`2px solid ${arquivoAtestado ? '#86efac' : '#fca5a5'}`, borderRadius:12, padding:12, background: arquivoAtestado ? '#f0fdf4' : '#fff5f5' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <span style={{ fontSize:16 }}>📎</span>
                <span style={{ fontSize:13, fontWeight:800, color: arquivoAtestado ? '#15803d' : '#dc2626' }}>
                  {arquivoAtestado ? '✓ Atestado anexado' : 'Anexar Atestado (obrigatório) *'}
                </span>
              </div>

              {!arquivoAtestado && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <button type="button" onClick={() => fotoRef.current?.click()} style={{
                    height:80, border:'2px dashed #2563eb', borderRadius:10, cursor:'pointer',
                    background:'#eff6ff', display:'flex', flexDirection:'column',
                    alignItems:'center', justifyContent:'center', gap:4, color:'#2563eb',
                  }}>
                    <Camera size={24} strokeWidth={1.8}/>
                    <span style={{ fontSize:12, fontWeight:800 }}>📸 Tirar Foto</span>
                  </button>
                  <input ref={fotoRef} type="file" accept="image/*" capture="environment"
                    style={{ display:'none' }} onChange={e => selecionarAtestado(e.target.files?.[0] ?? null)}/>

                  <button type="button" onClick={() => uploadRef.current?.click()} style={{
                    height:80, border:'2px dashed #9ca3af', borderRadius:10, cursor:'pointer',
                    background:'#f9fafb', display:'flex', flexDirection:'column',
                    alignItems:'center', justifyContent:'center', gap:4, color:'#6b7280',
                  }}>
                    <Upload size={24} strokeWidth={1.8}/>
                    <span style={{ fontSize:12, fontWeight:800 }}>📁 Arquivo/PDF</span>
                  </button>
                  <input ref={uploadRef} type="file" accept="image/*,application/pdf,.doc,.docx"
                    style={{ display:'none' }} onChange={e => selecionarAtestado(e.target.files?.[0] ?? null)}/>
                </div>
              )}

              {arquivoAtestado && (
                <div>
                  {previewAtestado ? (
                    <img src={previewAtestado} alt="atestado" style={{ width:'100%', maxHeight:200, objectFit:'contain', borderRadius:8, marginBottom:8 }}/>
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                      <FileText size={28} color="#2563eb"/>
                      <span style={{ fontSize:12, fontWeight:700 }}>{arquivoAtestado.name}</span>
                    </div>
                  )}
                  {tamanhoAtestado && (
                    <div style={{ fontSize:11, color:'#16a34a', fontWeight:700, marginBottom:6 }}>
                      🗜️ {tamanhoAtestado}
                    </div>
                  )}
                  <button type="button" onClick={limparAtestado} style={{
                    width:'100%', height:32, border:'1px solid #fca5a5', borderRadius:7,
                    background:'#fff', color:'#dc2626', cursor:'pointer', fontWeight:600, fontSize:12,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  }}>
                    <Trash2 size={12}/> Remover atestado
                  </button>
                </div>
              )}

              {erroArquivo && (
                <p style={{ fontSize:11, color:'#dc2626', fontWeight:700, marginTop:6 }}>⚠️ {erroArquivo}</p>
              )}
            </div>
          </>)}

          {/* ── ADVERTÊNCIA ── */}
          {aba === 'advertencia' && (<>
            <div>
              {LBL('Tipo de Advertência')}
              <select value={tipoAdv} onChange={e => setTipoAdv(e.target.value)} style={SELS}>
                <option value="verbal">Verbal</option>
                <option value="escrita">Escrita</option>
                <option value="suspensao">Suspensão</option>
              </select>
            </div>
            {tipoAdv === 'suspensao' && (
              <div>
                {LBL('Dias de Suspensão')}
                <input type="number" value={diasSusp} onChange={e => setDiasSusp(e.target.value)} min="1" style={INPS}/>
              </div>
            )}
            <div>
              {LBL('Motivo')}
              <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo da advertência…" style={INPS}/>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={assinada} onChange={e => setAssinada(e.target.checked)} style={{ width:18, height:18 }}/>
              <span style={{ fontSize:14, fontWeight:600, color:'#374151' }}>Advertência Assinada</span>
            </label>
          </>)}

          {/* Descrição */}
          <div>
            {LBL('Descrição *')}
            <textarea
              value={descricao}
              onChange={e => { setDescricao(e.target.value); if (e.target.value.trim()) setErroMsg('') }}
              rows={4}
              placeholder={aba==='acidente' ? 'Descreva como ocorreu o acidente…' : aba==='atestado' ? 'Motivo do afastamento…' : 'Detalhes da ocorrência…'}
              style={{ width:'100%', border:`2px solid ${!descricao.trim() ? '#fca5a5' : '#e5e7eb'}`, borderRadius:8,
                padding:'10px 12px', fontSize:13, boxSizing:'border-box',
                background: !descricao.trim() ? '#fff5f5' : '#fff', resize:'vertical' }}
            />
            {!descricao.trim() && (
              <p style={{ fontSize:11, color:'#dc2626', marginTop:4, fontWeight:600 }}>⚠️ Campo obrigatório — preencha antes de registrar</p>
            )}
          </div>

          <button type="submit" disabled={saving} style={{
            height:52, background: saving ? '#94a3b8' : '#dc2626', color:'#fff',
            border:'none', borderRadius:12, fontSize:16, fontWeight:700,
            cursor: saving ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
            {saving
              ? <><Loader2 size={18} className="animate-spin"/>Salvando…</>
              : <><AlertTriangle size={18}/>Registrar Ocorrência</>}
          </button>
        </form>
      )}

      {/* ── HISTÓRICO / GERAL ── */}
      {(subAba === 'historico' || aba === 'geral') && (
        <div style={{ padding:'0 16px 32px' }}>
          {aba === 'geral' && (
            <div style={{ marginBottom:12, fontWeight:700, fontSize:13, color:'#6b7280' }}>
              Todas as ocorrências — {historico.length} registros
            </div>
          )}
          {historico.length === 0 ? (
            <div style={{ background:'#fff', borderRadius:12, padding:32, textAlign:'center', color:'#9ca3af' }}>
              Nenhuma ocorrência registrada ainda
            </div>
          ) : historico.map(h => {
            const jaSync   = !!h.sincronizado_em || h.status === 'aprovado'
            const recusado = h.status === 'recusado'
            const cNome  = (h as any).colaboradores?.nome ?? '—'
            const gc     = GRAV_COR[h.gravidade ?? ''] ?? {bg:'#f3f4f6', cor:'#374151'}
            const tipoCor: Record<string,string> = { acidente:'#dc2626', atestado:'#2563eb', advertencia:'#ea580c', geral:'#7c3aed' }
            const cor = tipoCor[h.tipo] ?? '#6b7280'
            return (
              <div key={h.id} style={{ background:'#fff', borderRadius:12,
                border:`1px solid ${jaSync ? '#86efac' : '#e5e7eb'}`, marginBottom:8, padding:'14px 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap', marginBottom:4 }}>
                      <span style={{ background:cor+'20', color:cor, borderRadius:5, padding:'1px 8px', fontSize:11, fontWeight:700, textTransform:'uppercase' }}>{h.tipo}</span>
                      {h.gravidade && <span style={{ background:gc.bg, color:gc.cor, borderRadius:5, padding:'1px 8px', fontSize:11, fontWeight:700 }}>{h.gravidade}</span>}
                    </div>
                    <div style={{ fontWeight:700, fontSize:14, color:'#111' }}>{cNome}</div>
                    <div style={{ fontSize:12, color:'#374151', marginTop:4, lineHeight:1.4 }}>{h.descricao}</div>
                    {h.local && <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>📍 {h.local}</div>}
                    {h.dias_afastamento && <div style={{ fontSize:11, color:'#2563eb', marginTop:2 }}>🏥 {h.dias_afastamento} dia(s) de afastamento</div>}
                    {h.motivo && <div style={{ fontSize:11, color:'#ea580c', marginTop:2 }}>📋 {h.motivo}</div>}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                    {jaSync
                      ? <span style={{ background:'#dcfce7', color:'#15803d', borderRadius:5, padding:'2px 8px', fontSize:11, fontWeight:700 }}>✓ Aprovado</span>
                      : recusado
                      ? <span style={{ background:'#fee2e2', color:'#dc2626', borderRadius:5, padding:'2px 8px', fontSize:11, fontWeight:700 }}>✗ Recusado</span>
                      : <span style={{ background:'#fef3c7', color:'#b45309', borderRadius:5, padding:'2px 8px', fontSize:11, fontWeight:700 }}>⏳ Pendente</span>}
                    {!jaSync && !recusado && (
                      <button type="button" onClick={() => excluir(h.id, h.sincronizado_em, h.status ?? '')} disabled={deletandoId===h.id}
                        style={{ background:'none', border:'1px solid #fca5a5', borderRadius:6, padding:'3px 8px',
                          cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'#dc2626', fontSize:11 }}>
                        <Trash2 size={12}/>{deletandoId===h.id ? '…' : 'Excluir'}
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize:10, color:'#9ca3af', marginTop:6 }}>
                  {h.data_ocorrencia?.split('-').reverse().join('/')} · {new Date(h.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </PortalLayout>
  )
}
