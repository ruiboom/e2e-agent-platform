"""Pricing table for estimating cost from token usage.

Rates are USD per million tokens, current as of 2026-06. Apps that already
compute their own cost_usd should keep doing so and pass it to track();
this module is the fallback for apps that only have token counts.
"""

# model id -> (input $/1M, output $/1M)
RATES = {
    "claude-fable-5": (10.00, 50.00),
    "claude-opus-4-8": (5.00, 25.00),
    "claude-opus-4-7": (5.00, 25.00),
    "claude-opus-4-6": (5.00, 25.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}

CACHE_READ_MULTIPLIER = 0.1    # of the input rate
CACHE_WRITE_MULTIPLIER = 1.25  # of the input rate (5-minute TTL writes)


def estimate_cost(model, input_tokens=0, output_tokens=0,
                  cache_read_tokens=0, cache_write_tokens=0):
    """Return estimated USD cost for a turn, or None if the model is unknown."""
    rates = RATES.get(model)
    if rates is None:
        # tolerate date-suffixed ids like claude-haiku-4-5-20251001
        for known, r in RATES.items():
            if model and model.startswith(known):
                rates = r
                break
    if rates is None:
        return None
    inp, out = rates
    return (
        input_tokens * inp
        + output_tokens * out
        + cache_read_tokens * inp * CACHE_READ_MULTIPLIER
        + cache_write_tokens * inp * CACHE_WRITE_MULTIPLIER
    ) / 1_000_000
