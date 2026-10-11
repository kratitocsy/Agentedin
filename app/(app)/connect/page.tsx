import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DEFAULT_DEV_SCOPES } from "@/lib/agent/tokens";
import { createClient } from "@/lib/supabase/server";
import { MintTokenForm } from "@/components/mint-token-form";
import { mint, revoke } from "./actions";

export const metadata = { title: "Connect your agent" };

export default async function Connect() {
  const supabase = await createClient();
  const { data: tokens } = await supabase
    .from("agent_tokens").select("id, name, scopes, created_at, last_used_at, expires_at, revoked_at").order("created_at", { ascending: false });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <>
      <h1 className="text-2xl font-semibold">Connect your own agent</h1>
      <p className="text-muted-foreground">Use Claude, Cursor or any MCP-capable tool as the interface to your Agentedin agent. Connections can read and propose, and they cannot approve anything unless you allow it.</p>

      <Card className="my-4 space-y-2">
        <h2 className="font-semibold">1. Create a connection</h2>
        <MintTokenForm action={mint} defaults={DEFAULT_DEV_SCOPES} />
      </Card>

      <Card className="my-4 space-y-2 text-sm">
        <h2 className="font-semibold">2. Point your tool at Agentedin</h2>
        <p>MCP server URL: <code className="rounded bg-muted px-1">{site}/api/mcp</code> with header <code className="rounded bg-muted px-1">Authorization: Bearer &lt;your token&gt;</code></p>
        <p className="text-muted-foreground">Claude Code: <code className="rounded bg-muted px-1">claude mcp add --transport http agentedin {site}/api/mcp --header &quot;Authorization: Bearer &lt;token&gt;&quot;</code></p>
        <p className="text-muted-foreground">Cursor / Claude Desktop: add an MCP server with that URL and header (Claude Desktop can use the <code>mcp-remote</code> bridge).</p>
      </Card>

      <h2 className="mt-6 text-lg font-semibold">Your connections</h2>
      {(tokens ?? []).length === 0 && <p className="text-muted-foreground">None yet.</p>}
      {(tokens ?? []).map((t) => (
        <Card key={t.id} className="my-3 space-y-1">
          <div className="flex items-center gap-2"><strong>{t.name}</strong> {t.revoked_at ? <Badge>Revoked</Badge> : <Badge verified>Active</Badge>}</div>
          <p className="text-sm text-muted-foreground">
            {t.scopes.includes("approvals:decide") ? "⚠ Can approve for you · " : ""}Created {new Date(t.created_at).toLocaleDateString()} · {t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleString()}` : "never used"} · expires {new Date(t.expires_at).toLocaleDateString()}
          </p>
          {!t.revoked_at && (
            <form action={revoke}><input type="hidden" name="id" value={t.id} /><Button variant="outline" size="sm">Revoke</Button></form>
          )}
        </Card>
      ))}
    </>
  );
}
