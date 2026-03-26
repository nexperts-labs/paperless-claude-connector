import logging
import time
from typing import Optional

from rapidfuzz import fuzz, process

from claude_client import ClaudeClient
from config import config
from models import (
    ClaudeAnalysis,
    PaperlessCorrespondent,
    PaperlessDocument,
    PaperlessDocumentType,
    PaperlessStoragePath,
    PaperlessTag,
    ProcessingResult,
)
from paperless_client import PaperlessClient

logger = logging.getLogger(__name__)


class DocumentProcessor:
    def __init__(self) -> None:
        self.claude = ClaudeClient()
        self.tags: list[PaperlessTag] = []
        self.correspondents: list[PaperlessCorrespondent] = []
        self.document_types: list[PaperlessDocumentType] = []
        self.storage_paths: list[PaperlessStoragePath] = []
        self._tag_new_id: Optional[int] = None
        self._tag_processed_id: Optional[int] = None

    async def initialize(self, paperless: PaperlessClient) -> None:
        """Load all metadata from Paperless at startup."""
        logger.info("Initializing: loading metadata from Paperless...")
        self.tags = await paperless.get_all_tags()
        self.correspondents = await paperless.get_all_correspondents()
        self.document_types = await paperless.get_all_document_types()
        self.storage_paths = await paperless.get_all_storage_paths()

        # Ensure required tags exist
        tag_new = await paperless.get_or_ensure_tag(config.TAG_NEW)
        self._tag_new_id = tag_new.id

        tag_processed = await paperless.get_or_ensure_tag(config.TAG_PROCESSED)
        self._tag_processed_id = tag_processed.id

        logger.info(
            f"Initialized: {len(self.tags)} tags, "
            f"{len(self.correspondents)} correspondents, "
            f"{len(self.document_types)} document types"
        )

    async def refresh_metadata(self, paperless: PaperlessClient) -> None:
        """Refresh cached metadata from Paperless."""
        self.tags = await paperless.get_all_tags()
        self.correspondents = await paperless.get_all_correspondents()
        self.document_types = await paperless.get_all_document_types()
        self.storage_paths = await paperless.get_all_storage_paths()

    def _fuzzy_match_name(
        self, name: str, choices: list[str], threshold: int = None
    ) -> Optional[str]:
        """
        Find the best fuzzy match for a name in a list of choices.
        Returns the matched name if above threshold, else None.
        """
        if not choices or not name:
            return None
        threshold = threshold or config.FUZZY_THRESHOLD
        result = process.extractOne(name, choices, scorer=fuzz.WRatio)
        if result and result[1] >= threshold:
            logger.debug(f"Fuzzy match: '{name}' -> '{result[0]}' (score={result[1]})")
            return result[0]
        return None

    async def _resolve_correspondent(
        self, name: str, paperless: PaperlessClient
    ) -> Optional[int]:
        """Find or create a correspondent by name using fuzzy matching."""
        if not name:
            return None

        existing_names = [c.name for c in self.correspondents]
        match = self._fuzzy_match_name(name, existing_names)

        if match:
            correspondent = next(c for c in self.correspondents if c.name == match)
            return correspondent.id

        # No match found -> create new
        logger.info(f"Creating new correspondent: '{name}'")
        new_corr = await paperless.create_correspondent(name)
        self.correspondents.append(new_corr)
        return new_corr.id

    async def _resolve_document_type(
        self, name: str, paperless: PaperlessClient
    ) -> Optional[int]:
        """Find or create a document type using fuzzy matching with whitelist fallback."""
        if not name:
            return None

        existing_names = [dt.name for dt in self.document_types]
        match = self._fuzzy_match_name(name, existing_names)

        if match:
            doc_type = next(dt for dt in self.document_types if dt.name == match)
            return doc_type.id

        # Check if name matches whitelist (fuzzy)
        whitelist_match = self._fuzzy_match_name(
            name, config.DOCUMENT_TYPE_WHITELIST, threshold=80
        )
        if whitelist_match:
            # Check if whitelist item already exists in Paperless
            existing_match = self._fuzzy_match_name(whitelist_match, existing_names, threshold=90)
            if existing_match:
                doc_type = next(dt for dt in self.document_types if dt.name == existing_match)
                return doc_type.id
            # Create from whitelist
            logger.info(f"Creating document type from whitelist: '{whitelist_match}'")
            new_dt = await paperless.create_document_type(whitelist_match)
            self.document_types.append(new_dt)
            return new_dt.id

        # Fallback to "Korrespondenz"
        fallback = "Korrespondenz"
        logger.warning(
            f"Document type '{name}' not in whitelist, falling back to '{fallback}'"
        )
        return await self._resolve_document_type(fallback, paperless)

    def _resolve_storage_path(self, name: str) -> Optional[int]:
        """Find a storage path ID by fuzzy-matching the name Claude returned."""
        if not name:
            return None
        existing_names = [sp.name for sp in self.storage_paths]
        match = self._fuzzy_match_name(name, existing_names, threshold=70)
        if match:
            sp = next(s for s in self.storage_paths if s.name == match)
            logger.info(f"Storage path matched: '{name}' -> '{match}' (id={sp.id})")
            return sp.id
        logger.warning(f"No storage path match for '{name}' (threshold=70)")
        return None

    async def _resolve_tags(
        self, tag_names: list[str], paperless: PaperlessClient
    ) -> list[int]:
        """Resolve tag names to IDs, creating new tags if needed."""
        tag_ids = []
        existing_names = [t.name for t in self.tags]

        for tag_name in tag_names[:3]:  # enforce max 3 tags
            match = self._fuzzy_match_name(tag_name, existing_names, threshold=90)
            if match:
                tag = next(t for t in self.tags if t.name == match)
                tag_ids.append(tag.id)
            else:
                logger.info(f"Creating new tag: '{tag_name}'")
                new_tag = await paperless.create_tag(tag_name)
                self.tags.append(new_tag)
                existing_names.append(new_tag.name)
                tag_ids.append(new_tag.id)

        return tag_ids

    async def process_document(
        self, document: PaperlessDocument, paperless: PaperlessClient
    ) -> ProcessingResult:
        """Process a single document: analyze with Claude, update in Paperless."""
        start_time = time.time()
        logger.info(f"Processing document {document.id}: '{document.title}'")

        if not document.content:
            logger.warning(f"Document {document.id} has no content (OCR missing?)")
            return ProcessingResult(
                document_id=document.id,
                document_title=document.title,
                success=False,
                error="Document has no text content (OCR may not have run yet)",
            )

        try:
            # Analyze with Claude
            known_correspondents = [c.name for c in self.correspondents]
            known_doc_types = [dt.name for dt in self.document_types]

            storage_paths_for_prompt = [
                {"name": sp.name, "path": sp.path} for sp in self.storage_paths
            ]
            known_tags = [t.name for t in self.tags]
            analysis, prompt_tokens, completion_tokens = self.claude.analyze_document(
                document_content=document.content,
                document_title=document.title,
                known_correspondents=known_correspondents,
                known_document_types=known_doc_types,
                storage_paths=storage_paths_for_prompt,
                known_tags=known_tags,
            )

            # Resolve metadata IDs
            correspondent_id = await self._resolve_correspondent(
                analysis.correspondent, paperless
            )
            document_type_id = await self._resolve_document_type(
                analysis.document_type, paperless
            )
            storage_path_id = self._resolve_storage_path(analysis.storage_path)
            suggested_tag_ids = await self._resolve_tags(analysis.tags, paperless)

            # Build final tag list: remove "Neu", add "ai-processed", keep existing
            existing_tags = set(document.tags)
            existing_tags.discard(self._tag_new_id)
            existing_tags.add(self._tag_processed_id)
            existing_tags.update(suggested_tag_ids)

            # Update document in Paperless
            await paperless.update_document(
                doc_id=document.id,
                title=analysis.title if analysis.title else None,
                correspondent_id=correspondent_id,
                document_type_id=document_type_id,
                tags=list(existing_tags),
                storage_path_id=storage_path_id,
            )

            duration = time.time() - start_time
            sp_name = analysis.storage_path or "—"
            logger.info(
                f"Document {document.id} processed successfully in {duration:.1f}s "
                f"(tokens: {prompt_tokens}+{completion_tokens}, storage_path='{sp_name}')"
            )

            return ProcessingResult(
                document_id=document.id,
                document_title=analysis.title or document.title,
                success=True,
                analysis=analysis,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=prompt_tokens + completion_tokens,
                duration_seconds=duration,
            )

        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"Error processing document {document.id}: {e}", exc_info=True)
            return ProcessingResult(
                document_id=document.id,
                document_title=document.title,
                success=False,
                error=str(e),
                duration_seconds=duration,
            )
