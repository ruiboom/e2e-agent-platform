"""Artifact + project lineage client (Python).

Identical contract to ``packages/lineage-client`` (TS).
"""
from lineage.client import (
    Artifact,
    ArtifactDiff,
    LineageClient,
    LineageEdge,
    LineageGraph,
    Project,
)

__all__ = [
    "LineageClient",
    "Project",
    "Artifact",
    "LineageEdge",
    "LineageGraph",
    "ArtifactDiff",
]
__version__ = "0.0.0"
