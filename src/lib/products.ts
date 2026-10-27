import raw from "@/data/products.json";
import upsellRaw from "@/data/upsell-products.json";

export interface Product {
  handle: string;
  slug: string;
  title: string;
  description: string | null;
  brand: string;
  price: number;
  compareAtPrice: number | null;
  discountPercent: number | null;
  images: string[];
  sizes: string[];
  category: string;
  tags: string[];
  /** Tamanho -> variantId da Zedy, preenchido por scripts/link-zedy-products.mjs */
  zedyVariantIds?: Partial<Record<string, string>>;
}

export const products = raw as Product[];

/** Produtos só de upsell: ficam fora da vitrine, da busca e de /produtos/..., mas o carrinho e o
 * checkout encontram (o preço continua vindo daqui, nunca do navegador). */
export const upsellProducts = upsellRaw as Product[];

export function isUpsellProduct(product: Product): boolean {
  return upsellProducts.some((p) => p.slug === product.slug);
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug) ?? upsellProducts.find((p) => p.slug === slug);
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  return products
    .filter((p) => p.slug !== product.slug && p.category === product.category)
    .slice(0, limit);
}

export const categories = Array.from(new Set(products.map((p) => p.category))).sort();

export type SortOption = "relevancia" | "menor-preco" | "maior-preco" | "maior-desconto";

export interface ProductFilters {
  categoria?: string | undefined;
  busca?: string | undefined;
  ordenar?: SortOption | undefined;
}

export function filterProducts(filters: ProductFilters): Product[] {
  let list = [...products];

  if (filters.categoria) {
    list = list.filter((p) => p.category === filters.categoria);
  }
  if (filters.busca) {
    const query = filters.busca.toLowerCase();
    list = list.filter((p) => p.title.toLowerCase().includes(query));
  }

  switch (filters.ordenar) {
    case "menor-preco":
      list.sort((a, b) => a.price - b.price);
      break;
    case "maior-preco":
      list.sort((a, b) => b.price - a.price);
      break;
    case "maior-desconto":
      list.sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
      break;
    case "relevancia":
    default:
      // Mantém a ordem do catálogo (products.json), que segue
      // ofertadecalcados.com/categorias/outlet/.
      break;
  }

  return list;
}

// Destaques manuais da vitrine: cada par troca, no lugar exato do produto
// substituído, um item de ticket mais alto / menos repetido na listagem.
// Nenhum destaque definido ainda — mesma estrutura do outletdascriancas, pronta
// pra receber pares [slug-substituido, slug-destaque] quando fizer sentido.
export const SHOWCASE_SUBSTITUTIONS: Array<[substituido: string, destaque: string]> = [];

export function applyShowcaseSubstitutions(list: Product[]): Product[] {
  const porSlug = new Map(list.map((p) => [p.slug, p]));
  const destaqueSlugs = new Set(SHOWCASE_SUBSTITUTIONS.map(([, destaque]) => destaque));
  const result = list.filter((p) => !destaqueSlugs.has(p.slug));
  for (const [substituido, destaque] of SHOWCASE_SUBSTITUTIONS) {
    const indice = result.findIndex((p) => p.slug === substituido);
    const produto = porSlug.get(destaque);
    if (indice !== -1 && produto) {
      result[indice] = produto;
    }
  }
  return result;
}
