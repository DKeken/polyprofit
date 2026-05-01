# pp-wallet — cleanup

## lib.rs (141 LOC)
- [ ] OnceLock CACHED_WALLET — race condition в тестах когда env меняется. Удалить или скопировать в модуль `tests` ниже
- [ ] LocalWallet и WalletSigner — два слоя избыточны. Один enum достаточно: 
  ```
  pub enum WalletSigner { Local { signer: PrivateKeySigner } }
  ```
- [ ] `is_uuid` — норм heuristic, оставить
- [ ] Перенести в pp-venue-polymarket? Wallet — деталь Polymarket, для Hyperliquid/Kalshi нужны другие схемы (RSA-PSS Kalshi). Лучше — pp-wallet-polymarket
- [ ] Add abstract trait `Signer { type Material; fn sign(&self, msg) -> Sig; fn address(&self) -> String; }`
