"""feedback_tracker — fire-and-forget user-feedback submission.

Usage:
    import feedback_tracker
    feedback_tracker.submit(kind="csat", rating=5,
                            text="Love the new export flow!",
                            session_id="conv-123")

Configuration (env vars, or feedback_tracker.configure(...)):
    FEEDBACK_TRACKER_URL        collector base URL, e.g. http://feedback.internal:8788
    FEEDBACK_TRACKER_TOKEN      per-app secret token (sek_…)
    FEEDBACK_TRACKER_APP        application name reported with each item
    FEEDBACK_TRACKER_SPOOL_DIR  local spool directory (default ~/.feedback_tracker/spool)

For collecting feedback directly in a browser UI, embed the JS widget
(client/widget/feedback-widget.js) instead — it posts to the same endpoint.
"""

from .client import FeedbackTracker, configure, flush, submit
from .sentiment import SENTIMENTS, derive_sentiment

__all__ = ["FeedbackTracker", "configure", "flush", "submit",
           "SENTIMENTS", "derive_sentiment"]
__version__ = "0.1.0"
