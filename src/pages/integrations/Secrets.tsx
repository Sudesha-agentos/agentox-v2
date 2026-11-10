import { useState } from "react";
import { KeyRound, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/api/client";
import { keys, useAction, useSecrets } from "@/api/hooks";
import { timeAgo } from "@/lib/format";
import { Button, Empty, ErrorBox, Field, IconButton, Input, Modal, Panel, PanelHeader, SkeletonRows, Table, Td, Textarea, Th, Tr } from "@/components/ui";

function AddSecretModal({ cid, open, onClose }: { cid: string; open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const derived = (key || name).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  const add = useAction(() => api.post(`/companies/${cid}/secrets`, { name: name.trim(), key: derived, value, description: description.trim() || undefined }), { invalidate: () => [keys.secrets(cid)], success: "Secret stored" });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New secret"
      description="Encrypted at rest. Agents receive it as an environment variable; nobody can read it back here."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={add.isPending}
            disabled={!name.trim() || !value}
            onClick={() =>
              add.mutateAsync(undefined).then(() => {
                setName("");
                setKey("");
                setValue("");
                setDescription("");
                onClose();
              }, () => {})
            }
          >
            Store secret
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Stripe secret key" />
        </Field>
        <Field label="Env var" hint={derived ? <span className="mono">${derived}</span> : undefined}>
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder={derived || "STRIPE_SECRET_KEY"} className="mono text-xs" />
        </Field>
      </div>
      <Field label="Value">
        <Textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} className="mono text-xs" spellCheck={false} autoComplete="off" />
      </Field>
      <Field label="Description (optional)">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Used by the billing agent" />
      </Field>
    </Modal>
  );
}

export function SecretsTab({ cid }: { cid: string }) {
  const secrets = useSecrets(cid);
  const [adding, setAdding] = useState(false);
  const del = useAction((id: string) => api.del(`/secrets/${id}`), { invalidate: () => [keys.secrets(cid)], success: "Secret deleted" });
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = (secrets.data ?? []).filter((s) => !needle || s.key.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle));
  return (
    <>
      <p className="mb-3 max-w-2xl text-sm text-fg-3">Credentials your agents need (API tokens, database URLs). Values are encrypted and write-only; agents receive them as environment variables.</p>
      <Panel className="overflow-hidden">
        <PanelHeader
          title="Secrets"
          meta={String(secrets.data?.length ?? "")}
          action={
            <>
              <span className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-fg-4" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" className="h-6 w-36 pl-6 text-xs" />
              </span>
              <Button size="xs" variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>
                New secret
              </Button>
            </>
          }
        />
        {secrets.isError ? (
          <div className="p-3.5">
            <ErrorBox error={secrets.error} onRetry={() => secrets.refetch()} />
          </div>
        ) : secrets.isPending ? (
          <SkeletonRows rows={3} />
        ) : list.length === 0 ? (
          <Empty title="No secrets" body="Store API tokens and credentials your agents need. Values are write-only." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Key</Th>
                <Th className="max-md:hidden">Name</Th>
                <Th align="right" className="max-sm:hidden">
                  Version
                </Th>
                <Th align="right" className="max-sm:hidden">
                  Used by
                </Th>
                <Th align="right" className="max-md:hidden">
                  Rotated
                </Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <span className="mono flex items-center gap-2 text-xs">
                      <KeyRound className="size-3 text-fg-4" />
                      {s.key}
                    </span>
                  </Td>
                  <Td className="text-fg-2 max-md:hidden">
                    {s.name}
                    {s.description && <div className="text-2xs text-fg-4">{s.description}</div>}
                  </Td>
                  <Td mono align="right" className="max-sm:hidden">
                    v{s.latestVersion ?? 1}
                  </Td>
                  <Td mono align="right" className="max-sm:hidden">
                    {s.referenceCount ?? 0}
                  </Td>
                  <Td mono align="right" className="max-md:hidden">
                    {s.lastRotatedAt ? timeAgo(s.lastRotatedAt) : "never"}
                  </Td>
                  <Td align="right">
                    <IconButton label={`Delete ${s.key}`} size="xs" onClick={() => confirm(`Delete ${s.key}? Agents referencing it will fail until it's replaced.`) && del.mutate(s.id)}>
                      <Trash2 />
                    </IconButton>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      <AddSecretModal cid={cid} open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
