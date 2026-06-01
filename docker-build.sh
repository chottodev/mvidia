#!/usr/bin/env bash
# Один образ antirek/mvidia:TAG — в compose два сервиса с разным command.

TAG="${TAG:-0.0.11}"
IMAGE="${IMAGE:-antirek/mvidia}"

docker build -t "${IMAGE}:${TAG}" .

docker push "${IMAGE}:${TAG}"

echo "Built ${IMAGE}:${TAG}"
