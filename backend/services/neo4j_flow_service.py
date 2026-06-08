import hashlib
import os
import re
from typing import Any, Optional
from urllib.parse import urlparse

from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"), override=True)


def _clean_node_label(value: str) -> str:
    cleaned = value.strip().strip('"').strip("'").strip()
    return cleaned or "Node"


def _parse_d2_flow(code: str) -> dict[str, Any]:
    direction = "right"
    nodes: list[dict[str, str]] = []
    edges: list[dict[str, Any]] = []
    node_ids_by_label: dict[str, str] = {}

    def get_node_id(label: str) -> str:
        if label not in node_ids_by_label:
            node_ids_by_label[label] = f"n{len(node_ids_by_label) + 1}"
            nodes.append({"id": node_ids_by_label[label], "label": label})
        return node_ids_by_label[label]

    for raw_line in code.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line in {"{", "}"}:
            continue
        if line.lower().startswith("direction:"):
            direction = line.split(":", 1)[1].strip().lower() or "right"
            continue
        if line.lower().startswith(("vars:", "d2-config:", "layout-engine:")):
            continue
        if "->" not in line and "<-" not in line:
            continue

        match = re.match(
            r'^(?P<source>.+?)\s*(?P<kind><->|->|<-)\s*(?P<target>.+?)(?:\s*:\s*"(?P<label>[^"]*)")?\s*$',
            line,
        )
        if not match:
            continue

        source_label = _clean_node_label(match.group("source"))
        target_label = _clean_node_label(match.group("target"))
        edge_kind = match.group("kind")
        edge_label = (match.group("label") or "").strip()

        if edge_kind == "<-":
            source_label, target_label = target_label, source_label
            edge_kind = "->"

        source_id = get_node_id(source_label)
        target_id = get_node_id(target_label)

        edges.append(
            {
                "id": f"e{len(edges) + 1}",
                "source": source_id,
                "target": target_id,
                "label": edge_label,
                "kind": edge_kind,
                "order": len(edges),
            }
        )

    return {
        "direction": direction,
        "nodes": nodes,
        "edges": edges,
    }


class Neo4jFlowService:
    def __init__(self) -> None:
        self.uri = os.getenv("NEO4J_URI")
        self.username = os.getenv("NEO4J_USERNAME")
        self.password = os.getenv("NEO4J_PASSWORD")
        self.database = os.getenv("NEO4J_DATABASE")
        self.offline_only = os.getenv("NEO4J_OFFLINE_ONLY", "true").lower() in {"1", "true", "yes", "on"}
        allowed_hosts = os.getenv("NEO4J_ALLOWED_HOSTS", "localhost,127.0.0.1,::1,neo4j,host.docker.internal")
        self.allowed_hosts = {host.strip().lower() for host in allowed_hosts.split(",") if host.strip()}

    def is_configured(self) -> bool:
        return bool(self.uri and self.username and self.password and self.database)

    def _validate_offline_uri(self) -> None:
        if not self.offline_only or not self.uri:
            return

        parsed = urlparse(self.uri)
        host = (parsed.hostname or "").lower()
        scheme = (parsed.scheme or "").lower()

        if scheme not in {"bolt", "neo4j"}:
            raise RuntimeError(
                f"Neo4j offline Docker mode only allows bolt:// or neo4j:// URIs, got {scheme or 'empty'}."
            )

        if host not in self.allowed_hosts:
            allowed = ", ".join(sorted(self.allowed_hosts))
            raise RuntimeError(
                f"Remote Neo4j URI is blocked by offline Docker mode: {self.uri}. "
                f"Use one of these local Docker hosts: {allowed}."
            )

    def _driver(self):
        if not self.is_configured():
            raise RuntimeError(
                "Neo4j is not configured. Add NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, and NEO4J_DATABASE."
            )
        self._validate_offline_uri()
        return GraphDatabase.driver(self.uri, auth=(self.username, self.password))

    def health(self) -> dict[str, Any]:
        status = {
            "configured": self.is_configured(),
            "uri": self.uri,
            "database": self.database,
            "offline_only": self.offline_only,
            "allowed_hosts": sorted(self.allowed_hosts),
            "ok": False,
        }
        if not self.is_configured():
            status["error"] = "Neo4j env is incomplete."
            return status

        try:
            with self._driver() as driver:
                driver.verify_connectivity()
            status["ok"] = True
            return status
        except Exception as e:
            status["error"] = f"{type(e).__name__}: {e}"
            if self.uri and "localhost" in self.uri:
                status["hint"] = (
                    "If the backend runs inside Docker, localhost points to the backend container. "
                    "Use bolt://neo4j:7687 or the Neo4j compose service name."
                )
            return status

    def local_flow_graph(self, code: str, title: Optional[str] = None, reason: str = "") -> dict[str, Any]:
        parsed = _parse_d2_flow(code)
        graph_id = hashlib.sha1(code.encode("utf-8")).hexdigest()[:16]
        return {
            "graph_id": graph_id,
            "title": title or "AI Teacher Flow Graph",
            "direction": parsed["direction"],
            "nodes": parsed["nodes"],
            "edges": parsed["edges"],
            "provider": "local-fallback",
            "fallback_reason": reason,
        }

    def upsert_flow_graph(self, code: str, title: Optional[str] = None) -> dict[str, Any]:
        parsed = _parse_d2_flow(code)
        graph_id = hashlib.sha1(code.encode("utf-8")).hexdigest()[:16]

        if not parsed["nodes"]:
            raise RuntimeError("No graph nodes could be extracted from the D2 source.")

        payload = {
            "graph_id": graph_id,
            "title": title or "AI Teacher Flow Graph",
            "direction": parsed["direction"],
            "nodes": parsed["nodes"],
            "edges": parsed["edges"],
        }

        with self._driver() as driver:
            driver.verify_connectivity()
            with driver.session(database=self.database) as session:
                session.execute_write(self._write_graph, payload)
                return session.execute_read(self._read_graph, payload["graph_id"], payload["direction"], payload["title"])

    @staticmethod
    def _write_graph(tx, graph: dict[str, Any]) -> None:
        tx.run(
            """
            MERGE (g:TeacherFlowGraph {graph_id: $graph_id})
            SET g.title = $title,
                g.direction = $direction,
                g.updated_at = datetime()
            """,
            graph_id=graph["graph_id"],
            title=graph["title"],
            direction=graph["direction"],
        )

        tx.run(
            """
            UNWIND $nodes AS node
            MERGE (n:TeacherFlowNode {graph_id: $graph_id, node_id: node.id})
            SET n.label = node.label,
                n.updated_at = datetime()
            """,
            graph_id=graph["graph_id"],
            nodes=graph["nodes"],
        )

        tx.run(
            """
            UNWIND $edges AS edge
            MATCH (src:TeacherFlowNode {graph_id: $graph_id, node_id: edge.source})
            MATCH (dst:TeacherFlowNode {graph_id: $graph_id, node_id: edge.target})
            MERGE (src)-[r:TEACHER_FLOW {graph_id: $graph_id, edge_id: edge.id}]->(dst)
            SET r.label = edge.label,
                r.kind = edge.kind,
                r.order = edge.order,
                r.updated_at = datetime()
            """,
            graph_id=graph["graph_id"],
            edges=graph["edges"],
        )

    @staticmethod
    def _read_graph(tx, graph_id: str, direction: str, title: str) -> dict[str, Any]:
        record = tx.run(
            """
            MATCH (n:TeacherFlowNode {graph_id: $graph_id})
            OPTIONAL MATCH (n)-[r:TEACHER_FLOW {graph_id: $graph_id}]->(m:TeacherFlowNode {graph_id: $graph_id})
            RETURN
              collect(DISTINCT {id: n.node_id, label: n.label}) AS nodes,
              collect(DISTINCT CASE
                WHEN r IS NULL THEN NULL
                ELSE {
                  id: r.edge_id,
                  source: startNode(r).node_id,
                  target: endNode(r).node_id,
                  label: coalesce(r.label, ''),
                  kind: coalesce(r.kind, '->'),
                  order: coalesce(r.order, 0)
                }
              END) AS edges
            """,
            graph_id=graph_id,
        ).single()

        nodes = record["nodes"] if record else []
        raw_edges = record["edges"] if record else []
        edges = [edge for edge in raw_edges if edge]
        edges.sort(key=lambda edge: edge.get("order", 0))

        return {
            "graph_id": graph_id,
            "title": title,
            "direction": direction,
            "nodes": nodes,
            "edges": edges,
            "provider": "neo4j",
        }


neo4j_flow_service = Neo4jFlowService()
