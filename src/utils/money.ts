/** Keep amounts readable in RTL (Arabic) — same order as French: 4 900,00 DH */
export function wrapLtr(text: string) {
  return `\u2066${text}\u2069`
}

export function formatMoneyAmount(
  amount: number,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
) {
  const minimumFractionDigits = options?.minimumFractionDigits ?? 2
  const maximumFractionDigits = options?.maximumFractionDigits ?? 2
  const value = Number(amount || 0)
  const negative = value < 0
  const abs = Math.abs(value)
  const fixed = abs.toFixed(maximumFractionDigits)
  const [intPart, decPart = ''] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const decimals =
    maximumFractionDigits > 0
      ? `,${decPart.padEnd(minimumFractionDigits, '0').slice(0, maximumFractionDigits)}`
      : ''
  return `${negative ? '-' : ''}${grouped}${decimals}`
}

export function formatMoney(amount: number, currency = 'DH') {
  return wrapLtr(`${formatMoneyAmount(amount)} ${currency}`)
}
