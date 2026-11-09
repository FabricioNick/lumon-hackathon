import type { Bin, Cell, Rules } from '../lib/contracts'
import { cellKey } from '../lib/contracts'
import { delay } from '../lib/http'

export interface Group { cells: Cell[]; bin: Bin; noise: boolean }
export async function findGroup(
  seed: Cell, dimensions: { rows: number; cols: number }, rules: Rules,
  read: (r: number, c: number, signal: AbortSignal) => Promise<{ value: number; tremor: number; bin: string }>, signal: AbortSignal,
): Promise<Group> {
  const seen = new Set<string>()
  const queue: Cell[] = [seed]
  const cells: Cell[] = []
  let sum = 0, maximum = 0
  for (let index = 0; index < queue.length; index++) {
    signal.throwIfAborted()
    const cell = queue[index], key = cellKey(cell)
    if (seen.has(key)) continue
    seen.add(key)
    const data = await read(cell.r, cell.c, signal)
    if (data.tremor < rules.tremorThreshold || data.bin !== '.') continue
    cells.push(cell); sum += data.value; maximum = Math.max(maximum, data.value)
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if ((!dr && !dc) || (rules.connectivity === 4 && dr !== 0 && dc !== 0)) continue
      const r = cell.r + dr, c = cell.c + dc
      if (r >= 0 && c >= 0 && r < dimensions.rows && c < dimensions.cols && !seen.has(cellKey({ r, c }))) queue.push({ r, c })
    }
    if (index % 256 === 0) await delay(0, signal)
  }
  const bin = rules.binning.order[(rules.binning.strategy === 'DIGIT_SUM_MOD' ? sum : maximum) % 4]
  return { cells, bin, noise: cells.length < rules.minGroupSize || cells.length > rules.maxGroupSize }
}
