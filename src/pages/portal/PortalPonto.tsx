import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getPortalSession } from '@/hooks/usePortalAuth'
import PortalLayout from './PortalLayout'
import { ChevronLeft, ChevronRight, Check, X, Clock, Minus, Plus, Save, Loader2, FileText, UserPlus, BarChart2, Trash2 } from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────────────────────
type StatusPonto = 'presente' | 'falta' | 'meio_periodo' | 'falta_justificada' | 'producao'

interface ColabRow { id: string; nome: string; chapa?: string; funcao?: string; data_admissao?: string | null; obra_id?: string }
interface PontoRow {
  id?: string; colaborador_id: string; data: string; status: StatusPonto
  horas_trabalhadas?: number; horas_extra?: number; horas_falta?: number; observacoes?: string
  obra_id?: string
}

const STATUS_CONFIG: Record<StatusPonto, { label: string; cor: string; bg: string; icon: React.ReactNode }> = {
  presente:          { label: 'Presente',     cor: '#15803d', bg: '#dcfce7', icon: <Check size={14}/> },
  falta:             { label: 'Falta',         cor: '#dc2626', bg: '#fee2e2', icon: <X size={14}/> },
  meio_periodo:      { label: 'Meio Período',  cor: '#b45309', bg: '#fef3c7', icon: <Minus size={14}/> },
  falta_justificada: { label: 'Falta Justif.', cor: '#6b7280', bg: '#f3f4f6', icon: <Clock size={14}/> },
  producao:          { label: 'Produção',      cor: '#7c3aed', bg: '#f3e8ff', icon: <BarChart2 size={14}/> },
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function PortalPonto() {
  const nav    = useNavigate()
  const [params] = useSearchParams()
  const session  = getPortalSession()

  const obras = session?.obras_ids ?? []
  const [obraId,    setObraId]    = useState(params.get('obra') ?? obras[0] ?? '')
  const [obrasData, setObrasData] = useState<{id:string;nome:string}[]>([])
  const [buscaColab, setBuscaColab] = useState('')
  const [dataSel,   setDataSel]   = useState(new Date().toISOString().slice(0, 10))
  const [colaboradores, setColaboradores] = useState<ColabRow[]>([])
  const [pontos,    setPontos]    = useState<Record<string, PontoRow>>({})
  const [saving,    setSaving]    = useState<Set<string>>(new Set())
  const [loading,   setLoading]   = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [subAba,    setSubAba]    = useState<'ponto'|'relatorio'|'avulso'>('ponto')

  // ── Relatório ──────────────────────────────────────────────────────────────
  const [relColabId, setRelColabId] = useState('')
  const [relBusca,   setRelBusca]   = useState('')
  const [relDtIni,   setRelDtIni]   = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10)
  })
  const [relDtFim,   setRelDtFim]   = useState(new Date().toISOString().slice(0,10))
  const [relRows,    setRelRows]    = useState<any[]>([])
  const [relLoading, setRelLoading] = useState(false)

  // ── Avulso ─────────────────────────────────────────────────────────────────
  const [avulsoColabId,  setAvulsoColabId]  = useState('')
  const [avulsoColabs,   setAvulsoColabs]   = useState<ColabRow[]>([])
  const [avulsoBusca,    setAvulsoBusca]    = useState('')
  const [avulsoObraId,   setAvulsoObraId]   = useState(obraId)
  const [avulsoStatus,   setAvulsoStatus]   = useState<StatusPonto>('presente')
  const [avulsoSaving,   setAvulsoSaving]   = useState(false)
  const [avulsoSucesso,  setAvulsoSucesso]  = useState(false)
  const [avulsoErro,     setAvulsoErro]     = useState('')

  const [confirmExcluir, setConfirmExcluir] = useState<{colabId:string; nome:string; id:string} | null>(null)
  const [excluindo, setExcluindo]           = useState(false)
  const [rlsErro,   setRlsErro]             = useState(false)

  // Modal de edição inline do relatório
  interface EditRelRow { id:string; colaborador_nome:string; data:string; status:StatusPonto; horas_extra:number; horas_falta:number; observacoes:string }
  const [editRel,     setEditRel]     = useState<EditRelRow | null>(null)
  const [savingRel,   setSavingRel]   = useState(false)

  // tela de conferência antes de salvar
  interface ConfPonto { colabId:string; nome:string; chapa?:string; funcao?:string; status:StatusPonto; he:number; hf:number; obs:string }
  const [pendConf, setPendConf]   = useState<ConfPonto | null>(null)
  const [confSaving, setConfSaving] = useState(false)

  // ── Conflito de obra ───────────────────────────────────────────────────────
  // Guarda: colabId → obra_id já lançada no dia (de OUTRA obra)
  const [conflitos, setConflitos] = useState<Record<string, string>>({})

  function proxDia(dir: 1 | -1) {
    const d = new Date(dataSel + 'T12:00:00')
    d.setDate(d.getDate() + dir)
    setDataSel(d.toISOString().slice(0, 10))
  }

  // ── Carregamentos ──────────────────────────────────────────────────────────
  const fetchObras = useCallback(async () => {
    if (!obras.length) return
    const { data } = await supabase.from('obras').select('id,nome').in('id', obras).order('nome')
    if (data) setObrasData(data)
  }, [obras.join(',')])

  const fetchColabs = useCallback(async () => {
    if (!obraId) return
    const { data } = await supabase
      .from('colaboradores').select('id,nome,chapa,data_admissao,obra_id,funcoes(nome)')
      .eq('obra_id', obraId).eq('status','ativo').order('nome')
    if (data) setColaboradores(data.map((c: any) => ({
      id: c.id, nome: c.nome, chapa: c.chapa, funcao: c.funcoes?.nome,
      data_admissao: c.data_admissao ?? null, obra_id: c.obra_id,
    })))
  }, [obraId])

  const fetchPontos = useCallback(async () => {
    if (!obraId || !dataSel) return
    setLoading(true)
    const { data } = await supabase.from('portal_ponto_diario')
      .select('*').eq('obra_id', obraId).eq('data', dataSel)
    const pontosMap = Object.fromEntries((data ?? []).map((r: any) => [r.colaborador_id, r]))
    setPontos(pontosMap)

    // Inclui colaboradores avulsos lançados nesta obra no dia
    // (colaboradores que NÃO têm obra_id = obraId no cadastro mas têm ponto aqui)
    if (data && data.length > 0) {
      const idsAvulsos = (data as any[])
        .map(r => r.colaborador_id)
        .filter(id => !colaboradores.find(c => c.id === id))
      if (idsAvulsos.length > 0) {
        const { data: avulsosData } = await supabase
          .from('colaboradores')
          .select('id,nome,chapa,data_admissao,obra_id,funcoes(nome)')
          .in('id', idsAvulsos).eq('status','ativo')
        if (avulsosData && avulsosData.length > 0) {
          const novos = avulsosData.map((c: any) => ({
            id: c.id, nome: c.nome, chapa: c.chapa, funcao: c.funcoes?.nome,
            data_admissao: c.data_admissao ?? null, obra_id: c.obra_id,
          }))
          setColaboradores(prev => {
            const existIds = new Set(prev.map(x => x.id))
            return [...prev, ...novos.filter((n: any) => !existIds.has(n.id))]
          })
        }
      }
    }
    setLoading(false)
  }, [obraId, dataSel, colaboradores])

  // Verifica se algum colaborador da lista já tem ponto em OUTRA obra no dia
  const checkConflitos = useCallback(async (colabIds: string[], data: string, obraAtual: string) => {
    if (!colabIds.length) return
    const { data: rows } = await supabase.from('portal_ponto_diario')
      .select('colaborador_id,obra_id').in('colaborador_id', colabIds).eq('data', data).neq('obra_id', obraAtual)
    const map: Record<string,string> = {}
    rows?.forEach((r: any) => { map[r.colaborador_id] = r.obra_id })
    setConflitos(map)
  }, [])

  const fetchAvulsos = useCallback(async () => {
    // Colaboradores sem obra alocada ou de todas as obras do gestor
    const { data } = await supabase
      .from('colaboradores').select('id,nome,chapa,obra_id,funcoes(nome)')
      .eq('status','ativo').order('nome')
    if (data) setAvulsoColabs(data.map((c: any) => ({
      id: c.id, nome: c.nome, chapa: c.chapa, funcao: c.funcoes?.nome, obra_id: c.obra_id,
    })))
  }, [])

  useEffect(() => { if (!session) { nav('/portal'); return } fetchObras() }, [])
  useEffect(() => { fetchColabs() }, [fetchColabs])
  useEffect(() => {
    fetchPontos().then(() => {
      if (colaboradores.length) {
        checkConflitos(colaboradores.map(c=>c.id), dataSel, obraId)
      }
    })
  }, [fetchPontos, dataSel, obraId])
  useEffect(() => { if (colaboradores.length) checkConflitos(colaboradores.map(c=>c.id), dataSel, obraId) }, [colaboradores, dataSel, obraId])
  useEffect(() => { if (subAba === 'avulso') fetchAvulsos() }, [subAba])

  // ── Excluir ponto ─────────────────────────────────────────────────────────
  async function excluirPonto() {
    if (!confirmExcluir) return
    setExcluindo(true)
    const { error } = await supabase.from('portal_ponto_diario').delete().eq('id', confirmExcluir.id)
    if (error) { alert('Erro ao excluir: ' + error.message) }
    else {
      // Atualiza lista do relatório imediatamente sem reload
      setRelRows(prev => prev.filter(r => (r as any).id !== confirmExcluir.id))
      // Atualiza aba de ponto (pontos do dia)
      await fetchPontos()
      setConfirmExcluir(null)
    }
    setExcluindo(false)
  }

  // tela de conferência: usuário clica no status → abre conferência → confirma → salva
  function abrirConferencia(c: ColabRow, status: StatusPonto) {
    const atual = pontos[c.id]
    setPendConf({
      colabId: c.id, nome: c.nome, chapa: c.chapa, funcao: c.funcao,
      status,
      he: atual?.horas_extra  ?? 0,
      hf: atual?.horas_falta  ?? 0,
      obs: atual?.observacoes ?? '',
    })
  }

  async function confirmarConferencia() {
    if (!pendConf) return
    setConfSaving(true)
    await salvarPonto(pendConf.colabId, {
      status:      pendConf.status,
      horas_extra: pendConf.he,
      horas_falta: pendConf.hf,
      observacoes: pendConf.obs,
    })
    setConfSaving(false)
    setPendConf(null)
  }

  // ── Salvar ponto normal ────────────────────────────────────────────────────
  async function salvarPonto(colabId: string, dados: Partial<PontoRow>) {
    // Verifica conflito de obra
    if (conflitos[colabId]) {
      const obraNome = obrasData.find(o=>o.id===conflitos[colabId])?.nome ?? 'outra obra'
      alert(`⚠️ Este colaborador já tem ponto lançado em "${obraNome}" neste dia.\nUm colaborador só pode ter ponto em uma obra por dia.`)
      return
    }
    setSaving(prev => new Set([...prev, colabId]))
    const atual = pontos[colabId]
    const payload = { obra_id: obraId, colaborador_id: colabId, data: dataSel, portal_usuario_id: session?.id, ...dados }
    let err: any
    if (atual?.id) {
      ;({ error: err } = await supabase.from('portal_ponto_diario').update(payload).eq('id', atual.id))
    } else {
      ;({ error: err } = await supabase.from('portal_ponto_diario').insert(payload))
    }
    if (err) {
      // Erro de RLS: instruir o usuário a executar o SQL de correção
      if (err.code === '42501' || err.message?.includes('row-level security') || err.message?.includes('violates row-level')) {
        setRlsErro(true)
        alert('⚠️ Permissão negada pelo banco de dados.\n\nExecute o arquivo EXECUTAR_NO_SUPABASE.sql no Supabase para corrigir as políticas de acesso do Portal.')
      } else {
        alert('Erro ao salvar ponto: ' + err.message)
      }
    } else {
      setRlsErro(false)
      await fetchPontos()
    }
    setSaving(prev => { const s = new Set(prev); s.delete(colabId); return s })
    setEditandoId(null)
  }

  // ── Salvar ponto avulso ───────────────────────────────────────────────────
  async function salvarAvulso() {
    if (!avulsoColabId) { setAvulsoErro('⚠️ Selecione o colaborador.'); return }
    if (!avulsoObraId)  { setAvulsoErro('⚠️ Selecione a obra.'); return }
    setAvulsoSaving(true); setAvulsoErro('')
    // Verifica conflito
    const { data: conf } = await supabase.from('portal_ponto_diario')
      .select('obra_id').eq('colaborador_id', avulsoColabId).eq('data', dataSel).neq('obra_id', avulsoObraId)
    if (conf && conf.length > 0) {
      const obraNome = obrasData.find(o=>o.id===conf[0].obra_id)?.nome ?? 'outra obra'
      setAvulsoErro(`⚠️ Este colaborador já tem ponto em "${obraNome}" neste dia.`)
      setAvulsoSaving(false); return
    }
    // Verifica duplicata na mesma obra
    const { data: exist } = await supabase.from('portal_ponto_diario')
      .select('id').eq('colaborador_id', avulsoColabId).eq('data', dataSel).eq('obra_id', avulsoObraId)
    let err: any
    if (exist && exist.length > 0) {
      ;({ error: err } = await supabase.from('portal_ponto_diario').update({ status: avulsoStatus, portal_usuario_id: session?.id }).eq('id', exist[0].id))
    } else {
      ;({ error: err } = await supabase.from('portal_ponto_diario').insert({ obra_id: avulsoObraId, colaborador_id: avulsoColabId, data: dataSel, status: avulsoStatus, portal_usuario_id: session?.id }))
    }
    setAvulsoSaving(false)
    if (err) {
      if (err.code === '42501' || err.message?.includes('row-level security') || err.message?.includes('violates row-level')) {
        setAvulsoErro('⚠️ Permissão negada. Execute o EXECUTAR_NO_SUPABASE.sql no Supabase para liberar o Portal.')
      } else {
        setAvulsoErro('Erro: ' + err.message)
      }
      return
    }
    setAvulsoSucesso(true); setAvulsoColabId('')
    setTimeout(() => setAvulsoSucesso(false), 2500)
  }

  // ── Relatório ──────────────────────────────────────────────────────────────
  // ── Salvar edição inline do relatório ─────────────────────────────────
  async function salvarEditRel() {
    if (!editRel) return
    setSavingRel(true)
    const { error } = await supabase.from('portal_ponto_diario').update({
      status:      editRel.status,
      horas_extra: editRel.horas_extra,
      horas_falta: editRel.horas_falta,
      observacoes: editRel.observacoes || null,
    }).eq('id', editRel.id)
    setSavingRel(false)
    if (error) {
      if (error.code === '42501' || error.message?.includes('row-level security') || error.message?.includes('violates row-level')) {
        alert('⚠️ Permissão negada. Execute EXECUTAR_NO_SUPABASE.sql no Supabase.')
      } else {
        alert('Erro ao salvar: ' + error.message)
      }
      return
    }
    // Atualiza a linha na lista do relatório imediatamente (sem re-query)
    setRelRows(prev => prev.map(r =>
      (r as any).id === editRel.id
        ? { ...r, status: editRel.status, horas_extra: editRel.horas_extra, horas_falta: editRel.horas_falta, observacoes: editRel.observacoes }
        : r
    ))
    setEditRel(null)
  }

  async function gerarRelatorio() {
    // garante que avulsoColabs está carregado (usado para "Todos")
    if (!avulsoColabs.length) await fetchAvulsos()
    setRelLoading(true)
    let q = supabase.from('portal_ponto_diario')
      .select('id,data,status,horas_extra,horas_falta,observacoes,obra_id,colaborador_id')
      .gte('data', relDtIni).lte('data', relDtFim)
      .order('colaborador_id').order('data')
    if (relColabId) q = q.eq('colaborador_id', relColabId)
    const { data } = await q
    setRelRows(data ?? [])
    setRelLoading(false)
  }

  function imprimirRelatorio() {
    const todosColabs = [...colaboradores, ...avulsoColabs]
    const statusLabel: Record<string,string> = { presente:'Presente', falta:'Falta', meio_periodo:'Meio Período', falta_justificada:'Falta Justif.', producao:'Produção' }
    const statusCor:   Record<string,string> = { presente:'#15803d', falta:'#dc2626', meio_periodo:'#b45309', falta_justificada:'#6b7280', producao:'#7c3aed' }
    const statusBg:    Record<string,string> = { presente:'#f0fdf4', falta:'#fee2e2', meio_periodo:'#fffbeb', falta_justificada:'#f9fafb', producao:'#f5f3ff' }

    // agrupar lançamentos por colaborador_id
    const mapRows: Record<string, typeof relRows> = {}
    relRows.forEach(r => {
      const cid = (r as any).colaborador_id ?? relColabId
      if (!mapRows[cid]) mapRows[cid] = []
      mapRows[cid].push(r)
    })

    // montar lista de colaboradores envolvidos, enriquecidos com dados cadastrais
    const colabsEnvolvidos = Object.keys(mapRows)
      .map(cid => {
        const info = todosColabs.find(c => c.id === cid)
        return { id: cid, nome: info?.nome ?? 'Desconhecido', chapa: info?.chapa ?? '—', funcao: info?.funcao ?? 'Sem função', rows: mapRows[cid] }
      })
      .sort((a,b) => {
        const fa = a.funcao.toLowerCase(), fb = b.funcao.toLowerCase()
        return fa !== fb ? fa.localeCompare(fb) : a.nome.localeCompare(b.nome)
      })

    // totais gerais
    const gt = { presente:0, falta:0, producao:0, he:0, hf:0 }
    relRows.forEach(r => {
      if (r.status==='presente'||r.status==='meio_periodo') gt.presente++
      if (r.status==='falta'||r.status==='falta_justificada') gt.falta++
      if (r.status==='producao') gt.producao++
      gt.he += r.horas_extra ?? 0
      gt.hf += r.horas_falta ?? 0
    })

    // bloco separador de função
    let lastFuncPDF = ''
    const blocosColabs = colabsEnvolvidos.map(c => {
      const funcSep = c.funcao !== lastFuncPDF
        ? `<div style="margin:18px 0 8px;padding:6px 12px;background:#1e3a5f;color:#93c5fd;font-size:11px;font-weight:800;border-radius:6px;letter-spacing:0.06em;text-transform:uppercase">👷 ${c.funcao}</div>`
        : ''
      lastFuncPDF = c.funcao

      const t = { presente:0, falta:0, producao:0, he:0, hf:0 }
      c.rows.forEach(r => {
        if (r.status==='presente'||r.status==='meio_periodo') t.presente++
        if (r.status==='falta'||r.status==='falta_justificada') t.falta++
        if (r.status==='producao') t.producao++
        t.he += r.horas_extra ?? 0; t.hf += r.horas_falta ?? 0
      })

      const linhasDia = c.rows.map(r => {
        const dt  = new Date(r.data+'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit' })
        const cor = statusCor[r.status] ?? '#374151'
        const bg  = statusBg[r.status] ?? '#fff'
        const ob  = obrasData.find(o=>o.id===r.obra_id)?.nome ?? '—'
        return `<tr style="background:${bg}">
          <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px">${dt}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:${cor};font-weight:700">${statusLabel[r.status]??r.status}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#1d4ed8">${r.horas_extra?'+'+r.horas_extra+'h':''}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#dc2626">${r.horas_falta?'-'+r.horas_falta+'h':''}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">${ob}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:10px;color:#6b7280;font-style:italic">${r.observacoes??'—'}</td>
        </tr>`
      }).join('')

      return `${funcSep}
      <div style="margin-bottom:22px;break-inside:avoid">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px 8px 0 0;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <div style="font-weight:800;font-size:14px;color:#1e293b">${c.nome}</div>
            <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
              <span style="background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700">Chapa: ${c.chapa}</span>
              <span style="background:#e0e7ff;color:#4338ca;border-radius:4px;padding:1px 7px;font-size:10px">⚙️ ${c.funcao}</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span style="background:#dcfce7;color:#15803d;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:700">✓ ${t.presente} pres.</span>
            <span style="background:#fee2e2;color:#dc2626;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:700">✗ ${t.falta} faltas</span>
            ${t.producao?`<span style="background:#f3e8ff;color:#7c3aed;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:700">⚡ ${t.producao} prod.</span>`:''}
            ${t.he?`<span style="background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:3px 8px;font-size:10px;font-weight:700">+${t.he}h</span>`:''}
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#1e3a5f">
            <th style="padding:6px 8px;color:#fff;font-size:10px;text-align:left;font-weight:700">Data</th>
            <th style="padding:6px 8px;color:#fff;font-size:10px;text-align:left;font-weight:700">Status</th>
            <th style="padding:6px 8px;color:#fff;font-size:10px;text-align:left;font-weight:700">H. Extra</th>
            <th style="padding:6px 8px;color:#fff;font-size:10px;text-align:left;font-weight:700">H. Falta</th>
            <th style="padding:6px 8px;color:#fff;font-size:10px;text-align:left;font-weight:700">Obra</th>
            <th style="padding:6px 8px;color:#fff;font-size:10px;text-align:left;font-weight:700">Observação</th>
          </tr></thead>
          <tbody>${linhasDia}</tbody>
        </table>
      </div>`
    }).join('')

    const periodoFmt = `${new Date(relDtIni+'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(relDtFim+'T12:00:00').toLocaleDateString('pt-BR')}`
    const tituloRel = relColabId ? (todosColabs.find(c=>c.id===relColabId)?.nome ?? '—') : 'Todos os Colaboradores'

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Ponto</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:24px;color:#111}
      .cabecalho{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #1e3a5f}
      h1{font-size:17px;color:#1e3a5f;margin-bottom:3px}
      .sub{font-size:11px;color:#6b7280}
      .periodo-val{font-size:14px;font-weight:800;color:#1e3a5f;text-align:right}
      .totais-gerais{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
      .tot{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center}
      .tot .n{font-size:20px;font-weight:800}.tot .l{font-size:9px;color:#6b7280;text-transform:uppercase;margin-top:2px}
      @media print{body{padding:14px}.colaborador{break-inside:avoid}}
    </style></head><body>
    <div class="cabecalho">
      <div>
        <h1>📋 Relatório de Presença — ${tituloRel}</h1>
        <div class="sub">Portal da Obra · ConstrutorRH · Gerado em ${new Date().toLocaleString('pt-BR')}</div>
      </div>
      <div>
        <div style="font-size:10px;color:#6b7280;text-align:right">Período</div>
        <div class="periodo-val">${periodoFmt}</div>
      </div>
    </div>
    <div class="totais-gerais">
      <div class="tot"><div class="n" style="color:#15803d">${gt.presente}</div><div class="l">Presenças</div></div>
      <div class="tot"><div class="n" style="color:#dc2626">${gt.falta}</div><div class="l">Faltas</div></div>
      <div class="tot"><div class="n" style="color:#7c3aed">${gt.producao}</div><div class="l">Produção</div></div>
      <div class="tot"><div class="n" style="color:#1d4ed8">+${gt.he}h</div><div class="l">H. Extra</div></div>
      <div class="tot"><div class="n" style="color:#dc2626">-${gt.hf}h</div><div class="l">H. Falta</div></div>
    </div>
    ${blocosColabs}
    <script>window.onload=()=>{window.print()}<\/script></body></html>`
    const win = window.open('','_blank','width=1000,height=700')
    if (win) { win.document.write(html); win.document.close() }
  }

  // ── Filtro por data_admissao + agrupa por função ───────────────────────────
  const colaboradoresVisiveis = useMemo(() => {
    const q = buscaColab.toLowerCase().trim()
    const filtrados = colaboradores.filter(c => {
      if (c.data_admissao && c.data_admissao > dataSel) return false
      if (!q) return true
      return c.nome.toLowerCase().includes(q) || (c.chapa ?? '').toLowerCase().includes(q)
    })
    // Ordenar por função depois por nome
    return [...filtrados].sort((a, b) => {
      const fa = (a.funcao ?? 'Sem função').toLowerCase()
      const fb = (b.funcao ?? 'Sem função').toLowerCase()
      if (fa < fb) return -1
      if (fa > fb) return 1
      return a.nome.localeCompare(b.nome)
    })
  }, [colaboradores, dataSel, buscaColab])

  const totalPresentes  = colaboradoresVisiveis.filter(c => pontos[c.id]?.status === 'presente').length
  const totalFaltas     = colaboradoresVisiveis.filter(c => pontos[c.id]?.status === 'falta' || pontos[c.id]?.status === 'falta_justificada').length
  const totalProducao   = colaboradoresVisiveis.filter(c => pontos[c.id]?.status === 'producao').length
  const semLancamento   = colaboradoresVisiveis.filter(c => !pontos[c.id]).length

  const dateFmt = useMemo(() => {
    const [y, m, d] = dataSel.split('-').map(Number)
    return new Date(y, m-1, d).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' })
  }, [dataSel])

  const INP: React.CSSProperties = { width:'100%', height:42, border:'2px solid #e5e7eb', borderRadius:8, padding:'0 12px', fontSize:13, boxSizing:'border-box', background:'#fff' }
  const SEL: React.CSSProperties = { ...INP, cursor:'pointer' }

  return (
    <PortalLayout>
      {/* Sub-abas */}
      <div style={{ display:'flex', margin:'12px 12px 0', background:'#f1f5f9', borderRadius:12, padding:4, gap:2 }}>
        {([
          { id:'ponto',     label:'📋 Lançar Ponto' },
          { id:'avulso',    label:'👤 Avulso' },
          { id:'relatorio', label:'📊 Relatório' },
        ] as const).map(a => (
          <button type="button" key={a.id} onClick={() => setSubAba(a.id)} style={{
            flex:1, height:36, border:'none', borderRadius:9, cursor:'pointer', fontWeight:700, fontSize:11,
            background: subAba===a.id ? '#fff' : 'transparent',
            color: subAba===a.id ? '#0f172a' : '#94a3b8',
            boxShadow: subAba===a.id ? '0 1px 6px rgba(0,0,0,0.12)' : 'none',
            transition:'all 0.15s',
          }}>
            {a.label}
          </button>
        ))}
      </div>

      {/* ── ABA PONTO ── */}
      {subAba === 'ponto' && (<>
        {/* Banner de aviso RLS */}
        {rlsErro && (
          <div style={{ margin:'10px 12px 0', background:'#fff3cd', border:'1px solid #ffc107', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#92400e', fontWeight:600 }}>
            ⚠️ Permissão negada. Execute <strong>EXECUTAR_NO_SUPABASE.sql</strong> no Supabase SQL Editor e recarregue a página.
          </div>
        )}

        {obrasData.length > 1 && (
          <div style={{ padding:'10px 16px 0' }}>
            <select value={obraId} onChange={e => setObraId(e.target.value)} style={SEL}>
              {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
        )}

        <div style={{ padding:'10px 12px 8px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
          <button onClick={() => proxDia(-1)} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 12px', cursor:'pointer' }}>
            <ChevronLeft size={18}/>
          </button>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#1e3a5f', textTransform:'capitalize' }}>{dateFmt}</div>
            <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)}
              style={{ fontSize:11, color:'#9ca3af', border:'none', background:'transparent', textAlign:'center', cursor:'pointer' }}/>
          </div>
          <button onClick={() => proxDia(1)} style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:'8px 12px', cursor:'pointer' }}>
            <ChevronRight size={18}/>
          </button>
        </div>

        {/* Resumo */}
        <div style={{ padding:'0 12px 10px', display:'flex', gap:6 }}>
          {[
            { label:'Presentes', val:totalPresentes,  cor:'#15803d', bg:'#dcfce7' },
            { label:'Produção',  val:totalProducao,   cor:'#7c3aed', bg:'#f3e8ff' },
            { label:'Faltas',    val:totalFaltas,     cor:'#dc2626', bg:'#fee2e2' },
            { label:'Sem lançamento', val:semLancamento, cor:'#b45309', bg:'#fef3c7' },
          ].map(s => (
            <div key={s.label} style={{ flex:1, background:s.bg, borderRadius:10, padding:'6px 4px', textAlign:'center' }}>
              <div style={{ fontWeight:800, fontSize:16, color:s.cor }}>{s.val}</div>
              <div style={{ fontSize:9, color:s.cor, fontWeight:600, lineHeight:1.2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Busca por nome/chapa */}
        <div style={{ padding:'0 12px 8px' }}>
          <div style={{ position:'relative' }}>
            <input
              type="text"
              placeholder="🔍 Buscar colaborador (nome ou chapa)…"
              value={buscaColab}
              onChange={e => setBuscaColab(e.target.value)}
              style={{ width:'100%', padding:'9px 12px 9px 36px', borderRadius:10, border:'1.5px solid #e5e7eb', fontSize:13, background:'#fff', boxSizing:'border-box', outline:'none' }}
            />
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', fontSize:15, pointerEvents:'none' }}>🔍</span>
            {buscaColab && (
              <button onClick={() => setBuscaColab('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:14 }}>✕</button>
            )}
          </div>
        </div>

        {/* Lista agrupada por função */}
        <div style={{ padding:'0 12px 24px' }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:32, color:'#9ca3af' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin:'0 auto 8px', display:'block' }}/>Carregando…
            </div>
          ) : colaboradoresVisiveis.length === 0 ? (
            <div style={{ background:'#fff', borderRadius:12, padding:24, textAlign:'center', color:'#9ca3af' }}>
              Nenhum colaborador ativo nesta obra para esta data
            </div>
          ) : (() => {
            // Agrupar por função mantendo ordem
            let lastFuncao = ''
            return colaboradoresVisiveis.map(c => {
            const funcaoLabel = c.funcao ?? 'Sem função'
            const showHeader  = funcaoLabel !== lastFuncao
            if (showHeader) lastFuncao = funcaoLabel
            const p       = pontos[c.id]
            const isSaving = saving.has(c.id)
            const isEdit   = editandoId === c.id
            const cfg      = p ? STATUS_CONFIG[p.status] : null
            const conflito = conflitos[c.id]
            const obraConflito = conflito ? (obrasData.find(o=>o.id===conflito)?.nome ?? 'outra obra') : null

            return (
              <React.Fragment key={c.id}>
                {/* Separador de função */}
                {showHeader && (
                  <div style={{ marginBottom:6, marginTop: lastFuncao !== funcaoLabel ? 4 : 0, padding:'4px 8px', background:'#1e3a5f', borderRadius:8, fontSize:11, fontWeight:700, color:'#93c5fd', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    👷 {funcaoLabel}
                  </div>
                )}
              <div style={{
                background:'#fff', borderRadius:14,
                border:`2px solid ${obraConflito ? '#fca5a5' : (cfg?.bg ?? '#e5e7eb')}`,
                marginBottom:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:14, color:'#111' }}>
                      {c.nome}
                      {c.obra_id !== obraId && (
                        <span style={{ marginLeft:8, fontSize:9, padding:'2px 6px', borderRadius:99, background:'#ede9fe', color:'#7c3aed', fontWeight:800, verticalAlign:'middle' }}>
                          AVULSO
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:11, color:'#9ca3af' }}>
                      {c.chapa && <span style={{ marginRight:8 }}>{c.chapa}</span>}{c.funcao}
                    </div>
                    {obraConflito && (
                      <div style={{ fontSize:11, color:'#dc2626', fontWeight:700, marginTop:3 }}>
                        🔒 Já lançado em: {obraConflito}
                      </div>
                    )}
                  </div>
                  {cfg && !obraConflito ? (
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ background:cfg.bg, color:cfg.cor, borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
                        {cfg.icon} {cfg.label}
                      </span>
                      <button onClick={() => setEditandoId(isEdit ? null : c.id)}
                        style={{ background:'#f3f4f6', border:'none', borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:11, color:'#374151' }}>
                        Editar
                      </button>
                      {p?.id && (
                        <button
                          onClick={() => setConfirmExcluir({ colabId:c.id, nome:c.nome, id:p.id! })}
                          style={{ background:'#fee2e2', border:'none', borderRadius:6, padding:'4px 7px', cursor:'pointer', display:'flex', alignItems:'center' }}
                          title="Excluir lançamento">
                          <Trash2 size={13} color="#dc2626"/>
                        </button>
                      )}
                    </div>
                  ) : !obraConflito ? (
                    <span style={{ fontSize:11, color:'#f59e0b', fontWeight:600, background:'#fef3c7', borderRadius:6, padding:'3px 8px' }}>Sem lançamento</span>
                  ) : null}
                </div>

                {(!p || isEdit) && !obraConflito && (
                  <div style={{ padding:'0 14px 12px', display:'flex', flexDirection:'column', gap:10 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:5 }}>
                      {(Object.entries(STATUS_CONFIG) as [StatusPonto, typeof STATUS_CONFIG[StatusPonto]][]).map(([status, sc]) => (
                        <button key={status}
                          onClick={() => abrirConferencia(c, status)}
                          disabled={isSaving} style={{
                            background: p?.status===status ? sc.bg : '#f9fafb',
                            border:`2px solid ${p?.status===status ? sc.cor : '#e5e7eb'}`,
                            borderRadius:10, padding:'7px 2px', cursor:'pointer',
                            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                            opacity: isSaving ? 0.6 : 1,
                          }}>
                          <span style={{ color:sc.cor }}>{sc.icon}</span>
                          <span style={{ fontSize:8, fontWeight:700, color:sc.cor, textAlign:'center', lineHeight:1.2 }}>{sc.label}</span>
                        </button>
                      ))}
                    </div>
                    {p && (p.status==='presente' || p.status==='meio_periodo' || p.status==='producao') && (
                      <HorasAjuste
                        horasExtra={p.horas_extra ?? 0} horasFalta={p.horas_falta ?? 0}
                        observacoes={p.observacoes ?? ''}
                        onSave={(he,hf,obs) => salvarPonto(c.id, { status:p.status, horas_extra:he, horas_falta:hf, observacoes:obs })}
                        saving={isSaving}
                      />
                    )}
                  </div>
                )}

                {p && !isEdit && (p.horas_extra || p.horas_falta || p.observacoes) && (
                  <div style={{ padding:'0 14px 12px', display:'flex', gap:6, flexWrap:'wrap' }}>
                    {!!p.horas_extra && <span style={{ fontSize:11, background:'#dbeafe', color:'#1d4ed8', borderRadius:6, padding:'2px 8px', fontWeight:600 }}>+{p.horas_extra}h extra</span>}
                    {!!p.horas_falta && <span style={{ fontSize:11, background:'#fee2e2', color:'#dc2626', borderRadius:6, padding:'2px 8px', fontWeight:600 }}>-{p.horas_falta}h falta</span>}
                    {p.observacoes && <span style={{ fontSize:11, color:'#6b7280', fontStyle:'italic' }}>{p.observacoes}</span>}
                  </div>
                )}
              </div>
              </React.Fragment>
            )
          })
          })()}
        </div>
      </>)}

      {/* ── ABA AVULSO ── */}
      {subAba === 'avulso' && (
        <div style={{ padding:'16px 16px 32px', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#1d4ed8', fontWeight:600 }}>
            👤 Lance o ponto de qualquer colaborador em qualquer obra, independente do vínculo.<br/>
            <span style={{ fontSize:11, fontWeight:400, color:'#1e40af', marginTop:3, display:'block' }}>
              ✅ O colaborador avulso aparecerá <strong>automaticamente</strong> na lista de ponto da obra selecionada, com badge <strong>AVULSO</strong>. Não é necessário lançar novamente.
            </span>
          </div>

          {avulsoSucesso && (
            <div style={{ background:'#dcfce7', border:'1px solid #86efac', borderRadius:10, padding:'10px 14px', color:'#15803d', fontWeight:700, fontSize:13 }}>
              ✓ Ponto lançado com sucesso!
            </div>
          )}
          {avulsoErro && (
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'10px 14px', color:'#dc2626', fontWeight:700, fontSize:13 }}>
              {avulsoErro}
            </div>
          )}

          {/* Data */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>Data</label>
            <input type="date" value={dataSel} onChange={e => setDataSel(e.target.value)} style={INP}/>
          </div>

          {/* Colaborador — cards com busca (padrão do sistema) */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>Colaborador</label>
            {/* Busca */}
            <div style={{ position:'relative', marginBottom:8 }}>
              <input
                type="text"
                placeholder="🔍 Buscar por nome ou chapa…"
                value={avulsoBusca}
                onChange={e => setAvulsoBusca(e.target.value)}
                style={{ width:'100%', padding:'9px 34px 9px 12px', borderRadius:10, border:'1.5px solid #e5e7eb', fontSize:13, background:'#fff', boxSizing:'border-box', outline:'none' }}
              />
              {avulsoBusca && (
                <button onClick={() => setAvulsoBusca('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:14 }}>✕</button>
              )}
            </div>
            {/* Cards de colaborador agrupados por função */}
            <div style={{ maxHeight:260, overflowY:'auto', border:'1.5px solid #e5e7eb', borderRadius:10, background:'#f9fafb' }}>
              {(() => {
                const q = avulsoBusca.toLowerCase()
                const sorted = [...avulsoColabs]
                  .filter(c => !q || c.nome.toLowerCase().includes(q) || (c.chapa??'').toLowerCase().includes(q))
                  .sort((a,b) => {
                    const fa = (a.funcao ?? 'Sem função').toLowerCase()
                    const fb = (b.funcao ?? 'Sem função').toLowerCase()
                    return fa !== fb ? fa.localeCompare(fb) : a.nome.localeCompare(b.nome)
                  })
                if (sorted.length === 0) return (
                  <div style={{ padding:'20px', textAlign:'center', color:'#9ca3af', fontSize:13 }}>
                    {avulsoBusca ? 'Nenhum colaborador encontrado' : 'Carregando…'}
                  </div>
                )
                let lastF = ''
                return sorted.map(c => {
                  const fn = c.funcao ?? 'Sem função'
                  const isSelected = avulsoColabId === c.id
                  const header = fn !== lastF ? (lastF = fn, (
                    <div key={`h-${fn}`} style={{ padding:'6px 12px 4px', fontSize:10, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em', background:'#f1f5f9', borderBottom:'1px solid #e5e7eb' }}>
                      {fn}
                    </div>
                  )) : null
                  return (
                    <React.Fragment key={c.id}>
                      {header}
                      <div
                        onClick={() => setAvulsoColabId(isSelected ? '' : c.id)}
                        style={{
                          padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between',
                          cursor:'pointer', borderBottom:'1px solid #f1f5f9',
                          background: isSelected ? '#eff6ff' : '#fff',
                          borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                          transition:'all 0.15s',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight:700, fontSize:13, color: isSelected ? '#1d4ed8' : '#111' }}>{c.nome}</div>
                          <div style={{ fontSize:11, color:'#9ca3af' }}>{c.chapa && <span style={{ marginRight:8 }}>{c.chapa}</span>}{c.funcao}</div>
                        </div>
                        {isSelected && <span style={{ fontSize:18, color:'#3b82f6' }}>✓</span>}
                      </div>
                    </React.Fragment>
                  )
                })
              })()}
            </div>
            {avulsoColabId && (() => {
              const sel = avulsoColabs.find(c => c.id === avulsoColabId)
              return sel ? (
                <div style={{ marginTop:6, padding:'8px 12px', background:'#eff6ff', border:'1.5px solid #bfdbfe', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#1d4ed8' }}>✓ {sel.nome}</span>
                  <button onClick={() => setAvulsoColabId('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280', fontSize:12 }}>Alterar</button>
                </div>
              ) : null
            })()}
          </div>

          {/* Obra */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>Obra</label>
            <select value={avulsoObraId} onChange={e => setAvulsoObraId(e.target.value)} style={SEL}>
              <option value="">Selecione…</option>
              {obrasData.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:8, textTransform:'uppercase' }}>Status</label>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
              {(Object.entries(STATUS_CONFIG) as [StatusPonto, typeof STATUS_CONFIG[StatusPonto]][]).map(([status, sc]) => (
                <button type="button" key={status} onClick={() => setAvulsoStatus(status)} style={{
                  background: avulsoStatus===status ? sc.bg : '#f9fafb',
                  border:`2px solid ${avulsoStatus===status ? sc.cor : '#e5e7eb'}`,
                  borderRadius:10, padding:'8px 4px', cursor:'pointer',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                }}>
                  <span style={{ color:sc.cor }}>{sc.icon}</span>
                  <span style={{ fontSize:9, fontWeight:700, color:sc.cor, textAlign:'center', lineHeight:1.2 }}>{sc.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={salvarAvulso} disabled={avulsoSaving} style={{
            height:50, background: avulsoSaving ? '#94a3b8' : '#1e3a5f', color:'#fff',
            border:'none', borderRadius:12, fontSize:15, fontWeight:700,
            cursor: avulsoSaving ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
            {avulsoSaving ? <><Loader2 size={17} className="animate-spin"/>Salvando…</> : <><UserPlus size={17}/>Lançar Ponto Avulso</>}
          </button>
        </div>
      )}

      {/* ── ABA RELATÓRIO ── */}
      {subAba === 'relatorio' && (
        <div style={{ padding:'16px 16px 32px', display:'flex', flexDirection:'column', gap:14 }}>

          {/* ── Colaborador com busca + cards ── */}
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>Colaborador</label>
            <div style={{ position:'relative', marginBottom:8 }}>
              <input
                type="text"
                placeholder="🔍 Buscar por nome, chapa ou CPF…"
                value={relBusca}
                onChange={e => setRelBusca(e.target.value)}
                style={{ width:'100%', padding:'9px 34px 9px 12px', borderRadius:10, border:'1.5px solid #e5e7eb', fontSize:13, background:'#fff', boxSizing:'border-box', outline:'none' }}
              />
              {relBusca && (
                <button onClick={() => { setRelBusca(''); setRelColabId('') }} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:14 }}>✕</button>
              )}
            </div>
            {/* Cards de seleção */}
            <div style={{ maxHeight:220, overflowY:'auto', border:'1.5px solid #e5e7eb', borderRadius:10, background:'#f9fafb' }}>
              {/* "Todos" no topo */}
              <div
                onClick={() => { setRelColabId(''); setRelBusca('') }}
                style={{ padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', borderBottom:'1px solid #f1f5f9', background: relColabId==='' ? '#eff6ff' : '#fff', borderLeft: relColabId==='' ? '3px solid #3b82f6' : '3px solid transparent' }}
              >
                <span style={{ fontWeight:700, fontSize:13, color: relColabId==='' ? '#1d4ed8' : '#374151' }}>👥 Todos os colaboradores</span>
                {relColabId==='' && <span style={{ color:'#3b82f6', fontSize:16 }}>✓</span>}
              </div>
              {(() => {
                const q = relBusca.toLowerCase()
                const todos = [...avulsoColabs]
                const sorted = todos
                  .filter(c => !q || c.nome.toLowerCase().includes(q) || (c.chapa??'').toLowerCase().includes(q))
                  .sort((a,b) => {
                    const fa = (a.funcao ?? 'Sem função').toLowerCase()
                    const fb = (b.funcao ?? 'Sem função').toLowerCase()
                    return fa !== fb ? fa.localeCompare(fb) : a.nome.localeCompare(b.nome)
                  })
                if (!q && sorted.length === 0) return null
                if (q && sorted.length === 0) return (
                  <div style={{ padding:'14px', textAlign:'center', color:'#9ca3af', fontSize:13 }}>Nenhum colaborador encontrado</div>
                )
                let lastF2 = ''
                return sorted.map(c => {
                  const fn = c.funcao ?? 'Sem função'
                  const isSel = relColabId === c.id
                  const hdr = fn !== lastF2 ? (lastF2 = fn, (
                    <div key={`h2-${fn}`} style={{ padding:'5px 12px 3px', fontSize:10, fontWeight:800, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.07em', background:'#f1f5f9', borderBottom:'1px solid #e5e7eb' }}>
                      {fn}
                    </div>
                  )) : null
                  return (
                    <React.Fragment key={c.id}>
                      {hdr}
                      <div
                        onClick={() => { setRelColabId(isSel ? '' : c.id); setRelBusca('') }}
                        style={{ padding:'9px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', borderBottom:'1px solid #f1f5f9', background: isSel ? '#eff6ff' : '#fff', borderLeft: isSel ? '3px solid #3b82f6' : '3px solid transparent', transition:'all 0.12s' }}
                      >
                        <div>
                          <div style={{ fontWeight:700, fontSize:12, color: isSel ? '#1d4ed8' : '#111' }}>{c.nome}</div>
                          <div style={{ fontSize:10, color:'#9ca3af' }}>{c.chapa && <span style={{ marginRight:8 }}>{c.chapa}</span>}{c.funcao}</div>
                        </div>
                        {isSel && <span style={{ fontSize:16, color:'#3b82f6' }}>✓</span>}
                      </div>
                    </React.Fragment>
                  )
                })
              })()}
            </div>
            {relColabId && (() => {
              const sel = avulsoColabs.find(c => c.id === relColabId)
              return sel ? (
                <div style={{ marginTop:6, padding:'7px 12px', background:'#eff6ff', border:'1.5px solid #bfdbfe', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'#1d4ed8' }}>✓ {sel.nome}</span>
                  <button onClick={() => setRelColabId('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#6b7280', fontSize:11 }}>Todos</button>
                </div>
              ) : null
            })()}
          </div>

          {/* Período */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>De</label>
              <input type="date" value={relDtIni} onChange={e => setRelDtIni(e.target.value)} style={INP}/>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6, textTransform:'uppercase' }}>Até</label>
              <input type="date" value={relDtFim} onChange={e => setRelDtFim(e.target.value)} style={INP}/>
            </div>
          </div>

          <button onClick={gerarRelatorio} disabled={relLoading} style={{
            height:46, background: relLoading ? '#94a3b8' : '#1e3a5f', color:'#fff',
            border:'none', borderRadius:12, fontSize:14, fontWeight:700,
            cursor: relLoading ? 'not-allowed' : 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
            {relLoading ? <><Loader2 size={16} className="animate-spin"/>Buscando…</> : <>🔍 Buscar</>}
          </button>

          {relRows.length > 0 && (() => {
            // totais gerais
            const t = { presente:0, falta:0, producao:0, he:0, hf:0 }
            relRows.forEach(r => {
              if (r.status==='presente'||r.status==='meio_periodo') t.presente++
              if (r.status==='falta'||r.status==='falta_justificada') t.falta++
              if (r.status==='producao') t.producao++
              t.he += r.horas_extra ?? 0; t.hf += r.horas_falta ?? 0
            })

            // agrupar por colaborador_id
            const todos = [...colaboradores, ...avulsoColabs]
            const mapR: Record<string, typeof relRows> = {}
            relRows.forEach(r => {
              const cid = (r as any).colaborador_id ?? relColabId
              if (!mapR[cid]) mapR[cid] = []
              mapR[cid].push(r)
            })
            const colabsRes = Object.keys(mapR)
              .map(cid => {
                const info = todos.find(c => c.id === cid)
                return { id:cid, nome:info?.nome ?? 'Desconhecido', chapa:info?.chapa ?? '—', funcao:info?.funcao ?? 'Sem função', rows:mapR[cid] }
              })
              .sort((a,b) => {
                const fa = a.funcao.toLowerCase(), fb = b.funcao.toLowerCase()
                return fa !== fb ? fa.localeCompare(fb) : a.nome.localeCompare(b.nome)
              })

            let lastFuncTela = ''
            return (
              <>
                {/* Cards de totais gerais */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                  {[
                    { l:'Presenças', v:t.presente,   cor:'#15803d', bg:'#dcfce7' },
                    { l:'Produção',  v:t.producao,   cor:'#7c3aed', bg:'#f3e8ff' },
                    { l:'Faltas',    v:t.falta,       cor:'#dc2626', bg:'#fee2e2' },
                    { l:'H. Extra',  v:'+'+t.he+'h', cor:'#1d4ed8', bg:'#dbeafe' },
                  ].map(s => (
                    <div key={s.l} style={{ background:s.bg, borderRadius:10, padding:'8px 4px', textAlign:'center' }}>
                      <div style={{ fontWeight:800, fontSize:16, color:s.cor }}>{s.v}</div>
                      <div style={{ fontSize:9, color:s.cor, fontWeight:600 }}>{s.l}</div>
                    </div>
                  ))}
                </div>

                {/* Blocos por colaborador, separados por função */}
                {colabsRes.map(c => {
                  const isFuncNova = c.funcao !== lastFuncTela
                  if (isFuncNova) lastFuncTela = c.funcao
                  return (
                    <React.Fragment key={c.id}>
                      {isFuncNova && (
                        <div style={{ padding:'5px 10px', background:'#1e3a5f', borderRadius:8, fontSize:10, fontWeight:800, color:'#93c5fd', textTransform:'uppercase', letterSpacing:'0.05em', marginTop:4 }}>
                          👷 {c.funcao}
                        </div>
                      )}
                      <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e5e7eb', overflow:'hidden' }}>
                        {/* cabeçalho do colaborador */}
                        <div style={{ background:'#f8fafc', padding:'8px 12px', borderBottom:'1px solid #e5e7eb', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                          <div>
                            <div style={{ fontWeight:700, fontSize:13, color:'#1e293b' }}>{c.nome}</div>
                            <div style={{ display:'flex', gap:6, marginTop:3, flexWrap:'wrap' }}>
                              {c.chapa!=='—' && <span style={{ background:'#dbeafe', color:'#1d4ed8', borderRadius:4, padding:'1px 7px', fontSize:9, fontWeight:700 }}>Chapa: {c.chapa}</span>}
                              <span style={{ background:'#e0e7ff', color:'#4338ca', borderRadius:4, padding:'1px 7px', fontSize:9 }}>⚙️ {c.funcao}</span>
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                            {(() => {
                              const tc = { p:0, f:0 }
                              c.rows.forEach(r => {
                                if (r.status==='presente'||r.status==='meio_periodo') tc.p++
                                if (r.status==='falta'||r.status==='falta_justificada') tc.f++
                              })
                              return <>
                                <span style={{ background:'#dcfce7', color:'#15803d', borderRadius:4, padding:'2px 8px', fontSize:9, fontWeight:700 }}>✓ {tc.p}</span>
                                <span style={{ background:'#fee2e2', color:'#dc2626', borderRadius:4, padding:'2px 8px', fontSize:9, fontWeight:700 }}>✗ {tc.f}</span>
                              </>
                            })()}
                          </div>
                        </div>
                        {/* linhas de dias */}
                        {c.rows.map((r, i) => {
                          const sc = STATUS_CONFIG[r.status as StatusPonto] ?? { cor:'#374151', bg:'#f3f4f6', label:r.status, icon:'' }
                          const ob = obrasData.find(o=>o.id===r.obra_id)?.nome ?? '—'
                          const dt = new Date(r.data+'T12:00:00').toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit' })
                          return (
                            <div key={i} style={{ padding:'8px 12px', borderTop:i>0?'1px solid #f3f4f6':'none', display:'flex', gap:8, alignItems:'center' }}>
                              <div style={{ width:3, height:28, borderRadius:3, background:sc.cor, flexShrink:0 }}/>
                              <div style={{ flex:1 }}>
                                <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                                  <span style={{ fontWeight:700, fontSize:11, color:'#111', textTransform:'capitalize' }}>{dt}</span>
                                  <span style={{ background:sc.bg, color:sc.cor, borderRadius:4, padding:'1px 6px', fontSize:10, fontWeight:700 }}>{sc.label}</span>
                                  {!!r.horas_extra && <span style={{ fontSize:10, color:'#1d4ed8', fontWeight:600 }}>+{r.horas_extra}h</span>}
                                  {!!r.horas_falta && <span style={{ fontSize:10, color:'#dc2626', fontWeight:600 }}>-{r.horas_falta}h</span>}
                                </div>
                                <div style={{ fontSize:9, color:'#9ca3af' }}>📍 {ob}{r.observacoes ? ` · ${r.observacoes}` : ''}</div>
                              </div>
                              {/* ── Ações editar/excluir na linha ── */}
                              {(r as any).id && (
                                <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                                  <button
                                    title="Editar lançamento"
                                    onClick={() => {
                                      // Nome do colaborador
                                      const todosC = [...colaboradores, ...avulsoColabs]
                                      const cInfo  = todosC.find(x => x.id === ((r as any).colaborador_id ?? relColabId))
                                      setEditRel({
                                        id: (r as any).id,
                                        colaborador_nome: cInfo?.nome ?? 'Colaborador',
                                        data: r.data,
                                        status: r.status as StatusPonto,
                                        horas_extra: r.horas_extra ?? 0,
                                        horas_falta: r.horas_falta ?? 0,
                                        observacoes: r.observacoes ?? '',
                                      })
                                    }}
                                    style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, padding:'4px 7px', cursor:'pointer', display:'flex', alignItems:'center', gap:3, fontSize:10, fontWeight:700, color:'#1d4ed8' }}>
                                    ✏️
                                  </button>
                                  <button
                                    title="Excluir lançamento"
                                    onClick={() => setConfirmExcluir({ colabId:(r as any).colaborador_id ?? relColabId, nome: [...colaboradores,...avulsoColabs].find(x=>x.id===((r as any).colaborador_id??relColabId))?.nome ?? 'Colaborador', id:(r as any).id })}
                                    style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'4px 7px', cursor:'pointer', display:'flex', alignItems:'center', gap:3, fontSize:10, fontWeight:700, color:'#dc2626' }}>
                                    🗑️
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </React.Fragment>
                  )
                })}

                <button onClick={imprimirRelatorio} style={{
                  height:46, background:'#1e3a5f', color:'#fff', border:'none', borderRadius:12,
                  fontSize:14, fontWeight:700, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                }}>
                  <FileText size={16}/> Imprimir / PDF
                </button>
              </>
            )
          })()}

          {relRows.length === 0 && !relLoading && (
            <div style={{ background:'#f9fafb', borderRadius:10, padding:24, textAlign:'center', color:'#9ca3af' }}>
              Nenhum lançamento encontrado neste período
            </div>
          )}
        </div>
      )}

      {/* ══ MODAL: Edição inline do Relatório ══ */}
      {editRel && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:420, boxShadow:'0 12px 50px rgba(0,0,0,0.25)', overflow:'hidden' }}>
            {/* Header */}
            <div style={{ background:'#1e3a5f', padding:'16px 20px', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>✏️ Editar Lançamento</div>
                <div style={{ fontSize:11, color:'#93c5fd', marginTop:2 }}>
                  {editRel.colaborador_nome} · {new Date(editRel.data+'T12:00:00').toLocaleDateString('pt-BR',{ weekday:'short', day:'2-digit', month:'2-digit' })}
                </div>
              </div>
              <button onClick={() => setEditRel(null)} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, padding:'6px 10px', cursor:'pointer', color:'#fff', fontWeight:700, fontSize:13 }}>✕</button>
            </div>

            <div style={{ padding:'18px 20px', display:'flex', flexDirection:'column', gap:14 }}>
              {/* Status */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:8, textTransform:'uppercase' }}>Status</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:5 }}>
                  {(Object.entries(STATUS_CONFIG) as [StatusPonto, typeof STATUS_CONFIG[StatusPonto]][]).map(([status, sc]) => (
                    <button key={status} type="button" onClick={() => setEditRel(e => e ? { ...e, status } : e)} style={{
                      background: editRel.status===status ? sc.bg : '#f9fafb',
                      border:`2px solid ${editRel.status===status ? sc.cor : '#e5e7eb'}`,
                      borderRadius:10, padding:'8px 4px', cursor:'pointer',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                    }}>
                      <span style={{ color:sc.cor }}>{sc.icon}</span>
                      <span style={{ fontSize:8, fontWeight:700, color:sc.cor, textAlign:'center', lineHeight:1.2 }}>{sc.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* H. Extra / H. Falta */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  { label:'+ Horas Extra', field:'horas_extra' as const, cor:'#1d4ed8', bg:'#dbeafe' },
                  { label:'- Horas Falta', field:'horas_falta' as const, cor:'#dc2626', bg:'#fee2e2' },
                ].map(({ label, field, cor, bg }) => (
                  <div key={field} style={{ background:bg, borderRadius:10, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:cor, marginBottom:6 }}>{label}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <button type="button"
                        onClick={() => setEditRel(e => e ? { ...e, [field]: Math.max(0, parseFloat(((e[field] ?? 0) - 0.5).toFixed(1))) } : e)}
                        style={{ width:30, height:30, border:`1px solid ${cor}`, background:'#fff', borderRadius:6, cursor:'pointer', fontWeight:800, color:cor, fontSize:16 }}>−</button>
                      <span style={{ fontWeight:800, fontSize:16, color:cor, minWidth:32, textAlign:'center' }}>
                        {editRel[field] ?? 0}h
                      </span>
                      <button type="button"
                        onClick={() => setEditRel(e => e ? { ...e, [field]: parseFloat(((e[field] ?? 0) + 0.5).toFixed(1)) } : e)}
                        style={{ width:30, height:30, border:`1px solid ${cor}`, background:'#fff', borderRadius:6, cursor:'pointer', fontWeight:800, color:cor, fontSize:16 }}>+</button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Observação */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:6 }}>Observação (opcional)</div>
                <input
                  value={editRel.observacoes}
                  onChange={e => setEditRel(er => er ? { ...er, observacoes: e.target.value } : er)}
                  placeholder="Ex.: saiu mais cedo, chuva forte…"
                  style={{ width:'100%', height:40, border:'2px solid #e5e7eb', borderRadius:8, padding:'0 12px', fontSize:13, boxSizing:'border-box' }}
                />
              </div>

              {/* Botões */}
              <div style={{ display:'flex', gap:10 }}>
                <button type="button" onClick={() => setEditRel(null)} disabled={savingRel}
                  style={{ flex:1, height:46, border:'2px solid #e5e7eb', background:'#fff', borderRadius:12, fontWeight:700, fontSize:14, cursor:'pointer', color:'#374151' }}>
                  Cancelar
                </button>
                <button type="button" onClick={salvarEditRel} disabled={savingRel}
                  style={{ flex:2, height:46, border:'none', background: savingRel ? '#94a3b8' : '#15803d', borderRadius:12, fontWeight:700, fontSize:14, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  {savingRel ? <><Loader2 size={16} className="animate-spin"/>Salvando…</> : <><Save size={15}/>Salvar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Confirmação de Exclusão ══ */}
      {confirmExcluir && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, width:'100%', maxWidth:340, boxShadow:'0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Trash2 size={20} color="#dc2626"/>
              </div>
              <div>
                <div style={{ fontWeight:800, fontSize:15, color:'#1e293b' }}>Excluir lançamento</div>
                <div style={{ fontSize:11, color:'#6b7280' }}>Esta ação não pode ser desfeita</div>
              </div>
            </div>
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 14px', marginBottom:18, fontSize:13 }}>
              <span style={{ color:'#dc2626', fontWeight:700 }}>⚠ </span>
              Excluir o ponto de <strong>{confirmExcluir.nome}</strong> neste dia?
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setConfirmExcluir(null)} disabled={excluindo}
                style={{ flex:1, height:44, border:'2px solid #e5e7eb', background:'#fff', borderRadius:10, fontWeight:700, fontSize:14, cursor:'pointer', color:'#374151' }}>
                Cancelar
              </button>
              <button onClick={excluirPonto} disabled={excluindo}
                style={{ flex:1, height:44, border:'none', background: excluindo ? '#fca5a5' : '#dc2626', borderRadius:10, fontWeight:700, fontSize:14, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                {excluindo ? <><Loader2 size={15} className="animate-spin"/>Excluindo…</> : <><Trash2 size={15}/>Excluir</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Tela de Conferência ══ */}
      {pendConf && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:'24px 20px 32px', width:'100%', maxWidth:480, boxShadow:'0 -8px 40px rgba(0,0,0,0.2)' }}>
            {/* Handle */}
            <div style={{ width:40, height:4, background:'#e5e7eb', borderRadius:2, margin:'0 auto 20px' }}/>

            <div style={{ fontSize:14, fontWeight:800, color:'#1e293b', marginBottom:4 }}>✅ Confirmar lançamento</div>
            <div style={{ fontSize:11, color:'#6b7280', marginBottom:16 }}>Revise os dados antes de salvar</div>

            {/* Dados do colaborador */}
            <div style={{ background:'#1e3a5f', borderRadius:10, padding:'12px 14px', marginBottom:14, color:'#fff' }}>
              <div style={{ fontWeight:800, fontSize:14 }}>{pendConf.nome}</div>
              <div style={{ display:'flex', gap:8, marginTop:5, flexWrap:'wrap' }}>
                {pendConf.chapa && <span style={{ background:'rgba(255,255,255,0.15)', borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }}>Chapa: {pendConf.chapa}</span>}
                {pendConf.funcao && <span style={{ background:'rgba(255,255,255,0.15)', borderRadius:4, padding:'2px 8px', fontSize:10 }}>⚙️ {pendConf.funcao}</span>}
              </div>
            </div>

            {/* Status selecionado */}
            {(() => {
              const sc = STATUS_CONFIG[pendConf.status]
              return (
                <div style={{ background:sc.bg, border:`2px solid ${sc.cor}`, borderRadius:10, padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:22 }}>{sc.icon}</span>
                  <div>
                    <div style={{ fontWeight:800, fontSize:14, color:sc.cor }}>{sc.label}</div>
                    <div style={{ fontSize:10, color:sc.cor, opacity:0.7 }}>Status selecionado</div>
                  </div>
                </div>
              )
            })()}

            {/* H. Extra e H. Falta (se aplicável) */}
            {(pendConf.status==='presente'||pendConf.status==='meio_periodo'||pendConf.status==='producao') && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                {[
                  { label:'+ Horas Extra', field:'he' as const, cor:'#1d4ed8', bg:'#dbeafe', val:pendConf.he },
                  { label:'- Horas Falta', field:'hf' as const, cor:'#dc2626', bg:'#fee2e2', val:pendConf.hf },
                ].map(({ label, field, cor, bg, val }) => (
                  <div key={field} style={{ background:bg, borderRadius:10, padding:'10px 12px' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:cor, marginBottom:6 }}>{label}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <button onClick={() => setPendConf(p => p ? { ...p, [field]: Math.max(0, +(p[field]-0.5).toFixed(1)) } : p)}
                        style={{ width:28, height:28, border:`1px solid ${cor}`, background:'#fff', borderRadius:6, cursor:'pointer', fontWeight:800, color:cor, fontSize:16 }}>−</button>
                      <span style={{ fontWeight:800, fontSize:16, color:cor, minWidth:28, textAlign:'center' }}>{val}</span>
                      <button onClick={() => setPendConf(p => p ? { ...p, [field]: +(p[field]+0.5).toFixed(1) } : p)}
                        style={{ width:28, height:28, border:`1px solid ${cor}`, background:'#fff', borderRadius:6, cursor:'pointer', fontWeight:800, color:cor, fontSize:16 }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Observação */}
            <div style={{ marginBottom:18 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#374151', display:'block', marginBottom:5 }}>Observação (opcional)</label>
              <input value={pendConf.obs} onChange={e => setPendConf(p => p ? { ...p, obs:e.target.value } : p)}
                placeholder="Ex.: saiu mais cedo, chuva forte…"
                style={{ width:'100%', height:40, border:'2px solid #e5e7eb', borderRadius:8, padding:'0 12px', fontSize:13, boxSizing:'border-box' }}/>
            </div>

            {/* Botões */}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setPendConf(null)} disabled={confSaving}
                style={{ flex:1, height:48, border:'2px solid #e5e7eb', background:'#fff', borderRadius:12, fontWeight:700, fontSize:14, cursor:'pointer', color:'#374151' }}>
                Voltar
              </button>
              <button onClick={confirmarConferencia} disabled={confSaving}
                style={{ flex:2, height:48, border:'none', background: confSaving ? '#94a3b8' : '#15803d', borderRadius:12, fontWeight:700, fontSize:14, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {confSaving ? <><Loader2 size={16} className="animate-spin"/>Salvando…</> : <>✅ Confirmar e Salvar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  )
}

// ── Sub-componente HorasAjuste ────────────────────────────────────────────────
function HorasAjuste({ horasExtra, horasFalta, observacoes, onSave, saving }: {
  horasExtra: number; horasFalta: number; observacoes: string
  onSave: (he: number, hf: number, obs: string) => void; saving: boolean
}) {
  const [he,  setHe]  = useState(horasExtra)
  const [hf,  setHf]  = useState(horasFalta)
  const [obs, setObs] = useState(observacoes)
  function step(field: 'he'|'hf', dir: 1|-1) {
    if (field==='he') setHe(v => Math.max(0, +(v+dir*0.5).toFixed(1)))
    else              setHf(v => Math.max(0, +(v+dir*0.5).toFixed(1)))
  }
  return (
    <div style={{ background:'#f9fafb', borderRadius:10, padding:12, display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[
          { f:'he' as const, label:'+ Horas Extra', cor:'#1d4ed8', val:he },
          { f:'hf' as const, label:'- Horas Falta', cor:'#dc2626', val:hf },
        ].map(({ f, label, cor, val }) => (
          <div key={f}>
            <div style={{ fontSize:10, fontWeight:700, color:cor, marginBottom:4, textTransform:'uppercase' }}>{label}</div>
            <div style={{ display:'flex', alignItems:'center', gap:4 }}>
              <button onClick={() => step(f, -1)} style={{ width:30, height:30, background:'#fff', border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><Minus size={13}/></button>
              <span style={{ flex:1, textAlign:'center', fontWeight:800, fontSize:16, color:cor }}>{val}h</span>
              <button onClick={() => step(f, 1)} style={{ width:30, height:30, background:'#fff', border:'1px solid #e5e7eb', borderRadius:6, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><Plus size={13}/></button>
            </div>
          </div>
        ))}
      </div>
      <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)…"
        style={{ width:'100%', height:36, border:'1px solid #e5e7eb', borderRadius:8, padding:'0 10px', fontSize:12, boxSizing:'border-box', background:'#fff' }}/>
      <button onClick={() => onSave(he, hf, obs)} disabled={saving} style={{
        background: saving ? '#94a3b8' : '#1e3a5f', color:'#fff', border:'none', borderRadius:8,
        height:36, cursor: saving ? 'not-allowed' : 'pointer', fontWeight:700, fontSize:13,
        display:'flex', alignItems:'center', justifyContent:'center', gap:6,
      }}>
        {saving ? <><Loader2 size={14} className="animate-spin"/>Salvando…</> : <><Save size={14}/>Salvar ajustes</>}
      </button>
    </div>
  )
}
