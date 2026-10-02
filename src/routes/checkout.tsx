import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleCheck,
  CircleX,
  CreditCard,
  Copy,
  Info,
  Loader2,
  LockKeyhole,
  Minus,
  Plus,
  ShoppingBag,
  SquarePen,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Drawer as DrawerPrimitive } from "vaul";

import * as SheetPrimitive from "@radix-ui/react-dialog";

import { Command as CommandPrimitive } from "cmdk";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetOverlay, SheetPortal } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  CpfTooltip,
  Z_BUTTON,
  Z_BUTTON_BG,
  Z_LABEL,
  ZCheck,
  ZError,
  ZSummary,
  useIsLg,
  zInput,
  type FieldState,
} from "@/components/zedy-ui";
import { useCart } from "@/lib/cart";
import { formatInstallmentsComJuros, formatPrice, isSingleSize } from "@/lib/format";
import { getProductBySlug } from "@/lib/products";
import { CARD_BRAND_ICONS, detectCardBrand } from "@/lib/card-brands";
import { createCheckoutOrder, getOrderStatus, isValidCep, isValidDocument } from "@/lib/sagacepay";
import { getTrackingParameters } from "@/lib/utm";
import { trackMetaPixelEvent, trackPixelEvent, trackTikTokEvent } from "@/lib/tracking";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Outlet" },
      // Igual à referência: sem zoom automático do iOS ao focar os campos.
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
      },
    ],
  }),
  component: CheckoutPage,
});

/** Clone literal do checkout hospedado de referência (classes/raio/cor de
 * borda extraídos do bundle), com o verde de destaque trocado pro verde da
 * marca da loja (mesmo #3BAE8A do botão "Comprar" e do badge da sacola). */
const PAYMENT_ROW_ONE = ["aura", "discover", "mastercard", "diners", "visa"] as const;
const PAYMENT_ROW_TWO = ["amex", "pix", "elo"] as const;

function PaymentBadges({ names }: { names: readonly string[] }) {
  return names.map((name) => (
    <img
      key={name}
      src={`/payment/${name}.svg`}
      alt={name}
      width={37.5}
      height={25}
      className="h-[25px] w-[37.5px]"
    />
  ));
}

const onlyDigits = (value: string) => value.replace(/\D/g, "");

function maskDocument(value: string): string {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** Só CPF (11 dígitos) — o checkout de referência não aceita CNPJ. */
function isValidCpf(value: string): boolean {
  return onlyDigits(value).length === 11 && isValidDocument(value);
}

/** O "(" já aparece no primeiro dígito, e depois do DDD o número sempre agrupa 5-4, igual à
 * referência (fixo de 10 dígitos aparece como "(11) 33334-444"). */
function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Grupos de 4 completados com espaços à direita até 3 separadores ("4   ", "4111 1  "), igual
 * ao checkout de referência. Ao apagar, descarta o último dígito em vez de só um espaço. */
function maskCardNumber(value: string, previous: string): string {
  let d = onlyDigits(value).slice(0, 17);
  if (value.length < previous.length && d.length === onlyDigits(previous).length) {
    d = d.slice(0, -1);
  }
  if (!d) return "";
  const grouped = [d.slice(0, 4), d.slice(4, 8), d.slice(8, 12), d.slice(12)]
    .filter(Boolean)
    .join(" ");
  return grouped + " ".repeat(Math.max(0, 3 - (grouped.split(" ").length - 1)));
}

/** MM/AA — a barra entra assim que o primeiro dígito é digitado (igual ao checkout de referência)
 * e some ao apagar, pra não travar o backspace. */
function maskCardExpiry(value: string, previous: string): string {
  const digits = onlyDigits(value).slice(0, 4);
  const deleting = value.length < previous.length;
  if (digits.length === 0) return "";
  if (digits.length <= 2) return deleting ? digits : `${digits}/`;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function isValidCardExpiry(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  return year * 12 + month >= now.getFullYear() * 12 + now.getMonth() + 1;
}

/** CPF do titular: posições ainda não digitadas aparecem como "-" (000.---.------), igual ao
 * checkout de referência. Ao apagar, descarta o último dígito em vez de só o traço. */
function maskCardDocument(value: string, previous: string): string {
  let digits = onlyDigits(value).slice(0, 11);
  if (value.length < previous.length && digits.length === onlyDigits(previous).length) {
    digits = digits.slice(0, -1);
  }
  if (!digits) return "";
  const p = digits.padEnd(11, "-");
  return `${p.slice(0, 3)}.${p.slice(3, 6)}.${p.slice(6, 9)}-${p.slice(9)}`;
}

function maskCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

/** Igual à referência: vale qualquer número com 11 dígitos (DDD + 9). */
function isValidPhone(value: string): boolean {
  return onlyDigits(value).length === 11;
}

interface ViaCepResponse {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

type CepLookupResult =
  { ok: true; data: ViaCepResponse } | { ok: false; reason: "not-found" | "error" };

async function lookupCep(cep: string): Promise<CepLookupResult> {
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!response.ok) return { ok: false, reason: "error" };
    const json = (await response.json()) as ViaCepResponse;
    if (json.erro) return { ok: false, reason: "not-found" };
    return { ok: true, data: json };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Mesma ordem da referência (código IBGE das UFs). */
const BR_STATES: [string, string][] = [
  ["RO", "Rondônia"],
  ["AC", "Acre"],
  ["AM", "Amazonas"],
  ["RR", "Roraima"],
  ["PA", "Pará"],
  ["AP", "Amapá"],
  ["TO", "Tocantins"],
  ["MA", "Maranhão"],
  ["PI", "Piauí"],
  ["CE", "Ceará"],
  ["RN", "Rio Grande do Norte"],
  ["PB", "Paraíba"],
  ["PE", "Pernambuco"],
  ["AL", "Alagoas"],
  ["SE", "Sergipe"],
  ["BA", "Bahia"],
  ["MG", "Minas Gerais"],
  ["ES", "Espírito Santo"],
  ["RJ", "Rio de Janeiro"],
  ["SP", "São Paulo"],
  ["PR", "Paraná"],
  ["SC", "Santa Catarina"],
  ["RS", "Rio Grande do Sul"],
  ["MS", "Mato Grosso do Sul"],
  ["MT", "Mato Grosso"],
  ["GO", "Goiás"],
  ["DF", "Distrito Federal"],
];

async function lookupCities(uf: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
    );
    if (!response.ok) return [];
    const json = (await response.json()) as { nome: string }[];
    return json.map((item) => item.nome);
  } catch {
    return [];
  }
}

const COMBO_BUTTON =
  "inline-flex items-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2 w-full justify-between";

function ComboField({
  id,
  label,
  searchPlaceholder,
  options,
  value,
  display,
  onSelect,
  disabled,
  loading,
  error,
}: {
  id: string;
  label: string;
  searchPlaceholder: string;
  options: { value: string; label: string; key: string }[];
  value: string;
  display: string;
  onSelect: (key: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <label className="text-sm font-medium mb-2 block">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={`${COMBO_BUTTON}${value ? "" : " text-muted-foreground"}`}
            id={id}
            role="combobox"
            aria-expanded={open}
            type="button"
            disabled={disabled || loading}
          >
            <span className="truncate flex-1 text-left">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Carregando...
                </>
              ) : (
                display || "Selecione"
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
              <svg
                width="15"
                height="15"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="mr-2 h-4 w-4 shrink-0 opacity-50"
              >
                <path
                  d="M10 6.5C10 8.433 8.433 10 6.5 10C4.567 10 3 8.433 3 6.5C3 4.567 4.567 3 6.5 3C8.433 3 10 4.567 10 6.5ZM9.30884 10.0159C8.53901 10.6318 7.56251 11 6.5 11C4.01472 11 2 8.98528 2 6.5C2 4.01472 4.01472 2 6.5 2C8.98528 2 11 4.01472 11 6.5C11 7.56251 10.6318 8.53901 10.0159 9.30884L12.8536 12.1464C13.0488 12.3417 13.0488 12.6583 12.8536 12.8536C12.6583 13.0488 12.3417 13.0488 12.1464 12.8536L9.30884 10.0159Z"
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                />
              </svg>
              <CommandPrimitive.Input
                className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={searchPlaceholder}
              />
            </div>
            <CommandList>
              <CommandEmpty>Nenhum resultado.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.key}
                    value={option.value}
                    className="data-[selected=true]:bg-[hsl(220_14.3%_95.9%)] data-[selected=true]:text-[hsl(220.9_39.3%_11%)]"
                    onSelect={() => {
                      onSelect(option.key);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${option.key === value ? "opacity-100" : "opacity-0"}`}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error ? <p className="text-rose-600 text-[11px] mt-1">{error}</p> : null}
    </div>
  );
}

const COMPANY_NAME = "Arte & Couro Calçados LTDA";

/** Header + footer minimalistas (só logo, sem menu/nav) — mesma estrutura do
 * checkout hospedado de referência: header branco (sem logo, nunca), footer
 * cinza-claro com nome da loja/copyright/selo de pagamento. A faixa preta
 * de avisos é a mesma do resto da loja (componente compartilhado), pro
 * cliente se sentir no mesmo ambiente ao chegar no checkout. */
function CheckoutShell({ children }: { children: React.ReactNode }) {
  const [storeInfoOpen, setStoreInfoOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col bg-white text-[#030712]">
      <header className="bg-white px-0">
        <div className="mx-auto flex h-[71px] max-w-2xl items-center justify-center px-4 md:h-[81px] md:max-w-7xl"></div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-auto shrink-0 bg-[#f3f4f6] p-6 text-[#9ca3af] shadow-sm lg:mt-4 lg:p-8">
        <div className="relative mx-auto max-w-2xl px-5 pb-10 lg:max-w-7xl">
          <div className="hidden flex-col items-center justify-center gap-1 text-center text-xs lg:flex">
            <p className="mb-1 w-full text-center font-medium">
              {COMPANY_NAME} | Todos os direitos reservados
            </p>
            <p className="w-full text-center">© 2026 {COMPANY_NAME}</p>
            <div className="mt-2 flex flex-col items-center gap-2">
              <p className="text-sm">Formas de pagamento:</p>
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-2">
                <PaymentBadges names={PAYMENT_ROW_ONE} />
                <PaymentBadges names={PAYMENT_ROW_TWO} />
              </span>
            </div>
            <div className="mt-5 flex items-center">
              <LockKeyhole className="mr-1 size-5" />
              <span className="text-xs leading-[13px]">
                <b>PAGAMENTO</b>
                <br /> 100% SEGURO
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 text-center text-xs lg:hidden">
            <div className="flex w-full flex-col items-center gap-2">
              <p className="text-sm font-medium">Formas de pagamento:</p>
              <span className="inline-flex flex-col items-center gap-2">
                <span className="flex justify-center gap-2">
                  <PaymentBadges names={PAYMENT_ROW_ONE} />
                </span>
                <span className="flex justify-center gap-2">
                  <PaymentBadges names={PAYMENT_ROW_TWO} />
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setStoreInfoOpen(true)}
              className="rounded text-sm underline underline-offset-2 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-1"
            >
              Informações da loja
            </button>
            <p className="w-full text-center text-xs">
              {COMPANY_NAME} | Todos os direitos reservados
            </p>
          </div>
        </div>
      </footer>

      <Sheet open={storeInfoOpen} onOpenChange={setStoreInfoOpen}>
        <SheetPortal>
          <SheetOverlay />
          <SheetPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 gap-4 rounded-t-xl border-t bg-white p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
          >
            <div className="flex flex-col space-y-2 text-center sm:text-left">
              <SheetPrimitive.Title className="text-left text-lg font-semibold text-black">
                Informações de contato
              </SheetPrimitive.Title>
            </div>
            <div className="space-y-3 pt-2 text-xs">
              <p>{COMPANY_NAME}</p>
            </div>
            <SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#f9fafb] disabled:pointer-events-none">
              <svg
                width="15"
                height="15"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
              >
                <path
                  d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                />
              </svg>
              <span className="sr-only">Close</span>
            </SheetPrimitive.Close>
          </SheetPrimitive.Content>
        </SheetPortal>
      </Sheet>
    </div>
  );
}

/** Cópia dos dados do pedido no momento da criação — o carrinho é limpo quando o
 * pagamento confirma, e a tela de "Pedido confirmado" ainda precisa mostrar tudo. */
interface OrderSnapshot {
  name: string;
  email: string;
  phone: string;
  document: string;
  street: string;
  city: string;
  state: string;
  cep: string;
  items: {
    title: string;
    size: string;
    image: string | undefined;
    quantity: number;
    price: number;
  }[];
}

type PixOrder = {
  orderId: string;
  pixCode: string;
  pixQrCodeDataUrl: string;
  amount: number;
  /** Epoch ms da criação do Pix — base do contador de 30 min da tela de aguardando. */
  createdAt?: number;
  snapshot?: OrderSnapshot;
};

/** Espera a imagem carregar e decodificar (com teto de 4s) pra tela do Pix já abrir completa. */
async function preloadImage(src: string): Promise<void> {
  if (!src) return;
  const img = new Image();
  img.src = src;
  await Promise.race([
    img.decode().catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);
}

function CheckoutPage() {
  const { items } = useCart();
  const [order, setOrder] = useState<PixOrder | null>(null);
  const [paidOrder, setPaidOrder] = useState<PixOrder | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const paidRaw = window.sessionStorage.getItem(PAID_STORAGE_KEY);
      if (paidRaw) setPaidOrder(JSON.parse(paidRaw) as PixOrder);
      else {
        // Sair e voltar ao checkout reinicia na hora: um Pix aberto antes é descartado, não restaurado.
        window.localStorage.removeItem(ORDER_STORAGE_KEY);
        window.sessionStorage.removeItem(ORDER_STORAGE_KEY);
      }
    } catch {
      // ignora
    }
    setHydrated(true);
  }, []);

  // A tela do Pix abre sempre no topo (o Drawer de "Aguarde..." restaura a rolagem antiga ao fechar).
  const orderId = order?.orderId;
  useEffect(() => {
    if (!orderId) return;
    window.scrollTo(0, 0);
    const timer = setTimeout(() => window.scrollTo(0, 0), 60);
    return () => clearTimeout(timer);
  }, [orderId]);

  function handleCreated(created: PixOrder) {
    try {
      window.sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(created));
    } catch {
      // ignora
    }
    setOrder(created);
  }

  /** "Gerar novo código": descarta o Pix vencido e volta pro passo de pagamento (carrinho e dados ficam). */
  function handleRestart() {
    try {
      window.localStorage.removeItem(ORDER_STORAGE_KEY);
    } catch {
      // ignora
    }
    setOrder(null);
  }

  function handlePaid(confirmed: PixOrder) {
    try {
      window.localStorage.removeItem(ORDER_STORAGE_KEY);
      window.sessionStorage.removeItem(FORM_STORAGE_KEY);
      window.sessionStorage.removeItem(INITIATE_STORAGE_KEY);
      window.sessionStorage.setItem(PAID_STORAGE_KEY, JSON.stringify(confirmed));
    } catch {
      // ignora
    }
    setPaidOrder(confirmed);
  }

  return (
    <CheckoutShell>
      {!hydrated ? null : paidOrder ? (
        <SuccessScreen order={paidOrder} />
      ) : order ? (
        <PixScreen order={order} onPaid={() => handlePaid(order)} onRestart={handleRestart} />
      ) : items.length === 0 ? (
        <EmptyCart />
      ) : (
        <CustomerForm onCreated={handleCreated} />
      )}
    </CheckoutShell>
  );
}

function EmptyCart() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-20 text-center">
      <ShoppingBag className="size-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Sua sacola está vazia.</p>
      <Button asChild className="mt-2 bg-black font-bold text-white hover:bg-black/85">
        <Link to="/produtos" search={{}}>
          Ver produtos
        </Link>
      </Button>
    </div>
  );
}

type Step = "personal" | "address" | "payment";

const FORM_STORAGE_KEY = "outlet-checkout-form";
const ORDER_STORAGE_KEY = "outlet-checkout-order";
const PAID_STORAGE_KEY = "outlet-checkout-paid";
const INITIATE_STORAGE_KEY = "outlet-checkout-initiate";

function CustomerForm({ onCreated }: { onCreated: (order: PixOrder) => void }) {
  const { items, totalPrice } = useCart();
  const { notice: cardNotice, show: showCardUnavailable } = useTimedNotice();
  const [step, setStep] = useState<Step>("personal");

  function cartContents() {
    return items.flatMap((item) => {
      const product = getProductBySlug(item.slug);
      return product
        ? [
            {
              contentId: product.slug,
              contentName: product.title,
              quantity: item.quantity,
              price: product.price,
            },
          ]
        : [];
    });
  }

  // InitiateCheckout: uma vez por visita ao checkout com sacola preenchida (um refresh não conta de novo).
  useEffect(() => {
    if (items.length === 0) return;
    try {
      if (window.sessionStorage.getItem(INITIATE_STORAGE_KEY)) return;
      window.sessionStorage.setItem(INITIATE_STORAGE_KEY, "1");
    } catch {
      // sem sessionStorage, dispara mesmo assim
    }
    const eventId = `initiate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const contents = cartContents();
    trackPixelEvent("InitiateCheckout", eventId, { value: totalPrice, contents });
    trackMetaPixelEvent("InitiateCheckout", eventId, {
      value: totalPrice,
      contentIds: items.map((item) => item.slug),
      numItems: items.reduce((sum, item) => sum + item.quantity, 0),
    });
    trackTikTokEvent({
      data: {
        event: "InitiateCheckout",
        eventId,
        url: window.location.href,
        value: totalPrice,
        contents,
      },
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [personalTouched, setPersonalTouched] = useState<Record<string, boolean>>({});

  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [addressRevealed, setAddressRevealed] = useState(false);
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "not-found" | "error">("idle");
  const [addressTouched, setAddressTouched] = useState<Record<string, boolean>>({});
  // CEP não achado: como a referência, abre os campos vazios + Estado/Cidade pra preencher à mão.
  const manualAddress = cepStatus === "not-found" || cepStatus === "error";
  const [cities, setCities] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  // Igual à referência: com o endereço achado pelo CEP, o foco pula pro número.
  const [focusNumberTick, setFocusNumberTick] = useState(0);
  useEffect(() => {
    if (!focusNumberTick) return;
    [...window.document.querySelectorAll<HTMLInputElement>("#number")]
      .find((input) => input.offsetParent)
      ?.focus();
  }, [focusNumberTick]);

  const [loading, setLoading] = useState(false);

  const [method, setMethod] = useState<"card" | "pix">("pix");
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardDocument, setCardDocument] = useState("");
  const [installments, setInstallments] = useState(1);
  const [cardTouched, setCardTouched] = useState<Record<string, boolean>>({});
  const [cardFocused, setCardFocused] = useState<string | null>(null);
  const [cardRevealPending, setCardRevealPending] = useState(false);
  const isLg = useIsLg();
  const [tooltipContainer, setTooltipContainer] = useState<HTMLElement | null>(null);

  // Atualizar ou voltar ao checkout recomeça do zero: nada do formulário é guardado.
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(FORM_STORAGE_KEY);
      window.localStorage.removeItem(FORM_STORAGE_KEY);
    } catch {
      // ignora
    }
  }, []);

  // TODO: integrar o pagamento por cartão na SagacePay (tokenização + venda).
  const cardErrors: Record<string, boolean> = {
    "card-number": onlyDigits(cardNumber).length === 0,
    "expiration-date": !isValidCardExpiry(cardExpiry),
    cvc: cardCvv.length < 3,
    "name-on-card": cardName.trim().length < 2,
    "document-on-card": !isValidDocument(cardDocument),
  };
  const cardBrand = detectCardBrand(onlyDigits(cardNumber));

  function cardFieldState(id: string): FieldState {
    return cardTouched[id] && cardErrors[id] && cardFocused !== id ? "invalid" : "neutral";
  }

  function cardInputClass(id: string, extra?: string) {
    const base = extra === undefined ? zInput("neutral") : zInput("neutral", extra);
    const cls = extra === undefined ? base : base.replace("text-[13px] ", "");
    return cardFieldState(id) === "invalid"
      ? cls.replace("border-[#dedede] bg-white", "border-rose-300 bg-rose-100")
      : cls;
  }

  /** Como na referência, o vermelho do envio com erros só aparece na próxima interação com os
   * campos do cartão (foco, digitação ou saída), não no clique em "Finalizar Compra". */
  function revealCardErrors() {
    if (!cardRevealPending) return;
    setCardRevealPending(false);
    setCardTouched({
      "card-number": true,
      "expiration-date": true,
      cvc: true,
      "name-on-card": true,
      "document-on-card": true,
    });
  }

  function handleCardSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (Object.values(cardErrors).some(Boolean)) {
      if (!cardName.trim()) window.document.getElementById("name-on-card")?.focus();
      setCardRevealPending(true);
      return;
    }
    showCardUnavailable();
  }

  async function runCepLookup(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepStatus("loading");
    const result = await lookupCep(digits);
    if (!result.ok || !result.data.localidade || !result.data.uf) {
      setCepStatus(result.ok ? "not-found" : result.reason);
      setStreet("");
      setNumber("");
      setComplement("");
      setNeighborhood("");
      setCity("");
      setState("");
      setCities([]);
      setAddressTouched({});
      setAddressRevealed(true);
      (window.document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    const found = result.data;
    setStreet(found.logradouro ?? "");
    setNumber("");
    setNeighborhood(found.bairro ?? "");
    setCity(found.localidade ?? "");
    setState(found.uf ?? "");
    setCepStatus("idle");
    setAddressRevealed(true);
    setFocusNumberTick((tick) => tick + 1);
  }

  async function selectState(uf: string) {
    setState(uf);
    setCity("");
    setCities([]);
    setCitiesLoading(true);
    setCities(await lookupCities(uf));
    setCitiesLoading(false);
  }

  const untouch = (field: string) =>
    step === "personal"
      ? setPersonalTouched((current) => ({ ...current, [field]: false }))
      : setAddressTouched((current) => ({ ...current, [field]: false }));

  const touch = (field: string) =>
    step === "personal"
      ? setPersonalTouched((current) => ({ ...current, [field]: true }))
      : setAddressTouched((current) => ({ ...current, [field]: true }));

  const rawPersonalErrors: Record<string, string> = {};
  if (name.trim().split(/\s+/).filter(Boolean).length < 2 || name.trim().length < 5)
    rawPersonalErrors["name"] = "Informe seu nome e sobrenome";
  if (!email.trim()) rawPersonalErrors["email"] = "Digite um e-mail válido";
  else if (!isValidEmail(email)) rawPersonalErrors["email"] = "Digite um e-mail válido";
  if (!onlyDigits(document)) rawPersonalErrors["document"] = "Digite um CPF válido";
  else if (!isValidCpf(document)) rawPersonalErrors["document"] = "Digite um CPF válido";
  if (!onlyDigits(phone)) rawPersonalErrors["phone"] = "Digite um telefone válido";
  else if (!isValidPhone(phone)) rawPersonalErrors["phone"] = "Digite um telefone válido";

  const rawAddressErrors: Record<string, string> = {};
  if (!onlyDigits(cep)) rawAddressErrors["cep"] = "Informe seu CEP";
  else if (!isValidCep(cep)) rawAddressErrors["cep"] = "CEP inválido";
  else if (!addressRevealed) rawAddressErrors["cep"] = "Aguarde a busca do CEP";
  if (street.trim().length < 3) rawAddressErrors["street"] = "Endereço é obrigatório";
  if (number.trim().length < 1) rawAddressErrors["number"] = "Número é obrigatório";
  if (neighborhood.trim().length < 2) rawAddressErrors["neighborhood"] = "Bairro é obrigatório";
  if (manualAddress && !state) rawAddressErrors["state"] = "Selecione o estado";
  if (manualAddress && !city) rawAddressErrors["city"] = "Selecione a cidade";

  const pick = (errors: Record<string, string>, touched: Record<string, boolean>) =>
    Object.fromEntries(Object.entries(errors).filter(([field]) => touched[field]));
  const personalErrors = pick(rawPersonalErrors, personalTouched);
  const addressErrors = pick(rawAddressErrors, addressTouched);

  function focusFirstError(errors: Record<string, string>) {
    const first = Object.keys(errors)[0];
    if (first)
      window.document
        .getElementById(first === "cep" ? "zipcode" : first)
        ?.scrollIntoView({ block: "center" });
  }

  function handlePersonalSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPersonalTouched({ name: true, email: true, document: true, phone: true });
    if (Object.keys(rawPersonalErrors).length > 0) {
      focusFirstError(rawPersonalErrors);
      return;
    }
    setStep("address");
  }

  function handleAddressSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAddressTouched({
      cep: true,
      street: true,
      number: true,
      neighborhood: true,
    });
    if (Object.keys(rawAddressErrors).length > 0) {
      focusFirstError(rawAddressErrors);
      return;
    }
    setStep("payment");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    let result: Awaited<ReturnType<typeof createCheckoutOrder>>;
    try {
      result = await createCheckoutOrder({
        data: {
          items: items.map((item) => ({
            slug: item.slug,
            size: item.size,
            quantity: item.quantity,
          })),
          customer: { name, email, phone, document },
          address: { cep, street, number, complement, neighborhood, city, state },
          trackingParameters: getTrackingParameters(),
        },
      });
    } catch (error) {
      console.error(error);
      toast.error("Erro de conexão. Tente novamente.");
      setLoading(false);
      return;
    }
    if (!result.ok) {
      setLoading(false);
      toast.error(result.reason);
      return;
    }

    const purchaseEventId = `purchase-${result.orderId}`;
    const contents = cartContents();
    trackPixelEvent("CompletePayment", purchaseEventId, { value: result.amount, contents });
    trackMetaPixelEvent("Purchase", purchaseEventId, {
      value: result.amount,
      contentIds: items.map((item) => item.slug),
      numItems: items.reduce((sum, item) => sum + item.quantity, 0),
    });
    trackTikTokEvent({
      data: {
        event: "CompletePayment",
        eventId: purchaseEventId,
        url: window.location.href,
        value: result.amount,
        contents,
      },
    }).catch(() => {});

    let pixQrCodeDataUrl = "";
    try {
      const QRCode = (await import("qrcode")).default;
      pixQrCodeDataUrl = await QRCode.toDataURL(result.pixCode, { margin: 0, width: 480 });
    } catch (error) {
      console.error(error);
    }
    // Como a referência (que abre a página do pedido já pronta): só sai do "Aguarde..." depois
    // de a tela do Pix ter as imagens carregadas, e ela abre no topo.
    await Promise.all([preloadImage("/pix-checkout.png"), preloadImage(pixQrCodeDataUrl)]);

    onCreated({
      orderId: result.orderId,
      pixCode: result.pixCode,
      pixQrCodeDataUrl,
      amount: result.amount,
      createdAt: Date.now(),
      snapshot: {
        name: name.trim(),
        email: email.trim(),
        phone,
        document,
        street: street.trim(),
        city: city.trim(),
        state,
        cep,
        items: items.flatMap((item) => {
          const product = getProductBySlug(item.slug);
          return product
            ? [
                {
                  title: product.title,
                  size: item.size,
                  image: product.images[0],
                  quantity: item.quantity,
                  price: product.price,
                },
              ]
            : [];
        }),
      },
    });
    setLoading(false);
  }

  const mobile = !isLg;
  const personalState = (field: string): FieldState =>
    !rawPersonalErrors[field] ? "valid" : personalTouched[field] ? "invalid" : "neutral";
  const addressState = (field: string): FieldState =>
    !rawAddressErrors[field] ? "valid" : addressTouched[field] ? "invalid" : "neutral";
  const showShipping = addressRevealed || step === "payment";
  const cepNotFoundMessage = manualAddress && addressRevealed && !street;
  const freteReady =
    !manualAddress ||
    ["street", "number", "neighborhood", "state", "city"].every(
      (field) => !rawAddressErrors[field],
    );
  const ink = { color: "rgb(15, 23, 42)" };
  const doneBorder = { borderColor: "rgb(226, 232, 240)" };
  const gap = mobile ? "mt-4" : "mt-3";
  const rounded = mobile ? "" : " rounded-[0.5rem]";
  const editIcon = <SquarePen className="w-4 h-4" />;
  const addressLine = `${street.trim()}, ${number.trim()}${complement.trim() ? ` - ${complement.trim()}` : ""}`;
  const cityLine = `${neighborhood.trim()}, ${city.trim()}/${state} ${onlyDigits(cep)}`;
  const payButtonClass = `${Z_BUTTON.replace("gap-2 ", "relative z-10 ")} btn-buy tryplopay_btn_buy`;

  const identDone = (
    <>
      <div
        id="account"
        className="border-slate-200 cursor-pointer"
        onClick={() => setStep("personal")}
      >
        <h2
          className={`flex justify-between items-center font-semibold ${mobile ? "text-[14px]" : "text-[18px]"}`}
          style={ink}
        >
          <span className="flex items-center">Identificação</span>
          <span className="flex items-center gap-1 text-[12px] font-normal text-slate-500 flex-shrink-0">
            Editar
            {editIcon}
          </span>
        </h2>
        <div className="text-[13px] mt-2 space-y-0.5" style={ink}>
          <p className={mobile ? "font-medium" : "font-semibold"}>{name}</p>
          <p className="font-normal">{email}</p>
          <p className="font-normal">{phone}</p>
        </div>
      </div>
    </>
  );

  const addressDoneBody = (
    <div className="space-y-3 mt-2">
      <div className="text-[12px] mb-4 font-normal text-slate-600 space-y-0.5" style={ink}>
        <p>{addressLine}</p>
        <p>{cityLine}</p>
      </div>
      <div className="">
        <div className="flex justify-between items-center">
          <span
            className={mobile ? "font-medium text-[14px]" : "font-semibold text-[13px]"}
            style={ink}
          >
            Frete selecionado
          </span>
        </div>
        <p className="text-[12px] font-normal text-slate-600 space-y-0.5" style={ink}>
          ENTREGA ESTIMADA <span>- Grátis</span>
        </p>
      </div>
    </div>
  );

  const addressDoneHeader = (
    <h2
      className={`flex justify-between items-center gap-2 font-semibold ${mobile ? "text-[14px] mt-4" : "text-[18px]"}`}
      style={ink}
    >
      <span className="flex gap-1 items-center">Enviar para</span>
      <span className="flex items-center gap-1 text-xs font-normal text-slate-500 flex-shrink-0">
        Editar
        {editIcon}
      </span>
    </h2>
  );

  const radio = (selected: boolean, size: number) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="mr-3"
    >
      <rect
        x="0.5"
        y="0.5"
        width="21"
        height="21"
        rx="10.5"
        stroke={selected ? "#2b6fff" : "#2D3748"}
      />
      {selected ? <circle cx="11" cy="11" r="5" fill="#2b6fff" /> : null}
    </svg>
  );

  const paymentRow = (
    id: string,
    selected: boolean,
    icon: React.ReactNode,
    label: string,
    onSelect: () => void,
    extra: React.ReactNode,
  ) => (
    <div
      id={id}
      tabIndex={-1}
      className={`border-transparent relative flex cursor-pointer border p-3 focus:outline-none w-full ${selected ? "bg-[#F8F8F8]" : "ring-1 ring-slate-200 bg-white"} rounded-[0.5rem]`}
      style={selected ? { borderColor: "rgb(43, 111, 255)" } : undefined}
      onClick={onSelect}
    >
      <div className="grid grid-cols-1 w-full">
        <div className="flex items-center">
          {radio(selected, 18)}
          <span className="flex flex-1 items-center">
            <span className="flex items-center gap-3">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-slate-100">
                {icon}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-medium text-black">{label}</span>
              </span>
            </span>
          </span>
          <span className="border-transparent border pointer-events-none absolute -inset-px rounded-lg"></span>
        </div>
        {selected ? extra : null}
      </div>
    </div>
  );

  const cardFieldLabel =
    "peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-[12px] font-medium text-black";
  const installmentOptions = Array.from({ length: 12 }, (_, index) => {
    const count = index + 1;
    const each = count === 1 ? totalPrice : (totalPrice * 1.06) / count;
    return (
      <option key={count} value={count}>
        {count === 1
          ? `1x de ${formatPrice(each).replace(/\u00a0/g, " ")} Sem juros`
          : `${count}x de ${formatPrice(each).replace(/\u00a0/g, " ")}`}
      </option>
    );
  });

  const pixExtra = (
    <div className="mt-5 grid grid-cols-1">
      <div className="gap-y-4 flex flex-col p-4 rounded-[0.5rem]" style={doneBorder}>
        <p className="text-slate-500 font-regular text-[14px]">
          O código Pix expira em 30 minutos após finalizar a compra.
        </p>
        <p className="text-slate-500 text-[14px]">
          Valor no Pix:{" "}
          <span className="font-semibold" style={{ color: "rgb(59, 174, 138)" }}>
            {formatPrice(totalPrice)}
          </span>
        </p>
      </div>
      <div className="col-span-4 z-20 relative">
        <button className={payButtonClass} type="submit" style={Z_BUTTON_BG} disabled={loading}>
          <span>Finalizar Compra</span>
        </button>
      </div>
    </div>
  );

  const cardExtra = (
    <div
      className={`grid grid-cols-4 mt-4 mb-6 w-full px-3 gap-x-2 ${mobile ? "gap-y-3" : "gap-y-4"}`}
    >
      <div className="col-span-4">
        <label className={cardFieldLabel} htmlFor="card-number">
          Número do cartão
        </label>
        <div className="mt-1 relative flex items-center">
          <input
            className={cardInputClass(
              "card-number",
              "w-full font-normal text-[12px] tracking-[1px] pr-11",
            )}
            id="card-number"
            autoComplete="cc-number"
            placeholder="0000 0000 0000 0000"
            type="text"
            name="cardNumber"
            inputMode="text"
            value={cardNumber}
            onChange={(event) => setCardNumber(maskCardNumber(event.target.value, cardNumber))}
            onFocus={() => {
              revealCardErrors();
              setCardFocused("card-number");
            }}
            onBlur={() => {
              setCardFocused(null);
              revealCardErrors();
              setCardTouched((t) => ({ ...t, "card-number": true }));
            }}
          />
          <div
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none h-6 w-8"
            aria-hidden="true"
          >
            {cardBrand ? (
              <svg
                width="36"
                height="24"
                viewBox={CARD_BRAND_ICONS[cardBrand].viewBox}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                dangerouslySetInnerHTML={{ __html: CARD_BRAND_ICONS[cardBrand].inner }}
              />
            ) : (
              <svg
                className="size-6"
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
              >
                <path d="M2.5 7.5026H17.5" stroke="#94a3b8" strokeWidth="1.5" />
                <path d="M7.97492 10.8346H5.83325" stroke="#94a3b8" strokeWidth="1.5" />
                <path
                  d="M15 15.8346H5C3.61917 15.8346 2.5 14.7155 2.5 13.3346V6.66797C2.5 5.28714 3.61917 4.16797 5 4.16797H15C16.3808 4.16797 17.5 5.28714 17.5 6.66797V13.3346C17.5 14.7155 16.3808 15.8346 15 15.8346Z"
                  stroke="#94a3b8"
                  strokeWidth="1.5"
                />
              </svg>
            )}
          </div>
        </div>
      </div>
      <div className="col-span-2">
        <label className={cardFieldLabel} htmlFor="expiration-date">
          Validade<span className="text-slate-500 text-[10px]"> (mês ano)</span>
        </label>
        <div className="mt-1 relative">
          <input
            className={cardInputClass("expiration-date")}
            id="expiration-date"
            placeholder="MM/AA"
            autoComplete="cc-exp"
            type="text"
            name="cardExpirationDate"
            inputMode="text"
            value={cardExpiry}
            onChange={(event) => setCardExpiry(maskCardExpiry(event.target.value, cardExpiry))}
            onFocus={() => {
              revealCardErrors();
              setCardFocused("expiration-date");
            }}
            onBlur={() => {
              setCardFocused(null);
              revealCardErrors();
              setCardTouched((t) => ({ ...t, "expiration-date": true }));
            }}
          />
        </div>
      </div>
      <div className="col-span-2 ml-0">
        <label
          className="font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-[12px] relative w-full inline-block"
          htmlFor="cvc"
        >
          Cód. de segurança
        </label>
        <div className="mt-1 relative">
          <input
            className={cardInputClass("cvc")}
            id="cvc"
            placeholder="CVV"
            autoComplete="cc-csc"
            type="text"
            name="cardCvv"
            inputMode="text"
            value={cardCvv}
            onChange={(event) => setCardCvv(onlyDigits(event.target.value).slice(0, 4))}
            onFocus={() => {
              revealCardErrors();
              setCardFocused("cvc");
            }}
            onBlur={() => {
              setCardFocused(null);
              revealCardErrors();
              setCardTouched((t) => ({ ...t, cvc: true }));
            }}
          />
        </div>
      </div>
      <div className="col-span-4">
        <label className={cardFieldLabel} htmlFor="name-on-card">
          Nome impresso no cartão
        </label>
        <div className="mt-1 relative">
          <input
            className={cardInputClass("name-on-card")}
            id="name-on-card"
            placeholder="Como está no cartão"
            autoComplete="cc-name"
            type="text"
            name="cardName"
            value={cardName}
            onChange={(event) => setCardName(event.target.value)}
            onFocus={() => {
              revealCardErrors();
              setCardFocused("name-on-card");
            }}
            onBlur={() => {
              setCardFocused(null);
              revealCardErrors();
              setCardTouched((t) => ({ ...t, "name-on-card": true }));
            }}
          />
        </div>
      </div>
      <div className="col-span-4">
        <label className={cardFieldLabel} htmlFor="document-on-card">
          CPF do titular do cartão
        </label>
        <div className="mt-1 relative">
          <input
            className={cardInputClass("document-on-card")}
            id="document-on-card"
            placeholder="000.000.000-00"
            type="text"
            name="cardDocument"
            inputMode="text"
            value={cardDocument}
            onChange={(event) =>
              setCardDocument(maskCardDocument(event.target.value, cardDocument))
            }
            onFocus={() => {
              revealCardErrors();
              setCardFocused("document-on-card");
            }}
            onBlur={() => {
              setCardFocused(null);
              revealCardErrors();
              setCardTouched((t) => ({ ...t, "document-on-card": true }));
            }}
          />
        </div>
      </div>
      <div className="col-span-4">
        <label className={cardFieldLabel} htmlFor="installments">
          Parcelas
        </label>
        <div className="mt-1">
          <select
            id="installments"
            name="installments"
            className="h-[46px] border border-[#E2E8F0] text-left text-[12px] font-medium text-slate-700 focus:outline-none sm:text-sm w-full px-2 bg-white rounded-[0.5rem]"
            value={installments}
            onChange={(event) => setInstallments(Number(event.target.value))}
          >
            {installmentOptions}
          </select>
        </div>
      </div>
      <div className="col-span-4">
        <button className={payButtonClass} type="submit" style={Z_BUTTON_BG}>
          <span>Finalizar Compra</span>
        </button>
      </div>
    </div>
  );

  const pixIcon = (
    <svg className="size-5" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <g fill="#4BB8A9" fillRule="evenodd">
        <path d="M112.57 391.19c20.056 0 38.928-7.808 53.12-22l76.693-76.692c5.385-5.404 14.765-5.384 20.15 0l76.989 76.989c14.191 14.172 33.045 21.98 53.12 21.98h15.098l-97.138 97.139c-30.326 30.344-79.505 30.344-109.85 0l-97.415-97.416h9.232zm280.068-271.294c-20.056 0-38.929 7.809-53.12 22l-76.97 76.99c-5.551 5.53-14.6 5.568-20.15-.02l-76.711-76.693c-14.192-14.191-33.046-21.999-53.12-21.999h-9.234l97.416-97.416c30.344-30.344 79.523-30.344 109.867 0l97.138 97.138h-15.116z" />
        <path d="M22.758 200.753l58.024-58.024h31.787c13.84 0 27.384 5.605 37.172 15.394l76.694 76.693c7.178 7.179 16.596 10.768 26.033 10.768 9.417 0 18.854-3.59 26.014-10.75l76.989-76.99c9.787-9.787 23.331-15.393 37.171-15.393h37.654l58.3 58.302c30.343 30.344 30.343 79.523 0 109.867l-58.3 58.303H392.64c-13.84 0-27.384-5.605-37.171-15.394l-76.97-76.99c-13.914-13.894-38.172-13.894-52.066.02l-76.694 76.674c-9.788 9.788-23.332 15.413-37.172 15.413H80.782L22.758 310.62c-30.344-30.345-30.344-79.524 0-109.868" />
      </g>
    </svg>
  );

  const cardIcon = (
    <svg className="size-5" width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M2.5 7.5026H17.5" stroke="#374151" strokeWidth="1.5" />
      <path d="M7.97492 10.8346H5.83325" stroke="#374151" strokeWidth="1.5" />
      <path
        d="M15 15.8346H5C3.61917 15.8346 2.5 14.7155 2.5 13.3346V6.66797C2.5 5.28714 3.61917 4.16797 5 4.16797H15C16.3808 4.16797 17.5 5.28714 17.5 6.66797V13.3346C17.5 14.7155 16.3808 15.8346 15 15.8346Z"
        stroke="#374151"
        strokeWidth="1.5"
      />
    </svg>
  );

  function handleFormSubmit(event: React.FormEvent) {
    if (step === "personal") handlePersonalSubmit(event);
    else if (step === "address") handleAddressSubmit(event);
    else if (method === "pix") void handleSubmit(event);
    else handleCardSubmit(event);
  }

  return (
    <div className="zc" ref={setTooltipContainer}>
      <NoticeToast state={cardNotice} variant="error">
        Pagamento com cartão indisponível. Escolha Pix para finalizar.
      </NoticeToast>
      <DrawerPrimitive.Root open={loading} dismissible={false}>
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
          <DrawerPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border border-[#e5e7eb] bg-[#f8fafb] outline-none"
          >
            <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-[#f3f4f6]" />
            <div className="grid gap-1.5 p-4 text-center sm:text-left">
              <DrawerPrimitive.Title className="text-center text-lg leading-none font-semibold tracking-tight text-[#020617]">
                <span>Aguarde, estamos finalizando sua compra. Não feche essa janela</span>
              </DrawerPrimitive.Title>
            </div>
            <div className="mt-auto flex flex-col gap-2 p-4">
              <div className="flex flex-col items-center space-y-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#006fff] border-t-transparent" />
                <p className="text-lg font-medium text-[#006fff]" />
              </div>
              <div className="m-auto grid w-full grid-cols-1 justify-center gap-5" />
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
      <div className="__variable_e65793 fontInter">
        <div className="flex-1 flex flex-col min-h-0 mx-auto max-w-2xl relative px-0 w-full lg:max-w-[74rem] md:mb-10">
          <form
            className="lg:grid lg:grid-cols-3 lg:gap-x-4 lg:px-3 relative space-y-reverse px-0 md:px-3.5 lg:mt-6"
            onSubmit={handleFormSubmit}
            noValidate
          >
            <ZSummary variant="mobile" showShipping={showShipping} />
            <div className="">
              {step === "personal" ? (
                <div
                  className={`border border-[##DCEEE5] p-[1rem] md:p-[1.65rem] shadow-none max-sm:scroll-mt-24 bg-white${rounded}`}
                  style={doneBorder}
                >
                  <div id="account" className="">
                    <h2
                      className="flex justify-between items-center font-semibold text-lg"
                      style={ink}
                    >
                      <span className="flex items-center">Identificação</span>
                      <span className="text-[12px] font-medium" style={ink}>
                        1 de 3
                      </span>
                    </h2>
                    <p
                      className="text-[13px] font-normal"
                      style={{ padding: "0px 0px 20px", color: "rgb(15, 23, 42)" }}
                    >
                      Preencha seus dados para envio do pedido.
                    </p>
                    <div className="visible">
                      <div className={gap}>
                        <label className={Z_LABEL} htmlFor="name">
                          Nome completo
                        </label>
                        <div className="mt-1 relative">
                          <input
                            className={zInput(personalState("name"))}
                            id="name"
                            placeholder="Digite seu nome completo"
                            autoComplete="name"
                            type="text"
                            value={name}
                            onChange={(event) => {
                              setName(event.target.value);
                              untouch("name");
                            }}
                            onBlur={() => touch("name")}
                          />
                          {personalState("name") === "valid" ? <ZCheck /> : null}
                        </div>
                        {personalState("name") === "invalid" ? (
                          <ZError message={rawPersonalErrors["name"]} />
                        ) : null}
                      </div>
                      <div className={gap}>
                        <label className={Z_LABEL} htmlFor="email">
                          E-mail
                        </label>
                        <div className="mt-1 relative">
                          <input
                            className={zInput(personalState("email"))}
                            id="email"
                            placeholder="Digite seu e-mail"
                            autoComplete="email"
                            type="email"
                            value={email}
                            onChange={(event) => {
                              setEmail(event.target.value);
                              untouch("email");
                            }}
                            onBlur={() => touch("email")}
                          />
                          {personalState("email") === "valid" ? <ZCheck /> : null}
                        </div>
                        {personalState("email") === "invalid" ? (
                          <ZError message={rawPersonalErrors["email"]} />
                        ) : null}
                      </div>
                      <div className="grid md:grid-cols-1">
                        <div className={gap}>
                          <label className={Z_LABEL} htmlFor="document">
                            <span className="flex gap-1 items-center md:mt-2">
                              CPF
                              <CpfTooltip container={tooltipContainer} />
                            </span>
                          </label>
                          <div className="mt-2 relative w-[75%]">
                            <input
                              className={zInput(personalState("document"))}
                              id="document"
                              inputMode="numeric"
                              placeholder="000.000.000-00"
                              type="text"
                              name="document"
                              value={document}
                              onChange={(event) => {
                                setDocument(maskDocument(event.target.value));
                                untouch("document");
                              }}
                              onBlur={() => touch("document")}
                            />
                            {personalState("document") === "valid" ? <ZCheck /> : null}
                          </div>
                          {personalState("document") === "invalid" ? (
                            <ZError message={rawPersonalErrors["document"]} />
                          ) : null}
                        </div>
                        <div className={gap}>
                          <div>
                            <label className={Z_LABEL} htmlFor="phone">
                              Celular/Whatsapp
                            </label>
                            <div className="relative mt-2 w-[75%] rounded-md">
                              <div className="absolute inset-y-0 left-0 flex items-center">
                                <span className="h-full rounded-md border-0 bg-transparent py-3 pl-3 pr-7 text-slate-500 focus:outline-none sm:text-sm">
                                  +55
                                </span>
                              </div>
                              <input
                                className={zInput(personalState("phone"), "w-full pl-12")}
                                id="phone"
                                inputMode="numeric"
                                placeholder="(00) 00000-0000"
                                autoComplete="tel-national"
                                type="tel"
                                name="phone"
                                value={phone}
                                onChange={(event) => {
                                  setPhone(maskPhone(event.target.value));
                                  untouch("phone");
                                }}
                              />
                              {personalState("phone") === "valid" ? <ZCheck /> : null}
                            </div>
                            {personalState("phone") === "invalid" ? (
                              <ZError message={rawPersonalErrors["phone"]} />
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <button
                        className={`${Z_BUTTON} mt-5`}
                        id="next-button-dados-pessoais"
                        type="submit"
                        style={Z_BUTTON_BG}
                      >
                        Ir Para Entrega
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className={`border border-[##DCEEE5] p-[1rem] md:p-[1.65rem] shadow-none max-sm:scroll-mt-24 ${mobile ? "ml-3 mr-3 bg-white" : "bg-[#F8FDF7]"} rounded-[0.5rem]`}
                  style={mobile ? doneBorder : { borderColor: "rgb(27, 149, 98)" }}
                >
                  {identDone}
                  {mobile && step === "payment" ? (
                    <div
                      id="address"
                      className="mt-5 border-t border-slate-200 bg-white cursor-pointer"
                      onClick={() => setStep("address")}
                    >
                      {addressDoneHeader}
                      {addressDoneBody}
                    </div>
                  ) : null}
                </div>
              )}

              {step === "personal" && !mobile ? (
                <div
                  id="address"
                  className="mt-5 border p-[1rem] md:p-[1.65rem] border-t rounded-[0.5rem] bg-[#F9FAFB] border-[#F9FAFB]"
                >
                  <h2
                    className="flex justify-between items-center gap-2 font-semibold !text-[#6B7280] text-lg"
                    style={ink}
                  >
                    <span className="flex gap-1 items-center">Entrega</span>
                    <span className="text-[12px] font-medium !text-[#6B7280]" style={ink}>
                      2 de 3
                    </span>
                  </h2>
                  <p className="text-[13px] font-normal text-slate-500 !text-[#6B7280]" style={ink}>
                    Preencha seus dados para continuar
                  </p>
                </div>
              ) : null}

              {step === "address" ? (
                <div
                  id="address"
                  className={`mt-5 p-[1rem] md:p-[1.65rem] border border-slate-200 bg-white${rounded}`}
                >
                  <h2
                    className="flex justify-between items-center gap-2 font-semibold text-lg"
                    style={ink}
                  >
                    <span className="flex gap-1 items-center">Entrega</span>
                    <span className="text-[12px] font-medium" style={ink}>
                      2 de 3
                    </span>
                  </h2>
                  <p className="text-[13px] font-normal text-slate-500" style={ink}>
                    Informe o endereço de entrega
                  </p>
                  <div className="grid grid-cols-1 sm:gap-x-4">
                    <div className="block mt-4">
                      <label className={Z_LABEL} htmlFor="zipcode">
                        CEP
                      </label>
                      <div className="mt-1 flex items-center gap-4">
                        <span className="relative">
                          <input
                            className={zInput(addressState("cep"), "w-[100%]")}
                            inputMode="numeric"
                            id="zipcode"
                            autoComplete="postal-code"
                            placeholder="00000-000"
                            maxLength={9}
                            type="text"
                            value={cep}
                            onChange={(event) => {
                              const masked = maskCep(event.target.value);
                              setCep(masked);
                              untouch("cep");
                              setCepStatus("idle");
                              if (onlyDigits(masked).length === 8) void runCepLookup(masked);
                              else setAddressRevealed(false);
                            }}
                          />
                          {addressState("cep") === "valid" &&
                          (!manualAddress || (city && state)) ? (
                            <ZCheck />
                          ) : null}
                          {cepNotFoundMessage ? (
                            <p className="text-xs mt-3 text-[#B91C1C]">
                              <span className="font-semibold">
                                Não encontramos o endereço automaticamente.
                              </span>
                              <br />
                              Preencha abaixo para continuar
                            </p>
                          ) : null}
                        </span>
                        <span className={cepNotFoundMessage ? "self-start mt-4" : "self-center"}>
                          <p className="text-xs">
                            {cepStatus === "loading"
                              ? "Buscando..."
                              : city && state
                                ? `${state}/${city}`
                                : ""}
                          </p>
                        </span>
                      </div>
                      {addressState("cep") === "invalid" ? (
                        <ZError message={rawAddressErrors["cep"]} />
                      ) : null}
                    </div>
                    {addressRevealed ? (
                      <div className={mobile ? "gap-y-4" : "gap-y-6"}>
                        <div className="visible">
                          <div className={`sm:col-span-4 mb-4 ${mobile ? "mt-4" : "mt-3"}`}>
                            <label className={Z_LABEL} htmlFor="street">
                              Endereço
                            </label>
                            <div className="mt-1 relative">
                              <input
                                className={zInput(addressState("street"))}
                                id="street"
                                placeholder="Digite rua, avenida, travessa..."
                                autoComplete="street-address"
                                type="text"
                                name="address"
                                value={street}
                                onChange={(event) => {
                                  setStreet(event.target.value);
                                  untouch("street");
                                }}
                              />
                              {addressState("street") === "valid" ? <ZCheck /> : null}
                            </div>
                            {addressState("street") === "invalid" ? (
                              <ZError message={rawAddressErrors["street"]} />
                            ) : null}
                          </div>
                          <div
                            className={`col-span-2 grid grid-cols-4 ${mobile ? "gap-4 mb-4" : "gap-2 mb-3"}`}
                          >
                            <div className="col-span-1">
                              <label className={Z_LABEL} htmlFor="number">
                                N°
                              </label>
                              <div className="mt-1 relative">
                                <input
                                  className={zInput(addressState("number"))}
                                  placeholder="Número"
                                  id="number"
                                  type="text"
                                  name="addressNumber"
                                  value={number}
                                  onChange={(event) => {
                                    setNumber(event.target.value);
                                    untouch("number");
                                  }}
                                />
                                {addressState("number") === "valid" ? (
                                  <div className="mr-2 absolute -right-4 top-0">
                                    <ZCheck />
                                  </div>
                                ) : null}
                              </div>
                              {addressState("number") === "invalid" ? (
                                <ZError message={rawAddressErrors["number"]} />
                              ) : null}
                            </div>
                            <div className="col-span-3">
                              <label className={Z_LABEL} htmlFor="neighborhood">
                                Bairro
                              </label>
                              <div className="mt-1 relative">
                                <input
                                  className={
                                    mobile
                                      ? zInput(addressState("neighborhood")).replace(
                                          "rounded-[0.5rem]",
                                          "rounded-xl",
                                        )
                                      : zInput(addressState("neighborhood"))
                                  }
                                  placeholder="Digite o bairro"
                                  id="neighborhood"
                                  type="text"
                                  name="neighborhood"
                                  value={neighborhood}
                                  onChange={(event) => {
                                    setNeighborhood(event.target.value);
                                    untouch("neighborhood");
                                  }}
                                />
                                {addressState("neighborhood") === "valid" ? <ZCheck /> : null}
                              </div>
                              {addressState("neighborhood") === "invalid" ? (
                                <ZError message={rawAddressErrors["neighborhood"]} />
                              ) : null}
                            </div>
                          </div>
                          <div className="col-span-4 mt-4">
                            <label className={Z_LABEL} htmlFor="complement">
                              Complemento{" "}
                              <span className="text-[11px] font-medium text-[#8F8F8F]">
                                (Opcional)
                              </span>
                            </label>
                            <div className="mt-1 relative">
                              <input
                                className={zInput("neutral")}
                                id="complement"
                                maxLength={100}
                                type="text"
                                name="complement"
                                value={complement}
                                onChange={(event) => setComplement(event.target.value)}
                              />
                            </div>
                          </div>
                          {manualAddress ? (
                            <div className="col-span-4 mt-4">
                              <div
                                className={`grid grid-cols-2 gap-4 mt-1 [&_button]:rounded-xl${state && city ? "" : " [&_button]:border-rose-300 [&_button]:bg-rose-50"}`}
                              >
                                <ComboField
                                  id="state"
                                  label="Estado"
                                  searchPlaceholder="Pesquisar estado..."
                                  options={BR_STATES.map(([uf, stateName]) => ({
                                    key: uf,
                                    value: `${uf} ${stateName}`,
                                    label: `${uf} - ${stateName}`,
                                  }))}
                                  value={state}
                                  display={
                                    state
                                      ? `${state} - ${BR_STATES.find(([uf]) => uf === state)?.[1] ?? ""}`
                                      : ""
                                  }
                                  onSelect={(uf) => void selectState(uf)}
                                  error={rawAddressErrors["state"]}
                                />
                                <ComboField
                                  id="city"
                                  label="Cidade"
                                  searchPlaceholder="Pesquisar cidade..."
                                  options={cities.map((cityName) => ({
                                    key: cityName,
                                    value: cityName,
                                    label: cityName,
                                  }))}
                                  value={city}
                                  display={city}
                                  onSelect={setCity}
                                  disabled={!state}
                                  loading={citiesLoading}
                                  error={rawAddressErrors["city"]}
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-6 grid z-10 visible">
                          <fieldset id="shipping-method" tabIndex={-1} className="mb-5">
                            <legend className="text-large font-semibold text-slate-900">
                              Escolha o frete:
                            </legend>
                            {!freteReady ? (
                              <div className="mt-4 flex  items-center font-normal justify-center rounded-lg border border-[#F5F5F5] bg-[#F5F5F5] p-4 text-center text-[12px] text-[#707070]">
                                Insira o endereço de entrega para ver as formas de frete
                                disponíveis.
                              </div>
                            ) : null}
                            {freteReady ? (
                              <>
                                <div className="mt-4 grid grid-cols-1 gap-y-5">
                                  <div
                                    id="shipping-method-option-0"
                                    className="border-[1px] border-[#E2E8F0] bg-slate-100 relative flex cursor-pointer p-4 focus:outline-none w-full rounded-[0.5rem]"
                                    style={{ borderColor: "rgb(43, 111, 255)" }}
                                  >
                                    <div className="flex w-full items-center">
                                      <svg
                                        width="22"
                                        height="22"
                                        viewBox="0 0 22 22"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                        className="mr-5"
                                      >
                                        <rect
                                          x="0.5"
                                          y="0.5"
                                          width="21"
                                          height="21"
                                          rx="10.5"
                                          stroke="#2b6fff"
                                        />
                                        <circle cx="11" cy="11" r="5" fill="#2b6fff" />
                                      </svg>
                                      <div className="flex justify-between w-full items-center">
                                        <div>
                                          <span className="text-[13px] font-semibold text-slate-900 flex gap-2 leading-none">
                                            ENTREGA ESTIMADA
                                          </span>
                                          <span className="flex gap-2 items-center">
                                            <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                                              2 a 5 dias
                                            </span>
                                          </span>
                                        </div>
                                        <div>
                                          <span className="font-semibold text-[13px]">Grátis</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <button
                                  className={`${Z_BUTTON} mt-5`}
                                  id="next-button-frete"
                                  type="submit"
                                  style={Z_BUTTON_BG}
                                >
                                  Ir para pagamento
                                </button>
                              </>
                            ) : null}
                          </fieldset>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {step === "payment" && !mobile ? (
                <div
                  id="address"
                  className="mt-5 border p-[1rem] md:p-[1.65rem] border-t bg-[#F8FDF7] border-[#1B9562] rounded-[0.5rem] cursor-pointer"
                  onClick={() => setStep("address")}
                >
                  {addressDoneHeader}
                  {addressDoneBody}
                </div>
              ) : null}
            </div>

            {step === "payment" ? (
              <div className="h-auto">
                <div
                  id="payment"
                  className={`mb-12 border p-[1rem] md:p-[1.65rem] h-auto bg-white max-sm:scroll-mt-24${rounded} border-[#e2e8f0] mt-6 lg:mt-0 cursor-pointer`}
                  style={{ borderColor: mobile ? "rgb(249, 250, 251)" : "rgb(226, 232, 240)" }}
                >
                  <h2
                    className="text-[18px] text-slate-900 flex justify-between items-center font-semibold"
                    style={ink}
                  >
                    <span className="flex gap-1 items-center">Pagamento</span>
                    <span className="text-[12px] font-medium" style={ink}>
                      3 de 3
                    </span>
                  </h2>
                  <p className="text-[13px] mt-1 font-normal text-slate-500" style={ink}>
                    Todas as transações são seguras e criptografadas.
                  </p>
                  <fieldset className="mt-4 block">
                    <legend className="sr-only">Tipo de Pagamento</legend>
                    <div className="space-y-4 sm:flex sm:items-center sm:space-x-10 sm:space-y-0 bg-white">
                      <div className="mt-4 grid grid-cols-1 w-full gap-6 bg-white">
                        {paymentRow(
                          "payment-method-pix",
                          method === "pix",
                          pixIcon,
                          "PIX",
                          () => setMethod("pix"),
                          pixExtra,
                        )}
                        {paymentRow(
                          "payment-method-credit-card",
                          method === "card",
                          cardIcon,
                          "Cartão de crédito",
                          () => setMethod("card"),
                          cardExtra,
                        )}
                      </div>
                    </div>
                  </fieldset>
                </div>
              </div>
            ) : !mobile ? (
              <div className="h-auto">
                <div
                  id="payment"
                  className="mb-12 border p-[1rem] md:p-[1.65rem] h-auto max-sm:scroll-mt-24 rounded-[0.5rem] mt-6 lg:mt-0 bg-[#F9FAFB] border-[#F9FAFB]"
                  style={{ borderColor: "rgb(249, 250, 251)" }}
                >
                  <h2
                    className="text-[18px] text-slate-900 flex justify-between items-center font-semibold !text-[#6B7280]"
                    style={ink}
                  >
                    <span className="flex gap-1 items-center">Pagamento</span>
                    <span className="text-[12px] font-medium !text-[#6B7280]" style={ink}>
                      3 de 3
                    </span>
                  </h2>
                  <p
                    className="text-[13px] mt-1 font-normal text-slate-500 !text-[#6B7280]"
                    style={ink}
                  >
                    Preencha os dados de entrega para continuar
                  </p>
                </div>
              </div>
            ) : null}

            <ZSummary variant="desktop" showShipping={showShipping} />
          </form>
        </div>
      </div>
    </div>
  );
}

/** Verde primário da tela de "aguardando Pix" da referência (diferente do verde do botão dos passos). */
const PIX_GREEN = "#13BF8C";

function PixStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-center text-[13px] font-semibold text-white"
        style={{ backgroundColor: PIX_GREEN }}
      >
        {n}
      </span>
      <span className="text-[#3e3e3e]">{children}</span>
    </div>
  );
}

const PIX_MINUTES = 30;

/** Segundos restantes até o Pix vencer (30 min após a criação), atualizado a cada segundo. */
function usePixCountdown(createdAt: number | undefined) {
  const expiresAt = (createdAt ?? Date.now()) + PIX_MINUTES * 60_000;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

function PixQr({ src, faded }: { src: string; faded: boolean }) {
  if (!src) return null;
  return (
    <div className={cn("mb-3 mt-3 hidden md:flex md:w-60 md:flex-col", faded && "opacity-20")}>
      <h5 className="mb-2 text-center text-sm text-[#64737E]">Aponte a câmera do seu celular</h5>
      <img src={src} alt="QR Code Pix" className="w-full" />
    </div>
  );
}

/** Tela "Quase lá..." — mesma estrutura da página de pedido aguardando Pix da referência,
 * incluindo o contador de 30 min e a tela "QR Code venceu". */
function copyWithSelection(text: string): boolean {
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(el);
  }
}

/** Aviso flutuante do checkout (mesmo modelo, tamanho e animação para sucesso e erro): elemento
 * fixo próprio, não o Toaster do sonner, que no iPhone virava uma barra colada no rodapé.
 * Centralizado, acima da área segura do iOS. Some sozinho depois de 5s. */
function useTimedNotice() {
  const [notice, setNotice] = useState<"off" | "in" | "out">("off");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function show() {
    timers.current.forEach(clearTimeout);
    setNotice("in");
    timers.current = [
      setTimeout(() => setNotice("out"), 5000),
      setTimeout(() => setNotice("off"), 5150),
    ];
  }
  return { notice, show };
}

function NoticeToast({
  state,
  variant,
  children,
}: {
  state: "off" | "in" | "out";
  variant: "success" | "error";
  children: React.ReactNode;
}) {
  if (state === "off") return null;
  const error = variant === "error";
  const Icon = error ? CircleX : CircleCheck;
  return (
    <div
      role="status"
      data-state={state === "in" ? "open" : "closed"}
      className={cn(
        "pix-copy-toast pointer-events-none z-[100] flex w-[calc(100%-2rem)] max-w-md items-center justify-center gap-3 overflow-hidden rounded-[12px] border py-4 pr-6 pl-4 shadow-lg",
        error ? "border-[#f0b4b4] bg-[#fcd7d7]" : "border-[#bde8a3] bg-[#d7f8c2]",
      )}
    >
      <div className="grid gap-1">
        <div className="text-sm opacity-90">
          <div className="flex items-center gap-3">
            <Icon
              className={cn(
                "size-7 shrink-0 text-white",
                error ? "fill-[#c62828]" : "fill-[#1f8a2e]",
              )}
            />
            <span
              className={cn("text-[15px] font-bold", error ? "text-[#6b1d1d]" : "text-[#1d4d2b]")}
            >
              {children}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PixScreen({
  order,
  onPaid,
  onRestart,
}: {
  order: PixOrder;
  onPaid: () => void;
  onRestart: () => void;
}) {
  const { clear } = useCart();
  const [copyLabel, setCopyLabel] = useState("Copiar código");
  const { notice, show: showCopiedNotice } = useTimedNotice();
  const clearedRef = useRef(false);
  const secondsLeft = usePixCountdown(order.createdAt);
  const expired = secondsLeft === 0;
  const clock = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await getOrderStatus({ data: { orderId: order.orderId } });
        if (result.status === "paid") {
          clearInterval(interval);
          if (!clearedRef.current) {
            clearedRef.current = true;
            clear();
          }
          onPaid();
        }
      } catch {
        // tenta de novo no próximo tick
      }
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.orderId]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(order.pixCode);
    } catch {
      // Fallback pra navegadores/WebViews sem Clipboard API (ou sem permissão).
      if (!copyWithSelection(order.pixCode)) {
        toast.error("Não foi possível copiar. Copie o código manualmente.");
        return;
      }
    }
    showCopiedNotice();
    setCopyLabel("Copiado!");
    setTimeout(() => setCopyLabel("Copiar código pix"), 4000);
  }

  return (
    <div className="mx-auto max-w-2xl pb-10 lg:max-w-7xl">
      <NoticeToast state={notice} variant="success">
        Código copiado com sucesso
      </NoticeToast>
      <div
        className={cn(
          "relative mx-auto flex w-full max-w-2xl flex-col items-center rounded-lg text-center",
          expired && "max-lg:min-h-[calc(100dvh-12rem)] max-lg:justify-center max-lg:py-6",
        )}
      >
        <div className="flex w-full max-w-md flex-col gap-5">
          {expired ? (
            <>
              <div className="flex flex-col items-center justify-center content-center">
                <div>
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                    <path
                      d="M39.5465 24.4531L24.4531 39.5465"
                      stroke="#B5093D"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M39.5465 39.5465L24.4531 24.4531"
                      stroke="#B5093D"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M32 56V56C18.744 56 8 45.256 8 32V32C8 18.744 18.744 8 32 8V8C45.256 8 56 18.744 56 32V32C56 45.256 45.256 56 32 56Z"
                      stroke="#B5093D"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h1 className="mb-7 text-2xl font-bold text-[#01131A] md:text-4xl">
                  QR Code venceu
                </h1>
                <p>
                  Esqueceu de efetuar o pagamento? Gere um novo código de barras e receba seu
                  pedido.
                </p>
                <PixQr src={order.pixQrCodeDataUrl} faded />
              </div>
              <button
                type="button"
                onClick={onRestart}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-8 py-6 text-lg font-bold text-white md:px-14 md:py-7"
                style={{ backgroundColor: PIX_GREEN }}
              >
                Gerar novo código
              </button>
            </>
          ) : (
            <div className="bg-white p-[1.25rem] md:p-[1.65rem]">
              <div className="flex flex-col items-center justify-center content-center">
                <h1 className="mb-3 mt-0 text-[26px] font-semibold text-[#3e3e3e] md:text-[32px]">
                  Quase lá...
                </h1>
                <p className="text-[14px] font-medium text-[#717171]">
                  Pague via pix em até <strong>{clock} </strong>para confirmar seu pedido.
                </p>
                <div className="relative mt-1 w-full">
                  <div className="mb-3 mt-2 inline-flex items-center rounded-[30px] border border-transparent bg-[#FFF9DB] px-6 py-2 text-sm font-semibold normal-case text-[#A67C00]">
                    Aguardando pagamento
                    <span className="ml-0.5 inline-flex">
                      <span className="animate-[dotPulse_1.4s_ease-in-out_0s_infinite]">.</span>
                      <span className="animate-[dotPulse_1.4s_ease-in-out_0.2s_infinite]">.</span>
                      <span className="animate-[dotPulse_1.4s_ease-in-out_0.4s_infinite]">.</span>
                    </span>
                  </div>
                </div>
                <div>
                  <img
                    src="/pix-checkout.png"
                    alt="Pagar com Pix"
                    className="mt-0 h-48 md:h-[200px]"
                  />
                </div>
              </div>

              <div className="flex flex-col items-center">
                <PixQr src={order.pixQrCodeDataUrl} faded={false} />
                <span className="mb-4 text-[13px] font-medium text-[#6B7280]">
                  Total via Pix:{" "}
                  <strong style={{ color: PIX_GREEN }}>{formatPrice(order.amount)}</strong>
                </span>
                <input
                  type="text"
                  readOnly
                  value={order.pixCode}
                  onClick={handleCopy}
                  className="flex h-[46px] w-full cursor-pointer rounded-lg border border-dashed border-[#E5E7EB] bg-[#F7F7F7] px-3 text-[13px] font-normal text-[#6B7280] opacity-50 outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleCopy}
                className="mt-3 mb-2 inline-flex h-9 w-full items-center justify-center rounded-md border border-[#E5E7EB] bg-[#13BF8C] px-8 py-6 text-[14px] font-bold whitespace-nowrap text-[#F9FAFB] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors hover:bg-[#F9FAFB] hover:text-[#030712] focus-visible:ring-1 focus-visible:ring-[#030712] focus-visible:outline-none md:px-14 md:py-7"
              >
                <Copy className="mr-1 size-4" /> {copyLabel}
              </button>

              <div className="mb-3 mt-6 text-left text-[13px]">
                <h3 className="mb-4 text-[18px] font-bold text-[#3e3e3e]">Como pagar o pix</h3>
                <div className="flex flex-col gap-4">
                  <PixStep n={1}>
                    Clique em <strong className="font-semibold">copiar o código</strong>, logo acima
                  </PixStep>
                  <PixStep n={2}>
                    Abra o <strong className="font-semibold">aplicativo</strong> do seu banco
                  </PixStep>
                  <PixStep n={3}>
                    Selecione a opção <strong className="font-semibold">PIX</strong>
                  </PixStep>
                  <PixStep n={4}>
                    Toque em <strong className="font-semibold">"Pix Copia e Cola"</strong>
                  </PixStep>
                  <PixStep n={5}>Insira o código copiado e finalize seu pagamento</PixStep>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function maskDocumentDisplay(value: string): string {
  const d = value.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.xxx.xxx-${d.slice(9)}` : value;
}

function maskEmailDisplay(value: string): string {
  const [local = "", domain = ""] = value.split("@");
  if (!domain || local.length <= 4) return value;
  return `${local.slice(0, 2)}...${local.slice(-2)}@${domain}`;
}

function maskPhoneDisplay(value: string): string {
  const d = value.replace(/\D/g, "");
  if (d.length < 10) return value;
  const rest = d.slice(2);
  return `(${d.slice(0, 2)}) ${"x".repeat(rest.length - 4)}-${rest.slice(-4)}`;
}

/** Tela "Pedido confirmado" — mesma estrutura/classes da página de pedido pago da referência
 * (dados sensíveis mascarados como lá). */
function SuccessScreen({ order }: { order: PixOrder }) {
  const snap = order.snapshot;
  const maskedEmail = snap ? maskEmailDisplay(snap.email) : "";
  return (
    <div className="mt-2 flex min-h-0 flex-1 flex-col">
      <div className="relative mx-auto max-w-2xl px-5 pb-10 lg:max-w-7xl">
        <div className="mx-auto mb-10 max-w-2xl">
          <div className="flex flex-col items-center rounded-lg border border-[#AFBEC9] p-4 text-center shadow-sm md:p-5">
            <div>
              <CircleCheck className="size-24 text-emerald-600" />
            </div>
            <div className="mb-3 mt-5">
              <h2 className="text-2xl font-bold">Pedido confirmado</h2>
            </div>
            <div className="text-base md:px-20">
              <p>
                {maskedEmail
                  ? `Você receberá em instantes um e-mail em ${maskedEmail} com os detalhes do seu pedido.`
                  : "Você receberá em instantes um e-mail com os detalhes do seu pedido."}
              </p>
            </div>
          </div>
        </div>

        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h1 className="font-medium leading-6 text-[#01131A]">
              Número do pedido: {order.orderId}
            </h1>
          </div>
        </div>

        {snap ? (
          <div className="mt-10 flex min-w-full flex-col rounded-lg border border-[#AFBEC9] p-4 shadow-sm md:flex-row md:justify-between md:p-5">
            <div className="mb-6 pr-6">
              <h3 className="text-xl font-semibold md:mb-3">Dados Pessoais</h3>
              <p>{snap.name}</p>
              <p>{maskDocumentDisplay(snap.document)}</p>
              <p>{maskedEmail}</p>
              <p>{maskPhoneDisplay(snap.phone)}</p>
            </div>
            <div className="mb-6 pr-6">
              <h3 className="text-xl font-semibold md:mb-3">Endereço do pedido</h3>
              <p>{snap.street}</p>
              <p>
                {snap.city}/{snap.state}
              </p>
              <p>{snap.cep.replace(/\D/g, "")}</p>
            </div>
            <div className="mb-6">
              <h3 className="text-xl font-semibold md:mb-3">Forma de Pagamento</h3>
              <p>
                <span className="mt-4 flex items-center gap-2">
                  <svg width="20" height="100%" viewBox="0 0 512 512" aria-hidden="true">
                    <g fill="#4BB8A9" fillRule="evenodd">
                      <path d="M112.57 391.19c20.056 0 38.928-7.808 53.12-22l76.693-76.692c5.385-5.404 14.765-5.384 20.15 0l76.989 76.989c14.191 14.172 33.045 21.98 53.12 21.98h15.098l-97.138 97.139c-30.326 30.344-79.505 30.344-109.85 0l-97.415-97.416h9.232zm280.068-271.294c-20.056 0-38.929 7.809-53.12 22l-76.97 76.99c-5.551 5.53-14.6 5.568-20.15-.02l-76.711-76.693c-14.192-14.191-33.046-21.999-53.12-21.999h-9.234l97.416-97.416c30.344-30.344 79.523-30.344 109.867 0l97.138 97.138h-15.116z" />
                      <path d="M22.758 200.753l58.024-58.024h31.787c13.84 0 27.384 5.605 37.172 15.394l76.694 76.693c7.178 7.179 16.596 10.768 26.033 10.768 9.417 0 18.854-3.59 26.014-10.75l76.989-76.99c9.787-9.787 23.331-15.393 37.171-15.393h37.654l58.3 58.302c30.343 30.344 30.343 79.523 0 109.867l-58.3 58.303H392.64c-13.84 0-27.384-5.605-37.171-15.394l-76.97-76.99c-13.914-13.894-38.172-13.894-52.066.02l-76.694 76.674c-9.788 9.788-23.332 15.413-37.172 15.413H80.782L22.758 310.62c-30.344-30.345-30.344-79.524 0-109.868" />
                    </g>
                  </svg>
                  <span>PIX</span>
                </span>
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flow-root rounded-lg border border-[#AFBEC9] p-4 shadow-sm sm:mx-0 md:p-5">
          <h3 className="text-xl font-semibold md:mb-3">Resumo do Pedido</h3>
          <table className="min-w-full">
            <colgroup>
              <col className="w-full sm:w-1/2" />
              <col className="sm:w-1/6" />
              <col className="sm:w-1/6" />
              <col className="sm:w-1/6" />
            </colgroup>
            <thead className="border-b border-[#96A5B0] text-[#01131A]">
              <tr>
                <th
                  scope="col"
                  className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-[#01131A] sm:pl-0"
                />
                <th
                  scope="col"
                  className="hidden px-3 py-3.5 text-center text-sm font-semibold text-[#01131A] sm:table-cell"
                >
                  Quantidade
                </th>
                <th
                  scope="col"
                  className="hidden px-3 py-3.5 text-right text-sm font-semibold text-[#01131A] sm:table-cell"
                >
                  Preço Unitário
                </th>
                <th
                  scope="col"
                  className="py-3.5 pl-3 pr-4 text-right text-sm font-semibold text-[#01131A] sm:pr-0"
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {(snap?.items ?? []).map((item, index) => (
                <tr
                  key={`${item.title}-${item.size}-${index}`}
                  className="border-b border-[#AFBEC9]"
                >
                  <td className="max-w-0 py-5 pl-4 pr-3 text-sm sm:pl-0">
                    <div className="flex">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.title}
                          width={80}
                          height={80}
                          className="mr-4 rounded-lg object-cover"
                          style={{ width: 80, height: 80 }}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex font-medium text-[#01131A]">{item.title}</div>
                        {!isSingleSize(item.size) ? (
                          <div className="mt-1 truncate text-[#64737E]">Tam. {item.size}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-5 text-center text-sm text-[#64737E] sm:table-cell">
                    {item.quantity}
                  </td>
                  <td className="hidden px-3 py-5 text-right text-sm text-[#64737E] sm:table-cell">
                    {formatPrice(item.price)}
                  </td>
                  <td className="py-5 pl-3 pr-4 text-right text-sm text-[#64737E] sm:pr-0">
                    {formatPrice(item.price * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {[
                { label: "Subtotal", value: formatPrice(order.amount), strong: false },
                { label: "Frete", value: "Frete grátis", strong: false },
                { label: "Total", value: formatPrice(order.amount), strong: true },
              ].map((row) => (
                <tr key={row.label}>
                  <th
                    scope="row"
                    colSpan={3}
                    className={cn(
                      "hidden pl-4 pr-3 pt-4 text-right text-sm sm:table-cell sm:pl-0",
                      row.strong ? "font-semibold text-[#01131A]" : "font-normal text-[#64737E]",
                    )}
                  >
                    {row.label}
                  </th>
                  <th
                    scope="row"
                    className={cn(
                      "pl-4 pr-3 pt-4 text-left text-sm sm:hidden",
                      row.strong ? "font-semibold text-[#01131A]" : "font-normal text-[#64737E]",
                    )}
                  >
                    {row.label}
                  </th>
                  <td
                    className={cn(
                      "pl-3 pr-4 pt-4 text-right text-sm sm:pr-0",
                      row.strong ? "font-semibold text-[#01131A]" : "text-[#64737E]",
                    )}
                  >
                    {row.value}
                  </td>
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
