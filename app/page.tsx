import HomeClient from "@/components/HomeClient";
import { isEvalUiEnabled } from "@/lib/eval-ui/guard";

export const dynamic = "force-dynamic";

export default function Page() {
  return <HomeClient evalUiEnabled={isEvalUiEnabled()} />;
}
