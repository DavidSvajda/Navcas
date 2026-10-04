# Ověření Navčas — 4. října 2026

Lokální prostředí Windows, Node 22.19.0, npm 11.7.0. Cílový runtime Node 24. CI na GitHubu ověřuje i tento runtime, síťový PostgreSQL 17 a Docker image. Lokální Docker daemon neběžel; samostatný PostgreSQL odmítl start pod administrátorským Windows účtem. Tyto serverové kontroly se proto lokálně nevydávají za úspěšné.

## Lokálně provedené kontroly

- TypeScript a sestavení webu i samostatného serveru/workeru úspěšné.
- **73 unit/API/DB testů**: 28 původních doménových, 13 hraničních, 16 demo API, 15 databázových/produkční konfigurace a 1 formátování. Dva vlastnostní testy po 150 generovaných případech.
- Databázové testy používají skutečný PostgreSQL engine PGlite: role, RLS, revize, restart služby nad stejnou DB, rollback, SQL-looking vstupy, oddělení firem, konflikty verzí, revokace a sdílený limiter. Neověřují síťovou/TLS komunikaci s hostovanou PostgreSQL.
- Prohlížečová sada má **36 testů** pro Firefox, WebKit, Chromium a mobilní emulaci Pixel 7. Kontroluje původní průchody, přístupnost, produkční login obrazovku, potvrzení importu, chybný JSON, konflikt importu a viewer oprávnění. Produkční UI používá řízené odpovědi; backend oprávnění se samostatně testují nad DB.
- První průchody odhalily nedostatečné mobilní navigování v testech a kolizi se změnami živého vývojového serveru. Fixture je nyní izolovaná. Přístupnost šesti obrazovek má 60sekundový limit; při současném sestavování se původní 30sekundový limit ukázal jako nedostatečný. Neúspěšné průchody se zopakovaly na stabilním serveru; výsledek je třeba číst spolu s aktuálním výstupem testů/CI.
- Automatická axe kontrola přístupnosti včetně importní obrazovky: bez nalezených porušení nastavených pravidel WCAG A/AA v úspěšných průchodech. Není to certifikace ani test se skutečným uživatelem čtečky.
- Sestavený worker: přesný deficit, invalidní reference, fronta nejvýše osmi úloh, zamítnutí přetížení a zotavení úspěšné.
- PWA: manifest, ikony, service worker, veřejná cache bez API, neutrální offline stránka a návrat online úspěšné.
- Vizuální kontrola desktopu/mobilu: viewport 390 px, dokument 390 px a žádný nalezený přetékající absolutní prvek. Zakázky na mobilu jsou karty.
- Npm audit včetně nových závislostí: při instalaci 0 známých advisories. Kontrola tajemství a formátování bez nálezů.

## Výkon

Syntetický profil: 500 zakázek, 10 000 položek, 100 výrobků, 2 000 řádků kusovníku, 10 000 rozvinutých potřeb a 2 000 příjmů. Původní měření přímého výpočtu [1133, 900, 871, 857, 874] ms, medián 874 ms. Není to produkční SLA a nezahrnuje nové worker-start náklady, síť, DB nebo ERP. Worker funkčnost je ověřena samostatně.

## Ještě nutné ve stagingu

Konkrétní OIDC provider s MFA a podepsanými tokeny, HTTPS/proxy, hostovaná PostgreSQL, migrace a runtime grants, Docker image na skutečném hostu, reálné zálohy a obnova, retence, skutečná firemní data a akceptace výsledku. WebKit na Windows není fyzický Safari/iPhone. Testy nezajišťují zákonnost nevyplněných podnikatelských údajů ani ochotu zákazníka zaplatit.

Dokumenty deployment.md, production-readiness.md a data-import.md uvádějí konkrétní konfiguraci a zbývající akceptaci. Žádný zákaznický export, ERP heslo ani produkční přístup nebyl do projektu vložen.
