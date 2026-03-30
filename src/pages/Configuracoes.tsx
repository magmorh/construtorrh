import React, { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/Shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
// tabs import removed — using sidebar nav instead
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { Settings, Save, Building2, Sliders, Users, Loader2, Shield, Percent, Upload, Trash2, ImageIcon, Plus } from 'lucide-react'

// ─── tipos ───────────────────────────────────────────────────────────────────
interface ConfigMap {
  [chave: string]: string
}

interface Profile {
  id: string
  nome: string | null
  email: string | null
  role: string | null
  ativo: boolean
}

interface ParamConfig {
  chave: string
  label: string
  descricao: string
  tipo: 'number' | 'text'
  sufixo?: string
  defaultVal?: string
}

// ─── parâmetros de pagamento ──────────────────────────────────────────────────
const PARAMS: ParamConfig[] = [
  {
    chave: 'jornada_horas',
    label: 'Jornada de Trabalho',
    descricao: 'Horas semanais de trabalho (padrão: 44h)',
    tipo: 'number',
    sufixo: 'h/semana',

    defaultVal: '44',
  },
  {
    chave: 'he_percentual_60',
    label: 'Hora Extra — Dias Úteis',
    descricao: 'Percentual de acréscimo para horas extras em dias úteis (segunda a sexta)',
    tipo: 'number',
    sufixo: '%',

    defaultVal: '60',
  },
  {
    chave: 'he_percentual_100',
    label: 'Hora Extra — Domingos e Feriados',
    descricao: 'Percentual de acréscimo para horas extras em domingos e feriados (padrão: 100%)',
    tipo: 'number',
    sufixo: '%',

    defaultVal: '100',
  },
  {
    chave: 'he_percentual_sabado',
    label: 'Hora Extra — Sábado',
    descricao: 'Percentual de acréscimo para horas extras trabalhadas no sábado (padrão: 50%)',
    tipo: 'number',
    sufixo: '%',

    defaultVal: '50',
  },
  {
    chave: 'he_percentual_domingo',
    label: 'Hora Extra — Domingo / Feriado',
    descricao: 'Percentual de acréscimo para horas extras trabalhadas no domingo ou feriado (padrão: 100%)',
    tipo: 'number',
    sufixo: '%',

    defaultVal: '100',
  },
  {
    chave: 'adicional_noturno_pct',
    label: 'Adicional Noturno',
    descricao: 'Percentual de adicional noturno (22h–05h) sobre o valor hora (padrão: 20%)',
    tipo: 'number',
    sufixo: '%',

    defaultVal: '20',
  },
  {
    chave: 'vt_desconto_pct',
    label: 'Desconto VT',
    descricao: 'Percentual de desconto do vale transporte sobre o salário do colaborador',
    tipo: 'number',
    sufixo: '%',

    defaultVal: '6',
  },
  {
    chave: 'inss_aliquota',
    label: 'Alíquota INSS (simplificado)',
    descricao: 'Alíquota única para cálculo simplificado do INSS (use quando não usa tabela progressiva)',
    tipo: 'number',
    sufixo: '%',

    defaultVal: '14',
  },
  {
    chave: 'fgts_aliquota',
    label: 'Alíquota FGTS',
    descricao: 'Percentual de FGTS sobre o salário bruto (padrão: 8%)',
    tipo: 'number',
    sufixo: '%',

    defaultVal: '8',
  },
  {
    chave: 'inss_patronal_aliquota',
    label: 'INSS Patronal',
    descricao: 'Percentual de INSS patronal sobre a folha (padrão: 20%)',
    tipo: 'number',
    sufixo: '%',

    defaultVal: '20',
  },
  {
    chave: 'rat_aliquota',
    label: 'RAT (Risco Acidente de Trabalho)',
    descricao: 'Percentual RAT — varia conforme risco da atividade: 1%, 2% ou 3% (padrão: 3,5% com FAP)',
    tipo: 'number',
    sufixo: '%',

    defaultVal: '3.5',
  },
]

// ─── tabelas padrão INSS e IR ────────────────────────────────────────────────
const DEFAULT_INSS = [
  { id: '1', faixa_ate: '1621.00',  aliquota: '7.5',  deducao: '0' },
  { id: '2', faixa_ate: '2902.84',  aliquota: '9.0',  deducao: '24.32' },
  { id: '3', faixa_ate: '4354.27',  aliquota: '12.0', deducao: '111.40' },
  { id: '4', faixa_ate: '8475.55',  aliquota: '14.0', deducao: '198.49' },
]
// Nova tabela IR 2026 com regra progressiva e isenção até R$ 5.000
const DEFAULT_IR = [
  { id: '1', faixa_ate: '2428.80',  aliquota: '0',    deducao: '0',      descricao: 'Isento' },
  { id: '2', faixa_ate: '2826.65',  aliquota: '7.5',  deducao: '182.16', descricao: 'Isento até completar R$5.000' },
  { id: '3', faixa_ate: '3751.05',  aliquota: '15.0', deducao: '394.16', descricao: 'Isento até completar R$5.000' },
  { id: '4', faixa_ate: '4664.68',  aliquota: '22.5', deducao: '675.49', descricao: 'Isento até completar R$5.000' },
  { id: '5', faixa_ate: '5000.00',  aliquota: '27.5', deducao: '908.73', descricao: 'Isento total (regra nova)' },
  { id: '6', faixa_ate: '7350.00',  aliquota: '27.5', deducao: '908.73', descricao: 'Aplicar redução progressiva' },
  { id: '7', faixa_ate: '999999',   aliquota: '27.5', deducao: '908.73', descricao: 'Tabela normal (sem desconto)' },
]
interface FaixaINSS { id: string; faixa_ate: string; aliquota: string; deducao: string }
interface FaixaIR   { id: string; faixa_ate: string; aliquota: string; deducao: string; descricao: string }

// ─── alíquotas de rescisão ────────────────────────────────────────────────────
interface VerbaRescisoria {
  id: string
  label: string         // nome da verba
  aliquota: string      // percentual ou valor fixo
  tipo: 'percentual'|'fixo'  // percentual do salário ou valor fixo
  ativo: boolean        // ativado/desativado pelo usuário
  editavel: boolean     // pode o usuário editar? false = verbas legais fixas
  descricao: string
}

const DEFAULT_RESCISAO: VerbaRescisoria[] = [
  { id: 'aviso_previo',       label: 'Aviso Prévio',            aliquota: '100', tipo: 'percentual', ativo: true,  editavel: false, descricao: '1 salário por até 3 anos + 3 dias por ano adicional (CLT)' },
  { id: '13_proporcional',    label: '13º Proporcional',        aliquota: '100', tipo: 'percentual', ativo: true,  editavel: false, descricao: '1/12 do salário por mês trabalhado' },
  { id: 'ferias_proporcional',label: 'Férias Proporcionais',    aliquota: '100', tipo: 'percentual', ativo: true,  editavel: false, descricao: 'Férias vencidas + proporcionais + 1/3 constitucional' },
  { id: 'fgts_saldo',         label: 'Saldo FGTS',              aliquota: '8',   tipo: 'percentual', ativo: true,  editavel: true,  descricao: 'Percentual de FGTS sobre saldo devedor' },
  { id: 'multa_fgts_40',      label: 'Multa FGTS 40%',          aliquota: '40',  tipo: 'percentual', ativo: true,  editavel: true,  descricao: 'Multa de 40% sobre o saldo do FGTS (dispensa sem justa causa)' },
  { id: 'multa_fgts_20',      label: 'Multa FGTS 20% (pedido)', aliquota: '20',  tipo: 'percentual', ativo: false, editavel: true,  descricao: 'Multa de 20% sobre FGTS (pedido de demissão)' },
  { id: 'inss_rescisao',      label: 'INSS s/ Rescisão',        aliquota: '11',  tipo: 'percentual', ativo: true,  editavel: true,  descricao: 'Desconto INSS sobre verbas rescisórias incidentes' },
  { id: 'ir_rescisao',        label: 'IR s/ Rescisão',          aliquota: '0',   tipo: 'percentual', ativo: true,  editavel: true,  descricao: 'IR sobre verbas rescisórias tributáveis (usar tabela progressiva)' },
]

// ─── campos de empresa ────────────────────────────────────────────────────────
const EMPRESA_FIELDS: { chave: string; label: string; placeholder: string }[] = [
  { chave: 'empresa_nome',         label: 'Nome da Empresa',     placeholder: 'Construtora Exemplo Ltda.' },
  { chave: 'empresa_razao_social', label: 'Razão Social',         placeholder: 'Construtora Exemplo Ltda. ME' },
  { chave: 'empresa_cnpj',         label: 'CNPJ',                placeholder: '00.000.000/0001-00' },
  { chave: 'empresa_responsavel',  label: 'Responsável',          placeholder: 'Nome do responsável' },
  { chave: 'empresa_telefone',     label: 'Telefone',             placeholder: '(11) 3000-0000' },
  { chave: 'empresa_email',        label: 'E-mail',              placeholder: 'contato@empresa.com.br' },
  { chave: 'empresa_endereco',     label: 'Endereço Completo',   placeholder: 'Rua das Flores, 123 — Jardim Primavera' },
  { chave: 'empresa_cidade',       label: 'Cidade / UF',         placeholder: 'São Paulo / SP' },
  { chave: 'empresa_cep',          label: 'CEP',                 placeholder: '00000-000' },
]

// ─── componente ──────────────────────────────────────────────────────────────
// ─── Itens da nav lateral de Configurações ────────────────────────────────
const CFG_NAV = [
  { id: 'empresa',    label: 'Empresa',                icon: Building2, color: '#0ea5e9' },
  { id: 'parametros', label: 'Parâmetros de Pagamento', icon: Sliders,   color: '#8b5cf6' },
  { id: 'encargos',   label: 'Tabelas de Encargos',     icon: Shield,    color: '#f97316' },
  { id: 'rescisao',   label: 'Rescisão',                icon: Percent,   color: '#ec4899' },
  { id: 'usuarios',   label: 'Usuários',                icon: Users,     color: '#14b8a6' },
] as const
type CfgTab = typeof CFG_NAV[number]['id']

export default function Configuracoes() {
  const [configs, setConfigs] = useState<ConfigMap>({})
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingConfigs, setLoadingConfigs] = useState(true)
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [savingEmpresa, setSavingEmpresa] = useState(false)
  const [savingParams, setSavingParams] = useState(false)
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null)
  const [tabelaInss, setTabelaInss] = useState<FaixaINSS[]>(DEFAULT_INSS)
  const [tabelaIR, setTabelaIR]     = useState<FaixaIR[]>(DEFAULT_IR)
  const [savingEncargos, setSavingEncargos] = useState(false)
  const [tabelaRescisao, setTabelaRescisao] = useState<VerbaRescisoria[]>(DEFAULT_RESCISAO)
  const [savingRescisao, setSavingRescisao] = useState(false)
  const [cfgTab, setCfgTab]               = useState<CfgTab>('empresa')
  // "Outros" encargos de rescisão adicionados pelo usuário
  const [outrosRescisao, setOutrosRescisao] = useState<VerbaRescisoria[]>([])
  const [uploadingLogo, setUploadingLogo]   = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // ─── upload logo ─────────────────────────────────────────────────────────
  // Converte a imagem para base64 e salva DIRETAMENTE no banco.
  // Sem Storage, sem URL, sem CORS — funciona sempre nos relatórios.
  async function handleLogoUpload(file: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem (PNG, JPG, SVG, WebP)')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Imagem muito grande. Limite: 2 MB')
      return
    }

    setUploadingLogo(true)
    try {
      // Converte para base64 data URI
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Falha ao ler o arquivo'))
        reader.readAsDataURL(file)
      })

      // Salva o base64 diretamente na tabela configuracoes
      const { error } = await supabase.from('configuracoes').upsert(
        { chave: 'empresa_logo_url', valor: base64 },
        { onConflict: 'chave' }
      )
      if (error) throw error

      setConfig('empresa_logo_url', base64)
      toast.success('Logo salvo com sucesso! ✓')
    } catch (err: any) {
      console.error('Erro ao salvar logo:', err)
      toast.error('Erro ao salvar logo: ' + (err?.message ?? 'tente novamente'))
    } finally {
      setUploadingLogo(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function handleLogoRemove() {
    await supabase.from('configuracoes').upsert(
      { chave: 'empresa_logo_url', valor: '' },
      { onConflict: 'chave' }
    )
    setConfig('empresa_logo_url', '')
    toast.success('Logo removido')
  }

  // ─── fetch configs ─────────────────────────────────────────────────────────
  const fetchConfigs = useCallback(async () => {
    setLoadingConfigs(true)
    const { data, error } = await supabase.from('configuracoes').select('chave, valor')
    if (error) {
      toast.error('Erro ao carregar configurações')
    } else {
      const map: ConfigMap = {}
      ;(data ?? []).forEach((r: { chave: string; valor: string | null }) => {
        map[r.chave] = r.valor ?? ''
      })

      // ── Preencher defaults para parâmetros novos ainda não salvos no banco ──
      const defaults: Record<string, string> = {
        jornada_horas:          '44',
        he_percentual_60:       '60',
        he_percentual_100:      '100',
        he_percentual_sabado:   '50',
        he_percentual_domingo:  '100',
        adicional_noturno_pct:  '20',
        vt_desconto_pct:        '6',
        inss_aliquota:          '14',
        fgts_aliquota:          '8',
        inss_patronal_aliquota: '20',
        rat_aliquota:           '3.5',
      }
      for (const [chave, val] of Object.entries(defaults)) {
        if (!map[chave] || map[chave] === '') map[chave] = val
      }

      setConfigs(map)
      // Carregar tabelas INSS / IR se salvas
      if (map['tabela_inss']) {
        try { setTabelaInss(JSON.parse(map['tabela_inss'])) } catch {}
      }
      if (map['tabela_ir']) {
        try { setTabelaIR(JSON.parse(map['tabela_ir'])) } catch {}
      }
      // Carregar alíquotas de rescisão
      if (map['tabela_rescisao']) {
        try { setTabelaRescisao(JSON.parse(map['tabela_rescisao'])) } catch {}
      }
      if (map['outros_rescisao']) {
        try { setOutrosRescisao(JSON.parse(map['outros_rescisao'])) } catch {}
      }
    }
    setLoadingConfigs(false)
  }, [])

  // ─── fetch profiles ────────────────────────────────────────────────────────
  const fetchProfiles = useCallback(async () => {
    setLoadingProfiles(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome, email, role, ativo')
      .order('nome')
    if (error) {
      toast.error('Erro ao carregar usuários')
    } else {
      setProfiles(
        (data ?? []).map((p: Record<string, unknown>) => ({
          id: String(p.id),
          nome: p.nome != null ? String(p.nome) : null,
          email: p.email != null ? String(p.email) : null,
          role: p.role != null ? String(p.role) : null,
          ativo: Boolean(p.ativo),
        }))
      )
    }
    setLoadingProfiles(false)
  }, [])

  useEffect(() => { fetchConfigs() }, [fetchConfigs])

  async function handleSaveEncargos() {
    setSavingEncargos(true)
    const upserts = [
      { chave: 'tabela_inss', valor: JSON.stringify(tabelaInss) },
      { chave: 'tabela_ir',   valor: JSON.stringify(tabelaIR) },
    ]
    for (const u of upserts) {
      await supabase.from('configuracoes').upsert({ chave: u.chave, valor: u.valor }, { onConflict: 'chave' })
    }
    setSavingEncargos(false)
    toast.success('Tabelas de encargos salvas! Lançamentos já fechados/pagos não foram alterados.')
  }

  async function handleSaveRescisao() {
    setSavingRescisao(true)
    await supabase.from('configuracoes').upsert({ chave: 'tabela_rescisao', valor: JSON.stringify(tabelaRescisao) }, { onConflict: 'chave' })
    await supabase.from('configuracoes').upsert({ chave: 'outros_rescisao',  valor: JSON.stringify(outrosRescisao) }, { onConflict: 'chave' })
    setSavingRescisao(false)
    toast.success('Alíquotas de rescisão salvas! Rescisões já processadas não foram alteradas.')
  }

  function addOutroRescisao() {
    const novo: VerbaRescisoria = {
      id: `outro_${Date.now()}`,
      label: 'Nova Verba',
      aliquota: '0',
      tipo: 'percentual',
      ativo: true,
      editavel: true,
      descricao: '',
    }
    setOutrosRescisao(prev => [...prev, novo])
  }

  function removeOutroRescisao(id: string) {
    setOutrosRescisao(prev => prev.filter(v => v.id !== id))
  }

  function setConfig(chave: string, valor: string) {
    setConfigs((prev) => ({ ...prev, [chave]: valor }))
  }

  // ─── upsert config ─────────────────────────────────────────────────────────
  async function upsertConfigs(chaves: string[], setSaving: (v: boolean) => void) {
    setSaving(true)
    const payload = chaves.map((chave) => ({
      chave,
      valor: configs[chave] ?? '',
    }))
    const { error } = await supabase
      .from('configuracoes')
      .upsert(payload, { onConflict: 'chave' })
    setSaving(false)
    if (error) toast.error('Erro ao salvar: ' + error.message)
    else toast.success('Configurações salvas!')
  }

  // ─── salvar empresa ────────────────────────────────────────────────────────
  async function handleSaveEmpresa() {
    await upsertConfigs(
      [...EMPRESA_FIELDS.map((f) => f.chave), 'empresa_logo_url'],
      setSavingEmpresa,
    )
  }

  // ─── salvar parâmetros ─────────────────────────────────────────────────────
  async function handleSaveParams() {
    setSavingParams(true)
    const payload = PARAMS.map(p => ({ chave: p.chave, valor: configs[p.chave] ?? '' }))
    const { error } = await supabase.from('configuracoes').upsert(payload, { onConflict: 'chave' })
    setSavingParams(false)
    if (error) toast.error('Erro ao salvar: ' + error.message)
    else toast.success('Parâmetros salvos! Novos cálculos usarão estes valores. Lançamentos já fechados/pagos não foram alterados.')
  }

  // ─── salvar perfil ─────────────────────────────────────────────────────────
  async function handleSaveProfile(profile: Profile) {
    setSavingProfileId(profile.id)
    const { error } = await supabase
      .from('profiles')
      .update({ role: profile.role, ativo: profile.ativo })
      .eq('id', profile.id)
    setSavingProfileId(null)
    if (error) toast.error('Erro ao salvar usuário: ' + error.message)
    else toast.success('Usuário atualizado!')
  }

  function updateProfile(id: string, field: keyof Profile, value: string | boolean) {
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    )
  }

// ─── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0 }}>
      {/* cabeçalho */}
      <div style={{ padding:'20px 24px 0', flexShrink:0 }}>
        <PageHeader
          title="Configurações"
          subtitle="Parâmetros e configurações do sistema ConstrutorRH"
          action={<Settings className="w-5 h-5 text-muted-foreground" />}
        />
      </div>

      {loadingConfigs ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        /* ── layout lateral ──────────────────────────────────────── */
        <div style={{ display:'flex', flex:1, minHeight:0, gap:0, padding:'16px 24px 24px' }}>

          {/* ── sidebar esquerda ─────────────────────────────────── */}
          <div style={{
            width: 220, minWidth: 220, flexShrink: 0,
            background: '#fff', border: '1px solid #e2e8f0',
            borderRadius: 12, padding: '8px 0',
            alignSelf: 'flex-start',
            position: 'sticky', top: 0,
          }}>
            {CFG_NAV.map(item => {
              const Icon = item.icon
              const active = cfgTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCfgTab(item.id)
                    if (item.id === 'usuarios' && profiles.length === 0) fetchProfiles()
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '10px 16px',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    borderRadius: 0,
                    background: active ? `${item.color}12` : 'transparent',
                    borderLeft: active ? `3px solid ${item.color}` : '3px solid transparent',
                    transition: 'background .15s',
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                    background: active ? item.color : '#f1f5f9',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={14} color={active ? '#fff' : '#64748b'} />
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    color: active ? '#1e293b' : '#475569',
                    lineHeight: 1.3,
                  }}>{item.label}</span>
                </button>
              )
            })}
          </div>

          {/* ── conteúdo da aba ──────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, paddingLeft: 20 }}>

          {/* ── Tab Empresa ────────────────────────────────────────────── */}
          {cfgTab === 'empresa' && (<div>
            <div className="bg-card border border-border rounded-xl p-6">
              <h2 className="font-semibold text-base mb-1">Dados da Empresa</h2>
              <p className="text-sm text-muted-foreground mb-5">
                Informações da empresa exibidas nos relatórios e documentos.
              </p>
              <Separator className="mb-5" />
              <div className="space-y-4">
                {EMPRESA_FIELDS.map((field) => (
                  <div key={field.chave}>
                    <Label htmlFor={field.chave}>{field.label}</Label>
                    <Input
                      id={field.chave}
                      value={configs[field.chave] ?? ''}
                      onChange={(e) => setConfig(field.chave, e.target.value)}
                      placeholder={field.placeholder}
                      className="mt-1"
                    />
                  </div>
                ))}

                {/* ── Logo da empresa — upload de arquivo ── */}
                <div>
                  <Label>Logo da Empresa</Label>
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8, marginTop: 2 }}>
                    PNG, JPG, SVG ou WebP · máx. 2 MB
                  </p>

                  {/* Preview + ações (quando há logo) */}
                  {configs['empresa_logo_url'] ? (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      padding: 14, borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                    }}>
                      {/* thumbnail */}
                      <div style={{
                        width: 80, height: 80, borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: '#f8fafc',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', flexShrink: 0,
                      }}>
                        <img
                          src={configs['empresa_logo_url']}
                          alt="Logo"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--foreground)', fontWeight: 600, marginBottom: 4 }}>
                          Logo carregado ✓
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', wordBreak: 'break-all', marginBottom: 10 }}>
                          {configs['empresa_logo_url'].startsWith('data:') ? 'Logo salvo (base64)' : configs['empresa_logo_url'].split('/').pop()}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            disabled={uploadingLogo}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                              border: '1px solid var(--border)', background: 'var(--background)',
                              color: 'var(--foreground)', cursor: 'pointer',
                            }}
                          >
                            {uploadingLogo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                            Trocar logo
                          </button>
                          <button
                            type="button"
                            onClick={handleLogoRemove}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                              border: '1px solid #fecaca', background: '#fff5f5',
                              color: '#dc2626', cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={13} /> Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Área de drop / clique quando não há logo */
                    <div
                      onClick={() => !uploadingLogo && logoInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        const f = e.dataTransfer.files[0]
                        if (f) handleLogoUpload(f)
                      }}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                        padding: '28px 20px', borderRadius: 10, cursor: uploadingLogo ? 'wait' : 'pointer',
                        border: '2px dashed var(--border)', background: 'var(--card)',
                        transition: 'border-color .2s, background .2s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#2563eb'; (e.currentTarget as HTMLDivElement).style.background = '#f0f7ff' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = ''; (e.currentTarget as HTMLDivElement).style.background = '' }}
                    >
                      {uploadingLogo
                        ? <Loader2 size={28} className="animate-spin" style={{ color: '#2563eb' }} />
                        : <ImageIcon size={28} style={{ color: '#9ca3af' }} />
                      }
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: uploadingLogo ? '#2563eb' : 'var(--foreground)' }}>
                          {uploadingLogo ? 'Enviando logo…' : 'Clique ou arraste o logo aqui'}
                        </div>
                        {!uploadingLogo && (
                          <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 3 }}>
                            PNG, JPG, SVG ou WebP · máx. 2 MB
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* input file oculto */}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleLogoUpload(f)
                    }}
                  />

                  {/* Campo URL manual — opção avançada */}
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ fontSize: 12, color: 'var(--muted-foreground)', cursor: 'pointer', userSelect: 'none' }}>
                      Ou informe a URL manualmente
                    </summary>
                    <Input
                      value={configs['empresa_logo_url'] ?? ''}
                      onChange={(e) => setConfig('empresa_logo_url', e.target.value)}
                      placeholder="https://exemplo.com/logo.png"
                      className="mt-2"
                      style={{ fontSize: 12 }}
                    />
                  </details>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={handleSaveEmpresa} disabled={savingEmpresa}>
                  {savingEmpresa ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Salvando…</>
                  ) : (
                    <><Save className="w-4 h-4 mr-1.5" /> Salvar dados da empresa</>
                  )}
                </Button>
              </div>
            </div>
          </div>)}

          {/* ── Tab Parâmetros ─────────────────────────────────────────── */}
          {cfgTab === 'parametros' && (<div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* Banner regra de ouro */}
              <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px', borderRadius:10, background:'#fefce8', border:'1px solid #fde047' }}>
                <span style={{ fontSize:18, marginTop:1 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:'#854d0e' }}>Regra de Ouro — Alterações não retroagem</div>
                  <div style={{ fontSize:12, color:'#a16207', marginTop:2 }}>
                    Lançamentos já <strong>fechados ou pagos</strong> gravam um <em>snapshot</em> com as alíquotas vigentes no momento do fechamento.
                    Alterar estes valores afeta <strong>somente cálculos futuros</strong> — nunca o que já foi processado.
                  </div>
                </div>
              </div>

              {/* Grupo: Jornada */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <Sliders size={16} style={{ color:'#0369a1' }}/>
                  <h2 className="font-semibold text-base">Jornada de Trabalho</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Configurações da jornada semanal e coeficientes de horas extras.</p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {PARAMS.filter(p=>['jornada_horas','he_percentual_60','he_percentual_100','he_percentual_sabado','he_percentual_domingo','adicional_noturno_pct'].includes(p.chave)).map((param) => (
                    <div key={param.chave} style={{
                      display:'grid', gridTemplateColumns:'1fr 140px',
                      gap:12, alignItems:'center',
                      padding:'10px 14px', borderRadius:8,
                      border:'1px solid var(--border)',
                      background:'var(--card)',
                    }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13 }}>{param.label}</div>
                        <div style={{ fontSize:11, color:'var(--muted-foreground)', marginTop:2 }}>{param.descricao}</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end' }}>
                        <input
                          type="number" step="0.01"
                          value={configs[param.chave] !== undefined && configs[param.chave] !== '' ? configs[param.chave] : (param.defaultVal ?? '')}
                          onChange={e => setConfig(param.chave, e.target.value)}
                          placeholder="0"
                          style={{ width:80, padding:'5px 8px', borderRadius:6, border:'1px solid var(--border)', fontSize:13, textAlign:'right', background:'var(--background)' }}
                        />
                        {param.sufixo && <span style={{ fontSize:12, color:'var(--muted-foreground)', minWidth:28 }}>{param.sufixo}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grupo: Descontos e Encargos */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <Percent size={16} style={{ color:'#7c3aed' }}/>
                  <h2 className="font-semibold text-base">Descontos e Encargos</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Percentuais de desconto e encargos aplicados na folha de pagamento.</p>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {PARAMS.filter(p=>['vt_desconto_pct','inss_aliquota','fgts_aliquota','inss_patronal_aliquota','rat_aliquota'].includes(p.chave)).map((param) => (
                    <div key={param.chave} style={{
                      display:'grid', gridTemplateColumns:'1fr 140px',
                      gap:12, alignItems:'center',
                      padding:'10px 14px', borderRadius:8,
                      border:'1px solid var(--border)',
                      background:'var(--card)',
                    }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:13 }}>{param.label}</div>
                        <div style={{ fontSize:11, color:'var(--muted-foreground)', marginTop:2 }}>{param.descricao}</div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end' }}>
                        <input
                          type="number" step="0.01"
                          value={configs[param.chave] !== undefined && configs[param.chave] !== '' ? configs[param.chave] : (param.defaultVal ?? '')}
                          onChange={e => setConfig(param.chave, e.target.value)}
                          placeholder="0"
                          style={{ width:80, padding:'5px 8px', borderRadius:6, border:'1px solid var(--border)', fontSize:13, textAlign:'right', background:'var(--background)' }}
                        />
                        {param.sufixo && <span style={{ fontSize:12, color:'var(--muted-foreground)', minWidth:28 }}>{param.sufixo}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <Button onClick={handleSaveParams} disabled={savingParams} style={{ background:'#0369a1', color:'#fff' }}>
                  {savingParams
                    ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando…</>
                    : <><Save className="w-4 h-4 mr-1.5" />Salvar Parâmetros</>}
                </Button>
              </div>
            </div>
          </div>)}

          {/* ── Tab Encargos ──────────────────────────────────────────── */}
          {cfgTab === 'encargos' && (<div>
            <div style={{display:'flex',flexDirection:'column',gap:24,maxWidth:900}}>

              {/* Banner regra de ouro */}
              <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px', borderRadius:10, background:'#fefce8', border:'1px solid #fde047' }}>
                <span style={{ fontSize:18, marginTop:1 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:'#854d0e' }}>Regra de Ouro — Alterações não retroagem</div>
                  <div style={{ fontSize:12, color:'#a16207', marginTop:2 }}>
                    As alíquotas e faixas abaixo são usadas apenas em <strong>novos fechamentos</strong>.
                    Lançamentos já fechados/pagos têm os valores gravados em <em>snapshot</em> e <strong>não serão alterados</strong>.
                  </div>
                </div>
              </div>

              {/* ── INSS ── */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <Percent size={16} style={{color:'#0369a1'}}/>
                  <h2 className="font-semibold text-base">Tabela INSS — Funcionário</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Alíquotas progressivas do INSS descontadas do colaborador CLT.
                  Fórmula: <code style={{background:'#f1f5f9',padding:'1px 5px',borderRadius:4,fontSize:11}}>INSS = min(salário, teto) × alíquota − dedução</code>
                </p>
                <div style={{display:'flex',flexDirection:'column',gap:0,borderRadius:8,overflow:'hidden',border:'1px solid var(--border)'}}>
                  {/* Cabeçalho */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 120px 110px',gap:0,background:'var(--muted)',padding:'8px 14px',borderBottom:'1px solid var(--border)'}}>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.04em'}}>Faixa salarial até</span>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.04em',textAlign:'right'}}>Alíquota</span>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.04em',textAlign:'right'}}>Dedução</span>
                  </div>
                  {tabelaInss.map((f,i)=>(
                    <div key={f.id} style={{
                      display:'grid',gridTemplateColumns:'1fr 120px 110px',gap:0,
                      padding:'10px 14px',alignItems:'center',
                      borderBottom: i < tabelaInss.length-1 ? '1px solid var(--border)' : 'none',
                      background: i%2===0 ? 'var(--card)' : 'var(--background)',
                    }}>
                      <div style={{display:'flex',alignItems:'center',gap:8,fontSize:13}}>
                        <span style={{color:'var(--muted-foreground)',fontSize:11,minWidth:60}}>
                          {i===0?'Até':i===tabelaInss.length-1?'Acima de':`R$ ${parseFloat(tabelaInss[i-1].faixa_ate).toLocaleString('pt-BR',{minimumFractionDigits:2})} até`}
                        </span>
                        {i<tabelaInss.length-1?(
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <span style={{fontSize:12,color:'var(--muted-foreground)'}}>R$</span>
                            <input type="number" step="0.01" value={f.faixa_ate}
                              onChange={e=>setTabelaInss(prev=>prev.map((x,j)=>j===i?{...x,faixa_ate:e.target.value}:x))}
                              style={{width:100,padding:'4px 6px',borderRadius:5,border:'1px solid var(--border)',fontSize:12,background:'var(--background)'}}
                            />
                          </div>
                        ):(
                          <span style={{fontSize:12,color:'var(--muted-foreground)',fontStyle:'italic'}}>∞ (sem limite)</span>
                        )}
                      </div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4}}>
                        <input type="number" step="0.1" value={f.aliquota}
                          onChange={e=>setTabelaInss(prev=>prev.map((x,j)=>j===i?{...x,aliquota:e.target.value}:x))}
                          style={{width:60,padding:'4px 6px',borderRadius:5,border:'1px solid var(--border)',fontSize:12,textAlign:'right',background:'var(--background)'}}
                        />
                        <span style={{fontSize:11,color:'var(--muted-foreground)'}}>%</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4}}>
                        <span style={{fontSize:11,color:'var(--muted-foreground)'}}>R$</span>
                        <input type="number" step="0.01" value={f.deducao}
                          onChange={e=>setTabelaInss(prev=>prev.map((x,j)=>j===i?{...x,deducao:e.target.value}:x))}
                          style={{width:72,padding:'4px 6px',borderRadius:5,border:'1px solid var(--border)',fontSize:12,textAlign:'right',background:'var(--background)'}}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── IR ── */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                  <Percent size={16} style={{color:'#dc2626'}}/>
                  <h2 className="font-semibold text-base">Tabela IR — Imposto de Renda</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Tabela progressiva do IR. Base de cálculo = Salário − INSS.
                  Nova regra 2026: isenção total até R$ 5.000 com desconto progressivo.
                </p>
                <div style={{display:'flex',flexDirection:'column',gap:0,borderRadius:8,overflow:'hidden',border:'1px solid var(--border)'}}>
                  {/* Cabeçalho */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 110px 110px 1fr',gap:0,background:'var(--muted)',padding:'8px 14px',borderBottom:'1px solid var(--border)'}}>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.04em'}}>Base de cálculo até</span>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.04em',textAlign:'right'}}>Alíquota</span>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.04em',textAlign:'right'}}>Dedução</span>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--muted-foreground)',textTransform:'uppercase',letterSpacing:'0.04em',paddingLeft:10}}>Observação</span>
                  </div>
                  {tabelaIR.map((f,i)=>(
                    <div key={f.id} style={{
                      display:'grid',gridTemplateColumns:'1fr 110px 110px 1fr',gap:0,
                      padding:'10px 14px',alignItems:'center',
                      borderBottom: i < tabelaIR.length-1 ? '1px solid var(--border)' : 'none',
                      background: i%2===0 ? 'var(--card)' : 'var(--background)',
                    }}>
                      <div style={{display:'flex',alignItems:'center',gap:8,fontSize:13}}>
                        <span style={{color:'var(--muted-foreground)',fontSize:11,minWidth:60}}>
                          {i===0?'Até':i===tabelaIR.length-1?'Acima de':`R$ ${parseFloat(tabelaIR[i-1].faixa_ate==='999999'?'0':tabelaIR[i-1].faixa_ate).toLocaleString('pt-BR',{minimumFractionDigits:2})} até`}
                        </span>
                        {i<tabelaIR.length-1?(
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <span style={{fontSize:12,color:'var(--muted-foreground)'}}>R$</span>
                            <input type="number" step="0.01"
                              value={f.faixa_ate==='999999'?'':f.faixa_ate}
                              onChange={e=>setTabelaIR(prev=>prev.map((x,j)=>j===i?{...x,faixa_ate:e.target.value}:x))}
                              style={{width:100,padding:'4px 6px',borderRadius:5,border:'1px solid var(--border)',fontSize:12,background:'var(--background)'}}
                            />
                          </div>
                        ):(
                          <span style={{fontSize:12,color:'var(--muted-foreground)',fontStyle:'italic'}}>∞ (sem limite)</span>
                        )}
                      </div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4}}>
                        <input type="number" step="0.1" value={f.aliquota}
                          onChange={e=>setTabelaIR(prev=>prev.map((x,j)=>j===i?{...x,aliquota:e.target.value}:x))}
                          style={{width:60,padding:'4px 6px',borderRadius:5,border:'1px solid var(--border)',fontSize:12,textAlign:'right',background:'var(--background)'}}
                        />
                        <span style={{fontSize:11,color:'var(--muted-foreground)'}}>%</span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4}}>
                        <span style={{fontSize:11,color:'var(--muted-foreground)'}}>R$</span>
                        <input type="number" step="0.01" value={f.deducao}
                          onChange={e=>setTabelaIR(prev=>prev.map((x,j)=>j===i?{...x,deducao:e.target.value}:x))}
                          style={{width:72,padding:'4px 6px',borderRadius:5,border:'1px solid var(--border)',fontSize:12,textAlign:'right',background:'var(--background)'}}
                        />
                      </div>
                      <div style={{paddingLeft:10}}>
                        <input type="text" value={f.descricao}
                          onChange={e=>setTabelaIR(prev=>prev.map((x,j)=>j===i?{...x,descricao:e.target.value}:x))}
                          placeholder="Observação…"
                          style={{width:'100%',padding:'4px 6px',borderRadius:5,border:'1px solid var(--border)',fontSize:11,background:'var(--background)',color:'var(--muted-foreground)'}}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
                <Button variant="outline" onClick={()=>{ setTabelaInss(DEFAULT_INSS); setTabelaIR(DEFAULT_IR) }}>
                  Restaurar Padrões
                </Button>
                <Button onClick={handleSaveEncargos} disabled={savingEncargos} style={{background:'#0369a1',color:'#fff'}}>
                  {savingEncargos?<><Loader2 className="w-4 h-4 mr-1.5 animate-spin"/>Salvando…</>:<><Save className="w-4 h-4 mr-1.5"/>Salvar Tabelas</>}
                </Button>
              </div>
            </div>
          </div>)}

          {/* ── Tab Rescisão ──────────────────────────────────────────────── */}
          {cfgTab === 'rescisao' && (<div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>

              {/* Banner regra de ouro */}
              <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 16px', borderRadius:10, background:'#fefce8', border:'1px solid #fde047' }}>
                <span style={{ fontSize:18, marginTop:1 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:'#854d0e' }}>Regra de Ouro — Alterações não retroagem</div>
                  <div style={{ fontSize:12, color:'#a16207', marginTop:2 }}>
                    Alterações nas verbas rescisórias afetam somente <strong>novas rescisões calculadas</strong>.
                    Rescisões já geradas e pagas têm seus valores em <em>snapshot</em> e <strong>não serão recalculadas</strong>.
                  </div>
                </div>
              </div>

              {/* ── Verbas Rescisórias Legais ── */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Percent size={16} style={{ color: '#7c3aed' }} />
                    <h2 className="font-semibold text-base">Verbas Rescisórias</h2>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure as alíquotas utilizadas no cálculo de rescisão. Verbas legais obrigatórias (CLT) não podem ser desativadas.
                  Ative/desative verbas opcionais conforme o tipo de rescisão.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tabelaRescisao.map((v) => (
                    <div key={v.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr 120px 130px auto',
                      gap: 12, alignItems: 'center',
                      padding: '10px 14px', borderRadius: 8,
                      border: `1px solid ${v.ativo ? 'var(--border)' : '#e5e7eb'}`,
                      background: v.ativo ? 'var(--card)' : '#f9fafb',
                      opacity: v.ativo ? 1 : 0.55,
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{v.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>{v.descricao}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number" step="0.1"
                          value={v.aliquota}
                          disabled={!v.editavel || !v.ativo}
                          onChange={e => setTabelaRescisao(prev => prev.map(x => x.id === v.id ? { ...x, aliquota: e.target.value } : x))}
                          style={{ width: 72, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, textAlign: 'right', background: (!v.editavel || !v.ativo) ? '#f3f4f6' : 'var(--background)' }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>%</span>
                      </div>
                      <div>
                        <select
                          value={v.tipo}
                          disabled={!v.editavel || !v.ativo}
                          onChange={e => setTabelaRescisao(prev => prev.map(x => x.id === v.id ? { ...x, tipo: e.target.value as 'percentual'|'fixo' } : x))}
                          style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 11, background: (!v.editavel || !v.ativo) ? '#f3f4f6' : 'var(--background)' }}
                        >
                          <option value="percentual">% do salário</option>
                          <option value="fixo">Valor fixo R$</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Switch
                          checked={v.ativo}
                          disabled={!v.editavel}
                          onCheckedChange={checked => setTabelaRescisao(prev => prev.map(x => x.id === v.id ? { ...x, ativo: checked } : x))}
                        />
                        <span style={{ fontSize: 11, color: v.ativo ? '#16a34a' : '#9ca3af', fontWeight: 600 }}>
                          {v.ativo ? 'Ativo' : 'Off'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Outros (personalizados) ── */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Plus size={16} style={{ color: '#0369a1' }} />
                    <h2 className="font-semibold text-base">Outros Encargos (personalizados)</h2>
                  </div>
                  <Button size="sm" variant="outline" onClick={addOutroRescisao} style={{ gap: 4, fontSize: 12 }}>
                    <Plus size={13} /> Adicionar verba
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Adicione verbas extras que surgem em rescisões específicas. Ative/desative conforme necessário.
                </p>
                {outrosRescisao.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
                    Nenhuma verba extra cadastrada. Clique em "Adicionar verba" para criar.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {outrosRescisao.map((v) => (
                      <div key={v.id} style={{
                        display: 'grid', gridTemplateColumns: '1fr 160px 120px 130px auto auto',
                        gap: 10, alignItems: 'center',
                        padding: '10px 14px', borderRadius: 8,
                        border: `1px solid ${v.ativo ? '#0369a1' : '#e5e7eb'}`,
                        background: v.ativo ? '#eff6ff' : '#f9fafb',
                        opacity: v.ativo ? 1 : 0.6,
                      }}>
                        <input
                          type="text" value={v.label}
                          onChange={e => setOutrosRescisao(prev => prev.map(x => x.id === v.id ? { ...x, label: e.target.value } : x))}
                          placeholder="Nome da verba"
                          style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, background: 'var(--background)' }}
                        />
                        <input
                          type="text" value={v.descricao}
                          onChange={e => setOutrosRescisao(prev => prev.map(x => x.id === v.id ? { ...x, descricao: e.target.value } : x))}
                          placeholder="Descrição"
                          style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 11, background: 'var(--background)', color: 'var(--muted-foreground)' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number" step="0.1" value={v.aliquota}
                            onChange={e => setOutrosRescisao(prev => prev.map(x => x.id === v.id ? { ...x, aliquota: e.target.value } : x))}
                            style={{ width: 72, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 12, textAlign: 'right', background: 'var(--background)' }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                            {v.tipo === 'percentual' ? '%' : 'R$'}
                          </span>
                        </div>
                        <select
                          value={v.tipo}
                          onChange={e => setOutrosRescisao(prev => prev.map(x => x.id === v.id ? { ...x, tipo: e.target.value as 'percentual'|'fixo' } : x))}
                          style={{ width: '100%', padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', fontSize: 11, background: 'var(--background)' }}
                        >
                          <option value="percentual">% do salário</option>
                          <option value="fixo">Valor fixo R$</option>
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Switch
                            checked={v.ativo}
                            onCheckedChange={checked => setOutrosRescisao(prev => prev.map(x => x.id === v.id ? { ...x, ativo: checked } : x))}
                          />
                          <span style={{ fontSize: 11, color: v.ativo ? '#0369a1' : '#9ca3af', fontWeight: 600 }}>
                            {v.ativo ? 'Ativo' : 'Off'}
                          </span>
                        </div>
                        <button
                          onClick={() => removeOutroRescisao(v.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 4 }}
                          title="Remover"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="outline" onClick={() => { setTabelaRescisao(DEFAULT_RESCISAO); setOutrosRescisao([]) }}>
                  Restaurar Padrões
                </Button>
                <Button onClick={handleSaveRescisao} disabled={savingRescisao} style={{ background: '#7c3aed', color: '#fff' }}>
                  {savingRescisao ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Salvando…</> : <><Save className="w-4 h-4 mr-1.5" />Salvar Rescisão</>}
                </Button>
              </div>
            </div>
          </div>)}

          {/* ── Tab Usuários ───────────────────────────────────────────── */}
          {cfgTab === 'usuarios' && (<div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-semibold text-base">Gerenciamento de Usuários</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Ajuste os papéis e status de acesso de cada usuário.
                </p>
              </div>

              {loadingProfiles ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : profiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Users className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left font-medium px-6 py-3">Nome</th>
                      <th className="text-left font-medium px-4 py-3">E-mail</th>
                      <th className="text-left font-medium px-4 py-3">Papel</th>
                      <th className="text-center font-medium px-4 py-3">Ativo</th>
                      <th className="text-right font-medium px-6 py-3">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((profile) => (
                      <tr key={profile.id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-6 py-3 font-medium">{profile.nome ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{profile.email ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Select
                            value={profile.role ?? 'user'}
                            onValueChange={(v) => updateProfile(profile.id, 'role', v)}
                          >
                            <SelectTrigger className="h-8 w-32 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="rh">RH</SelectItem>
                              <SelectItem value="gestor">Gestor</SelectItem>
                              <SelectItem value="user">Usuário</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Switch
                            checked={profile.ativo}
                            onCheckedChange={(checked) => updateProfile(profile.id, 'ativo', checked)}
                          />
                        </td>
                        <td className="px-6 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSaveProfile(profile)}
                            disabled={savingProfileId === profile.id}
                          >
                            {savingProfileId === profile.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <><Save className="w-3.5 h-3.5 mr-1" /> Salvar</>
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>)}

          </div>
        </div>
      )}
    </div>
  )
}
