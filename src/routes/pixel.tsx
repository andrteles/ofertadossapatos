import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  changePixelPassword,
  getPixelAuthState,
  getPixelSettings,
  loginPixel,
  logoutPixel,
  savePixelSettings,
  setInitialPixelPassword,
} from "@/lib/pixel-settings";

export const Route = createFileRoute("/pixel")({
  loader: async () => {
    const auth = await getPixelAuthState();
    if (!auth.authenticated) return { ...auth, settings: null };
    const settings = await getPixelSettings();
    return { ...auth, settings };
  },
  head: () => ({
    meta: [{ title: "Outlet" }],
  }),
  component: PixelPage,
});

const inputClass =
  "rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-1 focus-visible:ring-ring sm:text-sm";

function PixelPage() {
  const data = Route.useLoaderData();
  const router = useRouter();

  if (!data.hasPassword) {
    return (
      <PixelShell title="Criar senha da área de rastreamento">
        <SetupPasswordForm onDone={() => router.invalidate()} />
      </PixelShell>
    );
  }

  if (!data.authenticated) {
    return (
      <PixelShell title="Área de rastreamento">
        <LoginForm onDone={() => router.invalidate()} />
      </PixelShell>
    );
  }

  return (
    <PixelShell title="Rastreamento de conversões">
      <SettingsForm settings={data.settings!} onLogout={() => router.invalidate()} />
    </PixelShell>
  );
}

function PixelShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
      <div className="mt-8">{children}</div>
    </div>
  );
}

function SetupPasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Use uma senha com pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    let result: Awaited<ReturnType<typeof setInitialPixelPassword>>;
    try {
      result = await setInitialPixelPassword({ data: { password } });
    } catch (error) {
      console.error(error);
      toast.error("Erro de conexão com o servidor. Tente novamente.");
      setLoading(false);
      return;
    }
    setLoading(false);
    if (!result.ok) {
      toast.error("Não foi possível salvar a senha. Tente novamente.");
      return;
    }
    toast.success("Senha criada");
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Nova senha
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirm" className="text-sm font-medium text-foreground">
          Confirmar senha
        </label>
        <input
          id="confirm"
          type="password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className={inputClass}
        />
      </div>
      <Button type="submit" disabled={loading} className="w-full font-bold text-white sm:w-fit">
        {loading ? "Salvando..." : "Criar senha"}
      </Button>
    </form>
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

function SettingsForm({
  settings,
  onLogout,
}: {
  settings: {
    utmifyHtml: string;
    utmifyApiToken: string;
    tiktokPixelId: string;
    tiktokAccessToken: string;
  };
  onLogout: () => void;
}) {
  const [utmifyHtml, setUtmifyHtml] = useState(settings.utmifyHtml);
  const [utmifyApiToken, setUtmifyApiToken] = useState(settings.utmifyApiToken);
  const [showUtmifyToken, setShowUtmifyToken] = useState(false);
  const [tiktokPixelId, setTiktokPixelId] = useState(settings.tiktokPixelId);
  const [tiktokAccessToken, setTiktokAccessToken] = useState(settings.tiktokAccessToken);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    let result: Awaited<ReturnType<typeof savePixelSettings>>;
    try {
      result = await savePixelSettings({
        data: { utmifyHtml, utmifyApiToken, tiktokPixelId, tiktokAccessToken },
      });
    } catch (error) {
      console.error(error);
      toast.error("Erro de conexão com o servidor. Tente novamente.");
      setSaving(false);
      return;
    }
    setSaving(false);
    if (!result.ok) {
      toast.error("Não foi possível salvar as configurações.");
      return;
    }
    toast.success("Configurações salvas");
  }

  async function handleLogout() {
    await logoutPixel();
    onLogout();
  }

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="utmify" className="text-sm font-medium text-foreground">
            Pixel da Utmify
          </label>
          <textarea
            id="utmify"
            rows={6}
            value={utmifyHtml}
            onChange={(event) => setUtmifyHtml(event.target.value)}
            className={`resize-none font-mono text-xs ${inputClass}`}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="utmifyApiToken" className="text-sm font-medium text-foreground">
            Utmify API Token
          </label>
          <div className="flex gap-2">
            <input
              id="utmifyApiToken"
              type={showUtmifyToken ? "text" : "password"}
              value={utmifyApiToken}
              onChange={(event) => setUtmifyApiToken(event.target.value)}
              className={`flex-1 ${inputClass}`}
            />
            <button
              type="button"
              onClick={() => setShowUtmifyToken((value) => !value)}
              className="shrink-0 rounded-md border border-input px-3 text-xs font-semibold hover:bg-secondary"
            >
              {showUtmifyToken ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tiktokPixelId" className="text-sm font-medium text-foreground">
            TikTok Pixel ID
          </label>
          <input
            id="tiktokPixelId"
            type="text"
            value={tiktokPixelId}
            onChange={(event) => setTiktokPixelId(event.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="tiktokAccessToken" className="text-sm font-medium text-foreground">
            TikTok Access Token (Conversions API)
          </label>
          <div className="flex gap-2">
            <input
              id="tiktokAccessToken"
              type={showToken ? "text" : "password"}
              value={tiktokAccessToken}
              onChange={(event) => setTiktokAccessToken(event.target.value)}
              className={`flex-1 ${inputClass}`}
            />
            <button
              type="button"
              onClick={() => setShowToken((value) => !value)}
              className="shrink-0 rounded-md border border-input px-3 text-xs font-semibold hover:bg-secondary"
            >
              {showToken ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>

        <Button type="submit" disabled={saving} className="w-full font-bold text-white sm:w-fit">
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </form>

      <div className="border-t border-border pt-6">
        {changingPassword ? (
          <ChangePasswordForm onDone={() => setChangingPassword(false)} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setChangingPassword(true)}
              className="text-sm font-medium text-foreground underline underline-offset-2 hover:text-primary"
            >
              Alterar senha
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm font-medium text-foreground underline underline-offset-2 hover:text-primary"
            >
              Sair
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Use uma senha com pelo menos 8 caracteres.");
      return;
    }
    setLoading(true);
    let result: Awaited<ReturnType<typeof changePixelPassword>>;
    try {
      result = await changePixelPassword({ data: { currentPassword, newPassword } });
    } catch (error) {
      console.error(error);
      toast.error("Erro de conexão com o servidor. Tente novamente.");
      setLoading(false);
      return;
    }
    setLoading(false);
    if (!result.ok) {
      toast.error("Senha atual incorreta.");
      return;
    }
    toast.success("Senha alterada");
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="currentPassword" className="text-sm font-medium text-foreground">
          Senha atual
        </label>
        <input
          id="currentPassword"
          type="password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="newPassword" className="text-sm font-medium text-foreground">
          Nova senha
        </label>
        <input
          id="newPassword"
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading} size="sm" className="font-bold text-white">
          {loading ? "Salvando..." : "Salvar nova senha"}
        </Button>
        <button
          type="button"
          onClick={onDone}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
