# Feedback-tracker — copied seed, run as-is on SQLite (observability projection).
# `client/widget` is copied so the collector can serve /widget/feedback-widget.js.
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir "fastapi>=0.115" "uvicorn[standard]>=0.30" "pydantic>=2.8"
COPY server ./server
COPY client ./client
ENV FEEDBACK_TRACKER_DB=/data/feedback_tracker.db
EXPOSE 8788
CMD ["uvicorn", "server.app.main:app", "--host", "0.0.0.0", "--port", "8788"]
