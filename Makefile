.PHONY: dev build

# Hot-reload dev: Rust auto-restarts on .rs changes, Vite HMR on frontend changes.
# Open http://localhost:5173 in the browser.
dev:
	@trap 'kill 0' EXIT; \
	cargo watch -w crates -w src -w Cargo.toml -w Cargo.lock \
		-s 'cargo build && exec ./target/debug/polyprofit' & \
	npm --prefix frontend run dev & \
	wait

# Production build: compile Rust release + bundle frontend into dist/
build:
	npm --prefix frontend run build
	cargo build --release
