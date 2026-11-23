# Kitob Klubi: bot + Mini App + nudges in one small image. Runs as a non-root user.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 DB_PATH=/data/kitobklubi.db PORT=8080
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt \
 && useradd --system --uid 10001 --home /app --shell /usr/sbin/nologin kitobklubi \
 && mkdir -p /data && chown kitobklubi /data

COPY kitobklubi ./kitobklubi
COPY shared ./shared
COPY webapp ./webapp

USER kitobklubi
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8080\")}/healthz', timeout=4)"
CMD ["python", "-m", "kitobklubi"]
