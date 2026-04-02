// Retorna o último dia real de um mês no formato YYYY-MM-DD
export function getUltimoDia(mesAno: string): string {
  const [y, m] = mesAno.split('-').map(Number)
  const ud = new Date(y, m, 0).getDate()
  return `${mesAno}-${String(ud).padStart(2, '0')}`
}
