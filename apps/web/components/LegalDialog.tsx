import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { ServiceInfo } from "../lib/brand";
export type LegalSection = "privacy" | "cookies" | "terms";
const titles = {
  privacy: "Soukromí v demonstrátoru",
  cookies: "Cookies a ukládání v prohlížeči",
  terms: "Podmínky používání demonstrátoru",
};
export function LegalDialog({
  section,
  close,
  operator,
}: {
  section: LegalSection | null;
  close: () => void;
  operator?: ServiceInfo["operator"];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (section) ref.current?.showModal();
    else ref.current?.close();
  }, [section]);
  return (
    <dialog
      ref={ref}
      className="detail-dialog legal-dialog"
      aria-labelledby="legal-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      {section && (
        <div className="detail-content">
          <div className="detail-heading">
            <div>
              <span className="eyebrow">
                INFORMACE O TÉTO VERZI · 4. 10. 2026
              </span>
              <h2 id="legal-title">
                {operator && section === "cookies"
                  ? "Cookies a pracovní relace"
                  : titles[section]}
              </h2>
            </div>
            <button
              autoFocus
              className="icon-button"
              aria-label="Zavřít právní informace"
              onClick={close}
            >
              <X />
            </button>
          </div>
          {operator ? (
            <p>
              <strong>Provozovatel:</strong> {operator.name}, IČO {operator.ico}
              , {operator.address}. Kontakt:{" "}
              <a href={`mailto:${operator.email}`}>{operator.email}</a>.
            </p>
          ) : (
            <p>
              <strong>Autor a kontaktní osoba:</strong> David Švajda,{" "}
              <a href="mailto:svajdada@gmail.com">svajdada@gmail.com</a>.
              Demonstrátor není službou Univerzity Palackého a neuvádí
              univerzitu jako provozovatele.
            </p>
          )}
          {operator && section !== "cookies" && (
            <p>
              <a
                href={
                  section === "privacy"
                    ? operator.privacyUrl
                    : operator.termsUrl
                }
              >
                Otevřít úplné informace{" "}
                {section === "privacy" ? "o soukromí" : "o podmínkách služby"}
              </a>
            </p>
          )}
          {!operator && section === "privacy" && (
            <>
              <h3>Co tato aplikace zpracovává</h3>
              <p>
                Ukázkové zakázky jsou syntetické. Aplikace se nepřipojuje k
                firemnímu ERP. Pro oddělení vašich změn používá náhodný
                identifikátor relace a upravený scénář v operační paměti
                serveru. Relace platí nejvýše dvě hodiny; restart serveru ji
                ukončí. Jména ani citlivé údaje do názvu scénáře nevkládejte.
              </p>
              <p>
                Síťovou IP adresu server používá k omezení počtu požadavků v
                minutových intervalech. Aplikační přístupové logy jsou vypnuté.
                Cookie a bezpečnostní token nejsou předávány analytickým
                službám. Fonty i ikony poskytuje stejný server.
              </p>
              <h3>Kontakt e-mailem</h3>
              <p>
                Kliknutí na e-mail otevře váš poštovní program. Nic se
                automaticky neodesílá. Pokud napíšete, vaše zpráva a adresa
                slouží k vyřízení dotazu; poskytovatel e-mailu je Google.
                Neposílejte přístupová hesla ani exporty účetnictví.
              </p>
              <h3>Dotazy k údajům</h3>
              <p>
                Požadavek na přístup, opravu nebo výmaz údajů můžete poslat na
                uvedený kontakt. Rozsah práv a právní důvod závisí na skutečném
                zpracování. Před veřejným sběrem zákaznických údajů musí být
                doplněna úplná informace podle GDPR včetně právních důvodů,
                příjemců a retenčních lhůt. Tato stránka popisuje lokální
                demonstrátor, nikoli budoucí placený provoz.
              </p>
            </>
          )}
          {section === "cookies" && (
            <>
              <h3>Pouze nezbytné technické použití</h3>
              <p>
                Cookie <code>{operator ? "__Host-navcas" : "mh_demo"}</code>{" "}
                uchovává šifrovaný identifikátor pracovní relace po dobu nejvýše
                dvou hodin. Chrání oddělení pracovního prostoru. Je HttpOnly.{" "}
                {operator
                  ? "Používá Secure, HTTPS a SameSite=Lax pro návrat z firemního přihlášení. Odhlášení zruší relaci na serveru. Uložené firemní plány zůstávají v databázi."
                  : "Používá SameSite=Strict. V lokálním HTTP prostředí nepoužívá Secure."}
              </p>
              <p>
                V sestavené aplikaci může service worker uložit veřejné ikony a
                neutrální offline stránku. Neukládá zakázky, výsledky,
                bezpečnostní token ani exporty. localStorage ani sessionStorage
                aplikace nepoužívá.
              </p>
              <p>
                Reklamní cookies, analytické měření a cizí sledovací skripty
                nejsou zapnuté. Cookie lišta pro souhlas s nimi proto není
                zobrazena. Případné budoucí nepovinné sledování musí být
                zavedeno se samostatným předchozím souhlasem a stejně dostupným
                odmítnutím.
              </p>
              <p>
                Technické ukládání lze odstranit v nastavení webu v prohlížeči.
                Odstraněním cookie ztratíte přístup k uloženému ukázkovému
                scénáři.
              </p>
              <p>
                <a
                  href="https://uoou.gov.cz/verejnost/qa-otazky-a-odpovedi/cookies"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Vysvětlení technických cookies od ÚOOÚ
                </a>
              </p>
            </>
          )}
          {!operator && section === "terms" && (
            <>
              <h3>Účel ukázky</h3>
              <p>
                Demonstrátor slouží k vyzkoušení materiálového pokrytí nad
                modelovou firmou. Nevzniká objednávka, předplatné ani platební
                povinnost. Placená služba zatím není nabízena k objednání.
              </p>
              <h3>Rozsah a omezení</h3>
              <p>
                Výpočet pracuje s jedním materiálovým skladem a jednoduchým
                kusovníkem. Rozlišuje fyzický sklad, očekávanou dodávku a
                chybějící materiál. Nepotvrzuje kapacitu výroby ani skutečný
                termín dodavatele. Výstup ukázky nepoužívejte jako podklad pro
                reálnou objednávku nebo řízení výroby.
              </p>
              <h3>Ukládání a dostupnost</h3>
              <p>
                Scénáře jsou dočasné, izolované podle prohlížečové relace a po
                restartu nebo vypršení relace nejsou dostupné. Export lze
                stáhnout do vašeho zařízení. Pro demonstrátor není sjednáno SLA
                ani placená podpora.
              </p>
              <h3>Budoucí placená spolupráce</h3>
              <p>
                Zamýšlený produkt je určen firmám a podnikatelům. Před
                objednávkou musí být identifikován skutečný podnikatel, doplněny
                jeho údaje a písemně sjednány cena, podporovaný rozsah, podpora,
                ukončení služby a případné zpracování dat. Samotná tato stránka
                placenou smlouvu neuzavírá a nenahrazuje její přípravu.
              </p>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
