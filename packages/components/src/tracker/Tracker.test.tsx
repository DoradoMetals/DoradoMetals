import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Tracker, type TrackerStepData } from "./Tracker";
import { axeViolations } from "../test/axe";

const steps: TrackerStepData[] = [
  { label: "Picked Up", location: "AUSTIN, TX", timestamp: "Sep 1, 4:12 PM", state: "complete" },
  { label: "In Transit", location: "MEMPHIS, TN", timestamp: "Sep 2, 6:03 AM", state: "current" },
  { label: "Out for Delivery", state: "upcoming" },
  { label: "Delivered", state: "upcoming" },
];

describe("Tracker", () => {
  it("renders the timeline and header, and axe finds nothing", async () => {
    const { container, getByText } = render(
      <Tracker steps={steps} trackingNumber="7948 1234 5678" eta="Sep 3, by 8:00 PM" />,
    );
    expect(getByText("7948 1234 5678")).toBeTruthy();
    expect(getByText("ETA")).toBeTruthy();
    expect(getByText("Picked Up")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("marks the current scan for AT with aria-current", () => {
    const { container } = render(<Tracker steps={steps} header={false} />);
    const current = container.querySelector('[aria-current="step"]') as HTMLElement;
    expect(current.textContent).toContain("In Transit");
  });

  it("header is a boolean - off suppresses the tracking number and ETA entirely", () => {
    const { container, queryByText } = render(
      <Tracker steps={steps} trackingNumber="7948 1234 5678" eta="Sep 3, by 8:00 PM" header={false} />,
    );
    expect(queryByText("7948 1234 5678")).toBeNull();
    expect(container.querySelector('[aria-label="Shipment timeline"]')).toBeTruthy();
  });

  it("upcoming steps never invent a time - always an em dash, regardless of a passed timestamp", () => {
    const { getAllByText } = render(
      <Tracker
        steps={[{ label: "Delivered", state: "upcoming", timestamp: "should not show" }]}
        header={false}
      />,
    );
    expect(getAllByText("—").length).toBe(1);
  });

  it("upcoming steps default their location to Pending when none is given", () => {
    const { getByText } = render(<Tracker steps={[{ label: "Delivered", state: "upcoming" }]} header={false} />);
    expect(getByText("Pending")).toBeTruthy();
  });

  it("connector colour tracks state - primary once travelled, border-strong ahead, destructive through an exception", () => {
    const { container } = render(
      <Tracker
        steps={[
          { label: "Picked Up", state: "complete" },
          { label: "Delivery Exception", state: "exception" },
          { label: "Delivered", state: "upcoming" },
        ]}
        header={false}
      />,
    );
    const connectors = [...container.querySelectorAll('li span[aria-hidden="true"].w-0\\.5')];
    expect(connectors).toHaveLength(2);
    expect(connectors[0].className).toContain("bg-primary");
    expect(connectors[1].className).toContain("bg-destructive");
  });

  it("the last step drops its connector and bottom padding - nothing below it to reach", () => {
    const { container } = render(<Tracker steps={steps} header={false} />);
    const rows = container.querySelectorAll("li");
    const last = rows[rows.length - 1];
    expect(last.querySelector('span[aria-hidden="true"].w-0\\.5')).toBeNull();
    const content = last.querySelectorAll(":scope > span")[1];
    expect(content.className).not.toContain("pb-lg");
  });

  it("an exception step's label is danger-coloured", () => {
    const { getByText } = render(
      <Tracker steps={[{ label: "Delivery Exception", state: "exception" }]} header={false} />,
    );
    expect(getByText("Delivery Exception").className).toContain("text-destructive");
  });

  describe("Orientation=Horizontal (597:108, rebuilt 2026-09-04): a single rail, markers evenly spaced", () => {
    it("is a single rail: first stage flush left, last stage flush right, middles grow to fill", async () => {
      const { container } = render(<Tracker steps={steps} orientation="horizontal" header={false} />);
      const stages = container.querySelectorAll('[aria-label="Shipment timeline"] > li');
      expect(stages.length).toBe(4);
      expect(stages[0].className).toContain("items-start");
      expect(stages[0].className).not.toContain("flex-1");
      expect(stages[stages.length - 1].className).toContain("items-end");
      expect(stages[stages.length - 1].className).not.toContain("flex-1");
      expect(stages[1].className).toContain("flex-1");
      expect(stages[1].className).toContain("items-center");
      expect(await axeViolations(container)).toEqual([]);
    });

    it("the first stage has no left connector, the last has no right connector", () => {
      const { container } = render(<Tracker steps={steps} orientation="horizontal" header={false} />);
      const stages = container.querySelectorAll('[aria-label="Shipment timeline"] > li');
      const firstRail = stages[0].querySelector(":scope > span")!;
      expect(firstRail.querySelectorAll('span[aria-hidden="true"].h-0\\.5').length).toBe(1);
      const lastRail = stages[stages.length - 1].querySelector(":scope > span")!;
      expect(lastRail.querySelectorAll('span[aria-hidden="true"].h-0\\.5').length).toBe(1);
    });

    it("a connector segment's colour comes from the state on its travelled side, same law as Vertical", () => {
      const { container } = render(<Tracker steps={steps} orientation="horizontal" header={false} />);
      const stages = container.querySelectorAll('[aria-label="Shipment timeline"] > li');
      const inTransitRail = stages[1].querySelector(":scope > span")!;
      const [left, right] = inTransitRail.querySelectorAll('span[aria-hidden="true"].h-0\\.5');
      expect(left.className).toContain("bg-primary");
      expect(right.className).toContain("bg-border-strong");
    });

    it("Pending/em-dash apply on Horizontal too - the rule is per state, not per orientation", () => {
      const { getByText, getAllByText } = render(
        <Tracker steps={[{ label: "Delivered", state: "upcoming" }]} orientation="horizontal" header={false} />,
      );
      expect(getByText("Pending")).toBeTruthy();
      expect(getAllByText("—").length).toBe(1);
    });

    it("marks the current stage for AT with aria-current, same as Vertical", () => {
      const { container } = render(<Tracker steps={steps} orientation="horizontal" header={false} />);
      const current = container.querySelector('[aria-current="step"]') as HTMLElement;
      expect(current.textContent).toContain("In Transit");
    });
  });
});
