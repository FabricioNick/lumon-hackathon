import type { Cp45Runtime } from "../../cp45/context";
import type { Refiner } from "../types/refiners";
const scopes = new WeakMap<Cp45Runtime["request"], Map<number, Refiner>>();
function scope(request: Cp45Runtime["request"]) {
  let values = scopes.get(request);
  if (!values) {
    values = new Map();
    scopes.set(request, values);
  }
  return values;
}
export function rememberRefiner(
  request: Cp45Runtime["request"],
  refiner: Refiner,
): Refiner {
  const values = scope(request);
  const current = values.get(refiner.id);
  if (!current || refiner.version > current.version) {
    values.set(refiner.id, refiner);
    return refiner;
  }
  return current;
}
export function clearRefinerVersions(request: Cp45Runtime["request"]) {
  scopes.delete(request);
}
