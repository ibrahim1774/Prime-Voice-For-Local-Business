import { NextRequest } from "next/server";
import { buildIcs, getSetupCallByToken } from "@/lib/setupCalls";

// Downloadable invite for the /c/<token> page — the route Apple Calendar and
// Outlook users tap. Public by unguessable token, like the page.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const row = await getSetupCallByToken(token);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(buildIcs(row), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=REQUEST",
      "Content-Disposition": 'attachment; filename="montivaro-setup-call.ics"',
      "Cache-Control": "no-store",
    },
  });
}
