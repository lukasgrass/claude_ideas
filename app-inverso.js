/* Betroffenheitsanalyse in fünf Stufen, senkrecht.

   Kein eigener IIFE-Rumpf: build_data.py kapselt diese Datei gemeinsam mit der
   Ablauflogik aus app.js (Block zwischen den ENGINE-Marken). Alle Funktionen
   des Motors stehen hier zur Verfügung - zustandAus, laufeModul, baueErgebnis,
   bereinige - es gibt keine zweite Auswertung. */

var DATEN = JSON.parse(document.getElementById("daten").textContent);
var PROFIL = DATEN.profil;
var MODELL = PROFIL.vorgehensmodell;
var idx = baueIndex(DATEN);
var SCHLUESSEL = "data-act-inverso/stand/2";

var S = { antworten: {}, offen: {}, entwurf: {}, meldung: null,
          naechste: null };

function praemissen() { return Object.keys(PROFIL.vorbelegt || {}); }
function vorbelegung(fid) { return (PROFIL.vorbelegt || {})[fid] || null; }

function startAntworten() {
  var a = {};
  praemissen().forEach(function (fid) {
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
function leere(n) { while (n.firstChild) n.removeChild(n.firstChild); }
function sage(t) { document.getElementById("live").textContent = t; }
function anzahlText(n) { return n === 1 ? "1 Anforderung" : n + " Anforderungen"; }
function kurz(t, n) {
  if (!t) return "";
  if (t.length <= n) return t;
  var k = t.slice(0, n - 1).replace(/\s+\S*$/, "");
  /* An der Wortgrenze zu kürzen kann alles wegnehmen ("Nein, Einzelunter-
     nehmen/natürliche Person" wurde zu "Nein,"). Dann lieber hart schneiden. */
  if (k.length < n / 2) k = t.slice(0, n - 1);
  return k + "…";
}

/* -------------------------------------------------------------- Speicher */
function speichere() {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify({ v: 2, antworten: S.antworten }));
  } catch (e) { /* Komfort, kein Muss */ }
}
function ladeStand() {
  try {
    var d = JSON.parse(localStorage.getItem(SCHLUESSEL) || "null");
    if (!d || d.v !== 2 || !d.antworten) return null;
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
function schliesseErkl(v) {
  clearTimeout(panelTimer);
  panelTimer = setTimeout(function () {
    if (!panel) return;
    panel.hidden = true;
    if (panelAuslöser) panelAuslöser.removeAttribute("aria-describedby");
    panelAuslöser = null;
  }, v || 0);
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
function haengeErklAn(knoten, bauen) {
  if (!knoten.hasAttribute("tabindex")) knoten.setAttribute("tabindex", "0");
  var auf = function () { zeigeErkl(knoten, bauen()); };
  knoten.addEventListener("mouseenter", auf);
  knoten.addEventListener("focus", auf);
  knoten.addEventListener("mouseleave", function () { schliesseErkl(200); });
  knoten.addEventListener("blur", function () { schliesseErkl(0); });
  knoten.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { schliesseErkl(0); knoten.blur(); }
  });
  return knoten;
}
function erklBegriff(name) {
  var b = idx.begriffe.get(name);
  if (!b) return [el("div", { text: name })];
  var aus = [el("div", { class: "erkl__kopf", text: b.begriff }),
             el("div", { class: "erkl__quelle", text: b.fundstelle }),
             el("p", { text: b.definition })];
  if (b.abgrenzung && b.abgrenzung !== "—") {
    aus.push(el("div", { class: "erkl__zeile" }, [
      el("b", { text: "Abgrenzung: " }), b.abgrenzung]));
  }
  return aus;
}
function erklFrage(f) {
  var aus = [el("div", { class: "erkl__kopf", text: f.id }),
             el("p", {}, [textMitBegriffen(f.frage, f.frage_begriffe)])];
  /* Bei Buchstabenoptionen steht am Chip nur eine gekürzte Beschriftung -
     hier der volle Wortlaut, die gewählte Antwort hervorgehoben. */
  if (f.antwortoptionen.some(function (o) { return o.form === "buchstabe"; })) {
    var gewaehlt = S.antworten[f.id] || [];
    var liste = el("dl", { class: "erkl__optionen" });
    f.antwortoptionen.forEach(function (o) {
      var an = gewaehlt.indexOf(o.schluessel) >= 0;
      liste.appendChild(el("dt", { class: an ? "erkl__gewaehlt" : null,
                                   text: o.schluessel }));
      liste.appendChild(el("dd", { class: an ? "erkl__gewaehlt" : null,
                                   text: o.text }));
    });
    aus.push(liste);
  }
  if (f.erklaertext) {
    aus.push(el("div", { class: "erkl__zeile" }, [
      textMitBegriffen(kurz(f.erklaertext, 340), f.erklaertext_begriffe)]));
  }
  if (f.rechtsgrundlage) {
    aus.push(el("div", { class: "erkl__zeile" }, [
      el("b", { text: "Rechtsgrundlage: " }), f.rechtsgrundlage]));
  }
  var w = (PROFIL.warnungen || {})[f.id];
  if (w) aus.push(el("div", { class: "erkl__zeile" }, [el("b", { text: "Hinweis: " }), w]));
  var v = vorbelegung(f.id);
  if (v) aus.push(el("div", { class: "erkl__zeile" }, [
    el("b", { text: "Vorbelegt: " }), v.grund]));
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
    if (s.start >= text.length) return;
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
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") schliesseErkl(0);
});
window.addEventListener("scroll", function () { schliesseErkl(0); }, true);

/* =================================================================
   Auswertung: welcher Strang trägt welche Anforderung
   ================================================================= */

function strangFragen(strang) {
  return new Set(strang.fragen);
}

function auswertung() {
  var erg = baueErgebnis(S.antworten, idx, praemissen());
  var faecher = { grundlagen: [] };
  MODELL.straenge.forEach(function (s) { faecher[s.id] = []; });

  /* Erst die Stränge, dann das Auffangfach: Anforderungen, die kein Strang
     beansprucht (die Rollen aus dem Einstieg, die Ausnahmefragen VI-01 bis
     VI-03) gehören in die Grundlagen. Sonst fielen sie aus dem Bild, ohne
     dass es auffällt. */
  erg.ausgeloest.concat(erg.ausgeschlossen, erg.eingeschraenkt).forEach(function (e) {
    var getroffen = false;
    MODELL.straenge.forEach(function (s) {
      var menge = strangFragen(s);
      if (e.belege.some(function (b) { return menge.has(b.frage_id); })) {
        faecher[s.id].push(e);
        getroffen = true;
      }
    });
    if (!getroffen) faecher.grundlagen.push(e);
  });

  /* Anforderungen, die in mehr als einem Strang auftauchen */
  var zaehler = {};
  MODELL.straenge.forEach(function (s) {
    faecher[s.id].forEach(function (e) {
      (zaehler[e.req_id] = zaehler[e.req_id] || []).push(s.id);
    });
  });
  erg.faecher = faecher;
  erg.mehrfach = zaehler;
  return erg;
}

function nurAusgeloest(liste) {
  return liste.filter(function (e) { return e.rang === 2 || e.rang === 3; });
}

/* ------------------------------------------------------------- Antworten */
function beantworte(frageId, schluessel) {
  var neu = Object.assign({}, S.antworten);
  neu[frageId] = schluessel;
  var b = bereinige(neu, idx, praemissen());
  S.antworten = b.antworten;
  if (b.entfernt.length) {
    S.meldung = b.entfernt.length + " Folgeantwort"
      + (b.entfernt.length === 1 ? " wurde" : "en wurden") + " zurückgesetzt: "
      + b.entfernt.map(function (e) { return e.frage_id; }).join(", ");
    sage(S.meldung);
  } else {
    S.meldung = null;
  }
  speichere();
  zeichne();
}

/* =================================================================
   Zeichnen

   Das Bild folgt der Entscheidungslogik: oben die Ausgangslage mit der
   Rollenfrage, daneben was dadurch entfällt, dann was unabhängig vom Pfad
   gilt, darunter je Anknüpfungspunkt ein Block mit seinen Strängen. Ein
   Strang läuft ohne Unterbrechung von seiner ersten Frage bis zu seinen
   Anforderungen. Die fünf Schritte der Vorgehensfolie laufen als Leiste am
   linken Rand mit - Orientierung, keine Gliederung.
   ================================================================= */

/* Kapitel je Modul, aus den Anknüpfungspunkten des Modells */
function kapitelVonModul(modulId) {
  var a = MODELL.anknuepfungspunkte.filter(function (x) { return x.modul === modulId; })[0];
  return a ? a.kapitel : "";
}

/* Gilt ein Modul nach der Startbedingung der Excel? */
function modulGilt(modulId) {
  var m = idx.module.filter(function (x) { return x.modul === modulId; })[0];
  if (!m) return false;
  return modulAnwendbar(m, zustandAus(S.antworten, idx), S.antworten);
}

/* Die nächste offene Frage über alle geltenden Module - das ist der eine
   Punkt, an dem es weitergeht. */
function naechsteFrage() {
  for (var i = 0; i < idx.module.length; i++) {
    var m = idx.module[i];
    if (m.modul === "Ergebnis") continue;
    if (!modulGilt(m.modul)) continue;
    var lauf = laufeModul(m.modul, S.antworten, idx);
    if (lauf.aktuell) return { frage: lauf.aktuell, modul: m.modul };
  }
  return null;
}

function zeichne() {
  var fluss = document.getElementById("fluss");
  var scroll = window.scrollY;
  leere(fluss);

  var erg = auswertung();
  S.naechste = naechsteFrage();
  fluss.appendChild(zeichneKopfzeile(erg));
  fluss.appendChild(marke(1));
  fluss.appendChild(zeichneAusgangslage());
  fluss.appendChild(marke(2));
  fluss.appendChild(zeichneAusschluesse());
  fluss.appendChild(zeichneGrundlagen(erg));
  fluss.appendChild(zeichneGitter(erg));
  fluss.appendChild(zeichneFusszeile());

  window.scrollTo(0, scroll);
  requestAnimationFrame(setzeSchritt);
}

/* Leere Marke: sagt der Leiste, ab welcher Höhe welcher Schritt gilt */
function marke(nr) {
  return el("div", { class: "marke", "data-schritt": String(nr), "aria-hidden": "true" });
}

/* ------------------------------------------------------ Schrittleiste */
function zeichneLeiste() {
  var leiste = document.getElementById("leiste");
  leere(leiste);
  leiste.appendChild(el("div", { class: "leiste__kopf", text: "Vorgehen" }));
  var letzteGruppe = null;
  MODELL.stufen.forEach(function (st) {
    if (letzteGruppe !== null && st.gruppe !== letzteGruppe) {
      leiste.appendChild(el("div", { class: "leiste__zaesur", text: st.gruppe }));
    }
    letzteGruppe = st.gruppe;
    leiste.appendChild(el("div", {
      class: "leiste__schritt", "data-schritt": String(st.nr)
    }, [
      el("span", { class: "leiste__nr", text: String(st.nr) }),
      el("span", {}, [
        el("span", { class: "leiste__name", text: st.titel }),
        el("span", { class: "leiste__frage", text: st.frage })
      ])
    ]));
  });
}

function setzeSchritt() {
  var marken = document.querySelectorAll(".marke");
  var grenze = Math.min(140, window.innerHeight * 0.25);
  var nr = 1;
  Array.prototype.forEach.call(marken, function (m) {
    if (m.getBoundingClientRect().top <= grenze) {
      nr = Number(m.getAttribute("data-schritt")) || nr;
    }
  });
  Array.prototype.forEach.call(
    document.querySelectorAll(".leiste__schritt"), function (sch) {
      var an = sch.getAttribute("data-schritt") === String(nr);
      sch.classList.toggle("leiste__schritt--an", an);
      if (an) sch.setAttribute("aria-current", "step");
      else sch.removeAttribute("aria-current");
    });
}

/* --------------------------------------------------------- Kopfzeile */
function zeichneKopfzeile(erg) {
  var rechts = el("div", { class: "kopfzeile__rechts" }, [
    el("span", { class: "kopfzeile__zahl" }, [
      el("b", { text: String(erg.anzahl) }), " Anforderungen"
    ])
  ]);
  /* Innerhalb eines Moduls ist immer nur eine Frage offen, und die kann in
     jeder Säule stehen - ohne diesen Verweis sucht man sie. */
  if (S.naechste) {
    rechts.appendChild(el("button", {
      class: "tat", type: "button",
      text: "Nächste Frage: " + S.naechste.frage + " →",
      onclick: function () { springeZuKnoten(S.naechste.frage); }
    }));
  } else {
    rechts.appendChild(el("span", { class: "kopfzeile__zahl",
                                    text: "alle Fragen beantwortet" }));
  }
  if (S.meldung) rechts.appendChild(el("span", { class: "kopfzeile__zahl", text: S.meldung }));
  return el("header", { class: "kopfzeile" }, [
    el("div", {}, [
      el("h1", { text: MODELL.titel, "data-fokus": true, tabindex: "-1" }),
      el("div", { class: "kopfzeile__firma",
                  text: PROFIL.unternehmen.name + " · " + PROFIL.unternehmen.kurz })
    ]),
    rechts
  ]);
}

/* ------------------------------------------- Reihe 1: die Ausgangslage */
/* Die Rollenfrage ist keine Vorbelegung mehr: sie entscheidet, welche
   Kapitel überhaupt gelten, und wird deshalb hier gestellt. */
function zeichneAusgangslage() {
  var zeile = el("div", { class: "zeile", id: "zeile-ausgangslage" });
  var lauf = laufeModul("EIN", S.antworten, idx);
  MODELL.grundlagen.fragen.forEach(function (fid) {
    zeile.appendChild(frageKarte(fid, lauf));
  });
  return zeile;
}

/* -------------------------------- Reihe 2: was nach der Excel entfällt */
/* Nicht mehr von Hand behauptet, sondern aus der Startbedingung des Moduls
   berechnet - und wieder da, sobald die Rolle gesetzt wird. */
function zeichneAusschluesse() {
  var zeile = el("div", { class: "zeile", id: "zeile-ausschluss" });
  var offen = 0;
  idx.module.forEach(function (m) {
    if (m.modul === "EIN" || m.modul === "Ergebnis") return;
    if (modulGilt(m.modul)) return;
    offen++;
    zeile.appendChild(el("div", { class: "karte karte--aus", id: "k-aus-" + m.modul }, [
      el("div", { class: "karte__kopf" }, [
        el("span", { text: kapitelVonModul(m.modul) || m.modul }),
        el("span", { text: "entfällt" })
      ]),
      el("div", { class: "karte__titel", text: m.kurztitel }),
      el("div", { class: "karte__grund",
                  text: "Setzt voraus: " + m.startbedingung.roh })
    ]));
  });
  if (!offen) {
    zeile.appendChild(el("div", { class: "karte karte--fest" }, [
      el("div", { class: "karte__kopf" }, [el("span", { text: "Stand" })]),
      el("div", { class: "karte__titel", text: "Kein Kapitel entfällt" })
    ]));
  }
  return zeile;
}

/* ------------------------- Reihe 3: was unabhängig vom Strang gilt ---- */
function zeichneGrundlagen(erg) {
  var zeile = el("div", { class: "zeile" });
  var karte = el("div", { class: "karte karte--fest", id: "k-grundlagen" }, [
    el("div", { class: "karte__kopf" }, [
      el("span", { text: "vor der Verzweigung" }),
      el("span", { text: "gilt in jedem Strang" })
    ]),
    el("div", { class: "karte__titel", text: MODELL.grundlagen.kurz })
  ]);
  karte.appendChild(zeichneErnte("grundlagen", erg));
  zeile.appendChild(karte);
  return zeile;
}

/* ------------------------------------------- Die Blöcke der Stränge --- */
/* Je Anknüpfungspunkt ein Block: Kopfkarte und darunter seine Säulen. Als
   umbrechender Fluss statt fester Spaltenzahl - bei zehn Strängen bricht das
   um, statt Spalten auf 160 px zu quetschen. */
function zeichneGitter(erg) {
  var aus = document.createDocumentFragment();
  aus.appendChild(marke(3));
  var gitter = el("div", { class: "gitter" });
  var erste = true;
  MODELL.anknuepfungspunkte.forEach(function (a) {
    if (!modulGilt(a.modul)) return;
    var meine = MODELL.straenge.filter(function (s) { return s.anknuepfung === a.id; });
    if (!meine.length) return;
    var block = el("div", { class: "block", id: "k-ank-" + a.id,
                            style: "--spalten:" + meine.length });
    block.appendChild(el("div", { class: "anker" }, [
      el("div", { class: "anker__kopf" }, [
        el("span", { text: a.kapitel }), el("span", { text: a.modul })
      ]),
      el("div", { class: "anker__titel", text: a.kurz })
    ]));
    var spalten = el("div", { class: "block__spalten" });
    meine.forEach(function (strang) {
      spalten.appendChild(zeichneSaeule(strang, erg, erste));
      erste = false;
    });
    block.appendChild(spalten);
    gitter.appendChild(block);
  });
  aus.appendChild(gitter);
  return aus;
}

function zeichneSaeule(strang, erg, erste) {
  var f0 = idx.fragen.get(strang.fragen[0]);
  var lauf = laufeModul(f0.modul, S.antworten, idx);
  var menge = strangFragen(strang);
  var saeule = el("div", { class: "saeule", id: "spur-" + strang.id });
  saeule.appendChild(el("div", { class: "saeule__kopf", text: strang.kurz }));
  if (erste) saeule.appendChild(marke(4));

  var gezeigt = [];
  lauf.schritte.forEach(function (s) {
    if (menge.has(s.frage_id)) gezeigt.push(s.frage_id);
  });
  if (lauf.aktuell && menge.has(lauf.aktuell)) gezeigt.push(lauf.aktuell);
  strang.fragen.forEach(function (fid) {
    if (gezeigt.indexOf(fid) < 0) gezeigt.push(fid);
  });
  gezeigt.forEach(function (fid) {
    saeule.appendChild(frageKarte(fid, lauf, menge));
  });

  lauf.schritte.forEach(function (s) {
    if (!menge.has(s.frage_id)) return;
    s.befunde.forEach(function (b) {
      saeule.appendChild(el("div", {
        class: "ergebnis" + (b.unsicher ? " ergebnis--warn" : "")
      }, [el("span", { text: kurz(b.text, 150) })]));
    });
  });

  if (erste) saeule.appendChild(marke(5));
  saeule.appendChild(zeichneErnte(strang.id, erg));
  return saeule;
}

function zeichneErnte(fachId, erg) {
  var eintraege = nurAusgeloest(erg.faecher[fachId] || []);
  var mehrfach = eintraege.filter(function (e) {
    return (erg.mehrfach[e.req_id] || []).length > 1;
  });
  var kapitel = [];
  eintraege.forEach(function (e) {
    if (kapitel.indexOf(e.kapitel) < 0) kapitel.push(e.kapitel);
  });
  var karte = el("div", { class: "ernte", id: "ernte-" + fachId }, [
    el("div", { class: "ernte__zahl", text: String(eintraege.length) }),
    el("div", { class: "ernte__titel", text: anzahlText(eintraege.length) }),
    el("div", { class: "ernte__kapitel",
                text: kapitel.length ? "Kapitel " + kapitel.sort().join(", ") : "—" }),
    mehrfach.length
      ? el("div", { class: "ernte__mehrfach",
                    text: mehrfach.length + " davon auch in anderen Strängen" })
      : null
  ]);
  if (eintraege.length) {
    var d = el("details", {
      open: S.offen["fach-" + fachId] ? "" : null,
      ontoggle: function () {
        if (d.open) S.offen["fach-" + fachId] = true;
        else delete S.offen["fach-" + fachId];
      }
    });
    d.appendChild(el("summary", { text: "Anforderungen zeigen" }));
    var liste = el("div", { class: "reqliste" });
    eintraege.forEach(function (e) {
      liste.appendChild(zeichneReqZeile(e, erg.mehrfach[e.req_id] || [], fachId));
    });
    d.appendChild(liste);
    karte.appendChild(d);
  }
  return karte;
}

/* --------------------------------------------------------- Fragenkarte */
function frageKarte(fid, lauf, menge) {
  var f = idx.fragen.get(fid);
  if (!f) return el("div");
  var gegeben = S.antworten[fid] || null;
  var vor = vorbelegung(fid);
  var mehrfach = istMehrfachauswahl(f);
  var dran = !!S.naechste && S.naechste.frage === fid;

  /* Vorbelegte Fragen sind immer umstellbar - unabhängig davon, wie weit der
     Modullauf gerade ist. Sonst stünde eine Vorbelegung grau da und ließe
     sich erst ändern, wenn man sich zu ihr durchgeklickt hat. */
  var erreichbar = true;
  if (lauf && !vor) {
    erreichbar = lauf.schritte.some(function (s) { return s.frage_id === fid; })
              || lauf.aktuell === fid;
  }

  var klasse = "karte";
  if (vor) klasse += " karte--fest";
  else if (!erreichbar) klasse += " karte--aus";
  else if (gegeben) klasse += " karte--gegangen";
  else klasse += " karte--offen";
  if (dran) klasse += " karte--dran";

  var kopfRechts = vor ? "vorbelegt"
    : (dran ? "hier weiter"
            : (!erreichbar ? "noch nicht dran" : (gegeben ? "beantwortet" : "offen")));
  var titel = el("div", { class: "karte__titel", text: kurzeFrage(f) });
  haengeErklAn(titel, function () { return erklFrage(f); });

  var karte = el("div", { class: klasse, id: "k-" + fid }, [
    el("div", { class: "karte__kopf" }, [
      el("span", { text: fid }), el("span", { text: kopfRechts })
    ]),
    titel
  ]);

  if ((PROFIL.warnungen || {})[fid]) {
    karte.classList.add("karte--warn");
    karte.appendChild(el("div", { class: "karte__grund karte__grund--warn",
                                  text: "Excel-Lücke, siehe Hinweis" }));
  }

  /* Bei Mehrfachauswahl gilt die Frage erst mit "Übernehmen" als beantwortet -
     sonst liefe der Lauf schon nach dem ersten Häkchen weiter. */
  var entwurf = mehrfach
    ? (S.entwurf[fid] || (gegeben ? gegeben.slice() : []))
    : null;

  var chips = el("div", { class: "karte__chips", role: "group",
                          "aria-label": "Antwort auf " + fid });
  f.antwortoptionen.forEach(function (o) {
    var an = mehrfach ? entwurf.indexOf(o.schluessel) >= 0
                      : (!!gegeben && gegeben.indexOf(o.schluessel) >= 0);
    var buchstabe = o.form === "buchstabe";
    var knopf = el("button", {
      class: "chip" + (an ? " chip--an" : "") + (buchstabe ? " chip--lang" : ""),
      type: "button",
      /* Nicht erreichbare Fragen nehmen keine Klicks mehr an: die Antwort
         wurde bisher gesetzt und sofort wieder weggeräumt - sichtbar
         passierte nichts. */
      disabled: !erreichbar ? "" : null,
      "aria-pressed": an ? "true" : "false",
      "aria-label": buchstabe ? o.schluessel + ": " + o.text : o.schluessel,
      title: buchstabe ? o.text : o.schluessel,
      onclick: function () {
        if (!mehrfach) { beantworte(fid, [o.schluessel]); return; }
        var pos = entwurf.indexOf(o.schluessel);
        if (pos >= 0) entwurf.splice(pos, 1); else entwurf.push(o.schluessel);
        S.entwurf[fid] = entwurf;
        zeichne();
      }
    });
    if (buchstabe) {
      knopf.appendChild(el("span", { class: "chip__nr", text: o.schluessel }));
      knopf.appendChild(el("span", { text: kurz(o.text, 80) }));
    } else {
      knopf.textContent = kurz(o.schluessel, 22);
    }
    chips.appendChild(knopf);
  });
  karte.appendChild(chips);

  if (mehrfach && erreichbar) {
    karte.appendChild(el("button", {
      class: "tat", type: "button",
      disabled: entwurf.length ? null : "",
      text: entwurf.length ? "Übernehmen (" + entwurf.length + ")"
                           : "Mindestens eine Angabe wählen",
      onclick: function () {
        delete S.entwurf[fid];
        beantworte(fid, entwurf.slice());
      }
    }));
  }

  if (!erreichbar) {
    karte.appendChild(el("div", { class: "karte__grund",
                                  text: lauf && lauf.aktuell
                                    ? "Wird nach " + lauf.aktuell + " gestellt"
                                    : "In diesem Pfad nicht gestellt" }));
  }
  return karte;
}

/* Kurzform der Frage: erster Satz, gekürzt. Der Volltext steht im Hover. */
function kurzeFrage(f) {
  var t = f.frage.split(/[?(]/)[0].trim();
  return kurz(t, 92) + (f.frage.indexOf("?") >= 0 ? "?" : "");
}

/* =================================================================
   Anforderungszeilen
   ================================================================= */

var TYP_KUERZEL = {
  "Handlungspflicht": "Handlung", "Informationspflicht": "Information",
  "Unterlassungspflicht": "Unterlassung", "Recht": "Recht", "Ausnahme": "Ausnahme"
};

/* Antwort im Klartext: "B) Plattform- oder Softwaredienst" */
function antwortText(frageId, schluessel) {
  var f = idx.fragen.get(frageId);
  if (!f) return (schluessel || []).join(", ");
  return (schluessel || []).map(function (s) {
    var o = f.antwortoptionen.filter(function (x) { return x.schluessel === s; })[0];
    return o && o.form === "buchstabe" ? s + ") " + o.text : s;
  }).join(" + ");
}

/* Aus einer Herkunftszeile zurück zu der Karte, die die Antwort trägt.
   Vorbelegte Einstiegsfragen haben keine eigene Karte - ihre Antwort steht
   in der Ausgangslage, dorthin wird stattdessen gesprungen. */
function springeZuKnoten(frageId) {
  var ziel = document.getElementById("k-" + frageId);
  var text = "Frage " + frageId + " hervorgehoben";
  if (!ziel && vorbelegung(frageId)) {
    ziel = document.getElementById("zeile-ausgangslage");
    text = frageId + " ist vorbelegt, siehe Ausgangslage";
  }
  if (!ziel) return;
  var sanft = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  ziel.scrollIntoView(sanft ? { block: "center", behavior: "smooth" }
                            : { block: "center" });
  ziel.classList.add("karte--ziel");
  setTimeout(function () { ziel.classList.remove("karte--ziel"); }, 1600);
  sage(text);
}

/* Kurzname eines Strangs für die Mehrfachmarke */
function strangName(id) {
  var s = MODELL.straenge.filter(function (x) { return x.id === id; })[0];
  return s ? s.kurz : id;
}

function zeichneReqZeile(e, mehrfachStraenge, dieserStrang) {
  var offen = !!S.offen[e.req_id];
  var d = el("details", {
    class: "req" + (e.unsicher ? " req--warn" : "") + (e.verschoben ? " req--spaeter" : ""),
    open: offen ? "" : null,
    ontoggle: function () {
      if (d.open) S.offen[e.req_id] = true; else delete S.offen[e.req_id];
    } });
  var fristText = e.fristen.map(function (f) { return f.datum; }).join(", ") || "—";
  /* "auch:" nennt nur die anderen Stränge, in denen dieselbe Anforderung steht */
  var auchIn = ((mehrfachStraenge || []).length > 1 ? mehrfachStraenge : [])
    .filter(function (id) { return id !== dieserStrang; }).map(strangName);
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
      auchIn.length
        ? el("span", { class: "req__marke req__marke--rolle",
                       text: "auch: " + auchIn.join(", ") }) : null,
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
        text: "Ausgelöst durch " + b.frage_id + " →",
        title: "Zur Frage " + b.frage_id + " springen",
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

/* =================================================================
   Fußzeile
   ================================================================= */

function zeichneFusszeile() {
  return el("footer", { class: "fusszeile" }, [
    el("span", { text: "Strukturierte Orientierung nach VO (EU) 2023/2854, "
                     + "keine Rechtsberatung." }),
    el("span", { text: "Läuft vollständig lokal: kein Netzwerkaufruf, kein Tracking." }),
    el("span", { text: MODELL.fussnote }),
    el("button", { class: "tat", type: "button", text: "Drucken / PDF",
                   onclick: function () { window.print(); } }),
    el("button", { class: "tat", type: "button", text: "Antworten zurücksetzen",
                   onclick: function () {
                     verwirfStand();
                     S.antworten = startAntworten();
                     S.meldung = null;
                     zeichne();
                     sage("Antworten auf den Ausgangsstand zurückgesetzt");
                   } })
  ]);
}

/* =================================================================
   Start
   ================================================================= */

(function start() {
  var a = startAntworten();
  var gespeichert = ladeStand();
  /* Gespeichertes gewinnt - auch über eine Vorbelegung, die man umstellen darf */
  if (gespeichert) Object.keys(gespeichert).forEach(function (fid) {
    a[fid] = gespeichert[fid].slice();
  });
  S.antworten = bereinige(a, idx, praemissen()).antworten;

  zeichneLeiste();

  var entprellt = null;
  function schrittSpaeter() {
    clearTimeout(entprellt);
    entprellt = setTimeout(setzeSchritt, 120);
  }
  window.addEventListener("resize", schrittSpaeter);
  /* Aufgeklappte Anforderungen verschieben alles darunter */
  document.addEventListener("toggle", schrittSpaeter, true);

  /* Die Leiste läuft beim Scrollen mit - je Bild höchstens einmal gerechnet */
  var wartet = false;
  window.addEventListener("scroll", function () {
    if (wartet) return;
    wartet = true;
    requestAnimationFrame(function () { wartet = false; setzeSchritt(); });
  }, { passive: true });

  /* Zum Drucken alles aufklappen, danach den Stand wiederherstellen */
  var vorDruck = null;
  window.addEventListener("beforeprint", function () {
    vorDruck = [];
    Array.prototype.forEach.call(document.querySelectorAll("details"), function (d) {
      vorDruck.push([d, d.open]);
      d.open = true;
    });
  });
  window.addEventListener("afterprint", function () {
    (vorDruck || []).forEach(function (paar) { paar[0].open = paar[1]; });
    vorDruck = null;
  });

  zeichne();
})();
