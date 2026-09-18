/* Drei Bäume nach dem Ordnungsrahmen der Vorgehensfolie.

   Bewertungsgegenstand -> Anknüpfungspunkt -> Sachverhalt -> Rechtsfolge.
   Spaltennavigation: jede Ebene erscheint neben der vorigen, der ganze Weg
   bleibt sichtbar. Kein Assistent, der Vorheriges versteckt, und kein Raster,
   das alles auf einmal zeigt - man soll sehen, wo man abgebogen ist.

   Gerechnet wird hier nichts: build_data.py hat die Bäume aus den Fundstellen
   der Excel aufgelöst und den Adressaten je Anforderung mit der Rolle des
   Anknüpfungspunkts abgeglichen. */

var D = JSON.parse(document.getElementById("daten").textContent);
var SCHLUESSEL = "data-act-dreiklang/pfad/2";
var S = { baum: null, punkt: null, sv: null };

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

/* ------------------------------------------------------------ Der Pfad */
function baum()  { return D.baeume.filter(function (b) { return b.id === S.baum; })[0] || null; }
function punkt() {
  var b = baum();
  return b ? b.anknuepfungspunkte.filter(function (p) { return p.id === S.punkt; })[0] || null : null;
}
function sachverhalt() {
  var p = punkt();
  return p ? p.sachverhalte.filter(function (x) { return x.id === S.sv; })[0] || null : null;
}

/* Eine Ebene wählen setzt die tieferen zurück - sonst zeigte der Pfad einen
   Weg, den es nicht gibt. */
function waehle(ebene, id) {
  if (ebene === "baum")  { S.baum = S.baum === id ? null : id; S.punkt = null; S.sv = null; }
  if (ebene === "punkt") {
    /* Hat der Baum nur einen Anknüpfungspunkt, ist er automatisch aufgeklappt.
       Ihn dann wegklicken zu können, führt ins Leere. */
    var nurEiner = baum() && baum().anknuepfungspunkte.length === 1;
    S.punkt = (S.punkt === id && !nurEiner) ? null : id;
    S.sv = null;
  }
  if (ebene === "sv")    { S.sv = S.sv === id ? null : id; }

  /* Hat ein Gegenstand nur einen Anknüpfungspunkt, ist die Frage danach keine
     Frage - dann gleich mit aufklappen. */
  var b = baum();
  if (ebene === "baum" && b && b.anknuepfungspunkte.length === 1) {
    S.punkt = b.anknuepfungspunkte[0].id;
  }
  speichere();
  zeichne();
  var s = sachverhalt();
  if (s) {
    sage(baum().gegenstand + ", " + punkt().name + ", " + s.name
         + " ergibt " + kapText(s.kapitel) + " mit "
         + s.zahl.gesamt + " Anforderungen");
  }
}

function speichere() {
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(S)); } catch (e) {}
}
function lade() {
  try {
    var w = JSON.parse(localStorage.getItem(SCHLUESSEL) || "null");
    if (!w) return;
    S.baum = w.baum; S.punkt = w.punkt; S.sv = w.sv;
    if (!baum()) { S.baum = S.punkt = S.sv = null; return; }
    if (!punkt()) { S.punkt = S.sv = null; return; }
    if (!sachverhalt()) S.sv = null;
  } catch (e) {}
}

/* -------------------------------------------------------------- Formel */
function zeichneFormel() {
  var b = baum(), p = punkt(), s = sachverhalt();
  var werte = [b && b.gegenstand, p && p.name, s && s.name, s && kapText(s.kapitel)];
  var zurueck = [
    function () { waehle("baum", S.baum); },
    function () { waehle("punkt", S.punkt); },
    function () { waehle("sv", S.sv); },
    null
  ];
  var formel = el("div", { class: "formel" });
  D.formel.forEach(function (name, i) {
    if (i > 0) {
      formel.appendChild(el("div", { class: "formel__op", "aria-hidden": "true",
                                     text: i === 3 ? "=" : "+" }));
    }
    var gefuellt = !!werte[i];
    var feld = el(gefuellt && zurueck[i] ? "button" : "div", {
      class: "formel__feld" + (i === 3 ? " formel__feld--ziel" : "")
             + (gefuellt ? " formel__feld--voll" : ""),
      type: gefuellt && zurueck[i] ? "button" : null,
      title: gefuellt && zurueck[i] ? "Diese Ebene zurücksetzen" : null,
      onclick: gefuellt && zurueck[i] ? zurueck[i] : null
    }, [
      el("div", { class: "formel__marke", text: name }),
      el("div", { class: "formel__wert" + (gefuellt ? "" : " formel__wert--leer"),
                  text: werte[i] || "—" })
    ]);
    formel.appendChild(feld);
  });
  return formel;
}

/* ------------------------------------------------------------- Spalten */
function spalte(nr, titel, eintraege, aktiv, beiKlick, leerText) {
  var s = el("div", { class: "spalte" + (eintraege.length ? "" : " spalte--leer") }, [
    el("div", { class: "spalte__kopf" }, [
      el("span", { class: "spalte__nr", text: String(nr) }),
      el("span", { text: titel })
    ])
  ]);
  if (!eintraege.length) {
    s.appendChild(el("div", { class: "spalte__leer", text: leerText }));
    return s;
  }
  eintraege.forEach(function (e) {
    var an = aktiv === e.id;
    s.appendChild(el("button", {
      class: "knoten" + (an ? " knoten--an" : ""), type: "button",
      "aria-pressed": an ? "true" : "false",
      onclick: function () { beiKlick(e.id); }
    }, [
      el("span", { class: "knoten__name" }, [
        e.name || e.gegenstand,
        e.ergaenzt ? el("span", { class: "knoten__erg", text: " ⊕",
                                  title: "über die Fundstelle ergänzt, nicht auf der Folie" }) : null
      ]),
      e.kapitel ? el("span", { class: "knoten__kap", text: kapText(e.kapitel) }) : null,
      e.kurz ? el("span", { class: "knoten__kurz", text: e.kurz }) : null,
      e.marke ? el("span", {
        class: "knoten__marke" + (e.marke === "offen" ? " knoten__marke--offen" : ""),
        text: D.unternehmen.name + ": " + (D.marken[e.marke] || e.marke)
      }) : null
    ]));
  });
  return s;
}

function zeichneSpalten() {
  var w = el("div", { class: "spalten" });
  var b = baum(), p = punkt();

  w.appendChild(spalte(1, "Bewertungsgegenstand", D.baeume, S.baum,
    function (id) { waehle("baum", id); }, ""));

  w.appendChild(spalte(2, "Anknüpfungspunkt",
    b ? b.anknuepfungspunkte : [], S.punkt,
    function (id) { waehle("punkt", id); },
    "Wählen Sie links einen Bewertungsgegenstand."));

  w.appendChild(spalte(3, "Sachverhalt",
    p ? p.sachverhalte : [], S.sv,
    function (id) { waehle("sv", id); },
    b ? "Wählen Sie einen Anknüpfungspunkt." : ""));

  return w;
}

/* ------------------------------------------------------------ Ergebnis */
function zeichneErgebnis() {
  var w = el("div", { class: "ergebnis" });
  var s = sachverhalt(), p = punkt();
  if (!s) {
    w.appendChild(el("p", { class: "ergebnis__leer", text:
      "Gehen Sie die drei Ebenen von links nach rechts durch. Am Ende steht die "
      + "Rechtsfolge mit ihren Anforderungen." }));
    return w;
  }

  var n = s.zahl;
  var teile = [];
  if (n.pflicht) teile.push(n.pflicht + (n.pflicht === 1 ? " Pflicht" : " Pflichten"));
  if (n.anspruch) teile.push(n.anspruch
    + (n.anspruch === 1 ? " Anspruch" : " Ansprüche") + " gegen den Anbieter");
  if (n.recht) teile.push(n.recht + (n.recht === 1 ? " Recht" : " Rechte"));
  if (n.ausnahme) teile.push(n.ausnahme + (n.ausnahme === 1 ? " Ausnahme" : " Ausnahmen"));
  if (n.gegenseite) teile.push(n.gegenseite
    + (n.gegenseite === 1 ? " Pflicht der Gegenseite" : " Pflichten der Gegenseite"));

  w.appendChild(el("div", { class: "ergebnis__kopf" }, [
    el("h2", { text: kapText(s.kapitel) + " · " + s.name,
               "data-fokus": true, tabindex: "-1" }),
    el("span", { class: "ergebnis__zahl", text: teile.join(" · ") }),
    el("span", { class: "ergebnis__artikel",
                 text: (s.fundstellen || []).join(", ") })
  ]));

  if (p && p.hinweis) {
    w.appendChild(el("p", { class: "ergebnis__hinweis" + (p.rolle ? "" : " ergebnis__hinweis--warn"),
                            text: p.hinweis }));
  }

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
  w.appendChild(liste);
  return w;
}

/* ---------------------------------------------------------------- Seite */
function kopf() {
  return el("header", { class: "kopf" }, [
    el("h1", { text: D.titel }),
    el("div", { class: "kopf__zeile",
                text: D.unternehmen.name + " · " + D.unternehmen.kurz }),
    el("div", { class: "kopf__hinweis",
                text: "Strukturierte Orientierung nach VO (EU) 2023/2854 · "
                      + "keine Rechtsberatung · Rechtsstand 18.09.2026" })
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
  f.appendChild(el("span", { class: "fuss__stand", text: RECHTSSTAND }));
  f.appendChild(el("span", { text: "Läuft vollständig lokal: kein Netzwerkaufruf, "
                                 + "kein Tracking." }));
  f.appendChild(el("button", { class: "tat", type: "button", text: "Drucken / PDF",
                               onclick: function () { window.print(); } }));
  return f;
}

function zeichne() {
  var seite = document.getElementById("seite");
  var scroll = window.scrollY;
  leere(seite);
  seite.appendChild(kopf());
  seite.appendChild(zeichneFormel());
  seite.appendChild(zeichneSpalten());
  seite.appendChild(zeichneErgebnis());
  seite.appendChild(fuss());
  window.scrollTo(0, scroll);
}

(function start() {
  lade();
  var vorDruck = null;
  window.addEventListener("beforeprint", function () {
    /* Im Druck alle Blätter aller drei Bäume nacheinander. */
    vorDruck = { baum: S.baum, punkt: S.punkt, sv: S.sv };
    var seite = document.getElementById("seite");
    leere(seite);
    seite.appendChild(kopf());
    D.baeume.forEach(function (b) {
      S.baum = b.id;
      b.anknuepfungspunkte.forEach(function (p) {
        S.punkt = p.id;
        p.sachverhalte.forEach(function (sv) {
          S.sv = sv.id;
          seite.appendChild(zeichneFormel());
          seite.appendChild(zeichneErgebnis());
        });
      });
    });
    seite.appendChild(fuss());
  });
  window.addEventListener("afterprint", function () {
    if (vorDruck) { S.baum = vorDruck.baum; S.punkt = vorDruck.punkt; S.sv = vorDruck.sv; }
    zeichne();
  });
  zeichne();
})();
