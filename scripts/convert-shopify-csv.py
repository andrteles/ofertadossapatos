#!/usr/bin/env python3
"""Converte o export Shopify (scripts/ferracini-products.csv) para src/data/products.json,
no formato usado pelo catálogo da loja (ver src/lib/products.ts).

Uso: python3 scripts/convert-shopify-csv.py
"""
from __future__ import annotations

import csv
import json
import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

repo_root = Path(__file__).resolve().parent.parent
csv_path = repo_root / "scripts" / "ferracini-products.csv"
out_path = repo_root / "src" / "data" / "products.json"

BRAND = "Ferracini"
CATEGORY = "Outlet"

TITLE_OVERRIDES: dict[str, str] = {}

CONTENT_TAGS = {"p", "strong", "b", "em", "i", "br", "ul", "ol", "li"}
BLOCKED_HOST_PATTERN = re.compile(r"vtexassets\.com|lojaferracini\.com\.br", re.IGNORECASE)


class DescriptionCleaner(HTMLParser):
    """Descarta todo o lixo de wrapper divs do VTEX e mantém só tags de
    conteúdo real (p/strong/em/br/ul/li), removendo links para o site
    original ou pra vtexassets (ver plano: 126 dos 180 produtos vêm com
    esse lixo herdado do export VTEX -> Shopify)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip_depth = 0  # dentro de uma tag bloqueada (ex.: <a> pro site original)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        href = attrs_dict.get("href") or ""
        src = attrs_dict.get("src") or ""
        if BLOCKED_HOST_PATTERN.search(href) or BLOCKED_HOST_PATTERN.search(src):
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag in CONTENT_TAGS:
            self.out.append(f"<{tag}>" if tag != "br" else "<br>")

    def handle_endtag(self, tag: str) -> None:
        if self.skip_depth:
            attrs_closes = tag in {"a"}
            if attrs_closes:
                self.skip_depth = max(0, self.skip_depth - 1)
            return
        if tag in CONTENT_TAGS and tag != "br":
            self.out.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        text = data.strip()
        if text:
            self.out.append(text)

    def result(self) -> str:
        html = " ".join(self.out)
        html = re.sub(r"\s+</", "</", html)
        html = re.sub(r">\s+<", "><", html)
        html = re.sub(r">\s+", ">", html)
        html = re.sub(r"\s+([.,;:!?])", r"\1", html)
        html = re.sub(r"\s{2,}", " ", html).strip()
        return html


def clean_description(raw: str) -> str | None:
    if not raw or not raw.strip():
        return None
    cleaner = DescriptionCleaner()
    cleaner.feed(raw)
    cleaned = cleaner.result()
    return cleaned or None


def slugify(handle: str) -> str:
    return handle


def normalize_title(handle: str) -> str:
    words = handle.replace("-", " ").split()
    return " ".join(w.upper() if w.isdigit() else w.capitalize() for w in words)


def size_sort_key(size: str):
    match = re.match(r"^\d+(\.\d+)?$", size.strip())
    if match:
        return (0, float(size))
    letters = ["PP", "P", "M", "G", "GG", "XG"]
    if size in letters:
        return (1, float(letters.index(size)))
    return (2, size)


def parse_price(value: str) -> float:
    return round(float(value), 2) if value else 0.0


def main() -> None:
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    products: dict[str, dict] = {}
    order: list[str] = []

    for row in rows:
        handle = row["Handle"].strip()
        if not handle:
            continue

        is_new_product = bool(row["Title"].strip())
        if handle not in products:
            order.append(handle)
            products[handle] = {
                "handle": handle,
                "slug": handle,
                "title": "",
                "description": None,
                "brand": BRAND,
                "price": 0.0,
                "compareAtPrice": None,
                "discountPercent": None,
                "images": [],
                "_images_seen": set(),
                "sizes": [],
                "_sizes_seen": set(),
                "category": CATEGORY,
                "tags": [CATEGORY.lower()],
                "_type": row["Type"].strip(),
            }

        product = products[handle]

        if is_new_product:
            title = row["Title"].strip()
            product["title"] = TITLE_OVERRIDES.get(handle, title)
            product["description"] = clean_description(row["Body (HTML)"])
            price = parse_price(row["Variant Price"])
            compare_at_raw = row["Variant Compare At Price"].strip()
            compare_at = parse_price(compare_at_raw) if compare_at_raw else None
            product["price"] = price
            product["compareAtPrice"] = compare_at if compare_at and compare_at > price else None
            if product["compareAtPrice"]:
                discount = round((1 - price / product["compareAtPrice"]) * 100)
                product["discountPercent"] = discount if discount > 0 else None

        size_value = row["Option1 Value"].strip()
        if size_value:
            label = "ÚNICO" if size_value == "Default Title" else size_value
            if label not in product["_sizes_seen"]:
                product["_sizes_seen"].add(label)
                product["sizes"].append(label)

        image_src = row["Image Src"].strip()
        if image_src and image_src not in product["_images_seen"]:
            product["_images_seen"].add(image_src)
            product["images"].append(image_src)

    result = []
    skipped_no_price = []
    for handle in order:
        product = products[handle]
        del product["_images_seen"]
        del product["_sizes_seen"]
        type_tag = product.pop("_type").lower()
        if type_tag and type_tag not in product["tags"]:
            product["tags"].append(type_tag)
        product["sizes"].sort(key=size_sort_key)
        if not product["title"]:
            product["title"] = normalize_title(handle)
        if product["price"] <= 0:
            skipped_no_price.append(handle)
            continue
        result.append(product)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"{len(result)} produtos convertidos -> {out_path}")
    if skipped_no_price:
        print(f"AVISO: {len(skipped_no_price)} produto(s) sem preço, pulados: {skipped_no_price}")
        print(f"AVISO: {len(leftover)} produto(s) do catálogo não encontrados na ordem do site (anexados ao final): {[p['handle'] for p in leftover]}")
    with_vtex_cleanup = sum(1 for p in result if p["description"])
    print(f"{with_vtex_cleanup} produtos com descrição não vazia após limpeza")


if __name__ == "__main__":
    main()
