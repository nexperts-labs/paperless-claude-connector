import json
import logging

import anthropic

from config import config
from models import ClaudeAnalysis

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Du bist ein intelligenter Dokumenten-Assistent für das Dokumentenmanagementsystem Paperless-NGX.
Deine Aufgabe ist es, eingescannte Dokumente zu analysieren und strukturierte Metadaten zu extrahieren.

Du antwortest IMMER mit einem validen JSON-Objekt und NICHTS sonst.

Das JSON muss folgendes Schema haben:
{
  "title": "Kurzer, präziser Dokumententitel (max 80 Zeichen)",
  "correspondent": "Name des Absenders/Ausstellers (Firma oder Person)",
  "document_type": "Dokumententyp auf Deutsch",
  "tags": ["relevante", "schlagworte"],
  "summary": "Kurze Zusammenfassung des Dokuments (2-3 Sätze)",
  "storage_path": "Name des passenden Speicherpfads oder leer",
  "language": "de"
}

Regeln:
- Titel: Prägnant, ohne Datum, ohne Dokumententyp-Prefix
- Korrespondent: Vollständiger Firmen- oder Personenname
- Dokumententyp: Verwende AUSSCHLIESSLICH einen der folgenden Typen. Alles was nicht eindeutig passt kommt unter "Korrespondenz" — kein Typ erfinden. Erlaubte Typen:
  Allgemein: Korrespondenz, Bescheinigung, Vollmacht, Protokoll, Zertifikat
  Rechnungswesen: Rechnung, Eingangsrechnung, Ausgangsrechnung, Lieferantenrechnung, Gutschrift, Mahnung, Quittung, Angebot, Lieferantenangebot, Auftragsbestätigung, Lieferschein, Abrechnung, Umbuchung
  Konten & Finanzen: Kontoauszug, Kreditkartenabrechnung, Depotauszug, Sparvertrag, Darlehensvertrag, Kreditvertrag
  Verträge: Vertrag, Leasingvertrag, Rahmenvertrag, Liefervertrag, Mietvertrag, Arbeitsvertrag, Mobilfunkvertrag, Internetvertrag, Gesellschaftsvertrag, Versicherungsvertrag
  Steuern & Behörden: Steuerbescheid, Steuererklärung, Lohnsteuerbescheinigung, Umsatzsteuervoranmeldung, Gewerbesteuerbescheid, Bescheid, Registersache, Gewerbeanmeldung, Jahresabschluss, Bilanz, Betriebsprüfung
  Personal: Gehaltsabrechnung, Lohnabrechnung, Arbeitszeugnis
  Versicherungen: Versicherungspolice, Versicherungsrechnung, Schadenmeldung, Versicherungsnachweis
  Fahrzeug: Kfz-Rechnung, Werkstattrechnung, Fahrzeugschein, Kfz-Versicherung
  Telekommunikation & Energie: Telefonrechnung, Mobilfunkrechnung, Stromrechnung, Gasrechnung, Energieabrechnung
  Immobilien: Nebenkostenabrechnung, Mieterhöhung, Heizkostenabrechnung, Hausgeldabrechnung
  Projekte: Projektvertrag, Projektangebot, Projektrechnung
  Gesundheit: Arztrechnung, Krankenhausrechnung, Arztbericht, Befundbericht, Rezept
  Familie & Kind: Schulzeugnis, Kitarechnung, Schuldokument
  Tier: Tierarztrechnung, Tierkrankenversicherung, Hundehaftpflicht
- Tags: Maximal 3 Tags pro Dokument. Nutze bevorzugt Tags aus der vorhandenen Liste. Lege nur dann einen neuen Tag an, wenn kein vorhandener den Inhalt treffend beschreibt. Tags sollen tiefen inhaltlichen Kontext liefern, der nicht bereits durch Titel, Korrespondent oder Speicherpfad abgedeckt ist (also NICHT: Dokumententyp, Firmenname, Jahreszahl). Gute Tags: Themenbereich (z.B. Versicherung, Steuer, Fahrzeug, Gehalt), Projekt, Vertragspartner-Kategorie.
- Wenn etwas unklar ist, verwende "Korrespondenz" als Dokumententyp
- storage_path: Wähle den Namen des passenden Speicherpfads aus der Liste. Wenn keiner passt, lasse das Feld leer.
"""


class ClaudeClient:
    def __init__(self) -> None:
        self.client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        self.model = config.CLAUDE_MODEL
        self.max_tokens = config.CLAUDE_MAX_TOKENS

    def analyze_document(
        self,
        document_content: str,
        document_title: str,
        known_correspondents: list[str],
        known_document_types: list[str],
        storage_paths: list[dict],
        known_tags: list[str],
    ) -> tuple[ClaudeAnalysis, int, int]:
        """
        Analyze a document with Claude AI.
        Returns (analysis, prompt_tokens, completion_tokens).
        """
        max_content_chars = 8000
        if len(document_content) > max_content_chars:
            document_content = document_content[:max_content_chars] + "\n[... Dokument gekürzt ...]"

        known_corr_str = ", ".join(known_correspondents[:50]) if known_correspondents else "keine"
        known_types_str = ", ".join(known_document_types[:30]) if known_document_types else "keine"
        # Exclude system tags from the list shown to Claude
        system_tags = {"neu", "ai-processed", "pre-process"}
        known_tags_str = ", ".join(
            t for t in known_tags if t.lower() not in system_tags
        ) if known_tags else "keine"

        if storage_paths:
            paths_str = "\n".join(
                f'  - "{sp["name"]}": {sp["path"]}' for sp in storage_paths
            )
        else:
            paths_str = "  (keine Speicherpfade konfiguriert)"

        user_message = f"""Analysiere dieses Dokument und extrahiere die Metadaten als JSON.

Bekannte Korrespondenten im System: {known_corr_str}
Bekannte Dokumententypen im System: {known_types_str}
Vorhandene Tags im System (bevorzuge diese, max. 3): {known_tags_str}

Verfügbare Speicherpfade (wähle den passenden anhand von Empfänger/Absender und Inhalt):
{paths_str}

Hinweise zur Speicherpfad-Auswahl:
- Wähle den Speicherpfad anhand des Empfängers/Absenders und des Dokumenteninhalts
- Nutze den Pfadnamen und das Pfadmuster aus der Liste oben als Entscheidungshilfe
- Lasse storage_path leer wenn der Kontext nicht eindeutig einem Pfad zuzuordnen ist

Aktueller Titel: {document_title}

Dokumenteninhalt:
---
{document_content}
---

Antworte NUR mit dem JSON-Objekt."""

        response = self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        prompt_tokens = response.usage.input_tokens
        completion_tokens = response.usage.output_tokens

        raw_text = response.content[0].text.strip()

        try:
            if raw_text.startswith("```"):
                lines = raw_text.split("\n")
                raw_text = "\n".join(lines[1:-1])

            data = json.loads(raw_text)
            analysis = ClaudeAnalysis(
                title=data.get("title", document_title),
                correspondent=data.get("correspondent", ""),
                document_type=data.get("document_type", "Korrespondenz"),
                tags=data.get("tags", []),
                summary=data.get("summary", ""),
                storage_path=data.get("storage_path", ""),
                language=data.get("language", "de"),
            )
            logger.info(
                f"Claude analysis: type={analysis.document_type}, "
                f"correspondent={analysis.correspondent}, "
                f"storage_path='{analysis.storage_path}', "
                f"tokens={prompt_tokens}+{completion_tokens}"
            )
            return analysis, prompt_tokens, completion_tokens

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Claude response as JSON: {e}\nRaw: {raw_text}")
            analysis = ClaudeAnalysis(
                title=document_title,
                correspondent="",
                document_type="Korrespondenz",
                tags=[],
                summary="Automatische Analyse fehlgeschlagen.",
            )
            return analysis, prompt_tokens, completion_tokens
