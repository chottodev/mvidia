#!/usr/bin/env bash
# Build Docker image. Set TAG (and optionally IMAGE) for the image reference.

TAG=0.0.6
IMAGE=antirek/mvidia

docker build \
  -t "${IMAGE}:${TAG}" \
  .

docker push "${IMAGE}:${TAG}"

echo "Built ${IMAGE}:${TAG}"
