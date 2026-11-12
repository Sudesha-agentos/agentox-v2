import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { useCliCode } from "@/api/gateway";
import { keys, useAction, useApiKeys } from "@/api/hooks";
import { api } from "@/api/client";
import { authErrorMessage } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { toast } from "@/lib/toast";
import { Button, Modal, Spinner } from "./ui";

/**
 * "Run in terminal": a one-time code wrapped in a single command. Pasting it installs the
 * `agentox` command and signs it in as the current person. The code works once, for 10 minutes.
 */
export function TerminalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const issue = useCliCode();
  const [now, setNow] = useState(Date.now());
  const sessions = useApiKeys();
  const revoke = useAction((id: string) => api.del(`/board-api-keys/${id}`), { invalidate: () => [keys.apiKeys], success: "Terminal signed out" });

  useEffect(() => {
    if (open && !issue.data && !issue.isPending) issue.mutate(undefined, { onSettled: () => sessions.refetch() });
    if (!open) issue.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  const left = issue.data ? Math.max(0, Math.floor((new Date(issue.data.expiresAt).getTime() - now) / 1000)) : 0;
  const expired = !!issue.data && left === 0;
  const terminals = (sessions.data ?? []).filter((k) => !k.revokedAt && k.name.startsWith("Terminal"));

  return (
    <Modal open={open} onClose={onClose} title="Run in terminal" description="Use agentox from your shell: create tasks, check runs and talk to agents without the browser." size="md">
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-sm text-fg-2">Paste this into your terminal:</div>
          {issue.isPending ? (
            <div className="flex h-10 items-center gap-2 rounded-sm border border-line-2 bg-panel px-3 text-xs text-fg-3">
              <Spinner className="size-2.5" /> Creating a sign-in code…
            </div>
          ) : issue.isError ? (
            <div className="rounded-sm border border-line-3 bg-raised px-3 py-2.5 text-sm">{authErrorMessage(issue.error)}</div>
          ) : issue.data ? (
            <button
              type="button"
              disabled={expired}
              onClick={() => navigator.clipboard?.writeText(issue.data!.command).then(() => toast("Command copied"))}
              className="mono group flex w-full items-start justify-between gap-3 rounded-sm border border-line-2 bg-panel px-3 py-2.5 text-left text-xs hover:border-line-3 disabled:opacity-40"
            >
              <span className="break-all">
                <span className="text-fg-4">$ </span>
                {issue.data.command}
              </span>
              <Copy className="mt-0.5 size-3.5 shrink-0 text-fg-4 group-hover:text-fg-2" />
            </button>
          ) : null}
          <div className="mt-2 flex items-center justify-between text-xs text-fg-3">
            {issue.data && !expired ? (
              <span className="tnum">
                Code <span className="mono text-fg-2">{issue.data.code}</span> works once, for {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </span>
            ) : (
              <span>{expired ? "This code expired." : ""}</span>
            )}
            {(expired || issue.isError) && (
              <Button size="xs" icon={<RefreshCw />} onClick={() => issue.mutate()}>
                New code
              </Button>
            )}
          </div>
        </div>

        <ul className="space-y-1.5 text-xs text-fg-3">
          <li>It installs the <span className="mono text-fg-2">agentox</span> command and signs it in as you. Needs Node.js 20 or newer.</li>
          <li>
            Then try <span className="mono text-fg-2">agentox issue list</span>. Already installed? Run <span className="mono text-fg-2">agentox auth login</span> and approve in the browser.
          </li>
        </ul>

        {terminals.length > 0 && (
          <div>
            <div className="mono mb-2 text-2xs tracking-wider text-fg-4 uppercase">Signed-in terminals</div>
            <ul className="divide-y divide-line rounded-sm border border-line-2">
              {terminals.map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fg-2">{k.name}</span>
                    <span className="text-fg-4">{k.lastUsedAt ? `Last used ${timeAgo(k.lastUsedAt)}` : "Not used yet"}</span>
                  </span>
                  <Button size="xs" variant="ghost" loading={revoke.isPending && revoke.variables === k.id} onClick={() => revoke.mutate(k.id)}>
                    Sign out
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
