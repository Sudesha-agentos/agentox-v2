import { useMemo } from "react";
import { useAgents } from "@/api/hooks";
import type { Agent } from "@/api/types";

export function useAgentMap(cid: string): Map<string, Agent> {
  const { data = [] } = useAgents(cid);
  return useMemo(() => new Map(data.map((a) => [a.id, a])), [data]);
}
