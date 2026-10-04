# Připravenost vydání — Navčas

Kód k 4. 10. 2026 má dva oddělené režimy: lokální syntetické demo a konfigurovatelný produkční provoz s PostgreSQL, OIDC a importem. Produkční konfigurace selže při chybějících údajích a nemá fallback na demo. Návrh nepovažuje úspěšný test za důkaz shody se skutečným skladem nebo za právní schválení.

## Doplněno v kódu

Trvalý firemní workspace, členství podle issuer/sub, role, odhlášení a revokace, dvouhodinové sessions, parametrizované SQL, FORCE RLS, atomické verze scénářů/importů, neměnná historie vstupů a audit. Produkční bezpečnostní hlavičky, Secure cookie a exact Origin/Host, sdílené PostgreSQL limity, worker výpočtu, import s náhledem a potvrzením. Docker, HTTPS/Caddy, migrace a admin příkazy.

[Nasazení](deployment.md) a [datový formát](data-import.md) jsou konkrétní postupy, ne slib automatické integrace.

## Co vyžaduje skutečné prostředí před vydáním

1. CI musí skutečně projít, zejména síťový PostgreSQL a Docker build. Lokální PGlite není ověření hostované databáze.
2. Staging musí ověřit konkrétního poskytovatele OIDC, přihlášení/MFA, callback, HTTPS proxy, cookies a odhlášení. Ověřit nepovolený účet, dvě firmy, oprávnění rolí a revokaci.
3. Doplnit doménu, skutečné runtime a migrační DB role, certifikáty, tajemství a jejich správu. App port nevystavovat mimo proxy.
4. Spravované zálohy, nezávislá kopie, skutečná obnova a změřené RPO/RTO. Sjednat retenci a postup výmazu firmy; runtime automaticky nemaže vstupní historii.
5. Přesný podnikatel a právní dokumenty odpovídající infra/providerům, smluvní rozsah a zpracování firemních dat. David zatím nemá IČO ani podnikatelské sídlo; údaje nelze domyslet. Produkční konfigurace je vyžaduje.
6. G0: ověřit normalizovaná skutečná data a přínos u firmy. Automatický Flexi konektor není v této verzi. Požadavek na jeho přidání vyžaduje konkrétní API/edici a potvrzený význam dat.
7. Sledování chyb, dostupnosti a případných incidentů, přístup správce, aktualizace a odpovědnost za provoz. Do logů nepřidávat tokeny ani účetní data.

Bez těchto reálných kontrol je dodaná verze kandidát pro staging, nikoli prohlášení o bezchybném veřejném SaaS. Prodejní validace je samostatná: kvalifikovaná firma, správné výsledky, ochota zaplatit, opakovatelný onboarding a přijatelná podpora.
