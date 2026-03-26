from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class PaperlessTag:
    id: int
    name: str
    slug: str
    color: str = ""


@dataclass
class PaperlessCorrespondent:
    id: int
    name: str
    slug: str
    match: str = ""


@dataclass
class PaperlessDocumentType:
    id: int
    name: str
    slug: str
    match: str = ""


@dataclass
class PaperlessStoragePath:
    id: int
    name: str
    slug: str
    path: str = ""


@dataclass
class PaperlessDocument:
    id: int
    title: str
    content: str
    tags: list[int]
    correspondent: Optional[int]
    document_type: Optional[int]
    created: datetime
    added: datetime
    original_file_name: str = ""
    archived_file_name: str = ""


@dataclass
class ClaudeAnalysis:
    title: str
    correspondent: str
    document_type: str
    tags: list[str]
    summary: str
    storage_path: str = ""
    language: str = "de"
    confidence: float = 1.0


@dataclass
class ProcessingResult:
    document_id: int
    document_title: str
    success: bool
    analysis: Optional[ClaudeAnalysis] = None
    error: Optional[str] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    processed_at: datetime = field(default_factory=datetime.utcnow)
    duration_seconds: float = 0.0

    @property
    def total_tokens_used(self) -> int:
        return self.prompt_tokens + self.completion_tokens


@dataclass
class ProcessingStats:
    total_processed: int = 0
    total_errors: int = 0
    total_prompt_tokens: int = 0
    total_completion_tokens: int = 0
    processed_today: int = 0
    last_scan: Optional[datetime] = None
    results: list[ProcessingResult] = field(default_factory=list)
