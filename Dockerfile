FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# LibreOffice (Word naar PDF), Ghostscript (verkleinen), qpdf (ontgrendelen),
# ocrmypdf + Tesseract (doorzoekbaar maken), heif-convert (iPhone-foto's),
# en lettertypes die met Calibri, Cambria, Arial en Times overeenkomen.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui \
      ghostscript qpdf \
      ocrmypdf tesseract-ocr tesseract-ocr-nld tesseract-ocr-deu tesseract-ocr-eng \
      libheif-examples \
      python3 python3-pip \
      fonts-liberation2 fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea fonts-noto-core \
      ca-certificates \
  && pip3 install --no-cache-dir --break-system-packages pdf2docx==0.5.13 \
  && apt-get clean && rm -rf /var/lib/apt/lists/* /root/.cache

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
