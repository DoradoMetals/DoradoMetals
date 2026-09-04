import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { DataTable, type DataTableColumn } from "./DataTable";
import { axeViolations } from "../test/axe";

type Row = { id: string; item: string; purity: string; weight: number };

const columns: DataTableColumn<Row>[] = [
  { accessorKey: "item", header: "Item" },
  { accessorKey: "purity", header: "Purity" },
  { accessorKey: "weight", header: "Weight", enableSorting: true, meta: { numeric: true } },
];

const data: Row[] = [
  { id: "1", item: "Gold chain", purity: "14 Karat", weight: 12.4 },
  { id: "2", item: "Silver ring", purity: "925", weight: 3.1 },
];

function itemCells(container: HTMLElement) {
  return Array.from(container.querySelectorAll("tbody tr td:first-child")).map(
    (cell) => cell.textContent,
  );
}

describe("DataTable", () => {
  it("renders a real table through the package shell, and axe finds nothing", async () => {
    const { container } = render(<DataTable columns={columns} data={data} label="Scrap" />);
    expect(container.querySelector("table")).toBeTruthy();
    expect(container.querySelectorAll("tbody tr").length).toBe(2);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("zero rows renders the empty slot", () => {
    const { getByText } = render(
      <DataTable columns={columns} data={[]} label="Scrap" empty="Nothing yet" />,
    );
    expect(getByText("Nothing yet")).toBeTruthy();
  });

  it("sorting cycles ascending, descending, then back to none", () => {
    const { container, getByRole } = render(
      <DataTable columns={columns} data={data} label="Scrap" />,
    );
    const sortButton = getByRole("button", { name: /weight/i });

    fireEvent.click(sortButton);
    expect(container.querySelector('th[aria-sort="ascending"]')).toBeTruthy();
    expect(itemCells(container)).toEqual(["Silver ring", "Gold chain"]);

    fireEvent.click(sortButton);
    expect(container.querySelector('th[aria-sort="descending"]')).toBeTruthy();
    expect(itemCells(container)).toEqual(["Gold chain", "Silver ring"]);

    fireEvent.click(sortButton);
    expect(container.querySelector('th[aria-sort="none"]')).toBeTruthy();
    expect(itemCells(container)).toEqual(["Gold chain", "Silver ring"]);
  });

  it("a column with sorting disabled renders no sort control", () => {
    const { getByText } = render(<DataTable columns={columns} data={data} label="Scrap" />);
    const purityHeader = getByText("Purity").closest("th")!;
    expect(purityHeader.hasAttribute("aria-sort")).toBe(false);
    expect(purityHeader.querySelector("button")).toBeNull();
  });

  it("selection supports an indeterminate header checkbox", () => {
    const { getByRole, getAllByRole } = render(
      <DataTable columns={columns} data={data} label="Scrap" selectable />,
    );
    const headerCheckbox = getByRole("checkbox", { name: "Select all rows" });
    const rowCheckboxes = getAllByRole("checkbox", { name: "Select row" });
    expect(rowCheckboxes.length).toBe(2);
    expect(headerCheckbox.getAttribute("aria-checked")).toBe("false");

    fireEvent.click(rowCheckboxes[0]!);
    expect(headerCheckbox.getAttribute("aria-checked")).toBe("mixed");

    fireEvent.click(rowCheckboxes[1]!);
    expect(headerCheckbox.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(headerCheckbox);
    expect(rowCheckboxes[0]!.getAttribute("aria-checked")).toBe("false");
    expect(rowCheckboxes[1]!.getAttribute("aria-checked")).toBe("false");
  });

  it("a searchable table renders an Input that drives the global filter", () => {
    const { container, getByRole } = render(
      <DataTable columns={columns} data={data} label="Scrap" searchable searchPlaceholder="Search" />,
    );
    const search = getByRole("searchbox", { name: /search table/i });
    fireEvent.change(search, { target: { value: "silver" } });
    expect(itemCells(container)).toEqual(["Silver ring"]);
  });

  it("renders the actions slot without knowing what is inside it", () => {
    const { getByRole } = render(
      <DataTable columns={columns} data={data} label="Scrap" actions={<button>New</button>} />,
    );
    expect(getByRole("button", { name: "New" })).toBeTruthy();
  });

  it('a clickable row fires on click and on Enter, and is reachable by keyboard', async () => {
    const seen: string[] = []
    const { getAllByRole } = render(
      <DataTable
        label="Scrap"
        columns={columns}
        data={data}
        onRowClick={(row) => seen.push(row.item)}
      />,
    )
    const bodyRows = getAllByRole('row').filter((r) => r.querySelector('td'))
    expect(bodyRows[0].getAttribute('tabindex')).toBe('0')
    fireEvent.click(bodyRows[0])
    fireEvent.keyDown(bodyRows[1], { key: 'Enter', target: bodyRows[1] })
    expect(seen.length).toBe(2)
  })

  it('rows are not focusable when nothing handles a click', () => {
    const { getAllByRole } = render(<DataTable label="Scrap" columns={columns} data={data} />)
    const bodyRows = getAllByRole('row').filter((r) => r.querySelector('td'))
    expect(bodyRows[0].getAttribute('tabindex')).toBeNull()
  })
})
