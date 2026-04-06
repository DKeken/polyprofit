SHELL := /bin/bash

.PHONY: dev build verify smoke

# Hot-reload dev: Rust auto-restarts on .rs changes, Vite HMR on frontend changes.
# Open http://localhost:5173 in the browser.
dev:
	@backend_port=$$(python3 -c "from pathlib import Path; import tomllib; print(tomllib.loads(Path('config.toml').read_text())['server']['port'])"); \
	cleanup_port() { \
		port="$$1"; \
		pids=$$(lsof -tiTCP:$$port -sTCP:LISTEN 2>/dev/null || true); \
		if [ -n "$$pids" ]; then \
			echo "Freeing port $$port: $$pids"; \
			kill $$pids 2>/dev/null || true; \
			sleep 1; \
			remaining=$$(lsof -tiTCP:$$port -sTCP:LISTEN 2>/dev/null || true); \
			if [ -n "$$remaining" ]; then \
				kill -9 $$remaining 2>/dev/null || true; \
			fi; \
		fi; \
	}; \
	cleanup_port 3000; \
	if [ "$$backend_port" != "3000" ]; then cleanup_port "$$backend_port"; fi; \
	set -a; \
	if [ -f .env ]; then . ./.env; fi; \
	set +a; \
	cargo build; \
	./target/debug/polyprofit & \
	probe_pid=$$!; \
	sleep 3; \
	if ! kill -0 $$probe_pid 2>/dev/null; then \
		wait $$probe_pid; \
		exit $$?; \
	fi; \
	kill $$probe_pid 2>/dev/null || true; \
	wait $$probe_pid 2>/dev/null || true; \
	trap 'kill 0' EXIT; \
	cargo watch -w crates -w src -w Cargo.toml -w Cargo.lock \
		-s 'cargo build && exec ./target/debug/polyprofit' & \
	backend_pid=$$!; \
	npm --prefix frontend run dev & \
	frontend_pid=$$!; \
	while kill -0 $$backend_pid 2>/dev/null && kill -0 $$frontend_pid 2>/dev/null; do \
		sleep 1; \
	done; \
	if ! kill -0 $$backend_pid 2>/dev/null; then \
		wait $$backend_pid; \
		status=$$?; \
	else \
		wait $$frontend_pid; \
		status=$$?; \
	fi; \
	kill $$backend_pid $$frontend_pid 2>/dev/null || true; \
	wait $$backend_pid 2>/dev/null || true; \
	wait $$frontend_pid 2>/dev/null || true; \
	exit $$status

# Production build: compile Rust release + bundle frontend into dist/
build:
	npm --prefix frontend run build
	cargo build --release

smoke:
	node scripts/runtime-smoke.mjs

verify: smoke
	cargo test --workspace
	npm --prefix frontend run lint
	npm --prefix frontend run test
	npm --prefix frontend run build
