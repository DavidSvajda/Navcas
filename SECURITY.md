# Bezpečnost Navčas

Problém oznamte soukromě na svajdada@gmail.com; nevkládejte přístupy ani zákaznické exporty do veřejných issues. Není stanovené bug bounty nebo garantované SLA reakce.

## Režimy

Lokální demo je pouze na 127.0.0.1, se syntetickými daty a dočasným odděleným stavem. Produkční režim vyžaduje konfiguraci a PostgreSQL; nevytváří automaticky demo relace ani data. Podrobnosti nasazení jsou v docs/deployment.md.

## Implementované ochrany

- OIDC Authorization Code s PKCE S256, nonce, state, jednorázovým flow a pětiminutovým callback limitem. Provider ověřuje podpis, issuer a audience přes openid-client. Hesla a MFA spravuje poskytovatel identity; účet musí mít předem povolené členství podle issuer/sub.
- Produkční šifrovaná autentizovaná cookie __Host-navcas: Secure, HttpOnly, path=/, SameSite=Lax pro OIDC redirect. Cookie obsahuje pouze identifikátor a během loginu krátkodobý flow. Serverová session je v DB dohledávaná přes SHA-256 náhodného tokenu, platí nejvýše dvě hodiny. Odhlášení či deaktivace členství zruší přístup. Ukázka má mh_demo a SameSite=Strict bez Secure pouze na lokálním HTTP.
- Každý zápis API vyžaduje CSRF token; kontrolují se Origin, Fetch Metadata, Host a v produkci HTTPS. X-Forwarded-* se respektují pouze od explicitně důvěryhodné proxy. API port nevystavovat veřejně.
- Členství a role se ověřují serverově. Organizace nepochází z klientského JSON. Parametrizované SQL; dynamický identifikátor migrační role je allowlist. FORCE RLS nad workspace, revizemi a auditem; tenant context je SET LOCAL v transakci. Runtime není superuser/BYPASSRLS a nemá právo editovat členství či historii.
- Globální limit 300/min/IP; preview 60, save 30, export 15, login 10, import 5. Route limity nahrazují globální bucket pro danou route. V produkci mají společný PostgreSQL store a při chybě store nepropouštějí požadavky. Edge ochrana proti distribuovanému DoS zůstává součástí provozu.
- Tělo obvykle 64 KiB; normalizovaný import 2 MiB. Limitovaný počet entit a rozvinutých potřeb. Produkční výpočet běží ve workeru s paměťovým omezením, nejvýše osm úloh a patnáct sekund aktivního výpočtu.
- Verze chrání souběžné uložení/import. Výpočet běží před krátkou zamykací transakcí a při zápisu se verze znovu ověří. Nový dataset nevynuluje verzi. Historie vstupních revizí je neměnná pro runtime roli.
- Striktní CSP, zákaz rámcování, nosniff, HSTS v produkci a Permissions-Policy. Statické soubory pouze z dist/web; podezřelé cesty/dotfiles jsou zamítnuté. Import přijímá JSON tělo, nikoli cestu k souboru nebo ERP URL.
- Export kontroluje uloženou verzi a neutralizuje tabulkové vzorce. Offline cache ani browser storage neuchovávají výrobní plán.
- Přístupové logy aplikace jsou vypnuté. Chybové logy uvádějí typ a request ID, ne body, tokeny či DB chyby s hodnotami. Reverse proxy, identity a DB logy mají vlastní provozní politiku.

## Meze a další provozní odpovědnost

Automatický ERP konektor není implementovaný; SSRF přes ERP URL tato verze nezavádí. Nepřidávat ho bez kontroly DNS, TLS, adres, přesměrování a práv k datům. Přesnost normalizace a fyzického skladu musí potvrdit firma.

Ochrany proti XSS/session theft nejsou zárukou proti kompromitovanému zařízení, rozšíření nebo serveru. Zapněte MFA u identity, zálohy a obnovu, omezený přístup správce, bezpečnou rotaci klíčů a sledování chyb. Rotace SESSION_KEY zneplatní cookies, ale odstraňte i serverové sessions. Produkční zálohy se musí testovat skutečnou obnovou.

Lokálně byly DB testy provedeny v PGlite. CI nad síťovým PostgreSQL a Docker build vyžadují úspěšný skutečný run. Staging musí prověřit OIDC poskytovatele, HTTPS proxy a obnovu; mockované testy rozhraní to nedokazují.

## Tajemství a commity

.env.production, klíče, zákaznické exporty a artefakty se necommitují a nevstupují do Docker build contextu. .enc přípona sama nešifruje. `security:scan` kontroluje omezené známé vzory; staged varianta kontroluje skutečný index. Není to úplné DLP.

Pre-commit hook je aktivní v tomto checkoutu. Další klony jej zapnou `git config core.hooksPath .githooks`. Zapněte ochranu main, povinné CI a dostupný secret scanning na GitHubu. Nulový npm audit není penetrační test ani certifikace.
