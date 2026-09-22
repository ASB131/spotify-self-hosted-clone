import { Suspense } from "react";
import SetupGuideContent from "./SetupGuideContent";

export default function SetupGuidePage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted">Loading setup guide…</div>}>
      <SetupGuideContent />
    </Suspense>
  );
}
