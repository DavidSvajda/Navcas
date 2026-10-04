# Import výrobních dat

Navčas přijímá PlanInput definovaný v packages/contracts/index.ts. Vstup není libovolný export ABRA Flexi. Příprava musí zachovat skutečný význam zbývajících množství, skladu a rezervací. Nepřikládají se ERP hesla. JSON soubor má nejvýše 2 MB; do 10 000 položek, 1 000 zakázek, 1 000 výrobků, 10 000 příjmů a 50 000 rozvinutých komponentových potřeb. Produkční výpočet má časový limit a omezenou frontu.

## Povinné části

| Pole              | Význam                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| revision          | Jedinečné označení importu firmy; již použité nelze přepsat            |
| asOf / horizonEnd | Den stavu evidence a poslední den plánování, YYYY-MM-DD                |
| items             | Materiály: id, code, name, unit, step; krok v dané jednotce            |
| products          | Výrobky a ověřený jednoduchý kusovník itemId/perUnit                   |
| stock             | Aktuální fyzická zásoba materiálu; jeden řádek na itemId               |
| orders            | Skutečně zbývající množství výrobku, datum potřeby materiálu, priorita |
| receipts          | Zbývající očekávané příjmy po odečtení již přijatých množství          |
| reservations      | Množství, vazba na zakázku a ověřený význam physical/logical/unknown   |

Množství jsou nezáporné desetinné řetězce, maximálně 16 míst před a 8 za tečkou. Nepoužívat float, záporná množství, vědecký zápis, datum vystavení místo data potřeby nebo vyrobené množství místo zbývajícího. Pokud význam rezervace není ověřený, označit unknown. Chybějící data nesmí být nahrazena smyšlenými nulami. Opakované řádky stejné komponenty v kusovníku se sčítají před zaokrouhlením; duplicitní ID entit a stavu skladu jsou odmítnuta.

## Ověření před pilotem

1. Vyberte zakázku s částečnou realizací: zbývající množství musí sedět s mistrem, ne pouze s původní objednávkou.
2. Porovnejte fyzický stav nejméně tří sdílených materiálů a zkontrolujte průběžné zápisy spotřeby.
3. Potvrďte, zda rezervace už je odečtená z uváděné fyzické zásoby. Normalizace nesmí stejný úbytek započítat dvakrát.
4. Zkontrolujte částečně přijatou dodávku, chybějící termín, storno a dodávku po potřebě výroby.
5. Potvrďte jednoduchý kusovník a jednotky. Nepodporované varianty označte; neprovádějte tiché převody.
6. Upozornění o neúplných datech projděte se zákazníkem. Syntakticky platný soubor není důkaz fyzického stavu.

Při importu správce vidí kontrolu před uložením. Potvrzení uloží novou revizi, zvýší verzi a zruší pracovní scénář. Historie vstupních revizí zůstává v databázi; UI obnovu staré revize zatím nenabízí. Konflikt verze nesmí být řešen automatickým přepsáním. Po importu zkontrolujte kvalitu dat i změnu materiálového deficitu. Plán nekontroluje kapacitu pracovišť ani nezaručuje termín dodavatele.
