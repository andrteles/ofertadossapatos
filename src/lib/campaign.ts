import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { useEffect, useState } from "react";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

type AdPlatform = "tiktok" | "meta";

const SESSION_KEY = "ferraciniLogoUnlocked";

interface CheckAdClickInput {
  clickId: string;
  platform: AdPlatform;
  secret: string;
}

// Um click ID de verdade (ttclid/fbclid) é um token opaco de alta entropia
// gerado pela própria plataforma de anúncio — na prática sempre bem mais
// longo que 100 caracteres (ttclid pode chegar a 1.000; fbclid no formato
// atual passa fácil de 200, confirmado com um anúncio real). Esse limiar não
// confirma que o clique é genuíno, mas barra em segundos qualquer tentativa
// manual de forjar o parâmetro na URL (ex.: alguém do gateway testando
// "?ttclid=teste123"), que é a ameaça real aqui — não existe endpoint
// público das plataformas pra validar o ID de fato, então essa checagem de
// formato é a defesa prática disponível.
const CLICK_ID_CHARSET = /^[A-Za-z0-9_.-]+$/;
const MIN_LENGTH: Record<AdPlatform, number> = {
  tiktok: 100,
  meta: 100,
};

function isPlausibleClickId(clickId: string, platform: AdPlatform): boolean {
  return clickId.length >= MIN_LENGTH[platform] && CLICK_ID_CHARSET.test(clickId);
}

// Terceira camada: os anúncios só rodam para celular, então todo clique de
// verdade chega com um User-Agent de navegador mobile, e como as únicas
// plataformas usadas são TikTok e Meta, exigimos também a assinatura do
// navegador embutido do próprio app — é o que abre quando alguém toca no
// anúncio direto do feed do TikTok ou do Instagram/Facebook, e tem tokens
// próprios no UA ("musical_ly"/"bytedancewebview" no TikTok; "FBAN"/"FBAV"/
// "Instagram" no Meta) que um navegador comum de computador nunca tem. Pra
// forjar isso, quem está testando precisaria abrir o link de dentro do app de
// verdade no celular — bem mais trabalho que só colar uma URL no desktop.
// Lido direto do header real da requisição (getRequestHeader), não de algo
// que o navegador manda no corpo — não dá pra falsificar só editando o
// payload do JS.
const MOBILE_UA_PATTERN = /Mobi|Android|iPhone|iPad/i;
const PLATFORM_UA_PATTERN: Record<AdPlatform, RegExp> = {
  tiktok: /musical_ly|bytedancewebview|tiktok/i,
  meta: /FBAN|FBAV|FB_IAB|Instagram/i,
};

function isPlausibleUserAgent(userAgent: string | undefined, platform: AdPlatform): boolean {
  if (!userAgent || !MOBILE_UA_PATTERN.test(userAgent)) return false;
  return PLATFORM_UA_PATTERN[platform].test(userAgent);
}

// Segunda camada, independente do click ID: um segredo colocado à mão num
// parâmetro customizado (fora do padrão utm_*, de propósito — Meta e TikTok
// têm um recurso de "parâmetros de UTM automáticos" que auto-preenche/
// sobrescreve utm_content, utm_id, utm_term etc. com dados do próprio
// anúncio, o que apagaria qualquer valor manual colocado ali) na URL de
// destino configurada dentro do próprio gerenciador de anúncios (TikTok Ads /
// Meta Ads) — nunca aparece em lugar nenhum do código que roda no navegador,
// só é comparado aqui no servidor contra a env var. Quem só inspeciona o site
// (incluindo o dono do gateway) vê que existe uma checagem desse parâmetro,
// mas não tem como descobrir o valor que ela exige — só existe dentro do
// painel de anúncios, que é privado. Sem as duas camadas batendo (click ID
// plausível + segredo certo), a logo nunca libera.
const SECRET_PARAM = "xref";
function getCampaignSecret(): string | null {
  return process.env["CAMPAIGN_SECRET_TOKEN"] || null;
}

/** Registra o click ID na primeira vez que ele aparece (INSERT com PK em
 * click_id). Se o ID já existir — link encaminhado, aba reaberta, refresh —
 * o INSERT falha por violação de unicidade e devolvemos firstSeen: false.
 * IDs que não têm cara de click ID real (curtos demais, caracteres fora do
 * padrão), requisições cujo `secret` não bata com CAMPAIGN_SECRET_TOKEN, e
 * User-Agents incompatíveis com um clique real de anúncio mobile são
 * rejeitados antes de tocar no banco. Qualquer outra falha (banco fora do ar,
 * env vars ausentes) também devolve false: por padrão a logo fica escondida,
 * nunca aparece por engano. */
export const checkAdClick = createServerFn({ method: "POST" })
  .validator((input: CheckAdClickInput) => input)
  .handler(async ({ data }): Promise<{ firstSeen: boolean }> => {
    const campaignSecret = getCampaignSecret();
    if (!campaignSecret || data.secret !== campaignSecret) return { firstSeen: false };
    if (!isPlausibleClickId(data.clickId, data.platform)) return { firstSeen: false };
    if (!isPlausibleUserAgent(getRequestHeader("user-agent"), data.platform)) {
      return { firstSeen: false };
    }
    const admin = getSupabaseAdmin();
    if (!admin) return { firstSeen: false };
    const { error } = await admin
      .from("ad_click_ids")
      .insert({ click_id: data.clickId, platform: data.platform });
    return { firstSeen: !error };
  });

function readClickIdFromUrl(): Omit<CheckAdClickInput, "secret"> | null {
  const params = new URLSearchParams(window.location.search);
  const ttclid = params.get("ttclid");
  if (ttclid && isPlausibleClickId(ttclid, "tiktok"))
    return { clickId: ttclid, platform: "tiktok" };
  const fbclid = params.get("fbclid");
  if (fbclid && isPlausibleClickId(fbclid, "meta")) return { clickId: fbclid, platform: "meta" };
  return null;
}

// Várias partes da página (header, grade de produtos da home, da listagem e
// da página de produto) chamam useCampaignLogo() ao mesmo tempo no primeiro
// carregamento. Cada uma tentando registrar o click ID por conta própria
// faria a maioria perder a corrida contra o INSERT da primeira (o banco só
// deixa UMA ganhar) e ficar presa em "false" até a próxima montagem — era
// por isso que o nome da marca nos cards só aparecia depois de visitar um
// produto e voltar, mesmo com a logo do header já visível. Resolvendo a
// checagem uma única vez por carregamento de página e compartilhando o
// mesmo resultado entre todos os chamadores evita essa corrida.
let resolved: boolean | null = null;
let pending: Promise<boolean> | null = null;

async function resolveCampaignLogo(): Promise<boolean> {
  if (resolved !== null) return resolved;
  if (pending) return pending;

  pending = (async () => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") return true;
    } catch {
      // sessionStorage indisponível (ex.: modo privado) — segue sem cache
    }

    const click = readClickIdFromUrl();
    const secret = click ? new URLSearchParams(window.location.search).get(SECRET_PARAM) : null;
    if (!click || !secret) return false;

    const show = await checkAdClick({ data: { ...click, secret } })
      .then((result) => result.firstSeen)
      .catch(() => false);

    if (show) {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // sem sessionStorage, a logo só fica visível nesta navegação
      }
    }
    return show;
  })();

  resolved = await pending;
  pending = null;
  return resolved;
}

/** true só para quem clicou de verdade num anúncio (TikTok Ads ou Meta Ads,
 * nessa ordem de prioridade — únicas plataformas usadas) — nunca para
 * tráfego orgânico/direto, e nunca duas vezes para o mesmo clique, mesmo que
 * o link com os mesmos parâmetros seja encaminhado ou reaberto depois. */
export function useCampaignLogo(): boolean {
  const [show, setShow] = useState(resolved ?? false);

  useEffect(() => {
    if (resolved !== null) {
      setShow(resolved);
      return;
    }
    let active = true;
    resolveCampaignLogo().then((result) => {
      if (active) setShow(result);
    });
    return () => {
      active = false;
    };
  }, []);

  return show;
}
