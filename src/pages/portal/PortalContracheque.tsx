import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Receipt, LogOut, AlertCircle, Key, Eye, EyeOff, Loader2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Download, Printer, Plus, Minus, Info, CalendarDays,
  FileText, Clock, FolderOpen, FileCheck, FileX, ExternalLink,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Sessao = {
  colaborador_id: string; acesso_id: string
  login: string; nome: string; chapa: string
}

type Contracheque = {
  id: string; competencia: string; tipo: string
  descricao: string | null; arquivo_url: string | null
  bruto: number | null; liquido: number | null; descontos: number | null
  inss: number | null; fgts: number | null; irrf: number | null
  salario_base: number | null; horas_normais: number | null; horas_extras: number | null
  valor_producao: number | null; valor_dsr: number | null; valor_premio: number | null
  desconto_vt: number | null; desconto_adiant: number | null; cesta_basica: number | null
  funcao: string | null; tipo_contrato_snap: string | null; obra_nome: string | null
  dias_trabalhados: number | null; faltas: number | null
  gerado_do_sistema: boolean | null; publicado_em: string | null
}

type PontoLancamento = {
  id: string; mes_referencia: string; data_inicio: string; data_fim: string
  status: string; data_pagamento: string | null
  snap_horas_normais: number | null; snap_horas_extras: number | null
  snap_valor_horas: number | null; snap_valor_producao: number | null
  snap_valor_dsr: number | null; snap_valor_premio: number | null
  snap_valor_total: number | null; snap_faltas: number | null
  snap_desconto_vt: number | null; snap_desconto_adiant: number | null
  snap_inss: number | null; snap_ir: number | null; snap_liquido: number | null
}

type ColabInfo = {
  nome: string; chapa: string | null; cpf: string | null
  funcao: string | null; tipo_contrato: string | null
  data_admissao: string | null; salario: number | null
}

type EmpresaInfo = {
  nome: string; cnpj: string; cidade: string; logo_url: string
}

type RegistroPonto = {
  id: string
  data: string
  hora_entrada: string | null
  hora_saida: string | null
  horas_trabalhadas: number | null
  horas_extra: number | null
  horas_falta: number | null
  status: string | null
  observacoes: string | null
}

// ─── NOVO: Documento do Colaborador ──────────────────────────────────────────
type ColaboradorDocumento = {
  id: string
  titulo: string
  tipo: string
  descricao: string | null
  arquivo_url: string | null
  visivel_colaborador: boolean
  criado_em: string
  assinou_em: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_ABR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

function fmtComp(d: string) {
  const [y, m] = d.slice(0, 7).split('-')
  return `${MESES[parseInt(m) - 1]} ${y}`
}
function fmtCompAbr(d: string) {
  const [y, m] = d.slice(0, 7).split('-')
  return `${MESES_ABR[parseInt(m) - 1]}/${y}`
}
function fmtR(v: number | null | undefined): string {
  if (!v) return 'R$ 0,00'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtCPF(c: string) {
  const d = c.replace(/\D/g, '')
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}
function fmtData(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function formatarCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9,11)}`
}

function fmtHora(h: string | null): string {
  if (!h) return '—'
  return h.slice(0, 5)
}

function fmtDiaSemana(d: string): string {
  const [y, m, day] = d.split('-')
  const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(day))
  return `${DIAS_SEMANA[dt.getDay()]}, ${day}/${m}`
}

function mesesDisponiveis(): { val: string; label: string }[] {
  const result = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${MESES[d.getMonth()]} ${d.getFullYear()}`
    result.push({ val, label })
  }
  return result
}

const TIPO_LABEL: Record<string, string> = {
  mensal:'Mensal', '13o_1a':'13º Salário — 1ª Parcela',
  '13o_2a':'13º Salário — 2ª Parcela', ferias:'Férias', adiantamento:'Adiantamento',
}

const SESSION_KEY = 'contracheque_session'

// ─── Gráfico Donut SVG simples ────────────────────────────────────────────────
function DonutChart({ slices, size = 120 }: {
  slices: { valor: number; cor: string; label: string }[]
  size?: number
}) {
  const total = slices.reduce((s, sl) => s + sl.valor, 0)
  if (total <= 0) return null

  const r = size / 2 - 12
  const cx = size / 2
  const cy = size / 2
  const strokeW = 22

  let acum = -90
  const arcos = slices.map(sl => {
    const pct = sl.valor / total
    const deg = pct * 360
    const start = acum
    acum += deg
    const startRad = (start * Math.PI) / 180
    const endRad   = ((start + deg) * Math.PI) / 180
    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const largeArc = deg > 180 ? 1 : 0
    return { ...sl, pct, path: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, deg }
  })

  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={strokeW} />
      {arcos.map((a, i) => (
        <path key={i} d={a.path} fill="none" stroke={a.cor} strokeWidth={strokeW}
          strokeLinecap="butt" style={{ transition: 'all .4s' }} />
      ))}
    </svg>
  )
}

// ─── Seção expansível (accordion) ────────────────────────────────────────────
function Secao({ titulo, icone, cor, aberto, onToggle, children }: {
  titulo: string; icone: React.ReactNode; cor: string
  aberto: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ borderBottom: '1px solid #e5e7eb' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 24, height: 24, borderRadius: '50%', background: cor,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {icone}
          </span>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{titulo}</span>
        </div>
        {aberto
          ? <ChevronUp size={18} color="#6b7280" />
          : <ChevronDown size={18} color="#6b7280" />}
      </button>
      {aberto && (
        <div style={{ paddingBottom: 8 }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Linha de item (rendimento ou desconto) ──────────────────────────────────
function LinhaDetalhe({ codigo, descricao, valor, cor = '#111827' }: {
  codigo?: string; descricao: string; valor: number | null; cor?: string
}) {
  if (!valor || valor <= 0) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 16px', borderBottom: '1px solid #f3f4f6',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {codigo && (
          <span style={{
            fontSize: 10, color: '#9ca3af', fontWeight: 600, minWidth: 36,
            background: '#f3f4f6', padding: '1px 5px', borderRadius: 4,
          }}>{codigo}</span>
        )}
        <span style={{ fontSize: 14, color: '#374151' }}>{descricao}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: cor, whiteSpace: 'nowrap', marginLeft: 8 }}>
        {fmtR(valor)}
      </span>
    </div>
  )
}

// ─── Card resumo Bruto / Descontos / Líquido ─────────────────────────────────
function CardResumo({ bruto, descontos, liquido }: {
  bruto: number; descontos: number; liquido: number
}) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
      background: '#fff', borderRadius: 12, overflow: 'hidden',
      border: '1px solid #e5e7eb',
      boxShadow: '0 2px 8px rgba(0,0,0,.06)',
      margin: '0 0 4px',
    }}>
      <div style={{ padding: '14px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .4 }}>Bruto</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#16a34a' }}>{fmtR(bruto)}</div>
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={12} color="#16a34a" strokeWidth={3} />
          </span>
        </div>
      </div>
      <div style={{ background: '#e5e7eb' }}/>
      <div style={{ padding: '14px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .4 }}>Descontos</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626' }}>{fmtR(descontos)}</div>
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Minus size={12} color="#dc2626" strokeWidth={3} />
          </span>
        </div>
      </div>
      <div style={{ background: '#e5e7eb' }}/>
      <div style={{ padding: '14px 12px', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: .4 }}>Líquido</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1d4ed8' }}>{fmtR(liquido)}</div>
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="none" stroke="#1d4ed8" strokeWidth="2"/><path d="M3 6l2 2 4-4" stroke="#1d4ed8" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Aba Folha de Ponto ───────────────────────────────────────────────────────
function AbaFolhaPonto({ sessao }: { sessao: Sessao }) {
  const mesAtual = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const [mesSel, setMesSel]       = useState(mesAtual)
  const [registros, setRegistros] = useState<RegistroPonto[]>([])
  const [loading, setLoading]     = useState(false)

  const opcoesMes = mesesDisponiveis()

  const carregarPonto = useCallback(async (mes: string) => {
    setLoading(true)
    const inicio = mes + '-01'
    const fim    = mes + '-31'
    const { data, error } = await supabase
      .from('portal_ponto_diario')
      .select('id,data,hora_entrada,hora_saida,horas_trabalhadas,horas_extra,horas_falta,status,observacoes')
      .eq('colaborador_id', sessao.colaborador_id)
      .gte('data', inicio)
      .lte('data', fim)
      .order('data', { ascending: true })
    if (!error) setRegistros((data as RegistroPonto[]) ?? [])
    setLoading(false)
  }, [sessao.colaborador_id])

  useEffect(() => { carregarPonto(mesSel) }, [mesSel, carregarPonto])

  const totalHoras  = registros.reduce((s, r) => s + (r.horas_trabalhadas ?? 0), 0)
  const totalExtras = registros.reduce((s, r) => s + (r.horas_extra ?? 0), 0)
  const totalFaltas = registros.filter(r => (r.status ?? '').toLowerCase() === 'falta' || (r.status ?? '').toLowerCase() === 'falta_justificada').length
  const totalPresentes = registros.filter(r => (r.status ?? '').toLowerCase() === 'presente' || (r.status ?? '').toLowerCase() === 'meio_periodo' || (r.status ?? '').toLowerCase() === 'producao').length

  function badgeStatus(status: string | null) {
    const s = (status ?? '').toLowerCase()
    if (s === 'presente')          return { texto: 'Presente',     cor: '#16a34a', bg: '#dcfce7', border: '#86efac', emoji: '✅' }
    if (s === 'falta')             return { texto: 'Falta',        cor: '#dc2626', bg: '#fee2e2', border: '#fca5a5', emoji: '❌' }
    if (s === 'falta_justificada') return { texto: 'Falta Just.',  cor: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb', emoji: '📋' }
    if (s === 'meio_periodo')      return { texto: 'Meio Período', cor: '#92400e', bg: '#fef3c7', border: '#fde68a', emoji: '🟡' }
    if (s === 'producao')          return { texto: 'Produção',     cor: '#7c3aed', bg: '#f3e8ff', border: '#ddd6fe', emoji: '⚡' }
    if (s === 'folga')             return { texto: 'Folga',        cor: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd', emoji: '🔵' }
    return { texto: status ?? '—', cor: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb', emoji: '📅' }
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      {/* Seletor de mês */}
      <div style={{ padding: '14px 16px 10px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>
          Mês de Referência
        </label>
        <select
          value={mesSel}
          onChange={e => setMesSel(e.target.value)}
          style={{
            width: '100%', height: 42, borderRadius: 10, border: '1.5px solid #e5e7eb',
            padding: '0 12px', fontSize: 14, fontWeight: 600, color: '#1a56a0',
            background: '#fff', cursor: 'pointer', outline: 'none',
          }}
        >
          {opcoesMes.map(o => (
            <option key={o.val} value={o.val}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Cards de totais */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, padding: '12px 12px 8px' }}>
        {[
          { label: 'Presenças',  val: totalPresentes, cor: '#16a34a', bg: '#dcfce7' },
          { label: 'Faltas',     val: totalFaltas,    cor: '#dc2626', bg: '#fee2e2' },
          { label: 'H. Trab.',   val: `${totalHoras.toFixed(0)}h`,  cor: '#1d4ed8', bg: '#dbeafe' },
          { label: 'H. Extra',   val: `${totalExtras.toFixed(0)}h`, cor: '#92400e', bg: '#fef3c7' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: s.cor }}>{s.val}</div>
            <div style={{ fontSize: 9, color: s.cor, fontWeight: 600, lineHeight: 1.2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Lista de registros */}
      <div style={{ padding: '0 12px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 10 }}>
            <Loader2 size={24} className="animate-spin" color="#1a56a0" />
            <span style={{ fontSize: 13, color: '#6b7280' }}>Carregando registros…</span>
          </div>
        ) : registros.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: '32px 20px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <CalendarDays size={26} strokeWidth={1.5} color="#9ca3af" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Nenhum registro de ponto</div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.7 }}>
              Não há lançamentos para <strong>{fmtComp(mesSel)}</strong>.<br />
              Selecione outro mês ou aguarde o lançamento pelo encarregado.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {registros.map(reg => {
              const badge   = badgeStatus(reg.status)
              const isFalta = (reg.status ?? '').toLowerCase() === 'falta' || (reg.status ?? '').toLowerCase() === 'falta_justificada'
              const htrab   = reg.horas_trabalhadas ?? 0
              const hext    = reg.horas_extra ?? 0
              return (
                <div key={reg.id} style={{
                  background: '#fff', borderRadius: 12, border: `1px solid ${badge.border}`,
                  overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.04)',
                }}>
                  {/* Cabeçalho: data + badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderBottom: isFalta ? 'none' : `1px solid #f3f4f6`,
                    background: badge.bg + '50',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                      {badge.emoji} {fmtDiaSemana(reg.data)}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                      color: badge.cor, background: badge.bg, border: `1px solid ${badge.border}`,
                    }}>
                      {badge.texto}
                    </span>
                  </div>

                  {/* Observação (falta) */}
                  {isFalta && reg.observacoes && (
                    <div style={{ padding: '6px 14px 10px', fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
                      📝 {reg.observacoes}
                    </div>
                  )}

                  {/* Horários (não falta) */}
                  {!isFalta && (
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, minWidth: 52 }}>Entrada:</span>
                        <span style={{
                          fontSize: 12, fontWeight: 700,
                          color: reg.hora_entrada ? '#16a34a' : '#9ca3af',
                          background: reg.hora_entrada ? '#dcfce7' : '#f3f4f6',
                          padding: '2px 8px', borderRadius: 7,
                        }}>
                          🟢 {fmtHora(reg.hora_entrada)}
                        </span>
                        <span style={{ color: '#d1d5db' }}>→</span>
                        <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, minWidth: 44 }}>Saída:</span>
                        <span style={{
                          fontSize: 12, fontWeight: 700,
                          color: reg.hora_saida ? '#dc2626' : '#9ca3af',
                          background: reg.hora_saida ? '#fee2e2' : '#f3f4f6',
                          padding: '2px 8px', borderRadius: 7,
                        }}>
                          🔴 {fmtHora(reg.hora_saida)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {htrab > 0 && (
                          <span style={{ fontSize: 11, color: '#1a56a0', fontWeight: 700, background: '#eff6ff', padding: '2px 8px', borderRadius: 7 }}>
                            ⏱ {htrab.toFixed(1)}h trabalhadas
                          </span>
                        )}
                        {hext > 0 && (
                          <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700, background: '#fef3c7', padding: '2px 8px', borderRadius: 7 }}>
                            ⚡ {hext.toFixed(1)}h extras
                          </span>
                        )}
                        {!!reg.horas_falta && (reg.horas_falta > 0) && (
                          <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, background: '#fee2e2', padding: '2px 8px', borderRadius: 7 }}>
                            -{reg.horas_falta.toFixed(1)}h falta
                          </span>
                        )}
                      </div>
                      {reg.observacoes && (
                        <div style={{ marginTop: 5, fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
                          📝 {reg.observacoes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Rodapé totais */}
        {registros.length > 0 && (
          <div style={{ marginTop: 14, background: '#1a56a0', borderRadius: 12, padding: '13px 16px' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
              Resumo — {fmtComp(mesSel)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)', marginBottom: 2 }}>Trabalhadas</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{totalHoras.toFixed(0)}h</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)', marginBottom: 2 }}>Extras</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: totalExtras > 0 ? '#fbbf24' : '#fff' }}>
                  {totalExtras.toFixed(0)}h
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)', marginBottom: 2 }}>Faltas</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: totalFaltas > 0 ? '#fca5a5' : '#fff' }}>
                  {totalFaltas}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Aba Meus Documentos ─────────────────────────────────────────────────────
function AbaMeusDocumentos({ sessao }: { sessao: Sessao }) {
  const [documentos, setDocumentos] = useState<ColaboradorDocumento[]>([])
  const [loading, setLoading]       = useState(false)
  const [erro, setErro]             = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      // Busca documentos desta tabela (criada pelo SQL abaixo)
      const { data, error } = await supabase
        .from('colaborador_documentos')
        .select('id,titulo,tipo,descricao,arquivo_url,visivel_colaborador,criado_em,assinou_em')
        .eq('colaborador_id', sessao.colaborador_id)
        .eq('visivel_colaborador', true)
        .order('criado_em', { ascending: false })
      if (error) {
        // Tabela pode não existir ainda
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setDocumentos([])
        } else {
          setErro('Erro ao carregar documentos.')
        }
      } else {
        setDocumentos((data as ColaboradorDocumento[]) ?? [])
      }
    } catch {
      setErro('Erro ao carregar documentos.')
    }
    setLoading(false)
  }, [sessao.colaborador_id])

  useEffect(() => { carregar() }, [carregar])

  function iconeTipo(tipo: string) {
    const t = (tipo ?? '').toLowerCase()
    if (t.includes('contrato')) return { icon: <FileCheck size={20} />, cor: '#16a34a', bg: '#dcfce7' }
    if (t.includes('rescisao') || t.includes('rescisão')) return { icon: <FileX size={20} />, cor: '#dc2626', bg: '#fee2e2' }
    if (t.includes('admissao') || t.includes('admissão')) return { icon: <FileCheck size={20} />, cor: '#1d4ed8', bg: '#dbeafe' }
    return { icon: <FileText size={20} />, cor: '#6b7280', bg: '#f3f4f6' }
  }

  const TIPO_DOC_LABEL: Record<string, string> = {
    contrato_trabalho:  'Contrato de Trabalho',
    rescisao:           'Rescisão',
    admissao:           'Documentos Admissionais',
    exame_medico:       'Exame Médico',
    ferias:             'Aviso de Férias',
    comprovante:        'Comprovante',
    outro:              'Documento',
  }

  return (
    <div style={{ paddingBottom: 90 }}>
      <div style={{ padding: '12px 14px 6px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, lineHeight: 1.5 }}>
          📂 Documentos disponibilizados pelo RH para o seu acesso.
        </div>
      </div>

      <div style={{ padding: '12px 12px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', gap: 10 }}>
            <Loader2 size={24} className="animate-spin" color="#1a56a0" />
            <span style={{ fontSize: 13, color: '#6b7280' }}>Carregando documentos…</span>
          </div>
        ) : erro ? (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 12, padding: '14px 16px', color: '#dc2626', fontSize: 13 }}>
            {erro}
          </div>
        ) : documentos.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: '36px 20px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <FolderOpen size={28} strokeWidth={1.5} color="#9ca3af" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Nenhum documento disponível</div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.7 }}>
              Seus documentos aparecerão aqui quando o RH<br />
              os disponibilizar para você.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {documentos.map(doc => {
              const { icon, cor, bg } = iconeTipo(doc.tipo)
              const tipoLabel = TIPO_DOC_LABEL[doc.tipo] ?? doc.tipo ?? 'Documento'
              const dtCriado  = fmtData(doc.criado_em?.slice(0, 10) ?? null)
              const assinado  = !!doc.assinou_em
              return (
                <div key={doc.id} style={{
                  background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb',
                  overflow: 'hidden', boxShadow: '0 1px 5px rgba(0,0,0,.05)',
                }}>
                  {/* Cabeçalho */}
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '14px 14px 10px',
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: cor,
                    }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', lineHeight: 1.3 }}>
                        {doc.titulo}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                          color: cor, background: bg,
                        }}>
                          {tipoLabel}
                        </span>
                        {assinado && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                            color: '#16a34a', background: '#dcfce7', border: '1px solid #86efac',
                          }}>
                            ✓ Assinado
                          </span>
                        )}
                      </div>
                      {doc.descricao && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 5, lineHeight: 1.5 }}>
                          {doc.descricao}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rodapé */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 14px 12px', borderTop: '1px solid #f3f4f6',
                  }}>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>
                      📅 Disponível em {dtCriado}
                    </span>
                    {doc.arquivo_url ? (
                      <a
                        href={doc.arquivo_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          padding: '6px 14px', borderRadius: 8,
                          background: '#1a56a0', color: '#fff',
                          fontSize: 12, fontWeight: 700, textDecoration: 'none',
                          boxShadow: '0 2px 6px rgba(26,86,160,.3)',
                        }}
                      >
                        <Download size={13} /> Baixar
                      </a>
                    ) : (
                      <span style={{
                        fontSize: 11, color: '#9ca3af', padding: '5px 10px',
                        background: '#f3f4f6', borderRadius: 8,
                      }}>
                        Sem arquivo
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tela de contracheque completo (detalhe) ──────────────────────────────────
function TelaHolerite({ h, colab, empresa, onVoltar }: {
  h: Contracheque; colab: ColabInfo | null; empresa: EmpresaInfo | null; onVoltar: () => void
}) {
  const [secAberta, setSecAberta] = useState<'rendimentos' | 'descontos' | 'infos' | null>('rendimentos')

  const bruto    = h.bruto    ?? 0
  const descontos = (h.inss ?? 0) + (h.irrf ?? 0) + (h.desconto_vt ?? 0) + (h.desconto_adiant ?? 0) + (h.cesta_basica ?? 0) || (h.descontos ?? 0)
  const liquido  = h.liquido  ?? Math.max(0, bruto - descontos)

  const rendimentos = [
    { cod:'0001', desc:'Salário / Valor Horas',  val: h.salario_base,   cor:'#3b82f6' },
    { cod:'0002', desc:'Produção',               val: h.valor_producao, cor:'#10b981' },
    { cod:'0003', desc:'DSR',                    val: h.valor_dsr,      cor:'#6366f1' },
    { cod:'0004', desc:'Prêmios',                val: h.valor_premio,   cor:'#f59e0b' },
  ].filter(r => r.val && r.val > 0)

  if (!rendimentos.length && bruto > 0) {
    rendimentos.push({ cod:'0001', desc:'Total Rendimentos', val: bruto, cor:'#3b82f6' })
  }

  const descontosList = [
    { cod:'0101', desc:'INSS',            val: h.inss,            cor:'#ef4444' },
    { cod:'0102', desc:'IRRF',            val: h.irrf,            cor:'#f97316' },
    { cod:'0103', desc:'Vale Transporte', val: h.desconto_vt,     cor:'#8b5cf6' },
    { cod:'0104', desc:'Adiantamento',    val: h.desconto_adiant, cor:'#ec4899' },
    { cod:'0105', desc:'Cesta Básica',    val: h.cesta_basica,    cor:'#14b8a6' },
  ].filter(d => d.val && d.val > 0)

  if (!descontosList.length && descontos > 0) {
    descontosList.push({ cod:'0101', desc:'Total Descontos', val: descontos, cor:'#ef4444' })
  }

  const slicesRend = rendimentos.map(r => ({ valor: r.val!, cor: r.cor, label: r.desc }))
  const slicesDesc = descontosList.map(d => ({ valor: d.val!, cor: d.cor, label: d.desc }))

  function imprimir() {
    const w = window.open('', '_blank')
    if (!w) return
    const empresa_nome = empresa?.nome ?? 'Empresa'
    const rowsRend = rendimentos.map(r =>
      `<tr><td class="cod">${r.cod}</td><td>${r.desc}</td><td class="val green">${fmtR(r.val)}</td></tr>`).join('')
    const rowsDesc = descontosList.map(d =>
      `<tr><td class="cod">${d.cod}</td><td>${d.desc}</td><td class="val red">- ${fmtR(d.val)}</td></tr>`).join('')
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><title>Contracheque — ${fmtComp(h.competencia)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#111;background:#fff;padding:20px}
  .page{max-width:700px;margin:0 auto;border:1.5px solid #0d3f56;border-radius:6px;overflow:hidden}
  .header{background:#1a56a0;color:#fff;padding:12px 18px;display:flex;justify-content:space-between;align-items:center}
  .header h1{font-size:16px;font-weight:700}.header .sub{font-size:11px;opacity:.8;margin-top:2px}
  .func-bar{background:#f0f4f8;padding:10px 18px;border-bottom:1px solid #d0dae5;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .func-item label{font-size:9px;text-transform:uppercase;color:#6b7280;font-weight:700;display:block;margin-bottom:2px}
  .func-item span{font-size:11px;font-weight:600;color:#111}
  .resumo{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:2px solid #0d3f56;background:#f9fafb}
  .resumo-cell{padding:12px 18px;text-align:center;border-right:1px solid #e5e7eb}.resumo-cell:last-child{border-right:none}
  .resumo-label{font-size:10px;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:4px}
  .resumo-val{font-size:15px;font-weight:800}
  .green{color:#16a34a}.red{color:#dc2626}.blue{color:#1d4ed8}
  .sec-title{background:#f3f4f6;padding:7px 18px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#374151;border-bottom:1px solid #e5e7eb}
  table{width:100%;border-collapse:collapse}td{padding:7px 18px;border-bottom:1px solid #f3f4f6}
  td.cod{width:50px;color:#9ca3af;font-size:10px}td.val{text-align:right;font-weight:700;white-space:nowrap}
  .footer{padding:8px 18px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}
  @media print{body{padding:0}}
</style></head><body><div class="page">
  <div class="header"><div><h1>Contracheque</h1><div class="sub">${fmtComp(h.competencia)} · ${TIPO_LABEL[h.tipo] ?? h.tipo}</div></div>
    <div style="text-align:right"><div style="font-weight:700;font-size:14px">${empresa_nome}</div>${empresa?.cnpj ? `<div class="sub">CNPJ: ${empresa.cnpj}</div>` : ''}</div></div>
  <div class="func-bar">
    <div class="func-item"><label>Matrícula</label><span>${colab?.chapa ?? '—'}</span></div>
    <div class="func-item"><label>Nome</label><span>${colab?.nome ?? '—'}</span></div>
    <div class="func-item"><label>CPF</label><span>${colab?.cpf ? fmtCPF(colab.cpf) : '—'}</span></div>
    <div class="func-item"><label>Admissão</label><span>${fmtData(colab?.data_admissao ?? null)}</span></div>
    <div class="func-item"><label>Cargo</label><span>${h.funcao ?? colab?.funcao ?? '—'}</span></div>
    <div class="func-item"><label>Vínculo</label><span>${(h.tipo_contrato_snap ?? colab?.tipo_contrato ?? 'CLT').toUpperCase()}</span></div>
    ${h.obra_nome ? `<div class="func-item"><label>Obra</label><span>${h.obra_nome}</span></div>` : ''}
  </div>
  <div class="resumo">
    <div class="resumo-cell"><div class="resumo-label">Total Bruto</div><div class="resumo-val green">${fmtR(bruto)}</div></div>
    <div class="resumo-cell"><div class="resumo-label">Total Descontos</div><div class="resumo-val red">- ${fmtR(descontos)}</div></div>
    <div class="resumo-cell"><div class="resumo-label">Líquido a Receber</div><div class="resumo-val blue">${fmtR(liquido)}</div></div>
  </div>
  <div class="sec-title">Rendimentos</div><table><tbody>${rowsRend}</tbody></table>
  <div class="sec-title">Descontos</div><table><tbody>${rowsDesc}</tbody></table>
  ${h.fgts && h.fgts > 0 ? `<div style="font-size:10px;color:#6b7280;padding:6px 18px;background:#eff6ff;border-top:1px solid #bfdbfe">* FGTS depositado pelo empregador: <strong>${fmtR(h.fgts)}</strong></div>` : ''}
  <div class="footer"><span>${colab?.nome ?? ''} · Chapa ${colab?.chapa ?? '—'}</span><span>Publicado: ${h.publicado_em ? new Date(h.publicado_em).toLocaleDateString('pt-BR') : '—'}</span></div>
</div><script>window.onload=()=>{window.print()}</script></body></html>`)
    w.document.close()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#1a56a0', padding: '0 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', height: 52, gap: 10 }}>
          <button onClick={onVoltar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', padding: 4 }}>
            <ChevronLeft size={22} />
          </button>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, flex: 1 }}>Contracheque</span>
          <button onClick={imprimir} style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 7, padding: '5px 10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Printer size={13}/> Imprimir
          </button>
          {h.arquivo_url && (
            <a href={h.arquivo_url} target="_blank" rel="noreferrer"
              style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 7, padding: '5px 10px', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <Download size={13}/> PDF
            </a>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', width: '100%', padding: '0 0 32px' }}>
        <div style={{ background: '#1a56a0', padding: '0 16px 16px', color: '#fff' }}>
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', marginBottom: 1 }}>Empresa · Matrícula</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{empresa?.nome ?? '—'} · {colab?.chapa ?? '—'}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', marginBottom: 1 }}>Cargo / Função</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{h.funcao ?? colab?.funcao ?? '—'}</div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1a56a0' }}>{fmtComp(h.competencia)}</span>
          <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '3px 10px', borderRadius: 12, fontWeight: 600, border: '1px solid #bfdbfe' }}>
            {TIPO_LABEL[h.tipo] ?? h.tipo}
          </span>
        </div>

        <div style={{ padding: '14px 16px 8px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: .4 }}>Total</div>
          <CardResumo bruto={bruto} descontos={descontos} liquido={liquido} />
        </div>

        <div style={{ background: '#fff', marginTop: 12 }}>
          <Secao titulo="Rendimentos" icone={<Plus size={12} color="#fff" strokeWidth={3}/>} cor="#16a34a"
            aberto={secAberta === 'rendimentos'} onToggle={() => setSecAberta(s => s === 'rendimentos' ? null : 'rendimentos')}>
            {slicesRend.length > 0 && (
              <div style={{ padding: '16px 0 8px' }}>
                <DonutChart slices={slicesRend} size={140} />
                <div style={{ padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {slicesRend.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.cor, flexShrink: 0 }}/>
                      <span style={{ flex: 1 }}>{s.label}</span>
                      <span style={{ fontWeight: 600, color: s.cor }}>
                        {((s.valor / slicesRend.reduce((a,b)=>a+b.valor,0))*100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <LinhaDetalhe codigo="0001" descricao="Salário / Valor Horas"  valor={h.salario_base}   cor="#16a34a" />
              <LinhaDetalhe codigo="0002" descricao="Produção"               valor={h.valor_producao} cor="#16a34a" />
              <LinhaDetalhe codigo="0003" descricao="DSR"                    valor={h.valor_dsr}      cor="#16a34a" />
              <LinhaDetalhe codigo="0004" descricao="Prêmios"                valor={h.valor_premio}   cor="#16a34a" />
              {!h.salario_base && !h.valor_producao && bruto > 0 && (
                <LinhaDetalhe codigo="0001" descricao="Total Rendimentos" valor={bruto} cor="#16a34a" />
              )}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 16px', background:'#f0fdf4', borderTop:'2px solid #bbf7d0' }}>
                <span style={{ fontWeight:700, fontSize:13, color:'#15803d' }}>Total Rendimentos</span>
                <span style={{ fontWeight:800, fontSize:14, color:'#15803d' }}>{fmtR(bruto)}</span>
              </div>
            </div>
          </Secao>

          <Secao titulo="Descontos" icone={<Minus size={12} color="#fff" strokeWidth={3}/>} cor="#dc2626"
            aberto={secAberta === 'descontos'} onToggle={() => setSecAberta(s => s === 'descontos' ? null : 'descontos')}>
            {slicesDesc.length > 0 && (
              <div style={{ padding: '16px 0 8px' }}>
                <DonutChart slices={slicesDesc} size={140} />
                <div style={{ padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {slicesDesc.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.cor, flexShrink: 0 }}/>
                      <span style={{ flex: 1 }}>{s.label}</span>
                      <span style={{ fontWeight: 600, color: s.cor }}>
                        {((s.valor / slicesDesc.reduce((a,b)=>a+b.valor,0))*100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <LinhaDetalhe codigo="0101" descricao="INSS"            valor={h.inss}            cor="#dc2626" />
              <LinhaDetalhe codigo="0102" descricao="IRRF"            valor={h.irrf}            cor="#f97316" />
              <LinhaDetalhe codigo="0103" descricao="Vale Transporte" valor={h.desconto_vt}     cor="#8b5cf6" />
              <LinhaDetalhe codigo="0104" descricao="Adiantamento"    valor={h.desconto_adiant} cor="#ec4899" />
              <LinhaDetalhe codigo="0105" descricao="Cesta Básica"    valor={h.cesta_basica}    cor="#14b8a6" />
              {!h.inss && !h.irrf && descontos > 0 && (
                <LinhaDetalhe codigo="0101" descricao="Total Descontos" valor={descontos} cor="#dc2626" />
              )}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 16px', background:'#fff1f2', borderTop:'2px solid #fecaca' }}>
                <span style={{ fontWeight:700, fontSize:13, color:'#dc2626' }}>Total Descontos</span>
                <span style={{ fontWeight:800, fontSize:14, color:'#dc2626' }}>- {fmtR(descontos)}</span>
              </div>
            </div>
          </Secao>

          <Secao titulo="Informações Adicionais" icone={<Info size={12} color="#fff"/>} cor="#6b7280"
            aberto={secAberta === 'infos'} onToggle={() => setSecAberta(s => s === 'infos' ? null : 'infos')}>
            <div style={{ padding: '8px 0' }}>
              {[
                { label: 'Colaborador',      valor: colab?.nome ?? '—' },
                { label: 'Matrícula',        valor: colab?.chapa ?? '—' },
                { label: 'CPF',              valor: colab?.cpf ? fmtCPF(colab.cpf) : '—' },
                { label: 'Data de Admissão', valor: fmtData(colab?.data_admissao ?? null) },
                { label: 'Vínculo',          valor: (h.tipo_contrato_snap ?? colab?.tipo_contrato ?? 'CLT').toUpperCase() },
                { label: 'Obra / Setor',     valor: h.obra_nome ?? '—' },
                { label: 'Horas Normais',    valor: h.horas_normais ? `${h.horas_normais}h` : '—' },
                { label: 'Horas Extras',     valor: h.horas_extras ? `${h.horas_extras}h` : '—' },
                { label: 'Dias Trabalhados', valor: h.dias_trabalhados != null ? String(h.dias_trabalhados) : '—' },
                { label: 'Faltas',           valor: h.faltas != null ? String(h.faltas) : '—' },
              ].filter(i => i.valor !== '—').map(({ label, valor }) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 16px', borderBottom:'1px solid #f3f4f6' }}>
                  <span style={{ fontSize:13, color:'#6b7280' }}>{label}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{valor}</span>
                </div>
              ))}
              {h.fgts && h.fgts > 0 && (
                <div style={{ margin:'10px 16px 4px', padding:'9px 13px', background:'#eff6ff', borderRadius:8, border:'1px solid #bfdbfe' }}>
                  <div style={{ fontSize:11, color:'#1d4ed8', fontWeight:700, marginBottom:2 }}>FGTS — depositado pelo empregador</div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#1d4ed8' }}>{fmtR(h.fgts)}</div>
                  <div style={{ fontSize:11, color:'#3b82f6', marginTop:2 }}>Valor não deduzido do seu salário</div>
                </div>
              )}
              {h.publicado_em && (
                <div style={{ padding:'8px 16px', fontSize:11, color:'#9ca3af' }}>
                  Publicado em {new Date(h.publicado_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })}
                </div>
              )}
            </div>
          </Secao>
        </div>

        <div style={{ margin: '16px 16px 0', background: '#1a56a0', borderRadius: 12, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,.85)', fontSize: 13, fontWeight: 600 }}>💰 Líquido a Receber</span>
          <span style={{ color: '#fff', fontSize: 22, fontWeight: 900, letterSpacing: -.5 }}>{fmtR(liquido)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Aba Contracheque (lista com carrossel) ───────────────────────────────────
function AbaContracheque({ sessao, holerites, lancamentos, colab, empresa, onSelecionar }: {
  sessao: Sessao; holerites: Contracheque[]; lancamentos: PontoLancamento[]
  colab: ColabInfo | null; empresa: EmpresaInfo | null
  onSelecionar: (h: Contracheque) => void
}) {
  const [idxAtivo, setIdxAtivo]   = useState(0)
  const [pontoAberto, setPontoAberto] = useState<string | null>(null)
  const carrosselRef = useRef<HTMLDivElement>(null)

  const pontoAgrupado = lancamentos.reduce((acc, l) => {
    if (!acc[l.mes_referencia]) acc[l.mes_referencia] = []
    acc[l.mes_referencia].push(l)
    return acc
  }, {} as Record<string, PontoLancamento[]>)

  const mesesPonto = Object.keys(pontoAgrupado).sort((a, b) => b.localeCompare(a))

  function statusMes(grupo: PontoLancamento[]): { texto: string; cor: string; bg: string; border: string } {
    const todos = grupo.map(l => l.status)
    if (todos.every(s => s === 'pago'))                          return { texto:'Pago',     cor:'#15803d', bg:'#dcfce7', border:'#86efac' }
    if (todos.some(s => s === 'aprovado' || s === 'liberado'))   return { texto:'Aprovado', cor:'#1d4ed8', bg:'#dbeafe', border:'#93c5fd' }
    return { texto:'Pendente', cor:'#92400e', bg:'#fef3c7', border:'#fde68a' }
  }

  function fmtDiaMes(data: string) {
    const [, m, d] = data.split('-')
    return `${d}/${m}`
  }

  useEffect(() => {
    if (!carrosselRef.current) return
    const btns = carrosselRef.current.querySelectorAll('button[data-idx]')
    const btn = btns[idxAtivo] as HTMLElement | undefined
    btn?.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' })
  }, [idxAtivo])

  const h = holerites[idxAtivo] ?? null
  const bruto     = h?.bruto ?? 0
  const descontos = h ? ((h.inss??0)+(h.irrf??0)+(h.desconto_vt??0)+(h.desconto_adiant??0)+(h.cesta_basica??0)) || (h.descontos??0) : 0
  const liquido   = h?.liquido ?? Math.max(0, bruto - descontos)

  return (
    <div style={{ paddingBottom: 90 }}>
      {/* Header com empresa + carrossel */}
      <div style={{ background: '#1a56a0' }}>
        <div style={{ maxWidth: 500, margin: '0 auto', padding: '0 16px' }}>
          <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '7px 12px', marginBottom: 8, marginTop: 10 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)', marginBottom: 1 }}>Empresa · Matrícula</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{empresa?.nome ?? '—'} · {colab?.chapa ?? '—'}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 8, padding: '7px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.65)', marginBottom: 1 }}>Cargo / Função</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{colab?.funcao ?? '—'}</div>
          </div>

          {holerites.length > 0 && (
            <>
              <div style={{ overflowX:'auto', paddingBottom:4, scrollbarWidth:'none' }} ref={carrosselRef}>
                <div style={{ display:'flex', gap:4, paddingBottom:2, minWidth:'max-content' }}>
                  {holerites.map((hl, i) => {
                    const ativo = i === idxAtivo
                    return (
                      <button key={hl.id} data-idx={i} onClick={() => setIdxAtivo(i)}
                        style={{
                          padding:'5px 13px', borderRadius:20, fontSize:12, fontWeight:700, whiteSpace:'nowrap',
                          background: ativo ? '#fff' : 'rgba(255,255,255,.18)',
                          color: ativo ? '#1a56a0' : 'rgba(255,255,255,.85)',
                          border: ativo ? '2px solid #fff' : '2px solid transparent',
                          cursor:'pointer', transition:'all .15s',
                        }}>
                        {fmtCompAbr(hl.competencia)}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'center', gap:5, padding:'8px 0 12px' }}>
                {holerites.slice(0, 6).map((_, i) => (
                  <span key={i}
                    style={{ width:6, height:6, borderRadius:'50%', background: i===idxAtivo?'#fff':'rgba(255,255,255,.4)', cursor:'pointer', transition:'all .2s' }}
                    onClick={() => setIdxAtivo(i)}/>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 500, margin: '0 auto', width: '100%', padding: '12px 16px 16px' }}>
        {!h ? (
          <div style={{ background:'#fff', borderRadius:14, padding:'36px 24px', textAlign:'center', border:'1px solid #e5e7eb' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
              <Receipt size={32} strokeWidth={1} color="#9ca3af"/>
            </div>
            <div style={{ fontSize:17, fontWeight:700, color:'#374151', marginBottom:8 }}>Nenhum contracheque disponível</div>
            <div style={{ fontSize:13, color:'#6b7280', lineHeight:1.7, maxWidth:320, margin:'0 auto' }}>
              Seus contracheques serão exibidos aqui assim que o RH publicar os holerites do mês.
            </div>
          </div>
        ) : (
          <>
            {/* Card Bruto / Descontos / Líquido */}
            <div style={{ background:'#fff', borderRadius:14, padding:'14px 14px 10px', border:'1px solid #e5e7eb', marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,.06)' }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#111827', marginBottom:10 }}>
                {fmtComp(h.competencia)}
                <span style={{ fontSize:11, background:'#eff6ff', color:'#1d4ed8', padding:'2px 8px', borderRadius:10, marginLeft:8, fontWeight:600 }}>
                  {TIPO_LABEL[h.tipo] ?? h.tipo}
                </span>
              </div>
              <CardResumo bruto={bruto} descontos={descontos} liquido={liquido}/>
            </div>

            {/* Navegação prev/next + detalhe */}
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
              <button onClick={() => setIdxAtivo(i => Math.min(holerites.length-1, i+1))} disabled={idxAtivo >= holerites.length-1}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', cursor:idxAtivo>=holerites.length-1?'not-allowed':'pointer', fontSize:13, color:idxAtivo>=holerites.length-1?'#d1d5db':'#374151', fontWeight:600 }}>
                <ChevronLeft size={15}/> Anterior
              </button>
              <button onClick={() => onSelecionar(h)}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 18px', borderRadius:8, border:'none', background:'#1a56a0', cursor:'pointer', fontSize:13, color:'#fff', fontWeight:700 }}>
                Ver Detalhes <ChevronRight size={15}/>
              </button>
              <button onClick={() => setIdxAtivo(i => Math.max(0, i-1))} disabled={idxAtivo <= 0}
                style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 14px', borderRadius:8, border:'1px solid #e5e7eb', background:'#fff', cursor:idxAtivo<=0?'not-allowed':'pointer', fontSize:13, color:idxAtivo<=0?'#d1d5db':'#374151', fontWeight:600 }}>
                Próximo <ChevronRight size={15}/>
              </button>
            </div>

            {/* Preview rápido */}
            <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e5e7eb', overflow:'hidden', marginBottom:14 }}>
              <button onClick={() => onSelecionar(h)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:'none', border:'none', cursor:'pointer', borderBottom:'1px solid #e5e7eb' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center' }}><Plus size={11} color="#16a34a" strokeWidth={3}/></span>
                  <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Rendimentos</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'#16a34a' }}>{fmtR(bruto)}</span>
                  <ChevronDown size={16} color="#9ca3af"/>
                </div>
              </button>
              <button onClick={() => onSelecionar(h)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:'none', border:'none', cursor:'pointer', borderBottom:'1px solid #e5e7eb' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}><Minus size={11} color="#dc2626" strokeWidth={3}/></span>
                  <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Descontos</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'#dc2626' }}>- {fmtR(descontos)}</span>
                  <ChevronDown size={16} color="#9ca3af"/>
                </div>
              </button>
              <button onClick={() => onSelecionar(h)} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', background:'none', border:'none', cursor:'pointer' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ width:22, height:22, borderRadius:'50%', background:'#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center' }}><Info size={11} color="#6b7280"/></span>
                  <span style={{ fontSize:14, fontWeight:600, color:'#111827' }}>Informações Adicionais</span>
                </div>
                <ChevronDown size={16} color="#9ca3af"/>
              </button>
            </div>

            {/* Histórico de lançamentos de ponto (fechamento) */}
            {mesesPonto.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>
                  📋 Histórico de Fechamento de Ponto
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {mesesPonto.map(mes => {
                    const grupo = pontoAgrupado[mes]
                    const st = statusMes(grupo)
                    const totalHorasNormais = grupo.reduce((s,l)=>s+(l.snap_horas_normais??0),0)
                    const totalHorasExtras  = grupo.reduce((s,l)=>s+(l.snap_horas_extras??0),0)
                    const totalProducao     = grupo.reduce((s,l)=>s+(l.snap_valor_producao??0),0)
                    const totalBruto        = grupo.reduce((s,l)=>s+(l.snap_valor_total??0),0)
                    const aberto            = pontoAberto === mes
                    return (
                      <div key={mes} style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,.05)' }}>
                        <button onClick={() => setPontoAberto(aberto ? null : mes)}
                          style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', background:'none', border:'none', cursor:'pointer' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:15 }}>📅</span>
                            <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{fmtComp(mes)}</span>
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, color:st.cor, background:st.bg, border:`1px solid ${st.border}` }}>{st.texto}</span>
                          </div>
                          {aberto ? <ChevronUp size={16} color="#6b7280"/> : <ChevronDown size={16} color="#6b7280"/>}
                        </button>
                        <div style={{ height:1, background:'#e5e7eb', margin:'0 14px' }}/>
                        <div style={{ padding:'9px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 10px' }}>
                          <div style={{ display:'flex', gap:5, fontSize:11, color:'#374151', alignItems:'center' }}>
                            <span style={{ color:'#6b7280' }}>⏱ H. Normais:</span>
                            <span style={{ fontWeight:700 }}>{totalHorasNormais.toFixed(1)}h</span>
                          </div>
                          <div style={{ display:'flex', gap:5, fontSize:11, color:'#374151', alignItems:'center' }}>
                            <span style={{ color:'#6b7280' }}>⚡ H. Extras:</span>
                            <span style={{ fontWeight:700 }}>{totalHorasExtras.toFixed(1)}h</span>
                          </div>
                          <div style={{ display:'flex', gap:5, fontSize:11, color:'#374151', alignItems:'center' }}>
                            <span style={{ color:'#6b7280' }}>📦 Produção:</span>
                            <span style={{ fontWeight:700 }}>{fmtR(totalProducao)}</span>
                          </div>
                          <div style={{ display:'flex', gap:5, fontSize:11, color:'#374151', alignItems:'center' }}>
                            <span style={{ color:'#6b7280' }}>💰 Total:</span>
                            <span style={{ fontWeight:800, color:'#1a56a0' }}>{fmtR(totalBruto)}</span>
                          </div>
                        </div>
                        {aberto && (
                          <div style={{ borderTop:'1px solid #e5e7eb', background:'#f9fafb', padding:'8px 14px 10px' }}>
                            {grupo.map((l, idx) => {
                              const stL = l.status==='pago'?{cor:'#15803d',bg:'#dcfce7'}:l.status==='aprovado'||l.status==='liberado'?{cor:'#1d4ed8',bg:'#dbeafe'}:{cor:'#92400e',bg:'#fef3c7'}
                              return (
                                <div key={l.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', marginBottom:4, background:'#fff', borderRadius:8, border:'1px solid #e5e7eb', fontSize:12 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                    <span style={{ fontWeight:600, color:'#1a56a0', minWidth:16 }}>P{idx+1}</span>
                                    <span style={{ color:'#374151' }}>{fmtDiaMes(l.data_inicio)}–{fmtDiaMes(l.data_fim)}</span>
                                  </div>
                                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <span style={{ fontWeight:700, color:'#111827' }}>{fmtR(l.snap_liquido)}</span>
                                    <span style={{ fontSize:10, fontWeight:700, padding:'1px 7px', borderRadius:8, color:stL.cor, background:stL.bg }}>{l.status}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Histórico completo */}
            {holerites.length > 1 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>
                  Histórico de Contracheques
                </div>
                <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden' }}>
                  {holerites.map((hl, i) => {
                    const brutoHl   = hl.bruto ?? 0
                    const descHl    = ((hl.inss??0)+(hl.irrf??0)+(hl.desconto_vt??0)+(hl.desconto_adiant??0)+(hl.cesta_basica??0)) || (hl.descontos??0)
                    const liquidoHl = hl.liquido ?? Math.max(0, brutoHl - descHl)
                    return (
                      <button key={hl.id} onClick={() => { setIdxAtivo(i); onSelecionar(hl) }}
                        style={{
                          width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                          padding:'11px 16px', background: i===idxAtivo?'#eff6ff':'transparent',
                          borderLeft: i===idxAtivo?'3px solid #1a56a0':'3px solid transparent',
                          border:'none', borderBottom:'1px solid #f3f4f6', cursor:'pointer',
                        }}>
                        <div style={{ textAlign:'left' }}>
                          <div style={{ fontSize:13, fontWeight:700, color:i===idxAtivo?'#1a56a0':'#111827' }}>{fmtComp(hl.competencia)}</div>
                          <div style={{ fontSize:11, color:'#9ca3af' }}>{TIPO_LABEL[hl.tipo] ?? hl.tipo}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'#1d4ed8' }}>{fmtR(liquidoHl)}</div>
                          <div style={{ fontSize:10, color:'#9ca3af' }}>Líquido</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Tela de Troca de Senha ───────────────────────────────────────────────────
function TrocaSenha({ acessoId, nome, onConcluido }: {
  acessoId: string; nome: string; onConcluido: (s: Sessao) => void
}) {
  const [nova, setNova]       = useState('')
  const [conf, setConf]       = useState('')
  const [showN, setShowN]     = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState('')

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (nova.length < 4) { setErro('Mínimo 4 caracteres.'); return }
    if (nova !== conf)   { setErro('As senhas não conferem.'); return }
    setLoading(true); setErro('')
    const hash = await sha256(nova)
    const { error } = await supabase.from('colaborador_acessos')
      .update({ senha_hash: hash, must_change_password: false, ultimo_acesso: new Date().toISOString() })
      .eq('id', acessoId)
    setLoading(false)
    if (error) { setErro('Erro ao salvar.'); return }
    const { data } = await supabase.from('colaborador_acessos')
      .select('colaborador_id, cpf, colaboradores(nome, chapa)')
      .eq('id', acessoId).single()
    if (!data) { setErro('Sessão inválida.'); return }
    const col = data.colaboradores as any
    const sessao: Sessao = {
      colaborador_id: data.colaborador_id, acesso_id: acessoId,
      login: data.cpf, nome: col?.nome ?? nome, chapa: col?.chapa ?? '',
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessao))
    onConcluido(sessao)
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a56a0,#0d3f56)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'32px 28px', width:'100%', maxWidth:380, boxShadow:'0 20px 50px rgba(0,0,0,.25)' }}>
        <div style={{ textAlign:'center', marginBottom:22 }}>
          <div style={{ width:58, height:58, borderRadius:14, background:'linear-gradient(135deg,#f59e0b,#d97706)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
            <Key size={26} color="#fff"/>
          </div>
          <h1 style={{ fontSize:18, fontWeight:800, color:'#111827', margin:0 }}>Criar Nova Senha</h1>
          <p style={{ fontSize:13, color:'#6b7280', margin:'6px 0 0', lineHeight:1.5 }}>
            Olá, <strong>{nome.split(' ')[0]}</strong>! Crie sua senha pessoal.
          </p>
        </div>
        <div style={{ background:'#fefce8', border:'1px solid #fde68a', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#92400e', marginBottom:16, fontWeight:600 }}>
          🔐 Primeiro acesso — defina uma senha para continuar.
        </div>
        <form onSubmit={salvar} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Nova Senha</label>
            <div style={{ position:'relative' }}>
              <input type={showN?'text':'password'} value={nova} onChange={e=>setNova(e.target.value)}
                placeholder="Mínimo 4 caracteres" autoComplete="new-password"
                style={{ width:'100%', height:44, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 44px 0 14px', fontSize:15, outline:'none', boxSizing:'border-box' }}/>
              <button type="button" onClick={()=>setShowN(s=>!s)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                {showN?<EyeOff size={17}/>:<Eye size={17}/>}
              </button>
            </div>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Confirmar Senha</label>
            <input type="password" value={conf} onChange={e=>setConf(e.target.value)}
              placeholder="Repita a senha" autoComplete="new-password"
              style={{ width:'100%', height:44, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 14px', fontSize:15, outline:'none', boxSizing:'border-box' }}/>
            {conf && nova !== conf && <p style={{ fontSize:11, color:'#dc2626', margin:'4px 0 0' }}>As senhas não conferem.</p>}
          </div>
          {erro && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'#dc2626', fontSize:13 }}>
              <AlertCircle size={13}/> {erro}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{ height:46, borderRadius:10, border:'none', cursor:loading?'not-allowed':'pointer', background:loading?'#9ca3af':'linear-gradient(135deg,#f59e0b,#d97706)', color:'#fff', fontWeight:700, fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loading?<><Loader2 size={17} className="animate-spin"/>Salvando…</>:<><Key size={15}/>Salvar e Entrar</>}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Tela de Login ────────────────────────────────────────────────────────────
function TelaLogin({ onLogin }: { onLogin: (s: Sessao) => void }) {
  const [cpfInput, setCpfInput]   = useState('')
  const [senha, setSenha]         = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [erro, setErro]           = useState('')
  const [trocar, setTrocar]       = useState<{ acessoId: string; nome: string } | null>(null)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    const cpf = cpfInput.replace(/\D/g, '')
    if (cpf.length !== 11) { setErro('CPF inválido — informe os 11 dígitos.'); return }
    if (!senha.trim())     { setErro('Informe a senha.'); return }
    setLoading(true); setErro('')
    try {
      const hash = await sha256(senha.trim())
      const { data: ac, error: errA } = await supabase
        .from('colaborador_acessos')
        .select('id,colaborador_id,cpf,senha_hash,must_change_password,ativo,colaboradores(id,nome,chapa,status)')
        .eq('cpf', cpf).single()
      if (errA || !ac)        { setErro('CPF não encontrado ou sem acesso.'); setLoading(false); return }
      if (!ac.ativo)           { setErro('Acesso desativado. Contate o RH.'); setLoading(false); return }
      if (ac.senha_hash !== hash) { setErro('Senha incorreta.'); setLoading(false); return }
      const col = ac.colaboradores as any
      if (ac.must_change_password) { setTrocar({ acessoId: ac.id, nome: col?.nome ?? 'Colaborador' }); setLoading(false); return }
      await supabase.from('colaborador_acessos').update({ ultimo_acesso: new Date().toISOString() }).eq('id', ac.id)
      const sessao: Sessao = { colaborador_id: ac.colaborador_id, acesso_id: ac.id, login: cpf, nome: col?.nome ?? 'Colaborador', chapa: col?.chapa ?? '' }
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessao))
      onLogin(sessao)
    } catch { setErro('Erro ao autenticar. Tente novamente.') }
    finally { setLoading(false) }
  }

  if (trocar) return <TrocaSenha acessoId={trocar.acessoId} nome={trocar.nome} onConcluido={onLogin} />

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a56a0,#0d3f56)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ textAlign:'center', marginBottom:28 }}>
        <div style={{ width:72, height:72, borderRadius:20, background:'rgba(255,255,255,.18)', border:'2px solid rgba(255,255,255,.35)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
          <Receipt size={32} color="#fff"/>
        </div>
        <h1 style={{ color:'#fff', fontSize:22, fontWeight:800, margin:0 }}>Portal do Colaborador</h1>
        <p style={{ color:'rgba(255,255,255,.7)', fontSize:13, margin:'6px 0 0' }}>
          Contracheque · Ponto · Documentos
        </p>
      </div>
      <div style={{ background:'#fff', borderRadius:16, padding:'28px 24px', width:'100%', maxWidth:380, boxShadow:'0 20px 50px rgba(0,0,0,.30)' }}>
        <form onSubmit={entrar} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>CPF</label>
            <input
              type="tel" inputMode="numeric" value={cpfInput}
              onChange={e => setCpfInput(formatarCPF(e.target.value))}
              placeholder="000.000.000-00"
              style={{ width:'100%', height:48, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 14px', fontSize:16, outline:'none', boxSizing:'border-box', fontFamily:'monospace' }}/>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase', letterSpacing:'.05em' }}>Senha</label>
            <div style={{ position:'relative' }}>
              <input type={showSenha?'text':'password'} value={senha} onChange={e=>setSenha(e.target.value)}
                placeholder="Sua senha" autoComplete="current-password"
                style={{ width:'100%', height:48, borderRadius:10, border:'1.5px solid #e5e7eb', padding:'0 44px 0 14px', fontSize:16, outline:'none', boxSizing:'border-box' }}/>
              <button type="button" onClick={()=>setShowSenha(s=>!s)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                {showSenha?<EyeOff size={18}/>:<Eye size={18}/>}
              </button>
            </div>
            <p style={{ fontSize:11, color:'#9ca3af', margin:'5px 0 0' }}>
              Primeiro acesso? Use a senha <strong>123</strong> e crie sua senha pessoal.
            </p>
          </div>
          {erro && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'#dc2626', fontSize:13 }}>
              <AlertCircle size={13}/> {erro}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{ height:48, borderRadius:10, border:'none', cursor:loading?'not-allowed':'pointer', background:loading?'#9ca3af':'#1a56a0', color:'#fff', fontWeight:700, fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {loading?<><Loader2 size={18} className="animate-spin"/>Verificando…</>:'Entrar'}
          </button>
        </form>
        <p style={{ textAlign:'center', fontSize:12, color:'#9ca3af', marginTop:16 }}>Problemas? Fale com o RH da empresa.</p>
      </div>
    </div>
  )
}

// ─── Layout principal com navegação por abas ─────────────────────────────────
type Aba = 'contracheque' | 'ponto' | 'documentos'

function PortalLayout({ sessao, aba, onAba, onSair, children }: {
  sessao: Sessao
  aba: Aba
  onAba: (a: Aba) => void
  onSair: () => void
  children: React.ReactNode
}) {
  const iniciais = sessao.nome.split(' ').slice(0, 2).map(s => s.charAt(0).toUpperCase()).join('')

  const abas: { id: Aba; label: string; icon: React.ReactNode }[] = [
    { id: 'contracheque', label: 'Contracheque', icon: <Receipt size={20} /> },
    { id: 'ponto',        label: 'Folha de Ponto', icon: <Clock size={20} /> },
    { id: 'documentos',   label: 'Meus Docs',   icon: <FolderOpen size={20} /> },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', display: 'flex', flexDirection: 'column', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* Header fixo */}
      <div style={{
        background: 'linear-gradient(135deg,#1565C0,#0D47A1)',
        padding: '0 14px', height: 54,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 2px 12px rgba(13,71,161,.35)',
      }}>
        {/* Avatar + nome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: 'rgba(255,255,255,.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 900, color: '#fff', letterSpacing: '-.01em',
            border: '1.5px solid rgba(255,255,255,.35)',
          }}>
            {iniciais}
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>
              {sessao.nome.split(' ')[0]}
            </div>
            <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 10, fontWeight: 500 }}>
              Portal do Colaborador
            </div>
          </div>
        </div>

        {/* Sair */}
        <button onClick={onSair} style={{
          background: 'rgba(239,68,68,.18)', border: '1px solid rgba(239,68,68,.35)',
          borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#fca5a5',
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
        }}>
          <LogOut size={12} /> Sair
        </button>
      </div>

      {/* Conteúdo com scroll */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </div>

      {/* Barra de navegação inferior (fixa) */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: '1.5px solid #e2e8f0',
        display: 'flex', zIndex: 100,
        boxShadow: '0 -4px 16px rgba(0,0,0,.10)',
      }}>
        {abas.map(a => {
          const isActive = aba === a.id
          const cor = isActive ? '#1565C0' : '#94a3b8'
          return (
            <button
              key={a.id}
              onClick={() => onAba(a.id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 4, padding: '10px 4px 12px',
                background: 'none', border: 'none', cursor: 'pointer',
                borderTop: isActive ? '2.5px solid #1565C0' : '2.5px solid transparent',
                transition: 'all .15s',
              }}
            >
              <span style={{ color: cor, transition: 'color .15s' }}>{a.icon}</span>
              <span style={{
                fontSize: 10, fontWeight: isActive ? 700 : 500,
                color: cor, whiteSpace: 'nowrap', lineHeight: 1.2,
                transition: 'all .15s',
              }}>
                {a.label}
              </span>
              {isActive && (
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#1565C0', marginTop: -2 }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function PortalContracheque() {
  const [sessao, setSessao]       = useState<Sessao | null>(() => {
    try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null }
    catch { return null }
  })
  const [holerites, setHolerites]     = useState<Contracheque[]>([])
  const [lancamentos, setLancamentos] = useState<PontoLancamento[]>([])
  const [colab, setColab]             = useState<ColabInfo | null>(null)
  const [empresa, setEmpresa]         = useState<EmpresaInfo | null>(null)
  const [loading, setLoading]         = useState(false)
  const [selecionado, setSelecionado] = useState<Contracheque | null>(null)
  const [aba, setAba]                 = useState<Aba>('contracheque')

  const carregar = useCallback(async (colaboradorId: string) => {
    setLoading(true)
    try {
      const [holRes, colRes, empRes, pontRes] = await Promise.all([
        supabase.from('contracheques')
          .select('*')
          .eq('colaborador_id', colaboradorId)
          .eq('publicado', true)
          .order('competencia', { ascending: false }),
        supabase.from('colaboradores')
          .select('nome,chapa,cpf,funcao_id,tipo_contrato,data_admissao,salario,funcoes(nome)')
          .eq('id', colaboradorId).single(),
        supabase.from('configuracoes')
          .select('chave,valor')
          .in('chave', ['empresa_nome','empresa_cnpj','empresa_cidade','empresa_logo_url']),
        supabase.from('ponto_lancamentos')
          .select('id,mes_referencia,data_inicio,data_fim,status,data_pagamento,snap_horas_normais,snap_horas_extras,snap_valor_horas,snap_valor_producao,snap_valor_dsr,snap_valor_premio,snap_valor_total,snap_faltas,snap_desconto_vt,snap_desconto_adiant,snap_inss,snap_ir,snap_liquido')
          .eq('colaborador_id', colaboradorId)
          .in('status', ['pago', 'aprovado', 'liberado'])
          .order('mes_referencia', { ascending: false })
          .order('data_inicio', { ascending: true }),
      ])
      setHolerites((holRes.data as Contracheque[]) ?? [])
      setLancamentos((pontRes.data as PontoLancamento[]) ?? [])
      const rawColab = colRes.data as any
      if (rawColab) {
        rawColab.funcao = rawColab.funcoes?.nome ?? null
        delete rawColab.funcoes
        delete rawColab.funcao_id
      }
      setColab((rawColab as ColabInfo) ?? null)
      const map: Record<string,string> = {}
      ;(empRes.data ?? []).forEach((r: any) => { map[r.chave] = r.valor })
      setEmpresa({ nome: map['empresa_nome'] ?? '', cnpj: map['empresa_cnpj'] ?? '', cidade: map['empresa_cidade'] ?? '', logo_url: map['empresa_logo_url'] ?? '' })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (sessao) carregar(sessao.colaborador_id) }, [sessao, carregar])

  function sair() {
    localStorage.removeItem(SESSION_KEY)
    setSessao(null); setHolerites([]); setLancamentos([]); setSelecionado(null); setAba('contracheque')
  }

  if (!sessao) return <TelaLogin onLogin={setSessao} />

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a56a0,#0d3f56)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <Loader2 size={40} className="animate-spin" color="#fff"/>
      <span style={{ color:'rgba(255,255,255,.8)', fontSize:14 }}>Carregando…</span>
    </div>
  )

  // Tela de detalhe do contracheque (substitui tudo)
  if (selecionado) return (
    <TelaHolerite h={selecionado} colab={colab} empresa={empresa} onVoltar={() => setSelecionado(null)} />
  )

  return (
    <PortalLayout sessao={sessao} aba={aba} onAba={setAba} onSair={sair}>
      {aba === 'contracheque' && (
        <AbaContracheque
          sessao={sessao}
          holerites={holerites}
          lancamentos={lancamentos}
          colab={colab}
          empresa={empresa}
          onSelecionar={setSelecionado}
        />
      )}
      {aba === 'ponto' && (
        <AbaFolhaPonto sessao={sessao} />
      )}
      {aba === 'documentos' && (
        <AbaMeusDocumentos sessao={sessao} />
      )}
    </PortalLayout>
  )
}
