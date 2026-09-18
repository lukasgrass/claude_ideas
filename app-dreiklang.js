/* Die Vorgehensfolie als klickbare Karte.

   Bewertungsgegenstand + Anknüpfungspunkt + Sachverhalt = Rechtsfolge.
   Alle sieben Zeilen sind gleichzeitig sichtbar - das ist der Wert der Folie
   und der Grund, keinen Assistenten zu bauen. Ein Klick füllt die Gleichung
   und öffnet die Anforderungen darunter.

   Die Zuordnung Zeile -> Anforderungen hat build_data.py aus dem Mapping der
   Excel aufgelöst; hier wird nichts mehr gerechnet, nur gezeigt. */

var D = JSON.parse(document.getElementById("daten").textContent);
var SCHLUESSEL = "data-act-dreiklang/auswahl/1";
var S = { gewaehlt: null };

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
function kapText(liste) { return "Kap. " + (liste || []).join(" + "); }

function zeile(id) {
  return D.zeilen.filter(function (z) { return z.id === id; })[0] || null;
}

/* Merkt sich die zuletzt geöffnete Zeile - reiner Komfort. */
function speichere() {
  try { localStorage.setItem(SCHLUESSEL, S.gewaehlt || ""); } catch (e) {}
}
function lade() {
  try {
    var w = localStorage.getItem(SCHLUESSEL);
    return w && zeile(w) ? w : null;
  } catch (e) { return null; }
}

/* ---------------------------------------------------------------- Formel */
function zeichneFormel() {
  var z = S.gewaehlt ? zeile(S.gewaehlt) : null;
  var werte = z ? [z.gegenstand, z.anknuepfung, z.sachverhalt, kapText(z.kapitel)]
                : [null, null, null, null];
  var formel = el("div", { class: "formel" });
  D.formel.forEach(function (name, i) {
    if (i > 0) {
      formel.appendChild(el("div", { class: "formel__op",
                                     text: i === 3 ? "=" : "+", "aria-hidden": "true" }));
    }
    formel.appendChild(el("div", {
      class: "formel__feld" + (i === 3 ? " formel__feld--ziel" : "")
    }, [
      el("div", { class: "formel__marke", text: name }),
      el("div", { class: "formel__wert" + (werte[i] ? "" : " formel__wert--leer"),
                  text: werte[i] || "—" })
    ]));
  });
  return formel;
}

/* ------------------------------------------------------- Die drei Spalten */
function zeichneGegenstaende() {
  var behaelter = el("div", { class: "gegenstaende" });
  var reihenfolge = [];
  D.zeilen.forEach(function (z) {
    if (reihenfolge.indexOf(z.gegenstand) < 0) reihenfolge.push(z.gegenstand);
  });

  reihenfolge.forEach(function (gegenstand) {
    var spalte = el("div", { class: "gegenstand" }, [
      el("div", { class: "gegenstand__kopf", text: gegenstand })
    ]);
    var ankReihenfolge = [];
    D.zeilen.forEach(function (z) {
      if (z.gegenstand === gegenstand && ankReihenfolge.indexOf(z.anknuepfung) < 0) {
        ankReihenfolge.push(z.anknuepfung);
      }
    });

    ankReihenfolge.forEach(function (ank) {
      var block = el("div", { class: "anknuepfung" }, [
        el("div", { class: "anknuepfung__name", text: ank })
      ]);
      D.zeilen.filter(function (z) {
        return z.gegenstand === gegenstand && z.anknuepfung === ank;
      }).forEach(function (z) {
        var an = S.gewaehlt === z.id;
        var marke = D.marken[z.marke] || z.marke;
        block.appendChild(el("button", {
          class: "sv" + (an ? " sv--an" : ""), type: "button",
          "aria-pressed": an ? "true" : "false",
          onclick: function () { waehle(z.id); }
        }, [
          el("span", { class: "sv__name", text: z.sachverhalt }),
          el("span", { class: "sv__kap", text: kapText(z.kapitel) }),
          el("span", {
            class: "sv__marke" + (z.marke === "offen" ? " sv__marke--offen" : ""),
            text: D.unternehmen.name + ": " + marke
          })
        ]));
      });
      spalte.appendChild(block);
    });
    behaelter.appendChild(spalte);
  });
  return behaelter;
}

/* -------------------------------------------------------------- Ergebnis */
function zeichneErgebnis() {
  var w = el("div", { class: "ergebnis", id: "ergebnis" });
  if (!S.gewaehlt) {
    w.appendChild(el("p", { class: "ergebnis__leer", text:
      "Wählen Sie oben einen Sachverhalt. Die Gleichung füllt sich, und die "
      + "Anforderungen der Rechtsfolge erscheinen hier." }));
    return w;
  }
  var z = zeile(S.gewaehlt);
  var n = z.zahl;
  var teile = [n.pflicht + (n.pflicht === 1 ? " Pflicht" : " Pflichten")];
  if (n.recht) teile.push(n.recht + (n.recht === 1 ? " Recht" : " Rechte"));
  if (n.ausnahme) teile.push(n.ausnahme + (n.ausnahme === 1 ? " Ausnahme" : " Ausnahmen"));

  w.appendChild(el("div", { class: "ergebnis__kopf" }, [
    el("h2", { text: kapText(z.kapitel) + " · " + z.sachverhalt,
               "data-fokus": true, tabindex: "-1" }),
    el("span", { class: "ergebnis__zahl" }, [
      el("b", { text: String(n.gesamt) }), " Anforderungen — " + teile.join(" · ")
    ])
  ]));

  w.appendChild(el("p", { class: "ergebnis__grund",
                          text: D.unternehmen.name + ": "
                                + (D.marken[z.marke] || z.marke) + " — " + z.grund }));

  if (z.abweichung) {
    w.appendChild(el("div", { class: "ergebnis__abweichung" }, [
      el("b", { text: "Abweichung zur Folie: " }), z.abweichung
    ]));
  }

  /* Randtreffer aus anderen Kapiteln ehrlich ausweisen, ohne die Rechtsfolge
     zu verwässern. */
  if (z.neben && z.neben.length) {
    w.appendChild(el("p", { class: "ergebnis__neben",
      text: "Zusätzlich berührt: "
            + z.neben.map(function (n) {
                return "Kap. " + n.kapitel + " (" + n.zahl + ")";
              }).join(", ") }));
  }

  /* Nach Kapitel gruppiert, damit die Spannweite sichtbar bleibt */
  var liste = el("div", { class: "liste" });
  var alleKapitel = z.kapitel.concat((z.neben || []).map(function (n) { return n.kapitel; }));
  alleKapitel.forEach(function (kap) {
    var drin = z.anforderungen.filter(function (e) { return e.kapitel === kap; });
    if (alleKapitel.length > 1) {
      liste.appendChild(el("div", { class: "kapitelband",
        text: "Kapitel " + kap + " — " + drin.length
              + (drin.length === 1 ? " Anforderung" : " Anforderungen") }));
    }
    drin.forEach(function (e) {
      liste.appendChild(el("div", { class: "req" }, [
        el("span", { class: "req__id", text: e.id }),
        el("span", { class: "req__stelle", text: e.fundstelle }),
        el("span", { class: "req__titel", text: e.titel }),
        el("span", { class: "req__typ", text: TYP_KURZ[e.typ] || e.typ })
      ]));
    });
  });
  w.appendChild(liste);
  return w;
}

function waehle(id) {
  S.gewaehlt = S.gewaehlt === id ? null : id;
  speichere();
  zeichne();
  if (S.gewaehlt) {
    var z = zeile(S.gewaehlt);
    sage(z.gegenstand + " · " + z.anknuepfung + " · " + z.sachverhalt
         + " ergibt " + kapText(z.kapitel) + " mit "
         + z.zahl.gesamt + " Anforderungen");
    var ziel = document.querySelector("[data-fokus]");
    if (ziel) ziel.focus({ preventScroll: true });
  }
}

/* ----------------------------------------------------------------- Seite */
function zeichne() {
  var seite = document.getElementById("seite");
  var scroll = window.scrollY;
  leere(seite);

  seite.appendChild(el("header", { class: "kopf" }, [
    el("h1", { text: D.titel }),
    el("div", { class: "kopf__zeile",
                text: D.unternehmen.name + " · " + D.unternehmen.kurz }),
    el("div", { class: "kopf__hinweis",
                text: "Strukturierte Orientierung nach VO (EU) 2023/2854 · "
                      + "keine Rechtsberatung · Rechtsstand 18.09.2026" })
  ]));
  seite.appendChild(zeichneFormel());
  seite.appendChild(zeichneGegenstaende());
  seite.appendChild(zeichneErgebnis());
  seite.appendChild(el("footer", { class: "fuss" }, [
    el("span", { text: "Die Zuordnung der Anforderungen stammt aus dem "
                     + "Anforderungskatalog; der Dreiklang ist der "
                     + "Ordnungsrahmen der Vorgehensfolie." }),
    el("span", { class: "fuss__stand", text: RECHTSSTAND }),
    el("span", { text: "Läuft vollständig lokal: kein Netzwerkaufruf, kein Tracking." }),
    el("button", { class: "tat", type: "button", text: "Drucken / PDF",
                   onclick: function () { window.print(); } })
  ]));
  window.scrollTo(0, scroll);
}

(function start() {
  S.gewaehlt = lade();
  var vorDruck = null;
  window.addEventListener("beforeprint", function () {
    /* Im Druck sollen alle sieben Zeilen mit ihren Listen erscheinen. */
    vorDruck = S.gewaehlt;
    var seite = document.getElementById("seite");
    leere(seite);
    seite.appendChild(el("header", { class: "kopf" }, [
      el("h1", { text: D.titel }),
      el("div", { class: "kopf__zeile",
                  text: D.unternehmen.name + " · " + D.unternehmen.kurz }),
      el("div", { class: "kopf__hinweis",
                  text: "Strukturierte Orientierung nach VO (EU) 2023/2854 · "
                        + "keine Rechtsberatung · Rechtsstand 18.09.2026" })
    ]));
    D.zeilen.forEach(function (z) {
      S.gewaehlt = z.id;
      seite.appendChild(zeichneFormel());
      seite.appendChild(zeichneErgebnis());
    });
    seite.appendChild(el("footer", { class: "fuss" }, [
      el("span", { class: "fuss__stand", text: RECHTSSTAND })
    ]));
  });
  window.addEventListener("afterprint", function () {
    S.gewaehlt = vorDruck; zeichne();
  });
  zeichne();
})();
