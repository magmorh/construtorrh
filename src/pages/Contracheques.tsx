import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import {
  Receipt, Search, Plus, Trash2, ExternalLink,
  Copy, Eye, EyeOff, RefreshCw, User, Key, CheckCircle2,
  Upload, X, FileText,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────
type Colaborador = {
  id: string
  nome: string
  chapa: string
  cpf: string
  funcao: string
  tipo_contrato: string
  status: string
}

type Portal = {
  id: string
  colaborador_id: string
  login: string
  senha_hash: string
  ativo: boolean
  ultimo_acesso: string | null
  acesso_contracheque: boolean
}

type Contracheque = {
  id: string
  colaborador_id: string
  competencia: string
  tipo: string
  descricao: string | null
  arquivo_url: string | null
  arquivo_nome: string | null
  bruto: number | null
  liquido: number | null
  descontos: number | null
  inss: number | null
  fgts: number | null
  irrf: number | null
  publicado: boolean
  publicado_em: string | null
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function cpfSemPontuacao(cpf: string): string {
  return cpf.replace(/\D/g, '')
}

function defaultSenha(cpf: string, chapa: string): string {
  const cpfNum = cpfSemPontuacao(cpf)
  const ultimos4Cpf = cpfNum.slice(-4)
  const primeiros4Chapa = chapa.slice(0, 4)
  return ultimos4Cpf + primeiros4Chapa
}

function fmtCompetencia(dateStr: string): string {
  const [y, m] = dateStr.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[parseInt(m, 10) - 1]}/${y}`
}

function fmtMoeda(v: number | null): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const TIPO_LABEL: Record<string, string> = {
  mensal: 'Mensal',
  '13o_1a': '13º - 1ª Parcela',
  '13o_2a': '13º - 2ª Parcela',
  ferias: 'Férias',
  adiantamento: 'Adiantamento',
}

const BUCKET = 'ocorrencias-documentos'
const MAX_FILE = 10 * 1024 * 1024

async function uploadPdf(file: File): Promise<{ url: string; nome: string } | null> {
  if (file.size > MAX_FILE) { toast.error('Arquivo muito grande. Máximo 10 MB.'); return null }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
  const path = `holerites/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type })
  if (error) { toast.error('Erro no upload: ' + error.message); return null }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, nome: file.name }
}

// ─── Modal Adicionar Holerite ─────────────────────────────────────────────────
function ModalHolerite({
  open, onClose, colaboradorId, onSaved,
}: {
  open: boolean
  onClose: () => void
  colaboradorId: string
  onSaved: () => void
}) {
  const [competencia, setCompetencia] = useState('')
  const [tipo, setTipo] = useState('mensal')
  const [descricao, setDescricao] = useState('')
  const [bruto, setBruto] = useState('')
  const [descontos, setDescontos] = useState('')
  const [inss, setInss] = useState('')
  const [fgts, setFgts] = useState('')
  const [irrf, setIrrf] = useState('')
  const [liquido, setLiquido] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // auto-calcular liquido
  useEffect(() => {
    const b = parseFloat(bruto) || 0
    const d = parseFloat(descontos) || 0
    if (b > 0 || d > 0) setLiquido((b - d).toFixed(2))
  }, [bruto, descontos])

  async function salvar(publicar: boolean) {
    if (!competencia) { toast.error('Informe a competência.'); return }
    setSaving(true)
    try {
      let arquivoUrl: string | null = null
      let arquivoNome: string | null = null
      if (arquivo) {
        const up = await uploadPdf(arquivo)
        if (!up) { setSaving(false); return }
        arquivoUrl = up.url
        arquivoNome = up.nome
      }
      const payload = {
        colaborador_id: colaboradorId,
        competencia: competencia + '-01',
        tipo,
        descricao: descricao || null,
        arquivo_url: arquivoUrl,
        arquivo_nome: arquivoNome,
        bruto: bruto ? parseFloat(bruto) : null,
        liquido: liquido ? parseFloat(liquido) : null,
        descontos: descontos ? parseFloat(descontos) : null,
        inss: inss ? parseFloat(inss) : null,
        fgts: fgts ? parseFloat(fgts) : null,
        irrf: irrf ? parseFloat(irrf) : null,
        publicado: publicar,
        publicado_em: publicar ? new Date().toISOString() : null,
      }
      const { error } = await supabase.from('contracheques').insert(payload)
      if (error) throw error
      toast.success(publicar ? 'Holerite publicado!' : 'Holerite salvo como rascunho.')
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast.error('Erro ao salvar: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const inp: React.CSSProperties = {
    height: 36, borderRadius: 6, border: '1px solid #e2e8f0',
    padding: '0 10px', fontSize: 13, width: '100%', boxSizing: 'border-box',
  }
  const sel: React.CSSProperties = { ...inp, background: '#fff', cursor: 'pointer' }
  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }
  const row: React.CSSProperties = { display: 'flex', gap: 12 }
  const col: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column' }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
            <Receipt size={18} /> Adicionar Holerite
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
          {/* Competência + Tipo */}
          <div style={row}>
            <div style={col}>
              <span style={lbl}>Competência (mês/ano) *</span>
              <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} style={inp} />
            </div>
            <div style={col}>
              <span style={lbl}>Tipo</span>
              <select value={tipo} onChange={e => setTipo(e.target.value)} style={sel}>
                {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Valores */}
          <div style={row}>
            <div style={col}>
              <span style={lbl}>Salário Bruto (R$)</span>
              <input type="number" step="0.01" placeholder="0,00" value={bruto} onChange={e => setBruto(e.target.value)} style={inp} />
            </div>
            <div style={col}>
              <span style={lbl}>Total Descontos (R$)</span>
              <input type="number" step="0.01" placeholder="0,00" value={descontos} onChange={e => setDescontos(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={row}>
            <div style={col}>
              <span style={lbl}>INSS (R$)</span>
              <input type="number" step="0.01" placeholder="0,00" value={inss} onChange={e => setInss(e.target.value)} style={inp} />
            </div>
            <div style={col}>
              <span style={lbl}>FGTS (R$)</span>
              <input type="number" step="0.01" placeholder="0,00" value={fgts} onChange={e => setFgts(e.target.value)} style={inp} />
            </div>
            <div style={col}>
              <span style={lbl}>IRRF (R$)</span>
              <input type="number" step="0.01" placeholder="0,00" value={irrf} onChange={e => setIrrf(e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ ...col }}>
            <span style={lbl}>Salário Líquido (R$)</span>
            <input type="number" step="0.01" placeholder="Calculado automaticamente" value={liquido} onChange={e => setLiquido(e.target.value)} style={{ ...inp, background: '#f8fafc' }} />
          </div>

          {/* Descrição */}
          <div style={col}>
            <span style={lbl}>Descrição / Observação</span>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2}
              style={{ ...inp, height: 60, padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {/* Upload PDF */}
          <div style={col}>
            <span style={lbl}>Arquivo PDF (opcional)</span>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
              onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
            {arquivo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
                <FileText size={14} color="#16a34a" />
                <span style={{ fontSize: 12, color: '#16a34a', flex: 1 }}>{arquivo.name}</span>
                <button onClick={() => setArquivo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13, color: '#64748b' }}>
                <Upload size={14} /> Selecionar arquivo
              </button>
            )}
          </div>
        </div>

        <DialogFooter style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="outline" onClick={() => salvar(false)} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar Rascunho'}
          </Button>
          <Button onClick={() => salvar(true)} disabled={saving}
            style={{ background: '#0d3f56', color: '#fff' }}>
            {saving ? 'Publicando…' : 'Publicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Contracheques() {
  const { profile } = useProfile()
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [portais, setPortais] = useState<Portal[]>([])
  const [selected, setSelected] = useState<Colaborador | null>(null)
  const [contracheques, setContracheques] = useState<Contracheque[]>([])
  const [busca, setBusca] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingHolerites, setLoadingHolerites] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [criandoLogin, setCriandoLogin] = useState(false)
  const [resetandoSenha, setResetandoSenha] = useState(false)
  const [senhaVisivel, setSenhaVisivel] = useState(false)

  // ── Carregar colaboradores + portais ──────────────────────────────────────
  const carregarColaboradores = useCallback(async () => {
    setLoadingList(true)
    const { data } = await supabase
      .from('colaboradores')
      .select('id,nome,chapa,cpf,funcao,tipo_contrato,status')
      .eq('status', 'ativo')
      .order('nome')
    setColaboradores((data as Colaborador[]) ?? [])

    const { data: portData } = await supabase.from('colaboradores_portal').select('*')
    setPortais((portData as Portal[]) ?? [])
    setLoadingList(false)
  }, [])

  useEffect(() => { carregarColaboradores() }, [carregarColaboradores])

  // ── Carregar contracheques do colaborador selecionado ─────────────────────
  const carregarHolerites = useCallback(async (colaboradorId: string) => {
    setLoadingHolerites(true)
    const { data } = await supabase
      .from('contracheques')
      .select('*')
      .eq('colaborador_id', colaboradorId)
      .order('competencia', { ascending: false })
    setContracheques((data as Contracheque[]) ?? [])
    setLoadingHolerites(false)
  }, [])

  useEffect(() => {
    if (selected) carregarHolerites(selected.id)
    else setContracheques([])
  }, [selected, carregarHolerites])

  // ── Filtro de busca ───────────────────────────────────────────────────────
  const colabFiltrados = colaboradores.filter(c => {
    const q = busca.toLowerCase()
    return c.nome.toLowerCase().includes(q) || c.chapa.toLowerCase().includes(q)
  })

  const portalDoColab = selected ? portais.find(p => p.colaborador_id === selected.id) : null

  // ── Criar login ───────────────────────────────────────────────────────────
  async function criarLogin() {
    if (!selected) return
    setCriandoLogin(true)
    try {
      const login = cpfSemPontuacao(selected.cpf)
      const senha = defaultSenha(selected.cpf, selected.chapa)
      const hash = await sha256(senha)
      const { error } = await supabase.from('colaboradores_portal').insert({
        colaborador_id: selected.id,
        login,
        senha_hash: hash,
        ativo: true,
        acesso_contracheque: true,
      })
      if (error) throw error
      toast.success('Login criado! CPF: ' + login + ' / Senha: ' + senha)
      await carregarColaboradores()
    } catch (e: unknown) {
      toast.error('Erro: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCriandoLogin(false)
    }
  }

  // ── Redefinir senha ───────────────────────────────────────────────────────
  async function redefinirSenha() {
    if (!selected || !portalDoColab) return
    setResetandoSenha(true)
    try {
      const senha = defaultSenha(selected.cpf, selected.chapa)
      const hash = await sha256(senha)
      const { error } = await supabase.from('colaboradores_portal').update({ senha_hash: hash }).eq('id', portalDoColab.id)
      if (error) throw error
      toast.success('Senha redefinida para: ' + senha)
    } catch (e: unknown) {
      toast.error('Erro: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setResetandoSenha(false)
    }
  }

  // ── Copiar credenciais ────────────────────────────────────────────────────
  function copiarCredenciais() {
    if (!selected || !portalDoColab) return
    const senha = defaultSenha(selected.cpf, selected.chapa)
    const txt = `Login: ${portalDoColab.login}\nSenha: ${senha}`
    navigator.clipboard.writeText(txt).then(() => toast.success('Credenciais copiadas!'))
  }

  // ── Publicar / despublicar ────────────────────────────────────────────────
  async function togglePublicar(h: Contracheque) {
    const novoStatus = !h.publicado
    const { error } = await supabase.from('contracheques').update({
      publicado: novoStatus,
      publicado_em: novoStatus ? new Date().toISOString() : null,
    }).eq('id', h.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(novoStatus ? 'Holerite publicado!' : 'Holerite despublicado.')
    if (selected) carregarHolerites(selected.id)
  }

  // ── Deletar ───────────────────────────────────────────────────────────────
  async function deletar() {
    if (!deleteId) return
    const { error } = await supabase.from('contracheques').delete().eq('id', deleteId)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success('Holerite removido.')
    setDeleteId(null)
    if (selected) carregarHolerites(selected.id)
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  const SIDEBAR_W = 280

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden', background: '#f8fafc' }}>

      {/* ── Painel Esquerdo ── */}
      <div style={{
        width: SIDEBAR_W, minWidth: SIDEBAR_W, borderRight: '1px solid #e2e8f0',
        background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Receipt size={18} color="#0d3f56" />
            <span style={{ fontWeight: 700, fontSize: 15, color: '#0d3f56' }}>Contracheques</span>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar colaborador..."
              style={{
                width: '100%', boxSizing: 'border-box', height: 36,
                paddingLeft: 32, paddingRight: 10, borderRadius: 8,
                border: '1px solid #e2e8f0', fontSize: 13, color: '#334155', outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingList ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando…</div>
          ) : colabFiltrados.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum colaborador encontrado.</div>
          ) : colabFiltrados.map(c => {
            const temPortal = portais.some(p => p.colaborador_id === c.id)
            const isSelected = selected?.id === c.id
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 16px',
                  background: isSelected ? '#eff6ff' : 'transparent',
                  borderLeft: isSelected ? '3px solid #0d3f56' : '3px solid transparent',
                  border: 'none', cursor: 'pointer', transition: 'background 0.15s',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: isSelected ? '#0d3f56' : '#1e293b' }}>
                    {c.nome}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 10,
                    background: temPortal ? '#dcfce7' : '#f1f5f9',
                    color: temPortal ? '#16a34a' : '#94a3b8',
                  }}>
                    {temPortal ? '✓ Portal' : 'Sem acesso'}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: '#64748b' }}>{c.chapa} · {c.funcao || '—'}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Painel Direito ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#94a3b8' }}>
            <Receipt size={48} strokeWidth={1} />
            <span style={{ fontSize: 15, fontWeight: 500 }}>Selecione um colaborador</span>
            <span style={{ fontSize: 13 }}>para gerenciar holerites e acesso ao portal</span>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

            {/* Header colaborador */}
            <div style={{
              background: '#fff', borderRadius: 12, padding: '20px 24px',
              border: '1px solid #e2e8f0', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: '#0d3f56',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <User size={22} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 17, color: '#0f172a' }}>{selected.nome}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                    background: selected.tipo_contrato === 'clt' ? '#dbeafe' : '#fef9c3',
                    color: selected.tipo_contrato === 'clt' ? '#1d4ed8' : '#854d0e',
                    textTransform: 'uppercase',
                  }}>
                    {selected.tipo_contrato || 'CLT'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                  Chapa: <strong>{selected.chapa}</strong> · {selected.funcao || '—'}
                </div>
              </div>
            </div>

            {/* Seção Acesso ao Portal */}
            <div style={{
              background: '#fff', borderRadius: 12, padding: '20px 24px',
              border: '1px solid #e2e8f0', marginBottom: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Key size={16} color="#0d3f56" />
                <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Acesso ao Portal</span>
              </div>

              {!portalDoColab ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{
                    padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: 8, fontSize: 13, color: '#dc2626', flex: 1,
                  }}>
                    Este colaborador ainda não possui acesso ao portal de holerites.
                  </div>
                  <Button
                    onClick={criarLogin}
                    disabled={criandoLogin}
                    style={{ background: '#0d3f56', color: '#fff', whiteSpace: 'nowrap' }}
                  >
                    {criandoLogin ? 'Criando…' : '+ Criar Login'}
                  </Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0',
                    borderRadius: 8,
                  }}>
                    <CheckCircle2 size={16} color="#16a34a" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>Acesso ativo</div>
                      <div style={{ fontSize: 12, color: '#16a34a' }}>
                        Login: <strong>{portalDoColab.login}</strong>
                        {portalDoColab.ultimo_acesso && (
                          <span style={{ marginLeft: 12, fontWeight: 400 }}>
                            Último acesso: {new Date(portalDoColab.ultimo_acesso).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="sm" variant="outline"
                        onClick={copiarCredenciais}
                        style={{ fontSize: 12, gap: 6 }}
                      >
                        <Copy size={12} /> Copiar credenciais
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        onClick={redefinirSenha}
                        disabled={resetandoSenha}
                        style={{ fontSize: 12, gap: 6 }}
                      >
                        <RefreshCw size={12} /> {resetandoSenha ? '…' : 'Redefinir Senha'}
                      </Button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', padding: '0 4px' }}>
                    Senha padrão: últimos 4 dígitos do CPF + primeiros 4 do chapa.
                    URL do portal: <strong>/portal/contracheque</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Seção Holerites */}
            <div style={{
              background: '#fff', borderRadius: 12, padding: '20px 24px',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Receipt size={16} color="#0d3f56" />
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Holerites</span>
                  <span style={{
                    fontSize: 11, background: '#e2e8f0', color: '#475569',
                    padding: '2px 7px', borderRadius: 10, fontWeight: 600,
                  }}>{contracheques.length}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setModalOpen(true)}
                  style={{ background: '#0d3f56', color: '#fff', fontSize: 13, gap: 6 }}
                >
                  <Plus size={14} /> Adicionar Holerite
                </Button>
              </div>

              {loadingHolerites ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando…</div>
              ) : contracheques.length === 0 ? (
                <div style={{
                  padding: 40, textAlign: 'center', color: '#94a3b8',
                  border: '2px dashed #e2e8f0', borderRadius: 10,
                }}>
                  <Receipt size={32} strokeWidth={1} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 14 }}>Nenhum holerite cadastrado</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Clique em "+ Adicionar Holerite" para começar.</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                        {['Competência','Tipo','Bruto','Líquido','Status','Ações'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contracheques.map(h => (
                        <tr key={h.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td style={{ padding: '10px', fontWeight: 600, color: '#0f172a' }}>
                            {fmtCompetencia(h.competencia)}
                          </td>
                          <td style={{ padding: '10px', color: '#475569' }}>
                            {TIPO_LABEL[h.tipo] ?? h.tipo}
                          </td>
                          <td style={{ padding: '10px', color: '#0f172a' }}>{fmtMoeda(h.bruto)}</td>
                          <td style={{ padding: '10px', color: '#16a34a', fontWeight: 600 }}>{fmtMoeda(h.liquido)}</td>
                          <td style={{ padding: '10px' }}>
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10,
                              background: h.publicado ? '#dcfce7' : '#fef9c3',
                              color: h.publicado ? '#15803d' : '#854d0e',
                            }}>
                              {h.publicado ? '✓ Publicado' : 'Rascunho'}
                            </span>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => togglePublicar(h)}
                                title={h.publicado ? 'Despublicar' : 'Publicar'}
                                style={{
                                  padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
                                  background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                                  fontSize: 11, color: h.publicado ? '#dc2626' : '#16a34a', fontWeight: 600,
                                }}
                              >
                                {h.publicado ? <EyeOff size={12} /> : <Eye size={12} />}
                                {h.publicado ? 'Tirar' : 'Publicar'}
                              </button>
                              {h.arquivo_url && (
                                <a href={h.arquivo_url} target="_blank" rel="noreferrer"
                                  style={{
                                    padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
                                    background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    textDecoration: 'none', color: '#0d3f56',
                                  }}>
                                  <ExternalLink size={12} />
                                </a>
                              )}
                              <button
                                onClick={() => setDeleteId(h.id)}
                                style={{
                                  padding: '4px 8px', borderRadius: 6, border: '1px solid #fee2e2',
                                  background: '#fff1f2', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                  color: '#dc2626',
                                }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modais ── */}
      {selected && (
        <ModalHolerite
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          colaboradorId={selected.id}
          onSaved={() => carregarHolerites(selected.id)}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={v => { if (!v) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Este holerite será removido permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deletar} style={{ background: '#dc2626', color: '#fff' }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
