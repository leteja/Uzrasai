"use client";

import { ChevronLeft, PanelLeftOpen, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type MeetingListItem, formatClock, normalizeMeetingTitle } from "@/lib/meeting";
import { cn } from "@/lib/utils";

type MeetingArchiveSidebarProps = {
  items: MeetingListItem[];
  totalCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeId?: string;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  className?: string;
  emptyMessage?: string;
};

export function filterMeetings(items: MeetingListItem[], query: string): MeetingListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  return items.filter((item) => {
    const title = normalizeMeetingTitle(item.title).toLowerCase();
    const date = new Date(item.createdAt);
    const haystack = [
      title,
      date.toLocaleDateString("lt-LT"),
      date.toLocaleString("lt-LT"),
      date.toISOString().slice(0, 10),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

function MeetingList({
  items,
  activeId,
  onSelect,
  onRemove,
  emptyMessage,
}: Pick<MeetingArchiveSidebarProps, "items" | "activeId" | "onSelect" | "onRemove" | "emptyMessage">) {
  if (items.length === 0) {
    return <p className="px-2 py-6 text-center text-xs text-muted-foreground">{emptyMessage ?? "Nerasta susitikimų."}</p>;
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex items-center gap-1 rounded-lg px-1.5 py-1",
            activeId === item.id ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted/70"
          )}
        >
          <button
            type="button"
            className="min-w-0 flex-1 px-1 py-1 text-left text-sm"
            onClick={() => onSelect(item.id)}
          >
            <span className="block truncate font-medium">{normalizeMeetingTitle(item.title)}</span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(item.createdAt).toLocaleString("lt-LT")} · {formatClock(item.durationMs)}
            </span>
          </button>
          <Button variant="ghost" size="icon-xs" onClick={() => onRemove(item.id)} aria-label="Ištrinti">
            <Trash2 />
          </Button>
        </div>
      ))}
    </div>
  );
}

export function MeetingArchiveSidebar({
  items,
  totalCount,
  open,
  onOpenChange,
  activeId,
  onSelect,
  onRemove,
  className,
  emptyMessage,
}: MeetingArchiveSidebarProps) {
  if (!open) {
    return (
      <aside className={cn("flex w-11 shrink-0 flex-col items-center border-r py-3", className)}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onOpenChange(true)}
          aria-label="Rodyti praeitus susitikimus"
          title="Praeiti susitikimai"
        >
          <PanelLeftOpen />
        </Button>
        {totalCount > 0 ? (
          <Badge variant="secondary" className="mt-2 px-1.5 text-[10px] tabular-nums">
            {totalCount}
          </Badge>
        ) : null}
        <span className="mt-4 text-[10px] tracking-wide text-muted-foreground [writing-mode:vertical-rl] rotate-180">
          Susitikimai
        </span>
      </aside>
    );
  }

  return (
    <aside className={cn("flex w-72 shrink-0 flex-col border-r", className)}>
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div>
          <p className="text-sm font-medium">Praeiti susitikimai</p>
          <p className="text-[11px] text-muted-foreground">
            {items.length} iš {totalCount} · filtras viršuje
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => onOpenChange(false)} aria-label="Suskleisti">
          <ChevronLeft />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <MeetingList
          items={items}
          activeId={activeId}
          onSelect={onSelect}
          onRemove={onRemove}
          emptyMessage={emptyMessage}
        />
      </div>
    </aside>
  );
}

export function MeetingArchivePanel({
  items,
  totalCount,
  activeId,
  onSelect,
  onRemove,
  emptyMessage,
  className,
}: Omit<MeetingArchiveSidebarProps, "open" | "onOpenChange">) {
  return (
    <div className={cn("rounded-xl border bg-card p-3", className)}>
      <p className="mb-2 text-sm font-medium">
        Praeiti susitikimai <span className="text-muted-foreground">({items.length}/{totalCount})</span>
      </p>
      <div className="max-h-56 overflow-y-auto">
        <MeetingList
          items={items}
          activeId={activeId}
          onSelect={onSelect}
          onRemove={onRemove}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  );
}
