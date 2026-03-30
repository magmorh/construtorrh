/**
 * Cálculo do DSR com regra de perda por falta semanal.
 *
 * REGRAS VIGENTES:
 *   - Candidatos a DSR = Domingos + Feriados em Seg–Sex (dia não trabalhado com direito ao feriado).
 *   - Sábado NÃO é candidato a DSR (já recebe +50% nas horas trabalhadas).
 *   - Se o funcionário tiver QUALQUER falta (injustificada) em uma semana
 *     (Segunda a Sábado), perde o direito ao DSR daquele domingo/feriado dessa semana.
 *
 * Fórmula:
 *   DSR = (valorHoras / diasUteisComputados) × candidatosSemFalta
 */

function expandRange(inicio: string, fim: string): string[] {
  const dias: string[] = []
  const d = new Date(inicio + 'T12:00:00')
  const end = new Date(fim + 'T12:00:00')
  while (d <= end) {
    dias.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return dias
}

export interface DSRResult {
  dsr: number          // valor total do DSR a pagar
  diasUteis: number    // Seg–Sex no período (feriados excluídos dos dias úteis contáveis)
  domingosPagos: number
  domingosPerdidos: number
}

/**
 * @param valorHoras   total de horas trabalhadas × valor/hora (sem DSR)
 * @param inicio       data início do período "YYYY-MM-DD"
 * @param fim          data fim do período "YYYY-MM-DD"
 * @param datasComFalta Set de datas (YYYY-MM-DD) onde houve falta
 * @param feriadosSet   Set de datas de feriados (feriados Seg–Sex são candidatos ao DSR)
 */
export function calcDSRComFaltas(
  valorHoras: number,
  inicio: string,
  fim: string,
  datasComFalta: Set<string>,
  feriadosSet?: Set<string>
): DSRResult {
  const todas = expandRange(inicio, fim)
  const fer = feriadosSet ?? new Set<string>()

  // Dias úteis = Seg–Sex NÃO feriados + Sábados
  // (feriados saem da base de dias úteis pois são "pagos" pelo direito ao feriado)
  const diasUteis = todas.filter(d => {
    const dow = new Date(d + 'T12:00:00').getDay()
    if (dow === 0) return false          // Domingo: não é dia útil
    if (dow >= 1 && dow <= 5 && fer.has(d)) return false  // Feriado Seg–Sex: não conta como dia útil (é candidato a DSR)
    return true   // Sáb (dow=6) e Seg–Sex normais
  }).length

  // Candidatos a DSR:
  //   1. Domingos do período
  //   2. Feriados em Seg–Sex (o trabalhador tem direito ao dia)
  const candidatos = todas.filter(d => {
    const dow = new Date(d + 'T12:00:00').getDay()
    if (dow === 0) return true                          // Domingo
    if (dow >= 1 && dow <= 5 && fer.has(d)) return true // Feriado em dia útil
    return false
  })

  let domingosPagos = 0
  let domingosPerdidos = 0

  for (const cand of candidatos) {
    const candDate = new Date(cand + 'T12:00:00')
    const dow = candDate.getDay()

    // Para domingo: verifica semana Seg–Sab anterior (dom-6 até dom-1)
    // Para feriado Seg–Sex: verifica semana da qual faz parte (Seg dessa semana até Sab)
    let seg: Date
    if (dow === 0) {
      // Domingo → semana anterior: dom-6 até dom-1
      seg = new Date(candDate)
      seg.setDate(candDate.getDate() - 6)
    } else {
      // Feriado Seg–Sex → semana corrente: seg da semana até sab
      seg = new Date(candDate)
      seg.setDate(candDate.getDate() - (dow - 1))
    }
    const sab = new Date(seg)
    sab.setDate(seg.getDate() + 5)

    // Verificar se algum dia Seg–Sab tem falta
    let temFalta = false
    const iter = new Date(seg)
    while (iter <= sab) {
      const dd = iter.toISOString().slice(0, 10)
      // Falta em feriado da mesma semana NÃO conta como falta para perda do DSR
      // (o trabalhador simplesmente não foi — é o próprio feriado)
      const dw = iter.getDay()
      const eFeriadoIter = dw >= 1 && dw <= 5 && fer.has(dd)
      if (!eFeriadoIter && datasComFalta.has(dd)) {
        temFalta = true
        break
      }
      iter.setDate(iter.getDate() + 1)
    }

    if (temFalta) domingosPerdidos++
    else domingosPagos++
  }

  const dsr = diasUteis > 0 && domingosPagos > 0
    ? (valorHoras / diasUteis) * domingosPagos
    : 0

  return { dsr, diasUteis, domingosPagos, domingosPerdidos }
}
