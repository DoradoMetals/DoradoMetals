// Pins the Chart contract: every chart is a named img to AT - a canvas is a
// black hole otherwise. Geometry is Chart.js's business, not this test's.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { BarChart, DonutChart, LineChart, Sparkline } from "./Chart";

describe("Charts", () => {
  it("every chart renders a canvas with role=img and a name", () => {
    const { container } = render(
      <div>
        <LineChart labels={["a", "b"]} series={[{ label: "Gold", data: [1, 2] }]} label="Gold price" />
        <BarChart labels={["a"]} series={[{ label: "Vol", data: [3] }]} label="Volume" />
        <DonutChart labels={["Au", "Ag"]} data={[60, 40]} label="Mix" />
        <Sparkline data={[1, 3, 2]} label="Trend" />
      </div>,
    );
    const canvases = container.querySelectorAll('canvas[role="img"]');
    expect(canvases.length).toBe(4);
    for (const c of canvases) expect(c.getAttribute("aria-label")).toBeTruthy();
  });
});
