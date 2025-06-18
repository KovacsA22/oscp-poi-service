# OSCP Point of Interest service
Thise web service can collect points of interest from a number of third-party POI services. Currently Google Maps and OpenStreetMap are used. The API takes in search query words, the queries are performed by the third-party services, and their results are aggregated (duplicates are filtered) and returned in OGC POI standard format.

## Running via Docker
Create `.env` file with the following contents:
```
GOOGLE_MAPS_API_KEY=
PORT=
MY_HTTP_PROXY=
MY_HTTPS_PROXY=
```

Build the container:
```
docker compose -f docker-compose.yml --env-file .env build
```

Run the container:
```
docker compose -f docker-compose.yml --env-file .env up -d
```
