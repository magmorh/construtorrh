import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Receipt, LogOut, Printer, AlertCircle, Key,
  Eye, EyeOff, Loader2, Building2, User, Calendar,
  ChevronDown, ChevronUp, Download,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Sessao = {
  colaborador_id: string; acesso_id: string
  login: string; nome: string; chapa: string
}

type Contracheque = {
  id: string; competencia: string; tipo: string; descricao: string | null
  arquivo_url: string | null; arquivo_nome: string | null
  bruto: number | null; liquido: number | null; descontos: number | null
  inss: number | null; fgts: number | null; irrf: number | null
  salario_base: number | null; horas_normais: number | null; horas_extras: number | null
  valor_producao: number | null; valor_dsr: number | null; valor_premio: number | null
  desconto_vt: number | null; desconto_adiant: number | null; cesta_basica: number | null
  funcao: string | null; tipo_contrato_snap: string | null; obra_nome: string | null
  dias_trabalhados: number | null; faltas: number | null
  gerado_do_sistema: boolean; publicado_em: string | null
}

type ColabInfo = {
  nome: string; chapa: string; cpf: string
  funcao: string | null; tipo_contrato: string | null
  data_admissao: string | null; salario: number | null
}

type EmpresaInfo = {
  nome: string; cnpj: string; endereco: string
  cidade: string; telefone: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const MESES_ABR  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function fmtComp(d: string) {
  const [y, m] = d.split('-')
  return `${MESES_FULL[parseInt(m) - 1]} / ${y}`
}
function fmtCompAbr(d: string) {
  const [y, m] = d.split('-')
  return `${MESES_ABR[parseInt(m) - 1]}/${y}`
}
function fmtR(v: number | null, prefix = true): string {
  if (!v) return prefix ? 'R$ 0,00' : '0,00'
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

const TIPO_LABEL: Record<string, string> = {
  mensal: 'Mensal', '13o_1a': '13º Salário — 1ª Parcela',
  '13o_2a': '13º Salário — 2ª Parcela', ferias: 'Férias', adiantamento: 'Adiantamento',
}

const SESSION_KEY = 'contracheque_session'

// ─── Item de linha do contracheque ───────────────────────────────────────────
function LinhaItem({ codigo, descricao, valor, tipo }: {
  codigo: string; descricao: string; valor: number | null; tipo: 'provento' | 'desconto' | 'info'
}) {
  if (!valor || valor <= 0) return null
  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '7px 12px', fontSize: 12, color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap' }}>{codigo}</td>
      <td style={{ padding: '7px 12px', fontSize: 13, color: '#374151', flex: 1 }}>{descricao}</td>
      <td style={{
        padding: '7px 12px', fontSize: 13, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap',
        color: tipo === 'provento' ? '#15803d' : tipo === 'desconto' ? '#dc2626' : '#0369a1',
      }}>
        {tipo === 'desconto' ? `- ${fmtR(valor)}` : tipo === 'info' ? `* ${fmtR(valor)}` : fmtR(valor)}
      </td>
    </tr>
  )
}

// ─── Card de holerite (estilo ponto.gov) ─────────────────────────────────────
function HoleriteCard({ h, colab, empresa }: {
  h: Contracheque; colab: ColabInfo | null; empresa: EmpresaInfo | null
}) {
  const [expandido, setExpandido] = useState(false)

  // Calcular totais reais
  const totalProventos = (h.bruto ?? 0)
  const totalDescontos = (
    (h.inss ?? 0) + (h.irrf ?? 0) +
    (h.desconto_vt ?? 0) + (h.desconto_adiant ?? 0) + (h.cesta_basica ?? 0)
  ) || (h.descontos ?? 0)
  const liquido = h.liquido ?? Math.max(0, totalProventos - totalDescontos)

  const temDetalhes = h.salario_base || h.valor_producao || h.valor_dsr || h.valor_premio ||
                      h.inss || h.irrf || h.desconto_vt || h.desconto_adiant

  function imprimir() {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const empresaNome = empresa?.nome ?? 'Empresa'
    const empresaCnpj = empresa?.cnpj ? `CNPJ: ${empresa.cnpj}` : ''
    const empresaEnd  = [empresa?.endereco, empresa?.cidade].filter(Boolean).join(' — ')

    const linhasProventos: {cod:string;desc:string;val:number}[] = []
    const linhasDescontos: {cod:string;desc:string;val:number}[] = []

    if (h.salario_base && h.salario_base > 0)   linhasProventos.push({ cod:'0001', desc:'Salário / Valor Horas', val: h.salario_base })
    if (h.valor_producao && h.valor_producao>0)  linhasProventos.push({ cod:'0002', desc:'Produção', val: h.valor_producao })
    if (h.valor_dsr && h.valor_dsr>0)            linhasProventos.push({ cod:'0003', desc:'DSR – Descanso Semanal Remunerado', val: h.valor_dsr })
    if (h.valor_premio && h.valor_premio>0)      linhasProventos.push({ cod:'0004', desc:'Prêmios', val: h.valor_premio })
    if (!linhasProventos.length && h.bruto)      linhasProventos.push({ cod:'0001', desc:'Total Proventos', val: h.bruto })

    if (h.inss && h.inss>0)                      linhasDescontos.push({ cod:'0101', desc:'INSS', val: h.inss })
    if (h.irrf && h.irrf>0)                      linhasDescontos.push({ cod:'0102', desc:'IRRF', val: h.irrf })
    if (h.desconto_vt && h.desconto_vt>0)        linhasDescontos.push({ cod:'0103', desc:'Vale Transporte', val: h.desconto_vt })
    if (h.desconto_adiant && h.desconto_adiant>0)linhasDescontos.push({ cod:'0104', desc:'Adiantamento', val: h.desconto_adiant })
    if (h.cesta_basica && h.cesta_basica>0)      linhasDescontos.push({ cod:'0105', desc:'Cesta Básica', val: h.cesta_basica })

    const maxRows = Math.max(linhasProventos.length, linhasDescontos.length)
    let tabelaRows = ''
    for (let i=0; i<maxRows; i++) {
      const p = linhasProventos[i]
      const d = linhasDescontos[i]
      tabelaRows += `<tr>
        <td class="cod">${p?.cod??''}</td><td class="desc">${p?.desc??''}</td><td class="val prov">${p ? fmtR(p.val) : ''}</td>
        <td class="sep"></td>
        <td class="cod">${d?.cod??''}</td><td class="desc">${d?.desc??''}</td><td class="val desc">${d ? `- ${fmtR(d.val)}` : ''}</td>
      </tr>`
    }

    printWindow.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8"><title>Contracheque — ${fmtComp(h.competencia)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #222; background: #fff; padding: 16px; }
  .page { max-width: 780px; margin: 0 auto; border: 1.5px solid #0d3f56; border-radius: 4px; overflow: hidden; }
  
  /* Cabeçalho empresa */
  .header { background: #0d3f56; color: #fff; padding: 12px 16px; display: flex; justify-content: space-between; align-items: flex-start; }
  .empresa-nome { font-size: 15px; font-weight: 700; margin-bottom: 2px; }
  .empresa-meta { font-size: 10px; opacity: .85; }
  .comp-box { text-align: right; }
  .comp-title { font-size: 10px; opacity: .75; text-transform: uppercase; letter-spacing: 1px; }
  .comp-val { font-size: 14px; font-weight: 700; margin-top: 2px; }
  .tipo-badge { font-size: 10px; background: rgba(255,255,255,.2); padding: 2px 7px; border-radius: 3px; margin-top: 4px; display: inline-block; }

  /* Dados do funcionário */
  .func-section { background: #f0f4f8; border-bottom: 1px solid #d0dae5; padding: 10px 16px; }
  .func-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #0d3f56; margin-bottom: 6px; }
  .func-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; }
  .func-item label { font-size: 9px; color: #64748b; display: block; font-weight: 600; margin-bottom: 1px; }
  .func-item span { font-size: 11px; font-weight: 600; color: #1e293b; }

  /* Tabela proventos/descontos */
  .table-header { display: grid; grid-template-columns: 1fr 1.5px 1fr; background: #1e3a5f; color: #fff; }
  .th-cell { padding: 6px 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; }
  .th-cell.right { text-align: right; }
  .divider-header { background: rgba(255,255,255,.3); }
  
  table.itens { width: 100%; border-collapse: collapse; }
  table.itens td { padding: 5px 8px; }
  table.itens tr:nth-child(even) { background: #f8fafc; }
  td.cod { width: 50px; color: #94a3b8; font-size: 10px; }
  td.desc { color: #374151; }
  td.val { text-align: right; font-weight: 600; white-space: nowrap; }
  td.prov { color: #15803d; }
  td.desc-val { color: #dc2626; } /* avoid clash */
  td.sep { width: 2px; background: #e2e8f0; }
  
  .totais-row { display: flex; border-top: 2px solid #0d3f56; background: #f8fafc; }
  .total-cell { flex: 1; padding: 8px 12px; }
  .total-cell.sep { flex: 0; width: 2px; background: #0d3f56; padding: 0; }
  .total-label { font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; }
  .total-val { font-size: 13px; font-weight: 700; margin-top: 2px; }
  .total-val.prov { color: #15803d; }
  .total-val.desc { color: #dc2626; }
  
  /* Líquido */
  .liquido-box { background: #0d3f56; color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; }
  .liq-label { font-size: 11px; font-weight: 600; opacity: .9; }
  .liq-val { font-size: 18px; font-weight: 900; }
  
  /* FGTS info */
  .fgts-bar { background: #eff6ff; border-top: 1px solid #bfdbfe; padding: 6px 16px; display: flex; align-items: center; gap: 12px; }
  .fgts-label { font-size: 10px; color: #1d4ed8; font-weight: 600; }
  .fgts-val { font-size: 11px; font-weight: 700; color: #1d4ed8; }
  .fgts-note { font-size: 9px; color: #3b82f6; opacity: .85; }
  
  /* Rodapé */
  .footer { border-top: 1px solid #e2e8f0; padding: 8px 16px; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
  
  @media print {
    body { padding: 0; }
    .page { border: 1px solid #ccc; }
  }
</style></head><body>
<div class="page">
  <div class="header">
    <div>
      <div class="empresa-nome">${empresaNome}</div>
      ${empresaCnpj ? `<div class="empresa-meta">${empresaCnpj}</div>` : ''}
      ${empresaEnd  ? `<div class="empresa-meta">${empresaEnd}</div>`  : ''}
    </div>
    <div class="comp-box">
      <div class="comp-title">Contracheque</div>
      <div class="comp-val">${fmtComp(h.competencia)}</div>
      <div class="tipo-badge">${TIPO_LABEL[h.tipo] ?? h.tipo}</div>
    </div>
  </div>
  
  <div class="func-section">
    <div class="func-title">Dados do Funcionário</div>
    <div class="func-grid">
      <div class="func-item"><label>Matrícula</label><span>${colab?.chapa ?? h.funcao ?? '—'}</span></div>
      <div class="func-item"><label>Nome</label><span>${colab?.nome ?? '—'}</span></div>
      <div class="func-item"><label>CPF</label><span>${colab?.cpf ? fmtCPF(colab.cpf) : '—'}</span></div>
      <div class="func-item"><label>Admissão</label><span>${fmtData(colab?.data_admissao ?? null)}</span></div>
      <div class="func-item"><label>Cargo / Função</label><span>${h.funcao ?? colab?.funcao ?? '—'}</span></div>
      <div class="func-item"><label>Vínculo</label><span>${(h.tipo_contrato_snap ?? colab?.tipo_contrato ?? 'CLT').toUpperCase()}</span></div>
      ${h.obra_nome ? `<div class="func-item"><label>Obra / Setor</label><span>${h.obra_nome}</span></div>` : ''}
      ${h.dias_trabalhados != null ? `<div class="func-item"><label>Dias Trab.</label><span>${h.dias_trabalhados}${h.faltas ? ` / ${h.faltas} falta(s)` : ''}</span></div>` : ''}
    </div>
  </div>

  <div class="table-header">
    <div class="th-cell">Cód &nbsp;&nbsp; Proventos</div>
    <div class="divider-header"></div>
    <div class="th-cell">Cód &nbsp;&nbsp; Descontos</div>
  </div>
  
  <table class="itens"><tbody>${tabelaRows}</tbody></table>
  
  <div class="totais-row">
    <div class="total-cell">
      <div class="total-label">Total Proventos</div>
      <div class="total-val prov">${fmtR(totalProventos)}</div>
    </div>
    <div class="total-cell sep"></div>
    <div class="total-cell">
      <div class="total-label">Total Descontos</div>
      <div class="total-val desc">- ${fmtR(totalDescontos)}</div>
    </div>
  </div>
  
  <div class="liquido-box">
    <span class="liq-label">💰 LÍQUIDO A RECEBER</span>
    <span class="liq-val">${fmtR(liquido)}</span>
  </div>
  
  ${h.fgts && h.fgts > 0 ? `
  <div class="fgts-bar">
    <span class="fgts-label">FGTS (depositado pelo empregador):</span>
    <span class="fgts-val">${fmtR(h.fgts)}</span>
    <span class="fgts-note">— valor não deduzido do salário</span>
  </div>` : ''}
  
  <div class="footer">
    <span>${colab?.nome ?? ''} ${colab?.chapa ? `· Chapa ${colab.chapa}` : ''}</span>
    <span>Competência: ${fmtComp(h.competencia)}</span>
    <span>Publicado em: ${h.publicado_em ? new Date(h.publicado_em).toLocaleDateString('pt-BR') : '—'}</span>
  </div>
</div>
<script>window.onload = () => { window.print(); }</script>
</body></html>`)
    printWindow.document.close()
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 2, overflow: 'hidden',
      border: '1px solid #cbd5e1', boxShadow: '0 1px 6px rgba(0,0,0,.07)',
    }}>
      {/* ── Cabeçalho empresa/competência ── */}
      <div style={{
        background: '#0d3f56', color: '#fff',
        padding: '12px 18px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
            {empresa?.nome ?? 'Empresa'}
          </div>
          {empresa?.cnpj && <div style={{ fontSize: 11, opacity: .8 }}>CNPJ: {empresa.cnpj}</div>}
          {empresa?.cidade && <div style={{ fontSize: 11, opacity: .7 }}>{empresa.cidade}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, opacity: .75, textTransform: 'uppercase', letterSpacing: 1 }}>Contracheque</div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 1 }}>{fmtComp(h.competencia)}</div>
          <div style={{
            fontSize: 10, background: 'rgba(255,255,255,.2)', padding: '2px 8px',
            borderRadius: 3, marginTop: 4, display: 'inline-block',
          }}>
            {TIPO_LABEL[h.tipo] ?? h.tipo}
          </div>
        </div>
      </div>

      {/* ── Dados do funcionário ── */}
      <div style={{ background: '#f0f4f8', borderBottom: '1px solid #d0dae5', padding: '10px 18px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#0d3f56', marginBottom: 8 }}>
          Dados do Funcionário
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px 16px' }}>
          {[
            { label: 'Matrícula',    valor: colab?.chapa ?? '—' },
            { label: 'Nome',         valor: colab?.nome  ?? '—' },
            { label: 'CPF',          valor: colab?.cpf ? fmtCPF(colab.cpf) : '—' },
            { label: 'Admissão',     valor: fmtData(colab?.data_admissao ?? null) },
            { label: 'Cargo/Função', valor: h.funcao ?? colab?.funcao ?? '—' },
            { label: 'Vínculo',      valor: (h.tipo_contrato_snap ?? colab?.tipo_contrato ?? 'CLT').toUpperCase() },
            ...(h.obra_nome ? [{ label: 'Obra / Setor', valor: h.obra_nome }] : []),
            ...(h.dias_trabalhados != null ? [{ label: 'Dias Trabalhados', valor: `${h.dias_trabalhados}${h.faltas ? ` (${h.faltas} falta${h.faltas > 1 ? 's' : ''})` : ''}` }] : []),
          ].map(({ label, valor }) => (
            <div key={label}>
              <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 1 }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{valor}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabela proventos / descontos ── */}
      {temDetalhes && (
        <>
          {/* Header da tabela */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2px 1fr', background: '#1e3a5f' }}>
            <div style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: '#fff' }}>
              Cód &nbsp; Proventos
            </div>
            <div style={{ background: 'rgba(255,255,255,.25)' }}></div>
            <div style={{ padding: '6px 14px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: '#fff' }}>
              Cód &nbsp; Descontos
            </div>
          </div>

          {/* Corpo da tabela — lado a lado */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2px 1fr' }}>
            {/* Proventos */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <LinhaItem codigo="0001" descricao="Salário / Valor Horas"   valor={h.salario_base}    tipo="provento" />
                <LinhaItem codigo="0002" descricao="Produção"                valor={h.valor_producao}  tipo="provento" />
                <LinhaItem codigo="0003" descricao="DSR"                     valor={h.valor_dsr}       tipo="provento" />
                <LinhaItem codigo="0004" descricao="Prêmios"                 valor={h.valor_premio}    tipo="provento" />
                {/* fallback: se sem detalhe mas tem bruto */}
                {!h.salario_base && !h.valor_producao && h.bruto && (
                  <LinhaItem codigo="0001" descricao="Total Proventos" valor={h.bruto} tipo="provento" />
                )}
              </tbody>
            </table>

            {/* Divisor */}
            <div style={{ background: '#e2e8f0' }}></div>

            {/* Descontos */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <LinhaItem codigo="0101" descricao="INSS"            valor={h.inss}            tipo="desconto" />
                <LinhaItem codigo="0102" descricao="IRRF"            valor={h.irrf}            tipo="desconto" />
                <LinhaItem codigo="0103" descricao="Vale Transporte" valor={h.desconto_vt}     tipo="desconto" />
                <LinhaItem codigo="0104" descricao="Adiantamento"    valor={h.desconto_adiant} tipo="desconto" />
                <LinhaItem codigo="0105" descricao="Cesta Básica"    valor={h.cesta_basica}    tipo="desconto" />
                {!h.inss && !h.irrf && h.descontos && (
                  <LinhaItem codigo="0101" descricao="Total Descontos" valor={h.descontos} tipo="desconto" />
                )}
              </tbody>
            </table>
          </div>

          {/* Linha de totais */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2px 1fr', borderTop: '2px solid #0d3f56', background: '#f8fafc' }}>
            <div style={{ padding: '8px 14px' }}>
              <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>Total Proventos</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#15803d', marginTop: 2 }}>{fmtR(totalProventos)}</div>
            </div>
            <div style={{ background: '#0d3f56' }}></div>
            <div style={{ padding: '8px 14px' }}>
              <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5 }}>Total Descontos</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#dc2626', marginTop: 2 }}>- {fmtR(totalDescontos)}</div>
            </div>
          </div>
        </>
      )}

      {/* ── Líquido a receber ── */}
      <div style={{
        background: '#0d3f56', color: '#fff',
        padding: '12px 18px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: .9 }}>💰 LÍQUIDO A RECEBER</span>
        <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: -.5 }}>{fmtR(liquido)}</span>
      </div>

      {/* FGTS — informativo */}
      {h.fgts && h.fgts > 0 && (
        <div style={{
          background: '#eff6ff', borderTop: '1px solid #bfdbfe',
          padding: '6px 18px', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 10, color: '#1d4ed8', fontWeight: 600 }}>FGTS depositado pelo empregador:</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8' }}>{fmtR(h.fgts)}</span>
          <span style={{ fontSize: 10, color: '#3b82f6', opacity: .8 }}>— não deduzido do salário</span>
        </div>
      )}

      {/* ── Observação / Informações adicionais ── */}
      {temDetalhes && (
        <div style={{ borderTop: '1px solid #f1f5f9' }}>
          <button
            onClick={() => setExpandido(e => !e)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 18px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, color: '#64748b', fontWeight: 600,
            }}
          >
            <span>ℹ️ Detalhes do período (horas, obras)</span>
            {expandido ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          </button>
          {expandido && (
            <div style={{
              padding: '0 18px 12px',
              display: 'flex', flexWrap: 'wrap', gap: '8px 24px',
              borderTop: '1px solid #f1f5f9', paddingTop: 10,
            }}>
              {[
                h.horas_normais  && { label: 'Horas Normais',  valor: `${h.horas_normais}h` },
                h.horas_extras   && { label: 'Horas Extras',   valor: `${h.horas_extras}h`  },
                h.obra_nome      && { label: 'Obra / Setor',   valor: h.obra_nome },
                h.dias_trabalhados != null && { label: 'Dias Trab.',    valor: String(h.dias_trabalhados) },
                h.faltas != null && { label: 'Faltas',         valor: String(h.faltas) },
              ].filter(Boolean).map((item: any) => (
                <div key={item.label}>
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{item.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{item.valor}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Rodapé ── */}
      <div style={{
        borderTop: '1px solid #e2e8f0', padding: '6px 18px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#f8fafc',
      }}>
        <span style={{ fontSize: 10, color: '#94a3b8' }}>
          Publicado em {h.publicado_em ? new Date(h.publicado_em).toLocaleDateString('pt-BR') : '—'}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {h.arquivo_url && (
            <a href={h.arquivo_url} target="_blank" rel="noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 5, background: '#eff6ff',
                border: '1px solid #bfdbfe', color: '#1d4ed8',
                textDecoration: 'none', fontSize: 11, fontWeight: 600,
              }}>
              <Download size={11}/> PDF
            </a>
          )}
          <button onClick={imprimir}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 5, background: '#f1f5f9',
              border: '1px solid #e2e8f0', color: '#475569', cursor: 'pointer',
              fontSize: 11, fontWeight: 600,
            }}>
            <Printer size={11}/> Imprimir
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tela Troca de Senha ──────────────────────────────────────────────────────
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
    if (nova.length < 6) { setErro('Mínimo 6 caracteres.'); return }
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
    const colab = data.colaboradores as any
    const sessao: Sessao = { colaborador_id: data.colaborador_id, acesso_id: acessoId, login: data.cpf, nome: colab?.nome ?? nome, chapa: colab?.chapa ?? '' }
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessao))
    onConcluido(sessao)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0d3f56,#1e3a5f,#0f2d4a)', display:'flex', alignItems:'center', justifyContent:'center', padding: 20 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'36px 32px', width:'100%', maxWidth:400, boxShadow:'0 25px 50px rgba(0,0,0,.3)' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:60, height:60, borderRadius:14, background:'linear-gradient(135deg,#b45309,#d97706)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
            <Key size={26} color="#fff" />
          </div>
          <h1 style={{ fontSize:19, fontWeight:800, color:'#0f172a', margin:0 }}>Criar Nova Senha</h1>
          <p style={{ fontSize:13, color:'#64748b', margin:'6px 0 0', lineHeight:1.5 }}>
            Bem-vindo(a), <strong>{nome.split(' ')[0]}</strong>!<br/>Crie uma senha pessoal para continuar.
          </p>
        </div>
        <div style={{ background:'#fef3c7', border:'1px solid #fcd34d', borderRadius:8, padding:'9px 12px', fontSize:12, color:'#92400e', marginBottom:18, fontWeight:600 }}>
          🔐 Primeiro acesso — defina uma senha com ao menos 6 caracteres.
        </div>
        <form onSubmit={salvar} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Nova Senha</label>
            <div style={{ position:'relative' }}>
              <input type={showN?'text':'password'} value={nova} onChange={e=>setNova(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password"
                style={{ width:'100%', height:44, borderRadius:10, border:'1.5px solid #e2e8f0', padding:'0 44px 0 14px', fontSize:15, outline:'none', boxSizing:'border-box' }} />
              <button type="button" onClick={()=>setShowN(s=>!s)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                {showN?<EyeOff size={17}/>:<Eye size={17}/>}
              </button>
            </div>
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Confirmar Senha</label>
            <input type="password" value={conf} onChange={e=>setConf(e.target.value)} placeholder="Repita a senha" autoComplete="new-password"
              style={{ width:'100%', height:44, borderRadius:10, border:'1.5px solid #e2e8f0', padding:'0 14px', fontSize:15, outline:'none', boxSizing:'border-box' }} />
            {conf && nova !== conf && <p style={{ fontSize:11, color:'#dc2626', margin:'4px 0 0' }}>As senhas não conferem.</p>}
          </div>
          {erro && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 13px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'#dc2626', fontSize:13 }}>
              <AlertCircle size={13}/> {erro}
            </div>
          )}
          <button type="submit" disabled={loading} style={{ height:46, borderRadius:10, border:'none', cursor:loading?'not-allowed':'pointer', background:loading?'#94a3b8':'linear-gradient(135deg,#b45309,#d97706)', color:'#fff', fontWeight:700, fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
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
    if (cpf.length !== 11) { setErro('CPF inválido — 11 dígitos.'); return }
    if (!senha.trim())      { setErro('Informe a senha.'); return }
    setLoading(true); setErro('')
    try {
      const hash = await sha256(senha.trim())
      const { data: acesso, error: errA } = await supabase
        .from('colaborador_acessos')
        .select('id,colaborador_id,cpf,senha_hash,must_change_password,ativo,colaboradores(id,nome,chapa,status)')
        .eq('cpf', cpf).single()
      if (errA || !acesso)       { setErro('CPF não encontrado.'); setLoading(false); return }
      if (!acesso.ativo)          { setErro('Acesso desativado. Contate o RH.'); setLoading(false); return }
      if (acesso.senha_hash !== hash) { setErro('Senha incorreta.'); setLoading(false); return }
      const colab = acesso.colaboradores as any
      if (acesso.must_change_password) { setTrocar({ acessoId: acesso.id, nome: colab?.nome ?? 'Colaborador' }); setLoading(false); return }
      await supabase.from('colaborador_acessos').update({ ultimo_acesso: new Date().toISOString() }).eq('id', acesso.id)
      const sessao: Sessao = { colaborador_id: acesso.colaborador_id, acesso_id: acesso.id, login: cpf, nome: colab?.nome ?? 'Colaborador', chapa: colab?.chapa ?? '' }
      localStorage.setItem(SESSION_KEY, JSON.stringify(sessao))
      onLogin(sessao)
    } catch { setErro('Erro ao autenticar. Tente novamente.') }
    finally { setLoading(false) }
  }

  if (trocar) return <TrocaSenha acessoId={trocar.acessoId} nome={trocar.nome} onConcluido={onLogin} />

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0d3f56,#1e3a5f,#0f2d4a)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'36px 32px', width:'100%', maxWidth:400, boxShadow:'0 25px 50px rgba(0,0,0,.3)' }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:64, height:64, borderRadius:16, background:'linear-gradient(135deg,#0d3f56,#1e3a5f)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
            <Receipt size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize:21, fontWeight:800, color:'#0f172a', margin:0 }}>Meus Holerites</h1>
          <p style={{ fontSize:13, color:'#64748b', margin:'6px 0 0' }}>Acesse seus contracheques com segurança</p>
        </div>

        <form onSubmit={entrar} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>CPF</label>
            <input type="text" inputMode="numeric" value={cpfInput} onChange={e=>setCpfInput(formatarCPF(e.target.value))}
              placeholder="000.000.000-00" maxLength={14} autoComplete="username"
              style={{ width:'100%', height:44, borderRadius:10, border:'1.5px solid #e2e8f0', padding:'0 14px', fontSize:15, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:5 }}>Senha</label>
            <div style={{ position:'relative' }}>
              <input type={showSenha?'text':'password'} value={senha} onChange={e=>setSenha(e.target.value)}
                placeholder="Sua senha" autoComplete="current-password"
                style={{ width:'100%', height:44, borderRadius:10, border:'1.5px solid #e2e8f0', padding:'0 44px 0 14px', fontSize:15, outline:'none', boxSizing:'border-box' }} />
              <button type="button" onClick={()=>setShowSenha(s=>!s)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', padding:4 }}>
                {showSenha?<EyeOff size={17}/>:<Eye size={17}/>}
              </button>
            </div>
            <p style={{ fontSize:11, color:'#9ca3af', margin:'5px 0 0' }}>Primeiro acesso? Use a senha <strong>123</strong>.</p>
          </div>
          {erro && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 13px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, color:'#dc2626', fontSize:13 }}>
              <AlertCircle size={13}/> {erro}
            </div>
          )}
          <button type="submit" disabled={loading} style={{ height:46, borderRadius:10, border:'none', cursor:loading?'not-allowed':'pointer', background:loading?'#94a3b8':'linear-gradient(135deg,#0d3f56,#1e5c7a)', color:'#fff', fontWeight:700, fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:loading?.85:1 }}>
            {loading?<><Loader2 size={17} className="animate-spin"/>Verificando…</>:'Entrar'}
          </button>
        </form>
        <p style={{ textAlign:'center', fontSize:12, color:'#94a3b8', marginTop:18 }}>
          Problemas com acesso? Fale com o RH.
        </p>
      </div>
    </div>
  )
}

// ─── Seletor de meses ─────────────────────────────────────────────────────────
function FiltroPeriodo({ competencias, ativa, onChange }: {
  competencias: string[]; ativa: string | null; onChange: (c: string | null) => void
}) {
  if (competencias.length === 0) return null
  return (
    <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4, flexWrap:'wrap' }}>
      <button
        onClick={() => onChange(null)}
        style={{
          padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600, whiteSpace:'nowrap',
          background: ativa === null ? '#0d3f56' : '#f1f5f9',
          color: ativa === null ? '#fff' : '#475569',
          border: 'none', cursor:'pointer',
        }}>
        Todos
      </button>
      {competencias.map(c => (
        <button key={c} onClick={() => onChange(c)}
          style={{
            padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600, whiteSpace:'nowrap',
            background: ativa === c ? '#0d3f56' : '#f1f5f9',
            color: ativa === c ? '#fff' : '#475569',
            border: 'none', cursor:'pointer',
          }}>
          {fmtCompAbr(c)}
        </button>
      ))}
    </div>
  )
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function PortalContracheque() {
  const [sessao, setSessao]       = useState<Sessao | null>(() => {
    try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null }
    catch { return null }
  })
  const [holerites, setHolerites] = useState<Contracheque[]>([])
  const [colab, setColab]         = useState<ColabInfo | null>(null)
  const [empresa, setEmpresa]     = useState<EmpresaInfo | null>(null)
  const [loading, setLoading]     = useState(false)
  const [filtroComp, setFiltroComp] = useState<string | null>(null)

  const carregarDados = useCallback(async (colaboradorId: string) => {
    setLoading(true)
    const [holRes, colRes, empRes] = await Promise.all([
      supabase.from('contracheques')
        .select('*').eq('colaborador_id', colaboradorId).eq('publicado', true)
        .order('competencia', { ascending: false }),
      supabase.from('colaboradores')
        .select('nome,chapa,cpf,funcao,tipo_contrato,data_admissao,salario')
        .eq('id', colaboradorId).single(),
      supabase.from('configuracoes')
        .select('chave,valor')
        .in('chave', ['empresa_nome','empresa_cnpj','empresa_endereco','empresa_cidade','empresa_telefone']),
    ])
    setHolerites((holRes.data as Contracheque[]) ?? [])
    setColab((colRes.data as ColabInfo) ?? null)
    const map: Record<string,string> = {}
    ;(empRes.data ?? []).forEach((r: any) => { map[r.chave] = r.valor })
    setEmpresa({ nome: map['empresa_nome'] ?? '', cnpj: map['empresa_cnpj'] ?? '', endereco: map['empresa_endereco'] ?? '', cidade: map['empresa_cidade'] ?? '', telefone: map['empresa_telefone'] ?? '' })
    setLoading(false)
  }, [])

  useEffect(() => { if (sessao) carregarDados(sessao.colaborador_id) }, [sessao, carregarDados])

  function sair() { localStorage.removeItem(SESSION_KEY); setSessao(null); setHolerites([]) }

  if (!sessao) return <TelaLogin onLogin={setSessao} />

  // Competências únicas para filtro
  const competencias = [...new Set(holerites.map(h => h.competencia.slice(0, 7)))].sort((a, b) => b.localeCompare(a))
  const holFiltrados = filtroComp
    ? holerites.filter(h => h.competencia.startsWith(filtroComp))
    : holerites

  return (
    <div style={{ minHeight:'100vh', background:'#eef2f7' }}>

      {/* ── Header ── */}
      <div style={{ background:'linear-gradient(135deg,#0d3f56,#1e3a5f)', padding:'0 20px' }}>
        <div style={{ maxWidth:760, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', height:62 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <Receipt size={22} color="#fff" />
            <div>
              <div style={{ color:'#fff', fontWeight:700, fontSize:15, lineHeight:1.2 }}>Meus Contracheques</div>
              <div style={{ color:'rgba(255,255,255,.7)', fontSize:11 }}>
                {sessao.nome}{sessao.chapa ? ` · Chapa ${sessao.chapa}` : ''}
              </div>
            </div>
          </div>
          <button onClick={sair}
            style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.25)', borderRadius:8, padding:'6px 13px', color:'#fff', cursor:'pointer', fontSize:12 }}>
            <LogOut size={13}/> Sair
          </button>
        </div>
      </div>

      {/* ── Resumo colaborador ── */}
      {colab && (
        <div style={{ background:'#fff', borderBottom:'1px solid #d0dae5' }}>
          <div style={{ maxWidth:760, margin:'0 auto', padding:'10px 20px' }}>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              {[
                { icon: <User size={13}/>,     label: 'Nome',    valor: colab.nome },
                { icon: <Building2 size={13}/>, label: 'Função',  valor: colab.funcao ?? '—' },
                { icon: <Calendar size={13}/>,  label: 'Admissão', valor: fmtData(colab.data_admissao) },
              ].map(({ icon, label, valor }) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ color:'#94a3b8' }}>{icon}</span>
                  <span style={{ fontSize:11, color:'#64748b' }}>{label}: <strong style={{ color:'#1e293b' }}>{valor}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Conteúdo ── */}
      <div style={{ maxWidth:760, margin:'0 auto', padding:'20px 16px' }}>

        {loading ? (
          <div style={{ textAlign:'center', padding:56, color:'#64748b' }}>
            <Loader2 size={34} className="animate-spin" style={{ margin:'0 auto 12px', display:'block', color:'#0d3f56' }} />
            Carregando contracheques…
          </div>
        ) : holerites.length === 0 ? (
          <div style={{ background:'#fff', borderRadius:12, padding:52, textAlign:'center', border:'1px solid #e2e8f0' }}>
            <Receipt size={48} strokeWidth={1} color="#cbd5e1" style={{ margin:'0 auto 12px', display:'block' }} />
            <div style={{ fontSize:16, fontWeight:600, color:'#475569' }}>Nenhum holerite disponível</div>
            <div style={{ fontSize:13, color:'#94a3b8', marginTop:6 }}>
              Seus contracheques aparecerão aqui quando publicados pelo RH.
            </div>
          </div>
        ) : (
          <>
            {/* Filtro por competência */}
            {competencias.length > 1 && (
              <div style={{ marginBottom:16 }}>
                <FiltroPeriodo competencias={competencias} ativa={filtroComp} onChange={setFiltroComp} />
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              {holFiltrados.map(h => (
                <HoleriteCard key={h.id} h={h} colab={colab} empresa={empresa} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
