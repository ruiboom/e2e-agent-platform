"""cost_tracker — fire-and-forget LLM cost event tracking.

Usage:
    import cost_tracker
    cost_tracker.track(model="claude-opus-4-8", input_tokens=1200,
                       output_tokens=450, cost_usd=0.0173)

    # or directly from an Anthropic SDK response:
    cost_tracker.track_usage(response.model, response.usage)

Configuration (env vars, or cost_tracker.configure(...)):
    COST_TRACKER_URL        collector base URL, e.g. http://costs.internal:8787
    COST_TRACKER_TOKEN      per-app bearer token
    COST_TRACKER_APP        application name reported with each event
    COST_TRACKER_SPOOL_DIR  local spool directory (default ~/.cost_tracker/spool)
"""

from .client import CostTracker, configure, flush, track, track_usage
from .pricing import RATES, estimate_cost

__all__ = ["CostTracker", "configure", "flush", "track", "track_usage",
           "RATES", "estimate_cost"]
__version__ = "0.1.0"
