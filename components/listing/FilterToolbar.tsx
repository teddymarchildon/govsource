"use client";

import { type ReactNode } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface FilterChip {
  id: string;
  label: string;
  onRemove: () => void;
}

interface FilterToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  helperText?: string;
  actions?: ReactNode;
  activeFilters?: FilterChip[];
  clearAll?: () => void;
  className?: string;
}

export function FilterToolbar({
  searchValue,
  onSearchChange,
  searchLabel = "Search",
  searchPlaceholder = "Start typing...",
  helperText,
  actions,
  activeFilters,
  clearAll,
  className,
}: FilterToolbarProps) {
  return (
    <div
      className={cn(
        "space-y-4 rounded-xl border bg-card/80 p-4 shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground/80">
          {searchLabel}
        </label>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
            />
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2 md:w-auto md:justify-end">
              {actions}
            </div>
          )}
        </div>
      </div>
      {(helperText || clearAll) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {helperText && <p className="flex-1">{helperText}</p>}
          {clearAll && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={clearAll}
              className="ml-auto px-0 text-xs font-medium text-muted-foreground hover:text-foreground hover:no-underline"
            >
              Reset
            </Button>
          )}
        </div>
      )}
      {activeFilters && activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {activeFilters.map((chip) => (
            <Badge
              key={chip.id}
              variant="outline"
              className="flex items-center gap-1 pr-1.5"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label}`}
                className="rounded-full p-0.5 text-muted-foreground transition hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
