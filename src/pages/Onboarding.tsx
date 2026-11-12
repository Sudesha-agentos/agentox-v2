import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { ApiError } from "@/api/errors";
import { useCancelRequest, useCreateWorkspace, useOnboarding, useRequestAccess, useSendCode, useVerifyCode, type OnboardingState } from "@/api/gateway";
import { authErrorMessage, useAuth } from "@/lib/auth";
import { Avatar, Button, Spinner, StatusGlyph, cx } from "@/components/ui";
import { AuthFrame, FormError, Heading } from "./Auth";

/**
 * Between signing in and the first workspace:
 *   verify   prove the email address with a 6-digit code
 *   create   first person from the domain (or a personal address): the workspace is set up for them
 *   request  the domain already has a workspace: ask to join
 *   pending  waiting for an owner or admin to admit them
 */
export function OnboardingPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const state = useOnboarding();

  // Once the gateway says they're in, refresh membership and open the workspace.
  useEffect(() => {
    if (state.data?.step === "ready") {
      auth.refresh().then(() => navigate("/", { replace: true }));
    }
  }, [state.data?.step]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.isPending || state.data?.step === "ready") {
    return (
      <AuthFrame>
        <div className="flex items-center gap-2 text-sm text-fg-3">
          <Spinner /> Opening agentox…
        </div>
      </AuthFrame>
    );
  }
  if (state.isError) {
    return (
      <AuthFrame>
        <Heading title="We couldn't load your account" sub="Something went wrong on our side. Try again in a moment." />
        <FormError msg={authErrorMessage(state.error)} />
        <div className="mt-6 flex gap-2">
          <Button variant="primary" icon={<RefreshCw />} onClick={() => state.refetch()}>
            Try again
          </Button>
          <Button onClick={() => auth.signOut()}>Sign out</Button>
        </div>
      </AuthFrame>
    );
  }

  const s = state.data;
  return (
    <AuthFrame footer={<Progress step={s.step} />}>
      {s.step === "verify" && <VerifyStep s={s} />}
      {s.step === "create" && <CreateStep s={s} />}
      {(s.step === "request" || s.step === "pending") && <JoinStep s={s} />}
    </AuthFrame>
  );
}

function Progress({ step }: { step: OnboardingState["step"] }) {
  const at = step === "verify" ? 1 : 2;
  return (
    <span className="flex items-center gap-3">
      {["Account", "Verify email", "Workspace"].map((label, i) => (
        <span key={label} className={cx("flex items-center gap-1.5", i < at ? "text-fg-3" : i === at ? "text-fg" : "text-fg-4")}>
          <span className={cx("size-1.5 rounded-full border", i < at ? "border-fg-3 bg-fg-3" : i === at ? "border-fg bg-fg" : "border-fg-4")} />
          {label}
        </span>
      ))}
    </span>
  );
}

function SignOutLink({ children = "Use a different account" }: { children?: ReactNode }) {
  const auth = useAuth();
  return (
    <button type="button" onClick={() => auth.signOut()} className="text-sm text-fg-3 underline decoration-line-3 underline-offset-4 hover:text-fg hover:decoration-fg">
      {children}
    </button>
  );
}

/* ------------------------------------------------------------- verify */

const RESEND_AFTER = 30;

function VerifyStep({ s }: { s: OnboardingState }) {
  const send = useSendCode();
  const verify = useVerifyCode();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(s.codeSentAt ? new Date(s.codeSentAt).getTime() : null);
  const [now, setNow] = useState(Date.now());
  const autoSent = useRef(false);

  const sendCode = async () => {
    setError(null);
    try {
      await send.mutateAsync();
      setSentAt(Date.now());
    } catch (e) {
      setError(authErrorMessage(e));
    }
  };

  // Send the first code automatically, unless a recent one is still valid.
  useEffect(() => {
    if (autoSent.current) return;
    autoSent.current = true;
    if (!sentAt || Date.now() - sentAt > 9 * 60_000) void sendCode();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const submit = async (value: string) => {
    if (value.length !== 6 || verify.isPending) return;
    setError(null);
    try {
      await verify.mutateAsync(value);
    } catch (e) {
      setError(authErrorMessage(e));
      setCode("");
    }
  };

  const wait = sentAt ? Math.min(RESEND_AFTER, Math.max(0, RESEND_AFTER - Math.floor((now - sentAt) / 1000))) : 0;
  return (
    <>
      <Heading
        title="Check your email"
        sub={
          <>
            We sent a 6-digit code to <span className="text-fg">{s.user.email}</span>. It confirms the address is yours before we connect you to {s.personal ? "your workspace" : `the ${s.domain} workspace`}.
          </>
        }
      />
      <CodeInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (v.length === 6) void submit(v);
        }}
        disabled={verify.isPending}
      />
      <div className="mt-4">
        <FormError msg={error} />
      </div>
      <Button variant="primary" size="md" className="mt-4 h-9 w-full" loading={verify.isPending} disabled={code.length !== 6} onClick={() => submit(code)}>
        Verify <ArrowRight />
      </Button>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-fg-3">
        <span>
          {send.isPending ? (
            <span className="flex items-center gap-2">
              <Spinner className="size-2.5" /> Sending…
            </span>
          ) : wait > 0 ? (
            <span className="tnum">Resend in {wait}s</span>
          ) : (
            <button type="button" onClick={sendCode} className="text-fg underline decoration-line-3 underline-offset-4 hover:decoration-fg">
              Send a new code
            </button>
          )}
        </span>
        <SignOutLink>Wrong address?</SignOutLink>
      </div>
    </>
  );
}

/** Six single-digit boxes that behave like one field: typing advances, paste fills, backspace goes back. */
function CodeInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => {
    refs.current[Math.min(value.length, 5)]?.focus();
  }, [value.length]);

  const set = (i: number, digit: string) => {
    const chars = value.padEnd(6, " ").split("");
    chars[i] = digit;
    onChange(chars.join("").replace(/\s+$/, "").replace(/\s/g, ""));
  };
  const onKey = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      e.preventDefault();
      onChange(value.slice(0, i - 1));
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (digits) {
      e.preventDefault();
      onChange(digits);
    }
  };
  return (
    <div className="flex gap-2" role="group" aria-label="Verification code">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={value[i] ?? ""}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "");
            if (d.length > 1) onChange(d.slice(0, 6));
            else if (d) set(i, d);
            else onChange(value.slice(0, i));
          }}
          onKeyDown={onKey(i)}
          onPaste={onPaste}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
          className={cx(
            "mono h-12 w-full min-w-0 rounded-sm border bg-panel text-center text-lg tnum transition-colors outline-none focus:border-fg-2",
            value[i] ? "border-line-3" : "border-line-2",
            i === 2 && "mr-2",
          )}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- create */

function CreateStep({ s }: { s: OnboardingState }) {
  const create = useCreateWorkspace();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      await create.mutateAsync();
    } catch (e) {
      // 409 with a step means someone from the team got there first: the state refetch moves us on.
      if (e instanceof ApiError && e.status === 409) return;
      setError(authErrorMessage(e));
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const name = s.workspaceName ?? "your workspace";
  const done = create.isSuccess;
  return (
    <>
      <Heading
        title={`Setting up ${name}`}
        sub={s.personal ? "Personal email addresses get a workspace of their own. You can invite people to it later." : `You're the first person from ${s.domain} here, so you'll own the workspace. Teammates who sign up with an @${s.domain} address can ask to join.`}
      />
      <ol className="space-y-3 text-sm">
        <Line done>Verified {s.user.email}</Line>
        <Line done={done} active={!done && !error}>
          Creating the <span className="text-fg">{name}</span> workspace
        </Line>
        <Line done={done} active={false}>
          Making you its owner
        </Line>
      </ol>
      <div className="mt-6">
        <FormError msg={error} />
      </div>
      {error && (
        <div className="mt-4 flex gap-2">
          <Button variant="primary" icon={<RefreshCw />} loading={create.isPending} onClick={run}>
            Try again
          </Button>
          <SignOutLink>Sign out</SignOutLink>
        </div>
      )}
    </>
  );
}

function Line({ done, active, children }: { done?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <li className={cx("flex items-center gap-3", done || active ? "text-fg-2" : "text-fg-4")}>
      <span className={cx("flex size-4.5 shrink-0 items-center justify-center rounded-full border", done ? "border-fg bg-fg text-inv-fg" : "border-line-3")}>
        {done ? <Check className="size-2.5" /> : active ? <Spinner className="size-2.5" /> : null}
      </span>
      <span>{children}</span>
    </li>
  );
}

/* ---------------------------------------------------------- request */

function JoinStep({ s }: { s: OnboardingState }) {
  const request = useRequestAccess();
  const cancel = useCancelRequest();
  const [error, setError] = useState<string | null>(null);
  const name = s.workspace?.name ?? s.domain;
  const pending = s.step === "pending";

  const ask = async () => {
    setError(null);
    try {
      await request.mutateAsync();
    } catch (e) {
      setError(authErrorMessage(e));
    }
  };

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <Avatar name={name} size={36} />
        <div>
          <div className="text-xs text-fg-3">@{s.domain}</div>
          <div className="text-lg font-medium tracking-tight">{name}</div>
        </div>
      </div>
      {pending ? (
        <>
          <Heading title="Request sent" sub={`${name}'s admins have been emailed. This page opens the workspace as soon as one of them lets you in.`} />
          <div className="mb-6 flex items-center gap-2.5 rounded-sm border border-line-2 bg-panel px-3 py-2.5 text-sm text-fg-2">
            <StatusGlyph kind="queued" /> Waiting for approval
            <Spinner className="ml-auto size-2.5 text-fg-4" />
          </div>
          <FormError msg={error} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              loading={cancel.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await cancel.mutateAsync();
                } catch (e) {
                  setError(authErrorMessage(e));
                }
              }}
            >
              Cancel request
            </Button>
            <SignOutLink>Sign out</SignOutLink>
          </div>
        </>
      ) : (
        <>
          <Heading title={`Your team is already on agentox`} sub={`People with @${s.domain} addresses work in ${name}. Ask its admins to let you in; they'll get an email right away.`} />
          {s.lastDecision === "rejected" && <p className="mb-5 border-l border-line-3 pl-3 text-sm text-fg-2">Your last request wasn't approved. You can ask again, or check with your team first.</p>}
          <FormError msg={error} />
          <Button variant="primary" size="md" className="h-9 w-full" loading={request.isPending} onClick={ask}>
            Request access <ArrowRight />
          </Button>
          <div className="mt-6">
            <SignOutLink />
          </div>
        </>
      )}
    </>
  );
}
