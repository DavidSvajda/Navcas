# Nasazení Navčas

Pro Oracle Always Free, Supabase, Auth0, bezplatnou HTTPS subdoménu, veřejné syntetické demo a šifrované zálohy použijte také [free-deployment.md](free-deployment.md). Zákaznické nasazení se Supabase používá navíc `deploy/supabase-compose.yaml` pro CA certifikát.

Stav 4. října 2026: kód obsahuje produkční režim s PostgreSQL, OIDC, oprávněními a importem normalizovaného plánu. Není to automatický Flexi konektor. Před spuštěním doplňte vlastní doménu, databázi, poskytovatele identity a skutečné informace provozovatele. Žádné z těchto přístupů není součástí repozitáře.

## Doporučená první varianta

Jedna evropská VM s Dockerem a Caddy, spravovaná PostgreSQL v EU a spravované OIDC přihlášení. Současný compose má přesnou IP důvěryhodné proxy a nevystavuje API port na internet. Tato varianta odpovídá připravené bezpečnostní konfiguraci; není nutné nasazovat frontend zvlášť na Vercel.

VM vyžaduje aktualizace systému, firewall, monitoring a odpovědného správce. Pokud to nechcete provozovat sami, Render podporuje Docker a managed Postgres, ale před přesunem ověřte přesnou topologii proxy a zdravotních kontrol; nenastavujte trustProxy=true jako zkratku. Současný compose není šablona pro Render.

Veřejná ukázka pro oslovení firem a skutečný zákaznický pilot mají jiné požadavky. Tento produkční režim zpřístupňuje pouze pozvané účty. Nekládejte do něj zákaznická data bez smluvního oprávnění. Bez založeného podnikání a doplněných podmínek neaktivujte placenou nabídku.

## 1. Databáze a dvě role

Použijte PostgreSQL 17 nebo 18 v EU, s vynuceným TLS, automatickými zálohami a ověřenou možností obnovy. Spravovaný poskytovatel má vystavit DPA a údaje o umístění i subdodavatelích. Zřiďte samostatnou databázi pro staging a produkci.

Migrační role vlastní schéma a má právo provisionovat členství. Runtime role `navcas_runtime` má LOGIN, NOSUPERUSER a NOBYPASSRLS; nesmí být členem migrační role. Její heslo nastavte přes chráněnou administraci poskytovatele. Schéma má být vlastněné migrační rolí. Před nasazením odeberte veřejné CREATE oprávnění ke schématu public, pokud ho poskytovatel automaticky neodebírá.

ADMIN_DATABASE_URL používejte jen při migraci/provisionování. Runtime aplikace má pouze DATABASE_URL. Pro vzdálený server URL musí používat sslmode=verify-full; CA poskytovatele musí být důvěryhodná v kontejneru. Nezavádějte rejectUnauthorized=false. Privátní spravované adresy, které TLS neumějí, současná konfigurace záměrně odmítne.

## 2. OIDC

Zaregistrujte confidential web klienta u podporovaného poskytovatele OIDC. Povinný callback je přesně `https://VAŠE-DOMÉNA/auth/callback`. Zapněte Authorization Code, PKCE S256 a MFA podle rizika firmy. Hesla, obnovu účtu a druhý faktor spravuje poskytovatel; Navčas je neukládá.

Každého zákazníka předem provisionujte podle přesného issuer a stabilního subject (`sub`), nikoli podle e-mailu nebo volně zadaného názvu firmy. První verze podporuje jednu organizaci na jeden účet. Přihlášení neprovádí veřejnou registraci ani automatické zařazení do firmy.

## 3. Konfigurace

Na serveru zkopírujte .env.example do .env.production a omezte přístup k souboru. Vyplňte PUBLIC_ORIGIN, DATABASE_URL, OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, SESSION_KEY a údaje provozovatele. OPERATOR_ICO nelze nahradit smyšleným číslem. PRIVACY_URL a TERMS_URL musí vést na skutečné schválené dokumenty.

SESSION_KEY vytvořte jako 32 kryptograficky náhodných bytů v hex formátu. Generujte ho do chráněného správce tajemství, ne do historie chatu nebo commitů. Změna klíče ukončí všechny prohlížečové relace; také odstraňte sessions z databáze. Klíč musí být stejný na instancích téhož prostředí, ale odlišný ve stagingu.

TRUST_PROXY při použití dodaného compose nastavuje compose na přesnou IP Caddy. Samotné X-Forwarded-Proto od veřejného klienta se nepovažuje za důkaz HTTPS. App nemá v compose publikovaný port. Zpřístupněte jen 80/443 a správcovské SSH s klíčem z omezených adres.

## 4. Build, migrace a první firma

V kořeni repozitáře na serveru sestavte:

```sh
docker compose -f deploy/compose.yaml build
```

V chráněném shellu nastavte ADMIN_DATABASE_URL a RUNTIME_DATABASE_ROLE=navcas_runtime. Potom spusťte jednorázovou migraci:

```sh
docker compose -f deploy/compose.yaml run --rm --no-deps -e ADMIN_DATABASE_URL -e RUNTIME_DATABASE_ROLE app node dist/server/scripts/admin.js migrate
```

Nastavte ORGANIZATION_NAME, MEMBER_SUBJECT a MEMBER_ROLE=admin. Pro dalšího člena stejné firmy nastavte ORGANIZATION_ID vrácené při prvním založení. Pak:

```sh
docker compose -f deploy/compose.yaml run --rm --no-deps -e ADMIN_DATABASE_URL -e OIDC_ISSUER -e ORGANIZATION_NAME -e ORGANIZATION_ID -e MEMBER_SUBJECT -e MEMBER_ROLE app node dist/server/scripts/admin.js provision
```

Provision odmítne duplicitní identitu; potichu nepřeřadí účet mezi firmami. Odebrání přístupu:

```sh
docker compose -f deploy/compose.yaml run --rm --no-deps -e ADMIN_DATABASE_URL -e OIDC_ISSUER -e MEMBER_SUBJECT app node dist/server/scripts/admin.js revoke
```

Odstraňte administrativní přístupy z běžného shellu a nepřidávejte je do environment app služby. Nastavte APP_DOMAIN na vlastní doménu a DNS na server, potom:

```sh
docker compose -f deploy/compose.yaml up -d
```

Caddy získá TLS certifikát. Ověřte přes veřejnou doménu /api/health a /api/ready, přihlášení, odhlášení, zamítnutí nepozvaného účtu a oddělení dvou testovacích firem. /api/ready ověřuje dostupnost DB. OIDC discovery probíhá při startu a neúspěch zablokuje start.

## 5. Data a akceptace

Správce nahraje normalizovaný JSON v Import dat. Nejprve vznikne náhled. Až po potvrzení se nový plán a neměnná revize atomicky uloží. Nový import zruší pracovní scénář; číslo verze neklesá, takže stará okna nemohou uložit výsledek přes nová data. Soubor se nepoužívá jako cesta k souborům serveru ani neposílá na cizí URL.

Datový formát a akceptační kontroly jsou v data-import.md. Na první reálné firmě proveďte G0: s vedoucím výroby porovnejte fyzicky pokrytou zakázku, pozdní dodávku, sdílenou komponentu, částečně vydané množství a rezervaci. Bez shody významu vstupů nelze tvrdit, že produkt řeší její výrobu.

## 6. Obnova, aktualizace a výmaz

Před každou aktualizací databázi zálohujte. U spravované DB zapněte PITR podle potřeb firmy. Exportní zálohu uchovávejte šifrovaně v jiné službě/účtu v EU. Ve stagingu skutečně obnovte databázi a ověřte revize, poslední scénář, oprávnění a export. Relace po obnově vymažte, aby staré cookies nebyly znovu platné. RPO/RTO stanovte až podle naměřené obnovy.

Runtime role nemá DELETE historie ani změnu členství. Ukončení firmy a retenční úklid provádí oprávněný správce databáze podle smlouvy. Před smazáním ověřte identitu a přesné organization_id, zálohy a dopad na účetní povinnosti. Nenahrazujte tento proces neověřeným tlačítkem Smazat vše. Živé sessions a limitovací okna se průběžně odstraňují automaticky.

CI před releasem provede doménové/API testy, PGlite, testy nad PostgreSQL 17, build workeru a prohlížeče. Docker build se lokálně neověřil, protože Docker daemon nebyl dostupný; CI má jeho samostatné ověření. Produkční poskytovatel OIDC, HTTPS doména a zálohování se ověří ve stagingu, nejsou nahrazené mock testem UI.

## Výběr hostingu a náklady

Pro první malý pilot doporučuji evropskou VM Hetzner a spravovanou PostgreSQL s OIDC. Rozpočtujte zvlášť server, IPv4, zálohy, databázi, identitu a doménu. Nejlevnější cenovka samotné VM není konečný náklad služby. Volný tarif může stačit na test; jeho limity, uspávání, retenci a smluvní podmínky ověřte před zákaznickým provozem. Žádná placená služba se v tomto úkolu nezaložila.

Primární zdroje ověřené 4. 10. 2026: [Hetzner ceny](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Render Docker](https://render.com/docs/docker), [Render PostgreSQL](https://render.com/docs/postgresql), [PostgreSQL TLS](https://www.postgresql.org/docs/18/libpq-ssl.html), [OIDC klient](https://github.com/panva/openid-client), [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).
