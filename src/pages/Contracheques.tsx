import React, { useCallback, useEffect, useState, useRef } from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/hooks/useProfile'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import {
  Receipt, Search, Plus, Trash2, ExternalLink, Copy,
  Eye, EyeOff, RefreshCw, User, Key, CheckCircle2,
  Upload, X, FileText, Sparkles, Loader2, Info,
  TrendingUp, TrendingDown, Wallet, ChevronDown, ChevronUp, ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────────────────────
type Colaborador = {
  id: string; nome: string; chapa: string | null; cpf: string | null
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
  mensal:       'Mensal',
  adiantamento: 'Adiantamento Salarial',
  ferias:       'Férias',
  '13o_1a':     '13º - 1ª Parcela',
  '13o_2a':     '13º - 2ª Parcela',
  rescisorio:   'Rescisório',
}
const MASTER_EMAIL = 'magmodrive@gmail.com'
const BUCKET = 'ocorrencias-documentos'

async function uploadPdf(file: File) {
  if (file.size > 10 * 1024 * 1024) { toast.error('Arquivo > 10 MB.'); return null }
  const path = `holerites/${Date.now()}_${Math.random().toString(36).slice(2)}.${file.name.split('.').pop()}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type })
  if (error) { toast.error('Upload: ' + error.message); return null }
  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, nome: file.name }
}

// ─── Utilitário: sincronizar registros de ponto para portal_ponto_diario ──────
// Chamado automaticamente ao publicar/gerar qualquer holerite (individual ou lote)
async function syncPontoPortal(colaboradorId: string, lancamentoId: string): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const { data: lanc } = await supabase.from('ponto_lancamentos').select('data_inicio,data_fim').eq('id', lancamentoId).single()
    if (!lanc) return { ok: false, count: 0, error: 'Lançamento não encontrado' }
    const { data: rps } = await supabase.from('registro_ponto').select('*').eq('lancamento_id', lancamentoId).order('data')
    const rows = (rps ?? []).map((r: any) => ({
      colaborador_id:    colaboradorId,
      data:              r.data,
      hora_entrada:      r.hora_entrada  ?? null,
      hora_saida:        r.hora_saida    ?? null,
      horas_trabalhadas: Number(r.horas_trabalhadas) || 0,
      horas_extra:       Number(r.horas_extras ?? r.horas_extra ?? 0),
      horas_falta:       Number(r.horas_falta) || 0,
      status:            r.status ?? (r.hora_entrada ? 'presente' : null),
      observacoes:       r.observacoes ?? null,
      lancamento_id:     lancamentoId,
    }))
    if (rows.length === 0) return { ok: true, count: 0 }
    const datas = rows.map((r: any) => r.data)
    await supabase.from('portal_ponto_diario').delete().eq('colaborador_id', colaboradorId).in('data', datas)
    const { error } = await supabase.from('portal_ponto_diario').insert(rows)
    if (error) return { ok: false, count: 0, error: error.message }
    return { ok: true, count: rows.length }
  } catch (e: any) {
    return { ok: false, count: 0, error: e.message }
  }
}

// ─── Modal Adicionar/Gerar Holerite ─────────────────────────────────────────
function ModalHolerite({ open, onClose, colaborador, onSaved }: {
  open: boolean; onClose: () => void
  colaborador: Colaborador; onSaved: () => void
}) {
  const [competencia, setCompetencia] = useState(() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })
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
  const [registrosPonto, setRegistrosPonto] = useState<any[]>([])
  const [registrosProducao, setRegistrosProducao] = useState<any[]>([])

  // Auto-calcular bruto e líquido

  // Reset todos os campos quando o modal abre um NOVO holerite
  useEffect(() => {
    if (open) {
      setCompetencia(() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })
      setTipo('mensal')
      setDescricao('')
      setSalarioBase('')
      setHorasNormais('')
      setHorasExtras('')
      setValorProducao('')
      setValorDsr('')
      setValorPremio('')
      setBruto('')
      setInss('')
      setIrrf('')
      setFgts('')
      setDescontoVt('')
      setDescontoAdiant('')
      setCestaBasica('')
      setDescontos('')
      setLiquido('')
      setObraNome('')
      setFuncao('')
      setDiasTrab('')
      setFaltas('')
      setLancamentoId('')
      setGeradoDoSistema(false)
      setSistemaInfo('')
      setRegistrosPonto([])
      setRegistrosProducao([])
      setArquivo(null)
      setExpandDetalhes(false)
    }
  }, [open])

  useEffect(() => {
    const base   = parseFloat(salarioBase)   || 0
    const dsr    = parseFloat(valorDsr)      || 0
    const premio = parseFloat(valorPremio)   || 0
    const total  = base + dsr + premio
    if (total > 0) setBruto(total.toFixed(2))
  }, [salarioBase, valorDsr, valorPremio])

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
        .select('salario, funcao_id, tipo_contrato, data_admissao, funcoes(nome)')
        .eq('id', colaborador.id)
        .single()
      // normaliza campos
      if (colab) {
        ;(colab as any).salario = (colab as any).salario ?? null
        ;(colab as any).funcao  = (colab as any).funcoes?.nome ?? colaborador.funcao ?? '—'
      }

      // 2 – Lançamento de ponto (snapshot)
      const { data: lancs } = await supabase
        .from('ponto_lancamentos')
        .select(`id, mes_referencia, tipo_pagamento, snap_valor_horas, snap_horas_normais, snap_horas_extras,
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
        // será preenchido após buscar registros diários
        setFaltas(sumFaltas > 0         ? String(sumFaltas)      : '')
        const primLancId = lancs[0]?.id ?? null
        setLancamentoId(primLancId)
        const tipoPag = (lancs[0] as any)?.tipo_pagamento
        if (tipoPag) setTipo(tipoPag)
        setGeradoDoSistema(true)
        if (primLancId) {
          const dataIni = (lancs[0] as any).data_inicio ?? mesRef+'-01'
          const dataFim = (lancs[0] as any).data_fim   ?? mesRef+'-31'
          const [rpRes, rpAltRes, rprodRes] = await Promise.all([
            supabase.from('portal_ponto_diario')
              .select('id,data,hora_entrada,hora_saida,horas_trabalhadas,horas_extra,status,observacoes')
              .eq('colaborador_id', colaborador.id).gte('data',dataIni).lte('data',dataFim).order('data'),
            supabase.from('registro_ponto')
              .select('id,data,hora_entrada,hora_saida,horas_trabalhadas,horas_extras,horas_falta,status,observacoes')
              .eq('lancamento_id', primLancId).order('data'),
            supabase.from('ponto_producao')
              .select('id,data,quantidade,valor_total,observacoes,playbook_itens(descricao,unidade,categoria)')
              .eq('colaborador_id', colaborador.id).gte('data',dataIni).lte('data',dataFim).order('data'),
          ])
          const rp1 = rpRes.data ?? []
          const rp2 = (rpAltRes.data ?? []).map((r:any)=>({...r, horas_extra:r.horas_extras??r.horas_extra??0, status:r.status??(r.hora_entrada?'presente':null)}))
          const registrosFinal = rp1.length > 0 ? rp1 : rp2
          setRegistrosPonto(registrosFinal)
          setRegistrosProducao((rprodRes.data as any[]) ?? [])
          // Auto-preencher dias trabalhados
          const presentes = registrosFinal.filter((r:any) => !['falta','falta_justificada'].includes((r.status??'').toLowerCase()) && (r.hora_entrada || r.status))
          if (presentes.length > 0) setDiasTrab(String(presentes.length))
        }

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

      // ── Ao publicar: copiar registros de ponto para portal_ponto_diario ──
      // Isso garante que o colaborador veja os horários no portal sem depender de RLS de registro_ponto
      if (publicar && registrosPonto.length > 0) {
        const pontoRows = registrosPonto.map((r: any) => ({
          colaborador_id:   colaborador.id,
          data:             r.data,
          hora_entrada:     r.hora_entrada ?? null,
          hora_saida:       r.hora_saida   ?? null,
          horas_trabalhadas:Number(r.horas_trabalhadas) || 0,
          horas_extra:      Number(r.horas_extra)        || 0,
          horas_falta:      Number(r.horas_falta)        || 0,
          status:           r.status ?? (r.hora_entrada ? 'presente' : null),
          observacoes:      r.observacoes ?? null,
          lancamento_id:    lancamentoId ?? null,
        }))
        // upsert por colaborador_id + data para não duplicar
        // Primeiro remove registros existentes do período para evitar duplicata
        const datas = pontoRows.map((r: any) => r.data)
        await supabase.from('portal_ponto_diario')
          .delete()
          .eq('colaborador_id', colaborador.id)
          .in('data', datas)
        // Insere os novos registros com horários
        const { error: ePonto } = await supabase
          .from('portal_ponto_diario')
          .insert(pontoRows)
        if (ePonto) console.warn('Aviso: não foi possível copiar ponto para portal:', ePonto.message)
        else toast.success(`✅ Holerite publicado! ${pontoRows.length} registros de ponto sincronizados.`)
      } else if (publicar && lancamentoId) {
        // Fallback: registrosPonto vazio mas há lançamento — tenta buscar do registro_ponto diretamente
        const res = await syncPontoPortal(colaborador.id, lancamentoId)
        if (res.ok && res.count > 0)
          toast.success(`✅ Holerite publicado! ${res.count} registros de ponto sincronizados.`)
        else
          toast.success(publicar ? '✅ Holerite publicado!' : 'Rascunho salvo.')
      } else {
        toast.success(publicar ? '✅ Holerite publicado!' : 'Rascunho salvo.')
      }

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

  const TIPO_EMOJI: Record<string,string> = { mensal:'💵', adiantamento:'💳', ferias:'🏖️', '13o_1a':'🎁', '13o_2a':'🎁', rescisorio:'📋' }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent style={{ maxWidth:700, height:'90vh', maxHeight:'90vh', overflowY:'hidden', padding:0, display:'flex', flexDirection:'column' }}>

        {/* Header estilizado */}
        <div style={{ background:'linear-gradient(135deg,#0d3f56,#1a56a0)', padding:'16px 20px', borderRadius:'8px 8px 0 0' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ width:36, height:36, borderRadius:10, background:'rgba(255,255,255,.18)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Receipt size={18} color="#fff"/>
              </span>
              <div>
                <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>Adicionar Holerite</div>
                <div style={{ color:'rgba(255,255,255,.7)', fontSize:11 }}>{colaborador.nome} · {colaborador.chapa ?? ''}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:12, padding:'16px 20px 12px' }}>

          {/* Competência + Tipo — destaque visual */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <span style={lbl}>📅 Competência *</span>
              <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)}
                style={{ ...inp, height:40, fontWeight:700, color:'#1a56a0', border:'1.5px solid #bfdbfe', background:'#eff6ff' }} />
            </div>
            <div>
              <span style={lbl}>📋 Tipo de Holerite</span>
              <select value={tipo} onChange={e => setTipo(e.target.value)}
                style={{ ...inp, height:40, background:'#fff', cursor:'pointer', fontWeight:700, color:'#1a56a0', border:'1.5px solid #e2e8f0' }}>
                {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{TIPO_EMOJI[v] ?? '📄'} {l}</option>)}
              </select>
            </div>
          </div>

          {/* Badge tipo selecionado */}
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'#f8fafc', borderRadius:8, border:'1px solid #e2e8f0' }}>
            <span style={{ fontSize:20 }}>{TIPO_EMOJI[tipo] ?? '📄'}</span>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#0d3f56' }}>{TIPO_LABEL[tipo] ?? tipo}</div>
              <div style={{ fontSize:11, color:'#6b7280' }}>{competencia ? `Competência: ${competencia}` : 'Selecione a competência'}</div>
            </div>
            {geradoDoSistema && <span style={{ marginLeft:'auto', fontSize:10, background:'#dcfce7', color:'#15803d', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>✓ Gerado do Sistema</span>}
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
                  {/* Campo Produção removido — valor integrado via fechamento de ponto */}
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

          {/* ── Registros de Ponto Diário ──────────────────────────────── */}
          {registrosPonto.length > 0 && (() => {
            const presentes = registrosPonto.filter((r:any)=>!['falta','falta_justificada'].includes((r.status??'').toLowerCase()))
            const faltas    = registrosPonto.filter((r:any)=>['falta','falta_justificada'].includes((r.status??'').toLowerCase()))
            const totHoras  = registrosPonto.reduce((s:number,r:any)=>s+(Number(r.horas_trabalhadas)||0),0)
            const totExtras = registrosPonto.reduce((s:number,r:any)=>s+(Number(r.horas_extra)||0),0)
            return (
              <div style={{ borderTop:'2px solid #f1f5f9', paddingTop:10 }}>
                {/* Cards resumo */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:10 }}>
                  {[
                    { l:'Dias Trabalhados', v:presentes.length, bg:'#dbeafe', cor:'#1d4ed8' },
                    { l:'Faltas',           v:faltas.length,    bg:'#fee2e2', cor:'#dc2626' },
                    { l:'H. Normais',       v:`${totHoras.toFixed(1)}h`,  bg:'#dcfce7', cor:'#15803d' },
                    { l:'H. Extras',        v:`${totExtras.toFixed(1)}h`, bg:'#fef9c3', cor:'#92400e' },
                  ].map(s=>(
                    <div key={s.l} style={{ background:s.bg, borderRadius:8, padding:'7px 8px', textAlign:'center' }}>
                      <div style={{ fontSize:15, fontWeight:800, color:s.cor }}>{s.v}</div>
                      <div style={{ fontSize:9, color:s.cor, fontWeight:600 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
                {/* Tabela */}
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                  <span style={{ fontSize:13 }}>⏱</span>
                  <span style={{ fontSize:12, fontWeight:700, color:'#0d3f56' }}>REGISTROS DE PONTO ({registrosPonto.length} dias)</span>
                </div>
                <div style={{ maxHeight:160, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:8, fontSize:11 }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead><tr style={{ background:'#0d3f56', position:'sticky', top:0 }}>
                      {['Data','Entrada','Saída','H.Trab','H.Extra','Status'].map(h=>(
                        <th key={h} style={{ padding:'5px 8px', textAlign:'left', fontSize:10, color:'#fff', fontWeight:700 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {registrosPonto.map((r:any,i:number)=>{
                        const dt=r.data?.slice(5).replace('-','/')
                        const isFalta=['falta','falta_justificada'].includes((r.status??'').toLowerCase())
                        return (
                          <tr key={r.id||i} style={{ background:isFalta?'#fff1f2':i%2===0?'#fff':'#f9fafb', borderBottom:'1px solid #f1f5f9' }}>
                            <td style={{ padding:'4px 8px', fontWeight:700 }}>{dt}</td>
                            <td style={{ padding:'4px 8px', color:'#16a34a', fontWeight:600 }}>{r.hora_entrada?.slice(0,5)??'—'}</td>
                            <td style={{ padding:'4px 8px', color:'#dc2626', fontWeight:600 }}>{r.hora_saida?.slice(0,5)??'—'}</td>
                            <td style={{ padding:'4px 8px', fontWeight:700 }}>{r.horas_trabalhadas?`${Number(r.horas_trabalhadas).toFixed(1)}h`:'—'}</td>
                            <td style={{ padding:'4px 8px', color:Number(r.horas_extra)>0?'#92400e':'#9ca3af', fontWeight:Number(r.horas_extra)>0?700:400 }}>{Number(r.horas_extra)>0?`+${Number(r.horas_extra).toFixed(1)}h`:'—'}</td>
                            <td style={{ padding:'4px 8px' }}>
                              <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4, background:isFalta?'#fee2e2':'#dcfce7', color:isFalta?'#dc2626':'#15803d' }}>
                                {isFalta?'Falta':'Pres.'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot><tr style={{ background:'#0d3f56' }}>
                      <td colSpan={3} style={{ padding:'5px 8px', fontSize:11, fontWeight:700, color:'#fff' }}>TOTAIS — {presentes.length} dias</td>
                      <td style={{ padding:'5px 8px', fontSize:11, fontWeight:700, color:'#fff' }}>{totHoras.toFixed(1)}h</td>
                      <td style={{ padding:'5px 8px', fontSize:11, fontWeight:700, color:'#fbbf24' }}>{totExtras.toFixed(1)}h</td>
                      <td style={{ padding:'5px 8px', fontSize:11, color:'#fca5a5' }}>{faltas.length} falta(s)</td>
                    </tr></tfoot>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* ── Produções por Categoria ─────────────────────────────────── */}
          {registrosProducao.length > 0 && (() => {
            // Agrupar por categoria/serviço
            const porServico: Record<string, {descricao:string; unidade:string; categoria:string; qtdTotal:number; valorTotal:number; count:number}> = {}
            for (const r of registrosProducao as any[]) {
              const desc = r.playbook_itens?.descricao ?? 'Serviço'
              const cat  = r.playbook_itens?.categoria ?? 'Geral'
              const key  = desc
              if (!porServico[key]) porServico[key] = { descricao:desc, unidade:r.playbook_itens?.unidade??'', categoria:cat, qtdTotal:0, valorTotal:0, count:0 }
              porServico[key].qtdTotal  += Number(r.quantidade) || 0
              porServico[key].valorTotal += Number(r.valor_total) || 0
              porServico[key].count++
            }
            const grupos = Object.values(porServico)
            const totalGeral = grupos.reduce((s,g)=>s+g.valorTotal, 0)
            // Agrupar por categoria para exibição
            const porCat: Record<string, typeof grupos> = {}
            for (const g of grupos) {
              if (!porCat[g.categoria]) porCat[g.categoria] = []
              porCat[g.categoria].push(g)
            }
            return (
              <div style={{ borderTop:'2px solid #f1f5f9', paddingTop:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:13 }}>⚡</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#7c3aed' }}>PRODUÇÕES POR CATEGORIA ({registrosProducao.length} lançamentos)</span>
                  </div>
                  <span style={{ fontSize:13, fontWeight:800, color:'#7c3aed' }}>R$ {totalGeral.toFixed(2)}</span>
                </div>
                {/* Por categoria */}
                {Object.entries(porCat).map(([cat, itens])=>(
                  <div key={cat} style={{ marginBottom:10 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#fff', background:'#7c3aed', padding:'3px 8px', borderRadius:4, display:'inline-block', marginBottom:4 }}>
                      {cat.toUpperCase()}
                    </div>
                    <div style={{ border:'1px solid #e9d5ff', borderRadius:8, overflow:'hidden', fontSize:11 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse' }}>
                        <thead><tr style={{ background:'#f5f3ff' }}>
                          {['Serviço','Qtd Total','Lançamentos','Valor Total'].map(h=>(
                            <th key={h} style={{ padding:'5px 8px', textAlign:'left', fontSize:10, color:'#7c3aed', fontWeight:700, borderBottom:'1px solid #e9d5ff' }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {itens.map((g,i)=>(
                            <tr key={g.descricao} style={{ background:i%2===0?'#fff':'#faf5ff', borderBottom:'1px solid #f3e8ff' }}>
                              <td style={{ padding:'5px 8px', fontWeight:600 }}>{g.descricao}</td>
                              <td style={{ padding:'5px 8px', color:'#374151' }}>{g.qtdTotal.toFixed(2)} {g.unidade}</td>
                              <td style={{ padding:'5px 8px', color:'#6b7280', textAlign:'center' }}>{g.count}x</td>
                              <td style={{ padding:'5px 8px', fontWeight:700, color:'#7c3aed' }}>R$ {g.valorTotal.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
                {/* Tabela detalhada recolhível */}
                <details style={{ marginTop:4 }}>
                  <summary style={{ fontSize:11, color:'#6b7280', cursor:'pointer', userSelect:'none', fontWeight:600 }}>▸ Ver lançamentos detalhados ({registrosProducao.length})</summary>
                  <div style={{ maxHeight:140, overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:8, marginTop:6, fontSize:11 }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead><tr style={{ background:'#f5f3ff' }}>
                        {['Data','Serviço','Qtd','Valor','Obs'].map(h=>(
                          <th key={h} style={{ padding:'4px 8px', textAlign:'left', fontSize:10, color:'#6b7280', fontWeight:700, borderBottom:'1px solid #e2e8f0' }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {(registrosProducao as any[]).map((r:any,i:number)=>(
                          <tr key={r.id||i} style={{ background:i%2===0?'#fff':'#faf5ff', borderBottom:'1px solid #f3e8ff' }}>
                            <td style={{ padding:'4px 8px', fontWeight:600 }}>{r.data?.slice(5).replace('-','/')}</td>
                            <td style={{ padding:'4px 8px' }}>{r.playbook_itens?.descricao??'—'}</td>
                            <td style={{ padding:'4px 8px' }}>{r.quantidade} {r.playbook_itens?.unidade??''}</td>
                            <td style={{ padding:'4px 8px', fontWeight:700, color:'#7c3aed' }}>R$ {Number(r.valor_total||0).toFixed(2)}</td>
                            <td style={{ padding:'4px 8px', color:'#9ca3af', fontStyle:'italic' }}>{r.observacoes??'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )
          })()}

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

        <DialogFooter style={{ gap:8, flexWrap:'wrap', flexShrink:0, background:'#fff', borderTop:'1px solid #e2e8f0', padding:'12px 20px', margin:0 }}>
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
  const { user } = useAuth()
  const isMaster = user?.email === MASTER_EMAIL
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [portais, setPortais]             = useState<Portal[]>([])
  const [selected, setSelected]           = useState<Colaborador | null>(null)
  const [contracheques, setContracheques] = useState<Contracheque[]>([])
  const [aceites, setAceites]             = useState<Record<string,any>>({})
  const [refreshingAceites, setRefreshingAceites] = useState(false)
  const selectedIdRef = React.useRef<string|null>(null)
  const [busca, setBusca]                 = useState('')
  const [loadingList, setLoadingList]     = useState(true)
  const [loadingH, setLoadingH]           = useState(false)
  const [modalOpen, setModalOpen]         = useState(false)
  const [deleteId, setDeleteId]           = useState<string | null>(null)
  const [criandoLogin, setCriandoLogin]   = useState(false)
  const [resetandoSenha, setResetandoSenha] = useState(false)
  // ── Geração em lote ──────────────────────────────────────────────────────
  const [loteOpen, setLoteOpen]           = useState(false)
  const [loteComp, setLoteComp]           = useState(new Date().toISOString().slice(0, 7))
  const [loteRunning, setLoteRunning]     = useState(false)
  const [loteLog, setLoteLog]             = useState<{ nome: string; ok: boolean; msg: string }[]>([])
  const [loteDone, setLoteDone]           = useState(false)

  const carregarColaboradores = useCallback(async () => {
    setLoadingList(true)
    const { data, error: colErr } = await supabase.from('colaboradores')
      .select('id,nome,chapa,cpf,funcao_id,tipo_contrato,status,salario,funcoes(nome)')
      .in('status', ['ativo', 'afastado'])
      .eq('tipo_contrato', 'clt')
      .order('nome')
    if (colErr) console.error('[Contracheques] erro ao carregar colaboradores:', colErr.message)
    const mapped = ((data ?? []) as any[]).map(c => ({
      ...c,
      funcao: c.funcoes?.nome ?? c.funcao_id ?? '—',
      salario: c.salario ?? null,
    })) as Colaborador[]
    setColaboradores(mapped)
    const { data: portData } = await supabase.from('colaborador_acessos')
      .select('id,colaborador_id,cpf,senha_hash,ativo,ultimo_acesso,must_change_password')
    setPortais(((portData ?? []).map((p: any) => ({ ...p, login: p.cpf }))) as Portal[])
    setLoadingList(false)
  }, [])

  useEffect(() => { carregarColaboradores() }, [carregarColaboradores])

  // Recarrega apenas os aceites (sem rebuscar holerites) — usado no polling e refresh manual
  const carregarSomenteAceites = useCallback(async (colabId: string, ids: string[]) => {
    if (!ids.length) { setAceites({}); return }
    const { data: acData } = await supabase
      .from('contracheque_aceites').select('*')
      .eq('colaborador_id', colabId)
      .in('contracheque_id', ids)
    const m: Record<string,any> = {}
    for (const a of (acData ?? []) as any[]) m[a.contracheque_id] = a
    setAceites(m)
  }, [])

  const carregarHolerites = useCallback(async (id: string) => {
    setLoadingH(true)
    const { data } = await supabase.from('contracheques').select('*')
      .eq('colaborador_id', id).order('competencia', { ascending: false })
    const hols = (data as Contracheque[]) ?? []
    setContracheques(hols)
    // Carregar aceites para exibir status no admin
    await carregarSomenteAceites(id, hols.map(h => h.id))
    setLoadingH(false)
  }, [])

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null
    if (selected) carregarHolerites(selected.id)
    else { setContracheques([]); setAceites({}) }
  }, [selected, carregarHolerites])

  // Polling de aceites a cada 20s para refletir confirmações feitas no celular
  useEffect(() => {
    const tick = setInterval(async () => {
      const sid = selectedIdRef.current
      if (!sid) return
      setRefreshingAceites(true)
      const { data: hols } = await supabase.from('contracheques').select('id')
        .eq('colaborador_id', sid)
      if (hols && hols.length > 0)
        await carregarSomenteAceites(sid, hols.map((h:any) => h.id))
      setRefreshingAceites(false)
    }, 20_000)
    return () => clearInterval(tick)
  }, [carregarSomenteAceites])

  const colabFiltrados = colaboradores.filter(c => {
    const q = busca.toLowerCase()
    return (
      (c.nome?.toLowerCase() ?? '').includes(q) ||
      (c.chapa?.toLowerCase() ?? '').includes(q)
    )
  })

  const portalDoColab = selected ? portais.find(p => p.colaborador_id === selected.id) : null

  async function criarLogin() {
    if (!selected) return
    if (!selected.cpf) { toast.error('Este colaborador não possui CPF cadastrado.'); return }
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

  async function sincronizarPonto(h: Contracheque) {
    if (!selected) return
    try {
      const lancId = h.lancamento_id
      if (!lancId) { toast.error('Holerite sem lançamento vinculado.'); return }
      const { data: lanc } = await supabase.from('ponto_lancamentos').select('data_inicio,data_fim').eq('id', lancId).single()
      if (!lanc) { toast.error('Lançamento não encontrado.'); return }
      const { data: rps } = await supabase.from('registro_ponto').select('*').eq('lancamento_id', lancId).order('data')
      const rows2 = (rps||[]).map((r: any) => ({
        colaborador_id: selected.id, data: r.data,
        hora_entrada: r.hora_entrada, hora_saida: r.hora_saida,
        horas_trabalhadas: Number(r.horas_trabalhadas)||0,
        horas_extra: Number(r.horas_extras ?? r.horas_extra ?? 0),
        horas_falta: Number(r.horas_falta)||0,
        status: r.status ?? (r.hora_entrada ? 'presente' : null),
        observacoes: r.observacoes ?? null, lancamento_id: lancId,
      }))
      if (rows2.length === 0) { toast.error('Nenhum registro de ponto encontrado.'); return }
      const datas = rows2.map((r: any) => r.data)
      await supabase.from('portal_ponto_diario').delete().eq('colaborador_id', selected.id).in('data', datas)
      const { error: eI } = await supabase.from('portal_ponto_diario').insert(rows2)
      if (eI) toast.error('Erro ao sincronizar: ' + eI.message)
      else toast.success('✅ ' + rows2.length + ' registros sincronizados para o portal!')
    } catch (e: any) { toast.error('Erro: ' + e.message) }
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

    // Verificar se há aceite registrado
    const { data: acData } = await supabase
      .from('contracheque_aceites')
      .select('id, nome_colaborador, aceito_em')
      .eq('contracheque_id', deleteId)
      .limit(1)
      .single()

    if (acData) {
      // Holerite já foi lido pelo colaborador
      if (!isMaster) {
        toast.error(`🔒 Este holerite já foi visualizado por ${acData.nome_colaborador ?? 'colaborador'} em ${new Date(acData.aceito_em).toLocaleString('pt-BR')} e não pode ser excluído. Apenas o administrador master pode removê-lo em caso de correção.`)
        setDeleteId(null)
        return
      }
      // Master pode excluir: aviso adicional já foi exibido no modal
    }

    const { error } = await supabase.from('contracheques').delete().eq('id', deleteId)
    if (error) { toast.error(error.message); return }
    toast.success(acData ? '⚠️ Holerite com aceite removido pelo master.' : 'Removido.')
    setDeleteId(null)
    if (selected) carregarHolerites(selected.id)
  }

  // ── Geração em lote ────────────────────────────────────────────────────────
  // Para cada colaborador CLT ativo que tenha lançamento aprovado na competência:
  // 1. Busca dados do lançamento (snap)
  // 2. Verifica se já existe holerite mensal para o período (pula se já tiver)
  // 3. Insere contracheque e publica
  // 4. Sincroniza ponto para portal_ponto_diario automaticamente
  async function gerarLote() {
    setLoteRunning(true)
    setLoteLog([])
    setLoteDone(false)
    const log: { nome: string; ok: boolean; msg: string }[] = []

    try {
      // 1. Buscar todos os colaboradores CLT ativos
      const { data: colabsAll } = await supabase
        .from('colaboradores')
        .select('id,nome,chapa,cpf,funcao_id,tipo_contrato,salario,funcoes(nome)')
        .in('status', ['ativo'])
        .eq('tipo_contrato', 'clt')
        .order('nome')
      if (!colabsAll?.length) { toast.error('Nenhum colaborador CLT ativo encontrado.'); setLoteRunning(false); return }

      // 2. Buscar todos os lançamentos aprovados para a competência
      const { data: lancsAll } = await supabase
        .from('ponto_lancamentos')
        .select('id,colaborador_id,mes_referencia,tipo_pagamento,snap_valor_horas,snap_horas_normais,snap_horas_extras,snap_valor_producao,snap_valor_dsr,snap_valor_premio,snap_valor_total,snap_faltas,snap_desconto_vt,snap_desconto_adiant,snap_inss,snap_ir,snap_liquido,snap_valor_hora,obras(nome),data_inicio,data_fim')
        .eq('mes_referencia', loteComp)
        .in('status', ['aprovado', 'liberado', 'pago'])

      const lancMap = new Map<string, any[]>()
      ;(lancsAll ?? []).forEach((l: any) => {
        if (!lancMap.has(l.colaborador_id)) lancMap.set(l.colaborador_id, [])
        lancMap.get(l.colaborador_id)!.push(l)
      })

      // 3. Buscar holerites já existentes no mês (para não duplicar)
      const compDate = loteComp + '-01'
      const { data: holeriteExist } = await supabase
        .from('contracheques')
        .select('colaborador_id')
        .eq('competencia', compDate)
        .eq('tipo', 'mensal')
      const jaTemHolerite = new Set((holeriteExist ?? []).map((h: any) => h.colaborador_id))

      // 4. Buscar prêmios aprovados do mês
      const colabIds = colabsAll.map((c: any) => c.id)
      const { data: premiosAll } = await supabase
        .from('premios')
        .select('colaborador_id,valor')
        .eq('competencia', loteComp)
        .in('status', ['aprovado', 'pago'])
        .in('colaborador_id', colabIds)
      const premMap = new Map<string, number>()
      ;(premiosAll ?? []).forEach((p: any) => {
        premMap.set(p.colaborador_id, (premMap.get(p.colaborador_id) ?? 0) + (p.valor ?? 0))
      })

      // 5. Buscar adiantamentos descontados no mês
      const { data: adiantAll } = await supabase
        .from('adiantamentos')
        .select('colaborador_id,valor')
        .eq('descontado_em', loteComp)
        .in('status', ['pago'])
        .in('colaborador_id', colabIds)
      const adiantMap = new Map<string, number>()
      ;(adiantAll ?? []).forEach((a: any) => {
        adiantMap.set(a.colaborador_id, (adiantMap.get(a.colaborador_id) ?? 0) + (a.valor ?? 0))
      })

      // 6. Iterar colaboradores
      for (const colab of colabsAll as any[]) {
        const nomeCurto = colab.nome ?? colab.id

        // Pular se já tem holerite mensal
        if (jaTemHolerite.has(colab.id)) {
          log.push({ nome: nomeCurto, ok: false, msg: 'já tem holerite mensal — pulado' })
          setLoteLog([...log])
          continue
        }

        const lancs = lancMap.get(colab.id)
        if (!lancs?.length) {
          log.push({ nome: nomeCurto, ok: false, msg: 'sem lançamento aprovado — pulado' })
          setLoteLog([...log])
          continue
        }

        // Somar múltiplos lançamentos (ex: 2 obras)
        let sumHorNorm = 0, sumHorExt = 0, sumValHoras = 0, sumProd = 0
        let sumDsr = 0, sumPremioLanc = 0, sumTotal = 0
        let sumFaltas = 0, sumVt = 0, sumAdLanc = 0, sumInss = 0, sumIr = 0
        let sumLiquido = 0
        const obras: string[] = []
        let primLancId: string | null = null

        for (const l of lancs) {
          sumHorNorm    += l.snap_horas_normais  ?? 0
          sumHorExt     += l.snap_horas_extras   ?? 0
          sumValHoras   += l.snap_valor_horas    ?? 0
          sumProd       += l.snap_valor_producao ?? 0
          sumDsr        += l.snap_valor_dsr      ?? 0
          sumPremioLanc += l.snap_valor_premio   ?? 0
          sumTotal      += l.snap_valor_total    ?? 0
          sumFaltas     += l.snap_faltas         ?? 0
          sumVt         += l.snap_desconto_vt    ?? 0
          sumAdLanc     += l.snap_desconto_adiant?? 0
          sumInss       += l.snap_inss           ?? 0
          sumIr         += l.snap_ir             ?? 0
          sumLiquido    += l.snap_liquido        ?? 0
          if (l.obras?.nome) obras.push(l.obras.nome)
          if (!primLancId) primLancId = l.id
        }

        const totalPremio = sumPremioLanc + (premMap.get(colab.id) ?? 0)
        const totalAdiant = Math.max(sumAdLanc, adiantMap.get(colab.id) ?? 0)
        const brutoFinal  = sumTotal > 0 ? sumTotal : sumValHoras + sumProd + sumDsr + totalPremio
        const liquido     = sumLiquido > 0 ? sumLiquido : brutoFinal - sumInss - sumIr - sumVt - totalAdiant

        const payload = {
          colaborador_id:    colab.id,
          competencia:       compDate,
          tipo:              'mensal',
          descricao:         `Holerite gerado automaticamente — ${loteComp}`,
          bruto:             brutoFinal > 0 ? brutoFinal : null,
          liquido:           liquido  > 0 ? liquido   : null,
          descontos:         sumInss + sumIr + sumVt + totalAdiant > 0 ? sumInss + sumIr + sumVt + totalAdiant : null,
          inss:              sumInss > 0   ? sumInss   : null,
          fgts:              brutoFinal > 0 ? parseFloat((brutoFinal * 0.08).toFixed(2)) : null,
          irrf:              sumIr > 0     ? sumIr     : null,
          salario_base:      sumValHoras > 0 ? sumValHoras : (colab.salario ?? null),
          horas_normais:     sumHorNorm > 0 ? sumHorNorm : null,
          horas_extras:      sumHorExt  > 0 ? sumHorExt  : null,
          valor_producao:    sumProd > 0    ? sumProd    : null,
          valor_dsr:         sumDsr  > 0    ? sumDsr     : null,
          valor_premio:      totalPremio > 0 ? totalPremio : null,
          desconto_vt:       sumVt > 0      ? sumVt      : null,
          desconto_adiant:   totalAdiant > 0 ? totalAdiant : null,
          funcao:            colab.funcoes?.nome ?? null,
          tipo_contrato_snap:'clt',
          obra_nome:         obras.join(' / ') || null,
          dias_trabalhados:  null,
          faltas:            sumFaltas > 0 ? sumFaltas : null,
          lancamento_id:     primLancId,
          gerado_do_sistema: true,
          publicado:         true,
          publicado_em:      new Date().toISOString(),
        }

        const { error: errH } = await supabase.from('contracheques').insert(payload)
        if (errH) {
          log.push({ nome: nomeCurto, ok: false, msg: 'Erro ao salvar: ' + errH.message })
          setLoteLog([...log])
          continue
        }

        // Sincronizar ponto para portal_ponto_diario automaticamente
        let syncMsg = ''
        if (primLancId) {
          const sync = await syncPontoPortal(colab.id, primLancId)
          syncMsg = sync.ok ? ` | ponto: ${sync.count} registros sincronizados` : ` | sync ponto: ${sync.error}`
        }

        log.push({ nome: nomeCurto, ok: true, msg: `✅ publicado${syncMsg}` })
        setLoteLog([...log])
      }

      setLoteDone(true)
      const ok   = log.filter(l => l.ok).length
      const skip = log.filter(l => !l.ok).length
      toast.success(`Lote concluído: ${ok} holerite(s) gerado(s), ${skip} pulado(s).`)
      carregarColaboradores()
    } catch (e: any) {
      toast.error('Erro no lote: ' + e.message)
    } finally {
      setLoteRunning(false)
    }
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
            <button
              onClick={() => { setLoteOpen(true); setLoteLog([]); setLoteDone(false) }}
              title="Gerar contracheques de todos os colaboradores de uma vez"
              style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:6, border:'1px solid #0d3f56', background:'#0d3f56', color:'#fff', cursor:'pointer', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>
              <Sparkles size={11}/> Gerar em Lote
            </button>
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
                    <span style={{ fontSize: 11, color: '#64748b' }}>{c.chapa ?? '—'} · {c.funcao || '—'}</span>
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
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Chapa: <strong>{selected.chapa ?? '—'}</strong> · {selected.funcao || '—'}</div>
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
                  <button title="Atualizar aceites" onClick={async () => {
                    if (!selected) return
                    setRefreshingAceites(true)
                    const { data: hols } = await supabase.from('contracheques').select('id').eq('colaborador_id', selected.id)
                    if (hols?.length) await carregarSomenteAceites(selected.id, hols.map((h:any)=>h.id))
                    setRefreshingAceites(false)
                  }} style={{ background:'none', border:'1px solid #e2e8f0', borderRadius:6, cursor:'pointer', padding:'3px 7px', display:'flex', alignItems:'center', gap:4, color:refreshingAceites?'#1d4ed8':'#6b7280', fontSize:11, fontWeight:600 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation:refreshingAceites?'spin 1s linear infinite':'none' }}><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                    {refreshingAceites ? 'atualizando…' : '↻ aceites'}
                  </button>
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
                        {['Competência','Tipo','Bruto','Líquido','Origem','Status','Aceite','Ações'].map(h => (
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
                          {/* Coluna Aceite */}
                          <td style={{ padding: '10px' }}>
                            {aceites[h.id]
                              ? <span title={`Aceito em ${new Date(aceites[h.id].aceito_em).toLocaleString('pt-BR')} · IP: ${aceites[h.id].ip_address??'—'}`}
                                  style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, background:'#dcfce7', color:'#15803d', padding:'2px 8px', borderRadius:8, fontWeight:700, cursor:'help' }}>
                                  <ShieldCheck size={11}/> Ciente
                                </span>
                              : <span style={{ fontSize:11, background:'#fef3c7', color:'#92400e', padding:'2px 8px', borderRadius:8, fontWeight:600 }}>⏳ Pendente</span>
                            }
                          </td>
                          <td style={{ padding: '10px' }}>
                            <div style={{ display: 'flex', gap: 5 }}>
                              <button onClick={() => togglePublicar(h)} title={h.publicado ? 'Despublicar' : 'Publicar'}
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: h.publicado ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                                {h.publicado ? <EyeOff size={11} /> : <Eye size={11} />}
                                {h.publicado ? 'Tirar' : 'Publicar'}
                              </button>
                              {h.lancamento_id && (
                                <button onClick={() => sincronizarPonto(h)} title="Sincronizar registros de ponto para o portal"
                                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}>
                                  <RefreshCw size={11} />
                                  Ponto
                                </button>
                              )}
                              {h.arquivo_url && (
                                <a href={h.arquivo_url} target="_blank" rel="noreferrer"
                                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', textDecoration: 'none', color: '#0d3f56' }}>
                                  <ExternalLink size={11} />
                                </a>
                              )}
                              {aceites[h.id] && !isMaster
                                ? (
                                  <div title="Holerite já lido — só o master pode excluir"
                                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f3f4f6', display: 'flex', alignItems: 'center', color: '#9ca3af', cursor: 'not-allowed' }}>
                                    🔒
                                  </div>
                                ) : (
                                  <button onClick={() => setDeleteId(h.id)}
                                    title={aceites[h.id] ? '⚠️ Tem aceite — master pode excluir' : 'Excluir'}
                                    style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${aceites[h.id] ? '#fed7aa' : '#fee2e2'}`, background: aceites[h.id] ? '#fff7ed' : '#fff1f2', cursor: 'pointer', display: 'flex', alignItems: 'center', color: aceites[h.id] ? '#ea580c' : '#dc2626' }}>
                                    <Trash2 size={11} />
                                  </button>
                                )
                              }
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

      {/* ── Modal Gerar em Lote ── */}
      <Dialog open={loteOpen} onOpenChange={v => { if (!v && !loteRunning) setLoteOpen(false) }}>
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Sparkles size={17} color="#0d3f56" /> Gerar Contracheques em Lote
            </DialogTitle>
          </DialogHeader>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Competência */}
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:'#64748b', display:'block', marginBottom:4 }}>COMPETÊNCIA</label>
              <input
                type="month" value={loteComp}
                onChange={e => setLoteComp(e.target.value)}
                disabled={loteRunning}
                style={{ height:38, borderRadius:8, border:'1px solid #e2e8f0', padding:'0 12px', fontSize:14, fontWeight:700, color:'#0d3f56', outline:'none', width:'100%', boxSizing:'border-box' }}
              />
            </div>
            {/* Regras */}
            <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#0369a1', lineHeight:1.6 }}>
              <strong>O que será gerado por colaborador:</strong>
              <ul style={{ margin:'6px 0 0 16px', padding:0 }}>
                <li>Busca lançamento(s) aprovado(s) no fechamento de ponto</li>
                <li>Soma prêmios e desconta adiantamentos automaticamente</li>
                <li>Calcula FGTS (8% do bruto)</li>
                <li>Publica imediatamente e sincroniza o ponto no portal</li>
                <li>Pula colaboradores que já têm holerite mensal no mês</li>
                <li>Pula colaboradores sem lançamento aprovado</li>
              </ul>
            </div>
            {/* Log em tempo real */}
            {loteLog.length > 0 && (
              <div style={{ border:'1px solid #e2e8f0', borderRadius:8, maxHeight:220, overflowY:'auto', background:'#fafafa' }}>
                <div style={{ padding:'8px 12px', background:'#f1f5f9', borderBottom:'1px solid #e2e8f0', fontSize:11, fontWeight:700, color:'#475569' }}>
                  LOG ({loteLog.length} processado(s))
                </div>
                {loteLog.map((l, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'6px 12px', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
                    <span style={{ fontWeight:700, color: l.ok ? '#15803d' : '#b45309', flexShrink:0 }}>{l.ok ? '✅' : '⚠️'}</span>
                    <span style={{ fontWeight:600, color:'#1e293b', flexShrink:0, minWidth:160 }}>{l.nome}</span>
                    <span style={{ color:'#64748b' }}>{l.msg}</span>
                  </div>
                ))}
                {loteRunning && (
                  <div style={{ padding:'8px 12px', display:'flex', alignItems:'center', gap:6, color:'#0369a1', fontSize:12 }}>
                    <Loader2 size={12} className="animate-spin"/> Processando…
                  </div>
                )}
                {loteDone && (
                  <div style={{ padding:'8px 12px', background:'#f0fdf4', color:'#15803d', fontSize:12, fontWeight:700 }}>
                    ✅ Lote concluído — {loteLog.filter(l=>l.ok).length} gerado(s), {loteLog.filter(l=>!l.ok).length} pulado(s).
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter style={{ marginTop:8 }}>
            <Button variant="outline" onClick={() => setLoteOpen(false)} disabled={loteRunning}>Fechar</Button>
            {!loteDone && (
              <Button
                onClick={gerarLote}
                disabled={loteRunning || !loteComp}
                style={{ background:'#0d3f56', color:'#fff', gap:6 }}
              >
                {loteRunning
                  ? <><Loader2 size={13} className="animate-spin"/> Gerando…</>
                  : <><Sparkles size={13}/> Gerar Todos</>
                }
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={v => { if (!v) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              {isMaster
                ? '⚠️ ATENÇÃO (master): Este holerite pode ter aceite registrado. Ao excluir, o histórico jurídico de ciência do colaborador será perdido. Confirma?'
                : 'Este holerite será removido permanentemente. Se já foi visualizado pelo colaborador, a exclusão será bloqueada.'}
            </AlertDialogDescription>
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

// spin keyframe added via inline style
