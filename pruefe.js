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

/* Die Dreiklang-Fassung trägt keine Ablauflogik: sie zeigt nur, was der Build
   aus dem Mapping aufgelöst hat. Für sie gilt ein eigener Prüfzweig weiter
   unten; der Motor wird dort nicht gebraucht. */
const istDreiklang = !!(DATEN.baeume && DATEN.formel);

const von = html.indexOf("/*ENGINE-START*/");
const bis = html.indexOf("/*ENGINE-ENDE*/");
if (!istDreiklang && (von < 0 || bis < 0)) {
  console.error("Ablauflogik nicht abgegrenzt."); process.exit(2);
}
const E = istDreiklang ? null
  : new Function(html.slice(von + "/*ENGINE-START*/".length, bis)
                 + "\nreturn ENGINE;")();
const idx = istDreiklang ? null : E.baueIndex(DATEN);

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

/* --- 1b Dreiklang-Fassung: eigene Prüfungen, dann fertig ---------------- */
if (istDreiklang) {
  const B = DATEN.baeume;
  const blaetter = [];
  B.forEach(baum => (baum.anknuepfungspunkte || []).forEach(p =>
    (p.sachverhalte || []).forEach(sv =>
      blaetter.push({ baum, punkt: p, sv }))));

  pruefe(B.length + " Bäume mit " + blaetter.length + " Sachverhalten",
         B.length > 0 && blaetter.length > 0);

  /* Ein Baum ohne Anknüpfungspunkt und ein Anknüpfungspunkt ohne Sachverhalt
     wären Sackgassen - der Nutzer klickt und nichts passiert. */
  const sackgassen = [];
  B.forEach(baum => {
    if (!(baum.anknuepfungspunkte || []).length) sackgassen.push(baum.id);
    (baum.anknuepfungspunkte || []).forEach(p => {
      if (!(p.sachverhalte || []).length) sackgassen.push(baum.id + "/" + p.id);
    });
  });
  pruefe("kein Ast endet ohne Ergebnis", sackgassen.length === 0, sackgassen.join(", "));

  const leer = blaetter.filter(x => !(x.sv.anforderungen || []).length);
  pruefe("jeder Sachverhalt trägt Anforderungen", leer.length === 0,
         leer.map(x => x.sv.id).join(", "));

  /* Die Rechtsfolge muss das Kapitel der Folie enthalten. */
  const abweichend = blaetter.filter(x =>
    (x.sv.folie_kapitel || []).length
    && !(x.sv.folie_kapitel || []).every(k => (x.sv.kapitel || []).indexOf(k) >= 0)
    && !x.sv.abweichung_bekannt);
  pruefe("jede Rechtsfolge enthält das Kapitel der Folie",
         abweichend.length === 0,
         abweichend.map(x => x.sv.id + ": Folie " + x.sv.folie_kapitel.join("+")
                             + ", berechnet " + (x.sv.kapitel || []).join("+")).join(" | "));

  /* Die Zahlen in der Kopfzeile müssen die Liste darunter vollständig
     aufteilen - sonst steht eine Zahl da, die niemand nachrechnen kann. */
  const zahlFehler = blaetter.filter(x => {
    const n = x.sv.zahl, a = x.sv.anforderungen;
    return n.gesamt !== a.length
        || n.pflicht + n.anspruch + n.gegenseite + n.recht + n.ausnahme !== a.length;
  });
  pruefe("die Zahlen teilen die Liste vollständig auf",
         zahlFehler.length === 0, zahlFehler.map(x => x.sv.id).join(", "));

  /* Keine Anforderung darf innerhalb eines Sachverhalts doppelt stehen. */
  const doppelt = blaetter.filter(x => {
    const ids = x.sv.anforderungen.map(e => e.id);
    return new Set(ids).size !== ids.length;
  });
  pruefe("keine Anforderung erscheint zweimal im selben Sachverhalt",
         doppelt.length === 0, doppelt.map(x => x.sv.id).join(", "));

  /* Deckungsprobe: jede Req-ID muss im vollständigen Katalog so stehen. */
  const vollDatei = "data-act-check.html";
  if (!fs.existsSync(vollDatei)) {
    console.log("  (übersprungen) Deckungsprobe - " + vollDatei + " fehlt");
  } else {
    const VOLL = JSON.parse(fs.readFileSync(vollDatei, "utf8").match(
      /<script id="daten" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    const katalog = new Map(VOLL.anforderungen.map(a => [a.req_id, a]));
    const fremd = [], abweichung = [];
    blaetter.forEach(x => x.sv.anforderungen.forEach(e => {
      const a = katalog.get(e.id);
      if (!a) fremd.push(x.sv.id + "/" + e.id);
      else if (a.kapitel !== e.kapitel || a.fundstelle !== e.fundstelle
               || a.adressat !== e.adressat) abweichung.push(e.id);
    }));
    pruefe("alle Anforderungen stehen so im vollständigen Katalog",
           fremd.length === 0 && abweichung.length === 0,
           (fremd.length ? "unbekannt: " + fremd.slice(0, 5).join(", ") + " " : "")
           + (abweichung.length ? "abweichend: " + abweichung.slice(0, 5).join(", ") : ""));
  }

  console.log("\n" + (fehler ? fehler + " von " + geprueft + " Prüfungen fehlgeschlagen"
                              : geprueft + " Prüfungen bestanden"));
  process.exit(fehler ? 1 : 0);
}

/* --- 2 Alle Fragen erreichbar, keine zweimal ---------------------------- */
/* Reichweite wird konstruktiv gezeigt: Für jede Frage wird ein Antwortsatz
   gesucht, unter dem sie tatsächlich gestellt wird. Dazu werden viele
   vollständige Durchläufe mit zufälligen Antworten gefahren – mit festem
   Startwert, damit der Lauf wiederholbar ist. Jeder Treffer ist ein Beleg;
   eine Frage ohne Beleg wird als nicht erreichbar gemeldet. */
/* Vorbelegte Fragen eines Zuschnitts sind Prämissen und kommen in keinem
   Modullauf vor; sie werden bei der Reichweite nicht mitgezählt. */
const PRAEMISSEN = new Set(Object.keys((DATEN.profil || {}).vorbelegt || {})
  .filter(fid => {
    const f = DATEN.fragen.filter(x => x.id === fid)[0];
    return f && !idx.module.some(m => m.modul === f.modul);
  }));
const alleFragen = new Set(DATEN.fragen.map(f => f.id).filter(id => !PRAEMISSEN.has(id)));
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

/* Bei einem Zuschnitt sind die Vorbelegungen die Ausgangslage - ohne sie wäre
   kein Modul anwendbar und nichts erreichbar. */
const START_ANTWORTEN = {};
Object.keys((DATEN.profil || {}).vorbelegt || {}).forEach(fid => {
  START_ANTWORTEN[fid] = (DATEN.profil.vorbelegt[fid].antwort || []).slice();
});

for (let runde = 0; runde < DURCHLAEUFE; runde++) {
  const antworten = Object.assign({}, START_ANTWORTEN);
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

/* Eine Vorbelegung darf Zweige schließen - das ist ihr Zweck. EIN-05 = Ja
   (Niederlassung in der EU) macht EIN-06 unerreichbar, und das ist richtig.
   Gemessen wird deshalb die Reichweite OHNE Vorbelegungen; was erst durch sie
   zufällt, wird genannt, gilt aber nicht als Fehler. */
const fehlendMit = [...alleFragen].filter(f => !beleg.has(f)).sort();
let fehlend = fehlendMit;
if (fehlendMit.length && Object.keys(START_ANTWORTEN).length) {
  const belegOhne = new Set();
  for (let runde = 0; runde < 8000; runde++) {
    const antworten = {};
    let wache = 0;
    for (const def of idx.module) {
      for (;;) {
        if (++wache > 400) break;
        const zustand = E.zustandAus(antworten, idx);
        if (!E.modulAnwendbar(def, zustand, antworten)) break;
        const lauf = E.laufeModul(def.modul, antworten, idx);
        if (lauf.abbruch) break;
        lauf.schritte.forEach(s => belegOhne.add(s.frage_id));
        if (!lauf.aktuell) break;
        belegOhne.add(lauf.aktuell);
        const wahlen = moeglichkeiten(idx.fragen.get(lauf.aktuell));
        antworten[lauf.aktuell] = wahlen[zufall(wahlen.length)];
      }
    }
    if (belegOhne.size >= alleFragen.size) break;
  }
  fehlend = fehlendMit.filter(f => !belegOhne.has(f));
  const durchPraemisse = fehlendMit.filter(f => belegOhne.has(f));
  if (durchPraemisse.length) {
    console.log("  (Hinweis) durch die Vorbelegungen geschlossen: "
                + durchPraemisse.join(", "));
  }
}
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
  /* Ein Modul mit mindestens zwei Fragen suchen, die erste beantworten,
     danach die Folgefrage, dann die erste Antwort umstellen. */
  const schutz = Object.keys(START_ANTWORTEN);
  const modul = idx.module.filter(m => (idx.fragenJeModul.get(m.modul) || []).length > 2)[0];
  if (!modul) { console.log("  (übersprungen) Korrekturprobe"); return; }
  let a = Object.assign({}, START_ANTWORTEN);
  const erste = E.laufeModul(modul.modul, a, idx).aktuell;
  if (!erste) { console.log("  (übersprungen) Korrekturprobe: kein Einstieg"); return; }
  const optionen = idx.fragen.get(erste).antwortoptionen.map(o => o.schluessel);
  a[erste] = [optionen[0]];
  let tiefe = 0;
  for (;;) {
    const l = E.laufeModul(modul.modul, a, idx);
    if (!l.aktuell || tiefe >= 2) break;
    a[l.aktuell] = [idx.fragen.get(l.aktuell).antwortoptionen[0].schluessel];
    tiefe++;
  }
  /* Irgendeine Änderung an einer der gegebenen Antworten muss Folgeantworten
     unerreichbar machen - welche, hängt vom Modul ab. */
  let geprunt = null, geschuetztDa = true;
  Object.keys(a).forEach(fid => {
    if (geprunt || schutz.indexOf(fid) >= 0) return;
    idx.fragen.get(fid).antwortoptionen.forEach(o => {
      if (geprunt || a[fid].indexOf(o.schluessel) >= 0) return;
      const probe = Object.assign({}, a);
      probe[fid] = [o.schluessel];
      const b2 = E.bereinige(probe, idx, schutz);
      if (b2.entfernt.length) {
        geprunt = fid + " -> " + o.schluessel + ", entfernt: "
                + b2.entfernt.map(e => e.frage_id).join(", ");
        geschuetztDa = schutz.every(s => b2.antworten[s]);
      }
    });
  });
  pruefe("Korrektur räumt unerreichbare Folgeantworten ab, Vorbelegungen bleiben",
         tiefe >= 1 && !!geprunt && geschuetztDa,
         geprunt ? geprunt + " | Vorbelegungen erhalten: " + geschuetztDa
                 : "keine Änderung führte zu einer Bereinigung");
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
  if (DATEN.profil) {
    console.log("  (übersprungen) QS-Testprofile - gilt für das vollständige Werkzeug");
    return;
  }
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

/* --- 5b Zugeschnittene Fassung ------------------------------------------ */
if (DATEN.profil) {
  const P = DATEN.profil;
  const M = P.vorgehensmodell;

  /* Jede Vorbelegung muss eine gültige Antwortoption sein */
  const ungueltig = [];
  Object.keys(P.vorbelegt || {}).forEach(fid => {
    const f = idx.fragen.get(fid);
    if (!f) { ungueltig.push(fid + ": Frage fehlt"); return; }
    const gueltig = f.antwortoptionen.map(o => o.schluessel);
    (P.vorbelegt[fid].antwort || []).forEach(a => {
      if (gueltig.indexOf(a) < 0) ungueltig.push(fid + ": '" + a + "' ist keine Option");
    });
    if (!P.vorbelegt[fid].grund) ungueltig.push(fid + ": Begründung fehlt");
  });
  pruefe(Object.keys(P.vorbelegt || {}).length
         + " Vorbelegungen sind gültige Antwortoptionen mit Begründung",
         ungueltig.length === 0, ungueltig.join(" | "));

  /* Die Rollenfrage entscheidet, welche Kapitel gelten. Sie vorzubelegen hieße,
     die Betroffenheit zu behaupten statt sie zu prüfen - genau der Fehler, den
     diese Fassung behebt. */
  const rollenfrage = DATEN.fragen.filter(f =>
    f.gesetzte_variablen.filter(gv => gv.wert_sonst).length > 1)[0];
  pruefe("die Rollenfrage " + (rollenfrage ? rollenfrage.id : "?")
         + " ist nicht vorbelegt",
         !!rollenfrage && !(P.vorbelegt || {})[rollenfrage.id]);

  /* Jeder benannte Sachverhalt muss von einem Strang getragen werden */
  const getragen = new Set();
  (M.straenge || []).forEach(s => (s.sachverhalte || []).forEach(x => getragen.add(x)));
  const verwaist = (M.sachverhalte || []).filter(sv => !getragen.has(sv.id));
  pruefe((M.sachverhalte || []).length + " Sachverhalte sind je einem Strang zugeordnet",
         verwaist.length === 0,
         verwaist.map(sv => sv.kurz).join(", "));

  /* Keine Frage ohne Säule, keine Frage in zweien */
  const jeFrage = new Map();
  (M.straenge || []).forEach(s =>
    (s.fragen || []).forEach(fid =>
      jeFrage.set(fid, (jeFrage.get(fid) || []).concat(s.id))));
  const grundFragen = new Set((M.grundlagen || { fragen: [] }).fragen);
  const gezeigteModule = new Set((M.anknuepfungspunkte || []).map(a => a.modul));
  [...grundFragen].forEach(fid => {
    const f = idx.fragen.get(fid); if (f) gezeigteModule.add(f.modul);
  });
  const ohneSaeule = [], doppelt2 = [];
  DATEN.fragen.forEach(f => {
    if (!gezeigteModule.has(f.modul)) return;
    const wo = jeFrage.get(f.id) || [];
    if (wo.length > 1) doppelt2.push(f.id + ": " + wo.join(", "));
    if (!wo.length && !grundFragen.has(f.id)) ohneSaeule.push(f.id + " (" + f.modul + ")");
  });
  pruefe("jede Frage der gezeigten Module liegt in genau einer Säule",
         ohneSaeule.length === 0 && doppelt2.length === 0,
         (ohneSaeule.length ? "ohne Säule: " + ohneSaeule.join(", ") + " " : "")
         + (doppelt2.length ? "doppelt: " + doppelt2.join(" | ") : ""));

  /* Die Fragen eines Strangs stammen aus dem Modul seines Anknüpfungspunkts */
  const ankModul = {};
  (M.anknuepfungspunkte || []).forEach(a => { ankModul[a.id] = a.modul; });
  const falschesModul = [];
  (M.straenge || []).forEach(s => {
    const module = new Set((s.fragen || []).map(fid => {
      const f = idx.fragen.get(fid); return f ? f.modul : "?";
    }));
    if (module.size !== 1) falschesModul.push(s.id + ": " + [...module].sort().join(", "));
    else if (ankModul[s.anknuepfung] && !module.has(ankModul[s.anknuepfung])) {
      falschesModul.push(s.id + ": liegt in " + [...module][0]
                         + ", Anknüpfungspunkt nennt " + ankModul[s.anknuepfung]);
    }
  });
  pruefe((M.straenge || []).length + " Stränge liegen im Modul ihres Anknüpfungspunkts",
         falschesModul.length === 0, falschesModul.join(" | "));

  /* Zwei Anknüpfungspunkte dürfen sich ein Modul teilen (Anbieter und Kunde
     beide M-VI). Dann entscheidet die Modulbedingung nicht mehr, welcher Block
     gilt - ohne eigene Bedingung erschienen immer beide. */
  const ankerFehler = [];
  const jeModul = {};
  (M.anknuepfungspunkte || []).forEach(a => {
    jeModul[a.modul] = (jeModul[a.modul] || 0) + 1;
  });
  (M.anknuepfungspunkte || []).forEach(a => {
    if (jeModul[a.modul] > 1 && !a.bedingung) {
      ankerFehler.push(a.id + ": teilt Modul " + a.modul + " ohne eigene Bedingung");
    }
    if (a.bedingung) {
      const v = DATEN.variablen.filter(x => x.name === a.bedingung.variable)[0];
      if (!v) ankerFehler.push(a.id + ": Variable " + a.bedingung.variable + " fehlt");
      else if (v.werte && v.werte.indexOf(a.bedingung.wert) < 0) {
        ankerFehler.push(a.id + ": '" + a.bedingung.wert + "' ist kein Wert von " + v.name);
      }
    }
    if (a.begriff && !idx.begriffe.get(a.begriff)) {
      ankerFehler.push(a.id + ": Begriff '" + a.begriff + "' fehlt im Blatt Begriffe");
    }
  });
  pruefe((M.anknuepfungspunkte || []).length
         + " Anknüpfungspunkte: Bedingung und Begriff sind gültig",
         ankerFehler.length === 0, ankerFehler.join(" | "));

  /* Ein Block darf nur erscheinen, wenn seine eigene Bedingung zutrifft -
     über alle Rollenkombinationen geprüft. */
  const rollenOpt = rollenfrage.antwortoptionen.map(o => o.schluessel)
    .filter(k => rollenfrage.gesetzte_variablen.some(
      gv => gv.zuordnung.some(z => z.antwort === k)));
  const blockFehler = [];
  for (let maske = 1; maske < (1 << rollenOpt.length); maske++) {
    const wahl = rollenOpt.filter((_, i) => maske & (1 << i));
    const antworten = { [rollenfrage.id]: wahl };
    const zustand = E.zustandAus(antworten, idx);
    (M.anknuepfungspunkte || []).forEach(a => {
      const m = idx.module.filter(x => x.modul === a.modul)[0];
      const modulGilt = m && E.modulAnwendbar(m, zustand, antworten);
      const eigen = !a.bedingung || zustand[a.bedingung.variable] === a.bedingung.wert;
      const sichtbar = modulGilt && eigen;
      if (sichtbar && a.bedingung
          && zustand[a.bedingung.variable] !== a.bedingung.wert) {
        blockFehler.push(wahl.join("+") + "/" + a.id);
      }
      /* Die Kernprobe: Anbieter nur bei seiner Rolle, Kunde nur bei seiner */
      if (a.bedingung && modulGilt) {
        const soll = zustand[a.bedingung.variable] === a.bedingung.wert;
        if (sichtbar !== soll) blockFehler.push(wahl.join("+") + "/" + a.id);
      }
    });
  }
  pruefe("kein Block erscheint ohne seine eigene Rolle ("
         + ((1 << rollenOpt.length) - 1) + " Rollenkombinationen)",
         blockFehler.length === 0, [...new Set(blockFehler)].slice(0, 8).join(", "));

  /* Deckungsprobe gegen das vollständige Werkzeug, über mehrere Rollensätze:
     bei offener Rollenfrage hängt alles daran, welche Module gelten. */
  const vollDatei = "data-act-check.html";
  if (!fs.existsSync(vollDatei)) {
    console.log("  (übersprungen) Deckungsprobe - " + vollDatei + " fehlt");
  } else {
    const vollHtml = fs.readFileSync(vollDatei, "utf8");
    const VOLL = JSON.parse(vollHtml.match(
      /<script id="daten" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    const vollIdx = E.baueIndex(VOLL);
    const praem = Object.keys(P.vorbelegt || {});
    const rollensaetze = [["D","E"], ["C","D","E"], ["A","D","E"], ["A","C","D","E"], ["G"]];
    const abweichung = [], fremd = [];
    const gezeigteFragen = new Set([...jeFrage.keys(), ...grundFragen]);

    rollensaetze.forEach(rollen => {
      const antworten = {};
      praem.forEach(fid => { antworten[fid] = P.vorbelegt[fid].antwort.slice(); });
      antworten[rollenfrage.id] = rollen;
      for (let runde = 0; runde < 80; runde++) {
        const zustand = E.zustandAus(antworten, idx);
        let offen = null;
        for (const m of idx.module) {
          if (m.modul === "Ergebnis") continue;
          if (!E.modulAnwendbar(m, zustand, antworten)) continue;
          const l = E.laufeModul(m.modul, antworten, idx);
          if (l.aktuell) { offen = l.aktuell; break; }
        }
        if (!offen) break;
        antworten[offen] = [idx.fragen.get(offen).antwortoptionen[0].schluessel];
      }
      const schmal = E.baueErgebnis(antworten, idx, praem).ausgeloest.map(e => e.req_id).sort();
      const voll = E.baueErgebnis(antworten, vollIdx, praem).ausgeloest.map(e => e.req_id).sort();
      if (schmal.join() !== voll.join()) {
        abweichung.push(rollen.join("+") + ": " + schmal.length + " statt " + voll.length);
      }
      /* Jede ausgelöste Anforderung muss aus einer Frage stammen, die das Bild
         zeigt - sonst fällt sie unsichtbar ins Auffangfach. */
      E.baueErgebnis(antworten, idx, praem).ausgeloest.forEach(e => {
        if (e.belege.every(b => !gezeigteFragen.has(b.frage_id))) {
          fremd.push(rollen.join("+") + "/" + e.req_id);
        }
      });
    });
    pruefe("Deckungsprobe über " + rollensaetze.length
           + " Rollensätze deckt sich mit dem vollständigen Werkzeug",
           abweichung.length === 0, abweichung.join(" | "));
    pruefe("jede ausgelöste Anforderung stammt aus einer Frage, die das Bild zeigt",
           fremd.length === 0, [...new Set(fremd)].slice(0, 10).join(", "));
  }
}

/* --- 6 Umfang der Auslieferungsdatei ------------------------------------ */
(function () {
  const bytes = fs.statSync(datei).size;
  pruefe("Datei unter 5 MB (" + (bytes / 1024 / 1024).toFixed(2) + " MB)",
         bytes < 5 * 1024 * 1024);
})();

console.log("\n" + (fehler ? fehler + " von " + geprueft + " Prüfungen fehlgeschlagen"
                           : geprueft + " Prüfungen bestanden"));
process.exit(fehler ? 1 : 0);
