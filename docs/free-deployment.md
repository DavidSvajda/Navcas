# Navčas: Oracle, Supabase a Auth0 bez placeného hostingu

Ověřované nastavení k 4. říjnu 2026. Free tier je vhodný pro demo a malý pilot. Oracle může odebrat neaktivní VM, Supabase pozastavit neaktivní projekt; kvóty a dostupnost ověřte v konkrétním účtu. Nejde o garantované SLA. Cílem je použít současný backend bez přepisování do jiného frameworku.

## Bezplatná adresa a HTTPS

Založte volnou subdoménu v [DuckDNS](https://www.duckdns.org/), například vaše vlastní `navcas-NECO.duckdns.org`, a v jejich dashboardu nastavte veřejnou IPv4 Oracle VM. Ukázkový název není rezervovaný ani potvrzený jako volný. Caddy vydá a obnovuje certifikát, když DNS správně míří na server a veřejné porty 80/443 jsou dostupné. Nepoužíváme HTTP nebo vypínání kontroly certifikátů jako náhradu HTTPS.

Nastavte `APP_DOMAIN` na samotný hostname; `PUBLIC_ORIGIN` bude `https://stejný-hostname`. Veškeré callbacky a cookies používají stejný origin. Po přechodu na vlastní doménu změňte obě hodnoty a Auth0 callback, ponechte starou doménu jen po přechodnou dobu; nové přihlášení vytvoří nové cookies. Zdarma získáváte subdoménu závislou na poskytovateli, ne vlastnictví registrované domény.

## Nejprve veřejná ukázka bez účtů zákazníků

Pro Davida bez IČO, Supabase a Auth0 je první krok samostatné **syntetické HTTPS demo**. Na Oracle VM zkopírujte `deploy/public-demo.env.example` do `.env.production`, nastavte HTTPS origin a náhodný 32bytový SESSION_KEY v hex formátu. `APP_DOMAIN` nastavte v prostředí shellu nebo v samostatném ignorovaném `.env` pro Compose. Nikdy do demo nasazení nepřidávejte DATABASE_URL, OIDC_ISSUER nebo OIDC_CLIENT_SECRET; startup jejich přítomnost odmítne.

```sh
docker compose -f deploy/compose.yaml up -d --build
node scripts/check-deployment.mjs https://VAŠE-SUBDOMÉNA.duckdns.org
```

Kontrola nasazení vyžaduje Node 22+ na stroji, odkud ji spouštíte; na serveru je možné ji spustit v Node 24 kontejneru s připojeným skriptem. Ověří HTTP přesměrování, skutečně důvěryhodný TLS certifikát, bezpečnostní hlavičky, health/readiness a režim workspace. Neověří klikání na fyzickém telefonu nebo cizí identitní službu.

Public demo používá pouze modelová data, nemá import ani ERP konektor, ukládá scénáře do omezené operační paměti nejvýše 100 relací na dvě hodiny. Cookie má `__Host-navcas-demo`, Secure, HttpOnly a SameSite=Strict. Host i origin jsou povolené přesně pro konfiguraci; veřejný režim nevypíná CSRF nebo limity. Do názvů scénářů nevkládejte osobní/firemní údaje. Restart scénáře zruší. Ukázka nemá placenou objednávku a není placený zákaznický provoz. Právní texty identifikují Davida a vysvětlují technické cookies; provozní zpracování IP u Oracle/DNS je třeba vyhodnotit podle skutečného nasazení.

Zákaznický pilot nasaďte odděleně na jiný origin a s konfigurací `.env.example`; vynechte PUBLIC_DEMO. Oprávnění, databázi a právní údaje nezapínejte přes přepínač v uživatelském rozhraní.

## Oracle VM

Vyberte Always Free eligible A1 ARM VM v domovském EU regionu, Ubuntu 24.04 ARM64. Aktuální dokumentace uvádí ekvivalent 2 OCPU / 12 GB RAM; starší návody s 4/24 nepoužívejte bez kontroly vlastních limitů. Při nedostatku kapacity nic automaticky nepřepínejte na placený shape. Povolte veřejné 80/443 v OCI síťových pravidlech i firewallu OS; SSH pouze klíčem z vaší adresy. Port 3001 ani PostgreSQL nevystavujte.

Nainstalujte Docker Engine a Compose podle [oficiálního návodu](https://docs.docker.com/engine/install/ubuntu/). Klonujte projekt do `/opt/navcas`. Compose běží s aplikací bez root oprávnění, omezenou pamětí, přesnou důvěryhodnou proxy a bez publikovaného API portu. CI má samostatný nativní ARM64 build a spouští kryptografickou knihovnu i sestavený worker; nejedná se pouze o křížové sestavení.

## Supabase: pouze PostgreSQL pro aplikaci

Založte samostatný EU projekt. Přístupové údaje nepatří do chatu, GitHubu ani frontendových proměnných. Supabase Auth v této variantě nepoužíváme; identitu spravuje Auth0. Vypněte Supabase Data API pro tento projekt, protože náš backend přistupuje přímo přes PostgreSQL. Nepropojujte klientský supabase-js s našimi interními tabulkami.

Stáhněte databázový CA certifikát v nastavení SSL, uložte jej na serveru do `secrets/db-ca.crt`. Je to veřejný CA certifikát, není to privátní klíč. Pro zákaznické nasazení použijte vedle základního compose overlay `deploy/supabase-compose.yaml`, který jej připojuje pouze pro čtení do `/run/secrets/db-ca.crt`. Připojení musí mít `sslmode=verify-full&sslrootcert=/run/secrets/db-ca.crt`; nezaměňte `require` za ověřování identity serveru. Zapněte Supabase SSL enforcement. Všechny app build/run/up příkazy z deployment.md v této variantě spouštějte s oběma `-f`:

```sh
docker compose -f deploy/compose.yaml -f deploy/supabase-compose.yaml up -d --build
```

Použijte přímé připojení, pokud je dostupné IPv6; na IPv4 použijte **session pooler na portu 5432**. Transakční pooler na 6543 není výchozí varianta tohoto návodu. V URL session pooleru je uživatelské jméno `navcas_runtime.PROJECT_REF`. Heslo v URL musí být percent-encoded. Region a hostname vždy kopírujte z vašeho dashboardu.

V SQL editoru pod migrační rolí založte omezenou roli:

```sql
CREATE ROLE navcas_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
```

Heslo nastavte bezpečně pomocí interaktivního `psql` příkazu `\password navcas_runtime`; nezapisujte heslo jako SQL do historie nebo do tohoto dokumentu. Migration/admin připojení používá oddělenou roli vlastníka. Runtime role nesmí vlastnit tabulky ani být členem vlastníka, superuser nebo BYPASSRLS role. Startup to ověřuje v databázovém katalogu a odmítne nebezpečné nastavení.

Spusťte `admin migrate` podle [deployment.md](deployment.md). Migrace odebere CREATE od PUBLIC a oprávnění k aplikačním tabulkám od PUBLIC i známých rolí Supabase anon/authenticated/service_role. Přidělí pouze nutná oprávnění runtime roli. Použijte projekt věnovaný Navčasu, ne sdílený projekt jiné aplikace.

## Auth0

Založte EU tenant, vyberte Free a vytvořte **Regular Web Application**. Allowed Callback URLs obsahuje přesně `https://VAŠE-SUBDOMÉNA.duckdns.org/auth/callback`. Zapněte Authorization Code a RS256 podepisování. Token endpoint authentication nastavte na **Post** (client_secret_post), který odpovídá nastavení openid-client v našem serveru. Nepovolujte wildcard callback ani implicitní grant.

`OIDC_ISSUER` je přesná hodnota `issuer` z `https://VAŠE-AUTH0-DOMÉNA/.well-known/openid-configuration`, obvykle s koncovým lomítkem. Stejnou hodnotu použijte při provisionování členství. Client ID a secret jsou pouze v `.env.production`. Vypněte veřejné signup v Auth0 database connection a pozvěte testovací uživatele. Samotné přihlášení nikdy nepřidělí firmu automaticky; `admin provision` musí dostat přesný `sub` uživatele, například `auth0|...`.

Navčas používá PKCE S256, state, nonce a explicitní ověřování JWT podpisu přes JWKS. Má vlastní dvouhodinovou cookie relaci. Odhlášení z Navčasu revokuje tuto relaci; centrální Auth0 SSO relace zůstává u poskytovatele, takže opětovné přihlášení může být bez hesla. Neslibujte globální odhlášení ani MFA, pokud ho v konkrétním tarifu nemáte nakonfigurované a vyzkoušené. Pro citlivější pilot ověřte passkeys/MFA a nároky firmy.

## Záloha mimo databázi a mimo VM

Použijte samostatný S3-compatible bucket v OCI Object Storage a restic šifrovaný repository. Zkontrolujte, že účet má pro zvolený region a storage tier skutečnou bezplatnou kvótu. Záloha spotřebovává storage a přenos; za 0 Kč ji lze provozovat pouze v limitech. Disk připojený k téže VM nepovažujte za jedinou zálohu. Oddělený region nebo účet sníží společné riziko ztráty, ale kvóta a cena se musí ověřit. OCI bucket používejte přes jeho HTTPS S3 endpoint a oddělený Customer Secret Key omezený politikou na tento bucket.

Zkopírujte `deploy/backup.env.example` do `.env.backup`, chmod 600. BACKUP_DATABASE_URL používá vlastníka/backup roli schopnou číst **všechny firmy přes RLS**, ne runtime roli. Dump selže, pokud potřebná oprávnění chybí. Záloha zahrnuje výhradně aplikační tabulky; nezálohuje interní schémata Supabase ani účty Auth0. Připravte také export/obnovu konfigurace Auth0 a vazeb sub podle možností poskytovatele.

Vytvořte silné náhodné heslo restic v `secrets/restic-password`; soubor musí být čitelný UID 10001 v backup containeru, například owner 10001, mode 0400. Uchovejte další kopii hesla v osobním správci tajemství mimo server. Bez něj nelze šifrované zálohy obnovit. CA certifikát může být 0644, protože není tajný. Celé `secrets/` a všechny `.env.*` jsou ignorované a nesmí se commitovat.

```sh
docker compose -f deploy/backup-compose.yaml build
docker compose -f deploy/backup-compose.yaml run --rm backup init
docker compose -f deploy/backup-compose.yaml run --rm backup backup
docker compose -f deploy/backup-compose.yaml run --rm backup check
```

Záloha používá PostgreSQL 17 client. Před změnou Supabase na PostgreSQL 18 aktualizujte backup image a zopakujte obnovu: pg_dump 17 neumí zálohovat novější server. Dump je dočasně na tmpfs, po dokončení/s chybou se smaže. Data relací, jednorázových login kódů a limiteru se nezálohují; jejich schémata ano. Integrita je ověřována restic i SHA-256 manifestem. Úspěšný dump není důkaz úspěšné obnovy.

Pro denní automatické zálohy zkopírujte přiložené service/timer do `/etc/systemd/system`, upravte WorkingDirectory pokud projekt není `/opt/navcas`, spusťte `systemctl daemon-reload` a `systemctl enable --now navcas-backup.timer`. Časovač běží kolem 03:00 UTC. Kontrolujte stav posledního běhu přes `systemctl status navcas-backup.service` a `journalctl -u navcas-backup.service`. Neúspěšný běh musí vyvolat provozní reakci; kód neposílá email a netvrdí, že je nakonfigurovaný externí monitoring. Před placeným provozem nastavte upozornění správci. Automatické mazání starých snapshotů zatím není zapnuté: navrhněte retenci podle smlouvy a hlídejte kvótu, místo neověřeného smazání poslední dobré zálohy.

## Povinná obnova do izolovaného prostředí

Založte **prázdnou samostatnou databázi** `navcas_restore_NAZEV` na izolovaném PostgreSQL. Zadejte RESTORE_DATABASE_URL a CONFIRM_RESTORE_DATABASE na přesný název této databáze. Zálohovací CLI odmítne zdroj jako cíl, nepovolený název i neprázdný cíl. Nepoužívá DROP/clean. Při použití hostname aliasů stále odpovídáte za to, že skutečný cíl je jiná izolovaná databáze; kontrola řetězců není důkaz topologie.

```sh
docker compose -f deploy/backup-compose.yaml run --rm backup restore-drill
```

Obnova v jedné transakci uchová RLS/policies a data, ale nepřenáší vlastníky ani oprávnění. Znovu spusťte `admin migrate` s migrační rolí **cílové** databáze, poté tenant acceptance checks. Schéma nesmí vlastnit runtime role. Obnovené session tabulky jsou prázdné: uživatelé se znovu přihlásí. Spouštějte občas `check` a měsíčně skutečnou obnovu. CI kontroluje šifrovanou zálohu přes restic a skutečnou obnovu přes pg_restore, porovnává všechny trvalé řádky, RLS a odmítnutí přepsání. Nepotvrzuje dostupnost vašeho OCI bucketu ani jeho oprávnění.

## Akceptace veřejného nasazení

Po startu zkontrolujte HTTPS bez varování, HTTP přesměrování, `/api/health` a `/api/ready`. Bez přihlášení musí workspace vrátit 401. Pozvěte dvě firmy a ověřte oddělení jejich importů, uložených scénářů i exportů; viewer nesmí importovat ani ukládat. Odhlášená a odebraná relace nesmí mít přístup. Na skutečném telefonu otevřete HTTPS subdoménu, vyzkoušejte login/import/změnu priorit a návrat online. PWA instalace závisí také na konkrétním prohlížeči; Safari může vyžadovat Přidat na plochu manuálně.

Zákaznický prod režim vyžaduje skutečné údaje provozovatele a právní URL. Nevymýšlejte IČO ani sídlo pro obejití kontroly. Dokud David nemá potřebné údaje, lze ukazovat syntetické demo; placený zákaznický provoz tato příprava sama nelegalizuje. Funkčnost na reálných ERP datech, ochota zákazníka platit a automatický Flexi konektor zůstávají oddělenou akceptací.

## Zdroje

- [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- [Supabase připojení](https://supabase.com/docs/guides/database/connecting-to-postgres), [SSL](https://supabase.com/docs/guides/platform/ssl-enforcement)
- [Auth0 Code Flow + PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce/add-login-using-the-authorization-code-flow-with-pkce)
- [DuckDNS](https://www.duckdns.org/spec.jsp)
- [GitHub nativní ARM64 runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
