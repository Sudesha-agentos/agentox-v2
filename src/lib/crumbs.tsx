import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Crumb = { label: ReactNode; to?: string };

const Ctx = createContext<{ crumbs: Crumb[]; set: (c: Crumb[]) => void }>({ crumbs: [], set: () => {} });

export function CrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, set] = useState<Crumb[]>([]);
  return <Ctx.Provider value={{ crumbs, set }}>{children}</Ctx.Provider>;
}

export const useCrumbState = () => useContext(Ctx).crumbs;

/** Pages declare where they sit; the top bar renders it. Pass a stable key to avoid loops. */
export function useCrumbs(crumbs: Crumb[], key: string) {
  const { set } = useContext(Ctx);
  useEffect(() => {
    set(crumbs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set]);
}
