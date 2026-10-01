import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { formatPrice, isSingleSize } from "@/lib/format";
import { getProductBySlug } from "@/lib/products";
import { cn } from "@/lib/utils";

export function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, totalPrice } = useCart();
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [goingToCheckout, setGoingToCheckout] = useState(false);

  // Mantém a gaveta aberta, com o botão girando, até o checkout carregar de verdade.
  async function goToCheckout(event: React.MouseEvent) {
    event.preventDefault();
    if (goingToCheckout) return;
    setGoingToCheckout(true);
    try {
      await navigate({ to: "/checkout" });
    } finally {
      closeCart();
      setGoingToCheckout(false);
      setTimeout(() => window.scrollTo(0, 0), 0);
    }
  }

  // Fica sempre no DOM (nunca é desmontada), animando só via transform/opacity —
  // evita o vão no topo/base no Safari do iOS.
  useEffect(() => {
    if (!isOpen) return;
    const { body } = document;
    const scrollY = window.scrollY;
    const original = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = original.position;
      body.style.top = original.top;
      body.style.left = original.left;
      body.style.right = original.right;
      body.style.width = original.width;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("button, a[href]")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeCart();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeCart]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={closeCart}
        className={cn(
          "fixed inset-0 z-50 bg-black/80 transition-opacity ease-in-out",
          isOpen ? "duration-500 opacity-100" : "invisible duration-300 opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sua sacola"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full transform-gpu flex-col gap-0 bg-background shadow-lg transition-transform ease-in-out sm:max-w-md",
          isOpen ? "duration-500 translate-x-0" : "invisible duration-300 translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="flex items-center gap-2 text-base font-extrabold">
            <ShoppingBag className="size-5" /> Sua sacola
          </p>
          <button
            type="button"
            aria-label="Fechar"
            onClick={closeCart}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <ShoppingBag className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sua sacola está vazia.</p>
            <Button asChild onClick={closeCart} className="bg-black text-white hover:bg-black/85">
              <Link to="/produtos" search={{}}>
                Ver produtos
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-5">
              {items.map((item) => {
                const product = getProductBySlug(item.slug);
                if (!product) return null;
                return (
                  <li key={`${item.slug}-${item.size}`} className="flex gap-3 py-4">
                    <Link
                      to="/produtos/$slug"
                      params={{ slug: product.slug }}
                      onClick={closeCart}
                      className="size-20 shrink-0 overflow-hidden rounded-lg bg-surface"
                    >
                      {product.images[0] ? (
                        <img
                          src={product.images[0]}
                          alt={product.title}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </Link>
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold leading-snug">{product.title}</p>
                          {!isSingleSize(item.size) ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Tamanho: {item.size}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          aria-label="Remover item"
                          onClick={() => removeItem(item.slug, item.size)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <div className="flex items-center rounded-md border border-input">
                          <button
                            type="button"
                            aria-label="Diminuir quantidade"
                            onClick={() => updateQuantity(item.slug, item.size, item.quantity - 1)}
                            className="grid size-7 place-items-center hover:bg-secondary"
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <span className="w-8 text-center text-sm font-medium">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="Aumentar quantidade"
                            onClick={() => updateQuantity(item.slug, item.size, item.quantity + 1)}
                            className="grid size-7 place-items-center hover:bg-secondary"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                        <p className="text-sm font-bold">
                          {formatPrice(product.price * item.quantity)}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-border px-5 pt-4 pb-10">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="text-lg font-extrabold">{formatPrice(totalPrice)}</span>
              </div>
              <Button
                asChild
                size="lg"
                onClick={goToCheckout}
                aria-busy={goingToCheckout}
                className="w-full bg-[#3BAE8A] font-bold text-white uppercase hover:bg-[#3BAE8A]/90"
              >
                <Link to="/checkout">
                  {goingToCheckout ? (
                    <Loader2 className="size-5 animate-spin" aria-label="Carregando" />
                  ) : (
                    "Finalizar compra"
                  )}
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                onClick={closeCart}
                className="mt-2 w-full bg-black font-bold text-white uppercase hover:bg-black/90"
              >
                <Link to="/produtos" search={{}}>
                  Continuar comprando
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
