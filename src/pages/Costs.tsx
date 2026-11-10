import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCostByAgent, useCostSummary, type CostRange } from "@/api/hooks";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { cents, compact } from "@/lib/format";
import { Avatar, Empty, ErrorBox, Meter, PageHeader, Panel, PanelHeader, Segmented, Skeleton, SkeletonRows, Table, Td, Th, Tr } from "@/components/ui";

const RANGES: Array<{ value: CostRange; label: string }> = [
  { value: "mtd", label: "Month" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "All" },
];

export function SpendPage() {
  const company = useCompany();
  const cid = company.id;
  useCrumbs([{ label: "Spend" }], "spend");
  const navigate = useNavigate();
  const [range, setRange] = useState<CostRange>("mtd");
  const summary = useCostSummary(cid, range);
  const byAgent = useCostByAgent(cid, range);
  const rows = [...(byAgent.data ?? [])].sort((a, b) => b.costCents - a.costCents);
  const total = rows.reduce((t, r) => t + r.costCents, 0) || 1;
  const s = summary.data;
  const tokensIn = rows.reduce((t, r) => t + r.inputTokens, 0);
  const tokensOut = rows.reduce((t, r) => t + r.outputTokens, 0);
  const cached = rows.reduce((t, r) => t + r.cachedInputTokens, 0);

  return (
    <div>
      <PageHeader title="Spend" description="What agents cost, by agent and token. Budgets pause agents automatically." actions={<Segmented value={range} onChange={setRange} items={RANGES} />} />
      {summary.isError && <ErrorBox error={summary.error} onRetry={() => summary.refetch()} />}

      <Panel className="mb-4 grid grid-cols-2 md:grid-cols-4">
        {s ? (
          [
            ["Spend", cents(s.spendCents), `${s.eventCount.toLocaleString()} billable events`],
            ["Budget · month", s.budgetCents ? cents(s.budgetCents) : "No cap", s.budgetCents && range === "mtd" ? <Meter value={s.spendCents} max={s.budgetCents} className="mt-1.5" /> : "workspace limit"],
            ["Input tokens", compact(tokensIn), `${compact(cached)} cached`],
            ["Output tokens", compact(tokensOut), `${rows.length} agents with usage`],
          ].map(([k, v, f], i) => (
            <div key={i} className="border-line px-4 py-3.5 [&:not(:last-child)]:border-r max-md:[&:nth-child(2n)]:border-r-0 max-md:[&:nth-child(-n+2)]:border-b">
              <div className="text-xs text-fg-3">{k}</div>
              <div className="mono mt-2 text-2xl leading-none font-medium tracking-tight tnum">{v}</div>
              <div className="mt-2 min-h-4 text-xs text-fg-3">{f}</div>
            </div>
          ))
        ) : (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="px-4 py-3.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-6 w-20" />
            </div>
          ))
        )}
      </Panel>

      <Panel>
        <PanelHeader title="By agent" meta={range} />
        {byAgent.isError ? (
          <div className="p-3.5">
            <ErrorBox error={byAgent.error} onRetry={() => byAgent.refetch()} />
          </div>
        ) : byAgent.isPending ? (
          <SkeletonRows rows={4} />
        ) : rows.length === 0 ? (
          <Empty title="No spend in this period" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Agent</Th>
                <Th className="w-[34%] max-sm:hidden">Share</Th>
                <Th align="right" className="max-md:hidden">
                  Input
                </Th>
                <Th align="right" className="max-md:hidden">
                  Output
                </Th>
                <Th align="right" className="max-md:hidden">
                  Events
                </Th>
                <Th align="right">Cost</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.agentId} onClick={() => navigate(`/${cid}/agents/${r.agentId}`)}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <Avatar name={r.agentName} size={18} />
                      {r.agentName}
                    </span>
                  </Td>
                  <Td className="max-sm:hidden">
                    <span className="flex items-center gap-3">
                      <span className="h-1.5 flex-1 overflow-hidden bg-line-2">
                        <span className="block h-full bg-fg-2" style={{ width: `${(r.costCents / total) * 100}%` }} />
                      </span>
                      <span className="mono w-10 text-right text-xs text-fg-3 tnum">{Math.round((r.costCents / total) * 100)}%</span>
                    </span>
                  </Td>
                  <Td mono align="right" className="max-md:hidden">
                    {compact(r.inputTokens)}
                  </Td>
                  <Td mono align="right" className="max-md:hidden">
                    {compact(r.outputTokens)}
                  </Td>
                  <Td mono align="right" className="max-md:hidden">
                    {r.eventCount}
                  </Td>
                  <Td mono align="right" className="text-fg">
                    {cents(r.costCents)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
