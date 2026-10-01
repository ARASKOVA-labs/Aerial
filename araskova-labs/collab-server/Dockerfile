# Build from the repository root so the workspace Cargo.lock pins every
# dependency (supply-chain integrity):
#   docker build -f araskova-labs/collab-server/Dockerfile -t aerial-collab .
#
# Stage 1: build
FROM rust:1.89-slim-bookworm AS builder
WORKDIR /src
COPY . .
RUN cargo build --release --locked -p aerial-collab-server

# Stage 2: minimal runtime, non-root
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin aerial
COPY --from=builder /src/target/release/aerial-collab-server /usr/local/bin/aerial-collab-server
USER 10001:10001
ENV AERIAL_COLLAB_BIND=0.0.0.0:4000 \
    RUST_LOG=info
EXPOSE 4000
# Required at runtime: AERIAL_COLLAB_SECRET (≥32 bytes, from a secret store).
# Recommended: AERIAL_ALLOWED_ORIGINS. Liveness/readiness probe: GET /healthz
ENTRYPOINT ["/usr/local/bin/aerial-collab-server"]
