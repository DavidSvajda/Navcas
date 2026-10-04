import { useState } from "react";
import { ArrowRight, Check, Mail, ShieldCheck } from "lucide-react";
export function PilotGuide({ tryScenario }: { tryScenario: () => void }) {
  const [answers, setAnswers] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);
  const ready = answers.every(Boolean);
  const questions = [
    "Vedeme ve Flexi aktuální sklad materiálu a jednoduché kusovníky.",
    "Umíme určit zbývající potřebu a datum zahájení zakázek.",
    "Materiálové pohyby průběžně zapisujeme; známe význam rezervací.",
    "Máme člověka, který porovná výpočet se skutečnou výrobou.",
  ];
  const mail = `mailto:svajdada@gmail.com?subject=${encodeURIComponent("Ověření materiálového plánování ve Flexi")}&body=${encodeURIComponent("Dobrý den, rád/a bych ověřil/a vhodnost Navčas pro naši firmu.\n\nNaše dnešní potíž:\nPoužívaná verze / edice Flexi:\nJak často připravujeme materiálový plán:\n\nProsím o návrh postupu ověření a konkrétní nabídku. Do tohoto e-mailu nepřikládám přístupové údaje ani účetní data.")}`;
  return (
    <div className="pilot-grid">
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Ověřte hodnotu za tři kroky</h2>
            <p>Nejdřív pochopit výsledek, potom zkontrolovat vlastní proces.</p>
          </div>
        </div>
        <ol className="pilot-steps">
          <li>
            <strong>Projděte konkrétní zakázku</strong>
            <p>
              V detailu uvidíte potřebné množství a odkud se materiál přidělil.
            </p>
          </li>
          <li>
            <strong>Posuňte jednu dodávku</strong>
            <p>
              Scénář ukáže dopad na další zakázky. Výchozí data zůstanou
              zachovaná.
            </p>
            <button className="secondary" onClick={tryScenario}>
              Vyzkoušet dopad změny <ArrowRight size={17} />
            </button>
          </li>
          <li>
            <strong>Porovnejte s dnešní přípravou</strong>
            <p>
              Ověříme správnost čísel, čas přípravy a náročnost připojení. Až
              potom dává smysl placený pilot.
            </p>
          </li>
        </ol>
        <div className="inline-note">
          <ShieldCheck size={18} />
          Bez slibu automatického řízení celé výroby.
        </div>
      </section>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Hodí se to pro naši firmu?</h2>
            <p>Odpovědi zůstávají v tomto okně a nikam se neposílají.</p>
          </div>
        </div>
        <div className="pilot-checklist">
          {questions.map((q, i) => (
            <label key={q}>
              <input
                type="checkbox"
                checked={answers[i]}
                onChange={(e) =>
                  setAnswers((a) =>
                    a.map((v, j) => (i === j ? e.target.checked : v)),
                  )
                }
              />
              <span>{q}</span>
            </label>
          ))}
          <div className="pilot-verdict" role="status">
            <Check size={19} />
            <p>
              {ready
                ? "Váš proces odpovídá základním podmínkám pro datové ověření. Napojení a přínos ještě musíme prokázat."
                : "Nevyplněné podmínky jsou témata k ověření. Ukázka sama nepotvrzuje vhodnost pro vaši firmu."}
            </p>
          </div>
          <a className="primary" href={mail}>
            <Mail size={17} />
            Domluvit ověření použitelnosti
          </a>
          <p className="fine-print">
            Otevře váš e-mail. Bez registrace, platby nebo automatického
            odeslání. Cena a rozsah případného pilotu budou sjednány předem.
          </p>
        </div>
      </section>
    </div>
  );
}
