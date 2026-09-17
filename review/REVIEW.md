# Review: Data-Act-Orientierungstool

Stand der Prüfung: 17.09.2026 · Geprüfte Fassung: Commit `1d435fd`

---

## 0. Vorbemerkung zur Unabhängigkeit — bitte zuerst lesen

**Dieses Review ist nicht unabhängig.** Ich habe das geprüfte Tool in derselben
Sitzung selbst gebaut: Datengrundlage, Parser, Baumlogik, beide Oberflächen und
das Inverso-Profil. Ein Review durch den Autor findet systematisch die Fehler
nicht, für die der Autor blind ist.

Das ist in diesem Projekt bereits eingetreten: Die Annahme „Inverso ist kein
Dateninhaber" habe ich ohne Beleg gesetzt. Sie hätte bis zu 60 Anforderungen
unterschlagen. Aufgefallen ist sie nicht mir, sondern dem Auftraggeber.

Was dieses Review leisten kann: die maschinell prüfbaren Eigenschaften
vollständig durchrechnen (Pfade, Ausschlüsse, Erreichbarkeit, Fristen) und die
inhaltlichen Stellen benennen, an denen ich beim Bauen Annahmen getroffen habe.
Was es nicht leisten kann: die Annahmen prüfen, die ich selbst nicht als
Annahmen erkannt habe. **Vor der Weitergabe an einen Mandanten sollte eine
zweite, unbeteiligte Person daraufsehen.**

Während der Prüfung habe ich zwei eigene Verdachtsmomente wieder verworfen, weil
sie sich nicht bestätigten (Abschnitt 7). Sie stehen dort, damit nachvollziehbar
ist, was geprüft und für in Ordnung befunden wurde.

---

## 1. Zugrunde gelegtes Unternehmensprofil

Inverso GmbH, IT-Dienstleister für Versicherungssoftware, gegründet 1997, rund
200 Mitarbeitende, Sitz München mit Niederlassungen in Ilmenau und Jena. Kunden
sind Versicherer der Sparkassen-Finanzgruppe; Gesellschafter sind die
Versicherungskammer und seit 2025 die Provinzial Holding. Das Leistungsspektrum
reicht von der Lösungsentwicklung über die Implementierung bis zum
Anwendersupport; dafür werden auch fremde Cloud-Dienste genutzt. Anlass ist die
Vorstellung des Tools im Mandantengespräch, unmittelbar im Anschluss an eine
PowerPoint-Folie mit einem fünfstufigen Vorgehensmodell.

**Ausdrückliche Annahmen** (nicht aus einer Quelle belegt, sondern von mir
gesetzt oder offen gelassen):

| Angabe | Status |
|---|---|
| Rechtsform GmbH, juristische Person des Privatrechts | belegt durch die Firmierung |
| Niederlassung in der EU | belegt durch die Standorte |
| Jahresumsatz / Bilanzsumme | **unbekannt** — nicht angenommen; die Größenklasse wird im Tool gefragt |
| Dateninhaber i. S. v. Art. 2 Nr. 13 | **offen** — die entscheidende Frage, siehe Abschnitt 6 |
| Betreibt Inverso vernetzte Produkte oder Dienste dafür (Telematik, Smart Home, Wearables)? | **offen** — nicht ermittelt |
| Torwächterstatus | nach öffentlich zugänglichen Angaben nein |

---

## 2. Management Summary

> **Nachtrag 17.09.2026 — Anpassungen umgesetzt.** Alle unten genannten Befunde
> sind behoben oder entschärft; der Status je Befund steht in
> `review_befunde.xlsx`, Spalte *Status*. Der Bericht bleibt im ursprünglichen
> Wortlaut stehen, damit nachvollziehbar ist, was gefunden wurde. Offen bleiben
> zwei Punkte für das Anwaltsgespräch: der Bußgeldrahmen nach DADG (B-07,
> Quellenlage uneinheitlich, deshalb bewusst keine Zahl im Werkzeug) und der
> strukturelle Umbau des Kapitel-V-Zweigs (B-01, im Werkzeug vorerst durch
> einen Ergebnistext abgefangen). Damit ist die Fassung aus Sicht dieses
> Reviews weitergabefähig.

**Gesamturteil: KANN NACH ANPASSUNGEN GETEILT WERDEN.**

Die Entscheidungslogik ist tragfähig. Alle 49 Fragen sind erreichbar, kein Pfad
endet in einer Sackgasse, kein Zyklus, und die geprüften Ausnahmen (Art. 7
einschließlich Konzern-Ausschluss, Kap.-VI-Ausnahmen für Testversionen und
maßgeschneiderte Dienste) greifen im Baum und nicht nur in der Excel. Sämtliche
306 Ausschlusszeilen tragen eine Bedingung; keine schaltet eine Pflicht
unbedingt ab. „Unsicher" führt nirgends zu stiller Entlastung, sondern erzeugt
einen als unsicher markierten Befund.

Vor der Weitergabe sind vier Dinge zu beheben. Ein Befund ist kritisch: Eine
öffentliche Stelle bekommt zu Kapitel V **null** Anforderungen angezeigt, obwohl
der Katalog elf enthält, die sich ausschließlich an sie richten (B-01). Im
Umfeld des Mandanten ist das nicht theoretisch — die Versicherungskammer ist
eine Anstalt des öffentlichen Rechts. Daneben überzeichnet der Zähler die
Betroffenheit, weil er Ausnahmen und Rechte als „Anforderungen" mitzählt (B-02),
es fehlt jede Angabe zum Rechtsstand und zum Digital Omnibus (B-05, B-06), und
die deutsche Umsetzungsebene fehlt vollständig, obwohl das DADG seit 30.05.2026
in Kraft ist (B-07).

---

## 3. Befunde der Kategorie FALSCH

### B-01 · KRITISCH · Öffentliche Stellen werden zu Unrecht vollständig entlastet

| | |
|---|---|
| **Fundstelle Projekt** | `DataAct_Anforderungen.xlsx`, Blatt *Fragen*, Zeile 30 (V-01, Kante „C → ERGEBNIS"); wirksam in `app.js` `laufeModul` |
| **Rechtsgrundlage** | Art. 14 (Beschränkung auf „andere juristische Personen als öffentliche Stellen") einerseits; Art. 15, 17, 19, 21, 22 andererseits |
| **Kategorie / Schwere** | FALSCH / KRITISCH |
| **Sicherheit** | hoch |

`V-01 = C` („Wir sind eine öffentliche Stelle") beendet Modul M-V sofort. Der
Ergebnistext lautet: *„Öffentliche Stellen sind keine Dateninhaber i. S. v.
Kapitel V, können aber selbst Datenverlangen stellen."* Der erste Halbsatz ist
richtig und durch Art. 14 gedeckt — dort ist die Bereitstellungspflicht
ausdrücklich auf andere juristische Personen als öffentliche Stellen begrenzt.
Der zweite Halbsatz benennt die Rolle, die dann tatsächlich einschlägig ist, und
das Tool zeigt dazu **nichts**.

Der Katalog enthält elf Anforderungen, die sich ausschließlich an die ersuchende
Stelle richten — nachgerechnet: `DA-V-002` (Art. 15 Abs. 1 Buchst. a, Zeile
100), `DA-V-003`, `DA-V-006` (Art. 17 Abs. 1, Zeile 104), `DA-V-007`,
`DA-V-008`, `DA-V-009`, `DA-V-016` (Art. 19 Abs. 1, Zeile 114), `DA-V-017`,
`DA-V-019`, `DA-V-023` (Art. 21 Abs. 1–5, Zeile 121), `DA-V-024`. Sie sind im
Baum vorhanden, aber nur über V-03 bis V-07 erreichbar — also nur auf dem
Dateninhaber-Pfad.

**Reproduktion:** `EIN-01 = A+D`, `EIN-05 = Ja`, `V-01 = C` → Kapitel-V-Anforderungen: 0.
Mit `V-01 = A` → 6.

**Auswirkung:** Eine öffentliche Stelle schließt aus dem Tool, Kapitel V betreffe
sie nicht. Tatsächlich treffen sie die Pflichten zur Form und Begründung des
Verlangens (Art. 17), die Pflichten der empfangenden Stelle (Art. 19) und die
Regeln zur Weitergabe an Forschung (Art. 21). Das ist der gefährlichste
Fehlertyp: fälschliche Beruhigung.

**Empfehlung (BERATER, Freigabe ANWALT):** `V-01 = C` darf M-V nicht beenden,
sondern muss in einen eigenen Zweig „als ersuchende Stelle" führen, der V-05 und
V-07 erreicht. Minimallösung ohne Umbau des Baums: Ergebnistext ergänzen um
*„Als ersuchende Stelle treffen Sie eigene Pflichten aus Art. 17, 19, 21 und 22
— diese prüft das Tool derzeit nicht."* Das behebt die Irreführung, auch wenn es
die Lücke nicht schließt.

---

### B-02 · WESENTLICH · Der Zähler mischt Pflichten mit Ausnahmen und Rechten

| | |
|---|---|
| **Fundstelle Projekt** | `app-inverso.js:369` (`erg.anzahl` + „ Anforderungen"), `app-inverso.js:47` (`anzahlText`), `app-inverso.js:529` |
| **Rechtsgrundlage** | — (Darstellungsfehler, keine Rechtsfrage) |
| **Kategorie / Schwere** | FALSCH / WESENTLICH |
| **Sicherheit** | hoch |

Die Kopfzeile nennt „N Anforderungen". Nachgerechnet für den Inverso-Durchlauf
(Rollen D+E): von 70 gezählten Einträgen sind **19 vom Typ „Ausnahme"** und
**5 vom Typ „Recht"**. Nur 46 sind Pflichten (19 Handlungs-, 15 Unterlassungs-,
12 Informationspflichten). Bei den Rollen A+C+D+E: 27 Ausnahmen und 9 Rechte von
92.

**Auswirkung:** Die erste Zahl, die ein Mandant sieht, überzeichnet die
Betroffenheit um rund ein Drittel. Eine Ausnahme ist eine Entlastung, kein
Erfüllungsaufwand. Das erzeugt fälschliche Alarmierung — der Spiegelfehler zu
B-01 und im Mandantengespräch unangenehm, weil die Zahl beim Aufklappen nicht
aufgeht.

**Empfehlung (BERATER):** Zähler nach Typ trennen: „46 Pflichten · 5 Rechte ·
19 Ausnahmen". Die Daten dafür liegen vor (`anforderungen[].typ`); die
Filterlogik des allgemeinen Werkzeugs unterscheidet die Typen bereits.

---

### B-03 · WESENTLICH · Kapitel IV endet ohne jede Aussage

| | |
|---|---|
| **Fundstelle Projekt** | `DataAct_Anforderungen.xlsx`, Blatt *Fragen*, Zeile 26 (IV-01, Kante „Nein → ENDE-MODUL", Ergebnistext leer) |
| **Rechtsgrundlage** | Art. 13 |
| **Kategorie / Schwere** | FALSCH / WESENTLICH |
| **Sicherheit** | hoch |

`IV-01 = Nein` beendet M-IV **ohne Ergebnistext**. Nachgeprüft: `lauf.befunde`
ist leer. Zum Vergleich liefert `VI-01 = Nein` den Text *„kein
Datenverarbeitungsdienst – Kapitel VI/VII gelten nicht als Anbieter"*, und
`IV-01 = Unsicher` liefert *„Einzelfallprüfung empfohlen – Vertragsinventur nach
Datenklauseln"*. Nur die Verneinung schweigt.

**Auswirkung:** Kapitel IV verschwindet für den Nutzer spurlos. Er kann nicht
unterscheiden, ob es geprüft und verneint wurde oder ob das Tool es übergangen
hat. Erschwerend: IV-01 fragt, ob das Unternehmen Verträge mit Regelungen zu
Datenzugang, -nutzung oder -haftung schließt. Ein Nicht-Jurist verneint das
leicht, obwohl marktübliche IT-Dienstleistungsverträge solche Klauseln
regelmäßig enthalten. Eine falsche Verneinung entlastet hier still von 17
Anforderungen.

**Empfehlung (BERATER, Formulierung ANWALT):** Ergebnistext ergänzen, etwa
*„Kapitel IV gilt nur für Verträge mit Klauseln über Datenzugang, -nutzung oder
Haftung. Solche Klauseln stehen häufig auch in gewöhnlichen IT-Dienstleistungs-
und Wartungsverträgen — im Zweifel Vertragsinventur."* Zusätzlich sollte der
Erklärtext zu IV-01 Beispiele nennen.

---

### B-04 · GERING · Fremde Pflicht als eigene ausgewiesen

| | |
|---|---|
| **Fundstelle Projekt** | `DA-V-002`, Blatt *Anforderungen*, Zeile 100 |
| **Rechtsgrundlage** | Art. 15 Abs. 1 Buchst. a |
| **Kategorie / Schwere** | FALSCH / GERING |
| **Sicherheit** | mittel |

Im Inverso-Durchlauf werden 93 Anforderungen ausgelöst; fünf davon sind an
Behörden, Kommission oder Mitgliedstaaten adressiert. Vier davon betreffen den
Nutzer mittelbar zu Recht (Anwendungsbereich, Sanktionsrahmen, Pflichten des
Dateninhabers). `DA-V-002` dagegen ist ausschließlich an die öffentliche Stelle
adressiert und wird dem Unternehmen als eigene Anforderung angezeigt.

**Empfehlung (BERATER):** Adressat in der Ergebniszeile sichtbar machen — das
Feld ist vorhanden und wird bereits unter „Rechtliche Einordnung" ausgegeben,
aber nicht im zugeklappten Zustand.

---

## 4. Ergebnis des Durchlaufs für Inverso

Prämissen aus `profil-inverso.json`: `EIN-05 = Ja`, `V-01 = A`, `VI-02 = Nein`,
`VI-04 = B`. Größenklasse „Mittleres Unternehmen" angesetzt (200 Mitarbeitende;
der Umsatz ist unbekannt, für die Abgrenzung Kleinst/Klein aber unerheblich).

| Rollenwahl | Fragen | Anforderungen | Kapitel |
|---|---:|---:|---|
| D+E (Cloud-Anbieter und -Kunde) | 24 | 70 | I:2 II:2 III:1 IV:17 V:6 VI:27 VII:4 VIII:2 IX:5 XI:4 |
| A+C+D+E (zusätzlich vernetzte Produkte und Datenempfang) | 32 | 92 | I:5 II:2 III:19 IV:17 V:6 VI:27 VII:4 VIII:2 IX:5 XI:5 |

Davon mit ausgewiesener Auslegungsunsicherheit: 14 bzw. 22. Mit verschobenem
Geltungsbeginn: 0.

**Schwerpunkt ist Kapitel VI/VII** (31 bzw. 31 Anforderungen) — Inverso als
Anbieter und zugleich Kunde von Datenverarbeitungsdiensten. Das ist plausibel
und deckt sich mit dem Geschäftsmodell. **Kapitel IV** (17) trifft praktisch
jedes Unternehmen mit B2B-Verträgen. Die **22 Anforderungen Differenz** zwischen
den beiden Rollenwahlen entfallen fast vollständig auf Kapitel III
(Datenbereitstellung) — das ist die offene Kernfrage.

**Fragen, die Inverso voraussichtlich falsch oder mit „Unsicher" beantwortet:**

| Frage | Risiko | Verhalten des Tools |
|---|---|---|
| `EIN-01` (Rollen) | Rolle A („digitale Dienste für vernetzte Produkte") wird bei Versicherungssoftware mit Telematik- oder Smart-Home-Anbindung leicht übersehen | Kapitel II und III fallen komplett weg — bis zu 60 Anforderungen |
| `II-06` („Wo liegen die Daten?") | entscheidet über `DATENINHABER`; bei Betrieb für Kunden nicht offensichtlich | „Unsicher" ist vorgesehen, Wert bleibt unbekannt, Vergleiche liefern „unbekannt" |
| `IV-01` (Datenklauseln in Verträgen) | siehe B-03 | stille Verneinung ohne Text |
| `VI-01` (Datenverarbeitungsdienst?) | Abgrenzung Art. 2 Nr. 8 gegenüber reinem Application Management | „Unsicher" erzeugt korrekt „Einzelfallprüfung empfohlen" |
| `VI-04` (IaaS vs. PaaS/SaaS) | bei Hybrid- und Managed-Diensten unscharf; entscheidet zwischen Art. 30 Abs. 1 und Abs. 2–4 | vorbelegt mit B, im Bild umstellbar |

Bei „Unsicher" beendet das Tool das jeweilige Modul, erzeugt aber einen als
unsicher markierten Befund („Einzelfallprüfung empfohlen"). Das ist für ein
Orientierungsinstrument das richtige Verhalten. Zu beachten ist nur, dass die
Zahl in der Kopfzeile dann nicht ausweist, dass ein ganzes Kapitel offen blieb.

---

## 5. Befunde Prüfung 2 — Weitergabe an den Mandanten

### B-05 · WESENTLICH · Kein Rechtsstand mit Datum

Weder `data-act-check.html` noch `data-act-inverso.html` nennen, auf welchen
Rechtsstand sie sich beziehen. Gesucht wurde nach „Rechtsstand", „Stand:" und
Datumsangaben; gefunden wurden nur inhaltliche Fristen (12.09.2025 usw.). Bei
einem Rechtsgebiet in Bewegung erweckt das den Eindruck fortlaufender Aktualität.
**Empfehlung (BERATER):** Fußzeile und Druckdeckblatt um „Rechtsstand:
17.09.2026" ergänzen. *Zuständigkeit: BERATER.*

### B-06 · WESENTLICH · Kein Hinweis auf den Digital Omnibus

Volltextsuche in `data.json`: 0 Treffer für „Omnibus". Das Gesetzgebungsverfahren
ist nicht abgeschlossen; Änderungen an Data Act und DSGVO stehen im Raum. Ein
Orientierungstool, das dazu schweigt, suggeriert Endgültigkeit.
**Empfehlung (BERATER, Formulierung ANWALT):** Ein Satz an derselben Stelle wie
der Rechtsstand. *Zuständigkeit: BEIDE.*

### B-07 · WESENTLICH · Die deutsche Umsetzungsebene fehlt vollständig

Volltextsuche in `data.json`: 0 Treffer für „BNetzA", „Bundesnetzagentur",
„DADG", „Durchführungsgesetz". Das Tool bildet ausschließlich die EU-Ebene ab.
Das Data-Act-Durchführungsgesetz ist seit **30.05.2026** in Kraft; zuständige
Behörde ist die **Bundesnetzagentur** (extern recherchiert, siehe unten). Zu
Sanktionen sagt das Tool nur, was Art. 40 sagt: „Mitgliedstaaten erlassen
wirksame, verhältnismäßige und abschreckende Sanktionen" (`DA-IX-007`).

Ein deutscher Mandant wird als Erstes fragen, wer das durchsetzt und was es
kostet. Darauf gibt das Tool keine Antwort.

*Quellenlage:* Die recherchierten Sekundärquellen nennen unterschiedliche
Bußgeldrahmen (bis 5 Mio. € bzw. bis 500.000 € im Zuständigkeitsbereich der
BNetzA). **Diese Zahl habe ich nicht verifiziert** und sie gehört nicht ohne
anwaltliche Prüfung in ein Mandantendokument. *Zuständigkeit: BEIDE,
Sicherheit: niedrig.*

### B-08 · WESENTLICH · Rechtshinweis in der Inverso-Fassung nur in der Fußzeile

Im allgemeinen Werkzeug steht der Rechtshinweis an beiden richtigen Stellen —
Startbildschirm (`app.js:1129`) und Ergebnisseite (`app.js:1903`). In der
Inverso-Fassung steht er **nur** in der Fußzeile (`app-inverso.js:819`), bei
Zeichenposition 4542 von 4828 des Seitentextes. Die Seite ist rund 2600 px hoch;
der Mandant sieht die Anforderungen lange vor dem Hinweis.
**Empfehlung (BERATER):** Den Hinweis zusätzlich in die Kopfzeile, wo die Zahl
der Anforderungen steht. *Zuständigkeit: BERATER.*

### B-09 · WESENTLICH · `index.html` führt auf ein fremdes Produkt, das Google Fonts lädt

`index.html` leitet per Meta-Refresh und `location.replace` auf `signum/` weiter
— eine Landingpage für ein anderes Produkt („Signum – Anlässe aus öffentlichen
Registern"), ohne jeden Bezug zum Data Act. Diese Seite lädt Schriften von
`fonts.googleapis.com` und `fonts.gstatic.com` (`signum/index.html:15–17`), also
mit Verbindungsaufbau zu einem US-Anbieter beim Seitenaufruf.

Die beiden Tool-Dateien selbst sind sauber: `node pruefe.js` belegt für beide
keine externen URLs, kein `fetch`/`XMLHttpRequest`/`WebSocket`, keine externen
Schriften, `localStorage` nur in `try/catch`.

**Auswirkung:** Wird dem Mandanten ein Link auf das Repository oder die
veröffentlichte Seite gegeben, landet er auf einem fremden Produktangebot mit
einwilligungsbedürftiger Drittanbieter-Einbindung. Werden nur die beiden
HTML-Dateien verschickt, besteht das Problem nicht.
**Empfehlung (BERATER):** Entweder die Tool-Dateien getrennt ausliefern oder
`index.html` auf das Tool zeigen lassen und die Fonts in `signum/` lokal
einbetten. *Zuständigkeit: BERATER.*

### B-10 · GERING · Vertraulichkeit

`NOTES.md` und `profil-inverso.json` enthalten meine Annahmen über Inverso samt
Begründung („Produktivbetrieb seit 1997", „kein Infrastrukturdienst") und die
Korrekturhistorie einschließlich der Fehleinschätzung zum Dateninhaber.
`signum/` ist ein fremdes Produktangebot. Nichts davon ist geheim, aber nichts
davon gehört in eine Mandantenlieferung.
**Empfehlung (BERATER):** Nur `data-act-inverso.html` weitergeben.

### Verständlichkeit, Professionalität

Stichprobe über Fragen und Ergebnistexte: keine Platzhalter, keine internen
Kommentare, keine Entwicklungsreste in den Auslieferungsdateien gefunden. Die
Fragen sind geschlossen formuliert und durchgehend mit „Unsicher" versehen, wo
Auslegung im Spiel ist. Die Buchstabenoptionen tragen seit der letzten Änderung
ihren Klartext. Erklärtexte und Rechtsgrundlagen stehen im Hover.

---

## 6. Agenda für das Anwaltsgespräch

Die folgenden Punkte sind **keine Mängel des Tools**, sondern Fragen, die das
Tool zu Recht offen lässt und die vor einer Aussage gegenüber dem Mandanten
geklärt sein sollten.

1. **Ist Inverso Dateninhaber i. S. v. Art. 2 Nr. 13?** Das ist die Frage mit dem
   größten Hebel: Sie entscheidet über bis zu 60 zusätzliche Anforderungen aus
   den Kapiteln II und III. Konkret: Erbringt Inverso digitale Dienste für
   vernetzte Produkte (Telematiktarife, Smart-Home-Sensorik, Wearables in der
   Kranken- oder Unfallversicherung)? Und wo liegen die dabei erzeugten Daten —
   bei Inverso oder beim Versicherer?
2. **Wer ist Dateninhaber im Auftragsverhältnis?** Inverso betreibt Software für
   Versicherer. Ist der Versicherer Dateninhaber und Inverso nur
   Auftragsverarbeiter, oder entsteht bei Inverso eine eigene Dateninhaberschaft?
   Die Excel bildet das über II-04 (Unterauftragnehmer) ab — reicht das?
3. **Reichweite der Kapitel-VI-Ausnahmen.** Greift die Ausnahme für
   maßgeschneiderte Dienste bei einer für einen einzelnen Versicherer
   entwickelten Lösung, die auf einer gemeinsamen Plattform läuft?
4. **Bereitstellungsmodell nach Art. 30.** `VI-04` entscheidet zwischen Art. 30
   Abs. 1 (Infrastruktur) und Abs. 2–4 (Plattform/Software). Bei Managed
   Services mit Infrastrukturanteil ist das nicht eindeutig.
5. **Altverträge nach Art. 50.** Die Excel lässt offen, welche Antwort auf
   `IV-03` den Altvertragsfall setzt (dokumentiert in `NOTES.md` Punkt 1). Welche
   Lesart ist richtig — und trifft die Frist 12.09.2027 für unbefristete Verträge
   bzw. solche mit Laufzeit bis mindestens 11.01.2034 zu?
6. **Bußgeldrahmen nach DADG.** Welche Zahl gilt, und darf sie einem Mandanten
   genannt werden? (Siehe B-07, Sekundärquellen widersprechen sich.)
7. **RDG-Grenze.** Genügen die vorhandenen Hinweise, oder ist eine ausdrückliche
   Erklärung nötig, dass keine Rechtsdienstleistung erbracht wird?

---

## 7. Geprüft und für in Ordnung befunden

Damit nachvollziehbar ist, was **nicht** zu beanstanden war — und damit meine
eigenen Fehlspuren dokumentiert sind:

- **Art.-7-Ausnahme (Kleinst- und Kleinunternehmen).** Kontrolliert über einen
  Pfad, der II-04 erreicht: Kleinst ohne Konzernbindung → 31 Kapitel-II-Anforderungen
  entfallen; Kleinst **mit** Konzernbindung → nichts entfällt, die Ausnahme wird
  korrekt verweigert; Konzernbindung „Unsicher" → ebenfalls keine Entlastung.
  Der Konzern-Ausschluss des Art. 7 Abs. 1 UAbs. 1 ist damit wirksam umgesetzt,
  und zwar konservativ. *Ein erster Messlauf legte das Gegenteil nahe — er traf
  den Pfad nicht, der die Regel auslöst.*
- **`modulAnwendbar`.** Arbeitet korrekt; M-II, M-III und M-VIII werden bei
  fehlender Rolle richtig ausgeschlossen. *Auch hier führte ein erster Messlauf
  in die Irre, weil ich die Funktion falsch aufgerufen hatte.*
- **Ausschlusszeilen.** Alle 306 tragen eine Bedingung; keine schaltet eine
  Pflicht unbedingt ab. Keine Anforderung wird ausschließlich ausgeschlossen und
  nie ausgelöst.
- **Kapitel-VI-Ausnahmen.** Testversion (`VI-02 = Ja`): Kapitel VI/VII sinkt von
  29 auf 6. Maßgeschneidert (`VI-03 = Ja`): von 33 auf 29. Beide greifen im Baum.
- **Erreichbarkeit und Pfadenden.** Modulweise erschöpfend aufgezählt (36.456
  Pfade über 64 Rollenkombinationen): keine unerreichbare Frage, kein Modul, das
  ohne Frage endet, kein Zyklus, kein Wächterabbruch.
- **Fristen.** Die Angaben im Blatt *Fristen* decken sich mit Art. 50 (Geltung ab
  12.09.2025; 12.09.2026 für vernetzte Produkte; 12.09.2027 für Altverträge nach
  Kap. IV) und Art. 29 Abs. 1 (Wegfall der Wechselentgelte ab 12.01.2027).
- **„Unsicher".** Führt bei allen Fragen weiter und erzeugt, wo es ein Modul
  beendet, einen als unsicher markierten Befund „Einzelfallprüfung empfohlen".
  Keine stille Entlastung.

---

## 8. Bewusste Vereinfachungen (kein Handlungsdruck)

- **Anbieterwechsel und Parallelnutzung** stammen aus derselben Frage `VI-10`
  (A = Wechsel, B = parallele Nutzung, C = beides). Sie erscheinen als ein Strang
  mit zwei Ausgängen statt als zwei Sachverhalte. Für einen Erstüberblick
  vertretbar.
- **Nur EU-Ebene.** Für eine Betroffenheitsanalyse tragfähig; siehe aber B-07 zur
  fehlenden Nennung von Behörde und Sanktionsrahmen.
- **Positionelle Wertzuordnungen.** Bei sechs Variablen (`GROESSE`,
  `VERTRAG_ALT`, `JURISTISCHE_PERSON`, `CLOUD_MODELL`, `KAP3_ROLLE`,
  `KLAUSEL_ROLLE`) nennt die Excel die Zuordnung Antwort → Wert nicht. Der Build
  nimmt sie positionell an bzw. behandelt die Variable als „gesetzt, Wert
  unbekannt" und weist beides in `NOTES.md` aus. Sauber dokumentiert.
- **Prüftiefe des Katalogs.** Alle 189 Fundstellen wurden maschinell auf innere
  Stimmigkeit geprüft; inhaltlich gegen den Verordnungstext geprüft wurden die
  Anforderungen des Inverso-Durchlaufs und eine Stichprobe. Eine Volltiefenprüfung
  aller 189 wäre für ein Orientierungsinstrument unverhältnismäßig — der Umfang
  ist hier offengelegt, nicht verschwiegen.

---

## 9. To-dos

### Berater — in dieser Reihenfolge

1. **B-01** Ergebnistext zu `V-01 = C` ergänzen (Sofortmaßnahme), Umbau des
   Zweigs einplanen · *blockiert die Weitergabe*
2. **B-02** Zähler nach Pflicht / Recht / Ausnahme trennen
3. **B-03** Ergebnistext und Erklärtext zu `IV-01 = Nein` ergänzen
4. **B-08** Rechtshinweis in die Kopfzeile der Inverso-Fassung
5. **B-05** Rechtsstand mit Datum in Fußzeile und Druckdeckblatt
6. **B-09** Auslieferung klären: nur die HTML-Datei, oder `index.html` und die
   Google Fonts in `signum/` bereinigen
7. **B-06** Omnibus-Hinweis einbauen (Formulierung vom Anwalt)
8. **B-07** Abschnitt zu BNetzA und DADG ergänzen (Inhalt vom Anwalt)
9. **B-04** Adressat in der zugeklappten Ergebniszeile anzeigen
10. **B-10** Lieferumfang auf `data-act-inverso.html` beschränken

### Anwalt — in dieser Reihenfolge

1. **B-01** Freigabe der Formulierung zu Kapitel V und öffentlichen Stellen
2. **Agenda Nr. 1 und 2** Dateninhaberschaft von Inverso — bestimmt den gesamten
   Zuschnitt
3. **B-07** Bußgeldrahmen und BNetzA-Zuständigkeit: welche Angabe darf genannt
   werden
4. **B-06** Formulierung des Omnibus-Hinweises
5. **Agenda Nr. 5** Lesart zu `IV-03` und Art. 50 Altverträge
6. **Agenda Nr. 3, 4** Reichweite der Kapitel-VI-Ausnahmen und Art. 30
7. **Agenda Nr. 7** RDG-Grenze und Haftungshinweis

---

## Quellen

Verordnungstext artikelweise abgerufen über
[data-act-law.eu](https://data-act-law.eu/de/) (nicht-amtliche Quelle; EUR-Lex
lieferte über den Abruf nur die Erwägungsgründe). Zum DADG:
[Bundesnetzagentur, Pressemitteilung vom 30.05.2026](https://www.bundesnetzagentur.de/SharedDocs/Pressemitteilungen/DE/2026/20260530_DA.html),
[Haufe](https://www.haufe.de/recht/durchfuehrungsgesetz-data-act-verabschiedet-und-verkuendet_226_688644.html),
[HÄRTING](https://haerting.de/wissen/data-act-durchfuehrungsgesetz-dadg-was-unternehmen-jetzt-wissen-muessen/).
Angaben zum Bußgeldrahmen sind Sekundärquellen und wurden nicht verifiziert.

---

*Dieses Review ist eine KI-gestützte Vorprüfung, erstellt vom selben Urheber wie
das geprüfte Tool (siehe Abschnitt 0). Es ersetzt keine anwaltliche Prüfung. Die
abschließende rechtliche Freigabe erfolgt durch eine zugelassene Rechtsanwältin
oder einen zugelassenen Rechtsanwalt.*
