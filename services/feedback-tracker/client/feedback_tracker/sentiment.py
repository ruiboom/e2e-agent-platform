"""Coarse sentiment from an unambiguous signal.

This mirrors the rule the collector applies at ingest, so the client can set
`sentiment` locally too. It is a deterministic rule, not a guess: free text
(freeform / idea) returns None and is left for later async enrichment.
"""

SENTIMENTS = ("positive", "neutral", "negative")


def derive_sentiment(kind, rating=None):
    """Return positive | neutral | negative, or None when there's no clear signal."""
    if kind == "praise":
        return "positive"
    if kind == "bug":
        return "negative"
    if rating is None:
        return None
    if kind == "thumb":
        return "positive" if rating > 0 else "negative"
    if kind == "nps":
        if rating >= 9:
            return "positive"
        if rating >= 7:
            return "neutral"
        return "negative"
    if kind == "csat":
        if rating >= 4:
            return "positive"
        if rating == 3:
            return "neutral"
        return "negative"
    return None
