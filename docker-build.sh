#!/usr/bin/env bash
# Сборка двух образов (user и admin — разный UI в /app/ui).

TAG="${TAG:-0.0.7}"
IMAGE="${IMAGE:-antirek/mvidia}"

docker build --target api-user -t "${IMAGE}-user:${TAG}" .
docker build --target api-admin -t "${IMAGE}-admin:${TAG}" .

docker push "${IMAGE}-user:${TAG}"
docker push "${IMAGE}-admin:${TAG}"

echo "Built ${IMAGE}-user:${TAG}"
echo "Built ${IMAGE}-admin:${TAG}"
