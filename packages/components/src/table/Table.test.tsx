// Pins the Table contract: a real table element, sortable headers as real
// buttons carrying aria-sort on the th.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./Table";
import { axeViolations } from "../test/axe";

function renderTable(onSort = () => {}) {
  return render(
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sort="asc" onSort={onSort}>Date</TableHead>
          <TableHead>Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>2026-08-30</TableCell>
          <TableCell>$120.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("Table", () => {
  it("is a real table, and axe finds nothing", async () => {
    const { container } = renderTable();
    expect(container.querySelector("table")).toBeTruthy();
    expect(container.querySelectorAll("th").length).toBe(2);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("the sorted column says so on the th, and the button fires", () => {
    const onSort = vi.fn();
    const { container, getByRole } = renderTable(onSort);
    const th = container.querySelector('th[aria-sort="ascending"]');
    expect(th).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /Date/ }));
    expect(onSort).toHaveBeenCalled();
  });
});
