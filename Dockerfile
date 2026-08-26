# Imagem para hospedar o escritório (Render, Fly, Hugging Face Spaces, Koyeb…).
FROM python:3.12-slim

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# A maioria dos serviços gratuitos injeta a porta em $PORT.
ENV PORT=8400
EXPOSE 8400
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
