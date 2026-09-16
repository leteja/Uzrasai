"use client";

import { ChevronRight, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type MeetingListItem, formatClock, normalizeMeetingTitle } from "@/lib/meeting";
import { cn } from "@/lib/utils";

type MeetingArchiveSidebarProps = {
  items: MeetingListItem[];
  totalCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  query: string;
  onQueryChange: (query: string) => void;
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
    return <p className="px-2 py-8 text-center text-sm text-muted-foreground">{emptyMessage ?? "Nerasta."}</p>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex items-center gap-1 rounded-lg px-1.5 py-1.5",
            activeId === item.id ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-muted/70"
          )}
        >
          <button
            type="button"
            className="min-w-0 flex-1 px-1 py-0.5 text-left text-sm"
            onClick={() => onSelect(item.id)}
          >
            <span className="block truncate font-medium">{normalizeMeetingTitle(item.title)}</span>
            <span className="text-xs text-muted-foreground">
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
  query,
  onQueryChange,
  activeId,
  onSelect,
  onRemove,
  className,
  emptyMessage,
}: MeetingArchiveSidebarProps) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-label="Rodyti praeitus susitikimus"
        title="Praeiti susitikimai"
        className={cn(
          "sticky top-0 flex h-dvh w-12 shrink-0 cursor-pointer border-l border-border bg-muted/50 transition hover:bg-muted",
          className
        )}
      />
    );
  }

  return (
    <aside className={cn("flex w-96 shrink-0 flex-col border-l bg-background", className)}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-base font-medium">Praeiti susitikimai</p>
          <p className="text-xs text-muted-foreground">
            {items.length} iš {totalCount}
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-xs" onClick={() => onOpenChange(false)} aria-label="Suskleisti">
          <ChevronRight />
        </Button>
      </div>
      <div className="border-b px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Data ar pavadinimas…"
            className="h-9 pl-9 text-sm"
            aria-label="Ieškoti susitikimų"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
