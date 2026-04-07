import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { EmptyState, LoadingSkeleton } from '@/components/Shared'
import { useProfile } from '@/hooks/useProfile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import {
  FileText, Search, Plus, Upload, X, Trash2, ExternalLink, ChevronRight,
  User, Lock, CheckCircle2, AlertCircle, Settings, Printer, ClipboardList,
  Layers, Building2, Briefcase, ChevronDown, ChevronUp, GripVertical,
  Download, FilePlus2, Eye,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────
type Colaborador = {
  id: string; nome: string; chapa: string; status: string
  funcao?: string | null; obra_id?: string | null; funcao_id?: string | null
}
type Obra = { id: string; nome: string }

type DocEntry = {
  id: string
  source: 'documento' | 'avulso' | 'atestado' | 'advertencia' | 'acidente'
  tipo: string
  colaborador_id: string | null
  data: string
  descricao: string
  documento_url: string
  documento_nome: string
}

type DocTemplate = {
  id: string
  nome: string
  categoria: 'contratacao' | 'lote' | 'outro'
  conteudo: string       // HTML do documento
  variaveis: string[]    // ex: ['{{nome}}', '{{cpf}}']
  ativo: boolean
  ordem: number
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const TIPOS_PADRAO = [
  'Contrato de Trabalho','Exame Admissional','Exame Demissional','Exame Periódico',
  'Atestado Médico','Certificado de Treinamento','Declaração de Vínculo',
  'Carteira de Trabalho (CTPS)','Documento de Identidade (RG/CNH)','CPF',
  'Comprovante de Residência','Foto 3x4','Ficha de Registro','Advertência',
  'Suspensão','Comunicação de Acidente (CAT)','ASO (Atestado de Saúde Ocupacional)',
  'NR-35 (Trabalho em Altura)','NR-18 (Construção Civil)','Outros',
]

// Docs padrão do kit de contratação
const DOCS_CONTRATACAO_PADRAO = [
  { id: 'c1', nome: 'Contrato de Trabalho', obrigatorio: true },
  { id: 'c2', nome: 'Ficha de Registro', obrigatorio: true },
  { id: 'c3', nome: 'Declaração de Vínculo', obrigatorio: true },
  { id: 'c4', nome: 'ASO (Atestado de Saúde Ocupacional)', obrigatorio: true },
  { id: 'c5', nome: 'Autorização de Descontos', obrigatorio: false },
  { id: 'c6', nome: 'Termo de Recebimento de EPI', obrigatorio: false },
  { id: 'c7', nome: 'Declaração de Dependentes IR', obrigatorio: false },
  { id: 'c8', nome: 'Ficha de Vale Transporte', obrigatorio: false },
]

const TIPO_COLORS: Record<string, { bg: string; color: string }> = {
  'Atestado Médico':    { bg: '#eff6ff', color: '#1d4ed8' },
  'Advertência':        { bg: '#fffbeb', color: '#d97706' },
  'Comunicação de Acidente (CAT)': { bg: '#fff1f2', color: '#dc2626' },
  'Contrato de Trabalho': { bg: '#f0fdf4', color: '#16a34a' },
  'Exame Admissional':  { bg: '#fdf4ff', color: '#7c3aed' },
  'Exame Periódico':    { bg: '#fdf4ff', color: '#7c3aed' },
  'Certificado de Treinamento': { bg: '#ecfdf5', color: '#059669' },
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const ALLOWED_EXT   = ['.pdf', '.jpg', '.jpeg', '.png', '.webp']
const BUCKET = 'ocorrencias-documentos'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTiposDoc(): string[] {
  try {
    const s = localStorage.getItem('rh_tipos_documentos')
    if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) return p }
  } catch {}
  return TIPOS_PADRAO
}

function getDocsContratacao(): typeof DOCS_CONTRATACAO_PADRAO {
  try {
    const s = localStorage.getItem('rh_docs_contratacao')
    if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) return p }
  } catch {}
  return DOCS_CONTRATACAO_PADRAO
}

function saveDocsContratacao(list: typeof DOCS_CONTRATACAO_PADRAO) {
  localStorage.setItem('rh_docs_contratacao', JSON.stringify(list))
}

async function uploadDoc(file: File): Promise<{ url: string; nome: string } | null> {
  if (file.size > MAX_FILE_SIZE) {
    toast.error(`Arquivo muito grande. Máximo: 10 MB`)
    return null
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    toast.error('Formato não permitido. Use PDF, JPG, PNG ou WebP.')
    return null
  }
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  const path = `docs/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type })
  if (error) { toast.error('Erro no upload: ' + error.message); return null }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, nome: file.name }
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
function TipoBadge({ tipo }: { tipo: string }) {
  const s = TIPO_COLORS[tipo] ?? { bg: '#f3f4f6', color: '#6b7280' }
  return (
    <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{tipo}</span>
  )
}

interface UploadAreaProps {
  uploading: boolean; fileName: string; fileUrl: string
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClear: () => void; fileRef: React.RefObject<HTMLInputElement>
}
function UploadArea({ uploading, fileName, fileUrl, onFile, onClear, fileRef }: UploadAreaProps) {
  const [dragging, setDragging] = useState(false)
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !fileRef.current) return
    const dt = new DataTransfer(); dt.items.add(file)
    fileRef.current.files = dt.files
    fileRef.current.dispatchEvent(new Event('change', { bubbles: true }))
  }
  if (fileName && fileUrl) return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:9,
      border:'1.5px solid #22c55e', background:'#f0fdf4' }}>
      <CheckCircle2 size={16} color="#16a34a" style={{ flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, fontWeight:700, color:'#15803d', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fileName}</div>
        <a href={fileUrl} target="_blank" rel="noreferrer"
          style={{ fontSize:11, color:'#16a34a', textDecoration:'none', display:'flex', alignItems:'center', gap:3 }}>
          <ExternalLink size={10} /> Visualizar arquivo
        </a>
      </div>
      <button type="button" onClick={onClear}
        style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', padding:4, flexShrink:0 }}>
        <X size={14} />
      </button>
    </div>
  )
  return (
    <div onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)}
      onDrop={handleDrop} onClick={()=>fileRef.current?.click()}
      style={{ border:`2px dashed ${dragging?'#0ea5e9':'#cbd5e1'}`, borderRadius:9,
        padding:'18px 14px', textAlign:'center', cursor:uploading?'not-allowed':'pointer',
        background:dragging?'#f0f9ff':'#fafbfc', transition:'all .15s', opacity:uploading?.7:1 }}>
      {uploading
        ? <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
            <span style={{width:22,height:22,border:'3px solid #cbd5e1',borderTopColor:'#0ea5e9',borderRadius:'50%',display:'inline-block',animation:'spin .8s linear infinite'}} />
            <span style={{fontSize:12,color:'#64748b'}}>Enviando…</span>
          </div>
        : <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
            <Upload size={20} color={dragging?'#0ea5e9':'#94a3b8'} />
            <span style={{fontSize:12,fontWeight:600,color:dragging?'#0ea5e9':'#475569'}}>
              {dragging?'Soltar aqui':'Clique ou arraste o arquivo'}
            </span>
            <span style={{fontSize:11,color:'#94a3b8'}}>PDF, JPG, PNG ou WebP · máx. 10 MB</span>
          </div>
      }
      <input ref={fileRef} type="file" accept={ALLOWED_EXT.join(',')}
        style={{display:'none'}} onChange={onFile} disabled={uploading} />
    </div>
  )
}

// ─── Visualizador de documento com paginação A4 real ─────────────────────────
// Proporção A4: 210mm × 297mm → ratio 1:√2 ≈ 1:1.4142
// A 96dpi: 794px × 1123px (padrão web para A4)
const A4_W = 794   // px
const A4_H = 1123  // px
const A4_MARGIN = 28 // px (~7.5mm) — margem visual interna

function DocViewer({ url, nome }: { url: string; nome: string }) {
  const isPdf = /\.pdf($|\?)/i.test(nome) || /\.pdf($|\?)/i.test(url)

  return (
    <div style={{
      background: '#3c3f41',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      overflowY: 'auto',
      padding: '20px 16px 32px',
      gap: 0,
    }}>
      {/* Barra de info + ações */}
      <div style={{
        width: A4_W, maxWidth: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', letterSpacing: 1 }}>
          📄 A4 · 210 × 297 mm
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={url} target="_blank" rel="noreferrer"
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px',
              background:'rgba(255,255,255,0.12)', color:'#fff', borderRadius:6,
              textDecoration:'none', fontSize:12, border:'1px solid rgba(255,255,255,0.18)' }}>
            <ExternalLink size={12}/> Abrir
          </a>
          <a href={url} download={nome}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px',
              background:'rgba(255,255,255,0.12)', color:'#fff', borderRadius:6,
              textDecoration:'none', fontSize:12, border:'1px solid rgba(255,255,255,0.18)' }}>
            <Download size={12}/> Baixar
          </a>
        </div>
      </div>

      {/* ── Folha A4 ── */}
      <div style={{
        width: A4_W,
        maxWidth: '100%',
        position: 'relative',
        /* sombra realista de papel */
        boxShadow: '0 2px 8px rgba(0,0,0,0.5), 0 8px 32px rgba(0,0,0,0.35)',
      }}>
        {isPdf ? (
          /*
           * embed renderiza PDFs com scroll nativo do browser,
           * respeitando quebras de página do arquivo.
           * height = múltiplos de A4_H para mostrar pelo menos 2 páginas;
           * o usuário rola dentro do embed.
           */
          <embed
            src={url + '#view=FitH&toolbar=0&navpanes=0'}
            type="application/pdf"
            style={{
              display: 'block',
              width: '100%',
              height: A4_H * 2,   // mostra ~2 páginas; rola internamente
              border: 'none',
              background: '#fff',
            }}
          />
        ) : (
          /* Imagem: centralizada dentro de uma folha A4 com margens */
          <div style={{
            width: '100%',
            minHeight: A4_H,
            background: '#fff',
            padding: A4_MARGIN,
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <img src={url} alt={nome}
              style={{ maxWidth: '100%', maxHeight: A4_H - A4_MARGIN * 2, objectFit: 'contain', display: 'block' }}/>
          </div>
        )}

        {/* Régua de margem — só exibição visual, não interfere no conteúdo */}
        <div style={{
          position: 'absolute',
          top: A4_MARGIN, right: A4_MARGIN,
          bottom: A4_MARGIN, left: A4_MARGIN,
          border: '1px dashed rgba(30,58,95,0.12)',
          pointerEvents: 'none',
        }}/>
      </div>

      {/* Nota de rodapé */}
      <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
        {nome}
      </div>
    </div>
  )
}

// ─── Aba: Gerenciador de Kit de Contratação ────────────────────────────────────
function AbaContratacao({ colaboradores, obras }: { colaboradores: Colaborador[]; obras: Obra[] }) {
  const [kitDocs, setKitDocs] = useState(() => getDocsContratacao())
  const [novoDoc, setNovoDoc] = useState('')
  const [editando, setEditando] = useState(false)

  // seleção para geração
  const [colabsSel, setColabsSel] = useState<string[]>([])
  const [docsSel, setDocsSel] = useState<string[]>(() => getDocsContratacao().filter(d => d.obrigatorio).map(d => d.id))
  const [gerando, setGerando] = useState(false)
  const [gerado, setGerado] = useState(false)

  function adicionarDoc() {
    const nome = novoDoc.trim()
    if (!nome) return
    const novo = { id: `c${Date.now()}`, nome, obrigatorio: false }
    const updated = [...kitDocs, novo]
    setKitDocs(updated); saveDocsContratacao(updated); setNovoDoc('')
    toast.success('Documento adicionado ao kit!')
  }

  function removerDoc(id: string) {
    const updated = kitDocs.filter(d => d.id !== id)
    setKitDocs(updated); saveDocsContratacao(updated)
  }

  function toggleObrigatorio(id: string) {
    const updated = kitDocs.map(d => d.id === id ? { ...d, obrigatorio: !d.obrigatorio } : d)
    setKitDocs(updated); saveDocsContratacao(updated)
  }

  function toggleColab(id: string) {
    setColabsSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function toggleDocSel(id: string) {
    setDocsSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function selecionarTodosColabs() {
    setColabsSel(c => c.length === colaboradores.length ? [] : colaboradores.map(c => c.id))
  }

  async function gerarKit() {
    if (colabsSel.length === 0) { toast.warning('Selecione ao menos um colaborador'); return }
    if (docsSel.length === 0)   { toast.warning('Selecione ao menos um documento'); return }
    setGerando(true)

    // Gerar janela de impressão com páginas separadas por colaborador
    const colabsData = colaboradores.filter(c => colabsSel.includes(c.id))
    const docsData   = kitDocs.filter(d => docsSel.includes(d.id))

    const dataHojeKit = new Date().toLocaleDateString('pt-BR')
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Kit de Contratação — ${colabsData.length} colaborador(es)</title>
  <style>
    /*
     * FOLHA A4 REAL
     * @page define margens para impressão
     * .pagina ocupa exatamente 1 folha A4 — sem overflow
     */
    @page {
      size: A4 portrait;
      margin: 20mm 20mm 20mm 20mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 210mm; font-family: Arial, Helvetica, sans-serif; font-size: 12pt; color: #1a1a1a; }
    /* Cada .pagina = 1 folha impressa */
    .pagina {
      width: 210mm;
      min-height: 257mm;          /* 297mm - 20mm top - 20mm bottom */
      padding: 0;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }
    .pagina:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
    /* Conteúdo cresce e empurra rodapé para baixo */
    .corpo { flex: 1; }
    /* Header */
    .topo {
      border-bottom: 2pt solid #1e3a5f;
      padding-bottom: 8pt;
      margin-bottom: 14pt;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .topo-titulo { font-size: 13pt; font-weight: 700; color: #1e3a5f; }
    .topo-sub    { font-size: 8pt; color: #666; margin-top: 2pt; }
    .topo-emp    { font-size: 8pt; color: #555; text-align: right; line-height: 1.5; }
    /* Dados colaborador */
    .colab-box {
      background: #f7f9fc;
      border: 1pt solid #d1d9e6;
      border-radius: 3pt;
      padding: 8pt 10pt;
      margin-bottom: 12pt;
    }
    .colab-box h3 { font-size: 9pt; font-weight: 700; color: #1e3a5f; margin-bottom: 6pt; }
    .colab-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 16pt; }
    .campo { font-size: 8.5pt; color: #222; }
    .campo-label { font-size: 7.5pt; color: #888; font-weight: 600; text-transform: uppercase; display: block; margin-bottom: 1pt; }
    /* Corpo do documento */
    .doc-titulo {
      font-size: 10pt; font-weight: 700; color: #1e3a5f;
      border-bottom: 1pt solid #dde3ed;
      padding-bottom: 6pt; margin-bottom: 10pt;
    }
    .doc-corpo { font-size: 10.5pt; line-height: 1.85; color: #222; text-align: justify; }
    .doc-corpo p { margin-bottom: 8pt; }
    /* Assinaturas */
    .assinaturas {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20pt;
      margin-top: 30pt;
    }
    .ass-linha {
      border-top: 1pt solid #1e3a5f;
      padding-top: 5pt;
      font-size: 8.5pt;
      color: #333;
      line-height: 1.6;
    }
    /* Rodapé fixo no fundo da página */
    .rodape {
      font-size: 7.5pt;
      color: #aaa;
      text-align: center;
      border-top: 0.5pt solid #e5e7eb;
      padding-top: 5pt;
      margin-top: 16pt;
    }
    /* Separador visual (somente tela, some na impressão) */
    @media screen {
      .pagina {
        background: #fff;
        padding: 20mm;
        margin: 0 auto 24px;
        box-shadow: 0 2px 16px rgba(0,0,0,.18);
      }
      body { background: #525659; padding: 24px; }
    }
    @media print {
      body { background: #fff; padding: 0; }
      .pagina { margin: 0; padding: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
${colabsData.map(colab => docsData.map((doc, di) => `
<div class="pagina">
  <div class="topo">
    <div>
      <div class="topo-titulo">${doc.nome}</div>
      <div class="topo-sub">Kit de Contratação &nbsp;·&nbsp; Emitido em ${dataHojeKit}</div>
    </div>
    <div class="topo-emp">Magmo Construtora<br/>CNPJ: __/__.__-__</div>
  </div>

  <div class="corpo">
    <div class="colab-box">
      <h3>👷 Dados do Colaborador</h3>
      <div class="colab-grid">
        <div class="campo"><span class="campo-label">Nome completo</span>${colab.nome}</div>
        <div class="campo"><span class="campo-label">Chapa</span>${colab.chapa || '—'}</div>
        <div class="campo"><span class="campo-label">CPF</span>___ . ___ . ___ - __</div>
        <div class="campo"><span class="campo-label">Data de admissão</span>${dataHojeKit}</div>
        <div class="campo"><span class="campo-label">Função</span>${colab.funcao || '—'}</div>
        <div class="campo"><span class="campo-label">Tipo de contrato</span>_______________</div>
      </div>
    </div>

    <div class="doc-titulo">📄 ${doc.nome}</div>
    <div class="doc-corpo">
      <p>Pelo presente instrumento, o(a) colaborador(a) <strong>${colab.nome}</strong>,
      portador(a) do CPF n.º ___ . ___ . ___ - __, admitido(a) em ${dataHojeKit},
      declara ter recebido, lido e compreendido o presente documento referente a <strong>${doc.nome}</strong>,
      comprometendo-se a cumprir todas as disposições nele contidas.</p>
      <p><em style="color:#888;">[Complementar com o conteúdo específico deste documento]</em></p>
    </div>

    <div class="assinaturas">
      <div>
        <div class="ass-linha">
          ${colab.nome}<br/>
          Colaborador(a) &nbsp;·&nbsp; CPF: ___ . ___ . ___ - __
        </div>
      </div>
      <div>
        <div class="ass-linha">
          ___________________________<br/>
          Responsável RH &nbsp;·&nbsp; Data: ____/____/________
        </div>
      </div>
    </div>
  </div>

  <div class="rodape">
    ConstrutorRH &nbsp;·&nbsp; Documento ${di + 1} de ${docsData.length} &nbsp;·&nbsp; ${colab.nome} &nbsp;·&nbsp; ${dataHojeKit}
  </div>
</div>
`).join('')).join('')}
</body>
</html>`

    const win = window.open('', '_blank', 'width=900,height=700')
    if (win) {
      win.document.write(html)
      win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 600)
    }
    setGerando(false)
    setGerado(true)
    setTimeout(() => setGerado(false), 3000)
  }

  return (
    <div style={{ display: 'flex', gap: 20, height: '100%', overflow: 'hidden' }}>

      {/* Coluna 1: Kit de documentos */}
      <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardList size={16} color="#fff" />
              <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>Kit de Contratação</span>
            </div>
            <button onClick={() => setEditando(e => !e)}
              style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, padding: '4px 10px',
                color: '#fff', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Settings size={12} /> {editando ? 'Fechar' : 'Editar lista'}
            </button>
          </div>

          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {kitDocs.map(doc => (
              <div key={doc.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8,
                border: `1px solid ${docsSel.includes(doc.id) ? '#1e3a5f' : '#e2e8f0'}`,
                background: docsSel.includes(doc.id) ? '#eff6ff' : '#fafafa',
                cursor: 'pointer',
              }} onClick={() => toggleDocSel(doc.id)}>
                <div style={{
                  width: 18, height: 18, borderRadius: 4, border: `2px solid ${docsSel.includes(doc.id) ? '#1e3a5f' : '#d1d5db'}`,
                  background: docsSel.includes(doc.id) ? '#1e3a5f' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {docsSel.includes(doc.id) && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
                </div>
                <span style={{ flex: 1, fontSize: 12, color: '#374151' }}>{doc.nome}</span>
                {doc.obrigatorio && (
                  <span style={{ fontSize: 9, background: '#fee2e2', color: '#dc2626', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>
                    OBRIG.
                  </span>
                )}
                {editando && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={e => { e.stopPropagation(); toggleObrigatorio(doc.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#6b7280', padding: 2 }}
                      title={doc.obrigatorio ? 'Tornar opcional' : 'Tornar obrigatório'}>
                      {doc.obrigatorio ? '📌' : '📍'}
                    </button>
                    <button onClick={e => { e.stopPropagation(); removerDoc(doc.id) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {editando && (
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  value={novoDoc}
                  onChange={e => setNovoDoc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && adicionarDoc()}
                  placeholder="Nome do novo documento…"
                  style={{ flex: 1, height: 34, borderRadius: 7, border: '1px solid #e2e8f0', padding: '0 10px', fontSize: 12 }}
                />
                <button onClick={adicionarDoc}
                  style={{ height: 34, paddingInline: 12, borderRadius: 7, border: 'none',
                    background: '#1e3a5f', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                  + Add
                </button>
              </div>
            )}
          </div>
          <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#9ca3af' }}>
            {docsSel.length} de {kitDocs.length} documento(s) selecionado(s)
          </div>
        </div>
      </div>

      {/* Coluna 2: Seleção de colaboradores */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={15} color="#374151" />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Selecionar Colaboradores</span>
              <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                {colabsSel.length} selecionado(s)
              </span>
            </div>
            <button onClick={selecionarTodosColabs}
              style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px',
                color: '#374151', cursor: 'pointer', fontSize: 11 }}>
              {colabsSel.length === colaboradores.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {/* Agrupar por obra */}
            {obras.map(obra => {
              const colabsObra = colaboradores.filter(c => c.obra_id === obra.id)
              if (colabsObra.length === 0) return null
              return (
                <div key={obra.id} style={{ marginBottom: 8 }}>
                  <div style={{ padding: '6px 8px', background: '#f1f5f9', borderRadius: 6, marginBottom: 4,
                    fontSize: 11, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Building2 size={12} color="#1e3a5f" />
                    {obra.nome}
                    <button onClick={() => {
                      const ids = colabsObra.map(c => c.id)
                      const allSel = ids.every(id => colabsSel.includes(id))
                      setColabsSel(s => allSel ? s.filter(id => !ids.includes(id)) : [...new Set([...s, ...ids])])
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#6b7280', marginLeft: 'auto' }}>
                      {colabsObra.every(c => colabsSel.includes(c.id)) ? 'Desmarcar obra' : 'Selecionar obra'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4 }}>
                    {colabsObra.map(c => (
                      <div key={c.id} onClick={() => toggleColab(c.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                          borderRadius: 7, border: `1px solid ${colabsSel.includes(c.id) ? '#1e3a5f' : '#e2e8f0'}`,
                          background: colabsSel.includes(c.id) ? '#eff6ff' : '#fff', cursor: 'pointer' }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${colabsSel.includes(c.id) ? '#1e3a5f' : '#d1d5db'}`,
                          background: colabsSel.includes(c.id) ? '#1e3a5f' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {colabsSel.includes(c.id) && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</div>
                          <div style={{ fontSize: 10, color: '#6b7280' }}>{c.chapa} · {c.funcao || '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {/* Sem obra */}
            {(() => {
              const semObra = colaboradores.filter(c => !c.obra_id)
              if (semObra.length === 0) return null
              return (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ padding: '6px 8px', background: '#f1f5f9', borderRadius: 6, marginBottom: 4,
                    fontSize: 11, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <User size={12} color="#1e3a5f" /> Sem obra vinculada
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4 }}>
                    {semObra.map(c => (
                      <div key={c.id} onClick={() => toggleColab(c.id)}
                        style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
                          borderRadius:7, border:`1px solid ${colabsSel.includes(c.id)?'#1e3a5f':'#e2e8f0'}`,
                          background:colabsSel.includes(c.id)?'#eff6ff':'#fff', cursor:'pointer' }}>
                        <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${colabsSel.includes(c.id)?'#1e3a5f':'#d1d5db'}`,
                          background:colabsSel.includes(c.id)?'#1e3a5f':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          {colabsSel.includes(c.id) && <span style={{color:'#fff',fontSize:10}}>✓</span>}
                        </div>
                        <div style={{ minWidth:0 }}>
                          <div style={{fontSize:12,fontWeight:600,color:'#0f172a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nome}</div>
                          <div style={{fontSize:10,color:'#6b7280'}}>{c.chapa} · {c.funcao||'—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* Botão gerar */}
        <button onClick={gerarKit} disabled={gerando || colabsSel.length === 0 || docsSel.length === 0}
          style={{ height: 48, borderRadius: 10, border: 'none',
            background: gerado ? '#16a34a' : (gerando || colabsSel.length === 0 || docsSel.length === 0) ? '#94a3b8' : 'linear-gradient(135deg, #1e3a5f, #2d6a4f)',
            color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {gerado
            ? <><CheckCircle2 size={18} /> Kit gerado com sucesso!</>
            : gerando
              ? 'Gerando…'
              : <><Printer size={18} /> Gerar Kit para {colabsSel.length} colaborador(es) · {docsSel.length} doc(s)</>
          }
        </button>
      </div>
    </div>
  )
}

// ─── Aba: Geração em Lote ─────────────────────────────────────────────────────
function AbaLote({ colaboradores, obras }: { colaboradores: Colaborador[]; obras: Obra[] }) {
  const [termoNome, setTermoNome]   = useState('')
  const [termoTexto, setTermoTexto] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'obra' | 'funcao'>('todos')
  const [filtroValor, setFiltroValor] = useState('')
  const [colabsSel, setColabsSel]   = useState<string[]>([])
  const [gerando, setGerando]       = useState(false)

  // Funções únicas dos colaboradores
  const funcoes = useMemo(() =>
    [...new Set(colaboradores.map(c => c.funcao).filter(Boolean) as string[])].sort(),
    [colaboradores])

  // Filtrar colaboradores
  const colabsFiltrados = useMemo(() => {
    if (filtroTipo === 'obra' && filtroValor)
      return colaboradores.filter(c => c.obra_id === filtroValor)
    if (filtroTipo === 'funcao' && filtroValor)
      return colaboradores.filter(c => c.funcao === filtroValor)
    return colaboradores
  }, [colaboradores, filtroTipo, filtroValor])

  useEffect(() => {
    setColabsSel(colabsFiltrados.map(c => c.id))
  }, [colabsFiltrados])

  function toggleColab(id: string) {
    setColabsSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  // ── Função auxiliar: busca EPIs por funcao_id e retorna tabela HTML ────────
  async function buscarEpisDaFuncaoLocal(funcaoId: string | null | undefined): Promise<string> {
    if (!funcaoId) return '<em style="color:#999">[Função não vinculada — EPIs não disponíveis]</em>'
    const { data, error } = await supabase
      .from('funcao_epi')
      .select('id, epi_id, quantidade, obrigatorio, epi_catalogo(id, nome, categoria, numero_ca)')
      .eq('funcao_id', funcaoId)
    if (error) return `<em style="color:#c00">[Erro ao buscar EPIs: ${error.message}]</em>`
    if (!data || data.length === 0)
      return '<em style="color:#888">[Nenhum EPI cadastrado para esta função]</em>'
    const linhas = (data as any[]).map((row, i) => {
      const epi = row.epi_catalogo ?? {}
      const ca  = epi.numero_ca ? `CA ${epi.numero_ca}` : '—'
      const qtd = row.quantidade ?? 1
      return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
        <td style="padding:5px 8px;border:1px solid #e2e8f0;text-align:center;font-size:10pt">${i + 1}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-weight:600;font-size:10pt">${epi.nome ?? '—'}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10pt;text-align:center">${epi.categoria ?? '—'}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10pt;text-align:center">${ca}</td>
        <td style="padding:5px 8px;border:1px solid #e2e8f0;font-size:10pt;text-align:center">${qtd}</td>
      </tr>`
    }).join('')
    return `<table style="width:100%;border-collapse:collapse;margin:8pt 0;font-family:Arial,sans-serif">
  <thead>
    <tr style="background:#1e3a5f;color:#fff">
      <th style="padding:6px 8px;border:1px solid #1e3a5f;font-size:9pt;width:30px">#</th>
      <th style="padding:6px 8px;border:1px solid #1e3a5f;font-size:9pt;text-align:left">Equipamento de Proteção Individual (EPI)</th>
      <th style="padding:6px 8px;border:1px solid #1e3a5f;font-size:9pt;width:100px">Categoria</th>
      <th style="padding:6px 8px;border:1px solid #1e3a5f;font-size:9pt;width:70px">Nº CA</th>
      <th style="padding:6px 8px;border:1px solid #1e3a5f;font-size:9pt;width:50px">Qtd.</th>
    </tr>
  </thead>
  <tbody>${linhas}</tbody>
</table>`
  }

  async function gerarLote() {
    if (!termoNome.trim()) { toast.warning('Informe o nome do documento'); return }
    if (colabsSel.length === 0) { toast.warning('Selecione ao menos um colaborador'); return }
    setGerando(true)

    const colabsData = colaboradores.filter(c => colabsSel.includes(c.id))
    const dataHoje = new Date().toLocaleDateString('pt-BR')

    // Pré-buscar EPIs para cada colaborador (uma chamada por funcao_id único)
    const usaEpi = /\{\{(epis_funcao|tabela_epis|epi_tabela|EPIs da Função)\}\}/i.test(termoTexto)
    const epiCache: Record<string, string> = {}
    if (usaEpi) {
      const funcaoIds = [...new Set(colabsData.map(c => (c as any).funcao_id).filter(Boolean))] as string[]
      await Promise.all(funcaoIds.map(async fid => {
        epiCache[fid] = await buscarEpisDaFuncaoLocal(fid)
      }))
    }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${termoNome} — ${colabsData.length} via(s)</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 20mm 20mm 20mm 20mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 210mm; font-family: Arial, Helvetica, sans-serif; font-size: 12pt; color: #1a1a1a; }
    .pagina {
      width: 210mm;
      min-height: 257mm;
      padding: 0;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .pagina:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
    .corpo { flex: 1; }
    /* Topo */
    .topo {
      border-bottom: 2pt solid #1e3a5f;
      padding-bottom: 8pt;
      margin-bottom: 16pt;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .topo-titulo { font-size: 14pt; font-weight: 700; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.5pt; }
    .topo-sub    { font-size: 8pt; color: #666; margin-top: 3pt; }
    .topo-emp    { font-size: 8pt; color: #555; text-align: right; line-height: 1.5; }
    /* Colaborador */
    .colab-box {
      background: #f7f9fc;
      border: 1pt solid #d1d9e6;
      border-left: 3pt solid #1e3a5f;
      border-radius: 3pt;
      padding: 8pt 12pt;
      margin-bottom: 14pt;
    }
    .colab-nome { font-size: 12pt; font-weight: 700; color: #0f172a; }
    .colab-detalhe { font-size: 8.5pt; color: #555; margin-top: 3pt; line-height: 1.6; }
    /* Conteúdo */
    .conteudo {
      font-size: 10.5pt;
      line-height: 1.9;
      color: #222;
      text-align: justify;
    }
    .conteudo p { margin-bottom: 8pt; }
    /* Assinaturas */
    .assinaturas {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24pt;
      margin-top: 32pt;
    }
    .ass-linha {
      border-top: 1pt solid #1e3a5f;
      padding-top: 6pt;
      font-size: 8.5pt;
      color: #333;
      line-height: 1.7;
    }
    /* Rodapé */
    .rodape {
      font-size: 7.5pt;
      color: #aaa;
      text-align: center;
      border-top: 0.5pt solid #e5e7eb;
      padding-top: 5pt;
      margin-top: 16pt;
    }
    @media screen {
      .pagina {
        background: #fff;
        padding: 20mm;
        margin: 0 auto 24px;
        box-shadow: 0 2px 16px rgba(0,0,0,.18);
      }
      body { background: #525659; padding: 24px; }
    }
    @media print {
      body { background: #fff; padding: 0; }
      .pagina { margin: 0; padding: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
${colabsData.map((colab, i) => `
<div class="pagina">
  <div class="topo">
    <div>
      <div class="topo-titulo">${termoNome}</div>
      <div class="topo-sub">Emitido em ${dataHoje} &nbsp;·&nbsp; Via ${i + 1} de ${colabsData.length}</div>
    </div>
    <div class="topo-emp">Magmo Construtora<br/>CNPJ: __/__.__-__</div>
  </div>

  <div class="corpo">
    <div class="colab-box">
      <div class="colab-nome">👷 ${colab.nome}</div>
      <div class="colab-detalhe">
        Chapa: <strong>${colab.chapa || '—'}</strong> &nbsp;·&nbsp;
        Função: <strong>${colab.funcao || '—'}</strong> &nbsp;·&nbsp;
        Obra: <strong>${obras.find(o => o.id === colab.obra_id)?.nome || '—'}</strong>
      </div>
    </div>

    <div class="conteudo">
      ${
        termoTexto
        ? (() => {
            const epiHtml = usaEpi
              ? epiCache[(colab as any).funcao_id ?? ''] ?? '<em style="color:#999">[EPI não encontrado]</em>'
              : ''
            return termoTexto
              .replace(/\{\{nome\}\}/gi, colab.nome)
              .replace(/\{\{chapa\}\}/gi, colab.chapa || '—')
              .replace(/\{\{funcao\}\}/gi, colab.funcao || '—')
              .replace(/\{\{data\}\}/gi, dataHoje)
              .replace(/\{\{(epis_funcao|tabela_epis|epi_tabela|EPIs da Função)\}\}/gi, epiHtml)
              .split('\n').filter(l => l.trim()).map(l => `<p>${l}</p>`).join('')
          })()
        : `<p>Eu, <strong>${colab.nome}</strong>, portador(a) do CPF n.º ___ . ___ . ___ - __,
           declaro ter recebido, lido e concordo integralmente com os termos do presente documento,
           comprometendo-me a cumprir todas as disposições nele estabelecidas.</p>
           <p><em style="color:#aaa;">[Complemente com o conteúdo específico deste documento]</em></p>`
      }
    </div>

    <div class="assinaturas">
      <div>
        <div class="ass-linha">
          <strong>${colab.nome}</strong><br/>
          Colaborador(a) &nbsp;·&nbsp; CPF: ___ . ___ . ___ - __
        </div>
      </div>
      <div>
        <div class="ass-linha">
          ___________________________<br/>
          Responsável RH &nbsp;·&nbsp; Data: ____/____/________
        </div>
      </div>
    </div>
  </div>

  <div class="rodape">
    ConstrutorRH &nbsp;·&nbsp; ${termoNome} &nbsp;·&nbsp; ${colab.nome} &nbsp;·&nbsp; ${dataHoje}
  </div>
</div>
`).join('')}
</body>
</html>`

    const win = window.open('', '_blank', 'width=900,height=700')
    if (win) {
      win.document.write(html)
      win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 600)
    }
    setGerando(false)
    toast.success(`${colabsData.length} via(s) do documento gerada(s)!`)
  }

  return (
    <div style={{ display: 'flex', gap: 20, height: '100%', overflow: 'hidden' }}>

      {/* Coluna 1: Configurar o documento */}
      <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', paddingBottom: 8 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#1e3a5f' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FilePlus2 size={16} color="#fff" />
              <span style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>Configurar Documento</span>
            </div>
          </div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                Nome do documento *
              </label>
              <input value={termoNome} onChange={e => setTermoNome(e.target.value)}
                placeholder="Ex: Termo de Responsabilidade NR-35"
                style={{ width: '100%', height: 38, borderRadius: 8, border: '1px solid #e2e8f0',
                  padding: '0 12px', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                Conteúdo do documento
                <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400, marginLeft: 6 }}>
                  (use {'{{'+'nome}}'}, {'{{'+'funcao}}'}, {'{{'+'data}}'}, {'{{'+'chapa}}'}, {'{{'+'epis_funcao}}'} )
                </span>
              </label>
              <textarea value={termoTexto} onChange={e => setTermoTexto(e.target.value)}
                placeholder="Digite o texto do documento aqui. Use {{nome}}, {{funcao}}, {{data}} para personalizar.&#10;&#10;Deixe em branco para usar o modelo padrão."
                rows={12}
                style={{ width: '100%', borderRadius: 8, border: '1px solid #e2e8f0',
                  padding: '10px 12px', fontSize: 12, boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.7 }} />
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, fontSize: 11, color: '#6b7280' }}>
              💡 <strong>Variáveis disponíveis:</strong><br/>
              <code style={{ background: '#e2e8f0', borderRadius: 3, padding: '1px 4px' }}>{'{{nome}}'}</code> — nome completo<br/>
              <code style={{ background: '#e2e8f0', borderRadius: 3, padding: '1px 4px' }}>{'{{funcao}}'}</code> — função/cargo<br/>
              <code style={{ background: '#e2e8f0', borderRadius: 3, padding: '1px 4px' }}>{'{{data}}'}</code> — data de hoje<br/>
              <code style={{ background: '#e2e8f0', borderRadius: 3, padding: '1px 4px' }}>{'{{chapa}}'}</code> — nº da chapa<br/>
              <code style={{ background: '#fef9c3', borderRadius: 3, padding: '1px 4px', color: '#b45309', border: '1px solid #fde68a' }}>{'{{epis_funcao}}'}</code> — 🦺 <strong>tabela de EPIs da função</strong> (busca automática)
            </div>
          </div>
        </div>
      </div>

      {/* Coluna 2: Filtrar e selecionar */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Filtrar por</span>
              {(['todos', 'obra', 'funcao'] as const).map(tipo => (
                <button key={tipo} onClick={() => { setFiltroTipo(tipo); setFiltroValor('') }}
                  style={{ padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: filtroTipo === tipo ? '#1e3a5f' : '#e2e8f0',
                    color: filtroTipo === tipo ? '#fff' : '#374151' }}>
                  {tipo === 'todos' ? '🌐 Todos' : tipo === 'obra' ? '🏗️ Por Obra' : '🪪 Por Função'}
                </button>
              ))}

              {filtroTipo === 'obra' && (
                <select value={filtroValor} onChange={e => setFiltroValor(e.target.value)}
                  style={{ height: 34, borderRadius: 8, border: '1px solid #e2e8f0', padding: '0 12px', fontSize: 12 }}>
                  <option value="">Selecione a obra…</option>
                  {obras.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              )}
              {filtroTipo === 'funcao' && (
                <select value={filtroValor} onChange={e => setFiltroValor(e.target.value)}
                  style={{ height: 34, borderRadius: 8, border: '1px solid #e2e8f0', padding: '0 12px', fontSize: 12 }}>
                  <option value="">Selecione a função…</option>
                  {funcoes.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              )}

              <span style={{ marginLeft: 'auto', background: '#dbeafe', color: '#1d4ed8',
                borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                {colabsSel.length} selecionado(s)
              </span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
              {colabsFiltrados.map(c => (
                <div key={c.id} onClick={() => toggleColab(c.id)}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px',
                    borderRadius:8, border:`1px solid ${colabsSel.includes(c.id)?'#1e3a5f':'#e2e8f0'}`,
                    background:colabsSel.includes(c.id)?'#eff6ff':'#fff', cursor:'pointer' }}>
                  <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${colabsSel.includes(c.id)?'#1e3a5f':'#d1d5db'}`,
                    background:colabsSel.includes(c.id)?'#1e3a5f':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {colabsSel.includes(c.id) && <span style={{color:'#fff',fontSize:10}}>✓</span>}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{fontSize:12,fontWeight:600,color:'#0f172a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.nome}</div>
                    <div style={{fontSize:10,color:'#6b7280'}}>{c.chapa} · {c.funcao||'—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button onClick={gerarLote} disabled={gerando || colabsSel.length === 0 || !termoNome.trim()}
          style={{ height:48, borderRadius:10, border:'none',
            background:(gerando||colabsSel.length===0||!termoNome.trim())?'#94a3b8':'linear-gradient(135deg,#1e3a5f,#2d6a4f)',
            color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
          {gerando ? 'Gerando…' : <><Layers size={18}/> Gerar {colabsSel.length} via(s) — "{termoNome||'…'}"</>}
        </button>
      </div>
    </div>
  )
}

// ─── Componente Principal ─────────────────────────────────────────────────────
type DocForm = {
  colaborador_id: string; tipo: string; data: string
  descricao: string; documento_url: string; documento_nome: string
}
const EMPTY_FORM: DocForm = {
  colaborador_id: '', tipo: '', data: new Date().toISOString().slice(0, 10),
  descricao: '', documento_url: '', documento_nome: '',
}

// Abas disponíveis
type Aba = 'documentos' | 'contratacao' | 'lote'

export default function Documentos() {
  const { profile } = useProfile()
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [obras, setObras]         = useState<Obra[]>([])
  const [docs, setDocs]           = useState<DocEntry[]>([])
  const [loading, setLoading]     = useState(true)
  const [colabSel, setColabSel]   = useState<Colaborador | null>(null)
  const [busca, setBusca]         = useState('')
  const [tiposDoc, setTiposDoc]   = useState<string[]>(getTiposDoc())
  const [aba, setAba]             = useState<Aba>('documentos')
  const [docViewing, setDocViewing] = useState<DocEntry | null>(null)

  // modal novo documento
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm]     = useState<DocForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // delete
  const [deleteId, setDeleteId]         = useState<string | null>(null)
  const [deleteSource, setDeleteSource] = useState<DocEntry['source'] | null>(null)

  // ── fetch ──────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    setTiposDoc(getTiposDoc())

    const [
      { data: cols },
      { data: obrasData },
      { data: docsPes },
      { data: docsAvul },
      { data: atst },
      { data: acid },
      { data: advt },
    ] = await Promise.all([
      supabase.from('colaboradores').select('id,nome,chapa,status,funcao_id,obra_id').eq('status','ativo').order('nome'),
      supabase.from('obras').select('id,nome').order('nome'),
      supabase.from('documentos').select('id,colaborador_id,tipo,data_emissao,descricao,arquivo_url,arquivo_nome').order('data_emissao',{ascending:false}),
      supabase.from('documentos_avulsos').select('id,colaborador_id,tipo,data,descricao,documento_url,documento_nome').order('data',{ascending:false}),
      supabase.from('atestados').select('id,colaborador_id,data,data_inicio,tipo,descricao,documento_url,documento_nome').order('data_inicio',{ascending:false}),
      supabase.from('acidentes').select('id,colaborador_id,data_ocorrencia,tipo,descricao,documento_url,documento_nome').order('data_ocorrencia',{ascending:false}),
      supabase.from('advertencias').select('id,colaborador_id,data_advertencia,tipo,descricao,documento_url,documento_nome').order('data_advertencia',{ascending:false}),
    ])

    // Buscar funções para mapear funcao_id → nome
    const { data: funcoesData } = await supabase.from('funcoes').select('id,nome')
    const funcaoMap: Record<string, string> = {}
    for (const f of (funcoesData ?? []) as any[]) funcaoMap[f.id] = f.nome

    if (cols) setColaboradores((cols as any[]).map(c => ({ ...c, funcao: funcaoMap[c.funcao_id] ?? null })) as Colaborador[])
    if (obrasData) setObras(obrasData as Obra[])

    const entries: DocEntry[] = []
    for (const r of (docsPes ?? []) as any[])
      entries.push({ id:r.id, source:'documento', tipo:r.tipo??'Documento', colaborador_id:r.colaborador_id, data:r.data_emissao??'', descricao:r.descricao??'', documento_url:r.arquivo_url??'', documento_nome:r.arquivo_nome??'' })
    for (const r of (docsAvul ?? []) as any[])
      entries.push({ id:r.id, source:'avulso', tipo:r.tipo??'Outros', colaborador_id:r.colaborador_id, data:r.data??'', descricao:r.descricao??'', documento_url:r.documento_url??'', documento_nome:r.documento_nome??'' })
    for (const r of (atst ?? []) as any[])
      entries.push({ id:r.id, source:'atestado', tipo:'Atestado Médico', colaborador_id:r.colaborador_id, data:r.data_inicio??r.data??'', descricao:r.tipo??r.descricao??'', documento_url:r.documento_url??'', documento_nome:r.documento_nome??'' })
    for (const r of (acid ?? []) as any[])
      entries.push({ id:r.id, source:'acidente', tipo:'Comunicação de Acidente (CAT)', colaborador_id:r.colaborador_id, data:r.data_ocorrencia??'', descricao:r.descricao??'', documento_url:r.documento_url??'', documento_nome:r.documento_nome??'' })
    for (const r of (advt ?? []) as any[])
      entries.push({ id:r.id, source:'advertencia', tipo:'Advertência', colaborador_id:r.colaborador_id, data:r.data_advertencia??'', descricao:r.tipo??r.descricao??'', documento_url:r.documento_url??'', documento_nome:r.documento_nome??'' })

    entries.sort((a, b) => (b.data??'').localeCompare(a.data??''))
    setDocs(entries)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── filtros ────────────────────────────────────────────────────────────────
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  const colabsFiltrados = useMemo(() => {
    const q = norm(busca)
    return colaboradores.filter(c => !q || norm(c.nome).includes(q) || norm(c.chapa??'').includes(q))
  }, [colaboradores, busca])

  const docsColab = useMemo(() =>
    colabSel ? docs.filter(d => d.colaborador_id === colabSel.id) : [],
    [docs, colabSel])

  const countMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of docs) { if (d.colaborador_id) m[d.colaborador_id] = (m[d.colaborador_id]??0)+1 }
    return m
  }, [docs])

  const colabDoForm = useMemo(() =>
    colaboradores.find(c => c.id === form.colaborador_id) ?? null,
    [colaboradores, form.colaborador_id])

  // ── upload ─────────────────────────────────────────────────────────────────
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const res = await uploadDoc(file)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    if (res) setForm(p => ({ ...p, documento_url: res.url, documento_nome: res.nome }))
  }

  function handleClearFile() {
    setForm(p => ({ ...p, documento_url: '', documento_nome: '' }))
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── salvar ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.colaborador_id) return toast.error('Colaborador não identificado')
    if (!form.tipo)           return toast.error('Selecione o tipo')
    if (!form.data)           return toast.error('Data obrigatória')
    setSaving(true)
    const { error } = await supabase.from('documentos_avulsos').insert({
      colaborador_id: form.colaborador_id, tipo: form.tipo,
      data: form.data, descricao: form.descricao || null,
      documento_url: form.documento_url || null, documento_nome: form.documento_nome || null,
    })
    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success('✅ Documento salvo!')
    setModalOpen(false); setForm(EMPTY_FORM); fetchAll()
  }

  function openModal() {
    if (!colabSel) { toast.warning('Selecione um colaborador primeiro'); return }
    setForm({ ...EMPTY_FORM, colaborador_id: colabSel.id })
    setModalOpen(true)
  }

  function closeModal() { setModalOpen(false); setForm(EMPTY_FORM) }

  // ── deletar ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteId || !deleteSource) return
    const tableMap: Record<DocEntry['source'], string> = {
      documento:'documentos', avulso:'documentos_avulsos',
      atestado:'atestados', advertencia:'advertencias', acidente:'acidentes',
    }
    const { error } = await supabase.from(tableMap[deleteSource]).delete().eq('id', deleteId)
    setDeleteId(null); setDeleteSource(null)
    if (error) { toast.error('Erro ao excluir'); return }
    toast.success('Documento excluído!'); fetchAll()
  }

  const isAdmin = profile?.role === 'admin' || profile?.role === 'rh'

  // ── Tabs config ────────────────────────────────────────────────────────────
  const tabs: { id: Aba; label: string; icon: React.ReactNode }[] = [
    { id: 'documentos',  label: 'Documentos',         icon: <FileText size={14}/> },
    { id: 'contratacao', label: 'Kit de Contratação', icon: <ClipboardList size={14}/> },
    { id: 'lote',        label: 'Geração em Lote',    icon: <Layers size={14}/> },
  ]

  return (
    <div style={{ display:'flex', minHeight:'calc(100vh - 57px)', overflow:'hidden' }}>

      {/* ══ PAINEL ESQUERDO ══════════════════════════════════════════════════ */}
      {(aba === 'documentos') && (
        <div style={{ width:272, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ padding:'12px 12px 8px', background:'#1e3a5f', display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#fff' }}>📄 Documentos</div>
            <div style={{ position:'relative' }}>
              <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#9ca3af' }} />
              <input value={busca} onChange={e=>setBusca(e.target.value)}
                placeholder="Buscar colaborador…"
                style={{ width:'100%', height:33, border:'1px solid #334155', borderRadius:7,
                  paddingLeft:28, paddingRight:8, fontSize:12, background:'#0f172a', color:'#fff', boxSizing:'border-box' }} />
            </div>
            <div style={{ fontSize:11, color:'#94a3b8' }}>{colaboradores.length} colaborador(es) · {docs.length} doc(s)</div>
          </div>
          <div style={{ flex:1, overflowY:'auto' }}>
            {loading ? <LoadingSkeleton rows={6}/> : colabsFiltrados.length===0 ? (
              <div style={{padding:20,textAlign:'center',color:'#94a3b8',fontSize:12}}>Nenhum colaborador</div>
            ) : colabsFiltrados.map(c => {
              const qtd = countMap[c.id]??0
              const sel = colabSel?.id===c.id
              return (
                <div key={c.id} onClick={()=>setColabSel(sel?null:c)}
                  style={{ padding:'10px 12px', cursor:'pointer', borderBottom:'1px solid var(--border)',
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    background:sel?'hsl(var(--primary)/.08)':'transparent',
                    borderLeft:sel?'3px solid hsl(var(--primary))':'3px solid transparent' }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:sel?700:500, fontSize:13,
                      color:sel?'hsl(var(--primary))':'var(--foreground)',
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.nome}</div>
                    <div style={{ fontSize:11, color:'var(--muted-foreground)', marginTop:1 }}>{c.chapa}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                    {qtd>0 && (
                      <span style={{ background:sel?'hsl(var(--primary))':'#e2e8f0',
                        color:sel?'#fff':'#475569', borderRadius:20, padding:'1px 7px', fontSize:11, fontWeight:700 }}>{qtd}</span>
                    )}
                    <ChevronRight size={14} color={sel?'hsl(var(--primary))':'#94a3b8'} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══ PAINEL DIREITO ═══════════════════════════════════════════════════ */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Tabs */}
        <div style={{ padding:'0 16px', borderBottom:'1px solid var(--border)',
          background:'var(--card)', display:'flex', alignItems:'center', gap:0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={()=>{setAba(t.id); setDocViewing(null)}}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'13px 16px',
                border:'none', background:'none', cursor:'pointer', fontSize:13,
                fontWeight: aba===t.id ? 700 : 500,
                color: aba===t.id ? '#1e3a5f' : '#6b7280',
                borderBottom: aba===t.id ? '2px solid #1e3a5f' : '2px solid transparent',
                marginBottom:-1, transition:'all .15s' }}>
              {t.icon} {t.label}
            </button>
          ))}
          {aba==='documentos' && isAdmin && (
            <div style={{ marginLeft:'auto' }}>
              <Button size="sm" onClick={openModal} disabled={!colabSel}>
                <Plus size={14}/> Novo Documento
              </Button>
            </div>
          )}
        </div>

        {/* ── Aba Documentos ───────────────────────────────────────────── */}
        {aba === 'documentos' && (
          <>
            {/* Header do colaborador selecionado */}
            <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)',
              display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
              {colabSel ? (
                <>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{colabSel.nome}</div>
                    <div style={{ fontSize:12, color:'var(--muted-foreground)' }}>{colabSel.chapa} · {docsColab.length} documento(s)</div>
                  </div>
                  {docViewing && (
                    <button onClick={()=>setDocViewing(null)}
                      style={{ display:'flex', alignItems:'center', gap:6, background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:12 }}>
                      ← Voltar à lista
                    </button>
                  )}
                </>
              ) : (
                <div style={{ fontWeight:600, fontSize:14, color:'var(--muted-foreground)' }}>← Selecione um colaborador</div>
              )}
            </div>

            <div style={{ flex:1, overflowY:'auto' }}>
              {/* Visualizador de documento */}
              {docViewing ? (
                <DocViewer url={docViewing.documento_url} nome={docViewing.documento_nome || 'documento'} />
              ) : (
                <div style={{ padding:16 }}>
                  {!colabSel ? (
                    <EmptyState icon={<FileText size={32}/>} title="Selecione um colaborador"
                      description="Escolha um colaborador no painel à esquerda para ver seus documentos." />
                  ) : loading ? <LoadingSkeleton rows={4}/> : docsColab.length===0 ? (
                    <EmptyState icon={<FileText size={32}/>} title="Nenhum documento"
                      description={`${colabSel.nome} não possui documentos cadastrados.`}
                      action={isAdmin?(<Button size="sm" onClick={openModal}><Plus size={13}/> Novo Documento</Button>):undefined} />
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {docsColab.map(doc => (
                        <div key={`${doc.source}-${doc.id}`}
                          style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:10,
                            padding:'12px 16px', display:'flex', alignItems:'flex-start', gap:12 }}>
                          <div style={{ flexShrink:0, marginTop:2 }}><TipoBadge tipo={doc.tipo}/></div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, color:'var(--muted-foreground)', marginBottom:2 }}>{formatDate(doc.data)}</div>
                            {doc.descricao && (
                              <div style={{ fontSize:13, color:'var(--foreground)', marginBottom:4 }}>{doc.descricao}</div>
                            )}
                            {doc.documento_url ? (
                              <div style={{ display:'flex', gap:8 }}>
                                <a href={doc.documento_url} target="_blank" rel="noreferrer"
                                  style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12,
                                    color:'hsl(var(--primary))', textDecoration:'none' }}>
                                  <ExternalLink size={12}/> {doc.documento_nome||'Ver documento'}
                                </a>
                                <button onClick={()=>setDocViewing(doc)}
                                  style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:12,
                                    color:'#0369a1', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                                  <Eye size={12}/> Visualizar
                                </button>
                              </div>
                            ) : (
                              <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:'#94a3b8' }}>
                                <AlertCircle size={11}/> Sem arquivo anexado
                              </span>
                            )}
                          </div>
                          {isAdmin && (doc.source==='avulso'||doc.source==='documento') && (
                            <button onClick={()=>{setDeleteId(doc.id);setDeleteSource(doc.source)}}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'#ef4444', padding:4, flexShrink:0 }}>
                              <Trash2 size={15}/>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Abas Contratação e Lote ───────────────────────────────────── */}
        {(aba === 'contratacao' || aba === 'lote') && (
          <div style={{ flex:1, overflow:'hidden', padding:16 }}>
            {aba === 'contratacao' && <AbaContratacao colaboradores={colaboradores} obras={obras}/>}
            {aba === 'lote' && <AbaLote colaboradores={colaboradores} obras={obras}/>}
          </div>
        )}
      </div>

      {/* ══ MODAL NOVO DOCUMENTO ════════════════════════════════════════════ */}
      <Dialog open={modalOpen} onOpenChange={o=>{if(!o)closeModal()}}>
        <DialogContent>
          <DialogHeader><DialogTitle>📄 Novo Documento</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs font-semibold flex items-center gap-1.5 mb-1">
                <User size={12}/> Colaborador
                <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, fontWeight:700,
                  background:'#f1f5f9', color:'#64748b', borderRadius:5, padding:'1px 6px' }}>
                  <Lock size={8}/> fixo
                </span>
              </Label>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8,
                border:'1.5px solid #e2e8f0', background:'#f8fafc', cursor:'not-allowed' }}>
                <div style={{ width:30, height:30, borderRadius:7, background:'linear-gradient(135deg,#0d3f56,#0a3347)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'#fff', flexShrink:0 }}>
                  {colabDoForm?.nome.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase()??'?'}
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {colabDoForm?.nome??'—'}
                  </div>
                  <div style={{ fontSize:11, color:'#64748b' }}>{colabDoForm?.chapa??''}</div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Tipo *</Label>
                <Select value={form.tipo} onValueChange={v=>setForm(p=>({...p,tipo:v}))}>
                  <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Selecione…"/></SelectTrigger>
                  <SelectContent>{tiposDoc.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Data *</Label>
                <Input type="date" value={form.data} onChange={e=>setForm(p=>({...p,data:e.target.value}))} className="h-9 mt-1"/>
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Descrição</Label>
              <Textarea value={form.descricao} onChange={e=>setForm(p=>({...p,descricao:e.target.value}))}
                rows={2} placeholder="Observações…" className="mt-1 resize-none"/>
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1 block">Arquivo (PDF / imagem)</Label>
              <UploadArea uploading={uploading} fileName={form.documento_nome} fileUrl={form.documento_url}
                onFile={handleFile} onClear={handleClearFile} fileRef={fileRef as React.RefObject<HTMLInputElement>}/>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal} disabled={saving||uploading}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving||uploading}>{saving?'Salvando…':'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ CONFIRM DELETE ══════════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteId} onOpenChange={o=>{if(!o){setDeleteId(null);setDeleteSource(null)}}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
