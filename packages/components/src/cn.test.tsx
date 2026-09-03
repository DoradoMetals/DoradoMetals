import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn is the TAUGHT merge, not stock twMerge", () => {
  it("a text colour does not delete a semantic size", () => {
    expect(cn("text-small", "text-primary-foreground")).toBe(
      "text-small text-primary-foreground",
    );
  });
  it("a semantic size does not delete a text colour", () => {
    expect(cn("text-foreground", "text-small")).toBe("text-foreground text-small");
  });
  it("two sizes still merge to the later one", () => {
    expect(cn("text-small", "text-micro")).toBe("text-micro");
  });
});
