import { Link } from "@tanstack/react-router";

import type { Product } from "@/lib/products";
import { formatInstallmentsComJuros, formatPrice } from "@/lib/format";

export function ProductCard({
  product,
  showBrand = false,
}: {
  product: Product;
  showBrand?: boolean;
}) {
  const image = product.images[0];

  return (
    <Link
      to="/produtos/$slug"
      params={{ slug: product.slug }}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-lg"
    >
      <div className="relative aspect-square overflow-hidden bg-surface">
        {image ? (
          <img
            src={image}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
      </div>
      <div className="p-3">
        {showBrand ? (
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {product.brand}
          </p>
        ) : null}
        <h3 className="mt-0.5 line-clamp-2 text-sm leading-snug font-medium text-foreground">
          {product.title}
        </h3>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-foreground">{formatPrice(product.price)}</span>
          {product.compareAtPrice ? (
            <span className="text-xs text-muted-foreground line-through">
              {formatPrice(product.compareAtPrice)}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatInstallmentsComJuros(product.price, 12)}
        </p>
      </div>
    </Link>
  );
}
