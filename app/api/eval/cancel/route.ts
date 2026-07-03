import { isEvalUiEnabled } from "@/lib/eval-ui/guard";
import { requestCancel } from "@/lib/eval-ui/job-store";

export async function POST() {
  if (!isEvalUiEnabled()) {
    return new Response(null, { status: 404 });
  }

  return Response.json({ cancelled: requestCancel() });
}
