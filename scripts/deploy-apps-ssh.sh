#!/usr/bin/env bash
set -euo pipefail
umask 077

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$root_dir/scripts/docker-compose.remote.yml"

usage() {
  cat <<'HELP'
用法：pnpm run deploy [环境]

构建包含 Web 静态资源的 Server 镜像，经 SSH 上传，再用 Docker Compose 启动。
默认环境为 deploy。读取可选的 .env，再由 .env.<环境> 覆盖。

  DEPLOY_SSH_TARGET    SSH 目标，也可在环境文件中设置
  DEPLOY_REMOTE_DIR    远端绝对路径，默认 /opt/datacube
  DEPLOY_PLATFORM      镜像平台，默认根据远端架构识别
  DEPLOY_IMAGE_TAG     镜像标签，默认 Git 短 SHA 加 UTC 时间
  DEPLOY_DRY_RUN=1     仅校验配置，无需连接远端或 Docker Engine

应用配置 DATACUBE_PORT、JWT_SECRET 和 JWT_EXPIRES_IN 见 .env.deploy.example。
HELP
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

environment="${1:-deploy}"
if [[ $# -gt 1 || ! "$environment" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]]; then
  usage >&2
  exit 1
fi

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

remote_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

remote() {
  ssh -T -- "$target" "bash -o pipefail -c $(remote_quote "$1")"
}

config_value() {
  awk -v key="$1" '
    index($0, key "=") == 1 { value = substr($0, length(key) + 2) }
    END {
      sub(/\r$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^\047.*\047$/) value = substr(value, 2, length(value) - 2)
      print value
    }
  ' "$env_file"
}

override_file="$root_dir/.env.$environment"
[[ -f "$override_file" ]] || fail "缺少 $override_file，请参照 .env.deploy.example 创建"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/datacube-deploy.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
env_file="$tmp_dir/.env"

for source in "$root_dir/.env" "$override_file"; do
  if [[ -f "$source" ]]; then
    cat "$source" >> "$env_file"
    printf '\n' >> "$env_file"
  fi
done

target="${DEPLOY_SSH_TARGET:-$(config_value DEPLOY_SSH_TARGET)}"
remote_dir="${DEPLOY_REMOTE_DIR:-$(config_value DEPLOY_REMOTE_DIR)}"
remote_dir="${remote_dir:-/opt/datacube}"
[[ -n "$target" && "$target" != -* && "$target" != *[[:space:]]* ]] || fail '请配置有效的 DEPLOY_SSH_TARGET'
[[ "$remote_dir" =~ ^(/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$ ]] || fail 'DEPLOY_REMOTE_DIR 必须是绝对路径，例如 /opt/datacube'

git_sha="$(git -C "$root_dir" rev-parse --short HEAD)"
image_tag="${DEPLOY_IMAGE_TAG:-${git_sha}-$(date -u +%Y%m%d%H%M%S)}"
[[ "$image_tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || fail 'DEPLOY_IMAGE_TAG 无效'
image="datacube/server:$image_tag"
printf '\nDATACUBE_SERVER_IMAGE=%s\n' "$image" >> "$env_file"

# 使用部署文件里的值进行校验，避免本地导出的应用变量掩盖缺项。
compose_config() (
  unset DATACUBE_SERVER_IMAGE DATACUBE_PORT JWT_SECRET JWT_EXPIRES_IN
  docker compose --env-file "$env_file" -f "$compose_file" config "$@"
)
compose_config --quiet
jwt_secret="$(compose_config --format json | node -e '
  const fs = require("node:fs");
  const config = JSON.parse(fs.readFileSync(0, "utf8"));
  process.stdout.write(config.services.server.environment.JWT_SECRET);
')"
[[ "$jwt_secret" != change-me-in-production ]] || fail '请在部署配置中替换默认 JWT_SECRET'
unset jwt_secret

printf 'SSH 目标：%s\n远端目录：%s\nServer 镜像：%s\n' "$target" "$remote_dir" "$image"
if [[ "${DEPLOY_DRY_RUN:-0}" == 1 ]]; then
  printf 'Compose 配置校验通过\n'
  exit 0
fi

docker info >/dev/null
docker buildx version >/dev/null
remote 'docker info >/dev/null && docker compose up --help | grep -- --wait-timeout >/dev/null && command -v gzip >/dev/null && command -v flock >/dev/null'

platform="${DEPLOY_PLATFORM:-}"
if [[ -z "$platform" ]]; then
  case "$(remote 'uname -m')" in
    x86_64|amd64) platform=linux/amd64 ;;
    aarch64|arm64) platform=linux/arm64 ;;
    *) fail '无法识别远端平台，请设置 DEPLOY_PLATFORM' ;;
  esac
fi

printf '构建 Server 镜像（%s）\n' "$platform"
docker buildx build --load --platform "$platform" \
  --file "$root_dir/apps/server/Dockerfile" --tag "$image" "$root_dir"

archive="$tmp_dir/image.tar.gz"
docker save "$image" | gzip -1 > "$archive"
printf '上传并导入远端镜像\n'
if command -v pv >/dev/null 2>&1; then
  pv "$archive" | remote 'gzip -dc | docker load'
else
  remote 'gzip -dc | docker load' < "$archive"
fi

printf '上传部署配置并等待服务就绪\n'
cp "$compose_file" "$tmp_dir/docker-compose.remote.yml"
tar -C "$tmp_dir" -cf - .env docker-compose.remote.yml | remote "
  set -euo pipefail
  umask 077
  mkdir -p $(remote_quote "$remote_dir")
  cd $(remote_quote "$remote_dir")
  stage=\$(mktemp -d .deploy.XXXXXX)
  trap 'rm -rf \"\$stage\"' EXIT
  tar -xf - -C \"\$stage\"
  exec 9>.deploy.lock
  flock 9
  mv \"\$stage/.env\" .env
  mv \"\$stage/docker-compose.remote.yml\" docker-compose.remote.yml
  unset DATACUBE_SERVER_IMAGE DATACUBE_PORT JWT_SECRET JWT_EXPIRES_IN
  compose() { docker compose --env-file .env -f docker-compose.remote.yml \"\$@\"; }
  if ! compose up -d --wait --wait-timeout 300; then
    compose ps -a || true
    compose logs --tail 100 server || true
    exit 1
  fi
  compose ps
"
printf '部署完成：%s\n' "$image"
