export function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatInstallmentsComJuros(value: number, installments = 12, juros = 0.06): string {
  const parcela = (value * (1 + juros)) / installments;
  return `${installments}x de ${formatPrice(parcela)}`;
}

export function isSingleSize(size: string): boolean {
  return size === "ÚNICO" || size === "UN";
}
