/* Drei senkrechte Entscheidungsbäume nach dem Ordnungsrahmen der Folie.

   Bewertungsgegenstand -> Anknüpfungspunkt -> Sachverhalt -> Rechtsfolge.

   Alle drei Bäume stehen vollständig auf der Seite: Wurzel, Gabelfrage, beide
   Äste, jeder Sachverhalt an seinem Strang. Nichts klappt zu - man soll die
   Verzweigung sehen, nicht sich durch sie hindurchklicken. Beweglich ist nur
   die Anforderungsliste am einzelnen Sachverhalt, und die auch nur, weil 128
   Zeilen auf einmal die Bäume unlesbar machen würden.

   Gerechnet wird hier nichts: build_data.py hat die Bäume über die Fundstellen
   aufgelöst, den Adressaten je Anforderung mit der Rolle des Anknüpfungspunkts
   abgeglichen und die Fragetexte wortgetreu aus dem Blatt "Fragen" eingesetzt. */

var D = JSON.parse(document.getElementById("daten").textContent);
var SCHLUESSEL = "data-act-dreiklang/offen/3";
var OFFEN = {};          /* baumId/punktId/svId -> true */

var RECHTSSTAND = "Rechtsstand: 18. September 2026. Geprüft wird ausschließlich "
  + "die Verordnung (EU) 2023/2854. Die deutsche Umsetzung "
  + "(Data-Act-Durchführungsgesetz, in Kraft seit 30.05.2026) bildet diese "
  + "Übersicht nicht ab; zuständige Behörde ist die Bundesnetzagentur. Das "
  + "Verfahren zum Digital Omnibus ist nicht abgeschlossen.";

var TYP_KURZ = {
  "Handlungspflicht": "Handlung", "Informationspflicht": "Information",
  "Unterlassungspflicht": "Unterlassung", "Recht": "Recht", "Ausnahme": "Ausnahme"
};

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
function leere(n) { while (n.firstChild) n.removeChild(n.firstChild); }
function sage(t) { document.getElementById("live").textContent = t; }
function kapText(l) { return "Kap. " + (l || []).join(" + "); }
function pfad(b, p, s) { return b.id + "/" + p.id + "/" + s.id; }

function alleBlaetter() {
  var aus = [];
  D.baeume.forEach(function (b) {
    b.anknuepfungspunkte.forEach(function (p) {
      p.sachverhalte.forEach(function (s) { aus.push([b, p, s]); });
    });
  });
  return aus;
}

/* Die Rechtsfolge in Worten - je nachdem, ob der Anknüpfungspunkt die
   Anforderung selbst trifft, sie gegen die Gegenseite gibt oder keines. */
function folgeText(p, s) {
  var n = s.zahl, teile = [];
  if (n.pflicht) teile.push(n.pflicht + (n.pflicht === 1 ? " Pflicht" : " Pflichten"));
  if (n.anspruch) teile.push(n.anspruch + (n.anspruch === 1 ? " Anspruch" : " Ansprüche")
    + " gegen " + (p.anspruch_gegen ? "den " + kurzRolle(p.anspruch_gegen) : "die Gegenseite"));
  if (n.recht) teile.push(n.recht + (n.recht === 1 ? " Recht" : " Rechte"));
  if (n.ausnahme) teile.push(n.ausnahme + (n.ausnahme === 1 ? " Ausnahme" : " Ausnahmen"));
  if (n.gegenseite) teile.push(n.gegenseite
    + (n.gegenseite === 1 ? " Pflicht der Gegenseite" : " Pflichten der Gegenseite"));
  return teile.join(" · ");
}
function kurzRolle(r) {
  return r.replace(/^Anbieter von Datenverarbeitungsdienst.*$/, "Anbieter");
}

/* --------------------------------------------------------------- Speicher */
function speichere() {
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(OFFEN)); } catch (e) {}
}
function lade() {
  try {
    var w = JSON.parse(localStorage.getItem(SCHLUESSEL) || "null");
    if (!w || typeof w !== "object") return;
    /* Nur Pfade übernehmen, die es noch gibt - sonst hinge ein alter Stand. */
    var gueltig = {};
    alleBlaetter().forEach(function (t) {
      var k = pfad(t[0], t[1], t[2]);
      if (w[k]) gueltig[k] = true;
    });
    OFFEN = gueltig;
  } catch (e) {}
}

function schalte(b, p, s) {
  var k = pfad(b, p, s);
  if (OFFEN[k]) delete OFFEN[k]; else OFFEN[k] = true;
  speichere();
  zeichne();
  sage(s.name + (OFFEN[k] ? ": " + s.zahl.gesamt + " Anforderungen eingeblendet"
                          : ": Liste zugeklappt"));
}

/* ------------------------------------------------------------- Ein Blatt */
function zeichneBlatt(b, p, s) {
  var auf = !!OFFEN[pfad(b, p, s)];
  var anspruch = !!s.zahl.anspruch && !s.zahl.pflicht;

  var frage = el("div", { class: "blatt__frage" }, [
    el("span", { class: "blatt__fid", text: "Frage " + s.frage.id + " · " }),
    s.frage.text + " ",
    el("span", { class: "blatt__antwort", text: s.frage.antwort.schluessel === s.frage.antwort.text
        ? s.frage.antwort.text
        : s.frage.antwort.schluessel + " — " + s.frage.antwort.text }),
    s.frage_hinweis ? el("span", { class: "blatt__warn", text: s.frage_hinweis }) : null
  ]);

  var knopf = el("button", {
    class: "knoten" + (auf ? " knoten--auf" : "") + (anspruch ? " knoten--anspruch" : ""),
    type: "button", "aria-expanded": auf ? "true" : "false",
    onclick: function () { schalte(b, p, s); }
  }, [
    el("span", { class: "knoten__zeile" }, [
      el("span", { class: "knoten__name" }, [
        s.name,
        s.ergaenzt ? el("span", { class: "knoten__erg", text: " ⊕",
          title: "über die Fundstelle ergänzt, nicht auf der Folie" }) : null
      ]),
      el("span", { class: "knoten__kap", text: "→ " + kapText(s.kapitel) }),
      el("span", { class: "knoten__pfeil", text: auf ? "▾ zuklappen" : "▸ Anforderungen" })
    ]),
    el("span", { class: "knoten__zahl" }, [
      folgeText(p, s) + " · ",
      el("span", { class: "knoten__art", text: (s.fundstellen || []).join(", ") })
    ])
  ]);

  var blatt = el("div", { class: "blatt" }, [frage, knopf]);
  if (auf) blatt.appendChild(zeichneListe(s));
  return blatt;
}

function zeichneListe(s) {
  var liste = el("div", { class: "liste" });
  s.anforderungen.forEach(function (e) {
    liste.appendChild(el("div", { class: "req"
      + (e.eigen ? "" : (e.anspruch ? " req--anspruch" : " req--fremd")) }, [
      el("span", { class: "req__id", text: e.id }),
      el("span", { class: "req__stelle", text: e.fundstelle }),
      el("span", { class: "req__titel", text: e.titel }),
      el("span", { class: "req__adressat", text: e.adressat }),
      el("span", { class: "req__typ", text: TYP_KURZ[e.typ] || e.typ })
    ]));
  });
  return liste;
}

/* --------------------------------------------------------------- Ein Ast */
function zeichneAst(b, p) {
  var anspruch = !p.rolle && !!p.anspruch_gegen;
  var anker = el("div", { class: "anker" + (anspruch ? " anker--anspruch" : "") }, [
    el("span", { class: "anker__zeile" }, [
      p.antwort ? el("span", { class: "anker__taste", text: p.antwort.schluessel }) : null,
      el("span", { class: "anker__name", text: p.name })
    ]),
    p.antwort ? el("span", { class: "anker__opt", text: "„" + p.antwort.text + "“" }) : null,
    p.hinweis ? el("span", { class: "anker__hinweis", text: p.hinweis }) : null
  ]);

  var blaetter = el("div", { class: "blaetter" });
  p.sachverhalte.forEach(function (s) { blaetter.appendChild(zeichneBlatt(b, p, s)); });

  return el("div", { class: "ast" }, [anker, blaetter]);
}

/* -------------------------------------------------------------- Ein Baum */
function zeichneBaum(b, nr) {
  var wurzel = el("div", { class: "wurzel" }, [
    el("span", { class: "wurzel__marke",
                 text: D.formel[0] + " " + nr + " von " + D.baeume.length }),
    el("h2", { text: b.gegenstand }),
    b.kurz ? el("p", { class: "wurzel__kurz", text: b.kurz }) : null,
    b.marke ? el("span", { class: "wurzel__marke--firma wurzel__marke--" + b.marke,
                           title: b.grund || null,
                           text: D.unternehmen.name + ": " + (D.marken[b.marke] || b.marke) }) : null,
    b.voraussetzung ? el("p", { class: "wurzel__vor",
      text: "Voraussetzung — Frage " + b.voraussetzung.id + ": "
            + b.voraussetzung.text + " → " + b.voraussetzung.antwort.text }) : null
  ]);

  var gabel = b.gabel ? el("div", { class: "gabel" }, [
    el("span", { class: "gabel__id", text: "Frage " + b.gabel.id }),
    el("span", { class: "gabel__text", text: b.gabel.text })
  ]) : null;

  var aeste = el("div", { class: "aeste" });
  b.anknuepfungspunkte.forEach(function (p) { aeste.appendChild(zeichneAst(b, p)); });

  return el("section", { class: "baum", "aria-label": D.formel[0] + ": " + b.gegenstand },
            [wurzel, gabel, aeste]);
}

/* ---------------------------------------------------------------- Seite */
function kopf() {
  return el("header", { class: "kopf" }, [
    el("h1", { text: D.titel }),
    el("div", { class: "kopf__zeile",
                text: D.unternehmen.name + " · " + D.unternehmen.kurz }),
    el("div", { class: "kopf__hinweis",
                text: D.formel.join(" + ").replace(/ \+ ([^+]*)$/, " = $1")
                      + " · Strukturierte Orientierung nach VO (EU) 2023/2854 · "
                      + "keine Rechtsberatung · Rechtsstand 18.09.2026" })
  ]);
}

function steuer() {
  var alle = alleBlaetter();
  var offenZahl = alle.filter(function (t) { return OFFEN[pfad(t[0], t[1], t[2])]; }).length;
  var alleAuf = offenZahl === alle.length;
  return el("div", { class: "steuer" }, [
    el("button", { class: "tat", type: "button",
      text: alleAuf ? "Alle Anforderungen verbergen" : "Alle Anforderungen zeigen",
      onclick: function () {
        OFFEN = {};
        if (!alleAuf) alle.forEach(function (t) { OFFEN[pfad(t[0], t[1], t[2])] = true; });
        speichere(); zeichne();
        sage(alleAuf ? "alle Listen zugeklappt" : "alle Listen eingeblendet");
      } }),
    el("button", { class: "tat", type: "button", text: "Drucken / PDF",
                   onclick: function () { window.print(); } }),
    el("span", { class: "steuer__hinweis",
      text: D.baeume.length + " Bäume · " + alle.length + " Sachverhalte · "
            + alle.reduce(function (n, t) { return n + t[2].zahl.gesamt; }, 0)
            + " Anforderungszeilen" })
  ]);
}

function fuss() {
  var f = el("footer", { class: "fuss" });
  if (D.nicht_abgedeckt) {
    f.appendChild(el("div", { class: "fuss__luecke" }, [
      el("b", { text: D.nicht_abgedeckt.titel + ": " }),
      D.nicht_abgedeckt.text
    ]));
  }
  f.appendChild(el("span", { text: "Die Fragen stehen wortgetreu im Fragenkatalog. "
    + "Welche Anforderungen ein Sachverhalt auslöst, entscheidet seine Fundstelle "
    + "im Verordnungstext — nicht der Fragebogenpfad." }));
  f.appendChild(el("span", { class: "fuss__stand", text: RECHTSSTAND }));
  f.appendChild(el("span", { text: "Läuft vollständig lokal: kein Netzwerkaufruf, "
                                 + "kein Tracking." }));
  return f;
}

function zeichne() {
  var seite = document.getElementById("seite");
  var scroll = window.scrollY;
  leere(seite);
  seite.appendChild(kopf());
  seite.appendChild(steuer());
  D.baeume.forEach(function (b, i) { seite.appendChild(zeichneBaum(b, i + 1)); });
  seite.appendChild(fuss());
  window.scrollTo(0, scroll);
}

(function start() {
  lade();
  var vorDruck = null;
  window.addEventListener("beforeprint", function () {
    /* Auf Papier gibt es kein Aufklappen - dort steht alles. */
    vorDruck = OFFEN;
    OFFEN = {};
    alleBlaetter().forEach(function (t) { OFFEN[pfad(t[0], t[1], t[2])] = true; });
    zeichne();
  });
  window.addEventListener("afterprint", function () {
    if (vorDruck) { OFFEN = vorDruck; vorDruck = null; zeichne(); }
  });
  zeichne();
})();
