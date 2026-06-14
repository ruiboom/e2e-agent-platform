# Cost-tracker — copied seed, run as-is on SQLite (observability projection).
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir "fastapi>=0.115" "uvicorn[standard]>=0.30" "pydantic>=2.8"
COPY server ./server
ENV COST_TRACKER_DB=/data/cost_tracker.db
EXPOSE 8787
CMD ["uvicorn", "server.app.main:app", "--host", "0.0.0.0", "--port", "8787"]
