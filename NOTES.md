# NOTES – Data-Act-Entscheidungsbaum, Datengrundlage

Erzeugt von `build_data.py` am 2026-09-16T14:05:36 aus `DataAct_Anforderungen.xlsx`. Diese Datei wird bei jedem Lauf neu geschrieben; der Abschnitt „Testprofile" stammt aus `verify_data.py` und bleibt dabei erhalten.

## 1 Umfang der erzeugten data.json

| Objekt | Einträge |
| --- | ---: |
| module | 8 |
| fragen | 49 |
| kanten | 150 |
| variablen | 45 |
| mapping | 797 |
| anforderungen | 189 |
| ergebnisse | 189 |
| begriffe | 37 |
| fristen | 25 |
| offene_punkte | 38 |
| legende | 8 |
| qs_abschnitte | 8 |
| testprofile | 6 |
| warnungen | 6 |
| hinweise | 146 |

## 2 Warnliste – nicht eindeutig parsebare Stellen

Nichts davon wurde geraten oder verworfen. Die betroffenen Stellen stehen als Klartext in der data.json und können am Ergebnis angezeigt werden.

| Blatt | Bezug | Feld | Problem | Rohtext |
| --- | --- | --- | --- | --- |
| Fragen | EIN-02 | Gesetzte Variable | Zuordnung Antwort->Wert für GROESSE steht nicht in der Excel; positionell angenommen: Kleinstunternehmen (< 10 Mitarbeiter und ≤ 2 Mio. € Umsatz/Bilanz)=Kleinst, Kleinunternehmen (< 50 Mitarbeiter und ≤ 10 Mio. €)=Klein, Mittleres Unternehmen (< 250 Mitarbeiter und ≤ 50 Mio. € Umsatz bzw. ≤ 43 Mio. € Bilanz)=Mittel, Großunternehmen (darüber)=Groß – bitte bestätigen | `GROESSE (Kleinst / Klein / Mittel / Groß)` |
| Fragen | III-01 | Gesetzte Variable | 3 Werte stehen 5 Antwortoptionen gegenüber – keine eindeutige Zuordnung ableitbar | `KAP3_ROLLE (Bereitsteller / Empfänger / Beides)` |
| Fragen | IV-02 | Gesetzte Variable | 3 Werte stehen 4 Antwortoptionen gegenüber – keine eindeutige Zuordnung ableitbar | `KLAUSEL_ROLLE (Verwender / Betroffener / Beides)` |
| Fragen | IV-03 | Gesetzte Variable | Zuordnung Antwort->Wert für VERTRAG_ALT steht nicht in der Excel; positionell angenommen: A=Ja, B=Nein, C=Gemischt – bitte bestätigen | `VERTRAG_ALT (Ja / Nein / Gemischt)` |
| Fragen | V-01 | Gesetzte Variable | Zuordnung Antwort->Wert für JURISTISCHE_PERSON steht nicht in der Excel; positionell angenommen: A=Ja, B=Nein, C=Öffentlich, D=Öffentliches Unternehmen – bitte bestätigen | `JURISTISCHE_PERSON (Ja / Nein / Öffentlich / Öffentliches Unternehmen)` |
| Fragen | VI-04 | Gesetzte Variable | Zuordnung Antwort->Wert für CLOUD_MODELL steht nicht in der Excel; positionell angenommen: A=IaaS, B=PaaS-SaaS, Unsicher=Unsicher – bitte bestätigen | `CLOUD_MODELL (IaaS / PaaS-SaaS / Unsicher)` |

### 2b Bedingungen mit Klartextanteil

Diese Bedingungen sind fachlich formuliert und nicht vollständig auf Variablen zurückführbar. Sie werden in der Simulation als erfüllt behandelt (neutral) und im JSON als Klartext mitgeführt.

| Blatt | Feld | Rohtext | betroffene Zeilen |
| --- | --- | --- | --- |
| Fragen | Anzeigebedingung | `DATENINHABER = Ja oder ROLLE_DRITTER = Ja oder DRITTER_AKTIV = Ja oder (ROLLE_PRODUKT = Ja und Art.-7-Ausnahme in II-04 ausgelöst)` | 1 (III-01) |
| Fragen | Anzeigebedingung | `II-04 = Ja oder (II-04 = Nein und keine Ausnahme ausgelöst)` | 1 (II-05) |
| Fragen | Anzeigebedingung | `erreicht über II-05` | 1 (II-06) |
| Fragen | Anzeigebedingung | `erreicht über III-02` | 1 (III-03) |
| Fragen | Anzeigebedingung | `erreicht über III-03 oder III-04` | 1 (III-05) |
| Fragen | Anzeigebedingung | `erreicht über V-03 oder V-04` | 1 (V-05) |
| Fragen | Anzeigebedingung | `erreicht über V-05` | 1 (V-06) |
| Fragen | Anzeigebedingung | `erreicht über V-06` | 1 (V-07) |
| Fragen | Anzeigebedingung | `erreicht über VI-03` | 1 (VI-04) |
| Fragen | Anzeigebedingung | `erreicht über VI-04` | 1 (VI-05) |
| Fragen | Anzeigebedingung | `erreicht über VI-05 oder VI-02` | 1 (VI-06) |
| Mapping | Bedingung | `Art. 7 nur bei KONZERN = Nein und UNTERAUFTRAG = Nein (II-04); Art. 9 Abs. 4 nur als Datenempfänger` | 4 (MAP-0013, MAP-0014, MAP-0015, MAP-0016) |
| Mapping | Bedingung | `MASSGESCHNEIDERT ≠ Ja; Frist 12 Monate nach Veröffentlichung in zentraler Datenbank` | 2 (MAP-0690, MAP-0691) |
| Mapping | Bedingung | `als Anbieter` | 41 (MAP-0543, MAP-0544, MAP-0545, MAP-0546 …) |
| Mapping | Bedingung | `bis zur Nachbesserung des Verlangens` | 1 (MAP-0510) |
| Mapping | Bedingung | `nur für die befristeten Altverträge; Neuverträge (IV-03 = C) bleiben erfasst` | 17 (MAP-0440, MAP-0441, MAP-0442, MAP-0443 …) |
| Mapping | Bedingung | `nur wenn auch VERBUNDENER_DIENST = Nein` | 2 (MAP-0043, MAP-0044) |
| Mapping | Bedingung | `vorbehaltlich Ausnahme II-04` | 2 (MAP-0045, MAP-0046) |
| Mapping | Bedingung | `vorbehaltlich Ausnahme II-04; Art. 3 Abs. 2 trifft den Verkäufer/Vermieter/Leasinggeber – bei Direktvertrieb den Hersteller` | 2 (MAP-0052, MAP-0053) |
| Mapping | Bedingung | `vorbehaltlich III-02` | 42 (MAP-0264, MAP-0265, MAP-0266, MAP-0267 …) |
| Mapping | Bedingung | `vorbehaltlich IV-02 bis IV-04` | 6 (MAP-0348, MAP-0349, MAP-0350, MAP-0351 …) |
| Mapping | Bedingung | `vorbehaltlich V-02 ff.` | 3 (MAP-0474, MAP-0475, MAP-0476) |
| Mapping | Bedingung | `vorbehaltlich V-02 ff.; öffentliche Unternehmen können Dateninhaber sein (EG 63)` | 3 (MAP-0477, MAP-0478, MAP-0479) |
| Mapping | Bedingung | `vorbehaltlich V-03 bis V-06` | 1 (MAP-0482) |
| Mapping | Bedingung | `vorbehaltlich VI-02/VI-03` | 7 (MAP-0536, MAP-0537, MAP-0538, MAP-0539 …) |
| Modulsteuerung | Startbedingung | `DATENINHABER = Ja oder ROLLE_DRITTER = Ja oder DRITTER_AKTIV = Ja oder (ROLLE_PRODUKT = Ja und GROESSE ∈ {Kleinst, Klein} und Art.-7-Ausnahme ausgelöst)` | 1 (M-III) |
| Modulsteuerung | Startbedingung | `Nach dem letzten anwendbaren Modul` | 1 (Ergebnis) |

## 3 Testprofile aus QS-Abschnitt 6

<!-- TESTPROFILE:START -->
**A) Reine Excel-Lesart, ohne Annahmen.** Die Excel nennt je Profil nur den Pfad, nicht die Antworten. Offene Antworten werden bestmöglich belegt; die Abweichung ist damit eine Untergrenze.

| Profil | Fragen Pfad / QS | offene Antworten | erwartet ausgelöst | berechnet | Δ | erwartet ausgeschlossen | berechnet | Δ | Σ Abweichung |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **T1** | 25 / 25 | 14 | 85 | 85 | +0 | 0 | 0 | +0 | 0 |
| **T2** | 16 / 16 | 6 | 64 | 63 | -1 | 3 | 3 | +0 | 1 |
| **T3** | 13 / 13 | 6 | 32 | 31 | -1 | 34 | 34 | +0 | 1 |
| **T4** | 18 / 18 | 10 | 57 | 58 | +1 | 17 | 17 | +0 | 1 |
| **T5** | 19 / 19 | 11 | 61 | 60 | -1 | 2 | 2 | +0 | 1 |
| **T6** | 18 / 18 | 7 | 69 | 68 | -1 | 5 | 5 | +0 | 1 |

Summe der Abweichungen: **5**

**T1 – Mittelständischer Maschinenbauer (180 MA, konzernfrei, Maschinen mit Sensorik, eigene IoT-Plattform, nutzt Cloud)**

- Verfahren: Koordinatenabstieg, 60 Startpunkte (419,904 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-03` ∈ {Ja, Nein, Unsicher}; `EIN-04` ∈ {Ja, Nein, Unsicher}; `EIN-07` ∈ {Ja, Nein}; `II-04` ∈ {Ja, Nein}; `II-05` ∈ {Ja, Nein}; `II-07` ∈ {Ja, Nein, Unsicher}; `II-08` ∈ {Ja, Nein, Unsicher}; `III-01` ∈ {A, B, C}; `III-02` ∈ {Ja, Unsicher}; `III-04` ∈ {Ja, Nein, Unsicher}; `III-05` ∈ {Ja, Nein}; `IV-02` ∈ {A, B, C}; `IV-04` ∈ {Ja, Nein, Unsicher}; `V-01` ∈ {A, D}
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-III-016, DA-V-011, DA-V-012, DA-V-014, DA-V-018, DA-VI-001, DA-VI-002, DA-VI-004, DA-VI-016, DA-VI-017, DA-VI-018, DA-VI-019
- verwendeter Antwortsatz: `EIN-01`=A+E, `EIN-02`=Mittleres Unternehmen (< 250 Mitarbeiter und ≤ 50 Mio. € Umsatz bzw. ≤ 43 Mio. € Bilanz), `EIN-03`=Nein, `EIN-04`=Unsicher, `EIN-05`=Ja, `EIN-07`=Nein, `II-01`=Ja, `II-03`=Nein, `II-04`=Nein, `II-05`=Ja, `II-06`=A, `II-07`=Ja, `II-08`=Ja, `III-01`=A, `III-02`=Ja, `III-03`=Ja, `III-04`=Ja, `III-05`=Ja, `IV-01`=Ja, `IV-02`=B, `IV-03`=C, `IV-04`=Unsicher, `V-01`=A, `V-02`=Nein, `VI-09`=Nein

**T2 – SaaS-Anbieter (Großunternehmen, EU, Standardprodukt, Daten in Frankfurt, keine Egress-Gebühren, kein Drittstaatsverlangen)**

- Verfahren: vollständig (216 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-07` ∈ {Ja, Nein}; `IV-02` ∈ {A, B, C}; `V-01` ∈ {A, D}; `VI-03` ∈ {Ja, Nein, Unsicher}; `VI-04` ∈ {A, B, Unsicher}; `VI-05` ∈ {Ja, Nein}
- erwartet, aber nicht ausgelöst: DA-XI-006
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-V-011, DA-V-012, DA-V-014, DA-V-018, DA-VI-022, DA-VI-023, DA-VII-002, DA-VII-003, DA-VII-004, DA-VII-005, DA-VII-006
- verwendeter Antwortsatz: `EIN-01`=D, `EIN-02`=Großunternehmen (darüber), `EIN-05`=Ja, `EIN-07`=Nein, `IV-01`=Ja, `IV-02`=A, `IV-03`=B, `V-01`=A, `V-02`=Nein, `VI-01`=Ja, `VI-02`=Nein, `VI-03`=Nein, `VI-04`=B, `VI-05`=Nein, `VI-06`=Ja, `VI-07`=Nein

**T3 – Eigenständiger Kleinhersteller (35 MA, Smart-Home-Geräte, kein Konzern, kein Unterauftrag, Daten in eigener Cloud)**

- Verfahren: vollständig (144 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-02` ∈ {Kleinstunternehmen (< 10 Mitarbeiter und ≤ 2 Mio. € Umsatz/Bilanz), Kleinunternehmen (< 50 Mitarbeiter und ≤ 10 Mio. €)}; `EIN-03` ∈ {Ja, Nein, Unsicher}; `EIN-07` ∈ {Ja, Nein}; `II-04` ∈ {Ja, Nein}; `IV-02` ∈ {A, B, C}; `V-01` ∈ {A, D}
- erwartet, aber nicht ausgelöst: DA-XI-006
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-V-011, DA-V-012, DA-V-014, DA-V-018
- verwendeter Antwortsatz: `EIN-01`=A, `EIN-02`=Kleinstunternehmen (< 10 Mitarbeiter und ≤ 2 Mio. € Umsatz/Bilanz), `EIN-03`=Nein, `EIN-05`=Ja, `EIN-07`=Nein, `II-01`=Ja, `II-03`=Nein, `II-04`=Nein, `IV-01`=Ja, `IV-02`=A, `IV-03`=B, `V-01`=A, `V-02`=Nein

**T4 – Logistikunternehmen (Groß, Nutzer von Telematik/Lkw-Flotte, Behördenverlangen wegen Hochwasser-Notstand, Daten enthalten Fahrerdaten)**

- Verfahren: vollständig (10368 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-07` ∈ {Ja, Nein}; `II-10` ∈ {Ja, Nein, Unsicher}; `IV-02` ∈ {A, B, C}; `IV-04` ∈ {Ja, Nein, Unsicher}; `V-01` ∈ {A, D}; `V-03` ∈ {Ja, Unsicher}; `V-05` ∈ {Ja, Unsicher}; `V-06` ∈ {Nein, Unsicher}; `V-07` ∈ {A, B, C, D}; `VI-10` ∈ {A, B, C}
- ausgelöst, aber nicht erwartet: DA-XI-006
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-V-006, DA-V-007
- verwendeter Antwortsatz: `EIN-01`=B+E, `EIN-02`=Großunternehmen (darüber), `EIN-05`=Ja, `EIN-07`=Nein, `II-09`=Ja, `II-10`=Ja, `IV-01`=Ja, `IV-02`=A, `IV-03`=C, `IV-04`=Nein, `V-01`=A, `V-02`=Ja, `V-03`=Ja, `V-05`=Ja, `V-06`=Nein, `V-07`=A, `VI-09`=Ja, `VI-10`=A

**T5 – Unabhängige Kfz-Werkstatt (Kleinunternehmen, empfängt Fahrzeugdaten auf Nutzerverlangen, gibt sie an Analytics-Partner weiter, Behördenverlangen ohne Notstand)**

- Verfahren: vollständig (15552 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-02` ∈ {Kleinstunternehmen (< 10 Mitarbeiter und ≤ 2 Mio. € Umsatz/Bilanz), Kleinunternehmen (< 50 Mitarbeiter und ≤ 10 Mio. €)}; `EIN-03` ∈ {Ja, Nein, Unsicher}; `EIN-07` ∈ {Ja, Nein}; `II-12` ∈ {Ja, Nein}; `III-01` ∈ {A, B, C}; `III-02` ∈ {Ja, Unsicher}; `III-04` ∈ {Ja, Nein, Unsicher}; `III-05` ∈ {Ja, Nein}; `IV-02` ∈ {A, B, C}; `V-01` ∈ {A, D}; `V-04` ∈ {Ja, Nein, Unsicher}
- erwartet, aber nicht ausgelöst: DA-XI-006
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-III-019, DA-III-020
- verwendeter Antwortsatz: `EIN-01`=C, `EIN-02`=Kleinstunternehmen (< 10 Mitarbeiter und ≤ 2 Mio. € Umsatz/Bilanz), `EIN-03`=Nein, `EIN-05`=Ja, `EIN-07`=Nein, `II-11`=Ja, `II-12`=Ja, `III-01`=B, `III-02`=Ja, `III-03`=Ja, `III-04`=Ja, `III-05`=Nein, `IV-01`=Ja, `IV-02`=A, `IV-03`=B, `V-01`=A, `V-02`=Ja, `V-03`=Nein, `V-04`=Ja

**T6 – US-IaaS-Anbieter ohne EU-Niederlassung (Groß, EU-Kunden, Egress-Gebühren, Herausgabeverlangen einer US-Behörde ohne Abkommen)**

- Verfahren: vollständig (648 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-07` ∈ {Ja, Nein}; `IV-02` ∈ {A, B, C}; `V-01` ∈ {A, D}; `VI-03` ∈ {Ja, Nein, Unsicher}; `VI-04` ∈ {A, B, Unsicher}; `VI-05` ∈ {Ja, Nein}; `VI-08` ∈ {Ja, Nein, Unsicher}
- erwartet, aber nicht ausgelöst: DA-XI-006
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-V-011, DA-V-012, DA-V-014, DA-V-018
- verwendeter Antwortsatz: `EIN-01`=D, `EIN-02`=Großunternehmen (darüber), `EIN-05`=Nein, `EIN-06`=Ja, `EIN-07`=Nein, `IV-01`=Ja, `IV-02`=A, `IV-03`=B, `V-01`=A, `V-02`=Nein, `VI-01`=Ja, `VI-02`=Nein, `VI-03`=Nein, `VI-04`=A, `VI-05`=Ja, `VI-06`=Ja, `VI-07`=Ja, `VI-08`=Nein


**B) Mit den Annahmen aus `annahmen.json`.** Prüfannahme zu IV-03: Die Excel sagt nicht, welche Antwortoption welchen Wert von VERTRAG_ALT setzt ('VERTRAG_ALT (Ja / Nein / Gemischt)' bei den Optionen A/B/C). Nach dem Wortlaut der Optionen bedeutet A ('Nach dem 12.09.2025') kein Altvertrag und B ('Am oder vor dem 12.09.2025') Altvertrag - also genau umgekehrt zur Reihenfolge. Diese Datei prueft diese Lesart, ohne die Excel zu aendern. Weitere Annahmen koennen nach demselben Muster ergaenzt werden.

| Profil | Fragen Pfad / QS | offene Antworten | erwartet ausgelöst | berechnet | Δ | erwartet ausgeschlossen | berechnet | Δ | Σ Abweichung |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **T1** | 25 / 25 | 15 | 85 | 85 | +0 | 0 | 0 | +0 | 0 |
| **T2** | 16 / 16 | 6 | 64 | 64 | +0 | 3 | 3 | +0 | 0 |
| **T3** | 13 / 13 | 6 | 32 | 32 | +0 | 34 | 34 | +0 | 0 |
| **T4** | 18 / 18 | 11 | 57 | 57 | +0 | 17 | 17 | +0 | 0 |
| **T5** | 19 / 19 | 11 | 61 | 61 | +0 | 2 | 2 | +0 | 0 |
| **T6** | 18 / 18 | 7 | 69 | 69 | +0 | 5 | 5 | +0 | 0 |

Summe der Abweichungen: **0**

**T1 – Mittelständischer Maschinenbauer (180 MA, konzernfrei, Maschinen mit Sensorik, eigene IoT-Plattform, nutzt Cloud)**

- Verfahren: Koordinatenabstieg, 60 Startpunkte (839,808 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-03` ∈ {Ja, Nein, Unsicher}; `EIN-04` ∈ {Ja, Nein, Unsicher}; `EIN-07` ∈ {Ja, Nein}; `II-04` ∈ {Ja, Nein}; `II-05` ∈ {Ja, Nein}; `II-07` ∈ {Ja, Nein, Unsicher}; `II-08` ∈ {Ja, Nein, Unsicher}; `III-01` ∈ {A, B, C}; `III-02` ∈ {Ja, Unsicher}; `III-04` ∈ {Ja, Nein, Unsicher}; `III-05` ∈ {Ja, Nein}; `IV-02` ∈ {A, B, C}; `IV-03` ∈ {B, C}; `IV-04` ∈ {Ja, Nein, Unsicher}; `V-01` ∈ {A, D}
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-III-016, DA-V-011, DA-V-012, DA-V-014, DA-V-018, DA-VI-001, DA-VI-002, DA-VI-004, DA-VI-016, DA-VI-017, DA-VI-018, DA-VI-019
- verwendeter Antwortsatz: `EIN-01`=A+E, `EIN-02`=Mittleres Unternehmen (< 250 Mitarbeiter und ≤ 50 Mio. € Umsatz bzw. ≤ 43 Mio. € Bilanz), `EIN-03`=Nein, `EIN-04`=Unsicher, `EIN-05`=Ja, `EIN-07`=Nein, `II-01`=Ja, `II-03`=Nein, `II-04`=Nein, `II-05`=Ja, `II-06`=A, `II-07`=Ja, `II-08`=Ja, `III-01`=A, `III-02`=Ja, `III-03`=Ja, `III-04`=Ja, `III-05`=Ja, `IV-01`=Ja, `IV-02`=B, `IV-03`=C, `IV-04`=Unsicher, `V-01`=A, `V-02`=Nein, `VI-09`=Nein

**T2 – SaaS-Anbieter (Großunternehmen, EU, Standardprodukt, Daten in Frankfurt, keine Egress-Gebühren, kein Drittstaatsverlangen)**

- Verfahren: vollständig (216 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-07` ∈ {Ja, Nein}; `IV-02` ∈ {A, B, C}; `V-01` ∈ {A, D}; `VI-03` ∈ {Ja, Nein, Unsicher}; `VI-04` ∈ {A, B, Unsicher}; `VI-05` ∈ {Ja, Nein}
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-V-011, DA-V-012, DA-V-014, DA-V-018, DA-VI-022, DA-VI-023, DA-VII-002, DA-VII-003, DA-VII-004, DA-VII-005, DA-VII-006
- verwendeter Antwortsatz: `EIN-01`=D, `EIN-02`=Großunternehmen (darüber), `EIN-05`=Ja, `EIN-07`=Nein, `IV-01`=Ja, `IV-02`=A, `IV-03`=A, `V-01`=A, `V-02`=Nein, `VI-01`=Ja, `VI-02`=Nein, `VI-03`=Nein, `VI-04`=B, `VI-05`=Nein, `VI-06`=Ja, `VI-07`=Nein

**T3 – Eigenständiger Kleinhersteller (35 MA, Smart-Home-Geräte, kein Konzern, kein Unterauftrag, Daten in eigener Cloud)**

- Verfahren: vollständig (144 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-02` ∈ {Kleinstunternehmen (< 10 Mitarbeiter und ≤ 2 Mio. € Umsatz/Bilanz), Kleinunternehmen (< 50 Mitarbeiter und ≤ 10 Mio. €)}; `EIN-03` ∈ {Ja, Nein, Unsicher}; `EIN-07` ∈ {Ja, Nein}; `II-04` ∈ {Ja, Nein}; `IV-02` ∈ {A, B, C}; `V-01` ∈ {A, D}
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-V-011, DA-V-012, DA-V-014, DA-V-018
- verwendeter Antwortsatz: `EIN-01`=A, `EIN-02`=Kleinstunternehmen (< 10 Mitarbeiter und ≤ 2 Mio. € Umsatz/Bilanz), `EIN-03`=Nein, `EIN-05`=Ja, `EIN-07`=Nein, `II-01`=Ja, `II-03`=Nein, `II-04`=Nein, `IV-01`=Ja, `IV-02`=A, `IV-03`=A, `V-01`=A, `V-02`=Nein

**T4 – Logistikunternehmen (Groß, Nutzer von Telematik/Lkw-Flotte, Behördenverlangen wegen Hochwasser-Notstand, Daten enthalten Fahrerdaten)**

- Verfahren: Koordinatenabstieg, 60 Startpunkte (20,736 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-07` ∈ {Ja, Nein}; `II-10` ∈ {Ja, Nein, Unsicher}; `IV-02` ∈ {A, B, C}; `IV-03` ∈ {B, C}; `IV-04` ∈ {Ja, Nein, Unsicher}; `V-01` ∈ {A, D}; `V-03` ∈ {Ja, Unsicher}; `V-05` ∈ {Ja, Unsicher}; `V-06` ∈ {Nein, Unsicher}; `V-07` ∈ {A, B, C, D}; `VI-10` ∈ {A, B, C}
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-V-006, DA-V-007
- verwendeter Antwortsatz: `EIN-01`=B+E, `EIN-02`=Großunternehmen (darüber), `EIN-05`=Ja, `EIN-07`=Nein, `II-09`=Ja, `II-10`=Ja, `IV-01`=Ja, `IV-02`=A, `IV-03`=B, `IV-04`=Nein, `V-01`=A, `V-02`=Ja, `V-03`=Ja, `V-05`=Ja, `V-06`=Nein, `V-07`=A, `VI-09`=Ja, `VI-10`=A

**T5 – Unabhängige Kfz-Werkstatt (Kleinunternehmen, empfängt Fahrzeugdaten auf Nutzerverlangen, gibt sie an Analytics-Partner weiter, Behördenverlangen ohne Notstand)**

- Verfahren: vollständig (15552 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-02` ∈ {Kleinstunternehmen (< 10 Mitarbeiter und ≤ 2 Mio. € Umsatz/Bilanz), Kleinunternehmen (< 50 Mitarbeiter und ≤ 10 Mio. €)}; `EIN-03` ∈ {Ja, Nein, Unsicher}; `EIN-07` ∈ {Ja, Nein}; `II-12` ∈ {Ja, Nein}; `III-01` ∈ {A, B, C}; `III-02` ∈ {Ja, Unsicher}; `III-04` ∈ {Ja, Nein, Unsicher}; `III-05` ∈ {Ja, Nein}; `IV-02` ∈ {A, B, C}; `V-01` ∈ {A, D}; `V-04` ∈ {Ja, Nein, Unsicher}
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-III-019, DA-III-020
- verwendeter Antwortsatz: `EIN-01`=C, `EIN-02`=Kleinstunternehmen (< 10 Mitarbeiter und ≤ 2 Mio. € Umsatz/Bilanz), `EIN-03`=Nein, `EIN-05`=Ja, `EIN-07`=Nein, `II-11`=Ja, `II-12`=Ja, `III-01`=B, `III-02`=Ja, `III-03`=Ja, `III-04`=Ja, `III-05`=Nein, `IV-01`=Ja, `IV-02`=A, `IV-03`=A, `V-01`=A, `V-02`=Ja, `V-03`=Nein, `V-04`=Ja

**T6 – US-IaaS-Anbieter ohne EU-Niederlassung (Groß, EU-Kunden, Egress-Gebühren, Herausgabeverlangen einer US-Behörde ohne Abkommen)**

- Verfahren: vollständig (648 Kombinationen)
- aus der Excel nicht ableitbare Antworten: `EIN-07` ∈ {Ja, Nein}; `IV-02` ∈ {A, B, C}; `V-01` ∈ {A, D}; `VI-03` ∈ {Ja, Nein, Unsicher}; `VI-04` ∈ {A, B, Unsicher}; `VI-05` ∈ {Ja, Nein}; `VI-08` ∈ {Ja, Nein, Unsicher}
- nur „schränkt ein“ – zählt in keiner der beiden Mengen: DA-V-011, DA-V-012, DA-V-014, DA-V-018
- verwendeter Antwortsatz: `EIN-01`=D, `EIN-02`=Großunternehmen (darüber), `EIN-05`=Nein, `EIN-06`=Ja, `EIN-07`=Nein, `IV-01`=Ja, `IV-02`=A, `IV-03`=A, `V-01`=A, `V-02`=Nein, `VI-01`=Ja, `VI-02`=Nein, `VI-03`=Nein, `VI-04`=A, `VI-05`=Ja, `VI-06`=Ja, `VI-07`=Ja, `VI-08`=Nein

<!-- TESTPROFILE:END -->

## 4 Inhaltliche Auffälligkeiten

### 4a Von Hand notiert

Dieser Abschnitt bleibt bei jedem Lauf erhalten.

<!-- MANUELL:START -->
Beim Zerlegen der Excel aufgefallen. **Nichts davon wurde in den Daten geändert.**
Reihenfolge nach Gewicht.

**1 – IV-03 / VERTRAG_ALT: Zuordnung vermutlich vertauscht (hoch)**
Die Spalte „Gesetzte Variable“ nennt bei IV-03 nur `VERTRAG_ALT (Ja / Nein / Gemischt)`,
ohne zu sagen, welcher Wert zu welcher Antwort gehört. Nimmt man die Reihenfolge der
Antwortoptionen, ergibt sich A = Ja. Dem Wortlaut nach ist A aber „Nach dem 12.09.2025“,
also gerade *kein* Altvertrag, und B „Am oder vor dem 12.09.2025“, also Altvertrag.
Für die umgekehrte Lesart (A = Nein, B = Ja) stimmen alle sechs QS-Testprofile exakt;
mit der Reihenfolgelesart weichen fünf von sechs um genau `DA-XI-006` ab. Die Prüfannahme
liegt in `annahmen.json`, die Excel selbst ist unverändert.
Vorschlag: in der Excel `VERTRAG_ALT (Nein bei A / Ja bei B / Gemischt bei C)` schreiben.

**2 – Antwort-Wert-Zuordnung fehlt an fünf weiteren Stellen (mittel)**
Gleiches Muster bei EIN-02 (GROESSE), V-01 (JURISTISCHE_PERSON), VI-04 (CLOUD_MODELL) –
dort deckt sich die Reihenfolge mit dem Wortlaut, geprüft ist es aber nicht – sowie bei
III-01 (KAP3_ROLLE: 3 Werte, 5 Antwortoptionen) und IV-02 (KLAUSEL_ROLLE: 3 Werte,
4 Antwortoptionen), wo sich gar keine Zuordnung ableiten lässt. Schreibweise „Wert bei
Antwort“ wie in II-06 (`DATENINHABER (Ja bei A / Nein bei B / Unsicher)`) würde alle sechs
Fälle erledigen.

**3 – QS-Abschnitt 6 nennt Pfade, aber keine Antworten (mittel)**
Die sechs Testprofile geben die Folge der Fragen an, nicht die gegebenen Antworten. Ein Teil
lässt sich aus Anzeigebedingungen und Kantenzielen rekonstruieren, 6 bis 15 Antworten je
Profil bleiben offen (Spalte „offene Antworten“ oben). `verify_data.py` rechnet diese
Kombinationen durch und weist den besten Treffer aus; die Abweichung ist dadurch eine
Untergrenze, keine exakte Zahl. Eine zusätzliche Spalte „Antwortfolge“ im QS-Blatt würde die
Testfälle eindeutig nachrechenbar machen.

**4 – EIN-01 ist eine Mehrfachauswahl, steht aber nirgends (mittel)**
EIN-01 setzt sechs unabhängige Ja/Nein-Variablen (ROLLE_PRODUKT … ROLLE_DATENRAUM) über die
Antwortkürzel A–F; G ist „Keine davon“. Dass mehrere Antworten gleichzeitig gelten können,
ergibt sich nur aus dem Wortlaut der Frage und aus der Modulsteuerung. Der Parser behandelt
EIN-01 deshalb als Mehrfachauswahl (nicht ausgewählte Rollen = Nein) – bitte bestätigen,
denn davon hängt ab, wie die HTML-Oberfläche diese Frage darstellt.

**5 – Zwei Anzeigebedingungen verweisen auf Antworten statt auf Variablen (mittel)**
`II-04`: „… und II-03 = Nein …“ und `II-05`: „II-04 = Ja oder (II-04 = Nein und keine
Ausnahme ausgelöst)“. II-03 und II-04 setzen teils keine Variable, der Baum muss also die
gegebenen Antworten mitführen, nicht nur die Variablenbelegung. Das JSON bildet das als
Atom `{"op":"antwort","frage":…}` ab. Zehn Fragen setzen überhaupt keine Variable
(II-03, II-10, II-12, IV-04, V-06, V-07, VI-08, VI-10, VIII-02, VIII-04).

**6 – „Ausnahme ausgelöst“ ist keine Variable (mittel)**
`II-05` („keine Ausnahme ausgelöst“), `III-01` und die Startbedingung von M-III
(„Art.-7-Ausnahme in II-04 ausgelöst“) knüpfen an einen Ergebniszustand an, den es als
Variable nicht gibt. Diese Teilbedingungen bleiben im JSON als Klartext stehen und werden in
der Simulation neutral behandelt. Eine Variable `ART7_AUSNAHME (Ja / Nein)`, gesetzt in II-04,
würde drei Klartextstellen auf einmal auflösen.

**7 – Vorbehalte im Mapping sind Prosa (niedrig, aber häufig)**
242 Mapping-Zeilen tragen eine Bedingung, davon 128 in Formulierungen wie „vorbehaltlich
III-02“ (42×), „als Anbieter“ (41×) oder „nur für die befristeten Altverträge“ (17×). Sie
werden neutral behandelt – die Rangfolge (schließt aus > verschiebt > löst aus > schränkt
ein) löst den Vorbehalt ohnehin auf, wenn die spätere Frage im selben Lauf greift. Genau so
beschreibt es auch die QS-Spalte „Vorbehaltsauflösungen“. Für die Ergebnisanzeige bleibt der
Text am Mapping-Eintrag erhalten.

**8 – Antwortkürzel bei EIN-02 weichen von den Antwortoptionen ab (niedrig)**
Die Folgeknoten sprechen von „Kleinst / Klein / Mittel / Groß“, die Antwortoptionen heißen
„Kleinstunternehmen (< 10 Mitarbeiter …)“ usw. Aufgelöst wird das über die GROESSE-Werte.
„Mittel“ ist kein Präfix von „Mittleres Unternehmen“ – ohne diese Brücke wäre die Zeile nicht
zuzuordnen.

**9 – Gegengeprüft und stimmig (kein Handlungsbedarf)**
Die 8 von keiner Frage erreichten Anforderungen sind genau die aus QS-Abschnitt 1. Kennzahlen
(189 / 49 / 797) stimmen. Req-IDs in „Anforderungen“, „Ergebnisse“, „Mapping“ und „Fristen“
decken sich vollständig; „Geltungsbeginn“ und „Ab wann“ sind durchgängig gleich formuliert.
Der Fragengraph ist zyklenfrei, jede Frage ist von einem Moduleinstieg erreichbar, jede
Antwortoption hat genau ein widerspruchsfreies Ziel.
<!-- MANUELL:END -->

### 4b Maschinell abgeleitet

Aus der Excel berechnet, nichts davon wurde geändert.

- **Mapping:** 8 Anforderungen werden von keiner Frage erreicht: DA-I-008, DA-I-009, DA-III-014, DA-III-017, DA-IX-009, DA-VIII-005, DA-XI-007, DA-XI-008
- **Variablen:** 12 Variablen steuern nichts, sondern gehen laut Blatt nur in die Ergebnisausgabe ein – für den Entscheidungsbaum nur als Anzeigewert relevant: AUSSERGEW_NOTWENDIGKEIT, CLOUD_MODELL, EMPFAENGER_KMU, EU_MARKT, GESCHAEFTSGEHEIMNIS, KAP3_ZEIT, NEUPRODUKT_2026, PBD_DRITTER, SCHUTZMASSNAHMEN, VERLANGEN_FORMELL_OK, VERTRETER_PFLICHT, WECHSELENTGELTE
