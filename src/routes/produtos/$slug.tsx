import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Minus, Plus, ShieldCheck, Truck } from "lucide-react";

import { ProductCard } from "@/components/store/ProductCard";
import { Button } from "@/components/ui/button";
import { useCampaignLogo } from "@/lib/campaign";
import { useCart } from "@/lib/cart";
import { formatInstallmentsComJuros, formatPrice, isSingleSize } from "@/lib/format";
import { getProductBySlug, getRelatedProducts, type Product } from "@/lib/products";
import { trackMetaPixelEvent, trackPixelEvent, trackTikTokEvent } from "@/lib/tracking";
import { cn } from "@/lib/utils";

function metaDescription(product: Product): string {
  const plain = (product.description ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) {
    return `${product.title} - Ferracini, ${formatPrice(product.price)}`;
  }
  return plain.length > 160 ? `${plain.slice(0, 157)}...` : plain;
}

export const Route = createFileRoute("/produtos/$slug")({
  loader: ({ params }) => {
    const product = getProductBySlug(params.slug);
    if (!product) throw notFound();
    return product;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: "Outlet" },
          {
            name: "description",
            content: metaDescription(loaderData),
          },
        ]
      : [],
  }),
  component: ProductPage,
});

function ProductPage() {
  const product = Route.useLoaderData();
  const related = getRelatedProducts(product);
  const [selectedImage, setSelectedImage] = useState(0);
  const [pickedSize, setSelectedSize] = useState<string | null>(null);
  // Produto de tamanho único: não mostra o seletor, o tamanho já vem escolhido.
  const onlySize =
    product.sizes.length === 1 && isSingleSize(product.sizes[0] ?? "")
      ? (product.sizes[0] ?? null)
      : null;
  const selectedSize = pickedSize ?? onlySize;
  const [sizeError, setSizeError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();
  const showCampaignLogo = useCampaignLogo();

  useEffect(() => {
    const eventId = `view-${product.slug}-${Date.now()}`;
    trackPixelEvent("ViewContent", eventId, {
      value: product.price,
      contents: [{ contentId: product.slug, contentName: product.title, price: product.price }],
    });
    trackMetaPixelEvent("ViewContent", eventId, {
      value: product.price,
      contentIds: [product.slug],
      contentName: product.title,
    });
    trackTikTokEvent({
      data: {
        event: "ViewContent",
        eventId,
        url: window.location.href,
        value: product.price,
        contents: [{ contentId: product.slug, contentName: product.title, price: product.price }],
      },
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.slug]);

  function handleAddToCart() {
    if (!selectedSize) {
      setSizeError(true);
      return;
    }
    addItem(product.slug, selectedSize, quantity);

    const eventId = `add-${product.slug}-${selectedSize}-${Date.now()}`;
    trackPixelEvent("AddToCart", eventId, {
      value: product.price * quantity,
      contents: [
        {
          contentId: product.slug,
          contentName: product.title,
          quantity,
          price: product.price,
        },
      ],
    });
    trackMetaPixelEvent("AddToCart", eventId, {
      value: product.price * quantity,
      contentIds: [product.slug],
      contentName: product.title,
      numItems: quantity,
    });
    trackTikTokEvent({
      data: {
        event: "AddToCart",
        eventId,
        url: window.location.href,
        value: product.price * quantity,
        contents: [
          {
            contentId: product.slug,
            contentName: product.title,
            quantity,
            price: product.price,
          },
        ],
      },
    }).catch(() => {});
    setQuantity(1);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Início
        </Link>
        <ChevronRight className="size-3" />
        <Link to="/produtos" search={{}} className="hover:text-foreground">
          {product.category}
        </Link>
        <ChevronRight className="size-3" />
        <span className="line-clamp-1 text-foreground">{product.title}</span>
      </nav>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div>
          <div className="aspect-square overflow-hidden rounded-2xl bg-surface">
            {product.images[selectedImage] ? (
              <img
                src={product.images[selectedImage]}
                alt={product.title}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          {product.images.length > 1 ? (
            <div className="mt-3 grid grid-cols-5 gap-2">
              {product.images.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  onClick={() => setSelectedImage(index)}
                  className={cn(
                    "aspect-square overflow-hidden rounded-lg border-2",
                    index === selectedImage ? "border-primary" : "border-transparent",
                  )}
                >
                  <img src={image} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          {showCampaignLogo ? (
            <p className="text-sm font-semibold text-muted-foreground">{product.brand}</p>
          ) : null}
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{product.title}</h1>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-3xl font-extrabold">{formatPrice(product.price)}</span>
            {product.compareAtPrice ? (
              <span className="text-base text-muted-foreground line-through">
                {formatPrice(product.compareAtPrice)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatInstallmentsComJuros(product.price, 12)} · ou {formatPrice(product.price)} no Pix
          </p>

          {onlySize ? null : (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">Tamanho</p>
                {sizeError ? (
                  <p className="text-xs text-destructive">Selecione um tamanho</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setSelectedSize(size);
                      setSizeError(false);
                    }}
                    className={cn(
                      "rounded-md border-2 px-3.5 py-2 text-sm font-medium",
                      selectedSize === size
                        ? "border-primary text-foreground"
                        : "border-input hover:border-primary",
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold">Quantidade</p>
            <div className="inline-flex items-center rounded-md border border-input">
              <button
                type="button"
                aria-label="Diminuir quantidade"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                className="grid size-9 place-items-center hover:bg-secondary"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="w-8 text-center text-sm font-medium">{quantity}</span>
              <button
                type="button"
                aria-label="Aumentar quantidade"
                onClick={() => setQuantity((current) => current + 1)}
                className="grid size-9 place-items-center hover:bg-secondary"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>

          <Button
            size="lg"
            className="mt-6 h-14 w-full bg-[#3BAE8A] font-bold text-white uppercase hover:bg-[#3BAE8A]/90"
            onClick={handleAddToCart}
          >
            Adicionar ao carrinho
          </Button>

          <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Truck className="size-4 shrink-0" /> Frete grátis para todo o Brasil
            </p>
            {showCampaignLogo ? (
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-4 shrink-0" /> Produto original Ferracini
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {product.description ? (
        <section className="mt-12 max-w-3xl border-t border-border pt-8">
          <h2 className="mb-3 text-xl font-extrabold tracking-tight">Descrição</h2>
          <div
            className="text-sm leading-relaxed text-muted-foreground [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-foreground"
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
        </section>
      ) : null}

      {related.length > 0 ? (
        <section className="mt-16">
          <h2 className="mb-4 text-xl font-extrabold tracking-tight">Você também pode gostar</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.slug} product={item} showBrand={showCampaignLogo} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
