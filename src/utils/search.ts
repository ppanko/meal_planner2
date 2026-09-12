function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

function words(value: string) {
  return normalizeSearch(value).split(' ').filter(Boolean)
}

export function matchSearch(candidate: string, query: string) {
  const queryWords = words(query)
  if (queryWords.length === 0) return true

  const normalizedCandidate = normalizeSearch(candidate)
  return queryWords.every((word) => normalizedCandidate.includes(word))
}

export function rankSearch(candidate: string, query: string) {
  const normalizedCandidate = normalizeSearch(candidate)
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return 0
  if (!matchSearch(candidate, query)) return Number.POSITIVE_INFINITY
  if (normalizedCandidate === normalizedQuery) return 0
  if (normalizedCandidate.startsWith(normalizedQuery)) return 1

  const candidateWords = words(candidate)
  const queryWords = words(query)
  const allWordPrefixes = queryWords.every((queryWord) =>
    candidateWords.some((candidateWord) => candidateWord.startsWith(queryWord)),
  )

  if (allWordPrefixes) {
    return 2 + Math.max(0, candidateWords.length - queryWords.length) / 100
  }

  return 3 + Math.max(0, normalizedCandidate.length - normalizedQuery.length) / 1000
}

export function sortBySearch<T>(items: T[], query: string, getText: (item: T) => string) {
  return [...items]
    .filter((item) => matchSearch(getText(item), query))
    .sort((a, b) => {
      const rankDifference = rankSearch(getText(a), query) - rankSearch(getText(b), query)
      return rankDifference || getText(a).localeCompare(getText(b))
    })
}
