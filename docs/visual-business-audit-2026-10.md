# Vizuální, produktový a obchodní audit

Ověřeno proti veřejným primárním zdrojům 4. 10. 2026. „Standard roku 2026“ není jeden vizuální styl. Pro nákupčího a vedoucího výroby má přednost čitelnost, srozumitelné stavy, spolehlivé ovládání a dohledatelný důvod výsledku.

## Vizuální zjištění a změny

Původní rozhraní mělo příliš světlé vedlejší texty, drobné tabulkové údaje a malé ovládací prvky. Ztmaveny popisky a stavové barvy, zvětšena písma a cíle, doplněna viditelná focus linka a přeskočení navigace. Stavové štítky obsahují text; barva není jediným nositelem informace. Zachován střízlivý zelený vzhled a lokální fonty.

Při auditu se vycházelo z WCAG 2.2: běžný text minimálně 4,5:1, velký text 3:1, cíle nejméně 24 CSS px s definovanými výjimkami; důležité akce návrh zvětšuje na 40–44 px. Přístupnost neznamená pouze automatickou barvovou kontrolu. [Kontrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [velikost cíle](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/)

V mobilu mají zakázky samostatné karty. Tabulky, které musí zachovat srovnání sloupců, lze posouvat i klávesnicí. Dialogy mají názvy a zavírání Escape. Navigace má aktuální položku a stav rozbalení. Cookie a právní dialog je dostupný i přes URL hash.

## Pohled zákazníka

| Otázka klienta                          | Odpověď produktu                                             | Co ještě doložit                       |
| --------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| Co mám dnes řešit?                      | Rizikové zakázky, nedostatek a termín                        | Prioritizace v reálné výrobě           |
| Proč je zakázka červená?                | Detail potřeby a zdrojů přidělení                            | Shoda mapování s konkrétním Flexi      |
| Nemám už materiál objednaný?            | Včasné pokrytí, pozdní pokrytí a čistý deficit zvlášť        | Skutečné termíny a zbývající příjmy    |
| Co změna pokazí ostatním?               | Scénář s porovnáním proti výchozímu plánu                    | Užitečnost při zákaznickém rozhodování |
| Nepřepíšu účetnictví?                   | Ukázka nemá ERP zápisy; budoucí pilot má být read-only       | Ověření oprávnění skutečného konektoru |
| Co když se změní výpočet v druhém okně? | Konflikt verze při uložení a exportu                         | Víceuživatelská DB implementace        |
| Musím instalovat EXE?                   | Web a volitelná PWA                                          | Ověření skutečných firemních zařízení  |
| Kolik zaplatím a za co?                 | V ukázce nevzniká objednávka; nabídka až po vymezení procesu | Cena a akceptace konkrétního pilotu    |

## Úpravy, které mohou pomoci prodeji

- Přidán průvodce „Ověření pro vaši firmu“: konkrétní kroky ukázky, kvalifikační otázky a srozumitelný kontakt. Nevyžaduje registraci ani odeslání ERP dat.
- CTA otevírá e-mail připravený k ručnímu odeslání. Neslibuje automatickou instalaci, termín nebo garantovanou úsporu.
- Demonstrace ukazuje vzájemné dopady zakázek; při jednání je vhodné projít jednu konkrétní situaci místo prezentování seznamu funkcí.
- CSV má bezpečný přenos a kontroluje verzi, aby zákazník nedostal jiný scénář než ten, který si prohlížel.
- Jasně oddělená ukázka a skutečný produkt snižuje riziko nesplnitelných očekávání. Označení demo je nutné zachovat, dokud nejsou reálné integrace.

Žádná z těchto změn nemá změřený vliv na konverzi. Měřit zvlášť: kvalifikované kontakty → domluvené ověření → správný výsledek → placený pilot → pokračování. Měřit i čas prodeje a podpory. Nepřidávat sledovací nástroj jen kvůli těmto prvním několika obchodním případům; lze je evidovat ručně a přiměřeně.

## Aktuální největší obchodní riziko

Stále jím jsou skutečná data a placená hodnota, nikoli vzhled stránky. Nové bezpečnostní testy nebo rychlejší výpočet toto riziko neodstraňují. Další směrování je v G0-validace-a-obchodni-brany.md.
