export type { Media, MediaTicket, MediaTicketRequest } from '../cp45/contracts'
export type MediaPurpose = 'BADGE' | 'INCIDENT'
export interface Crop {
  x: number
  y: number
  size: number
}
export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  purpose: MediaPurpose
}
export type UploadPhase =
  'preparing' | 'ticket' | 'uploading' | 'confirming' | 'confirmed' | 'error' | 'cancelled'
export interface UploadProgress {
  phase: UploadPhase
  percent: number
}
