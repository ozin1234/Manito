FROM overv/openstreetmap-tile-server@sha256:b6a79da39b6d0758368f7c62d22e49dd3ec59e78b194a5ef9dee2723b1f3fa79
RUN sed -i 's@https://osmdata.openstreetmap.de/download/@https://www.osmdata.org/download/@g' \
    /home/renderer/src/openstreetmap-carto-backup/external-data.yml
