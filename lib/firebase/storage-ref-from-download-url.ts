import type { FirebaseStorage } from "firebase/storage";
import { ref as storageRef } from "firebase/storage";

/** Шлях у bucket з публічного download URL Firebase Storage (v0 API). */
export function storageRefFromDownloadURL(storage: FirebaseStorage, downloadUrl: string) {
  const u = new URL(downloadUrl);
  if (!u.hostname.includes("firebasestorage.googleapis.com")) {
    throw new Error("Not a Firebase Storage download URL");
  }
  const m = u.pathname.match(/\/v0\/b\/[^/]+\/o\/(.+)/);
  if (!m?.[1]) throw new Error("Cannot parse Storage path from URL");
  return storageRef(storage, decodeURIComponent(m[1].replace(/\+/g, " ")));
}
