"""Universal conversation memory integration for CrowQuant.

This module folds the standalone conversation-memory project into CrowQuant as a
provider-agnostic shared memory layer. It keeps the file indexing and retrieval
idea, but makes the embedding step pluggable so the rest of CrowQuant can use a
simple built-in provider or an Ollama-backed one.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, Sequence

TOKEN_RE = re.compile(r"[A-Za-z0-9_']+")


@dataclass(slots=True)
class MemoryHit:
    id: str
    source_path: str
    text: str
    score: float
    semantic_score: float
    lexical_score: float


class EmbeddingProvider(Protocol):
    dim: int
    name: str

    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


class HashEmbeddingProvider:
    """Deterministic stdlib-only embedding provider."""

    def __init__(self, dim: int = 256):
        self.dim = dim
        self.name = f"hash:{dim}"

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * self.dim
        tokens = TOKEN_RE.findall(text.lower())
        if not tokens:
            return vec
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            a = int.from_bytes(digest[:8], "big") % self.dim
            b = int.from_bytes(digest[8:16], "big") % self.dim
            sign = 1.0 if digest[16] % 2 == 0 else -1.0
            vec[a] += sign
            vec[b] += sign * 0.5
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]


class OllamaEmbeddingProvider:
    """Optional Ollama embedding provider."""

    def __init__(self, model: str = "nomic-embed-text", url: str = "http://localhost:11434", dim: int | None = None):
        self.model = model
        self.url = url.rstrip("/")
        self.name = f"ollama:{model}"
        self.dim = dim or 768

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        import requests  # type: ignore

        resp = requests.post(
            f"{self.url}/api/embed",
            json={"model": self.model, "input": list(texts)},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        embeddings = data.get("embeddings", [])
        if len(embeddings) != len(texts):
            raise RuntimeError("Ollama returned the wrong number of embeddings")
        if embeddings and self.dim != len(embeddings[0]):
            self.dim = len(embeddings[0])
        return embeddings


def chunk_text(text: str, *, max_chars: int = 1600, overlap_chars: int = 250) -> list[str]:
    text = text.replace("\r\n", "\n").strip()
    if not text:
        return []
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [text]

    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
            continue
        if current:
            chunks.append(current)
        if len(paragraph) <= max_chars:
            current = paragraph
            continue
        start = 0
        step = max_chars - overlap_chars if max_chars > overlap_chars else max_chars
        while start < len(paragraph):
            end = min(len(paragraph), start + max_chars)
            chunks.append(paragraph[start:end])
            if end >= len(paragraph):
                break
            start += step
        current = ""
    if current:
        chunks.append(current)
    return chunks


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


class UniversalConversationMemory:
    """SQLite-backed memory index for text conversations and notes."""

    def __init__(self, db_path: str | Path, provider: EmbeddingProvider | None = None):
        self.db_path = Path(db_path).expanduser()
        self.provider = provider or HashEmbeddingProvider()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                source_path TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                hash TEXT NOT NULL,
                size INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                provider TEXT NOT NULL,
                embedding_dim INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                source_path TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                embedding TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                text,
                chunk_id UNINDEXED,
                source_path UNINDEXED
            );
            """
        )
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    @staticmethod
    def _document_hash(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def add_document(self, source_path: str | Path, text: str) -> dict:
        source_path = str(Path(source_path))
        title = Path(source_path).name
        doc_hash = self._document_hash(text)
        updated_at = int(time.time())
        document_id = hashlib.sha256(source_path.encode("utf-8")).hexdigest()
        chunks = chunk_text(text)
        embeddings = self.provider.embed(chunks) if chunks else []

        with self.conn:
            self.conn.execute("DELETE FROM documents WHERE id = ?", (document_id,))
            self.conn.execute("DELETE FROM chunks_fts WHERE source_path = ?", (source_path,))
            self.conn.execute(
                """
                INSERT OR REPLACE INTO documents(id, source_path, title, hash, size, updated_at, provider, embedding_dim)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (document_id, source_path, title, doc_hash, len(text), updated_at, self.provider.name, self.provider.dim),
            )
            for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                chunk_id = hashlib.sha256(f"{document_id}:{idx}:{doc_hash}".encode("utf-8")).hexdigest()
                self.conn.execute(
                    """
                    INSERT INTO chunks(id, document_id, source_path, chunk_index, text, embedding, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (chunk_id, document_id, source_path, idx, chunk, json.dumps(embedding), updated_at),
                )
                self.conn.execute(
                    "INSERT INTO chunks_fts(text, chunk_id, source_path) VALUES (?, ?, ?)",
                    (chunk, chunk_id, source_path),
                )
        return {
            "document_id": document_id,
            "source_path": source_path,
            "chunks_indexed": len(chunks),
            "provider": self.provider.name,
            "hash": doc_hash,
        }

    def index_path(self, root: str | Path, extensions: Sequence[str] = (".md", ".txt")) -> dict:
        root = Path(root).expanduser()
        exts = {e.lower() for e in extensions}
        indexed = []
        skipped = []
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in exts:
                continue
            try:
                indexed.append(self.add_document(path, path.read_text(encoding="utf-8", errors="replace")))
            except Exception as exc:  # pragma: no cover - defensive
                skipped.append({"path": str(path), "error": str(exc)})
        return {"root": str(root), "indexed": indexed, "skipped": skipped, "count": len(indexed)}

    def search(self, query: str, *, limit: int = 5, semantic_weight: float = 0.7) -> list[MemoryHit]:
        lexical_weight = 1.0 - semantic_weight
        query_embedding = self.provider.embed([query])[0]
        rows = self.conn.execute("SELECT id, source_path, text, embedding FROM chunks").fetchall()
        lexical_rows: dict[str, float] = {}
        try:
            for row in self.conn.execute(
                "SELECT chunk_id, bm25(chunks_fts) AS rank FROM chunks_fts WHERE chunks_fts MATCH ? LIMIT ?",
                (query, limit * 10),
            ):
                lexical_rows[row["chunk_id"]] = 1.0 / (1.0 + max(float(row["rank"]), 0.0))
        except sqlite3.OperationalError:
            lexical_rows = {}

        hits: list[MemoryHit] = []
        for row in rows:
            embedding = json.loads(row["embedding"])
            semantic = max(_cosine(query_embedding, embedding), 0.0)
            lexical = lexical_rows.get(row["id"], 0.0)
            score = semantic_weight * semantic + lexical_weight * lexical
            if score <= 0:
                continue
            hits.append(
                MemoryHit(
                    id=row["id"],
                    source_path=row["source_path"],
                    text=row["text"],
                    score=score,
                    semantic_score=semantic,
                    lexical_score=lexical,
                )
            )
        hits.sort(key=lambda hit: hit.score, reverse=True)
        return hits[:limit]

    def recall(self, query: str, *, limit: int = 5) -> str:
        hits = self.search(query, limit=limit)
        if not hits:
            return ""
        blocks = []
        for hit in hits:
            blocks.append(
                f"# {hit.source_path}\nscore={hit.score:.3f} semantic={hit.semantic_score:.3f} lexical={hit.lexical_score:.3f}\n{hit.text}"
            )
        return "\n\n".join(blocks)

    def status(self) -> dict:
        doc_count = self.conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        chunk_count = self.conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        latest = self.conn.execute("SELECT MAX(updated_at) FROM documents").fetchone()[0]
        return {
            "db_path": str(self.db_path),
            "provider": self.provider.name,
            "embedding_dim": self.provider.dim,
            "documents": int(doc_count),
            "chunks": int(chunk_count),
            "last_updated": latest,
        }
