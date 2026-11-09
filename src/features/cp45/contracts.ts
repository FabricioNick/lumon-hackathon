// Generated from the public OpenAPI contract (2026-11-09).
export type Department = { id: number; code: string; name: string };
export type Refiner = {
  id: number;
  fullName: string;
  department: Department;
  title: string;
  extension: string;
  bio: string;
  profileUrl: string | null;
  badge: { url: string; width: number; height: number } | null;
  version: number;
  updatedAt: string;
};
export type RefinerPage = {
  content: Array<Refiner>;
  totalElements: number;
  totalPages: number;
  page: number;
  size: 10 | 25 | 50;
};
export type RefinerPatch = {
  title?: string;
  extension?: string;
  bio?: string;
  departmentId?: number;
  badgeMediaId?: number | null;
};
export type MediaConstraints = {
  contentType?: "image/webp";
  width?: number;
  height?: number;
  minLongSide?: number;
  maxLongSide?: number;
  maxBytes?: number;
};
export type MediaTicketRequest = {
  purpose: "BADGE" | "INCIDENT";
  contentType: string;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
};
export type MediaTicket = {
  ticketId: string;
  expiresAt: string;
  provider: "SUPABASE" | "CLOUDINARY";
  objectPath?: string;
  bucket?: string;
  uploadPublicId?: string;
  expectedPublicId?: string;
  constraints: MediaConstraints;
};
export type MediaConfirmRequest = { url: string };
export type Media = {
  mediaId: number;
  url: string;
  width: number;
  height: number;
  purpose: "BADGE" | "INCIDENT";
};
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentCreate = {
  title: string;
  description: string;
  severity: Severity;
  fileId?: number | null;
  mediaIds: Array<number>;
};
export type Incident = {
  id: number;
  title: string;
  description: string;
  severity: Severity;
  fileId: number | null;
  file: { id: number; name: string } | null;
  photos: Array<{
    mediaId: number;
    url: string;
    width: number;
    height: number;
  }>;
  createdBy: { id: number; displayName: string };
  createdAt: string;
};
export type IncidentPage = {
  content: Array<Incident>;
  totalElements: number;
  totalPages: number;
  page: number;
  size: 10 | 25 | 50;
};
