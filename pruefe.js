/* pruefe.js – Abnahmeprüfung gegen die ausgelieferte data-act-check.html.
   Aufruf: node pruefe.js [datei]
   Geprüft wird die HTML-Datei selbst, nicht app.js oder data.json, damit
   genau das getestet wird, was der Mandant bekommt. */
"use strict";
const fs = require("fs");

const datei = process.argv[2] || "data-act-check.html";
const html = fs.readFileSync(datei, "utf8");

/* --- Daten und Ablauflogik aus der HTML herausschneiden ----------------- */
const datenTreffer = html.match(
  /<script id="daten" type="application\/json">([\s\S]*?)<\/script>/);
if (!datenTreffer) { console.error("Kein Datenblock gefunden."); process.exit(2); }
const DATEN = JSON.parse(datenTreffer[1]);

const von = html.indexOf("/*ENGINE-START*/");
const bis = html.indexOf("/*ENGINE-ENDE*/");
if (von < 0 || bis < 0) { console.error("Ablauflogik nicht abgegrenzt."); process.exit(2); }
const block = html.slice(von + "/*ENGINE-START*/".length, bis);
const E = new Function(block + "\nreturn ENGINE;")();
const idx = E.baueIndex(DATEN);

/* --- Prüfrahmen -------------------------------------------------------- */
let fehler = 0, geprueft = 0;
function pruefe(name, bedingung, zusatz) {
  geprueft++;
  if (bedingung) { console.log("  ok    " + name); return; }
  fehler++;
  console.log("  FEHLER " + name + (zusatz ? "\n         " + zusatz : ""));
}

/* --- 1 Keine externen Verweise ----------------------------------------- */
const verweise = [...html.matchAll(/(?:src|href|url\()\s*=?\s*["']?([^"')\s>]+)/gi)]
  .map(m => m[1])
  .filter(u => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(u) || /^https?:/i.test(u));
pruefe("keine externen URLs in der Datei", verweise.length === 0, verweise.join(", "));
pruefe("kein fetch/XMLHttpRequest/WebSocket",
  !/\b(fetch\s*\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon|import\s*\()/.test(html));
pruefe("keine externen Schriften", !/@font-face|fonts\.googleapis|fonts\.gstatic/.test(html));
pruefe("localStorage nur in try/catch",
  (html.match(/localStorage/g) || []).length ===
  (html.match(/try\s*\{[^}]*localStorage/g) || []).length,
  "jeder Zugriff muss in einem try-Block stehen");

/* --- 2 Alle Fragen erreichbar, keine zweimal ---------------------------- */
/* Reichweite wird konstruktiv gezeigt: Für jede Frage wird ein Antwortsatz
   gesucht, unter dem sie tatsächlich gestellt wird. Dazu werden viele
   vollständige Durchläufe mit zufälligen Antworten gefahren – mit festem
   Startwert, damit der Lauf wiederholbar ist. Jeder Treffer ist ein Beleg;
   eine Frage ohne Beleg wird als nicht erreichbar gemeldet. */
const alleFragen = new Set(DATEN.fragen.map(f => f.id));
const beleg = new Map();
const doppelt = [];
const sackgassen = [];
const abbrueche = [];
const DURCHLAEUFE = 20000;

let saat = 20260916;
function zufall(n) {                       /* xorshift, reproduzierbar */
  saat ^= saat << 13; saat ^= saat >>> 17; saat ^= saat << 5;
  return Math.abs(saat) % n;
}

function moeglichkeiten(frage) {
  const schluessel = frage.antwortoptionen.map(o => o.schluessel);
  if (!E.istMehrfachauswahl(frage)) return schluessel.map(s => [s]);
  const rollen = schluessel.filter(s => frage.gesetzte_variablen.some(
    gv => gv.zuordnung.some(z => z.antwort === s)));
  const rest = schluessel.filter(s => rollen.indexOf(s) < 0);
  const aus = [];
  for (let maske = 1; maske < (1 << rollen.length); maske++) {
    aus.push(rollen.filter((_, i) => maske & (1 << i)));
  }
  rest.forEach(s => aus.push([s]));
  return aus;
}

for (let runde = 0; runde < DURCHLAEUFE; runde++) {
  const antworten = {};
  let wache = 0;
  for (const def of idx.module) {
    for (;;) {
      if (++wache > 400) { abbrueche.push("Wächter in Runde " + runde); break; }
      const zustand = E.zustandAus(antworten, idx);
      if (!E.modulAnwendbar(def, zustand, antworten)) break;
      const lauf = E.laufeModul(def.modul, antworten, idx);
      if (lauf.abbruch) { abbrueche.push(def.modul + ": " + lauf.abbruch); break; }

      const ids = lauf.schritte.map(s => s.frage_id);
      ids.forEach(id => { if (!beleg.has(id)) beleg.set(id, def.modul); });
      if (new Set(ids).size !== ids.length) doppelt.push(def.modul + ": " + ids.join(" → "));

      if (!lauf.aktuell) {
        if (lauf.status !== "leer" && lauf.ende && lauf.ende.typ !== "ende") {
          sackgassen.push(def.modul + " endet nicht in Ergebnis oder Modulende");
        }
        break;
      }
      if (!beleg.has(lauf.aktuell)) beleg.set(lauf.aktuell, def.modul);
      const wahlen = moeglichkeiten(idx.fragen.get(lauf.aktuell));
      antworten[lauf.aktuell] = wahlen[zufall(wahlen.length)];
    }
  }
  if (beleg.size === alleFragen.size && runde > 2000) break;
}

const fehlend = [...alleFragen].filter(f => !beleg.has(f)).sort();
pruefe("alle " + alleFragen.size + " Fragen erreichbar (je ein Durchlauf als Beleg)",
       fehlend.length === 0,
       fehlend.length ? "kein Beleg für: " + fehlend.join(", ") : "");
pruefe("keine Frage wird zweimal gestellt", doppelt.length === 0, doppelt.slice(0, 3).join(" | "));
pruefe("kein Zyklus, kein Wächter-Abbruch", abbrueche.length === 0, abbrueche.slice(0, 3).join(" | "));
pruefe("jede Strecke endet in Ergebnis oder Modulende", sackgassen.length === 0,
       sackgassen.slice(0, 3).join(" | "));

/* --- 3 "Unsicher" führt überall weiter ---------------------------------- */
const unsicherProbleme = [];
DATEN.fragen.forEach(f => {
  const hat = f.antwortoptionen.some(o => /^unsicher$/i.test(o.schluessel));
  if (!hat) return;
  const kanten = f.kanten.filter(k => /^unsicher$/i.test(k.antwort));
  if (!kanten.length) { unsicherProbleme.push(f.id + ": keine Kante"); return; }
  kanten.forEach(k => {
    const geht = k.ziel_typ === "frage" || k.weiter_mit
              || (k.ziel_typ === "ergebnis" && k.ergebnistext)
              || k.ziel_typ === "ende_modul";
    if (!geht) unsicherProbleme.push(f.id + ": Kante ohne Fortsetzung");
    const text = (k.ergebnistext || "") + " " + (k.hinweis || "") + " " + (k.ergebnis_baustein || "");
    if (k.ziel_typ === "ergebnis" && !E.istUnsicherheit(text)) {
      unsicherProbleme.push(f.id + ": Ergebnis ohne Einzelfallhinweis");
    }
  });
});
const mitUnsicher = DATEN.fragen.filter(f =>
  f.antwortoptionen.some(o => /^unsicher$/i.test(o.schluessel))).length;
pruefe('"Unsicher" führt bei allen ' + mitUnsicher + " Fragen weiter",
       unsicherProbleme.length === 0, unsicherProbleme.slice(0, 5).join(" | "));

/* --- 4 Korrektur setzt unerreichbare Antworten zurück ------------------- */
(function () {
  let a = {};
  a["EIN-01"] = ["A"];
  a["EIN-02"] = [idx.fragen.get("EIN-02").antwortoptionen[2].schluessel]; /* Mittel */
  const lauf1 = E.laufeModul("EIN", a, idx);
  a[lauf1.aktuell] = [idx.fragen.get(lauf1.aktuell).antwortoptionen[0].schluessel];
  const lauf2 = E.laufeModul("EIN", a, idx);
  const vorher = Object.keys(a).length;
  a["EIN-02"] = [idx.fragen.get("EIN-02").antwortoptionen[3].schluessel]; /* Groß */
  const bereinigt = E.bereinige(a, idx);
  pruefe("Korrektur räumt unerreichbare Folgeantworten ab",
         bereinigt.entfernt.length > 0 && lauf2.schritte.length >= 2,
         "entfernt: " + bereinigt.entfernt.map(e => e.frage_id).join(", "));
})();

/* --- 4b Begriffsmarkierungen ------------------------------------------- */
(function () {
  const fehlerhaft = []; let gesamt = 0, ueberlappend = 0, doppelt = 0;
  function pruefeSpans(text, spans, wo) {
    if (!spans) return;
    let letztesEnde = -1; const gesehen = {};
    spans.forEach(s => {
      gesamt++;
      if (s.start < 0 || s.start + s.laenge > (text || "").length) {
        fehlerhaft.push(wo + ": Bereich außerhalb des Textes");
      }
      if (s.start < letztesEnde) ueberlappend++;
      if (gesehen[s.begriff]) doppelt++;
      gesehen[s.begriff] = true;
      letztesEnde = s.start + s.laenge;
    });
  }
  DATEN.fragen.forEach(f => {
    pruefeSpans(f.frage, f.frage_begriffe, f.id + "/frage");
    pruefeSpans(f.erklaertext, f.erklaertext_begriffe, f.id + "/erklaertext");
  });
  DATEN.ergebnisse.forEach(e => {
    pruefeSpans(e.beschreibung, e.beschreibung_begriffe, e.req_id);
    pruefeSpans(e.naechste_schritte, e.naechste_schritte_begriffe, e.req_id);
  });
  DATEN.anforderungen.forEach(a => {
    pruefeSpans(a.anforderung, a.anforderung_begriffe, a.req_id);
    pruefeSpans(a.ausloeser, a.ausloeser_begriffe, a.req_id);
    pruefeSpans(a.ausnahmen, a.ausnahmen_begriffe, a.req_id);
  });
  pruefe(gesamt + " Begriffsmarkierungen liegen im Text und überlappen nicht",
         fehlerhaft.length === 0 && ueberlappend === 0,
         fehlerhaft.slice(0, 3).join(" | ") + (ueberlappend ? ueberlappend + " überlappend" : ""));
  pruefe("je Textblock höchstens ein Vorkommen pro Begriff", doppelt === 0,
         doppelt + " Wiederholungen");
  const ohneEintrag = [];
  const pruefeNamen = spans => (spans || []).forEach(s => {
    if (!idx.begriffe.has(s.begriff)) ohneEintrag.push(s.begriff);
  });
  DATEN.fragen.forEach(f => { pruefeNamen(f.frage_begriffe); pruefeNamen(f.erklaertext_begriffe); });
  pruefe("jede Markierung verweist auf einen Eintrag im Blatt Begriffe",
         ohneEintrag.length === 0, ohneEintrag.slice(0, 3).join(", "));
})();

/* --- 4c Baumansicht ----------------------------------------------------- */
(function () {
  const probleme = []; let gesamtKnoten = 0;
  idx.module.forEach(m => {
    const a = E.baueBaum(m.modul, {}, idx);
    const b2 = E.baueBaum(m.modul, {}, idx);
    if (!a) { probleme.push(m.modul + ": kein Baum"); return; }
    gesamtKnoten += a.knoten.length;
    const schluessel = x => x.knoten.map(k => k.id + ":" + k.x + ":" + k.y).join("|");
    if (schluessel(a) !== schluessel(b2)) probleme.push(m.modul + ": Layout nicht stabil");
    (idx.fragenJeModul.get(m.modul) || []).forEach(f => {
      if (!a.knoten.some(k => k.id === f.id)) {
        probleme.push(m.modul + ": " + f.id + " fehlt im Baum");
      }
    });
    const tiefe = {};
    a.knoten.forEach(k => { tiefe[k.id] = k.tiefe; });
    a.kanten.forEach(e => {
      if (tiefe[e.nach] <= tiefe[e.von]) probleme.push(m.modul + ": Rückkante " + e.von + "→" + e.nach);
    });
  });
  pruefe("Baumlayout für alle " + idx.module.length + " Strecken deterministisch "
         + "und vorwärtsgerichtet (" + gesamtKnoten + " Knoten)",
         probleme.length === 0, probleme.slice(0, 4).join(" | "));
})();

/* --- 5 Profil: Rangfolge und Gegenprobe --------------------------------- */
(function () {
  const leer = E.berechneProfil({}, idx);
  pruefe("leeres Profil zählt null Anforderungen", leer.anzahl === 0);
  const vergleich = "testprofile_antworten.json";
  if (!fs.existsSync(vergleich)) {
    console.log("  (übersprungen) Gegenprobe zu verify_data.py – "
                + vergleich + " fehlt");
    return;
  }
  const soll = JSON.parse(fs.readFileSync(vergleich, "utf8"));
  const abweichungen = [], gegenQS = [];
  soll.profile.forEach(p => {
    const erg = E.baueErgebnis(p.antworten, idx);
    const ausgeloest = erg.ausgeloest.map(e => e.req_id).sort().join(",");
    const ausgeschlossen = erg.ausgeschlossen.map(e => e.req_id).sort().join(",");
    if (ausgeloest !== p.ausgeloest.slice().sort().join(",")
        || ausgeschlossen !== p.ausgeschlossen.slice().sort().join(",")) {
      abweichungen.push(p.profil_id + " (ausgelöst " + erg.ausgeloest.length
        + "/" + p.ausgeloest.length + ", ausgeschlossen "
        + erg.ausgeschlossen.length + "/" + p.ausgeschlossen.length + ")");
    }
    gegenQS.push({
      profil: p.profil_id,
      erwAus: p.qs_erwartet_ausgeloest.length, berAus: erg.ausgeloest.length,
      dAus: erg.ausgeloest.length - p.qs_erwartet_ausgeloest.length,
      erwEx: p.qs_erwartet_ausgeschlossen.length, berEx: erg.ausgeschlossen.length,
      dEx: erg.ausgeschlossen.length - p.qs_erwartet_ausgeschlossen.length,
      fehlt: p.qs_erwartet_ausgeloest.filter(r => !erg.ausgeloest.some(e => e.req_id === r)),
      zuviel: erg.ausgeloest.map(e => e.req_id).filter(r => p.qs_erwartet_ausgeloest.indexOf(r) < 0)
    });
  });
  pruefe("Profil im Werkzeug stimmt mit verify_data.py überein ("
         + soll.profile.length + " Testprofile)", abweichungen.length === 0,
         abweichungen.join(" | "));

  console.log("\n  Testprofile aus QS-Abschnitt 6, im fertigen Werkzeug gerechnet:");
  console.log("  Profil | erw.aus | ber.aus | Δ   | erw.ex | ber.ex | Δ");
  console.log("  -------+---------+---------+-----+--------+--------+----");
  let summe = 0;
  gegenQS.forEach(z => {
    summe += Math.abs(z.dAus) + Math.abs(z.dEx);
    console.log("  " + z.profil.padEnd(6) + " | " + String(z.erwAus).padStart(7)
      + " | " + String(z.berAus).padStart(7) + " | "
      + ((z.dAus >= 0 ? "+" : "") + z.dAus).padEnd(3) + " | "
      + String(z.erwEx).padStart(6) + " | " + String(z.berEx).padStart(6)
      + " | " + (z.dEx >= 0 ? "+" : "") + z.dEx);
  });
  gegenQS.filter(z => z.fehlt.length || z.zuviel.length).forEach(z => {
    if (z.fehlt.length) console.log("    " + z.profil + " fehlt: " + z.fehlt.join(", "));
    if (z.zuviel.length) console.log("    " + z.profil + " zusätzlich: " + z.zuviel.join(", "));
  });
  console.log("  Summe der Abweichungen gegenüber QS-Abschnitt 6: " + summe);
})();

/* --- 6 Umfang der Auslieferungsdatei ------------------------------------ */
(function () {
  const bytes = fs.statSync(datei).size;
  pruefe("Datei unter 5 MB (" + (bytes / 1024 / 1024).toFixed(2) + " MB)",
         bytes < 5 * 1024 * 1024);
})();

console.log("\n" + (fehler ? fehler + " von " + geprueft + " Prüfungen fehlgeschlagen"
                           : geprueft + " Prüfungen bestanden"));
process.exit(fehler ? 1 : 0);
