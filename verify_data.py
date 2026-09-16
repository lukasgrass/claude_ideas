#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""verify_data.py – rechnet die Testprofile aus QS-Abschnitt 6 durch.

Liest ausschließlich data.json (also genau das, was später auch das
JavaScript im HTML zu sehen bekommt) und enthält einen kleinen Interpreter
für die Bedingungs-Ausdrucksbäume – kein eval auf Rohtext.

Vorgehen je Profil
  1. Der Pfad aus QS-Abschnitt 6 gibt die Reihenfolge der gestellten Fragen vor.
     Die *Antworten* stehen nicht in der Excel; sie werden daher so weit wie
     möglich aus den Daten abgeleitet:
       - Anzeigebedingungen der Form "VAR = Wert" bzw. "VAR ∈ {…}" binden die
         Variable, wenn die Frage im Pfad steht, und schließen den Wert aus,
         wenn sie fehlt.
       - Die Antwort muss über die Kantenliste zur nächsten Frage des Pfades
         führen.
  2. Bleiben danach Antworten offen, werden sie durchgerechnet (vollständig,
     solange die Zahl der Kombinationen klein ist, sonst per mehrfach
     gestartetem Koordinatenabstieg). Ausgewiesen wird der beste erreichbare
     Treffer; die Abweichung ist damit eine Untergrenze.
  3. Auflösung mehrerer Wirkungen auf dieselbe Req-ID:
     schließt aus > verschiebt Geltungsbeginn > löst aus > schränkt ein.

Aufruf:  python3 verify_data.py [--data data.json] [--notes NOTES.md]
"""
from __future__ import annotations

import argparse
import itertools
import json
import os
import random
import sys

RANG = {"schließt aus": 4, "verschiebt Geltungsbeginn": 3,
        "löst aus": 2, "schränkt ein": 1}

# Variable gesetzt, Wert aus der Excel nicht ableitbar (III-01, IV-02).
UNBEKANNT = "\u0000wert-unbekannt"
RANG_NAME = {v: k for k, v in RANG.items()}

MARKER_START = "<!-- TESTPROFILE:START -->"
MARKER_ENDE = "<!-- TESTPROFILE:END -->"


# ---------------------------------------------------------------------------
# Interpreter für die Ausdrucksbäume (dreiwertig: True / False / None)
# ---------------------------------------------------------------------------

def bewerte(knoten, zustand: dict, antworten: dict):
    """None bedeutet 'unbekannt' (unklarer Klartext oder ungesetzte Variable)."""
    if knoten is None:
        return True
    op = knoten.get("op")
    if op == "und":
        a, b = bewerte(knoten["links"], zustand, antworten), \
               bewerte(knoten["rechts"], zustand, antworten)
        if a is False or b is False:
            return False
        if a is None or b is None:
            return None
        return True
    if op == "oder":
        a, b = bewerte(knoten["links"], zustand, antworten), \
               bewerte(knoten["rechts"], zustand, antworten)
        if a is True or b is True:
            return True
        if a is None or b is None:
            return None
        return False
    if op == "nicht":
        a = bewerte(knoten["operand"], zustand, antworten)
        return None if a is None else not a
    if op == "unklar":
        return None
    if op == "gesetzt":
        return knoten["variable"] in zustand
    if op in ("=", "≠", "∈", "∉"):
        wert = zustand.get(knoten["variable"])
        if wert is None:
            return False if op in ("=", "∈") else None
        if wert == UNBEKANNT:
            return None
        if op == "=":
            return wert == knoten["wert"]
        if op == "≠":
            return wert != knoten["wert"]
        if op == "∈":
            return wert in knoten["werte"]
        return wert not in knoten["werte"]
    if op == "antwort":
        gegeben = antworten.get(knoten["frage"])
        if gegeben is None:
            return None
        drin = knoten["wert"] in gegeben
        return drin if knoten.get("vergleich", "=") == "=" else not drin
    return None


def erfuellt(bedingung, zustand, antworten) -> bool:
    """Unbekannt wird als erfüllt behandelt (neutral) – siehe NOTES.md."""
    if not bedingung:
        return True
    return bewerte(bedingung.get("ausdruck"), zustand, antworten) is not False


# ---------------------------------------------------------------------------
# Modell
# ---------------------------------------------------------------------------

class Modell:
    def __init__(self, daten: dict, annahmen: dict | None = None):
        self.daten = daten
        # Angenommene Antwort->Wert-Zuordnungen (siehe annahmen.json). Sie
        # überschreiben nur das, was build_data.py als "nicht in der Excel
        # enthalten" gemeldet hat, und verändern die Excel selbst nicht.
        self.annahmen = (annahmen or {}).get("gesetzte_variablen", {})
        self.fragen = {f["id"]: f for f in daten["fragen"]}
        self.einstiege = {e["frage_id"] for m in daten["module"]
                          for e in m["einstiegsfragen"]}
        self.mapping_je_frage = {}
        for m in daten["mapping"]:
            self.mapping_je_frage.setdefault(m["frage_id"], []).append(m)

    # -- Variablen ---------------------------------------------------------
    def zuweisungen(self, frage_id: str, antwort: tuple) -> dict:
        aus = {}
        angenommen = self.annahmen.get(frage_id, {})
        for gv in self.fragen[frage_id]["gesetzte_variablen"]:
            var = gv.get("variable")
            if not var:
                continue
            if var in angenommen:
                treffer = [w for a, w in angenommen[var].items() if a in antwort]
                if treffer:
                    aus[var] = treffer[0]
                continue
            treffer = [z["wert"] for z in gv["zuordnung"] if z["antwort"] in antwort]
            if treffer:
                aus[var] = treffer[0]
            elif gv.get("wert_unbekannt"):
                aus[var] = UNBEKANNT
            elif gv.get("wert_sonst"):
                aus[var] = gv["wert_sonst"]
        return aus

    def ist_mehrfachauswahl(self, frage_id: str) -> bool:
        """Frage setzt mehrere Ja/Nein-Variablen über Antwortkürzel."""
        gv = [g for g in self.fragen[frage_id]["gesetzte_variablen"]
              if g.get("wert_sonst")]
        return len(gv) > 1

    # -- Kanten ------------------------------------------------------------
    def ziele(self, kante):
        if kante["ziel_typ"] == "frage":
            return [("frage", kante["ziel"])]
        if kante["ziel_typ"] == "ergebnis":
            if kante.get("weiter_mit"):
                return [("frage", kante["weiter_mit"])]
            if kante.get("anschluss") in ("ende_modul", "ende"):
                return [("ende", None)]
            return [("offen", None)]
        return [("ende", None)]

    def fuehrt_zu(self, art, knoten, ziel, pfad_menge, tiefe=0) -> bool:
        if art == "offen":
            return True
        if art == "ende":
            return ziel is None or ziel in self.einstiege
        if knoten == ziel:
            return True
        if knoten in pfad_menge or tiefe > 12:
            return False
        for k in self.fragen[knoten]["kanten"]:
            for a, n in self.ziele(k):
                if self.fuehrt_zu(a, n, ziel, pfad_menge, tiefe + 1):
                    return True
        return False

    # -- Wirkungen ---------------------------------------------------------
    def wirkungen(self, pfad, antworten) -> dict:
        """-> {req_id: {"rang": int, "belege": [...]}} nach Rangfolge."""
        zustand = {}
        ergebnis = {}
        for frage_id in pfad:
            zustand.update(self.zuweisungen(frage_id, antworten[frage_id]))
            for m in self.mapping_je_frage.get(frage_id, []):
                if not (m["antwort_alle"] or
                        any(a in antworten[frage_id] for a in m["antworten"])):
                    continue
                if not erfuellt(m["bedingung"], zustand, antworten):
                    continue
                rang = RANG.get(m["wirkung"], 0)
                eintrag = ergebnis.setdefault(m["req_id"],
                                              {"rang": 0, "belege": []})
                eintrag["belege"].append(
                    {"mapping_id": m["mapping_id"], "frage": frage_id,
                     "wirkung": m["wirkung"]})
                eintrag["rang"] = max(eintrag["rang"], rang)
        return ergebnis

    @staticmethod
    def mengen(wirkungen):
        ausgeloest = {r for r, w in wirkungen.items()
                      if w["rang"] in (RANG["löst aus"],
                                       RANG["verschiebt Geltungsbeginn"])}
        ausgeschlossen = {r for r, w in wirkungen.items()
                          if w["rang"] == RANG["schließt aus"]}
        nur_eingeschraenkt = {r for r, w in wirkungen.items()
                              if w["rang"] == RANG["schränkt ein"]}
        return ausgeloest, ausgeschlossen, nur_eingeschraenkt


# ---------------------------------------------------------------------------
# Kandidatenräume aus Pfad und Anzeigebedingungen
# ---------------------------------------------------------------------------

def variablen_schranken(modell: Modell, pfad_menge: set) -> dict:
    """Anzeigebedingungen einfacher Form binden Variablenwerte."""
    erlaubt, verboten = {}, {}
    for fid, f in modell.fragen.items():
        a = f["anzeigebedingung"]["ausdruck"]
        if not isinstance(a, dict):
            continue
        if a.get("op") == "=":
            werte = {a["wert"]}
        elif a.get("op") == "∈":
            werte = set(a["werte"])
        else:
            continue
        var = a["variable"]
        if fid in pfad_menge:
            erlaubt[var] = erlaubt.get(var, werte) & werte
        else:
            verboten.setdefault(var, set()).update(werte)
    return {"erlaubt": erlaubt, "verboten": verboten}


def kandidaten(modell: Modell, testfall: dict) -> dict:
    pfad = testfall["pfad"]
    pfad_menge = set(pfad)
    schranken = variablen_schranken(modell, pfad_menge)

    def zulaessig(frage_id, antwort):
        for var, wert in modell.zuweisungen(frage_id, antwort).items():
            if var in schranken["erlaubt"] and wert not in schranken["erlaubt"][var]:
                return False
            if wert in schranken["verboten"].get(var, ()):
                return False
        return True

    raum = {}
    for i, frage_id in enumerate(pfad):
        naechste = pfad[i + 1] if i + 1 < len(pfad) else None
        f = modell.fragen[frage_id]
        schluessel = [o["schluessel"] for o in f["antwortoptionen"]]
        if modell.ist_mehrfachauswahl(frage_id):
            rollen = [o["schluessel"] for o in f["antwortoptionen"]
                      if any(z["antwort"] == o["schluessel"]
                             for gv in f["gesetzte_variablen"]
                             for z in gv["zuordnung"])]
            ohne = [s for s in schluessel if s not in rollen]
            moeglich = [tuple(k) for n in range(1, len(rollen) + 1)
                        for k in itertools.combinations(rollen, n)]
            moeglich += [(s,) for s in ohne]
        else:
            moeglich = [(s,) for s in schluessel]

        zulaessige = []
        for antwort in moeglich:
            if not zulaessig(frage_id, antwort):
                continue
            kanten = [k for k in f["kanten"] if k["antwort"] in antwort]
            if kanten and not any(
                    modell.fuehrt_zu(art, ziel, naechste, pfad_menge)
                    for k in kanten for art, ziel in modell.ziele(k)):
                continue
            zulaessige.append(antwort)
        raum[frage_id] = zulaessige or moeglich
    return raum


# ---------------------------------------------------------------------------
# Suche
# ---------------------------------------------------------------------------

def abweichung(modell, pfad, antworten, erwartet_aus, erwartet_ex):
    w = modell.wirkungen(pfad, antworten)
    aus, ex, eing = modell.mengen(w)
    return (len(aus ^ erwartet_aus) + len(ex ^ erwartet_ex),
            aus, ex, eing, w)


def suche(modell: Modell, testfall: dict, raum: dict, obergrenze=20000,
          starts=60, saat=20260916):
    pfad = testfall["pfad"]
    erw_aus = set(testfall["erwartet_ausgeloest"])
    erw_ex = set(testfall["erwartet_ausgeschlossen"])
    kombis = 1
    for v in raum.values():
        kombis *= len(v)

    def bewerten(antworten):
        return abweichung(modell, pfad, antworten, erw_aus, erw_ex)

    if kombis <= obergrenze:
        verfahren = f"vollständig ({kombis} Kombinationen)"
        bestes, beste_wertung = None, None
        for kombi in itertools.product(*(raum[f] for f in pfad)):
            antworten = dict(zip(pfad, kombi))
            wertung = bewerten(antworten)
            if beste_wertung is None or wertung[0] < beste_wertung[0]:
                bestes, beste_wertung = antworten, wertung
                if wertung[0] == 0:
                    break
        return bestes, beste_wertung, verfahren, kombis

    verfahren = f"Koordinatenabstieg, {starts} Startpunkte ({kombis:,} Kombinationen)"
    rng = random.Random(saat)
    bestes, beste_wertung = None, None
    for start in range(starts):
        antworten = {f: (raum[f][0] if start == 0 else rng.choice(raum[f]))
                     for f in pfad}
        wertung = bewerten(antworten)
        verbessert = True
        while verbessert:
            verbessert = False
            for frage_id in pfad:
                if len(raum[frage_id]) < 2:
                    continue
                for kandidat in raum[frage_id]:
                    if kandidat == antworten[frage_id]:
                        continue
                    probe = dict(antworten, **{frage_id: kandidat})
                    neu = bewerten(probe)
                    if neu[0] < wertung[0]:
                        antworten, wertung, verbessert = probe, neu, True
        if beste_wertung is None or wertung[0] < beste_wertung[0]:
            bestes, beste_wertung = antworten, wertung
        if beste_wertung[0] == 0:
            break
    return bestes, beste_wertung, verfahren, kombis


# ---------------------------------------------------------------------------
# Ausgabe
# ---------------------------------------------------------------------------

def tabelle(zeilen, kopf):
    breiten = [max(len(str(z[i])) for z in ([kopf] + zeilen))
               for i in range(len(kopf))]
    def zeile(werte):
        return " | ".join(str(w).ljust(breiten[i]) for i, w in enumerate(werte))
    aus = [zeile(kopf), "-+-".join("-" * b for b in breiten)]
    aus += [zeile(z) for z in zeilen]
    return "\n".join(aus)


def md_tabelle(zeilen, kopf, rechts=()):
    aus = ["| " + " | ".join(kopf) + " |"]
    aus.append("| " + " | ".join("---:" if i in rechts else "---"
                                 for i in range(len(kopf))) + " |")
    for z in zeilen:
        aus.append("| " + " | ".join(str(w) for w in z) + " |")
    return "\n".join(aus)


def schreibe_notes(pfad: str, block: str):
    if not os.path.exists(pfad):
        print(f"Hinweis: {pfad} existiert nicht – erst build_data.py ausführen.",
              file=sys.stderr)
        return
    text = open(pfad, encoding="utf-8").read()
    if MARKER_START not in text or MARKER_ENDE not in text:
        print(f"Hinweis: Marker in {pfad} nicht gefunden – Abschnitt angehängt.",
              file=sys.stderr)
        text += f"\n\n{MARKER_START}\n{block}\n{MARKER_ENDE}\n"
    else:
        vorn = text[: text.index(MARKER_START) + len(MARKER_START)]
        hinten = text[text.index(MARKER_ENDE):]
        text = f"{vorn}\n{block}\n{hinten}"
    open(pfad, "w", encoding="utf-8").write(text)


def lauf(daten: dict, annahmen: dict | None):
    """Alle Testprofile rechnen. -> (zeilen, md_zeilen, details, summe)"""
    modell = Modell(daten, annahmen)
    zeilen, md_zeilen, details, summe = [], [], [], 0
    for t in daten["qs"]["testfaelle"]:
        fehlend = [f for f in t["pfad"] if f not in modell.fragen]
        if fehlend:
            raise SystemExit(f"FEHLER: Pfad von {t['profil_id']} nennt "
                             "unbekannte Fragen: " + ", ".join(fehlend))
        raum = kandidaten(modell, t)
        antworten, wertung, verfahren, kombis = suche(modell, t, raum)
        delta, aus, ex, eing, _ = wertung
        summe += delta
        erw_aus = set(t["erwartet_ausgeloest"])
        erw_ex = set(t["erwartet_ausgeschlossen"])
        offen = sum(1 for f in t["pfad"] if len(raum[f]) > 1)
        zeilen.append([t["profil_id"], f"{len(t['pfad'])}/{t['anzahl_fragen']}",
                       offen, len(erw_aus), len(aus),
                       f"{len(aus) - len(erw_aus):+d}",
                       len(erw_ex), len(ex), f"{len(ex) - len(erw_ex):+d}", delta])
        md_zeilen.append([f"**{t['profil_id']}**",
                          f"{len(t['pfad'])} / {t['anzahl_fragen']}", offen,
                          len(erw_aus), len(aus), f"{len(aus) - len(erw_aus):+d}",
                          len(erw_ex), len(ex), f"{len(ex) - len(erw_ex):+d}", delta])
        details.append({
            "profil": t["profil_id"], "bezeichnung": t["bezeichnung"],
            "verfahren": verfahren, "kombinationen": kombis, "offen": offen,
            "zu_viel_ausgeloest": sorted(aus - erw_aus),
            "fehlend_ausgeloest": sorted(erw_aus - aus),
            "zu_viel_ausgeschlossen": sorted(ex - erw_ex),
            "fehlend_ausgeschlossen": sorted(erw_ex - ex),
            "nur_eingeschraenkt": sorted(eing),
            "antworten": {f: "+".join(antworten[f]) for f in t["pfad"]},
            "antwortsatz": {f: list(antworten[f]) for f in t["pfad"]},
            "berechnet_ausgeloest": sorted(aus),
            "berechnet_ausgeschlossen": sorted(ex),
            "offene_fragen": {f: [" + ".join(a) for a in raum[f]]
                              for f in t["pfad"] if len(raum[f]) > 1},
        })
    return zeilen, md_zeilen, details, summe


KOPF = ["Profil", "Fragen", "offen", "erw.aus", "ber.aus", "Δaus",
        "erw.ex", "ber.ex", "Δex", "Σ Abw."]
MD_KOPF = ["Profil", "Fragen Pfad / QS", "offene Antworten",
           "erwartet ausgelöst", "berechnet", "Δ", "erwartet ausgeschlossen",
           "berechnet", "Δ", "Σ Abweichung"]

ABWEICHUNGSARTEN = (
    ("fehlend_ausgeloest", "erwartet, aber nicht ausgelöst"),
    ("zu_viel_ausgeloest", "ausgelöst, aber nicht erwartet"),
    ("fehlend_ausgeschlossen", "erwartet ausgeschlossen, aber nicht"),
    ("zu_viel_ausgeschlossen", "ausgeschlossen, aber nicht erwartet"),
    ("nur_eingeschraenkt", "nur „schränkt ein“ – zählt in keiner der beiden Mengen"),
)


def drucke(titel, zeilen, details, summe, alle_details=False):
    print(titel)
    print(tabelle(zeilen, KOPF))
    print(f"Summe der Abweichungen über alle Profile: {summe}")
    for d in details:
        abweichend = any(d[s] for s, _ in ABWEICHUNGSARTEN[:4])
        if not (alle_details or abweichend):
            continue
        print(f"\n  {d['profil']} – {d['verfahren']}")
        for schluessel, beschriftung in ABWEICHUNGSARTEN:
            if d[schluessel]:
                print(f"    {beschriftung}: " + ", ".join(d[schluessel]))


def md_block(zeilen, details, summe, annahmen_text):
    block = [annahmen_text, ""]
    block.append(md_tabelle(zeilen, MD_KOPF, rechts=set(range(2, 10))))
    block.append(f"\nSumme der Abweichungen: **{summe}**\n")
    for d in details:
        block.append(f"**{d['profil']} – {d['bezeichnung']}**\n")
        block.append(f"- Verfahren: {d['verfahren']}")
        if d["offene_fragen"]:
            block.append("- aus der Excel nicht ableitbare Antworten: "
                         + "; ".join(f"`{f}` ∈ {{{', '.join(w)}}}"
                                     for f, w in d["offene_fragen"].items()))
        for schluessel, beschriftung in ABWEICHUNGSARTEN:
            if d[schluessel]:
                block.append(f"- {beschriftung}: " + ", ".join(d[schluessel]))
        block.append("- verwendeter Antwortsatz: "
                     + ", ".join(f"`{f}`={a}" for f, a in d["antworten"].items()))
        block.append("")
    return "\n".join(block)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", default="data.json")
    p.add_argument("--notes", default="NOTES.md")
    p.add_argument("--annahmen", default="annahmen.json",
                   help="Datei mit angenommenen Antwort->Wert-Zuordnungen; "
                        "wird zusätzlich als zweite Variante gerechnet")
    p.add_argument("--export", default="testprofile_antworten.json",
                   help="Antwortsätze und berechnete Mengen der reinen "
                        "Excel-Lesart für die Gegenprobe in pruefe.js")
    p.add_argument("--details", action="store_true",
                   help="auch Profile ohne Abweichung ausführlich ausgeben")
    args = p.parse_args(argv)

    if not os.path.exists(args.data):
        print(f"FEHLER: {args.data} nicht gefunden – erst build_data.py ausführen.",
              file=sys.stderr)
        return 2
    daten = json.load(open(args.data, encoding="utf-8"))
    if not daten["qs"]["testfaelle"]:
        print("FEHLER: keine Testprofile in QS-Abschnitt 6 gefunden.",
              file=sys.stderr)
        return 2

    print("Testprofile aus QS-Abschnitt 6")
    print("ausgelöst = 'löst aus' + 'verschiebt Geltungsbeginn' | "
          "ex = ausgeschlossen | Σ Abw. = Summe der symmetrischen Differenzen")
    print("Die Excel nennt je Profil nur den Pfad, nicht die Antworten; offene "
          "Antworten werden bestmöglich belegt,\ndie Abweichung ist daher eine "
          "Untergrenze.\n")

    zeilen, md_zeilen, details, summe = lauf(daten, None)
    drucke("A) Reine Excel-Lesart, ohne Annahmen\n", zeilen, details, summe,
           args.details)
    bloecke = [md_block(md_zeilen, details, summe,
                        "**A) Reine Excel-Lesart, ohne Annahmen.** Die Excel "
                        "nennt je Profil nur den Pfad, nicht die Antworten. "
                        "Offene Antworten werden bestmöglich belegt; die "
                        "Abweichung ist damit eine Untergrenze.")]

    if args.export:
        with open(args.export, "w", encoding="utf-8") as fh:
            json.dump({
                "variante": "A – reine Excel-Lesart, ohne annahmen.json",
                "erzeugt_durch": "verify_data.py",
                "profile": [{
                    "profil_id": d["profil"],
                    "bezeichnung": d["bezeichnung"],
                    "antworten": d["antwortsatz"],
                    "ausgeloest": d["berechnet_ausgeloest"],
                    "ausgeschlossen": d["berechnet_ausgeschlossen"],
                    "qs_erwartet_ausgeloest": t["erwartet_ausgeloest"],
                    "qs_erwartet_ausgeschlossen": t["erwartet_ausgeschlossen"],
                } for d, t in zip(details, daten["qs"]["testfaelle"])],
            }, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        print(f"\n{args.export} geschrieben "
              f"({len(details)} Antwortsätze für die Gegenprobe).")

    if os.path.exists(args.annahmen):
        annahmen = json.load(open(args.annahmen, encoding="utf-8"))
        beschreibung = annahmen.get("beschreibung", "")
        zeilen2, md2, details2, summe2 = lauf(daten, annahmen)
        print(f"\n\nB) Mit den Annahmen aus {args.annahmen}: {beschreibung}\n")
        drucke("", zeilen2, details2, summe2, args.details)
        bloecke.append(md_block(
            md2, details2, summe2,
            f"**B) Mit den Annahmen aus `{os.path.basename(args.annahmen)}`.** "
            + beschreibung))
    else:
        print(f"\n({args.annahmen} nicht vorhanden – nur Variante A gerechnet.)")

    schreibe_notes(args.notes, "\n\n".join(bloecke))
    print(f"\n{args.notes} aktualisiert.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
