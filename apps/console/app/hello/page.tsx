import { HelloPanel } from "@/components/HelloPanel";

export default function HelloPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div>
        <h1 className="font-display text-3xl font-black text-ink">Model router</h1>
        <p className="text-ink-2">
          Routes the <span className="font-mono">hello.greeting</span> prompt through LiteLLM and records
          tokens, cost and latency to the cost-tracker.
        </p>
      </div>
      <HelloPanel />
    </div>
  );
}
