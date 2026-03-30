/**
 * relatorioHeader.ts
 * Helper para buscar dados da empresa e gerar o cabeçalho padrão dos relatórios.
 * O logo é salvo como base64 no banco — sem URL externa, sem CORS, funciona sempre.
 */

import { supabase } from '@/lib/supabase'

export interface EmpresaData {
  nome:        string
  razaoSocial: string
  cnpj:        string
  endereco:    string
  cidade:      string
  cep:         string
  telefone:    string
  email:       string
  logoUrl:     string   // pode ser base64 "data:image/..." ou URL externa
}

/** Busca os dados da empresa na tabela configuracoes */
export async function fetchEmpresaData(): Promise<EmpresaData> {
  const { data } = await supabase
    .from('configuracoes')
    .select('chave,valor')
    .in('chave', [
      'empresa_nome', 'empresa_razao_social', 'empresa_cnpj',
      'empresa_endereco', 'empresa_cidade', 'empresa_cep',
      'empresa_telefone', 'empresa_email', 'empresa_logo_url',
    ])

  const map: Record<string, string> = {}
  ;(data ?? []).forEach((r: { chave: string; valor: string | null }) => {
    map[r.chave] = r.valor ?? ''
  })

  return {
    nome:        map['empresa_nome']         || map['empresa_razao_social'] || 'Empresa',
    razaoSocial: map['empresa_razao_social'] || map['empresa_nome']         || '',
    cnpj:        map['empresa_cnpj']         || '',
    endereco:    map['empresa_endereco']     || '',
    cidade:      map['empresa_cidade']       || '',
    cep:         map['empresa_cep']          || '',
    telefone:    map['empresa_telefone']     || '',
    email:       map['empresa_email']        || '',
    logoUrl:     map['empresa_logo_url']     || '',
  }
}

/**
 * Gera o bloco HTML do cabeçalho padrão para relatórios.
 * Se logoUrl começa com "data:" é base64 e vai inline direto.
 * Se for URL externa, tenta carregar; se falhar, mostra ícone.
 */
export function gerarCabecalhoHTML(
  emp: EmpresaData,
  opts: {
    titulo:     string
    subtitulo?: string
    periodo?:   string
    emitidoEm?: string
  }
): string {
  const dataEmissao = opts.emitidoEm ?? new Date().toLocaleDateString('pt-BR')

  // Logo: base64 inline OU URL externa com onerror para esconder se falhar
  let logoBlock = `<div style="width:56px;height:56px;border-radius:10px;background:#1e3a5f;display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;">🏗️</div>`

  if (emp.logoUrl) {
    logoBlock = `<img
      src="${emp.logoUrl}"
      alt="Logo"
      style="height:60px;max-width:180px;object-fit:contain;display:block;border-radius:4px;"
      onerror="this.style.display='none'"
    />`
  }

  const enderecoLine = [emp.endereco, emp.cidade, emp.cep].filter(Boolean).join(' — ')
  const contatoLine  = [emp.telefone, emp.email].filter(Boolean).join('  ·  ')

  return `
    <div class="rel-cabecalho">
      <div class="rel-empresa">
        <div class="rel-logo">${logoBlock}</div>
        <div class="rel-empresa-info">
          <div class="rel-empresa-nome">${emp.nome}</div>
          ${emp.razaoSocial && emp.razaoSocial !== emp.nome
            ? `<div class="rel-empresa-sub">${emp.razaoSocial}</div>`
            : ''}
          ${emp.cnpj        ? `<div class="rel-empresa-meta">CNPJ: ${emp.cnpj}</div>` : ''}
          ${enderecoLine    ? `<div class="rel-empresa-meta">${enderecoLine}</div>`   : ''}
          ${contatoLine     ? `<div class="rel-empresa-meta">${contatoLine}</div>`    : ''}
        </div>
      </div>
      <div class="rel-titulo-bloco">
        <div class="rel-titulo">${opts.titulo}</div>
        ${opts.subtitulo ? `<div class="rel-subtitulo">${opts.subtitulo}</div>` : ''}
        ${opts.periodo   ? `<div class="rel-periodo">Período: <strong>${opts.periodo}</strong></div>` : ''}
        <div class="rel-emissao">Emitido em: ${dataEmissao}</div>
      </div>
    </div>
    <hr class="rel-divisor"/>
  `
}

/**
 * CSS padrão do cabeçalho — incluir dentro do <style> de cada relatório.
 */
export const CABECALHO_CSS = `
  .rel-cabecalho {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .rel-empresa {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .rel-logo {
    flex-shrink: 0;
  }
  .rel-logo img {
    border-radius: 6px;
    display: block;
  }
  .rel-empresa-nome {
    font-size: 13pt;
    font-weight: 800;
    color: #1e3a5f;
    line-height: 1.2;
  }
  .rel-empresa-sub {
    font-size: 9.5pt;
    color: #374151;
    margin-top: 1px;
  }
  .rel-empresa-meta {
    font-size: 8.5pt;
    color: #6b7280;
    margin-top: 2px;
  }
  .rel-titulo-bloco {
    text-align: right;
    flex-shrink: 0;
  }
  .rel-titulo {
    font-size: 14pt;
    font-weight: 800;
    color: #1e3a5f;
    text-transform: uppercase;
    line-height: 1.2;
  }
  .rel-subtitulo {
    font-size: 11pt;
    font-weight: 600;
    color: #374151;
    margin-top: 3px;
  }
  .rel-periodo {
    font-size: 9.5pt;
    color: #374151;
    margin-top: 4px;
  }
  .rel-emissao {
    font-size: 8.5pt;
    color: #9ca3af;
    margin-top: 2px;
  }
  .rel-divisor {
    border: none;
    border-top: 2px solid #1e3a5f;
    margin: 10px 0 14px;
  }
`
