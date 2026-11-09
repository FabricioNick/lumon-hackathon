import { z } from 'zod'

export const binSchema = z.enum(['WO', 'FC', 'DR', 'MA'])
export type Bin = z.infer<typeof binSchema>
export const bins = binSchema.options
export const cellSchema = z.object({
  r: z.number().int().nonnegative(),
  c: z.number().int().nonnegative(),
})
export type Cell = z.infer<typeof cellSchema>
const fraction = z.number().min(0).max(1)
export const progressSchema = z.object({
  WO: fraction,
  FC: fraction,
  DR: fraction,
  MA: fraction,
  overall: fraction,
})
export const fileStateSchema = z.object({
  progress: progressSchema,
  refinedGroups: z.number().int().nonnegative(),
  totalGroups: z.number().int().nonnegative(),
  mistakes: z.number().int().nonnegative(),
  status: z.enum(['ACTIVE', 'COMPLETE']),
})
export const fileSchema = fileStateSchema.extend({
  id: z.number().int().positive(),
  name: z.string(),
  rows: z.number().int().positive().max(512),
  cols: z.number().int().positive().max(512),
  tileSize: z.number().int().positive(),
  updatedAt: z.string(),
})
export type DataFile = z.infer<typeof fileSchema>
export const pageSchema = z.object({
  content: z.array(fileSchema),
  totalElements: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  page: z.number().int().nonnegative(),
  size: z.number().int().positive(),
})
export const rulesSchema = z
  .object({
    tremorThreshold: z.number().int().min(0).max(100),
    connectivity: z.union([z.literal(4), z.literal(8)]),
    minGroupSize: z.number().int().positive(),
    maxGroupSize: z.number().int().positive(),
    binning: z.object({
      strategy: z.enum(['DIGIT_SUM_MOD', 'MAX_DIGIT_MOD']),
      order: z
        .array(binSchema)
        .length(4)
        .refine((v) => new Set(v).size === 4),
    }),
  })
  .refine((v) => v.maxGroupSize >= v.minGroupSize)
export type Rules = z.infer<typeof rulesSchema>
export const tileSchema = z
  .object({
    tileRow: z.number().int().nonnegative(),
    tileCol: z.number().int().nonnegative(),
    originRow: z.number().int().nonnegative(),
    originCol: z.number().int().nonnegative(),
    rows: z.number().int().positive(),
    cols: z.number().int().positive(),
    values: z.string().regex(/^[0-9]*$/),
    tremor: z.string(),
    bins: z.string().regex(/^[.WFDM]*$/),
    version: z.number().int().nonnegative(),
  })
  .refine((v) => v.values.length === v.rows * v.cols && v.bins.length === v.values.length)
export type Tile = z.infer<typeof tileSchema> & { tremors: Uint8Array }
export const refineSchema = z.object({
  refinementId: z.number().int(),
  bin: binSchema,
  size: z.number().int(),
  file: fileStateSchema,
})
export const meSchema = z.object({
  id: z.number().int(),
  displayName: z.string(),
  permissions: z.array(z.string()),
  clearance: z.object({ granted: z.boolean() }),
})
export type Me = z.infer<typeof meSchema>
export const tokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().positive(),
})
export const ticketSchema = z.object({ ticket: z.string(), expiresIn: z.number().positive() })
export const cellKey = ({ r, c }: Cell) => `${r}:${c}`
