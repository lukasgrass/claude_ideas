# claude_ideas

Sammlung von Produktideen und zugehörigen Prototypen.

## Signum – Landingpage

`signum/index.html` ist eine in sich geschlossene Landingpage (Inline-CSS/JS, einzige externe Abhängigkeit: Google Fonts) für **Signum**: eine Signal-Engine, die öffentliche Register, Bekanntmachungen und Vergabeportale liest und jedes Ereignis in einen fachlichen Anlass übersetzt – mit Zeitfenster, empfohlener Handlung und zuständiger Person. Zielgruppe sind Beratungshäuser im DACH-Raum, IT- und Security-Beratung zuerst.

- Öffnen: Datei direkt im Browser öffnen, kein Build-Schritt nötig.
- Conversion-Ziel ist die kostenlose Beispielliste, nicht die Demo. Das Formular baut clientseitig einen `mailto:`-Link; die Zieladresse steht als `ADRESSE` im Skriptblock am Dateiende.
- Hell- und Dunkeldarstellung folgen der Systemeinstellung. Es gibt bewusst keinen Umschalter, weil die Spezifikation `localStorage` ausschließt und eine Auswahl ohne Speicherung bei jedem Seitenaufruf verloren ginge. Die Tokens sind zusätzlich unter `:root[data-theme="dark"]` definiert, falls die Darstellung von außen gestempelt wird.
- Kein Tracking, keine Analytics, keine externen Skripte, keine Browser-Speicher-APIs.
- Alle Unternehmen, Personen, Zahlen und Fristen in den Produktansichten sind frei erfunden und mit einem sichtbaren `Beispiel`-Marker gekennzeichnet.

## EU Data Act – Entscheidungsbaum (Datengrundlage)

Erster Schritt eines Mandanten-Werkzeugs zur VO (EU) 2023/2854. Erzeugt wird
ausschließlich die Datengrundlage; HTML und Gestaltung folgen später.

- `DataAct_Anforderungen.xlsx` – einzige inhaltliche Quelle (189 Anforderungen,
  49 Fragen, 797 Mapping-Verknüpfungen). Wird vom Skript nur gelesen.
- `build_data.py` – liest die Mappe, zerlegt die Fließtextspalten
  („Folgeknoten je Antwort“, „Anzeigebedingung“, „Bedingung“) in Kantenlisten
  und Ausdrucksbäume, validiert und schreibt `data.json` sowie `NOTES.md`.
- `verify_data.py` – rechnet die sechs Testprofile aus QS-Abschnitt 6 durch
  (nur aus `data.json`, kein `eval` auf Rohtext) und trägt die Ergebnistabelle
  in `NOTES.md` ein.
- `annahmen.json` – dokumentierte Prüfannahmen für Zuordnungen, die in der
  Excel nicht stehen. Ändert die Excel nicht; `verify_data.py` rechnet damit
  eine zweite Variante.
- `template.html`, `app.js` – Gerüst/CSS und Ablauflogik der Auslieferungsdatei.
  Nur diese beiden bearbeiten, nie `data-act-check.html` direkt.
- `pruefe.js` – Abnahmeprüfung der erzeugten HTML-Datei (nur Node, keine Pakete).
- `NOTES.md` – Warnliste, Testprofiltabelle und inhaltliche Auffälligkeiten.
  Wird bei jedem Lauf neu geschrieben; die Abschnitte zwischen den Markern
  `MANUELL` und `TESTPROFILE` bleiben erhalten.

```
pip install openpyxl
python3 build_data.py --inline   # -> data.json, NOTES.md und data-act-check.html
python3 verify_data.py           # -> Testprofiltabelle, aktualisiert NOTES.md
```

### Auslieferungsdatei erzeugen

`data-act-check.html` ist die Datei, die an Mandanten geht: eine einzige,
eigenständige HTML-Datei mit CSS, JavaScript und allen Daten darin, rund
730 KiB. Kein Build-Schritt, kein Framework, keine externen Verweise; sie wird
per Doppelklick über `file://` geöffnet und funktioniert offline.

Aus einer geänderten Excel wird sie mit **zwei Befehlen** neu erzeugt:

```
python3 build_data.py --inline   # Excel -> data.json -> data-act-check.html
node pruefe.js                   # Abnahmeprüfung gegen die erzeugte HTML-Datei
```

`--inline` setzt `template.html` (Gerüst und CSS), `app.js` (Ablauflogik und
Oberfläche) und die Daten zusammen. Die eingebetteten Daten sind gegenüber
`data.json` um reine Herkunftsangaben erleichtert (Zeilennummern, Rohtexte der
Kanten, QS-Blatt, Warnliste); Inhalte bleiben unverändert, und der Einbau wird
vor dem Schreiben gegengelesen.

`node pruefe.js` schneidet Daten und Ablauflogik aus der fertigen HTML-Datei
heraus und prüft 17 Punkte: keine externen URLs, kein `fetch`/`XMLHttpRequest`,
`localStorage` nur in `try/catch`, Datei unter 5 MB, alle 49 Fragen erreichbar,
keine Frage zweimal, kein Zyklus, jeder Pfad endet in Ergebnis oder Modulende,
„Unsicher" führt überall weiter, Begriffsmarkierungen liegen im Text und
überlappen nicht, das Baumlayout ist für alle Strecken deterministisch und
vorwärtsgerichtet, und das Anforderungsprofil stimmt mit `verify_data.py`
überein. Zum Schluss rechnet es die sechs Testprofile aus QS-Abschnitt 6 im
fertigen Werkzeug nach und stellt sie den dort dokumentierten Zahlen gegenüber.

Mit `--annahmen annahmen.json` werden zusätzlich die dort bestätigten
Antwort-Wert-Zuordnungen eingesetzt (siehe NOTES.md, Punkt 1). Ohne diesen
Schalter wird ausschließlich die Excel ausgewertet.

### Dreiklang-Fassung — drei Bäume nach der Vorgehensfolie

`data-act-dreiklang.html` (rund 58 KiB) bildet die Folie „Ableitung von
Rechtsfolgen" ab:

> **Bewertungsgegenstand + Anknüpfungspunkt + Sachverhalt = Rechtsfolge**

Drei Bäume, einer je Bewertungsgegenstand, in Spalten nebeneinander: erst der
Gegenstand, daraus ein oder mehrere Anknüpfungspunkte, daraus die Sachverhalte,
daraus die Rechtsfolge mit ihren Anforderungen — je eine Zeile mit Req-ID,
Fundstelle, Kurztext, Adressat und Typ. Der ganze Weg bleibt sichtbar; ein Klick
auf eine höhere Ebene setzt die tieferen zurück. Ein Weg dauert ein bis zwei
Minuten.

```
DV-Dienst ─┬─ Anbieter ────┬─ Anbieterwechsel ......... Art. 23–31 → Kap. VI
           │               ├─ Wechselentgelte ......... Art. 29 ... → Kap. VI
           │               ├─ Parallelnutzung ......... Art. 34 ... → Kap. VIII
           │               └─ Drittstaatenzugriff ..... Art. 32 ... → Kap. VII
           └─ Kunde ───────┬─ Anbieterwechsel ......... Art. 23–31 → Kap. VI
                           └─ Parallelnutzung ......... Art. 34 ... → Kap. VIII
Datenbestand ─ Dateninhaber ┬ Datenbereitstellung ..... Art. 8–12 . → Kap. III
                            └ Behördenverlangen ....... Art. 14–22  → Kap. V
Vertrag ─ Rollenunabhängig ─┬ Einseitige Klauseln ..... Art. 13 ... → Kap. IV
                            └ Vertragl. Wechselbed. ... Art. 25 ... → Kap. VI
```

```
python3 build_data.py --inline --inverso --dreiklang --annahmen annahmen.json
node pruefe.js data-act-dreiklang.html     # 11 Prüfungen
```

- **Die Rechtsfolge wird berechnet, nicht behauptet.** `dreiklang.json` nennt
  nur die Baumstruktur, je Sachverhalt seine **Fundstellen** und was die Folie
  angibt; welche Anforderungen herauskommen, entscheidet der Katalog der Excel.
  Trifft ein Fundstellenpräfix keine Anforderung oder widerspricht das Ergebnis
  der Folie, bricht der Build ab.
- **Auswahl über Artikel, nicht über Fragen.** Ein Sachverhalt ist juristisch
  durch seine Artikel definiert. Über den Fragebogenpfad ausgewählt zog
  „Parallelnutzung" 13 fremde Wechselpflichten mit; über `Art. 34` sind es genau
  die zwei Anforderungen des Kapitels VIII. Jeder der zehn Äste deckt sich so
  mit genau einem Kapitel.
- **Pflicht oder Anspruch.** Jeder Anknüpfungspunkt trägt eine Rolle; der Build
  gleicht sie gegen den Adressaten jeder Anforderung ab. Kapitel VI richtet sich
  in 34 von 35 Fällen an den Anbieter — beim Anknüpfungspunkt „Kunde" steht
  deshalb „13 **Ansprüche gegen den Anbieter**", nicht „13 Pflichten".
- **Aufgelöst beim Bauen:** die Datei trägt keine Fragen, kein Mapping, keine
  Begriffe. Deshalb 58 KiB statt 871 KiB — der Unterschied zwischen einem
  E-Mail-Anhang und einem, der hängenbleibt.
- **Kapitel II bleibt draußen** (IoT-Datenzugang, 46 Anforderungen), weil der
  Auftraggeber festgestellt hat, dass es für die Inverso GmbH nicht einschlägig
  ist. Der Fuß der Datei sagt das und verweist auf `data-act-check.html`.

### Zugeschnittene Fassung für ein einzelnes Unternehmen

`data-act-inverso.html` (rund 860 KiB) ist dieselbe Prüfung, zugeschnitten auf
die Inverso GmbH: **ein einziges Bild**, senkrecht von oben nach unten, mit
aufklappbaren Anforderungen am Fuß jeder Säule.

```
python3 build_data.py --inline --inverso --annahmen annahmen.json
                                           # beide Auslieferungsdateien
node pruefe.js                             # allgemeine Fassung, 17 Prüfungen
node pruefe.js data-act-inverso.html       # zugeschnittene Fassung, 25 Prüfungen
```

Aufbau des Bildes — es folgt der Entscheidungslogik, nicht einer Gliederung:

1. **Ausgangslage** — das Einstiegsmodul, beginnend mit der Rollenfrage `EIN-01`
   (Mehrfachauswahl; erst „Übernehmen" wirkt).
2. **Was entfällt** — je Modul, dessen Startbedingung nicht erfüllt ist, eine
   Karte mit dieser Bedingung im Klartext. Sie verschwindet, sobald die Rolle
   gesetzt wird.
3. **Vor der Verzweigung** — was unabhängig vom Pfad gilt.
4. **Die Blöcke** — je Anknüpfungspunkt eine Kopfkarte und darunter seine
   Säulen, eine je Sachverhalt, durchgehend von der ersten Frage bis zu den
   Anforderungen. Die Blöcke brechen um, statt Spalten zu quetschen.

Am linken Rand läuft eine **Schrittleiste** mit den fünf Schritten des
Vorgehensmodells mit, das in der Präsentation unmittelbar vor der Datei gezeigt
wird. Sie ist Orientierung, kein Gliederungsprinzip, und trägt keine Bedienung.

- **Ein Motor, zwei Oberflächen.** `--inverso` schneidet die Ablauflogik aus
  `app.js` heraus (Block zwischen `/*ENGINE-START*/` und `/*ENGINE-ENDE*/`) und
  setzt sie mit `template-inverso.html` und `app-inverso.js` zusammen. Es gibt
  keinen zweiten Auswerter; `pruefe.js` rechnet beide Fassungen über fünf
  Rollensätze gegeneinander.
- **Der Zuschnitt ist Daten, kein Code:** `profil-inverso.json` nennt die
  Vorbelegungen jeweils mit Begründung, die sieben Sachverhalte, die
  Anknüpfungspunkte mit ihrem Modul und die Stränge mit ihren Fragen.
- **Die Rollenfrage darf nicht vorbelegt werden.** Sie entscheidet, welche
  Kapitel gelten; sie zu setzen hieße, die Betroffenheit zu behaupten statt sie
  zu prüfen. Build und Prüfung brechen ab, wenn es doch geschieht.
- **Jeder Sachverhalt muss einen Strang haben**, jede Frage eines gezeigten
  Moduls genau eine Säule. Auch das bricht den Build ab — sonst fällt ein
  Sachverhalt still heraus.
- **`--annahmen` ist Pflicht für die Auslieferung.** `annahmen.json` trägt zwei
  Arten geprüfter Ergänzungen, die die Excel nicht hergibt: bestätigte
  Antwort→Wert-Zuordnungen und Ergebnistexte an Kanten, an denen die Excel
  schweigt. Jede nennt ihren Grund; der Build meldet sie und überschreibt
  nie einen vorhandenen Excel-Text. Ohne den Schalter fehlen dem Werkzeug
  zwei Ergebnistexte (Kapitel IV und Kapitel V), und Kapitel IV endet stumm.
- **Anforderungen dürfen mehrfach erscheinen**, wenn mehrere Stränge sie
  auslösen; sie tragen dann den Verweis „auch: <anderer Strang>". Die Zahl in
  der Kopfzeile zählt jede Anforderung einmal.

Ein anderes Unternehmen bekommt eine eigene Profildatei:

```
python3 build_data.py --inline --inverso \
        --profil profil-andere-gmbh.json \
        --inverso-html data-act-andere-gmbh.html
```

### Was die Auslieferungsdatei enthält

- **Einstieg und Modulübersicht** – sieben Fragen, danach die Prüfstrecken mit
  Status, Fragenzahl und Startbedingung. Reihenfolge frei, Antworten jederzeit
  korrigierbar; unerreichbar gewordene Folgeantworten werden sichtbar
  zurückgesetzt.
- **Geführter Modus** – eine Frage pro Bildschirm mit Erklärtext,
  Rechtsgrundlage, Schritt-Leiste und Rücksprung. „Unsicher" ist überall eine
  gleichwertige Antwort und führt zu einem Ergebnis mit dem Hinweis auf
  Einzelfallprüfung.
- **Baumansicht** – dieselbe Strecke als Diagramm, umschaltbar. Deterministisches
  Schichtenlayout (Tiefe = längster Weg vom Einstieg, keine Physik, keine
  Zufallspositionen). Zoom mit Mausrad, Trackpad-Pinch, Buttons und Tastatur
  (`+`, `−`, `0`, Pfeiltasten), Pan per Ziehen oder Touch. Die Beschriftung
  wird gestuft reduziert: Volltext, Kurztext, nur Frage-ID. Auf schmalen
  Bildschirmen erscheint stattdessen eine Pfadliste.
- **Ergebnisprofil** – Endwirkung je Req-ID nach der Rangfolge
  *schließt aus > verschiebt Geltungsbeginn > löst aus > schränkt ein*,
  gruppiert nach Kapitel und Typ, mit Zeitleiste der Geltungsbeginne, Filtern,
  aufklappbaren Zeilen (Beschreibung, nächste Schritte, juristische Ebene,
  Herkunft mit Sprung zurück zur Frage), einem eigenen Abschnitt „Nicht
  anwendbar – mit Begründung" und den offenen Punkten für die juristische
  Prüfung.
- **Erklärungen** – Begriffe aus dem Blatt `Begriffe` sind beim Build im
  Fließtext markiert (kein Laufzeit-Regex über den DOM) und zeigen bei Hover,
  Fokus oder Tap ein Panel mit Fundstelle, Definition und Abgrenzung.
  Variablen erklären, wodurch ihr Wert gesetzt wurde und wie er gerade lautet.
- **Druckansicht** – `@media print` mit Deckzeile (Datum, beantwortete Fragen,
  Anzahl Anforderungen), ohne Navigation, alle Zeilen aufgeklappt. Das ist der
  Weg zum PDF für den Mandanten.

`build_data.py` bricht mit Fehlerliste ab und schreibt keine `data.json`, wenn
eine Frage-ID ins Leere zeigt, eine Req-ID aus dem Mapping fehlt, eine
Antwortoption kein oder ein widersprüchliches Ziel hat, der Fragengraph einen
Zyklus enthält, eine Frage von keinem Moduleinstieg erreichbar ist oder eine
Bedingung eine unbekannte Variable nennt. Nicht eindeutig zerlegbare Stellen
werden nicht geraten und nicht verworfen, sondern als Klartext im JSON
mitgeführt und in der Warnliste ausgewiesen.

## Deployment

Jeder Push auf den Default-Branch veröffentlicht die Seite automatisch über GitHub Pages (Workflow `.github/workflows/deploy-pages.yml`). Die Root-URL leitet auf `signum/` weiter.
