from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"Ping": "Pong"}


class Node(BaseModel):
    id: str
    data: dict[str, Any] = {}


class Edge(BaseModel):
    id: str
    source: str
    target: str


class Pipeline(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


def is_dag(nodes: list[Node], edges: list[Edge]) -> bool:
    node_ids = {n.id for n in nodes}

    adj: dict[str, list[str]] = {n.id: [] for n in nodes}
    in_degree: dict[str, int] = {n.id: 0 for n in nodes}

    for edge in edges:
        if edge.source not in node_ids or edge.target not in node_ids:
            continue
        adj[edge.source].append(edge.target)
        in_degree[edge.target] += 1
    queue = [n for n, deg in in_degree.items() if deg == 0]
    visited = 0
    while queue:
        node = queue.pop()
        visited += 1
        for neighbour in adj[node]:
            in_degree[neighbour] -= 1
            if in_degree[neighbour] == 0:
                queue.append(neighbour)
    return visited == len(nodes)


@app.post("/pipelines/parse")
def parse_pipeline(pipeline: Pipeline):
    num_nodes = len(pipeline.nodes)
    num_edges = len(pipeline.edges)
    dag = is_dag(pipeline.nodes, pipeline.edges)

    return {
        "num_nodes": num_nodes,
        "num_edges": num_edges,
        "is_dag": dag,
    }
