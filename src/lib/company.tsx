import { createContext, useContext } from "react";
import type { Company } from "@/api/types";

const LAST_KEY = "agentox.lastCompany";

export const CompanyContext = createContext<Company | null>(null);

export function useCompany(): Company {
  const c = useContext(CompanyContext);
  if (!c) throw new Error("useCompany must be used inside a company route");
  return c;
}

export function rememberCompany(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    // not persisted; harmless
  }
}

export function lastCompany(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
