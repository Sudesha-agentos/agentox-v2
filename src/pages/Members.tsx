import { useState } from "react";
import { Check, Link2, Plus, X } from "lucide-react";
import { api } from "@/api/client";
import { keys, useAction, useInvites, useJoinRequests, useMembers } from "@/api/hooks";
import { useAccessRequests, useDecideAccess, useGatewayConfig, type AccessRequest } from "@/api/gateway";
import type { CompanyInvite, Member } from "@/api/types";
import { useAuth } from "@/lib/auth";
import { useCompany } from "@/lib/company";
import { useCrumbs } from "@/lib/crumbs";
import { timeAgo, titleCase } from "@/lib/format";
import { toast, toastError } from "@/lib/toast";
import { Avatar, Button, Empty, ErrorBox, Field, Modal, PageHeader, Panel, PanelHeader, Segmented, Select, SkeletonRows, Table, Tag, Td, Th, Tr } from "@/components/ui";
import { CopyField } from "./Integrations";

const ROLES = [
  { value: "owner", label: "Owner", desc: "Full control, including billing and deleting the workspace." },
  { value: "admin", label: "Admin", desc: "Manage agents, members, integrations and budgets." },
  { value: "operator", label: "Operator", desc: "Assign work, approve requests and run agents." },
  { value: "viewer", label: "Viewer", desc: "Read-only access to everything." },
] as const;

const memberName = (m: Member) => m.user?.name ?? m.name ?? m.user?.email ?? m.email ?? "Member";
const memberEmail = (m: Member) => m.user?.email ?? m.email ?? null;
const memberRole = (m: Member) => m.membershipRole ?? m.role ?? "member";

function InviteModal({ cid, open, onClose }: { cid: string; open: boolean; onClose: () => void }) {
  const [role, setRole] = useState<string>("operator");
  const [created, setCreated] = useState<CompanyInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const create = useAction(() => api.post<CompanyInvite>(`/companies/${cid}/invites`, { allowedJoinTypes: "human", humanRole: role }), { invalidate: () => [keys.invites(cid)] });
  const close = () => {
    setCreated(null);
    onClose();
  };
  const url = created ? created.inviteUrl ?? `${location.origin}${created.invitePath ?? `/invite/${created.token}`}` : "";
  return (
    <Modal
      open={open}
      onClose={close}
      title={created ? "Invite link ready" : "Invite a teammate"}
      description={created ? "Send this link. They'll create an account, then you approve their request." : "Generates a single-use link that expires in 7 days."}
      footer={
        created ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setCreated(await create.mutateAsync(undefined));
                } catch (e) {
                  toastError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Create link
            </Button>
          </>
        )
      }
    >
      {created ? (
        <CopyField value={url} label="Copy invite link" />
      ) : (
        <Field label="Role">
          <div className="divide-y divide-line rounded-sm border border-line-2" role="radiogroup">
            {ROLES.filter((r) => r.value !== "owner").map((r) => (
              <button key={r.value} type="button" role="radio" aria-checked={role === r.value} onClick={() => setRole(r.value)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-hover">
                <span className={`mt-1 flex size-3 shrink-0 items-center justify-center rounded-full border ${role === r.value ? "border-fg" : "border-line-3"}`}>{role === r.value && <span className="size-1.5 rounded-full bg-fg" />}</span>
                <span>
                  <span className="block text-sm">{r.label}</span>
                  <span className="block text-xs text-fg-3">{r.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </Field>
      )}
    </Modal>
  );
}

export function MembersPage() {
  const { id: cid } = useCompany();
  useCrumbs([{ label: "Members" }], "members");
  const auth = useAuth();
  const allMembers = useMembers(cid);
  const config = useGatewayConfig();
  // The agentox system account that sets up workspaces is a member of each; people don't need to see it.
  const members = { ...allMembers, data: allMembers.data?.filter((m) => (m.userId ?? m.user?.id) !== config.data?.serviceUserId) };
  const invites = useInvites(cid);
  const requests = useJoinRequests(cid);
  const [inviting, setInviting] = useState(false);
  const [tab, setTab] = useState<"members" | "invites">("members");
  const decide = useAction((v: { id: string; action: "approve" | "reject" }) => api.post(`/companies/${cid}/join-requests/${v.id}/${v.action}`, {}), {
    invalidate: () => [keys.joinRequests(cid), keys.members(cid)],
    success: (_r, v) => (v.action === "approve" ? "Access granted" : "Request declined"),
  });
  const revoke = useAction((id: string) => api.post(`/invites/${id}/revoke`, {}), { invalidate: () => [keys.invites(cid)], success: "Invite revoked" });
  const pending = requests.data ?? [];
  const localMode = auth.mode === "local_trusted";

  return (
    <div className="max-w-4xl">
      <PageHeader index="07"
        title="Members"
        description="People who operate this workspace. Agents are managed separately."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setInviting(true)} disabled={localMode} title={localMode ? "Invites need authenticated mode" : undefined}>
            Invite
          </Button>
        }
      />
      {localMode && (
        <div className="mb-4 rounded-sm border border-line-2 px-3.5 py-2.5 text-sm text-fg-3">
          This server runs in <span className="mono text-fg-2">local_trusted</span> mode, so everyone on this machine is the operator. Switch the server to authenticated mode to add teammates.
        </div>
      )}

      <AccessRequests cid={cid} />

      {pending.length > 0 && (
        <Panel className="mb-4 overflow-hidden">
          <PanelHeader title="Requests from invite links" meta={String(pending.length)} />
          <ul className="divide-y divide-line">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                <Avatar name={r.requesterName ?? r.agentName ?? "?"} size={24} human={r.requestType !== "agent"} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{r.requesterName ?? r.agentName ?? "Unknown"}</div>
                  <div className="mono text-2xs text-fg-4">
                    {r.requesterEmail ?? r.requestType} · {timeAgo(r.createdAt)}
                  </div>
                </div>
                <Button size="xs" variant="primary" icon={<Check />} loading={decide.isPending && decide.variables?.id === r.id && decide.variables.action === "approve"} onClick={() => decide.mutate({ id: r.id, action: "approve" })}>
                  Approve
                </Button>
                <Button size="xs" variant="ghost" icon={<X />} onClick={() => decide.mutate({ id: r.id, action: "reject" })}>
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="mb-3">
        <Segmented
          value={tab}
          onChange={setTab}
          items={[
            { value: "members", label: <>Members <span className="mono text-fg-4">{members.data?.length ?? ""}</span></> },
            { value: "invites", label: <>Pending invites <span className="mono text-fg-4">{invites.data?.length ?? ""}</span></> },
          ]}
        />
      </div>

      <Panel className="overflow-hidden">
        {tab === "members" ? (
          members.isError ? (
            <div className="p-3.5">
              <ErrorBox error={members.error} onRetry={() => members.refetch()} />
            </div>
          ) : members.isPending ? (
            <SkeletonRows rows={3} />
          ) : (members.data ?? []).length === 0 ? (
            <Empty title="No members" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th align="right" className="max-sm:hidden">
                    Joined
                  </Th>
                </tr>
              </thead>
              <tbody>
                {members.data!.map((m) => {
                  const you = auth.user && (m.userId === auth.user.id || m.user?.id === auth.user.id);
                  return (
                    <Tr key={m.id}>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <Avatar name={memberName(m)} size={24} human />
                          <span>
                            <span className="block">
                              {memberName(m)} {you && <span className="text-xs text-fg-4">(you)</span>}
                            </span>
                            {memberEmail(m) && <span className="mono block text-2xs text-fg-4">{memberEmail(m)}</span>}
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <Tag>{titleCase(memberRole(m))}</Tag>
                      </Td>
                      <Td mono align="right" className="max-sm:hidden">
                        {m.createdAt ? timeAgo(m.createdAt) : "-"}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )
        ) : invites.isPending ? (
          <SkeletonRows rows={2} />
        ) : (invites.data ?? []).length === 0 ? (
          <Empty title="No pending invites" action={!localMode ? <Button icon={<Link2 />} onClick={() => setInviting(true)}>Create invite link</Button> : undefined} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Invite</Th>
                <Th>Role</Th>
                <Th align="right">Expires</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {invites.data!.map((i) => (
                <Tr key={i.id}>
                  <Td mono>{i.id.slice(0, 8)}</Td>
                  <Td>
                    <Tag>{titleCase(i.humanRole ?? i.allowedJoinTypes)}</Tag>
                  </Td>
                  <Td mono align="right">
                    {i.expiresAt ? new Date(i.expiresAt).toLocaleDateString() : "never"}
                  </Td>
                  <Td align="right">
                    <Button size="xs" variant="ghost" onClick={() => revoke.mutate(i.id)}>
                      Revoke
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      <InviteModal cid={cid} open={inviting} onClose={() => setInviting(false)} />
    </div>
  );
}

/* ----------------------------------------------- asking to join */

/** People from the workspace's email domain asking to join. Only owners and admins get any rows. */
function AccessRequests({ cid }: { cid: string }) {
  const requests = useAccessRequests(cid);
  const list = requests.data ?? [];
  if (!list.length) return null;
  return (
    <Panel className="mb-4 overflow-hidden">
      <PanelHeader title="Asking to join" meta={String(list.length)} />
      <ul className="divide-y divide-line">
        {list.map((r) => (
          <AccessRequestRow key={r.id} cid={cid} r={r} />
        ))}
      </ul>
    </Panel>
  );
}

function AccessRequestRow({ cid, r }: { cid: string; r: AccessRequest }) {
  const decide = useDecideAccess(cid);
  const [role, setRole] = useState("operator");
  const name = r.name || r.email;
  const act = async (decision: "approve" | "reject") => {
    try {
      await decide.mutateAsync({ id: r.id, decision, role });
      toast(decision === "approve" ? `${name} can now open the workspace` : "Request declined");
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
      <Avatar name={name} size={24} human />
      <div className="min-w-0 flex-1">
        <div className="text-sm">{name}</div>
        <div className="mono text-2xs text-fg-4">
          {r.email} · asked {timeAgo(r.createdAt)}
        </div>
      </div>
      <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-28" aria-label="Role">
        {ROLES.filter((x) => x.value !== "owner").map((x) => (
          <option key={x.value} value={x.value}>
            {x.label}
          </option>
        ))}
      </Select>
      <Button size="xs" variant="primary" icon={<Check />} loading={decide.isPending && decide.variables?.decision === "approve"} disabled={decide.isPending} onClick={() => act("approve")}>
        Admit
      </Button>
      <Button size="xs" variant="ghost" icon={<X />} loading={decide.isPending && decide.variables?.decision === "reject"} disabled={decide.isPending} onClick={() => act("reject")}>
        Decline
      </Button>
    </li>
  );
}
