import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus } from "lucide-react";
import { api } from "@/api/client";
import { keys, useAction, useApiKeys, useMcpConnections, useMcpSetup } from "@/api/hooks";
import type { BoardApiKey } from "@/api/types";
import { timeAgo } from "@/lib/format";
import { toastError } from "@/lib/toast";
import { Button, ErrorBox, Eyebrow, Field, Input, Modal, Panel, PanelHeader, SkeletonRows, Table, Td, Th, Tr } from "@/components/ui";
import { CodeBlock, CopyField } from "./shared";

export function DeveloperTab() {
  const apiKeys = useApiKeys();
  const mcp = useMcpSetup();
  const mcpConns = useMcpConnections();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<BoardApiKey | null>(null);
  const [busy, setBusy] = useState(false);
  const revoke = useAction((id: string) => api.del(`/board-api-keys/${id}`), { invalidate: () => [keys.apiKeys], success: "Key revoked" });
  const revokeMcp = useAction((id: string) => api.del(`/mcp/connections/${id}`), { invalidate: () => [keys.mcpConnections], success: "Client disconnected" });
  const base = `${location.origin}/api`;
  const mcpUrl = mcp.data?.serverUrl ?? null;

  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden">
        <PanelHeader
          title="API keys"
          meta="personal"
          action={
            <Button size="xs" variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
              Create key
            </Button>
          }
        />
        {apiKeys.isError ? (
          <div className="p-3.5">
            <ErrorBox error={apiKeys.error} onRetry={() => apiKeys.refetch()} />
          </div>
        ) : apiKeys.isPending ? (
          <SkeletonRows rows={2} />
        ) : (apiKeys.data ?? []).length === 0 ? (
          <div className="px-3.5 py-5 text-sm text-fg-3">No keys yet. Keys act as you, for scripts, CI and the CLI.</div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th align="right">Created</Th>
                <Th align="right">Last used</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {apiKeys.data!.map((k) => (
                <Tr key={k.id}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <KeyRound className="size-3 text-fg-4" />
                      {k.name}
                    </span>
                  </Td>
                  <Td mono align="right">
                    {timeAgo(k.createdAt)}
                  </Td>
                  <Td mono align="right">
                    {k.lastUsedAt ? timeAgo(k.lastUsedAt) : "never"}
                  </Td>
                  <Td align="right">
                    <Button size="xs" variant="ghost" onClick={() => confirm(`Revoke “${k.name}”? Anything using it stops working.`) && revoke.mutate(k.id)}>
                      Revoke
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="border-t border-line p-3.5">
          <Eyebrow>Quickstart</Eyebrow>
          <CodeBlock code={`curl ${base}/companies \\\n  -H "Authorization: Bearer $AGENTOX_API_KEY"`} />
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader title="MCP server" meta={mcp.data?.enabled === false ? "disabled" : "oauth"} />
        <div className="space-y-3 p-3.5">
          <p className="text-sm text-fg-3">Let Claude, Cursor or any MCP client read and act on this workspace. Clients sign in with OAuth on first use.</p>
          {mcpUrl ? (
            <>
              <Field label="Server URL">
                <CopyField value={mcpUrl} />
              </Field>
              <CodeBlock code={JSON.stringify({ mcpServers: { agentox: { url: mcpUrl } } }, null, 2)} />
            </>
          ) : (
            <div className="rounded-sm border border-dashed border-line-3 px-3 py-2.5 text-sm text-fg-3">{mcp.isPending ? "Loading…" : "MCP isn't enabled on this server."}</div>
          )}
        </div>
        <div className="border-t border-line">
          <div className="mono flex h-8 items-center px-3.5 text-2xs tracking-wider text-fg-4 uppercase">Connected clients</div>
          {mcpConns.isPending ? (
            <SkeletonRows rows={1} />
          ) : (mcpConns.data ?? []).length === 0 ? (
            <div className="px-3.5 pb-4 text-sm text-fg-3">No clients connected.</div>
          ) : (
            <Table>
              <tbody>
                {mcpConns.data!.map((c) => (
                  <Tr key={c.id}>
                    <Td>{c.clientName ?? "MCP client"}</Td>
                    <Td mono className="max-md:hidden">
                      {Array.isArray(c.scopes) ? c.scopes.join(" ") : c.scopes ?? ""}
                    </Td>
                    <Td mono align="right">
                      {timeAgo(c.createdAt)}
                    </Td>
                    <Td align="right">
                      <Button size="xs" variant="ghost" onClick={() => revokeMcp.mutate(c.id)}>
                        Disconnect
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Panel>

      <Modal
        open={creating}
        onClose={() => {
          setCreating(false);
          setNewKey(null);
          setKeyName("");
        }}
        title={newKey ? "Copy your key" : "Create API key"}
        description={newKey ? "This is the only time the full key is shown. Store it somewhere safe." : "The key acts with your permissions across every workspace you belong to."}
        footer={
          newKey ? (
            <Button
              variant="primary"
              onClick={() => {
                setCreating(false);
                setNewKey(null);
                setKeyName("");
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const k = await api.post<BoardApiKey>("/board-api-keys", { name: keyName.trim() || undefined });
                    setNewKey(k);
                    qc.invalidateQueries({ queryKey: keys.apiKeys });
                  } catch (e) {
                    toastError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Create key
              </Button>
            </>
          )
        }
      >
        {newKey ? (
          <CopyField value={newKey.token ?? ""} label="Copy key" />
        ) : (
          <Field label="Name">
            <Input autoFocus value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="ci-deploy" />
          </Field>
        )}
      </Modal>
    </div>
  );
}
