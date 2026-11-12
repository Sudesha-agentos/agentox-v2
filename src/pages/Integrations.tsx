import { useSearchParams } from "react-router-dom";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { PageHeader, Tabs } from "@/components/ui";
import { ReadinessOverview } from "./integrations/Readiness";
import { ProvidersSection, RuntimesSection } from "./integrations/Models";
import { AppsTab } from "./integrations/Apps";
import { SecretsTab } from "./integrations/Secrets";
import { DeveloperTab } from "./integrations/Developer";
import { useReadiness } from "./integrations/model";

export { CopyField } from "./integrations/shared";

type Tab = "overview" | "runtimes" | "apps" | "secrets" | "developer";

export function IntegrationsPage() {
  const { id: cid } = useCompany();
  useCrumbs([{ label: "Integrations" }], "integrations");
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "providers" || raw === "runtimes" ? "runtimes" : raw === "api" ? "developer" : ((raw as Tab) ?? "overview");
  const go = (t: string) => setParams(t === "overview" ? {} : { tab: t }, { replace: true });
  const r = useReadiness(cid);
  const blocked = r.rows.filter((x) => x.verdict.kind === "blocked").length;
  const broken = (r.providers.data?.connections ?? []).filter((c) => c.status !== "connected").length;

  return (
    <div className="max-w-5xl">
      <PageHeader index="09" title="Integrations" description="What your agents run on and connect to. Start with readiness: it tells you which agents can work and how to fix the ones that can't." />
      <Tabs
        value={tab}
        onChange={go}
        className="mb-5"
        items={[
          { value: "overview", label: <>Readiness{blocked > 0 && <span className="ml-1 inline-block size-1.5 rotate-45 bg-fg" />}</> },
          { value: "runtimes", label: <>Runtimes &amp; models{broken > 0 && <span className="ml-1 inline-block size-1.5 rotate-45 bg-fg" />}</> },
          { value: "apps", label: "Apps" },
          { value: "secrets", label: "Secrets" },
          { value: "developer", label: "Developer" },
        ]}
      />
      {tab === "overview" && <ReadinessOverview cid={cid} onTab={go} />}
      {tab === "runtimes" && (
        <div className="space-y-8">
          <ProvidersSection cid={cid} />
          <RuntimesSection cid={cid} />
        </div>
      )}
      {tab === "apps" && <AppsTab cid={cid} />}
      {tab === "secrets" && <SecretsTab cid={cid} />}
      {tab === "developer" && <DeveloperTab />}
    </div>
  );
}
