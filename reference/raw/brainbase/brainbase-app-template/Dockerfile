FROM python:3.9
LABEL maintainer="egrigokhan@gmail.com"

# Copy the entire application to the /app directory in the container
COPY . /app
WORKDIR /app

# Install cron package
RUN apt-get update && apt-get -y install cron

# Install dependencies
RUN pip install --upgrade pip
RUN pip install -r requirements.txt
RUN pip install -r app/src/requirements.txt

# Make cron.sh executable
RUN chmod +x cron.sh

# Add cron job to execute cron.sh every 5 minutes
RUN echo "*/5 * * * * /app/cron.sh >> /var/log/cron.log 2>&1" > /etc/cron.d/mycron

# Give execution rights on the cron job
RUN chmod 0644 /etc/cron.d/mycron

# Apply cron job
RUN crontab /etc/cron.d/mycron

# Set the PYTHONPATH environment variable
ENV PYTHONPATH=/app/app/src:$PYTHONPATH

# Expose the required port
EXPOSE 8080

# Set the entrypoint and default command
ENTRYPOINT ["python"]
CMD ["app/app.py"]
