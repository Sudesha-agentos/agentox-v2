import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Clock, Coins, Hash, Plus, Zap } from "lucide-react";
import type { HeartbeatRunEvent } from "@/api/types";
import { Avatar, Button, Checkbox, Chip, Empty, ErrorBox, Field, Identicon, Input, Kbd, Mark, Meter, Panel, PanelHeader, Segmented, Select, Sparkline, Status, StatusGlyph, Table, Tabs, Tag, Td, Th, Tr, cx, type Glyph } from "@/components/ui";
import { IssueStatusIcon, PriorityIcon, issueStatusMeta, priorityMeta } from "@/components/status";
import { Transcript } from "@/components/Transcript";
import { useTheme } from "@/components/Layout";
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from "@/api/types";

const TOKENS: Array<[string, string, string]> = [
  ["canvas", "--canvas", "App background"],
  ["panel", "--panel", "Panels, cards, sheets"],
  ["raised", "--raised", "Menus, chips, inset rows"],
  ["hover", "--hover", "Row & control hover"],
  ["active", "--active", "Selected row, pressed"],
  ["line", "--line", "Dividers inside panels"],
  ["line-2", "--line-2", "Control borders"],
  ["line-3", "--line-3", "Emphasised borders"],
  ["fg-4", "--fg-4", "Timestamps, disabled"],
  ["fg-3", "--fg-3", "Secondary labels"],
  ["fg-2", "--fg-2", "Body copy"],
  ["fg", "--fg", "Primary text, inversion"],
];

function Section({ n, title, lede, children }: { n: string; title: string; lede: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-line py-12 lg:grid-cols-[260px_1fr]">
      <div>
        <div className="mono mb-2 text-xs text-fg-4">{n}.</div>
        <h2 className="text-lg font-medium tracking-tight">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg-3">{lede}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function Swatch({ name, cssVar, use }: { name: string; cssVar: string; use: string }) {
  const [hex, setHex] = useState("");
  useEffect(() => {
    const read = () => setHex(getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim());
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [cssVar]);
  return (
    <div className="flex items-center gap-3 border-b border-line py-2">
      <span className="size-8 shrink-0 rounded-sm border border-line-2" style={{ background: `var(${cssVar})` }} />
      <span className="min-w-0 flex-1">
        <span className="mono block text-xs">{name}</span>
        <span className="block text-2xs text-fg-3">{use}</span>
      </span>
      <span className="mono text-2xs text-fg-4 uppercase">{hex}</span>
    </div>
  );
}

const sampleEvents: HeartbeatRunEvent[] = [
  ["system", "Run started (claude_local)"],
  ["stdout", "Working on NWL-11: Add rate limiting to the notes API"],
  ["stdout", "$ npm test -- --run"],
  ["stdout", "✓ 18 passed (2.1s)"],
  ["stderr", "warning: rate limiter falls back to in-memory store"],
  ["system", "Run finished successfully"],
].map(([stream, message], i) => ({ id: i, runId: "r", seq: i, eventType: "log", stream: stream as "system", level: stream === "stderr" ? "error" : "info", message, createdAt: new Date(Date.now() - (6 - i) * 1300).toISOString() }));

export function DesignPage() {
  const [theme, toggle] = useTheme();
  const [seg, setSeg] = useState("all");
  const [tab, setTab] = useState("overview");
  const [check, setCheck] = useState(true);
  const glyphs: Array<[Glyph, string, string]> = [
    ["live", "Live", "Running now. The only element that animates."],
    ["ok", "OK", "Healthy, succeeded, connected."],
    ["idle", "Idle", "Available, waiting."],
    ["queued", "Queued", "Scheduled or pending a decision."],
    ["paused", "Paused", "Deliberately stopped; warnings."],
    ["error", "Error", "Failed. Rendered inverted: the loudest state."],
    ["off", "Off", "Terminated, cancelled, revoked."],
  ];

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-line bg-canvas/90 px-6 backdrop-blur">
        <Link to="/" className="flex items-center gap-2 text-sm font-medium tracking-tight">
          <Mark size={16} /> agentox
        </Link>
        <span className="text-fg-4">/</span>
        <span className="text-sm text-fg-2">Design system</span>
        <Button size="xs" variant="ghost" className="ml-auto" onClick={toggle}>
          {theme === "dark" ? "Light" : "Dark"} theme
        </Button>
      </header>

      <div className="mx-auto max-w-6xl px-6">
        <div className="dot-grid -mx-6 border-b border-line px-6 py-20">
          <div className="mono mb-4 text-xs text-fg-4">v1 · monochrome</div>
          <h1 className="max-w-2xl text-[40px] leading-[1.05] font-medium tracking-tight">
            An instrument panel
            <br />
            <span className="text-fg-3">for a company of agents.</span>
          </h1>
          <p className="mt-6 max-w-xl text-md leading-relaxed text-fg-2">
            One grayscale ramp, two typefaces, and a handful of glyphs. Colour is reserved for nothing, so attention goes where the shapes and inversions put it.
          </p>
        </div>

        <Section n="01" title="Principles" lede="What every screen is held to.">
          <ol className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2">
            {[
              ["Monochrome, always", "No hue carries meaning. Status is shape, weight and inversion, so it holds up for every kind of colour vision and on any display."],
              ["Data is monospaced", "IDs, durations, tokens, money and timestamps use Geist Mono with tabular figures, so columns line up and values can be compared at a glance."],
              ["Dense, then calm", "36px rows, 13px type and hairline borders fit a lot on screen. Generous section spacing stops it feeling cramped."],
              ["One thing moves", "Only live work animates. If something blinks, an agent is running right now."],
              ["Inversion is the alarm", "Errors and primary actions are inverted (light on dark). Use it sparingly or it stops meaning anything."],
              ["Say what happens", "Labels state consequences: “Terminate” and not “Remove”, “Start heartbeat” and not “Submit”."],
            ].map(([t, d], i) => (
              <li key={t} className="bg-panel p-4">
                <div className="mono mb-2 text-2xs text-fg-4">0{i + 1}</div>
                <div className="text-sm font-medium">{t}</div>
                <p className="mt-1 text-xs leading-relaxed text-fg-3">{d}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section n="02" title="Color" lede="Twelve steps from canvas to ink. Surfaces climb as they come forward; text descends as it recedes. Values flip per theme; names don't.">
          <div className="grid gap-x-8 sm:grid-cols-2">
            {TOKENS.map(([n, v, u]) => (
              <Swatch key={n} name={n} cssVar={v} use={u} />
            ))}
          </div>
        </Section>

        <Section n="03" title="Typography" lede="Geist for interface, Geist Mono for data. Two weights only: 400 and 500.">
          <div className="divide-y divide-line">
            {[
              ["2xl / 26", "text-2xl font-medium tracking-tight", "Metric value"],
              ["xl / 20", "text-xl font-medium tracking-tight", "Page title"],
              ["md / 14", "text-md", "Long-form reading, descriptions"],
              ["base / 13", "text-base", "Default interface text"],
              ["sm / 12.5", "text-sm", "Table cells, controls"],
              ["xs / 11.5", "text-xs text-fg-3", "Secondary labels, hints"],
              ["mono 2xs / 10.5", "mono text-2xs tracking-wider uppercase text-fg-4", "Eyebrows · section labels"],
            ].map(([k, cls, sample]) => (
              <div key={k} className="flex items-baseline gap-6 py-3">
                <span className="mono w-28 shrink-0 text-2xs text-fg-4">{k}</span>
                <span className={cls}>{sample}</span>
              </div>
            ))}
            <div className="flex items-baseline gap-6 py-3">
              <span className="mono w-28 shrink-0 text-2xs text-fg-4">mono data</span>
              <span className="mono text-sm tnum">7a3f19c2 · 00:02:41 · 18.4K tok · $0.0086</span>
            </div>
          </div>
        </Section>

        <Section n="04" title="Status" lede="Seven glyphs cover every state in the product: agents, runs, approvals, connections. Each has a distinct silhouette.">
          <div className="divide-y divide-line rounded-md border border-line">
            {glyphs.map(([g, label, d]) => (
              <div key={g} className="flex items-center gap-4 px-4 py-3">
                <span className="flex w-6 justify-center">
                  <StatusGlyph kind={g} />
                </span>
                <span className="w-32">
                  <Status kind={g}>{label}</Status>
                </span>
                <span className="text-xs text-fg-3">{d}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <div className="mono mb-2 text-2xs tracking-wider text-fg-4 uppercase">Task progress</div>
              <div className="space-y-2">
                {ISSUE_STATUSES.map((s) => (
                  <div key={s} className="flex items-center gap-2.5 text-sm text-fg-2">
                    <IssueStatusIcon status={s} /> {issueStatusMeta[s].label}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mono mb-2 text-2xs tracking-wider text-fg-4 uppercase">Priority</div>
              <div className="space-y-2">
                {ISSUE_PRIORITIES.map((p) => (
                  <div key={p} className="flex items-center gap-2.5 text-sm text-fg-2">
                    <PriorityIcon priority={p} /> {priorityMeta[p].label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section n="05" title="Controls" lede="Buttons get 4px corners. Primary is inverted; destructive is an outline that inverts on hover, so the moment of commitment is unmistakable.">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={<Plus />}>
                Primary
              </Button>
              <Button>Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Terminate</Button>
              <Button variant="primary" loading>
                Loading
              </Button>
              <Button disabled>Disabled</Button>
              <Button variant="primary" kbd="C" icon={<Plus />}>
                With shortcut
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="xs">xs · 24</Button>
              <Button size="sm">sm · 28</Button>
              <Button size="md">md · 32</Button>
            </div>
            <div className="grid max-w-xl gap-3 sm:grid-cols-2">
              <Field label="Input" hint="Hint text explains consequences.">
                <Input placeholder="Placeholder" />
              </Field>
              <Field label="Select">
                <Select>
                  <option>Claude Code</option>
                  <option>Codex</option>
                </Select>
              </Field>
              <Field label="Error state" error="Use at least 8 characters.">
                <Input defaultValue="short" className="border-fg-3" />
              </Field>
              <Field label="Monospace input">
                <Input defaultValue="~/code/northwind" className="mono text-xs" />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Segmented value={seg} onChange={setSeg} items={[{ value: "all", label: "All" }, { value: "running", label: "Running" }, { value: "error", label: "Error" }]} />
              <Checkbox checked={check} onChange={setCheck} label="Checkbox" />
              <span className="flex items-center gap-1">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </div>
            <Tabs value={tab} onChange={setTab} items={[{ value: "overview", label: "Overview" }, { value: "runs", label: "Runs", count: 42 }, { value: "config", label: "Configuration" }]} />
          </div>
        </Section>

        <Section n="06" title="Data" lede="Metric chips, tags, meters and avatars. Agents are square, humans are round.">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip icon={<Clock />}>7.18s</Chip>
              <Chip icon={<Hash />}>6.1K</Chip>
              <Chip icon={<Coins />}>0.0086</Chip>
              <Chip icon={<Zap />}>on demand</Chip>
              <Tag>claude_local</Tag>
              <Tag>default</Tag>
            </div>
            <div className="grid max-w-md gap-3">
              {[20, 64, 93].map((v) => (
                <div key={v} className="flex items-center gap-3">
                  <Meter value={v} max={100} />
                  <span className="mono w-10 text-right text-xs text-fg-3">{v}%</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Avatar name="Ada" size={32} />
              <Avatar name="Linus Torvalds" size={24} />
              <Avatar name="Grace" size={18} />
              <span className="mx-2 h-6 w-px bg-line-2" />
              <Avatar name="Priya Shah" size={32} human />
              <Avatar name="Sam Lee" size={24} human />
            </div>
          </div>
        </Section>

        <Section n="07" title="Surfaces" lede="Panels with hairline borders and no decorative shadow. Shadows are only for things that float: menus, modals, sheets.">
          <div className="space-y-4">
            <Panel className="overflow-hidden">
              <PanelHeader title="Recent runs" meta="3" action={<Button size="xs" variant="ghost">View all</Button>} />
              <Table>
                <thead>
                  <tr>
                    <Th>Agent</Th>
                    <Th>Status</Th>
                    <Th align="right">Duration</Th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Grace", "live", "Running", "0:41"],
                    ["Ken", "ok", "Succeeded", "3:12"],
                    ["Rosalind", "error", "Failed", "0:07"],
                  ].map(([n, g, l, d]) => (
                    <Tr key={n} onClick={() => {}}>
                      <Td>
                        <span className="flex items-center gap-2">
                          <Avatar name={n} size={18} />
                          {n}
                        </span>
                      </Td>
                      <Td>
                        <Status kind={g as Glyph}>{l}</Status>
                      </Td>
                      <Td mono align="right">
                        {d}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Panel>
            <div className="grid gap-4 sm:grid-cols-2">
              <Panel>
                <Empty title="Empty state" body="Dot grid, one sentence on what goes here, one action." action={<Button size="xs">Action</Button>} />
              </Panel>
              <div className="space-y-3">
                <ErrorBox error={new Error("Can't reach the agentox server")} onRetry={() => {}} />
                <div className="flex items-start gap-3 rounded-sm bg-inv px-3.5 py-3 text-sm text-inv-fg">
                  <span className="mt-1.5 size-2 shrink-0 rotate-45 bg-inv-fg" />
                  <div>
                    <div className="font-medium">Agent halted on error</div>
                    <div className="mono mt-0.5 text-xs opacity-80">exit 1: missing OPENROUTER_API_KEY</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section n="08" title="Transcript" lede="How agent output reads: wall-clock time to the millisecond, a marker for the kind of line, monospaced content. Errors are the only rows with a fill.">
          <Panel className="overflow-hidden">
            <Transcript events={sampleEvents} active className="h-56" />
          </Panel>
        </Section>

        <Section n="09" title="Patterns" lede="Texture without colour. Each pattern has one job, so the interface stays calm: grids locate, dither and hatch encode outcomes, segments measure, and only live work moves.">
          <div className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Identicon", "A unique mark per agent, from its name.", <div className="flex gap-2">{["Ada", "Linus", "Grace", "Ken", "Mae"].map((n) => <Identicon key={n} seed={n} size={28} />)}</div>],
              ["Graph paper", "Behind every page header, fading out.", <div className="grid-paper h-14 w-full rounded-xs border border-line" />],
              ["Crop marks", "Corner ticks on panels, like a drawing.", <div className="ticks h-14 w-full rounded-xs border border-line" />],
              ["Halftone", "Section bands and decorative rules.", <div className="halftone h-14 w-full" />],
              ["Dither and hatch", "Succeeded runs dither; failures hatch.", <div className="flex h-14 w-full items-end gap-1">{[60, 85, 40, 100, 70].map((h, i) => <div key={i} className="flex flex-1 flex-col" style={{ height: `${h}%` }}>{i === 2 && <div className="hatch h-1/3 bg-fg" />}<div className="dither flex-1 border-t border-fg-3" /></div>)}</div>],
              ["Segments", "Budgets read like an instrument.", <div className="w-full space-y-2.5"><Meter value={35} max={100} /><Meter value={93} max={100} /></div>],
              ["Sparkline", "Trend at a glance in metric strips.", <Sparkline values={[3, 5, 4, 7, 6, 9, 8, 11, 9, 12]} className="w-full" height={40} />],
              ["Sweep", "Only on work that is running now.", <div className="sweep flex h-14 w-full items-center gap-2 rounded-xs border border-line px-3 text-xs"><StatusGlyph kind="live" /> Grace is working</div>],
              ["Empty mark", "Generative, so empty states differ.", <div className="flex h-14 items-center"><svg width="44" height="44" viewBox="0 0 56 56" className="text-line-3">{[4, 10, 16, 22].map((inset, i) => <rect key={i} x={inset} y={inset} width={56 - inset * 2} height={56 - inset * 2} fill="none" stroke="currentColor" strokeDasharray={i % 2 ? "2 2" : undefined} />)}<rect x="26" y="26" width="4" height="4" fill="var(--fg-3)" /></svg></div>],
            ].map(([t, d, demo]) => (
              <div key={t as string} className="bg-panel p-4">
                <div className="flex h-16 items-center">{demo as ReactNode}</div>
                <div className="mt-3 text-sm font-medium">{t as string}</div>
                <p className="mt-0.5 text-xs text-fg-3">{d as string}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section n="10" title="Spacing & shape" lede="A 4px base. Radii stay small so the interface reads as a tool, not a toy.">
          <div className="flex flex-wrap items-end gap-6">
            {[
              ["xs · 3", "rounded-xs"],
              ["sm · 4", "rounded-sm"],
              ["md · 6", "rounded-md"],
              ["lg · 8", "rounded-lg"],
            ].map(([k, c]) => (
              <div key={k} className="text-center">
                <div className={cx("size-14 border border-line-3 bg-raised", c)} />
                <div className="mono mt-2 text-2xs text-fg-4">{k}</div>
              </div>
            ))}
            <span className="mx-2 h-14 w-px bg-line-2" />
            {[4, 8, 12, 16, 24, 32].map((s) => (
              <div key={s} className="text-center">
                <div className="bg-fg-3" style={{ width: s, height: s }} />
                <div className="mono mt-2 text-2xs text-fg-4">{s}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <footer className="mono border-t border-line px-6 py-6 text-center text-2xs text-fg-4">agentox design system · tokens live in src/index.css · components in src/components/ui.tsx</footer>
    </div>
  );
}
