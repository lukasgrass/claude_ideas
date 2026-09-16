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
heraus und prüft: keine externen URLs, kein `fetch`/`XMLHttpRequest`,
`localStorage` nur in `try/catch`, alle 49 Fragen erreichbar, keine Frage
zweimal, kein Zyklus, jeder Pfad endet in Ergebnis oder Modulende, „Unsicher"
führt überall weiter, und das Anforderungsprofil stimmt mit `verify_data.py`
überein.

Mit `--annahmen annahmen.json` werden zusätzlich die dort bestätigten
Antwort-Wert-Zuordnungen eingesetzt (siehe NOTES.md, Punkt 1). Ohne diesen
Schalter wird ausschließlich die Excel ausgewertet.

`build_data.py` bricht mit Fehlerliste ab und schreibt keine `data.json`, wenn
eine Frage-ID ins Leere zeigt, eine Req-ID aus dem Mapping fehlt, eine
Antwortoption kein oder ein widersprüchliches Ziel hat, der Fragengraph einen
Zyklus enthält, eine Frage von keinem Moduleinstieg erreichbar ist oder eine
Bedingung eine unbekannte Variable nennt. Nicht eindeutig zerlegbare Stellen
werden nicht geraten und nicht verworfen, sondern als Klartext im JSON
mitgeführt und in der Warnliste ausgewiesen.

## Deployment

Jeder Push auf den Default-Branch veröffentlicht die Seite automatisch über GitHub Pages (Workflow `.github/workflows/deploy-pages.yml`). Die Root-URL leitet auf `signum/` weiter.
