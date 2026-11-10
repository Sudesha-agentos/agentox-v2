import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button, IconButton } from "@/components/ui";

export function CopyField({ value, secret, label }: { value: string; secret?: boolean; label?: string }) {
  const [shown, setShown] = useState(!secret);
  return (
    <div className="flex items-center gap-1 rounded-sm border border-line-2 bg-canvas pr-1 pl-3">
      <span className="mono min-w-0 flex-1 truncate py-2 text-xs" title={shown ? value : undefined}>
        {shown ? value : "•".repeat(Math.min(32, value.length))}
      </span>
      {secret && (
        <Button size="xs" variant="ghost" onClick={() => setShown((s) => !s)}>
          {shown ? "Hide" : "Reveal"}
        </Button>
      )}
      <IconButton label={label ?? "Copy"} size="xs" onClick={() => navigator.clipboard?.writeText(value).then(() => toast("Copied to clipboard"))}>
        <Copy />
      </IconButton>
    </div>
  );
}

export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="group relative">
      <pre className="mono overflow-x-auto rounded-sm border border-line bg-canvas p-3 text-xs leading-relaxed text-fg-2">{code}</pre>
      <IconButton label="Copy snippet" size="xs" className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100" onClick={() => navigator.clipboard?.writeText(code).then(() => toast("Copied"))}>
        <Copy />
      </IconButton>
    </div>
  );
}
