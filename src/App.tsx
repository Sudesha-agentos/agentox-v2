import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { APP_ORIGIN, MARKETING_ORIGIN, hasSeparateMarketing, isMarketingHost } from "@/lib/hosts";
import { useCompanies } from "@/api/hooks";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CompanyContext, lastCompany, rememberCompany } from "@/lib/company";
import { LiveUpdates } from "@/lib/live";
import { Layout } from "@/components/Layout";
import { ErrorBox, Mark, Spinner } from "@/components/ui";
import { ClaimPage, ConnectPage, InvitePage, LoginPage, NoAccessPage, OnboardingPage, SignupPage } from "@/pages/Auth";
import { DashboardPage } from "@/pages/Dashboard";
import { LivePage } from "@/pages/Live";
import { TasksPage } from "@/pages/Tasks";
import { TaskDetailPage } from "@/pages/TaskDetail";
import { AgentsPage } from "@/pages/Agents";
import { AgentDetailPage } from "@/pages/AgentDetail";
import { RunsPage } from "@/pages/Runs";
import { RunDetailPage } from "@/pages/RunDetail";
import { ApprovalsPage } from "@/pages/Approvals";
import { SpendPage } from "@/pages/Costs";
import { IntegrationsPage } from "@/pages/Integrations";
import { MembersPage } from "@/pages/Members";
import { SettingsPage } from "@/pages/Settings";
import { DesignPage } from "@/pages/Design";
import { ProductPage } from "@/pages/Product";
import { Empty } from "@/components/ui";

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-fg-3">
      <Mark size={20} className="text-fg" />
      <Spinner />
    </div>
  );
}

/** Routes behind the auth gate. */
function Gate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  switch (auth.phase) {
    case "loading":
      return <Splash />;
    case "offline":
      return <ConnectPage />;
    case "bootstrap":
      return <ClaimPage />;
    case "signed_out":
      if (location.pathname === "/") return <Navigate to={hasSeparateMarketing ? "/login" : "/product"} replace />;
      return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
    case "no_access":
      return <NoAccessPage />;
    case "ready":
      return <>{children}</>;
  }
}

function Home() {
  const companies = useCompanies();
  if (companies.isPending) return <Splash />;
  if (companies.isError)
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorBox error={companies.error} onRetry={() => companies.refetch()} />
      </div>
    );
  if (!companies.data.length) return <OnboardingPage />;
  const last = lastCompany();
  const target = companies.data.find((c) => c.id === last) ?? companies.data[0]!;
  return <Navigate to={`/${target.id}`} replace />;
}

function CompanyShell() {
  const { cid } = useParams();
  const companies = useCompanies();
  if (companies.isPending) return <Splash />;
  const company = companies.data?.find((c) => c.id === cid);
  if (!company) return <Navigate to="/" replace />;
  rememberCompany(company.id);
  return (
    <CompanyContext.Provider value={company}>
      <LiveUpdates companyId={company.id}>
        <Layout />
      </LiveUpdates>
    </CompanyContext.Provider>
  );
}

/** Auth pages are reachable only when the server is up and auth applies. */
function AuthRoute({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.phase === "loading") return <Splash />;
  if (auth.phase === "offline") return <ConnectPage />;
  if (auth.mode === "local_trusted") return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Leaves the current origin; used where one address hands off to the other. */
function ExternalRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return <Splash />;
}

/** On agentox.io: the product page and the design system; everything else belongs to the app. */
function MarketingRoutes() {
  const location = useLocation();
  return (
    <Routes>
      <Route path="/" element={<ProductPage />} />
      <Route path="/product" element={<Navigate to="/" replace />} />
      <Route path="/design" element={<DesignPage />} />
      <Route path="*" element={<ExternalRedirect to={`${APP_ORIGIN ?? ""}${location.pathname}${location.search}`} />} />
    </Routes>
  );
}

export function App() {
  if (isMarketingHost) return <MarketingRoutes />;
  return (
    <AuthProvider>
      <Routes>
        <Route path="/design" element={<DesignPage />} />
        <Route path="/product" element={hasSeparateMarketing ? <ExternalRedirect to={`${MARKETING_ORIGIN}/`} /> : <ProductPage />} />
        <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
        <Route path="/signup" element={<AuthRoute><SignupPage /></AuthRoute>} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/" element={<Gate><Home /></Gate>} />
        <Route path="/:cid" element={<Gate><CompanyShell /></Gate>}>
          <Route index element={<DashboardPage />} />
          <Route path="live" element={<LivePage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="runs/:id" element={<RunDetailPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="agents/:id" element={<AgentDetailPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="spend" element={<SpendPage />} />
          <Route path="costs" element={<Navigate to="../spend" replace />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Empty title="Page not found" />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
