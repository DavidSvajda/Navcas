# Rozhodnutí první implementace

## Dodané vertikální řešení

Použili jsme první část G1: syntetický vstup → validace → výpočet na serveru → přehled a vysvětlení → scénář → uložení s verzováním → export. Tento průchod lze ukázat a testovat bez přístupu k zákaznické firmě. Není vydáván za dokončený G0 důkaz integrace.

Výpočetní jádro je čistá funkce. Decimal.js používá vlastní konstruktor s přesností 48 číslic; vstupní a výstupní množství jsou řetězce. Formátování v UI je pouze zobrazení a nevrací čísla do výpočtu.

Scénář nahradí jen explicitně podporované termíny a priority. ID musí existovat v datasetu. Duplicitní ID a neznámá pole jsou odmítnuta. Vstupní referenční plán se nemění. Validace neověřuje, že zákazník skutečně má daný materiál ve skladu.

## Pozdní příjmy

Nedostatek v datu potřeby zůstává zaznamenaný. Příjmy dostupné později nejdřív uspokojí starší nezajištěnou potřebu. Každý příjem má zůstatek, takže ho nelze znovu použít pro jinou zakázku. Čistý deficit vychází ze zbývajících neuspokojených potřeb na konci horizontu. Vlastní fyzické rezervace se nevracejí do obecného poolu, ani pokud přesahují potřebu příslušné zakázky.

## Stav po restartu

Paměťové uložení je vymezená vlastnost demonstrátoru, viditelná také přímo v editoru. Nezavádíme pro skutečný SaaS náhradní souborovou databázi. Následuje PostgreSQL s historií, tenant isolation a atomickým publikováním. Demo API neobsahuje zákaznické přihlašovací údaje.

## PWA

Manifest a ikony umožňují nabídku instalace v podporovaném browseru. Registrace workeru je jen v sestavené aplikaci. Cache má přesný seznam veřejných ikon a offline stránky. Navigace se zkouší přes síť; při výpadku zobrazí neutrální stránku, nikoli poslední výsledky. Nová verze nepřebírá otevřené okno s rozepsaným scénářem násilným skipWaiting.

## Vývoj a verze

Produkční cílový runtime z návrhu zůstává Node 24 LTS. Lokálně byl dostupný Node 22.19.0, který splňuje nainstalovaný Vite. package-lock.json je zdroj reprodukovatelné instalace. Bezpečnostní kontrola vedla k použití opravené @fastify/static 10.1.5; podle přibalené dokumentace podporuje Fastify 5. Nasazení a obsluha sestavených souborů se ověřují lokálním smoke testem.

## Připravené rozhraní pro další práci

- `calculatePlan(PlanInput): PlanResult`
- `applyScenario(PlanInput, Scenario): PlanInput`
- `createApp()`: izolovaná instance API pro integrační testy
- `GET /api/v1/workspace`
- `POST /api/v1/scenarios/preview`
- `PUT /api/v1/scenario` s `expectedVersion`
- `GET /api/v1/exports/materials.csv?view=baseline|scenario&version=0` (verze je povinná pro scénář)

Endpointy jsou demonstrátorové. Zákaznické endpointy potřebují organizaci a skutečné ověření členství, nikoli jen přidání organizationId do URL.

## Audit 4. října 2026

API je rozdělené na továrnu aplikace, bezpečnostní middleware, routy, chybové odpovědi a službu pracovního stavu. Služba ukládá oddělené relace s absolutní dvouhodinovou platností a vrací kopie stavu. Výsledek uloženého scénáře se při čtení zbytečně nepřepočítává. Krátkodobý klíč cookie vzniká při startu; v demonstrátoru není potřeba soubor s klíčem. Pro více produkčních instancí tento model nepostačuje.

Výpočet používá indexy komponent, rezervací a dodávek místo opakovaného procházení celých kolekcí. Pravidla přidělení materiálu se nemění. Přesné formátování desetinných množství v UI už neprovádí ztrátový převod přes JavaScript Number.

Materiálový přehled, detail zakázky, právní dialog, průvodce ověřením a formátování jsou samostatné moduly. API klient sdílí probíhající inicializaci relace, aby vývojový React StrictMode nezaložil souběžně dvě relace. Neúspěšný export zachová otevřenou aplikaci i scénář.

Bezpečnostní zásady jsou v SECURITY.md, skutečné výsledky v verification-2026-10-04.md. Cookie relace odděluje ukázkové pracovní prostory; nenahrazuje budoucí ověření identity a oprávnění zákazníků.
