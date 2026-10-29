"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { INSTALL_READY_EVENT } from "../components/PwaSetup";

type Platform = "ios" | "android" | "desktop";

const detectPlatform = (): Platform => {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, but has touch.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
};

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const cardClass = "rounded-xl border bg-card text-card-foreground shadow p-6";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {n}
      </span>
      <div className="pt-0.5 text-sm text-foreground">{children}</div>
    </li>
  );
}

// Public page (no login) that the company website links to.
export default function InstallClient() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    const update = () => setCanPrompt(Boolean(window.flexitInstallPrompt));
    update();
    window.addEventListener(INSTALL_READY_EVENT, update);
    window.addEventListener("appinstalled", () => setDone(true));
    return () => window.removeEventListener(INSTALL_READY_EVENT, update);
  }, []);

  const install = async () => {
    const prompt = window.flexitInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    window.flexitInstallPrompt = null;
    setCanPrompt(false);
    if (choice.outcome === "accepted") setDone(true);
  };

  return (
    <div className="App">
      <main className="container mx-auto max-w-xl px-4 py-8 pb-20">
        <div className="space-y-4">
          <div className={`${cardClass} flex items-center gap-4`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192.png" alt="Flexit" className="h-16 w-16 rounded-2xl" />
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                <span className="text-[#cfb40b]">Flexit</span> տերմինալ
              </h1>
              <p className="text-sm text-muted-foreground">Տեղադրեք հավելվածը ձեր հեռախոսում</p>
            </div>
          </div>

          {installed || done ? (
            <div className={`${cardClass} space-y-3 text-center`}>
              <p className="text-lg font-semibold text-foreground">✅ Հավելվածը տեղադրված է</p>
              <p className="text-sm text-muted-foreground">Բացեք այն գլխավոր էկրանի «Flexit» պատկերակից։</p>
              <Link href="/" className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Բացել տերմինալը
              </Link>
            </div>
          ) : platform === "ios" ? (
            <div className={`${cardClass} space-y-4`}>
              <h2 className="font-semibold text-foreground">iPhone / iPad</h2>
              <ol className="space-y-4">
                <Step n={1}>
                  Բացեք այս էջը <b>Safari</b>-ով (եթե բացել եք այլ բրաուզերով, պատճենեք հասցեն և բացեք Safari-ում)։
                </Step>
                <Step n={2}>
                  Ներքևում սեղմեք <b>«Կիսվել»</b> կոճակը{" "}
                  <span className="inline-block rounded border border-input px-1.5 align-middle" aria-hidden="true">
                    <svg viewBox="0 0 24 24" className="inline h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v12" />
                      <path d="m8 7 4-4 4 4" />
                      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
                    </svg>
                  </span>{" "}
                  (քառակուսի՝ վերև սլաքով)։
                </Step>
                <Step n={3}>
                  Ցուցակում ընտրեք <b>«Ավելացնել գլխավոր էկրանին»</b> (ռուսերեն՝ «На экран „Домой“», անգլերեն՝ «Add to Home Screen»)։
                </Step>
                <Step n={4}>
                  Սեղմեք <b>«Ավելացնել»</b>։ Գլխավոր էկրանին կհայտնվի <b>Flexit</b> պատկերակը։
                </Step>
              </ol>
            </div>
          ) : (
            <div className={`${cardClass} space-y-4`}>
              <h2 className="font-semibold text-foreground">{platform === "android" ? "Android" : "Համակարգիչ"}</h2>
              {canPrompt ? (
                <button
                  type="button"
                  onClick={install}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-base font-semibold text-primary-foreground shadow hover:bg-primary/90"
                >
                  📲 Տեղադրել հավելվածը
                </button>
              ) : (
                <ol className="space-y-4">
                  <Step n={1}>Բացեք այս էջը <b>Chrome</b>-ով։</Step>
                  <Step n={2}>
                    Վերևում աջ կողմում սեղմեք <b>⋮</b> (երեք կետ)։
                  </Step>
                  <Step n={3}>
                    Ընտրեք <b>«Տեղադրել հավելվածը»</b> կամ <b>«Ավելացնել գլխավոր էկրանին»</b> (ռուսերեն՝ «Установить приложение»)։
                  </Step>
                </ol>
              )}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Հավելվածը թարմանում է ինքնաբերաբար, նորից տեղադրել պետք չէ։
          </p>
        </div>
      </main>
    </div>
  );
}
