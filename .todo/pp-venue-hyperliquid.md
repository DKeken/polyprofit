# pp-venue-hyperliquid — NEW crate (STUB)

## Purpose
Stub adapter под Hyperliquid HIP-4 prediction markets. Not production yet — testnet only до 2026 mainnet HIP-4 launch.

## crates/pp-venue-hyperliquid/Cargo.toml
```toml
[dependencies]
pp-core.workspace = true
pp-venue.workspace = true
async-trait = "0.1"
anyhow, tokio, tracing, rust_decimal, serde, serde_json, reqwest, futures
hip4 = { version = "0.1", optional = true }   # community SDK для prediction markets
hyperliquid_rust_sdk = { version = "0.7", optional = true }  # перпы

[features]
default = []
hip4 = ["dep:hip4"]
hyper = ["dep:hyperliquid_rust_sdk"]
```

## src/lib.rs
- pub struct HyperliquidVenue { ... }
- impl `Venue` для HyperliquidVenue:
  - все методы возвращают `Err(anyhow!("HIP-4 mainnet not live; testnet stub only"))` если `default-features` без `hip4`
  - При фиче `hip4` — делегирует в `hip4::*` (only read methods, write coming with mainnet launch)

## URLs
- Mainnet API: `https://api.hyperliquid.xyz`
- Mainnet WS: `wss://api.hyperliquid.xyz/ws`
- Testnet API: `https://api.hyperliquid-testnet.xyz`
- Testnet WS: `wss://api.hyperliquid-testnet.xyz/ws`

## Notes
- HIP-4 asset format `a = 100000000 + coinNum` для prediction order
- Tick size: 5 significant figures, формула `10^(floor(log10(price)) - 4)`
- Min shares: 0.0001
- Authentication: EIP-712 + opt agent key (`approveAgent` on-chain)

## TODO future
- [ ] Реальная имплементация после HIP-4 mainnet
- [ ] Watching существующих perps в дополнение к prediction markets
