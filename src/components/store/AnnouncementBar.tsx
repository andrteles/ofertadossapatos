import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const announcements = [
  "Frete Grátis para todo Brasil",
  "Garantia de troca em 30 dias, direto com a loja",
];

export function AnnouncementBar() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((current) => (current + 1) % announcements.length);
        setVisible(true);
      }, 300);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-primary py-2.5 text-center text-[11px] font-bold tracking-wide text-primary-foreground uppercase">
      <span
        className={cn(
          "inline-block transition-all duration-300 ease-in-out",
          visible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
        )}
      >
        {announcements[index]}
      </span>
    </div>
  );
}
