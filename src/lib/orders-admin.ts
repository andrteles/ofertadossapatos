import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

import { isSingleSize } from "@/lib/format";
import { getPixelAuthState } from "@/lib/pixel-settings";
import { isValidPixelSessionToken, PIXEL_SESSION_COOKIE } from "@/lib/pixel-session";
import { getSupabaseAdmin, type SagacepayOrderItem } from "@/lib/supabase-admin";

function requireAdmin() {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Banco não configurado");
  return admin;
}

async function requireSession() {
  const token = getCookie(PIXEL_SESSION_COOKIE);
  const valid = await isValidPixelSessionToken(token);
  if (!valid) throw new Error("unauthorized");
}

export const getOrdersAuthState = createServerFn({ method: "GET" }).handler(async () => {
  return getPixelAuthState();
});

export interface OrderListItem {
  id: string;
  status: string;
  amount: number;
  customerName: string;
  customerPhone: string | null;
  customerDocument: string;
  address: string;
  items: string[];
  paidAt: string | null;
  dispatchedAt: string | null;
  createdAt: string;
}

export const listOrders = createServerFn({ method: "GET" }).handler(
  async (): Promise<OrderListItem[]> => {
    await requireSession();
    const { data, error } = await requireAdmin()
      .from("sagacepay_orders")
      .select(
        "id, status, amount, customer_name, customer_phone, customer_document, address_cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, items, paid_at, dispatched_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error || !data) return [];

    return data.map((row) => ({
      id: row["id"] as string,
      status: row["status"] as string,
      amount: row["amount"] as number,
      customerName: row["customer_name"] as string,
      customerPhone: row["customer_phone"] as string | null,
      customerDocument: row["customer_document"] as string,
      address: `${row["address_street"]}, ${row["address_number"]}${
        row["address_complement"] ? ` - ${row["address_complement"]}` : ""
      } — ${row["address_neighborhood"]}, ${row["address_city"]}/${row["address_state"]} — CEP ${row["address_cep"]}`,
      items: (row["items"] as SagacepayOrderItem[]).map(
        (item) =>
          `${item.title} × ${item.quantity}${!isSingleSize(item.size) ? ` (tam. ${item.size})` : ""}`,
      ),
      paidAt: row["paid_at"] as string | null,
      dispatchedAt: row["dispatched_at"] as string | null,
      createdAt: row["created_at"] as string,
    }));
  },
);

export const markOrderDispatched = createServerFn({ method: "POST" })
  .validator((input: { orderId: string }) => input)
  .handler(async ({ data }) => {
    await requireSession();
    const { error } = await requireAdmin()
      .from("sagacepay_orders")
      .update({ dispatched_at: new Date().toISOString() })
      .eq("id", data.orderId)
      .eq("status", "paid");
    return { ok: !error };
  });
