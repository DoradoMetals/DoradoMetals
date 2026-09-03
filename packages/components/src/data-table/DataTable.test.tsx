import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { DataTable, type DataTableColumn } from "./DataTable";
import { axeViolations } from "../test/axe";

type Row = { order: string; total: number };
const columns: DataTableColumn<Row>[] = [
  { accessorKey: "order", header: "Order" },
  { accessorKey: "total", header: "Total" },
];
const data: Row[] = [
  { order: "PO-2189", total: 120 },
  { order: "PO-2190", total: 80 },
];

describe("DataTable", () => {
  it("renders a real table through the package shell, and axe finds nothing", async () => {
    const { container } = render(<DataTable columns={columns} data={data} label="Orders" />);
    expect(container.querySelector("table")).toBeTruthy();
    expect(container.querySelectorAll("tbody tr").length).toBe(2);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("clicking a sortable header sorts and reports aria-sort", () => {
    const { container, getByRole } = render(
      <DataTable columns={columns} data={data} label="Orders" />,
    );

    fireEvent.click(getByRole("button", { name: /total/i }));
    expect(container.querySelector('th[aria-sort="descending"]')).toBeTruthy();
    expect(container.querySelector("tbody tr td")!.textContent).toBe("PO-2189");
    fireEvent.click(getByRole("button", { name: /total/i }));
    expect(container.querySelector('th[aria-sort="ascending"]')).toBeTruthy();
    expect(container.querySelector("tbody tr td")!.textContent).toBe("PO-2190");
  });

  it("zero rows renders the empty slot", () => {
    const { getByText } = render(
      <DataTable columns={columns} data={[]} label="Orders" empty="Nothing yet" />,
    );
    expect(getByText("Nothing yet")).toBeTruthy();
  });
});
