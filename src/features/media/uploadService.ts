import type { Cp45Runtime } from "../cp45/context";
import { ApiError, jsonResponse } from "../cp45/http";
import { sha256 } from "./imageHasher";
import { verifyWebP, IMAGE_LIMITS } from "./imageProcessor";
import { uploadToStorage } from "./storageClient";
import type { StorageConfig } from "./storageClient";
import type {
  Media,
  MediaTicket,
  PreparedImage,
  UploadProgress,
} from "./types";
/** One intention. Retains uploaded URL to retry confirmation without uploading/overwriting again. */
export class UploadTask {
  private ticket: MediaTicket | undefined;
  private url: string | undefined;
  private media: Media | undefined;
  private active = false;
  private notBefore = 0;
  private image: PreparedImage;
  private storage: StorageConfig;
  private request: Cp45Runtime["request"];
  constructor(
    image: PreparedImage,
    storage: StorageConfig,
    request: Cp45Runtime["request"],
  ) {
    this.image = image;
    this.storage = storage;
    this.request = request;
  }
  async run(
    signal: AbortSignal,
    update: (progress: UploadProgress) => void,
  ): Promise<Media> {
    if (this.active) throw new Error("La subida ya está en curso.");
    if (Date.now() < this.notBefore)
      throw new Error(
        `Espera ${Math.ceil((this.notBefore - Date.now()) / 1000)} s antes de reintentar.`,
      );
    this.active = true;
    try {
      if (this.media) {
        update({ phase: "confirmed", percent: 100 });
        return this.media;
      }
      signal.throwIfAborted();
      if (!this.url) {
        update({ phase: "ticket", percent: 0 });
        await verifyWebP(this.image.blob, IMAGE_LIMITS[this.image.purpose]);
        const sha = await sha256(this.image.blob);
        this.ticket = await jsonResponse<MediaTicket>(
          await this.request("/media/tickets", {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              purpose: this.image.purpose,
              contentType: "image/webp",
              bytes: this.image.blob.size,
              width: this.image.width,
              height: this.image.height,
              sha256: sha,
            }),
          }),
        );
        if (
          !this.ticket.ticketId ||
          !Number.isFinite(Date.parse(this.ticket.expiresAt))
        )
          throw new Error("Respuesta inesperada del ticket.");
        update({ phase: "uploading", percent: 0 });
        this.url = await uploadToStorage(
          this.ticket,
          this.image.blob,
          this.storage,
          signal,
          (percent) => update({ phase: "uploading", percent }),
        );
      }
      signal.throwIfAborted();
      if (!this.ticket) throw new Error("No se encontró el ticket de subida.");
      update({ phase: "confirming", percent: 100 });
      const media = await jsonResponse<Media>(
        await this.request(
          `/media/tickets/${encodeURIComponent(this.ticket.ticketId)}/confirm`,
          {
            method: "POST",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: this.url }),
          },
        ),
      );
      if (
        !Number.isSafeInteger(media.mediaId) ||
        media.mediaId < 1 ||
        media.purpose !== this.image.purpose ||
        media.width !== this.image.width ||
        media.height !== this.image.height
      )
        throw new Error("Respuesta inesperada al confirmar la imagen.");
      this.media = media;
      update({ phase: "confirmed", percent: 100 });
      return media;
    } catch (error) {
      if (error instanceof ApiError) {
        this.notBefore = Date.now() + error.retryAfter;
        // A confirmed upload can be retried idempotently; expired/rejected tickets need a new path.
        if (
          ["TICKET_EXPIRED", "MEDIA_VERIFICATION_FAILED"].includes(error.code)
        ) {
          this.url = undefined;
          this.ticket = undefined;
        }
      }
      update({ phase: signal.aborted ? "cancelled" : "error", percent: 0 });
      throw error;
    } finally {
      this.active = false;
    }
  }
}
