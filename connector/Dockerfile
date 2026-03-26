FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY *.py .

# Data directory (mounted as volume)
RUN mkdir -p /data

ENV PYTHONUNBUFFERED=1
ENV LOG_LEVEL=INFO
ENV DATA_DIR=/data

CMD ["python", "main.py"]
