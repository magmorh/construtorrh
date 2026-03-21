import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'
import { PageHeader, EmptyState, LoadingSkeleton } from '@/components/Shared'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, ExternalLink, Search } from 'lucide-react'
import { toast } from 'sonner'

type Colaborador = { id: string; nome: string; chapa: string }

type DocEntry = {
  id: string
  tipo: 'Atestado' | 'Advertência' | 'CAT (Acidente)'
  colaborador_id: string
  colaborador_nome: string
  colaborador_chapa: string
  data: string
  descricao: string
  documento_url: string
  documento_nome: string
}

const TIPO_COLORS: Record<string, { bg: string; color: string }> = {
  'Atestado':       { bg: '#eff6ff', color: '#1d4ed8' },
  'Advertência':    { bg: '#fffbeb', color: '#d97706' },
  'CAT (Acidente)': { bg: '#fff1f2', color: '#dc2626' },
}

function TipoBadge({ tipo }: { tipo: string }) {
  const s = TIPO_COLORS[tipo] ?? { bg: '#f3f4f6', color: '#6b7280' }
  return (
    <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>
      {tipo}
    </span>
  )
}

export default function Documentos() {
  const [docs,         setDocs]         = useState<DocEntry[]>([])
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filtroColabo,  setFiltroColabo]  = useState<string>('todos')
  const [filtroTipo,    setFiltroTipo]    = useState<string>('todos')
  const [busca,        setBusca]        = useState('')

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const [r1, r2, r3, r4] = await Promise.all([
      supabase.from('atestados')
        .select('id, colaborador_id, data, tipo, descricao, documento_url, documento_nome, colaboradores(id, nome, chapa)')
        .not('documento_url', 'is', null),
      supabase.from('advertencias')
        .select('id, colaborador_id, data_advertencia, tipo, motivo, documento_url, documento_nome, colaboradores(id, nome, chapa)')
        .not('documento_url', 'is', null),
      supabase.from('acidentes')
        .select('id, colaborador_id, data_acidente, tipo, descricao, documento_url, documento_nome, colaboradores(id, nome, chapa)')
        .not('documento_url', 'is', null)
        .eq('cat_emitida', true),
      supabase.from('colaboradores').select('id, nome, chapa').eq('status', 'ativo').order('nome'),
    ])

    const entries: DocEntry[] = []

    if (r1.error) toast.error('Erro atestados: ' + r1.error.message)
    else {
      for (const a of (r1.data ?? []) as any[]) {
        if (!a.documento_url) continue
        const col = Array.isArray(a.colaboradores) ? a.colaboradores[0] : a.colaboradores
        entries.push({
          id: a.id, tipo: 'Atestado', colaborador_id: a.colaborador_id,
          colaborador_nome: col?.nome ?? '—', colaborador_chapa: col?.chapa ?? '',
          data: a.data, descricao: `Tipo: ${a.tipo ?? '—'}${a.descricao ? ' · ' + a.descricao : ''}`,
          documento_url: a.documento_url, documento_nome: a.documento_nome ?? 'Atestado',
        })
      }
    }

    if (r2.error) toast.error('Erro advertências: ' + r2.error.message)
    else {
      for (const a of (r2.data ?? []) as any[]) {
        if (!a.documento_url) continue
        const col = Array.isArray(a.colaboradores) ? a.colaboradores[0] : a.colaboradores
        entries.push({
          id: a.id, tipo: 'Advertência', colaborador_id: a.colaborador_id,
          colaborador_nome: col?.nome ?? '—', colaborador_chapa: col?.chapa ?? '',
          data: a.data_advertencia, descricao: `${a.tipo ?? ''} · ${a.motivo ?? ''}`,
          documento_url: a.documento_url, documento_nome: a.documento_nome ?? 'Advertência',
        })
      }
    }

    if (r3.error) toast.error('Erro CAT: ' + r3.error.message)
    else {
      for (const a of (r3.data ?? []) as any[]) {
        if (!a.documento_url) continue
        const col = Array.isArray(a.colaboradores) ? a.colaboradores[0] : a.colaboradores
        entries.push({
          id: a.id, tipo: 'CAT (Acidente)', colaborador_id: a.colaborador_id,
          colaborador_nome: col?.nome ?? '—', colaborador_chapa: col?.chapa ?? '',
          data: a.data_acidente, descricao: `${a.tipo ?? ''} · ${a.descricao ?? ''}`,
          documento_url: a.documento_url, documento_nome: a.documento_nome ?? 'CAT',
        })
      }
    }

    // ordena por data desc
    entries.sort((a, b) => (a.data > b.data ? -1 : 1))
    setDocs(entries)
    setColaboradores((r4.data as Colaborador[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = docs.filter(d => {
    if (filtroColabo !== 'todos' && d.colaborador_id !== filtroColabo) return false
    if (filtroTipo   !== 'todos' && d.tipo !== filtroTipo)             return false
    if (busca.trim()) {
      const q = busca.toLowerCase()
      if (!d.colaborador_nome.toLowerCase().includes(q) && !d.descricao.toLowerCase().includes(q) && !d.documento_nome.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 24 }}>
      <PageHeader
        title="Documentos"
        subtitle={`Todos os documentos anexados ao sistema · ${filtered.length} documento${filtered.length !== 1 ? 's' : ''}`}
      />

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', top: 10, left: 10, color: '#9ca3af' }} />
          <Input
            placeholder="Buscar…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <Select value={filtroColabo} onValueChange={setFiltroColabo}>
            <SelectTrigger><SelectValue placeholder="Todos os colaboradores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os colaboradores</SelectItem>
              {colaboradores.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.nome}{c.chapa ? ` — ${c.chapa}` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div style={{ minWidth: 180 }}>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="Atestado">Atestado</SelectItem>
              <SelectItem value="Advertência">Advertência</SelectItem>
              <SelectItem value="CAT (Acidente)">CAT (Acidente)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <LoadingSkeleton /> :
        filtered.length === 0 ? (
          <EmptyState
            icon={<FileText size={40} color="#94a3b8" />}
            title="Nenhum documento encontrado"
            description="Os documentos anexados em Atestados, Advertências e CATs aparecerão aqui."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Arquivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(d => (
                  <TableRow key={`${d.tipo}-${d.id}`}>
                    <TableCell><TipoBadge tipo={d.tipo} /></TableCell>
                    <TableCell>
                      <div style={{ fontWeight: 600 }}>{d.colaborador_nome}</div>
                      {d.colaborador_chapa && <div style={{ fontSize: 11, color: '#94a3b8' }}>{d.colaborador_chapa}</div>}
                    </TableCell>
                    <TableCell style={{ fontSize: 13 }}>{formatDate(d.data)}</TableCell>
                    <TableCell style={{ fontSize: 12, color: '#64748b', maxWidth: 240 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.descricao}</div>
                    </TableCell>
                    <TableCell>
                      <a
                        href={d.documento_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          fontSize: 12, fontWeight: 600, color: '#2563eb', textDecoration: 'none',
                          padding: '4px 10px', borderRadius: 6, border: '1px solid #bfdbfe',
                          background: '#eff6ff',
                        }}
                      >
                        <FileText size={13} />
                        {d.documento_nome.length > 28
                          ? d.documento_nome.slice(0, 25) + '…'
                          : d.documento_nome}
                        <ExternalLink size={11} />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      }
    </div>
  )
}
