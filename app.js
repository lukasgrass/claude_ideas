/* Data-Act-Check – Ablauflogik und Oberfläche.
   Alles in einer Funktion gekapselt, keine globalen Variablen außer dem
   Rückgabewert für die Tests. Keine Netzwerkzugriffe. */
(function () {
"use strict";

/* Reine Ablauflogik, kein DOM. pruefe.js schneidet den Block zwischen den
   beiden Marken heraus und prüft ihn gegen die ausgelieferte HTML-Datei;
   darum hier keine document-Zugriffe verwenden. */
/*ENGINE-START*/

var RANG = {
  "schließt aus": 4,
  "verschiebt Geltungsbeginn": 3,
  "löst aus": 2,
  "schränkt ein": 1
};
var RANG_NAME = { 4: "schließt aus", 3: "verschiebt Geltungsbeginn",
                  2: "löst aus", 1: "schränkt ein" };

/* Manche Fragen setzen laut Excel eine Variable, ohne dass dort steht, welche
   Antwort welchen Wert ergibt (III-01/KAP3_ROLLE, IV-02/KLAUSEL_ROLLE). Die
   Variable gilt dann als gesetzt, ihr Wert als unbekannt: "VAR gesetzt" ist
   erfüllt, jeder Wertvergleich liefert "unbekannt". Siehe NOTES.md. */
var UNBEKANNT = "\u0000wert-unbekannt";

/* Index über die eingebetteten Daten. */
function baueIndex(DATEN) {
  var idx = {
    daten: DATEN,
    fragen: new Map(),
    module: [],
    mappingJeFrage: new Map(),
    anforderungen: new Map(),
    ergebnisse: new Map(),
    fragenJeModul: new Map()
  };
  DATEN.fragen.forEach(function (f) {
    idx.fragen.set(f.id, f);
    if (!idx.fragenJeModul.has(f.modul)) idx.fragenJeModul.set(f.modul, []);
    idx.fragenJeModul.get(f.modul).push(f);
  });
  // Nur Module mit Einstiegsfrage sind Prüfstrecken; die Zeile "Ergebnis"
  // des Blattes Modulsteuerung hat keine und bleibt außen vor.
  idx.module = DATEN.module.filter(function (m) {
    return m.einstiegsfragen && m.einstiegsfragen.length > 0;
  });
  DATEN.mapping.forEach(function (m) {
    if (!idx.mappingJeFrage.has(m.frage_id)) idx.mappingJeFrage.set(m.frage_id, []);
    idx.mappingJeFrage.get(m.frage_id).push(m);
  });
  DATEN.anforderungen.forEach(function (a) { idx.anforderungen.set(a.req_id, a); });
  DATEN.ergebnisse.forEach(function (e) { idx.ergebnisse.set(e.req_id, e); });
  return idx;
}

/* Dreiwertige Auswertung der Ausdrucksbäume aus data.json.
   null = unbekannt (Klartextbedingung oder ungesetzte Variable). */
function bewerte(knoten, zustand, antworten) {
  if (!knoten) return true;
  var a, b;
  switch (knoten.op) {
    case "und":
      a = bewerte(knoten.links, zustand, antworten);
      b = bewerte(knoten.rechts, zustand, antworten);
      if (a === false || b === false) return false;
      if (a === null || b === null) return null;
      return true;
    case "oder":
      a = bewerte(knoten.links, zustand, antworten);
      b = bewerte(knoten.rechts, zustand, antworten);
      if (a === true || b === true) return true;
      if (a === null || b === null) return null;
      return false;
    case "nicht":
      a = bewerte(knoten.operand, zustand, antworten);
      return a === null ? null : !a;
    case "unklar":
      return null;
    case "gesetzt":
      return Object.prototype.hasOwnProperty.call(zustand, knoten.variable);
    case "=": case "≠": case "∈": case "∉":
      var wert = zustand[knoten.variable];
      if (wert === undefined) return (knoten.op === "=" || knoten.op === "∈") ? false : null;
      if (wert === UNBEKANNT) return null;
      if (knoten.op === "=") return wert === knoten.wert;
      if (knoten.op === "≠") return wert !== knoten.wert;
      if (knoten.op === "∈") return knoten.werte.indexOf(wert) >= 0;
      return knoten.werte.indexOf(wert) < 0;
    case "antwort":
      var gegeben = antworten[knoten.frage];
      if (!gegeben) return null;
      var drin = gegeben.indexOf(knoten.wert) >= 0;
      return (knoten.vergleich || "=") === "=" ? drin : !drin;
    default:
      return null;
  }
}

function trifftNichtZu(bedingung, zustand, antworten) {
  if (!bedingung) return false;
  return bewerte(bedingung.ausdruck, zustand, antworten) === false;
}

/* Variablenbelegung aus allen gegebenen Antworten. Jede Variable wird von
   genau einer Frage gesetzt, die Reihenfolge ist deshalb unerheblich. */
function zustandAus(antworten, idx) {
  var z = {};
  Object.keys(antworten).forEach(function (fid) {
    var f = idx.fragen.get(fid);
    if (!f) return;
    var antwort = antworten[fid];
    f.gesetzte_variablen.forEach(function (gv) {
      if (!gv.variable) return;
      var treffer = gv.zuordnung.filter(function (zu) {
        return antwort.indexOf(zu.antwort) >= 0;
      });
      if (treffer.length) z[gv.variable] = treffer[0].wert;
      else if (gv.wert_unbekannt) z[gv.variable] = UNBEKANNT;
      else if (gv.wert_sonst) z[gv.variable] = gv.wert_sonst;
    });
  });
  return z;
}

/* Mehrfachauswahl: Frage setzt mehr als eine Ja/Nein-Variable über
   Antwortkürzel (trifft in der Excel nur auf EIN-01 zu). */
function istMehrfachauswahl(frage) {
  return frage.gesetzte_variablen.filter(function (gv) {
    return gv.wert_sonst;
  }).length > 1;
}

function sichtbar(frage, zustand, antworten) {
  return !trifftNichtZu(frage.anzeigebedingung, zustand, antworten);
}

/* Wird eine Frage wegen ihrer Anzeigebedingung übersprungen, nennt die Excel
   das Ziel teils ausdrücklich ("… sonst direkt II-11"). Fehlt die Angabe,
   endet das Modul – innerhalb eines Moduls führt keine Kante an einer
   übersprungenen Einstiegsfrage vorbei. */
function ueberspringen(frage) {
  var ziel = frage.anzeigebedingung && frage.anzeigebedingung.sonst_ziel;
  if (!ziel || ziel === "ENDE-MODUL" || ziel === "ENDE") return { typ: "ende" };
  return { typ: "frage", id: ziel };
}

function waehleKante(frage, antwort, zustand, antworten) {
  var passend = frage.kanten.filter(function (k) {
    return antwort.indexOf(k.antwort) >= 0;
  });
  for (var i = 0; i < passend.length; i++) {
    if (!trifftNichtZu(passend[i].bedingung, zustand, antworten)) return passend[i];
  }
  return passend[0] || null;
}

function zielVon(kante) {
  if (!kante) return { typ: "ende" };
  if (kante.ziel_typ === "frage") return { typ: "frage", id: kante.ziel };
  if (kante.ziel_typ === "ergebnis" && kante.weiter_mit) {
    return { typ: "frage", id: kante.weiter_mit };
  }
  return { typ: "ende", art: kante.anschluss || kante.ziel_typ };
}

function istUnsicherheit(text) {
  return /Einzelfallprüfung|Unsicher|ungeklärt|umstritten/i.test(text || "");
}

function befundeAus(frageId, kante) {
  var aus = [];
  if (!kante) return aus;
  if (kante.ergebnistext) {
    aus.push({ frage_id: frageId, art: "Ergebnis", text: kante.ergebnistext });
  }
  if (kante.ergebnis_baustein) {
    aus.push({ frage_id: frageId, art: "Ergebnis-Baustein", text: kante.ergebnis_baustein });
  }
  if (kante.hinweis) {
    aus.push({ frage_id: frageId, art: "Hinweis", text: kante.hinweis });
  }
  aus.forEach(function (b) { b.unsicher = istUnsicherheit(b.text); });
  return aus;
}

/* Einstieg in ein Modul. Das Blatt Modulsteuerung nennt mehrere Einstiege in
   Vorrangfolge ("II-01 (bei ROLLE_PRODUKT), sonst II-09 …"). Gewählt wird der
   erste, dessen Bedingung erfüllt ist und dessen Frage nach ihrer
   Anzeigebedingung auch gestellt wird; Einstiege mit bloß nicht widerlegter
   Bedingung kommen danach. */
function modulEinstieg(modul, zustand, antworten, idx) {
  var moeglich = modul.einstiegsfragen.filter(function (e) {
    return !trifftNichtZu(e.bedingung, zustand, antworten);
  });
  var sicher = moeglich.filter(function (e) {
    return bewerte(e.bedingung && e.bedingung.ausdruck, zustand, antworten) === true;
  });
  var reihe = sicher.concat(moeglich.filter(function (e) {
    return sicher.indexOf(e) < 0;
  }));
  for (var i = 0; i < reihe.length; i++) {
    var f = idx.fragen.get(reihe[i].frage_id);
    if (f && sichtbar(f, zustand, antworten)) {
      return { typ: "frage", id: reihe[i].frage_id };
    }
  }
  return { typ: "ende" };
}

function modulAnwendbar(modul, zustand, antworten) {
  if (modul.startbedingung && modul.startbedingung.immer) return true;
  return !trifftNichtZu(modul.startbedingung, zustand, antworten);
}

/* Ein Modul durchlaufen. Reine Funktion: aus den Antworten ergibt sich der
   gesamte Verlauf neu, deshalb ist jede Korrektur einer Antwort automatisch
   konsistent. */
function laufeModul(modulId, antworten, idx) {
  var modul = idx.module.filter(function (m) { return m.modul === modulId; })[0];
  var lauf = {
    modul: modulId, schritte: [], befunde: [], aktuell: null,
    status: "offen", ende: null, abbruch: null
  };
  if (!modul) return lauf;

  var zustand = zustandAus(antworten, idx);
  var knoten = modulEinstieg(modul, zustand, antworten, idx);
  var gesehen = new Set();
  var wache = 0;

  while (knoten.typ === "frage") {
    if (++wache > 300) { lauf.abbruch = "Wächter: zu viele Schritte"; break; }
    if (gesehen.has(knoten.id)) { lauf.abbruch = "Zyklus bei " + knoten.id; break; }
    var f = idx.fragen.get(knoten.id);
    if (!f) { lauf.abbruch = "Unbekannte Frage " + knoten.id; break; }
    if (!sichtbar(f, zustand, antworten)) { knoten = ueberspringen(f); continue; }

    gesehen.add(knoten.id);
    var antwort = antworten[knoten.id];
    if (!antwort || !antwort.length) {
      lauf.aktuell = knoten.id;
      lauf.status = lauf.schritte.length ? "in_arbeit" : "offen";
      return lauf;
    }
    var kante = waehleKante(f, antwort, zustand, antworten);
    var befunde = befundeAus(knoten.id, kante);
    lauf.schritte.push({ frage_id: knoten.id, antwort: antwort, kante: kante,
                         befunde: befunde });
    befunde.forEach(function (b) { lauf.befunde.push(b); });
    knoten = zielVon(kante);
  }
  lauf.status = lauf.schritte.length || knoten.typ === "ende" ? "fertig" : "offen";
  lauf.ende = knoten;
  if (!lauf.schritte.length && knoten.typ === "ende") lauf.status = "leer";
  return lauf;
}

/* Alle Prüfstrecken in Blattreihenfolge, nur soweit anwendbar. */
function laufeAlles(antworten, idx) {
  var zustand = zustandAus(antworten, idx);
  return idx.module.map(function (m) {
    var anwendbar = modulAnwendbar(m, zustand, antworten);
    var lauf = anwendbar
      ? laufeModul(m.modul, antworten, idx)
      : { modul: m.modul, schritte: [], befunde: [], aktuell: null,
          status: "nicht_anwendbar", ende: null, abbruch: null };
    lauf.anwendbar = anwendbar;
    lauf.definition = m;
    return lauf;
  });
}

/* Anforderungsprofil über das Mapping.
   Rangfolge: schließt aus > verschiebt Geltungsbeginn > löst aus > schränkt ein. */
function berechneProfil(antworten, idx) {
  var zustand = zustandAus(antworten, idx);
  var treffer = new Map();

  laufeAlles(antworten, idx).forEach(function (lauf) {
    lauf.schritte.forEach(function (s) {
      (idx.mappingJeFrage.get(s.frage_id) || []).forEach(function (m) {
        var passt = m.antwort_alle || m.antworten.some(function (a) {
          return s.antwort.indexOf(a) >= 0;
        });
        if (!passt) return;
        if (trifftNichtZu(m.bedingung, zustand, antworten)) return;
        var e = treffer.get(m.req_id);
        if (!e) { e = { req_id: m.req_id, rang: 0, belege: [] }; treffer.set(m.req_id, e); }
        e.belege.push({
          mapping_id: m.mapping_id, frage_id: s.frage_id, wirkung: m.wirkung,
          kommentar: m.kommentar,
          klartext: (m.bedingung && m.bedingung.klartext) || []
        });
        e.rang = Math.max(e.rang, RANG[m.wirkung] || 0);
      });
    });
  });

  var profil = {
    treffer: treffer, ausgeloest: [], verschoben: [], ausgeschlossen: [],
    eingeschraenkt: []
  };
  Array.from(treffer.values()).sort(function (a, b) {
    return a.req_id.localeCompare(b.req_id, "de");
  }).forEach(function (e) {
    e.wirkung = RANG_NAME[e.rang] || null;
    if (e.rang === 4) profil.ausgeschlossen.push(e);
    else if (e.rang === 3) { profil.ausgeloest.push(e); profil.verschoben.push(e); }
    else if (e.rang === 2) profil.ausgeloest.push(e);
    else if (e.rang === 1) profil.eingeschraenkt.push(e);
  });
  profil.anzahl = profil.ausgeloest.length;
  return profil;
}

/* Antworten, die nach einer Korrektur nicht mehr erreichbar sind, entfernen.
   Wird bis zum Fixpunkt wiederholt, weil das Streichen einer Antwort weitere
   Fragen unerreichbar machen kann. */
function bereinige(antworten, idx) {
  var aktuell = Object.assign({}, antworten);
  var entfernt = [];
  for (var runde = 0; runde < 12; runde++) {
    var erreichbar = new Set();
    laufeAlles(aktuell, idx).forEach(function (lauf) {
      lauf.schritte.forEach(function (s) { erreichbar.add(s.frage_id); });
      if (lauf.aktuell) erreichbar.add(lauf.aktuell);
    });
    var weg = Object.keys(aktuell).filter(function (fid) { return !erreichbar.has(fid); });
    if (!weg.length) break;
    weg.forEach(function (fid) {
      entfernt.push({ frage_id: fid, modul: (idx.fragen.get(fid) || {}).modul });
      delete aktuell[fid];
    });
  }
  return { antworten: aktuell, entfernt: entfernt };
}

var ENGINE = {
  baueIndex: baueIndex, bewerte: bewerte, zustandAus: zustandAus,
  istMehrfachauswahl: istMehrfachauswahl, sichtbar: sichtbar,
  waehleKante: waehleKante, laufeModul: laufeModul, laufeAlles: laufeAlles,
  berechneProfil: berechneProfil, bereinige: bereinige,
  modulAnwendbar: modulAnwendbar, istUnsicherheit: istUnsicherheit
};

/*ENGINE-ENDE*/

if (typeof module !== "undefined" && module.exports) { module.exports = ENGINE; }
if (typeof document === "undefined") { return; }

/* ===================================================================
   Oberfläche
   =================================================================== */

var DATEN = JSON.parse(document.getElementById("daten").textContent);
var idx = baueIndex(DATEN);
var SCHLUESSEL = "data-act-check/stand/1";

var S = {
  antworten: {},
  ansicht: "intro",       /* intro | modul | uebersicht */
  modul: null,
  blick: null,            /* bereits beantwortete Frage erneut anzeigen */
  fokusOption: null,      /* nach einer Mehrfachauswahl dorthin zurückspringen */
  meldung: null,
  wiederhergestellt: null
};

/* ------------------------------------------------------------ Bausteine */
function el(tag, attrs, kinder) {
  var k = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (a) {
    var w = attrs[a];
    if (w === null || w === undefined || w === false) return;
    if (a === "text") k.textContent = w;
    else if (a === "class") k.className = w;
    else if (a.slice(0, 2) === "on") k.addEventListener(a.slice(2), w);
    else k.setAttribute(a, w === true ? "" : String(w));
  });
  (kinder || []).forEach(function (kind) {
    if (kind === null || kind === undefined || kind === false) return;
    k.appendChild(typeof kind === "string" ? document.createTextNode(kind) : kind);
  });
  return k;
}
function leere(knoten) { while (knoten.firstChild) knoten.removeChild(knoten.firstChild); }
function sage(text) { document.getElementById("live").textContent = text; }

/* ------------------------------------------------------------- Speicher */
function speichere() {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({
      v: 1, stand: new Date().toISOString(), antworten: S.antworten
    }));
  } catch (e) { /* Komfort, kein Muss */ }
}
function ladeStand() {
  try {
    var roh = localStorage.getItem(SCHLUESSEL);
    if (!roh) return null;
    var d = JSON.parse(roh);
    if (!d || d.v !== 1 || !d.antworten || typeof d.antworten !== "object") return null;
    var sauber = {};
    Object.keys(d.antworten).forEach(function (fid) {
      if (idx.fragen.has(fid) && Array.isArray(d.antworten[fid])) {
        sauber[fid] = d.antworten[fid];
      }
    });
    return { antworten: sauber, stand: d.stand };
  } catch (e) { return null; }
}
function verwirfStand() {
  try { localStorage.removeItem(SCHLUESSEL); } catch (e) {}
}

/* --------------------------------------------------------------- Module */
/* Kurztitel stehen nicht in der Excel; build_data.py legt sie als
   modul.kurztitel ab und übernimmt eine Spalte aus dem Blatt, sobald es
   eine gibt. Siehe NOTES.md. */
function modulName(m) { return m.kurztitel || m.modul; }

function laufZuModul(modulId, laeufe) {
  for (var i = 0; i < laeufe.length; i++) {
    if (laeufe[i].modul === modulId) return laeufe[i];
  }
  return null;
}

function statusWort(lauf) {
  if (!lauf.anwendbar) return "nicht anwendbar";
  if (lauf.status === "leer") return "kein Einstieg";
  if (lauf.status === "fertig") return "abgeschlossen";
  if (lauf.schritte.length) return "in Arbeit";
  return "offen";
}

/* ------------------------------------------------------------- Antworten */
function beantworte(frageId, schluessel) {
  var neu = Object.assign({}, S.antworten);
  neu[frageId] = schluessel;
  var bereinigt = bereinige(neu, idx);
  S.antworten = bereinigt.antworten;
  S.blick = null;

  if (bereinigt.entfernt.length) {
    var jeModul = {};
    bereinigt.entfernt.forEach(function (e) {
      var name = e.modul === "EIN" ? "Einstieg" : e.modul;
      jeModul[name] = (jeModul[name] || 0) + 1;
    });
    var teile = Object.keys(jeModul).map(function (n) { return n + " (" + jeModul[n] + ")"; });
    S.meldung = {
      art: "warn",
      kopf: bereinigt.entfernt.length === 1
        ? "Eine Folgeantwort wurde zurückgesetzt"
        : bereinigt.entfernt.length + " Folgeantworten wurden zurückgesetzt",
      text: "Durch die geänderte Antwort sind diese Fragen nicht mehr Teil Ihres "
            + "Pfades: " + bereinigt.entfernt.map(function (e) { return e.frage_id; }).join(", ")
            + ". Betroffen: " + teile.join(", ") + "."
    };
    sage(S.meldung.kopf + ". " + S.meldung.text);
  }
  speichere();
  zeichne();
}

function loeseAntwort(frageId) {
  var neu = Object.assign({}, S.antworten);
  delete neu[frageId];
  var bereinigt = bereinige(neu, idx);
  S.antworten = bereinigt.antworten;
  S.blick = null;
  speichere();
  zeichne();
}

function geheZu(ansicht, modulId) {
  S.ansicht = ansicht;
  S.modul = modulId || null;
  S.blick = null;
  S.meldung = null;
  zeichne();
}

/* ============================================================= Zeichnen */
/* Beim Wechsel auf einen anderen Bildschirm nach oben scrollen – sonst steht
   auf dem Telefon die neue Frage über dem Bildrand. Beim bloßen Ankreuzen
   einer Mehrfachauswahl bleibt die Position erhalten. */
var letzterBildschirm = null;

function zeichne() {
  var inhalt = document.getElementById("inhalt");
  leere(inhalt);

  var profil = berechneProfil(S.antworten, idx);
  var zaehler = document.getElementById("zaehler");
  leere(zaehler);
  if (profil.anzahl > 0) {
    zaehler.appendChild(el("span", {}, [
      el("b", { text: String(profil.anzahl) }),
      " Anforderungen",
      el("span", { class: "nur-breit", text: " identifiziert" })
    ]));
  } else {
    zaehler.appendChild(el("span", { text: "noch keine Anforderungen identifiziert" }));
  }

  if (S.ansicht === "intro") inhalt.appendChild(zeichneIntro());
  else if (S.ansicht === "modul") inhalt.appendChild(zeichneModul());
  else inhalt.appendChild(zeichneUebersicht());

  var bildschirm = [S.ansicht, S.modul || "", S.blick || "",
    S.ansicht === "modul" ? (laufeModul(S.modul, S.antworten, idx).aktuell || "ende") : ""
  ].join("/");
  if (letzterBildschirm !== null && letzterBildschirm !== bildschirm) {
    window.scrollTo(0, 0);
  }
  letzterBildschirm = bildschirm;

  var ziel = inhalt.querySelector("[data-fokus-option]")
          || inhalt.querySelector("[data-fokus]")
          || inhalt.querySelector("h1");
  if (ziel) {
    if (!ziel.hasAttribute("data-fokus-option")) ziel.setAttribute("tabindex", "-1");
    ziel.focus({ preventScroll: true });
  }
  S.fokusOption = null;
}

/* ----------------------------------------------------------------- Intro */
function zeichneIntro() {
  var w = el("div");
  w.appendChild(el("h1", { class: "titel", text: "Data-Act-Check" }));
  w.appendChild(el("p", { class: "lead", text:
    "Geführte Prüfung der Pflichten aus der Verordnung (EU) 2023/2854. "
    + "Sieben Fragen zum Einstieg, danach die Prüfstrecken, die auf Ihr "
    + "Unternehmen zutreffen. Inhalte ausschließlich aus dem Verordnungstext." }));

  if (S.wiederhergestellt) {
    var datum = "";
    try { datum = new Date(S.wiederhergestellt).toLocaleString("de-DE"); } catch (e) {}
    w.appendChild(el("div", { class: "meldung" }, [
      el("div", { class: "meldung__kopf", text: "Zwischenstand wiederhergestellt" }),
      el("div", { text: "Gespeichert in diesem Browser" + (datum ? " am " + datum : "")
                        + ". Die Datei sendet nichts an Dritte." }),
      el("button", { type: "button", text: "Verwerfen und neu beginnen",
        onclick: function () {
          verwirfStand(); S.antworten = {}; S.wiederhergestellt = null;
          sage("Zwischenstand verworfen."); zeichne();
        } })
    ]));
  }

  var einLauf = laufeModul("EIN", S.antworten, idx);
  var beginn = einLauf.schritte.length ? "Einstieg fortsetzen" : "Einstieg beginnen";
  w.appendChild(el("div", { class: "tatleiste" }, [
    el("button", { class: "knopf", type: "button", text: beginn,
      onclick: function () { geheZu("modul", "EIN"); } }),
    einLauf.status === "fertig"
      ? el("button", { class: "tat", type: "button", text: "Zur Modulübersicht →",
          onclick: function () { geheZu("uebersicht"); } })
      : null
  ]));
  return w;
}

/* ------------------------------------------------------------ Übersicht */
function zeichneUebersicht() {
  var w = el("div");
  var laeufe = laufeAlles(S.antworten, idx);
  var einLauf = laufZuModul("EIN", laeufe);

  w.appendChild(el("h1", { class: "titel", text: "Prüfstrecken" }));
  w.appendChild(el("p", { class: "lead", text:
    "Welche Strecken zu bearbeiten sind, ergibt sich aus Ihren Angaben im "
    + "Einstieg. Die Reihenfolge ist frei; Antworten lassen sich jederzeit ändern." }));

  if (S.meldung) w.appendChild(zeichneMeldung());

  /* Einstieg als Voraussetzung, abgesetzt von den Modulen */
  var einFragen = (idx.fragenJeModul.get("EIN") || []).length;
  w.appendChild(el("div", { class: "vorstufe" }, [
    el("span", { class: "vorstufe__titel", text: "Einstieg" }),
    el("span", { class: "modul__id", text: "EIN" }),
    el("span", { class: "vorstufe__rest" }, [
      el("span", { class: "modul__zahl",
        text: einLauf.schritte.length + " von " + einFragen + " Fragen" }),
      el("span", { class: "modul__status", text: statusWort(einLauf) }),
      el("button", { class: "tat", type: "button", text: "Antworten prüfen →",
        onclick: function () { geheZu("modul", "EIN"); } })
    ])
  ]));

  var liste = el("ul", { class: "module" });
  laeufe.filter(function (l) { return l.modul !== "EIN"; }).forEach(function (lauf) {
    liste.appendChild(zeichneModulzeile(lauf));
  });
  w.appendChild(liste);

  w.appendChild(el("div", { class: "tatleiste" }, [
    el("button", { class: "tat tat--zurueck", type: "button", text: "← Startseite",
      onclick: function () { geheZu("intro"); } }),
    el("button", { class: "tat tat--zurueck", type: "button",
      text: "Alle Antworten verwerfen",
      onclick: function () {
        if (!Object.keys(S.antworten).length) return;
        S.antworten = {}; verwirfStand(); S.wiederhergestellt = null;
        sage("Alle Antworten verworfen."); geheZu("intro");
      } })
  ]));
  return w;
}

function zeichneModulzeile(lauf) {
  var m = lauf.definition;
  var gesamt = (idx.fragenJeModul.get(m.modul) || []).length;
  var wort = statusWort(lauf);
  var markeKlasse = "modul__marke";
  if (!lauf.anwendbar || lauf.status === "leer") markeKlasse += " modul__marke--aus";
  else if (lauf.status === "fertig") markeKlasse += " modul__marke--fertig";
  else if (lauf.schritte.length) markeKlasse += " modul__marke--arbeit";

  var note = lauf.anwendbar
    ? m.bemerkung
    : "Startbedingung nicht erfüllt: " + m.startbedingung.roh;
  if (lauf.anwendbar && m.startbedingung && !m.startbedingung.immer
      && m.startbedingung.klartext && m.startbedingung.klartext.length) {
    note = "Startbedingung enthält eine Bedingung im Klartext ("
      + m.startbedingung.klartext.join("; ") + ") – die Strecke wird "
      + "vorsorglich angeboten. " + (m.bemerkung || "");
  }

  var tat = null;
  if (lauf.anwendbar && lauf.status !== "leer") {
    var text = lauf.status === "fertig" ? "Ergebnis ansehen →"
             : lauf.schritte.length ? "Fortsetzen →" : "Beginnen →";
    tat = el("button", { class: "tat", type: "button", text: text,
      onclick: function () { geheZu("modul", m.modul); } });
  }

  return el("li", { class: "modul" + (lauf.anwendbar ? "" : " modul--aus") }, [
    el("span", { class: markeKlasse, "aria-hidden": "true" }),
    el("span", { class: "modul__haupt" }, [
      el("span", { class: "modul__id", text: m.modul }),
      el("span", { class: "modul__name", text: modulName(m) }),
      note ? el("span", { class: "modul__note", text: note }) : null
    ]),
    el("span", { class: "modul__rechts" }, [
      el("span", { class: "modul__zahl",
        text: (lauf.anwendbar ? lauf.schritte.length + " von " + gesamt + " Fragen"
                              : gesamt + " Fragen") + " · " + wort }),
      tat
    ])
  ]);
}

function zeichneMeldung() {
  var m = S.meldung;
  return el("div", { class: "meldung" + (m.art === "warn" ? " meldung--warn" : "") }, [
    el("div", { class: "meldung__kopf", text: m.kopf }),
    el("div", { text: m.text }),
    el("button", { type: "button", text: "Verstanden",
      onclick: function () { S.meldung = null; zeichne(); } })
  ]);
}

/* ------------------------------------------------------- Geführter Modus */
function zeichneModul() {
  var modulId = S.modul;
  var m = idx.module.filter(function (x) { return x.modul === modulId; })[0];
  var lauf = laufeModul(modulId, S.antworten, idx);
  var w = el("div");

  var gesamt = (idx.fragenJeModul.get(modulId) || []).length;
  var zurueckZiel = modulId === "EIN" ? "intro" : "uebersicht";
  var zurueckText = modulId === "EIN" ? "← Startseite" : "← Prüfstrecken";

  w.appendChild(el("div", { class: "pfadkopf" }, [
    el("button", { class: "tat tat--zurueck", type: "button", text: zurueckText,
      onclick: function () { geheZu(zurueckZiel); } }),
    el("span", { class: "modul__id", text: modulId }),
    el("span", { class: "pfadkopf__modul",
      text: modulId === "EIN" ? "Einstieg" : modulName(m) }),
    el("span", { class: "pfadkopf__stand",
      text: lauf.schritte.length + " von " + gesamt + " Fragen beantwortet" })
  ]));

  var frageId = S.blick || lauf.aktuell;
  w.appendChild(zeichneSchrittleiste(lauf, frageId));
  if (S.meldung) w.appendChild(zeichneMeldung());
  if (lauf.abbruch) {
    w.appendChild(el("div", { class: "meldung meldung--warn" }, [
      el("div", { class: "meldung__kopf", text: "Ablauf abgebrochen" }),
      el("div", { text: lauf.abbruch + ". Bitte melden – die Daten sind an dieser "
                        + "Stelle nicht durchlaufbar." })
    ]));
  }

  if (frageId) w.appendChild(zeichneFrage(frageId, lauf));
  else w.appendChild(zeichneModulende(lauf, m));
  return w;
}

function zeichneSchrittleiste(lauf, frageId) {
  var leiste = el("div", { class: "schrittleiste", role: "list",
    "aria-label": "Beantwortete Fragen dieser Strecke" });
  lauf.schritte.forEach(function (s) {
    var hier = s.frage_id === frageId;
    leiste.appendChild(el("button", {
      class: "schritt" + (hier ? " schritt--hier" : ""),
      type: "button", role: "listitem",
      "aria-label": "Frage " + s.frage_id + (hier ? ", wird angezeigt" : ", beantwortet"),
      title: s.frage_id,
      onclick: function () { S.blick = s.frage_id; S.meldung = null; zeichne(); }
    }));
  });
  if (lauf.aktuell) {
    leiste.appendChild(el("button", {
      class: "schritt schritt--offen" + (lauf.aktuell === frageId ? " schritt--hier" : ""),
      type: "button", role: "listitem", disabled: !S.blick,
      "aria-label": "Frage " + lauf.aktuell + ", offen",
      title: lauf.aktuell,
      onclick: function () { S.blick = null; S.meldung = null; zeichne(); }
    }));
  }
  return leiste;
}

function zeichneFrage(frageId, lauf) {
  var f = idx.fragen.get(frageId);
  var w = el("div");
  var gegeben = S.antworten[frageId] || null;
  var mehrfach = istMehrfachauswahl(f);

  var vorherige = lauf.schritte.filter(function (s) { return s.frage_id !== frageId; });
  var befunde = [];
  lauf.schritte.some(function (s) {
    if (s.frage_id === frageId) return true;
    s.befunde.forEach(function (b) { befunde.push(b); });
    return false;
  });
  if (befunde.length) w.appendChild(zeichneZwischen(befunde));

  var block = el("fieldset", { class: "frageblock" });
  block.appendChild(el("legend", {}, [
    el("span", { class: "frageblock__kennung", text: f.id }),
    el("span", { class: "frageblock__text", text: f.frage, "data-fokus": true })
  ]));

  var optionen = el("div", { class: "optionen", role: mehrfach ? "group" : null });
  f.antwortoptionen.forEach(function (o) {
    var gewaehlt = !!gegeben && gegeben.indexOf(o.schluessel) >= 0;
    var beschriftung = o.form === "buchstabe" ? o.text : o.schluessel;
    var knopf = el("button", {
      class: "option", type: "button",
      "aria-pressed": gewaehlt ? "true" : "false",
      "data-fokus-option": S.fokusOption === o.schluessel ? "" : null,
      onclick: function () {
        if (mehrfach) {
          var menge = (S.antworten[frageId] || []).slice();
          var pos = menge.indexOf(o.schluessel);
          if (pos >= 0) menge.splice(pos, 1); else menge.push(o.schluessel);
          var neu = Object.assign({}, S.antworten);
          if (menge.length) neu[frageId] = menge; else delete neu[frageId];
          S.antworten = neu;
          // Zwischenstand der Auswahl: die Frage gilt erst mit "Weiter" als
          // beantwortet, sonst liefe der Baum schon nach dem ersten Häkchen
          // weiter. Aufgeräumt wird deshalb auch erst dort.
          S.blick = frageId;
          S.fokusOption = o.schluessel;   /* Fokus bleibt auf der Option */
          speichere(); zeichne();
        } else {
          beantworte(frageId, [o.schluessel]);
        }
      }
    }, [
      o.form === "buchstabe"
        ? el("span", { class: "option__kuerzel", text: o.schluessel })
        : null,
      el("span", { class: "option__text", text: beschriftung }),
      gewaehlt ? el("span", { class: "option__marke", text: "gewählt",
                              "aria-hidden": "true" }) : null
    ]);
    optionen.appendChild(knopf);
  });
  block.appendChild(optionen);
  w.appendChild(block);

  if (mehrfach) {
    w.appendChild(el("p", { class: "fundstelle", text:
      "Mehrfachauswahl – alle zutreffenden Tätigkeiten auswählen, dann weiter." }));
    w.appendChild(el("div", { class: "tatleiste" }, [
      el("button", { class: "knopf", type: "button", text: "Weiter",
        disabled: !gegeben || !gegeben.length,
        onclick: function () { beantworte(frageId, S.antworten[frageId] || []); } })
    ]));
  }

  if (f.erklaertext) {
    w.appendChild(el("div", { class: "erklaerung" }, [
      el("h3", { text: "Erläuterung" }),
      el("p", { text: f.erklaertext })
    ]));
  }
  if (f.rechtsgrundlage) {
    w.appendChild(el("p", { class: "fundstelle" }, [
      el("b", { text: "Rechtsgrundlage: " }), f.rechtsgrundlage
    ]));
  }
  var bedingung = f.anzeigebedingung && f.anzeigebedingung.roh;
  if (bedingung && bedingung !== "—") {
    w.appendChild(el("p", { class: "fundstelle" }, [
      el("b", { text: "Gestellt, weil: " }), bedingung
    ]));
  }

  var schrittPos = -1;
  lauf.schritte.forEach(function (s, i) { if (s.frage_id === frageId) schrittPos = i; });
  var leiste = el("div", { class: "tatleiste" });
  var links = el("div");
  if (schrittPos > 0) {
    links.appendChild(el("button", { class: "tat tat--zurueck", type: "button",
      text: "← Zurück",
      onclick: function () { S.blick = lauf.schritte[schrittPos - 1].frage_id; zeichne(); } }));
  } else if (schrittPos === -1 && lauf.schritte.length) {
    links.appendChild(el("button", { class: "tat tat--zurueck", type: "button",
      text: "← Zurück",
      onclick: function () { S.blick = lauf.schritte[lauf.schritte.length - 1].frage_id; zeichne(); } }));
  } else {
    links.appendChild(el("button", { class: "tat tat--zurueck", type: "button",
      text: S.modul === "EIN" ? "← Startseite" : "← Prüfstrecken",
      onclick: function () { geheZu(S.modul === "EIN" ? "intro" : "uebersicht"); } }));
  }
  leiste.appendChild(links);

  var rechts = el("div");
  if (schrittPos >= 0 && !mehrfach) {
    rechts.appendChild(el("span", { class: "modul__status",
      text: "beantwortet – Auswahl ändern oder " }));
    rechts.appendChild(el("button", { class: "tat", type: "button", text: "weiter →",
      onclick: function () {
        S.blick = schrittPos + 1 < lauf.schritte.length
          ? lauf.schritte[schrittPos + 1].frage_id : null;
        zeichne();
      } }));
  }
  leiste.appendChild(rechts);
  w.appendChild(leiste);
  return w;
}

function zeichneZwischen(befunde) {
  var d = el("details", { class: "zwischen" });
  d.appendChild(el("summary", { text:
    befunde.length === 1 ? "1 Zwischenergebnis in dieser Strecke"
                         : befunde.length + " Zwischenergebnisse in dieser Strecke" }));
  var liste = el("div", { class: "befundliste" });
  befunde.forEach(function (b) { liste.appendChild(zeichneBefund(b)); });
  d.appendChild(liste);
  return d;
}

function zeichneBefund(b) {
  return el("div", { class: "befund" + (b.unsicher ? " befund--warn" : "") }, [
    el("span", { class: "befund__quelle", text: b.frage_id + " · " + b.art
      + (b.unsicher ? " · Einzelfallprüfung empfohlen" : "") }),
    el("span", { text: b.text })
  ]);
}

function zeichneModulende(lauf, m) {
  var w = el("div");
  var istEin = lauf.modul === "EIN";
  w.appendChild(el("h1", { class: "titel", "data-fokus": true,
    text: istEin ? "Einstieg abgeschlossen" : "Strecke abgeschlossen" }));
  w.appendChild(el("p", { class: "lead", text: istEin
    ? "Ihre Angaben bestimmen, welche Prüfstrecken nun anstehen."
    : (m && m.bemerkung) || "" }));

  if (lauf.befunde.length) {
    w.appendChild(el("h2", { class: "abschnitt__kopf", text: "Festgestellt" }));
    var liste = el("div", { class: "befundliste" });
    lauf.befunde.forEach(function (b) { liste.appendChild(zeichneBefund(b)); });
    w.appendChild(liste);
  } else {
    w.appendChild(el("p", { class: "lead",
      text: "In dieser Strecke sind keine gesonderten Zwischenergebnisse angefallen. "
          + "Die ausgelösten Anforderungen stehen im Ergebnisprofil." }));
  }

  w.appendChild(el("div", { class: "tatleiste" }, [
    el("button", { class: "tat tat--zurueck", type: "button", text: "← Antworten prüfen",
      onclick: function () {
        S.blick = lauf.schritte.length
          ? lauf.schritte[lauf.schritte.length - 1].frage_id : null;
        zeichne();
      } }),
    el("button", { class: "knopf", type: "button",
      text: istEin ? "Weiter zu den Prüfstrecken" : "Zur Übersicht",
      onclick: function () { geheZu("uebersicht"); } })
  ]));
  return w;
}

/* ------------------------------------------------------------- Startlauf */
var stand = ladeStand();
if (stand && Object.keys(stand.antworten).length) {
  var bereinigt = bereinige(stand.antworten, idx);
  S.antworten = bereinigt.antworten;
  S.wiederhergestellt = stand.stand || true;
  var einLauf = laufeModul("EIN", S.antworten, idx);
  if (einLauf.status === "fertig") { S.ansicht = "uebersicht"; }
}

var quelle = document.getElementById("fuss-quelle");
if (quelle && DATEN.meta) {
  quelle.textContent = "Datenstand: " + DATEN.meta.quelle
    + " · erzeugt " + String(DATEN.meta.erzeugt_am).slice(0, 10);
}

zeichne();
})();
