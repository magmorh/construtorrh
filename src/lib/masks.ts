// ─── Funções de máscara para inputs de documentos ─────────────────────────────

/** CPF: 000.000.000-00 */
export function maskCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`
}

/** RG genérico: até 14 chars alfanuméricos com pontos e traço */
export function maskRG(v: string): string {
  // Remove caracteres inválidos, mantém letras, dígitos, ponto, traço
  const clean = v.replace(/[^a-zA-Z0-9.\-]/g, '').slice(0, 14)
  return clean.toUpperCase()
}

/** PIS / NIT: 000.00000.00-0 */
export function maskPIS(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 8) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 10) return `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8)}`
  return `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8, 10)}-${d.slice(10)}`
}

/** CEP: 00000-000 */
export function maskCEP(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

/** Telefone: (00) 00000-0000 ou (00) 0000-0000 */
export function maskTelefone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  // celular com 9 dígitos
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** CTPS Número: até 7 dígitos */
export function maskCTPS(v: string): string {
  return v.replace(/\D/g, '').slice(0, 7)
}

/** CTPS Série: até 4 dígitos */
export function maskCTPSSerie(v: string): string {
  return v.replace(/\D/g, '').slice(0, 4)
}

/** Agência bancária: 0000-0 */
export function maskAgencia(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 5)
  if (d.length <= 4) return d
  return `${d.slice(0, 4)}-${d.slice(4)}`
}

/** Conta bancária: 00000000-0 (até 9 dígitos) */
export function maskConta(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 9)
  if (d.length <= 8) return d
  return `${d.slice(0, 8)}-${d.slice(8)}`
}

/** Remove máscara e retorna só dígitos */
export function onlyDigits(v: string): string {
  return v.replace(/\D/g, '')
}
