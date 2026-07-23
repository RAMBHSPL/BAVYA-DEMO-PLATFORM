FROM python:3.11-slim

WORKDIR /app

# Install packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files (.gitignore will exclude .env and local uploads automatically)
COPY . .

# Expose Flask default port
EXPOSE 5000

# Run Flask using Gunicorn for production performance
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
