export function integer(value: string | null, fallback = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === null || !/^\d+$/.test(value)) return fallback
  const n = Number(value)
  return Number.isSafeInteger(n) && n <= max ? n : fallback
}
export function fileQuery(input: URLSearchParams) {
  const out = new URLSearchParams()
  out.set('page', String(integer(input.get('page'))))
  out.set('size', ['10', '25', '50'].includes(input.get('size') ?? '') ? input.get('size')! : '10')
  out.set('sort', ['progress,desc', 'name,asc', 'updatedAt,desc'].includes(input.get('sort') ?? '') ? input.get('sort')! : 'updatedAt,desc')
  const status = input.get('status'); if (status === 'ACTIVE' || status === 'COMPLETE') out.set('status', status)
  const q = input.get('q')?.trim().slice(0, 60); if (q) out.set('q', q)
  return out
}
