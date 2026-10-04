# G0: ověřit, zda má smysl pokračovat

Tento dokument mění pořadí investic z velkého návrhu: další SaaS vývoj je podmíněný datovým a obchodním ověřením. Dosavadní demonstrátor a čistý engine zůstávají použitelným nástrojem; dokončené modelové testy nejsou validace trhu.

## Co rozhodne

1. **Problém:** konkrétní odpovědný člověk opakovaně ručně řeší pokrytí zakázek. Vést ukázku jeho dnešní práce, čas, frekvenci a konkrétní následky. Chybějící modul ERP sám o sobě nestačí.
2. **Data:** na podporované konfiguraci je možné získat ověřenou zbývající potřebu, dostupný sklad a dodávky. Žádné odhady WIP či univerzální interpretace rezervací.
3. **Výsledek:** člověk ve firmě vysvětlí a potvrdí referenční případy včetně nedostatku a pozdní dodávky; nevysvětlená kritická odchylka blokuje další krok.
4. **Opakovatelnost:** stejný proces funguje u dalších firem bez změny výpočetního jádra. Jedna firma je první důkaz, nikoli důkaz krabicového SaaS.
5. **Peníze:** konkrétní nabídka s cenou a rozsahem získá platbu nebo závaznou objednávku od oprávněné osoby. Pochvala dema ani obecný zájem nejsou ochota zaplatit.

## Omezení první validační investice

Navržený strop: 5–8 člověkodnů technického ověření po zpřístupnění dat. Čas hledání zákazníka evidovat zvlášť. Pokud firma není dostupná, nepřesunout práci automaticky k platbám, multi-tenancy nebo dalším dashboardům. Žádná automatická outreach komunikace není součást tohoto projektu.

## Praktický postup

- Najít firmu s jedním podporovaným materiálovým skladem a jednoduchým přímým kusovníkem. Cílit na zakázky před zahájením výroby; složitou rozpracovanost z první zkoušky explicitně vymezit.
- Ověřit licence/API, přístup a význam dokumentů. Souhlas a oprávnění k datům patří před export; přístupové údaje nedávat do repozitáře ani příkazové historie.
- V testovací firmě vytvořit ručně známé případy. Teprve potom ověřit stejné mapování na autorizovaném zákaznickém vzorku.
- Uložit podklady do soukromého prostoru, v repozitáři ponechat jen anonymizované fixtures a popis mapování. Zaznamenat verzi Flexi, datum, účetní období, identifikaci skladu a konverze jednotek.
- Z normalizovaných dat sestavit `PlanInput`. CLI `npm run validate:data -- --input cesta.json` vytvoří výsledky a kontrolní CSV. **CLI zatím není Flexi API klient.** Správné mapování je dosud neověřená práce.
- S vedoucím výroby projít 10–20 reprezentativních zakázek/komponent: zásoba, rezervace, nedostatek, souběžná potřeba, pozdní a částečně přijatá dodávka. Zapsat očekávaný výsledek, rozdíl a jeho příčinu.
- Tentýž průchod zopakovat na novém stavu dat po několika pracovních dnech. Jednorázově upravený Excel není doklad udržitelné synchronizace.

## Rozdělení problémů

**Chyba aplikace:** opravit a doplnit reprodukovatelný test.  
**Jiné podporované nastavení dokladů:** převést na konfigurační profil, ověřit opakovatelnost u druhé firmy.  
**Chybějící evidence fyzického pohybu:** aplikace ji spolehlivě nevymyslí. Zákazník musí změnit proces, přijmout nižší rozsah nebo být mimo segment.  
**Proces vyžaduje individuální algoritmus:** nepřidávat do produktu neviditelnou zákaznickou větev. Buď rozšířit standardní scope s důkazem společné potřeby, nebo zakázku odmítnout.

## Cena a support

2 990 Kč není ověřená tržní cena; 10–15 tisíc Kč také není z kritiky odvozená jistota. Testovat nabídku a hodnotu, nikoli cenu zvýšit bez nového důkazu.

Oddělit opakované předplatné od placené jednorázové implementace. Individuální čištění dat a výjezdy nejsou automaticky zahrnuté v levném SaaS tarifu. Před nabídnutím rozsah, cenu a odpovědnost popsat konkrétně. Měřit získání klienta, onboarding, support i neúspěšné trialy.

Příklad: 2 990 Kč předplatné − 250 Kč provoz − 1 h podpory oceněná 500 Kč = 2 240 Kč měsíční příspěvek před vývojem, prodejem, fixními náklady a daněmi. Deset hodin prodeje a implementace při 500 Kč/h znamená 5 000 Kč pořizovacího nákladu a jednoduchou návratnost kolem 2,2 měsíce z tohoto příspěvku. Skutečnou ekonomiku zásadně mění neúspěšné nabídky, odchody, opravy a náklady zakladatelů; čísla jsou ilustrační.

## Rozhodnutí pokračovat / upravit / zastavit

- **Pokračovat:** správné a opakovaně potvrzené výpočty, společný podporovaný proces u dalších firem, placený pilot a přijatelná pracnost.
- **Upravit:** hodnota je jasná, ale cílová firma nebo rozsah vyžadují zúžení; znovu ověřit zúženou nabídku.
- **Zastavit:** potřebné údaje nelze získat, zákazník nemůže udržovat evidenci, většina nasazení vyžaduje vlastní engine nebo za konkrétní hodnotu nikdo nechce platit.

Počet firem ani prahy nejsou statisticky prokázaná konverze. První firma umožňuje pokračovat ve validaci. Neopravňuje investovat automaticky celé původní rozpočtové maximum.
