FROM node:20-bookworm-slim

WORKDIR /app

# Python + build tools for pyswisseph.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 python3-venv python3-pip python3-dev build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install pyswisseph in a virtualenv that will also be available at runtime.
COPY requirements.txt ./requirements.txt
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHON=python3
RUN python3 -m pip install --upgrade pip setuptools wheel \
    && python3 -m pip install --no-cache-dir -r requirements.txt \
    && python3 -c "import swisseph as swe; print('pyswisseph OK', swe.version)"

# Install Node dependencies.
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts

# Copy the site/server.
COPY . .

ENV NODE_ENV=production
ENV PORT=10000
ENV DATA_DIR=/tmp/truesky-data

EXPOSE 10000

CMD ["node", "server.js"]
