FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
RUN useradd -m bot && mkdir -p /srv/data && chown -R bot /srv/data
USER bot

EXPOSE 8080
CMD ["python", "-m", "app"]
