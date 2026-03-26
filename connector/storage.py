"""
Persistent storage for processing results using JSON files.
The dashboard reads these files via a shared volume.
"""

import json
import logging
import os
from datetime import datetime, date
from typing import Any

from config import config
from models import ClaudeAnalysis, ProcessingResult, ProcessingStats

logger = logging.getLogger(__name__)

RESULTS_FILE = os.path.join(config.DATA_DIR, "results.json")
STATS_FILE = os.path.join(config.DATA_DIR, "stats.json")
MAX_RESULTS_STORED = 500


def _serialize_result(result: ProcessingResult) -> dict:
    analysis_data = None
    if result.analysis:
        a = result.analysis
        analysis_data = {
            "title": a.title,
            "correspondent": a.correspondent,
            "document_type": a.document_type,
            "tags": a.tags,
            "summary": a.summary,
            "language": a.language,
        }
    return {
        "document_id": result.document_id,
        "document_title": result.document_title,
        "success": result.success,
        "analysis": analysis_data,
        "error": result.error,
        "prompt_tokens": result.prompt_tokens,
        "completion_tokens": result.completion_tokens,
        "total_tokens": result.total_tokens,
        "processed_at": result.processed_at.isoformat(),
        "duration_seconds": result.duration_seconds,
    }


def _deserialize_result(data: dict) -> ProcessingResult:
    analysis = None
    if data.get("analysis"):
        a = data["analysis"]
        analysis = ClaudeAnalysis(
            title=a.get("title", ""),
            correspondent=a.get("correspondent", ""),
            document_type=a.get("document_type", ""),
            tags=a.get("tags", []),
            summary=a.get("summary", ""),
            language=a.get("language", "de"),
        )
    return ProcessingResult(
        document_id=data["document_id"],
        document_title=data["document_title"],
        success=data["success"],
        analysis=analysis,
        error=data.get("error"),
        prompt_tokens=data.get("prompt_tokens", 0),
        completion_tokens=data.get("completion_tokens", 0),
        total_tokens=data.get("total_tokens", 0),
        processed_at=datetime.fromisoformat(data["processed_at"]),
        duration_seconds=data.get("duration_seconds", 0.0),
    )


def load_stats() -> ProcessingStats:
    """Load processing stats from disk."""
    os.makedirs(config.DATA_DIR, exist_ok=True)

    results: list[ProcessingResult] = []
    if os.path.exists(RESULTS_FILE):
        try:
            with open(RESULTS_FILE, "r", encoding="utf-8") as f:
                raw_results = json.load(f)
            results = [_deserialize_result(r) for r in raw_results]
        except Exception as e:
            logger.warning(f"Could not load results file: {e}")

    stats_data: dict[str, Any] = {}
    if os.path.exists(STATS_FILE):
        try:
            with open(STATS_FILE, "r", encoding="utf-8") as f:
                stats_data = json.load(f)
        except Exception as e:
            logger.warning(f"Could not load stats file: {e}")

    today = date.today().isoformat()
    processed_today = sum(
        1 for r in results if r.processed_at.date().isoformat() == today and r.success
    )

    return ProcessingStats(
        total_processed=stats_data.get("total_processed", 0),
        total_errors=stats_data.get("total_errors", 0),
        total_prompt_tokens=stats_data.get("total_prompt_tokens", 0),
        total_completion_tokens=stats_data.get("total_completion_tokens", 0),
        processed_today=processed_today,
        last_scan=datetime.fromisoformat(stats_data["last_scan"])
        if stats_data.get("last_scan")
        else None,
        results=results,
    )


def save_result(result: ProcessingResult, stats: ProcessingStats) -> None:
    """Append a processing result and update stats on disk."""
    os.makedirs(config.DATA_DIR, exist_ok=True)

    # Update stats
    if result.success:
        stats.total_processed += 1
    else:
        stats.total_errors += 1
    stats.total_prompt_tokens += result.prompt_tokens
    stats.total_completion_tokens += result.completion_tokens

    # Prepend new result (newest first) and trim
    stats.results.insert(0, result)
    if len(stats.results) > MAX_RESULTS_STORED:
        stats.results = stats.results[:MAX_RESULTS_STORED]

    # Recalculate today's count
    today = date.today().isoformat()
    stats.processed_today = sum(
        1 for r in stats.results if r.processed_at.date().isoformat() == today and r.success
    )

    # Write results file
    try:
        with open(RESULTS_FILE, "w", encoding="utf-8") as f:
            json.dump([_serialize_result(r) for r in stats.results], f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Failed to write results file: {e}")

    # Write stats file
    try:
        with open(STATS_FILE, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "total_processed": stats.total_processed,
                    "total_errors": stats.total_errors,
                    "total_prompt_tokens": stats.total_prompt_tokens,
                    "total_completion_tokens": stats.total_completion_tokens,
                    "processed_today": stats.processed_today,
                    "last_scan": stats.last_scan.isoformat() if stats.last_scan else None,
                },
                f,
                indent=2,
            )
    except Exception as e:
        logger.error(f"Failed to write stats file: {e}")


def update_last_scan(stats: ProcessingStats) -> None:
    """Update the last scan timestamp."""
    stats.last_scan = datetime.utcnow()
    os.makedirs(config.DATA_DIR, exist_ok=True)
    try:
        with open(STATS_FILE, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "total_processed": stats.total_processed,
                    "total_errors": stats.total_errors,
                    "total_prompt_tokens": stats.total_prompt_tokens,
                    "total_completion_tokens": stats.total_completion_tokens,
                    "processed_today": stats.processed_today,
                    "last_scan": stats.last_scan.isoformat(),
                },
                f,
                indent=2,
            )
    except Exception as e:
        logger.error(f"Failed to update last_scan: {e}")
