import { z } from 'zod'
import { cellSchema } from '../lib/contracts'

export const memberSchema = z.object({ userId: z.number().int(), displayName: z.string(), r: z.number().int().nonnegative().nullable(), c: z.number().int().nonnegative().nullable() })
export const claimSchema = z.object({ claimId: z.string(), userId: z.number().int(), displayName: z.string(), cells: z.array(cellSchema), expiresAt: z.string().datetime() })
export type Member = z.infer<typeof memberSchema>
export type Claim = z.infer<typeof claimSchema>
const seq = z.number().int().nonnegative()
const requestId = z.union([z.string(), z.number()])
export const floorMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('snapshot'), seq, members: z.array(memberSchema), claims: z.array(claimSchema) }),
  z.object({ type: z.literal('member.joined'), seq, userId: z.number().int(), displayName: z.string() }),
  z.object({ type: z.literal('member.left'), seq, userId: z.number().int(), displayName: z.string() }),
  cellSchema.extend({ type: z.literal('cursor'), userId: z.number().int() }),
  claimSchema.extend({ type: z.literal('claim.granted'), seq, requestId }),
  claimSchema.extend({ type: z.literal('claim.updated'), seq }),
  z.object({ type: z.literal('claim.released'), seq: seq.optional(), claimId: z.string(), userId: z.number().int().optional() }),
  z.object({ type: z.literal('claim.denied'), requestId, reason: z.enum(['HELD', 'NOT_A_GROUP']), holder: z.object({ userId: z.number().int(), displayName: z.string() }).nullable() }),
  z.object({ type: z.literal('pong'), t: z.union([z.string(), z.number()]) }),
])
export type FloorMessage = z.infer<typeof floorMessage>
export type Outgoing = { type: 'cursor'; r: number; c: number } | { type: 'claim'; requestId: string; r: number; c: number } | { type: 'renew' | 'release'; claimId: string } | { type: 'ping'; t: number } | { type: 'resync' }
