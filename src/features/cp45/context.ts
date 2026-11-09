import { createContext, useContext } from "react";
import type { Refiner } from "./contracts";
import type { StorageConfig } from "../media/storageClient";
export type FloorEvent =
  | {
      type: "refiner.updated";
      eventId: number;
      data: { id: number; version: number; refiner: Refiner };
    }
  | {
      type: "contingency.activated";
      eventId: number;
      data: {
        id: number;
        userId: number;
        status: "ACTIVE";
        createdAt: string;
        message: string;
      };
    }
  | {
      type: "contingency.resolved";
      eventId: number;
      data: { id: number; userId: number; ackedAt: string };
    }
  | {
      type: "stream.reset";
      eventId: number;
      data: { reason: string; message: string };
    }
  | { type: "session.revoked"; eventId: number; data: { reason: string } };

export interface Cp45Runtime {
  /** Authenticated fetch from CP1: adds Authorization/build and handles coordinated refresh. */
  request: (path: string, init?: RequestInit) => Promise<Response>;
  storage?: StorageConfig;
  userId: number | null;
  /** Stable across tabs for this login; change on logout/new login. Never a token. */
  sessionKey: string;
  permissions: readonly string[];
  /** CP1's shared SSE bus; this module never opens an EventSource. */
  subscribe: (listener: (event: FloorEvent) => void) => () => void;
}
export const Cp45Context = createContext<Cp45Runtime | null>(null);
export function useCp45() {
  const runtime = useContext(Cp45Context);
  if (!runtime)
    throw new Error(
      "Falta Cp45Provider: conectar autenticación y eventos de CP1.",
    );
  return runtime;
}
