import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock, Copy, Plus } from "lucide-react";
import { Reveal, scrollToId, useScrollProgress, useSmoothScroll } from "@/lib/motion";
import { appHref } from "@/lib/hosts";
import { SmartLink } from "@/components/SmartLink";
import { toast } from "@/lib/toast";
import { Avatar, Chip, Mark, Status, StatusGlyph, cx } from "@/components/ui";
import { IssueStatusIcon } from "@/components/status";

/* -------------------------------------------------------------- copy */

const NAV = [
  ["features", "Features"],
  ["how", "How it works"],
  ["capabilities", "Capabilities"],
  ["security", "Security"],
  ["faq", "FAQ"],
] as const;

const RUNTIMES = ["Claude Code", "Codex", "Cursor", "Gemini CLI", "OpenCode", "OpenClaw", "Hermes", "Pi", "Kimi", "Grok"];

const CAPABILITIES: Array<[string, string]> = [
  ["Org chart", "Agents report to managers. Delegation follows the lines you draw."],
  ["Task board", "List and board views. Drag a card to change its status."],
  ["Readiness checks", "Know whether an agent will start before you assign it."],
  ["Live transcripts", "Every line an agent prints, streamed with millisecond timestamps."],
  ["Review queue", "Finished work waits for you. Accept it or send it back with notes."],
  ["Approval gates", "Hires, strategy changes and budget overrides need an operator."],
  ["Budgets", "Monthly caps per workspace and per agent, enforced automatically."],
  ["Run history", "Filter by agent, outcome or task. Failures surface first."],
  ["Encrypted secrets", "Write-only credentials, delivered to agents as environment variables."],
  ["MCP and API", "Let Claude, Cursor or your scripts act on the workspace."],
  ["Command menu", "Jump anywhere or create a task from the keyboard with ⌘K."],
  ["Any screen", "Dark and light themes. Works on a phone when you are away from your desk."],
];

const FAQ: Array<[string, string]> = [
  [
    "What do I need to run agentox?",
    "A machine with Node 24 or newer. One command starts the agentox server with an embedded database, and the interface connects to it automatically. Point it at your own Postgres when you are ready for production.",
  ],
  ["Which agents can I run?", "Any runtime the agentox server supports, including Claude Code, Codex, Cursor, Gemini CLI, OpenCode, OpenClaw and Hermes, as well as custom processes and HTTP endpoints."],
  ["Where does my data live?", "On your agentox server. The interface talks to it directly from the browser and keeps no copy of your code, prompts, transcripts or credentials."],
  ["Do my agents need to change?", "No. Agents keep their runtime, model and tools. agentox adds assignment, oversight and review on top of what they already do."],
  ["How long does setup take?", "A few minutes. Run one command to start the server, create your account, hire your first agent and assign it a task."],
];

/* --------------------------------------------------------- primitives */

function Frame({ children, className, title = "agentox" }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <div className={cx("overflow-hidden rounded-lg border border-line-2 bg-canvas shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)]", className)}>
      <div className="flex h-8 items-center gap-1.5 border-b border-line bg-panel px-3">
        <span className="size-2 rounded-full bg-line-3" />
        <span className="size-2 rounded-full bg-line-3" />
        <span className="size-2 rounded-full bg-line-3" />
        <span className="mono ml-3 text-2xs text-fg-4">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Btn({ children, onClick, primary, to, size = "md" }: { children: ReactNode; onClick?: () => void; primary?: boolean; to?: string; size?: "md" | "lg" }) {
  const cls = cx(
    "inline-flex items-center gap-2 rounded-sm font-medium transition-all duration-300 [&_svg]:size-4 [&_svg]:transition-transform hover:[&_svg]:translate-x-0.5",
    size === "lg" ? "h-11 px-5 text-md" : "h-9 px-4 text-sm",
    primary ? "bg-inv text-inv-fg hover:opacity-85" : "border border-line-3 text-fg hover:border-fg-3 hover:bg-hover",
  );
  return to ? (
    <SmartLink href={appHref(to)} className={cls}>
      {children}
    </SmartLink>
  ) : (
    <button onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function SectionLabel({ n, children }: { n?: string; children: ReactNode }) {
  return (
    <div className="mono mb-5 flex items-center gap-3 text-xs text-fg-3">
      {n && <span className="text-fg-4">{n}</span>}
      <span className="tracking-wider uppercase">{children}</span>
    </div>
  );
}

/* ----------------------------------------------------------- visuals */

const HERO_LINES: Array<[string, string]> = [
  ["sys", "Run started (claude_local)"],
  ["out", "Working on NWL-11: Add rate limiting to the notes API"],
  ["out", "Loaded 3 skills: repo-navigation, testing, agentox-api"],
  ["cmd", "$ rg -n \"router.post\" src/routes"],
  ["out", "Adding token bucket middleware per workspace"],
  ["cmd", "$ npm test -- --run"],
  ["ok", "✓ 24 passed (2.4s)"],
  ["out", "Posted update to NWL-11 and moved it to review"],
];

function useLoop(length: number, ms: number) {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x >= length + 3 ? 1 : x + 1)), ms);
    return () => clearInterval(t);
  }, [length, ms]);
  return Math.min(n, length);
}

function HeroPreview() {
  const n = useLoop(HERO_LINES.length, 1100);
  const lanes: Array<[string, string, string, "live" | "idle" | "queued" | "paused"]> = [
    ["Grace", "NWL-11", "Add rate limiting to the notes API", "live"],
    ["Ken", "NWL-4", "Build editor with markdown shortcuts", "live"],
    ["Linus", "NWL-10", "Security review of auth flow", "queued"],
    ["Ada", "", "Last ran 12m ago", "idle"],
    ["Mae", "", "Paused with 1 task waiting", "paused"],
  ];
  return (
    <Frame title="northwind-labs / live">
      <div className="grid md:grid-cols-[1fr_1.1fr]">
        <div className="border-line md:border-r">
          <div className="flex h-9 items-center justify-between border-b border-line px-3.5 text-xs">
            <span className="text-fg-2">Agents</span>
            <span className="mono text-2xs text-fg-4">2 working · 1 to review</span>
          </div>
          {lanes.map(([name, id, text, g], i) => (
            <div key={name} className={cx("flex items-center gap-3 border-b border-line px-3.5 py-3", i === 0 && "bg-active")}>
              <Avatar name={name} size={24} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  {name} <StatusGlyph kind={g} />
                </div>
                <div className="truncate text-xs text-fg-3">
                  {id && <span className="mono mr-1.5 text-fg-4">{id}</span>}
                  {text}
                </div>
              </div>
              {g === "live" && <Chip icon={<Clock />}>{i === 0 ? "0:42" : "3:07"}</Chip>}
            </div>
          ))}
        </div>
        <div className="flex min-h-[300px] flex-col">
          <div className="flex h-9 items-center gap-2 border-b border-line px-3.5 text-xs">
            <IssueStatusIcon status="in_progress" />
            <span className="mono text-fg-4">NWL-11</span>
            <span className="truncate text-fg-2">Add rate limiting to the notes API</span>
          </div>
          <div className="flex-1 py-2">
            {HERO_LINES.slice(0, n).map(([k, m], i) => (
              <div key={i} className="line-in flex gap-3 px-3.5 py-[3px]">
                <span className="mono text-2xs text-fg-4 tnum">09:41:{String(2 + i * 3).padStart(2, "0")}</span>
                <span className={cx("mono text-xs", k === "sys" ? "text-fg-3" : k === "cmd" || k === "ok" ? "text-fg" : "text-fg-2")}>{m}</span>
              </div>
            ))}
            {n < HERO_LINES.length && <span className="blink ml-[88px] inline-block h-3 w-1.5 bg-fg-2" />}
          </div>
        </div>
      </div>
    </Frame>
  );
}

function AssignVisual() {
  return (
    <Frame title="new task">
      <div className="space-y-4 p-5">
        <div className="text-lg font-medium tracking-tight">Add rate limiting to the notes API</div>
        <div className="text-sm text-fg-3">Token bucket per workspace. Return 429 with a Retry-After header when exceeded.</div>
        <div className="grid grid-cols-3 gap-2 border-t border-line pt-4 text-xs">
          {[
            ["Assignee", "Grace"],
            ["Priority", "High"],
            ["Project", "Web app v1"],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="mb-1 text-fg-3">{k}</div>
              <div className="rounded-sm border border-line-2 px-2 py-1.5">{v}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2.5 rounded-sm border border-line-2 bg-raised px-3 py-2 text-xs">
          <Avatar name="Grace" size={18} />
          <StatusGlyph kind="ok" />
          <span className="text-fg-2">Grace: Starts immediately</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-sm border border-line-2 px-3 py-2 text-xs opacity-60">
          <Avatar name="Mae" size={18} />
          <StatusGlyph kind="paused" />
          <span className="text-fg-2">Mae: Paused · won't start until resumed</span>
          <span className="ml-auto text-fg-3">Resume Mae too</span>
        </div>
        <div className="flex justify-end">
          <span className="inline-flex h-7 items-center rounded-sm bg-inv px-3 text-xs font-medium text-inv-fg">Create task</span>
        </div>
      </div>
    </Frame>
  );
}

function ReviewVisual() {
  return (
    <Frame title="NWL-11">
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3 rounded-sm border border-line-2 bg-raised px-3.5 py-3">
          <StatusGlyph kind="live" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Grace finished. Your review is needed</div>
            <div className="text-xs text-fg-3">Accept the work or send it back with notes.</div>
          </div>
          <span className="inline-flex h-6 items-center gap-1 rounded-sm bg-inv px-2 text-xs text-inv-fg">
            <Check className="size-3" /> Accept
          </span>
          <span className="inline-flex h-6 items-center rounded-sm border border-line-3 px-2 text-xs">Request changes</span>
        </div>
        <ol className="relative space-y-4 pl-8">
          <span className="absolute top-1 bottom-1 left-[10px] w-px bg-line-2" />
          {[
            ["You", "created this task and assigned Grace", "09:41"],
            ["Grace", "moved this to in progress", "09:41"],
          ].map(([who, what, t]) => (
            <li key={what} className="relative flex text-sm">
              <span className="absolute top-1.5 -left-[25px] size-1.5 rounded-full bg-fg-4" />
              <span className="flex-1">
                <span className="text-fg-2">{who}</span> <span className="text-fg-3">{what}</span>
              </span>
              <span className="mono text-2xs text-fg-4">{t}</span>
            </li>
          ))}
          <li className="relative">
            <span className="absolute top-0 -left-[30px]">
              <Avatar name="Grace" size={20} />
            </span>
            <div className="rounded-sm border border-line bg-panel px-3 py-2.5 text-sm text-fg-2">Implemented the middleware with per-workspace buckets. 24 of 24 tests pass. Ready for review.</div>
          </li>
        </ol>
      </div>
    </Frame>
  );
}

function SpendVisual() {
  const rows: Array<[string, number, number]> = [
    ["Linus", 3240, 30000],
    ["Grace", 2510, 30000],
    ["Ada", 1720, 40000],
    ["Ken", 27900, 30000],
  ];
  return (
    <Frame title="spend · month">
      <div className="grid grid-cols-3 border-b border-line">
        {[
          ["Spend", "$353.70"],
          ["Budget", "$1,500"],
          ["Tokens", "5.2M"],
        ].map(([k, v], i) => (
          <div key={k} className={cx("px-4 py-3.5", i < 2 && "border-r border-line")}>
            <div className="text-xs text-fg-3">{k}</div>
            <div className="mono mt-1.5 text-xl font-medium">{v}</div>
          </div>
        ))}
      </div>
      <div className="divide-y divide-line">
        {rows.map(([name, spent, cap]) => {
          const pct = (spent / cap) * 100;
          return (
            <div key={name} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={name} size={20} />
              <span className="w-14 text-sm">{name}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-line-2">
                <span className={cx("block h-full", pct >= 90 ? "hatch bg-fg" : "bg-fg-2")} style={{ width: `${pct}%` }} />
              </span>
              <span className="mono w-28 text-right text-xs text-fg-2 tnum">
                ${(spent / 100).toFixed(2)} / ${cap / 100}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-raised px-4 py-2.5 text-xs">
        <StatusGlyph kind="paused" />
        <span className="text-fg-2">Ken is at 93% of budget and pauses automatically at 100%.</span>
      </div>
    </Frame>
  );
}

function ReadinessVisual() {
  return (
    <Frame title="integrations · readiness">
      <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
        <div className="text-md font-medium">
          5 of 6 agents can run <span className="text-fg-3">· 1 needs a fix</span>
        </div>
        <div className="flex h-1.5 w-28 gap-px">
          <span className="flex-1 bg-fg" />
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="flex-1 bg-fg-3" />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 border-b border-line bg-raised px-4 py-2.5">
        <Avatar name="Rosalind" size={20} />
        <span className="w-20 text-sm">Rosalind</span>
        <Status kind="error">Blocked</Status>
        <span className="min-w-0 flex-1 truncate text-sm">No OpenRouter credentials found</span>
        <span className="inline-flex h-6 items-center rounded-sm bg-inv px-2 text-xs text-inv-fg">Replace OpenRouter key</span>
      </div>
      {["Ada", "Linus", "Grace", "Ken"].map((n) => (
        <div key={n} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
          <Avatar name={n} size={20} />
          <span className="w-20 text-sm">{n}</span>
          <StatusGlyph kind="ok" />
          <span className="text-sm text-fg-2">Ready to work</span>
        </div>
      ))}
    </Frame>
  );
}

function LiveVisual() {
  return (
    <Frame title="live · events">
      <div className="divide-y divide-line">
        {[
          ["09:43:10", "Grace finished NWL-11"],
          ["09:43:09", "Grace moved “Add rate limiting” to in review"],
          ["09:42:51", "Ken started working on NWL-4"],
          ["09:42:40", "Linus commented on “Security review of auth flow”"],
          ["09:41:55", "Ada requested a hire: Product Designer"],
          ["09:41:06", "Ken was woken by an assignment"],
        ].map(([t, s], i) => (
          <div key={t} className={cx("flex gap-4 px-4 py-2.5 text-sm", i === 0 && "bg-raised")}>
            <span className="mono text-xs text-fg-4 tnum">{t}</span>
            <span className={i === 0 ? "text-fg" : "text-fg-2"}>{s}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function GovernVisual() {
  return (
    <Frame title="members">
      <div className="divide-y divide-line">
        {[
          ["Avery Chen", "Owner", "you"],
          ["Priya Shah", "Admin", ""],
          ["Sam Lee", "Operator", ""],
          ["Audit team", "Viewer", ""],
        ].map(([n, r, you]) => (
          <div key={n} className="flex items-center gap-3 px-4 py-3">
            <Avatar name={n} size={24} human />
            <span className="flex-1 text-sm">
              {n} {you && <span className="text-xs text-fg-4">(you)</span>}
            </span>
            <span className="rounded-xs border border-line-2 px-1.5 py-0.5 text-xs text-fg-2">{r}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-line bg-raised px-4 py-3 text-sm">
        <Avatar name="New Hire" size={22} human />
        <span className="flex-1 text-fg-2">jordan@northwind.dev requested access</span>
        <span className="inline-flex h-6 items-center rounded-sm bg-inv px-2 text-xs text-inv-fg">Approve</span>
      </div>
    </Frame>
  );
}

/* ----------------------------------------------------------- sections */

function Feature({ n, label, title, body, points, visual, flip }: { n: string; label: string; title: string; body: string; points: string[]; visual: ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-12 py-24 lg:grid-cols-2 lg:gap-20 lg:py-32">
      <Reveal className={cx(flip && "lg:order-2")}>
        <SectionLabel n={`${n}.`}>{label}</SectionLabel>
        <h3 className="max-w-md text-[30px] leading-[1.15] font-medium tracking-tight sm:text-[36px]">{title}</h3>
        <p className="mt-5 max-w-lg text-md leading-relaxed text-fg-2">{body}</p>
        <ul className="mt-7 space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-sm text-fg-2">
              <span className="mt-[7px] size-1 shrink-0 bg-fg-3" />
              {p}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={150} className={cx(flip && "lg:order-1")}>
        {visual}
      </Reveal>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-6 py-5 text-left text-md hover:text-fg" aria-expanded={open}>
        {q}
        <Plus className={cx("size-4 shrink-0 text-fg-3 transition-transform duration-500", open && "rotate-45")} />
      </button>
      <div className="grid transition-[grid-template-rows] duration-500 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <p className="max-w-2xl pb-6 text-sm leading-relaxed text-fg-3">{a}</p>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- page */

export function ProductPage() {
  useSmoothScroll();
  const [heroRef, heroP] = useScrollProgress<HTMLDivElement>();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    document.title = "agentox · The control room for your AI workforce";
    return () => {
      document.title = "agentox";
    };
  }, []);

  const cmd = "npm run server";

  return (
    <div data-theme="dark" className="min-h-full bg-canvas text-fg">
      {/* announcement */}
      <div className="dot-grid border-b border-line bg-panel">
        <button onClick={() => scrollToId("features")} className="mx-auto flex h-9 max-w-6xl items-center justify-center gap-2 px-6 text-xs text-fg-2 hover:text-fg">
          <span className="mono rounded-xs border border-line-3 px-1.5 text-2xs text-fg">New</span>
          <span className="truncate">
            <span className="sm:hidden">Live view: every agent, step by step.</span>
            <span className="max-sm:hidden">The Live view now shows what every agent is working on, step by step.</span>
          </span>
          <span className="underline decoration-line-3 underline-offset-4 max-sm:hidden">See how it works</span>
        </button>
      </div>

      {/* nav */}
      <header className={cx("sticky top-0 z-30 transition-colors duration-500", scrolled ? "border-b border-line bg-canvas/80 backdrop-blur-md" : "border-b border-transparent")}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-6">
          <button onClick={() => window.scrollTo({ top: 0 })} className="flex items-center gap-2 text-md font-medium tracking-tight">
            <Mark size={18} /> agentox
          </button>
          <nav className="hidden items-center gap-7 text-sm text-fg-2 md:flex">
            {NAV.map(([id, label]) => (
              <button key={id} onClick={() => scrollToId(id)} className="transition-colors hover:text-fg">
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-5 text-sm">
            <button onClick={() => scrollToId("how")} className="hidden text-fg-2 hover:text-fg sm:block">
              Self-host
            </button>
            <SmartLink href={appHref("/login")} className="text-fg-2 hover:text-fg">
              Sign in
            </SmartLink>
            <Btn primary to="/signup">
              Get started
            </Btn>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-16 sm:pt-32">
          <Reveal>
            <div className="mono mb-7 inline-flex items-center gap-2 rounded-full border border-line-2 bg-panel px-3 py-1 text-2xs tracking-wide text-fg-2">
              <StatusGlyph kind="live" /> Self-hosted · your infrastructure · your data
            </div>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="max-w-4xl text-[44px] leading-[1.02] font-medium tracking-[-0.03em] sm:text-[68px]">
              The control room for <br className="hidden sm:block" />
              your AI workforce.
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="mt-7 max-w-2xl text-lg leading-relaxed text-fg-2">
              Assign work to AI agents, watch them execute in real time, review what they deliver, and keep every dollar inside budget. One place for the people who are accountable for the work.
            </p>
          </Reveal>
          <Reveal delay={280}>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Btn primary size="lg" to="/signup">
                Get started <ArrowRight />
              </Btn>
              <Btn size="lg" to="/">
                Open your workspace
              </Btn>
            </div>
            <p className="mt-4 text-xs text-fg-4">Self-hosted. One command to start, on your own infrastructure.</p>
          </Reveal>
        </div>

        <div ref={heroRef} className="relative mx-auto max-w-6xl px-6 pb-24">
          <Reveal delay={380}>
            <div style={{ transform: `perspective(1600px) rotateX(${Math.max(0, 10 - heroP * 22)}deg) scale(${0.96 + Math.min(heroP, 0.5) * 0.08})`, transformOrigin: "center top", transition: "transform 0.1s linear" }}>
              <HeroPreview />
            </div>
          </Reveal>
        </div>
      </section>

      {/* runtimes */}
      <section className="border-y border-line bg-panel">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <Reveal>
            <p className="mb-7 text-center text-xs text-fg-3">Direct the agents your team already runs</p>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              {RUNTIMES.map((r) => (
                <span key={r} className="text-md font-medium tracking-tight text-fg-3 transition-colors duration-500 hover:text-fg">
                  {r}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* features */}
      <section id="features" className="mx-auto max-w-6xl px-6">
        <Feature
          n="01"
          label="Assign"
          title="Hand off work the way you would to a teammate."
          body="Write the task, set a priority and pick an agent. Before you create it, agentox tells you whether that agent will start now, after its current run, or not at all, and offers the fix. Assignment wakes the agent immediately."
          points={["A readiness check on every assignment", "List and board views, with drag to change status", "Priorities and projects carried into the agent's context"]}
          visual={<AssignVisual />}
        />
        <Feature
          n="02"
          label="Observe"
          title="Watch every agent work, as it happens."
          body="Live puts each agent on a single line: the task it is on, the step it is taking, how long it has been running and what is queued next. Open any agent to follow its transcript as it streams."
          points={["Streaming transcripts with millisecond timestamps", "A plain-language feed, with raw events one click away", "Stop any run at any moment"]}
          visual={<LiveVisual />}
          flip
        />
        <Feature
          n="03"
          label="Review"
          title="Nothing ships without your sign-off."
          body="When an agent finishes, the task moves to review and says so. Accept the work, or send it back with notes and the agent starts again. Hires, strategy changes and budget overrides wait for an operator."
          points={["Accept or request changes in a single step", "Approval gates for hiring and spend", "Comments, runs and status changes on one timeline"]}
          visual={<ReviewVisual />}
        />
        <Feature
          n="04"
          label="Control spend"
          title="Know exactly what your agents cost."
          body="Set a monthly budget for the workspace and for each agent. Spend is tracked per agent and per token, and agents pause themselves at their limit, long before an invoice surprises anyone."
          points={["Workspace and per-agent budgets", "Automatic pause at the limit", "Input, output and cached token breakdowns"]}
          visual={<SpendVisual />}
          flip
        />
        <Feature
          n="05"
          label="Connect"
          title="Fix your stack before it fails a run."
          body="Readiness checks every runtime your agents depend on and turns each failure into a one-click fix. Connect model providers, apps like GitHub, Slack and Linear, encrypted secrets and any MCP client."
          points={["Environment checks with guided fixes", "Provider keys scoped to the workspace or to you", "An MCP server and API keys for your own tooling"]}
          visual={<ReadinessVisual />}
        />
        <Feature
          n="06"
          label="Govern"
          title="Built for teams that answer to someone."
          body="Invite operators with clear roles, approve requests to join, and keep a complete record of who did what, human or agent. Everything runs on your own agentox server, so your code, prompts and data stay on your infrastructure."
          points={["Owner, admin, operator and viewer roles", "Invite links that require admin approval", "A full activity history for every workspace"]}
          visual={<GovernVisual />}
          flip
        />
      </section>

      {/* how it works */}
      <section id="how" className="border-y border-line bg-panel">
        <div className="mx-auto max-w-6xl px-6 py-28">
          <Reveal>
            <SectionLabel>How it works</SectionLabel>
            <h2 className="max-w-2xl text-[32px] leading-[1.15] font-medium tracking-tight sm:text-[40px]">From an empty server to a working team in an afternoon.</h2>
          </Reveal>
          <div className="mt-16 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
            {[
              ["01", "Connect your server", "Run one command to start the agentox server with an embedded database, then sign in."],
              ["02", "Hire your team", "Choose a runtime for each agent, decide who it reports to and give it a monthly budget."],
              ["03", "Assign and review", "Create tasks, watch the work happen in Live, and approve what is ready to ship."],
            ].map(([n, t, d], i) => (
              <div key={n} className="bg-canvas p-8">
                <Reveal delay={i * 120}>
                  <div className="mono mb-10 text-xs text-fg-4">{n}</div>
                  <div className="text-lg font-medium">{t}</div>
                  <p className="mt-2 text-sm leading-relaxed text-fg-3">{d}</p>
                </Reveal>
              </div>
            ))}
          </div>
          <Reveal delay={200}>
            <button
              onClick={() => navigator.clipboard?.writeText(cmd).then(() => toast("Copied"))}
              className="mono group mt-8 flex w-full max-w-md items-center justify-between rounded-sm border border-line-2 bg-canvas px-4 py-3 text-sm hover:border-line-3"
            >
              <span>
                <span className="text-fg-4">$ </span>
                {cmd}
              </span>
              <Copy className="size-3.5 text-fg-4 group-hover:text-fg" />
            </button>
          </Reveal>
        </div>
      </section>

      {/* capabilities */}
      <section id="capabilities" className="mx-auto max-w-6xl px-6 py-28">
        <Reveal>
          <SectionLabel>Capabilities</SectionLabel>
          <h2 className="max-w-2xl text-[32px] leading-[1.15] font-medium tracking-tight sm:text-[40px]">Everything an operator needs. Nothing they have to work around.</h2>
        </Reveal>
        <div className="mt-14 grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(([t, d], i) => (
            <Reveal key={t} delay={(i % 3) * 90} className="border-t border-line py-6">
              <div className="text-md font-medium">{t}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-3">{d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* security */}
      <section id="security" className="relative overflow-hidden border-y border-line bg-panel">
        <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_40%,transparent)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-28">
          <div className="grid gap-14 lg:grid-cols-[1fr_1.4fr]">
            <Reveal>
              <SectionLabel>Security and control</SectionLabel>
              <h2 className="text-[32px] leading-[1.15] font-medium tracking-tight sm:text-[40px]">Enterprise grade, because it runs on your infrastructure.</h2>
              <p className="mt-5 text-md leading-relaxed text-fg-2">agentox is self-hosted. The server runs on your machines and the interface talks to it directly, so the only system holding your data is the one you operate.</p>
            </Reveal>
            <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
              {[
                ["Self-hosted", "Your server, your network, your database. Nothing routes through a third party."],
                ["Role-based access", "Owners, admins, operators and viewers, each with clearly scoped permissions."],
                ["Encrypted secrets", "Write-only values, stored locally encrypted or in AWS, GCP or Vault."],
                ["Approval gates", "Hiring, strategy and budget overrides need an explicit operator decision."],
                ["Activity trail", "Every action by a person or an agent is recorded against the workspace."],
                ["Cost controls", "Budgets at the workspace and agent level, with automatic pauses."],
              ].map(([t, d], i) => (
                <div key={t} className="bg-canvas p-6">
                  <Reveal delay={(i % 2) * 100}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="size-1.5 bg-fg" /> {t}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-fg-3">{d}</p>
                  </Reveal>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* faq */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-28">
        <Reveal>
          <SectionLabel>FAQ</SectionLabel>
          <h2 className="mb-10 text-[32px] leading-[1.15] font-medium tracking-tight sm:text-[40px]">Questions, answered.</h2>
        </Reveal>
        <Reveal delay={100}>
          <div className="border-t border-line">
            {FAQ.map(([q, a]) => (
              <FaqItem key={q} q={q} a={a} />
            ))}
          </div>
        </Reveal>
      </section>

      {/* closing */}
      <section className="relative overflow-hidden border-t border-line">
        <div className="dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_65%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-36 text-center">
          <Reveal>
            <h2 className="mx-auto max-w-4xl text-[36px] leading-[1.08] font-medium tracking-[-0.03em] sm:text-[56px]">
              Put your agents to work.
              <br />
              <span className="text-fg-3">Keep your judgment in the loop.</span>
            </h2>
          </Reveal>
          <Reveal delay={150}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Btn primary size="lg" to="/signup">
                Get started <ArrowRight />
              </Btn>
              <Btn size="lg" to="/">
                Open your workspace
              </Btn>
            </div>
          </Reveal>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-md font-medium tracking-tight">
              <Mark size={16} /> agentox
            </div>
            <p className="mt-3 max-w-xs text-sm text-fg-3">The control room for your AI workforce.</p>
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="mono mb-3 text-2xs tracking-wider text-fg-4 uppercase">Product</div>
            {NAV.slice(0, 4).map(([id, label]) => (
              <button key={id} onClick={() => scrollToId(id)} className="block text-fg-2 hover:text-fg">
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-2.5 text-sm">
            <div className="mono mb-3 text-2xs tracking-wider text-fg-4 uppercase">Resources</div>
            <button onClick={() => scrollToId("how")} className="block text-fg-2 hover:text-fg">
              Self-hosting guide
            </button>
            <Link to="/design" className="block text-fg-2 hover:text-fg">
              Design system
            </Link>
            <SmartLink href={appHref("/login")} className="block text-fg-2 hover:text-fg">
              Sign in
            </SmartLink>
          </div>
        </div>
        <div className="mono mx-auto flex max-w-6xl flex-wrap justify-between gap-2 border-t border-line px-6 py-6 text-2xs text-fg-4">
          <span>© 2026 agentox</span>
          <span>Monochrome by design</span>
        </div>
      </footer>
    </div>
  );
}
