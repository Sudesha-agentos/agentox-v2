import { useMemo } from "react";
import { useIssues } from "@/api/hooks";
import type { Issue } from "@/api/types";

export function useIssueMap(cid: string): Map<string, Issue> {
  const { data = [] } = useIssues(cid);
  return useMemo(() => new Map(data.map((i) => [i.id, i])), [data]);
}
