import { expect, test } from '@playwright/test'
import { findGroup } from '../src/files/groups'
import { fileQuery } from '../src/files/query'
import type { Rules } from '../src/lib/contracts'
const base: Rules = {
  tremorThreshold: 80,
  connectivity: 4,
  minGroupSize: 2,
  maxGroupSize: 4,
  binning: { strategy: 'MAX_DIGIT_MOD', order: ['MA', 'DR', 'FC', 'WO'] },
}
test('BFS distinguishes connectivity, threshold, noise and dynamic bin order', async () => {
  const read = async (r: number, c: number) => ({
    value: r === 0 ? 9 : 3,
    tremor: r === c ? 80 : 79,
    bin: '.',
  })
  const four = await findGroup(
    { r: 0, c: 0 },
    { rows: 2, cols: 2 },
    base,
    read,
    new AbortController().signal,
  )
  expect(four.noise).toBe(true)
  expect(four.cells).toHaveLength(1)
  const eight = await findGroup(
    { r: 0, c: 0 },
    { rows: 2, cols: 2 },
    { ...base, connectivity: 8 },
    read,
    new AbortController().signal,
  )
  expect(eight.noise).toBe(false)
  expect(eight.cells).toHaveLength(2)
  expect(eight.bin).toBe('DR')
  const sum = await findGroup(
    { r: 0, c: 0 },
    { rows: 2, cols: 2 },
    { ...base, connectivity: 8, binning: { ...base.binning, strategy: 'DIGIT_SUM_MOD' } },
    read,
    new AbortController().signal,
  )
  expect(sum.bin).toBe('MA')
})
test('BFS aborts obsolete selection and excludes refined cells', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    findGroup(
      { r: 0, c: 0 },
      { rows: 2, cols: 2 },
      base,
      async () => ({ value: 9, tremor: 100, bin: '.' }),
      controller.signal,
    ),
  ).rejects.toThrow()
  const group = await findGroup(
    { r: 0, c: 0 },
    { rows: 2, cols: 2 },
    base,
    async () => ({ value: 9, tremor: 100, bin: 'W' }),
    new AbortController().signal,
  )
  expect(group.cells).toHaveLength(0)
})
test('URL rejects overflow, malformed pagination and invalid enums', () => {
  const query = fileQuery(
    new URLSearchParams('page=99999999999999999&size=0&status=INVALID&q=' + 'x'.repeat(100)),
  )
  expect(query.get('page')).toBe('0')
  expect(query.get('size')).toBe('10')
  expect(query.has('status')).toBe(false)
  expect(query.get('q')).toHaveLength(60)
})
