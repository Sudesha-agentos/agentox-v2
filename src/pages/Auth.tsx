import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { api, isDemoMode, setDemoMode } from "@/api/client";
import type { InviteInfo } from "@/api/types";
import { authErrorMessage, useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Avatar, Button, Field, Input, Mark, Spinner, StatusGlyph, cx } from "@/components/ui";
import { CompanyForm } from "@/components/CreateCompanyModal";

/* ------------------------------------------------------------- frame */

function Transcript() {
  const rows: Array<[string, string, string, string, string?]> = [
    ["09:41:02", "ceo", "Ada", "Reviewed Q1 plan; delegating editor work to engineering"],
    ["09:41:05", "tool", "create_task", "NWL-14 · Markdown shortcuts → Ken"],
    ["09:41:06", "wake", "Ken", "assignment · NWL-14"],
    ["09:41:19", "run", "Ken", "$ npm test -- --run", "✓ 18 passed"],
    ["09:42:47", "review", "Linus", "Requested pagination on GET /notes"],
    ["09:43:10", "approval", "Ada", "Hire: Product Designer · claude_local"],
  ];
  return (
    <div className="w-full max-w-md rounded-md border border-line-2 bg-canvas/80 backdrop-blur-sm">
      <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-xs text-fg-3">
        <StatusGlyph kind="live" />
        <span className="text-fg-2">Live</span>
        <span className="mono ml-auto text-2xs text-fg-4">northwind-labs</span>
      </div>
      <ol className="divide-y divide-line">
        {rows.map(([t, kind, who, text, chip], i) => (
          <li key={i} className="flex items-start gap-3 px-3 py-2">
            <span className="mono pt-px text-2xs text-fg-4 tnum">{t}</span>
            <span className="mono w-14 shrink-0 pt-px text-2xs text-fg-3 uppercase">{kind}</span>
            <span className="min-w-0 flex-1 text-xs">
              <span className="text-fg">{who}</span> <span className="text-fg-3">{text}</span>
              {chip && <span className="mono ml-2 rounded-xs border border-line-2 px-1 text-2xs text-fg-2">{chip}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AuthFrame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const auth = useAuth();
  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(420px,520px)_1fr]">
      <div className="flex min-h-full flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between">
          <Link to="/product" className="flex w-fit items-center gap-2 text-sm font-medium tracking-tight">
            <Mark size={16} /> agentox
          </Link>
          <Link to="/product" className="text-xs text-fg-3 hover:text-fg">
            What is agentox?
          </Link>
        </div>
        <div className="flex flex-1 items-center py-10">
          <div className="enter w-full max-w-[360px]">{children}</div>
        </div>
        <div className="mono flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-fg-4">
          {footer ?? (
            <>
              <span>{auth.mode === "demo" ? "demo backend" : location.host}</span>
              {auth.health?.version && <span>v{auth.health.version}</span>}
              {auth.health?.deploymentMode && <span>{auth.health.deploymentMode.replace("_", " ")}</span>}
            </>
          )}
        </div>
      </div>
      <div className="dot-grid relative hidden items-center justify-center overflow-hidden border-l border-line bg-panel p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,var(--panel)_80%)]" />
        <div className="relative w-full max-w-md">
          <div className="mono mb-3 text-2xs tracking-wider text-fg-4 uppercase">Agent operations</div>
          <h2 className="mb-6 text-2xl leading-tight font-medium tracking-tight">
            Run a company of agents.
            <br />
            <span className="text-fg-3">See every decision they make.</span>
          </h2>
          <Transcript />
        </div>
      </div>
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-xl font-medium tracking-tight">{title}</h1>
      {sub && <p className="mt-1.5 text-sm text-fg-3">{sub}</p>}
    </div>
  );
}

function FormError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div role="alert" className="enter flex items-start gap-2.5 rounded-sm border border-line-3 bg-raised px-3 py-2.5 text-sm">
      <span className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-fg" />
      {msg}
    </div>
  );
}

function PasswordInput({ value, onChange, autoComplete, invalid }: { value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <Input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} className={cx("h-9 pr-9", invalid && "border-fg-3")} required />
      <button type="button" tabIndex={-1} onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2 -translate-y-1/2 text-fg-4 hover:text-fg-2" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </span>
  );
}

function useNext() {
  const [params] = useSearchParams();
  const next = params.get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/* ------------------------------------------------------- sign in/up */

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const next = useNext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.phase === "ready" || auth.phase === "no_access") navigate(next, { replace: true });
  }, [auth.phase, navigate, next]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(email.trim(), password);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <Heading title="Sign in" sub="Welcome back. Your agents kept working." />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" required />
        </Field>
        <Field label="Password">
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        <FormError msg={error} />
        <Button type="submit" variant="primary" size="md" className="h-9 w-full" loading={busy} disabled={!email || !password}>
          Continue <ArrowRight />
        </Button>
      </form>
      <p className="mt-6 text-sm text-fg-3">
        New here?{" "}
        <Link to={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-xs text-fg-4">Forgot your password? Ask an instance admin to help you regain access.</p>
      {auth.mode === "demo" && (
        <div className="mt-8 rounded-sm border border-dashed border-line-3 p-3 text-xs text-fg-3">
          <div className="mono mb-1 text-2xs tracking-wider text-fg-4 uppercase">Demo</div>
          <div className="mono text-fg-2">demo@agentox.dev · agentox-demo</div>
          <button
            type="button"
            className="mt-2 text-fg underline decoration-line-3 underline-offset-4"
            onClick={() => {
              setEmail("demo@agentox.dev");
              setPassword("agentox-demo");
            }}
          >
            Fill credentials
          </button>
        </div>
      )}
    </AuthFrame>
  );
}

export function SignupPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const next = useNext();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = password.length > 0 && password.length < 8;

  useEffect(() => {
    if (auth.phase === "ready" || auth.phase === "no_access") navigate(next, { replace: true });
  }, [auth.phase, navigate, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (password.length < 8) return;
    setBusy(true);
    setError(null);
    try {
      await auth.signUp(name.trim(), email.trim(), password);
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <Heading title="Create your account" sub="You'll be the operator: approve hires, set budgets, review work." />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <Input autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-9" required />
        </Field>
        <Field label="Work email">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" required />
        </Field>
        <Field label="Password" error={touched && short ? "Use at least 8 characters." : null} hint={<PasswordMeter value={password} />}>
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" invalid={touched && short} />
        </Field>
        <FormError msg={error} />
        <Button type="submit" variant="primary" size="md" className="h-9 w-full" loading={busy} disabled={!name || !email || !password}>
          Create account <ArrowRight />
        </Button>
      </form>
      <p className="mt-6 text-sm text-fg-3">
        Already have an account?{" "}
        <Link to={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
          Sign in
        </Link>
      </p>
    </AuthFrame>
  );
}

function PasswordMeter({ value }: { value: string }) {
  const score = [value.length >= 8, value.length >= 12, /[A-Z]/.test(value) && /[a-z]/.test(value), /\d|[^\w]/.test(value)].filter(Boolean).length;
  const label = value ? ["Too short", "Weak", "Fair", "Good", "Strong"][value.length < 8 ? 0 : score] : "At least 8 characters.";
  return (
    <span className="flex items-center gap-2">
      <span className="flex gap-0.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx("h-0.5 w-6", value && value.length >= 8 && i < score ? "bg-fg-2" : "bg-line-3")} />
        ))}
      </span>
      {label}
    </span>
  );
}

/* --------------------------------------------------- gate screens */

export function ConnectPage() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const cmd = "npm run server";
  return (
    <AuthFrame footer={<span>waiting for {location.host}/api …</span>}>
      <div className="mono mb-3 flex items-center gap-2 text-2xs tracking-wider text-fg-3 uppercase">
        <span className="size-1.5 rounded-full border border-fg-3" /> Server unreachable
      </div>
      <Heading title="Connect to your agentox server" sub="The server runs your agents; this interface directs them. Start it and this page connects automatically." />
      <ol className="space-y-5 text-sm">
        <li className="flex gap-3">
          <span className="mono text-xs text-fg-4">01</span>
          <div className="min-w-0 flex-1">
            <div className="mb-2 text-fg-2">In the agentox folder, start the server (Node 24 or newer)</div>
            <button
              onClick={() => navigator.clipboard?.writeText(cmd).then(() => toast("Copied"))}
              className="mono group flex w-full items-center justify-between rounded-sm border border-line-2 bg-panel px-3 py-2 text-left text-xs hover:border-line-3"
            >
              <span>
                <span className="text-fg-4">$ </span>
                {cmd}
              </span>
              <Copy className="size-3.5 text-fg-4 group-hover:text-fg-2" />
            </button>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mono text-xs text-fg-4">02</span>
          <div className="text-fg-2">
            It listens on <span className="mono text-fg">:3100</span>. For another address set <span className="mono text-fg">AGENTOX_SERVER_URL</span> in <span className="mono text-fg">.env.local</span>.
          </div>
        </li>
      </ol>
      <div className="mt-8 flex gap-2">
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          loading={busy}
          icon={<RefreshCw />}
          onClick={async () => {
            setBusy(true);
            auth.retry();
            setTimeout(() => setBusy(false), 800);
          }}
        >
          Retry now
        </Button>
        <Button
          size="md"
          onClick={() => {
            setDemoMode(true);
            window.location.href = "/login";
          }}
        >
          Explore demo
        </Button>
      </div>
      <p className="mt-3 flex items-center gap-2 text-xs text-fg-4">
        <Spinner className="size-2.5" /> Retrying every few seconds
      </p>
    </AuthFrame>
  );
}

export function ClaimPage() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicExposure = auth.health?.deploymentExposure === "public";
  const signedIn = !!auth.user;
  return (
    <AuthFrame>
      <div className="mono mb-3 text-2xs tracking-wider text-fg-3 uppercase">First run</div>
      <Heading title="Claim this instance" sub="No one administers this agentox server yet. The first operator becomes the instance admin." />
      {publicExposure ? (
        <div className="space-y-3 text-sm text-fg-2">
          <p>This server is publicly exposed, so it can only be claimed from the machine running it:</p>
          <div className="mono rounded-sm border border-line-2 bg-panel px-3 py-2 text-xs">
            <span className="text-fg-4">$ </span>npm run server -- auth bootstrap-ceo
          </div>
          <p className="text-fg-3">Open the printed /invite link in this browser to finish.</p>
        </div>
      ) : (
        <ol className="space-y-4">
          <Step n="01" done={signedIn} title="Create the admin account">
            {!signedIn && (
              <div className="mt-2 flex gap-2">
                <Link to="/signup?next=/">
                  <Button variant="primary">Create account</Button>
                </Link>
                <Link to="/login?next=/">
                  <Button>Sign in</Button>
                </Link>
              </div>
            )}
            {signedIn && <div className="mono mt-1 text-xs text-fg-3">{auth.user?.email}</div>}
          </Step>
          <Step n="02" title="Claim admin rights">
            <FormError msg={error} />
            <Button
              variant="primary"
              className="mt-2"
              disabled={!signedIn}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await auth.claimInstance();
                } catch (e) {
                  setError(authErrorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Claim instance
            </Button>
          </Step>
        </ol>
      )}
    </AuthFrame>
  );
}

function Step({ n, title, done, children }: { n: string; title: string; done?: boolean; children?: ReactNode }) {
  return (
    <li className="flex gap-3 border-l border-line-2 pl-4">
      <span className={cx("mono -ml-[25px] flex size-4.5 shrink-0 items-center justify-center rounded-full border bg-canvas text-2xs", done ? "border-fg bg-fg text-inv-fg" : "border-line-3 text-fg-3")}>
        {done ? <Check className="size-2.5" /> : n.slice(1)}
      </span>
      <div className="min-w-0 flex-1 pb-2">
        <div className={cx("text-sm", done ? "text-fg-3" : "text-fg")}>{title}</div>
        {children}
      </div>
    </li>
  );
}

export function NoAccessPage() {
  const auth = useAuth();
  return (
    <AuthFrame>
      <Heading title="No workspace access yet" sub={<>You're signed in as <span className="text-fg">{auth.user?.email}</span>, but you aren't a member of any workspace on this server.</>} />
      <p className="mb-6 text-sm text-fg-2">Ask a workspace admin for an invite link. If you just requested access, you'll get in once they approve it.</p>
      <div className="flex gap-2">
        <Button variant="primary" icon={<RefreshCw />} onClick={() => auth.refresh()}>
          Check again
        </Button>
        <Button onClick={() => auth.signOut()}>Sign out</Button>
      </div>
    </AuthFrame>
  );
}

export function OnboardingPage() {
  return (
    <AuthFrame>
      <div className="mono mb-3 text-2xs tracking-wider text-fg-3 uppercase">Step 1 of 1</div>
      <Heading title="Create a workspace" sub="A workspace is one company of agents: a mission, a budget, and a team." />
      <CompanyForm submitLabel="Create workspace" />
    </AuthFrame>
  );
}

/* ------------------------------------------------------- invites */

export function InvitePage() {
  const { token = "" } = useParams();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "requested" | "member">("idle");
  const [error, setError] = useState<string | null>(null);
  const invite = useQuery({ queryKey: ["invite", token], queryFn: () => api.get<InviteInfo>(`/invites/${encodeURIComponent(token)}`), retry: false, enabled: auth.phase !== "offline" && auth.phase !== "loading" });
  const next = `/invite/${token}`;
  const signedIn = !!auth.user || auth.mode === "local_trusted";

  if (invite.isPending) {
    return (
      <AuthFrame>
        <Spinner />
      </AuthFrame>
    );
  }
  if (invite.isError) {
    return (
      <AuthFrame>
        <Heading title="Invite unavailable" sub="This link has expired, been revoked, or was copied incorrectly. Ask for a new one." />
        <Link to="/">
          <Button>Go to agentox</Button>
        </Link>
      </AuthFrame>
    );
  }
  const inv = invite.data;
  return (
    <AuthFrame>
      <div className="mb-6 flex items-center gap-3">
        <Avatar name={inv.companyName ?? "Workspace"} size={36} />
        <div>
          <div className="text-xs text-fg-3">{inv.invitedByUserName ? `${inv.invitedByUserName} invited you to` : "You're invited to"}</div>
          <div className="text-lg font-medium tracking-tight">{inv.companyName ?? "a workspace"}</div>
        </div>
      </div>
      <div className="mono mb-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-3">
        {inv.humanRole && <span>role · {inv.humanRole}</span>}
        {inv.expiresAt && <span>expires · {new Date(inv.expiresAt).toLocaleDateString()}</span>}
      </div>
      {inv.inviteMessage && <p className="mb-6 border-l border-line-3 pl-3 text-sm text-fg-2">{inv.inviteMessage}</p>}

      {state === "requested" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <StatusGlyph kind="queued" /> Request sent. A workspace admin needs to approve it.
          </div>
          <Button onClick={() => auth.refresh()} icon={<RefreshCw />}>
            Check status
          </Button>
        </div>
      ) : !signedIn ? (
        <div className="space-y-2">
          <Link to={`/signup?next=${encodeURIComponent(next)}`} className="block">
            <Button variant="primary" size="md" className="h-9 w-full">
              Create account to join
            </Button>
          </Link>
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="block">
            <Button size="md" className="h-9 w-full">
              I already have an account
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {auth.user && <div className="text-sm text-fg-3">Joining as <span className="text-fg">{auth.user.email}</span></div>}
          <FormError msg={error} />
          <Button
            variant="primary"
            size="md"
            className="h-9 w-full"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.post(`/invites/${encodeURIComponent(token)}/accept`, { requestType: "human" });
                setState("requested");
              } catch (e) {
                const msg = authErrorMessage(e);
                if (/already belong/i.test(msg)) setState("member");
                setError(msg);
              } finally {
                setBusy(false);
              }
            }}
          >
            Accept invite
          </Button>
          {state === "member" && (
            <Link to="/" className="block text-center text-sm text-fg underline underline-offset-4">
              Open workspace
            </Link>
          )}
        </div>
      )}
      {isDemoMode() && <p className="mono mt-8 text-2xs text-fg-4">demo invite token: demo-invite-token</p>}
    </AuthFrame>
  );
}
