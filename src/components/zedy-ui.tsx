import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { ChevronDown, ChevronUp, Info, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { useCart } from "@/lib/cart";
import { formatInstallmentsComJuros, formatPrice } from "@/lib/format";
import { getProductBySlug } from "@/lib/products";

import "@/styles/zedy-checkout.css";

/* Peças de UI do formulário de checkout. As classes são cópias literais das do
 * checkout de referência e dependem do CSS escopado em `.zc` (zedy-checkout.css). */

/** O checkout de referência troca classes por JS abaixo do breakpoint `lg` (1024px). */
export function useIsLg() {
  const [isLg, setIsLg] = useState(true);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsLg(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isLg;
}

export type FieldState = "neutral" | "valid" | "invalid";

const INPUT_BASE =
  "flex h-[46px] border px-3 py-1 text-[13px] transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-black focus-visible:ring-1 focus-visible:ring-black disabled:cursor-not-allowed disabled:opacity-50 rounded-[0.5rem]";

const INPUT_STATE: Record<FieldState, string> = {
  neutral: "border-[#dedede] bg-white checkout-autofill-detect checkout-autofill-neutral",
  valid: "border-[#dedede] bg-[#E8F0FE] checkout-autofill-detect checkout-autofill-valid",
  invalid: "bg-[#feecef] border-[#e50f38] checkout-autofill-detect checkout-autofill-invalid",
};

export function zInput(state: FieldState, extra = "w-full") {
  return `${INPUT_BASE} ${extra} ${INPUT_STATE[state]}`;
}

export const Z_LABEL =
  "text-[13px] font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70";

export const Z_BUTTON =
  "whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none bg-checkout text-white font-bold text-base shadow hover:bg-checkout/90 disabled:opacity-100 px-4 py-2 w-full h-14 flex justify-center items-center gap-2 transition-colors hover:brightness-110 hover:shadow-md rounded-[0.5rem] capitalize";

export const Z_BUTTON_BG = { background: "rgb(59, 174, 138)" } as const;

export function ZCheck({ className = "size-5 absolute right-3 top-3 text-green-500" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ZError({ message }: { message?: string | undefined }) {
  return message ? <span className="text-[11px] text-[#e50f38]">{message}</span> : null;
}

/** "i" do CPF: tooltip verde do Radix, igual ao da referência. */
export function CpfTooltip({ container }: { container: HTMLElement | null }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          <span className="ml-1">
            <Info className="w-4 h-4" />
          </span>
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={container}>
          <TooltipPrimitive.Content
            sideOffset={4}
            className="z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 max-w-72"
          >
            <b>Por que solicitamos o CPF?</b>: Para emissão da nota fiscal e segurança da compra.
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

function SummaryItems({ mobile }: { mobile: boolean }) {
  const { items, updateQuantity } = useCart();
  return (
    <ul
      role="list"
      className={mobile ? "divide-y divide-slate-200 px-4" : "divide-y divide-slate-200"}
    >
      {items.map((item) => {
        const product = getProductBySlug(item.slug);
        if (!product) return null;
        const lineTotal = product.price * item.quantity;
        return (
          <li key={`${item.slug}-${item.size}`} className="flex items-start gap-3 py-3">
            <div className="flex-shrink-0 bg-white rounded-lg border border-slate-200 object-cover shadow-sm p-[0.2rem]">
              {product.images[0] ? (
                <img
                  alt={product.title}
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-lg object-cover"
                  src={product.images[0]}
                  style={{ color: "transparent", width: "48px", height: "48px" }}
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <span
                className={`${mobile ? "text-[12px]" : "text-[13px]"} font-normal text-black min-w-0 break-words leading-tight block`}
              >
                {product.title}
              </span>
              <div className="flex items-start justify-between gap-2 min-h-[1.25rem]">
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  {item.size !== "ÚNICO" ? (
                    <span className="text-[11px] text-slate-500">Tam. {item.size}</span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[13px] font-normal text-black whitespace-nowrap">
                  {formatPrice(lineTotal)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex-shrink-0 flex items-center">
                  <label className={`${Z_LABEL} sr-only`}>Quantidade</label>
                  <div className="inline-flex items-center h-8 rounded-md border border-slate-200 bg-transparent hover:bg-transparent overflow-hidden">
                    <button
                      type="button"
                      className="flex items-center justify-center w-8 h-full text-slate-600 hover:bg-transparent focus:outline-none flex-shrink-0"
                      aria-label="Diminuir quantidade"
                      onClick={() => updateQuantity(item.slug, item.size, item.quantity - 1)}
                    >
                      <Minus className="size-[12px] text-gray-400" />
                    </button>
                    <input
                      min={1}
                      max={20}
                      className="w-7 h-full text-center text-[12px] font-medium text-slate-700 bg-transparent border-0 focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      type="number"
                      value={item.quantity}
                      onChange={(event) => {
                        const next = Math.floor(Number(event.target.value));
                        if (next >= 1 && next <= 20) updateQuantity(item.slug, item.size, next);
                      }}
                    />
                    <button
                      type="button"
                      className="flex items-center justify-center w-8 h-full text-slate-600 hover:bg-transparent focus:outline-none flex-shrink-0"
                      aria-label="Aumentar quantidade"
                      onClick={() => updateQuantity(item.slug, item.size, item.quantity + 1)}
                    >
                      <Plus className="size-[12px] text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Resumo do pedido: barra recolhível no mobile, cartão fixo na coluna direita no desktop. */
export function ZSummary({
  variant,
  showShipping,
}: {
  variant: "mobile" | "desktop";
  showShipping: boolean;
}) {
  const { totalItems, totalPrice } = useCart();
  const [open, setOpen] = useState(false);
  const installments = `ou ${formatInstallmentsComJuros(totalPrice, 12)}`;

  if (variant === "mobile") {
    return (
      <div className="h-auto lg:hidden flex flex-col">
        <div className="sticky top-0 z-20 flex flex-col bg-white">
          <div
            className="border border-[#E2E8F0] border-b overflow-hidden flex-shrink-0"
            style={{ borderColor: "rgb(226, 232, 240)" }}
          >
            <div
              className="flex justify-between items-center gap-2 flex-shrink-0 cursor-pointer"
              style={{ padding: "13px 13px 13px 19px", background: "rgb(247, 247, 247)" }}
              onClick={() => setOpen((current) => !current)}
            >
              <span
                className="text-[12px] font-medium flex-1 min-w-0"
                style={{ color: "rgb(17, 24, 39)" }}
              >
                {open ? "Resumo do pedido" : `Resumo do pedido (${totalItems})`}
              </span>
              <div className="flex-shrink-0 flex items-center gap-1">
                <span className="font-semibold text-md" style={{ color: "rgb(3, 7, 18)" }}>
                  {formatPrice(totalPrice)}
                </span>
                {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>
            <div
              className={`grid transition-[grid-template-rows] duration-500 ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className={`flex-1 min-h-0 transition-opacity duration-300 ease-out ${open ? "opacity-100" : "opacity-0"}`}
                >
                  <div className="mt-5">
                    <SummaryItems mobile />
                  </div>
                  <span className="mb-5 flex"></span>
                  <dl className="space-y- text-slate-500 p-4">
                    <div className="flex items-center justify-between mb-0">
                      <dt className="text-[12px] text-black">Produtos ({totalItems})</dt>
                      <dd className="text-black text-[12px]">{formatPrice(totalPrice)}</dd>
                    </div>
                    {showShipping ? (
                      <div className="flex items-center justify-between mt-1">
                        <dt className="text-black text-[12px]">Frete</dt>
                        <dd className="text-[12px] text-green-600 font-normal">Grátis</dd>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between mt-2">
                      <dt className="font-bold text-black text-[14px]">Total</dt>
                      <dd className="flex flex-col items-end gap-0.5">
                        <span className="font-bold text-black text-[14px]">
                          {formatPrice(totalPrice)}
                        </span>
                        <span className="text-[10px] font-normal text-green-600">
                          {installments}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-auto hidden lg:block">
      <div
        className="border p4 md:p-6 rounded-[0.5rem]"
        style={{ borderColor: "rgb(226, 232, 240)" }}
      >
        <h2 className="text-black font-medium text-[15px]">Resumo do pedido</h2>
        <span className="mb-5 flex"></span>
        <dl className="space-y- text-slate-500 border-b border-state-500 pb-5 mb-4">
          <div className="flex items-center justify-between mb-0">
            <dt className="text-[13px] text-black">Produtos</dt>
            <dd className="text-black text-[13px]">{formatPrice(totalPrice)}</dd>
          </div>
          {showShipping ? (
            <div className="flex items-center justify-between mt-1">
              <dt className="text-black text-[13px]">Frete</dt>
              <dd className="text-[13px] text-green-600 font-normal">Grátis</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between mt-2">
            <dt className="font-bold text-black text-[15px]">Total</dt>
            <dd className="flex flex-col items-end gap-0.5">
              <span className="font-bold text-black text-[15px]">{formatPrice(totalPrice)}</span>
              <span className="text-[10px] font-normal text-green-600">{installments}</span>
            </dd>
          </div>
        </dl>
        <SummaryItems mobile={false} />
      </div>
    </div>
  );
}
