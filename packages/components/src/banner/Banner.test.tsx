import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Banner } from "./Banner";
import { Button } from "../button/Button";
import { axeViolations } from "../test/axe";

describe("Banner", () => {
  it("is a labelled section with eyebrow, title, description and action, and axe finds nothing", async () => {
    const { container, getByRole, getByText } = render(
      <Banner
        label="Selling scrap"
        eyebrow="Selling scrap?"
        title="Get a quote in minutes"
        description="Ship insured, get paid the day we receive it."
        action={<Button>Start a quote</Button>}
      />,
    );
    expect(getByRole("region", { name: "Selling scrap" })).toBeTruthy();
    expect(getByText("Selling scrap?")).toBeTruthy();
    expect(getByText("Get a quote in minutes")).toBeTruthy();
    expect(getByText("Ship insured, get paid the day we receive it.")).toBeTruthy();
    expect(getByRole("button", { name: "Start a quote" })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("eyebrow and description are optional", () => {
    const { queryByText, getByText } = render(<Banner label="Promo" title="Only a title" />);
    expect(getByText("Only a title")).toBeTruthy();
    expect(queryByText("Selling scrap?")).toBe(null);
  });

  it("no fill, no hue: one surface step off the ground with a hairline top and bottom", () => {
    const { getByRole } = render(<Banner label="Promo" title="x" />);
    const band = getByRole("region", { name: "Promo" });
    expect(band.className).toContain("bg-card");
    expect(band.className).toContain("border-border");
    expect(band.className).toMatch(/border-y/);
  });

  it("title is a real h4 and carries no weight utility of its own", () => {
    const { getByText } = render(<Banner label="Promo" title="Get a quote in minutes" />);
    const title = getByText("Get a quote in minutes");
    expect(title.tagName.toLowerCase()).toBe("h4");
    expect(title.className).not.toMatch(/font-/);
  });
});
