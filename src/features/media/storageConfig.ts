import type { StorageConfig } from "./storageClient";
/** Reads public configuration only. Storage registration/verification remains in CP1. */
export function storageConfigFromEnv(): StorageConfig | undefined {
  const env = import.meta.env;
  if (
    env.VITE_STORAGE_PROVIDER === "SUPABASE" &&
    env.VITE_SUPABASE_URL &&
    env.VITE_SUPABASE_PUBLIC_KEY
  )
    return {
      provider: "SUPABASE",
      projectUrl: env.VITE_SUPABASE_URL,
      publicKey: env.VITE_SUPABASE_PUBLIC_KEY,
    };
  if (
    env.VITE_STORAGE_PROVIDER === "CLOUDINARY" &&
    env.VITE_CLOUDINARY_CLOUD_NAME &&
    env.VITE_CLOUDINARY_UPLOAD_PRESET &&
    env.VITE_CLOUDINARY_UPLOAD_URL
  )
    return {
      provider: "CLOUDINARY",
      cloudName: env.VITE_CLOUDINARY_CLOUD_NAME,
      uploadPreset: env.VITE_CLOUDINARY_UPLOAD_PRESET,
      uploadUrl: env.VITE_CLOUDINARY_UPLOAD_URL,
    };
  return undefined;
}
