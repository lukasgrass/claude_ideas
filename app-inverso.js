/* Oberfläche der zugeschnittenen Fassung.

   Kein eigener IIFE-Rumpf und kein "use strict": build_data.py kapselt diese
   Datei gemeinsam mit dem Motor aus app.js (Block zwischen ENGINE-START und
   ENGINE-ENDE). Alle Funktionen des Motors stehen deshalb hier zur Verfügung –
   bewerte, zustandAus, laufeModul, baueBaum, baueErgebnis, bereinige – und es
   gibt keine zweite Auswertung, die auseinanderlaufen könnte. */

var DATEN = JSON.parse(document.getElementById("daten").textContent);
var PROFIL = DATEN.profil;
var idx = baueIndex(DATEN);
var SCHLUESSEL = "data-act-inverso/stand/1";

var RECHTSHINWEIS = "Dieses Werkzeug gibt eine strukturierte Orientierung "
  + "anhand des Verordnungstextes. Es ist keine Rechtsberatung und ersetzt "
  + "keine Prüfung des Einzelfalls.";

/* Maße der Knoten: breiter als im allgemeinen Werkzeug, weil die
   Antwortoptionen im Knoten stehen. */
var MASS = { knotenBreite: 210, spalte: 262, luecke: 22, optionenHoehe: 20 };
var OPT_HOEHE = 18, OPT_ABSTAND = 20;

var S = {
  antworten: {},
  aktiv: {},        /* baumId -> Frage-ID, deren Erklärung im Seitenfeld steht */
  offen: {},        /* Req-ID -> aufgeklappt */
  karten: {},       /* baumId -> Kartenansicht statt Diagramm erzwungen */
  meldung: null
};

function vorbelegung(frageId) {
  return (PROFIL.vorbelegt || {})[frageId] || null;
}

function startAntworten() {
  var a = {};
  Object.keys(PROFIL.vorbelegt || {}).forEach(function (fid) {
    a[fid] = PROFIL.vorbelegt[fid].antwort.slice();
  });
  return a;
}

/* ------------------------------------------------------------- Bausteine */
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
function leere(n) { while (n.firstChild) n.removeChild(n.firstChild); }
function sage(t) { document.getElementById("live").textContent = t; }
function anzahlText(n) { return n === 1 ? "1 Anforderung" : n + " Anforderungen"; }

/* -------------------------------------------------------------- Speicher */
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
    if (!d || d.v !== 1 || !d.antworten) return null;
    var sauber = {};
    Object.keys(d.antworten).forEach(function (fid) {
      if (idx.fragen.has(fid) && Array.isArray(d.antworten[fid])) {
        sauber[fid] = d.antworten[fid];
      }
    });
    return sauber;
  } catch (e) { return null; }
}
function verwirfStand() { try { localStorage.removeItem(SCHLUESSEL); } catch (e) {} }

/* ------------------------------------------------------------ Erklärungen */
var panel = null, panelAuslöser = null, panelTimer = null;
function panelElement() {
  if (panel) return panel;
  panel = el("div", { class: "erkl", id: "erkl-panel", role: "tooltip", hidden: true });
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
  p.style.left = "0px"; p.style.top = "0px";
  var a = auslöser.getBoundingClientRect(), b = p.getBoundingClientRect(), rand = 12;
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
  knoten.addEventListener("click", function (e) {
    e.preventDefault();
    if (panelAuslöser === knoten && panel && !panel.hidden) schliesseErkl(0);
    else oeffnen();
  });
  knoten.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { schliesseErkl(0); knoten.blur(); }
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
  var wertText = wert === undefined ? "noch nicht gesetzt"
    : (wert && wert.charCodeAt && wert.charCodeAt(0) === 0)
      ? "gesetzt, Wert laut Excel nicht bestimmbar"
      : wert + ((v.wert_texte && v.wert_texte[wert]) ? " – " + v.wert_texte[wert] : "");
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
function textMitBegriffen(text, spans) {
  var teil = document.createDocumentFragment();
  if (!text) return teil;
  if (!spans || !spans.length) {
    teil.appendChild(document.createTextNode(text));
    return teil;
  }
  var pos = 0;
  spans.forEach(function (s) {
    if (s.start > pos) teil.appendChild(document.createTextNode(text.slice(pos, s.start)));
    var wort = text.slice(s.start, s.start + s.laenge);
    var marke = el("span", { class: "begriff", text: wort, role: "button",
                             "aria-label": wort + ", Begriff erklären" });
    haengeErklAn(marke, function () { return erklBegriff(s.begriff); });
    teil.appendChild(marke);
    pos = s.start + s.laenge;
  });
  if (pos < text.length) teil.appendChild(document.createTextNode(text.slice(pos)));
  return teil;
}
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
                             role: "button", "aria-label": treffer[0] + ", Variable erklären" });
    (function (name) {
      haengeErklAn(marke, function () { return erklVariable(name); });
    })(treffer[0]);
    teil.appendChild(marke);
    pos = treffer.index + treffer[0].length;
  }
  if (pos < text.length) teil.appendChild(document.createTextNode(text.slice(pos)));
  return teil;
}
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") schliesseErkl(0);
});
window.addEventListener("scroll", function () { schliesseErkl(0); }, true);

/* ===================================================================
   Zuordnung der Anforderungen zu Grundlagen / Baum 1 / Baum 2
   =================================================================== */

function fragenJeBaum() {
  var zuordnung = {};
  PROFIL.baeume.forEach(function (b) {
    zuordnung[b.id] = new Set((idx.fragenJeModul.get(b.modul) || [])
      .map(function (f) { return f.id; }));
  });
  return zuordnung;
}

/* Eine Anforderung gehört zu jedem Baum, aus dem ein Beleg stammt. Stammen
   alle Belege aus dem Einstieg, steht sie unter "gilt unabhängig vom Pfad". */
function praemissen() {
  return Object.keys(PROFIL.vorbelegt || {});
}

function verteileAnforderungen() {
  var erg = baueErgebnis(S.antworten, idx, praemissen());
  var jeBaum = fragenJeBaum();
  var faecher = { grundlagen: [] };
  PROFIL.baeume.forEach(function (b) { faecher[b.id] = []; });

  erg.ausgeloest.concat(erg.ausgeschlossen, erg.eingeschraenkt)
    .forEach(function (e) {
      var getroffen = false;
      PROFIL.baeume.forEach(function (b) {
        if (e.belege.some(function (x) { return jeBaum[b.id].has(x.frage_id); })) {
          faecher[b.id].push(e);
          getroffen = true;
        }
      });
      if (!getroffen) faecher.grundlagen.push(e);
    });
  erg.faecher = faecher;
  return erg;
}

function nurAusgeloest(liste) {
  return liste.filter(function (e) { return e.rang === 2 || e.rang === 3; });
}

/* ===================================================================
   Antworten setzen
   =================================================================== */

/* Vorbelegungen sind Prämissen aus dem Firmenprofil, keine Wegpunkte im Baum.
   Sie gelten auch dann, wenn ihre Frage im Baum noch nicht an der Reihe ist,
   und werden deshalb vor dem Aufräumen geschützt. */
function bereinigeOhneVorbelegung(neu) {
  return bereinige(neu, idx, praemissen());
}

function beantworte(frageId, schluessel, baumId) {
  var neu = Object.assign({}, S.antworten);
  neu[frageId] = schluessel;
  var bereinigt = bereinigeOhneVorbelegung(neu);
  S.antworten = bereinigt.antworten;
  if (baumId) S.aktiv[baumId] = frageId;

  if (bereinigt.entfernt.length) {
    S.meldung = {
      kopf: bereinigt.entfernt.length === 1
        ? "Eine Folgeantwort wurde zurückgesetzt"
        : bereinigt.entfernt.length + " Folgeantworten wurden zurückgesetzt",
      text: "Durch die geänderte Antwort sind diese Fragen nicht mehr Teil Ihres "
            + "Pfades: " + bereinigt.entfernt.map(function (e) { return e.frage_id; })
              .join(", ") + "."
    };
    sage(S.meldung.kopf + ". " + S.meldung.text);
  }
  speichere();
  zeichne();
  if (baumId) {
    var def = PROFIL.baeume.filter(function (b) { return b.id === baumId; })[0];
    if (def) {
      var lauf = laufeModul(def.modul, S.antworten, idx);
      var ziel = lauf.aktuell || frageId;
      requestAnimationFrame(function () {
        if (schwenkZiel[baumId]) schwenkZiel[baumId](ziel);
      });
    }
  }
}

/* ===================================================================
   Zeichnen
   =================================================================== */

var letzterStand = null;

function zeichne() {
  var inhalt = document.getElementById("inhalt");
  var vorherigeScrollhoehe = window.scrollY;
  leere(inhalt);

  var erg = verteileAnforderungen();

  var zaehler = document.getElementById("zaehler");
  leere(zaehler);
  zaehler.appendChild(el("span", {}, [
    el("b", { text: String(erg.anzahl) }), " Anforderungen",
    el("span", { class: "nur-breit", text: " für Ihr Unternehmen" })
  ]));

  inhalt.appendChild(zeichneKopf(erg));
  if (S.meldung) inhalt.appendChild(zeichneMeldung());
  inhalt.appendChild(zeichneAusgangslage());
  inhalt.appendChild(zeichneSammelblock(
    "Gilt unabhängig vom Pfad", nurAusgeloest(erg.faecher.grundlagen),
    "Diese Anforderungen folgen bereits aus der Einordnung des Unternehmens und "
    + "stehen unabhängig davon fest, wie die beiden Bäume ausgehen.", "__grundlagen"));

  PROFIL.baeume.forEach(function (baum, nr) {
    inhalt.appendChild(zeichneBaumteil(baum, nr + 1, erg));
  });

  inhalt.appendChild(zeichneAusserhalb());
  inhalt.appendChild(el("div", { class: "tatleiste" }, [
    el("button", { class: "tat tat--zurueck", type: "button",
      text: "Alle Antworten auf die Vorbelegung zurücksetzen",
      onclick: function () {
        S.antworten = startAntworten(); S.aktiv = {}; verwirfStand();
        sage("Zurückgesetzt."); zeichne();
      } }),
    el("button", { class: "knopf", type: "button", text: "Drucken / als PDF sichern",
      onclick: function () { window.print(); } })
  ]));

  if (letzterStand !== null) window.scrollTo(0, vorherigeScrollhoehe);
  letzterStand = true;
}

function zeichneKopf(erg) {
  var w = el("div");
  w.appendChild(el("h1", { class: "titel", "data-fokus": true,
    text: "Data Act – " + PROFIL.unternehmen.name }));
  w.appendChild(el("p", { class: "lead", text: PROFIL.unternehmen.kurz
    + " · " + PROFIL.unternehmen.sitz }));
  w.appendChild(el("p", { class: "lead", text:
    "Zwei Entscheidungsbäume, zugeschnitten auf dieses Unternehmen. Gehen Sie "
    + "beide ab: Jede Antwort verschiebt den Pfad und damit die Anforderungen "
    + "am Ende des Baums." }));
  w.appendChild(el("p", { class: "rechtshinweis", text: RECHTSHINWEIS }));
  var datum = "";
  try { datum = new Date().toLocaleDateString("de-DE"); } catch (e) {}
  w.appendChild(el("dl", { class: "deckzeile" }, [
    el("dt", { text: "Stand" }), el("dd", { text: datum }),
    el("dt", { text: "Anwendbare Anforderungen" }),
    el("dd", { text: String(erg.anzahl) }),
    el("dt", { text: "Ausgeschlossen" }),
    el("dd", { text: String(erg.ausgeschlossen.length) }),
    el("dt", { text: "Quelle" }),
    el("dd", { text: "VO (EU) 2023/2854 · " + (DATEN.meta ? DATEN.meta.quelle : "") })
  ]));
  return w;
}

function zeichneMeldung() {
  return el("div", { class: "meldung meldung--warn" }, [
    el("div", { class: "meldung__kopf", text: S.meldung.kopf }),
    el("div", { text: S.meldung.text }),
    el("button", { type: "button", text: "Verstanden",
      onclick: function () { S.meldung = null; zeichne(); } })
  ]);
}

function zeichneAusgangslage() {
  var w = el("section", { class: "abschnitt ausgangslage" });
  w.appendChild(el("h2", { text: "Ausgangslage" }));
  w.appendChild(el("p", { class: "lead", text:
    "Aus der Unternehmensbeschreibung abgeleitet, nicht aus der Verordnung. "
    + "Jede Vorbelegung lässt sich im jeweiligen Baum umstellen." }));

  Object.keys(PROFIL.vorbelegt || {}).forEach(function (fid) {
    var eintrag = PROFIL.vorbelegt[fid];
    var frage = idx.fragen.get(fid);
    if (!frage) return;
    var gesetzt = S.antworten[fid] || [];
    var texte = gesetzt.map(function (s) {
      var o = frage.antwortoptionen.filter(function (x) { return x.schluessel === s; })[0];
      return o ? (o.form === "buchstabe" ? o.text : o.schluessel) : s;
    });
    var abweichend = gesetzt.join("|") !== eintrag.antwort.join("|");
    w.appendChild(el("div", { class: "profilzeile" }, [
      el("span", { class: "profilzeile__marke", "aria-hidden": "true" }),
      el("span", {}, [
        el("span", { class: "profilzeile__titel", text: texte.join(" · ") || "—" }),
        el("span", { class: "profilzeile__grund", text: eintrag.grund }),
        eintrag.gewicht
          ? el("span", { class: "profilzeile__grund", text: eintrag.gewicht }) : null
      ]),
      el("span", { class: "profilzeile__marker",
        text: abweichend ? fid + " · geändert" : fid + " · vorbelegt" })
    ]));
  });

  (PROFIL.ohne_einfluss || []).forEach(function (gruppe) {
    w.appendChild(el("div", { class: "profilzeile profilzeile--neutral" }, [
      el("span", { class: "profilzeile__marke", "aria-hidden": "true" }),
      el("span", {}, [
        el("span", { class: "profilzeile__titel", text: gruppe.titel }),
        el("span", { class: "profilzeile__grund" }, [textMitVariablen(gruppe.text)])
      ]),
      el("span", { class: "profilzeile__marker", text: "ohne Einfluss" })
    ]));
  });
  return w;
}

/* ------------------------------------------------------------ Ein Baumteil */
function zeichneBaumteil(baum, nummer, erg) {
  var w = el("section", { class: "baumteil", id: "baum-" + baum.id });
  var lauf = laufeModul(baum.modul, S.antworten, idx);
  var gesamt = (idx.fragenJeModul.get(baum.modul) || []).length;

  w.appendChild(el("div", { class: "baumteil__kopf" }, [
    el("div", {}, [
      el("span", { class: "baumteil__nummer", text: "Baum " + nummer + " · " + baum.modul }),
      el("h2", { text: baum.titel }),
      el("div", { class: "baumteil__kapitel", text: baum.untertitel })
    ]),
    el("span", { class: "baumteil__stand",
      text: lauf.schritte.length + " von " + gesamt + " Fragen beantwortet" })
  ]));
  if (baum.einstieg) {
    w.appendChild(el("p", { class: "baumteil__einstieg", text: baum.einstieg }));
  }

  var schmal = false;
  try { schmal = window.matchMedia("(max-width: 52rem)").matches; } catch (e) {}
  var flaeche = el("div", { class: "flaeche" });
  if (schmal || S.karten[baum.id]) {
    flaeche.appendChild(zeichneKarten(baum, lauf));
  } else {
    flaeche.appendChild(zeichneDiagramm(baum, lauf));
    /* Für den Ausdruck: Ein gezoomtes Diagramm druckt sich schlecht, der
       gegangene Pfad als Karten dagegen gut. Am Bildschirm verborgen. */
    var druck = zeichneKarten(baum, lauf, true);
    druck.className = "baumbereich nur-druck";
    flaeche.appendChild(druck);
  }
  flaeche.appendChild(zeichneSeitenfeld(baum, lauf));
  w.appendChild(flaeche);

  var eigene = nurAusgeloest(erg.faecher[baum.id] || []);
  w.appendChild(zeichneSammelblock("Was daraus folgt", eigene,
    "Diese Anforderungen löst der gegangene Pfad dieses Baums aus. Jede Zeile "
    + "nennt aufgeklappt auch, welche Antwort sie ausgelöst hat.", "__baum-" + baum.id));

  var ausgeschlossen = (erg.faecher[baum.id] || []).filter(function (e) {
    return e.rang === 4;
  });
  if (ausgeschlossen.length) {
    w.appendChild(zeichneSammelblock("Durch Ihre Antworten ausgeschlossen",
      ausgeschlossen,
      "Diese Anforderungen entfallen aufgrund Ihrer Antworten in diesem Baum. "
      + "Die Entlastung gehört genauso dokumentiert wie die Pflicht.",
      "__aus-" + baum.id));
  }
  return w;
}

function zeichneSeitenfeld(baum, lauf) {
  var w = el("aside", { class: "seitenfeld" });
  var frageId = S.aktiv[baum.id] || lauf.aktuell
    || (lauf.schritte.length ? lauf.schritte[lauf.schritte.length - 1].frage_id : null);
  var f = frageId ? idx.fragen.get(frageId) : null;
  w.appendChild(el("h3", { text: "Warum diese Frage?" }));
  if (!f) {
    w.appendChild(el("p", { class: "seitenfeld__leer", text:
      "Wählen Sie einen Knoten im Diagramm." }));
    return w;
  }
  w.appendChild(el("div", { class: "seitenfeld__frage" }, [
    el("span", { class: "modul__zahl", text: f.id + " " }),
    textMitBegriffen(f.frage, f.frage_begriffe)
  ]));
  var warnung = (PROFIL.warnungen || {})[f.id];
  if (warnung) {
    w.appendChild(el("div", { class: "befund befund--warn" }, [
      el("span", { class: "befund__quelle", text: "Hinweis zur Datengrundlage" }),
      el("span", { text: warnung })
    ]));
  }
  if (f.erklaertext) {
    w.appendChild(el("p", {}, [textMitBegriffen(f.erklaertext, f.erklaertext_begriffe)]));
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
  var vor = vorbelegung(f.id);
  if (vor) {
    w.appendChild(el("p", { class: "fundstelle" }, [
      el("b", { text: "Vorbelegt: " }), vor.grund
    ]));
  }
  return w;
}

/* ------------------------------------------------------------- Diagramm */
var sichtfenster = {};
var schwenkZiel = {};

function zeichneDiagramm(baum, lauf) {
  var b = baueBaum(baum.modul, S.antworten, idx, MASS);
  var w = el("div", { class: "baumbereich" });
  if (!b) return w;

  var svg = svgEl("svg", {
    class: "baum baum--voll", tabindex: "0", role: "group",
    "aria-label": "Diagramm: " + baum.titel + ". Antwortfelder in den Knoten "
      + "sind anklickbar. Mit den Pfeiltasten verschieben, mit Plus und Minus "
      + "zoomen, mit 0 einpassen."
  });
  var flaeche = svgEl("g");
  svg.appendChild(flaeche);

  var nach = {};
  b.knoten.forEach(function (k) { nach[k.id] = k; });

  var kantenG = svgEl("g");
  b.kanten.forEach(function (e) {
    var a = nach[e.von], z = nach[e.nach];
    if (!a || !z) return;
    var x1 = a.x + a.breite, y1 = a.y + a.hoehe / 2;
    var x2 = z.x, y2 = z.y + z.hoehe / 2;
    var dx = Math.max(30, (x2 - x1) / 2);
    kantenG.appendChild(svgEl("path", {
      class: "kante kante--" + e.zustand,
      d: "M " + x1 + " " + y1 + " C " + (x1 + dx) + " " + y1 + ", "
         + (x2 - dx) + " " + y2 + ", " + x2 + " " + y2
    }));
    kantenG.appendChild(svgEl("text", {
      class: "kantenlabel kantenlabel--" + e.zustand,
      x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 4, "text-anchor": "middle",
      text: e.antwort.length > 12 ? e.antwort.slice(0, 11) + "…" : e.antwort
    }));
  });
  flaeche.appendChild(kantenG);

  var knotenG = svgEl("g");
  b.knoten.forEach(function (k) {
    knotenG.appendChild(zeichneKnoten(k, baum));
  });
  flaeche.appendChild(knotenG);

  /* ---- Sichtfenster ---- */
  var sicht = sichtfenster[baum.id];
  var stufe = el("span", { class: "baum__stufe" });

  function setze() {
    svg.setAttribute("viewBox", sicht.x + " " + sicht.y + " " + sicht.w + " " + sicht.h);
    sichtfenster[baum.id] = sicht;
    var breite = svg.clientWidth || 800;
    var skala = breite / sicht.w;
    svg.setAttribute("class", "baum " + (skala >= 0.72 ? "baum--voll"
      : skala >= 0.38 ? "baum--kurz" : "baum--id"));
    stufe.textContent = Math.round(skala * 100) + " %";
  }
  function passeHoeheAn() {
    var breite = rahmen.clientWidth || 800;
    var hoehe = breite * (b.hoehe / b.breite);
    var min = 24 * 16, max = Math.min(window.innerHeight * 0.7, 40 * 16);
    svg.style.height = Math.round(Math.max(min, Math.min(max, hoehe))) + "px";
  }
  function einpassen() {
    passeHoeheAn();
    var breite = svg.clientWidth || 800, hoehe = svg.clientHeight || 420;
    var skala = Math.min(breite / b.breite, hoehe / b.hoehe);
    sicht = { x: (b.breite - breite / skala) / 2, y: (b.hoehe - hoehe / skala) / 2,
              w: breite / skala, h: hoehe / skala };
    setze();
  }
  function zoom(faktor, zx, zy) {
    var neu = Math.min(Math.max(sicht.w / faktor, b.breite / 40), b.breite * 4);
    var f = sicht.w / neu;
    sicht = { x: zx - (zx - sicht.x) / f, y: zy - (zy - sicht.y) / f,
              w: sicht.w / f, h: sicht.h / f };
    setze();
  }
  function svgPunkt(cx, cy) {
    var r = svg.getBoundingClientRect();
    return { x: sicht.x + (cx - r.left) / r.width * sicht.w,
             y: sicht.y + (cy - r.top) / r.height * sicht.h };
  }
  /* Auf den nächsten offenen Knoten schwenken, ohne die Zoomstufe zu ändern */
  function zeigeKnoten(id) {
    var k = nach[id];
    if (!k) return;
    sicht.x = k.x + k.breite / 2 - sicht.w / 2;
    sicht.y = k.y + k.hoehe / 2 - sicht.h / 2;
    setze();
  }

  /* Nach einer Antwort den nächsten offenen Knoten ins Bild holen. */
  schwenkZiel[baum.id] = zeigeKnoten;

  svg.addEventListener("wheel", function (e) {
    e.preventDefault();
    var p = svgPunkt(e.clientX, e.clientY);
    zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022)), p.x, p.y);
  }, { passive: false });

  var zeiger = new Map(), letzterAbstand = 0, ziehtVon = null;
  svg.addEventListener("pointerdown", function (e) {
    if (e.target.closest && e.target.closest(".opt")) return;
    svg.setPointerCapture(e.pointerId);
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zeiger.size === 1) ziehtVon = { x: e.clientX, y: e.clientY };
    svg.classList.add("baum--zieht");
  });
  svg.addEventListener("pointermove", function (e) {
    if (!zeiger.has(e.pointerId)) return;
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    var p = Array.from(zeiger.values());
    if (p.length >= 2) {
      var abstand = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (letzterAbstand) {
        var m = svgPunkt((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
        zoom(abstand / letzterAbstand, m.x, m.y);
      }
      letzterAbstand = abstand;
      return;
    }
    if (!ziehtVon) return;
    var r = svg.getBoundingClientRect();
    sicht.x -= (e.clientX - ziehtVon.x) / r.width * sicht.w;
    sicht.y -= (e.clientY - ziehtVon.y) / r.height * sicht.h;
    ziehtVon = { x: e.clientX, y: e.clientY };
    setze();
  });
  function endeZeiger(e) {
    zeiger.delete(e.pointerId);
    if (zeiger.size < 2) letzterAbstand = 0;
    if (!zeiger.size) { ziehtVon = null; svg.classList.remove("baum--zieht"); }
  }
  svg.addEventListener("pointerup", endeZeiger);
  svg.addEventListener("pointercancel", endeZeiger);
  svg.addEventListener("keydown", function (e) {
    var schritt = sicht.w / 12;
    var m = { x: sicht.x + sicht.w / 2, y: sicht.y + sicht.h / 2 };
    if (e.key === "+" || e.key === "=") zoom(1.25, m.x, m.y);
    else if (e.key === "-") zoom(1 / 1.25, m.x, m.y);
    else if (e.key === "0") einpassen();
    else if (e.key === "ArrowLeft") { sicht.x -= schritt; setze(); }
    else if (e.key === "ArrowRight") { sicht.x += schritt; setze(); }
    else if (e.key === "ArrowUp") { sicht.y -= schritt; setze(); }
    else if (e.key === "ArrowDown") { sicht.y += schritt; setze(); }
    else return;
    e.preventDefault();
  });

  w.appendChild(el("div", { class: "baum__leiste" }, [
    el("div", { class: "baum__legende" }, [
      el("span", { class: "legende legende--gegangen", text: "gegangener Pfad" }),
      el("span", { class: "legende legende--moeglich", text: "noch möglich" }),
      el("span", { class: "legende legende--aus", text: "ausgeschlossen" })
    ]),
    el("div", { class: "baum__knoepfe" }, [
      stufe,
      el("button", { class: "zoomknopf", type: "button", text: "−",
        "aria-label": "Herauszoomen",
        onclick: function () { zoom(1 / 1.25, sicht.x + sicht.w / 2, sicht.y + sicht.h / 2); } }),
      el("button", { class: "zoomknopf", type: "button", text: "+",
        "aria-label": "Hineinzoomen",
        onclick: function () { zoom(1.25, sicht.x + sicht.w / 2, sicht.y + sicht.h / 2); } }),
      el("button", { class: "tat", type: "button", text: "einpassen", onclick: einpassen }),
      lauf.aktuell ? el("button", { class: "tat", type: "button",
        text: "zur offenen Frage",
        onclick: function () { zeigeKnoten(lauf.aktuell); } }) : null,
      el("button", { class: "tat", type: "button", text: "als Liste",
        onclick: function () { S.karten[baum.id] = true; zeichne(); } })
    ])
  ]));
  var rahmen = el("div", { class: "baum__rahmen" });
  w.appendChild(rahmen);
  rahmen.appendChild(svg);
  w.appendChild(el("p", { class: "fundstelle", text:
    "Antwortfeld im Knoten anklicken, um den Pfad zu setzen. Mausrad oder Pinch "
    + "zoomt, Ziehen verschiebt; mit Tastatur: Plus, Minus, 0 und Pfeiltasten." }));

  /* Erste Ansicht: lesbar bei der offenen Frage, nicht als unleserliche
     Gesamtschau. Die Übersicht liefert der Knopf "einpassen". */
  function starte() {
    passeHoeheAn();
    var breite = svg.clientWidth || 800, hoehe = svg.clientHeight || 420;
    sicht = { x: 0, y: 0, w: breite, h: hoehe };
    var ziel = lauf.aktuell
      || (lauf.schritte.length ? lauf.schritte[lauf.schritte.length - 1].frage_id : null);
    setze();
    if (ziel) zeigeKnoten(ziel);
    else { sicht.x = 0; sicht.y = (b.hoehe - sicht.h) / 2; setze(); }
  }

  requestAnimationFrame(function () {
    if (sicht) { passeHoeheAn(); setze(); } else { starte(); }
  });
  return w;
}

function zeichneKnoten(k, baum) {
  var warn = (PROFIL.warnungen || {})[k.id];
  var g = svgEl("g", {
    class: "kn kn--" + k.art + " kn--" + k.zustand + (warn ? " kn--warn" : ""),
    transform: "translate(" + k.x + "," + k.y + ")"
  });
  g.appendChild(svgEl("rect", { class: "kn__rahmen", x: 0, y: 0,
    width: k.breite, height: k.hoehe, rx: 2 }));

  var vor = vorbelegung(k.id);
  if (k.art === "frage") {
    g.appendChild(svgEl("text", { class: "kn__id", x: 10, y: 16, text: k.id }));
    if (vor) {
      g.appendChild(svgEl("text", { class: "kn__vorbelegt", x: k.breite - 10, y: 16,
        "text-anchor": "end", text: "vorbelegt" }));
    } else if (warn) {
      g.appendChild(svgEl("text", { class: "kn__vorbelegt", x: k.breite - 10, y: 16,
        "text-anchor": "end", text: "siehe Hinweis" }));
    }
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
    text: kuerze(k.titel, 26) }));

  if (k.art === "frage" && k.optionen && k.optionen.length) {
    var gegeben = S.antworten[k.id] || [];
    var y = oben + k.zeilen.length * 15 + 4;
    k.optionen.forEach(function (o) {
      var gewaehlt = gegeben.indexOf(o.schluessel) >= 0;
      var beschriftung = o.form === "buchstabe"
        ? o.schluessel + ") " + kuerze(o.text, 26) : kuerze(o.schluessel, 30);
      var opt = svgEl("g", {
        class: "opt" + (gewaehlt ? " opt--gewaehlt" : ""),
        tabindex: "0", role: "button",
        "aria-pressed": gewaehlt ? "true" : "false",
        "aria-label": k.id + ", Antwort " + (o.form === "buchstabe" ? o.text : o.schluessel)
      });
      opt.appendChild(svgEl("rect", { class: "opt__rahmen", x: 10, y: y,
        width: k.breite - 20, height: OPT_HOEHE, rx: 2 }));
      opt.appendChild(svgEl("text", { class: "opt__text", x: 16, y: y + 13,
        text: beschriftung }));
      opt.appendChild(svgEl("title", { text: o.form === "buchstabe" ? o.text : o.schluessel }));
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        beantworte(k.id, [o.schluessel], baum.id);
      });
      opt.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault(); beantworte(k.id, [o.schluessel], baum.id);
        }
      });
      opt.addEventListener("focus", function () {
        S.aktiv[baum.id] = k.id;
      });
      g.appendChild(opt);
      y += OPT_ABSTAND;
    });
    g.addEventListener("mouseenter", function () {
      if (S.aktiv[baum.id] !== k.id) {
        S.aktiv[baum.id] = k.id;
        var feld = document.querySelector("#baum-" + baum.id + " .seitenfeld");
        if (feld) {
          var lauf = laufeModul(baum.modul, S.antworten, idx);
          feld.replaceWith(zeichneSeitenfeld(baum, lauf));
        }
      }
    });
  }
  return g;
}

/* ------------------------------------------------ Karten statt Diagramm */
function zeichneKarten(baum, lauf, nurPfad) {
  var b = baueBaum(baum.modul, S.antworten, idx, MASS);
  var w = el("div", { class: "baumbereich" });
  if (nurPfad) {
    w.appendChild(el("h3", { class: "typzeile", text: "Gegangener Pfad" }));
  }
  var liste = el("div", { class: "karten" });
  b.knoten.filter(function (k) {
      return nurPfad ? (k.zustand === "gegangen" || k.zustand === "aktuell")
                     : k.zustand !== "aus";
    })
    .sort(function (x, y) { return x.tiefe - y.tiefe || x.y - y.y; })
    .forEach(function (k) {
      if (k.art !== "frage") {
        liste.appendChild(el("div", { class: "karte karte--" + k.zustand }, [
          el("div", { class: "karte__kopf", text: k.unsicher
            ? "Ergebnis · Einzelfallprüfung empfohlen" : "Ergebnis" }),
          el("div", { class: "karte__ergebnis", text: k.titel })
        ]));
        return;
      }
      var gegeben = S.antworten[k.id] || [];
      var klasse = "karte karte--" + (k.zustand === "aktuell" ? "aktiv" : k.zustand);
      var karte = el("div", { class: klasse }, [
        el("div", { class: "karte__kopf" }, [
          el("span", { text: k.id }),
          vorbelegung(k.id) ? el("span", { text: "vorbelegt" }) : null
        ]),
        el("div", { class: "karte__frage" }, [
          textMitBegriffen(k.frage.frage, k.frage.frage_begriffe)
        ])
      ]);
      var optionen = el("div", { class: "karte__optionen" });
      k.frage.antwortoptionen.forEach(function (o) {
        var gewaehlt = gegeben.indexOf(o.schluessel) >= 0;
        optionen.appendChild(el("button", {
          class: "chip" + (gewaehlt ? " chip--an" : ""), type: "button",
          "aria-pressed": gewaehlt ? "true" : "false",
          text: o.form === "buchstabe" ? o.schluessel + ") " + kuerze(o.text, 60)
                                       : o.schluessel,
          onclick: function () { beantworte(k.id, [o.schluessel], baum.id); }
        }));
      });
      karte.appendChild(optionen);
      liste.appendChild(karte);
    });
  w.appendChild(liste);
  if (!nurPfad) {
    w.appendChild(el("div", { class: "tatleiste" }, [
      el("button", { class: "tat", type: "button", text: "Als Diagramm anzeigen",
        onclick: function () { S.karten[baum.id] = false; zeichne(); } })
    ]));
  }
  return w;
}

/* ------------------------------------------------------ Anforderungszeilen */
var TYP_KUERZEL = {
  "Handlungspflicht": "Handlung", "Informationspflicht": "Information",
  "Unterlassungspflicht": "Unterlassung", "Recht": "Recht", "Ausnahme": "Ausnahme"
};

function zeichneSammelblock(titel, eintraege, einleitung, schluessel) {
  var w = el("section", { class: "abschnitt" });
  var d = el("details", { class: "sammelblock",
    open: S.offen[schluessel] ? "" : null,
    ontoggle: function () {
      if (d.open) S.offen[schluessel] = true; else delete S.offen[schluessel];
    } });
  d.appendChild(el("summary", {}, [
    el("h2", { text: titel }),
    el("span", { class: "modul__zahl", text: anzahlText(eintraege.length) })
  ]));
  var innen = el("div", { class: "sammelblock__inhalt" });
  innen.appendChild(el("p", { class: "lead", text: einleitung }));
  if (!eintraege.length) {
    innen.appendChild(el("p", { class: "lead", text: "Bisher keine." }));
  }
  var alle = eintraege.map(function (e) { return e.req_id; });
  if (eintraege.length) {
    innen.appendChild(el("div", { class: "filter__zeile" }, [
      el("button", { class: "tat", type: "button", text: "alle aufklappen",
        onclick: function () { alle.forEach(function (r) { S.offen[r] = true; }); zeichne(); } }),
      el("button", { class: "tat", type: "button", text: "alle zuklappen",
        onclick: function () { alle.forEach(function (r) { delete S.offen[r]; }); zeichne(); } })
    ]));
  }
  var liste = el("div", { class: "reqliste" });
  eintraege.forEach(function (e) { liste.appendChild(zeichneReqZeile(e)); });
  innen.appendChild(liste);
  d.appendChild(innen);
  w.appendChild(d);
  return w;
}

function antwortText(frageId, schluessel) {
  var f = idx.fragen.get(frageId);
  if (!f) return (schluessel || []).join(", ");
  return (schluessel || []).map(function (s) {
    var o = f.antwortoptionen.filter(function (x) { return x.schluessel === s; })[0];
    return o && o.form === "buchstabe" ? s + ") " + o.text : s;
  }).join(" + ");
}

function zeichneReqZeile(e) {
  var offen = !!S.offen[e.req_id];
  var d = el("details", {
    class: "req" + (e.unsicher ? " req--warn" : "") + (e.verschoben ? " req--spaeter" : ""),
    open: offen ? "" : null,
    ontoggle: function () {
      if (d.open) S.offen[e.req_id] = true; else delete S.offen[e.req_id];
    } });
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
                                  text: "Geltungsbeginn verschoben" }) : null
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
        return b.kommentar || b.mapping_id; }).join(" · ") })
    ]));
  }

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
      return f.datum + " (" + f.fundstelle + ")"; }).join(" · ") }));
  }
  if (detail.childNodes.length) {
    inhalt.appendChild(el("div", { class: "req__block" }, [
      el("h4", { text: "Rechtliche Einordnung" }), detail
    ]));
  }

  var herkunft = el("div", { class: "req__block herkunft" });
  herkunft.appendChild(el("h4", { text: "Herkunft" }));
  e.belege.forEach(function (b) {
    herkunft.appendChild(el("div", { class: "herkunft__zeile" }, [
      el("button", { class: "tat tat--umbruch", type: "button",
        text: "Ausgelöst durch " + b.frage_id + " = "
              + (b.antwort || []).join(" + ") + " →",
        title: "Zum Knoten " + b.frage_id + " springen",
        onclick: function () { springeZuKnoten(b.frage_id); } }),
      el("span", { class: "herkunft__wirkung", text: b.wirkung }),
      el("div", { class: "herkunft__kommentar",
                  text: antwortText(b.frage_id, b.antwort) }),
      b.kommentar ? el("div", { class: "herkunft__kommentar", text: b.kommentar }) : null
    ]));
  });
  inhalt.appendChild(herkunft);
  d.appendChild(inhalt);
  return d;
}

function springeZuKnoten(frageId) {
  var f = idx.fragen.get(frageId);
  if (!f) return;
  var baum = PROFIL.baeume.filter(function (b) { return b.modul === f.modul; })[0];
  if (!baum) {
    /* Frage aus dem Einstieg: dort steht die Vorbelegung */
    var ziel = document.querySelector(".ausgangslage");
    if (ziel) ziel.scrollIntoView({ block: "start" });
    return;
  }
  S.aktiv[baum.id] = frageId;
  zeichne();
  var teil = document.getElementById("baum-" + baum.id);
  if (teil) teil.scrollIntoView({ block: "start" });
  sage("Knoten " + frageId + " in Baum " + baum.titel);
}

/* ------------------------------------------------------ Nicht im Baum */
function zeichneAusserhalb() {
  var d = PROFIL.ausserhalb;
  if (!d || !d.req_ids || !d.req_ids.length) return el("div");
  var eintraege = d.req_ids.map(function (req) {
    var a = idx.anforderungen.get(req) || {};
    var e = idx.ergebnisse.get(req) || {};
    return {
      req_id: req, anforderung: a, ergebnis: e, belege: [],
      kapitel: a.kapitel || "—", typ: a.typ || "—",
      unsicher: istUnsicher(a), verschoben: false, verschiebung: [],
      fristen: (a.stichtage || []).map(function (id) { return idx.frist.get(id); })
                 .filter(Boolean)
    };
  });
  return zeichneSammelblock(d.titel, eintraege, d.text, "__ausserhalb");
}

/* --------------------------------------------------------------- Start */
document.getElementById("marke-firma").textContent = "· " + PROFIL.unternehmen.name;
document.getElementById("fuss-hinweis").textContent = RECHTSHINWEIS;
var quelle = document.getElementById("fuss-quelle");
if (quelle && DATEN.meta) {
  quelle.textContent = "Datenstand: " + DATEN.meta.quelle
    + " · erzeugt " + String(DATEN.meta.erzeugt_am).slice(0, 10);
}

var vorDruck = null;
window.addEventListener("beforeprint", function () {
  vorDruck = Object.assign({}, S.offen);
  var alle = document.querySelectorAll("details");
  for (var i = 0; i < alle.length; i++) alle[i].open = true;
});
window.addEventListener("afterprint", function () {
  if (vorDruck === null) return;
  S.offen = vorDruck; vorDruck = null; zeichne();
});

S.antworten = startAntworten();
var stand = ladeStand();
if (stand && Object.keys(stand).length) {
  S.antworten = bereinigeOhneVorbelegung(Object.assign(S.antworten, stand)).antworten;
}
zeichne();
