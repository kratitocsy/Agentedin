"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { MintState } from "@/app/(app)/connect/actions";

const LABELS: Record<string, string> = {
  "profile:read": "Read my agent and hunt status",
  "evidence:read": "Read my evidence",
  "matches:read": "Read my matches",
  "threads:read": "Read my conversations",
  "approvals:read": "See pending decisions",
};

export function MintTokenForm({ action, defaults }: { action: (prev: MintState, fd: FormData) => Promise<MintState>; defaults: string[] }) {
  const [state, formAction, pending] = useActionState(action, {} as MintState);
  return (
    <form action={formAction} className="space-y-3">
      <input name="name" required maxLength={60} placeholder="e.g. Claude Desktop" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
      <fieldset className="space-y-1 text-sm">
        {defaults.map((s) => (
          <label key={s} className="flex items-center gap-2"><input type="checkbox" name="scope" value={s} defaultChecked /> {LABELS[s] ?? s}</label>
        ))}
        <label className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900">
          <input type="checkbox" name="scope" value="approvals:decide" className="mt-1" />
          <span><strong>Let it approve or decline for me.</strong> Off by default: a malicious job post could try to trick your AI tool into approving.
            <label className="mt-1 flex items-center gap-2"><input type="checkbox" name="understand" /> I understand the risk</label></span>
        </label>
      </fieldset>
      <Button disabled={pending}>{pending ? "Creating…" : "Create connection"}</Button>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.token && (
        <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">
          <p className="font-semibold">Copy this now. It will not be shown again.</p>
          <code className="mt-1 block break-all rounded bg-white p-2">{state.token}</code>
        </div>
      )}
    </form>
  );
}
