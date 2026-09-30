import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { getPublicTrackingConfig, type PublicTrackingConfig } from "@/lib/tracking";
import { captureTrackingParameters } from "@/lib/utm";

declare global {
  interface Window {
    ttq?: {
      load: (pixelId: string) => void;
      page: () => void;
      track: (
        event: string,
        data?: Record<string, unknown>,
        options?: { event_id?: string },
      ) => void;
    };
    /** Pixel da Meta — vem embutido no script que a Utmify fornece, não é injetado por nós. */
    fbq?: (
      command: "track",
      event: string,
      data?: Record<string, unknown>,
      options?: { eventID?: string },
    ) => void;
  }
}

/** Recria e injeta HTML de terceiros no DOM garantindo que os <script> internos executem
 * (innerHTML/dangerouslySetInnerHTML por si só não executa scripts). */
function injectRawHtml(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  Array.from(template.content.childNodes).forEach((node) => {
    if (node instanceof HTMLScriptElement) {
      const script = document.createElement("script");
      Array.from(node.attributes).forEach((attr) => script.setAttribute(attr.name, attr.value));
      script.text = node.text;
      document.body.appendChild(script);
    } else {
      document.body.appendChild(node.cloneNode(true));
    }
  });
}

function loadTikTokPixel(pixelId: string) {
  if (window.ttq) {
    window.ttq.page();
    return;
  }
  const script = document.createElement("script");
  script.text = `
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<e.methods.length;n++)ttq.setAndDefer(e,e.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=i+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
      ttq.load('${pixelId}');
      ttq.page();
    }(window, document, 'ttq');
  `;
  document.body.appendChild(script);
}

export function TrackingScripts() {
  const router = useRouter();
  const [config, setConfig] = useState<PublicTrackingConfig | null>(null);
  const installed = useRef(false);

  useEffect(() => {
    captureTrackingParameters();
    getPublicTrackingConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    if (!config || installed.current) return;
    installed.current = true;

    if (config.utmifyHtml) injectRawHtml(config.utmifyHtml);
    if (config.tiktokPixelId) loadTikTokPixel(config.tiktokPixelId);
  }, [config]);

  useEffect(() => {
    if (!config?.tiktokPixelId) return undefined;
    return router.subscribe("onResolved", () => {
      window.ttq?.page();
    });
  }, [router, config?.tiktokPixelId]);

  return null;
}
