import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Paperless-NGX
    PAPERLESS_URL: str = os.getenv("PAPERLESS_URL", "http://localhost:8000")
    PAPERLESS_TOKEN: str = os.getenv("PAPERLESS_TOKEN", "")

    # Claude AI
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    CLAUDE_MODEL: str = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")
    CLAUDE_MAX_TOKENS: int = int(os.getenv("CLAUDE_MAX_TOKENS", "2048"))

    # Connector
    SCAN_INTERVAL_SECONDS: int = int(os.getenv("SCAN_INTERVAL_SECONDS", "300"))
    TAG_NEW: str = os.getenv("TAG_NEW", "Neu")
    TAG_PROCESSED: str = os.getenv("TAG_PROCESSED", "ai-processed")
    FUZZY_THRESHOLD: int = int(os.getenv("FUZZY_THRESHOLD", "80"))

    # Storage
    DATA_DIR: str = os.getenv("DATA_DIR", "/data")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # Document type whitelist (fallback if no fuzzy match)
    DOCUMENT_TYPE_WHITELIST: list[str] = [
        # --- Allgemein / Fallback ---
        "Korrespondenz",          # Catch-all für allgemeine Schreiben
        "Bescheinigung",          # Nachweise, Bestätigungen
        "Vollmacht",
        "Protokoll",
        "Zertifikat",

        # --- Rechnungswesen ---
        "Rechnung",
        "Eingangsrechnung",       # Rechnungen die wir erhalten
        "Ausgangsrechnung",       # Rechnungen die wir stellen
        "Lieferantenrechnung",
        "Gutschrift",
        "Mahnung",
        "Quittung",
        "Angebot",
        "Lieferantenangebot",
        "Auftragsbestätigung",
        "Lieferschein",
        "Abrechnung",
        "Umbuchung",

        # --- Konten & Finanzen ---
        "Kontoauszug",
        "Kreditkartenabrechnung",
        "Depotauszug",
        "Sparvertrag",
        "Darlehensvertrag",
        "Kreditvertrag",

        # --- Verträge ---
        "Vertrag",
        "Leasingvertrag",
        "Rahmenvertrag",
        "Liefervertrag",
        "Mietvertrag",
        "Arbeitsvertrag",
        "Mobilfunkvertrag",
        "Internetvertrag",
        "Gesellschaftsvertrag",
        "Versicherungsvertrag",

        # --- Steuern & Behörden ---
        "Steuerbescheid",
        "Steuererklärung",
        "Lohnsteuerbescheinigung",
        "Umsatzsteuervoranmeldung",
        "Gewerbesteuerbescheid",
        "Bescheid",               # Allgemeiner Behördenbescheid
        "Registersache",
        "Gewerbeanmeldung",
        "Jahresabschluss",
        "Bilanz",
        "Betriebsprüfung",

        # --- Personal & Gehalt ---
        "Gehaltsabrechnung",
        "Lohnabrechnung",
        "Arbeitszeugnis",

        # --- Versicherungen ---
        "Versicherungspolice",
        "Versicherungsrechnung",
        "Schadenmeldung",
        "Versicherungsnachweis",

        # --- Fahrzeug & Leasing ---
        "Kfz-Rechnung",
        "Werkstattrechnung",
        "Fahrzeugschein",
        "Kfz-Versicherung",

        # --- Telekommunikation & Energie ---
        "Telefonrechnung",
        "Mobilfunkrechnung",
        "Stromrechnung",
        "Gasrechnung",
        "Energieabrechnung",

        # --- Immobilien & Miete ---
        "Nebenkostenabrechnung",
        "Mieterhöhung",
        "Heizkostenabrechnung",
        "Hausgeldabrechnung",

        # --- Projekte ---
        "Projektvertrag",
        "Projektangebot",
        "Projektrechnung",

        # --- Privat: Gesundheit ---
        "Arztrechnung",
        "Krankenhausrechnung",
        "Arztbericht",
        "Befundbericht",
        "Rezept",

        # --- Privat: Familie & Kind ---
        "Schulzeugnis",
        "Kitarechnung",
        "Schuldokument",

        # --- Privat: Tier ---
        "Tierarztrechnung",
        "Tierkrankenversicherung",
        "Hundehaftpflicht",
    ]

    def validate(self) -> None:
        if not self.PAPERLESS_TOKEN:
            raise ValueError("PAPERLESS_TOKEN is required")
        if not self.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY is required")


config = Config()
