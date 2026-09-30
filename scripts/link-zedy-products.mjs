#!/usr/bin/env node
// Vincula src/data/products.json aos produtos já cadastrados na Zedy.
// Só faz leitura na API da Zedy (GET /products paginado) — não cria nada, sem risco de escrita em produção.
//
// Diferente do outletdascriancas: o CSV da Ferracini não tem Variant SKU real, então não
// dá pra casar por SKU. Em vez disso:
//   1. Casamos cada produto local com o produto da Zedy pelo TÍTULO normalizado
//      (minúsculo, sem acento, trim) — confirmado manualmente que os títulos batem.
//   2. Em 29/09 o usuário corrigiu as variantes direto no painel da Zedy — em vez de
//      editar os produtos existentes, isso RECRIOU cada produto do zero (catálogo foi de
//      ~182 pra 362 produtos). Então agora cada título tem, em geral, duas versões na
//      Zedy:
//        - "antiga" (criada em 03/09): variante com sku "shopify-variant-<num>" e title
//          sempre "Default Title" — o tamanho não sobrevive em lugar nenhum, só dava pra
//          inferir pela ORDEM do `id` (sequencial na importação). Essa era a versão usada
//          até agora.
//        - "nova" (criada em 29/09, confirmada pelo usuário como a certa a partir de
//          agora — "usar os novos"): cada variante já vem com o tamanho de verdade no
//          campo `title` (ex. "37", "38"... ou "80", "85"...), sku vazio. Não precisa mais
//          de heurística nenhuma pra essas: casa direto o `title` da variante com o
//          tamanho local.
//   3. Quando há mais de um produto na Zedy com o mesmo título, tentamos casar cada
//      candidato (do mais recente pro mais antigo, por `createdAt`) e usamos o primeiro
//      que produzir um mapeamento tamanho -> variante completo e sem ambiguidade. Isso
//      naturalmente prioriza os produtos novos (recriados em 29/09) sobre os antigos, e
//      cai pra heurística de `id` sequencial só quando o candidato não tem título de
//      variante utilizável (produtos que não foram recriados/corrigidos).
//   4. Se depois de tentar todos os candidatos ainda não der pra montar um mapeamento
//      completo e sem ambiguidade (contagem não bate, título de variante repetido/
//      faltando, ou mais de um candidato empatado por preço), o produto é pulado e
//      logado pra revisão manual — nunca adivinha.
//
// Uso:
//   node --env-file=.env scripts/link-zedy-products.mjs --limit 5
//   node --env-file=.env scripts/link-zedy-products.mjs
//   node --env-file=.env scripts/link-zedy-products.mjs --force   # reprocessa mesmo os já vinculados

import { writeFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PRODUCTS_PATH = fileURLToPath(new URL("../src/data/products.json", import.meta.url));
const LOG_PATH = fileURLToPath(new URL("../scripts/link-zedy-products.log", import.meta.url));
const ZEDY_API_BASE = "https://app.zedy.com.br/api/loja/v1";
const PER_PAGE = 50;

const token = process.env.ZEDY_API_TOKEN;
const storeId = process.env.ZEDY_STORE_ID;
if (!token || !storeId) {
  console.error("ZEDY_API_TOKEN / ZEDY_STORE_ID não configurados (rode com --env-file=.env)");
  process.exit(1);
}

const limitArg = process.argv.find((arg) => arg.startsWith("--limit"));
const limit = limitArg
  ? Number(limitArg.split("=")[1] ?? process.argv[process.argv.indexOf(limitArg) + 1])
  : Infinity;
const force = process.argv.includes("--force");

const headers = {
  Authorization: `Bearer ${token}`,
  "X-Store-Id": storeId,
  "Content-Type": "application/json",
};

async function log(line) {
  const entry = `[${new Date().toISOString()}] ${line}\n`;
  process.stdout.write(entry);
  await appendFile(LOG_PATH, entry);
}

function normalizeTitle(title) {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSize(size) {
  return String(size).trim().toLowerCase();
}

function isFullySynced(product) {
  if (!product.zedyVariantIds) return false;
  return product.sizes.every((size) => Boolean(product.zedyVariantIds[size]));
}

async function saveProducts(products) {
  await writeFile(PRODUCTS_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf8");
}

/** Busca todas as páginas de /products na Zedy e monta um mapa título normalizado -> produto(s). */
async function buildTitleMap() {
  const titleMap = new Map();
  let page = 1;
  for (;;) {
    const response = await fetch(`${ZEDY_API_BASE}/products?page=${page}&per_page=${PER_PAGE}`, {
      headers,
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ao listar produtos (página ${page}): ${await response.text()}`,
      );
    }
    const { products, pagination } = await response.json();
    if (!products || products.length === 0) break;

    for (const product of products) {
      const key = normalizeTitle(product.title);
      const existing = titleMap.get(key);
      if (existing) existing.push(product);
      else titleMap.set(key, [product]);
    }

    await log(`Página ${page}/${pagination?.totalPages ?? "?"}: ${products.length} produtos da Zedy lidos`);
    if (products.length < PER_PAGE) break;
    page += 1;
  }
  return titleMap;
}

/** Tenta montar tamanho -> variantId pra UM candidato da Zedy. Retorna null se não der pra
 * montar um mapeamento completo e sem ambiguidade com esse candidato específico. */
function tryBuildVariantIds(zedyProduct, sizes) {
  // Produto de variante única ("ÚNICO"): qualquer variante "real" serve, não tem tamanho
  // pra casar. Só filtra lixo óbvio (variantes duplicadas/vazias além da esperada).
  if (sizes.length === 1) {
    const real = zedyProduct.variants.filter((v) => v.id != null);
    if (real.length === 0) return null;
    // Se sobrar mais de uma variante "real" num produto que devia ser único, não dá pra
    // saber qual — mas isso não deveria acontecer; se acontecer, pega a primeira e deixa
    // o log mostrar (via contagem) se algo estiver estranho.
    return { [sizes[0]]: real[0].id };
  }

  // 1) Casamento direto pelo `title` da variante (produtos recriados/corrigidos em 29/09
  // já trazem o tamanho de verdade aqui).
  const byTitle = new Map();
  let titleUsable = true;
  for (const v of zedyProduct.variants) {
    const t = normalizeSize(v.title ?? "");
    if (!t || t === "default title") continue;
    if (byTitle.has(t)) {
      titleUsable = false; // título de variante duplicado — não dá pra confiar nesse candidato
      break;
    }
    byTitle.set(t, v.id);
  }
  if (titleUsable && byTitle.size === sizes.length) {
    const variantIds = {};
    let allFound = true;
    for (const size of sizes) {
      const id = byTitle.get(normalizeSize(size));
      if (!id) {
        allFound = false;
        break;
      }
      variantIds[size] = id;
    }
    if (allFound) return variantIds;
  }

  // 2) Fallback: heurística antiga, pra candidatos que ainda não foram recriados/
  // corrigidos (variantes com sku "shopify-variant-<id>" e title sempre "Default Title").
  // A Zedy atribui `id` sequencialmente na ordem de importação, que corresponde 1:1 à
  // ordem ascendente de `sizes`.
  const rawVariants = zedyProduct.variants.filter((v) => /^shopify-variant-\d+$/.test(v.sku ?? ""));
  const sortedVariants = [...rawVariants].sort((a, b) => Number(a.id) - Number(b.id));
  if (sortedVariants.length !== sizes.length) return null;

  const variantIds = {};
  sizes.forEach((size, index) => {
    variantIds[size] = sortedVariants[index].id;
  });
  return variantIds;
}

async function main() {
  const raw = await import(PRODUCTS_PATH, { with: { type: "json" } });
  const products = raw.default;

  const pending = force ? products : products.filter((p) => !isFullySynced(p));
  await log(
    `${products.length} produtos no total, ${pending.length} pendentes, limite desta execução: ${limit === Infinity ? "sem limite" : limit}`,
  );

  await log("Buscando catálogo completo da Zedy pra montar o mapa título -> produto...");
  const titleMap = await buildTitleMap();
  await log(`Mapa pronto: ${titleMap.size} títulos distintos na Zedy.`);

  let linked = 0;
  for (const product of pending) {
    if (linked >= limit) break;

    const key = normalizeTitle(product.title);
    const matches = titleMap.get(key);
    if (!matches) {
      await log(`PULADO ${product.slug}: nenhum produto na Zedy com título "${product.title}"`);
      continue;
    }

    // Tenta cada candidato do mais recente pro mais antigo (createdAt desc) — prioriza
    // naturalmente os produtos recriados/corrigidos em 29/09 sobre as versões antigas,
    // sem depender de data fixa no código.
    const candidates = [...matches].sort(
      (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
    );

    const successes = [];
    for (const candidate of candidates) {
      const variantIds = tryBuildVariantIds(candidate, product.sizes);
      if (variantIds) successes.push({ candidate, variantIds });
    }

    if (successes.length === 0) {
      await log(
        `ERRO ${product.slug}: ${product.sizes.length} tamanho(s) local(is) [${product.sizes.join(", ")}] — nenhum dos ${candidates.length} candidato(s) na Zedy (ids: ${candidates.map((c) => c.id).join(", ")}) produziu um mapeamento completo, pulando`,
      );
      continue;
    }

    // successes está ordenado do mais recente pro mais antigo (mesma ordem de
    // `candidates`). Quando há sucesso em mais de uma "geração" (ex.: produto antigo de
    // 03/09 ainda com sku shopify-variant-<id> E o recriado de 29/09), sempre prefere a
    // geração mais recente — não faz sentido desempatar por preço entre antigo/novo do
    // MESMO produto físico, os dois têm o preço igual por definição. Preço só entra pra
    // desempatar candidatos DENTRO da mesma geração (ex.: dois produtos DIFERENTES que já
    // tinham o título repetido antes de hoje, e que também foram duplicados no lote de
    // 29/09 — nesse caso viram 2 sucessos com a mesma data de criação).
    const newestDate = (successes[0].candidate.createdAt ?? "").slice(0, 10);
    const sameGeneration = successes.filter(
      (s) => (s.candidate.createdAt ?? "").slice(0, 10) === newestDate,
    );

    let chosen = sameGeneration[0];
    if (sameGeneration.length > 1) {
      const byPrice = sameGeneration.filter(
        (s) => Number(s.candidate.variants[0]?.price) === Number(product.price),
      );
      if (byPrice.length === 1) {
        chosen = byPrice[0];
      } else {
        await log(
          `PULADO ${product.slug}: ${sameGeneration.length} produtos na Zedy com o mesmo título "${product.title}" e mesma geração (ids: ${sameGeneration.map((s) => s.candidate.id).join(", ")}) produziram mapeamento válido — preço também não desempata, ambíguo, revisar à mão`,
        );
        continue;
      }
    }

    product.zedyVariantIds = chosen.variantIds;
    linked += 1;
    await log(
      `OK  ${product.slug} (zedy ${chosen.candidate.id}, criado ${chosen.candidate.createdAt}) -> ${JSON.stringify(chosen.variantIds)}`,
    );
  }

  await saveProducts(products);
  await log(`Finalizado: ${linked} produtos vinculados nesta execução.`);
}

main().catch(async (err) => {
  await log(`FALHA GERAL: ${err.stack ?? err.message}`);
  process.exit(1);
});
