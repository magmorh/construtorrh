// ── Utilitários de cálculo de encargos trabalhistas ─────────────────────────
// As tabelas podem ser carregadas do Supabase (configuracoes)
// ou usar os defaults abaixo como fallback.

export interface FaixaINSS { id: string; faixa_ate: string; aliquota: string; deducao: string }
export interface FaixaIR   { id: string; faixa_ate: string; aliquota: string; deducao: string; descricao: string }

export const DEFAULT_INSS: FaixaINSS[] = [
  { id: '1', faixa_ate: '1621.00',  aliquota: '7.5',  deducao: '0' },
  { id: '2', faixa_ate: '2902.84',  aliquota: '9.0',  deducao: '24.32' },
  { id: '3', faixa_ate: '4354.27',  aliquota: '12.0', deducao: '111.40' },
  { id: '4', faixa_ate: '8475.55',  aliquota: '14.0', deducao: '198.49' },
]

// Nova tabela IR 2026: isenção progressiva até R$5.000
export const DEFAULT_IR: FaixaIR[] = [
  { id: '1', faixa_ate: '2428.80',  aliquota: '0',    deducao: '0',      descricao: 'Isento' },
  { id: '2', faixa_ate: '2826.65',  aliquota: '7.5',  deducao: '182.16', descricao: 'Isento até completar R$5.000' },
  { id: '3', faixa_ate: '3751.05',  aliquota: '15.0', deducao: '394.16', descricao: 'Isento até completar R$5.000' },
  { id: '4', faixa_ate: '4664.68',  aliquota: '22.5', deducao: '675.49', descricao: 'Isento até completar R$5.000' },
  { id: '5', faixa_ate: '5000.00',  aliquota: '27.5', deducao: '908.73', descricao: 'Isento total (regra nova)' },
  { id: '6', faixa_ate: '7350.00',  aliquota: '27.5', deducao: '908.73', descricao: 'Aplicar redução progressiva' },
  { id: '7', faixa_ate: '999999',   aliquota: '27.5', deducao: '908.73', descricao: 'Tabela normal (sem desconto)' },
]

/** Calcula INSS usando tabela progressiva com dedução */
export function calcINSS(salario: number, tabela: FaixaINSS[] = DEFAULT_INSS): number {
  const teto = parseFloat(tabela[tabela.length - 1].faixa_ate)
  const base  = Math.min(salario, teto)
  for (const f of tabela) {
    const ate = parseFloat(f.faixa_ate)
    if (base <= ate) {
      const inss = base * (parseFloat(f.aliquota) / 100) - parseFloat(f.deducao)
      return Math.max(0, inss)
    }
  }
  // Fallback: última faixa
  const last = tabela[tabela.length - 1]
  return Math.max(0, base * (parseFloat(last.aliquota) / 100) - parseFloat(last.deducao))
}

/**
 * Calcula IR com a nova regra 2026:
 * - Até R$2.428,80   → isento
 * - R$2.428,81–R$5.000 → aplica tabela com desconto progressivo (resultado isento se ≤ 0)
 * - Acima R$5.000    → tabela normal (sem desconto extra)
 * Base de cálculo = salário − INSS
 */
export function calcIR(salario: number, inss: number, tabela: FaixaIR[] = DEFAULT_IR): number {
  const base = salario - inss
  if (base <= 0) return 0

  for (const f of tabela) {
    const ate = parseFloat(f.faixa_ate)
    if (base <= ate) {
      const aliq   = parseFloat(f.aliquota) / 100
      const deducao = parseFloat(f.deducao)
      const ir = base * aliq - deducao
      return Math.max(0, ir)
    }
  }
  // Fallback: última faixa
  const last = tabela[tabela.length - 1]
  return Math.max(0, base * (parseFloat(last.aliquota) / 100) - parseFloat(last.deducao))
}

/** Busca tabelas salvas no Supabase; retorna defaults se não encontrar */
export async function fetchTabelasEncargos(supabase: any): Promise<{ tabelaInss: FaixaINSS[]; tabelaIR: FaixaIR[] }> {
  const { data } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', ['tabela_inss', 'tabela_ir'])

  const map: Record<string, string> = {}
  ;(data ?? []).forEach((r: any) => { map[r.chave] = r.valor })

  let tabelaInss = DEFAULT_INSS
  let tabelaIR   = DEFAULT_IR
  try { if (map['tabela_inss']) tabelaInss = JSON.parse(map['tabela_inss']) } catch {}
  try { if (map['tabela_ir'])   tabelaIR   = JSON.parse(map['tabela_ir'])   } catch {}

  return { tabelaInss, tabelaIR }
}
