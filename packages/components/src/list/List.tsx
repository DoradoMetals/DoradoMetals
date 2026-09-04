'use client'

import * as React from "react";
import { Check } from "@dorado/icons";
import { cn } from "../cn";

export type ListProps = {
  marker?: "bullet" | "check" | "number";
  children: React.ReactNode;
  className?: string;
};

const ListContext = React.createContext<"bullet" | "check" | "number">("bullet");

export function List({ marker = "bullet", children, className }: ListProps) {
  const Tag = marker === "number" ? "ol" : "ul";
  return (
    <ListContext.Provider value={marker}>
      <Tag className={cn("flex list-none flex-col gap-1.5", marker === "number" && "[counter-reset:item]", className)}>
        {children}
      </Tag>
    </ListContext.Provider>
  );
}

export function ListItem({ children, className }: { children: React.ReactNode; className?: string }) {
  const marker = React.useContext(ListContext);
  return (
    <li className={cn("flex items-start gap-2 text-body text-foreground", marker === "number" && "[counter-increment:item]", className)}>
      <span aria-hidden className="flex h-6 w-4 shrink-0 items-center justify-center">
        {marker === "bullet" && <span className="size-[5px] rounded-full bg-muted-foreground" />}
        {marker === "check" && <Check className="size-4 text-success" strokeWidth={2.5} />}
        {marker === "number" && (
          <span className="text-small font-medium text-muted-foreground before:content-[counter(item)'.']" />
        )}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}
