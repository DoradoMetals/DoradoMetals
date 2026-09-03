// What useSaveProduct and useCreateProduct actually POST, checked against
// @dorado/contracts' products.bullion.Patch/products.bullion.New in strict mode. The
// contracts lane replaced metal/supplier/mint NAMES with metal_id/
// supplier_id/mint_id, dropped the stray top-level `user`, and dropped
// `created_by` from create - these tests fail if any of those reappears, or
// if an id fails to resolve from the cached reference reads.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { products } from "@dorado/contracts";
import type { AdminProduct } from "@/features/products/types";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin" } }),
}));

import { apiRequest } from "@/shared/queries/axios";
import {
  useSaveProduct,
  useCreateProduct,
  useAdminMetals,
  useAdminSuppliers,
  useAdminMints,
} from "@/features/products/queries";

const METAL_ID = "11111111-0000-4000-8000-000000000001";
const SUPPLIER_ID = "22222222-0000-4000-8000-000000000002";
const MINT_ID = "33333333-0000-4000-8000-000000000003";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// useSaveProduct resolves ids by reading the same cached queries this
// harness renders alongside it (same QueryClient, same keys) - waiting on
// THEIR isSuccess is what proves the id resolution has real data to read,
// rather than racing the mutation against the reference fetches.
function useHarness() {
  return {
    metals: useAdminMetals(),
    suppliers: useAdminSuppliers(),
    mints: useAdminMints(),
    save: useSaveProduct(),
  };
}

const aProduct = (): AdminProduct => ({
  id: "9f1c2b3a-0000-4000-8000-000000000009",
  metal: "Silver",
  supplier: "APMEX",
  name: "1oz Silver Round",
  description: "A round.",
  bid_premium: 1.1,
  ask_premium: 1.2,
  type: "Round",
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-02"),
  image_front: "/front.png",
  image_back: "/back.png",
  display: true,
  content: 1,
  gross: 1,
  purity: 0.999,
  mint: "U.S. Mint",
  variant_group: "",
  shadow_offset: 0,
  stock: 10,
  created_by: "Dorado Admin",
  updated_by: "Dorado Admin",
  homepage_display: false,
  filter_category: "",
  quantity: 10,
  slug: "1oz-silver-round",
  legal_tender: false,
  domestic_tender: false,
  is_generic: true,
  variant_label: "",
});

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation(async (_method, url) => {
    if (url === "/products/get_metals") return [{ id: METAL_ID, name: "Silver", ask: 30, bid: 29 }];
    if (url === "/suppliers/get_all")
      return [{ id: SUPPLIER_ID, logo: null, created_at: null, updated_at: null, organization: { name: "APMEX" } }];
    if (url === "/products/get_mints") return [{ id: MINT_ID, name: "U.S. Mint", type: "Government" }];
    return {};
  });
});

describe("useSaveProduct sends exactly what /products/save_product accepts", () => {
  test("resolves metal_id/supplier_id/mint_id from the cached reference reads and parses clean", async () => {
    const { result } = renderHook(() => useHarness(), { wrapper });

    await waitFor(() => {
      expect(result.current.metals.isSuccess).toBe(true);
      expect(result.current.suppliers.isSuccess).toBe(true);
      expect(result.current.mints.isSuccess).toBe(true);
    });

    await act(async () => {
      await result.current.save.mutateAsync(aProduct());
    });

    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([, url]) => url === "/products/save_product");
    expect(call).toBeTruthy();
    const body = call![2] as { product: unknown };

    expect(products.bullion.Patch.strict().safeParse(body.product).success).toBe(true);

    const product = body.product as Record<string, unknown>;
    expect(product.metal_id).toBe(METAL_ID);
    expect(product.supplier_id).toBe(SUPPLIER_ID);
    expect(product.mint_id).toBe(MINT_ID);
  });

  test("never carries metal/supplier/mint names, a top-level user, or audit columns", async () => {
    const { result } = renderHook(() => useHarness(), { wrapper });

    await waitFor(() => {
      expect(result.current.metals.isSuccess).toBe(true);
      expect(result.current.suppliers.isSuccess).toBe(true);
      expect(result.current.mints.isSuccess).toBe(true);
    });

    await act(async () => {
      await result.current.save.mutateAsync(aProduct());
    });

    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([, url]) => url === "/products/save_product");
    const body = call![2] as Record<string, unknown>;
    expect(body).not.toHaveProperty("user");

    const product = body.product as Record<string, unknown>;
    for (const retired of ["metal", "supplier", "mint", "created_by", "updated_by", "created_at", "updated_at"]) {
      expect(product).not.toHaveProperty(retired);
    }

    // Proven: naming any of them would fail the same parse.
    expect(products.bullion.Patch.strict().safeParse({ ...product, metal: "Silver" }).success).toBe(false);
  });
});

describe("useCreateProduct sends exactly what /products/create_product accepts", () => {
  test("a bare name, never created_by", async () => {
    const { result } = renderHook(() => useCreateProduct(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "New Product" });
    });

    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([, url]) => url === "/products/create_product");
    expect(call).toBeTruthy();
    const body = call![2];

    expect(products.bullion.New.strict().safeParse(body).success).toBe(true);
    expect(body as object).not.toHaveProperty("created_by");
  });
});
