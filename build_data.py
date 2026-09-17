#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_data.py – erzeugt data.json aus DataAct_Anforderungen.xlsx.

Einzige inhaltliche Quelle ist die Arbeitsmappe. Das Skript liest alle Blätter,
zerlegt die beiden Fließtextspalten ("Folgeknoten je Antwort" in Blatt Fragen,
"Anzeigebedingung"/"Bedingung" in Fragen bzw. Mapping) in auswertbare
Strukturen und schreibt das Ergebnis als data.json.

Grundsätze
  * Es wird nichts ergänzt und nichts geraten. Was nicht eindeutig zerlegbar
    ist, bleibt als Klartext erhalten (Ausdrucksatom {"op": "unklar"}) und
    landet in der Warnliste.
  * Der Lauf ist beliebig oft wiederholbar: gleiche Excel -> gleiche data.json.
  * Verletzt die Excel eine der geforderten Konsistenzregeln, bricht das
    Skript mit Fehlerliste ab (Exit-Code 2) und schreibt keine data.json.

Aufruf:
    python3 build_data.py [--excel DataAct_Anforderungen.xlsx]
                          [--out data.json] [--notes NOTES.md]
                          [--trotz-fehler]
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import re
import sys
from collections import defaultdict

try:
    import openpyxl
except ImportError:  # pragma: no cover
    sys.exit("openpyxl fehlt. Installation: pip install openpyxl")


# ===========================================================================
# 1  Textwerkzeuge
# ===========================================================================

_ERSETZUNGEN = {
    "→": "→", "≠": "≠", "∈": "∈", "∉": "∉",
    " ": " ", "‑": "-",
    "‘": "'", "’": "'", "‚": "'",
    "“": '"', "”": '"', "„": '"',
}

LEER_MARKER = {"", "—", "-", "–", "k. A.", "n/a"}


def norm(text) -> str:
    """Whitespace und Sonderzeichen vereinheitlichen."""
    if text is None:
        return ""
    if isinstance(text, datetime.datetime):
        return text.strftime("%d.%m.%Y")
    if isinstance(text, datetime.date):
        return text.strftime("%d.%m.%Y")
    s = str(text)
    for a, b in _ERSETZUNGEN.items():
        s = s.replace(a, b)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def ist_leer(text) -> bool:
    return norm(text) in LEER_MARKER


def _tiefen(s: str):
    """Für jede Zeichenposition (Klammertiefe, Mengentiefe, in Anführung)."""
    tiefe = brace = 0
    quote = False
    aus = []
    for ch in s:
        if ch == "'":
            quote = not quote
            aus.append((tiefe, brace, True))
            continue
        if not quote:
            if ch == "(":
                aus.append((tiefe, brace, quote)); tiefe += 1; continue
            if ch == ")":
                tiefe = max(0, tiefe - 1); aus.append((tiefe, brace, quote)); continue
            if ch == "{":
                aus.append((tiefe, brace, quote)); brace += 1; continue
            if ch == "}":
                brace = max(0, brace - 1); aus.append((tiefe, brace, quote)); continue
        aus.append((tiefe, brace, quote))
    return aus


def split_top(s: str, trenner):
    """An Trennern teilen, die außerhalb von (), {} und '' stehen."""
    if isinstance(trenner, str):
        trenner = [trenner]
    trenner = sorted(trenner, key=len, reverse=True)
    tief = _tiefen(s)
    teile, start, i = [], 0, 0
    while i < len(s):
        t, b, q = tief[i]
        if t == 0 and b == 0 and not q:
            for tr in trenner:
                if s.startswith(tr, i):
                    teile.append(s[start:i]); i += len(tr); start = i
                    break
            else:
                i += 1
                continue
            continue
        i += 1
    teile.append(s[start:])
    return [p.strip() for p in teile]


def find_top(s: str, nadel: str, ab: int = 0) -> int:
    tief = _tiefen(s)
    for i in range(ab, len(s) - len(nadel) + 1):
        t, b, q = tief[i]
        if t == 0 and b == 0 and not q and s.startswith(nadel, i):
            return i
    return -1


def ganz_geklammert(s: str) -> bool:
    s = s.strip()
    if not (s.startswith("(") and s.endswith(")")):
        return False
    tief = _tiefen(s)
    for i in range(1, len(s) - 1):
        if tief[i][0] == 0 and not tief[i][2]:
            return False
    return True


# ===========================================================================
# 2  Bedingungen -> Ausdrucksbaum
# ===========================================================================

VAR_RE = re.compile(r"^[A-ZÄÖÜ][A-ZÄÖÜ0-9_]*$")
FRAGE_RE = re.compile(r"^(?:EIN|II|III|IV|V|VI|VII|VIII|IX|X)-\d{2}$")
FRAGE_SUCH_RE = re.compile(r"\b(?:EIN|II|III|IV|V|VI|VII|VIII|IX|X)-\d{2}\b")
REQ_SUCH_RE = re.compile(r"\bDA-(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI)-\d{3}\b")


def _atom(text: str) -> dict:
    t = text.strip().rstrip(".,;")
    if not t:
        return {"op": "unklar", "text": text.strip()}

    m = re.match(r"^([A-ZÄÖÜ][A-ZÄÖÜ0-9_]*)\s+gesetzt$", t)
    if m:
        return {"op": "gesetzt", "variable": m.group(1)}

    m = re.match(r"^bei\s+([A-ZÄÖÜ][A-ZÄÖÜ0-9_]*)$", t)
    if m:
        return {"op": "=", "variable": m.group(1), "wert": "Ja"}

    m = re.match(r"^([A-ZÄÖÜ][A-ZÄÖÜ0-9_]*)\s*([∈∉])\s*\{(.+?)\}$", t)
    if m:
        werte = [w.strip() for w in m.group(3).split(",") if w.strip()]
        return {"op": m.group(2), "variable": m.group(1), "werte": werte}

    for op in ("≠", "="):
        pos = t.find(op)
        if pos > 0:
            links = t[:pos].strip()
            rechts = t[pos + len(op):].strip().strip("'\"")
            if VAR_RE.match(links) and rechts:
                return {"op": op, "variable": links, "wert": rechts}
            if FRAGE_RE.match(links) and rechts:
                return {"op": "antwort", "vergleich": op,
                        "frage": links, "wert": rechts}
            break

    unklar = {"op": "unklar", "text": t}
    fragen = FRAGE_SUCH_RE.findall(t)
    if fragen:
        unklar["referenzierte_fragen"] = sorted(set(fragen))
    return unklar


def _parse_expr(text: str):
    t = text.strip()
    if not t:
        return None
    teile = split_top(t, [" oder "])
    if len(teile) > 1:
        knoten = _parse_expr(teile[0])
        for weiter in teile[1:]:
            knoten = {"op": "oder", "links": knoten, "rechts": _parse_expr(weiter)}
        return knoten
    teile = [p for p in split_top(t, [" und ", " sowie ", "; ", ", "]) if p]
    if len(teile) > 1:
        knoten = _parse_expr(teile[0])
        for weiter in teile[1:]:
            knoten = {"op": "und", "links": knoten, "rechts": _parse_expr(weiter)}
        return knoten
    if t.lower().startswith("nicht "):
        return {"op": "nicht", "operand": _parse_expr(t[6:])}
    if ganz_geklammert(t):
        return _parse_expr(t[1:-1])
    return _atom(t)


_ERREICHT_RE = re.compile(r"^erreicht über\s+(.*)$", re.IGNORECASE)
_SONST_RE = re.compile(
    r"sonst\s+(?:direkt\s+)?"
    r"(ENDE-MODUL|ENDE|(?:EIN|II|III|IV|V|VI|VII|VIII|IX|X)-\d{2})",
    re.IGNORECASE)


def parse_bedingung(roh) -> dict:
    """Fließtext-Bedingung -> {roh, ausdruck, vollstaendig, klartext[]}."""
    text = norm(roh)
    erg = {"roh": text, "ausdruck": None, "vollstaendig": True, "klartext": [],
           "sonst_ziel": None}
    if ist_leer(text):
        return erg

    if text.startswith("—") or text.startswith("–"):
        rest = text.lstrip("—– ").strip()
        if rest:
            erg["klartext"].append(rest.strip("()"))
        return erg

    if _ERREICHT_RE.match(text):
        knoten = {"op": "unklar", "art": "erreichbarkeit", "text": text}
        fragen = sorted(set(FRAGE_SUCH_RE.findall(text)))
        if fragen:
            knoten["referenzierte_fragen"] = fragen
        erg.update(ausdruck=knoten, vollstaendig=False)
        erg["klartext"].append(text)
        return erg

    rest = text
    m = re.search(r"\s\((sonst[^()]*|Modul[^()]*|alle[^()]*)\)$", rest)
    if m:
        erg["klartext"].append(m.group(1))
        rest = rest[: m.start()].strip()

    m = _SONST_RE.search(" ".join(erg["klartext"]))
    if m:
        # "… (sonst direkt II-11)" – ausdrückliches Sprungziel, wenn die Frage
        # wegen ihrer Anzeigebedingung übersprungen wird.
        erg["sonst_ziel"] = m.group(1).upper()

    erg["ausdruck"] = _parse_expr(rest)
    unklar = sammle_unklar(erg["ausdruck"])
    if unklar:
        erg["vollstaendig"] = False
        for u in unklar:
            if u["text"] not in erg["klartext"]:
                erg["klartext"].append(u["text"])
    return erg


def sammle_unklar(knoten) -> list:
    if not isinstance(knoten, dict):
        return []
    if knoten.get("op") == "unklar":
        return [knoten]
    aus = []
    for s in ("links", "rechts", "operand"):
        if s in knoten:
            aus.extend(sammle_unklar(knoten[s]))
    return aus


def sammle_variablen(knoten) -> set:
    if not isinstance(knoten, dict):
        return set()
    if knoten.get("op") in ("=", "≠", "∈", "∉", "gesetzt"):
        return {knoten["variable"]}
    aus = set()
    for s in ("links", "rechts", "operand"):
        if s in knoten:
            aus |= sammle_variablen(knoten[s])
    return aus


def sammle_fragen_refs(knoten) -> set:
    if not isinstance(knoten, dict):
        return set()
    if knoten.get("op") == "antwort":
        return {knoten["frage"]}
    aus = set()
    for s in ("links", "rechts", "operand"):
        if s in knoten:
            aus |= sammle_fragen_refs(knoten[s])
    return aus


def und_expr(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return {"op": "und", "links": a, "rechts": b}


def nicht_expr(a):
    if a is None:
        return None
    if a.get("op") == "nicht":
        return a["operand"]
    return {"op": "nicht", "operand": a}


# ===========================================================================
# 3  Antwortoptionen
# ===========================================================================

BUCHSTABE_RE = re.compile(r"^([A-H])\)\s*(.*)$", re.S)


def parse_optionen(roh: str) -> list:
    """Spalte 'Antwortoptionen' -> [{schluessel, text, form}]."""
    text = norm(roh)
    if ist_leer(text):
        return []
    optionen = []
    for teil in split_top(text, [" / "]):
        if not teil:
            continue
        m = BUCHSTABE_RE.match(teil)
        if m:
            optionen.append({"schluessel": m.group(1),
                             "text": m.group(2).strip(), "form": "buchstabe"})
        else:
            optionen.append({"schluessel": teil, "text": teil, "form": "klartext"})
    return optionen


def loese_antwort(token: str, optionen: list, aliase: dict | None = None):
    """Antwortkürzel aus dem Fließtext einer Option zuordnen.

    Rückgabe: (liste_von_schluesseln, sicher: bool)
    'Alle Antworten' trifft alle Optionen; 'Kleinst / Klein' trifft mehrere.
    'aliase' bildet zusätzliche Schreibweisen (z. B. Variablenwerte wie
    'Kleinst' für die Option 'Kleinstunternehmen (< 10 …)') auf den
    Optionsschlüssel ab. Geraten wird nicht: Was weder exakt noch über einen
    Alias noch über genau einen Präfixtreffer passt, gilt als ungelöst.
    """
    token = norm(token).strip()
    aliase = aliase or {}
    if not token:
        return [], False
    if token.lower() in ("alle antworten", "alle"):
        return [o["schluessel"] for o in optionen], True

    treffer = []
    for einzel in [t.strip() for t in token.split(" / ") if t.strip()]:
        kandidaten = [o["schluessel"] for o in optionen if o["schluessel"] == einzel]
        if not kandidaten:
            kandidaten = [o["schluessel"] for o in optionen
                          if o["schluessel"].lower() == einzel.lower()]
        if not kandidaten and einzel.lower() in aliase:
            kandidaten = [aliase[einzel.lower()]]
        if not kandidaten:
            praefix = [o["schluessel"] for o in optionen
                       if o["text"].startswith(einzel)]
            if len(praefix) == 1:            # nur bei Eindeutigkeit
                kandidaten = praefix
        if not kandidaten:
            return [], False
        treffer.append(kandidaten[0])
    return treffer, True


# ===========================================================================
# 4  Folgeknoten je Antwort -> Kantenliste
# ===========================================================================

class Bed:
    """Sammelt Ausdruck, Quelltexte und Klartextreste einer Kantenbedingung."""

    def __init__(self, ausdruck=None, quelltexte=None, klartext=None):
        self.ausdruck = ausdruck
        self.quelltexte = list(quelltexte or [])
        self.klartext = list(klartext or [])

    def kombiniere(self, anderer: "Bed") -> "Bed":
        return Bed(und_expr(self.ausdruck, anderer.ausdruck),
                   self.quelltexte + anderer.quelltexte,
                   self.klartext + anderer.klartext)

    def negiert(self) -> "Bed":
        return Bed(nicht_expr(self.ausdruck),
                   [f"nicht ({q})" for q in self.quelltexte], self.klartext)

    def als_json(self):
        if self.ausdruck is None and not self.klartext:
            return None
        return {
            "quelltext": "; ".join(self.quelltexte),
            "ausdruck": self.ausdruck,
            "vollstaendig": not sammle_unklar(self.ausdruck),
            "klartext": self.klartext,
        }

    @staticmethod
    def aus_text(text: str) -> "Bed":
        geparst = parse_bedingung(text)
        return Bed(geparst["ausdruck"], [geparst["roh"]] if geparst["roh"] else [],
                   geparst["klartext"])


ZIEL_RE = re.compile(
    r"^(?:(?P<direkt>direkt)\s+)?"
    r"(?P<ziel>ENDE-MODUL|ENDE|(?:EIN|II|III|IV|V|VI|VII|VIII|IX|X)-\d{2})"
    r"(?:\s*\((?P<anm>.*)\))?\.?$", re.S)

ERGEBNIS_RE = re.compile(
    r"^ERGEBNIS:?\s*'(?P<text>.*)'\s*(?:\((?P<klammer>[^()]*(?:\([^()]*\)[^()]*)*)\))?\.?$",
    re.S)

WENN_RE = re.compile(r"^(?P<kern>.*?)\s*\(wenn\s+(?P<cond>[^()]*)\)\s*$", re.S)
BEI_RE = re.compile(r"^bei\s+(?P<cond>.+?)\s*→\s*(?P<rest>.+)$", re.S)
ALIAS_RE = re.compile(r"^wie\s*'(?P<antwort>[^']+)'\s*(?P<rest>.*)$", re.S)
WEITER_RE = re.compile(r"^weiter mit\s+((?:EIN|II|III|IV|V|VI|VII|VIII|IX|X)-\d{2})",
                       re.IGNORECASE)


class FolgeknotenFehler(Exception):
    pass


def _anmerkung_einordnen(anm: str, kante: dict):
    if not anm:
        return
    anm = anm.strip()
    if anm.lower().startswith("ergebnis-baustein"):
        kante["ergebnis_baustein"] = anm.split(":", 1)[1].strip() if ":" in anm else anm
    elif anm.lower().startswith("hinweis"):
        kante["hinweis"] = anm
    else:
        kante["anmerkung"] = anm


def _ist_bedingungsblock(inner: str) -> bool:
    for teil in split_top(inner, ["; "]):
        if teil.startswith("sonst "):
            return True
        p = find_top(teil, ": ")
        if p > 0:
            geparst = parse_bedingung(teil[:p])
            if geparst["ausdruck"] is not None and not sammle_unklar(geparst["ausdruck"]):
                return True
    return False


def _parse_rest(text: str, bed: Bed, basis: Bed | None = None,
                basis_ctx: Bed | None = None) -> list:
    """Rechte Seite einer Antwortklausel in Kanten zerlegen."""
    text = text.strip().rstrip(".")
    if not text:
        raise FolgeknotenFehler("leerer Zielausdruck")

    m = ALIAS_RE.match(text)
    if m:
        return [{"_alias": m.group("antwort"), "_alias_rest": m.group("rest").strip(),
                 "bedingung": bed}]

    if ganz_geklammert(text):
        inner = text[1:-1].strip()
        if _ist_bedingungsblock(inner):
            return _parse_block(inner, bed)
        raise FolgeknotenFehler(f"geklammerter Ausdruck ohne erkennbares Ziel: {text}")

    teile = split_top(text, ["; "])
    if len(teile) > 1:
        kanten = []
        for teil in teile:
            m = BEI_RE.match(teil)
            if m:
                zusatz = Bed.aus_text(m.group("cond"))
                kanten += _parse_rest(m.group("rest"), bed.kombiniere(zusatz))
            else:
                kanten += _parse_rest(teil, bed)
        return kanten

    teile = split_top(text, [", sonst "])
    if len(teile) == 2:
        links_text, rechts_text = teile
        m = WENN_RE.match(links_text)
        if m:
            inline = Bed.aus_text(m.group("cond"))
            links = _parse_rest(m.group("kern"), bed.kombiniere(inline))
            rechts = _parse_rest(rechts_text, bed.kombiniere(inline.negiert()))
            return links + rechts
        if basis is not None:
            links = _parse_rest(links_text, bed)
            ctx = basis_ctx or Bed()
            rechts = _parse_rest(rechts_text, ctx.kombiniere(basis.negiert()))
            return links + rechts
        raise FolgeknotenFehler(f"'sonst' ohne erkennbare Bedingung: {text}")
    if len(teile) > 2:
        raise FolgeknotenFehler(f"mehrfaches 'sonst' nicht eindeutig: {text}")

    m = WENN_RE.match(text)
    if m:
        inline = Bed.aus_text(m.group("cond"))
        return _parse_rest(m.group("kern"), bed.kombiniere(inline))

    p = find_top(text, ", Ergebnis-Baustein:")
    if p > 0:
        kanten = _parse_rest(text[:p], bed)
        for k in kanten:
            k.setdefault("ergebnis_baustein",
                         text[p + len(", Ergebnis-Baustein:"):].strip())
        return kanten

    return [_parse_einzel(text, bed)]


def _parse_block(inner: str, bed: Bed) -> list:
    kanten = []
    vorher: list[Bed] = []
    # Ein am Blockende angehängter Ergebnis-Baustein ist Fließtext und darf
    # nicht an seinen Semikola zerlegt werden.
    baustein = None
    p = find_top(inner, ", Ergebnis-Baustein:")
    if p > 0:
        baustein = inner[p + len(", Ergebnis-Baustein:"):].strip()
        inner = inner[:p]
    zuletzt = 0
    for teil in split_top(inner, ["; "]):
        if teil.startswith("sonst "):
            rest = Bed()
            for v in vorher:
                rest = rest.kombiniere(v.negiert())
            zuletzt = len(kanten)
            kanten += _parse_rest(teil[6:], bed.kombiniere(rest))
            continue
        p = find_top(teil, ": ")
        if p <= 0:
            raise FolgeknotenFehler(f"Bedingungszweig ohne ':' – {teil}")
        zweig_bed = Bed.aus_text(teil[:p])
        vorher.append(zweig_bed)
        zuletzt = len(kanten)
        kanten += _parse_rest(teil[p + 2:], bed.kombiniere(zweig_bed),
                              basis=zweig_bed, basis_ctx=bed)
    if baustein:
        for k in kanten[zuletzt:]:
            k.setdefault("ergebnis_baustein", baustein)
    return kanten


def _parse_einzel(text: str, bed: Bed) -> dict:
    kante = {"bedingung": bed, "ziel": None, "ziel_typ": None,
             "ergebnistext": None, "weiter_mit": None}

    m = ERGEBNIS_RE.match(text)
    if m:
        kante["ergebnistext"] = m.group("text").strip()
        kante["ziel"] = "ERGEBNIS"
        kante["ziel_typ"] = "ergebnis"
        klammer = (m.group("klammer") or "").strip()
        if klammer:
            w = WEITER_RE.match(klammer)
            if w:
                kante["weiter_mit"] = w.group(1)
                kante["anschluss"] = "frage"
            elif klammer == "ENDE-MODUL":
                kante["anschluss"] = "ende_modul"
            elif klammer == "ENDE":
                kante["anschluss"] = "ende"
            else:
                _anmerkung_einordnen(klammer, kante)
                kante["anschluss"] = "unbestimmt"
        else:
            kante["anschluss"] = "unbestimmt"
        return kante

    m = ZIEL_RE.match(text)
    if m:
        ziel = m.group("ziel")
        kante["ziel"] = ziel
        kante["ziel_typ"] = {"ENDE-MODUL": "ende_modul",
                             "ENDE": "ende"}.get(ziel, "frage")
        _anmerkung_einordnen(m.group("anm") or "", kante)
        return kante

    raise FolgeknotenFehler(f"kein Ziel erkennbar: {text}")


def parse_folgeknoten(roh: str, frage_id: str, optionen: list, warn,
                      aliase: dict | None = None) -> list:
    """Spalte 'Folgeknoten je Antwort' -> Kantenliste."""
    text = norm(roh)
    if ist_leer(text):
        warn("Fragen", frage_id, "Folgeknoten je Antwort", text,
             "Spalte ist leer – keine Kante ableitbar", "warnung")
        return []

    roh_kanten = []          # (antwortschluessel, kante-dict)
    alias_auftraege = []
    for klausel in split_top(text, [" / "]):
        if not klausel:
            continue
        p = find_top(klausel, " → ")
        if p < 0:
            warn("Fragen", frage_id, "Folgeknoten je Antwort", klausel,
                 "Klausel ohne '→' – Antwort und Ziel nicht trennbar", "warnung")
            continue
        antwort_roh = klausel[:p].strip()
        rest = klausel[p + 3:].strip()
        schluessel, sicher = loese_antwort(antwort_roh, optionen, aliase)
        if not sicher or not schluessel:
            warn("Fragen", frage_id, "Folgeknoten je Antwort", klausel,
                 f"Antwortkürzel '{antwort_roh}' passt zu keiner Antwortoption",
                 "warnung")
            continue
        try:
            kanten = _parse_rest(rest, Bed())
        except FolgeknotenFehler as fehler:
            warn("Fragen", frage_id, "Folgeknoten je Antwort", klausel,
                 str(fehler), "warnung")
            continue
        for s in schluessel:
            for k in kanten:
                kopie = dict(k)
                kopie["_roh"] = klausel
                if "_alias" in kopie:
                    alias_auftraege.append((s, kopie))
                else:
                    roh_kanten.append((s, kopie))

    # Aliase ("Unsicher → wie 'Ja' …") auflösen
    for s, auftrag in alias_auftraege:
        ziel_schluessel, sicher = loese_antwort(auftrag["_alias"], optionen, aliase)
        vorlagen = [k for a, k in roh_kanten if sicher and a in ziel_schluessel]
        if not vorlagen:
            warn("Fragen", frage_id, "Folgeknoten je Antwort", auftrag["_roh"],
                 f"Verweis \"wie '{auftrag['_alias']}'\" ist nicht auflösbar",
                 "warnung")
            continue
        for v in vorlagen:
            kopie = dict(v)
            kopie["bedingung"] = auftrag["bedingung"].kombiniere(v["bedingung"])
            kopie["_roh"] = auftrag["_roh"]
            kopie["alias_von"] = auftrag["_alias"]
            if auftrag["_alias_rest"]:
                kopie["hinweis"] = auftrag["_alias_rest"].lstrip("+, ").strip()
            roh_kanten.append((s, kopie))

    kanten = []
    for s, k in roh_kanten:
        kante = {
            "antwort": s,
            "bedingung": k["bedingung"].als_json() if isinstance(k["bedingung"], Bed) else None,
            "ziel": k.get("ziel"),
            "ziel_typ": k.get("ziel_typ"),
            "ergebnistext": k.get("ergebnistext"),
            "weiter_mit": k.get("weiter_mit"),
        }
        for feld in ("anschluss", "ergebnis_baustein", "hinweis", "anmerkung",
                     "alias_von"):
            if k.get(feld):
                kante[feld] = k[feld]
        kante["roh"] = k.get("_roh", "")
        kanten.append(kante)
    return kanten


# ===========================================================================
# 5  Gesetzte Variablen je Frage
# ===========================================================================

VAR_ZUW_RE = re.compile(
    r"^(?P<var>[A-ZÄÖÜ][A-ZÄÖÜ0-9_]*)\s*=\s*(?P<wert>[^()]+?)\s*"
    r"\(bei\s+(?P<antwort>[^()]+)\)$")
VAR_LISTE_RE = re.compile(r"^(?P<var>[A-ZÄÖÜ][A-ZÄÖÜ0-9_]*)\s*\((?P<inhalt>.+)\)$",
                          re.S)
WERT_BEI_RE = re.compile(r"^(?P<wert>.+?)\s+bei\s+(?P<antwort>\S+)$")


def parse_gesetzte_variablen(roh: str, frage_id: str, optionen: list,
                             werte_lt_blatt: dict, warn) -> list:
    """Spalte 'Gesetzte Variable' -> Zuordnung Antwort -> Variablenwert."""
    text = norm(roh)
    if ist_leer(text):
        return []
    ergebnis = []
    for teil in split_top(text, ["; ", ", "]):
        if not teil:
            continue

        m = VAR_ZUW_RE.match(teil)
        if m:
            schl, sicher = loese_antwort(m.group("antwort"), optionen)
            ergebnis.append({
                "variable": m.group("var"),
                "zuordnung": [{"antwort": s, "wert": m.group("wert").strip()}
                              for s in schl] if sicher else [],
                "herleitung": "ausdrücklich ('… bei …')",
                "sicher": bool(sicher and schl), "roh": teil})
            if not (sicher and schl):
                warn("Fragen", frage_id, "Gesetzte Variable", teil,
                     "Antwortbezug nicht auflösbar", "warnung")
            continue

        m = VAR_LISTE_RE.match(teil)
        if not m:
            warn("Fragen", frage_id, "Gesetzte Variable", teil,
                 "Form nicht erkannt (erwartet 'VAR (…)' oder 'VAR = Wert (bei …)')",
                 "warnung")
            ergebnis.append({"variable": None, "zuordnung": [],
                             "herleitung": None, "sicher": False, "roh": teil})
            continue

        var = m.group("var")
        elemente = [e.strip() for e in split_top(m.group("inhalt"), [" / "]) if e.strip()]
        deklariert = werte_lt_blatt.get(var)

        # a) "Wert bei Antwort" bzw. namensgleiche Werte
        zuordnung, offen, explizit = [], [], False
        for el in elemente:
            mb = WERT_BEI_RE.match(el)
            if mb:
                schl, sicher = loese_antwort(mb.group("antwort"), optionen)
                if sicher and schl:
                    explizit = True
                    for s in schl:
                        zuordnung.append({"antwort": s, "wert": mb.group("wert").strip()})
                    continue
            offen.append(el)

        if explizit and offen:
            for el in offen:
                schl, sicher = loese_antwort(el, optionen)
                if sicher and len(schl) == 1:
                    zuordnung.append({"antwort": schl[0], "wert": el})
                else:
                    warn("Fragen", frage_id, "Gesetzte Variable", teil,
                         f"Wert '{el}' ist keiner Antwortoption zuzuordnen", "warnung")
            ergebnis.append({"variable": var, "zuordnung": zuordnung,
                             "herleitung": "ausdrücklich ('… bei …')",
                             "sicher": True, "roh": teil})
            continue
        if explizit:
            ergebnis.append({"variable": var, "zuordnung": zuordnung,
                             "herleitung": "ausdrücklich ('… bei …')",
                             "sicher": True, "roh": teil})
            continue

        # b) Elemente sind Antwortkürzel (z. B. "ROLLE_PRODUKT (A)")
        alle_antworten = all(loese_antwort(e, optionen)[1] for e in elemente)
        wie_deklariert = deklariert is not None and set(elemente) == set(deklariert)
        if alle_antworten and not wie_deklariert and deklariert == ["Ja", "Nein"]:
            zuordnung = []
            for el in elemente:
                for s in loese_antwort(el, optionen)[0]:
                    zuordnung.append({"antwort": s, "wert": "Ja"})
            ergebnis.append({
                "variable": var, "zuordnung": zuordnung,
                "wert_sonst": "Nein",
                "herleitung": "Antwortkürzel in Klammern; Wertebereich Ja/Nein, "
                              "übrige Antworten ergeben 'Nein'",
                "sicher": True, "roh": teil})
            continue

        # c) Elemente sind Variablenwerte -> Zuordnung zu Antwortoptionen
        treffer, alle_sicher = [], True
        for el in elemente:
            schl, sicher = loese_antwort(el, optionen)
            if sicher and len(schl) == 1:
                treffer.append({"antwort": schl[0], "wert": el})
            else:
                alle_sicher = False
                break
        if alle_sicher and len(treffer) == len(elemente):
            ergebnis.append({"variable": var, "zuordnung": treffer,
                             "herleitung": "Wert und Antwortoption namensgleich",
                             "sicher": True, "roh": teil})
            continue

        if len(elemente) == len(optionen):
            ergebnis.append({
                "variable": var,
                "zuordnung": [{"antwort": o["schluessel"], "wert": w}
                              for o, w in zip(optionen, elemente)],
                "herleitung": "positionell (Reihenfolge der Antwortoptionen)",
                "sicher": False, "roh": teil})
            warn("Fragen", frage_id, "Gesetzte Variable", teil,
                 f"Zuordnung Antwort->Wert für {var} steht nicht in der Excel; "
                 f"positionell angenommen: "
                 + ", ".join(f"{o['schluessel']}={w}"
                             for o, w in zip(optionen, elemente))
                 + " – bitte bestätigen", "warnung")
            continue

        # Das Blatt schreibt die Variable der Frage zu, nicht einzelnen
        # Antworten. Der Wert bleibt darum unbekannt – die Variable gilt aber
        # als gesetzt, sobald die Frage beantwortet ist. Bedingungen der Form
        # "VAR gesetzt" sind damit erfüllbar, Wertvergleiche liefern
        # "unbekannt" statt "falsch".
        ergebnis.append({"variable": var, "zuordnung": [],
                         "wert_unbekannt": True, "moegliche_werte": elemente,
                         "herleitung": None, "sicher": False, "roh": teil})
        warn("Fragen", frage_id, "Gesetzte Variable", teil,
             f"{len(elemente)} Werte stehen {len(optionen)} Antwortoptionen "
             "gegenüber – keine eindeutige Zuordnung ableitbar. Die Variable "
             f"gilt nach Beantwortung von {frage_id} als gesetzt, ihr Wert "
             "bleibt unbekannt; Wertvergleiche darauf liefern 'unbekannt'",
             "warnung")
    return ergebnis


# ===========================================================================
# 5b  Begriffe im Fließtext markieren
# ===========================================================================

# Beugungsendungen, die an das letzte Wort eines Begriffs treten dürfen.
_BEUGUNG = r"(?:e|en|s|es|n|er|em|ern)?"
# Adjektivendungen, die beim Stamm vorangestellter Wörter entfallen.
_ADJEKTIV_ENDE = re.compile(r"(?:es|er|em|en|e|s)$")


def _begriffsmuster(begriff: str):
    """Suchmuster für einen Begriff samt Beugung, Plural und Bindestrichform.

    "A / B" im Begriff nennt zwei eigenständige Schreibweisen und wird zu zwei
    Varianten. Innerhalb einer Variante darf zwischen den Wörtern ein
    Leerzeichen oder ein Bindestrich stehen; vorangestellte Wörter (meist
    Adjektive) werden auf ihren Stamm gekürzt, damit "Vernetztes Produkt" auch
    "vernetzte Produkte" trifft.
    """
    varianten = []
    for teil in re.split(r"\s*/\s*", begriff):
        woerter = [w for w in re.split(r"[\s\-]+", teil.strip()) if w]
        if not woerter:
            continue
        stuecke = []
        for i, wort in enumerate(woerter):
            if i == len(woerter) - 1:
                stuecke.append(re.escape(wort) + _BEUGUNG)
            else:
                stamm = _ADJEKTIV_ENDE.sub("", wort) or wort
                stuecke.append(re.escape(stamm) + r"\w{0,3}")
        varianten.append(r"[\s\-]+".join(stuecke))
    if not varianten:
        return None
    return re.compile(r"(?<![\wÄÖÜäöüß])(?:" + "|".join(varianten)
                      + r")(?![\wÄÖÜäöüß])", re.IGNORECASE)


def baue_begriffsindex(begriffe: list) -> list:
    """Längste Begriffe zuerst, damit 'Personenbezogene Daten' vor 'Daten' greift."""
    index = []
    for b in sorted(begriffe, key=lambda b: -len(b["begriff"])):
        muster = _begriffsmuster(b["begriff"])
        if muster:
            index.append((b["begriff"], muster))
    return index


def markiere_begriffe(text: str, index: list) -> list:
    """Fundstellen der Begriffe im Text, je Begriff nur das erste Vorkommen.

    Rückgabe: [{start, laenge, begriff}] – die Oberfläche schneidet den Text
    danach auf, statt zur Laufzeit im DOM zu suchen.
    """
    if not text:
        return []
    belegt = bytearray(len(text))
    spans = []
    for name, muster in index:
        for treffer in muster.finditer(text):
            a, e = treffer.span()
            if any(belegt[a:e]):
                continue
            belegt[a:e] = b"\x01" * (e - a)
            spans.append({"start": a, "laenge": e - a, "begriff": name})
            break
    spans.sort(key=lambda s: s["start"])
    return spans


def markiere_feld(eintrag: dict, feld: str, index: list):
    spans = markiere_begriffe(eintrag.get(feld) or "", index)
    if spans:
        eintrag[feld + "_begriffe"] = spans


# ===========================================================================
# 5c  Stichtage aus dem Blatt Fristen
# ===========================================================================

_DATUM_RE = re.compile(r"(\d{2})\.(\d{2})\.(\d{4})")


def _sortdatum(text: str):
    m = _DATUM_RE.search(text or "")
    if not m:
        return None
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"


# Qualifizierer vor dem Datum ordnen die Zeitleiste innerhalb desselben Tages.
_QUALIFIZIERER = (("vor ", 0), ("bis ", 1), ("nach ", 3), ("ab ", 3))


def _tagesrang(datum: str) -> int:
    klein = (datum or "").lower()
    for wort, rang in _QUALIFIZIERER:
        if klein.startswith(wort):
            return rang
    return 2


def ordne_fristen_zu(daten: dict, warn) -> dict:
    """Jede Anforderung ihrem Geltungsbeginn zuordnen.

    Die Zuordnungsregel steht im Blatt selbst: Die Zeile zum allgemeinen
    Geltungsbeginn trägt in der Spalte 'Betroffene Anforderungen' keinen
    Req-ID-Bezug, sondern 'Alle Anforderungen ohne abweichende Angabe'. Genau
    so wird gerechnet – Anforderungen ohne eigenen Eintrag fallen dorthin.
    Fristen ohne Kalenderdatum (z. B. 'Unverzüglich', '30 Arbeitstage') sind
    Handlungsfristen, kein Geltungsbeginn, und werden getrennt geführt.
    """
    alle_req = {a["req_id"] for a in daten["anforderungen"]}
    stichtage = defaultdict(list)
    handlungsfristen = defaultdict(list)
    sammelregel = None

    for nr, fr in enumerate(daten["fristen"], start=1):
        # "Nach 12.09.2025" steht zweimal im Blatt (Kapitel III und IV) – der
        # Text taugt deshalb nicht als Schlüssel.
        fr["id"] = f"FR-{nr:02d}"
        fr["sortdatum"] = _sortdatum(fr["datum"])
        fr["datiert"] = fr["sortdatum"] is not None
        fr["sammelregel"] = bool(fr["datiert"] and not fr["req_ids"]
                                 and not ist_leer(fr.get("betroffene_req_ids")))
        if fr["sammelregel"]:
            if sammelregel is not None:
                warn("Fristen", fr["datum"], "Betroffene Anforderungen",
                     fr.get("betroffene_req_ids", ""),
                     "zweite Sammelregel – die erste bleibt maßgeblich", "warnung")
            else:
                sammelregel = fr
            continue
        ziel = stichtage if fr["datiert"] else handlungsfristen
        for req in fr["req_ids"]:
            if req in alle_req:
                ziel[req].append(fr["id"])

    for a in daten["anforderungen"]:
        eigene = stichtage.get(a["req_id"], [])
        if eigene:
            a["stichtage"] = eigene
            a["stichtag_quelle"] = "Blatt Fristen"
        elif sammelregel:
            a["stichtage"] = [sammelregel["id"]]
            a["stichtag_quelle"] = sammelregel["betroffene_req_ids"]
        else:
            a["stichtage"] = []
            a["stichtag_quelle"] = None
        a["handlungsfristen"] = handlungsfristen.get(a["req_id"], [])

    zeitleiste = [{
        "id": fr["id"], "datum": fr["datum"], "sortdatum": fr["sortdatum"],
        "fundstelle": fr["fundstelle"], "bedeutung": fr["bedeutung"],
        "sammelregel": fr["sammelregel"],
        "req_ids": sorted({a["req_id"] for a in daten["anforderungen"]
                           if fr["id"] in a["stichtage"]}),
    } for fr in daten["fristen"] if fr["datiert"]]
    zeitleiste.sort(key=lambda z: (z["sortdatum"], _tagesrang(z["datum"]), z["datum"]))
    return {"zeitleiste": zeitleiste,
            "handlungsfristen": [fr for fr in daten["fristen"] if not fr["datiert"]]}


# ===========================================================================
# 6  Blätter lesen
# ===========================================================================

def zeilen(ws, ab: int = 2):
    for i, row in enumerate(ws.iter_rows(min_row=ab, values_only=True), start=ab):
        if all(z is None or norm(z) == "" for z in row):
            continue
        yield i, [norm(z) for z in row]


def lese_anforderungen(ws) -> list:
    felder = ["req_id", "kapitel", "fundstelle", "adressat", "typ", "anforderung",
              "ausloeser", "ausnahmen", "geltungsbeginn", "querverweise",
              "erwaegungsgruende", "auslegungsunsicherheit", "hinweis"]
    aus = []
    for nr, row in zeilen(ws):
        row = row + [""] * (len(felder) - len(row))
        eintrag = dict(zip(felder, row[:len(felder)]))
        eintrag["zeile"] = nr
        eintrag["erwaegungsgruende_liste"] = [
            e.strip() for e in eintrag["erwaegungsgruende"].split(",")
            if e.strip() and not ist_leer(e)]
        eintrag["querverweise_liste"] = [
            e.strip() for e in re.split(r";", eintrag["querverweise"])
            if e.strip() and not ist_leer(e)]
        aus.append(eintrag)
    return aus


def lese_ergebnisse(ws) -> list:
    felder = ["req_id", "kurztitel", "beschreibung", "fundstelle", "ab_wann",
              "naechste_schritte"]
    aus = []
    for nr, row in zeilen(ws):
        row = row + [""] * (len(felder) - len(row))
        eintrag = dict(zip(felder, row[:len(felder)]))
        eintrag["zeile"] = nr
        aus.append(eintrag)
    return aus


def lese_einfach(ws, felder) -> list:
    aus = []
    for nr, row in zeilen(ws):
        row = row + [""] * (len(felder) - len(row))
        eintrag = dict(zip(felder, row[:len(felder)]))
        eintrag["zeile"] = nr
        aus.append(eintrag)
    return aus


VARIABLE_KLARTEXT_SPALTEN = ("klartext", "bezeichnung", "name in klartext",
                             "anzeigename")


def lese_variablen(ws) -> list:
    kopf = [norm(z).lower() for z in next(ws.iter_rows(max_row=1, values_only=True))]
    klartext_spalte = next((i for i, k in enumerate(kopf)
                            if any(k.startswith(s) for s in VARIABLE_KLARTEXT_SPALTEN)),
                           None)
    aus = []
    for nr, row in zeilen(ws):
        row = row + [""] * 8
        name, frage, werte, verwendet = row[0], row[1], row[2], row[3]
        klartext = (row[klartext_spalte] if klartext_spalte is not None else "")
        aus.append({
            "name": name,
            "klartext": klartext if not ist_leer(klartext) else None,
            "gesetzt_durch": [f.strip() for f in split_top(frage, [", ", "; "]) if f.strip()],
            "werte": [w.strip() for w in split_top(werte, [" / "]) if w.strip()],
            "werte_roh": werte,
            "verwendet_in": [v.strip() for v in split_top(verwendet, [", ", "; "]) if v.strip()],
            "verwendet_in_roh": verwendet,
            "zeile": nr,
        })
    return aus


def lese_mapping(ws, warn) -> list:
    aus = []
    for nr, row in zeilen(ws):
        row = row + [""] * 7
        bed = parse_bedingung(row[5])
        if not bed["vollstaendig"]:
            warn("Mapping", row[0], "Bedingung", bed["roh"],
                 "Bedingung nicht vollständig in Variablen auflösbar – "
                 "Klartext bleibt erhalten", "hinweis")
        aus.append({
            "mapping_id": row[0],
            "frage_id": row[1],
            "antwort_roh": row[2],
            "req_id": row[3],
            "wirkung": row[4],
            "bedingung": bed,
            "kommentar": row[6],
            "zeile": nr,
        })
    return aus


# Kurztitel der Prüfstrecken. Sie stehen nicht in der Excel – das Blatt
# "Modulsteuerung" hat nur Modul, Startbedingung, Einstiegsfrage, Bemerkung.
# Sobald dort eine Spalte "Kurztitel" (oder "Modulname"/"Bezeichnung")
# ergänzt wird, gewinnt diese; die Liste hier ist nur der Rückfall, damit die
# Oberfläche die Module benennen kann. Vermerkt in NOTES.md.
MODUL_KURZTITEL_RUECKFALL = {
    "EIN": "Einstieg",
    "M-II": "IoT-Datenzugang",
    "M-III": "B2B-Bedingungen",
    "M-IV": "Vertragsklauseln",
    "M-V": "Behördenverlangen",
    "M-VI": "Cloud-Switching",
    "M-VIII": "Interoperabilität und Smart Contracts",
}
KURZTITEL_SPALTEN = ("kurztitel", "modulname", "bezeichnung", "name")


EINSTIEG_RE = re.compile(
    r"^(?P<frage>(?:EIN|II|III|IV|V|VI|VII|VIII|IX|X)-\d{2})"
    r"(?:\s*\((?:bei|wenn)\s+(?P<cond>[^()]+)\))?$")


def lese_modulsteuerung(ws, warn) -> list:
    kopf = [norm(z).lower() for z in next(ws.iter_rows(max_row=1, values_only=True))]
    titel_spalte = next((i for i, k in enumerate(kopf)
                         if any(k.startswith(s) for s in KURZTITEL_SPALTEN)), None)
    aus = []
    for nr, row in zeilen(ws):
        row = row + [""] * 8
        modul, start_roh, einstieg_roh, bemerkung = row[0], row[1], row[2], row[3]
        if titel_spalte is not None and not ist_leer(row[titel_spalte]):
            kurztitel, titel_quelle = row[titel_spalte], "Excel"
        else:
            kurztitel = MODUL_KURZTITEL_RUECKFALL.get(modul, modul)
            titel_quelle = "Rückfallliste in build_data.py"

        immer = start_roh.lower().startswith("immer")
        if immer:
            start = {"roh": start_roh, "ausdruck": None, "vollstaendig": True,
                     "klartext": [], "immer": True}
        else:
            start = parse_bedingung(start_roh)
            start["immer"] = False
            if not start["vollstaendig"]:
                warn("Modulsteuerung", modul, "Startbedingung", start_roh,
                     "Startbedingung nicht vollständig in Variablen auflösbar – "
                     "Klartext bleibt erhalten", "hinweis")

        einstiege = []
        if not ist_leer(einstieg_roh):
            vorher = []
            for teil in split_top(einstieg_roh, [", sonst ", ". sonst "]):
                m = EINSTIEG_RE.match(teil.strip())
                if not m:
                    warn("Modulsteuerung", modul, "Einstiegsfrage", teil,
                         "Einstieg nicht eindeutig zerlegbar", "warnung")
                    continue
                cond = (m.group("cond") or "").strip()
                if VAR_RE.match(cond):
                    # "II-01 (bei ROLLE_PRODUKT)" nennt nur den Variablennamen;
                    # gemeint ist der gesetzte Wert Ja (Wertebereich Ja/Nein).
                    cond = cond + " = Ja"
                bed = Bed()
                if cond:
                    bed = Bed.aus_text(cond)
                if not cond and vorher:
                    for v in vorher:
                        bed = bed.kombiniere(v.negiert())
                elif cond and vorher:
                    neu = Bed()
                    for v in vorher:
                        neu = neu.kombiniere(v.negiert())
                    bed = neu.kombiniere(bed)
                if cond:
                    vorher.append(Bed.aus_text(cond))
                einstiege.append({"frage_id": m.group("frage"),
                                  "bedingung": bed.als_json()})
        aus.append({"modul": modul, "kurztitel": kurztitel,
                    "kurztitel_quelle": titel_quelle,
                    "startbedingung": start,
                    "einstiegsfragen": einstiege, "einstieg_roh": einstieg_roh,
                    "bemerkung": bemerkung, "zeile": nr})
    return aus


def lese_fragen(ws, variablen_werte, warn) -> list:
    aus = []
    for nr, row in zeilen(ws):
        row = row + [""] * 9
        (fid, modul, frage, opt_roh, folge_roh, anzeige_roh,
         erklaer, rechtsgrundlage, var_roh) = row[:9]
        optionen = parse_optionen(opt_roh)
        if not optionen:
            warn("Fragen", fid, "Antwortoptionen", opt_roh,
                 "keine Antwortoptionen erkennbar", "warnung")
        anzeige = parse_bedingung(anzeige_roh)
        if not anzeige["vollstaendig"]:
            warn("Fragen", fid, "Anzeigebedingung", anzeige["roh"],
                 "Anzeigebedingung nicht vollständig in Variablen auflösbar – "
                 "Klartext bleibt erhalten", "hinweis")
        # Reihenfolge: erst die gesetzten Variablen, denn ihre Werte liefern
        # die Aliasnamen der Antwortoptionen (z. B. "Kleinst" für die Option
        # "Kleinstunternehmen (< 10 …)"), die in den Folgeknoten stehen.
        gesetzte = parse_gesetzte_variablen(var_roh, fid, optionen,
                                            variablen_werte, warn)
        aliase = {}
        for gv in gesetzte:
            for zu in gv["zuordnung"]:
                aliase.setdefault(zu["wert"].lower(), zu["antwort"])
        kanten = parse_folgeknoten(folge_roh, fid, optionen, warn, aliase)
        aus.append({
            "id": fid, "modul": modul, "frage": frage,
            "antwortoptionen": optionen,
            "antwort_aliase": aliase,
            "kanten": kanten,
            "folgeknoten_roh": norm(folge_roh),
            "anzeigebedingung": anzeige,
            "erklaertext": erklaer,
            "rechtsgrundlage": rechtsgrundlage,
            "gesetzte_variablen": gesetzte,
            "gesetzte_variable_roh": norm(var_roh),
            "zeile": nr,
        })
    return aus


# ===========================================================================
# 7  Blatt QS (inkl. Testprofilen aus Abschnitt 6)
# ===========================================================================

ABSCHNITT_RE = re.compile(r"^(\d+)\.\s+(.*)$")
VORBEHALT_RE = re.compile(r"(DA-[IVX]+-\d{3})\s*:\s*\[([^\]]*)\]")


def lese_qs(ws) -> dict:
    rohzeilen = []
    for i, row in enumerate(ws.iter_rows(values_only=True), start=1):
        rohzeilen.append((i, [norm(z) for z in row]))

    kopfzeilen, abschnitte = [], []
    aktuell = None
    erwartet_kopf = False
    for nr, row in rohzeilen:
        if all(z == "" for z in row):
            continue
        m = ABSCHNITT_RE.match(row[0])
        if m and row[0].count(".") >= 1 and len(row[0]) < 120:
            aktuell = {"nummer": m.group(1), "titel": m.group(2).strip(),
                       "spalten": [], "zeilen": [], "quellzeile": nr}
            abschnitte.append(aktuell)
            erwartet_kopf = True
            continue
        if aktuell is None:
            kopfzeilen.append(row[0])
            continue
        if erwartet_kopf:
            aktuell["spalten"] = [z for z in row if z != ""]
            erwartet_kopf = False
            continue
        werte = row[:len(aktuell["spalten"])] if aktuell["spalten"] else row
        aktuell["zeilen"].append({
            "zeile": nr,
            "werte": dict(zip(aktuell["spalten"], werte)) if aktuell["spalten"]
                     else {"Text": row[0]},
        })

    testfaelle = []
    for ab in abschnitte:
        if ab["nummer"] != "6":
            continue
        for eintrag in ab["zeilen"]:
            w = eintrag["werte"]
            spalten = list(w.values())
            profil = spalten[0] if spalten else ""
            m = re.match(r"^(T\d+)\s+(.*)$", profil, re.S)
            pfad_text = spalten[2] if len(spalten) > 2 else ""
            ausgeloest_text = spalten[3] if len(spalten) > 3 else ""
            ausgeschl_text = spalten[4] if len(spalten) > 4 else ""
            erwartung = spalten[5] if len(spalten) > 5 else ""
            vorbehalt_text = spalten[6] if len(spalten) > 6 else ""
            try:
                anzahl = int(spalten[1])
            except (ValueError, IndexError):
                anzahl = None
            testfaelle.append({
                "profil_id": m.group(1) if m else profil,
                "bezeichnung": m.group(2).strip() if m else profil,
                "anzahl_fragen": anzahl,
                "pfad": [p.strip() for p in pfad_text.split("→") if p.strip()],
                "pfad_roh": pfad_text,
                "erwartet_ausgeloest": _req_liste(ausgeloest_text),
                "erwartet_ausgeschlossen": _req_liste(ausgeschl_text),
                "erwartung_text": erwartung,
                "vorbehaltsaufloesungen": [
                    {"req_id": r, "fragen": [f.strip(" '\"")
                                             for f in inner.split(",") if f.strip()]}
                    for r, inner in VORBEHALT_RE.findall(vorbehalt_text)],
                "zeile": eintrag["zeile"],
            })
    return {"kopf": kopfzeilen, "abschnitte": abschnitte, "testfaelle": testfaelle}


def _req_liste(text: str) -> list:
    gesehen, aus = set(), []
    for req in REQ_SUCH_RE.findall(text or ""):
        if req not in gesehen:
            gesehen.add(req)
            aus.append(req)
    return aus


# ===========================================================================
# 8  Validierung
# ===========================================================================

def validiere(daten: dict, warn) -> list:
    fehler = []
    fragen = {f["id"]: f for f in daten["fragen"]}
    req_anf = {a["req_id"] for a in daten["anforderungen"]}
    req_erg = {e["req_id"] for e in daten["ergebnisse"]}
    var_namen = {v["name"] for v in daten["variablen"]}

    def melde(regel, text):
        fehler.append(f"[{regel}] {text}")

    # --- 1  referenzierte Frage-IDs -----------------------------------------
    for f in daten["fragen"]:
        for k in f["kanten"]:
            if k["ziel_typ"] == "frage" and k["ziel"] not in fragen:
                melde("Frage-ID", f"{f['id']}: Kante '{k['roh']}' verweist auf "
                                   f"unbekannte Frage {k['ziel']}")
            if k["weiter_mit"] and k["weiter_mit"] not in fragen:
                melde("Frage-ID", f"{f['id']}: 'weiter mit {k['weiter_mit']}' "
                                  f"verweist auf unbekannte Frage")
            for ref in sammle_fragen_refs((k["bedingung"] or {}).get("ausdruck")):
                if ref not in fragen:
                    melde("Frage-ID", f"{f['id']}: Bedingung verweist auf "
                                      f"unbekannte Frage {ref}")
        for ref in sammle_fragen_refs(f["anzeigebedingung"]["ausdruck"]):
            if ref not in fragen:
                melde("Frage-ID", f"{f['id']}: Anzeigebedingung verweist auf "
                                  f"unbekannte Frage {ref}")
    for m in daten["module"]:
        for e in m["einstiegsfragen"]:
            if e["frage_id"] not in fragen:
                melde("Frage-ID", f"Modul {m['modul']}: Einstiegsfrage "
                                  f"{e['frage_id']} existiert nicht")
    for m in daten["mapping"]:
        if m["frage_id"] not in fragen:
            melde("Frage-ID", f"{m['mapping_id']}: unbekannte Frage "
                              f"{m['frage_id']}")

    # --- 2  Req-IDs aus dem Mapping ----------------------------------------
    for m in daten["mapping"]:
        if m["req_id"] not in req_anf:
            melde("Req-ID", f"{m['mapping_id']}: {m['req_id']} fehlt im Blatt "
                            "'Anforderungen'")
        if m["req_id"] not in req_erg:
            melde("Req-ID", f"{m['mapping_id']}: {m['req_id']} fehlt im Blatt "
                            "'Ergebnisse'")

    # --- 3  Antwortoptionen: genau ein widerspruchsfreies Ziel --------------
    for f in daten["fragen"]:
        for opt in f["antwortoptionen"]:
            kanten = [k for k in f["kanten"] if k["antwort"] == opt["schluessel"]]
            if not kanten:
                melde("Antwortziel", f"{f['id']}: Antwortoption "
                                     f"'{opt['schluessel']}' hat kein Ziel")
                continue
            ohne_bedingung = [k for k in kanten if not k["bedingung"]]
            ziele = {(k["ziel"], k["ergebnistext"], k["weiter_mit"])
                     for k in ohne_bedingung}
            if len(ziele) > 1:
                melde("Antwortziel",
                      f"{f['id']}/{opt['schluessel']}: mehrere unbedingte Ziele "
                      + ", ".join(sorted(str(z[0]) for z in ziele)))
            nach_bedingung = defaultdict(set)
            for k in kanten:
                if k["bedingung"]:
                    nach_bedingung[k["bedingung"]["quelltext"]].add(
                        (k["ziel"], k["ergebnistext"], k["weiter_mit"]))
            for quelltext, zielmenge in nach_bedingung.items():
                if len(zielmenge) > 1:
                    melde("Antwortziel",
                          f"{f['id']}/{opt['schluessel']}: Bedingung "
                          f"'{quelltext}' führt zu mehreren Zielen "
                          + ", ".join(sorted(str(z[0]) for z in zielmenge)))
            if ohne_bedingung and nach_bedingung:
                melde("Antwortziel",
                      f"{f['id']}/{opt['schluessel']}: unbedingtes Ziel und "
                      "bedingte Ziele gleichzeitig – Reihenfolge unklar")

    # --- 4  Zyklen ----------------------------------------------------------
    nachfolger = defaultdict(set)
    for f in daten["fragen"]:
        for k in f["kanten"]:
            if k["ziel_typ"] == "frage":
                nachfolger[f["id"]].add(k["ziel"])
            if k["weiter_mit"]:
                nachfolger[f["id"]].add(k["weiter_mit"])
    farbe, pfad = {}, []

    def dfs(knoten):
        farbe[knoten] = "grau"
        pfad.append(knoten)
        for n in sorted(nachfolger.get(knoten, ())):
            if n not in fragen:
                continue
            if farbe.get(n) == "grau":
                ab = pfad.index(n)
                melde("Zyklus", "Zyklus im Fragengraph: "
                      + " → ".join(pfad[ab:] + [n]))
            elif farbe.get(n) is None:
                dfs(n)
        pfad.pop()
        farbe[knoten] = "schwarz"

    for fid in fragen:
        if farbe.get(fid) is None:
            dfs(fid)

    # --- 5  Erreichbarkeit --------------------------------------------------
    start = {e["frage_id"] for m in daten["module"] for e in m["einstiegsfragen"]}
    erreicht, stapel = set(), sorted(start)
    while stapel:
        aktuell = stapel.pop()
        if aktuell in erreicht:
            continue
        erreicht.add(aktuell)
        stapel.extend(n for n in nachfolger.get(aktuell, ()) if n in fragen)
    for fid in fragen:
        if fid not in erreicht:
            melde("Erreichbarkeit", f"Frage {fid} ist von keinem Moduleinstieg "
                                    "aus erreichbar")

    # --- 6  Variablen in Bedingungen ---------------------------------------
    def pruefe_vars(ausdruck, ort):
        for v in sammle_variablen(ausdruck):
            if v not in var_namen:
                melde("Variable", f"{ort}: Variable {v} fehlt im Blatt 'Variablen'")

    for f in daten["fragen"]:
        pruefe_vars(f["anzeigebedingung"]["ausdruck"], f"{f['id']}/Anzeigebedingung")
        for k in f["kanten"]:
            pruefe_vars((k["bedingung"] or {}).get("ausdruck"),
                        f"{f['id']}/Kante '{k['antwort']}'")
        for gv in f["gesetzte_variablen"]:
            if gv["variable"] and gv["variable"] not in var_namen:
                melde("Variable", f"{f['id']}: gesetzte Variable "
                                  f"{gv['variable']} fehlt im Blatt 'Variablen'")
    for m in daten["mapping"]:
        pruefe_vars(m["bedingung"]["ausdruck"], f"{m['mapping_id']}/Bedingung")
    for m in daten["module"]:
        pruefe_vars(m["startbedingung"]["ausdruck"], f"Modul {m['modul']}/Start")
        for e in m["einstiegsfragen"]:
            pruefe_vars((e["bedingung"] or {}).get("ausdruck"),
                        f"Modul {m['modul']}/Einstieg {e['frage_id']}")
    return fehler


# ===========================================================================
# 9  Inhaltliche Auffälligkeiten (nicht blockierend)
# ===========================================================================

def pruefe_auffaelligkeiten(daten: dict) -> list:
    auf = []

    def note(bereich, text):
        auf.append({"bereich": bereich, "text": text})

    req_anf = [a["req_id"] for a in daten["anforderungen"]]
    req_erg = [e["req_id"] for e in daten["ergebnisse"]]
    for name, liste in (("Anforderungen", req_anf), ("Ergebnisse", req_erg)):
        doppelt = sorted({r for r in liste if liste.count(r) > 1})
        if doppelt:
            note(name, "doppelte Req-IDs: " + ", ".join(doppelt))
    nur_anf = sorted(set(req_anf) - set(req_erg))
    nur_erg = sorted(set(req_erg) - set(req_anf))
    if nur_anf:
        note("Ergebnisse", "ohne Ergebnistext: " + ", ".join(nur_anf))
    if nur_erg:
        note("Anforderungen", "ohne Anforderungssatz: " + ", ".join(nur_erg))

    # Geltungsbeginn vs. "Ab wann"
    ab_wann = {e["req_id"]: e["ab_wann"] for e in daten["ergebnisse"]}
    abweichend = [a["req_id"] for a in daten["anforderungen"]
                  if a["req_id"] in ab_wann
                  and a["geltungsbeginn"] != ab_wann[a["req_id"]]]
    if abweichend:
        note("Geltungsbeginn",
             f"{len(abweichend)} Anforderungen mit abweichendem Text in "
             "'Geltungsbeginn' (Anforderungen) und 'Ab wann' (Ergebnisse): "
             + ", ".join(abweichend[:10])
             + (" …" if len(abweichend) > 10 else ""))

    # Von keinem Mapping erreichte Anforderungen
    gemappt = {m["req_id"] for m in daten["mapping"]}
    nie = sorted(set(req_anf) - gemappt)
    if nie:
        note("Mapping", f"{len(nie)} Anforderungen werden von keiner Frage "
                        "erreicht: " + ", ".join(nie))

    # Fragen ohne Mapping-Wirkung
    fragen_ids = [f["id"] for f in daten["fragen"]]
    gemappte_fragen = {m["frage_id"] for m in daten["mapping"]}
    ohne = [f for f in fragen_ids if f not in gemappte_fragen]
    if ohne:
        note("Mapping", "Fragen ohne Mapping-Eintrag: " + ", ".join(ohne))

    # Variablen: deklariert vs. tatsächlich gesetzt / verwendet
    gesetzt_ist = defaultdict(set)
    for f in daten["fragen"]:
        for gv in f["gesetzte_variablen"]:
            if gv["variable"]:
                gesetzt_ist[gv["variable"]].add(f["id"])
    benutzt = set()
    for f in daten["fragen"]:
        benutzt |= sammle_variablen(f["anzeigebedingung"]["ausdruck"])
        for k in f["kanten"]:
            benutzt |= sammle_variablen((k["bedingung"] or {}).get("ausdruck"))
    for m in daten["mapping"]:
        benutzt |= sammle_variablen(m["bedingung"]["ausdruck"])
    for m in daten["module"]:
        benutzt |= sammle_variablen(m["startbedingung"]["ausdruck"])
        for e in m["einstiegsfragen"]:
            benutzt |= sammle_variablen((e["bedingung"] or {}).get("ausdruck"))

    for v in daten["variablen"]:
        soll = set(v["gesetzt_durch"])
        ist = gesetzt_ist.get(v["name"], set())
        if soll != ist:
            note("Variablen", f"{v['name']}: laut Blatt gesetzt durch "
                 f"{', '.join(sorted(soll)) or '—'}, tatsächlich durch "
                 f"{', '.join(sorted(ist)) or '—'}")
    nur_ausgabe, widerspruch = [], []
    for v in daten["variablen"]:
        if v["name"] in benutzt:
            continue
        if "nur Ergebnisausgabe" in v["verwendet_in_roh"] or ist_leer(v["verwendet_in_roh"]):
            nur_ausgabe.append(v["name"])
        else:
            widerspruch.append(f"{v['name']} (laut Blatt: {v['verwendet_in_roh']})")
    if nur_ausgabe:
        note("Variablen", f"{len(nur_ausgabe)} Variablen steuern nichts, sondern "
             "gehen laut Blatt nur in die Ergebnisausgabe ein – für den "
             "Entscheidungsbaum nur als Anzeigewert relevant: "
             + ", ".join(sorted(nur_ausgabe)))
    if widerspruch:
        note("Variablen", "laut Blatt in Fragen verwendet, tatsächlich in keiner "
             "auswertbaren Bedingung: " + "; ".join(sorted(widerspruch)))

    # Mapping-Antworten, die zu keiner Antwortoption passen
    offen = [m["mapping_id"] for m in daten["mapping"] if not m.get("antworten")]
    if offen:
        note("Mapping", f"{len(offen)} Mapping-Zeilen ohne auflösbaren "
             "Antwortbezug: " + ", ".join(offen[:10])
             + (" …" if len(offen) > 10 else ""))

    # Modul-Kurztitel: einziger Text, der nicht aus der Excel stammt
    rueckfall = [m["modul"] for m in daten["module"]
                 if m.get("kurztitel_quelle") != "Excel"]
    if rueckfall:
        note("Modulsteuerung",
             "Die Prüfstrecken haben in der Excel keinen Namen. Für die "
             "Oberfläche stammen die Kurztitel von "
             + ", ".join(rueckfall) + " aus der Rückfallliste in "
             "build_data.py – der einzige angezeigte Text, der nicht aus der "
             "Excel kommt. Eine Spalte 'Kurztitel' im Blatt 'Modulsteuerung' "
             "würde sie übernehmen.")

    # Fristen: referenzierte Req-IDs
    unbekannt = set()
    for fr in daten["fristen"]:
        for req in REQ_SUCH_RE.findall(fr.get("betroffene_req_ids", "")):
            if req not in set(req_anf):
                unbekannt.add(req)
    if unbekannt:
        note("Fristen", "unbekannte Req-IDs: " + ", ".join(sorted(unbekannt)))

    # Kennzahlen des QS-Blatts gegen die gelesenen Daten
    kopf = " ".join(daten["qs"]["kopf"])
    m = re.search(r"(\d+)\s+Anforderungen,\s*(\d+)\s+Fragen,\s*(\d+)\s+"
                  r"Mapping-Verknüpfungen", kopf)
    if m:
        soll = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
        ist = (len(daten["anforderungen"]), len(daten["fragen"]),
               len(daten["mapping"]))
        if soll != ist:
            note("QS", f"Kennzahlen laut QS-Blatt {soll}, gelesen {ist}")

    # QS-Abschnitt 1 gegen die tatsächlich nicht erreichten Anforderungen
    for ab in daten["qs"]["abschnitte"]:
        if ab["nummer"] == "1":
            genannt = sorted({z["werte"].get("Req-ID", "") for z in ab["zeilen"]}
                             - {""})
            if genannt and genannt != nie:
                note("QS", "Abschnitt 1 nennt "
                     + (", ".join(genannt) or "—")
                     + "; berechnet wurde " + (", ".join(nie) or "—"))
    return auf


# ===========================================================================
# 10  Zusammenbau
# ===========================================================================

class Warnsammler:
    def __init__(self):
        self.eintraege = []

    def __call__(self, blatt, bezug, feld, rohtext, problem, schwere="warnung"):
        self.eintraege.append({
            "blatt": blatt, "bezug": bezug, "feld": feld,
            "rohtext": (rohtext or "")[:400], "problem": problem,
            "schwere": schwere})

    def nach_schwere(self, schwere):
        return [e for e in self.eintraege if e["schwere"] == schwere]


def baue(excel_pfad: str) -> tuple:
    warn = Warnsammler()
    wb = openpyxl.load_workbook(excel_pfad, data_only=True)

    fehlende = [b for b in ("Fragen", "Variablen", "Modulsteuerung", "Mapping",
                            "Anforderungen", "Ergebnisse", "Begriffe", "Fristen",
                            "Offene Punkte", "QS", "Legende")
                if b not in wb.sheetnames]
    if fehlende:
        sys.exit("Fehlende Blätter in der Excel: " + ", ".join(fehlende))

    variablen = lese_variablen(wb["Variablen"])
    variablen_werte = {v["name"]: v["werte"] for v in variablen}

    fragen = lese_fragen(wb["Fragen"], variablen_werte, warn)
    module = lese_modulsteuerung(wb["Modulsteuerung"], warn)
    mapping = lese_mapping(wb["Mapping"], warn)
    anforderungen = lese_anforderungen(wb["Anforderungen"])
    ergebnisse = lese_ergebnisse(wb["Ergebnisse"])
    begriffe = lese_einfach(wb["Begriffe"],
                            ["begriff", "fundstelle", "definition",
                             "abgrenzung", "relevanz"])
    fristen = lese_einfach(wb["Fristen"],
                           ["datum", "fundstelle", "betroffene_req_ids",
                            "bedeutung"])
    offene = lese_einfach(wb["Offene Punkte"],
                          ["kategorie", "fundstelle", "punkt", "auswirkung",
                           "prioritaet"])
    legende = lese_einfach(wb["Legende"], ["element", "erlaeuterung"])
    qs = lese_qs(wb["QS"])

    # Mapping-Antworten auf Antwortoptionen abbilden
    optionen_je_frage = {f["id"]: f["antwortoptionen"] for f in fragen}
    aliase_je_frage = {f["id"]: f["antwort_aliase"] for f in fragen}
    for m in mapping:
        optionen = optionen_je_frage.get(m["frage_id"], [])
        schluessel, sicher = loese_antwort(m["antwort_roh"], optionen,
                                           aliase_je_frage.get(m["frage_id"]))
        m["antworten"] = schluessel if sicher else []
        m["antwort_alle"] = m["antwort_roh"].strip().lower() in ("alle antworten", "alle")
        if not (sicher and schluessel):
            warn("Mapping", m["mapping_id"], "Antwort", m["antwort_roh"],
                 f"Antwort passt zu keiner Antwortoption von {m['frage_id']}",
                 "warnung")

    for fr in fristen:
        fr["req_ids"] = _req_liste(fr.get("betroffene_req_ids", ""))

    # Begriffe in allen angezeigten Fließtexten markieren
    begriffsindex = baue_begriffsindex(begriffe)
    for f in fragen:
        markiere_feld(f, "frage", begriffsindex)
        markiere_feld(f, "erklaertext", begriffsindex)
        for k in f["kanten"]:
            for feld in ("ergebnistext", "ergebnis_baustein", "hinweis"):
                if k.get(feld):
                    markiere_feld(k, feld, begriffsindex)
    for e in ergebnisse:
        markiere_feld(e, "beschreibung", begriffsindex)
        markiere_feld(e, "naechste_schritte", begriffsindex)
    for a in anforderungen:
        for feld in ("anforderung", "ausloeser", "ausnahmen"):
            markiere_feld(a, feld, begriffsindex)

    # Rollen an den Moduleinstiegen: Das Blatt Modulsteuerung nennt die Variable
    # ("II-01 (bei ROLLE_PRODUKT)"), den Klartext liefert die Antwortoption in
    # EIN-01, die diese Variable auf Ja setzt.
    frage_nach_id_roh = {f["id"]: f for f in fragen}
    setzt_variable = {}
    for f in fragen:
        for gv in f["gesetzte_variablen"]:
            if not gv.get("variable"):
                continue
            for zu in gv["zuordnung"]:
                if zu["wert"] == "Ja":
                    option = next((o for o in f["antwortoptionen"]
                                   if o["schluessel"] == zu["antwort"]), None)
                    setzt_variable[gv["variable"]] = {
                        "frage_id": f["id"], "antwort": zu["antwort"],
                        "text": option["text"] if option else zu["antwort"]}
    def positive_rolle(knoten, verneint=False):
        """Rechte, nicht verneinte Bedingung 'ROLLE_X = Ja' aus dem Ausdruck.

        Die Einstiege stehen in Vorrangfolge, ihre Bedingungen tragen deshalb
        die Verneinungen der vorangehenden mit: II-09 heißt
        "nicht ROLLE_PRODUKT und ROLLE_NUTZER = Ja". Gesucht ist die eigene,
        positive Rolle.
        """
        if not isinstance(knoten, dict):
            return None
        if knoten.get("op") == "nicht":
            return positive_rolle(knoten.get("operand"), not verneint)
        if knoten.get("op") in ("und", "oder"):
            return (positive_rolle(knoten.get("rechts"), verneint)
                    or positive_rolle(knoten.get("links"), verneint))
        if (not verneint and knoten.get("op") == "=" and knoten.get("wert") == "Ja"
                and str(knoten.get("variable", "")).startswith("ROLLE_")):
            return knoten["variable"]
        return None

    for m in module:
        for e in m["einstiegsfragen"]:
            variable = positive_rolle((e.get("bedingung") or {}).get("ausdruck"))
            if not variable:
                # "… sonst VI-09" nennt keine eigene Rolle; dann steht sie in
                # der Anzeigebedingung der Einstiegsfrage.
                frage = frage_nach_id_roh.get(e["frage_id"])
                a = (frage or {}).get("anzeigebedingung", {}).get("ausdruck") or {}
                # Nur wenn die Anzeigebedingung aus genau einer Rolle besteht.
                # Bei M-III etwa nennt sie mehrere Rollen und beschreibt damit
                # keinen Rollenzweig.
                if (a.get("op") == "=" and a.get("wert") == "Ja"
                        and str(a.get("variable", "")).startswith("ROLLE_")):
                    variable = a["variable"]
            if variable:
                quelle = setzt_variable.get(variable)
                e["rolle"] = {"variable": variable,
                              "beschreibung": quelle["text"] if quelle else None,
                              "frage_id": quelle["frage_id"] if quelle else None}

    # Herkunft je Variable für die Erklärung am Ergebnis
    frage_nach_id = {f["id"]: f for f in fragen}
    for v in variablen:
        quelle = next((frage_nach_id[fid] for fid in v["gesetzt_durch"]
                       if fid in frage_nach_id), None)
        v["frage_text"] = quelle["frage"] if quelle else None
        v["wert_texte"] = {}
        if quelle:
            for gv in quelle["gesetzte_variablen"]:
                if gv.get("variable") != v["name"]:
                    continue
                for zu in gv["zuordnung"]:
                    option = next((o for o in quelle["antwortoptionen"]
                                   if o["schluessel"] == zu["antwort"]), None)
                    if option:
                        v["wert_texte"][zu["wert"]] = option["text"]

    daten = {
        "meta": {
            "quelle": os.path.basename(excel_pfad),
            "erzeugt_am": datetime.datetime.now().replace(microsecond=0).isoformat(),
            "erzeugt_durch": "build_data.py",
            "schema": "dataact-entscheidungsbaum/1",
            "wirkungsrangfolge": ["schließt aus", "verschiebt Geltungsbeginn",
                                  "löst aus", "schränkt ein"],
            "hinweis": "Alle Inhalte stammen unverändert aus der Excel. "
                       "Nicht eindeutig zerlegbare Stellen sind als Klartext "
                       "erhalten (Ausdrucksatom 'unklar') und in 'warnungen' "
                       "aufgeführt.",
        },
        "module": module,
        "fragen": fragen,
        "variablen": variablen,
        "mapping": mapping,
        "anforderungen": anforderungen,
        "ergebnisse": ergebnisse,
        "begriffe": begriffe,
        "fristen": fristen,
        "offene_punkte": offene,
        "legende": legende,
        "qs": qs,
    }

    fristen_info = ordne_fristen_zu(daten, warn)
    daten["zeitleiste"] = fristen_info["zeitleiste"]

    fehler = validiere(daten, warn)
    daten["auffaelligkeiten"] = pruefe_auffaelligkeiten(daten)
    daten["warnungen"] = warn.eintraege
    daten["meta"]["anzahl"] = {
        "module": len(module), "fragen": len(fragen),
        "kanten": sum(len(f["kanten"]) for f in fragen),
        "variablen": len(variablen), "mapping": len(mapping),
        "anforderungen": len(anforderungen), "ergebnisse": len(ergebnisse),
        "begriffe": len(begriffe), "fristen": len(fristen),
        "offene_punkte": len(offene), "legende": len(legende),
        "qs_abschnitte": len(qs["abschnitte"]), "testprofile": len(qs["testfaelle"]),
        "zeitleiste": len(daten["zeitleiste"]),
        "begriffsmarkierungen": sum(
            len(v) for gruppe in (fragen, ergebnisse, anforderungen)
            for eintrag in gruppe
            for k, v in eintrag.items() if k.endswith("_begriffe"))
            + sum(len(v) for f in fragen for k in f["kanten"]
                  for kk, v in k.items() if kk.endswith("_begriffe")),
        "warnungen": len(warn.nach_schwere("warnung")),
        "hinweise": len(warn.nach_schwere("hinweis")),
    }
    return daten, fehler, warn


MARKER_START = "<!-- TESTPROFILE:START -->"
MARKER_ENDE = "<!-- TESTPROFILE:END -->"
MANUELL_START = "<!-- MANUELL:START -->"
MANUELL_ENDE = "<!-- MANUELL:END -->"


def _erhalte(text: str, start: str, ende: str) -> str:
    if start in text and ende in text:
        return text[text.index(start) + len(start): text.index(ende)].strip("\n")
    return ""


def schreibe_notes(pfad: str, daten: dict, warn: Warnsammler):
    alt_block = manuell = ""
    if os.path.exists(pfad):
        alt = open(pfad, encoding="utf-8").read()
        alt_block = _erhalte(alt, MARKER_START, MARKER_ENDE)
        manuell = _erhalte(alt, MANUELL_START, MANUELL_ENDE)

    z = []
    z.append("# NOTES – Data-Act-Entscheidungsbaum, Datengrundlage\n")
    z.append(f"Erzeugt von `build_data.py` am {daten['meta']['erzeugt_am']} "
             f"aus `{daten['meta']['quelle']}`. Diese Datei wird bei jedem Lauf "
             "neu geschrieben; der Abschnitt „Testprofile\" stammt aus "
             "`verify_data.py` und bleibt dabei erhalten.\n")

    z.append("## 1 Umfang der erzeugten data.json\n")
    z.append("| Objekt | Einträge |")
    z.append("| --- | ---: |")
    for k, v in daten["meta"]["anzahl"].items():
        z.append(f"| {k} | {v} |")
    z.append("")

    warnungen = warn.nach_schwere("warnung")
    z.append("## 2 Warnliste – nicht eindeutig parsebare Stellen\n")
    z.append("Nichts davon wurde geraten oder verworfen. Die betroffenen Stellen "
             "stehen als Klartext in der data.json und können am Ergebnis "
             "angezeigt werden.\n")
    if warnungen:
        z.append("| Blatt | Bezug | Feld | Problem | Rohtext |")
        z.append("| --- | --- | --- | --- | --- |")
        for e in warnungen:
            z.append("| {blatt} | {bezug} | {feld} | {problem} | `{roh}` |".format(
                blatt=e["blatt"], bezug=e["bezug"], feld=e["feld"],
                problem=e["problem"].replace("|", "\\|"),
                roh=e["rohtext"].replace("|", "\\|").replace("\n", " ")[:200]))
    else:
        z.append("Keine. Alle Fließtextspalten waren eindeutig zerlegbar.")
    z.append("")

    hinweise = warn.nach_schwere("hinweis")
    z.append("### 2b Bedingungen mit Klartextanteil\n")
    z.append("Diese Bedingungen sind fachlich formuliert und nicht vollständig "
             "auf Variablen zurückführbar. Sie werden in der Simulation als "
             "erfüllt behandelt (neutral) und im JSON als Klartext mitgeführt.\n")
    if hinweise:
        gruppen = defaultdict(list)
        for e in hinweise:
            gruppen[(e["blatt"], e["feld"], e["rohtext"])].append(e["bezug"])
        z.append("| Blatt | Feld | Rohtext | betroffene Zeilen |")
        z.append("| --- | --- | --- | --- |")
        for (blatt, feld, roh), bezuege in sorted(gruppen.items()):
            zeigen = ", ".join(bezuege[:4]) + (" …" if len(bezuege) > 4 else "")
            z.append(f"| {blatt} | {feld} | `{roh[:160]}` | {len(bezuege)} "
                     f"({zeigen}) |")
    else:
        z.append("Keine.")
    z.append("")

    z.append("## 3 Testprofile aus QS-Abschnitt 6\n")
    z.append(MARKER_START)
    z.append(alt_block if alt_block else
             "_Noch nicht berechnet – `python3 verify_data.py` ausführen._")
    z.append(MARKER_ENDE)
    z.append("")

    z.append("## 4 Inhaltliche Auffälligkeiten\n")
    z.append("### 4a Von Hand notiert\n")
    z.append("Dieser Abschnitt bleibt bei jedem Lauf erhalten.\n")
    z.append(MANUELL_START)
    z.append(manuell if manuell else "_(noch leer)_")
    z.append(MANUELL_ENDE)
    z.append("")
    z.append("### 4b Maschinell abgeleitet\n")
    z.append("Aus der Excel berechnet, nichts davon wurde geändert.\n")
    if daten["auffaelligkeiten"]:
        for a in daten["auffaelligkeiten"]:
            z.append(f"- **{a['bereich']}:** {a['text']}")
    else:
        z.append("Keine.")
    z.append("")

    with open(pfad, "w", encoding="utf-8") as fh:
        fh.write("\n".join(z))


# ===========================================================================
# 11  Auslieferungsdatei (--inline)
# ===========================================================================

# Felder, die nur der Nachvollziehbarkeit in data.json dienen und in der
# HTML-Datei keinen Zweck haben. Inhalte werden dabei nicht verändert,
# nur Herkunftsangaben und Rohtexte weggelassen.
NUR_DATEI = ("zeile", "folgeknoten_roh", "quelltext", "einstieg_roh",
             "gesetzte_variable_roh", "werte_roh", "verwendet_in_roh",
             "kurztitel_quelle")
NUR_DATEI_ZWEIGE = ("qs", "warnungen", "auffaelligkeiten")


def _schlanke(objekt):
    """Nur Herkunftsangaben entfernen, keine Inhalte.

    'roh' bleibt an Bedingungen erhalten – die Oberfläche zeigt damit an,
    warum eine Frage gestellt oder eine Strecke ausgelassen wird. Nur an den
    Kanten ist 'roh' eine reine Herkunftsangabe und entfällt.
    """
    if isinstance(objekt, dict):
        ist_kante = "ziel_typ" in objekt and "antwort" in objekt
        return {k: _schlanke(v) for k, v in objekt.items()
                if k not in NUR_DATEI and not (ist_kante and k == "roh")}
    if isinstance(objekt, list):
        return [_schlanke(v) for v in objekt]
    return objekt


def wende_annahmen_an(daten: dict, annahmen: dict) -> list:
    """Bestätigte Antwort->Wert-Zuordnungen aus annahmen.json einsetzen.

    Greift nur dort, wo build_data.py die Zuordnung als nicht ableitbar
    gemeldet hat. Die Excel bleibt unverändert; angewandt wird nur, was in
    der Annahmendatei ausdrücklich steht.
    """
    gesetzt = annahmen.get("gesetzte_variablen", {})
    angewandt = []
    for frage in daten["fragen"]:
        fuer_frage = gesetzt.get(frage["id"])
        if not fuer_frage:
            continue
        for gv in frage["gesetzte_variablen"]:
            zuordnung = fuer_frage.get(gv.get("variable"))
            if not zuordnung:
                continue
            gueltig = {o["schluessel"] for o in frage["antwortoptionen"]}
            unbekannt = [a for a in zuordnung if a not in gueltig]
            if unbekannt:
                sys.exit(f"annahmen.json: {frage['id']} kennt die Antwort(en) "
                         + ", ".join(unbekannt) + " nicht.")
            gv["zuordnung"] = [{"antwort": a, "wert": w}
                               for a, w in zuordnung.items()]
            gv["herleitung"] = "bestätigt in annahmen.json"
            gv["sicher"] = True
            gv.pop("wert_unbekannt", None)
            angewandt.append(f"{frage['id']}/{gv['variable']}: "
                             + ", ".join(f"{a}={w}" for a, w in zuordnung.items()))
    return angewandt


def schreibe_html(daten: dict, vorlage: str, skript: str, ziel: str) -> dict:
    """Vorlage + app.js + data.json zu einer eigenständigen HTML-Datei."""
    schlank = {k: v for k, v in daten.items() if k not in NUR_DATEI_ZWEIGE}
    schlank = _schlanke(schlank)
    schlank["meta"] = dict(schlank["meta"], eingebettet=True)

    roh = json.dumps(schlank, ensure_ascii=False, separators=(",", ":"))
    # In einem <script>-Block darf keine Zeichenfolge stehen, die den Block
    # beenden oder einen Kommentar öffnen könnte. "<" und ">" kommen im
    # JSON-Text nur innerhalb von Zeichenketten vor, \u003c ist dort die
    # zulässige Schreibweise. Backslashes hat json.dumps bereits maskiert und
    # dürfen hier nicht noch einmal angefasst werden.
    roh = (roh.replace("<", "\\u003c").replace(">", "\\u003e")
              .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))
    if json.loads(roh) != schlank:
        sys.exit("Maskierung der eingebetteten Daten ist nicht verlustfrei – "
                 "Abbruch statt stiller Änderung der Inhalte.")

    if "__DATEN_JSON__" not in vorlage or "__SKRIPT__" not in vorlage:
        sys.exit("Vorlage enthält nicht beide Platzhalter __DATEN_JSON__ und "
                 "__SKRIPT__.")
    html = vorlage.replace("__SKRIPT__", skript).replace("__DATEN_JSON__", roh)

    verdaechtig = re.findall(r"""(?:src|href)\s*=\s*["']([^"'#]+)["']""", html)
    extern = [u for u in verdaechtig
              if re.match(r"^(?:[a-z]+:)?//|^https?:|^data:", u, re.I)]
    if extern:
        sys.exit("Vorlage verweist nach außen: " + ", ".join(extern))

    with open(ziel, "w", encoding="utf-8") as fh:
        fh.write(html)
    return {"bytes": os.path.getsize(ziel), "daten_bytes": len(roh.encode("utf-8"))}


# ===========================================================================
# 12  Zugeschnittene Auslieferungsdatei (--inverso)
# ===========================================================================

MOTOR_START = "/*ENGINE-START*/"
MOTOR_ENDE = "/*ENGINE-ENDE*/"


def schneide_motor(skript: str, herkunft: str) -> str:
    """Die DOM-freie Ablauflogik aus app.js herausschneiden.

    Beide Auslieferungsdateien rechnen damit mit derselben Logik; es gibt
    keinen zweiten Auswerter, der auseinanderlaufen könnte.
    """
    if MOTOR_START not in skript or MOTOR_ENDE not in skript:
        sys.exit(f"In {herkunft}: Marken {MOTOR_START} / {MOTOR_ENDE} fehlen.")
    von = skript.index(MOTOR_START) + len(MOTOR_START)
    return skript[von:skript.index(MOTOR_ENDE)]


def pruefe_profil(daten: dict, profil: dict):
    """Das Profil gegen die Excel prüfen, damit es nicht still veraltet."""
    fragen = {f["id"]: f for f in daten["fragen"]}
    module = {m["modul"]: m for m in daten["module"]}
    fehler = []

    def frage_pruefen(fid, wo):
        if fid not in fragen:
            fehler.append(f"{wo}: Frage {fid} gibt es nicht")
            return None
        return fragen[fid]

    for fid, eintrag in (profil.get("vorbelegt") or {}).items():
        frage = frage_pruefen(fid, "vorbelegt")
        if not frage:
            continue
        gueltig = {o["schluessel"] for o in frage["antwortoptionen"]}
        for a in eintrag.get("antwort", []):
            if a not in gueltig:
                fehler.append(f"vorbelegt {fid}: '{a}' ist keine Antwortoption "
                              f"(gültig: {', '.join(sorted(gueltig))})")
        if not eintrag.get("grund"):
            fehler.append(f"vorbelegt {fid}: Begründung fehlt")

    modell = profil.get("vorgehensmodell") or {}
    if not modell:
        fehler.append("vorgehensmodell fehlt")
    if len(modell.get("stufen") or []) != 5:
        fehler.append("vorgehensmodell: es werden genau fünf Stufen erwartet")

    # Die Rollenfrage darf nicht vorbelegt sein: sie entscheidet, welche Kapitel
    # überhaupt gelten, und gehört deshalb ins Bild, nicht in die Annahmen.
    rollenfrage = next((f for f in daten["fragen"]
                        if len([gv for gv in f["gesetzte_variablen"]
                                if gv.get("wert_sonst")]) > 1), None)
    if rollenfrage and rollenfrage["id"] in (profil.get("vorbelegt") or {}):
        fehler.append(f"vorbelegt {rollenfrage['id']}: die Rollenfrage steuert die "
                      f"Modulauswahl und darf nicht vorbelegt werden")

    # Jeder Anknüpfungspunkt benennt sein Modul - daraus berechnet die
    # Oberfläche, ob er gilt und was sonst in der Reihe "entfällt" steht.
    anknuepfungen = {}
    for a in modell.get("anknuepfungspunkte") or []:
        if a.get("modul") not in module:
            fehler.append(f"Anknüpfungspunkt {a.get('id')}: Modul "
                          f"{a.get('modul')} gibt es nicht")
        anknuepfungen[a["id"]] = a.get("modul")

    je_frage = {}
    for strang in modell.get("straenge") or []:
        if strang.get("anknuepfung") not in anknuepfungen:
            fehler.append(f"Strang {strang.get('id')}: unbekannter "
                          f"Anknüpfungspunkt {strang.get('anknuepfung')}")
        if not strang.get("fragen"):
            fehler.append(f"Strang {strang.get('id')}: keine Fragen")
        im_strang = set()
        for fid in strang.get("fragen", []):
            f = frage_pruefen(fid, f"Strang {strang.get('id')}")
            if f:
                im_strang.add(f["modul"])
            je_frage.setdefault(fid, []).append(strang.get("id"))
        if len(im_strang) > 1:
            fehler.append(f"Strang {strang.get('id')}: Fragen aus mehreren "
                          f"Modulen ({', '.join(sorted(im_strang))})")
        # Der Strang muss im Modul seines Anknüpfungspunkts liegen, sonst zeigt
        # ihn die Oberfläche unter einer Überschrift, die nicht dazu passt.
        erwartet = anknuepfungen.get(strang.get("anknuepfung"))
        if erwartet and im_strang and erwartet not in im_strang:
            fehler.append(f"Strang {strang.get('id')}: liegt in "
                          f"{', '.join(sorted(im_strang))}, der Anknüpfungspunkt "
                          f"nennt aber {erwartet}")

    for fid, wo in je_frage.items():
        if len(wo) > 1:
            fehler.append(f"Frage {fid} liegt in mehreren Strängen: " + ", ".join(wo))

    for fid in (modell.get("grundlagen") or {}).get("fragen", []):
        frage_pruefen(fid, "grundlagen")
        if fid in je_frage:
            fehler.append(f"Frage {fid} steht in den Grundlagen und in Strang "
                          + ", ".join(je_frage[fid]))

    # Keine Frage eines gezeigten Moduls darf ohne Säule bleiben.
    gezeigte_module = set(anknuepfungen.values())
    gezeigte_module |= {fragen[f]["modul"]
                        for f in (modell.get("grundlagen") or {}).get("fragen", [])
                        if f in fragen}
    zugeordnet = set(je_frage) | set((modell.get("grundlagen") or {}).get("fragen", []))
    for f in daten["fragen"]:
        if f["modul"] in gezeigte_module and f["id"] not in zugeordnet:
            fehler.append(f"Frage {f['id']} ({f['modul']}) liegt in keinem Strang "
                          f"und in keinen Grundlagen")

    # Jeder benannte Sachverhalt muss von einem Strang getragen werden. Genau
    # das war zuvor nicht der Fall - "Datenbereitstellung" fiel heraus.
    getragen = set()
    for strang in modell.get("straenge") or []:
        getragen |= set(strang.get("sachverhalte") or [])
    for sv in modell.get("sachverhalte") or []:
        if sv["id"] not in getragen:
            fehler.append(f"Sachverhalt '{sv['kurz']}' ({sv['id']}) wird von "
                          f"keinem Strang getragen")
    unbekannt = getragen - {sv["id"] for sv in modell.get("sachverhalte") or []}
    if unbekannt:
        fehler.append("Stränge nennen unbekannte Sachverhalte: "
                      + ", ".join(sorted(unbekannt)))

    for fid in (profil.get("warnungen") or {}):
        frage_pruefen(fid, "warnungen")

    bekannt = {v["name"] for v in daten["variablen"]}
    for gruppe in profil.get("ohne_einfluss") or []:
        for v in gruppe.get("variablen", []):
            if v not in bekannt:
                fehler.append(f"ohne_einfluss: Variable {v} gibt es nicht")

    if fehler:
        sys.exit("profil-inverso.json passt nicht zur Excel:\n  "
                 + "\n  ".join(fehler))


def profil_fragen(profil: dict) -> set:
    """Alle Frage-IDs, die das Vorgehensmodell ausdrücklich nennt."""
    modell = profil.get("vorgehensmodell") or {}
    ids = set(profil.get("vorbelegt") or {})
    ids |= set((modell.get("grundlagen") or {}).get("fragen", []))
    for strang in modell.get("straenge") or []:
        ids |= set(strang.get("fragen") or [])
    return ids


def verschlanke_auf_profil(daten: dict, profil: dict) -> dict:
    """Nur die Fragen, Mappingzeilen und Anforderungen des Vorgehensmodells."""
    genannt = profil_fragen(profil)
    nach_id = {f["id"]: f for f in daten["fragen"]}
    # Die Module der Stränge kommen vollständig mit - ein Strang wird als
    # Modullauf gerechnet, dazu gehören auch dessen Zwischenfragen. Fragen aus
    # anderen Modulen (Vorbelegungen des Einstiegs) kommen einzeln dazu.
    strangmodule = {nach_id[fid]["modul"] for fid in genannt if fid in nach_id}

    fragen = [f for f in daten["fragen"]
              if f["modul"] in strangmodule or f["id"] in genannt]
    frage_ids = {f["id"] for f in fragen}
    mapping = [m for m in daten["mapping"] if m["frage_id"] in frage_ids]

    gebraucht = {m["req_id"] for m in mapping}

    schlank = dict(daten)
    schlank["fragen"] = fragen
    schlank["mapping"] = mapping
    schlank["module"] = [m for m in daten["module"] if m["modul"] in strangmodule]
    schlank["anforderungen"] = [a for a in daten["anforderungen"]
                                if a["req_id"] in gebraucht]
    schlank["ergebnisse"] = [e for e in daten["ergebnisse"]
                             if e["req_id"] in gebraucht]
    schlank["profil"] = profil
    schlank["meta"] = dict(daten["meta"], zuschnitt=profil["unternehmen"]["name"])
    return schlank



def schreibe_inverso(daten: dict, profil: dict, vorlage: str, oberflaeche: str,
                     motor: str, ziel: str) -> dict:
    pruefe_profil(daten, profil)
    schlank = verschlanke_auf_profil(daten, profil)
    # Der Motor kommt roh aus app.js, die Oberfläche als reiner Rumpf. Beides
    # wird hier gemeinsam gekapselt, damit nichts im globalen Namensraum landet.
    # Die Marken bleiben erhalten, damit pruefe.js auch in dieser Datei den
    # Motor herausschneiden und einzeln prüfen kann.
    skript = ('(function () {\n"use strict";\n'
              + MOTOR_START + motor + MOTOR_ENDE + "\n"
              + oberflaeche + "\n})();\n")
    return schreibe_html(schlank, vorlage, skript, ziel)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--excel", default="DataAct_Anforderungen.xlsx")
    p.add_argument("--out", default="data.json")
    p.add_argument("--notes", default="NOTES.md")
    p.add_argument("--inline", action="store_true",
                   help="zusätzlich die Auslieferungsdatei data-act-check.html "
                        "aus template.html, app.js und den Daten schreiben")
    p.add_argument("--annahmen", default=None,
                   help="Datei mit bestätigten Antwort->Wert-Zuordnungen "
                        "(z. B. annahmen.json). Ohne Angabe wird ausschließlich "
                        "die Excel ausgewertet.")
    p.add_argument("--inverso", action="store_true",
                   help="zusätzlich die zugeschnittene Fassung "
                        "data-act-inverso.html schreiben")
    p.add_argument("--profil", default="profil-inverso.json")
    p.add_argument("--inverso-vorlage", default="template-inverso.html",
                   dest="inverso_vorlage")
    p.add_argument("--inverso-oberflaeche", default="app-inverso.js",
                   dest="inverso_oberflaeche")
    p.add_argument("--inverso-html", default="data-act-inverso.html",
                   dest="inverso_html")
    p.add_argument("--vorlage", default="template.html")
    p.add_argument("--skript", default="app.js")
    p.add_argument("--html", default="data-act-check.html")
    p.add_argument("--kompakt", action="store_true",
                   help="data.json ohne Einrückung schreiben (kleinere Datei "
                        "zum späteren Einbetten in die HTML-Datei)")
    p.add_argument("--trotz-fehler", action="store_true",
                   dest="trotz_fehler",
                   help="data.json auch bei Validierungsfehlern schreiben "
                        "(nur zur Fehlersuche)")
    args = p.parse_args(argv)

    if not os.path.exists(args.excel):
        print(f"FEHLER: {args.excel} nicht gefunden.", file=sys.stderr)
        return 2

    daten, fehler, warn = baue(args.excel)

    if args.annahmen:
        if not os.path.exists(args.annahmen):
            print(f"FEHLER: {args.annahmen} nicht gefunden.", file=sys.stderr)
            return 2
        annahmen = json.load(open(args.annahmen, encoding="utf-8"))
        angewandt = wende_annahmen_an(daten, annahmen)
        daten["meta"]["angewandte_annahmen"] = {
            "datei": os.path.basename(args.annahmen),
            "beschreibung": annahmen.get("beschreibung", ""),
            "zuordnungen": angewandt,
        }
        print(f"Annahmen aus {args.annahmen} angewandt: "
              + ("; ".join(angewandt) if angewandt else "keine passende Stelle"))

    if fehler:
        print("VALIDIERUNG FEHLGESCHLAGEN – data.json wurde nicht geschrieben."
              if not args.trotz_fehler else "VALIDIERUNG FEHLGESCHLAGEN.",
              file=sys.stderr)
        print(f"{len(fehler)} Verstoß/Verstöße:", file=sys.stderr)
        for f in fehler:
            print("  " + f, file=sys.stderr)
        if not args.trotz_fehler:
            return 2

    with open(args.out, "w", encoding="utf-8") as fh:
        if args.kompakt:
            json.dump(daten, fh, ensure_ascii=False, separators=(",", ":"),
                      sort_keys=False)
        else:
            json.dump(daten, fh, ensure_ascii=False, indent=1, sort_keys=False)
        fh.write("\n")
    schreibe_notes(args.notes, daten, warn)

    groesse = os.path.getsize(args.out)
    print(f"{args.out} geschrieben: {groesse/1024:.1f} KiB")
    print("Objekte:")
    for k, v in daten["meta"]["anzahl"].items():
        print(f"  {k:16} {v}")
    if args.inline:
        for pfad in (args.vorlage, args.skript):
            if not os.path.exists(pfad):
                print(f"FEHLER: {pfad} nicht gefunden.", file=sys.stderr)
                return 2
        info = schreibe_html(daten,
                             open(args.vorlage, encoding="utf-8").read(),
                             open(args.skript, encoding="utf-8").read(),
                             args.html)
        print(f"{args.html} geschrieben: {info['bytes']/1024:.1f} KiB "
              f"(davon Daten {info['daten_bytes']/1024:.1f} KiB), "
              "eigenständig, ohne externe Verweise")

    if args.inverso:
        fehlend = [p for p in (args.profil, args.inverso_vorlage,
                               args.inverso_oberflaeche, args.skript)
                   if not os.path.exists(p)]
        if fehlend:
            print("FEHLER: nicht gefunden: " + ", ".join(fehlend), file=sys.stderr)
            return 2
        profil = json.load(open(args.profil, encoding="utf-8"))
        motor = schneide_motor(open(args.skript, encoding="utf-8").read(),
                               args.skript)
        info = schreibe_inverso(
            daten, profil,
            open(args.inverso_vorlage, encoding="utf-8").read(),
            open(args.inverso_oberflaeche, encoding="utf-8").read(),
            motor, args.inverso_html)
        print(f"{args.inverso_html} geschrieben: {info['bytes']/1024:.1f} KiB "
              f"(davon Daten {info['daten_bytes']/1024:.1f} KiB), zugeschnitten "
              f"auf {profil['unternehmen']['name']}")

    warnungen = warn.nach_schwere("warnung")
    print(f"\nWarnliste ({len(warnungen)} nicht eindeutig parsebare Stellen):")
    if not warnungen:
        print("  keine")
    for e in warnungen:
        print(f"  [{e['blatt']}/{e['bezug']}/{e['feld']}] {e['problem']}")
        print(f"      Rohtext: {e['rohtext'][:180]}")
    print(f"\n{len(warn.nach_schwere('hinweis'))} Bedingungen mit Klartextanteil "
          f"(Details in {args.notes}).")
    print(f"Inhaltliche Auffälligkeiten: {len(daten['auffaelligkeiten'])} "
          f"(Details in {args.notes}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
