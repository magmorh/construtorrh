import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Search, ChevronLeft, ChevronRight, Clock, CheckCircle2, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ColabRow {
  id: string
  nome: string
  chapa: string
  funcao_id: string | null
  tipo_contrato: string | null
  salario: number | null
  contratos_valores: Record<string, { ativo?: boolean; valor_hora?: number }> | null
  funcoes: { nome: string; sigla: string } | null
}

interface DiaRegistro {
  id?: string
  colaborador_id: string
  data: string                // 'YYYY-MM-DD'
  presente: boolean
  hora_entrada:    string     // 'HH:MM'
  saida_almoco:    string
  retorno_almoco:  string
  hora_saida:      string
  he_entrada:      string     // hora extra entrada
  he_saida:        string     // hora extra saída
  falta:           boolean
  justificativa:   string
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function toMin(t: string): number | null {
  if (!t || !t.includes(':')) return null
  const [h, m] = t.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function diffMin(a: string, b: string): number {
  const ma = toMin(a), mb = toMin(b)
  if (ma === null || mb === null) return 0
  let d = mb - ma
  if (d < 0) d += 1440
  return d
}

function fmtHHMM(min: number): string {
  if (min <= 0) return '00:00'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtDecimal(min: number): number {
  return parseFloat((min / 60).toFixed(2))
}

function calcDia(d: DiaRegistro): { normais: number; extras: number; total: number } {
  if (!d.presente || d.falta) return { normais: 0, extras: 0, total: 0 }

  let normais = 0
  if (d.hora_entrada && d.hora_saida) {
    let bruto = diffMin(d.hora_entrada, d.hora_saida)
    if (d.saida_almoco && d.retorno_almoco) bruto -= diffMin(d.saida_almoco, d.retorno_almoco)
    else if (d.saida_almoco) bruto -= 60
    normais = Math.max(0, bruto)
  }

  let extras = 0
  if (d.he_entrada && d.he_saida) {
    extras = Math.max(0, diffMin(d.he_entrada, d.he_saida))
  }

  return { normais, extras, total: normais + extras }
}

function diasDoMes(ano: number, mes: number): string[] {
  const dias: string[] = []
  const total = new Date(ano, mes, 0).getDate()
  for (let d = 1; d <= total; d++) {
    dias.push(`${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return dias
}

function diaSemana(data: string): string {
  const d = new Date(data + 'T12:00:00')
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()]
}

function isFDS(data: string): boolean {
  const d = new Date(data + 'T12:00:00').getDay()
  return d === 0 || d === 6
}

function emptyDia(colaborador_id: string, data: string): DiaRegistro {
  return {
    colaborador_id, data,
    presente: false, falta: false,
    hora_entrada: '', saida_almoco: '', retorno_almoco: '', hora_saida: '',
    he_entrada: '', he_saida: '', justificativa: '',
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Ponto() {
  const hoje = new Date()
  const [ano,  setAno]  = useState(hoje.getFullYear())
  const [mes,  setMes]  = useState(hoje.getMonth() + 1)
  const [busca, setBusca] = useState('')

  const [colaboradores, setColaboradores] = useState<ColabRow[]>([])
  const [loadingColabs, setLoadingColabs] = useState(true)

  // colaborador selecionado para editar folha
  const [colabSel, setColabSel] = useState<ColabRow | null>(null)

  // dias do mês para o colaborador selecionado
  const [dias, setDias] = useState<DiaRegistro[]>([])
  const [loadingDias, setLoadingDias] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── fetch colaboradores ───────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      // Tenta com join funcoes
      let { data, error } = await supabase
        .from('colaboradores')
        .select('id, nome, chapa, funcao_id, tipo_contrato, salario, contratos_valores, funcoes(nome, sigla)')
        .in('status', ['ativo', 'Ativo', 'ATIVO'])
        .order('nome')

      // Se não retornou nada por filtro de status, busca sem filtro
      if (!error && (!data || data.length === 0)) {
        const res = await supabase
          .from('colaboradores')
          .select('id, nome, chapa, funcao_id, tipo_contrato, salario, contratos_valores, funcoes(nome, sigla)')
          .order('nome')
        data = res.data
        error = res.error
      }

      if (error) {
        console.error('Erro ao buscar colaboradores:', error.message)
        toast.error('Erro ao carregar colaboradores: ' + error.message)
      }

      setColaboradores((data as unknown as ColabRow[]) ?? [])
      setLoadingColabs(false)
    }
    load()
  }, [])

  // ── fetch registros do mês para o colaborador selecionado ─────────────────
  const fetchDias = useCallback(async (colab: ColabRow, a: number, m: number) => {
    setLoadingDias(true)
    const inicio = `${a}-${String(m).padStart(2, '0')}-01`
    const fim    = `${a}-${String(m).padStart(2, '0')}-${new Date(a, m, 0).getDate()}`

    const { data } = await supabase
      .from('registro_ponto')
      .select('*')
      .eq('colaborador_id', colab.id)
      .gte('data', inicio)
      .lte('data', fim)

    const mapa: Record<string, any> = {}
    ;(data ?? []).forEach((r: any) => { mapa[r.data] = r })

    const lista = diasDoMes(a, m).map(d => {
      const r = mapa[d]
      if (!r) return emptyDia(colab.id, d)
      return {
        id: r.id,
        colaborador_id: colab.id,
        data: d,
        presente: !!(r.hora_entrada || r.hora_saida),
        falta: r.falta ?? false,
        hora_entrada:   r.hora_entrada   ?? '',
        saida_almoco:   r.saida_almoco   ?? '',
        retorno_almoco: r.retorno_almoco ?? '',
        hora_saida:     r.hora_saida     ?? '',
        he_entrada:     (r as any).he_entrada ?? '',
        he_saida:       (r as any).he_saida   ?? '',
        justificativa:  r.justificativa  ?? '',
      } as DiaRegistro
    })

    setDias(lista)
    setLoadingDias(false)
  }, [])

  // ao selecionar colaborador ou mudar mês
  useEffect(() => {
    if (colabSel) fetchDias(colabSel, ano, mes)
  }, [colabSel, ano, mes, fetchDias])

  // ── atualizar campo de um dia ─────────────────────────────────────────────
  function updDia(idx: number, field: keyof DiaRegistro, value: unknown) {
    setDias(prev => prev.map((d, i) => i !== idx ? d : { ...d, [field]: value }))
  }

  function togglePresente(idx: number) {
    setDias(prev => prev.map((d, i) => {
      if (i !== idx) return d
      const novaPresenca = !d.presente
      return novaPresenca
        ? { ...d, presente: true, falta: false }
        : { ...d, presente: false, hora_entrada: '', saida_almoco: '', retorno_almoco: '', hora_saida: '', he_entrada: '', he_saida: '' }
    }))
  }

  // ── totais do mês ─────────────────────────────────────────────────────────
  const totais = useMemo(() => {
    let normais = 0, extras = 0, faltas = 0, presentes = 0
    dias.forEach(d => {
      const c = calcDia(d)
      normais += c.normais
      extras  += c.extras
      if (d.presente && !d.falta) presentes++
      if (d.falta) faltas++
    })
    return { normais, extras, total: normais + extras, presentes, faltas }
  }, [dias])

  // ── valor hora do colaborador selecionado ─────────────────────────────────
  const valorHora = useMemo(() => {
    if (!colabSel) return 0
    // Tenta contratos_valores primeiro, depois calcula pelo salário
    const tipo = (colabSel.tipo_contrato ?? 'clt').toLowerCase()
    const cv = colabSel.contratos_valores
    if (cv && cv[tipo]?.valor_hora) return cv[tipo].valor_hora!
    // Fallback: salário mensal ÷ 220h (padrão CLT)
    if (colabSel.salario && colabSel.salario > 0) return parseFloat((colabSel.salario / 220).toFixed(4))
    return 0
  }, [colabSel])

  const valorTotal = useMemo(() => {
    if (!valorHora) return 0
    return fmtDecimal(totais.total) * valorHora
  }, [totais.total, valorHora])

  // ── salvar todos os registros do mês ─────────────────────────────────────
  const handleSalvar = async () => {
    if (!colabSel) return
    setSaving(true)

    const upserts = dias
      .filter(d => d.presente || d.falta || d.id) // só salva dias relevantes
      .map(d => {
        const c = calcDia(d)
        return {
          ...(d.id ? { id: d.id } : {}),
          colaborador_id:  d.colaborador_id,
          data:            d.data,
          hora_entrada:    d.hora_entrada  || null,
          saida_almoco:    d.saida_almoco  || null,
          retorno_almoco:  d.retorno_almoco || null,
          hora_saida:      d.hora_saida    || null,
          he_entrada:      d.he_entrada    || null,
          he_saida:        d.he_saida      || null,
          horas_trabalhadas: fmtDecimal(c.normais),
          horas_extras:      fmtDecimal(c.extras),
          falta:           d.falta,
          justificativa:   d.justificativa || null,
        }
      })

    if (upserts.length === 0) {
      toast.info('Nenhum registro para salvar')
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('registro_ponto')
      .upsert(upserts, { onConflict: 'colaborador_id,data' })

    setSaving(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success('Ponto salvo com sucesso!')
    fetchDias(colabSel, ano, mes)
  }

  // ── navegação de mês ──────────────────────────────────────────────────────
  function mesAnterior() {
    if (mes === 1) { setAno(a => a - 1); setMes(12) }
    else setMes(m => m - 1)
  }
  function mesSeguinte() {
    if (mes === 12) { setAno(a => a + 1); setMes(1) }
    else setMes(m => m + 1)
  }

  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

  // ── filtro de colaboradores ───────────────────────────────────────────────
  const colabsFiltrados = useMemo(() => {
    const q = busca.toLowerCase()
    return colaboradores.filter(c =>
      !q || c.nome.toLowerCase().includes(q) ||
      (c.chapa ?? '').toLowerCase().includes(q) ||
      (c.funcoes?.nome ?? '').toLowerCase().includes(q)
    )
  }, [colaboradores, busca])

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 80px)', overflow: 'hidden' }}>

      {/* ── PAINEL ESQUERDO: lista de colaboradores ─────────────────────── */}
      <div style={{
        width: 280, flexShrink: 0, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* cabeçalho */}
        <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={15} /> Controle de Ponto
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }} />
            <Input
              placeholder="Buscar colaborador…"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ paddingLeft: 28, fontSize: 12, height: 32 }}
            />
          </div>
        </div>

        {/* lista */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingColabs ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>Carregando…</div>
          ) : colabsFiltrados.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>Nenhum colaborador</div>
          ) : colabsFiltrados.map(c => (
            <button
              key={c.id}
              onClick={() => setColabSel(c)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                border: 'none', borderBottom: '1px solid var(--border)',
                background: colabSel?.id === c.id ? 'var(--primary)' : 'transparent',
                color: colabSel?.id === c.id ? '#fff' : 'var(--foreground)',
                cursor: 'pointer', transition: 'background 120ms',
              }}
            >
              <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, opacity: 0.7 }}>
                {c.chapa ?? '—'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 1 }}>{c.nome}</div>
              <div style={{ fontSize: 11, opacity: 0.75, marginTop: 1 }}>
                {c.funcoes?.nome ?? 'Sem função'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── PAINEL DIREITO: folha de ponto ──────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {!colabSel ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--muted-foreground)' }}>
            <span style={{ fontSize: 48 }}>👈</span>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Selecione um colaborador</div>
            <div style={{ fontSize: 13 }}>para registrar ou visualizar o ponto</div>
          </div>
        ) : (
          <>
            {/* cabeçalho da folha */}
            <div style={{
              padding: '12px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0, gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* info colaborador */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{colabSel.nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{colabSel.chapa}</span>
                    {colabSel.funcoes && <> · {colabSel.funcoes.nome}</>}
                    {valorHora > 0 && <> · R$ {valorHora.toFixed(2)}/h</>}
                  </div>
                </div>
              </div>

              {/* navegação de mês */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={mesAnterior} style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', padding: '4px 8px', display: 'flex' }}>
                  <ChevronLeft size={15} />
                </button>
                <div style={{ fontWeight: 700, fontSize: 14, minWidth: 140, textAlign: 'center' }}>
                  {MESES[mes - 1]} / {ano}
                </div>
                <button onClick={mesSeguinte} style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', cursor: 'pointer', padding: '4px 8px', display: 'flex' }}>
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* ações */}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="outline" size="sm" onClick={() => window.print()} style={{ gap: 5 }}>
                  <Printer size={13} /> Imprimir
                </Button>
                <Button size="sm" onClick={handleSalvar} disabled={saving} style={{ gap: 5 }}>
                  {saving ? '⏳ Salvando…' : '💾 Salvar Ponto'}
                </Button>
              </div>
            </div>

            {/* tabela de ponto */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
              {loadingDias ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted-foreground)' }}>Carregando registros…</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#1e3a5f', color: '#fff', position: 'sticky', top: 0, zIndex: 10 }}>
                      <th style={TH}>Dia</th>
                      <th style={TH}>Data</th>
                      <th style={{ ...TH, width: 80 }}>Presença</th>
                      <th style={TH}>Entrada</th>
                      <th style={TH}>Saída Alm.</th>
                      <th style={TH}>Ret. Alm.</th>
                      <th style={TH}>Saída</th>
                      <th style={{ ...TH, background: '#2d5a9e' }}>H.E. Entrada</th>
                      <th style={{ ...TH, background: '#2d5a9e' }}>H.E. Saída</th>
                      <th style={{ ...TH, background: '#1a4a1a' }}>H. Normais</th>
                      <th style={{ ...TH, background: '#2d5a1a' }}>H. Extras</th>
                      <th style={{ ...TH, background: '#0f3320' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dias.map((d, idx) => {
                      const fds = isFDS(d.data)
                      const calc = calcDia(d)
                      const bgRow = fds
                        ? 'rgba(100,100,100,0.07)'
                        : d.falta
                          ? 'rgba(239,68,68,0.07)'
                          : d.presente
                            ? 'rgba(22,163,74,0.04)'
                            : 'transparent'

                      return (
                        <tr key={d.data} style={{ borderBottom: '1px solid var(--border)', background: bgRow }}>

                          {/* dia da semana */}
                          <td style={{ ...TD, fontWeight: 700, color: fds ? '#9ca3af' : 'var(--foreground)', width: 40, textAlign: 'center' }}>
                            {diaSemana(d.data)}
                          </td>

                          {/* data */}
                          <td style={{ ...TD, fontWeight: 600, fontFamily: 'monospace', width: 70, textAlign: 'center' }}>
                            {d.data.slice(8)}/{d.data.slice(5, 7)}
                          </td>

                          {/* presença toggle */}
                          <td style={{ ...TD, textAlign: 'center', width: 80 }}>
                            {fds ? (
                              <span style={{ fontSize: 10, color: '#9ca3af' }}>FDS</span>
                            ) : (
                              <button
                                onClick={() => togglePresente(idx)}
                                title={d.presente ? 'Presente — clique para desmarcar' : 'Ausente — clique para confirmar presença'}
                                style={{
                                  border: 'none', background: 'none', cursor: 'pointer', padding: 2,
                                  color: d.falta ? '#dc2626' : d.presente ? '#16a34a' : '#9ca3af',
                                }}
                              >
                                {d.falta
                                  ? <span style={{ fontSize: 16 }}>✗</span>
                                  : d.presente
                                    ? <CheckCircle2 size={18} />
                                    : <span style={{ fontSize: 16, opacity: 0.4 }}>○</span>
                                }
                              </button>
                            )}
                          </td>

                          {/* campos de horário — só habilitados se presente */}
                          <td style={TD}><TimeInput disabled={!d.presente || d.falta} value={d.hora_entrada}    onChange={v => updDia(idx, 'hora_entrada',    v)} /></td>
                          <td style={TD}><TimeInput disabled={!d.presente || d.falta} value={d.saida_almoco}   onChange={v => updDia(idx, 'saida_almoco',   v)} /></td>
                          <td style={TD}><TimeInput disabled={!d.presente || d.falta} value={d.retorno_almoco} onChange={v => updDia(idx, 'retorno_almoco', v)} /></td>
                          <td style={TD}><TimeInput disabled={!d.presente || d.falta} value={d.hora_saida}     onChange={v => updDia(idx, 'hora_saida',     v)} /></td>

                          {/* hora extra */}
                          <td style={{ ...TD, background: 'rgba(45,90,158,0.05)' }}>
                            <TimeInput disabled={!d.presente || d.falta} value={d.he_entrada} onChange={v => updDia(idx, 'he_entrada', v)} />
                          </td>
                          <td style={{ ...TD, background: 'rgba(45,90,158,0.05)' }}>
                            <TimeInput disabled={!d.presente || d.falta} value={d.he_saida}   onChange={v => updDia(idx, 'he_saida',   v)} />
                          </td>

                          {/* totais */}
                          <td style={{ ...TD, textAlign: 'center', fontWeight: 600, background: 'rgba(22,163,74,0.06)', color: calc.normais > 0 ? '#15803d' : '#9ca3af' }}>
                            {calc.normais > 0 ? fmtHHMM(calc.normais) : '—'}
                          </td>
                          <td style={{ ...TD, textAlign: 'center', fontWeight: 600, background: 'rgba(45,90,158,0.06)', color: calc.extras > 0 ? '#1d4ed8' : '#9ca3af' }}>
                            {calc.extras > 0 ? fmtHHMM(calc.extras) : '—'}
                          </td>
                          <td style={{ ...TD, textAlign: 'center', fontWeight: 700, background: 'rgba(0,0,0,0.04)', color: calc.total > 0 ? 'var(--foreground)' : '#9ca3af' }}>
                            {calc.total > 0 ? fmtHHMM(calc.total) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>

                  {/* rodapé com totais */}
                  <tfoot>
                    <tr style={{ background: '#1e3a5f', color: '#fff', fontWeight: 700 }}>
                      <td colSpan={3} style={{ padding: '10px 14px', fontSize: 12 }}>
                        TOTAIS DO MÊS — {totais.presentes} dia{totais.presentes !== 1 ? 's' : ''} trabalhado{totais.presentes !== 1 ? 's' : ''}
                        {totais.faltas > 0 && <span style={{ color: '#fca5a5', marginLeft: 8 }}>· {totais.faltas} falta{totais.faltas !== 1 ? 's' : ''}</span>}
                      </td>
                      <td colSpan={6} style={{ padding: '10px 14px', fontSize: 11, color: 'rgba(255,255,255,0.7)', textAlign: 'right' }}>
                        {valorHora > 0 && <>Valor/hora: R$ {valorHora.toFixed(2)}</>}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', background: 'rgba(22,163,74,0.3)', fontSize: 13 }}>
                        {fmtHHMM(totais.normais)}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', background: 'rgba(45,90,158,0.4)', fontSize: 13 }}>
                        {fmtHHMM(totais.extras)}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', fontSize: 13 }}>
                        {fmtHHMM(totais.total)}
                      </td>
                    </tr>

                    {/* linha de valor total */}
                    <tr style={{ background: '#0f2d4a', color: '#fff' }}>
                      <td colSpan={9} style={{ padding: '10px 14px', fontSize: 12 }}>
                        {fmtDecimal(totais.normais)}h normais + {fmtDecimal(totais.extras)}h extras = <strong>{fmtDecimal(totais.total)}h total</strong>
                      </td>
                      <td colSpan={3} style={{ padding: '10px 14px', textAlign: 'right', fontSize: 15 }}>
                        {valorHora > 0 ? (
                          <span>
                            💰 <strong>{formatCurrency(valorTotal)}</strong>
                            <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 6 }}>valor bruto estimado</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, opacity: 0.6 }}>Cadastre o valor/hora na função para ver o total</span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Estilos base das células ──────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: '9px 6px', fontWeight: 700, fontSize: 11,
  textTransform: 'uppercase', letterSpacing: '0.04em',
  textAlign: 'center', whiteSpace: 'nowrap',
}

const TD: React.CSSProperties = {
  padding: '4px 4px',
}

// ─── Input de hora ─────────────────────────────────────────────────────────────

function TimeInput({ value, onChange, disabled }: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{
        width: 80, padding: '3px 4px', fontSize: 12,
        border: '1px solid var(--border)', borderRadius: 4,
        background: disabled ? 'transparent' : 'var(--background)',
        color: disabled ? 'var(--muted-foreground)' : 'var(--foreground)',
        textAlign: 'center', fontFamily: 'monospace',
        cursor: disabled ? 'not-allowed' : 'text',
        outline: 'none',
      }}
    />
  )
}
