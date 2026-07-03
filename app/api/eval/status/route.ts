import { isEvalUiEnabled } from "@/lib/eval-ui/guard";
import { getCurrentJob } from "@/lib/eval-ui/job-store";

export async function GET() {
  if (!isEvalUiEnabled()) {
    return new Response(null, { status: 404 });
  }

  return Response.json(getCurrentJob());
}
