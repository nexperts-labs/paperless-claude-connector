import logging
from typing import Optional

import certifi
import httpx

from config import config
from models import (
    PaperlessCorrespondent,
    PaperlessDocument,
    PaperlessDocumentType,
    PaperlessStoragePath,
    PaperlessTag,
)

logger = logging.getLogger(__name__)


class PaperlessClient:
    def __init__(self) -> None:
        self.base_url = config.PAPERLESS_URL.rstrip("/")
        self.headers = {
            "Authorization": f"Token {config.PAPERLESS_TOKEN}",
            "Content-Type": "application/json",
        }
        self._client = httpx.AsyncClient(
            headers=self.headers,
            timeout=30.0,
            verify=certifi.where(),
        )

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self._client.aclose()

    async def _get_all_pages(self, path: str, params: dict | None = None) -> list[dict]:
        """Fetch all pages from a paginated Paperless API endpoint."""
        results = []
        merged = {"page_size": 100}
        if params:
            merged.update(params)

        # First request uses path + params; subsequent requests use the full "next" URL
        url: str | None = f"{self.base_url}/api/{path}/"
        first = True

        while url:
            if first:
                response = await self._client.get(url, params=merged)
                first = False
            else:
                response = await self._client.get(url)
            response.raise_for_status()
            data = response.json()
            results.extend(data.get("results", []))
            url = data.get("next")

        return results

    async def get_all_tags(self) -> list[PaperlessTag]:
        """Load all tags from Paperless."""
        raw = await self._get_all_pages("tags", {})
        tags = [
            PaperlessTag(
                id=t["id"],
                name=t["name"],
                slug=t["slug"],
                color=t.get("colour", ""),
            )
            for t in raw
        ]
        logger.info(f"Loaded {len(tags)} tags from Paperless")
        return tags

    async def get_all_correspondents(self) -> list[PaperlessCorrespondent]:
        """Load all correspondents from Paperless."""
        raw = await self._get_all_pages("correspondents", {})
        correspondents = [
            PaperlessCorrespondent(
                id=c["id"],
                name=c["name"],
                slug=c["slug"],
                match=c.get("match", ""),
            )
            for c in raw
        ]
        logger.info(f"Loaded {len(correspondents)} correspondents from Paperless")
        return correspondents

    async def get_all_document_types(self) -> list[PaperlessDocumentType]:
        """Load all document types from Paperless."""
        raw = await self._get_all_pages("document_types", {})
        doc_types = [
            PaperlessDocumentType(
                id=dt["id"],
                name=dt["name"],
                slug=dt["slug"],
                match=dt.get("match", ""),
            )
            for dt in raw
        ]
        logger.info(f"Loaded {len(doc_types)} document types from Paperless")
        return doc_types

    async def get_all_storage_paths(self) -> list[PaperlessStoragePath]:
        """Load all storage paths from Paperless."""
        raw = await self._get_all_pages("storage_paths", {})
        paths = [
            PaperlessStoragePath(
                id=sp["id"],
                name=sp["name"],
                slug=sp["slug"],
                path=sp.get("path", ""),
            )
            for sp in raw
        ]
        logger.info(f"Loaded {len(paths)} storage paths from Paperless")
        return paths

    async def get_documents_with_tag(self, tag_id: int) -> list[PaperlessDocument]:
        """Fetch all documents that have a specific tag."""
        raw = await self._get_all_pages("documents", {"tags__id__all": tag_id})
        documents = []
        for d in raw:
            documents.append(
                PaperlessDocument(
                    id=d["id"],
                    title=d["title"],
                    content=d.get("content", ""),
                    tags=d.get("tags", []),
                    correspondent=d.get("correspondent"),
                    document_type=d.get("document_type"),
                    created=d.get("created", ""),
                    added=d.get("added", ""),
                    original_file_name=d.get("original_file_name", ""),
                    archived_file_name=d.get("archived_file_name", ""),
                )
            )
        logger.info(f"Found {len(documents)} documents with tag_id={tag_id}")
        return documents

    async def find_tag_by_name(self, name: str) -> Optional[PaperlessTag]:
        """Find a tag by exact name."""
        tags = await self.get_all_tags()
        for tag in tags:
            if tag.name.lower() == name.lower():
                return tag
        return None

    async def create_tag(self, name: str) -> PaperlessTag:
        """Create a new tag in Paperless."""
        response = await self._client.post(
            f"{self.base_url}/api/tags/",
            json={"name": name},
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"Created tag: {name} (id={data['id']})")
        return PaperlessTag(id=data["id"], name=data["name"], slug=data["slug"])

    async def create_correspondent(self, name: str) -> PaperlessCorrespondent:
        """Create a new correspondent in Paperless."""
        response = await self._client.post(
            f"{self.base_url}/api/correspondents/",
            json={"name": name},
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"Created correspondent: {name} (id={data['id']})")
        return PaperlessCorrespondent(
            id=data["id"], name=data["name"], slug=data["slug"]
        )

    async def create_document_type(self, name: str) -> PaperlessDocumentType:
        """Create a new document type in Paperless."""
        response = await self._client.post(
            f"{self.base_url}/api/document_types/",
            json={"name": name},
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"Created document type: {name} (id={data['id']})")
        return PaperlessDocumentType(
            id=data["id"], name=data["name"], slug=data["slug"]
        )

    async def update_document(
        self,
        doc_id: int,
        title: Optional[str] = None,
        correspondent_id: Optional[int] = None,
        document_type_id: Optional[int] = None,
        tags: Optional[list[int]] = None,
        storage_path_id: Optional[int] = None,
    ) -> None:
        """Patch a document with updated fields."""
        payload: dict = {}
        if title is not None:
            payload["title"] = title
        if correspondent_id is not None:
            payload["correspondent"] = correspondent_id
        if document_type_id is not None:
            payload["document_type"] = document_type_id
        if tags is not None:
            payload["tags"] = tags
        if storage_path_id is not None:
            payload["storage_path"] = storage_path_id

        response = await self._client.patch(
            f"{self.base_url}/api/documents/{doc_id}/",
            json=payload,
        )
        response.raise_for_status()
        logger.info(f"Updated document {doc_id}: {list(payload.keys())}")

    async def get_all_documents(self) -> list[PaperlessDocument]:
        """Fetch all documents from Paperless."""
        raw = await self._get_all_pages("documents", {})
        documents = []
        for d in raw:
            documents.append(
                PaperlessDocument(
                    id=d["id"],
                    title=d["title"],
                    content=d.get("content", ""),
                    tags=d.get("tags", []),
                    correspondent=d.get("correspondent"),
                    document_type=d.get("document_type"),
                    created=d.get("created", ""),
                    added=d.get("added", ""),
                    original_file_name=d.get("original_file_name", ""),
                    archived_file_name=d.get("archived_file_name", ""),
                )
            )
        logger.info(f"Loaded {len(documents)} total documents")
        return documents

    async def get_document_by_id(self, doc_id: int) -> Optional[PaperlessDocument]:
        """Fetch a single document by ID."""
        response = await self._client.get(f"{self.base_url}/api/documents/{doc_id}/")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        d = response.json()
        return PaperlessDocument(
            id=d["id"],
            title=d["title"],
            content=d.get("content", ""),
            tags=d.get("tags", []),
            correspondent=d.get("correspondent"),
            document_type=d.get("document_type"),
            created=d.get("created", ""),
            added=d.get("added", ""),
            original_file_name=d.get("original_file_name", ""),
            archived_file_name=d.get("archived_file_name", ""),
        )

    async def get_or_ensure_tag(self, name: str) -> PaperlessTag:
        """Get a tag by name, create it if it doesn't exist."""
        tag = await self.find_tag_by_name(name)
        if tag is None:
            tag = await self.create_tag(name)
        return tag
