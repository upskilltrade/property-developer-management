import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  body,
  action,
  icon = <Inbox />,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-full bg-slate-100 text-faint [&_svg]:size-5">
        {icon}
      </div>
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-2xs text-muted">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
