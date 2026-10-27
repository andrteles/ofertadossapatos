import { createServerFn } from "@tanstack/react-start";

import { getProductBySlug } from "@/lib/products";

const ZEDY_API_BASE = "https://app.zedy.com.br/api/loja/v1";

function getZedyHeaders() {
  const token = process.env["ZEDY_API_TOKEN"];
  const storeId = process.env["ZEDY_STORE_ID"];
  if (!token || !storeId) throw new Error("ZEDY_API_TOKEN / ZEDY_STORE_ID não configurados");
  return {
    Authorization: `Bearer ${token}`,
    "X-Store-Id": storeId,
    "Content-Type": "application/json",
  };
}

interface CheckoutItemInput {
  slug: string;
  size: string;
  quantity: number;
}

export const createZedyCheckout = createServerFn({ method: "POST" })
  .validator((input: { items: CheckoutItemInput[] }) => input)
  .handler(async ({ data }) => {
    if (data.items.length === 0) return { ok: false as const };

    const zedyItems: { variantId: string; quantity: number }[] = [];
    for (const item of data.items) {
      const variantId = getProductBySlug(item.slug)?.zedyVariantIds?.[item.size];
      if (!variantId) return { ok: false as const };
      zedyItems.push({ variantId, quantity: item.quantity });
    }

    try {
      const response = await fetch(`${ZEDY_API_BASE}/cart/create-checkout`, {
        method: "POST",
        headers: getZedyHeaders(),
        body: JSON.stringify({ items: zedyItems }),
      });
      if (!response.ok) return { ok: false as const };
      const result = (await response.json()) as { checkoutUrl?: string | null };
      if (!result.checkoutUrl) return { ok: false as const };
      return { ok: true as const, checkoutUrl: result.checkoutUrl };
    } catch {
      return { ok: false as const };
    }
  });
