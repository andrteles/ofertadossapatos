import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPrice } from "@/lib/format";
import {
  getOrdersAuthState,
  listOrders,
  markOrderDispatched,
  type OrderListItem,
} from "@/lib/orders-admin";
import { loginPixel, logoutPixel } from "@/lib/pixel-settings";

export const Route = createFileRoute("/pedidos")({
  loader: async () => {
    const auth = await getOrdersAuthState();
    if (!auth.authenticated) return { ...auth, orders: null };
    const orders = await listOrders();
    return { ...auth, orders };
  },
  head: () => ({ meta: [{ title: "Pedidos — Outlet" }] }),
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
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
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
    <form onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-4">
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

function OrdersTable({ orders, onLogout }: { orders: OrderListItem[]; onLogout: () => void }) {
  const router = useRouter();
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  async function handleLogout() {
    await logoutPixel();
    onLogout();
  }

  async function handleDispatch(orderId: string) {
    setDispatchingId(orderId);
    let result: Awaited<ReturnType<typeof markOrderDispatched>>;
    try {
      result = await markOrderDispatched({ data: { orderId } });
    } catch (error) {
      console.error(error);
      toast.error("Erro de conexão com o servidor. Tente novamente.");
      setDispatchingId(null);
      return;
    }
    setDispatchingId(null);
    if (!result.ok) {
      toast.error("Não foi possível marcar como enviado.");
      return;
    }
    toast.success("Pedido marcado como enviado");
    router.invalidate();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleLogout}
          className="text-sm font-medium text-foreground underline underline-offset-2 hover:text-primary"
        >
          Sair
        </button>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(order.createdAt).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell>
                  <p className="font-medium">{order.customerName}</p>
                  {order.customerPhone ? (
                    <p className="text-xs text-muted-foreground">{order.customerPhone}</p>
                  ) : null}
                </TableCell>
                <TableCell className="max-w-xs text-xs">{order.address}</TableCell>
                <TableCell className="text-xs">
                  {order.items.map((item, index) => (
                    <p key={index}>{item}</p>
                  ))}
                </TableCell>
                <TableCell className="font-medium">{formatPrice(order.amount)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_CLASS[order.status] ?? ""}>
                    {STATUS_LABEL[order.status] ?? order.status}
                  </Badge>
                  {order.dispatchedAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Enviado em {new Date(order.dispatchedAt).toLocaleDateString("pt-BR")}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  {order.status === "paid" && !order.dispatchedAt ? (
                    <Button
                      size="sm"
                      disabled={dispatchingId === order.id}
                      onClick={() => handleDispatch(order.id)}
                    >
                      {dispatchingId === order.id ? "Salvando..." : "Marcar como enviado"}
                    </Button>
                  ) : order.dispatchedAt ? (
                    <span className="text-xs text-muted-foreground">Enviado</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
