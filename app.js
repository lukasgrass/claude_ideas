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

  idx.zeitleiste = DATEN.zeitleiste || [];
  idx.frist = new Map(idx.zeitleiste.map(function (z) { return [z.id, z]; }));
  idx.variablen = new Map((DATEN.variablen || []).map(function (v) {
    return [v.name, v];
  }));
  idx.begriffe = new Map((DATEN.begriffe || []).map(function (b) {
    return [b.begriff, b];
  }));
  // Kapitel in Blattreihenfolge, Typen in der fachlichen Reihenfolge
  idx.kapitelFolge = [];
  DATEN.anforderungen.forEach(function (a) {
    if (idx.kapitelFolge.indexOf(a.kapitel) < 0) idx.kapitelFolge.push(a.kapitel);
  });
  idx.typFolge = ["Handlungspflicht", "Informationspflicht",
                  "Unterlassungspflicht", "Recht", "Ausnahme"];
  DATEN.anforderungen.forEach(function (a) {
    if (idx.typFolge.indexOf(a.typ) < 0) idx.typFolge.push(a.typ);
  });
  // Rollenzweige: Einstiegsfrage -> Rolle, für die Zuordnung im Lauf
  idx.rolleJeEinstieg = new Map();
  idx.module.forEach(function (m) {
    m.einstiegsfragen.forEach(function (e) {
      if (e.rolle) idx.rolleJeEinstieg.set(e.frage_id, e.rolle);
    });
  });
  return idx;
}

function istUnsicher(anforderung) {
  return /^ja\b/i.test((anforderung && anforderung.auslegungsunsicherheit) || "");
}

/* Artikelnummern einer Fundstelle, für den Bezug der Offenen Punkte. */
function artikelVon(text) {
  var aus = [];
  var m = /Art\.\s*(\d+)/g;
  var t;
  while ((t = m.exec(text || "")) !== null) {
    if (aus.indexOf(t[1]) < 0) aus.push(t[1]);
  }
  return aus;
}

/* Dreiwertige Auswertung der Ausdrucksbäume aus data.json.
   null = unbekannt (Klartextbedingung oder ungesetzte Variable). */
/* 'offen' steuert, wie eine noch nicht gesetzte Variable zählt. Im Ablauf
   gilt "GROESSE = Mittel" ohne Antwort als nicht erfüllt, damit keine Frage
   vorschnell erscheint. In der Baumansicht dagegen ist derselbe Weg noch
   offen und darf nicht ausgegraut werden – dort gilt er als unbekannt. */
function bewerte(knoten, zustand, antworten, offen) {
  if (!knoten) return true;
  var a, b;
  switch (knoten.op) {
    case "und":
      a = bewerte(knoten.links, zustand, antworten, offen);
      b = bewerte(knoten.rechts, zustand, antworten, offen);
      if (a === false || b === false) return false;
      if (a === null || b === null) return null;
      return true;
    case "oder":
      a = bewerte(knoten.links, zustand, antworten, offen);
      b = bewerte(knoten.rechts, zustand, antworten, offen);
      if (a === true || b === true) return true;
      if (a === null || b === null) return null;
      return false;
    case "nicht":
      a = bewerte(knoten.operand, zustand, antworten, offen);
      return a === null ? null : !a;
    case "unklar":
      return null;
    case "gesetzt":
      return Object.prototype.hasOwnProperty.call(zustand, knoten.variable);
    case "=": case "≠": case "∈": case "∉":
      var wert = zustand[knoten.variable];
      if (wert === undefined) {
        if (offen) return null;
        return (knoten.op === "=" || knoten.op === "∈") ? false : null;
      }
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

function trifftNichtZu(bedingung, zustand, antworten, offen) {
  if (!bedingung) return false;
  return bewerte(bedingung.ausdruck, zustand, antworten, offen) === false;
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
  var rolle = null;

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
    // Ein Modul kann mehrere Rollenzweige nacheinander durchlaufen (M-II:
    // Hersteller, dann Nutzer, dann Dritter). Der Zweig wechselt, sobald der
    // Lauf eine Einstiegsfrage mit eigener Rolle erreicht.
    if (idx.rolleJeEinstieg.has(knoten.id)) rolle = idx.rolleJeEinstieg.get(knoten.id);
    var kante = waehleKante(f, antwort, zustand, antworten);
    var befunde = befundeAus(knoten.id, kante);
    lauf.schritte.push({ frage_id: knoten.id, antwort: antwort, kante: kante,
                         befunde: befunde, rolle: rolle });
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
          antwort: s.antwort, rolle: s.rolle || null,
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
    e.rollen = [];
    e.belege.forEach(function (b) {
      if (b.rolle && e.rollen.indexOf(b.rolle.variable) < 0) {
        e.rollen.push(b.rolle.variable);
      }
    });
    if (e.rang === 4) profil.ausgeschlossen.push(e);
    else if (e.rang === 3) { profil.ausgeloest.push(e); profil.verschoben.push(e); }
    else if (e.rang === 2) profil.ausgeloest.push(e);
    else if (e.rang === 1) profil.eingeschraenkt.push(e);
  });
  profil.anzahl = profil.ausgeloest.length;
  return profil;
}

/* Aus dem Profil das fertige Ergebnis bauen: gruppiert nach Kapitel und Typ,
   eingeordnet in die Zeitleiste, mit Begründung für Ausgeschlossenes und den
   offenen Punkten für die juristische Prüfung. */
function baueErgebnis(antworten, idx) {
  var profil = berechneProfil(antworten, idx);
  var laeufe = laufeAlles(antworten, idx);

  function anreichern(e) {
    var a = idx.anforderungen.get(e.req_id) || {};
    var r = idx.ergebnisse.get(e.req_id) || {};
    var fristen = (a.stichtage || []).map(function (id) {
      return idx.frist.get(id);
    }).filter(Boolean);
    return {
      req_id: e.req_id, rang: e.rang, wirkung: e.wirkung, belege: e.belege,
      rollen: e.rollen || [], anforderung: a, ergebnis: r,
      kapitel: a.kapitel || "—", typ: a.typ || "—",
      unsicher: istUnsicher(a),
      fristen: fristen,
      // "verschiebt Geltungsbeginn" gewinnt über "löst aus": dann gilt die
      // Anforderung, beginnt aber später. Die Begründung steht im Mapping.
      verschoben: e.rang === 3,
      verschiebung: e.belege.filter(function (b) {
        return b.wirkung === "verschiebt Geltungsbeginn";
      }),
      einschraenkungen: e.belege.filter(function (b) {
        return b.wirkung === "schränkt ein";
      })
    };
  }

  var ausgeloest = profil.ausgeloest.map(anreichern);
  var ausgeschlossen = profil.ausgeschlossen.map(anreichern);
  var eingeschraenkt = profil.eingeschraenkt.map(anreichern);

  // Gruppierung Kapitel -> Typ
  var nachKapitel = [];
  idx.kapitelFolge.forEach(function (kap) {
    var drin = ausgeloest.filter(function (e) { return e.kapitel === kap; });
    if (!drin.length) return;
    var typen = [];
    idx.typFolge.forEach(function (typ) {
      var t = drin.filter(function (e) { return e.typ === typ; });
      if (t.length) typen.push({ typ: typ, eintraege: t });
    });
    nachKapitel.push({ kapitel: kap, anzahl: drin.length, typen: typen });
  });

  // Zeitleiste: nur Stichtage, die im Ergebnis vorkommen
  var zeitleiste = idx.zeitleiste.map(function (z) {
    return {
      frist: z,
      eintraege: ausgeloest.filter(function (e) {
        return e.fristen.some(function (f) { return f.id === z.id; });
      })
    };
  }).filter(function (z) { return z.eintraege.length > 0; });

  // Offene Punkte: berührte Anforderungen mit Auslegungsunsicherheit …
  var ausUnsicherheit = ausgeloest.concat(ausgeschlossen)
    .filter(function (e) { return e.unsicher; });
  // … und die Zeilen des Blattes "Offene Punkte", deren Fundstelle einen
  // Artikel nennt, der im Ergebnis vorkommt.
  var beruehrteArtikel = {};
  ausgeloest.forEach(function (e) {
    artikelVon(e.anforderung.fundstelle).forEach(function (n) {
      beruehrteArtikel[n] = true;
    });
  });
  var ausBlatt = (idx.daten.offene_punkte || []).filter(function (p) {
    var art = artikelVon(p.fundstelle);
    return art.length > 0 && art.some(function (n) { return beruehrteArtikel[n]; });
  });

  // Anforderungen, die über mehrere Rollenzweige ausgelöst wurden
  var mehrfachrollen = ausgeloest.filter(function (e) { return e.rollen.length > 1; });

  var beantwortet = 0;
  laeufe.forEach(function (l) { beantwortet += l.schritte.length; });
  var offeneStrecken = laeufe.filter(function (l) {
    return l.anwendbar && l.aktuell;
  }).map(function (l) { return l.modul; });

  return {
    profil: profil, laeufe: laeufe,
    ausgeloest: ausgeloest, ausgeschlossen: ausgeschlossen,
    eingeschraenkt: eingeschraenkt,
    nachKapitel: nachKapitel, zeitleiste: zeitleiste,
    offenePunkte: { ausUnsicherheit: ausUnsicherheit, ausBlatt: ausBlatt },
    mehrfachrollen: mehrfachrollen,
    beantwortet: beantwortet, offeneStrecken: offeneStrecken,
    anzahl: ausgeloest.length
  };
}

/* ============================================================== Baumansicht */
/* Deterministisches Schichtenlayout: Die Tiefe eines Knotens ist der längste
   Weg vom Moduleinstieg (der Graph ist zyklenfrei, das prüft pruefe.js), die
   Reihenfolge innerhalb einer Schicht ergibt sich aus einer festen
   Tiefensuche. Keine Physik, keine Zufallswerte – dasselbe Modul sieht immer
   gleich aus. */

var BAUM = {
  spalte: 240,      /* Abstand der Schichten */
  zeile: 26,        /* Grundhöhe einer Zeile */
  knotenBreite: 190,
  luecke: 18,
  rand: 28
};

function kuerze(text, zeichen) {
  if (!text) return "";
  if (text.length <= zeichen) return text;
  return text.slice(0, zeichen - 1).replace(/\s+\S*$/, "") + "…";
}

function umbruch(text, proZeile, maxZeilen) {
  var worte = String(text || "").split(/\s+/);
  var zeilen = [], aktuell = "";
  worte.forEach(function (wort) {
    if (!aktuell.length) { aktuell = wort; return; }
    if ((aktuell + " " + wort).length <= proZeile) aktuell += " " + wort;
    else { zeilen.push(aktuell); aktuell = wort; }
  });
  if (aktuell.length) zeilen.push(aktuell);
  if (zeilen.length > maxZeilen) {
    zeilen = zeilen.slice(0, maxZeilen);
    zeilen[maxZeilen - 1] = kuerze(zeilen[maxZeilen - 1] + " …", proZeile);
  }
  return zeilen;
}

function baueBaum(modulId, antworten, idx) {
  var modul = idx.module.filter(function (m) { return m.modul === modulId; })[0];
  if (!modul) return null;
  var zustand = zustandAus(antworten, idx);
  var lauf = laufeModul(modulId, antworten, idx);

  var knoten = new Map();
  var kanten = [];

  function frageKnoten(id) {
    if (knoten.has(id)) return knoten.get(id);
    var f = idx.fragen.get(id);
    var k = { id: id, art: "frage", frage: f, tiefe: 0, folge: knoten.size,
              titel: f ? f.frage : id, kurz: f ? kuerze(f.frage, 42) : id };
    knoten.set(id, k);
    return k;
  }

  /* Ergebnis- und Endknoten je Frage und Ergebnistext zusammenfassen. */
  function endKnoten(vonId, kante) {
    var text = kante.ergebnistext || (kante.ziel_typ === "ende_modul"
      || kante.anschluss === "ende_modul" ? "Ende der Strecke" : "Ende");
    var id = "@" + vonId + "#" + text.slice(0, 40);
    if (knoten.has(id)) return knoten.get(id);
    var k = { id: id, art: kante.ergebnistext ? "ergebnis" : "ende",
              tiefe: 0, folge: knoten.size, titel: text,
              kurz: kuerze(text, 42), unsicher: istUnsicherheit(text) };
    knoten.set(id, k);
    return k;
  }

  /* Alle Fragen des Moduls samt Kanten aufnehmen – auch die derzeit nicht
     erreichbaren, damit der Baum vollständig bleibt. */
  (idx.fragenJeModul.get(modulId) || []).forEach(function (f) {
    var von = frageKnoten(f.id);
    f.kanten.forEach(function (kante, nr) {
      var ziel;
      if (kante.ziel_typ === "frage") ziel = frageKnoten(kante.ziel);
      else if (kante.weiter_mit) ziel = frageKnoten(kante.weiter_mit);
      else ziel = endKnoten(f.id, kante);
      kanten.push({
        von: von.id, nach: ziel.id, antwort: kante.antwort,
        bedingung: kante.bedingung, kante: kante, nr: nr,
        zwischenergebnis: kante.ziel_typ === "ergebnis" && !!kante.weiter_mit
      });
      if (kante.ziel_typ === "ergebnis" && kante.weiter_mit) {
        // Ergebnis unterwegs: eigener Knoten neben dem weiterführenden Weg
        var zw = endKnoten(f.id, kante);
        kanten.push({ von: von.id, nach: zw.id, antwort: kante.antwort,
                      bedingung: kante.bedingung, kante: kante, nr: nr,
                      nurErgebnis: true });
      }
    });
  });

  /* Tiefe: längster Weg vom Einstieg. Topologische Reihenfolge über
     wiederholte Entspannung (der Graph ist klein und zyklenfrei). */
  var einstiege = modul.einstiegsfragen.map(function (e) { return e.frage_id; })
    .filter(function (id) { return knoten.has(id); });
  if (!einstiege.length && knoten.size) einstiege = [knoten.keys().next().value];
  knoten.forEach(function (k) { k.tiefe = einstiege.indexOf(k.id) >= 0 ? 0 : -1; });
  for (var runde = 0; runde < 60; runde++) {
    var geaendert = false;
    kanten.forEach(function (e) {
      var a = knoten.get(e.von), b = knoten.get(e.nach);
      if (!a || !b || a.tiefe < 0) return;
      if (b.tiefe < a.tiefe + 1) { b.tiefe = a.tiefe + 1; geaendert = true; }
    });
    if (!geaendert) break;
  }
  // Nicht erreichte Knoten (kein Weg vom Einstieg) hinten anhängen
  knoten.forEach(function (k) { if (k.tiefe < 0) k.tiefe = 0; });

  /* Reihenfolge innerhalb der Schicht: feste Tiefensuche von den Einstiegen. */
  var reihenfolge = new Map();
  var zaehler = 0;
  function besuche(id, tiefe) {
    if (reihenfolge.has(id) || tiefe > 60) return;
    reihenfolge.set(id, zaehler++);
    kanten.filter(function (e) { return e.von === id; })
      .sort(function (a, b) { return a.nr - b.nr; })
      .forEach(function (e) { besuche(e.nach, tiefe + 1); });
  }
  einstiege.forEach(function (id) { besuche(id, 0); });
  Array.from(knoten.keys()).forEach(function (id) { besuche(id, 0); });

  /* Zustand der Kanten und Knoten aus dem Lauf */
  var gegangeneKante = new Map();
  lauf.schritte.forEach(function (s) {
    if (s.kante) gegangeneKante.set(s.frage_id + "#" + s.kante.antwort, true);
  });
  var beantwortet = {};
  lauf.schritte.forEach(function (s) { beantwortet[s.frage_id] = s.antwort; });

  kanten.forEach(function (e) {
    var antwort = beantwortet[e.von];
    if (antwort) {
      e.zustand = antwort.indexOf(e.antwort) >= 0
        && gegangeneKante.has(e.von + "#" + e.antwort) ? "gegangen" : "aus";
      if (antwort.indexOf(e.antwort) >= 0 && e.nurErgebnis) e.zustand = "gegangen";
    } else if (trifftNichtZu(e.bedingung, zustand, antworten, true)) {
      e.zustand = "aus";
    } else {
      e.zustand = "moeglich";
    }
  });

  /* Erreichbarkeit vorwärts: was hinter einer ausgeschlossenen Kante liegt,
     ist nur dann noch möglich, wenn ein anderer Weg dorthin führt. */
  var erreichbar = new Set(einstiege);
  for (var i = 0; i < 60; i++) {
    var neu = false;
    kanten.forEach(function (e) {
      if (e.zustand !== "aus" && erreichbar.has(e.von) && !erreichbar.has(e.nach)) {
        erreichbar.add(e.nach); neu = true;
      }
    });
    if (!neu) break;
  }
  var besucht = new Set(lauf.schritte.map(function (s) { return s.frage_id; }));
  knoten.forEach(function (k) {
    if (besucht.has(k.id)) k.zustand = "gegangen";
    else if (k.art !== "frage" && kanten.some(function (e) {
      return e.nach === k.id && e.zustand === "gegangen";
    })) k.zustand = "gegangen";
    else if (erreichbar.has(k.id)) k.zustand = "moeglich";
    else k.zustand = "aus";
    if (k.id === lauf.aktuell) k.zustand = "aktuell";
  });

  /* Koordinaten */
  var schichten = new Map();
  Array.from(knoten.values())
    .sort(function (a, b) {
      return a.tiefe - b.tiefe
        || (reihenfolge.get(a.id) || 0) - (reihenfolge.get(b.id) || 0);
    })
    .forEach(function (k) {
      if (!schichten.has(k.tiefe)) schichten.set(k.tiefe, []);
      schichten.get(k.tiefe).push(k);
    });

  var maxHoehe = 0;
  schichten.forEach(function (liste, tiefe) {
    var y = BAUM.rand;
    liste.forEach(function (k) {
      k.zeilen = umbruch(k.titel, 26, k.art === "frage" ? 3 : 4);
      // Knoten mit eigener Kennzeile (Frage-ID bzw. "Einzelfallprüfung")
      // brauchen oben eine Zeile mehr Platz.
      k.hatKennung = k.art === "frage" || !!k.unsicher;
      k.hoehe = 18 + k.zeilen.length * 15 + (k.hatKennung ? 14 : 0);
      k.breite = BAUM.knotenBreite;
      k.x = BAUM.rand + tiefe * BAUM.spalte;
      k.y = y;
      y += k.hoehe + BAUM.luecke;
    });
    maxHoehe = Math.max(maxHoehe, y);
  });

  var maxTiefe = 0;
  knoten.forEach(function (k) { maxTiefe = Math.max(maxTiefe, k.tiefe); });
  return {
    modul: modulId, lauf: lauf,
    knoten: Array.from(knoten.values()),
    kanten: kanten,
    breite: BAUM.rand * 2 + maxTiefe * BAUM.spalte + BAUM.knotenBreite,
    hoehe: maxHoehe + BAUM.rand
  };
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
  berechneProfil: berechneProfil, baueErgebnis: baueErgebnis,
  bereinige: bereinige, istUnsicher: istUnsicher, artikelVon: artikelVon,
  baueBaum: baueBaum,
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

var RECHTSHINWEIS = "Dieses Werkzeug gibt eine strukturierte Orientierung "
  + "anhand des Verordnungstextes. Es ist keine Rechtsberatung und ersetzt "
  + "keine Prüfung des Einzelfalls.";

var S = {
  antworten: {},
  ansicht: "intro",       /* intro | modul | uebersicht | ergebnis */
  modul: null,
  filter: { kapitel: [], typ: [], frist: [], nurUnsicher: false },
  baum: false,            /* Baumansicht statt geführtem Modus */
  baumErzwingen: false,   /* Diagramm auch auf schmalen Bildschirmen */
  offen: {},              /* aufgeklappte Zeilen im Ergebnisprofil */
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

/* ------------------------------------------------------------- Erklärungen */
/* Ein einziges Panel, das an den jeweiligen Auslöser gesetzt wird. Auslöser
   sind Begriffe im Fließtext und Variablen-Marken. Bedienbar mit Maus, Tastatur
   (Fokus zeigt, Escape schließt) und Touch (Tippen schaltet um). */
var panel = null, panelAuslöser = null, panelTimer = null;

function panelElement() {
  if (panel) return panel;
  panel = el("div", { class: "erkl", id: "erkl-panel", role: "tooltip",
                      hidden: true });
  panel.addEventListener("mouseenter", function () { clearTimeout(panelTimer); });
  panel.addEventListener("mouseleave", function () { schliesseErkl(200); });
  document.body.appendChild(panel);
  return panel;
}

function schliesseErkl(verzoegerung) {
  clearTimeout(panelTimer);
  panelTimer = setTimeout(function () {
    if (!panel) return;
    panel.hidden = true;
    if (panelAuslöser) panelAuslöser.removeAttribute("aria-describedby");
    panelAuslöser = null;
  }, verzoegerung || 0);
}

function zeigeErkl(auslöser, inhalt) {
  clearTimeout(panelTimer);
  var p = panelElement();
  leere(p);
  inhalt.forEach(function (k) { p.appendChild(k); });
  p.hidden = false;
  panelAuslöser = auslöser;
  auslöser.setAttribute("aria-describedby", "erkl-panel");

  /* Im Viewport halten: erst unter dem Auslöser, sonst darüber; waagerecht
     an den Rändern beschneiden. */
  p.style.left = "0px";
  p.style.top = "0px";
  var a = auslöser.getBoundingClientRect();
  var b = p.getBoundingClientRect();
  var rand = 12;
  var links = Math.min(Math.max(rand, a.left), window.innerWidth - b.width - rand);
  var oben = a.bottom + 8;
  if (oben + b.height > window.innerHeight - rand && a.top - b.height - 8 > rand) {
    oben = a.top - b.height - 8;
  }
  oben = Math.max(rand, Math.min(oben, window.innerHeight - b.height - rand));
  p.style.left = (links + window.scrollX) + "px";
  p.style.top = (oben + window.scrollY) + "px";
}

function haengeErklAn(knoten, inhaltBauen) {
  knoten.setAttribute("tabindex", "0");
  var oeffnen = function () { zeigeErkl(knoten, inhaltBauen()); };
  knoten.addEventListener("mouseenter", oeffnen);
  knoten.addEventListener("focus", oeffnen);
  knoten.addEventListener("mouseleave", function () { schliesseErkl(200); });
  knoten.addEventListener("blur", function () { schliesseErkl(0); });
  knoten.addEventListener("click", function (ereignis) {
    ereignis.preventDefault();
    if (panelAuslöser === knoten && panel && !panel.hidden) schliesseErkl(0);
    else oeffnen();
  });
  knoten.addEventListener("keydown", function (ereignis) {
    if (ereignis.key === "Escape") { schliesseErkl(0); knoten.blur(); }
  });
  return knoten;
}

function erklBegriff(name) {
  var b = idx.begriffe.get(name);
  if (!b) return [el("div", { text: name })];
  var aus = [
    el("div", { class: "erkl__kopf", text: b.begriff }),
    el("div", { class: "erkl__quelle", text: b.fundstelle }),
    el("p", { text: b.definition })
  ];
  if (b.abgrenzung && b.abgrenzung !== "—") {
    aus.push(el("div", { class: "erkl__zeile" }, [
      el("b", { text: "Abgrenzung: " }), b.abgrenzung
    ]));
  }
  return aus;
}

function erklVariable(name) {
  var v = idx.variablen.get(name);
  var zustand = zustandAus(S.antworten, idx);
  var wert = zustand[name];
  var aus = [el("div", { class: "erkl__kopf", text: (v && v.klartext) || name })];
  if (v && v.klartext) aus.push(el("div", { class: "erkl__quelle", text: name }));
  if (!v) { aus.push(el("p", { text: "Keine Angabe im Blatt Variablen." })); return aus; }

  if (v.frage_text) {
    aus.push(el("div", { class: "erkl__zeile" }, [
      el("b", { text: "Gesetzt durch " + (v.gesetzt_durch || []).join(", ") + ": " }),
      v.frage_text
    ]));
  }
  var wertText;
  if (wert === undefined) wertText = "noch nicht gesetzt";
  else if (wert === UNBEKANNT) wertText = "gesetzt, Wert laut Excel nicht bestimmbar";
  else wertText = wert + ((v.wert_texte && v.wert_texte[wert])
      ? " – " + v.wert_texte[wert] : "");
  aus.push(el("div", { class: "erkl__zeile" }, [
    el("b", { text: "Aktueller Wert: " }), wertText
  ]));
  if (v.werte && v.werte.length) {
    aus.push(el("div", { class: "erkl__zeile" }, [
      el("b", { text: "Mögliche Werte: " }), v.werte.join(" / ")
    ]));
  }
  return aus;
}

/* Fließtext mit den beim Build gesetzten Begriffsmarken aufbauen. */
function textMitBegriffen(text, spans) {
  var teil = document.createDocumentFragment();
  if (!text) return teil;
  if (!spans || !spans.length) {
    teil.appendChild(document.createTextNode(text));
    return teil;
  }
  var pos = 0;
  spans.forEach(function (s) {
    if (s.start > pos) {
      teil.appendChild(document.createTextNode(text.slice(pos, s.start)));
    }
    var wort = text.slice(s.start, s.start + s.laenge);
    var marke = el("span", { class: "begriff", text: wort,
                             role: "button", "aria-label": wort + ", Begriff erklären" });
    haengeErklAn(marke, function () { return erklBegriff(s.begriff); });
    teil.appendChild(marke);
    pos = s.start + s.laenge;
  });
  if (pos < text.length) teil.appendChild(document.createTextNode(text.slice(pos)));
  return teil;
}

/* Bedingungstext mit Variablenmarken: "GROESSE ∈ {Kleinst, Klein}" wird
   anklickbar, der Hover erklärt Herkunft und aktuellen Wert. */
var VARIABLE_RE = /\b[A-ZÄÖÜ][A-ZÄÖÜ0-9_]{2,}\b/g;

function textMitVariablen(text) {
  var teil = document.createDocumentFragment();
  if (!text) return teil;
  var pos = 0, treffer;
  VARIABLE_RE.lastIndex = 0;
  while ((treffer = VARIABLE_RE.exec(text)) !== null) {
    if (!idx.variablen.has(treffer[0])) continue;
    if (treffer.index > pos) {
      teil.appendChild(document.createTextNode(text.slice(pos, treffer.index)));
    }
    var v = idx.variablen.get(treffer[0]);
    var marke = el("span", { class: "varmarke", text: (v && v.klartext) || treffer[0],
                             role: "button",
                             "aria-label": treffer[0] + ", Variable erklären" });
    (function (name) {
      haengeErklAn(marke, function () { return erklVariable(name); });
    })(treffer[0]);
    teil.appendChild(marke);
    pos = treffer.index + treffer[0].length;
  }
  if (pos < text.length) teil.appendChild(document.createTextNode(text.slice(pos)));
  return teil;
}

document.addEventListener("keydown", function (ereignis) {
  if (ereignis.key === "Escape") schliesseErkl(0);
});
window.addEventListener("scroll", function () { schliesseErkl(0); }, true);

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
    zaehler.appendChild(el("button", {
      class: "zaehler__knopf", type: "button",
      "aria-current": S.ansicht === "ergebnis" ? "page" : null,
      onclick: function () { geheZu("ergebnis"); }
    }, [
      el("b", { text: String(profil.anzahl) }),
      " Anforderungen",
      el("span", { class: "nur-breit", text: " identifiziert" })
    ]));
  } else {
    zaehler.appendChild(el("span", { text: "noch keine Anforderungen identifiziert" }));
  }

  if (S.ansicht === "intro") inhalt.appendChild(zeichneIntro());
  else if (S.ansicht === "modul") inhalt.appendChild(zeichneModul());
  else if (S.ansicht === "ergebnis") inhalt.appendChild(zeichneErgebnis());
  else inhalt.appendChild(zeichneUebersicht());
  document.body.setAttribute("data-ansicht", S.ansicht);

  var bildschirm = [S.ansicht === "ergebnis" ? "ergebnis" : S.ansicht,
    S.modul || "", S.baum ? "baum" : "gefuehrt", S.blick || "",
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
  w.appendChild(el("p", { class: "rechtshinweis", text: RECHTSHINWEIS }));

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

  var offeneStrecken = laeufe.filter(function (l) {
    return l.anwendbar && l.aktuell;
  });
  var profil = berechneProfil(S.antworten, idx);
  if (profil.anzahl) {
    w.appendChild(el("div", { class: "abschluss" }, [
      el("div", { class: "abschluss__text" }, [
        el("div", { class: "abschluss__kopf", text: offeneStrecken.length
          ? "Zwischenstand: " + profil.anzahl + " Anforderungen"
          : "Alle Strecken bearbeitet – " + profil.anzahl + " Anforderungen" }),
        el("div", { class: "lead", text: offeneStrecken.length
          ? "Noch offen: " + offeneStrecken.map(function (l) { return l.modul; }).join(", ")
            + ". Das Profil lässt sich schon ansehen, ist aber vorläufig."
          : "Das Ergebnisprofil führt jede Anforderung mit Fundstelle, "
            + "Geltungsbeginn, Herkunft und den offenen Punkten auf." })
      ]),
      el("button", { class: "knopf", type: "button", text: "Ergebnisprofil ansehen →",
        onclick: function () { geheZu("ergebnis"); } })
    ]));
  }

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
      note ? el("span", { class: "modul__note" }, [textMitVariablen(note)]) : null
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

  /* Umschalter zwischen geführtem Modus und Diagramm derselben Strecke */
  w.appendChild(el("div", { class: "modusleiste", role: "group",
                            "aria-label": "Ansicht der Prüfstrecke" }, [
    chip("Geführt", !S.baum, function () { S.baum = false; zeichne(); }),
    chip("Baumansicht", !!S.baum, function () { S.baum = true; zeichne(); })
  ]));
  if (S.baum) {
    if (S.meldung) w.appendChild(zeichneMeldung());
    w.appendChild(zeichneBaumansicht(modulId));
    w.appendChild(el("div", { class: "tatleiste" }, [
      el("button", { class: "tat tat--zurueck", type: "button", text: zurueckText,
        onclick: function () { geheZu(zurueckZiel); } }),
      el("button", { class: "tat", type: "button", text: "Zum geführten Modus →",
        onclick: function () { S.baum = false; zeichne(); } })
    ]));
    return w;
  }

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
    el("span", { class: "frageblock__text", "data-fokus": true }, [
      textMitBegriffen(f.frage, f.frage_begriffe)
    ])
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
      el("p", {}, [textMitBegriffen(f.erklaertext, f.erklaertext_begriffe)])
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
      el("b", { text: "Gestellt, weil: " }), textMitVariablen(bedingung)
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
    el("span", {}, [textMitBegriffen(b.text, b.begriffe)])
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

/* ============================================================= Baumansicht */

var SVGNS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs, kinder) {
  var k = document.createElementNS(SVGNS, tag);
  if (attrs) Object.keys(attrs).forEach(function (a) {
    var w = attrs[a];
    if (w === null || w === undefined || w === false) return;
    if (a === "text") k.textContent = w;
    else if (a.slice(0, 2) === "on") k.addEventListener(a.slice(2), w);
    else k.setAttribute(a, String(w));
  });
  (kinder || []).forEach(function (kind) { if (kind) k.appendChild(kind); });
  return k;
}

/* Sichtfenster je Modul, damit ein Wechsel hin und zurück die Zoomstufe
   behält. Reines Anzeigezustand, nichts davon geht in die Antworten ein. */
var sichtfenster = {};

function zeichneBaumansicht(modulId) {
  var baum = baueBaum(modulId, S.antworten, idx);
  var w = el("div", { class: "baumbereich" });
  if (!baum) return w;

  var schmal = false;
  try { schmal = window.matchMedia("(max-width: 40rem)").matches; } catch (e) {}
  if (schmal && !S.baumErzwingen) {
    w.appendChild(zeichnePfadliste(baum));
    w.appendChild(el("div", { class: "tatleiste" }, [
      el("button", { class: "tat", type: "button",
        text: "Diagramm trotzdem anzeigen",
        onclick: function () { S.baumErzwingen = true; zeichne(); } })
    ]));
    return w;
  }

  var svg = svgEl("svg", {
    class: "baum baum--voll", tabindex: "0", role: "group",
    "aria-label": "Diagramm der Prüfstrecke " + modulId + " mit "
      + baum.knoten.length + " Knoten. Mit den Pfeiltasten verschieben, "
      + "mit Plus und Minus zoomen, mit 0 einpassen."
  });
  var flaeche = svgEl("g", { class: "baum__flaeche" });
  svg.appendChild(flaeche);

  /* Kanten zuerst, damit Knoten darüber liegen */
  var kantenG = svgEl("g", { class: "baum__kanten" });
  var knotenNach = {};
  baum.knoten.forEach(function (k) { knotenNach[k.id] = k; });
  baum.kanten.forEach(function (e) {
    var a = knotenNach[e.von], b = knotenNach[e.nach];
    if (!a || !b) return;
    var x1 = a.x + a.breite, y1 = a.y + a.hoehe / 2;
    var x2 = b.x, y2 = b.y + b.hoehe / 2;
    var dx = Math.max(30, (x2 - x1) / 2);
    kantenG.appendChild(svgEl("path", {
      class: "kante kante--" + e.zustand,
      d: "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + ", "
         + (x2 - dx) + " " + y2 + ", " + x2 + " " + y2
    }));
    var beschriftung = e.antwort.length > 12 ? e.antwort.slice(0, 11) + "…" : e.antwort;
    kantenG.appendChild(svgEl("text", {
      class: "kantenlabel kantenlabel--" + e.zustand,
      x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 4, "text-anchor": "middle",
      text: beschriftung
    }));
  });
  flaeche.appendChild(kantenG);

  var knotenG = svgEl("g", { class: "baum__knoten" });
  baum.knoten.forEach(function (k) {
    var g = svgEl("g", {
      class: "kn kn--" + k.art + " kn--" + k.zustand,
      transform: "translate(" + k.x + "," + k.y + ")",
      tabindex: k.art === "frage" ? "0" : null,
      role: k.art === "frage" ? "button" : null,
      "aria-label": k.art === "frage"
        ? k.id + ": " + k.titel + " – zur Frage springen" : null
    });
    g.appendChild(svgEl("rect", { class: "kn__rahmen", x: 0, y: 0,
      width: k.breite, height: k.hoehe, rx: 2 }));
    if (k.art === "frage") {
      g.appendChild(svgEl("text", { class: "kn__id", x: 10, y: 16, text: k.id }));
    } else if (k.unsicher) {
      g.appendChild(svgEl("text", { class: "kn__id", x: 10, y: 16,
        text: "Einzelfallprüfung" }));
    }
    var oben = k.hatKennung ? 32 : 16;
    var voll = svgEl("text", { class: "kn__voll", x: 10, y: oben });
    k.zeilen.forEach(function (zeile, i) {
      voll.appendChild(svgEl("tspan", { x: 10, dy: i ? 15 : 0, text: zeile }));
    });
    g.appendChild(voll);
    g.appendChild(svgEl("text", { class: "kn__kurz", x: 10, y: oben,
      text: kuerze(k.titel, 22) }));
    if (k.art === "frage") {
      g.addEventListener("click", function () { springeZuFrage(k.id); });
      g.addEventListener("keydown", function (ereignis) {
        if (ereignis.key === "Enter" || ereignis.key === " ") {
          ereignis.preventDefault(); springeZuFrage(k.id);
        }
      });
    }
    knotenG.appendChild(g);
  });
  flaeche.appendChild(knotenG);

  /* ---- Sichtfenster, Zoom und Pan ---- */
  var sicht = sichtfenster[modulId];
  if (!sicht) { sicht = { x: 0, y: 0, w: baum.breite, h: baum.hoehe }; }
  var stufeAnzeige = el("span", { class: "baum__stufe" });

  function setze() {
    svg.setAttribute("viewBox", sicht.x + " " + sicht.y + " " + sicht.w + " " + sicht.h);
    sichtfenster[modulId] = sicht;
    var breite = svg.clientWidth || 800;
    var skala = breite / sicht.w;
    svg.setAttribute("class", "baum " + (skala >= 0.72 ? "baum--voll"
      : skala >= 0.38 ? "baum--kurz" : "baum--id"));
    stufeAnzeige.textContent = Math.round(skala * 100) + " %";
  }

  /* Die Leinwand folgt dem Seitenverhältnis des Diagramms, damit bei breiten,
     flachen Strecken keine halbleere Fläche entsteht. */
  function passeHoeheAn() {
    var breite = rahmen.clientWidth || 800;
    var hoehe = breite * (baum.hoehe / baum.breite);
    var min = 17 * 16, max = Math.min(window.innerHeight * 0.62, 34 * 16);
    svg.style.height = Math.round(Math.max(min, Math.min(max, hoehe))) + "px";
  }

  function einpassen() {
    passeHoeheAn();
    var breite = svg.clientWidth || 800, hoehe = svg.clientHeight || 420;
    var skala = Math.min(breite / baum.breite, hoehe / baum.hoehe);
    var w2 = breite / skala, h2 = hoehe / skala;
    /* Inhalt mittig statt am oberen Rand */
    sicht = { x: (baum.breite - w2) / 2, y: (baum.hoehe - h2) / 2, w: w2, h: h2 };
    setze();
  }

  function zoom(faktor, zx, zy) {
    var neu = Math.min(Math.max(sicht.w / faktor, baum.breite / 40),
                       baum.breite * 4);
    var f = sicht.w / neu;
    sicht = {
      x: zx - (zx - sicht.x) / f, y: zy - (zy - sicht.y) / f,
      w: sicht.w / f, h: sicht.h / f
    };
    setze();
  }

  function svgPunkt(clientX, clientY) {
    var r = svg.getBoundingClientRect();
    return {
      x: sicht.x + (clientX - r.left) / r.width * sicht.w,
      y: sicht.y + (clientY - r.top) / r.height * sicht.h
    };
  }

  svg.addEventListener("wheel", function (ereignis) {
    ereignis.preventDefault();
    var p = svgPunkt(ereignis.clientX, ereignis.clientY);
    /* Trackpad-Pinch meldet sich als wheel mit ctrlKey */
    var staerke = ereignis.ctrlKey ? 0.012 : 0.0022;
    zoom(Math.exp(-ereignis.deltaY * staerke), p.x, p.y);
  }, { passive: false });

  var zeiger = new Map(), letzterAbstand = 0, ziehtVon = null;
  svg.addEventListener("pointerdown", function (ereignis) {
    if (ereignis.target.closest && ereignis.target.closest(".kn--frage")) return;
    svg.setPointerCapture(ereignis.pointerId);
    zeiger.set(ereignis.pointerId, { x: ereignis.clientX, y: ereignis.clientY });
    if (zeiger.size === 1) { ziehtVon = { x: ereignis.clientX, y: ereignis.clientY }; }
    svg.classList.add("baum--zieht");
  });
  svg.addEventListener("pointermove", function (ereignis) {
    if (!zeiger.has(ereignis.pointerId)) return;
    zeiger.set(ereignis.pointerId, { x: ereignis.clientX, y: ereignis.clientY });
    var punkte = Array.from(zeiger.values());
    if (punkte.length >= 2) {
      var abstand = Math.hypot(punkte[0].x - punkte[1].x, punkte[0].y - punkte[1].y);
      if (letzterAbstand) {
        var mitte = svgPunkt((punkte[0].x + punkte[1].x) / 2,
                             (punkte[0].y + punkte[1].y) / 2);
        zoom(abstand / letzterAbstand, mitte.x, mitte.y);
      }
      letzterAbstand = abstand;
      return;
    }
    if (!ziehtVon) return;
    var r = svg.getBoundingClientRect();
    sicht.x -= (ereignis.clientX - ziehtVon.x) / r.width * sicht.w;
    sicht.y -= (ereignis.clientY - ziehtVon.y) / r.height * sicht.h;
    ziehtVon = { x: ereignis.clientX, y: ereignis.clientY };
    setze();
  });
  function endeZeiger(ereignis) {
    zeiger.delete(ereignis.pointerId);
    if (zeiger.size < 2) letzterAbstand = 0;
    if (!zeiger.size) { ziehtVon = null; svg.classList.remove("baum--zieht"); }
  }
  svg.addEventListener("pointerup", endeZeiger);
  svg.addEventListener("pointercancel", endeZeiger);

  svg.addEventListener("keydown", function (ereignis) {
    var schritt = sicht.w / 12;
    var mitte = { x: sicht.x + sicht.w / 2, y: sicht.y + sicht.h / 2 };
    if (ereignis.key === "+" || ereignis.key === "=") { zoom(1.25, mitte.x, mitte.y); }
    else if (ereignis.key === "-") { zoom(1 / 1.25, mitte.x, mitte.y); }
    else if (ereignis.key === "0") { einpassen(); }
    else if (ereignis.key === "ArrowLeft") { sicht.x -= schritt; setze(); }
    else if (ereignis.key === "ArrowRight") { sicht.x += schritt; setze(); }
    else if (ereignis.key === "ArrowUp") { sicht.y -= schritt; setze(); }
    else if (ereignis.key === "ArrowDown") { sicht.y += schritt; setze(); }
    else return;
    ereignis.preventDefault();
  });

  var rahmen = el("div", { class: "baum__rahmen" });
  w.appendChild(el("div", { class: "baum__leiste" }, [
    el("div", { class: "baum__legende" }, [
      el("span", { class: "legende legende--gegangen", text: "gegangener Pfad" }),
      el("span", { class: "legende legende--moeglich", text: "noch möglich" }),
      el("span", { class: "legende legende--aus", text: "ausgeschlossen" })
    ]),
    el("div", { class: "baum__knoepfe" }, [
      stufeAnzeige,
      el("button", { class: "zoomknopf", type: "button", text: "−",
        "aria-label": "Herauszoomen",
        onclick: function () { zoom(1 / 1.25, sicht.x + sicht.w / 2, sicht.y + sicht.h / 2); } }),
      el("button", { class: "zoomknopf", type: "button", text: "+",
        "aria-label": "Hineinzoomen",
        onclick: function () { zoom(1.25, sicht.x + sicht.w / 2, sicht.y + sicht.h / 2); } }),
      el("button", { class: "tat", type: "button", text: "einpassen",
        onclick: einpassen }),
      el("button", { class: "tat", type: "button", text: "100 %",
        onclick: function () {
          var r = svg.getBoundingClientRect();
          sicht = { x: sicht.x, y: sicht.y, w: r.width, h: r.height };
          setze();
        } })
    ])
  ]));
  w.appendChild(rahmen);
  rahmen.appendChild(svg);
  w.appendChild(el("p", { class: "fundstelle", text:
    "Knoten anklicken springt zur Frage. Mausrad oder Pinch zoomt, Ziehen "
    + "verschiebt; mit Tastatur: Plus, Minus, 0 und Pfeiltasten." }));
  if (S.baumErzwingen) {
    w.appendChild(el("div", { class: "tatleiste" }, [
      el("button", { class: "tat", type: "button", text: "← Wieder als Pfadliste",
        onclick: function () { S.baumErzwingen = false; zeichne(); } })
    ]));
  }

  /* Das Sichtfenster braucht die tatsächliche Breite, die erst nach dem
     Einhängen feststeht. */
  requestAnimationFrame(function () {
    if (sichtfenster[modulId] && sichtfenster[modulId].gesetzt) setze();
    else { einpassen(); sicht.gesetzt = true; }
  });
  return w;
}

function zeichnePfadliste(baum) {
  var w = el("div", { class: "pfadliste" });
  w.appendChild(el("p", { class: "lead", text:
    "Auf schmalen Bildschirmen zeigt die Baumansicht den Pfad als Liste." }));
  var liste = el("ol", { class: "pfadliste__liste" });
  baum.lauf.schritte.forEach(function (s) {
    var f = idx.fragen.get(s.frage_id);
    liste.appendChild(el("li", { class: "pfadliste__schritt" }, [
      el("button", { class: "tat tat--umbruch", type: "button",
        text: s.frage_id + ": " + kuerze(f ? f.frage : "", 70),
        onclick: function () { springeZuFrage(s.frage_id); } }),
      el("div", { class: "pfadliste__antwort",
                  text: "Antwort: " + antwortText(s.frage_id, s.antwort) }),
      s.befunde.length ? el("div", { class: "pfadliste__befund",
        text: s.befunde.map(function (b) { return b.text; }).join(" · ") }) : null
    ]));
  });
  if (baum.lauf.aktuell) {
    var f = idx.fragen.get(baum.lauf.aktuell);
    liste.appendChild(el("li", { class: "pfadliste__schritt pfadliste__schritt--offen" }, [
      el("button", { class: "tat tat--umbruch", type: "button",
        text: baum.lauf.aktuell + ": " + kuerze(f ? f.frage : "", 70) + " (offen)",
        onclick: function () { springeZuFrage(baum.lauf.aktuell); } })
    ]));
  }
  w.appendChild(liste);
  return w;
}

/* ========================================================== Ergebnisprofil */

var TYP_KUERZEL = {
  "Handlungspflicht": "Handlung", "Informationspflicht": "Information",
  "Unterlassungspflicht": "Unterlassung", "Recht": "Recht", "Ausnahme": "Ausnahme"
};

function anzahlText(n) {
  return n === 1 ? "1 Anforderung" : n + " Anforderungen";
}

function filterLeer() {
  return { kapitel: [], typ: [], frist: [], nurUnsicher: false };
}

function filterAktiv() {
  var f = S.filter;
  return f.kapitel.length || f.typ.length || f.frist.length || f.nurUnsicher;
}

function passtZumFilter(e) {
  var f = S.filter;
  if (f.kapitel.length && f.kapitel.indexOf(e.kapitel) < 0) return false;
  if (f.typ.length && f.typ.indexOf(e.typ) < 0) return false;
  if (f.frist.length && !e.fristen.some(function (fr) {
    return f.frist.indexOf(fr.id) >= 0;
  })) return false;
  if (f.nurUnsicher && !e.unsicher) return false;
  return true;
}

function schalte(liste, wert) {
  var i = liste.indexOf(wert);
  if (i >= 0) liste.splice(i, 1); else liste.push(wert);
  zeichne();
}

function chip(beschriftung, gedrueckt, beiKlick, zusatz) {
  return el("button", {
    class: "chip" + (gedrueckt ? " chip--an" : "") + (zusatz ? " " + zusatz : ""),
    type: "button", "aria-pressed": gedrueckt ? "true" : "false",
    onclick: beiKlick, text: beschriftung
  });
}

function zeichneErgebnis() {
  var erg = baueErgebnis(S.antworten, idx);
  var w = el("div", { class: "ergebnis" });

  /* Deckzeile – im Druck die Kopfzeile des Dokuments */
  var datum = new Date();
  var datumText;
  try { datumText = datum.toLocaleDateString("de-DE", { day: "2-digit",
        month: "2-digit", year: "numeric" }); }
  catch (e) { datumText = datum.toISOString().slice(0, 10); }

  w.appendChild(el("h1", { class: "titel", "data-fokus": true,
                           text: "Ergebnisprofil" }));
  w.appendChild(el("dl", { class: "deckzeile" }, [
    el("dt", { text: "Stand" }), el("dd", { text: datumText }),
    el("dt", { text: "Beantwortete Fragen" }),
    el("dd", { text: String(erg.beantwortet) }),
    el("dt", { text: "Anwendbare Anforderungen" }),
    el("dd", { text: String(erg.anzahl) }),
    el("dt", { text: "Ausgeschlossen" }),
    el("dd", { text: String(erg.ausgeschlossen.length) }),
    el("dt", { text: "Quelle" }),
    el("dd", { text: "VO (EU) 2023/2854 · " + (DATEN.meta ? DATEN.meta.quelle : "") })
  ]));
  w.appendChild(el("p", { class: "rechtshinweis", text: RECHTSHINWEIS }));

  if (erg.offeneStrecken.length) {
    w.appendChild(el("div", { class: "meldung meldung--warn" }, [
      el("div", { class: "meldung__kopf", text: "Vorläufiges Profil" }),
      el("div", { text: "Noch offen: " + erg.offeneStrecken.join(", ")
        + ". Solange eine Prüfstrecke nicht abgeschlossen ist, können weitere "
        + "Anforderungen hinzukommen oder entfallen." })
    ]));
  }

  if (!erg.anzahl) {
    w.appendChild(el("p", { class: "lead", text:
      "Bisher wurde keine Anforderung ausgelöst. Beantworten Sie die "
      + "Prüfstrecken, um das Profil zu füllen." }));
    w.appendChild(zurueckLeiste());
    return w;
  }

  w.appendChild(zeichneZeitleiste(erg));
  w.appendChild(zeichneFilterleiste(erg));

  if (erg.mehrfachrollen.length) {
    w.appendChild(el("div", { class: "meldung" }, [
      el("div", { class: "meldung__kopf", text:
        erg.mehrfachrollen.length + " Anforderungen betreffen Sie in mehreren Rollen" }),
      el("div", { text: "Ihr Unternehmen tritt in mehreren Rollen auf. Die "
        + "betroffenen Anforderungen sind bei jeder auslösenden Rolle "
        + "ausgewiesen; keine der Wirkungen wird unterdrückt: "
        + erg.mehrfachrollen.map(function (e) { return e.req_id; }).join(", ") })
    ]));
  }

  var sichtbar = 0;
  erg.nachKapitel.forEach(function (gruppe) {
    var knoten = zeichneKapitel(gruppe);
    if (knoten) { w.appendChild(knoten); sichtbar += knoten.__anzahl; }
  });
  if (!sichtbar) {
    w.appendChild(el("p", { class: "lead", text:
      "Kein Eintrag passt zu den gewählten Filtern." }));
  }

  w.appendChild(zeichneAusgeschlossen(erg));
  if (erg.eingeschraenkt.length) w.appendChild(zeichneEingeschraenkt(erg));
  w.appendChild(zeichneOffenePunkte(erg));
  w.appendChild(zurueckLeiste());
  return w;
}

function zurueckLeiste() {
  return el("div", { class: "tatleiste" }, [
    el("button", { class: "tat tat--zurueck", type: "button",
      text: "← Prüfstrecken",
      onclick: function () { geheZu("uebersicht"); } }),
    el("button", { class: "knopf", type: "button", text: "Drucken / als PDF sichern",
      onclick: function () { window.print(); } })
  ]);
}

function zeichneZeitleiste(erg) {
  var w = el("section", { class: "abschnitt zeitleiste" });
  w.appendChild(el("h2", { text: "Zeitleiste der Geltungsbeginne" }));
  var liste = el("ol", { class: "zeitleiste__liste" });
  erg.zeitleiste.forEach(function (z) {
    var an = S.filter.frist.indexOf(z.frist.id) >= 0;
    liste.appendChild(el("li", { class: "zeitpunkt" + (an ? " zeitpunkt--an" : "") }, [
      el("button", {
        class: "zeitpunkt__knopf", type: "button",
        "aria-pressed": an ? "true" : "false",
        onclick: function () { schalte(S.filter.frist, z.frist.id); }
      }, [
        el("span", { class: "zeitpunkt__datum", text: z.frist.datum }),
        el("span", { class: "zeitpunkt__zahl", text: anzahlText(z.eintraege.length) })
      ]),
      el("span", { class: "zeitpunkt__text" }, [
        el("span", { text: z.frist.bedeutung }),
        el("span", { class: "zeitpunkt__quelle", text: z.frist.fundstelle })
      ])
    ]));
  });
  w.appendChild(liste);
  return w;
}

function zeichneFilterleiste(erg) {
  var w = el("section", { class: "filter", "aria-label": "Filter" });
  var kapitel = erg.nachKapitel.map(function (g) { return g.kapitel; });
  var typen = [];
  erg.ausgeloest.forEach(function (e) {
    if (typen.indexOf(e.typ) < 0) typen.push(e.typ);
  });
  typen.sort(function (a, b) {
    return idx.typFolge.indexOf(a) - idx.typFolge.indexOf(b);
  });

  w.appendChild(el("div", { class: "filter__zeile" }, [
    el("span", { class: "filter__marke", text: "Kapitel" })
  ].concat(kapitel.map(function (k) {
    return chip(k, S.filter.kapitel.indexOf(k) >= 0,
      function () { schalte(S.filter.kapitel, k); });
  }))));

  w.appendChild(el("div", { class: "filter__zeile" }, [
    el("span", { class: "filter__marke", text: "Typ" })
  ].concat(typen.map(function (t) {
    return chip(TYP_KUERZEL[t] || t, S.filter.typ.indexOf(t) >= 0,
      function () { schalte(S.filter.typ, t); });
  }))));

  var unsicherAnzahl = erg.ausgeloest.filter(function (e) { return e.unsicher; }).length;
  w.appendChild(el("div", { class: "filter__zeile" }, [
    el("span", { class: "filter__marke", text: "Weiteres" }),
    chip("nur Auslegungsunsicherheit (" + unsicherAnzahl + ")", S.filter.nurUnsicher,
      function () { S.filter.nurUnsicher = !S.filter.nurUnsicher; zeichne(); },
      "chip--warn"),
    filterAktiv()
      ? el("button", { class: "tat", type: "button", text: "Filter zurücksetzen",
          onclick: function () { S.filter = filterLeer(); zeichne(); } })
      : null
  ]));
  return w;
}

function zeichneKapitel(gruppe) {
  var gefiltert = [];
  gruppe.typen.forEach(function (t) {
    var drin = t.eintraege.filter(passtZumFilter);
    if (drin.length) gefiltert.push({ typ: t.typ, eintraege: drin });
  });
  var anzahl = gefiltert.reduce(function (s, t) { return s + t.eintraege.length; }, 0);
  if (!anzahl) return null;

  var alle = [];
  gefiltert.forEach(function (t) {
    t.eintraege.forEach(function (e) { alle.push(e.req_id); });
  });

  var w = el("section", { class: "abschnitt kapitel" });
  w.__anzahl = anzahl;
  w.appendChild(el("div", { class: "abschnitt__kopf" }, [
    el("h2", { text: "Kapitel " + gruppe.kapitel }),
    el("span", { class: "abschnitt__tat" }, [
      el("span", { class: "modul__zahl", text: anzahlText(anzahl) }),
      el("button", { class: "tat", type: "button", text: "alle aufklappen",
        onclick: function () {
          alle.forEach(function (r) { S.offen[r] = true; }); zeichne();
        } }),
      el("button", { class: "tat", type: "button", text: "alle zuklappen",
        onclick: function () {
          alle.forEach(function (r) { delete S.offen[r]; }); zeichne();
        } })
    ])
  ]));

  gefiltert.forEach(function (t) {
    w.appendChild(el("h3", { class: "typzeile",
      text: t.typ + " (" + t.eintraege.length + ")" }));
    var liste = el("div", { class: "reqliste" });
    t.eintraege.forEach(function (e) { liste.appendChild(zeichneReqZeile(e)); });
    w.appendChild(liste);
  });
  return w;
}

function zeichneReqZeile(e) {
  var offen = !!S.offen[e.req_id];
  var d = el("details", {
    class: "req" + (e.unsicher ? " req--warn" : "") + (e.verschoben ? " req--spaeter" : ""),
    open: offen ? "" : null,
    ontoggle: function () { if (d.open) S.offen[e.req_id] = true; else delete S.offen[e.req_id]; }
  });

  var fristText = e.fristen.map(function (f) { return f.datum; }).join(", ") || "—";
  d.appendChild(el("summary", { class: "req__kopf" }, [
    el("span", { class: "req__zeile" }, [
      el("span", { class: "req__id", text: e.req_id }),
      el("span", { class: "req__titel",
        text: e.ergebnis.kurztitel || e.anforderung.anforderung || "" })
    ]),
    el("span", { class: "req__meta" }, [
      el("span", { class: "req__stelle",
        text: e.ergebnis.fundstelle || e.anforderung.fundstelle || "" }),
      el("span", { class: "req__frist", text: fristText }),
      el("span", { class: "req__typ", text: TYP_KUERZEL[e.typ] || e.typ }),
      e.unsicher ? el("span", { class: "req__marke", text: "Auslegung offen" }) : null,
      e.verschoben ? el("span", { class: "req__marke req__marke--spaeter",
                                  text: "Geltungsbeginn verschoben" }) : null,
      e.rollen.length > 1
        ? el("span", { class: "req__marke req__marke--rolle",
                       text: e.rollen.length + " Rollen betroffen" }) : null
    ])
  ]));

  var inhalt = el("div", { class: "req__inhalt" });

  if (e.ergebnis.beschreibung) {
    inhalt.appendChild(el("p", { class: "req__text" }, [
      textMitBegriffen(e.ergebnis.beschreibung, e.ergebnis.beschreibung_begriffe)
    ]));
  }
  if (e.ergebnis.naechste_schritte) {
    inhalt.appendChild(el("div", { class: "req__block" }, [
      el("h4", { text: "Empfohlene nächste Schritte" }),
      el("p", {}, [textMitBegriffen(e.ergebnis.naechste_schritte,
                                    e.ergebnis.naechste_schritte_begriffe)])
    ]));
  }

  if (e.unsicher) {
    inhalt.appendChild(el("div", { class: "befund befund--warn" }, [
      el("span", { class: "befund__quelle", text: "Auslegungsunsicherheit" }),
      el("span", { text: e.anforderung.auslegungsunsicherheit })
    ]));
  }
  if (e.verschoben && e.verschiebung.length) {
    inhalt.appendChild(el("div", { class: "befund" }, [
      el("span", { class: "befund__quelle", text: "Geltungsbeginn verschoben" }),
      el("span", { text: e.verschiebung.map(function (b) {
        return b.kommentar || b.mapping_id;
      }).join(" · ") })
    ]));
  }
  if (e.einschraenkungen.length) {
    inhalt.appendChild(el("div", { class: "befund" }, [
      el("span", { class: "befund__quelle", text: "Eingeschränkt" }),
      el("span", { text: e.einschraenkungen.map(function (b) {
        return b.kommentar || b.mapping_id;
      }).join(" · ") })
    ]));
  }

  /* Juristische Detailebene aus dem Blatt Anforderungen */
  var a = e.anforderung;
  var detail = el("dl", { class: "detail" });
  [["Adressat", a.adressat], ["Auslöser / Voraussetzungen", a.ausloeser, a.ausloeser_begriffe],
   ["Ausnahmen und Einschränkungen", a.ausnahmen, a.ausnahmen_begriffe],
   ["Querverweise", a.querverweise], ["Erwägungsgründe", a.erwaegungsgruende],
   ["Hinweis", a.hinweis]].forEach(function (paar) {
    if (!paar[1] || paar[1] === "—") return;
    detail.appendChild(el("dt", { text: paar[0] }));
    detail.appendChild(el("dd", {}, [
      paar[2] ? textMitBegriffen(paar[1], paar[2]) : document.createTextNode(paar[1])
    ]));
  });
  if (e.fristen.length) {
    detail.appendChild(el("dt", { text: "Geltungsbeginn" }));
    detail.appendChild(el("dd", { text: e.fristen.map(function (f) {
      return f.datum + " (" + f.fundstelle + ")";
    }).join(" · ") }));
  }
  if (a.handlungsfristen && a.handlungsfristen.length) {
    detail.appendChild(el("dt", { text: "Handlungsfristen" }));
    detail.appendChild(el("dd", { text: a.handlungsfristen.map(function (id) {
      var fr = (DATEN.fristen || []).filter(function (x) { return x.id === id; })[0];
      return fr ? fr.datum : id;
    }).join(" · ") }));
  }
  if (detail.childNodes.length) {
    inhalt.appendChild(el("div", { class: "req__block" }, [
      el("h4", { text: "Rechtliche Einordnung" }), detail
    ]));
  }

  inhalt.appendChild(zeichneHerkunft(e));
  d.appendChild(inhalt);
  return d;
}

function antwortText(frageId, schluessel) {
  var f = idx.fragen.get(frageId);
  if (!f) return schluessel.join(", ");
  return schluessel.map(function (s) {
    var o = f.antwortoptionen.filter(function (x) { return x.schluessel === s; })[0];
    return o && o.form === "buchstabe" ? s + ") " + o.text : s;
  }).join(" + ");
}

function zeichneHerkunft(e) {
  var w = el("div", { class: "req__block herkunft" });
  w.appendChild(el("h4", { text: "Herkunft" }));
  /* Belege nach Rolle bündeln, damit mehrere Rollen sichtbar bleiben */
  var nachRolle = new Map();
  e.belege.forEach(function (b) {
    var schluessel = b.rolle ? b.rolle.variable : "";
    if (!nachRolle.has(schluessel)) nachRolle.set(schluessel, []);
    nachRolle.get(schluessel).push(b);
  });
  nachRolle.forEach(function (belege, rollenName) {
    if (rollenName) {
      var rolle = belege[0].rolle;
      var kopf = el("div", { class: "herkunft__rolle" }, [
        el("span", { text: "Als Rolle " }),
        el("span", { class: "varmarke", text: rollenName, role: "button",
                     "aria-label": rollenName + ", Variable erklären" })
      ]);
      haengeErklAn(kopf.lastChild, function () { return erklVariable(rollenName); });
      if (rolle.beschreibung) {
        kopf.appendChild(el("span", { class: "herkunft__lang",
                                      text: " – " + rolle.beschreibung }));
      }
      w.appendChild(kopf);
    }
    belege.forEach(function (b) {
      var kurz = (b.antwort || []).join(" + ");
      var zeile = el("div", { class: "herkunft__zeile" }, [
        el("button", {
          class: "tat tat--umbruch", type: "button",
          text: "Ausgelöst durch " + b.frage_id + " = " + kurz + " →",
          title: "Zu Frage " + b.frage_id + " springen",
          onclick: function () { springeZuFrage(b.frage_id); }
        }),
        el("span", { class: "herkunft__wirkung", text: b.wirkung }),
        el("div", { class: "herkunft__kommentar",
                    text: antwortText(b.frage_id, b.antwort || []) })
      ]);
      if (b.kommentar) {
        zeile.appendChild(el("div", { class: "herkunft__kommentar", text: b.kommentar }));
      }
      if (b.klartext && b.klartext.length) {
        zeile.appendChild(el("div", { class: "herkunft__kommentar" }, [
          el("b", { text: "Bedingung im Klartext: " }), b.klartext.join("; ")
        ]));
      }
      w.appendChild(zeile);
    });
  });
  return w;
}

function springeZuFrage(frageId) {
  var f = idx.fragen.get(frageId);
  if (!f) return;
  S.ansicht = "modul";
  S.modul = f.modul;
  S.blick = frageId;
  S.baum = false;
  S.meldung = null;
  zeichne();
}

function zeichneAusgeschlossen(erg) {
  var w = el("section", { class: "abschnitt" });
  var d = el("details", { class: "sammelblock",
    open: S.offen.__ausgeschlossen ? "" : null,
    ontoggle: function () {
      if (d.open) S.offen.__ausgeschlossen = true; else delete S.offen.__ausgeschlossen;
    } });
  d.appendChild(el("summary", {}, [
    el("h2", { text: "Nicht anwendbar – mit Begründung" }),
    el("span", { class: "modul__zahl",
                 text: anzahlText(erg.ausgeschlossen.length) })
  ]));
  var innen = el("div", { class: "sammelblock__inhalt" });
  innen.appendChild(el("p", { class: "lead", text:
    "Diese Anforderungen wurden durch Ihre Angaben ausgeschlossen. Sie bleiben "
    + "hier stehen, weil die Entlastung genauso dokumentiert gehört wie die Pflicht." }));
  if (!erg.ausgeschlossen.length) {
    innen.appendChild(el("p", { class: "lead", text: "Bisher keine." }));
  }
  var liste = el("div", { class: "reqliste" });
  erg.ausgeschlossen.forEach(function (e) { liste.appendChild(zeichneReqZeile(e)); });
  innen.appendChild(liste);
  d.appendChild(innen);
  w.appendChild(d);
  return w;
}

function zeichneEingeschraenkt(erg) {
  var w = el("section", { class: "abschnitt" });
  var d = el("details", { class: "sammelblock",
    open: S.offen.__eingeschraenkt ? "" : null,
    ontoggle: function () {
      if (d.open) S.offen.__eingeschraenkt = true; else delete S.offen.__eingeschraenkt;
    } });
  d.appendChild(el("summary", {}, [
    el("h2", { text: "Nur eingeschränkt berührt" }),
    el("span", { class: "modul__zahl",
                 text: anzahlText(erg.eingeschraenkt.length) })
  ]));
  var innen = el("div", { class: "sammelblock__inhalt" });
  innen.appendChild(el("p", { class: "lead", text:
    "Für diese Anforderungen enthält das Mapping ausschließlich einschränkende "
    + "Wirkungen und keine auslösende. Sie zählen deshalb weder zu den "
    + "anwendbaren noch zu den ausgeschlossenen Anforderungen." }));
  var liste = el("div", { class: "reqliste" });
  erg.eingeschraenkt.forEach(function (e) { liste.appendChild(zeichneReqZeile(e)); });
  innen.appendChild(liste);
  d.appendChild(innen);
  w.appendChild(d);
  return w;
}

function zeichneOffenePunkte(erg) {
  var w = el("section", { class: "abschnitt" });
  w.appendChild(el("h2", { text: "Offene Punkte für die juristische Prüfung" }));
  w.appendChild(el("p", { class: "lead", text:
    "Stellen, an denen der Verordnungstext nach der Quelle nicht eindeutig ist "
    + "oder auf noch ausstehende Rechtsakte verweist." }));

  if (erg.offenePunkte.ausUnsicherheit.length) {
    w.appendChild(el("h3", { class: "typzeile", text:
      "Berührte Anforderungen mit Auslegungsunsicherheit ("
      + erg.offenePunkte.ausUnsicherheit.length + ")" }));
    var liste = el("div", { class: "befundliste" });
    erg.offenePunkte.ausUnsicherheit.forEach(function (e) {
      liste.appendChild(el("div", { class: "befund befund--warn" }, [
        el("span", { class: "befund__quelle", text: e.req_id + " · "
          + (e.ergebnis.fundstelle || e.anforderung.fundstelle)
          + (e.rang === 4 ? " · ausgeschlossen" : "") }),
        el("span", { text: e.anforderung.auslegungsunsicherheit })
      ]));
    });
    w.appendChild(liste);
  }

  if (erg.offenePunkte.ausBlatt.length) {
    w.appendChild(el("h3", { class: "typzeile", text:
      "Einschlägige Einträge aus dem Blatt „Offene Punkte" + "“ ("
      + erg.offenePunkte.ausBlatt.length + ")" }));
    var liste2 = el("div", { class: "befundliste" });
    erg.offenePunkte.ausBlatt.forEach(function (p) {
      liste2.appendChild(el("div", { class: "befund" }, [
        el("span", { class: "befund__quelle",
                     text: p.fundstelle + " · " + p.kategorie
                           + " · Priorität " + p.prioritaet }),
        el("span", { text: p.punkt }),
        p.auswirkung ? el("div", { class: "herkunft__kommentar" }, [
          el("b", { text: "Auswirkung: " }), p.auswirkung
        ]) : null
      ]));
    });
    w.appendChild(liste2);
  }
  if (!erg.offenePunkte.ausUnsicherheit.length && !erg.offenePunkte.ausBlatt.length) {
    w.appendChild(el("p", { class: "lead", text: "Keine." }));
  }
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

/* Vor dem Drucken alle Zeilen öffnen, danach den vorherigen Zustand
   wiederherstellen. Das Ergebnisprofil ist damit im PDF vollständig lesbar. */
var vorDruck = null;
window.addEventListener("beforeprint", function () {
  vorDruck = Object.assign({}, S.offen);
  var alle = document.querySelectorAll("details");
  for (var i = 0; i < alle.length; i++) alle[i].open = true;
});
window.addEventListener("afterprint", function () {
  if (vorDruck === null) return;
  S.offen = vorDruck;
  vorDruck = null;
  zeichne();
});

var quelle = document.getElementById("fuss-quelle");
if (quelle && DATEN.meta) {
  quelle.textContent = "Datenstand: " + DATEN.meta.quelle
    + " · erzeugt " + String(DATEN.meta.erzeugt_am).slice(0, 10);
}

zeichne();
})();
