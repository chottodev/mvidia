#!/usr/bin/env bash
# Сборка образов mvidia и (опционально) push на Docker Hub.
#
# Перед push: docker login
#
# Переменные (в .env или в окружении):
#   DOCKERHUB_USER      — логин на hub.docker.com (обязателен для push)
#   DOCKER_IMAGE_PREFIX — префикс имени образа (по умолчанию: mvidia)
#   DOCKER_TAG          — тег (по умолчанию: latest)
#
# Примеры:
#   ./docker-build.sh
#   ./docker-build.sh --push
#   ./docker-build.sh --push --tag v0.1.0
#   DOCKERHUB_USER=myuser ./docker-build.sh --push --target api-user

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DOCKERHUB_USER="${DOCKERHUB_USER:-}"
IMAGE_PREFIX="${DOCKER_IMAGE_PREFIX:-mvidia}"
TAG="${DOCKER_TAG:-latest}"
PUSH=false
TARGETS=()

usage() {
  cat <<'EOF'
Usage: ./docker-build.sh [options]

Options:
  --push              После сборки отправить образы на Docker Hub
  --tag TAG           Тег образа (по умолчанию: latest или DOCKER_TAG из .env)
  --user USER         Docker Hub username (или DOCKERHUB_USER)
  --prefix PREFIX     Префикс имени (по умолчанию: mvidia)
  --target NAME       Собрать только api-user или api-admin (можно повторять)
  -h, --help          Справка

Образы на Hub (в каждом: API + собранный UI):
  <user>/<prefix>-api-user:<tag>   — клиент, порт 3001
  <user>/<prefix>-api-admin:<tag>  — админ, порт 3002
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push) PUSH=true ;;
    --tag)
      TAG="$2"
      shift
      ;;
    --user)
      DOCKERHUB_USER="$2"
      shift
      ;;
    --prefix)
      IMAGE_PREFIX="$2"
      shift
      ;;
    --target)
      TARGETS+=("$2")
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Неизвестный аргумент: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  TARGETS=(api-user api-admin)
fi

if [[ "$PUSH" == true && -z "$DOCKERHUB_USER" ]]; then
  echo "Для --push задайте DOCKERHUB_USER в .env или: ./docker-build.sh --user <login> --push" >&2
  exit 1
fi

if [[ -z "$DOCKERHUB_USER" ]]; then
  DOCKERHUB_USER="local"
  echo "DOCKERHUB_USER не задан — теги будут local/${IMAGE_PREFIX}-<target>:${TAG}"
  echo "Для Hub укажите --user или DOCKERHUB_USER в .env"
fi

build_one() {
  local target="$1"
  local image="${DOCKERHUB_USER}/${IMAGE_PREFIX}-${target}:${TAG}"

  echo "==> docker build --target ${target} -t ${image} ."
  docker build --target "${target}" -t "${image}" .

  if [[ "$PUSH" == true ]]; then
    echo "==> docker push ${image}"
    docker push "${image}"
  fi

  echo "    ${image}"
}

echo "Контекст: ${ROOT}"
echo "Тег: ${TAG}"
echo ""

for target in "${TARGETS[@]}"; do
  case "$target" in
    api-user | api-admin) build_one "$target" ;;
    *)
      echo "Неизвестный target: ${target} (допустимо: api-user, api-admin)" >&2
      exit 1
      ;;
  esac
done

echo ""
if [[ "$PUSH" == true ]]; then
  echo "Готово: образы отправлены на Docker Hub."
else
  echo "Готово: образы собраны локально. Push: ./docker-build.sh --push"
fi
