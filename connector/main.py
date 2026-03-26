#!/usr/bin/env python3
"""
paperless-claude-connector
Intelligent document processor for Paperless-NGX using Claude AI.
"""

import asyncio
import json
import logging
import os
import signal
import sys

from config import config
from models import ProcessingStats
from paperless_client import PaperlessClient
from processor import DocumentProcessor
from storage import load_stats, save_result, update_last_scan

logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("connector")

_shutdown = False
REPROCESS_FILE = os.path.join(config.DATA_DIR, "reprocess_queue.json")


def handle_signal(sig, frame):
    global _shutdown
    logger.info(f"Received signal {sig}, shutting down...")
    _shutdown = True


async def process_documents(
    documents: list,
    paperless: PaperlessClient,
    processor: DocumentProcessor,
    stats: ProcessingStats,
    label: str = "scan",
) -> None:
    """Process a list of documents and save results."""
    if not documents:
        logger.info(f"[{label}] No documents to process.")
        return

    logger.info(f"[{label}] Processing {len(documents)} document(s).")
    for document in documents:
        if _shutdown:
            break
        result = await processor.process_document(document, paperless)
        save_result(result, stats)
        if result.success:
            logger.info(
                f"[OK] Doc {document.id}: '{result.document_title}' "
                f"-> {result.analysis.document_type if result.analysis else '?'} "
                f"({result.total_tokens} tokens)"
            )
        else:
            logger.error(f"[FAIL] Doc {document.id}: {result.error}")

    await processor.refresh_metadata(paperless)


async def check_reprocess_queue(
    paperless: PaperlessClient,
    processor: DocumentProcessor,
    stats: ProcessingStats,
) -> bool:
    """Check for a reprocess queue file and process it. Returns True if queue was found."""
    if not os.path.exists(REPROCESS_FILE):
        return False

    try:
        with open(REPROCESS_FILE, "r") as f:
            queue = json.load(f)
        os.remove(REPROCESS_FILE)
    except Exception as e:
        logger.error(f"Failed to read reprocess queue: {e}")
        return False

    mode = queue.get("mode", "ids")
    logger.info(f"Reprocess queue found: mode={mode}")
    update_last_scan(stats)

    if mode == "all":
        documents = await paperless.get_all_documents()
        await process_documents(documents, paperless, processor, stats, label="reprocess-all")
    else:
        ids = queue.get("ids", [])
        documents = []
        for doc_id in ids:
            doc = await paperless.get_document_by_id(doc_id)
            if doc:
                documents.append(doc)
            else:
                logger.warning(f"Document {doc_id} not found in Paperless")
        await process_documents(documents, paperless, processor, stats, label="reprocess-ids")

    return True


async def scan_and_process(
    paperless: PaperlessClient,
    processor: DocumentProcessor,
    stats: ProcessingStats,
) -> None:
    """Scan for documents tagged with TAG_NEW and process them."""
    logger.info("Starting scan for documents with tag '%s'...", config.TAG_NEW)
    update_last_scan(stats)

    if processor._tag_new_id is None:
        logger.warning("Tag '%s' not found, skipping scan", config.TAG_NEW)
        return

    documents = await paperless.get_documents_with_tag(processor._tag_new_id)
    await process_documents(documents, paperless, processor, stats, label="scan")


async def main() -> None:
    global _shutdown

    logger.info("=" * 60)
    logger.info("paperless-claude-connector starting up")
    logger.info(f"  Paperless URL:    {config.PAPERLESS_URL}")
    logger.info(f"  Claude Model:     {config.CLAUDE_MODEL}")
    logger.info(f"  Scan Interval:    {config.SCAN_INTERVAL_SECONDS}s")
    logger.info(f"  Tag New:          {config.TAG_NEW}")
    logger.info(f"  Tag Processed:    {config.TAG_PROCESSED}")
    logger.info(f"  Fuzzy Threshold:  {config.FUZZY_THRESHOLD}%")
    logger.info("=" * 60)

    try:
        config.validate()
    except ValueError as e:
        logger.critical(f"Configuration error: {e}")
        sys.exit(1)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    stats = load_stats()
    logger.info(f"Loaded stats: {stats.total_processed} processed, {stats.total_errors} errors total")

    async with PaperlessClient() as paperless:
        processor = DocumentProcessor()
        try:
            await processor.initialize(paperless)
        except Exception as e:
            logger.critical(f"Failed to initialize: {e}", exc_info=True)
            sys.exit(1)

        logger.info("Ready. Starting processing loop...")

        while not _shutdown:
            try:
                # Reprocess queue takes priority over normal scan
                queue_processed = await check_reprocess_queue(paperless, processor, stats)
                if not queue_processed:
                    await scan_and_process(paperless, processor, stats)
            except Exception as e:
                logger.error(f"Error during processing: {e}", exc_info=True)

            if _shutdown:
                break

            logger.info(f"Waiting {config.SCAN_INTERVAL_SECONDS}s until next scan...")
            for _ in range(config.SCAN_INTERVAL_SECONDS):
                if _shutdown:
                    break
                if os.path.exists(REPROCESS_FILE):
                    logger.info("Reprocess queue detected, waking up early.")
                    break
                await asyncio.sleep(1)

    logger.info("Connector stopped.")


if __name__ == "__main__":
    asyncio.run(main())
