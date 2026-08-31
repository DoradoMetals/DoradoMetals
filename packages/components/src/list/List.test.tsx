// Pins the List contract: a real ul/li with the marker as decoration.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { List, ListItem } from "./List";
import { axeViolations } from "../test/axe";

describe("List", () => {
  it("is a real list of items, and axe finds nothing", async () => {
    const { container, getAllByRole } = render(
      <List>
        <ListItem>Insured shipping</ListItem>
        <ListItem>Same-day payout</ListItem>
      </List>,
    );
    expect(container.querySelector("ul")).toBeTruthy();
    expect(getAllByRole("listitem").length).toBe(2);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("markers are decoration, hidden from the tree", () => {
    const { container } = render(
      <List>
        <ListItem>x</ListItem>
      </List>,
    );
    expect(container.querySelector('[aria-hidden]')).toBeTruthy();
  });
});
