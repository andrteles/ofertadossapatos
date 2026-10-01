import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { getOrdersAuthState, listOrders, type OrderListItem } from "@/lib/orders-admin";
import { getPageNumbers } from "@/lib/pagination";
import { loginPixel, logoutPixel } from "@/lib/pixel-settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pedidos")({
  loader: async () => {
    const auth = await getOrdersAuthState();
    if (!auth.authenticated) return { ...auth, orders: null };
    const orders = await listOrders();
    return { ...auth, orders };
  },
  head: () => ({ meta: [{ title: "Outlet" }] }),
  component: PedidosPage,
});

const inputClass =
  "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  failed: "Falhou",
  expired: "Expirado",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  expired: "bg-red-100 text-red-800",
};

function PedidosPage() {
  const data = Route.useLoaderData();
  const router = useRouter();

  if (!data.hasPassword) {
    return (
      <PedidosShell title="Pedidos">
        <p className="text-sm text-muted-foreground">
          Nenhuma senha configurada ainda. Defina uma senha em{" "}
          <Link to="/pixel" className="font-medium text-foreground underline underline-offset-2">
            /pixel
          </Link>{" "}
          primeiro.
        </p>
      </PedidosShell>
    );
  }

  if (!data.authenticated) {
    return (
      <PedidosShell title="Pedidos">
        <LoginForm onDone={() => router.invalidate()} />
      </PedidosShell>
    );
  }

  return (
    <PedidosShell title="Pedidos">
      <OrdersTable orders={data.orders!} onLogout={() => router.invalidate()} />
    </PedidosShell>
  );
}

function PedidosShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
      <div className="mt-8">{children}</div>
    </div>
  );
}

function LoginForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    let result: Awaited<ReturnType<typeof loginPixel>>;
    try {
      result = await loginPixel({ data: { password } });
    } catch (error) {
      console.error(error);
      toast.error("Erro de conexão com o servidor. Tente novamente.");
      setLoading(false);
      return;
    }
    setLoading(false);
    if (!result.ok) {
      toast.error("Senha incorreta.");
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Senha
        </label>
        <input
          id="password"
          type="password"
          required
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full font-bold text-white sm:w-fit">
        {loading ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

const PAGE_SIZE = 10;

function OrdersTable({ orders, onLogout }: { orders: OrderListItem[]; onLogout: () => void }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageOrders = orders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function handleLogout() {
    await logoutPixel();
    onLogout();
  }

  return (
    <div className="flex flex-col gap-6">
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {pageOrders.map((order) => (
            <div key={order.id} className="flex flex-col gap-3 rounded-md border border-input p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{order.customerName}</p>
                  {order.customerPhone ? (
                    <p className="text-xs text-muted-foreground">{order.customerPhone}</p>
                  ) : null}
                </div>
                <Badge variant="outline" className={STATUS_CLASS[order.status] ?? ""}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{order.address}</p>
              <div className="text-xs">
                {order.items.map((item, index) => (
                  <p key={index}>{item}</p>
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  {new Date(order.createdAt).toLocaleString("pt-BR")}
                </p>
                <p className="text-sm font-medium">{formatPrice(order.amount)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label="Paginação"
          className="flex flex-wrap items-center justify-center gap-1 text-sm"
        >
          <button
            type="button"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="rounded-md px-3 py-1.5 font-medium hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
          >
            Anterior
          </button>
          {getPageNumbers(currentPage, totalPages).map((item, index) =>
            item === "..." ? (
              <span key={`ellipsis-${index}`} className="px-1.5 text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => setPage(item)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full font-medium hover:bg-secondary",
                  item === currentPage &&
                    "border-2 border-primary font-bold text-primary hover:bg-transparent",
                )}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="rounded-md px-3 py-1.5 font-medium hover:bg-secondary disabled:pointer-events-none disabled:opacity-40"
          >
            Próxima
          </button>
        </nav>
      ) : null}

      <div className="border-t border-border pt-6">
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm font-medium text-foreground underline underline-offset-2 hover:text-primary"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
