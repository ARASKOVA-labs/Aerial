# Stage 1: Build the Rust binary
FROM rust:slim AS builder
WORKDIR /app

# Copy the server cargo project
COPY ./Cargo.toml ./Cargo.toml
COPY ./src ./src

# Build for release
RUN cargo build --release

# Stage 2: Create a minimal deployment image
FROM debian:bookworm-slim
WORKDIR /app

# Install necessary CA certificates for potential secure network requests
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary from the builder stage
COPY --from=builder /app/target/release/aerial-collab-server .

# Expose the WebSocket port
EXPOSE 4000

# Run the server
CMD ["./aerial-collab-server"]
