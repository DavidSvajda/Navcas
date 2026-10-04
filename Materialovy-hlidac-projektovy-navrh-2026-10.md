# Projektový návrh: Materiálový hlídač pro ABRA Flexi
## Produkt, architektura, výpočty a postup od prototypu k produkci

**Verze:** 1.0  
**Datum návrhu a ověření veřejných zdrojů:** 4. října 2026  
**Určení:** dva vývojáři; první zákazníci z českých menších výrobních firem.  
**Pracovní název:** Materiálový hlídač. Název ani doména nejsou ověřené jako dostupné.  
**Status:** implementační návrh. Není to dokončený program, otestovaná integrace ani potvrzená poptávka.

**Aktualizace pořadí investic po kritickém přezkoumání:** další SaaS vývoj je podmíněný G0 ověřením reálných dat a placeného zájmu. Již vytvořený demonstrátor slouží jako validační nástroj. Podrobnosti: [G0 — validace a obchodní brány](docs/G0-validace-a-obchodni-brany.md). Níže uvedená architektura zůstává cílovým návrhem, nikoli seznamem úkolů, které se mají bez validace hned všechny realizovat.

---

## 0. Rozhodnutí, podle kterého začít

Postavit responzivní webovou aplikaci s volitelnou instalací z prohlížeče jako PWA. Výpočty a synchronizace běží na serveru, nezávisle na otevřeném prohlížeči. Zákazník používá Windows, macOS, Android nebo iPhone bez samostatného instalátoru vašeho programu.

První podporovaný proces: jedna účetní jednotka v ABRA Flexi, jeden materiálový sklad, jednoduché kusovníky, evidované výrobní příkazy a známé datum potřeby materiálu. Aplikace čte data a vysvětluje materiálové pokrytí zakázek. Prioritní pořadí a termíny může zákazník simulovat uvnitř aplikace. Do Flexi první verze nezapisuje.

Zvolený základ:

| Oblast | Výchozí rozhodnutí |
|---|---|
| Uživatelské rozhraní | React 19.x, TypeScript, Vite; responzivní SPA |
| Backend | Node.js 24 LTS, TypeScript, Fastify 5.x |
| Databáze | PostgreSQL 17 na spravované službě |
| Přístup k databázi | Drizzle ORM + explicitní SQL migrace |
| Úlohy na pozadí | pg-boss nad PostgreSQL; samostatný worker |
| Přihlašování | Better Auth, serverové sessions, ověřené e-maily, TOTP |
| Validace | Zod na hranicích systému, explicitní převod na API schémata |
| Přesná čísla | decimal.js; PostgreSQL NUMERIC |
| Rozhraní tabulek | TanStack Query + Table; React Router |
| Vzhled | Tailwind CSS, omezená sada komponent z shadcn/ui |
| Testování | Vitest, fast-check, integrační testy nad skutečným PostgreSQL, Playwright |
| Provoz | Render: web/API + worker + placený PostgreSQL, Frankfurt |
| Zálohy a soubory | nezávislé šifrované zálohy do privátního S3 kompatibilního úložiště v EU |
| Primární upozornění | e-mail + centrum upozornění v aplikaci |
| První platby | měsíční fakturace; po potvrzení poptávky automatizace předplatného |

Patch verze balíčků vybrat při založení repozitáře z aktuálních stabilních vydání, prověřit bezpečnostní advisories, následně uzamknout v lockfile. Tento dokument záměrně nepředstírá, že odhad všech konkrétních patch verzí je ověřená kompatibilní instalace. Node 24 je podle oficiálního přehledu podporovaná LTS řada; Fastify veřejná dokumentace používá stabilní řadu 5. [Node](https://nodejs.org/en/about/previous-releases), [Fastify](https://fastify.dev/docs/latest/), [React](https://react.dev/versions), [Vite](https://vite.dev/guide/)

Technologie jsou zvolené pro rozsah projektu a malý tým. Žádný stack nezaručuje výdělek, bezchybný výpočet ani nulové provozní problémy.

## 1. Co prodáváme a jak poznáme hodnotu

### 1.1 Produktová věta

„Z vašeho Flexi každý den sestavíme přehled materiálu, který chybí pro naplánované výrobní zakázky. Uvidíte příčinu, termín a dopad změny pořadí.“

Zákazník kupuje zkrácení přípravy materiálu a včasné odhalení problému. Aplikace musí být užitečná při pravidelném používání, nikoli pouze při jednorázovém auditu.

### 1.2 První cílový zákazník

Firma, která:
- už vede ve Flexi skladové zásoby a kusovníky;
- má několik souběžných zakázek sdílejících komponenty;
- plánuje jednoduchou montáž nebo kompletaci;
- dnes ověřuje materiál ručně nebo v tabulce;
- dokáže určit odpovědného člověka za plán a data;
- má použitelnou edici Flexi a přístup k API.

Kusovníky jsou podle dokumentace dostupné od edice Premium. To omezuje cílový segment; nelze se opírat o počet všech uživatelů Flexi. [Kusovník ve webovém rozhraní](https://podpora.flexibee.eu/cs/articles/6254380-kusovnik-wui)

První zákazník není výrobní firma obecně. Nevhodné jsou firmy s převážně zakázkovými neopakovatelnými konstrukcemi, nezapsanou spotřebou, kusovníky pouze v hlavě zaměstnance nebo požadavkem na plánování kapacit strojů.

### 1.3 Kupující, uživatel, správce

Kupující: majitel nebo vedoucí výroby.  
Denní uživatel: plánovač, nákupčí či vedoucí dílny.  
Správce připojení: člověk s oprávněním založit a omezit API uživatele ve Flexi.

Návrh nesmí předpokládat, že jde vždy o jednu osobu.

### 1.4 Konkurence a skutečná výhoda

ABRA uvádí, že Flexi nemá MRP a hotový report chybějícího materiálu pro plánované zakázky. Zároveň umí rozpad kusovníku pro objednání materiálu. Existují bezplatné skladové doplňky i výrobní systémy napojené na Flexi, například WorkBot. [Výrobní návod](https://podpora.flexibee.eu/cs/articles/16451824-vyrabime-jak-nastavit-abra-flexi), [doplňky](https://www.flexibee.eu/doplnky/), [WorkBot](https://www.workbot.cz/)

Výhoda, kterou je potřeba prokázat: konkrétní použitelný přehled napříč zakázkami, vysvětlení každého nedostatku a rychlé nasazení při zachování dnešní evidence. Samostatná existence funkce ani český jazyk nejsou dostatečná ochrana před konkurencí.

### 1.5 Co se měří během zkoušky

- čas přípravy materiálového přehledu před nasazením a po něm;
- počet potvrzených užitečných nálezů, nikoli počet všech červených řádků;
- podíl chybných a nerelevantních upozornění;
- počet aktivních dnů odpovědného uživatele;
- práce potřebná při připojení a následné podpoře;
- ochota zaplatit předem uvedenou cenu a pokračovat další měsíc.

Nevykazovat hypotetické „zachráněné tržby“ jako skutečný výsledek. Zpoždění objednávky, které aplikace označí, samo neprokazuje zabránění odstávce.

## 2. Rozsah verzí

### 2.1 Technický demonstrátor

Lokální vývojová instalace Flexi, modelová firma, čtení relevantních evidencí, výpočet nad ručně ověřitelnými daty a vysvětlení výsledku. Bez plateb a rozsáhlého administrátorského rozhraní.

Účel: prokázat, že konkrétní data znamenají to, co výpočet potřebuje, a že rozdíl proti běžnému reportu je srozumitelný.

### 2.2 Pilotní verze

- přihlášení a organizace;
- jedno připojení a jeden sklad na organizaci;
- průvodce mapováním dokladů;
- kontrola kvality dat;
- pravidelná synchronizace;
- neměnné výsledky výpočtů;
- seznam zakázek a materiálových nedostatků;
- ruční datum potřeby a priorita jako lokální přepis;
- scénář „co když“ oddělený od běžného plánu;
- e-mailový souhrn a kritické změny;
- export CSV;
- audit důležitých změn;
- oddělení tenantů, zálohy a ověřená obnova.

### 2.3 Verze 1.0

Pilotní funkce doplněné o úplné členství/role, provozní dohled, odpojení a smazání organizace, trial a fakturaci, limitování zdrojů, základní PWA, mobilní přehled a dokumentaci zákazníka.

### 2.4 Odložené funkce

Více skladů, více ERP systémů, víceúrovňová výroba polotovarů, alternativní komponenty, výrobní kapacity, šarže a expirace, automatický zápis objednávek dodavatelům, automatické rezervace do Flexi, nativní mobilní aplikace, desktopový instalátor, obecný AI agent.

Odložení je hranice podporovaného procesu. Jestli většina vhodných firem tyto věci potřebuje hned, současný produktový rozsah je nutné přehodnotit.

## 3. Web, mobil a Windows Defender

### 3.1 Doporučení

Primární produkt je web. PC slouží k přehledu a plánování, mobil k rychlé kontrole, otevření upozornění a potvrzení, že se člověk problémem zabývá.

PWA je doplněk pohodlí: ikona na ploše, samostatné okno a případně pozdější push. Instalace je volitelná; všechny důležité funkce fungují v běžném prohlížeči.

Chrome a Edge podporují instalaci webových aplikací na desktopu. Nabídka a její umístění závisí na prohlížeči; nemá smysl vynucovat univerzální automatický dialog. Na iPhone připravit srozumitelný návod pro přidání na plochu. [Instalace PWA](https://web.dev/learn/pwa/installation), [Microsoft Edge](https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge)

### 3.2 Co tím řešíme na Windows

Nešíříte vlastní EXE/MSI, neinstalujete službu, nepouštíte aktualizátor a nepotřebujete administrátorská oprávnění pro váš program. Odpadají problémy s reputací nového desktopového instalátoru.

Neznamená to, že bezpečnostní software nikdy nezasáhne. SmartScreen kontroluje i webové adresy a firemní politiky mohou zakázat instalaci PWA. Produkt proto vždy musí fungovat jako HTTPS web. Nepožadovat vypnutí Defenderu, přidávání výjimek nebo obcházení podnikových pravidel. [Microsoft SmartScreen](https://learn.microsoft.com/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen)

Používat jednu stabilní doménu, důvěryhodné TLS, jasné informace o provozovateli a minimum přesměrování. Název domény a provozovatele musí souhlasit v produktu, e-mailech a dokumentech.

### 3.3 PWA implementace

- manifest: name, short_name, start_url, scope, id, display=standalone;
- ikony v požadovaných velikostech včetně maskable varianty;
- HTTPS v produkci;
- service worker s přesně vymezenými cestami;
- instalace nabídnutá po prvním úspěšném použití, ne jako překážka přihlášení;
- bezpečná aktualizace s hláškou „Je dostupná nová verze“;
- neztratit rozepsané nastavení při aktualizaci.

Service worker cachuje pouze verzované veřejné statické soubory a neutrální offline stránku. Necachuje /api, přihlášení, exporty, názvy zákazníků, výsledky výpočtů ani ERP data. Autentizované HTTP odpovědi mají Cache-Control: no-store. Nelze předpokládat, že toto hlavička sama zabrání aplikaci úmyslně zapsat odpověď do Cache API; výjimky musí být i v kódu service workeru. [PWA cache](https://web.dev/learn/pwa/caching)

Bez připojení se zobrazí „Pro aktuální data potřebujete připojení“. V1 neposkytuje offline plánování ani synchronizaci lokálních změn.

### 3.4 Mobilní rozsah

Podporovat přehled rizik, detail zakázky, detail materiálu, stáří dat, centrum upozornění a stav „řeší se“. Pořadí zakázek měnit přes ovládací prvky, nejen drag-and-drop. Rozsáhlé mapování a tabulkové plánování optimalizovat pro PC; na mobilu musí být přesto dostupné bez rozbitého layoutu.

Web push není podmínkou pilotu. Na iOS se váže na podporovaný systém a aplikaci přidanou na plochu; oprávnění žádat až po akci uživatele. První spolehlivý kanál je e-mail. Push není garantované doručení ani kritický alarm. [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)

## 4. Uživatelský průchod od prvního přihlášení

### 4.1 Přehled procesu

1. Zájemce otevře veřejné demo s modelovými daty.
2. Založí ověřený účet a organizaci.
3. Projde kontrolou vhodnosti: Flexi, licence, evidence, síťová dostupnost.
4. Správce založí omezeného API uživatele; zadá připojení.
5. Aplikace ověří dostupnost evidencí, nevypisuje heslo.
6. Uživatel vybere sklad a význam typů dokladů.
7. Proběhne prvotní synchronizace a kontrola dat.
8. Společně se ověří vzorek tří skutečných zakázek.
9. Uživatel potvrdí pravidla a zobrazí první použitelný plán.
10. Od tohoto okamžiku se počítá třicetidenní trial.
11. Během trialu se měří užitek, chybovost a práce podpory.
12. Zákazník platí, nebo odpojí systém a exportuje vlastní nastavení.

Připojení, které se nepodařilo nastavit, nemá spotřebovat trial jako hotově používaný produkt. Zároveň nenechat neaktivní onboarding běžet neomezeně: po 14 dnech bez aktivace upozornit a zastavit synchronizaci, data řešit podle retenční politiky.

### 4.2 Návrh obrazovek

| Obrazovka | Hlavní otázka uživatele | Hlavní akce |
|---|---|---|
| Přehled | Co dnes vyžaduje pozornost? | otevřít problém |
| Zakázky | Které zakázky jsou materiálově pokryté? | filtr, detail, scénář |
| Detail zakázky | Co jí chybí a proč? | zobrazit komponenty |
| Materiál | Kdo spotřebuje konkrétní položku? | časová osa, nákupní seznam |
| Scénář | Co se změní posunutím termínu? | změnit, přepočítat, porovnat |
| Kvalita dat | Proč nemohu výsledku důvěřovat? | najít zdroj chyby |
| Připojení | Jsou data aktuální? | synchronizovat, odpojit |
| Tým | Kdo může měnit plán? | pozvat, odebrat, změnit roli |
| Předplatné | Co používáme a co platíme? | změna plánu, zrušení |

PC: levá navigace, souhrn nahoře, tabulka se sticky hlavičkou, detail v samostatné stránce nebo panelu. Mobil: karty, filtry v panelu, detail po otevření, žádná desetisloupcová tabulka vmáčknutá do šířky telefonu.

### 4.3 Výsledné stavy

- **Materiál pokrytý skladem:** v rámci platných dat a definovaného pořadí existuje fyzická alokovatelná zásoba.
- **Závisí na dodávce:** plán vychází pouze po započtení očekávaného příjmu.
- **Chybí materiál:** ani s podporovanými očekávanými příjmy není potřeba pokrytá k termínu.
- **Nelze vyhodnotit:** data, jednotky nebo proces nejsou použitelné.
- **Data nejsou aktuální:** nadstavba nad předchozím výsledkem; aktuální pokrytí není ověřené.

„Materiál pokrytý“ není příslib dokončení výroby. Výpočet nezná stroje, lidi, kvalitu dílů ani fyzickou dostupnost nezapsaných pohybů. V produktu to vysvětluje krátký popisek u výsledku, nikoli technické varování při každém kliknutí.

Barva nikdy není jediný nositel významu. Každý stav má text a ikonu.

### 4.4 Připomínky a úkoly

„Řeší se“ pouze označuje odpovědnost. Nezastavuje přepočet a nezmění červený nedostatek na zelený. Odložené upozornění má důvod, autora a datum konce; zhoršení situace může vyvolat nové upozornění podle pravidel.

## 5. Technologické volby a důvody

### 5.1 Proč React + Vite místo komplexního SSR řešení

Jádro je přihlášená B2B aplikace s tabulkami. SEO není významné pro pracovní obrazovky. SPA s jasným API omezuje počet modelů cache, serverového renderování a klientského stavu, které musí malý tým hlídat.

Next.js je použitelná alternativa a podporuje vlastní hosting, není ale nutný pro tento produkt. Pokud v něm tým už výrazně lépe pracuje, může ho zvolit; worker, výpočty, tenant isolation a datové smlouvy zůstávají oddělené. Výchozí návrh používá Vite a Fastify. [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)

### 5.2 Proč Node 24 LTS

Jeden jazyk v UI, API i výpočtu, snadné sdílení kontraktů a dobré knihovny pro tento rozsah. Časově náročný výpočet neběží v požadavku webového serveru. Worker spouští engine s limitem času a paměti; větší výpočty izoluje worker thread nebo samostatný proces.

Runtime přidělovat podle naměřených dat, nikoli podle dojmu, že je serverless či nový runtime automaticky levnější.

### 5.3 Proč PostgreSQL

Normalizovaná data, transakce, přesná čísla, vazby tenantů, audit a pracovní fronta se vejdou do jedné spravované databáze. Použít PostgreSQL 17 jako konzervativní podporovanou verzi; při instalaci ověřit dostupnost aktualizací u poskytovatele. Major verze PostgreSQL mají oficiálně pětiletou podporu. [Versioning policy](https://www.postgresql.org/support/versioning/)

### 5.4 Proč Drizzle

Blízko SQL, přehledné schéma a kontrola migrací. RLS, role a některé constrainty psát jako explicitní SQL. Vygenerovanou migraci vždy zkontrolovat. ORM nepovažovat za bezpečnostní hranici ani náhradu znalosti transakcí.

### 5.5 Fronta pg-boss

Synchronizace, přepočty, e-maily a úklid se vykonávají mimo HTTP request. pg-boss používá PostgreSQL, takže v prvním rozsahu není nutný další Redis server. [Projekt pg-boss](https://github.com/timgit/pg-boss)

Úlohy navrhovat jako opakovatelné a idempotentní. Ani marketingový termín „exactly once“ nezaručuje přesně jedno doručení e-mailu či jiný vnější vedlejší efekt při pádu procesu. Pro upozornění použít outbox a deduplikační klíče.

### 5.6 Přihlašování

Better Auth se serverovými sessions a oficiální Fastify integrací. V1 zapnout jen potřebné části: ověřený e-mail, přihlášení, reset hesla, správa sessions, TOTP a bezpečné pozvánky. Členství a aplikační role jsou součást našeho modelu; nepřebírat neověřený e-mail jako důkaz členství.

Výhodou je vlastní databáze a omezený počet služeb. Nevýhodou je odpovědnost za aktualizace a ověření integrace. Výrobce zveřejňuje advisories; používat opravené stabilní vydání všech instalovaných auth balíčků. Před pilotem provést bezpečnostní kontrolu a test odvolání přístupu. [Fastify integrace](https://better-auth.com/docs/integrations/fastify), [cookies](https://better-auth.com/docs/concepts/cookies), [sessions](https://better-auth.com/docs/concepts/session-management), [2FA](https://better-auth.com/docs/plugins/2fa), [advisories](https://github.com/better-auth/better-auth/security/advisories)

### 5.7 Knihovny navíc

decimal.js pro přesné výpočty, Luxon pro převody časových pásem tam, kde nestačí date-only hodnoty, Pino pro strukturované logy, Vitest a fast-check pro engine, Playwright pro průchody UI. Každou přímou závislost evidovat a držet aktuální. Nedělat současně dva ORM, dva routery a několik systémů komponent.

Nejisté kompatibility ověřit v malém technickém pokusu: auth + Fastify + Drizzle, pg-boss + runtime role, PWA build + cookie přihlášení. Úspěch technického pokusu je podmínkou uzamčení stacku.

## 6. Architektura a repozitář

### 6.1 Modulární monolit

Jedna codebase, dva dlouho běžící procesy, jedna databáze:

~~~mermaid
flowchart LR
  U["PC / mobil / PWA"] --> A["Fastify: UI, API, přihlášení"]
  A --> DB["PostgreSQL: data, výsledky, fronta"]
  W["Worker: synchronizace, engine, upozornění"] --> DB
  W --> F["ABRA Flexi API"]
  W --> E["E-mailová služba"]
  B["Zálohovací úloha"] --> DB
  B --> S["Privátní šifrované zálohy v EU"]
~~~

V produkci Fastify obslouží sestavené veřejné soubory SPA a /api na stejné doméně. Same-origin zjednoduší cookies, CORS a ochranu sessions. Ve vývoji použít Vite proxy pro /api.

### 6.2 Struktura

~~~text
apps/
  web/                 React SPA, obrazovky, PWA
  api/                 Fastify, auth, autorizace, veřejné API
  worker/              fronta, synchronizace, přepočet, outbox

packages/
  domain/              čistý výpočet a jeho typy
  contracts/           request/response schémata, chybové kódy
  db/                  schéma, migrace, omezené repositories
  flexi/               klient, převod dat, capability checks
  config/              validace konfigurace, společné nástroje

docs/
  decisions/           rozhodnutí a důvody
  runbooks/            nasazení, obnova, incidenty
  mapping/             ověřené mapování Flexi a podporované verze

fixtures/
  synthetic/           malé scénáře s ručně známým výsledkem
  contract/            anonymizované/syntetické API odpovědi

infra/                 deklarace prostředí a proces nasazení
~~~

Domain nesmí importovat UI, ORM ani Flexi klienta. Přijímá normalizovaný vstup a vrací výsledek. Testy jej spustí bez internetu a databáze.

### 6.3 API smlouvy

REST /api/v1, explicitní schémata a OpenAPI. Zápisy mají idempotency key nebo verzování záznamu tam, kde může opakování způsobit problém.

Orientační aplikační endpointy, které si implementujete:

| Endpoint | Účel |
|---|---|
| GET /api/v1/session | ověřený uživatel a dostupné organizace |
| POST /api/v1/organizations | založení organizace |
| POST /api/v1/organizations/:id/connections | uložení připojení |
| POST /api/v1/organizations/:id/sync | požadavek na synchronizaci |
| GET /api/v1/organizations/:id/data-quality | kontrola kvality |
| GET /api/v1/organizations/:id/plans/latest | poslední platný plán |
| GET /api/v1/organizations/:id/plans/:planId/orders | zakázky, stránkování |
| GET /api/v1/organizations/:id/plans/:planId/materials | materiál a vysvětlení |
| POST /api/v1/organizations/:id/scenarios | založení scénáře |
| PATCH /api/v1/organizations/:id/order-overrides/:id | datum/priorita s očekávanou verzí |
| POST /api/v1/organizations/:id/exports | bezpečný export |
| DELETE /api/v1/organizations/:id/connections/:id | odpojení |

ID organizace v URL je volba kontextu, nikoli důkaz oprávnění. Server vždy ověří členství. Dlouhá akce vrací 202 a job ID; klient průběžně zjišťuje stav. Nechat HTTP požadavek několik minut čekat na import je špatné rozhraní.

Chybová odpověď: strojový code, uživatelská zpráva, correlation ID, volitelně field errors. Hesla, interní stack traces a celé ERP odpovědi se klientovi nevracejí.

## 7. Napojení Flexi: ověřené části a nutné technické ověření

### 7.1 Co víme

- Kusovníky lze číst z evidence /kusovnik; obsahují vazby na ceníkové položky a množství. [Dokumentace](https://podpora.flexibee.eu/cs/articles/10838022-kusovnik-api)
- Skladovou zásobu číst přes /skladova-karta a filtrovat účetní období. Pravidelné použití /stav-skladu-k-datu výrobce nedoporučuje jako náročné. [Integrační návod](https://podpora.flexibee.eu/cs/articles/3638593-jak-napojit-e-shop-na-abra-flexi-pres-rest-api)
- Výrobní příkaz je podle popsaného procesu vydaná objednávka s vlastním typem. [Výroba](https://podpora.flexibee.eu/cs/articles/16451824-vyrabime-jak-nastavit-abra-flexi)
- Changes API a hooks existují. Aktivace sledování změn může vyžadovat, aby nebyli přihlášeni uživatelé; hooks vyžadují podporu na serveru. [Changes API](https://podpora.flexibee.eu/en/articles/3421857-changes-api-and-webhooks)
- API je licencované a má limity podle varianty a zakoupeného objemu. [Úvod do API](https://podpora.flexibee.eu/cs/articles/3638736-jak-zacit-s-api-flexi-1-6-uvod-do-rest-api), [licence](https://podpora.flexibee.eu/cs/articles/10097467-licencovani-pristupu-k-api)

### 7.2 Capability check při připojení

Zjistit přístup k ceníku, kusovníkům, aktuálním skladovým kartám, typům a položkám vydaných objednávek, souvisejícím realizacím a potřebným rezervacím.

Konkrétní technické názvy polí a vazeb pro zbývající množství a rezervace ještě nebyly end-to-end otestované. Nepsat je podle podobnosti názvu. Ověřit properties/evidence-list na podporované testovací verzi, vytvořit několik skutečných dokladů a porovnat API s UI Flexi.

Výstup tohoto ověření uložit do docs/mapping: název pole, datový typ, jednotka, význam, prázdná hodnota, vazba, dostupnost podle verze/role a testovací případ.

### 7.3 Tři blokující otázky před vývojem plného produktu

1. Lze přes API jednoznačně získat zbývající nevyráběné množství příkazu v podporovaném procesu?
2. Lze odlišit rezervace skutečně blokující daný materiál a zabránit dvojímu započtení?
3. Lze rozlišit výrobní příkazy a nákupní objednávky včetně jejich zbývajících množství a použitelných termínů?

Pokud některá odpověď chybí, implementace může pokračovat na syntetickém modelu, ale připojení zákazníka nesmí vypadat jako hotové obecné řešení. Buď vymezit užší jednoznačný proces, nebo nápad zastavit.

### 7.4 Síťové prostředí zákazníka

V1: Flexi cloud nebo podporované bezpečně dostupné HTTPS API. Přístup z browseru zákazníka neznamená dostupnost API z vašeho serveru.

Flexi na interním PC bez vzdáleně dostupného API není bezagentové připojení. Zákazník musí zajistit bezpečnou konektivitu nebo spadá mimo V1. Nedoporučovat otevření databáze do internetu.

Pokud bude později potřeba lokální konektor, je to samostatný produkt s instalací, podpisem, aktualizacemi a IT podporou. PWA tuto síťovou potřebu nevyřeší. Požadavek vyhnout se Windows instalátoru je důvod začít s cloudovými zákazníky.

Render poskytuje sdílené výstupní IP rozsahy; exkluzivní IP jsou placená možnost. Rozsah není unikátní bezpečnostní identita vašeho programu. Zákazník stále potřebuje vlastní omezené přihlašovací údaje. [Výstupní IP](https://render.com/docs/outbound-ip-addresses)

### 7.5 Read-only přístup

Uživatele a jeho role vytvoří správce zákazníka. Aplikace ověří čtení a použije jen GET pro podniková data. Neslibovat, že pouze absence tlačítka znamená vynucené read-only oprávnění.

Aktivaci Changes API nebo registraci hooku, pokud vyžadují zápis, provádí správce samostatně. Read-only servisní účet kvůli tomu nerozšiřovat bez potřeby. Při nedostupném Changes API je podporovaný omezený polling.

## 8. Datový model a oddělení firem

### 8.1 Hlavní tabulky

| Tabulka | Obsah |
|---|---|
| users / sessions / auth_accounts | schéma přihlášení spravované auth knihovnou |
| organizations | zákaznická organizace a provozní nastavení |
| memberships | user_id, organization_id, role, stav |
| connections | Flexi připojení, identifikátor firmy, status, verze konfigurace |
| connection_secrets | šifrované přístupy, nonce, key_version, datum rotace |
| sync_runs | průběh synchronizace, cursor, počty, chybové kódy |
| dataset_revisions | publikované verze normalizovaných vstupů |
| items | položky s externím stabilním ID, kódem a jednotkou |
| bom_components | vazba výrobek → materiál, množství, zdrojová verze |
| stock_balances | fyzická zásoba v podporovaném skladu/období |
| orders / order_lines | normalizované výrobní příkazy a zbývající množství |
| incoming_supply | otevřené dodávky, množství, termíny, důvěra v datum |
| reservations | blokovaná množství a ověřené vazby |
| order_overrides | lokální termín, priorita, důvod a optimistic version |
| scenarios | změny oproti běžnému plánu, autor a base_revision |
| calculation_runs | dataset, settings, engine_version, stav a hash vstupu |
| material_allocations | komu, co, z jakého zdroje, kolik a k jakému datu |
| order_results / shortage_results | výsledky a vysvětlení |
| data_quality_issues | problematický vstup a dotčené zakázky/materiály |
| alert_states | deduplikace a životní cyklus problému |
| notification_outbox | plánovaná odeslání a stav doručení |
| audit_events | bezpečnostní a provozní změny |
| subscriptions / billing_events | oprávnění k placenému používání |
| export_jobs | kdo a kdy vytvořil soubor, platnost odkazu |

Výrobní doklady, zásoby a výsledky mají organization_id i dataset_revision_id. Přístupové tajemství nepatří do obecného JSON nastavení.

### 8.2 Identifikátory a vazby

Vlastní primární ID používat UUID. Externí identita je kombinace organization_id + connection_id + evidence + external_id. Kód produktu je popisek, ne globální identifikátor; může se změnit.

Všechny vazby podnikových tabulek kontrolují organizaci. Composite foreign key má například (organization_id, order_id) → orders(organization_id, id). Nestačí UUID s malou pravděpodobností kolize.

Unikátní omezení chrání před dvojím importem. Přijímání téhož záznamu dvakrát nesmí zdvojnásobit zásobu ani potřebu.

Rozlišit stabilní identitu zdrojového objektu od jeho stavu v datasetu. Historické řádky mají unikátnost včetně dataset_revision_id; globální unikátní external_id by znemožnilo uchovat více verzí. Vazby mezi snapshotovými tabulkami kontrolují také dataset_revision_id, aby výpočet nemohl smíchat doklady a zásoby z různých importů. Pokud použijete samostatný registr stabilních identit, jeho řádky jsou společné, ale jejich hodnoty v jednotlivých revizích zůstávají neměnné. Výběr aktuálního výsledku vede přes explicitní publikovaný calculation_run, nikoli přes MAX času jednotlivých tabulek.

### 8.3 Tenant isolation

Tenant je zákaznická organizace. Jeden uživatel může mít více členství. Po každém requestu se ověří session, aktivní členství a role. Členství nepřebírat z klientského formuláře.

Databázové rozdělení:
- migrations_owner spravuje schéma, nepoužívá se v API;
- auth_role přistupuje jen k auth tabulkám;
- app_role není owner, superuser ani BYPASSRLS;
- worker potřebuje tenantové repositories a samostatná omezená práva k frontě;
- backup role má pouze potřebná práva pro zálohu a je použitá mimo web.

Na podnikových tabulkách zapnout RLS s policy pro tenantový kontext. V každé transakci po ověření členství použít lokální nastavení tenantu, např. set_config('app.organization_id', validovane_uuid, true). Žádný globální SET, který by mohl zůstat na spojení v poolu.

RLS doplňuje autorizaci v aplikaci. Nechrání před útokem, kdy napadený backend s vlastním DB přístupem nastaví jiný tenant context. Table owner a privilegované role mohou RLS obejít; proto je jejich oddělení zásadní. [PostgreSQL RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)

Queue schema není veřejně přístupné. Worker získá tenant z důvěryhodné uložené úlohy, otevře tenantovou transakci a ověří, že připojení i všechny odkazy patří do téhož tenantu.

### 8.4 Přesnost množství

NUMERIC(24,8) jako počáteční návrh množství; konečný rozsah potvrdit ze vzorků a maximálních kusovníků. Do a z API posílat desetinné hodnoty jako řetězce. V enginu decimal.js s jednotnou přesností a deterministickým zaokrouhlováním.

Pro kusové komponenty zaokrouhlovat potřebné množství nahoru podle minimální podporované jednotky. Pro metry/gramy převzít ověřenou přesnost položky. Objednací balení a MOQ jsou v prvním výpočtu pouze nákupní informace, ne automatická objednávka.

Jednotka patří ke konkrétní položce. Pokud BOM používá jinou jednotku než zásoba a není ověřený převod, výsledek je nevyhodnotitelný. V1 nemá univerzální konverzi balení nebo odhad významu textu „balík“.

### 8.5 Čas

Časové okamžiky synchronizace a auditu uložit v UTC jako timestamptz. Pro datum potřeby materiálu použít lokální kalendářní den typu DATE v nastavené zóně organizace, výchozí Europe/Prague.

Nesplést datum dodání výrobku s datem potřeby materiálu. Půlnoc v UTC není vždy začátek pracovního dne v ČR. V1 plánuje po dnech, nikoli po hodinách. Pokud se potřeba a příjem shodují ve stejném dni, výchozí konzervativní pravidlo počítá příjem až jako nejisté pokrytí; uživatel vidí závislost na dodávce.

## 9. Synchronizace, verze dat a práce s chybami

### 9.1 První import

1. Ověřit credentials, konkrétní firmu a capability check.
2. Uložit nastavení mapování.
3. Zjistit stav Changes API a výchozí cursor, pokud je dostupný.
4. Stahovat explicitně potřebná pole ve stránkách, ne nekonečný export celého účetnictví.
5. Zapsat do pracovního datasetu, který UI ještě nepoužívá.
6. Doplnit vazby a ověřit počty, jednotky, skladové období a realizace.
7. Zachytit změny, které vznikly během importu, a zopakovat ověření.
8. Publikovat novou dataset revision pouze po úspěšném dokončení.
9. Zadáním jedné úlohy spustit výpočet nad publikovaným datasetem.
10. UI přepnout až na kompletní výsledek.

Selhaný import nikdy nepřepíše poslední použitelný plán polovinou nových údajů.

### 9.2 Důležitá hranice konzistence zdroje

Samostatné GET požadavky do Flexi nejsou prokázaný společný databázový snapshot. Changes API samo nezaručuje, že jednotlivé záznamy načtené postupně reprezentují přesně jeden historický okamžik.

Praktický postup: cursor před importem, import, dočtení změn, opětovná kontrola cursoru, opakování do stabilního okna. Pokud zdroj během ověření dál mění relevantní záznamy, výsledek označit jako průběžně synchronizovaný/nejistý. Nastavit omezený počet opakování, ne nekonečný loop.

V1 pro označení ověřeného pokrytí vyžaduje úspěšný import, stabilní ověřovací průchod a platnou kvalitu dotčených dat. U extrémně aktivního zdroje nabídnout klidnější čas pravidelné kontroly. Neuvádět „transakčně přesný stav ERP“, dokud to rozhraní a testy skutečně nedokládají.

### 9.3 Průběžné aktualizace

Výchozí interval 30 minut v pracovní době; ruční synchronizace s cooldownem 5 minut. Nastavení je návrh a musí sedět na limity a reálný počet stran.

Preferovat Changes API, pokud je aktivní. Uložit cursor až po úspěšném zpracování změn. Změny mazání/storna musí být explicitně zpracované; chybějící řádek při neúplném stránkování není důkaz smazání.

Při polling režimu používat podporované filtry a překryv časového okna, doplněný pravidelným úplným porovnáním relevantních evidencí. Neexistuje-li spolehlivý způsob sledování změn určité evidence, počítat její omezený úplný refresh do rozpočtu API.

Webhook, pokud jej přidáte, slouží primárně jako signál k dočtení změn ze zdroje. Nedůvěřovat tomu, že každé oznámení má podepsaný payload; přesný způsob ověření dokumentace a testovací instance musí potvrdit. Bez ověřeného podpisu nepublikovat data jen z těla hooku. Endpoint chránit tajným identifikátorem, limity a minimálním payloadem; polling zůstává pojistka.

### 9.4 Odhad API provozu

Pokud refresh vyžaduje 25 stránek a probíhá 16× za osmihodinový den, je to 400 requestů plus chyby, úvodní import a jiné integrace. Je to ilustrační vzorec, ne změřená spotřeba tohoto projektu.

Pro každého zákazníka držet vlastní rozpočet, statistiky a limiteři. Nevyčerpat celou zákaznickou kvótu, kterou používají i další aplikace. V UI zobrazit spotřebu vaší aplikace jako odhad ze skutečně zaznamenaných požadavků, nikoli jako celkovou spotřebu Flexi, pokud ji API neposkytuje.

### 9.5 Retry a stavy připojení

| Situace | Chování |
|---|---|
| 401/403 | zastavit opakování, vyžádat kontrolu přístupů/licence |
| 429 | respektovat Retry-After, backoff s jitterem |
| 5xx / timeout | omezené opakování, následně degraded |
| neplatné schéma | karanténa importu, nevytvářet zelený plán |
| částečně stažená data | nedokončený sync, starý plán s varováním |
| změna konfigurace | nový config version a kompletní potřebný přepočet |
| vypnuté připojení | zrušit nové sync jobs a zneplatnit další použití secretu |

Lokální stavy: pending, active, degraded, credentials_invalid, unsupported, paused, disconnected.

Freshness: po jednom zmeškaném intervalu informační stav, po dvou výpadcích varování, po 120 minutách během pracovního okna bez úspěšného importu považovat aktuální výsledek za neověřený. Mimo pracovní okno uvádět plán další synchronizace. Konkrétní prahy přizpůsobit sjednanému intervalu; nezobrazit v pondělí zelený páteční výsledek jako právě ověřený.

### 9.6 Job orchestrace

Na jedno připojení pouze jedna synchronizace. Nové podněty během běhu sloučit do požadavku na další běh. Na jednu kombinaci dataset/settings/engine mít nejvýše jeden shodný přepočet.

Job má timeout, heartbeat/lease, počet pokusů a deduplikační identitu. Po restartu workeru úlohu znovu spustit bezpečně. Publish výsledku je atomický; pomalý starý běh nesmí přepsat novější plán.

## 10. Výpočetní jádro: přesná produktová pravidla

### 10.1 Název výsledku

„Materiálové pokrytí podle evidovaných dat“ je přesnější než „výroba stihne termín“. Engine řeší materiál a jeho přidělení. Neřeší výrobní kapacitu ani slib dodavatele.

### 10.2 Vstupní smlouva

~~~text
PlanInput
  organizationId
  datasetRevisionId
  settingsVersion
  engineVersion
  warehouseId
  asOfTime
  planningTimezone
  planningHorizonDays
  items[]
  bomEdges[]
  physicalStock[]
  reservations[]
  manufacturingDemand[]
  expectedReceipts[]
  localOverrides[]
~~~

Údaje musí být validované před vstupem do enginu. Schema validation neověřuje fyzickou správnost skladu; tu může potvrdit pouze evidence zákazníka.

### 10.3 Omezený kusovník V1

Jeden vyráběný výrobek → přímé nakupované/skladové komponenty. Hlavičky a vnořené úrovně z API převést na tuto strukturu podle ověřené reference.

Detekovat vnořené vyráběné polotovary, cykly, chybějící vazby a nekladná množství. Zakázku s nepodporovaným vnořením označit jako nepodporovanou, ne tiše rozpadnout několik úrovní bez zohlednění existujících polotovarů.

Pro zákazníka, který vede jednu přímou komponentu jako hotový nakupovaný celek, jde o přímou zásobu. Neodvozovat to pouze z názvu položky.

### 10.4 Zbývající množství

Potřeba se počítá ze zbývajícího množství, nikoli automaticky z původního množství příkazu.

Rozpracovaná výroba s už vydaným materiálem je v první verzi citlivý případ. Pokud zdrojový proces neumí jednoznačně rozlišit zbývající množství a odpovídající dosud nevydaný materiál, nepočítat příkaz zjednodušeným odečtem. V1 může podporovat pouze příkazy před zahájením a jednoznačně dokončené části. Tuto hranici musí potvrdit technický pokus.

### 10.5 Pořadí

Výchozí deterministické pořadí:
1. nejbližší datum potřeby materiálu;
2. ruční priorita pro stejné datum;
3. stabilní interní ID jako poslední rozhodovací pravidlo.

Nedávat obchodní hodnotu jako skrytou automatickou prioritu. Změna pořadí má dopad na jiné zakázky a vyžaduje viditelný scénář.

### 10.6 Rezervace: kontrakt před algoritmem

Rezervace mohou znamenat jiný objekt než fyzicky vyhrazenou komponentu; například výrobek, objednávku zákazníka nebo budoucí potřebu. Nesmí se všechny bez rozlišení odečíst ze zásoby.

Adapter musí rozlišit:
- fyzicky blokované množství materiálu pro podporovaný příkaz;
- fyzicky blokované množství pro jiný požadavek;
- logický požadavek bez fyzické blokace;
- vazbu, jejíž význam není ověřený.

Při fyzicky vyhrazených zásobách se vytvoří volný pool a pooly vyhrazené konkrétním příkazům. Vyhrazená zásoba patří jen příslušnému příkazu. Rezervace mimo plánovací horizont se nesmí automaticky uvolnit.

Pokud fyzické rezervace podle zvoleného modelu převýší zásobu, vstup je rozporný. Pokud jejich vazbu nelze bezpečně určit, komponenta je nevyhodnotitelná. V1 nemá univerzální kouzelný fallback, který by si rezervace „nějak dopočítal“.

### 10.7 Dva samostatné průchody

**Průchod A: pokrytí fyzickou zásobou.** Započítá skutečný podporovaný stav skladu, vyhrazené pooly a volnou zásobu. Neobsahuje očekávané dodávky.

**Průchod B: očekávané pokrytí.** Začne z téhož počátečního stavu znovu. Započítá navíc otevřené dodávky k ověřenému očekávanému datu. Množství již přijaté na sklad nepřidá znovu.

Výsledky se porovnají. Tyto průchody nesdílejí měněné zásobníky; jinak by se spotřeba počítala dvakrát.

### 10.8 Alokační politika

V každém průchodu se postupuje podle pořadí. Pro každou komponentu se spotřebuje vlastní vyhrazené množství a poté podporovaná volná zásoba/příjmy dostupné k datu potřeby.

V1 **chrání pořadí i u částečně nepokryté zakázky**: komponenty dostupné pro prioritnější zakázku zůstávají přiřazené této zakázce, i když jí chybí jiná komponenta. Nižší zakázka je může získat až po změně plánu. Toto rozhodnutí je viditelné; není to algoritmus maximálního počtu vyrobených kusů.

Nedostatek není fiktivní záporná zásoba. Engine eviduje neuspokojenou potřebu odděleně. Pozdější příjmy ukáže jako potenciální pozdní pokrytí, nepoužije je pro zelený výsledek v dřívějším dni.

Pro známé stejné datum příjmu a potřeby ukázat závislost na dodávce. Bez konkrétního času/ověření příjmu nelze deklarovat fyzickou připravenost.

### 10.9 Výpočet nákupního nedostatku

Nesčítat bezmyšlenkovitě všechny historické nedostatky po dnech. Potřeba neuspokojená v pondělí může být pokrytá příjmem v úterý, ale stále znamenat opoždění.

Report rozlišuje:
- množství, které chybí k prvnímu datu potřeby;
- později očekávané pokrytí;
- čistý deficit v horizontu;
- seznam dotčených zakázek.

Přesný čistý nákupní deficit odvodit z jednoho kumulativního časového ledgeru. Očekávaný příjem lze alokovat pouze jednou. Nedoporučovat objednat celý nedostatek z každé zakázky zvlášť, pokud ho už kryje existující nákupní objednávka.

### 10.10 Neznámé údaje a jejich dopad

Zakázka bez data nebo neznámého kusovníku nemůže být zelená. Pokud její neznámá potřeba může spotřebovat stejné materiály, ovlivňuje i důvěru v ostatní zakázky.

Neznámý příkaz proto není jen skrytý řádek „ostatní“. Uživatel jej musí opravit, explicitně vyloučit s důvodem, nebo systém označí příslušnou část plánu jako neověřenou. Pokud není ani možné určit dotčené materiály, neověřený je celý společný skladový plán.

Vyloučení je auditované a viditelné nahoře: „Plán nezahrnuje 2 otevřené příkazy“. Nevytvářet falešný pocit úplnosti.

### 10.11 Zkrácený pseudokód

~~~text
validate(input)
if globalBlockingIssues: return unverifiedPlan

demands = normalizeRemainingDemand(input)
ordered = sortByNeedDatePriorityStableId(demands)

physical = allocate(ordered, stockPools, noExpectedReceipts)
expected = allocate(ordered, freshStockPools, eligibleExpectedReceipts)

for order in ordered:
  if dependencyIssues(order): status = UNVERIFIABLE
  else if physical.fullCoverage(order): status = COVERED_BY_STOCK
  else if expected.fullCoverage(order): status = DEPENDS_ON_RECEIPT
  else: status = SHORTAGE

return results + allocations + explanations + dataQuality
~~~

Pseudokód není hotová implementace rezervací. Contract a scénáře z předchozích částí jsou závazné.

### 10.12 Neměnnost a vysvětlení

Výsledek ukládá engine_version, settings_version, dataset_revision_id, hash normalizovaných vstupů, seznam vyloučených příkazů, čas výpočtu a podporovaný rozsah.

Detail nálezu ukazuje: původní potřebu, zbývající potřebu, jednotku, zásobu, vlastní rezervaci, dřívější přidělení, započítané dodávky a skutečný deficit.

Podpora může reprodukovat výpočet nad uloženým vstupem bez živého API zákazníka. Změna algoritmu vytváří novou verzi, nemaže staré důvody.

## 11. Scénáře a souběžné změny uživatelů

Scénář je kopie pravidel a přepisů nad konkrétní base_revision, nikoli kopie všech ERP dat a nikoli změna ERP.

Uživatel mění datum a prioritu. Po přepočtu vidí rozdíl v počtu dotčených zakázek i konkrétních komponentách. Scénář nemůže vytvářet fyzické zásoby kliknutím na „vyřešeno“.

Když se mezitím změní ERP data, scénář se označí jako zastaralý a nabídne přepočet na nové revizi. Jeho aplikace mění jen lokální plánovací nastavení a vyžaduje roli planner. Před aplikací kontrolovat optimistic version; při konfliktu vrátit 409, nesmazat změnu kolegy.

V1 stačí jedna aktivní pracovní simulace na uživatele a organizaci. Komplexní spolupráci v reálném čase nepřidávat před potvrzením potřeby.

## 12. Notifikace a nákupní výstup

### 12.1 Události

Upozornit na nový potvrzený nedostatek, významné zhoršení existujícího problému, blížící se datum potřeby a delší nedostupnost dat. Nevytvářet e-mail po každém běhu, pokud se nic významného nezměnilo.

Výchozí souhrn v pracovní den v 7:00 lokálního času. Okamžitou zprávu posílat pouze při uživatelem zvolených kritických podmínkách a s cooldownem.

### 12.2 Deduplikace

Stabilní problém má organization + order + material + typ problému. Množství je změna stavu, ne nová identita. Outbox má unikátní dedup key zahrnující problém, verzi změny a kanál.

Výpadek API nezavře materiálové problémy jako vyřešené. Upozornění o jejich zlepšení vznikne až po platném novém výsledku.

### 12.3 Obsah a soukromí

E-mail krátký, jasný a s odkazem na detail vyžadující přihlášení. Výchozí zpráva neobsahuje celý seznam zákazníků ani citlivé obchodní částky. Uživatel může podle pravidel firmy zvolit podrobnější souhrn.

SPF/DKIM/DMARC, ověřený odesílatel, zpracování bounce, oddělení transakčních zpráv od marketingu. Vybrat transakčního poskytovatele s ověřenými smluvními podmínkami a zpracováním dat; netvrdit automaticky EU residency u libovolného e-mailového SaaS.

### 12.4 Výstup pro nákupčího

CSV: materiál, jednotka, potřebné množství, nejbližší datum potřeby, evidovaný pozdní příjem, dotčené příkazy, zdrojový čas. Jde o návrh k lidskému posouzení. Dodavatel, balení, aktuální cena a dostupnost se mohou lišit od evidence.

V1 netvoří závaznou nákupní objednávku. Automatický zápis by vyžadoval samostatný návrh, oprávnění a testování.

## 13. Bezpečnost připojení a aplikace

### 13.1 Oprávnění

| Role | Rozsah |
|---|---|
| owner | členství, připojení, předplatné, export/smazání organizace |
| admin | konfigurace dat, nastavení týmu podle delegace, provoz připojení |
| planner | termíny, priority, scénáře a řešení upozornění |
| viewer | přehled a detaily bez změny plánu |
| support | oddělený interní režim, explicitní časově omezené oprávnění |

Owner může být zároveň planner. Role se ověřuje na serveru u každé změny. Skrytí tlačítka není autorizace.

Pozvánka je jednorázová, časově omezená a vázaná na ověřený e-mail. Odebraný člen ztratí přístup při dalším requestu, nikoli až po vypršení dlouhého JWT. Převod vlastníka a změna připojení vyžadují čerstvé ověření přihlášení; u privilegovaných účtů TOTP.

### 13.2 Sessions a browser

Secure + HttpOnly cookies, omezený scope, SameSite podle podporovaného auth flow. Aplikační mutace chránit proti CSRF kontrolou originu a vhodným tokenem/hlavičkou. Auth knihovna nechrání automaticky všechny vaše aplikační endpointy.

Session tokeny a ERP credentials nedávat do localStorage, URL, analytiky, chybového reportu ani do PWA cache. Při odhlášení vyčistit klientské query cache a odpojit odběry; přepnutí organizace má oddělené cache keys.

CSP, HSTS po ověření celé domény, frame-ancestors, bezpečné content types a redakce logů. Uživatelské názvy dokladů vykreslovat jako text. Nepotřebujete HTML z ERP.

### 13.3 Šifrování credentials

Minimální rozumné řešení pilotu:
- autentizované šifrování AES-256-GCM;
- náhodný nonce pro každý zápis;
- authenticated additional data obsahuje organizaci, připojení a key version;
- ciphertext v oddělené tabulce;
- klíč mimo databázi a repozitář v managed secrets;
- key version a postup rotace;
- v UI jen „přístup uložen“, nikdy zobrazení hesla zpět;
- dešifrování pouze při potřebné komunikaci se zdrojem.

Klíč uložený v runtime secrets chrání při úniku samotné databáze, ne při úplném napadení procesu, který umí dešifrovat. Větší provoz může přejít na managed KMS s oddělenými encrypt/decrypt oprávněními.

Zálohovací dešifrovací klíč není stejný jako klíč Flexi credentials. Bez dostupného klíče může být záloha nepoužitelná; obnovu klíčů řešit v runbooku.

### 13.4 SSRF: zvlášť důležité pro tento produkt

Uživatel zadává adresu ERP serveru. Nekontrolované načtení libovolné URL může umožnit přístup k interním službám vašeho cloudu.

V1 preferuje schválené hosty Flexi cloudu. Vlastní HTTPS host vyžaduje ověření domény a ruční schválení konektivity. Technická ochrana:
- pouze HTTPS a schválené porty, typicky 443 či 5434;
- žádné credentials v URL;
- zakázané redirects nebo nové ověření cíle každého redirectu;
- kontrola A i AAAA a blokace privátních, loopback, link-local, metadata a dalších zvláštních adres;
- kontrola skutečně použité cílové adresy, ochrana proti DNS rebinding;
- limit odpovědi, času, počtu stran a současných spojení;
- outbound síťová pravidla, kde je lze zavést.

Pouhá kontrola, že text adresy začíná https, nestačí. [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)

### 13.5 Exporty a soubory

CSV textové buňky chránit proti spreadsheet formula injection; správně escapovat oddělovače, uvozovky a nové řádky. Množství exportovat deterministicky, uvést jednotku a čas dat.

Odkazy na export mají krátkou platnost a autorizaci. Soubor nesmí být veřejný podle uhodnutelného tenant ID. V1 může malé CSV streamovat po přihlášení; velké generovat přes job do privátního úložiště a automaticky mazat.

Volný upload zákaznických PDF či Excelu není potřeba pro první verzi. Nepřidávat jej bez use case a bezpečného parseru.

### 13.6 Interní přístup podpory

Výchozí podpora vidí technický stav a agregované počty, nikoli celou výrobní evidenci. Zpřístupnění obsahu je časově omezené, zákazníkem schválené v aplikaci a auditované. Nepoužívat sdílené přihlašování za zákazníka.

Do observability neposílat request body s hesly, celé doklady, surové ERP payloady ani sessions. Korelace přes interní pseudonymní ID.

## 14. Soukromí, smlouvy a zpracování dat

Podnikové položky nemusí být osobní data, uživatelské účty, kontakty, logy a případné údaje fyzických zákazníků jimi být mohou. Načítat jen data potřebná pro materiálový výpočet; adresy, telefonní čísla a e-maily odběratelů pro něj běžně nejsou nutné.

Ve vztahu k údajům zpracovávaným podle pokynů zákazníka zpravidla připravit režim zpracovatele a zpracovatelskou smlouvu; u vlastních účtů a fakturace se role může lišit. Právní texty a skutečné vztahy musí před placeným provozem ověřit kompetentní odborník. [EDPB: správce a zpracovatel](https://www.edpb.europa.eu/sme/learn-the-basics/data-controller-or-data-processor_en)

Připravit:
- obchodní podmínky s konkrétním podporovaným rozsahem;
- pravidla používání a odpovědnost za zákaznická vstupní data;
- popis frekvence aktualizací a údržby;
- DPA, seznam subdodavatelů a popis skutečných přenosů;
- zásady ochrany soukromí;
- export, ukončení a smazání;
- incidentní postup a komunikační odpovědnost;
- ujednání mezi zakladateli o IP, nákladech, podílech a přístupech.

Server v EU neznamená automaticky, že všechny provozní logy, podpora, účetnictví nebo kontrolní systémy poskytovatele zůstávají výhradně v EU. Každou službu a smlouvu ověřit samostatně. Nepoužívat na webu absolutní slogan „všechny informace nikdy neopustí EU“ bez podkladů.

Navržená retence k projednání:
- pracovní staging neúspěšných importů: do 7 dní;
- surová diagnostická data: pouze nezbytné části, standardně do 7 dní;
- normalizované revize a reprodukovatelné výsledky: klouzavě 30 dní v pilotu;
- bezpečnostní/audit logy: 90 dní, s minimem obsahu;
- exporty: do 24 hodin;
- aktivní konfigurace: po dobu smlouvy;
- po ukončení: 30 dní na export v read-only režimu, následně smazání podnikových dat;
- zálohy: návrh 30 dní, poté přirozené vypršení a ochrana proti znovuobjevení smazaného tenantu po obnově.

Tyto lhůty jsou produktový návrh, ne zákonné povinnosti. Vlastní fakturační doklady se řídí samostatnými pravidly. Při obnově aplikovat deletion ledger, aby se dříve smazaná organizace znovu nezpřístupnila.

Údaje zákazníků nepoužívat k trénování modelů. Engine AI nepotřebuje. Budoucí vysvětlení pomocí modelu je další zpracování, další poskytovatel a samostatné rozhodnutí; nemá měnit výpočty ani uvolňovat materiál.

## 15. Testovací strategie

Testy zde mají skutečný smysl: chyba může ovlivnit nákup materiálu a provoz zákazníka. Priorita je správnost výpočtu, integrace a izolace dat.

### 15.1 Ručně ověřitelné případy

| ID | Situace | Očekávaná vlastnost |
|---|---|---|
| T01 | jedna zakázka, dost materiálu | pokrytá fyzickou zásobou |
| T02 | dvě zakázky, společná komponenta | zásoba se nepoužije dvakrát |
| T03 | přesně nulový zůstatek | bez falešného nedostatku |
| T04 | částečné množství a desetinné jednotky | přesný výpočet bez float chyby |
| T05 | kusová komponenta s necelou potřebou | zaokrouhlení podle pravidla nahoru |
| T06 | vlastní fyzická rezervace | žádné dvojí odečtení |
| T07 | cizí rezervace | nedostupná pro jiný příkaz |
| T08 | rezervace hotového výrobku | nezaměněná za materiál |
| T09 | příjem před datem potřeby | pouze očekávané pokrytí |
| T10 | příjem po datu potřeby | nedostatek včas, pozdní pokrytí zvlášť |
| T11 | část nákupní objednávky již přijata | pouze zbývající příjem |
| T12 | příjem bez data | nepočítá se jako včasný |
| T13 | částečně dokončený výrobní příkaz | jen jednoznačně zbývající potřeba |
| T14 | materiál již vydaný do výroby | žádná nová stejná potřeba |
| T15 | zrušený příkaz | neovlivňuje budoucí plán |
| T16 | chybějící BOM | nevznikne zelená zakázka |
| T17 | víceúrovňový polotovar | v1 nepodporovaný, viditelný |
| T18 | neznámý příkaz ve společném skladu | nejistota se propaguje |
| T19 | skladové karty ve dvou obdobích | použito aktuální podporované období |
| T20 | změna pořadí | přidělení se změní reprodukovatelně |
| T21 | deficit v pondělí, příjem v úterý | nákupní nedostatek není zdvojený |
| T22 | záporná/nesrozumitelná zásoba | problém dat, bez falešné jistoty |
| T23 | dvě shodná volání importu | bez dvojího započtení |
| T24 | změna během snapshotu | nový plán není nekontrolovaně publikovaný |
| T25 | smazání dokladu ve zdroji | odstranění potřeby podle ověřené změny |
| T26 | dvě firmy se stejným externím ID | žádná kolize |
| T27 | konflikt editací scénáře | 409, neztratí se změna |
| T28 | starý worker dokončí po novém | nepřepíše nejnovější plán |

Testovací tabulka není kompletní implementace. Každý test doplnit vstupem, ručním očekávaným výpočtem a vysvětlením.

### 15.2 Vlastnostní testy

- stejný vstup a engine version dávají stejný výsledek;
- součet skutečných alokací nepřesahuje podporovanou zásobu/příjmy;
- zdrojová dodávka se započítá nejvýše jednou;
- množství a jednotky jsou zachované;
- žádná neznámá závislost není prezentovaná jako ověřené pokrytí;
- zvýšení potřeby nevytvoří nové fyzické zásoby;
- stav prázdného skladu s kladnou potřebou není pokrytý;
- hash vstupu nezávisí na náhodném pořadí stažených řádků.

Monotonicitu netvrdit plošně u všech složitých změn priorit. Zkontrolovat ji jen tam, kde odpovídá zvolenému modelu.

### 15.3 Contract testy Flexi

Použít vlastní vývojovou firmu. V UI skutečně vytvořit doklady, rezervace a realizace, poté ověřit API. Následně uložit anonymní fixture a testovat parser opakovaně bez internetu.

Syntetická JSON odpověď napsaná podle vašeho očekávání neprokazuje chování Flexi. Vedle unit testů je nutný důkaz ze skutečné podporované verze a konfigurace.

### 15.4 Databáze a tenanty

Testovat na skutečném PostgreSQL se stejnými roles/RLS jako produkce, nikoli jen SQLite nebo owner connection.

Zkusit neoprávněný přístup přes URL, export, scénář, job, cizí foreign key, chybovou odpověď a support režim. Otestovat, že tenant context po vrácení spojení do poolu nezůstává dostupný dalšímu požadavku.

### 15.5 End-to-end a PWA

Playwright: Chromium, Firefox, WebKit; kritické průchody i v branded Edge. Mobilní emulace doplnit reálným Androidem a iPhonem, hlavně instalace, sessions, nové okno PWA a přechod z e-mailu. Emulace prohlížeče není plná zkouška instalace a push na zařízení. [Playwright projects](https://playwright.dev/docs/test-projects)

E2E: přihlášení, onboarding, nezdařené připojení, první plán, nevyhodnotitelná data, scénář, role, odhlášení, odpojení, zrušení předplatného.

PWA: po logoutu nenabízí data poslední organizace; offline nezobrazuje starý plán jako aktuální; deploy nemíchá nové API se starým klientem nekontrolovaně.

### 15.6 Výkonové cíle

Počáteční podporovaný profil k měření: do 10 000 položek, 20 000 přímých BOM vazeb, 500 otevřených příkazů a přibližně 5 000 příkazových řádků na organizaci.

Cíl: engine nad tímto profilem do 5 sekund na vybraném workeru, běžný dashboard p95 pod 1,5 s bez čekání na živé ERP, první import do 15 minut při běžné odezvě a kvótě zdroje. Jsou to navržené cíle, ne naměřené výsledky.

Změřit CPU, paměť, databázové dotazy a počet API stránek. Pokud je nutné rozsah zmenšit, udělat to před závazným prodejem. Load test nemá zahlcovat veřejné demo Flexi.

### 15.7 Zkoušky selhání

Restart workeru během importu a publikace, timeout ERP, poškozený payload, vyčerpání kvóty, nedostupná DB, zamítnuté přístupy, nefunkční e-mail, změna roku, změna kusovníku, ztráta master key v testovacím prostředí a obnova z nezávislé zálohy.

## 16. Vývojové prostředí pro dva vývojáře

Vývoj na Windows je možný. Doporučený společný runtime: Node 24, pnpm a lokální PostgreSQL v kontejneru; kdo používá WSL2, může držet repozitář ve WSL souborovém systému. Docker/WSL jsou vývojové nástroje, ne něco, co požadujete od zákazníka.

Instalační oprávnění a firemní omezení vývojářských PC řešit standardně. Nenavrhovat obcházení Defenderu ani globální vypnutí skenování.

Po založení projektu připravit:
- jednu doloženou cestu od čistého checkoutu ke spuštěnému demo;
- .env.example bez skutečných hesel;
- validaci environment variables při startu;
- seed syntetické firmy bez produkčních údajů;
- společný format/lint/typecheck;
- pnpm lockfile a frozen instalace v CI;
- oddělené dev/staging/production credentials;
- line endings a UTF-8 konzistentní mezi Windows a Linuxem;
- README pro spuštění a testy;
- krátká rozhodnutí architektury.

Vývojář A: Flexi adapter, datový model, engine. Vývojář B: onboarding, UI, auth, provozní pipeline. Bezpečnost, doménová pravidla a publikace výsledků se reviewují navzájem. Každý musí umět obnovit prostředí bez druhého.

## 17. Produkční infrastruktura

### 17.1 Výchozí topologie

Render Frankfurt:
- jedna placená web service obsluhující SPA/API;
- jeden placený background worker;
- jedna placená PostgreSQL 17;
- nezávislý staging;
- samostatná zálohovací cron úloha;
- privátní S3 kompatibilní bucket v EU pro šifrované zálohy.

Region Frankfurt je oficiálně dostupný. Databázovou verzi a velikost explicitně nastavit. Zdrojové obchodní údaje nemají být ve veřejném statickém CDN bucketu. [Render regions](https://render.com/docs/regions), [PostgreSQL konfigurace](https://api-docs.render.com/reference/create-postgres)

Výchozí malé provozní rozměry: API přibližně 1 GB RAM, worker 1–2 GB, DB přibližně 1–2 GB s možností navýšení. Konkrétní volbu odvodit z měření; malé bezplatné instance nepoužívat pro závazný zákaznický provoz.

### 17.2 Proč spravovaný hosting

Dva vývojáři mají řešit správnost produktu a zákazníky. Spravovaná databáze, nasazení, TLS a worker snižují množství vlastní administrace Linuxu. Kontejnery a standardní PostgreSQL zachovávají přiměřenou možnost migrace.

Levnější VPS je platná pozdější alternativa, pokud tým umí bezpečně spravovat server, zálohy a dohled. Úspora několika stovek na faktuře nemá převážit pravidelný čas a riziko správy.

### 17.3 Doména a síť

Jedna app doména pro UI/API/auth. Veřejný web může být na hlavní doméně. TLS ověřené, cookies omezené na aplikační origin. DB přes interní síť, veřejný DB přístup vypnout/omezit podle možností poskytovatele.

Žádné volné CORS wildcard s credentials. Chybná konfigurace allowed origins je release blocker. Veřejné status informace neobsahují jména klientů.

### 17.4 Zálohy

Placený Render PostgreSQL má PITR s oknem podle zvoleného workspace plánu. Free compute tuto obnovu nemá. Ověřit konkrétní recovery window před prodejem. [Render backups](https://render.com/docs/postgresql-backups)

Navíc denní šifrovaný logický export do jiné služby. Pro S3 kompatibilní úložiště lze zvolit Scaleway v dostupné EU oblasti; skutečné šifrování a retenční nastavení jsou vaše odpovědnost. [Dostupnost regionů](https://www.scaleway.com/en/product-availability-by-region/), [shared responsibility](https://www.scaleway.com/en/docs/object-storage/reference-content/storage-shared-responsibility-model/)

Počáteční cíle:
- databáze: zamýšlené RPO do 15 minut při dostupném a ověřeném PITR;
- katastrofická ztráta celého poskytovatele: RPO do 24 hodin z denního nezávislého exportu;
- RTO do 4 hodin pro pilotní provoz s dostupným operátorem.

To jsou provozní cíle k ověření, nikoli garantované SLA. Nelze slibovat 15minutové RPO při ztrátě poskytovatele, pokud externí backup běží jednou denně.

Každý měsíc obnovit zálohu do izolované instance a spustit kontrolu počtů, přihlášení, tenantů a reprodukovatelného výpočtu. Ověřit obnovu secrets a deletion ledger. Záloha bez restore testu není doložená obnova.

### 17.5 Monitoring

Měřit:
- úspěšnost a stáří synchronizace na tenant;
- queue lag, retry, dlouhé joby a heartbeat;
- čas výpočtu, velikost vstupu, paměť workeru;
- počet datových problémů;
- DB connections, úložiště, pomalé dotazy;
- latenci/chybovost API;
- nepovolené přístupy a nárůst auth chyb;
- e-mail bounce a neodeslaný outbox;
- poslední úspěšnou zálohu a restore test.

Strukturované logy s correlation ID, tenant ID a job ID, bez obchodních payloadů. Vybrat jednu službu pro chyby a jeden externí uptime check; ověřit redakci i smluvní režim. Celý observability stack v Kubernetes je pro V1 nepřiměřený.

Health endpoints oddělit:
- liveness: proces běží;
- readiness: může obsluhovat provoz;
- worker heartbeat: zpracovává frontu.

Problém u jediného Flexi zákazníka nesmí způsobit restart celé aplikace všech firem.

### 17.6 Škálování

Nejdřív indexy, dávkování, limity a coalescing; potom větší worker či další worker. API replikovat až po ověření sdílených sessions, rate limiting a správné publikace výsledků.

Největší růst dat jsou revize a alokace; retence a mazání jsou součást provozu od pilotu. Dashboard nesestavuje pokaždé celý materiálový plán znovu.

Přidání druhého skladu či ERP je produktová změna, ne prosté přidání serveru.

## 18. CI/CD, migrace a vydávání

### 18.1 Každý pull request

Spustit frozen dependency install, kontrolu formátu, lint, TypeScript, unit/domain testy, důležité property testy, databázové integrační testy, test tenant isolation, build web/API/worker a základní E2E.

Review se zaměřuje na změny doménových pravidel, SQL migrace, autorizaci a zacházení s credentials. Dependency upgrade nemíchat s velkou změnou algoritmu, pokud to není nutné.

Skenovat secrets, známé zranitelnosti a container image. Security advisory posuzovat podle skutečně použité funkce a dosažitelnosti; opravy exploatovatelných kritických/high chyb mají prioritu před novou funkcí.

### 18.2 Nasazení

1. Sestavit immutable image/artifact pro konkrétní commit.
2. Otestovat ve staging.
3. Ověřit zálohu a migrační plán.
4. Spustit explicitní migraci jako jednorázový release job.
5. Nasadit API a worker.
6. Provést smoke test.
7. Sledovat chyby a queue lag.
8. Při problému vrátit kompatibilní aplikaci na předchozí release.

Migrace nespouštět při startu každé API repliky. Změny schématu používat expand/contract: přidat kompatibilní pole, nasadit kód, doplnit data, odstranit staré až v dalším bezpečném kroku.

Rollback aplikace automaticky nevrací smazaný sloupec ani přepsaná data. Destruktivní migrace vyžaduje samostatný plán a obnovu či forward fix.

### 18.3 Release enginu

Novou engine_version nejprve spustit nad referenčními daty a vybranými existujícími revizemi ve shadow režimu. Porovnat množství a stavy. Rozdíly vysvětlit a schválit. Nové výsledky bez kontroly neposlat zákazníkům jako stovky náhle vzniklých problémů.

Možnost postupného nasazení po organizacích. Důležité změny popsat zákazníkům stručně přes jejich dopad.

### 18.4 PWA a kompatibilita klienta

Server i klient mají release ID. API kontrakt držet zpětně kompatibilní po dobu, kdy mohou existovat stará okna aplikace. Klient vyzve k aktualizaci při nepodporované verzi; nenechá staré rozhraní provádět nové nekompatibilní mutace.

Service worker nepřepíná build uprostřed ukládání. Rozpracované lokální nastavení uložit nebo požádat uživatele o dokončení před obnovou.

## 19. Fakturace a ekonomika

### 19.1 Nabídka první verze

Hypotéza: 2 990 Kč měsíčně bez DPH, je-li provozovatel plátcem, za jednu účetní jednotku a jeden sklad v definovaném profilu. Na prodejní stránce uvést skutečný daňový režim provozovatele; příklad ceny není hotový ceník.

Cena obsahuje omezený úvodní onboarding, podporované procesy a domluvenou frekvenci synchronizace. Víc skladů ani individuální účetní pravidla nejsou skrytě zahrnutá.

Neúčtovat první piloty podle počtu uživatelů, který brání zapojení nákupčího a výroby. Začít s rozumným limitem týmu, například 5 účtů, a ověřit potřebu.

### 19.2 Platební fáze

První placené piloty: standardní faktura a bankovní platba. Stav předplatného spravovaný v aplikaci, každá manuální změna auditovaná.

Po opakované ochotě platit: hosted checkout a customer portal poskytovatele plateb, například Stripe. Cenu nepřebírat z browseru; klient vybírá produktový identifikátor a server validuje příslušný plán. Stav přístupu vychází z ověřeného serverového billing stavu, ne z návratové thank-you stránky.

Webhook signature ověřit, event ID deduplikovat, počítat s opakováním a změněným pořadím událostí. Pravidelně porovnávat vlastní stav s poskytovatelem. [Stripe subscriptions webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)

Faktury a daňový režim služby sladit s účetní. Nevyvíjet vlastní účetní systém ani ukládat údaje platebních karet.

### 19.3 Přístup při ukončení a neplacení

Trial končí po 30 dnech od aktivace. Přechod na placené používání musí být zřejmý. Bez souhlasu nezahájit překvapivé účtování.

Po nezaplacení: upozornění, krátká předem definovaná grace period, poté zastavit synchronizaci a nabídnout read-only export. Zrušení služby neznamená okamžité smazání všech dokladů; řídit se zveřejněnou retencí a smlouvou.

### 19.4 Model nákladů

Následující částky jsou rozpočtový model v Kč, nikoli převod konkrétního ověřeného ceníku. Nezahrnují mzdy zakladatelů ani daně. Před zřízením ověřit aktuální ceny, kurz, DPH, limity a placené doplňky. [Render ceník](https://render.com/pricing)

| Oblast | Orientační rozpočet za měsíc při malém placeném provozu |
|---|---:|
| API/web, worker, managed DB | 2 000–6 000 Kč |
| staging a testovací prostředí | 500–2 000 Kč |
| zálohy, soubory, transakční e-mail, dohled | 500–2 000 Kč |
| základní provoz celkem | 3 000–10 000 Kč |
| dedikované IP, vyšší dostupnost, větší paměť | zvlášť podle potřeby |

Free tier lze využít při demonstrátoru, ne jako základ slibované spolehlivosti. Vlastní účetní API zákazníka může mít další náklad, který nenese automaticky vaše předplatné.

Model na zákazníka:
- tržba 2 990 Kč;
- přidělený provozní náklad 250 Kč;
- 1 hodina podpory při interním ocenění 500 Kč;
- modelový příspěvek 2 240 Kč před dalšími fixními náklady, vývojem, prodejem a daněmi.

Při 50 zákaznících je tržba 149 500 Kč a modelový příspěvek 112 000 Kč před uvedenými dalšími náklady. Při 100 zákaznících 299 000 Kč a 224 000 Kč. Nejde o zisk ani předpověď dosažitelného počtu zákazníků.

Pokud zákazník vyžaduje 4 hodiny podpory měsíčně, stejný model zanechá jen 740 Kč. Proces onboardingu a kvalita dat tak mohou zničit ekonomiku i při levném serveru.

### 19.5 Škálování byznysu

První segment je omezený a jeho skutečnou velikost nemáme doloženou. Růst může později pokračovat více sklady, distribučním partnerstvím či druhým ERP, ale každá cesta přináší vlastní náklady.

Nepočítat celkový počet českých výrobců jako váš adresovatelný trh. Spočítat průnik: konkrétní ERP + potřebná edice/API + relevantní evidence + opakovaný problém + rozpočet a ochota platit.

## 20. Prodej hotového produktu a první zákazníci

### 20.1 Ukázka

Veřejné demo s modelovými zakázkami a tlačítkem „Posuň dodávku o 3 dny“. Návštěvník okamžitě uvidí, kterým příkazům začne chybět materiál a proč.

Demo je označené jako modelové a nepožaduje firemní hesla. Není odkazem na cizí veřejné ERP demo s neomezenými write operacemi.

### 20.2 Nabídka

„Používáte ve Flexi sklad a kusovníky? Připojíme podporovanou evidenci a ukážeme, kterým naplánovaným zakázkám chybí materiál. Vyzkoušíte třicet dní. Předem znáte cenu i podporovaný rozsah.“

Zákazníka nepřesvědčovat tvrzením, že aplikace plánuje celou výrobu. Ukázat skutečný výpočet a rozdíl proti jeho dnešní přípravě.

### 20.3 Kvalifikace před připojením

Ověřit software/edici, síťovou dostupnost API, sklad a kusovníky, typ dokladů, částečné realizace, rezervace, odpovědného uživatele a dnešní způsob práce. Vyloučit zákazníky vyžadující od první instalace individuální engine.

Implementátoři Flexi mohou být kanál i konkurence. Nenabízet partnerství jako jistý zdroj distribuce; ověřit, zda chtějí doporučovat hotový omezený doplněk a jakou ekonomiku potřebují.

### 20.4 Měřit celý funnel

Kvalifikovaná firma → ukázka → skutečné připojení → ověřené tři zakázky → aktivní používání → platba → pokračování.

Měřit konverze s jmenovatelem. „Tři zákazníci platí“ znamená něco jiného z pěti trialů než ze sta. Malý vzorek neposkytuje spolehlivou předpověď celého trhu.

### 20.5 Navržené obchodní brány

Brána B1: během prvních rozhovorů a ukázek najít několik firem, které odpovídají stejnému podporovanému procesu. Pokud každý vyžaduje něco jiného, zúžit nebo zastavit.

Brána B2: pět nezávislých funkčních připojení bez zákaznických úprav enginu. Cíl onboardingu do dvou hodin práce podpory na firmu po ověření kvality dat.

Brána B3: alespoň tři z prvních pěti vhodných trialů přejdou na předem uvedenou placenou cenu a alespoň dva pokračují i další období. Jde o interní investiční pravidlo, ne o statistický důkaz 60% budoucí konverze.

Brána B4: zákazníci používají produkt pravidelně a podpora/kvalita dat nevyčerpává ekonomiku.

Pokud není B3 splněná, nejdřív zjistit důvod. Slabá hodnota, složité připojení a špatně zvolený segment vyžadují jinou reakci než nízká návštěvnost webu. Další dashboardy tento problém automaticky nespraví.

## 21. Plán implementace pro dva vývojáře

Odhad před skutečným technickým pokusem: přibližně 75–110 člověkodnů včetně ověřování, dokumentace, pilotních oprav a rezervy. Při dvou lidech, kteří věnují část času prodeji a podpoře, počítat řádově 10–16 kalendářních týdnů. Není to závazný termín.

Plán se aktualizuje po G0. Pokud data vyžadují změnu rozsahu, neudržovat původní harmonogram za cenu nepravdivých výsledků.

### Fáze G0 — proveditelnost a význam dat

Rozpočet: 5–8 člověkodnů.

- vývojová licence a testovací Flexi;
- několik kusovníků a výrobních příkazů;
- částečné realizace, příjmy, rezervace, storna;
- čtení evidencí a properties;
- zápis ověřeného mappingu;
- porovnání s dnešními vestavěnými funkcemi;
- potvrzení podporovaného síťového prostředí;
- technické ověření vybraného auth/DB/queue základu.

Výstup: podložená datová smlouva a ručně vypočtené referenční scénáře.

STOP podmínka: nelze jednoznačně získat potřebu či správně zohlednit zásobu, nebo už dnešní konfigurace zákazníka poskytuje stejnou hodnotu.

### Fáze G1 — výpočet a demonstrátor

Rozpočet: 10–15 člověkodnů.

- čistý engine a přesné množství;
- fyzický/očekávaný průchod;
- vysvětlení alokací;
- kritické unit/property testy;
- základní UI s modelovými daty;
- několik reprezentativních scénářů.

Výstup: demonstrace problému i jeho řešení bez cizích firemních dat. V tuto chvíli lze začít ukazovat funkční věc vhodným firmám.

### Fáze G2 — první obecné připojení

Rozpočet: 15–20 člověkodnů.

- auth, organizace, role a RLS;
- credentials a SSRF ochrana;
- capability checks a onboarding;
- import, revisions, job orchestrace;
- data quality a atomická publikace;
- přehled, detail zakázky/materiálu.

Výstup: skutečné připojení vlastní testovací firmy přes stejný průvodce jako zákazník.

### Fáze G3 — pilotní použitelnost

Rozpočet: 15–20 člověkodnů.

- lokální termíny a scénáře;
- souběžné změny;
- upozornění/outbox;
- export;
- mobilní přehled a základní PWA;
- audit, odpojení a support režim;
- testy na více prohlížečích a zařízení.

Výstup: omezená pilotní aplikace se srozumitelnými chybami a bezpečnými daty.

### Fáze G4 — produkční připravenost

Rozpočet: 15–22 člověkodnů.

- managed prod/staging;
- CI/CD, migrace, rollback;
- zálohy a restore test;
- observability, incidentní postup;
- security review, tenant a SSRF testy;
- trial/billing state, dokumenty;
- výkonová měření.

Výstup: placený provoz lze obhájit testy a skutečnou schopností obnovy.

### Fáze G5 — pilotní opravy a obchodní ověření

Rezerva: 15–25 člověkodnů, postupně během předchozích fází.

- reálné firmy ve stejném rozsahu;
- korekce zjištěných rozdílů dat;
- zlepšení onboarding postupu;
- měření užitku;
- rozhodnutí o rozšíření.

Vypočtené součty dávají 75–110 člověkodnů. Rozsáhlé právní práce, externí audit a obtížné individuální zákaznické procesy nejsou skrytě zahrnuté v programátorském odhadu.

## 22. Backlog v pořadí k implementaci

| ID | Úkol | Hotovo, když |
|---|---|---|
| 01 | datový technický pokus | skutečné doklady vysvětlují všechna povinná pole |
| 02 | reference scénářů | malé vstupy mají ručně ověřené očekávané výsledky |
| 03 | repo/runtime/CI | čistý checkout projde buildem a základními testy |
| 04 | domain typy | množství, jednotky, termíny a rezervace mají explicitní model |
| 05 | BOM validace | chybějící/vnořené/cyklické BOM nejsou tiše přijaty |
| 06 | alokační engine | projdou T01–T22 a příslušné vlastnosti |
| 07 | vysvětlení výsledku | každou alokaci lze dohledat do vstupu |
| 08 | demo UI | uživatel uvidí dopad posunu dodávky |
| 09 | auth a sessions | ověřený login/logout/reset, TOTP a revoke fungují |
| 10 | organizace a členství | role serverově chrání všechny mutace |
| 11 | SQL schéma a RLS | cizí tenant je nedostupný i při přímém ID |
| 12 | Flexi klient | paging, timeout, limity, retry a povolené hosty |
| 13 | secrets | ciphertext, rotace a redakce logů otestované |
| 14 | onboarding | mapování bez editace zdrojového kódu |
| 15 | snapshot/import | neúplný sync nezmění publikovaný dataset |
| 16 | změny a cursor | retry/delete/storno neztratí či nezdvojí potřebu |
| 17 | data quality | neznámé potřeby správně ovlivní důvěru v plán |
| 18 | scheduler/worker | jedna sync na tenant, nové signály se sloučí |
| 19 | publish plánu | starý běh nepřepíše nový a hash je reprodukovatelný |
| 20 | pracovní přehled | filtr a detail používají konkrétní plan ID |
| 21 | scénáře | změny izolované, konflikt a stale base jsou viditelné |
| 22 | alerts/outbox | opakování neprodukuje běžně stejné zprávy |
| 23 | export | autorizace, formule, expiry a jednotky otestované |
| 24 | PWA/mobil | běžný web funguje i bez instalace; cache neukládá ERP data |
| 25 | provozní prostředí | oddělené prod/staging, secrets, DB role a region |
| 26 | zálohy a obnova | doložená izolovaná obnova v cílovém čase |
| 27 | observability | odhalí stale tenant, mrtvý worker a neodeslaný outbox |
| 28 | trial/fakturace | aktivace, expiry, grace, cancel a read-only export |
| 29 | privacy/retence | mazání a restore deletion ledger fungují |
| 30 | release review | splněné testy, dokumenty a podporovaný rozsah |
| 31 | první vhodná firma | tři její zakázky společně ověřené |
| 32 | další nezávislé firmy | stejná verze funguje bez individuálního enginu |
| 33 | placené pokračování | platba a pravidelné použití měřené |
| 34 | rozhodnutí o rozšíření | ekonomika a požadavky odůvodňují novou funkci |

Nejdřív implementovat 01–08. Komplexní billing, marketingový web a design celé administrace neprokazují správnost jádra.

## 23. Podmínky před prvním placeným provozem

### Správnost
- datový mapping potvrzený na skutečné podporované instalaci;
- zpracované rezervace a zbývající množství;
- všechny hlavní referenční scénáře projdou;
- neznámé a stale údaje nevytvářejí ověřené zelené výsledky;
- každé vysvětlení se dá reprodukovat;
- porovnání několika skutečných příkazů se zákazníkem.

### Bezpečnost
- tenant testy na runtime DB roli;
- ověřené pozvánky, odvolání přístupu a TOTP privilegovaných účtů;
- omezené API credentials, šifrování a rotace;
- SSRF ochrana a povolená konektivita;
- bez citlivých údajů v browser cache/logs;
- opravené dosažitelné kritické/high advisories;
- review externím specialistou, pokud tým nemá potřebnou zkušenost.

### Provoz
- oddělené prostředí;
- automatická záloha a úspěšná obnova;
- ověřený deploy a rollback;
- dohled na sync, worker, databázi i e-mail;
- limity úloh a API;
- výpadek ERP nevymaže platný poslední výsledek;
- dokumentovaný incident a dostupnost podpory.

### Produkt a smlouva
- cena a trial předem jasné;
- podporovaný proces a omezení popsané;
- termín potřeby materiálu odsouhlasený;
- privacy/DPA/subdodavatelé a retence ověřené;
- export, odpojení a zrušení dostupné;
- obchodní tvrzení odpovídají změřeným výsledkům.

Tento seznam je release gate, ne seznam slibů, že už je vše hotové.

## 24. Incidentní návody

### A. Jeden zákazník má neaktuální data

Zkontrolovat přístup, kvótu a poslední job. Zastavit škodlivé opakování. U zákazníka označit stale výsledek; ostatní firmy pokračují. Po obnově provést kontrolní sync, přepočet a teprve potom případně hlásit vyřešení.

### B. Objeví se chyba algoritmu

Zastavit publikaci a upozornění dotčené verze, vymezit dotčené organizace a data. Nechat poslední ověřený výsledek s viditelným omezením, nebo jej označit jako neověřený. Opravit, doplnit regresní test, přepočítat revize a srozumitelně informovat dotčené zákazníky.

Tichá změna čísel bez vysvětlení ničí důvěru.

### C. Databáze je nedostupná

Readiness odpojí nefunkční službu. Worker nepokračuje v side effects, které nejsou bezpečně zaznamenané. Po obnově ověřit queue a idempotenci. Při obnově do jiné DB správně přepnout API, worker, auth i backup procesy.

### D. Podezření na únik credentials

Odpojit dotčená připojení, rotovat přístupy a klíče podle rozsahu, zachovat potřebné logy, zjistit dopad, postupovat podle incidentní a smluvní dokumentace. Nemazat důkazy automatickým „resetem všeho“.

### E. Záloha se nedá obnovit

Incident řešit ihned, nejen před další fakturací. Přepnout na dostupnou alternativu, zjistit poslední použitelný bod, opravit zálohování a provést nový restore test. Dokud není obnova doložená, neslibovat původní RPO/RTO.

## 25. Rozhodnutí u nejistých aspektů

| Otázka | Rozhodnutí pro první verzi | Co musí potvrdit ověření |
|---|---|---|
| Web nebo desktop? | web + volitelná PWA | reálná instalace na podporovaných zařízeních |
| Offline plánování? | aktuální firemní data pouze online | offline stránka neukazuje cizí/starý plán |
| Lokální Flexi? | cloud nebo bezpečně dostupné HTTPS API | dosažitelnost ze serveru |
| Universal MRP? | úzký materiálový přehled | segment skutečně vystačí s tímto rozsahem |
| Víceúrovňové BOM? | V1 nepodporuje | detekce a žádná tichá aproximace |
| Částečná výroba? | jen jednoznačně mapovatelný proces | realizace a výdeje v testovací firmě |
| Neznámé rezervace? | neověřený výsledek | přímý význam dat, ne odhad |
| Termín zakázky? | samostatné datum potřeby materiálu | zákazník jej umí rozumně zadat |
| Příjem dodávky? | plánovaný údaj, odlišný stav | zbývající příjem a datum |
| Prioritizace? | datum, priorita v rámci dne, ID | srozumitelnost a shoda s praxí |
| Snapshot? | verzovaný publikovaný dataset; bez slibu ERP transakce | stabilita importu při změnách |
| AI ve výpočtu? | deterministický engine | nepotřebuje model pro správnost |
| Auth SaaS či knihovna? | Better Auth s omezenou sadou funkcí | bezpečná integration spike a aktualizace |
| Hosting VPS či managed? | managed EU služby | měření nákladů a smluvních přenosů |
| Queue? | PostgreSQL/pg-boss | restart, retry a duplicity |
| API zápis? | pouze čtení podnikových dat | skutečná práva zákaznického účtu |
| Push? | odložený doplněk | potřeba uživatelů a zkouška zařízení |
| Trh? | nepotvrzený průnik zákazníků | kvalifikované firmy a placené pokračování |

Některé nejistoty se řeší zvolením menšího rozsahu. Význam skutečných ERP polí, kvalitu cizí evidence a ochotu platit nelze vyřešit pouze promyšlením u stolu.

## 26. První konkrétní pracovní týden

**Den 1:** získat vývojové prostředí, založit modelovou firmu, dokumentovat verzi/licenci a začít typy položek. Současně připravit kvalifikační otázky pro zákazníky.

**Den 2:** vytvořit jednoduchý výrobek a kusovník, skladovou zásobu, dva výrobní příkazy a jednu nákupní objednávku. Načíst API a porovnat UI. Začít mapping.

**Den 3:** vytvořit rezervace, částečný příjem, realizaci, storno a změnu termínu. Ověřit, co skutečně znamenají množství. Pokud zde vznikne neřešitelný rozpor, zúžit proces.

**Den 4:** normalizovaný vstup a první ručně ověřitelný engine. Model dvojího využití stejného materiálu a rozlišení skladu od očekávaného příjmu.

**Den 5:** minimální obrazovka s vysvětlením nedostatku a změnou data. Vnitřní review: odpovídá řešený problém potřebě firmy, nebo pouze umíme sestavit další tabulku?

To je zahájení implementace demonstrátoru, nikoli hotový SaaS do pátku.

## 27. Zdroje a hranice závěrů

Zdroje byly použity k ověření funkcí a dokumentovaných možností. Vlastní architektura, ceny, odhady času, provozní cíle a obchodní brány jsou návrhy tohoto dokumentu.

### ERP a dostupnost dat
- [ABRA Flexi: výrobní proces a omezení](https://podpora.flexibee.eu/cs/articles/16451824-vyrabime-jak-nastavit-abra-flexi)
- [ABRA Flexi: chybějící MRP](https://podpora.flexibee.eu/en/articles/5000601-does-abra-flexi-include-an-mrp-module)
- [Kusovník API](https://podpora.flexibee.eu/cs/articles/10838022-kusovnik-api)
- [Kusovník a Premium](https://podpora.flexibee.eu/cs/articles/6254380-kusovnik-wui)
- [Skladová evidence a integrační doporučení](https://podpora.flexibee.eu/cs/articles/3638593-jak-napojit-e-shop-na-abra-flexi-pres-rest-api)
- [Changes API a hooks](https://podpora.flexibee.eu/en/articles/3421857-changes-api-and-webhooks)
- [Přístup k API a licence](https://podpora.flexibee.eu/cs/articles/10097467-licencovani-pristupu-k-api)
- [Vývojářská licence](https://www.flexibee.eu/api/licence-pro-vyvojare/)
- [Existující doplňky](https://www.flexibee.eu/doplnky/)
- [Výrobní konkurence WorkBot](https://www.workbot.cz/)

### Web, PWA a runtime
- [Node releases](https://nodejs.org/en/about/previous-releases)
- [React versions](https://react.dev/versions)
- [Vite guide](https://vite.dev/guide/)
- [Fastify docs](https://fastify.dev/docs/latest/)
- [PostgreSQL versioning](https://www.postgresql.org/support/versioning/)
- [PWA installation](https://web.dev/learn/pwa/installation)
- [PWA caching](https://web.dev/learn/pwa/caching)
- [Edge web apps](https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge)
- [WebKit push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Microsoft SmartScreen](https://learn.microsoft.com/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen)

### Bezpečnost a provoz
- [PostgreSQL RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
- [Better Auth integration](https://better-auth.com/docs/integrations/fastify)
- [Better Auth advisories](https://github.com/better-auth/better-auth/security/advisories)
- [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [pg-boss](https://github.com/timgit/pg-boss)
- [Playwright](https://playwright.dev/docs/test-projects)
- [Render regions](https://render.com/docs/regions)
- [Render backups](https://render.com/docs/postgresql-backups)
- [Render outbound IP](https://render.com/docs/outbound-ip-addresses)
- [Render pricing](https://render.com/pricing)
- [Scaleway regions](https://www.scaleway.com/en/product-availability-by-region/)
- [EDPB roles](https://www.edpb.europa.eu/sme/learn-the-basics/data-controller-or-data-processor_en)

### Co zde není vydáváno za ověřený výsledek

Nebylo zřízeno zákaznické připojení, spuštěn API technický pokus, provedena instalace PWA, sestaven kompatibilní lockfile, změřen výkon enginu, ověřena záloha ani uskutečněn prodej. Dokument poskytuje konkrétní rozhodnutí a kritéria pro tyto kroky. Ověření na skutečných datech a platba zákazníka jsou stále součást následující práce.

## 28. Výchozí závěr pro implementaci

Začít webovým demonstrátorem a ověřením Flexi dat. První investice má dokázat správné rezervace, zbývající potřebu a srozumitelný přehled napříč několika příkazy. Teprve na této smlouvě stavět obecný onboarding, bezpečný SaaS a placený provoz.

PWA přidává pohodlí na PC a mobilu bez vašeho Windows instalátoru. Dlouhodobou hodnotu produktu tvoří správný výpočet, kvalitní data, rychlé připojení a měřitelná úspora práce.








