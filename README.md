# claude_ideas

Sammlung von Produktideen und zugehörigen Prototypen.

## Signum – Landingpage

`signum/index.html` ist eine in sich geschlossene Landingpage (Inline-CSS/JS, einzige externe Abhängigkeit: Google Fonts) für **Signum**: eine Signal-Engine, die öffentliche Register, Bekanntmachungen und Vergabeportale liest und jedes Ereignis in einen fachlichen Anlass übersetzt – mit Zeitfenster, empfohlener Handlung und zuständiger Person. Zielgruppe sind Beratungshäuser im DACH-Raum, IT- und Security-Beratung zuerst.

- Öffnen: Datei direkt im Browser öffnen, kein Build-Schritt nötig.
- Conversion-Ziel ist die kostenlose Beispielliste, nicht die Demo. Das Formular baut clientseitig einen `mailto:`-Link; die Zieladresse steht als `ADRESSE` im Skriptblock am Dateiende.
- Hell- und Dunkeldarstellung folgen der Systemeinstellung. Es gibt bewusst keinen Umschalter, weil die Spezifikation `localStorage` ausschließt und eine Auswahl ohne Speicherung bei jedem Seitenaufruf verloren ginge. Die Tokens sind zusätzlich unter `:root[data-theme="dark"]` definiert, falls die Darstellung von außen gestempelt wird.
- Kein Tracking, keine Analytics, keine externen Skripte, keine Browser-Speicher-APIs.
- Alle Unternehmen, Personen, Zahlen und Fristen in den Produktansichten sind frei erfunden und mit einem sichtbaren `Beispiel`-Marker gekennzeichnet.

## Deployment

Jeder Push auf den Default-Branch veröffentlicht die Seite automatisch über GitHub Pages (Workflow `.github/workflows/deploy-pages.yml`). Die Root-URL leitet auf `signum/` weiter.
