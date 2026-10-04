# Navčas

**Materiál pro výrobu.** Přehled fyzického pokrytí zakázek, očekávaných dodávek, nedostatků a dopadů změn priorit. React + Fastify + přesný doménový výpočet, produkční PostgreSQL a OIDC přihlášení. Web může být instalovaný jako PWA; instalace EXE není potřebná.

## Lokální ukázka

Doporučený runtime je Node 24 LTS. Lokálně ověřeno na Node 22.19.0. Ve Windows Defenderu nic nevypínejte.

```powershell
npm.cmd ci
npm.cmd run dev
```

Otevřete http://127.0.0.1:5173. API běží na 3001. Ukázka používá syntetická data a izolované dočasné relace, které platí dvě hodiny. Restart serveru je ukončí. Nikdy do ukázky nevkládejte firemní exporty nebo přístupové údaje.

Sestavená lokální ukázka:

```powershell
npm.cmd run build
npm.cmd start
```

Otevřete http://127.0.0.1:3001. Service worker se registruje jen v sestavené verzi. Cache obsahuje veřejné ikony a neutrální offline stránku; neukládá výrobní data ani API. Fonty jsou lokální. localStorage ani sessionStorage se nepoužívají.

## Produkční režim

[Návod nasazení](docs/deployment.md) obsahuje konfiguraci PostgreSQL, oddělení runtime/migrační role, OIDC, HTTPS/Caddy, Docker, první firmu a zálohy. [Import dat](docs/data-import.md) vymezuje skutečný vstupní formát.

Produkční server se spouští z `dist/server/apps/api/server.js` s NODE_ENV=production. Vyžaduje platnou konfiguraci a funkční DB i OIDC discovery; nemá fallback na demo. Základ konfigurace je .env.example, skutečné hodnoty patří do správce tajemství nebo ignorovaného .env.production.

- Trvalé firemní plány, atomické verze, neměnné vstupní revize a audit uložení/importů.
- OIDC Authorization Code + PKCE/state/nonce, pouze předem přidělené členství, bez registrace podle e-mailu.
- Role viewer/planner/admin, revokace sessions a členství, kontrola oprávnění při každém požadavku.
- Parametrizované SQL a FORCE RLS s tenantem odvozeným z identity, ne z těla požadavku.
- Secure HttpOnly cookie, CSRF, exact Origin/Host, explicitní důvěryhodná proxy a limity sdílené v PostgreSQL.
- Výpočet mimo HTTP event loop, fronta nejvýše osmi úloh, časový limit a omezený rozsah plánu.
- Kontrola importu před potvrzením; změna datasetu zneplatní staré verze scénářů.

Nejde o hotový automatický konektor ABRA Flexi ani doklad fyzického stavu skladu. První pilot vyžaduje ověřenou normalizaci množství a rezervací s konkrétní firmou. Produkční identita, doména, údaje podnikatele, právní dokumenty a obnova DB se ověřují ve skutečném stagingu před zákaznickým provozem.

## Výpočetní pravidla

Fyzická zásoba a očekávané příjmy se vyhodnocují zvlášť. Dostupné komponenty prioritnější zakázky zůstávají chráněné i při chybě jiné komponenty. Pozdější dodávka nejprve pokryje starší neuspokojenou potřebu. Datum příjmu ve stejný den jako potřeba znamená závislost na dodávce. Neověřené kusovníky, termíny a rezervace se nezaměňují za zelený výsledek. Výpočet neoptimalizuje maximální počet dokončených výrobků a nepotvrzuje kapacitu pracovišť.

## Kontroly

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
node scripts/check-worker.mjs
npm.cmd exec -- playwright install chromium firefox webkit
npm.cmd run test:e2e
npm.cmd run security:scan
npm.cmd run format:check
```

PGlite testuje PostgreSQL SQL/RLS/rollback lokálně. CI navíc spouští stejnou databázovou sadu nad PostgreSQL 17 a sestavuje Docker image; výsledky CI sledujte v GitHub Actions. UI testy produkčního importu používají řízené odpovědi; nenahrazují ověření reálného poskytovatele identity. [Protokol](docs/verification-2026-10-04.md) uvádí provedené kontroly a meze.

Při běžícím lokálním serveru `node scripts/inspect-ui.mjs` pořídí screenshoty. `node scripts/check-pwa.mjs` prověří sestavenou PWA na portu 3001. `npm run benchmark` měří výpočet nad syntetickým velkým plánem.

## Struktura a obchodní ověření

apps/api obsahuje HTTP routy, bezpečnost, identity, databázovou službu a výpočetní frontu. apps/web obsahuje responzivní rozhraní a samostatné komponenty. packages/contracts definuje formát; packages/domain je čistý engine bez sítě. fixtures jsou výhradně syntetické.

[G0 a obchodní brány](docs/G0-validace-a-obchodni-brany.md), [bezpečnost](SECURITY.md), [právní podklady](docs/legal-launch-pack.md), [audit rozhraní](docs/visual-business-audit-2026-10.md). CLI `npm run validate:data -- --demo` nebo `--input cesta.json` vytváří JSON a kontrolní CSV bez webu; není Flexi konektorem.

Kontakt: David Švajda, svajdada@gmail.com. Produkt není provozovaný Univerzitou Palackého.
