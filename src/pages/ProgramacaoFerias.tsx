import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, Umbrella, CalendarDays, AlertTriangle, CheckCircle2, Clock, ChevronDown, ChevronUp, Bell, ThumbsUp, ThumbsDown, X } from 'lucide-react'

// ─── Tipo solicitação ─────────────────────────────────────────────────────────
interface Solicitacao {
  id: string
  colaborador_id: string
  data_inicio_solicitada: string
  data_fim_solicitada: string
  dias_solicitados: number
  status: 'pendente' | 'aprovada' | 'recusada'
  motivo_recusa?: string | null
  periodo_concessivo_inicio?: string | null
  periodo_concessivo_fim?: string | null
  created_at: string
  colaboradores?: { nome: string; chapa: string }
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface Colab {
  id: string
  nome: string
  chapa: string
  data_admissao: string | null
  tipo_contrato: string
  status: string
}

interface PeriodoFerias {
  numero: number           // 1º, 2º, 3º período...
  aquisitivo_inicio: string
  aquisitivo_fim: string
  concessivo_inicio: string
  concessivo_fim: string
  faltas: number
  dias_direito: number     // 30, 24, 18, 12 ou 0
  situacao: 'vigente' | 'concessivo' | 'vencido' | 'futuro'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const hoje = new Date()

function addYears(d: Date, n: number): Date {
  const r = new Date(d); r.setFullYear(r.getFullYear() + n); return r
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function fmtDate(d: string | Date): string {
  const dt = typeof d === 'string' ? new Date(d + 'T12:00:00') : d
  return dt.toLocaleDateString('pt-BR')
}
function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function diasEntre(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000))
}

/** Regra CLT art. 130 */
function diasDireitoFerias(faltas: number): number {
  if (faltas <= 5)  return 30
  if (faltas <= 14) return 24
  if (faltas <= 23) return 18
  if (faltas <= 32) return 12
  return 0
}

/** Gera todos os períodos aquisitivos desde a admissão até hoje+1 ano */
function gerarPeriodos(admissao: Date): PeriodoFerias[] {
  const periodos: PeriodoFerias[] = []
  let inicio = admissao
  let num = 1
  while (true) {
    const fim    = addDays(addYears(inicio, 1), -1) // 1 ano menos 1 dia
    const conc_i = addDays(fim, 1)
    const conc_f = addDays(addYears(conc_i, 1), -1)

    // Se o período aquisitivo ainda nem começou, parar
    if (inicio > hoje) break

    periodos.push({
      numero: num,
      aquisitivo_inicio: toISO(inicio),
      aquisitivo_fim:    toISO(fim),
      concessivo_inicio: toISO(conc_i),
      concessivo_fim:    toISO(conc_f),
      faltas: 0,
      dias_direito: 30,
      situacao: 'futuro',
    })

    inicio = addDays(fim, 1)
    num++
    if (num > 30) break // segurança
  }
  return periodos
}

function classificarSituacao(p: PeriodoFerias): PeriodoFerias['situacao'] {
  const acqFim  = new Date(p.aquisitivo_fim  + 'T23:59:59')
  const concFim = new Date(p.concessivo_fim  + 'T23:59:59')
  const concIni = new Date(p.concessivo_inicio + 'T00:00:00')

  if (hoje <= acqFim)  return 'vigente'   // ainda no período aquisitivo
  if (hoje <= concFim) return 'concessivo' // no período concessivo
  return 'vencido'
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function ProgramacaoFerias() {
  const [colabs, setColabs]   = useState<Colab[]>([])
  const [faltas, setFaltas]   = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [busca, setBusca]     = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [abaAtiva, setAbaAtiva]   = useState<'colaboradores' | 'solicitacoes'>('solicitacoes')

  // ── Solicitações ──
  const [solicitacoes, setSolicitacoes]       = useState<Solicitacao[]>([])
  const [loadingSols, setLoadingSols]         = useState(false)
  const [modalRecusa, setModalRecusa]         = useState<Solicitacao | null>(null)
  const [motivoRecusa, setMotivoRecusa]       = useState('')
  const [processando, setProcessando]         = useState<string | null>(null)

  const carregarSolicitacoes = useCallback(async () => {
    setLoadingSols(true)
    const { data } = await supabase
      .from('solicitacoes_ferias')
      .select('*, colaboradores(nome, chapa)')
      .order('created_at', { ascending: false })
    setSolicitacoes((data ?? []) as Solicitacao[])
    setLoadingSols(false)
  }, [])

  async function aprovar(sol: Solicitacao) {
    setProcessando(sol.id)
    await supabase.from('solicitacoes_ferias').update({ status: 'aprovada' }).eq('id', sol.id)
    await carregarSolicitacoes()
    setProcessando(null)
  }

  async function recusar() {
    if (!modalRecusa) return
    setProcessando(modalRecusa.id)
    await supabase.from('solicitacoes_ferias').update({ status: 'recusada', motivo_recusa: motivoRecusa || 'Solicitação recusada pelo RH.' }).eq('id', modalRecusa.id)
    await carregarSolicitacoes()
    setModalRecusa(null); setMotivoRecusa(''); setProcessando(null)
  }

  // Carregar colaboradores CLT ativos
  useEffect(() => {
    async function load() {
      setLoading(true)

      // 1 — colaboradores CLT
      const { data: colabsData } = await supabase
        .from('colaboradores')
        .select('id,nome,chapa,data_admissao,tipo_contrato,status')
        .eq('tipo_contrato', 'clt')
        .in('status', ['ativo', 'ferias', 'afastado'])
        .order('nome')

      const clt = (colabsData ?? []) as Colab[]
      setColabs(clt)

      if (clt.length === 0) { setLoading(false); return }

      // 2 — buscar todas as faltas (registro_ponto onde falta=true)
      const ids = clt.map(c => c.id)
      const { data: pontosRaw } = await supabase
        .from('registro_ponto')
        .select('colaborador_id, data, falta, evento')
        .in('colaborador_id', ids)
        .eq('falta', true)

      const mapa: Record<string, string[]> = {}
      ;(pontosRaw ?? []).forEach((r: any) => {
        // Só conta faltas injustificadas (falta=true e evento não é atestado/feriado_remunerado)
        if (r.evento === 'atestado') return
        if (!mapa[r.colaborador_id]) mapa[r.colaborador_id] = []
        mapa[r.colaborador_id].push(r.data)
      })
      setFaltas(mapa)
      setLoading(false)
    }
    load()
    carregarSolicitacoes()
  }, [carregarSolicitacoes])

  // Calcular férias por colaborador
  const dados = useMemo(() => {
    return colabs.map(c => {
      if (!c.data_admissao) return { colab: c, periodos: [] }

      const admissao = new Date(c.data_admissao + 'T12:00:00')
      const periodos = gerarPeriodos(admissao)
      const faltasColab = faltas[c.id] ?? []

      const periodosCalc = periodos.map(p => {
        // Contar faltas SOMENTE dentro do período aquisitivo
        const acqIni = new Date(p.aquisitivo_inicio + 'T00:00:00')
        const acqFim = new Date(p.aquisitivo_fim    + 'T23:59:59')
        const faltasPeriodo = faltasColab.filter(data => {
          const d = new Date(data + 'T12:00:00')
          return d >= acqIni && d <= acqFim
        }).length

        const dias  = diasDireitoFerias(faltasPeriodo)
        const sit   = classificarSituacao(p)

        return { ...p, faltas: faltasPeriodo, dias_direito: dias, situacao: sit }
      })

      return { colab: c, periodos: periodosCalc }
    })
  }, [colabs, faltas])

  const filtrado = useMemo(() => {
    if (!busca) return dados
    const q = busca.toLowerCase()
    return dados.filter(d =>
      d.colab.nome.toLowerCase().includes(q) ||
      d.colab.chapa?.toLowerCase().includes(q)
    )
  }, [dados, busca])

  // ─── Render ───────────────────────────────────────────────────────────────
  const SIT_CONFIG = {
    vigente:    { label: 'Aquisitivo em andamento', color: '#1d4ed8', bg: '#dbeafe', icon: '⏳' },
    concessivo: { label: 'Período Concessivo',      color: '#15803d', bg: '#dcfce7', icon: '✅' },
    vencido:    { label: 'Período Vencido',          color: '#b91c1c', bg: '#fee2e2', icon: '⚠️' },
    futuro:     { label: 'Futuro',                   color: '#64748b', bg: '#f1f5f9', icon: '🔜' },
  }

  const pendentes = solicitacoes.filter(s => s.status === 'pendente')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--background)' }}>
      {/* Cabeçalho */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Umbrella size={20} color="#0369a1" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Programação de Férias</div>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Colaboradores CLT · Períodos aquisitivos e concessivos</div>
          </div>
        </div>
        {abaAtiva === 'colaboradores' && (
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar colaborador…"
              style={{ paddingLeft: 28, paddingRight: 10, height: 34, border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, background: 'var(--background)', color: 'var(--foreground)', width: 220 }} />
          </div>
        )}
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--card)', paddingLeft: 16 }}>
        {([
          { id: 'solicitacoes', label: 'Solicitações', icon: <Bell size={13}/> },
          { id: 'colaboradores', label: 'Colaboradores', icon: <Umbrella size={13}/> },
        ] as const).map(a => (
          <button key={a.id} onClick={() => setAbaAtiva(a.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: abaAtiva === a.id ? 700 : 500, color: abaAtiva === a.id ? '#0369a1' : 'var(--muted-foreground)', borderBottom: abaAtiva === a.id ? '2px solid #0369a1' : '2px solid transparent', marginBottom: -1 }}>
            {a.icon} {a.label}
            {a.id === 'solicitacoes' && pendentes.length > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 800, padding: '0 6px', minWidth: 18, textAlign: 'center' }}>{pendentes.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Legenda rápida — só na aba colaboradores */}
      {abaAtiva === 'colaboradores' && (
        <div style={{ padding: '8px 20px', background: '#f8fafc', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {Object.entries(SIT_CONFIG).filter(([k]) => k !== 'futuro').map(([k, v]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: v.bg, border: `1px solid ${v.color}`, display: 'inline-block' }} />
              <span style={{ color: v.color, fontWeight: 600 }}>{v.icon} {v.label}</span>
            </span>
          ))}
          <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto' }}>Regra: ≤5 faltas=30d · 6-14=24d · 15-23=18d · 24-32=12d · +32=perde</span>
        </div>
      )}

      {/* ── ABA SOLICITAÇÕES ── */}
      {abaAtiva === 'solicitacoes' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loadingSols ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-foreground)' }}>⏳ Carregando…</div>
          ) : solicitacoes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted-foreground)' }}>
              <Bell size={36} style={{ opacity: 0.2, marginBottom: 12, display: 'block', margin: '0 auto 12px' }}/>
              <div style={{ fontWeight: 600 }}>Nenhuma solicitação ainda</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>As solicitações dos colaboradores aparecerão aqui.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(['pendente', 'aprovada', 'recusada'] as const).map(status => {
                const grupo = solicitacoes.filter(s => s.status === status)
                if (grupo.length === 0) return null
                const cfg = { pendente: { label: '⏳ Aguardando Aprovação', cor: '#92400e', bg: '#fef3c7', border: '#fde68a' }, aprovada: { label: '✅ Aprovadas', cor: '#15803d', bg: '#dcfce7', border: '#bbf7d0' }, recusada: { label: '❌ Recusadas', cor: '#b91c1c', bg: '#fee2e2', border: '#fecaca' } }[status]
                return (
                  <div key={status}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: cfg.cor, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cfg.label} ({grupo.length})</div>
                    {grupo.map(sol => (
                      <div key={sol.id} style={{ background: 'var(--card)', border: `1px solid ${cfg.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                          {/* Avatar */}
                          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                            {(sol.colaboradores?.nome ?? '?').charAt(0)}
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 180 }}>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{sol.colaboradores?.nome ?? 'Colaborador'}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>{sol.colaboradores?.chapa}</div>
                            <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                              <span>📅 <strong>{fmtDate(sol.data_inicio_solicitada)}</strong> → <strong>{fmtDate(sol.data_fim_solicitada)}</strong></span>
                              <span style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: 5, padding: '1px 7px', fontWeight: 700 }}>🏖️ {sol.dias_solicitados} dias</span>
                            </div>
                            {sol.periodo_concessivo_inicio && (
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                Janela concessiva: {fmtDate(sol.periodo_concessivo_inicio)} → {fmtDate(sol.periodo_concessivo_fim!)}
                              </div>
                            )}
                            {sol.motivo_recusa && (
                              <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4, fontStyle: 'italic' }}>Motivo: {sol.motivo_recusa}</div>
                            )}
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                              Solicitado em {new Date(sol.created_at).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                          {/* Ações — só para pendentes */}
                          {sol.status === 'pendente' && (
                            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                              <button onClick={() => aprovar(sol)} disabled={processando === sol.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: processando === sol.id ? 0.6 : 1 }}>
                                <ThumbsUp size={14}/> Aprovar
                              </button>
                              <button onClick={() => { setModalRecusa(sol); setMotivoRecusa('') }} disabled={processando === sol.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: processando === sol.id ? 0.6 : 1 }}>
                                <ThumbsDown size={14}/> Recusar
                              </button>
                            </div>
                          )}
                          {sol.status !== 'pendente' && (
                            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: cfg.bg, color: cfg.cor, alignSelf: 'flex-start' }}>
                              {sol.status === 'aprovada' ? '✅ Aprovada' : '❌ Recusada'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ABA COLABORADORES ── */}
      {abaAtiva === 'colaboradores' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-foreground)' }}>⏳ Carregando…</div>
        ) : filtrado.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted-foreground)' }}>Nenhum colaborador CLT encontrado.</div>
        ) : (
          filtrado.map(({ colab, periodos }) => {
            const aberto = expandido === colab.id
            // Período ativo (concessivo ou último vigente)
            const periodoAtivo = periodos.find(p => p.situacao === 'concessivo') ?? periodos.find(p => p.situacao === 'vigente')
            const temVencido   = periodos.some(p => p.situacao === 'vencido' && p.dias_direito > 0)

            return (
              <div key={colab.id} style={{ background: 'var(--card)', border: `1px solid ${temVencido ? '#fecaca' : 'var(--border)'}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                {/* Linha principal */}
                <div
                  onClick={() => setExpandido(aberto ? null : colab.id)}
                  style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                >
                  {/* Avatar */}
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>
                    {colab.nome.charAt(0)}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{colab.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                      {colab.chapa} · Admissão: {colab.data_admissao ? fmtDate(colab.data_admissao) : '—'}
                    </div>
                  </div>

                  {/* Badge período ativo */}
                  {periodoAtivo && (
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      {periodoAtivo.situacao === 'concessivo' ? (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', background: '#dcfce7', borderRadius: 6, padding: '2px 8px', marginBottom: 2 }}>
                            🏖️ {periodoAtivo.dias_direito} dias disponíveis
                          </div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>
                            Janela: {fmtDate(periodoAtivo.concessivo_inicio)} → {fmtDate(periodoAtivo.concessivo_fim)}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', borderRadius: 6, padding: '2px 8px', marginBottom: 2 }}>
                            ⏳ {periodoAtivo.dias_direito} dias (em aquisição)
                          </div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>
                            Completa em: {fmtDate(periodoAtivo.aquisitivo_fim)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Alerta vencido */}
                  {temVencido && (
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, background: '#fee2e2', color: '#b91c1c', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 700 }}>
                      <AlertTriangle size={12} /> Período vencido!
                    </div>
                  )}

                  {aberto ? <ChevronUp size={16} color="#94a3b8" /> : <ChevronDown size={16} color="#94a3b8" />}
                </div>

                {/* Detalhe expandido */}
                {aberto && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: '#f8fafc' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Histórico de Períodos:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {periodos.map(p => {
                        const cfg = SIT_CONFIG[p.situacao]
                        const diasRestantes = p.situacao === 'concessivo'
                          ? diasEntre(hoje, new Date(p.concessivo_fim + 'T23:59:59'))
                          : null
                        return (
                          <div key={p.numero} style={{ background: 'white', border: `1px solid ${p.situacao === 'vencido' && p.dias_direito > 0 ? '#fecaca' : '#e5e7eb'}`, borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: '28px 1fr 1fr 1fr auto', gap: 8, alignItems: 'center', fontSize: 12 }}>
                            {/* Número */}
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: cfg.bg, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11 }}>{p.numero}</div>

                            {/* Aquisitivo */}
                            <div>
                              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 1 }}>PERÍODO AQUISITIVO</div>
                              <div style={{ fontWeight: 600, color: '#374151' }}>{fmtDate(p.aquisitivo_inicio)} → {fmtDate(p.aquisitivo_fim)}</div>
                            </div>

                            {/* Concessivo */}
                            <div>
                              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 1 }}>JANELA CONCESSIVA</div>
                              <div style={{ fontWeight: 600, color: p.situacao === 'concessivo' ? '#15803d' : p.situacao === 'vencido' ? '#b91c1c' : '#374151' }}>
                                {fmtDate(p.concessivo_inicio)} → {fmtDate(p.concessivo_fim)}
                              </div>
                              {diasRestantes !== null && diasRestantes >= 0 && (
                                <div style={{ fontSize: 10, color: '#15803d', fontWeight: 600 }}>⏰ {diasRestantes} dias restantes na janela</div>
                              )}
                            </div>

                            {/* Faltas e dias */}
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 1 }}>FALTAS / DIREITO</div>
                              <div style={{ fontWeight: 700 }}>
                                <span style={{ color: p.faltas > 5 ? '#dc2626' : '#374151' }}>{p.faltas} faltas</span>
                                <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span>
                                <span style={{ color: p.dias_direito === 0 ? '#b91c1c' : '#15803d', background: p.dias_direito === 0 ? '#fee2e2' : '#dcfce7', borderRadius: 4, padding: '1px 6px' }}>
                                  {p.dias_direito === 0 ? 'Perde direito' : `${p.dias_direito} dias`}
                                </span>
                              </div>
                            </div>

                            {/* Status */}
                            <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
                              {cfg.icon} {cfg.label}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
      )}

      {/* ── MODAL RECUSA ── */}
      {modalRecusa && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--card)', borderRadius:14, width:'100%', maxWidth:460, padding:28, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontWeight:800, fontSize:16 }}>❌ Recusar Solicitação</div>
              <button onClick={() => setModalRecusa(null)} style={{ background:'none', border:'none', cursor:'pointer', padding:4 }}><X size={18} color="#64748b"/></button>
            </div>
            <div style={{ fontSize:13, color:'var(--muted-foreground)', marginBottom:16 }}>
              <strong>{modalRecusa.colaboradores?.nome}</strong> — {fmtDate(modalRecusa.data_inicio_solicitada)} → {fmtDate(modalRecusa.data_fim_solicitada)} ({modalRecusa.dias_solicitados} dias)
            </div>
            <label style={{ display:'block', fontSize:12, fontWeight:700, marginBottom:6, color:'var(--muted-foreground)' }}>Motivo da recusa (opcional)</label>
            <textarea value={motivoRecusa} onChange={e => setMotivoRecusa(e.target.value)} rows={3}
              placeholder="Ex: período de alta demanda, conflito com outro colaborador…"
              style={{ width:'100%', padding:'8px 10px', fontSize:13, border:'1px solid var(--border)', borderRadius:8, background:'var(--background)', color:'var(--foreground)', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }}/>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => setModalRecusa(null)} style={{ padding:'8px 18px', borderRadius:8, border:'1px solid var(--border)', background:'var(--background)', cursor:'pointer', fontSize:13, fontWeight:600 }}>Cancelar</button>
              <button onClick={recusar} disabled={!!processando} style={{ padding:'8px 18px', borderRadius:8, border:'none', background:'#dc2626', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, opacity: processando ? 0.6 : 1 }}>
                ❌ Confirmar Recusa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
