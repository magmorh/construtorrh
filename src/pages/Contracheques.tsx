import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import {
  Receipt, Search, Plus, Trash2, ExternalLink, Copy,
  Eye, EyeOff, RefreshCw, User, Key, CheckCircle2,
  Upload, X, FileText, Sparkles, Loader2, Info,
  TrendingUp, TrendingDown, Wallet, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────────────
type Colaborador = {
  id: string; nome: string; chapa: string; cpf: string
  funcao: string; funcao_id: string | null; tipo_contrato: string; status: string; salario: number | null
}

type Portal = {
  id: string; colaborador_id: string; login: string
  senha_hash: string; ativo: boolean; ultimo_acesso: string | null
  must_change_password: boolean
}

type Contracheque = {
  id: string; colaborador_id: string; competencia: string; tipo: string
  descricao: string | null; arquivo_url: string | null; arquivo_nome: string | null
  bruto: number | null; liquido: number | null; descontos: number | null
  inss: number | null; fgts: number | null; irrf: number | null
  // novos campos detalhados
  salario_base: number | null; horas_normais: number | null; horas_extras: number | null
  valor_producao: number | null; valor_dsr: number | null; valor_premio: number | null
  desconto_vt: number | null; desconto_adiant: number | null; cesta_basica: number | null
  funcao: string | null; tipo_contrato_snap: string | null; obra_nome: string | null
  dias_trabalhados: number | null; faltas: number | null
  gerado_do_sistema: boolean
  publicado: boolean; publicado_em: string | null; created_at: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────
async function sha256(msg: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
const cpfClean = (v: string) => v.replace(/\D/g, '')

function fmtComp(d: string) {
  const [y, m] = d.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[parseInt(m) - 1]}/${y}`
}
function fmtMoeda(v: number | null) {
  if (v == null || v === 0) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const TIPO_LABEL: Record<string, string> = {
  mensal: 'Mensal', '13o_1a': '13º - 1ª Parcela',
  '13o_2a': '13º - 2ª Parcela', ferias: 'Férias', adiantamento: 'Adiantamento',
}
const BUCKET = 'ocorrencias-documentos'

async function uploadPdf(file: File) {
  if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo > 10 MB.'); return null }
  const path = `holerites/${Date.now()}_${Math.random().toString(36).slice(2)}.${file.name.split('.').pop()}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type })
  if (error) { toast.error('Upload: ' + error.message); return null }
  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, nome: file.name }
}

// ─── Modal Adicionar/Gerar Holerite ─────────────────────────────────────────
function ModalHolerite({ open, onClose, colaborador, onSaved }: {
  open: boolean; onClose: () => void
  colaborador: Colaborador; onSaved: () => void
}) {
  const [competencia, setCompetencia] = useState('')
  const [tipo, setTipo]               = useState('mensal')
  const [descricao, setDescricao]     = useState('')
  const [arquivo, setArquivo]         = useState<File | null>(null)
  const [saving, setSaving]           = useState(false)
  const [buscando, setBuscando]       = useState(false)
  const [sistemaInfo, setSistemaInfo] = useState<string | null>(null)
  const [expandDetalhes, setExpandDetalhes] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Campos financeiros
  const [salarioBase, setSalarioBase]     = useState('')
  const [horasNormais, setHorasNormais]   = useState('')
  const [horasExtras, setHorasExtras]     = useState('')
  const [valorProducao, setValorProducao] = useState('')
  const [valorDsr, setValorDsr]           = useState('')
  const [valorPremio, setValorPremio]     = useState('')
  const [bruto, setBruto]                 = useState('')
  const [inss, setInss]                   = useState('')
  const [irrf, setIrrf]                   = useState('')
  const [fgts, setFgts]                   = useState('')
  const [descontoVt, setDescontoVt]       = useState('')
  const [descontoAdiant, setDescontoAdiant] = useState('')
  const [cestaBasica, setCestaBasica]     = useState('')
  const [descontos, setDescontos]         = useState('')
  const [liquido, setLiquido]             = useState('')
  const [obraNome, setObraNome]           = useState('')
  const [funcao, setFuncao]               = useState('')
  const [diasTrab, setDiasTrab]           = useState('')
  const [faltas, setFaltas]               = useState('')
  const [geradoDoSistema, setGeradoDoSistema] = useState(false)
  const [lancamentoId, setLancamentoId]   = useState<string | null>(null)

  // Auto-calcular bruto e líquido
  useEffect(() => {
    const base   = parseFloat(salarioBase)   || 0
    const prod   = parseFloat(valorProducao) || 0
    const dsr    = parseFloat(valorDsr)      || 0
    const premio = parseFloat(valorPremio)   || 0
    const total  = base + prod + dsr + premio
    if (total > 0) setBruto(total.toFixed(2))
  }, [salarioBase, valorProducao, valorDsr, valorPremio])

  useEffect(() => {
    const b    = parseFloat(bruto)         || 0
    const i    = parseFloat(inss)          || 0
    const ir   = parseFloat(irrf)          || 0
    const vt   = parseFloat(descontoVt)    || 0
    const ad   = parseFloat(descontoAdiant)|| 0
    const desc = i + ir + vt + ad
    if (desc > 0) setDescontos(desc.toFixed(2))
    if (b > 0)    setLiquido(Math.max(0, b - desc).toFixed(2))
  }, [bruto, inss, irrf, descontoVt, descontoAdiant])

  // ── Gerar do Sistema ──────────────────────────────────────────────────────
  async function gerarDoSistema() {
    if (!competencia) { toast.error('Selecione a competência primeiro.'); return }
    setBuscando(true); setSistemaInfo(null)

    try {
      const mesRef = competencia  // YYYY-MM

      // 1 – Dados do colaborador
      const { data: colab } = await supabase
        .from('colaboradores')
        .select('salario_base, funcao_id, tipo_contrato, data_admissao, funcoes(nome)')
        .eq('id', colaborador.id)
        .single()
      // normaliza campos
      if (colab) {
        ;(colab as any).salario = (colab as any).salario_base ?? null
        ;(colab as any).funcao  = (colab as any).funcoes?.nome ?? colaborador.funcao ?? '—'
      }

      // 2 – Lançamento de ponto (snapshot)
      const { data: lancs } = await supabase
        .from('ponto_lancamentos')
        .select(`id, mes_referencia, snap_valor_horas, snap_horas_normais, snap_horas_extras,
          snap_valor_producao, snap_valor_dsr, snap_valor_premio, snap_valor_total,
          snap_faltas, snap_desconto_vt, snap_desconto_adiant, snap_inss, snap_ir,
          snap_liquido, obras(nome)`)
        .eq('colaborador_id', colaborador.id)
        .eq('mes_referencia', mesRef)
        .in('status', ['aprovado', 'liberado', 'pago'])
        .order('created_at', { ascending: false })

      // 3 – Prêmios do mês
      const { data: premios } = await supabase
        .from('premios')
        .select('valor')
        .eq('colaborador_id', colaborador.id)
        .eq('competencia', mesRef)
        .in('status', ['aprovado', 'pago'])

      // 4 – Adiantamentos descontados no mês
      const { data: adiantamentos } = await supabase
        .from('adiantamentos')
        .select('valor')
        .eq('colaborador_id', colaborador.id)
        .eq('descontado_em', mesRef)
        .in('status', ['pago'])

      const totalPremios = (premios ?? []).reduce((s: number, p: any) => s + (p.valor || 0), 0)
      const totalAdiant  = (adiantamentos ?? []).reduce((s: number, a: any) => s + (a.valor || 0), 0)

      if (lancs && lancs.length > 0) {
        // Pode haver mais de um lançamento (ex: duas obras no mês) — somar
        let sumHorNorm = 0, sumHorExt = 0, sumValHoras = 0, sumProd = 0
        let sumDsr = 0, sumPremio = 0, sumTotal = 0
        let sumFaltas = 0, sumVt = 0, sumAdLanc = 0, sumInss = 0, sumIr = 0
        const obras: string[] = []

        for (const l of lancs as any[]) {
          sumHorNorm  += l.snap_horas_normais  ?? 0
          sumHorExt   += l.snap_horas_extras   ?? 0
          sumValHoras += l.snap_valor_horas    ?? 0
          sumProd     += l.snap_valor_producao ?? 0
          sumDsr      += l.snap_valor_dsr      ?? 0
          sumPremio   += l.snap_valor_premio   ?? 0
          sumTotal    += l.snap_valor_total    ?? 0
          sumFaltas   += l.snap_faltas         ?? 0
          sumVt       += l.snap_desconto_vt    ?? 0
          sumAdLanc   += l.snap_desconto_adiant?? 0
          sumInss     += l.snap_inss           ?? 0
          sumIr       += l.snap_ir             ?? 0
          if (l.obras?.nome) obras.push(l.obras.nome)
        }

        // Prêmios avulsos + do lançamento
        const totalPremioCombinado = sumPremio + totalPremios

        setHorasNormais(sumHorNorm > 0  ? sumHorNorm.toFixed(2)  : '')
        setHorasExtras(sumHorExt > 0    ? sumHorExt.toFixed(2)   : '')
        setSalarioBase(sumValHoras > 0  ? sumValHoras.toFixed(2) : (colab?.salario ? colab.salario.toFixed(2) : ''))
        setValorProducao(sumProd > 0    ? sumProd.toFixed(2)     : '')
        setValorDsr(sumDsr > 0          ? sumDsr.toFixed(2)      : '')
        setValorPremio(totalPremioCombinado > 0 ? totalPremioCombinado.toFixed(2) : '')
        setInss(sumInss > 0             ? sumInss.toFixed(2)     : '')
        setIrrf(sumIr > 0               ? sumIr.toFixed(2)       : '')
        setDescontoVt(sumVt > 0         ? sumVt.toFixed(2)       : '')
        const adTotal = Math.max(sumAdLanc, totalAdiant)
        setDescontoAdiant(adTotal > 0   ? adTotal.toFixed(2)     : '')
        setObraNome(obras.join(' / '))
        setFuncao(colab?.funcao ?? colaborador.funcao ?? '')
        setDiasTrab('')
        setFaltas(sumFaltas > 0         ? String(sumFaltas)      : '')
        setLancamentoId(lancs[0]?.id ?? null)
        setGeradoDoSistema(true)

        const info = `✅ ${lancs.length} lançamento(s) encontrado(s).${totalPremios > 0 ? ` • ${(premios ?? []).length} prêmio(s) adicionado(s).` : ''}${totalAdiant > 0 ? ` • ${(adiantamentos ?? []).length} adiantamento(s) descontado(s).` : ''}`
        setSistemaInfo(info)
        setExpandDetalhes(true)
        toast.success('Dados importados do sistema!')
      } else {
        // Sem lançamento aprovado — usar salário base do cadastro
        if (colab?.salario) {
          setSalarioBase(colab.salario.toFixed(2))
          setBruto(colab.salario.toFixed(2))
        }
        if (totalPremios > 0) setValorPremio(totalPremios.toFixed(2))
        if (totalAdiant > 0)  setDescontoAdiant(totalAdiant.toFixed(2))
        setFuncao(colab?.funcao ?? colaborador.funcao ?? '')
        setGeradoDoSistema(true)
        setSistemaInfo('⚠️ Nenhum lançamento de ponto aprovado. Usando salário base do cadastro.')
        toast('Nenhum ponto aprovado. Salário base preenchido.', { icon: '⚠️' })
      }
    } catch (e) {
      toast.error('Erro ao buscar dados: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBuscando(false)
    }
  }

  // ── Calcular FGTS automaticamente (8% do bruto) ──────────────────────────
  useEffect(() => {
    const b = parseFloat(bruto) || 0
    if (b > 0 && !fgts) setFgts((b * 0.08).toFixed(2))
  }, [bruto])

  // ── Salvar ────────────────────────────────────────────────────────────────
  async function salvar(publicar: boolean) {
    if (!competencia) { toast.error('Informe a competência.'); return }
    setSaving(true)
    try {
      let arquivoUrl: string | null = null
      let arquivoNome: string | null = null
      if (arquivo) {
        const up = await uploadPdf(arquivo)
        if (!up) { setSaving(false); return }
        arquivoUrl = up.url; arquivoNome = up.nome
      }

      const parseFlt = (v: string) => v ? parseFloat(v) : null
      const parseInt2 = (v: string) => v ? parseInt(v) : null

      const payload = {
        colaborador_id:    colaborador.id,
        competencia:       competencia + '-01',
        tipo,
        descricao:         descricao || null,
        arquivo_url:       arquivoUrl,
        arquivo_nome:      arquivoNome,
        bruto:             parseFlt(bruto),
        liquido:           parseFlt(liquido),
        descontos:         parseFlt(descontos),
        inss:              parseFlt(inss),
        fgts:              parseFlt(fgts),
        irrf:              parseFlt(irrf),
        // novos campos
        salario_base:      parseFlt(salarioBase),
        horas_normais:     parseFlt(horasNormais),
        horas_extras:      parseFlt(horasExtras),
        valor_producao:    parseFlt(valorProducao),
        valor_dsr:         parseFlt(valorDsr),
        valor_premio:      parseFlt(valorPremio),
        desconto_vt:       parseFlt(descontoVt),
        desconto_adiant:   parseFlt(descontoAdiant),
        cesta_basica:      parseFlt(cestaBasica),
        funcao:            funcao || null,
        tipo_contrato_snap:colaborador.tipo_contrato || null,
        obra_nome:         obraNome || null,
        dias_trabalhados:  parseInt2(diasTrab),
        faltas:            parseInt2(faltas),
        lancamento_id:     lancamentoId,
        gerado_do_sistema: geradoDoSistema,
        publicado:         publicar,
        publicado_em:      publicar ? new Date().toISOString() : null,
      }

      const { error } = await supabase.from('contracheques').insert(payload)
      if (error) throw error
      toast.success(publicar ? '✅ Holerite publicado!' : 'Rascunho salvo.')
      onSaved(); onClose()
    } catch (e: unknown) {
      toast.error('Erro: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setSaving(false) }
  }

  // ── Estilos ────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    height: 34, borderRadius: 6, border: '1px solid #e2e8f0',
    padding: '0 10px', fontSize: 13, width: '100%', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 3 }
  const row: React.CSSProperties = { display: 'flex', gap: 10 }
  const col: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column' }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent style={{ maxWidth: 620, maxHeight: '92vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
            <Receipt size={18} color="#0d3f56" />
            Adicionar Holerite — {colaborador.nome.split(' ')[0]}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '2px 0' }}>

          {/* Competência + Tipo */}
          <div style={row}>
            <div style={col}>
              <span style={lbl}>Competência *</span>
              <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)} style={inp} />
            </div>
            <div style={col}>
              <span style={lbl}>Tipo</span>
              <select value={tipo} onChange={e => setTipo(e.target.value)}
                style={{ ...inp, background: '#fff', cursor: 'pointer' }}>
                {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* Botão Gerar do Sistema */}
          <button
            onClick={gerarDoSistema}
            disabled={buscando || !competencia}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 16px', borderRadius: 8, border: 'none', cursor: competencia ? 'pointer' : 'not-allowed',
              background: competencia ? 'linear-gradient(135deg, #0d3f56, #1e5c7a)' : '#e2e8f0',
              color: competencia ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 14,
              transition: 'all .2s',
            }}
          >
            {buscando
              ? <><Loader2 size={16} className="animate-spin" /> Buscando dados…</>
              : <><Sparkles size={16} /> 🔄 Gerar do Sistema (Ponto + Prêmios + Descontos)</>
            }
          </button>

          {sistemaInfo && (
            <div style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: sistemaInfo.startsWith('✅') ? '#f0fdf4' : '#fefce8',
              border: `1px solid ${sistemaInfo.startsWith('✅') ? '#bbf7d0' : '#fde68a'}`,
              color: sistemaInfo.startsWith('✅') ? '#15803d' : '#92400e',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Info size={13} /> {sistemaInfo}
            </div>
          )}

          {/* Seção Proventos */}
          <div style={{ borderTop: '2px solid #f1f5f9', paddingTop: 10 }}>
            <button
              onClick={() => setExpandDetalhes(e => !e)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'none',
                border: 'none', cursor: 'pointer', padding: '0 0 8px',
                fontSize: 13, fontWeight: 700, color: '#0d3f56',
              }}
            >
              <TrendingUp size={14} color="#16a34a" />
              PROVENTOS
              {expandDetalhes ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>

            {expandDetalhes && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={row}>
                  <div style={col}>
                    <span style={lbl}>Salário / Valor Horas (R$)</span>
                    <input type="number" step="0.01" value={salarioBase} onChange={e => setSalarioBase(e.target.value)} style={inp} placeholder="0,00" />
                  </div>
                  <div style={col}>
                    <span style={lbl}>Produção (R$)</span>
                    <input type="number" step="0.01" value={valorProducao} onChange={e => setValorProducao(e.target.value)} style={inp} placeholder="0,00" />
                  </div>
                </div>
                <div style={row}>
                  <div style={col}>
                    <span style={lbl}>DSR (R$)</span>
                    <input type="number" step="0.01" value={valorDsr} onChange={e => setValorDsr(e.target.value)} style={inp} placeholder="0,00" />
                  </div>
                  <div style={col}>
                    <span style={lbl}>Prêmios (R$)</span>
                    <input type="number" step="0.01" value={valorPremio} onChange={e => setValorPremio(e.target.value)} style={inp} placeholder="0,00" />
                  </div>
                </div>
                <div style={row}>
                  <div style={col}>
                    <span style={lbl}>Horas Normais</span>
                    <input type="number" step="0.01" value={horasNormais} onChange={e => setHorasNormais(e.target.value)} style={inp} placeholder="0" />
                  </div>
                  <div style={col}>
                    <span style={lbl}>Horas Extras</span>
                    <input type="number" step="0.01" value={horasExtras} onChange={e => setHorasExtras(e.target.value)} style={inp} placeholder="0" />
                  </div>
                  <div style={col}>
                    <span style={lbl}>Dias Trabalhados</span>
                    <input type="number" value={diasTrab} onChange={e => setDiasTrab(e.target.value)} style={inp} placeholder="0" />
                  </div>
                  <div style={col}>
                    <span style={lbl}>Faltas</span>
                    <input type="number" value={faltas} onChange={e => setFaltas(e.target.value)} style={inp} placeholder="0" />
                  </div>
                </div>
                <div style={row}>
                  <div style={col}>
                    <span style={lbl}>Função</span>
                    <input type="text" value={funcao} onChange={e => setFuncao(e.target.value)} style={inp} placeholder="Pedreiro, Servente…" />
                  </div>
                  <div style={col}>
                    <span style={lbl}>Obra</span>
                    <input type="text" value={obraNome} onChange={e => setObraNome(e.target.value)} style={inp} placeholder="Nome da obra" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Totais Bruto */}
          <div style={row}>
            <div style={col}>
              <span style={{ ...lbl, color: '#15803d', fontWeight: 700 }}>TOTAL BRUTO (R$)</span>
              <input type="number" step="0.01" value={bruto} onChange={e => setBruto(e.target.value)}
                style={{ ...inp, background: '#f0fdf4', border: '1.5px solid #86efac', fontWeight: 700, color: '#15803d' }}
                placeholder="Calculado automaticamente" />
            </div>
          </div>

          {/* Seção Descontos */}
          <div style={{ borderTop: '2px solid #f1f5f9', paddingTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <TrendingDown size={14} color="#dc2626" />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>DESCONTOS</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={row}>
                <div style={col}>
                  <span style={lbl}>INSS (R$)</span>
                  <input type="number" step="0.01" value={inss} onChange={e => setInss(e.target.value)} style={inp} placeholder="0,00" />
                </div>
                <div style={col}>
                  <span style={lbl}>IRRF (R$)</span>
                  <input type="number" step="0.01" value={irrf} onChange={e => setIrrf(e.target.value)} style={inp} placeholder="0,00" />
                </div>
                <div style={col}>
                  <span style={lbl}>FGTS — info (R$)</span>
                  <input type="number" step="0.01" value={fgts} onChange={e => setFgts(e.target.value)} style={inp} placeholder="0,00" />
                </div>
              </div>
              <div style={row}>
                <div style={col}>
                  <span style={lbl}>Vale Transporte (R$)</span>
                  <input type="number" step="0.01" value={descontoVt} onChange={e => setDescontoVt(e.target.value)} style={inp} placeholder="0,00" />
                </div>
                <div style={col}>
                  <span style={lbl}>Adiantamento (R$)</span>
                  <input type="number" step="0.01" value={descontoAdiant} onChange={e => setDescontoAdiant(e.target.value)} style={inp} placeholder="0,00" />
                </div>
                <div style={col}>
                  <span style={lbl}>Cesta Básica (R$)</span>
                  <input type="number" step="0.01" value={cestaBasica} onChange={e => setCestaBasica(e.target.value)} style={inp} placeholder="0,00" />
                </div>
              </div>
            </div>
          </div>

          {/* Totais */}
          <div style={row}>
            <div style={col}>
              <span style={{ ...lbl, color: '#dc2626', fontWeight: 700 }}>TOTAL DESCONTOS (R$)</span>
              <input type="number" step="0.01" value={descontos} onChange={e => setDescontos(e.target.value)}
                style={{ ...inp, background: '#fff1f2', border: '1.5px solid #fca5a5', color: '#dc2626', fontWeight: 700 }}
                placeholder="Calculado automaticamente" />
            </div>
            <div style={col}>
              <span style={{ ...lbl, color: '#0d3f56', fontWeight: 700, fontSize: 13 }}>💰 LÍQUIDO A RECEBER (R$)</span>
              <input type="number" step="0.01" value={liquido} onChange={e => setLiquido(e.target.value)}
                style={{ ...inp, height: 38, background: '#eff6ff', border: '2px solid #3b82f6', color: '#1d4ed8', fontWeight: 800, fontSize: 15 }}
                placeholder="Calculado automaticamente" />
            </div>
          </div>

          {/* Descrição */}
          <div style={col}>
            <span style={lbl}>Observação</span>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2}
              style={{ ...inp, height: 52, padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit' }} />
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
                <Upload size={14} /> Anexar PDF
              </button>
            )}
          </div>
        </div>

        <DialogFooter style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="outline" onClick={() => salvar(false)} disabled={saving}>
            {saving ? 'Salvando…' : 'Rascunho'}
          </Button>
          <Button onClick={() => salvar(true)} disabled={saving}
            style={{ background: '#0d3f56', color: '#fff', gap: 6 }}>
            {saving ? <><Loader2 size={14} className="animate-spin"/>Publicando…</> : <><Eye size={14}/>Publicar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function Contracheques() {
  useProfile()
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [portais, setPortais]             = useState<Portal[]>([])
  const [selected, setSelected]           = useState<Colaborador | null>(null)
  const [contracheques, setContracheques] = useState<Contracheque[]>([])
  const [busca, setBusca]                 = useState('')
  const [loadingList, setLoadingList]     = useState(true)
  const [loadingH, setLoadingH]           = useState(false)
  const [modalOpen, setModalOpen]         = useState(false)
  const [deleteId, setDeleteId]           = useState<string | null>(null)
  const [criandoLogin, setCriandoLogin]   = useState(false)
  const [resetandoSenha, setResetandoSenha] = useState(false)

  const carregarColaboradores = useCallback(async () => {
    setLoadingList(true)
    const { data, error: colErr } = await supabase.from('colaboradores')
      .select('id,nome,chapa,cpf,funcao_id,tipo_contrato,status,salario_base,funcoes(nome)')
      .in('status', ['ativo', 'afastado'])
      .order('nome')
    if (colErr) console.error('[Contracheques] erro ao carregar colaboradores:', colErr.message)
    const mapped = ((data ?? []) as any[]).map(c => ({
      ...c,
      funcao: c.funcoes?.nome ?? c.funcao_id ?? '—',
      salario: c.salario_base ?? null,
    })) as Colaborador[]
    setColaboradores(mapped)
    const { data: portData } = await supabase.from('colaborador_acessos')
      .select('id,colaborador_id,cpf,senha_hash,ativo,ultimo_acesso,must_change_password')
    setPortais(((portData ?? []).map((p: any) => ({ ...p, login: p.cpf }))) as Portal[])
    setLoadingList(false)
  }, [])

  useEffect(() => { carregarColaboradores() }, [carregarColaboradores])

  const carregarHolerites = useCallback(async (id: string) => {
    setLoadingH(true)
    const { data } = await supabase.from('contracheques').select('*')
      .eq('colaborador_id', id).order('competencia', { ascending: false })
    setContracheques((data as Contracheque[]) ?? [])
    setLoadingH(false)
  }, [])

  useEffect(() => {
    if (selected) carregarHolerites(selected.id)
    else setContracheques([])
  }, [selected, carregarHolerites])

  const colabFiltrados = colaboradores.filter(c => {
    const q = busca.toLowerCase()
    return c.nome.toLowerCase().includes(q) || c.chapa.toLowerCase().includes(q)
  })

  const portalDoColab = selected ? portais.find(p => p.colaborador_id === selected.id) : null

  async function criarLogin() {
    if (!selected) return
    setCriandoLogin(true)
    try {
      const cpf = cpfClean(selected.cpf)
      const hash = await sha256('123')
      const { error } = await supabase.from('colaborador_acessos').insert({
        colaborador_id: selected.id, cpf, senha_hash: hash, ativo: true, must_change_password: true,
      })
      if (error) throw error
      toast.success(`Login criado! CPF: ${cpf} / Senha: 123`)
      await carregarColaboradores()
    } catch (e: unknown) { toast.error('Erro: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setCriandoLogin(false) }
  }

  async function redefinirSenha() {
    if (!selected || !portalDoColab) return
    setResetandoSenha(true)
    try {
      const { error } = await supabase.from('colaborador_acessos')
        .update({ senha_hash: await sha256('123'), must_change_password: true })
        .eq('id', portalDoColab.id)
      if (error) throw error
      toast.success('Senha redefinida para: 123')
    } catch (e: unknown) { toast.error('Erro: ' + (e instanceof Error ? e.message : String(e))) }
    finally { setResetandoSenha(false) }
  }

  function copiarCredenciais() {
    if (!selected || !portalDoColab) return
    const txt = `Portal de Holerites\nURL: https://construtorrh-magmo.netlify.app/#/portal/contracheque\nCPF: ${portalDoColab.login}\nSenha padrão: 123`
    navigator.clipboard.writeText(txt).then(() => toast.success('Credenciais copiadas!'))
  }

  async function togglePublicar(h: Contracheque) {
    const novo = !h.publicado
    const { error } = await supabase.from('contracheques').update({
      publicado: novo, publicado_em: novo ? new Date().toISOString() : null,
    }).eq('id', h.id)
    if (error) { toast.error('Erro: ' + error.message); return }
    toast.success(novo ? '✅ Publicado!' : 'Despublicado.')
    if (selected) carregarHolerites(selected.id)
  }

  async function deletar() {
    if (!deleteId) return
    const { error } = await supabase.from('contracheques').delete().eq('id', deleteId)
    if (error) { toast.error(error.message); return }
    toast.success('Removido.')
    setDeleteId(null)
    if (selected) carregarHolerites(selected.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', overflow: 'hidden', background: '#f8fafc' }}>
      {/* ── Banner link portal ── */}
      <div style={{ background: 'linear-gradient(135deg,#0d3f56,#1e5c7a)', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Receipt size={15} color="#7dd3fc" />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,.9)', fontWeight: 600 }}>
            Portal do Colaborador — acesso aos contracheques
          </span>
        </div>
        <a
          href="https://construtorrh-magmo.netlify.app/#/portal/contracheque"
          target="_blank"
          rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 7, background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 700, transition: 'all .2s' }}
        >
          <ExternalLink size={12}/> Abrir Portal
        </a>
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Sidebar colaboradores ── */}
      <div style={{ width: 280, minWidth: 280, borderRight: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Receipt size={18} color="#0d3f56" />
            <span style={{ fontWeight: 700, fontSize: 15, color: '#0d3f56' }}>Contracheques</span>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar colaborador…"
              style={{ width: '100%', boxSizing: 'border-box', height: 36, paddingLeft: 32, paddingRight: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#334155', outline: 'none' }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingList
            ? <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando…</div>
            : colabFiltrados.length === 0
              ? <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum colaborador.</div>
              : colabFiltrados.map(c => {
                const temPortal = portais.some(p => p.colaborador_id === c.id)
                const isSel = selected?.id === c.id
                return (
                  <button key={c.id} onClick={() => setSelected(c)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 16px',
                      background: isSel ? '#eff6ff' : 'transparent',
                      borderLeft: isSel ? '3px solid #0d3f56' : '3px solid transparent',
                      border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: isSel ? '#0d3f56' : '#1e293b' }}>{c.nome}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 10, background: temPortal ? '#dcfce7' : '#f1f5f9', color: temPortal ? '#16a34a' : '#94a3b8' }}>
                        {temPortal ? '✓' : '—'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{c.chapa} · {c.funcao || '—'}</span>
                  </button>
                )
              })}
        </div>
      </div>

      {/* ── Painel direito ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#94a3b8' }}>
            <Receipt size={52} strokeWidth={1} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>Selecione um colaborador</span>
            <span style={{ fontSize: 13 }}>para gerenciar holerites</span>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

            {/* Header colaborador */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '18px 22px', border: '1px solid #e2e8f0', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#0d3f56', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={20} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>{selected.nome}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#dbeafe', color: '#1d4ed8', textTransform: 'uppercase' }}>
                    {selected.tipo_contrato || 'CLT'}
                  </span>
                  {selected.salario && (
                    <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 8 }}>
                      <Wallet size={10} style={{ display: 'inline', marginRight: 3 }} />
                      {selected.salario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Chapa: <strong>{selected.chapa}</strong> · {selected.funcao || '—'}</div>
              </div>
            </div>

            {/* Acesso ao Portal */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '18px 22px', border: '1px solid #e2e8f0', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Key size={15} color="#0d3f56" />
                <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Acesso ao Portal</span>
              </div>
              {!portalDoColab ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ padding: '9px 13px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626', flex: 1 }}>
                    Sem acesso ao portal de holerites.
                  </div>
                  <Button onClick={criarLogin} disabled={criandoLogin} style={{ background: '#0d3f56', color: '#fff', fontSize: 13 }}>
                    {criandoLogin ? 'Criando…' : '+ Criar Login'}
                  </Button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                    <CheckCircle2 size={15} color="#16a34a" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>Acesso ativo</div>
                      <div style={{ fontSize: 11, color: '#16a34a' }}>
                        Login: <strong>{portalDoColab.login}</strong>
                        {portalDoColab.ultimo_acesso && <span style={{ marginLeft: 10 }}>Último acesso: {new Date(portalDoColab.ultimo_acesso).toLocaleDateString('pt-BR')}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="sm" variant="outline" onClick={copiarCredenciais} style={{ fontSize: 11, gap: 4 }}>
                        <Copy size={11} /> Credenciais
                      </Button>
                      <Button size="sm" variant="outline" onClick={redefinirSenha} disabled={resetandoSenha} style={{ fontSize: 11, gap: 4 }}>
                        <RefreshCw size={11} /> {resetandoSenha ? '…' : 'Resetar'}
                      </Button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', paddingLeft: 2 }}>
                    Senha padrão: <strong>123</strong> · Portal:{' '}
                    <a href="https://construtorrh-magmo.netlify.app/#/portal/contracheque" target="_blank" rel="noreferrer"
                      style={{ color: '#0d3f56', fontWeight: 600, textDecoration: 'underline' }}>
                      construtorrh-magmo.netlify.app/#/portal/contracheque
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Holerites */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '18px 22px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Receipt size={15} color="#0d3f56" />
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Holerites</span>
                  <span style={{ fontSize: 11, background: '#e2e8f0', color: '#475569', padding: '2px 7px', borderRadius: 10, fontWeight: 600 }}>{contracheques.length}</span>
                </div>
                <Button size="sm" onClick={() => setModalOpen(true)} style={{ background: '#0d3f56', color: '#fff', fontSize: 13, gap: 5 }}>
                  <Plus size={13} /> Adicionar
                </Button>
              </div>

              {loadingH ? (
                <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando…</div>
              ) : contracheques.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 10 }}>
                  <Receipt size={30} strokeWidth={1} style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 14 }}>Nenhum holerite</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Clique em "+ Adicionar" para começar.</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #f1f5f9' }}>
                        {['Competência','Tipo','Bruto','Líquido','Origem','Status','Ações'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: '#64748b', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contracheques.map(h => (
                        <tr key={h.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                          <td style={{ padding: '10px', fontWeight: 600, color: '#0f172a' }}>{fmtComp(h.competencia)}</td>
                          <td style={{ padding: '10px', color: '#475569' }}>{TIPO_LABEL[h.tipo] ?? h.tipo}</td>
                          <td style={{ padding: '10px', color: '#0f172a' }}>{fmtMoeda(h.bruto)}</td>
                          <td style={{ padding: '10px', color: '#16a34a', fontWeight: 700 }}>{fmtMoeda(h.liquido)}</td>
                          <td style={{ padding: '10px' }}>
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, fontWeight: 600,
                              background: h.gerado_do_sistema ? '#eff6ff' : '#f8fafc',
                              color: h.gerado_do_sistema ? '#1d4ed8' : '#94a3b8' }}>
                              {h.gerado_do_sistema ? '⚡ Sistema' : '✏️ Manual'}
                            </span>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10,
                              background: h.publicado ? '#dcfce7' : '#fef9c3',
                              color: h.publicado ? '#15803d' : '#854d0e' }}>
                              {h.publicado ? '✓ Publicado' : 'Rascunho'}
                            </span>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <div style={{ display: 'flex', gap: 5 }}>
                              <button onClick={() => togglePublicar(h)} title={h.publicado ? 'Despublicar' : 'Publicar'}
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: h.publicado ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                                {h.publicado ? <EyeOff size={11} /> : <Eye size={11} />}
                                {h.publicado ? 'Tirar' : 'Publicar'}
                              </button>
                              {h.arquivo_url && (
                                <a href={h.arquivo_url} target="_blank" rel="noreferrer"
                                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', textDecoration: 'none', color: '#0d3f56' }}>
                                  <ExternalLink size={11} />
                                </a>
                              )}
                              <button onClick={() => setDeleteId(h.id)}
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fff1f2', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#dc2626' }}>
                                <Trash2 size={11} />
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

      {selected && (
        <ModalHolerite
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          colaborador={selected}
          onSaved={() => carregarHolerites(selected.id)}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={v => { if (!v) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Este holerite será removido permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deletar} style={{ background: '#dc2626', color: '#fff' }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  )
}
