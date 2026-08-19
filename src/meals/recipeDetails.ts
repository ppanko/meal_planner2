export function normalizeRecipeUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  try {
    const url = new URL(candidate)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname
      ? candidate
      : null
  } catch {
    return null
  }
}
