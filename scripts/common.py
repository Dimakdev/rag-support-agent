"""Shared helpers for deploy.py, seed_airtable.py, run_tests.py and run_evals.py:
.env loading, n8n API, Airtable API, Qdrant API, Gemini embeddings, state file.
Standard library only (urllib), Python 3.10+.

Carried over from the two earlier cases: same .env handling, same n8n client, same state file.
New here are the Qdrant and Gemini clients, because indexing has to be checkable from outside n8n —
a test that can only look at the workflow's own output is not a test.
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
STATE_FILE = ROOT / ".deploy-state.json"
SCHEMA_FILE = ROOT / "schema" / "airtable.json"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def load_env(path: pathlib.Path = ROOT / ".env") -> dict:
    env = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    for k, v in os.environ.items():
        env.setdefault(k, v)
    return env


def require(env: dict, *keys: str) -> None:
    missing = [k for k in keys if not env.get(k)]
    if missing:
        sys.exit(f"Missing in .env: {', '.join(missing)}")


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    return {}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_schema() -> dict:
    return json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))


class HttpError(Exception):
    def __init__(self, status: int, body: str, url: str):
        super().__init__(f"HTTP {status} for {url}: {body[:800]}")
        self.status = status
        self.body = body


def http(method: str, url: str, headers: dict | None = None, body=None, timeout: int = 120):
    data = None
    hdrs = dict(headers or {})
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        hdrs["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return resp.status, (json.loads(raw) if raw.strip().startswith(("{", "[")) else raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        raise HttpError(e.code, raw, url) from None


# ------------------------------------------------------------------ ids
FNV_OFFSETS = (0x811c9dc5, 0x01000193, 0x9dc5811c, 0xc5811c9d)
MASK = 0xFFFFFFFF
SEP = chr(0)


def fnv128(text: str) -> str:
    """The same 128-bit hash the chunker runs in n8n, character for character.

    It exists twice because it has to: the workflow computes it in JavaScript, and the tests have to
    be able to predict a chunk id without asking the workflow. The two must agree, and a test in
    run_tests.py checks that they still do. Iteration is over UTF-16 code units because that is what
    JavaScript's charCodeAt returns.
    """
    h = list(FNV_OFFSETS)
    data = text.encode("utf-16-le")
    for i in range(0, len(data), 2):
        c = data[i] | (data[i + 1] << 8)
        for k in range(4):
            h[k] = ((h[k] ^ (c + k)) * 0x01000193) & MASK
    return "".join(f"{x:08x}" for x in h)


def chunk_hash(doc_url: str, heading_path: str, text: str) -> str:
    return fnv128(SEP.join((doc_url, heading_path, text)))


def point_id(hash_hex: str) -> str:
    """Qdrant accepts only unsigned integers or UUIDs as point ids, never an arbitrary string.

    The chunk's hash IS its identity here (that is what makes re-indexing idempotent), so the hash is
    folded into a UUID rather than stored beside a random one. Same text -> same id, every time.
    """
    return str(uuid.UUID(hash_hex[:32]))


class N8n:
    def __init__(self, base_url: str, api_key: str):
        self.base = base_url.rstrip("/")
        self.headers = {"X-N8N-API-KEY": api_key, "Accept": "application/json"}

    def call(self, method: str, path: str, body=None, timeout: int = 60):
        return http(method, f"{self.base}/api/v1{path}", self.headers, body, timeout)[1]

    def list_workflows(self):
        return self.call("GET", "/workflows?limit=250").get("data", [])

    def get_workflow(self, wf_id: str):
        return self.call("GET", f"/workflows/{wf_id}")

    def create_workflow(self, wf: dict):
        return self.call("POST", "/workflows", body=api_body(wf))

    def update_workflow(self, wf_id: str, wf: dict):
        return self.call("PUT", f"/workflows/{wf_id}", body=api_body(wf))

    def activate(self, wf_id: str):
        return self.call("POST", f"/workflows/{wf_id}/activate")

    def deactivate(self, wf_id: str):
        return self.call("POST", f"/workflows/{wf_id}/deactivate")

    def create_credential(self, name: str, cred_type: str, data: dict):
        return self.call("POST", "/credentials", body={"name": name, "type": cred_type, "data": data})

    def executions(self, wf_id: str, limit: int = 5, include_data: bool = True):
        q = f"?workflowId={wf_id}&limit={limit}&includeData={'true' if include_data else 'false'}"
        return self.call("GET", f"/executions{q}").get("data", [])


def api_body(wf: dict) -> dict:
    """The public API rejects unknown top-level keys: keep only what it accepts."""
    allowed_settings = {"saveExecutionProgress", "saveManualExecutions", "saveDataErrorExecution",
                        "saveDataSuccessExecution", "executionTimeout", "errorWorkflow", "timezone",
                        "executionOrder"}
    return {
        "name": wf["name"],
        "nodes": wf["nodes"],
        "connections": wf["connections"],
        "settings": {k: v for k, v in wf.get("settings", {}).items() if k in allowed_settings},
        "staticData": wf.get("staticData"),
    }


class Airtable:
    META = "https://api.airtable.com/v0/meta/bases"
    DATA = "https://api.airtable.com/v0"

    def __init__(self, pat: str, base_id: str):
        self.base_id = base_id
        self.headers = {"Authorization": f"Bearer {pat}"}

    def tables(self) -> list[dict]:
        return http("GET", f"{self.META}/{self.base_id}/tables", self.headers)[1]["tables"]

    def create_table(self, spec: dict) -> dict:
        return http("POST", f"{self.META}/{self.base_id}/tables", self.headers, spec)[1]

    def create_field(self, table_id: str, spec: dict) -> dict:
        return http("POST", f"{self.META}/{self.base_id}/tables/{table_id}/fields", self.headers, spec)[1]

    def records(self, table: str, formula: str | None = None, max_records: int = 100,
                fields: list[str] | None = None) -> list[dict]:
        q = [("maxRecords", str(max_records))]
        if formula:
            q.append(("filterByFormula", formula))
        for f in fields or []:
            q.append(("fields[]", f))
        url = f"{self.DATA}/{self.base_id}/{urllib.parse.quote(table)}?{urllib.parse.urlencode(q)}"
        return http("GET", url, self.headers)[1].get("records", [])

    def create(self, table: str, fields: dict) -> dict:
        url = f"{self.DATA}/{self.base_id}/{urllib.parse.quote(table)}"
        return http("POST", url, self.headers, {"fields": fields, "typecast": True})[1]

    def update(self, table: str, record_id: str, fields: dict) -> dict:
        url = f"{self.DATA}/{self.base_id}/{urllib.parse.quote(table)}/{record_id}"
        return http("PATCH", url, self.headers, {"fields": fields, "typecast": True})[1]

    def delete(self, table: str, record_ids: list[str]) -> None:
        for i in range(0, len(record_ids), 10):
            qs = "&".join(f"records[]={urllib.parse.quote(r)}" for r in record_ids[i:i + 10])
            http("DELETE", f"{self.DATA}/{self.base_id}/{urllib.parse.quote(table)}?{qs}", self.headers)


class Qdrant:
    """Only the six calls this case needs. Everything is plain REST, so the same requests can be
    replayed with curl when a run looks wrong."""

    def __init__(self, url: str, collection: str = "docs"):
        self.base = url.rstrip("/")
        self.collection = collection

    def call(self, method: str, path: str, body=None):
        return http(method, f"{self.base}{path}", None, body)[1]

    def info(self) -> dict:
        return self.call("GET", f"/collections/{self.collection}")

    def ensure_collection(self, dim: int = 768, distance: str = "Cosine") -> bool:
        """True when it had to create it. Cosine because Gemini embeddings are direction, not magnitude."""
        try:
            self.info()
            return False
        except HttpError as e:
            if e.status != 404:
                raise
        self.call("PUT", f"/collections/{self.collection}",
                  {"vectors": {"size": dim, "distance": distance}})
        # Payload indexes: every search filters on status, and retiring filters on doc_url.
        for field, kind in (("status", "keyword"), ("doc_url", "keyword"), ("source_id", "keyword")):
            self.call("PUT", f"/collections/{self.collection}/index?wait=true",
                      {"field_name": field, "field_schema": kind})
        return True

    def drop_collection(self) -> None:
        self.call("DELETE", f"/collections/{self.collection}")

    def upsert(self, points: list[dict]) -> dict:
        return self.call("PUT", f"/collections/{self.collection}/points?wait=true", {"points": points})

    def exists(self, ids: list[str]) -> set[str]:
        if not ids:
            return set()
        found = self.call("POST", f"/collections/{self.collection}/points",
                          {"ids": ids, "with_payload": False, "with_vector": False})
        return {str(p["id"]) for p in found.get("result", [])}

    def search(self, vector: list[float], limit: int = 12, score_threshold: float | None = None,
               only_active: bool = True) -> list[dict]:
        body = {"vector": vector, "limit": limit, "with_payload": True}
        if score_threshold is not None:
            body["score_threshold"] = score_threshold
        if only_active:
            body["filter"] = {"must": [{"key": "status", "match": {"value": "active"}}]}
        return self.call("POST", f"/collections/{self.collection}/points/search", body).get("result", [])

    def set_status(self, doc_urls: list[str], status: str) -> dict:
        """Retiring a document does not delete its chunks: they stop being searchable and stay visible."""
        return self.call("POST", f"/collections/{self.collection}/points/payload?wait=true", {
            "payload": {"status": status},
            "filter": {"must": [{"key": "doc_url", "match": {"any": doc_urls}}]},
        })

    def count(self, only_active: bool = False) -> int:
        body = {"exact": True}
        if only_active:
            body["filter"] = {"must": [{"key": "status", "match": {"value": "active"}}]}
        return self.call("POST", f"/collections/{self.collection}/points/count", body)["result"]["count"]


class Gemini:
    """Embeddings only. The answer itself is generated inside n8n by the chain node, where the
    structured-output parser can enforce the schema."""

    API = "https://generativelanguage.googleapis.com/v1beta/models"
    MODEL = "gemini-embedding-001"
    DIM = 768
    BATCH = 100

    def __init__(self, key: str, model: str | None = None, dim: int | None = None):
        self.key = key
        self.model = model or self.MODEL
        self.dim = dim or self.DIM

    def embed(self, texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
        """task_type is not decoration: a question and a paragraph are embedded for different jobs,
        and telling the model which one it is measurably improves what comes back."""
        out = []
        for i in range(0, len(texts), self.BATCH):
            chunk = texts[i:i + self.BATCH]
            body = {"requests": [{
                "model": f"models/{self.model}",
                "content": {"parts": [{"text": t}]},
                "taskType": task_type,
                "outputDimensionality": self.dim,
            } for t in chunk]}
            for attempt in range(3):
                try:
                    res = http("POST", f"{self.API}/{self.model}:batchEmbedContents?key={self.key}",
                               None, body)[1]
                    out.extend(e["values"] for e in res["embeddings"])
                    break
                except HttpError as e:
                    if e.status in (429, 500, 503) and attempt < 2:
                        time.sleep(2 * (attempt + 1))
                        continue
                    raise
        return out
