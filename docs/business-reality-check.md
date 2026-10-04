# Produktová akceptace po technickém nasazení

Technické testy, HTTPS ani bezplatný hosting nepotvrzují poptávku. Stav k 4. říjnu 2026:

- ABRA na stránce Flexi uvádí 4 000+ firem. Nejde o počet výrobních zákazníků Premium s použitelnými kusovníky. Velikost této podmnožiny zatím neznáme.
- Oficiální dokumentace potvrzuje Premium pro API kusovníku. API musí být také aktivované; licenční omezení nejsou jen vývojářský detail.
- Flexi už má „Objednávku do výroby“, která rozpadne výrobek na koncové materiálové položky. Prodejní tvrzení „Flexi neumí zjistit materiál“ by bylo zavádějící.
- Ověřovaná hodnota Navčasu: společný pohled na více zakázek, sdílené komponenty, rozdělení fyzického a očekávaného pokrytí a dopad přesunutí priorit. Musíme prokázat konkrétní rozdíl proti běžnému workflow ve Flexi a Excelu.
- Aktuální kód nemá automatické stahování z Flexi, konektor ani pravidelnou synchronizaci. Zpracovává potvrzený normalizovaný import. Neprodávejte schopnost, která zatím není implementovaná a ověřená.

## Rozhodovací brána

Navrhovaný postup, nikoli tvrzení o již dosažených výsledcích:

1. U tří výrobců zjistit poslední konkrétní případ chybějícího materiálu, současný postup, čas a odpovědnou osobu. Ukázku předvést na jejich workflow; kontakt neposílat bez Davidova zadání.
2. Od alespoň jednoho získat oprávnění pro read-only přístup/testovací export a ověřit kusovníky, remaining/WIP, rezervace, storna, částečné příjmy a datum potřebného materiálu.
3. Nad malým vzorkem nechat plánovače schválit každou odchylku proti evidenci. Nepřesné zdroje označit jako nejisté nebo blokující, ne vydávat odhad za skladovou pravdu.
4. Změřit čas potřebný k rozhodnutí před/po použití. Určit, zda přehled vede k konkrétní změně nákupu nebo pořadí výroby. Pouhé pochválení vzhledu není validace.
5. Nabídnout placený pilot s přesným rozsahem a podporou. Zapsat skutečnou ochotu platit a náklady na onboarding. Rozšíření funkcí řídit touto evidencí.

Pokud tři kvalifikované firmy nevidí hodnotu nad současným systémem, nejprve změnit segment nebo problém; nepřidávat funkce automaticky. Read-only není sám o sobě špatně, ale může být nedostatečný pro zákazníka, který potřebuje návrhy objednávek. Ty lze později připravovat jako kontrolovaný export s potvrzením člověka, bez automatického zápisu do ERP.

## Zdroje

- [ABRA Flexi: počet firem](https://www.abra.eu/flexi/)
- [Kusovník API a Premium](https://podpora.flexibee.eu/cs/articles/10838022-kusovnik-api)
- [Výroba a objednávka do výroby](https://podpora.flexibee.eu/cs/articles/16451824-vyrabime-jak-nastavit-abra-flexi)
- [Aktuální ceník a API služba](https://www.abra.eu/flexi/cenik/)
