import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getProductBySlug, type Product } from "@/lib/products";

export interface CartItem {
  slug: string;
  size: string;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (slug: string, size: string, quantity?: number) => void;
  removeItem: (slug: string, size: string) => void;
  updateQuantity: (slug: string, size: string, quantity: number) => void;
  clear: () => void;
  totalItems: number;
  totalPrice: number;
}

// Keep a single context instance across hot reloads so provider/consumers never split.
const globalKey = "__ferraciniCartContext__";
const g = globalThis as unknown as Record<string, React.Context<CartContextValue | null>>;
const CartContext: React.Context<CartContextValue | null> =
  g[globalKey] ?? (g[globalKey] = createContext<CartContextValue | null>(null));

const noop = () => {};
const fallbackCart: CartContextValue = {
  items: [],
  isOpen: false,
  openCart: noop,
  closeCart: noop,
  addItem: noop,
  removeItem: noop,
  updateQuantity: noop,
  clear: noop,
  totalItems: 0,
  totalPrice: 0,
};

const STORAGE_KEY = "ferracini-cart";

function loadItems(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item?.slug === "string" &&
        typeof item?.size === "string" &&
        typeof item?.quantity === "number" &&
        item.quantity > 0 &&
        getProductBySlug(item.slug),
    );
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  // Só persiste depois de ler o storage: senão o primeiro efeito grava "[]" por cima
  // da sacola salva (e o segundo efeito do StrictMode / um refresh lê o vazio).
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setItems(loadItems());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage indisponível — ignora
    }
  }, [items, loaded]);

  const addItem = useCallback((slug: string, size: string, quantity = 1) => {
    setItems((current) => {
      const existing = current.find((item) => item.slug === slug && item.size === size);
      if (existing) {
        return current.map((item) =>
          item.slug === slug && item.size === size
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }
      return [...current, { slug, size, quantity }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((slug: string, size: string) => {
    setItems((current) => current.filter((item) => !(item.slug === slug && item.size === size)));
  }, []);

  const updateQuantity = useCallback((slug: string, size: string, quantity: number) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((item) => !(item.slug === slug && item.size === size))
        : current.map((item) =>
            item.slug === slug && item.size === size ? { ...item, quantity } : item,
          ),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const value = useMemo<CartContextValue>(() => {
    let totalItems = 0;
    let totalPrice = 0;
    for (const item of items) {
      const product: Product | undefined = getProductBySlug(item.slug);
      if (!product) continue;
      totalItems += item.quantity;
      totalPrice += product.price * item.quantity;
    }
    return {
      items,
      isOpen,
      openCart,
      closeCart,
      addItem,
      removeItem,
      updateQuantity,
      clear,
      totalItems,
      totalPrice,
    };
  }, [items, isOpen, openCart, closeCart, addItem, removeItem, updateQuantity, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    console.warn("useCart usado fora de CartProvider — usando sacola vazia.");
    return fallbackCart;
  }
  return context;
}
