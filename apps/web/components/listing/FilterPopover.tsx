"use client";

import { type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  type PopoverContentProps,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FilterPopoverProps {
  children: ReactNode;
  label?: string;
  count?: number;
  buttonProps?: ButtonProps;
  contentProps?: PopoverContentProps;
}

export function FilterPopover({
  children,
  label = "Filters",
  count = 0,
  buttonProps,
  contentProps,
}: FilterPopoverProps) {
  const displayCount = count > 0 ? count : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("gap-2", buttonProps?.className)}
          {...buttonProps}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>{label}</span>
          {typeof displayCount !== "undefined" && (
            <Badge
              variant="secondary"
              className="h-5 min-w-[1.25rem] justify-center rounded-full px-1 text-[0.65rem]"
            >
              {displayCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn("w-80 space-y-4", contentProps?.className)}
        {...contentProps}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
