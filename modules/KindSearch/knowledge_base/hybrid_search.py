"""
hybrid_search.py — RAG 2.0: BM25 + TF-IDF hybrid retrieval for the KindAI knowledge base.

Why this exists:
    The existing TF-IDF search in kb.py is good for single-term lookups but misses
    semantic neighbours (e.g. "debrief" doesn't match "case note reflection").

    BM25 (Okapi BM25) is a probabilistic improvement over TF-IDF that handles
    document length normalisation better — short chunks don't get unfairly penalised.

    Reciprocal Rank Fusion (RRF) merges the two rankings without needing score
    normalisation — just the ranks. This gives meaningfully better recall at k
    with zero external API calls: fully offline.

    For true semantic/vector search, a future upgrade path is documented at the
    bottom of this file — but the current implementation needs no external models
    or GPU.

Usage:
    from knowledge_base.hybrid_search import HybridSearch
    hs = HybridSearch()
    results = hs.query("post-shift debrief case notes NDIS", k=5)
"""
from __future__ import annotations

import json
import math
import re
import sqlite3
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "db" / "knowledge_base.db"

# BM25 hyperparameters — empirically reasonable defaults
BM25_K1 = 1.5   # Term frequency saturation (1.2–2.0 is standard)
BM25_B = 0.75   # Document length normalisation (0 = no norm, 1 = full norm)

# RRF: k constant — higher → more emphasis on rank position vs raw score
RRF_K = 60


def _tokenize(text: str) -> list[str]:
    """Lowercase, strip punctuation, split. Mirrors kb.py tokenizer."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return [t for t in text.split() if len(t) > 1]  # drop single-char noise


class HybridSearch:
    """
    Hybrid retrieval: BM25 + TF-IDF, fused via Reciprocal Rank Fusion.

    Uses the same SQLite knowledge_base.db as KnowledgeBase, so all ingested
    content is automatically available here.

    Design decision: we compute BM25 and TF-IDF at query time, no pre-built index.
    This is fine for corpora < 50k chunks (expected scale for KindAI). If the KB
    grows beyond that, move to a pre-built index (see vectorisation note below).
    """

    def __init__(self, db_path: str | Path = DB_PATH):
        self.db_path = Path(db_path)

    def _load_chunks(self) -> list[dict]:
        """Load all non-deleted chunks from the DB."""
        if not self.db_path.exists():
            return []
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute("SELECT id, source, content, tokens FROM chunks").fetchall()
            return [dict(r) for r in rows]
        except Exception:
            return []
        finally:
            conn.close()

    def _bm25_scores(self, query_tokens: list[str], chunks: list[dict]) -> list[float]:
        """
        Compute BM25 scores for all chunks against the query.

        BM25(q, d) = Σ IDF(t) * [ tf(t,d) * (k1+1) / (tf(t,d) + k1*(1 - b + b*|d|/avgdl)) ]
        """
        # Parse token lists once
        token_lists = [json.loads(c["tokens"]) if c["tokens"] else [] for c in chunks]
        N = len(token_lists)
        if N == 0:
            return []

        # Average document length for normalisation
        lengths = [len(tl) for tl in token_lists]
        avgdl = sum(lengths) / N if N else 1

        # Document frequency per term
        df: Counter = Counter()
        for tl in token_lists:
            df.update(set(tl))

        def idf(term: str) -> float:
            # Smoothed IDF — avoids negative values for very common terms
            n_t = df.get(term, 0)
            return math.log(1 + (N - n_t + 0.5) / (n_t + 0.5))

        scores = []
        for i, tl in enumerate(token_lists):
            tf_map = Counter(tl)
            dl = lengths[i]
            score = 0.0
            for term in query_tokens:
                if term not in tf_map:
                    continue
                tf = tf_map[term]
                numerator = tf * (BM25_K1 + 1)
                denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * dl / avgdl)
                score += idf(term) * (numerator / denominator)
            scores.append(score)
        return scores

    def _tfidf_scores(self, query_tokens: list[str], chunks: list[dict]) -> list[float]:
        """
        Compute TF-IDF cosine similarity scores against the query.
        Same algorithm as kb.py — ensures consistency.
        """
        token_lists = [json.loads(c["tokens"]) if c["tokens"] else [] for c in chunks]
        N = len(token_lists)
        if N == 0:
            return []

        df: Counter = Counter()
        for tl in token_lists:
            df.update(set(tl))

        def idf(term: str) -> float:
            return math.log((N + 1) / (df.get(term, 0) + 1)) + 1.0

        def tfidf_vec(tokens: list[str]) -> dict[str, float]:
            tf = Counter(tokens)
            total = len(tokens) or 1
            return {t: (count / total) * idf(t) for t, count in tf.items()}

        def cosine(a: dict, b: dict) -> float:
            keys = set(a) & set(b)
            dot = sum(a[k] * b[k] for k in keys)
            mag_a = math.sqrt(sum(v * v for v in a.values()))
            mag_b = math.sqrt(sum(v * v for v in b.values()))
            return dot / (mag_a * mag_b) if mag_a and mag_b else 0.0

        q_vec = tfidf_vec(query_tokens)
        return [cosine(q_vec, tfidf_vec(tl)) for tl in token_lists]

    def _rrf_fusion(self, *rank_lists: list[int], k: int = RRF_K) -> list[float]:
        """
        Reciprocal Rank Fusion: given N rank orderings of the same items,
        compute a fused score for each item index.

        rank_lists: each is a list of original indices sorted best→worst.
        Returns a fused score per original index position.
        """
        n_items = max(len(rl) for rl in rank_lists) if rank_lists else 0
        rrf_scores = [0.0] * n_items
        for rank_list in rank_lists:
            for rank, orig_idx in enumerate(rank_list):
                rrf_scores[orig_idx] += 1.0 / (k + rank + 1)
        return rrf_scores

    def query(self, query_text: str, k: int = 5) -> list[dict[str, Any]]:
        """
        Hybrid BM25 + TF-IDF search via RRF.

        Returns up to k results, each with:
          source, snippet, score, bm25_rank, tfidf_rank
        """
        query_tokens = _tokenize(query_text)
        if not query_tokens:
            return []

        chunks = self._load_chunks()
        if not chunks:
            return []

        bm25 = self._bm25_scores(query_tokens, chunks)
        tfidf = self._tfidf_scores(query_tokens, chunks)

        n = len(chunks)
        # Rank lists: indices sorted by descending score
        bm25_order = sorted(range(n), key=lambda i: -bm25[i])
        tfidf_order = sorted(range(n), key=lambda i: -tfidf[i])

        rrf = self._rrf_fusion(bm25_order, tfidf_order)

        # Sort by RRF score descending
        top_indices = sorted(range(n), key=lambda i: -rrf[i])[:k]

        results = []
        for idx in top_indices:
            chunk = chunks[idx]
            content = chunk.get("content", "")
            snippet = content[:300].replace("\n", " ") + ("…" if len(content) > 300 else "")
            results.append({
                "source": chunk["source"],
                "snippet": snippet,
                "score": round(rrf[idx], 6),
                "bm25_rank": bm25_order.index(idx) + 1,
                "tfidf_rank": tfidf_order.index(idx) + 1,
                "retrieval_method": "hybrid_bm25_tfidf_rrf",
            })
        return results

    def query_bm25_only(self, query_text: str, k: int = 5) -> list[dict[str, Any]]:
        """BM25-only retrieval — faster, good for exact-term queries (NDIS codes, identifiers)."""
        query_tokens = _tokenize(query_text)
        if not query_tokens:
            return []
        chunks = self._load_chunks()
        if not chunks:
            return []
        scores = self._bm25_scores(query_tokens, chunks)
        top = sorted(range(len(chunks)), key=lambda i: -scores[i])[:k]
        return [
            {
                "source": chunks[i]["source"],
                "snippet": chunks[i].get("content", "")[:300].replace("\n", " ") + "…",
                "score": round(scores[i], 4),
                "retrieval_method": "bm25",
            }
            for i in top if scores[i] > 0
        ]

    def stats(self) -> dict:
        """Return basic corpus statistics."""
        chunks = self._load_chunks()
        sources = set(c["source"] for c in chunks)
        return {
            "total_chunks": len(chunks),
            "unique_sources": len(sources),
            "db_path": str(self.db_path),
            "retrieval_methods": ["hybrid_bm25_tfidf_rrf", "bm25_only"],
        }


# ── Vector search upgrade path (future) ──────────────────────────────────────
#
# When the corpus grows beyond ~50k chunks, or semantic retrieval becomes
# important enough to justify the overhead, the upgrade path is:
#
# 1. Install: sentence-transformers (all-MiniLM-L6-v2, ~80MB, runs on CPU)
# 2. On ingest: embed each chunk → store as numpy array in db/kb_vectors.db
# 3. At query time: embed query → cosine similarity against stored vectors
# 4. Fuse vector scores into the RRF pipeline as a third ranking
#
# The embedding model runs fully offline (no API calls).
# SQLite + numpy serialisation is sufficient for < 500k chunks.
# No external vector database required.
#
# Stub class (not active):
#
# class VectorSearch:
#     def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
#         from sentence_transformers import SentenceTransformer
#         self.model = SentenceTransformer(model_name)
#
#     def embed(self, text: str) -> list[float]:
#         return self.model.encode(text).tolist()
